//go:build linux

package tray

import (
	"log"

	"github.com/energye/systray"
)

// Start publishes a StatusNotifierItem over D-Bus (KDE, Ubuntu's GNOME, and
// most other desktops; stock GNOME needs the AppIndicator extension). With no
// tray host on the session bus it does nothing.
func (c *Controller) Start(icon []byte) {
	if skipTray(c) || !Available() {
		return
	}
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("tray: %v", r)
			}
		}()
		systray.Run(func() {
			c.install(icon)
		}, func() {})
	}()
}
