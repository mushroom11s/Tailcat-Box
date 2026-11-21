//go:build windows

package hotkey

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	procFindWindowW     = user32.NewProc("FindWindowW")
	procIsWindowVisible = user32.NewProc("IsWindowVisible")
	procIsIconic        = user32.NewProc("IsIconic")
)

// WindowShown reports whether the titled window is on screen and not minimised.
func WindowShown(title string) bool {
	name, err := windows.UTF16PtrFromString(title)
	if err != nil {
		return false
	}
	hwnd, _, _ := procFindWindowW.Call(0, uintptr(unsafe.Pointer(name)))
	if hwnd == 0 {
		return false
	}
	visible, _, _ := procIsWindowVisible.Call(hwnd)
	if visible == 0 {
		return false
	}
	iconic, _, _ := procIsIconic.Call(hwnd)
	return iconic == 0
}
