package derpscan

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

// Engine is one internet-search service that can list derper hosts.
type Engine interface {
	Name() string
	// ByCountry reports whether Search can filter by country. Engines that
	// cannot are queried once and only use country to order their hits.
	ByCountry() bool
	Search(ctx context.Context, country string) ([]Asset, error)
}

// Quoter reports a short remaining-quota label for one API key.
type Quoter interface {
	Quota(ctx context.Context) (string, error)
}

// Engine names double as settings keys.
const (
	EngineFOFA    = "fofa"
	EngineZoomEye = "zoomeye"
	EngineHunter  = "hunter"
	EngineQuake   = "quake"
)

// EngineNames is the order engines are queried and shown in.
var EngineNames = []string{EngineFOFA, EngineZoomEye, EngineHunter, EngineQuake}

// EngineTitle is the display name for an engine id.
func EngineTitle(id string) string {
	switch id {
	case EngineFOFA:
		return "FOFA"
	case EngineZoomEye:
		return "ZoomEye"
	case EngineHunter:
		return "Hunter"
	case EngineQuake:
		return "Quake"
	default:
		return id
	}
}

// MaskKey hides most of an API key for the UI.
func MaskKey(key string) string {
	key = strings.TrimSpace(key)
	if key == "" {
		return ""
	}
	if len(key) <= 4 {
		return "••••"
	}
	return "••••" + key[len(key)-4:]
}

// NewEngines builds one rotating engine per platform that has keys.
func NewEngines(keys map[string][]string) []Engine {
	hc := &http.Client{Timeout: 20 * time.Second}
	var out []Engine
	for _, name := range EngineNames {
		list := uniqueTrimmed(keys[name])
		if len(list) == 0 {
			continue
		}
		out = append(out, keyRing{id: name, keys: list, http: hc})
	}
	return out
}

// keyRing tries each API key in order and stops at the first that returns hits.
type keyRing struct {
	id   string
	keys []string
	http *http.Client
}

func (r keyRing) Name() string { return EngineTitle(r.id) }
func (r keyRing) ByCountry() bool {
	switch r.id {
	case EngineFOFA, EngineZoomEye:
		return true
	default:
		return false
	}
}

func (r keyRing) Search(ctx context.Context, country string) ([]Asset, error) {
	var lastErr error
	for i, key := range r.keys {
		if i > 0 && EnginePause > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(EnginePause):
			}
		}
		assets, err := r.one(key).Search(ctx, country)
		if err != nil {
			lastErr = err
			continue
		}
		if len(assets) > 0 {
			return assets, nil
		}
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, nil
}

func (r keyRing) one(key string) Engine {
	switch r.id {
	case EngineFOFA:
		return FOFA{Key: key, HTTP: r.http}
	case EngineZoomEye:
		return ZoomEye{Key: key, HTTP: r.http}
	case EngineHunter:
		return Hunter{Key: key, HTTP: r.http}
	case EngineQuake:
		return Quake{Key: key, HTTP: r.http}
	default:
		return FOFA{Key: key, HTTP: r.http}
	}
}

func uniqueTrimmed(in []string) []string {
	var out []string
	seen := map[string]bool{}
	for _, k := range in {
		k = strings.TrimSpace(k)
		if k == "" || seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, k)
	}
	return out
}

func (FOFA) Name() string    { return "FOFA" }
func (FOFA) ByCountry() bool { return true }

// Quota reports remaining FOFA API allowance.
func (f FOFA) Quota(ctx context.Context) (string, error) {
	endpoint := f.Endpoint
	if endpoint == "" {
		endpoint = "https://fofa.info/api/v1/info/my"
	}
	u, err := url.Parse(endpoint)
	if err != nil {
		return "", err
	}
	q := u.Query()
	q.Set("key", f.Key)
	u.RawQuery = q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return "", err
	}
	raw, err := doJSON(f.HTTP, req)
	if err != nil {
		return "", err
	}
	var out struct {
		Error           bool   `json:"error"`
		Errmsg          string `json:"errmsg"`
		FOFAPoint       int64  `json:"fofa_point"`
		RemainFreePoint int64  `json:"remain_free_point"`
		RemainAPIQuery  int64  `json:"remain_api_query"`
		RemainAPIData   int64  `json:"remain_api_data"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	if out.Error {
		return "", errors.New(strings.TrimSpace(out.Errmsg))
	}
	return fmt.Sprintf("查询 %d · 条数 %d · F点 %d", out.RemainAPIQuery, out.RemainAPIData, out.FOFAPoint+out.RemainFreePoint), nil
}

// ZoomEye searches api.zoomeye.ai. Free accounts get a small monthly quota.
type ZoomEye struct {
	Endpoint string
	Key      string
	HTTP     *http.Client
}

func (ZoomEye) Name() string    { return "ZoomEye" }
func (ZoomEye) ByCountry() bool { return true }

func (z ZoomEye) Search(ctx context.Context, country string) ([]Asset, error) {
	q := `http.body="Tailscale" && http.body="DERP server"`
	if c := strings.ToUpper(strings.TrimSpace(country)); c != "" {
		q += fmt.Sprintf(` && country="%s"`, c)
	}
	body, _ := json.Marshal(map[string]any{
		"qbase64":  base64.StdEncoding.EncodeToString([]byte(q)),
		"fields":   "ip,port,domain,city.name",
		"sub_type": "web",
		"page":     1,
		"pagesize": MaxRegions,
	})
	endpoint := z.Endpoint
	if endpoint == "" {
		endpoint = "https://api.zoomeye.ai/v2/search"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("API-KEY", z.Key)
	req.Header.Set("Content-Type", "application/json")
	raw, err := doJSON(z.HTTP, req)
	if err != nil {
		return nil, err
	}
	var out struct {
		Code    any    `json:"code"`
		Message string `json:"message"`
		Data    []struct {
			IP     string `json:"ip"`
			Port   any    `json:"port"`
			Domain string `json:"domain"`
			City   string `json:"city.name"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	if fmt.Sprint(out.Code) != "60000" {
		return nil, apiError(out.Code, out.Message)
	}
	var assets []Asset
	for _, d := range out.Data {
		assets = append(assets, Asset{IP: d.IP, Port: numText(d.Port), Domain: d.Domain, City: d.City})
	}
	return assets, nil
}

