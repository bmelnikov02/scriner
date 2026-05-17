package binance

import (
	"encoding/json"
	"io"
	"net/http"
	"fmt"
	"time"
	"strings"
	
	"screiner-backend/ws"
	
)

func StartTicker() {
	for {
		resp, err := http.Get("https://fapi.binance.com/fapi/v1/ticker/24hr")
		if err != nil {
			time.Sleep(60 * time.Second)
			continue
		}

		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		var data []map[string]interface{}
		json.Unmarshal(body, &data)

		for _, item := range data {
	symbol, _ := item["symbol"].(string)

	if !strings.HasSuffix(symbol, "USDT") {
		continue
	}

	price := toFloat(item["lastPrice"])
	change24h := toFloat(item["priceChangePercent"])
	volume24h := toFloat(item["quoteVolume"])

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
