package derpscan

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeEngine struct {
	name      string
	byCountry bool
	search    func(country string) ([]Asset, error)
}

func (f fakeEngine) Name() string    { return f.name }
func (f fakeEngine) ByCountry() bool { return f.byCountry }
func (f fakeEngine) Search(_ context.Context, country string) ([]Asset, error) {
	return f.search(country)
}

func TestZoomEyeSearch(t *testing.T) {
	var gotKey, gotQuery string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey = r.Header.Get("API-KEY")
		var body struct {
			Qbase64 string `json:"qbase64"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		raw, _ := base64.StdEncoding.DecodeString(body.Qbase64)
		gotQuery = string(raw)
		_, _ = w.Write([]byte(`{"code":60000,"message":"success","data":[
			{"ip":"1.2.3.4","port":443,"domain":"","city.name":"Tokyo"},
			{"ip":"5.6.7.8","port":8443,"domain":"derp.example.jp","city.name":"Osaka"}]}`))
	}))
	defer ts.Close()

	assets, err := ZoomEye{Endpoint: ts.URL, Key: "z"}.Search(context.Background(), "jp")
	if err != nil {
		t.Fatal(err)
	}
	if gotKey != "z" || gotQuery != `http.body="Tailscale" && http.body="DERP server" && country="JP"` {
		t.Fatalf("key=%q query=%q", gotKey, gotQuery)
	}
	if len(assets) != 2 || assets[1].Port != "8443" || assets[1].Domain != "derp.example.jp" || assets[0].City != "Tokyo" {
		t.Fatalf("assets = %+v", assets)
	}
}

func TestZoomEyeReportsAPIError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"code":60004,"message":"insufficient permissions"}`))
	}))
	defer ts.Close()
	_, err := ZoomEye{Endpoint: ts.URL, Key: "z"}.Search(context.Background(), "")
	if err == nil || !strings.Contains(err.Error(), "insufficient permissions") {
		t.Fatalf("err = %v", err)
	}
}

func TestHunterSearch(t *testing.T) {
	var gotKey, gotQuery string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey = r.URL.Query().Get("api-key")
		raw, _ := base64.URLEncoding.DecodeString(r.URL.Query().Get("search"))
		gotQuery = string(raw)
		_, _ = w.Write([]byte(`{"code":200,"message":"success","data":{"arr":[
			{"ip":"9.9.9.9","port":443,"domain":"derp.example.cn","city":"杭州"}]}}`))
	}))
	defer ts.Close()

	assets, err := Hunter{Endpoint: ts.URL, Key: "h"}.Search(context.Background(), "CN")
	if err != nil {
		t.Fatal(err)
	}
	if gotKey != "h" || gotQuery != `web.body="Tailscale"&&web.body="DERP server"` {
		t.Fatalf("key=%q query=%q", gotKey, gotQuery)
	}
	if len(assets) != 1 || assets[0].Port != "443" || assets[0].City != "杭州" {
		t.Fatalf("assets = %+v", assets)
	}
}

func TestHunterReportsNoPoints(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"code":40205,"message":"今日免费积分已用完"}`))
	}))
	defer ts.Close()
	_, err := Hunter{Endpoint: ts.URL, Key: "h"}.Search(context.Background(), "")
	if err == nil || !strings.Contains(err.Error(), "免费积分") {
		t.Fatalf("err = %v", err)
	}
}

func TestQuakeSearchPutsHomeCountryFirst(t *testing.T) {
	var gotKey, gotQuery string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey = r.Header.Get("X-QuakeToken")
		var body struct {
			Query string `json:"query"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		gotQuery = body.Query
		_, _ = w.Write([]byte(`{"code":0,"message":"Successful.","data":[
			{"ip":"7.7.7.7","port":443,"hostname":"","location":{"city_en":"Frankfurt","country_code":"DE"}},
			{"ip":"8.8.4.4","port":443,"hostname":"","service":{"http":{"host":"derp.example.cn"}},"location":{"city_en":"Shanghai","country_code":"CN"}}]}`))
	}))
	defer ts.Close()

	assets, err := Quake{Endpoint: ts.URL, Key: "q"}.Search(context.Background(), "CN")
	if err != nil {
		t.Fatal(err)
	}
	if gotKey != "q" || gotQuery != `response:"Tailscale" AND response:"DERP server"` {
		t.Fatalf("key=%q query=%q", gotKey, gotQuery)
	}
	if len(assets) != 2 || assets[0].IP != "8.8.4.4" || assets[0].Domain != "derp.example.cn" {
		t.Fatalf("assets = %+v", assets)
	}
}

