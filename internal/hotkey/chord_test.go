package hotkey

import "testing"

func TestNormalizeRejectsMenuAndSystemChords(t *testing.T) {
	if _, _, err := Normalize("Ctrl+W", "Ctrl+Alt+Shift+W"); err != ErrConflict {
		t.Fatalf("ctrl+w err = %v", err)
	}
	if _, _, err := Normalize("Ctrl+Q", "Ctrl+H"); err != ErrConflict {
		t.Fatalf("menu err = %v", err)
	}
	if _, _, err := Normalize("Alt+F4", "Ctrl+Alt+Shift+W"); err != ErrConflict {
		t.Fatalf("alt+f4 err = %v", err)
	}
	if _, _, err := Normalize("Ctrl+Shift+Esc", "Ctrl+Alt+Shift+W"); err != ErrConflict {
		t.Fatalf("task manager err = %v", err)
	}
	wake, close, err := Normalize("shift+alt+ctrl+w", "Ctrl+Alt+Shift+W")
	if err != nil {
		t.Fatal(err)
	}
	if wake != DefaultWake || close != DefaultClose {
		t.Fatalf("got %s %s", wake, close)
	}
}
