package migrate

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBundleRoundTrip(t *testing.T) {
	settings := t.TempDir()
	keys := t.TempDir()
	settingsBody := []byte("{\n\t\"LaunchAtLogin\": true,\n\t\"Update\": {\n\t\t\"DownloadedPath\": \"C:\\\\Downloads\\\\setup.exe\",\n\t\t\"Status\": \"downloaded\"\n\t}\n}\n")
	if err := os.WriteFile(filepath.Join(settings, "settings.json"), settingsBody, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(settings, "remote-key.json"), []byte("{\"v\":1,\"key\":\"k\",\"token\":\"t\"}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(keys, "home.private.json"), []byte("{\"Name\":\"home\",\"Address\":\"tc:home\"}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(keys, "notes.txt"), []byte("skip"), 0o600); err != nil {
		t.Fatal(err)
	}

	got, err := Collect(settings, keys, map[string]string{
		"tailcat-nickname": "Mochi",
		"tailcat-theme":    "dark",
		"other":            "nope",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got.Files["keys/notes.txt"]; ok {
		t.Fatal("notes.txt should stay out of the bundle")
	}
	if _, ok := got.Files["keys/home.private.json"]; ok {
		t.Fatal("private keys should stay out of the bundle")
	}
	if strings.Contains(got.Files["settings.json"], "DownloadedPath") {
		t.Fatal("downloaded installer path should not travel")
	}
	if !strings.Contains(got.Files["settings.json"], "LaunchAtLogin") {
		t.Fatal("launch setting was dropped")
	}
	if got.Local["tailcat-nickname"] != "Mochi" || got.Local["other"] != "" {
		t.Fatalf("local = %#v", got.Local)
	}

	raw, err := Encode(got)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	destSettings := t.TempDir()
	destKeys := t.TempDir()
	if err := Apply(destSettings, destKeys, parsed); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(destKeys, "home.private.json")); !os.IsNotExist(err) {
		t.Fatalf("private key was imported: %v", err)
	}
	if _, err := os.Stat(filepath.Join(destSettings, "remote-key.json")); !os.IsNotExist(err) {
		t.Fatalf("remote key was imported: %v", err)
	}
}

func TestSelectKeepsChosenPieces(t *testing.T) {
	full := Bundle{
		V:    Version,
		Kind: Kind,
		Files: map[string]string{
			"settings.json":          "{}",
			"ssh.json":               "{}",
			"remote-key.json":        "{}",
			"keys/settings.json":     "{}",
			"keys/home.private.json": "{}",
		},
		Local: map[string]string{
			"tailcat-nickname":      "Mochi",
			"tailcat-port-mappings": "[]",
			"tailcat-theme":         "dark",
		},
	}
	got := Select(full, []string{"keys", "profile"})
	if _, ok := got.Files["keys/home.private.json"]; ok {
		t.Fatal("private key should not export")
	}
	if len(got.Files) != 0 {
		t.Fatalf("files = %#v", got.Files)
	}
	if got.Local["tailcat-nickname"] != "Mochi" || len(got.Local) != 1 {
		t.Fatalf("local = %#v", got.Local)
	}
	if kept := Select(full, nil); len(kept.Files) != len(full.Files) {
		t.Fatal("empty selection should keep the bundle")
	}
}

func TestApplyRejectsEscape(t *testing.T) {
	b := Bundle{
		V:    Version,
		Kind: Kind,
		Files: map[string]string{
			"keys/../../outside.json": "{\"ok\":true}",
		},
	}
	if err := Apply(t.TempDir(), t.TempDir(), b); err != ErrBadPath {
		t.Fatalf("err = %v", err)
	}
	if _, err := Parse([]byte(`{"v":2,"kind":"tailcat-box-config"}`)); err != ErrNotConfig {
		t.Fatalf("parse err = %v", err)
	}
}
