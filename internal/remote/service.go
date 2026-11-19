package remote

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/mushroom11s/tailcat-box/internal/adapter"
	"github.com/mushroom11s/tailcat-box/internal/chat"
	"github.com/mushroom11s/tailcat-box/internal/session"
)

const portRemote = 104

// View is the session the UI renders.
type View struct {
	Role    string `json:"role"`
	State   string `json:"state"`
	Address string `json:"address,omitempty"`
	Peer    string `json:"peer,omitempty"`
	Mode    string `json:"mode,omitempty"`
	Error   string `json:"error,omitempty"`
}

// Service is one remote-control session. The host shares a screen. The guest
// watches it and, once the host has allowed the peer, sends keyboard and mouse.
type Service struct {
	ad     adapter.ChatAdapter
	net    adapter.NetworkOpts
	mu     sync.Mutex
	inject Injector
	side   *side
	events chan adapter.Event
}

type side struct {
	role   string
	state  string
	addr   string
	peer   string
	mode   string
	err    string
	room   adapter.Room
	cancel context.CancelFunc
	ready  chan string
}

func New(ad adapter.ChatAdapter) *Service {
	return &Service{ad: ad, events: make(chan adapter.Event, 32)}
}

func (s *Service) Events() <-chan adapter.Event { return s.events }

func (s *Service) SetNetwork(net adapter.NetworkOpts) {
	s.mu.Lock()
	s.net = net
	s.mu.Unlock()
}

func (s *Service) SetInjector(in Injector) {
	s.mu.Lock()
	s.inject = in
	s.mu.Unlock()
}

func (s *Service) StartHost() (View, error) {
	s.finish("")
	room, cancel, err := s.listen()
	if err != nil {
		return View{}, err
	}
	current := &side{role: "host", state: "listening", room: room, cancel: cancel, ready: make(chan string, 1)}
	s.mu.Lock()
	s.side = current
	s.mu.Unlock()
	go s.readLoop(current)
	addr, err := waitAddr(current.ready)
	if err != nil {
		s.finish(err.Error())
		return View{}, err
	}
	s.mu.Lock()
	if s.side == current {
		current.addr = addr
	}
	view := s.viewLocked()
	s.mu.Unlock()
	s.publish(view)
	return view, nil
}

func (s *Service) Connect(address, mode string) (View, error) {
	address = strings.TrimSpace(address)
	if !strings.HasPrefix(address, "tc") {
		return View{}, fmt.Errorf("That is not a Tailcat address.")
	}
	mode = normalizeMode(mode)
	s.finish("")
	room, cancel, err := s.listen()
	if err != nil {
		return View{}, err
	}
	current := &side{role: "guest", state: "waiting", peer: address, mode: mode, room: room, cancel: cancel, ready: make(chan string, 1)}
	s.mu.Lock()
	s.side = current
	s.mu.Unlock()
	go s.readLoop(current)
	addr, err := waitAddr(current.ready)
	if err != nil {
		s.finish(err.Error())
		return View{}, err
	}
	s.mu.Lock()
	if s.side == current {
		current.addr = addr
	}
	s.mu.Unlock()
	if err := room.SetPeer(address); err != nil {
		s.finish("Could not reach the other computer.")
		return View{}, fmt.Errorf("Could not reach the other computer.")
	}
	if err := s.send(current, map[string]any{"type": "remote-hello", "mode": mode, "from": addr}); err != nil {
		s.finish("Could not reach the other computer.")
		return View{}, fmt.Errorf("Could not reach the other computer.")
	}
	view := s.snapshot()
	s.publish(view)
	return view, nil
}

func (s *Service) Allow() error {
	s.mu.Lock()
	current := s.side
	if current == nil || current.role != "host" || current.state != "incoming" {
		s.mu.Unlock()
		return fmt.Errorf("There is no request to allow.")
	}
	current.state = "live"
	view := current.view()
	s.mu.Unlock()
	if err := s.send(current, map[string]any{"type": "remote-allow"}); err != nil {
		s.finish("Could not reach the other computer.")
		return fmt.Errorf("Could not reach the other computer.")
	}
	s.publish(view)
	return nil
}

func (s *Service) Deny() error {
	s.mu.Lock()
	current := s.side
	if current == nil || current.role != "host" || current.state != "incoming" {
		s.mu.Unlock()
		return fmt.Errorf("There is no request to deny.")
	}
	s.mu.Unlock()
	_ = s.send(current, map[string]any{"type": "remote-deny"})
	s.finish("The request was declined.")
	return nil
}

