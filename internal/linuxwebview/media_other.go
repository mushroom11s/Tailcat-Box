//go:build !linux || !(dev || production)

package linuxwebview

// EnableMedia is a no-op outside a Linux Wails build.
func EnableMedia() {}
