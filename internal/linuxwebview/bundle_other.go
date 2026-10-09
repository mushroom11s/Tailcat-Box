//go:build !linux

package linuxwebview

// UseBundledWebKit is Linux-only.
func UseBundledWebKit() {}

// Bundled is always false outside Linux.
func Bundled() bool { return false }
