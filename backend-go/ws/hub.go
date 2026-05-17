package ws

import (
	"sync"

	"github.com/gorilla/websocket"
)

type OutMessage struct {
	Event string      `json:"event"`
	Data  interface{} `json:"data"`
}

var clients = map[*websocket.Conn]bool{}
var mu sync.Mutex

func Add(conn *websocket.Conn) {
	mu.Lock()
	defer mu.Unlock()
	clients[conn] = true
}

func Remove(conn *websocket.Conn) {
	mu.Lock()
	defer mu.Unlock()
	delete(clients, conn)
	conn.Close()
}

func Broadcast(event string, data interface{}) {
	mu.Lock()
	defer mu.Unlock()

	msg := OutMessage{Event: event, Data: data}

	for c := range clients {
		if err := c.WriteJSON(msg); err != nil {
			c.Close()
			delete(clients, c)
		}
	}
}