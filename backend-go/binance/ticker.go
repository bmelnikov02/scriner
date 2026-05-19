package binance

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"screiner-backend/ws"
)

type bybitTickerResponse struct {
	RetCode int `json:"retCode"`
	Result  struct {
		List []struct {
			Symbol       string `json:"symbol"`
			LastPrice    string `json:"lastPrice"`
			Price24hPcnt string `json:"price24hPcnt"`
			Turnover24h  string `json:"turnover24h"`
		} `json:"list"`
	} `json:"result"`
}

func StartTicker() {
	for {
		resp, err := http.Get("https://api.bybit.com/v5/market/tickers?category=linear")
		if err != nil {
			time.Sleep(60 * time.Second)
			continue
		}

		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		var data bybitTickerResponse
		json.Unmarshal(body, &data)

		for _, item := range data.Result.List {
			symbol := item.Symbol

			if !strings.HasSuffix(symbol, "USDT") {
				continue
			}

			price := toFloat(item.LastPrice)
			change24h := toFloat(item.Price24hPcnt) * 100
			volume24h := toFloat(item.Turnover24h)

			ws.Broadcast("ticker:update", map[string]interface{}{
				"symbol":    symbol,
				"price":     price,
				"change24h": change24h,
				"volume24h": volume24h,
				"change1m":  0,
				"change5m":  0,
			})
		}
		time.Sleep(60 * time.Second)
	}
}

func contains(list []string, val string) bool {
	for _, v := range list {
		if v == val {
			return true
		}
	}
	return false
}
func toFloat(value interface{}) float64 {
	switch v := value.(type) {
	case string:
		var result float64
		fmt.Sscanf(v, "%f", &result)
		return result
	case float64:
		return v
	default:
		return 0
	}
}
