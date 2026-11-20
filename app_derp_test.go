package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDERPScanSettingsSurviveNetworkSave(t *testing.T) {
	t.Setenv("TAILCAT_ADAPTER", "fake")
	dir := t.TempDir()
	t.Setenv("TAILCAT_KEYS_DIR", dir)
	a := NewApp()

	st, err := a.AddDERPKey("fofa", "  fofa-key ")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.AddDERPKey("hunter", "hunter-key"); err != nil {
		t.Fatal(err)
	}
	if _, err := a.AddDERPKey("fofa", "fofa-key-2"); err != nil {
		t.Fatal(err)
	}
	if _, err := a.SetDERPAuto(false); err != nil {
		t.Fatal(err)
	}
	st = a.DERPStatus()
	if !st.HasKey || st.Auto || st.Mode != "official" || strings.Join(st.Engines, ",") != "fofa,hunter" {
		t.Fatalf("status = %+v", st)
	}
	if len(st.Keys) != 3 {
		t.Fatalf("keys = %+v", st.Keys)
	}
	if _, err := a.AddDERPKey("quake", "quake-key"); err != nil {
		t.Fatal(err)
	}
	if err := a.SetNetworkSettings("", ""); err != nil {
		t.Fatal(err)
	}
	s := a.loadNetSettings()
	if len(s.EngineKeys("fofa")) != 2 || s.EngineKeys("hunter")[0] != "hunter-key" || s.EngineKeys("quake")[0] != "quake-key" || !s.DERPAutoOff {
		t.Fatalf("scan settings lost: %+v", s)
	}
	body, err := os.ReadFile(filepath.Join(dir, "settings.json"))
	if err != nil {
		t.Fatal(err)
	}
	raw := string(body)
	if !strings.Contains(raw, `"derpKeys"`) || !strings.Contains(raw, "fofa-key-2") {
		t.Fatalf("settings.json missing multi keys:\n%s", raw)
	}

	again := NewApp()
	st = again.DERPStatus()
	if !st.HasKey || strings.Join(st.Engines, ",") != "fofa,hunter,quake" || st.Auto || len(st.Keys) != 4 {
		t.Fatalf("after restart status = %+v", st)
	}

	if st, err := a.RemoveDERPKey("fofa", 0); err != nil || len(st.Keys) != 3 {
		t.Fatalf("remove: %+v %v", st, err)
	}
	if _, err := a.AddDERPKey("shodan", "x"); err == nil {
		t.Fatal("expected unknown engine error")
	}

	if _, err := a.UseDERPRegion(901); err == nil {
		t.Fatal("expected an error for a relay that was never scanned")
	}
	if got := a.svc.NetworkOpts(); got.DERPMapURL != "" || got.Region != "" {
		t.Fatalf("net = %+v", got)
	}

	if err := a.SetNetworkSettings("nyc", "https://example.test/derpmap.json"); err != nil {
		t.Fatal(err)
	}
	if st := a.DERPStatus(); st.Mode != "custom" {
		t.Fatalf("typed map URL should win, mode = %s", st.Mode)
	}
}

func TestLegacySingleDERPKeyMigrates(t *testing.T) {
	t.Setenv("TAILCAT_ADAPTER", "fake")
	dir := t.TempDir()
	t.Setenv("TAILCAT_KEYS_DIR", dir)
	if err := os.WriteFile(filepath.Join(dir, "settings.json"), []byte(`{"region":"","derpMapUrl":"","quakeKey":"legacy-quake"}`+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	a := NewApp()
	st := a.DERPStatus()
	if strings.Join(st.Engines, ",") != "quake" || len(st.Keys) != 1 || st.Keys[0].Hint != "••••uake" {
		t.Fatalf("status = %+v", st)
	}
	s := a.loadNetSettings()
	if s.QuakeKey != "" || s.EngineKeys("quake")[0] != "legacy-quake" {
		t.Fatalf("migration incomplete: %+v", s)
	}
}
