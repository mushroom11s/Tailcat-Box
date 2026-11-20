//go:build !windows

package hotkey

func registerPair(pair [2]Chord) error {
	return nil
}

func unregisterAll() {}

func pollHotkey() (uintptr, bool) {
	return 0, false
}
