package derpscan

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
)

// CountryLookups are tried in order; each returns the public IP's ISO country.
var CountryLookups = []func(ctx context.Context, hc *http.Client) (string, error){
	cloudflareTrace,
	ipAPI,
	ipInfo,
}

// DetectCountry reports the ISO country code (such as "CN") of this
// machine's public IP.
func DetectCountry(ctx context.Context, hc *http.Client) (string, error) {
	if hc == nil {
		hc = &http.Client{Timeout: 6 * time.Second}
	}
	var firstErr error
	for _, lookup := range CountryLookups {
		cc, err := lookup(ctx, hc)
		if err == nil && len(cc) == 2 {
			return strings.ToUpper(cc), nil
		}
		if firstErr == nil {
			firstErr = err
		}
	}
	if firstErr == nil {
		firstErr = errors.New("country not found")
	}
	return "", firstErr
}

func get(ctx context.Context, hc *http.Client, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	res, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, errors.New(res.Status)
	}
	return io.ReadAll(io.LimitReader(res.Body, 64<<10))
}

func cloudflareTrace(ctx context.Context, hc *http.Client) (string, error) {
	body, err := get(ctx, hc, "https://www.cloudflare.com/cdn-cgi/trace")
	if err != nil {
		return "", err
	}
	sc := bufio.NewScanner(strings.NewReader(string(body)))
	for sc.Scan() {
		if v, ok := strings.CutPrefix(sc.Text(), "loc="); ok {
			return strings.TrimSpace(v), nil
		}
	}
	return "", errors.New("no loc in trace")
}

func ipAPI(ctx context.Context, hc *http.Client) (string, error) {
	body, err := get(ctx, hc, "http://ip-api.com/json/?fields=countryCode")
	if err != nil {
		return "", err
	}
	var out struct {
		CountryCode string `json:"countryCode"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", err
	}
	return out.CountryCode, nil
}

func ipInfo(ctx context.Context, hc *http.Client) (string, error) {
	body, err := get(ctx, hc, "https://ipinfo.io/country")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(body)), nil
}
