package remote

import "fmt"

// ErrInput is returned when this computer cannot apply remote keyboard or mouse.
var ErrInput = fmt.Errorf("This computer could not apply the remote keyboard and mouse.")

// Input is one pointer or key event from the controlling computer.
// X and Y are fractions of the shared screen, from 0 to 1.
type Input struct {
	Kind   string  `json:"kind"`
	X      float64 `json:"x,omitempty"`
	Y      float64 `json:"y,omitempty"`
	Button string  `json:"button,omitempty"`
	Dy     int     `json:"dy,omitempty"`
	Code   string  `json:"code,omitempty"`
	Down   bool    `json:"down,omitempty"`
}

// Injector applies pointer and key events on this computer.
type Injector interface {
	Move(x, y float64) error
	Button(button string, down bool) error
	Wheel(dy int) error
	Key(code string, down bool) error
}

func validInput(in Input) bool {
	switch in.Kind {
	case "move":
		return in.X >= 0 && in.X <= 1 && in.Y >= 0 && in.Y <= 1
	case "down", "up":
		return in.Button == "left" || in.Button == "right" || in.Button == "middle"
	case "wheel":
		return in.Dy != 0 && in.Dy > -40 && in.Dy < 40
	case "key":
		return in.Code != "" && len(in.Code) <= 32
	default:
		return false
	}
}

type keyCodes struct {
	win   uint16
	linux uint16
	mac   uint16
}

func domKey(code string) (keyCodes, bool) {
	if len(code) == 4 && code[:3] == "Key" {
		ch := code[3]
		if ch >= 'A' && ch <= 'Z' {
			return keyCodes{win: uint16(ch), linux: 30 + uint16(ch-'A'), mac: macLetter[ch-'A']}, true
		}
	}
	if len(code) == 6 && code[:5] == "Digit" {
		ch := code[5]
		if ch >= '0' && ch <= '9' {
			n := ch - '0'
			linux := uint16(11) // KEY_0
			if n > 0 {
				linux = uint16(n + 1) // KEY_1 is 2
			}
			return keyCodes{win: uint16(ch), linux: linux, mac: macDigit[n]}, true
		}
	}
	codes, ok := namedKeys[code]
	return codes, ok
}

var macLetter = [26]uint16{
	0, 11, 8, 2, 14, 3, 5, 4, 34, 38, 40, 37, 46, 45, 31, 35, 12, 15, 1, 17, 32, 9, 13, 7, 16, 6,
}

var macDigit = [10]uint16{29, 18, 19, 20, 21, 23, 22, 26, 28, 25}

var namedKeys = map[string]keyCodes{
	"Enter":        {win: 0x0D, linux: 28, mac: 36},
	"Backspace":    {win: 0x08, linux: 14, mac: 51},
	"Tab":          {win: 0x09, linux: 15, mac: 48},
	"Escape":       {win: 0x1B, linux: 1, mac: 53},
	"Space":        {win: 0x20, linux: 57, mac: 49},
	"ArrowLeft":    {win: 0x25, linux: 105, mac: 123},
	"ArrowUp":      {win: 0x26, linux: 103, mac: 126},
	"ArrowRight":   {win: 0x27, linux: 106, mac: 124},
	"ArrowDown":    {win: 0x28, linux: 108, mac: 125},
	"ShiftLeft":    {win: 0xA0, linux: 42, mac: 56},
	"ShiftRight":   {win: 0xA1, linux: 54, mac: 60},
	"ControlLeft":  {win: 0xA2, linux: 29, mac: 59},
	"ControlRight": {win: 0xA3, linux: 97, mac: 62},
	"AltLeft":      {win: 0xA4, linux: 56, mac: 58},
	"AltRight":     {win: 0xA5, linux: 100, mac: 61},
	"MetaLeft":     {win: 0x5B, linux: 125, mac: 55},
	"MetaRight":    {win: 0x5C, linux: 126, mac: 54},
}
