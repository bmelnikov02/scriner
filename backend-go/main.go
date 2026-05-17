package main

import (
	"log"
	"net/http"

	"screiner-backend/binance"
	"screiner-backend/handlers"
	"screiner-backend/ws"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func wsHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	ws.Add(conn)

	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			ws.Remove(conn)
			break
		}
	}
}

func main() {
	go binance.StartTicker()
	go binance.StartKline()

	http.HandleFunc("/symbols", handlers.Symbols)
	http.HandleFunc("/timeframe", handlers.Timeframe)
	http.HandleFunc("/", handlers.Root)
	http.HandleFunc("/candles", handlers.Candles)
	http.HandleFunc("/ws", wsHandler)

	log.Println("Backend started on :4000")
	http.ListenAndServe(":4000", nil)
}