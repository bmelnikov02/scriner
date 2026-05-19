package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"screiner-backend/binance"
)

func OrderDensity(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	symbol := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("symbol")))

	if symbol == "" || !strings.HasSuffix(symbol, "USDT") {
		http.Error(w, "invalid symbol", http.StatusBadRequest)
		return
	}

	densities, err := binance.GetOrderDensities(symbol)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	json.NewEncoder(w).Encode(densities)
}
