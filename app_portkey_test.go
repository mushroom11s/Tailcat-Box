package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/mushroom11s/tailcat-box/internal/adapter"
	"github.com/mushroom11s/tailcat-box/internal/session"
	"github.com/tailscale/tailcat"
)

// A fixed-key port serve must show the same tc… address after a restart, even
// when the DERP map can't be fetched yet (as right after a reboot). The address
// embeds the DERP region, so the region must come from the saved key.
func TestFixedKeyPortServeAddressStableAcrossRestart(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("TAILCAT_ADAPTER", "")
	t.Setenv("TAILCAT_KEYS_DIR", dir+"/keys")
	t.Setenv("TAILCAT_SETTINGS_DIR", dir+"/settings")
	t.Setenv("TAILCAT_CHAT_DIR", dir+"/chat")
	t.Setenv("TAILCAT_MIAO_DIR", dir+"/miao")

	derpMap := `{"Regions":{
	 "301":{"RegionID":301,"RegionCode":"nyc","RegionName":"New York City","Nodes":[{"Name":"301a","RegionID":301,"HostName":"tc301a.invalid","IPv4":"127.0.0.1","DERPPort":1}]},
	 "302":{"RegionID":302,"RegionCode":"fra","RegionName":"Frankfurt","Nodes":[{"Name":"302a","RegionID":302,"HostName":"tc302a.invalid","IPv4":"127.0.0.1","DERPPort":1}]}}}`
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/down.json" {
			http.Error(w, "network not ready", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(derpMap))
	}))
	defer ts.Close()

	start := func(a *App) string {
		t.Helper()
		sess, err := a.StartPortServe([]adapter.PortMapping{{LocalPort: 18080}}, "fixed")
		if err != nil {
			t.Fatal(err)
		}
		deadline := time.After(20 * time.Second)
		for {
			for _, item := range a.ListSessions() {
				if item.ID != sess.ID {
					continue
				}
				if item.Status == session.StatusRunning && item.Address != "" {
					_ = a.StopSession(sess.ID)
					return item.Address
				}
				if item.Err != "" {
					t.Fatalf("serve failed: %s", item.Err)
				}
			}
			select {
			case <-deadline:
				t.Fatalf("serve never ready: %+v", a.ListSessions())
			case <-time.After(20 * time.Millisecond):
			}
		}
	}
	regionCode := func(a *App) string {
		raw, err := a.keys.ReadRaw("fixed")
		if err != nil {
			t.Fatal(err)
		}
		material, err := roomKeyMaterial(raw)
		if err != nil {
			t.Fatal(err)
		}
		var pk tailcat.PrivateKey
		if err := json.Unmarshal([]byte(material), &pk); err != nil || len(pk.Public.Region) == 0 {
			t.Fatalf("no region saved with key: %s", raw)
		}
		return pk.Public.Region[0].RegionCode
	}

	a1 := NewApp()
	if err := a1.SetNetworkSettings("nyc", ts.URL+"/derpmap.json"); err != nil {
		t.Fatal(err)
	}
	if _, err := a1.CreateKey("fixed", false, ""); err != nil {
		t.Fatal(err)
	}
	addr1 := start(a1)
	if got := regionCode(a1); got != "nyc" {
		t.Fatalf("pinned region=%q, want nyc", got)
	}

	// Reboot: fresh app reading key + settings from disk; DERP map not reachable yet.
	a2 := NewApp()
	if err := a2.SetNetworkSettings("nyc", ts.URL+"/down.json"); err != nil {
		t.Fatal(err)
	}
	if addr2 := start(a2); addr2 != addr1 {
		t.Fatalf("address changed across restart:\n before %s\n after  %s", addr1, addr2)
	}

	// Choosing another region moves the key to it (and pins that one).
	a3 := NewApp()
	if err := a3.SetNetworkSettings("fra", ts.URL+"/derpmap2.json"); err != nil {
		t.Fatal(err)
	}
	if addr3 := start(a3); addr3 == addr1 {
		t.Fatal("address should change when the region setting changes")
	}
	if got := regionCode(a3); got != "fra" {
		t.Fatalf("pinned region=%q, want fra", got)
	}
}
