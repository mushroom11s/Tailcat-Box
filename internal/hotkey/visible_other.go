//go:build !windows

package hotkey

import "sync/atomic"

var shown atomic.Bool

func init() {
	shown.Store(true)
}

// WindowShown is the last show/hide recorded on systems without a window query.
func WindowShown(string) bool {
	return shown.Load()
}

// NoteShown records a show or hide for WindowShown.
func NoteShown(on bool) {
	shown.Store(on)
}
