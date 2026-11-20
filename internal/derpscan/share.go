package derpscan

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"tailscale.com/tailcfg"
)

const (
	shareVersion = 1
	shareKind    = "tailcat-box-relays"
	// MaxShareBytes caps a shared relay list. API keys are never included.
	MaxShareBytes = 512 << 10
)

// Share is a scanned relay list another Tailcat Box can import
// without spending search-engine quota.
type Share struct {
	V          int              `json:"v"`
	Kind       string           `json:"kind"`
	ScannedAt  time.Time        `json:"scannedAt"`
	Candidates []Candidate      `json:"candidates"`
	Map        *tailcfg.DERPMap `json:"map"`
}

// ExportShare serialises the healthy scanned relays. It omits search keys.
func (m *Manager) ExportShare() ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.c.Candidates) == 0 || m.c.Map == nil {
		return nil, fmt.Errorf("no relays to share")
	}
	ok := map[int]bool{}
	for _, c := range m.c.Candidates {
		ok[c.RegionID] = true
	}
	doc := Share{
		V:          shareVersion,
		Kind:       shareKind,
		ScannedAt:  m.c.ScannedAt,
		Candidates: append([]Candidate{}, m.c.Candidates...),
		Map:        KeepRegions(m.c.Map, ok),
	}
	body, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, err
	}
	if len(body) > MaxShareBytes {
		return nil, fmt.Errorf("relay share is too large")
	}
	return body, nil
}

// ImportShare replaces the local scanned list with one from another device.
func (m *Manager) ImportShare(raw []byte) error {
	if len(raw) == 0 || len(raw) > MaxShareBytes {
		return fmt.Errorf("not a relay share")
	}
	var doc Share
	if err := json.Unmarshal(raw, &doc); err != nil || doc.V != shareVersion || doc.Kind != shareKind {
		return fmt.Errorf("not a relay share")
	}
	ok := map[int]bool{}
	var cands []Candidate
	seen := map[int]bool{}
	for _, c := range doc.Candidates {
		if seen[c.RegionID] || c.RegionID < FirstRegionID || c.RegionID > LastRegionID {
			continue
		}
		if doc.Map == nil || doc.Map.Regions[tailcfg.DERPRegionID(c.RegionID)] == nil {
			continue
		}
		host := strings.TrimSpace(c.Host)
		if host == "" || c.Port <= 0 || c.Port > 65535 {
			continue
		}
		if c.LatencyMS < 0 {
			c.LatencyMS = 0
		}
		c.Host = host
		c.Name = strings.TrimSpace(c.Name)
		seen[c.RegionID] = true
		ok[c.RegionID] = true
		cands = append(cands, c)
	}
	if len(cands) == 0 {
		return fmt.Errorf("relay share is empty")
	}
	scanned := doc.ScannedAt
	if scanned.IsZero() {
		scanned = m.now()
	}
	m.mu.Lock()
	m.c.Candidates = cands
	m.c.Map = KeepRegions(doc.Map, ok)
	m.c.ScannedAt = scanned
	m.lastErr = ""
	m.mu.Unlock()
	m.save()
	m.changed()
	return nil
}

// FastestRegion is the lowest positive latency in st, or the first candidate.
func FastestRegion(st Status) int {
	bestID, bestMS := 0, 0
	for _, c := range st.Candidates {
		if c.LatencyMS <= 0 {
			continue
		}
		if bestID == 0 || c.LatencyMS < bestMS {
			bestID, bestMS = c.RegionID, c.LatencyMS
		}
	}
	if bestID == 0 && len(st.Candidates) > 0 {
		return st.Candidates[0].RegionID
	}
	return bestID
}
