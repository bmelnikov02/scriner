package binance

import (
	"encoding/json"
	"strings"
	"sync"
	"time"

	"screiner-backend/config"
	"screiner-backend/ws"

	"github.com/gorilla/websocket"
)

var currentInterval = "1m"
var intervalMu sync.Mutex

func ToBybitInterval(interval string) string {
	switch interval {
	case "1m":
		return "1"
	case "5m":
		return "5"
	case "15m":
		return "15"
	case "1h":
		return "60"
	case "4h":
		return "240"
	case "1d":
		return "D"
	case "1w":
		return "W"
	case "1M":
		return "M"
	default:
		return "1"
	}
}

func SetInterval(interval string) {
	intervalMu.Lock()
	currentInterval = interval
	intervalMu.Unlock()
}

func GetInterval() string {
	intervalMu.Lock()
	defer intervalMu.Unlock()
	return currentInterval
}

func StartKline() {
	for {
		interval := GetInterval()
		bybitInterval := ToBybitInterval(interval)

		streams := []string{}
		for _, s := range config.Symbols {
			streams = append(streams, "kline."+bybitInterval+"."+strings.ToUpper(s))
		}

		url := "wss://stream.bybit.com/v5/public/linear"

		conn, _, err := websocket.DefaultDialer.Dial(url, nil)
		if err != nil {
			time.Sleep(3 * time.Second)
			continue
		}

		conn.WriteJSON(map[string]interface{}{
			"op":   "subscribe",
			"args": streams,
		})

		for {
			if interval != GetInterval() {
				conn.Close()
				break
			}

			_, msg, err := conn.ReadMessage()
			if err != nil {
				conn.Close()
				break
			}

			var parsed map[string]interface{}
			json.Unmarshal(msg, &parsed)

			dataList, ok := parsed["data"].([]interface{})
			if !ok {
				continue
			}

			for _, raw := range dataList {
				k, ok := raw.(map[string]interface{})
				if !ok {
					continue
				}

				symbol, _ := k["symbol"].(string)

				ws.Broadcast("candle:update", map[string]interface{}{
					"symbol":   symbol,
					"interval": interval,
					"candle": map[string]interface{}{
						"x": k["start"],
						"o": k["open"],
						"h": k["high"],
						"l": k["low"],
						"c": k["close"],
						"v": k["volume"],
					},
				})
			}
		}
	}
}
