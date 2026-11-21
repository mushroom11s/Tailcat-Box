//go:build !windows

package winchrome

// RoundCorners is a no-op where the window manager draws its own corners.
func RoundCorners(string) {}
