//go:build linux

package linuxwebview

import (
	"os"
	"path/filepath"
	"testing"
)

func TestUseBundledWebKitAt(t *testing.T) {
	t.Setenv("WEBKIT_EXEC_PATH", "")
	t.Setenv("WEBKIT_INJECTED_BUNDLE_PATH", "")
	root := filepath.Join(t.TempDir(), BundledDir)
	if useBundledWebKitAt(root) {
		t.Fatal("no webkit folder should leave the system WebKitGTK in use")
	}
	if err := os.MkdirAll(filepath.Join(root, "libexec"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "libexec", "WebKitWebProcess"), nil, 0o755); err != nil {
		t.Fatal(err)
	}
	if !useBundledWebKitAt(root) {
		t.Fatal("bundled WebKitGTK not picked up")
	}
	if got := os.Getenv("WEBKIT_EXEC_PATH"); got != filepath.Join(root, "libexec") {
		t.Fatalf("WEBKIT_EXEC_PATH=%q", got)
	}
	if got := os.Getenv("WEBKIT_INJECTED_BUNDLE_PATH"); got != filepath.Join(root, "injected-bundle") {
		t.Fatalf("WEBKIT_INJECTED_BUNDLE_PATH=%q", got)
	}
}
