//go:build linux

package linuxwebview

import (
	"os"
	"path/filepath"
)

// BundledDir is where the full Linux package keeps its private WebKitGTK
// (built with WebRTC), next to the tailcat-box binary:
//
//	webkit/lib/             libwebkit2gtk-4.1.so.0, libjavascriptcoregtk-4.1.so.0
//	webkit/libexec/         WebKitWebProcess, WebKitNetworkProcess
//	webkit/injected-bundle/ libwebkit2gtkinjectedbundle.so
//
// The binary's RPATH already points at webkit/lib. WebKit still needs to be
// told where its helper processes and injected bundle live.
const BundledDir = "webkit"

var bundled bool

// Bundled reports whether UseBundledWebKit found the private WebKitGTK.
func Bundled() bool { return bundled }

// UseBundledWebKit points WebKitGTK at the private copy when one ships beside
// the binary. It must run before GTK starts. The small package has no webkit
// folder, so this does nothing there.
func UseBundledWebKit() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	if real, err := filepath.EvalSymlinks(exe); err == nil {
		exe = real
	}
	bundled = useBundledWebKitAt(filepath.Join(filepath.Dir(exe), BundledDir))
}

func useBundledWebKitAt(root string) bool {
	execDir := filepath.Join(root, "libexec")
	if _, err := os.Stat(filepath.Join(execDir, "WebKitWebProcess")); err != nil {
		return false
	}
	_ = os.Setenv("WEBKIT_EXEC_PATH", execDir)
	_ = os.Setenv("WEBKIT_INJECTED_BUNDLE_PATH", filepath.Join(root, "injected-bundle"))
	return true
}
