//go:build darwin

package tray

import (
	"github.com/energye/systray"
)

func (c *Controller) install(icon []byte) {
	if len(icon) == 0 {
		icon = DefaultIcon
	}
	if len(icon) > 0 {
		systray.SetIcon(icon)
	}
	c.bindProduct(func(title, tooltip string) {
		// Icon-only menu bar: tooltip only, no SetTitle text beside the icon.
		systray.SetTooltip(tooltip)
	})

	// energye/systray does not attach NSMenu to the status item. Clicks are
	// only delivered after SetOnClick/SetOnRClick (they call enable_on_click).
	// Leaving both unset makes the tray completely inert. Left-click opens
	// the window; right-click keeps the library default menu when OnRClick
	// is unset. Do not SetOnRClick: macOS ShowMenu is only for that hook,
	// and the nil default already shows the menu.
	systray.SetOnClick(func(systray.IMenu) {
		c.Open()
	})

	labels := c.Labels()
	openItem := systray.AddMenuItem(labels.Open, "")
	openItem.Click(c.Open)
	hideItem := systray.AddMenuItem(labels.Hide, "")
	hideItem.Click(c.Hide)
	systray.AddSeparator()
	chatItem := systray.AddMenuItem(labels.Chat, "")
	chatItem.Click(func() { c.Navigate(PageChat) })
	tunnelItem := systray.AddMenuItem(labels.Tunnel, "")
	tunnelItem.Click(func() { c.Navigate(PageTunnel) })
	settingsItem := systray.AddMenuItem(labels.Settings, "")
	settingsItem.Click(func() { c.Navigate(PageSettings) })
	systray.AddSeparator()
	countItem := systray.AddMenuItem(SessionCountLabel(0), "")
	countItem.Disable()
	c.SetLabelUpdater(func(s string) {
		invokeMenu(func() {
			countItem.SetTitle(s)
		})
	})
	systray.AddSeparator()
	quitItem := systray.AddMenuItem(labels.Quit, "")
	quitItem.Click(func() {
		systray.Quit()
		c.Quit()
	})
	c.bindLabels(func(l MenuLabels) {
		invokeMenu(func() {
			openItem.SetTitle(l.Open)
			hideItem.SetTitle(l.Hide)
			chatItem.SetTitle(l.Chat)
			tunnelItem.SetTitle(l.Tunnel)
			settingsItem.SetTitle(l.Settings)
			quitItem.SetTitle(l.Quit)
		})
	})
	c.Refresh()
}
