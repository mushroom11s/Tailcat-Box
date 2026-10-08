#!/bin/sh
# Installs Tailcat Box for the current user (no sudo):
#   ~/.local/bin/tailcat-box, a menu entry, and its icon.
# Run it again to update. ./install.sh --uninstall removes them.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
bin="$HOME/.local/bin"
data="${XDG_DATA_HOME:-$HOME/.local/share}"
apps="$data/applications"
icons="$data/icons"

if [ "${1:-}" = "--uninstall" ]; then
	rm -f "$bin/tailcat-box" "$apps/tailcat-box.desktop" "$icons/tailcat-box.png"
	echo "Removed Tailcat Box."
	exit 0
fi

mkdir -p "$bin" "$apps" "$icons"
install -m 0755 "$here/tailcat-box" "$bin/tailcat-box"
install -m 0644 "$here/tailcat-box.png" "$icons/tailcat-box.png"
# Absolute paths: ~/.local/bin is not on every desktop session's PATH.
sed -e "s|^Exec=.*|Exec=\"$bin/tailcat-box\"|" -e "s|^Icon=.*|Icon=$icons/tailcat-box.png|" \
	"$here/tailcat-box.desktop" > "$apps/tailcat-box.desktop"
chmod 0644 "$apps/tailcat-box.desktop"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$apps" >/dev/null 2>&1 || true
echo "Installed $bin/tailcat-box. Open Tailcat Box from the app menu."
