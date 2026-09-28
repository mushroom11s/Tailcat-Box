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
		systray.SetTooltip(tooltip)
	})

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
			systray.Quit()
			c.Quit()
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
	c.Refresh()
}