func (s *Service) End() {
	s.mu.Lock()
	current := s.side
	s.mu.Unlock()
	if current != nil {
		_ = s.send(current, map[string]any{"type": "remote-end"})
	}
	s.finish("")
}

func (s *Service) SendSignal(metaJSON string) error {
	var meta map[string]any
	if err := json.Unmarshal([]byte(metaJSON), &meta); err != nil || meta == nil {
		return fmt.Errorf("invalid signal")
	}
	switch meta["type"] {
	case "rtc-offer", "rtc-answer", "rtc-hangup":
	default:
		return fmt.Errorf("invalid signal")
	}
	s.mu.Lock()
	current := s.side
	s.mu.Unlock()
	if current == nil || current.peer == "" {
		return fmt.Errorf("no peer")
	}
	return s.send(current, meta)
}

func (s *Service) SendInput(in Input) error {
	if !validInput(in) {
		return fmt.Errorf("invalid input")
	}
	s.mu.Lock()
	current := s.side
	if current == nil || current.role != "guest" || current.state != "live" {
		s.mu.Unlock()
		return fmt.Errorf("the remote session is not live")
	}
	s.mu.Unlock()
	payload := map[string]any{"type": "remote-input", "kind": in.Kind}
	switch in.Kind {
	case "move":
		payload["x"] = in.X
		payload["y"] = in.Y
	case "down", "up":
		payload["button"] = in.Button
	case "wheel":
		payload["dy"] = in.Dy
	case "key":
		payload["code"] = in.Code
		payload["down"] = in.Down
	}
	return s.send(current, payload)
}

func (s *Service) listen() (adapter.Room, context.CancelFunc, error) {
	if s.ad == nil {
		return nil, nil, fmt.Errorf("remote control is not available")
	}
	keyer, ok := s.ad.(interface{ GeneratePrivateKeyJSON() (string, error) })
	if !ok {
		return nil, nil, fmt.Errorf("remote control is not available")
	}
	key, err := keyer.GeneratePrivateKeyJSON()
	if err != nil || strings.TrimSpace(key) == "" {
		return nil, nil, fmt.Errorf("remote control is not available")
	}
	sess := session.New(session.KindExec)
	ctx, cancel := context.WithCancel(context.Background())
	s.mu.Lock()
	net := s.net
	s.mu.Unlock()
	room, err := s.ad.StartRoom(ctx, adapter.RoomOpts{
		SessionID:      sess.ID,
		PrivateKeyJSON: key,
		Region:         net.Region,
		DERPMapURL:     net.DERPMapURL,
	})
	if err != nil {
		cancel()
		return nil, nil, err
	}
	return room, cancel, nil
}

func (s *Service) readLoop(current *side) {
	room := current.room
	if room == nil {
		return
	}
	for ev := range room.Events() {
		s.mu.Lock()
		alive := s.side == current
		s.mu.Unlock()
		if !alive {
			return
		}
		switch ev.Kind {
		case adapter.ChatEventReady:
			if ev.Address != "" {
				select {
				case current.ready <- ev.Address:
				default:
				}
			}
		case adapter.ChatEventInbound:
			if ev.Port != portRemote || len(ev.Data) == 0 {
				continue
			}
			s.onFrame(current, ev.Data)
		case adapter.ChatEventClosed:
			s.finish("The remote session has ended.")
			return
		}
	}
}

func (s *Service) onFrame(current *side, frame []byte) {
	meta, _, err := chat.Unpack(frame)
	if err != nil {
		return
	}
	kind, _ := meta["type"].(string)
	switch kind {
	case "remote-hello":
		if current.role != "host" {
			return
		}
		from, _ := meta["from"].(string)
		from = strings.TrimSpace(from)
		if !strings.HasPrefix(from, "tc") {
			return
		}
		mode := normalizeMode(fmt.Sprint(meta["mode"]))
		s.mu.Lock()
		if s.side != current || (current.state != "listening" && current.state != "incoming") {
			s.mu.Unlock()
			return
		}
		current.peer = from
		current.mode = mode
		current.state = "incoming"
		_ = current.room.SetPeer(from)
		view := current.view()
		s.mu.Unlock()
		s.publish(view)
	case "remote-allow":
		if current.role != "guest" {
			return
		}
		s.mu.Lock()
		if s.side != current || current.state != "waiting" {
			s.mu.Unlock()
			return
		}
		current.state = "live"
		view := current.view()
		s.mu.Unlock()
		s.publish(view)
	case "remote-deny":
		s.finish("The other computer declined.")
	case "remote-end":
		s.finish("")
	case "remote-input":
		s.applyRemote(current, meta)
	case "rtc-offer", "rtc-answer", "rtc-hangup":
		raw, ok := chat.RawMeta(frame)
		if ok {
			s.emit(adapter.Event{SessionID: "remote", Kind: "remote-signal", Data: string(raw)})
		}
	}
}

