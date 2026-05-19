package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type bybitSymbolsResponse struct {
	Result struct {
		List []struct {
			Symbol       string `json:"symbol"`
			LastPrice    string `json:"lastPrice"`
			Price24hPcnt string `json:"price24hPcnt"`
			Turnover24h  string `json:"turnover24h"`
		} `json:"list"`
	} `json:"result"`
}

type tickerResponseItem struct {
	Symbol             string `json:"symbol"`
	LastPrice          string `json:"lastPrice"`
	PriceChangePercent string `json:"priceChangePercent"`
	QuoteVolume        string `json:"quoteVolume"`
}

func Symbols(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	resp, err := http.Get("https://api.bybit.com/v5/market/tickers?category=linear")
	if err != nil {
		http.Error(w, "failed", 500)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var bybit bybitSymbolsResponse
	if err := json.Unmarshal(body, &bybit); err != nil {
		http.Error(w, "failed", 500)
		return
	}

	items := make([]tickerResponseItem, 0, len(bybit.Result.List))

	for _, item := range bybit.Result.List {
		if !strings.HasSuffix(item.Symbol, "USDT") {
			continue
		}

		items = append(items, tickerResponseItem{
			Symbol:             item.Symbol,
			LastPrice:          item.LastPrice,
			PriceChangePercent: percentString(item.Price24hPcnt),
			QuoteVolume:        item.Turnover24h,
		})
	}

	json.NewEncoder(w).Encode(items)
}

func percentString(value string) string {
	var number float64

	if _, err := fmt.Sscanf(value, "%f", &number); err != nil {
		return "0"
	}

	return fmt.Sprintf("%.6f", number*100)
}
