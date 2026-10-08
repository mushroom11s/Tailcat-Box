//go:build !darwin

package screenwin

// Install is a no-op outside macOS.
func Install() {}
