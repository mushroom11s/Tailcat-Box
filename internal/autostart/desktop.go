package autostart

import (
	"fmt"
	"strings"
)

// DesktopEntry returns an XDG autostart .desktop file that starts exe at login.
func DesktopEntry(exe string) []byte {
	// Desktop Entry spec: quote the path, and escape " ` $ \ inside quotes.
	r := strings.NewReplacer(`\`, `\\\\`, `"`, `\\"`, "`", "\\\\`", `$`, `\\$`)
	return []byte(fmt.Sprintf(`[Desktop Entry]
Type=Application
Name=%s
Exec="%s"
Icon=tailcat-box
Terminal=false
X-GNOME-Autostart-enabled=true
`, appName, r.Replace(exe)))
}