func (s *Service) applyRemote(current *side, meta map[string]any) {
	s.mu.Lock()
	if s.side != current || current.role != "host" || current.state != "live" {
		s.mu.Unlock()
		return
	}
	inject := s.inject
	if inject == nil {
		inject = openInjector()
		s.inject = inject
	}
	s.mu.Unlock()
	in := inputFromMeta(meta)
	if !validInput(in) {
		return
	}
	var err error
	switch in.Kind {
	case "move":
		err = inject.Move(in.X, in.Y)
	case "down":
		err = inject.Button(in.Button, true)
	case "up":
		err = inject.Button(in.Button, false)
	case "wheel":
		err = inject.Wheel(in.Dy)
	case "key":
		err = inject.Key(in.Code, in.Down)
	}
	if err != nil {
		s.mu.Lock()
		if s.side == current && current.err == "" {
			current.err = ErrInput.Error()
			view := current.view()
			s.mu.Unlock()
			s.publish(view)
			return
		}
		s.mu.Unlock()
	}
}

func inputFromMeta(meta map[string]any) Input {
	in := Input{Kind: fmt.Sprint(meta["kind"])}
	if x, ok := meta["x"].(float64); ok {
		in.X = x
	}
	if y, ok := meta["y"].(float64); ok {
		in.Y = y
	}
	if button, ok := meta["button"].(string); ok {
		in.Button = button
	}
	switch dy := meta["dy"].(type) {
	case float64:
		in.Dy = int(dy)
	case int:
		in.Dy = dy
	}
	if code, ok := meta["code"].(string); ok {
		in.Code = code
	}
	if down, ok := meta["down"].(bool); ok {
		in.Down = down
	}
	return in
}

func (s *Service) send(current *side, meta map[string]any) error {
	if current == nil || current.room == nil || current.peer == "" && meta["type"] != "remote-hello" {
		if current == nil || current.room == nil {
			return fmt.Errorf("no peer")
		}
	}
	frame, err := chat.Pack(meta, nil)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return current.room.SendEnvelope(ctx, portRemote, frame)
}

func (s *Service) finish(errText string) {
	s.mu.Lock()
	current := s.side
	if current == nil {
		s.mu.Unlock()
		return
	}
	s.side = nil
	current.state = "ended"
	if errText != "" {
		current.err = errText
	}
	view := current.view()
	cancel := current.cancel
	room := current.room
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if room != nil {
		_ = room.Close()
	}
	s.publish(view)
}

func (s *Service) snapshot() View {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.viewLocked()
}

func (s *Service) viewLocked() View {
	if s.side == nil {
		return View{State: "idle"}
	}
	return s.side.view()
}

func (c *side) view() View {
	return View{Role: c.role, State: c.state, Address: c.addr, Peer: c.peer, Mode: c.mode, Error: c.err}
}

func (s *Service) publish(view View) {
	body, err := json.Marshal(view)
	if err != nil {
		return
	}
	s.emit(adapter.Event{SessionID: "remote", Kind: "remote", Data: string(body)})
}

func (s *Service) emit(ev adapter.Event) {
	select {
	case s.events <- ev:
	default:
	}
}

func waitAddr(ready <-chan string) (string, error) {
	timer := time.NewTimer(20 * time.Second)
	defer timer.Stop()
	select {
	case addr := <-ready:
		if addr == "" {
			return "", fmt.Errorf("the remote session did not start")
		}
		return addr, nil
	case <-timer.C:
		return "", fmt.Errorf("the remote session did not start")
	}
}

func normalizeMode(mode string) string {
	switch mode {
	case "play", "assist", "desk":
		return mode
	default:
		return "desk"
	}
}
