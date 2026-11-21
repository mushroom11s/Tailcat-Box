package derpscan

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"tailscale.com/tailcfg"
)

func TestFOFASearchSendsScannerQuery(t *testing.T) {
	var gotQuery, gotKey string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := base64.StdEncoding.DecodeString(r.URL.Query().Get("qbase64"))
		gotQuery = string(raw)
		gotKey = r.URL.Query().Get("key")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": false,
			"results": [][]any{
				{"1.2.3.4", "443", "", "Shanghai"},
				{"1.2.3.4", "443", "", "Shanghai"},
				{"5.6.7.8", "8443", "derp.example.cn", "Beijing"},
				{"", "443", "", ""},
			},
		})
	}))
	defer ts.Close()

	assets, err := FOFA{Endpoint: ts.URL, Key: "k"}.Search(context.Background(), "cn")
	if err != nil {
		t.Fatal(err)
	}
	if gotKey != "k" {
		t.Fatalf("key = %q", gotKey)
	}
	if gotQuery != `body="Tailscale" && body="DERP server" && country="CN"` {
		t.Fatalf("query = %q", gotQuery)
	}
	if len(assets) != 2 || assets[1].Domain != "derp.example.cn" {
		t.Fatalf("assets = %+v", assets)
	}
}

func TestFOFASearchReportsAPIError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"error":true,"errmsg":"[-700] 账号无效"}`))
	}))
	defer ts.Close()
	if _, err := (FOFA{Endpoint: ts.URL, Key: "k"}).Search(context.Background(), "CN"); err == nil || !strings.Contains(err.Error(), "账号无效") {
		t.Fatalf("err = %v", err)
	}
	if _, err := (FOFA{Endpoint: ts.URL}).Search(context.Background(), "CN"); !errors.Is(err, ErrNoKey) {
		t.Fatalf("no key err = %v", err)
	}
}

func TestBuildMapAndKeepRegions(t *testing.T) {
	dm := BuildMap([]Asset{
		{IP: "1.2.3.4", Port: "443", City: "Shanghai"},
		{IP: "bad", Port: "x"},
		{IP: "5.6.7.8", Port: "8443", Domain: "derp.example.cn"},
	})
	if len(dm.Regions) != 2 {
		t.Fatalf("regions = %d", len(dm.Regions))
	}
	r := dm.Regions[900]
	if r.RegionCode != "custom900" || r.RegionName != "Shanghai" || r.Nodes[0].IPv4 != "1.2.3.4" || !r.Nodes[0].InsecureForTests {
		t.Fatalf("region 900 = %+v / %+v", r, r.Nodes[0])
	}
	if n := dm.Regions[901].Nodes[0]; n.HostName != "derp.example.cn" || n.IPv4 != "" || n.DERPPort != 8443 {
		t.Fatalf("region 901 node = %+v", n)
	}
	kept := KeepRegions(dm, map[int]bool{901: true, 5: true})
	if len(kept.Regions) != 1 || kept.Regions[901] == nil {
		t.Fatalf("kept = %+v", kept.Regions)
	}
}

func TestBetter(t *testing.T) {
	cases := []struct {
		cand, base int
		want       bool
	}{
		{40, -1, true},
		{40, 0, false},
		{40, 200, true},
		{150, 200, false},
		{10, 30, false},
		{0, 200, false},
	}
	for _, c := range cases {
		if got := Better(c.cand, c.base); got != c.want {
			t.Errorf("Better(%d,%d) = %v", c.cand, c.base, got)
		}
	}
}

type fakeNet struct {
	mu      sync.Mutex
	latency map[int]time.Duration // missing → probe fails
}

func (f *fakeNet) set(id int, d time.Duration) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if d == 0 {
		delete(f.latency, id)
		return
	}
	f.latency[id] = d
}

func (f *fakeNet) probe(_ context.Context, r *tailcfg.DERPRegion) (time.Duration, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	d, ok := f.latency[int(r.RegionID)]
	if !ok {
		return 0, errors.New("down")
	}
	return d, nil
}

type harness struct {
	m        *Manager
	net      *fakeNet
	mu       sync.Mutex
	cfg      Config
	country  string
	queries  []string
	switches []int
	reasons  []string
	suggests []Candidate
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	EnginePause = 0
	h := &harness{net: &fakeNet{latency: map[int]time.Duration{
		1:   200 * time.Millisecond, // official
		900: 60 * time.Millisecond,
		901: 40 * time.Millisecond,
	}}}
	h.cfg = Config{Keys: map[string][]string{EngineFOFA: {"k"}}, Auto: true}
	h.country = "CN"
	deps := Deps{
		Country: func(context.Context) (string, error) {
			h.mu.Lock()
			defer h.mu.Unlock()
			if h.country == "" {
				return "", errors.New("no lookup")
			}
			return h.country, nil
		},
		Engines: func(keys map[string][]string) []Engine {
			if len(keys[EngineFOFA]) == 0 {
				return nil
			}
			return []Engine{fakeEngine{name: "FOFA", byCountry: true, search: func(country string) ([]Asset, error) {
				h.mu.Lock()
				h.queries = append(h.queries, country)
				h.mu.Unlock()
				return []Asset{
					{IP: "1.1.1.1", Port: "443", City: "Hangzhou"},
					{IP: "2.2.2.2", Port: "443", City: "Shanghai"},
					{IP: "3.3.3.3", Port: "443", City: "Dead"},
				}, nil
			}}}
		},
		Probe: h.net.probe,
		Official: func(context.Context) (*tailcfg.DERPMap, error) {
			return &tailcfg.DERPMap{Regions: map[tailcfg.DERPRegionID]*tailcfg.DERPRegion{
				1: {RegionID: 1, Nodes: []*tailcfg.DERPNode{{Name: "1a", RegionID: 1}}},
			}}, nil
		},
	}
	h.m = New(t.TempDir(), deps, Hooks{
		Config: func() Config {
			h.mu.Lock()
			defer h.mu.Unlock()
			return h.cfg
		},
		Switch: func(id int, reason string) {
			h.mu.Lock()
			defer h.mu.Unlock()
			h.switches = append(h.switches, id)
			h.reasons = append(h.reasons, reason)
			if id == 0 {
				h.cfg.Mode, h.cfg.RegionID = "", 0
			} else {
				h.cfg.Mode, h.cfg.RegionID = ModeScan, id
			}
		},
		Suggest: func(c Candidate, _ int) {
			h.mu.Lock()
			defer h.mu.Unlock()
			h.suggests = append(h.suggests, c)
		},
	})
	t.Cleanup(h.m.Close)
	return h
}

func TestScanKeepsHealthyRelaysAndSuggestsFastest(t *testing.T) {
	h := newHarness(t)
	st, err := h.m.Scan(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if st.Country != "CN" || st.OfficialMS != 200 || st.Mode != ModeOfficial {
		t.Fatalf("status = %+v", st)
	}
	if len(st.Candidates) != 2 || st.Candidates[0].RegionID != 901 || st.Candidates[0].Name != "Shanghai" {
		t.Fatalf("candidates = %+v", st.Candidates)
	}
	if len(h.suggests) != 1 || h.suggests[0].RegionID != 901 {
		t.Fatalf("suggests = %+v", h.suggests)
	}

	h.m.Dismiss(901)
	if _, err := h.m.Scan(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(h.suggests) != 1 {
		t.Fatalf("dismissed relay suggested again: %+v", h.suggests)
	}
}

func TestLocalMapServesOnlyHealthyRegions(t *testing.T) {
	h := newHarness(t)
	if _, err := h.m.Scan(context.Background()); err != nil {
		t.Fatal(err)
	}
	u, err := h.m.URL()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(u, "http://127.0.0.1:") || !strings.Contains(u, "/derpmap.json?v=") {
		t.Fatalf("url = %s", u)
	}
	res, err := http.Get(u)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var dm tailcfg.DERPMap
	if err := json.NewDecoder(res.Body).Decode(&dm); err != nil {
		t.Fatal(err)
	}
	if len(dm.Regions) != 2 || dm.Regions[902] != nil || !dm.OmitDefaultRegions {
		t.Fatalf("served = %+v", dm.Regions)
	}
}

func TestDeadRelayFailsOverThenFallsBackToOfficial(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	if _, err := h.m.Scan(ctx); err != nil {
		t.Fatal(err)
	}
	h.cfg.Mode, h.cfg.RegionID = ModeScan, 901

	h.net.set(901, 0)
	h.m.Check(ctx, false)
	if len(h.switches) != 0 {
		t.Fatalf("switched after one miss: %v", h.switches)
	}
	h.m.Check(ctx, false)
	if len(h.switches) != 1 || h.switches[0] != 900 || h.reasons[0] != ReasonDown {
		t.Fatalf("switches = %v %v", h.switches, h.reasons)
	}

	h.net.set(900, 0)
	h.m.Check(ctx, false)
	h.m.Check(ctx, false)
	if len(h.switches) != 2 || h.switches[1] != 0 {
		t.Fatalf("expected fallback to official, got %v", h.switches)
	}
	if st := h.m.Status(); st.Mode != ModeOfficial || len(st.Candidates) != 0 {
		t.Fatalf("status = %+v", st)
	}
}

func TestOfficialOutageMovesToScannedRelay(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	if _, err := h.m.Scan(ctx); err != nil {
		t.Fatal(err)
	}
	h.net.set(1, 0)
	h.m.Check(ctx, true)
	if len(h.switches) != 0 {
		t.Fatalf("switched after one miss: %v", h.switches)
	}
	h.m.Check(ctx, true)
	if len(h.switches) != 1 || h.switches[0] != 901 || h.reasons[0] != ReasonOfficialDown {
		t.Fatalf("switches = %v %v", h.switches, h.reasons)
	}
}

func TestAutoScanRunsInAnyRegion(t *testing.T) {
	h := newHarness(t)
	h.country = "US"
	h.m.autoScan(context.Background())
	if got := strings.Join(h.queries, ","); got != "US" {
		t.Fatalf("queries = %q, want own country only once hits arrive", got)
	}
	st := h.m.Status()
	if st.Country != "US" || len(st.Candidates) != 2 {
		t.Fatalf("status = %+v", st)
	}
	if len(h.suggests) != 1 {
		t.Fatalf("suggests = %+v", h.suggests)
	}
}

func TestAutoScanSkipsWhileActiveRelayOK(t *testing.T) {
	h := newHarness(t)
	if _, err := h.m.Scan(context.Background()); err != nil {
		t.Fatal(err)
	}
	h.cfg.Mode, h.cfg.RegionID = ModeScan, 901
	before := len(h.queries)
	h.m.autoScan(context.Background())
	if len(h.queries) != before {
		t.Fatalf("auto-scan spent quota while active relay was fine: %v", h.queries[before:])
	}
}

func TestScanGoesWorldwideWhenRegionUnknown(t *testing.T) {
	h := newHarness(t)
	h.country = ""
	if _, err := h.m.Scan(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(h.queries, ","); got != "" || len(h.queries) != 1 {
		t.Fatalf("queries = %q", h.queries)
	}
	if st := h.m.Status(); len(st.Candidates) != 2 {
		t.Fatalf("candidates = %+v", st.Candidates)
	}
}

func TestCustomMapIsLeftAlone(t *testing.T) {
	h := newHarness(t)
	h.cfg.Custom = true
	if _, err := h.m.Scan(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(h.suggests) != 0 {
		t.Fatalf("suggested with a custom map: %+v", h.suggests)
	}
	if st := h.m.Status(); st.Mode != ModeCustom {
		t.Fatalf("mode = %s", st.Mode)
	}
}

func TestCacheSurvivesRestart(t *testing.T) {
	h := newHarness(t)
	if _, err := h.m.Scan(context.Background()); err != nil {
		t.Fatal(err)
	}
	again := New(h.m.dir, h.m.deps, Hooks{})
	if _, ok := again.Region(901); !ok {
		t.Fatal("scanned region lost after reload")
	}
}

func TestShareRoundTrip(t *testing.T) {
	m := New(t.TempDir(), Deps{}, Hooks{})
	m.mu.Lock()
	m.c.ScannedAt = time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	m.c.Map = BuildMap([]Asset{{IP: "1.2.3.4", Port: "443", City: "Shanghai"}})
	m.c.Candidates = []Candidate{{RegionID: 900, Name: "Shanghai", Host: "1.2.3.4", Port: 443, LatencyMS: 40}}
	m.mu.Unlock()

	body, err := m.ExportShare()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(body), "fofa") || !strings.Contains(string(body), `"kind": "tailcat-box-relays"`) {
		t.Fatalf("share = %s", body)
	}
	if _, err := m.ExportShare(); err != nil {
		t.Fatal(err)
	}

	other := New(t.TempDir(), Deps{}, Hooks{})
	if _, err := other.ExportShare(); err == nil {
		t.Fatal("export of an empty scan should fail")
	}
	if err := other.ImportShare(body); err != nil {
		t.Fatal(err)
	}
	st := other.Status()
	if len(st.Candidates) != 1 || st.Candidates[0].Host != "1.2.3.4" || FastestRegion(st) != 900 {
		t.Fatalf("imported = %+v", st.Candidates)
	}
	if _, ok := other.Region(900); !ok {
		t.Fatal("imported region missing")
	}
	if err := other.ImportShare([]byte(`{"v":1,"kind":"nope"}`)); err == nil {
		t.Fatal("bad share accepted")
	}
}
