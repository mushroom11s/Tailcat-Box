//go:build windows

package winchrome

import (
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// RoundCorners asks Windows 11 to round all four corners of the window
// whose title matches title. Older Windows builds ignore the attribute.
func RoundCorners(title string) {
	user32 := windows.NewLazySystemDLL("user32.dll")
	findWindow := user32.NewProc("FindWindowW")
	name, err := syscall.UTF16PtrFromString(title)
	if err != nil {
		return
	}
	hwnd, _, _ := findWindow.Call(0, uintptr(unsafe.Pointer(name)))
	if hwnd == 0 {
		return
	}
	dwmapi := windows.NewLazySystemDLL("dwmapi.dll")
	setAttr := dwmapi.NewProc("DwmSetWindowAttribute")
	// DWMWA_WINDOW_CORNER_PREFERENCE = 33, DWMWCP_ROUND = 2.
	var pref int32 = 2
	_, _, _ = setAttr.Call(hwnd, 33, uintptr(unsafe.Pointer(&pref)), unsafe.Sizeof(pref))
}
