package handlers

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
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
	} else if limitValue > 1500 {
		limit = "1500"
	}

	query := url.Values{}
	query.Set("symbol", symbol)
	query.Set("interval", interval)
	query.Set("limit", limit)

	if endTime := r.URL.Query().Get("endTime"); endTime != "" {
		query.Set("endTime", endTime)
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
		"https://fapi.binance.com/fapi/v1/klines?%s",
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

	if !strings.HasPrefix(strings.TrimSpace(string(body)), `{"code":`) {
		cacheDuration := 20 * time.Second

		if query.Get("endTime") != "" {
			cacheDuration = 30 * time.Minute
		}

		candleCache.Lock()
		candleCache.items[cacheKey] = candleCacheItem{
			body:      body,
			expiresAt: time.Now().Add(cacheDuration),
		}
		candleCache.Unlock()
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(body)
}
