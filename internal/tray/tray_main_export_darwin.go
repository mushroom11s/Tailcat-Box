//go:build darwin

package tray

import "C"
import "time"

// trayInvokeMain runs queued tray work on the calling OS thread.
// Darwin schedules it with dispatch_async_f on the main queue.
// The export is in its own file so its cgo preamble stays empty.

//export trayInvokeMain
func trayInvokeMain() {
	appKitQueue.drain()
}

//export trayMenuBegan
func trayMenuBegan() {
	clickMu.Lock()
	fn := clickTray
	clickMu.Unlock()
	if fn == nil {
		return
	}
	// The notification runs on the AppKit main thread. Scoop's icon swap
	// waits for that thread, so start it only after this callback returns.
	go func() {
		time.Sleep(30 * time.Millisecond)
		fn()
	}()
}
