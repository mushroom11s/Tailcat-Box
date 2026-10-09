//go:build !(windows || darwin || linux)

package tray

func (c *Controller) Start(icon []byte) {
	_ = icon
}
