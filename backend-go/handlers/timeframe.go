package handlers

import (
	"net/http"

	"screiner-backend/binance"
)

func Timeframe(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")

	interval := r.URL.Query().Get("interval")
	if interval == "" {
		interval = "1m"
	}

	binance.SetInterval(interval)

	w.Write([]byte("OK"))
}