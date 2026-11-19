package remote

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/mushroom11s/tailcat-box/internal/adapter"
)

type tape struct {
	moves   [][2]float64
	buttons []string
	downs   []bool
	keys    []string
	wheels  []int
}

func (t *tape) Move(x, y float64) error {
	t.moves = append(t.moves, [2]float64{x, y})
	return nil
}

func (t *tape) Button(button string, down bool) error {
	t.buttons = append(t.buttons, button)
	t.downs = append(t.downs, down)
	return nil
}

func (t *tape) Wheel(dy int) error {
	t.wheels = append(t.wheels, dy)
	return nil
}

func (t *tape) Key(code string, down bool) error {
	if down {
		t.keys = append(t.keys, code)
	}
	return nil
}

func TestAllowThenInjectAndTrustIsNotImplied(t *testing.T) {
	fake := adapter.NewFake()
	host := New(fake)
	guest := New(fake)
	ink := &tape{}
	host.SetInjector(ink)

	hostEvents := collect(t, host)
	guestEvents := collect(t, guest)

	hostView, err := host.StartHost()
	if err != nil {
		t.Fatal(err)
	}
	if !hasPrefix(hostView.Address, "tc") || hostView.State != "listening" {
		t.Fatalf("host=%+v", hostView)
	}

	guestView, err := guest.Connect(hostView.Address, "assist")
	if err != nil {
		t.Fatal(err)
	}
	if guestView.State != "waiting" {
		t.Fatalf("guest=%+v", guestView)
	}

	incoming := waitState(t, hostEvents, "incoming")
	if incoming.Peer == "" || incoming.Mode != "assist" {
		t.Fatalf("incoming=%+v", incoming)
	}
	if err := guest.SendInput(Input{Kind: "move", X: 0.5, Y: 0.25}); err == nil {
		t.Fatal("guest input before allow should fail")
	}
	if len(ink.moves) != 0 {
		t.Fatalf("injected before allow: %+v", ink.moves)
	}

	if err := host.Allow(); err != nil {
		t.Fatal(err)
	}
	if got := waitState(t, hostEvents, "live"); got.Role != "host" {
		t.Fatalf("host live=%+v", got)
	}
	if got := waitState(t, guestEvents, "live"); got.Role != "guest" {
		t.Fatalf("guest live=%+v", got)
	}

	if err := guest.SendInput(Input{Kind: "move", X: 0.5, Y: 0.25}); err != nil {
		t.Fatal(err)
	}
	if err := guest.SendInput(Input{Kind: "down", Button: "left"}); err != nil {
		t.Fatal(err)
	}
	if err := guest.SendInput(Input{Kind: "up", Button: "left"}); err != nil {
		t.Fatal(err)
	}
	if err := guest.SendInput(Input{Kind: "key", Code: "KeyA", Down: true}); err != nil {
		t.Fatal(err)
	}
	if err := guest.SendInput(Input{Kind: "wheel", Dy: 1}); err != nil {
		t.Fatal(err)
	}
	waitUntil(t, func() bool {
		return len(ink.moves) == 1 && len(ink.buttons) == 2 && len(ink.keys) == 1 && len(ink.wheels) == 1
	})
	if ink.moves[0] != [2]float64{0.5, 0.25} || ink.buttons[0] != "left" || !ink.downs[0] || ink.downs[1] || ink.keys[0] != "KeyA" || ink.wheels[0] != 1 {
		t.Fatalf("tape=%+v", ink)
	}

	guest.End()
	ended := waitState(t, hostEvents, "ended")
	if ended.State != "ended" {
		t.Fatalf("ended=%+v", ended)
	}
}

func TestDenyDoesNotOpenTheScreen(t *testing.T) {
	fake := adapter.NewFake()
	host := New(fake)
	guest := New(fake)
	guestEvents := collect(t, guest)
	hostView, err := host.StartHost()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := guest.Connect(hostView.Address, "desk"); err != nil {
		t.Fatal(err)
	}
	hostEvents := collect(t, host)
	waitState(t, hostEvents, "incoming")
	if err := host.Deny(); err != nil {
		t.Fatal(err)
	}
	denied := waitState(t, guestEvents, "ended")
	if denied.Error != "The other computer declined." {
		t.Fatalf("denied=%+v", denied)
	}
}

func collect(t *testing.T, svc *Service) <-chan View {
	t.Helper()
	out := make(chan View, 16)
	go func() {
		for ev := range svc.Events() {
			if ev.Kind != "remote" || ev.Data == "" {
				continue
			}
			var view View
			if json.Unmarshal([]byte(ev.Data), &view) == nil {
				out <- view
			}
		}
	}()
	return out
}

func waitState(t *testing.T, events <-chan View, state string) View {
	t.Helper()
	deadline := time.After(3 * time.Second)
	for {
		select {
		case view := <-events:
			if view.State == state {
				return view
			}
		case <-deadline:
			t.Fatalf("timed out waiting for %s", state)
		}
	}
	return View{}
}

func waitUntil(t *testing.T, ready func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if ready() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for input")
}

func hasPrefix(value, prefix string) bool {
	return len(value) >= len(prefix) && value[:len(prefix)] == prefix
}
