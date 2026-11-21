//go:build windows

package hotkey

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	idWake  = 0xB001
	idClose = 0xB002

	modAlt      = 0x0001
	modControl  = 0x0002
	modShift    = 0x0004
	modNoRepeat = 0x4000
	wmHotkey    = 0x0312
	pmRemove    = 0x0001
)

var (
	user32           = windows.NewLazySystemDLL("user32.dll")
	procRegister     = user32.NewProc("RegisterHotKey")
	procUnregister   = user32.NewProc("UnregisterHotKey")
	procPeekMessageW = user32.NewProc("PeekMessageW")
)

type winPoint struct {
	X int32
	Y int32
}

type winMsg struct {
	Hwnd    uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      winPoint
}

func registerPair(pair [2]Chord) error {
	if pair[0].empty() && pair[1].empty() {
		return nil
	}
	if !pair[0].empty() && !registerOne(idWake, pair[0]) {
		return ErrTaken
	}
	if pair[0].String() == pair[1].String() {
		return nil
	}
	if !pair[1].empty() && !registerOne(idClose, pair[1]) {
		unregisterOne(idWake)
		return ErrTaken
	}
	return nil
}

func unregisterAll() {
	unregisterOne(idWake)
	unregisterOne(idClose)
}

func registerOne(id uintptr, chord Chord) bool {
	mods := uintptr(modNoRepeat)
	if chord.Alt {
		mods |= modAlt
	}
	if chord.Ctrl {
		mods |= modControl
	}
	if chord.Shift {
		mods |= modShift
	}
	vk, ok := virtualKey(chord.Key)
	if !ok {
		return false
	}
	r, _, _ := procRegister.Call(0, id, mods, vk)
	return r != 0
}

func unregisterOne(id uintptr) {
	_, _, _ = procUnregister.Call(0, id)
}

func pollHotkey() (uintptr, bool) {
	var msg winMsg
	r, _, _ := procPeekMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0, pmRemove)
	if r == 0 || msg.Message != wmHotkey {
		return 0, false
	}
	return msg.WParam, true
}

func virtualKey(key string) (uintptr, bool) {
	switch key {
	case "Space":
		return 0x20, true
	case "Esc":
		return 0x1B, true
	case "Tab":
		return 0x09, true
	case "Delete":
		return 0x2E, true
	}
	if len(key) == 1 {
		ch := key[0]
		if ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9' {
			return uintptr(ch), true
		}
	}
	if len(key) >= 2 && key[0] == 'F' {
		n := 0
		for _, ch := range key[1:] {
			if ch < '0' || ch > '9' {
				return 0, false
			}
			n = n*10 + int(ch-'0')
		}
		if n >= 1 && n <= 12 {
			return uintptr(0x6F + n), true
		}
	}
	return 0, false
}
