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

	// energye/systray leaves statusItem.menu nil on Darwin. SetOnClick/
	// SetOnRClick call enable_on_click, which intercepts mouse events and
	// shows the menu only via show_menu: attach -> performClick -> setMenu:nil
	// immediately. That tear-down races AppKit menu tracking and errors when
	// opening the menu or choosing an item. Permanently attach with
	// CreateMenu instead (standard macOS menu-bar UX: click shows the menu).
	// Do not SetOnClick/SetOnRClick: those re-enable the broken path.

	labels := c.Labels()
	openItem := systray.AddMenuItem(labels.Open, "")
	openItem.Click(func() {
		invokeMenu(func() {
			c.Open()
		})
	})
	hideItem := systray.AddMenuItem(labels.Hide, "")
	hideItem.Click(func() {
		invokeMenu(func() {
			c.Hide()
		})
	})
	systray.AddSeparator()
	chatItem := systray.AddMenuItem(labels.Chat, "")
	chatItem.Click(func() {
		invokeMenu(func() {
			c.Navigate(PageChat)
		})
	})
	tunnelItem := systray.AddMenuItem(labels.Tunnel, "")
	tunnelItem.Click(func() {
		invokeMenu(func() {
			c.Navigate(PageTunnel)
		})
	})
	settingsItem := systray.AddMenuItem(labels.Settings, "")
	settingsItem.Click(func() {
		invokeMenu(func() {
			c.Navigate(PageSettings)
		})
	})
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
		invokeMenu(func() {
			c.Quit()
			systray.Quit()
		})
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
	systray.CreateMenu()
	c.Refresh()
}