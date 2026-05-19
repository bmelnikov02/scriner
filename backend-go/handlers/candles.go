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
	} else if limitValue > 1000 {
		limit = "1000"
	}

	query := url.Values{}
	query.Set("category", "linear")
	query.Set("symbol", symbol)
	query.Set("interval", binance.ToBybitInterval(interval))
	query.Set("limit", limit)

	if endTime := r.URL.Query().Get("endTime"); endTime != "" {
		query.Set("end", endTime)
	}

	cacheKey := query.Encode()

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
