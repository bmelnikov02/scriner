package handlers

import (
	"io"
	"net/http"
)

func Symbols(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	resp, err := http.Get("https://fapi.binance.com/fapi/v1/ticker/24hr")
	if err != nil {
		http.Error(w, "failed", 500)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	w.Write(body)
}