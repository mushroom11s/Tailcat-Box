package remote

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSavedKeySurvivesRestartUntilEnded(t *testing.T) {
	dir := t.TempDir()
	key, token, saved := (SavedKey{}).NextHost(false, "temp-key", "temp-token")
	if key != "temp-key" || token != "temp-token" {
		t.Fatalf("temp key = %s %s", key, token)
	}
	if err := SaveKey(dir, saved); err != nil {
		t.Fatal(err)
	}
	loaded, ok := LoadKey(dir)
	if !ok {
		t.Fatal("missing key file")
	}
	gotKey, gotToken, forever, resume := loaded.Resume()
	if !resume || forever || gotKey != "temp-key" || gotToken != "temp-token" {
		t.Fatalf("resume = %s %s forever=%v ok=%v", gotKey, gotToken, forever, resume)
	}
	ended, drop := loaded.AfterEnd()
	if !drop || ended.Key != "" {
		t.Fatalf("temp end = %#v drop=%v", ended, drop)
	}
}

func TestPermanentKeyReturnsAfterEnd(t *testing.T) {
	dir := t.TempDir()
	key, token, saved := (SavedKey{}).NextHost(true, "perm-key", "perm-token")
	if key != "perm-key" || token != "perm-token" {
		t.Fatalf("permanent key = %s %s", key, token)
	}
	if err := SaveKey(dir, saved); err != nil {
		t.Fatal(err)
	}
	loaded, ok := LoadKey(dir)
	if !ok {
		t.Fatal("missing key file")
	}
	ended, drop := loaded.AfterEnd()
	if drop {
		t.Fatal("ending a permanent key should keep it")
	}
	if _, _, _, resume := ended.Resume(); resume {
		t.Fatal("an ended permanent key should not listen on the next launch")
	}
	again, againToken, next := ended.NextHost(true, "other", "other-token")
	if again != "perm-key" || againToken != "perm-token" {
		t.Fatalf("reused = %s %s", again, againToken)
	}
	if next.SessionKey != "perm-key" {
		t.Fatalf("session = %s", next.SessionKey)
	}
	body, err := os.ReadFile(filepath.Join(dir, "remote-key.json"))
	if err != nil || len(body) == 0 {
		t.Fatal(err)
	}
}

func TestOldPermanentFileResumes(t *testing.T) {
	dir := t.TempDir()
	body := []byte("{\"v\":1,\"key\":\"old-key\",\"token\":\"old-token\"}\n")
	if err := os.WriteFile(filepath.Join(dir, "remote-key.json"), body, 0o600); err != nil {
		t.Fatal(err)
	}
	loaded, ok := LoadKey(dir)
	if !ok {
		t.Fatal("missing key file")
	}
	key, token, forever, resume := loaded.Resume()
	if !resume || !forever || key != "old-key" || token != "old-token" {
		t.Fatalf("resume = %s %s forever=%v ok=%v", key, token, forever, resume)
	}
}
