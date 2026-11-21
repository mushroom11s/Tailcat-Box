// Package derpscan finds public DERP relays near the user, checks which ones
// really relay packets, and serves the healthy ones as a local DERP map.
//
// The flow follows github.com/wlzh/fofa-derp-scanner: search FOFA for
// derper landing pages (FOFA, ZoomEye, Hunter or Quake), turn every hit into its own region (IDs 900–999),
// probe each region, and keep only the regions that passed.
package derpscan

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// FOFAEndpoint is FOFA's search API.
const FOFAEndpoint = "https://fofa.info/api/v1/search/all"

// ErrNoKey means a scan needs at least one search-engine key first.
var ErrNoKey = errors.New("search key required")

// Asset is one search hit: a host serving the derper landing page.
type Asset struct {
	IP     string `json:"ip"`
	Port   string `json:"port"`
	Domain string `json:"domain"`
	City   string `json:"city"`
}

// FOFAQuery is the scanner's search: a derper landing page, optionally
// limited to one country (ISO code such as "CN").
func FOFAQuery(country string) string {
	q := `body="Tailscale" && body="DERP server"`
	if c := strings.ToUpper(strings.TrimSpace(country)); c != "" {
		q += fmt.Sprintf(` && country="%s"`, c)
	}
	return q
}

// FOFA searches FOFA for derper hosts.
type FOFA struct {
	Endpoint string
	Key      string
	Size     int
	HTTP     *http.Client
}

// Search returns de-duplicated derper hosts in country.
func (f FOFA) Search(ctx context.Context, country string) ([]Asset, error) {
	key := strings.TrimSpace(f.Key)
	if key == "" {
		return nil, ErrNoKey
	}
	endpoint := f.Endpoint
	if endpoint == "" {
		endpoint = FOFAEndpoint
	}
	size := f.Size
	if size <= 0 || size > MaxRegions {
		size = MaxRegions
	}
	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("key", key)
	q.Set("qbase64", base64.StdEncoding.EncodeToString([]byte(FOFAQuery(country))))
	q.Set("fields", "ip,port,domain,city")
	q.Set("size", strconv.Itoa(size))
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	hc := f.HTTP
	if hc == nil {
		hc = http.DefaultClient
	}
	res, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		return nil, errors.New(res.Status)
	}
	var out struct {
		Error   bool    `json:"error"`
		Errmsg  string  `json:"errmsg"`
		Results [][]any `json:"results"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, err
	}
	if out.Error {
		return nil, errors.New(strings.TrimSpace(out.Errmsg))
	}
	seen := map[string]bool{}
	var assets []Asset
	for _, row := range out.Results {
		a := Asset{IP: cell(row, 0), Port: cell(row, 1), Domain: cell(row, 2), City: cell(row, 3)}
		if a.IP == "" || a.Port == "" {
			continue
		}
		id := strings.ToLower(a.IP + ":" + a.Port + "/" + a.Domain)
		if seen[id] {
			continue
		}
		seen[id] = true
		assets = append(assets, a)
	}
	return assets, nil
}

func cell(row []any, i int) string {
	if i >= len(row) || row[i] == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(row[i]))
}
