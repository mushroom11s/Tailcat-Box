#!/bin/sh
# Installs Tailcat Box for the current user (no sudo):
#   ~/.local/bin/tailcat-box, a menu entry, and its icon.
# The full package also has webkit/ (WebKitGTK with WebRTC for calls); that
# copy lives in ~/.local/lib/tailcat-box and ~/.local/bin links to it.
# Run it again to update. ./install.sh --uninstall removes them.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
bin="$HOME/.local/bin"
data="${XDG_DATA_HOME:-$HOME/.local/share}"
apps="$data/applications"
icons="$data/icons"
lib="$HOME/.local/lib/tailcat-box"

if [ "${1:-}" = "--uninstall" ]; then
	rm -f "$bin/tailcat-box" "$apps/tailcat-box.desktop" "$icons/tailcat-box.png"
	rm -rf "$lib"
	echo "Removed Tailcat Box."
	exit 0
fi

mkdir -p "$bin" "$apps" "$icons"
rm -rf "$lib"
rm -f "$bin/tailcat-box"
if [ -d "$here/webkit" ]; then
	mkdir -p "$lib"
	install -m 0755 "$here/tailcat-box" "$lib/tailcat-box"
	cp -RP "$here/webkit" "$lib/webkit"
	ln -s "$lib/tailcat-box" "$bin/tailcat-box"
	exe="$lib/tailcat-box"
else
	install -m 0755 "$here/tailcat-box" "$bin/tailcat-box"
	exe="$bin/tailcat-box"
fi
install -m 0644 "$here/tailcat-box.png" "$icons/tailcat-box.png"
# Absolute paths: ~/.local/bin is not on every desktop session's PATH.
sed -e "s|^Exec=.*|Exec=\"$exe\"|" -e "s|^Icon=.*|Icon=$icons/tailcat-box.png|" \
	"$here/tailcat-box.desktop" > "$apps/tailcat-box.desktop"
chmod 0644 "$apps/tailcat-box.desktop"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$apps" >/dev/null 2>&1 || true
echo "Installed $exe. Open Tailcat Box from the app menu."
