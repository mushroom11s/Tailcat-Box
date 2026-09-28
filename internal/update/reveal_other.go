//go:build !windows

package update

import (
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/pkg/browser"
)

func revealFile(path string) error {
	if runtime.GOOS == "darwin" {
		return exec.Command("open", "-R", path).Start()
	}
	return browser.OpenFile(filepath.Dir(path))
}

func openDir(path string) error {
	if runtime.GOOS == "darwin" {
		return exec.Command("open", path).Start()
	}
	return browser.OpenFile(path)
}
