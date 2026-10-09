//go:build linux

package tray

import (
	"os"

	"github.com/godbus/dbus/v5"
)

// Available reports whether a tray icon can be shown. On Linux that needs a
// StatusNotifierWatcher on the session bus. Without one, closing the window
// must quit the app, or it would keep running with no way back.
func Available() bool {
	if os.Getenv("TAILCAT_NO_TRAY") != "" {
		return false
	}
	conn, err := dbus.ConnectSessionBus()
	if err != nil {
		return false
	}
	defer conn.Close()
	var owned bool
	err = conn.BusObject().Call("org.freedesktop.DBus.NameHasOwner", 0, "org.kde.StatusNotifierWatcher").Store(&owned)
	return err == nil && owned
}
