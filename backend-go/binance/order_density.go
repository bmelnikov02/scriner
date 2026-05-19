package binance

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"sync"
	"time"
)

type OrderDensity struct {
	Symbol    string  `json:"symbol"`
	Side      string  `json:"side"`
	Price     float64 `json:"price"`
	Quantity  float64 `json:"quantity"`
	Notional  float64 `json:"notional"`
	Score     int     `json:"score"`
	FirstSeen int64   `json:"firstSeen"`
}

type depthResponse struct {
	Bids [][]string `json:"bids"`
}

var densityFirstSeen = struct {
	sync.Mutex
	levels map[string]int64
}{
	levels: map[string]int64{},
}

func GetOrderDensities(symbol string) ([]OrderDensity, error) {
	resp, err := http.Get(
		"https://fapi.binance.com/fapi/v1/depth?symbol=" + symbol + "&limit=500",
	)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("binance depth error: %s", string(body))
	}

	var depth depthResponse
	if err := json.Unmarshal(body, &depth); err != nil {
		return nil, err
	}

	now := time.Now().UnixMilli()
	items := make([]OrderDensity, 0, len(depth.Bids))
	maxNotional := 0.0

	densityFirstSeen.Lock()
	for _, bid := range depth.Bids {
		if len(bid) < 2 {
			continue
		}

		price, errPrice := strconv.ParseFloat(bid[0], 64)
		quantity, errQuantity := strconv.ParseFloat(bid[1], 64)

		if errPrice != nil || errQuantity != nil || price <= 0 || quantity <= 0 {
			continue
		}

		notional := price * quantity
		key := fmt.Sprintf("%s:bid:%.8f", symbol, price)
		firstSeen := densityFirstSeen.levels[key]

		if firstSeen == 0 {
			firstSeen = now
			densityFirstSeen.levels[key] = firstSeen
		}

		if notional > maxNotional {
			maxNotional = notional
		}

		items = append(items, OrderDensity{
			Symbol:    symbol,
			Side:      "bid",
			Price:     price,
			Quantity:  quantity,
			Notional:  notional,
			FirstSeen: firstSeen,
		})
	}
	densityFirstSeen.Unlock()

	if maxNotional <= 0 {
		return []OrderDensity{}, nil
	}

	for index := range items {
		items[index].Score = int((items[index].Notional / maxNotional) * 999)
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].Score > items[j].Score
	})

	if len(items) > 80 {
		items = items[:80]
	}

	return items, nil
}
