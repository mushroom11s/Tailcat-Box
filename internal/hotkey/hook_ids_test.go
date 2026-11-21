package hotkey

import "testing"

func TestHotkeyIDsDistinct(t *testing.T) {
	if idWake == 0 || idClose == 0 {
		t.Fatal("hotkey ids must be non-zero")
	}
	if idWake == idClose {
		t.Fatal("wake and close hotkey ids must differ")
	}
}
