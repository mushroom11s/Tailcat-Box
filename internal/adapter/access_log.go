package adapter

import (
	"encoding/json"
	"net"
	"sync"
	"time"

	"github.com/tailscale/tailcat"
	"tailscale.com/types/key"
)

const maxLoggedRefusals = 1024

type accessRecord struct {
	Op    string `json:"op"`
	Peer  string `json:"peer,omitempty"`
	Proto string `json:"proto,omitempty"`
	Port  uint16 `json:"port,omitempty"`
	Via   string `json:"via,omitempty"`
	Dur   string `json:"dur,omitempty"`
}

func accessLine(rec accessRecord) string {
	b, err := json.Marshal(rec)
	if err != nil {
		return ""
	}
	return string(b)
}

// attachAccessLog wraps the server's allow hook and TCP handler so each
// admission and each TCP open/close is emitted as EventLog. Call it after
// AllowClient and OnTCP are set, and before Server.Start.
func attachAccessLog(srv *tailcat.Server, sessionID string, send func(Event)) {
	next := srv.AllowClient
	var mu sync.Mutex
	refused := map[key.NodePublic]bool{}
	srv.AllowClient = func(k key.NodePublic) bool {
		if next == nil || next(k) {
			send(Event{SessionID: sessionID, Kind: EventLog, Data: accessLine(accessRecord{Op: "allow", Peer: k.String()})})
			return true
		}
		mu.Lock()
		first := !refused[k] && len(refused) < maxLoggedRefusals
		if first {
			refused[k] = true
		}
		mu.Unlock()
		if first {
			send(Event{SessionID: sessionID, Kind: EventLog, Data: accessLine(accessRecord{Op: "refuse", Peer: k.String()})})
		}
		return false
	}

	inner := srv.OnTCP
	srv.OnTCP = func(port uint16) func(net.Conn) {
		var nextHandler func(net.Conn)
		if inner != nil {
			nextHandler = inner(port)
		}
		if nextHandler == nil {
			send(Event{SessionID: sessionID, Kind: EventLog, Data: accessLine(accessRecord{Op: "refuse-port", Proto: "tcp", Port: port})})
			return nil
		}
		return func(c net.Conn) {
			peer, via := "unknown", ""
			if k, ok := srv.PeerKey(c.RemoteAddr()); ok {
				peer = k.String()
				via = peerVia(srv, k)
			}
			send(Event{SessionID: sessionID, Kind: EventLog, Data: accessLine(accessRecord{
				Op: "open", Peer: peer, Proto: "tcp", Port: port, Via: via,
			})})
			start := time.Now()
			nextHandler(c)
			send(Event{SessionID: sessionID, Kind: EventLog, Data: accessLine(accessRecord{
				Op: "close", Peer: peer, Proto: "tcp", Port: port,
				Dur: time.Since(start).Round(time.Millisecond).String(),
			})})
		}
	}
}

func peerVia(srv *tailcat.Server, k key.NodePublic) string {
	st := srv.Status()
	if st == nil {
		return ""
	}
	ps := st.Peer[k]
	if ps == nil {
		return ""
	}
	if ps.CurAddr != "" {
		return "direct:" + ps.CurAddr
	}
	if ps.Relay != "" {
		return "derp:" + ps.Relay
	}
	return ""
}
