package update

import (
	"path/filepath"
	"testing"
)

func TestRevealArgs(t *testing.T) {
	t.Parallel()
	path := filepath.Join("Downloads", "tailcat-box-macos-arm64-v0.1.0.zip")
	name, args, err := RevealArgs("darwin", path)
	if err != nil {
		t.Fatal(err)
	}
	if name != "open" || len(args) != 2 || args[0] != "-R" || args[1] != path {
		t.Fatalf("darwin reveal = %s %v", name, args)
	}
	win := filepath.Join("Downloads", "tailcat-box-windows-amd64-v0.1.0.zip")
	name, args, err = RevealArgs("windows", win)
	if err != nil {
		t.Fatal(err)
	}
	wantWin := `/select,"` + win + `"`
	if name != "explorer" || len(args) != 1 || args[0] != wantWin {
		t.Fatalf("windows reveal = %s %v", name, args)
	}
	name, args, err = RevealArgs("linux", path)
	if err != nil {
		t.Fatal(err)
	}
	if name != "xdg-open" || len(args) != 1 || args[0] != filepath.Dir(path) {
		t.Fatalf("linux reveal = %s %v", name, args)
	}
	if _, _, err := RevealArgs("darwin", "  "); err == nil {
		t.Fatal("expected empty path to fail")
	}
}

func TestOpenDirArgs(t *testing.T) {
	t.Parallel()
	dir := filepath.Join("Downloads", "inbox")
	name, args, err := OpenDirArgs("darwin", dir)
	if err != nil {
		t.Fatal(err)
	}
	if name != "open" || len(args) != 1 || args[0] != dir {
		t.Fatalf("darwin open dir = %s %v", name, args)
	}
	name, args, err = OpenDirArgs("windows", dir)
	if err != nil {
		t.Fatal(err)
	}
	if name != "explorer" || len(args) != 1 || args[0] != dir {
		t.Fatalf("windows open dir = %s %v", name, args)
	}
	name, args, err = OpenDirArgs("linux", dir)
	if err != nil {
		t.Fatal(err)
	}
	if name != "xdg-open" || len(args) != 1 || args[0] != dir {
		t.Fatalf("linux open dir = %s %v", name, args)
	}
	if _, _, err := OpenDirArgs("darwin", "  "); err == nil {
		t.Fatal("expected empty path to fail")
	}
}

func TestRevealMissingPath(t *testing.T) {
	t.Parallel()
	missing := filepath.Join(t.TempDir(), "no-such-file.zip")
	if err := Reveal(missing); err == nil {
		t.Fatal("expected missing path to fail")
	}
}

func TestRevealEmptyPath(t *testing.T) {
	t.Parallel()
	if err := Reveal("  "); err == nil {
		t.Fatal("expected empty path to fail")
	}
}
