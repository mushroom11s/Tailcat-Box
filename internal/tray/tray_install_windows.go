//go:build windows

package tray

import (
	"github.com/energye/systray"
)

func (c *Controller) install(icon []byte) {
	c.bindIcon(icon, systray.SetIcon)
	c.bindProduct(func(title, tooltip string) {
		systray.SetTitle(title)
		systray.SetTooltip(tooltip)
	})
	systray.SetOnClick(func(systray.IMenu) {
		c.Scoop()
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
		countItem.SetTitle(s)
	})
	systray.AddSeparator()
	quitItem := systray.AddMenuItem(labels.Quit, "")
	quitItem.Click(func() {
		systray.Quit()
		c.Quit()
	})
	c.bindLabels(func(l MenuLabels) {
		openItem.SetTitle(l.Open)
		hideItem.SetTitle(l.Hide)
		chatItem.SetTitle(l.Chat)
		tunnelItem.SetTitle(l.Tunnel)
		settingsItem.SetTitle(l.Settings)
		quitItem.SetTitle(l.Quit)
	})
	c.Refresh()
}
