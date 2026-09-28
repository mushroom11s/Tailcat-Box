package update

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// RevealArgs is the OS command that shows a file in the file manager (select/reveal).
// On Windows, Reveal runs the equivalent via SysProcAttr.CmdLine so Explorer sees the
// quotes literally — Go's EscapeArg would otherwise corrupt /select and open the parent.
func RevealArgs(goos, path string) (string, []string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", nil, errors.New("empty path")
	}
	switch goos {
	case "darwin":
		return "open", []string{"-R", path}, nil
	case "windows":
		return "explorer", []string{`/select,"` + path + `"`}, nil
	default:
		return "xdg-open", []string{filepath.Dir(path)}, nil
	}
}

// OpenDirArgs is the OS command that opens a folder in the file manager.
func OpenDirArgs(goos, path string) (string, []string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", nil, errors.New("empty path")
	}
	switch goos {
	case "darwin":
		return "open", []string{path}, nil
	case "windows":
		return "explorer", []string{path}, nil
	default:
		return "xdg-open", []string{path}, nil
	}
}

// Reveal shows path in Finder or Explorer: select/reveal a file, or open a folder.
func Reveal(path string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return errors.New("empty path")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		abs = filepath.Clean(path)
	}
	info, err := os.Stat(abs)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return openDir(abs)
	}
	return revealFile(abs)
}
