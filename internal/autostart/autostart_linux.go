//go:build linux

package autostart

import (
	"os"
	"path/filepath"
)

// Supported reports whether OS login-item registration is implemented.
func Supported() bool { return true }

// entryPath is the XDG autostart file. $XDG_CONFIG_HOME wins over ~/.config.
func entryPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "autostart", "tailcat-box.desktop"), nil
}

// Enabled reports whether the XDG autostart entry exists.
func Enabled() (bool, error) {
	path, err := entryPath()
	if err != nil {
		return false, err
	}
	_, err = os.Stat(path)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

// SetEnabled writes or removes the XDG autostart entry.
func SetEnabled(enabled bool) error {
	path, err := entryPath()
	if err != nil {
		return err
	}
	if !enabled {
		err := os.Remove(path)
		if err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, DesktopEntry(exe), 0o644)
}