func (z ZoomEye) Quota(ctx context.Context) (string, error) {
	endpoint := z.Endpoint
	if endpoint == "" {
		endpoint = "https://api.zoomeye.ai/v2/userinfo"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader([]byte("{}")))
	if err != nil {
		return "", err
	}
	req.Header.Set("API-KEY", z.Key)
	req.Header.Set("Content-Type", "application/json")
	raw, err := doJSON(z.HTTP, req)
	if err != nil {
		return "", err
	}
	var out struct {
		Code    any    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			Subscription struct {
				Plan          string `json:"plan"`
				Points        any    `json:"points"`
				ZoomEyePoints any    `json:"zoomeye_points"`
			} `json:"subscription"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	pts := numText(out.Data.Subscription.Points)
	if pts == "" {
		pts = numText(out.Data.Subscription.ZoomEyePoints)
	}
	if pts == "" {
		if out.Code != nil && fmt.Sprint(out.Code) != "60000" {
			return "", apiError(out.Code, out.Message)
		}
		return "", errors.New("no quota info")
	}
	plan := strings.TrimSpace(out.Data.Subscription.Plan)
	if plan != "" {
		return fmt.Sprintf("%s · 积分 %s", plan, pts), nil
	}
	return "积分 " + pts, nil
}

// Hunter searches hunter.qianxin.com (鹰图). Registered users get daily free points.
type Hunter struct {
	Endpoint string
	Key      string
	HTTP     *http.Client
}

func (Hunter) Name() string    { return "Hunter" }
func (Hunter) ByCountry() bool { return false }

func (h Hunter) Search(ctx context.Context, _ string) ([]Asset, error) {
	endpoint := h.Endpoint
	if endpoint == "" {
		endpoint = "https://hunter.qianxin.com/openApi/search"
	}
	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("api-key", h.Key)
	q.Set("search", base64.URLEncoding.EncodeToString([]byte(`web.body="Tailscale"&&web.body="DERP server"`)))
	q.Set("page", "1")
	q.Set("page_size", "100")
	q.Set("is_web", "1")
	u.RawQuery = q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	raw, err := doJSON(h.HTTP, req)
	if err != nil {
		return nil, err
	}
	var out struct {
		Code    any    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			Arr []struct {
				IP     string `json:"ip"`
				Port   any    `json:"port"`
				Domain string `json:"domain"`
				City   string `json:"city"`
			} `json:"arr"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	if fmt.Sprint(out.Code) != "200" {
		return nil, apiError(out.Code, out.Message)
	}
	var assets []Asset
	for _, d := range out.Data.Arr {
		assets = append(assets, Asset{IP: d.IP, Port: numText(d.Port), Domain: d.Domain, City: d.City})
	}
	return assets, nil
}

func (h Hunter) Quota(ctx context.Context) (string, error) {
	endpoint := h.Endpoint
	if endpoint == "" {
		endpoint = "https://hunter.qianxin.com/openApi/userInfo"
	}
	u, err := url.Parse(endpoint)
	if err != nil {
		return "", err
	}
	q := u.Query()
	q.Set("api-key", h.Key)
	u.RawQuery = q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return "", err
	}
	raw, err := doJSON(h.HTTP, req)
	if err != nil {
		return "", err
	}
	var out struct {
		Code    any    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			RestFreePoint   int64 `json:"rest_free_point"`
			RestEquityPoint int64 `json:"rest_equity_point"`
			DayFreePoint    int64 `json:"day_free_point"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	if fmt.Sprint(out.Code) != "200" {
		return "", apiError(out.Code, out.Message)
	}
	return fmt.Sprintf("今日免费 %d · 权益 %d", out.Data.RestFreePoint, out.Data.RestEquityPoint), nil
}

// Quake searches quake.360.net. Registered users get monthly free points.
type Quake struct {
	Endpoint string
	Key      string
	HTTP     *http.Client
}

func (Quake) Name() string    { return "Quake" }
func (Quake) ByCountry() bool { return false }

func (k Quake) Search(ctx context.Context, country string) ([]Asset, error) {
	endpoint := k.Endpoint
	if endpoint == "" {
		endpoint = "https://quake.360.net/api/v3/search/quake_service"
	}
	body, _ := json.Marshal(map[string]any{
		"query":  `response:"Tailscale" AND response:"DERP server"`,
		"start":  0,
		"size":   MaxRegions,
		"latest": true,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-QuakeToken", k.Key)
	req.Header.Set("Content-Type", "application/json")
	raw, err := doJSON(k.HTTP, req)
	if err != nil {
		return nil, err
	}
	var out struct {
		Code    any    `json:"code"`
		Message string `json:"message"`
		Data    []struct {
			IP       string `json:"ip"`
			Port     any    `json:"port"`
			Hostname string `json:"hostname"`
			Service  struct {
				HTTP struct {
					Host string `json:"host"`
				} `json:"http"`
			} `json:"service"`
			Location struct {
				City        string `json:"city_en"`
				CountryCode string `json:"country_code"`
			} `json:"location"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	if fmt.Sprint(out.Code) != "0" {
		return nil, apiError(out.Code, out.Message)
	}
	type hit struct {
		a    Asset
		home bool
	}
	var hits []hit
	for _, d := range out.Data {
		domain := d.Service.HTTP.Host
		if domain == "" || domain == d.IP {
			domain = d.Hostname
		}
		if strings.Contains(domain, ":") {
			domain = ""
		}
		hits = append(hits, hit{
			a:    Asset{IP: d.IP, Port: numText(d.Port), Domain: domain, City: d.Location.City},
			home: country != "" && strings.EqualFold(d.Location.CountryCode, country),
		})
	}
	sort.SliceStable(hits, func(i, j int) bool { return hits[i].home && !hits[j].home })
	assets := make([]Asset, len(hits))
	for i, h := range hits {
		assets[i] = h.a
	}
	return assets, nil
}

func (k Quake) Quota(ctx context.Context) (string, error) {
	endpoint := k.Endpoint
	if endpoint == "" {
		endpoint = "https://quake.360.net/api/v3/user/info"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("X-QuakeToken", k.Key)
	raw, err := doJSON(k.HTTP, req)
	if err != nil {
		return "", err
	}
	var out struct {
		Code    any    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			Credit      any `json:"credit"`
			Persistent  any `json:"persistent_credit"`
			MonthCredit any `json:"month_remaining_credit"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	if c := fmt.Sprint(out.Code); c != "0" && c != "<nil>" {
		return "", apiError(out.Code, out.Message)
	}
	credit := numText(out.Data.MonthCredit)
	if credit == "" {
		credit = numText(out.Data.Credit)
	}
	if credit == "" {
		credit = numText(out.Data.Persistent)
	}
	if credit == "" {
		return "", errors.New("no quota info")
	}
	return "积分 " + credit, nil
}

// FetchQuota returns a short quota label for one engine key.
func FetchQuota(ctx context.Context, engine, key string) (string, error) {
	hc := &http.Client{Timeout: 15 * time.Second}
	key = strings.TrimSpace(key)
	if key == "" {
		return "", ErrNoKey
	}
	var q Quoter
	switch engine {
	case EngineFOFA:
		q = FOFA{Key: key, HTTP: hc}
	case EngineZoomEye:
		q = ZoomEye{Key: key, HTTP: hc}
	case EngineHunter:
		q = Hunter{Key: key, HTTP: hc}
	case EngineQuake:
		q = Quake{Key: key, HTTP: hc}
	default:
		return "", fmt.Errorf("unknown search engine %q", engine)
	}
	return q.Quota(ctx)
}

func doJSON(hc *http.Client, req *http.Request) ([]byte, error) {
	if hc == nil {
		hc = http.DefaultClient
	}
	res, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return nil, errors.New("key rejected")
	}
	if res.StatusCode == http.StatusPaymentRequired {
		return nil, errors.New("quota used up")
	}
	if res.StatusCode != http.StatusOK && len(raw) == 0 {
		return nil, errors.New(res.Status)
	}
	return raw, nil
}

func apiError(code any, msg string) error {
	msg = strings.TrimSpace(msg)
	if msg == "" {
		return fmt.Errorf("error %v", code)
	}
	return fmt.Errorf("[%v] %s", code, msg)
}

func numText(v any) string {
	switch n := v.(type) {
	case float64:
		return fmt.Sprintf("%d", int(n))
	case json.Number:
		return n.String()
	case string:
		return strings.TrimSpace(n)
	case nil:
		return ""
	default:
		return strings.TrimSpace(fmt.Sprint(n))
	}
}
