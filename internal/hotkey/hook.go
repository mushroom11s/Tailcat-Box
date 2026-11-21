package hotkey

import (
	"runtime"
	"sync"
	"time"
)

// Hook listens for the wake and close chords on a locked OS thread.
type Hook struct {
	onWake   func()
	onClose  func()
	onToggle func()
	same     bool

	mu       sync.Mutex
	stopped  bool
	updates  chan request
	done     chan struct{}
	stopOnce sync.Once
}

type request struct {
	spec   [2]Chord
	clear  bool
	resume bool
	done   chan error
}

// Start begins the listener. onWake shows the window, onClose hides it,
// and onToggle does whichever the window needs when both chords match.
func Start(onWake, onClose, onToggle func()) *Hook {
	h := &Hook{
		onWake:   onWake,
		onClose:  onClose,
		onToggle: onToggle,
		updates:  make(chan request),
		done:     make(chan struct{}),
	}
	ready := make(chan struct{})
	go h.loop(ready)
	<-ready
	return h
}

// Set replaces both chords. A chord the system already owns is refused.
func (h *Hook) Set(wake, close string) error {
	w, err := Parse(wake)
	if err != nil {
		return err
	}
	c, err := Parse(close)
	if err != nil {
		return err
	}
	if err := usable(w); err != nil {
		return err
	}
	if err := usable(c); err != nil {
		return err
	}
	return h.send(request{spec: [2]Chord{w, c}})
}

// Hold drops the registration without forgetting the chords.
// Hold(false) registers them again.
func (h *Hook) Hold(hold bool) error {
	if hold {
		return h.send(request{clear: true})
	}
	return h.send(request{resume: true})
}

// Stop unregisters the chords and ends the listener.
func (h *Hook) Stop() {
	h.stopOnce.Do(func() {
		h.mu.Lock()
		h.stopped = true
		h.mu.Unlock()
		close(h.done)
	})
}

func (h *Hook) send(req request) error {
	h.mu.Lock()
	stopped := h.stopped
	h.mu.Unlock()
	if stopped {
		return ErrInvalid
	}
	req.done = make(chan error, 1)
	select {
	case h.updates <- req:
		return <-req.done
	case <-h.done:
		return ErrInvalid
	}
}

func (h *Hook) loop(ready chan struct{}) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	close(ready)
	var current [2]Chord
	held := false
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-h.done:
			unregisterAll()
			return
		case req := <-h.updates:
			var err error
			switch {
			case req.clear:
				unregisterAll()
				held = true
			case req.resume:
				held = false
				h.same = samePair(current)
				err = registerPair(current)
			default:
				unregisterAll()
				err = registerPair(req.spec)
				if err != nil {
					if !held {
						_ = registerPair(current)
					}
				} else {
					current = req.spec
					h.same = samePair(current)
					held = false
				}
			}
			req.done <- err
		case <-ticker.C:
			h.pump()
		}
	}
}

func samePair(pair [2]Chord) bool {
	return !pair[0].empty() && pair[0].String() == pair[1].String()
}

func (h *Hook) pump() {
	for {
		id, ok := pollHotkey()
		if !ok {
			return
		}
		switch id {
		case idWake:
			if h.same {
				if h.onToggle != nil {
					go h.onToggle()
				}
				break
			}
			if h.onWake != nil {
				go h.onWake()
			}
		case idClose:
			if h.onClose != nil {
				go h.onClose()
			}
		}
	}
}
