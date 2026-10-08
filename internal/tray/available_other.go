//go:build !linux

package tray

// Available is true where Start installs a native tray icon (macOS and
// Windows). Closing the window hides it there.
func Available() bool {
	return true
}
