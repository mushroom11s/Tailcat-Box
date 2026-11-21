//go:build windows

package hotkey

// NoteShown is unused on Windows, where WindowShown asks the system.
func NoteShown(bool) {}
