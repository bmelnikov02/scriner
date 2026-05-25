package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"sync"
	"time"

	"screiner-backend/binance"
)

type candleCacheItem struct {
	body      []byte
	expiresAt time.Time
}

var candleCache = struct {
	sync.Mutex
	items map[string]candleCacheItem
}{
	items: map[string]candleCacheItem{},
}

type bybitKlineResponse struct {
	RetCode int    `json:"retCode"`
	RetMsg  string `json:"retMsg"`
	Result  struct {
		List [][]string `json:"list"`
	} `json:"result"`
}

type aggregateCandle struct {
	start  int64
	open   float64
	high   float64
	low    float64
	close  float64
	volume float64
}

func aggregateCandles(items [][]interface{}, minutes int64) [][]interface{} {
	if minutes <= 0 {
		return items
	}

	bucketSize := minutes * int64(time.Minute/time.Millisecond)
	aggregated := []aggregateCandle{}
	bucketIndex := map[int64]int{}

	for _, item := range items {
		if len(item) < 6 {
			continue
		}

		start, ok := item[0].(int64)
		if !ok {
			continue
		}

		open, _ := strconv.ParseFloat(fmt.Sprint(item[1]), 64)
		high, _ := strconv.ParseFloat(fmt.Sprint(item[2]), 64)
		low, _ := strconv.ParseFloat(fmt.Sprint(item[3]), 64)
		closePrice, _ := strconv.ParseFloat(fmt.Sprint(item[4]), 64)
		volume, _ := strconv.ParseFloat(fmt.Sprint(item[5]), 64)
		bucketStart := start - start%bucketSize

		index, exists := bucketIndex[bucketStart]
		if !exists {
			bucketIndex[bucketStart] = len(aggregated)
			aggregated = append(aggregated, aggregateCandle{
				start:  bucketStart,
				open:   open,
				high:   high,
				low:    low,
				close:  closePrice,
				volume: volume,
			})
			continue
		}

		if high > aggregated[index].high {
			aggregated[index].high = high
		}
		if low < aggregated[index].low {
			aggregated[index].low = low
		}
		aggregated[index].close = closePrice
		aggregated[index].volume += volume
	}

	next := make([][]interface{}, 0, len(aggregated))
	for _, candle := range aggregated {
		next = append(next, []interface{}{
			candle.start,
			strconv.FormatFloat(candle.open, 'f', -1, 64),
			strconv.FormatFloat(candle.high, 'f', -1, 64),
			strconv.FormatFloat(candle.low, 'f', -1, 64),
			strconv.FormatFloat(candle.close, 'f', -1, 64),
			strconv.FormatFloat(candle.volume, 'f', -1, 64),
		})
	}

	return next
}

func Candles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	symbol := r.URL.Query().Get("symbol")
	if symbol == "" {
		symbol = "BTCUSDT"
	}

	interval := r.URL.Query().Get("interval")
	if interval == "" {
		interval = "1m"
	}

	limit := r.URL.Query().Get("limit")
	if limit == "" {
		limit = "500"
	}

	limitValue, err := strconv.Atoi(limit)
	if err != nil || limitValue < 1 {
		limit = "500"
		limitValue = 500
	} else if limitValue > 1000 {
		limit = "1000"
		limitValue = 1000
	}

	syntheticMinutes := binance.SyntheticIntervalMinutes(interval)
	requestLimit := limit
	if syntheticMinutes > 0 {
		requestLimitValue := limitValue * int(syntheticMinutes)
		if requestLimitValue > 1000 {
			requestLimitValue = 1000
		}
		requestLimit = strconv.Itoa(requestLimitValue)
	}

	query := url.Values{}
	query.Set("category", "linear")
	query.Set("symbol", symbol)
	query.Set("interval", binance.ToBybitInterval(interval))
	query.Set("limit", requestLimit)

	if endTime := r.URL.Query().Get("endTime"); endTime != "" {
		query.Set("end", endTime)
	}

	cacheKey := interval + ":" + query.Encode()

	candleCache.Lock()
	cached, hasCached := candleCache.items[cacheKey]
	candleCache.Unlock()

	if hasCached && time.Now().Before(cached.expiresAt) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached.body)
		return
	}

	url := fmt.Sprintf(
		"https://api.bybit.com/v5/market/kline?%s",
		query.Encode(),
	)

	resp, err := http.Get(url)
	if err != nil {
		http.Error(w, "failed to fetch candles", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "failed to read candles", http.StatusInternalServerError)
		return
	}

	if resp.StatusCode >= 400 {
		http.Error(w, string(body), resp.StatusCode)
		return
	}

	var bybit bybitKlineResponse
	if err := json.Unmarshal(body, &bybit); err != nil {
		http.Error(w, "failed to parse candles", http.StatusInternalServerError)
		return
	}

	if bybit.RetCode != 0 {
		message := bybit.RetMsg
		if message == "" {
			message = "failed to fetch candles"
		}
		http.Error(w, message, http.StatusBadGateway)
		return
	}

	items := make([][]interface{}, 0, len(bybit.Result.List))
	for _, candle := range bybit.Result.List {
		if len(candle) < 6 {
			continue
		}

		startTime, err := strconv.ParseInt(candle[0], 10, 64)
		if err != nil {
			continue
		}

		items = append(items, []interface{}{
			startTime,
			candle[1],
			candle[2],
			candle[3],
			candle[4],
			candle[5],
		})
	}

	sort.Slice(items, func(i, j int) bool {
		left, _ := items[i][0].(int64)
		right, _ := items[j][0].(int64)
		return left < right
	})

	items = aggregateCandles(items, syntheticMinutes)

	body, err = json.Marshal(items)
	if err != nil {
		http.Error(w, "failed to encode candles", http.StatusInternalServerError)
		return
	}

	cacheDuration := 20 * time.Second

	if query.Get("end") != "" {
		cacheDuration = 30 * time.Minute
	}

	candleCache.Lock()
	candleCache.items[cacheKey] = candleCacheItem{
		body:      body,
		expiresAt: time.Now().Add(cacheDuration),
	}
	candleCache.Unlock()

	w.Header().Set("Content-Type", "application/json")
	w.Write(body)
}