func TestQuakeReportsNoPoints(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"code":"q2001","message":"积分不足"}`))
	}))
	defer ts.Close()
	_, err := Quake{Endpoint: ts.URL, Key: "q"}.Search(context.Background(), "")
	if err == nil || !strings.Contains(err.Error(), "积分不足") {
		t.Fatalf("err = %v", err)
	}
}

func TestNewEnginesSkipsEmptyKeys(t *testing.T) {
	es := NewEngines(map[string][]string{EngineFOFA: {" "}, EngineHunter: {"h"}, EngineQuake: {"q"}})
	var names []string
	for _, e := range es {
		names = append(names, e.Name())
	}
	if strings.Join(names, ",") != "Hunter,Quake" {
		t.Fatalf("engines = %v", names)
	}
}

func TestKeyRingTriesNextKeyOnFailure(t *testing.T) {
	var keys []string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := r.URL.Query().Get("key")
		keys = append(keys, key)
		if key == "bad" {
			_, _ = w.Write([]byte(`{"error":true,"errmsg":"no points"}`))
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error":   false,
			"results": [][]any{{"1.1.1.1", "443", "", "Hangzhou"}},
		})
	}))
	defer ts.Close()
	EnginePause = 0
	ring := keyRing{id: EngineFOFA, keys: []string{"bad", "good"}, http: http.DefaultClient}
	// Force both keys through the same test server by wrapping Search.
	assets, err := searchWithEndpoints(ring, ts.URL)
	if err != nil || len(assets) != 1 {
		t.Fatalf("assets=%v err=%v keys=%v", assets, err, keys)
	}
	if strings.Join(keys, ",") != "bad,good" {
		t.Fatalf("keys tried = %v", keys)
	}
}

func searchWithEndpoints(r keyRing, endpoint string) ([]Asset, error) {
	var lastErr error
	for _, key := range r.keys {
		assets, err := (FOFA{Endpoint: endpoint, Key: key, HTTP: r.http}).Search(context.Background(), "CN")
		if err != nil {
			lastErr = err
			continue
		}
		if len(assets) > 0 {
			return assets, nil
		}
	}
	return nil, lastErr
}

func TestScanStopsAtFirstSuccessfulEngine(t *testing.T) {
	h := newHarness(t)
	var calls []string
	h.m.deps.Engines = func(map[string][]string) []Engine {
		return []Engine{
			fakeEngine{name: "FOFA", byCountry: true, search: func(c string) ([]Asset, error) {
				calls = append(calls, "FOFA:"+c)
				return nil, errors.New("no F points")
			}},
			fakeEngine{name: "Hunter", search: func(c string) ([]Asset, error) {
				calls = append(calls, "Hunter:"+c)
				return []Asset{{IP: "1.1.1.1", Port: "443"}, {IP: "2.2.2.2", Port: "443"}}, nil
			}},
			fakeEngine{name: "Quake", search: func(string) ([]Asset, error) {
				calls = append(calls, "Quake")
				return []Asset{{IP: "9.9.9.9", Port: "443"}}, nil
			}},
		}
	}
	st, err := h.m.Scan(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	// FOFA: country fails → worldwide fails → Hunter succeeds → Quake not called.
	if strings.Join(calls, ",") != "FOFA:CN,FOFA:,Hunter:" {
		t.Fatalf("calls = %v", calls)
	}
	if len(st.Candidates) != 2 {
		t.Fatalf("candidates = %+v", st.Candidates)
	}
	if st.EngineErrors["FOFA"] != "no F points" || st.EngineErrors["Quake"] != "" {
		t.Fatalf("engine errors = %v", st.EngineErrors)
	}
}

func TestScanUsesRegionHitsWithoutWorldwide(t *testing.T) {
	h := newHarness(t)
	var calls []string
	h.m.deps.Engines = func(map[string][]string) []Engine {
		return []Engine{
			fakeEngine{name: "ZoomEye", byCountry: true, search: func(c string) ([]Asset, error) {
				calls = append(calls, "ZoomEye:"+c)
				if c == "" {
					t.Fatal("worldwide query should not run after a region hit")
				}
				return []Asset{{IP: "1.1.1.1", Port: "443"}}, nil
			}},
			fakeEngine{name: "Hunter", search: func(string) ([]Asset, error) {
				t.Fatal("next engine should not run after a hit")
				return nil, nil
			}},
		}
	}
	if _, err := h.m.Scan(context.Background()); err != nil {
		t.Fatal(err)
	}
	if strings.Join(calls, ",") != "ZoomEye:CN" {
		t.Fatalf("calls = %v", calls)
	}
}

func TestScanFailsWithEveryEngineError(t *testing.T) {
	h := newHarness(t)
	h.m.deps.Engines = func(map[string][]string) []Engine {
		return []Engine{
			fakeEngine{name: "ZoomEye", byCountry: true, search: func(string) ([]Asset, error) { return nil, errors.New("quota used up") }},
			fakeEngine{name: "Quake", search: func(string) ([]Asset, error) { return nil, errors.New("积分不足") }},
		}
	}
	_, err := h.m.Scan(context.Background())
	if err == nil || err.Error() != "ZoomEye: quota used up; Quake: 积分不足" {
		t.Fatalf("err = %v", err)
	}
}
