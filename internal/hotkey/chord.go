package hotkey

import (
	"errors"
	"strings"
)

const (
	DefaultWake  = "Ctrl+Alt+Shift+W"
	DefaultClose = "Ctrl+Alt+Shift+W"
)

var (
	ErrInvalid  = errors.New("hotkey-invalid")
	ErrConflict = errors.New("hotkey-conflict")
	ErrTaken    = errors.New("hotkey-taken")
)

// Chord is one global shortcut. Modifiers are independent of key order.
type Chord struct {
	Ctrl  bool
	Alt   bool
	Shift bool
	Key   string
}

func (c Chord) empty() bool {
	return c.Key == ""
}

func (c Chord) String() string {
	if c.Key == "" {
		return ""
	}
	parts := make([]string, 0, 4)
	if c.Ctrl {
		parts = append(parts, "Ctrl")
	}
	if c.Alt {
		parts = append(parts, "Alt")
	}
	if c.Shift {
		parts = append(parts, "Shift")
	}
	parts = append(parts, c.Key)
	return strings.Join(parts, "+")
}

func (c Chord) modifiers() int {
	n := 0
	if c.Ctrl {
		n++
	}
	if c.Alt {
		n++
	}
	if c.Shift {
		n++
	}
	return n
}

// Parse accepts a chord such as "Ctrl+Alt+Shift+T". The Win key is rejected.
func Parse(raw string) (Chord, error) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return Chord{}, ErrInvalid
	}
	var chord Chord
	for _, part := range strings.Split(text, "+") {
		part = strings.TrimSpace(part)
		if part == "" {
			return Chord{}, ErrInvalid
		}
		switch strings.ToLower(part) {
		case "ctrl", "control", "cmd", "command":
			chord.Ctrl = true
		case "alt", "option":
			chord.Alt = true
		case "shift":
			chord.Shift = true
		case "win", "meta", "super", "cmdorctrl":
			return Chord{}, ErrConflict
		default:
			key, ok := normalizeKey(part)
			if !ok || chord.Key != "" {
				return Chord{}, ErrInvalid
			}
			chord.Key = key
		}
	}
	if chord.Key == "" {
		return Chord{}, ErrInvalid
	}
	return chord, nil
}

// Normalize checks a wake/close pair and returns the canonical text.
func Normalize(wake, close string) (string, string, error) {
	w, err := Parse(wake)
	if err != nil {
		return "", "", err
	}
	c, err := Parse(close)
	if err != nil {
		return "", "", err
	}
	if err := usable(w); err != nil {
		return "", "", err
	}
	if err := usable(c); err != nil {
		return "", "", err
	}
	return w.String(), c.String(), nil
}

func usable(c Chord) error {
	if c.Key == "" || c.modifiers() < 2 {
		return ErrConflict
	}
	if _, blocked := reserved[c.String()]; blocked {
		return ErrConflict
	}
	return nil
}

func normalizeKey(part string) (string, bool) {
	if len(part) == 1 {
		ch := part[0]
		if ch >= 'a' && ch <= 'z' {
			return strings.ToUpper(part), true
		}
		if ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9' {
			return strings.ToUpper(part), true
		}
		return "", false
	}
	switch strings.ToLower(part) {
	case "space":
		return "Space", true
	case "esc", "escape":
		return "Esc", true
	case "tab":
		return "Tab", true
	case "del", "delete":
		return "Delete", true
	}
	if len(part) >= 2 && (part[0] == 'f' || part[0] == 'F') {
		n := 0
		for _, ch := range part[1:] {
			if ch < '0' || ch > '9' {
				return "", false
			}
			n = n*10 + int(ch-'0')
		}
		if n >= 1 && n <= 12 {
			return "F" + part[1:], true
		}
	}
	return "", false
}

// reserved lists menu accelerators and system chords that stay untouched
// even when they already fail the two-modifier rule.
var reserved = map[string]bool{
	"Ctrl+A": true, "Ctrl+C": true, "Ctrl+V": true, "Ctrl+X": true, "Ctrl+Z": true,
	"Ctrl+Shift+Z": true, "Ctrl+Y": true,
	"Ctrl+Q": true, "Ctrl+W": true, "Ctrl+H": true, "Ctrl+M": true, "Ctrl+F": true,
	"Ctrl+Shift+Esc": true, "Ctrl+Alt+Delete": true,
	"Alt+F4": true, "Alt+Tab": true, "Ctrl+Esc": true,
}
