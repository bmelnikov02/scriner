package bybit

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"screiner-backend/config"
	"screiner-backend/ws"

	"github.com/gorilla/websocket"
)

type depthLevel [2]string

type orderBookMessage struct {
	Topic string        `json:"topic"`
	Type  string        `json:"type"`
	Data  orderBookData `json:"data"`
}

type orderBookData struct {
	Symbol string       `json:"s"`
	Bids   []depthLevel `json:"b"`
	Asks   []depthLevel `json:"a"`
}

type symbolBook struct {
	bids map[string]string
	asks map[string]string
}

type depthTickerResponse struct {
	Result struct {
		List []struct {
			Symbol      string `json:"symbol"`
			Turnover24h string `json:"turnover24h"`
		} `json:"list"`
	} `json:"result"`
}

type depthTicker struct {
	symbol   string
	turnover float64
}

const (
	bybitDepthURL     = "wss://stream.bybit.com/v5/public/linear"
	depthReconnectGap = 3 * time.Second
	depthLimit        = 50
	maxDepthSymbols   = 24
)

func StartDepth() {
	for {
		if err := runDepthCollector(); err != nil {
			log.Println("Bybit depth websocket error:", err)
		}

		time.Sleep(depthReconnectGap)
	}
}

func runDepthCollector() error {
	conn, _, err := websocket.DefaultDialer.Dial(bybitDepthURL, nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	topics := depthTopics()
	if len(topics) == 0 {
		return nil
	}

	if err := conn.WriteJSON(map[string]interface{}{
		"op":   "subscribe",
		"args": topics,
	}); err != nil {
		return err
	}

	books := map[string]*symbolBook{}

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			return err
		}

		var parsed orderBookMessage
		if err := json.Unmarshal(msg, &parsed); err != nil {
			continue
		}

		symbol := strings.ToUpper(parsed.Data.Symbol)
		if symbol == "" || !strings.HasPrefix(parsed.Topic, "orderbook.") {
			continue
		}

		book := books[symbol]
		if book == nil || parsed.Type == "snapshot" {
			book = &symbolBook{
				bids: map[string]string{},
				asks: map[string]string{},
			}
			books[symbol] = book
		}

		applyLevels(book.bids, parsed.Data.Bids)
		applyLevels(book.asks, parsed.Data.Asks)

		ws.Broadcast("depth:update", map[string]interface{}{
			"symbol": symbol,
			"bids":   sortedLevels(book.bids, true, depthLimit),
			"asks":   sortedLevels(book.asks, false, depthLimit),
		})
	}
}

func depthTopics() []string {
	symbols := topDepthSymbols()
	if len(symbols) == 0 {
		symbols = config.Symbols
	}

	limit := len(symbols)
	if limit > maxDepthSymbols {
		limit = maxDepthSymbols
	}

	topics := make([]string, 0, limit)
	for _, symbol := range symbols[:limit] {
		symbol = strings.ToUpper(strings.TrimSpace(symbol))
		if symbol == "" {
			continue
		}

		topics = append(topics, "orderbook.50."+symbol)
	}

	return topics
}

func topDepthSymbols() []string {
	resp, err := http.Get("https://api.bybit.com/v5/market/tickers?category=linear")
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil
	}

	var parsed depthTickerResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil
	}

	tickers := make([]depthTicker, 0, len(parsed.Result.List))
	for _, item := range parsed.Result.List {
		symbol := strings.ToUpper(strings.TrimSpace(item.Symbol))
		if !strings.HasSuffix(symbol, "USDT") {
			continue
		}

		tickers = append(tickers, depthTicker{
			symbol:   symbol,
			turnover: parsePrice(item.Turnover24h),
		})
	}

	sort.Slice(tickers, func(i, j int) bool {
		return tickers[i].turnover > tickers[j].turnover
	})

	if len(tickers) > maxDepthSymbols {
		tickers = tickers[:maxDepthSymbols]
	}

	symbols := make([]string, 0, len(tickers))
	for _, ticker := range tickers {
		symbols = append(symbols, ticker.symbol)
	}

	return symbols
}

func applyLevels(bookSide map[string]string, levels []depthLevel) {
	for _, level := range levels {
		price := level[0]
		quantity := level[1]

		if price == "" {
			continue
		}

		if quantity == "" || quantity == "0" {
			delete(bookSide, price)
			continue
		}

		bookSide[price] = quantity
	}
}

func sortedLevels(bookSide map[string]string, desc bool, limit int) []depthLevel {
	levels := make([]depthLevel, 0, len(bookSide))
	for price, quantity := range bookSide {
		levels = append(levels, depthLevel{price, quantity})
	}

	sort.Slice(levels, func(i, j int) bool {
		left := parsePrice(levels[i][0])
		right := parsePrice(levels[j][0])

		if desc {
			return left > right
		}

		return left < right
	})

	if len(levels) > limit {
		return levels[:limit]
	}

	return levels
}

func parsePrice(value string) float64 {
	price, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0
	}

	return price
}
