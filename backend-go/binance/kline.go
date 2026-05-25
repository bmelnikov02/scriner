package binance

import (
	"encoding/json"
	"strconv"
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
	case "3m":
		return "3"
	case "5m":
		return "5"
	case "15m":
		return "15"
	case "30m":
		return "30"
	case "1h":
		return "60"
	case "2h":
		return "120"
	case "3h":
		return "180"
	case "4h":
		return "240"
	case "12h":
		return "720"
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

func SyntheticIntervalMinutes(interval string) int64 {
	switch interval {
	case "7m":
		return 7
	case "10m":
		return 10
	default:
		return 0
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

type syntheticMinuteCandle struct {
	start  int64
	open   float64
	high   float64
	low    float64
	close  float64
	volume float64
}

var syntheticKlines = struct {
	sync.Mutex
	items map[string]map[int64]syntheticMinuteCandle
}{
	items: map[string]map[int64]syntheticMinuteCandle{},
}

func parseFloatValue(value interface{}) float64 {
	switch v := value.(type) {
	case float64:
		return v
	case string:
		parsed, _ := strconv.ParseFloat(v, 64)
		return parsed
	default:
		return 0
	}
}

func parseIntValue(value interface{}) int64 {
	switch v := value.(type) {
	case float64:
		return int64(v)
	case string:
		parsed, _ := strconv.ParseInt(v, 10, 64)
		return parsed
	default:
		return 0
	}
}

func aggregateSyntheticKline(symbol string, minutes int64, raw map[string]interface{}) map[string]interface{} {
	start := parseIntValue(raw["start"])
	if start == 0 || minutes <= 0 {
		return nil
	}

	minute := syntheticMinuteCandle{
		start:  start,
		open:   parseFloatValue(raw["open"]),
		high:   parseFloatValue(raw["high"]),
		low:    parseFloatValue(raw["low"]),
		close:  parseFloatValue(raw["close"]),
		volume: parseFloatValue(raw["volume"]),
	}
	bucketSize := minutes * int64(time.Minute/time.Millisecond)
	bucketStart := start - start%bucketSize

	syntheticKlines.Lock()
	if syntheticKlines.items[symbol] == nil {
		syntheticKlines.items[symbol] = map[int64]syntheticMinuteCandle{}
	}

	syntheticKlines.items[symbol][start] = minute

	var aggregate *syntheticMinuteCandle
	var latestStart int64
	for candleStart, candle := range syntheticKlines.items[symbol] {
		if candleStart < bucketStart {
			delete(syntheticKlines.items[symbol], candleStart)
			continue
		}

		if candleStart >= bucketStart+bucketSize {
			continue
		}

		if aggregate == nil {
			copy := candle
			copy.start = bucketStart
			aggregate = &copy
			latestStart = candle.start
			continue
		}

		if candle.high > aggregate.high {
			aggregate.high = candle.high
		}
		if candle.low < aggregate.low {
			aggregate.low = candle.low
		}
		if candle.start >= latestStart {
			aggregate.close = candle.close
			latestStart = candle.start
		}
		aggregate.volume += candle.volume
	}
	syntheticKlines.Unlock()

	if aggregate == nil {
		return nil
	}

	return map[string]interface{}{
		"x": aggregate.start,
		"o": aggregate.open,
		"h": aggregate.high,
		"l": aggregate.low,
		"c": aggregate.close,
		"v": aggregate.volume,
	}
}

func StartKline() {
	for {
		interval := GetInterval()
		bybitInterval := ToBybitInterval(interval)
		syntheticMinutes := SyntheticIntervalMinutes(interval)

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
				candle := map[string]interface{}{
					"x": k["start"],
					"o": k["open"],
					"h": k["high"],
					"l": k["low"],
					"c": k["close"],
					"v": k["volume"],
				}

				if syntheticMinutes > 0 {
					candle = aggregateSyntheticKline(symbol, syntheticMinutes, k)
					if candle == nil {
						continue
					}
				}

				ws.Broadcast("candle:update", map[string]interface{}{
					"symbol":   symbol,
					"interval": interval,
					"candle":   candle,
				})
			}
		}
	}
}
