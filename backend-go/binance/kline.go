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

		streams := []string{}
		for _, s := range config.Symbols {
			streams = append(streams, strings.ToLower(s)+"@kline_"+interval)
		}

		url := "wss://fstream.binance.com/stream?streams=" + strings.Join(streams, "/")

		conn, _, err := websocket.DefaultDialer.Dial(url, nil)
		if err != nil {
			time.Sleep(3 * time.Second)
			continue
		}

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

			data, ok := parsed["data"].(map[string]interface{})
			if !ok {
				continue
			}

			k, ok := data["k"].(map[string]interface{})
			if !ok {
				continue
			}

			ws.Broadcast("candle:update", map[string]interface{}{
				"symbol":   k["s"],
				"interval": interval,
				"candle": map[string]interface{}{
					"x": k["t"],
					"o": k["o"],
					"h": k["h"],
					"l": k["l"],
					"c": k["c"],
					"v": k["v"],
				},
			})
		}
	}
}
