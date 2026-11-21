//go:build windows

package hotkey

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	procFindWindowW      = user32.NewProc("FindWindowW")
	procIsWindowVisible  = user32.NewProc("IsWindowVisible")
	procIsIconic         = user32.NewProc("IsIconic")
	procSetWindowPos     = user32.NewProc("SetWindowPos")
	procSetForegroundWnd = user32.NewProc("SetForegroundWindow")
)

const (
	hwndTopmost   = ^uintptr(0)
	swpNoMove     = 0x0002
	swpNoSize     = 0x0001
	swpShowWindow = 0x0040
)

// RaiseWindow puts the titled window above other windows, including this app.
func RaiseWindow(title string) {
	if title == "" {
		return
	}
	name, err := windows.UTF16PtrFromString(title)
	if err != nil {
		return
	}
	hwnd, _, _ := procFindWindowW.Call(0, uintptr(unsafe.Pointer(name)))
	if hwnd == 0 {
		return
	}
	_, _, _ = procSetWindowPos.Call(hwnd, hwndTopmost, 0, 0, 0, 0, swpNoMove|swpNoSize|swpShowWindow)
	_, _, _ = procSetForegroundWnd.Call(hwnd)
}

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
