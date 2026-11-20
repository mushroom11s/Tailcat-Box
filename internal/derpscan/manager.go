package derpscan

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"tailscale.com/tailcfg"
)

const (
	ModeOfficial = "official"
	ModeScan     = "scan"
	ModeCustom   = "custom"

	ReasonUser         = "user"
	ReasonDown         = "down"
	ReasonGone         = "gone"
	ReasonOfficialDown = "official-down"

	// PreferredPort keeps the local map URL stable across launches, since
	// saved shares remember the URL they were started with.
	PreferredPort = 47630

	cacheFile     = "derp-scan.json"
	probeParallel = 8
	failLimit     = 2
	dismissFor    = 24 * time.Hour
)

var (
	StartDelay   = 20 * time.Second
	MonitorEvery = time.Minute
	RescanEvery  = 6 * time.Hour
	// officialEvery spaces out official checks to every few monitor ticks.
	officialEvery = 5
)

// ErrBusy means another scan is running.
var ErrBusy = errors.New("scan already running")

// Candidate is a scanned relay that passed the probe.
type Candidate struct {
	RegionID  int    `json:"regionId"`
	Name      string `json:"name"`
	Host      string `json:"host"`
	Port      int    `json:"port"`
	LatencyMS int    `json:"latencyMs"`
}

// Config is the user's relay choice, owned by the app's settings.
type Config struct {
	Mode     string
	RegionID int
	// Keys holds search-engine API keys by engine name (EngineFOFA, …).
	Keys map[string][]string
	Auto bool
	// Custom is set when the user typed their own DERP map URL; the
	// scanner then stays out of the way.
	Custom bool
}

// KeySlot is one saved API key as shown in settings (never the raw secret).
type KeySlot struct {
	Engine string `json:"engine"`
	Index  int    `json:"index"`
	Hint   string `json:"hint"`
	Quota  string `json:"quota,omitempty"`
	Error  string `json:"error,omitempty"`
}

// Status is what the settings page shows.
type Status struct {
	Country    string      `json:"country"`
	Mode       string      `json:"mode"`
	Active     *Candidate  `json:"active,omitempty"`
	Candidates []Candidate `json:"candidates"`
	// OfficialMS is the best official round trip: 0 unknown, -1 unreachable.
	OfficialMS int    `json:"officialMs"`
	ScannedAt  string `json:"scannedAt"`
	Scanning   bool   `json:"scanning"`
	HasKey     bool   `json:"hasKey"`
	// Engines lists engine ids with at least one saved key.
	Engines []string `json:"engines"`
	// Keys lists every saved key slot (masked).
	Keys []KeySlot `json:"keys"`
	// EngineErrors holds the last scan's per-engine failures, even when
	// another engine still found relays.
	EngineErrors map[string]string `json:"engineErrors,omitempty"`
	Auto         bool              `json:"auto"`
	Error        string            `json:"error"`
}

// HasKey reports whether any search engine key is set.
func (c Config) HasKey() bool { return len(c.engineNames()) > 0 }

func (c Config) engineNames() []string {
	var out []string
	for _, n := range EngineNames {
		if len(uniqueTrimmed(c.Keys[n])) > 0 {
			out = append(out, n)
		}
	}
	return out
}

func (c Config) keySlots(quotas map[string]KeySlot) []KeySlot {
	var out []KeySlot
	for _, n := range EngineNames {
		for i, key := range uniqueTrimmed(c.Keys[n]) {
			slot := KeySlot{Engine: n, Index: i, Hint: MaskKey(key)}
			if q, ok := quotas[quotaID(n, i)]; ok {
				slot.Quota, slot.Error = q.Quota, q.Error
			}
			out = append(out, slot)
		}
	}
	return out
}

func quotaID(engine string, index int) string {
	return fmt.Sprintf("%s#%d", engine, index)
}

// Deps are the network edges, swappable in tests.
type Deps struct {
	Country  func(ctx context.Context) (string, error)
	Engines  func(keys map[string][]string) []Engine
	Quota    func(ctx context.Context, engine, key string) (string, error)
	Probe    func(ctx context.Context, r *tailcfg.DERPRegion) (time.Duration, error)
	Official func(ctx context.Context) (*tailcfg.DERPMap, error)
}

// DefaultDeps talks to the real internet; official loads the public map.
func DefaultDeps(official func(ctx context.Context) (*tailcfg.DERPMap, error)) Deps {
	return Deps{
		Country:  func(ctx context.Context) (string, error) { return DetectCountry(ctx, nil) },
		Engines:  NewEngines,
		Quota:    FetchQuota,
		Probe:    Probe,
		Official: official,
	}
}

// Hooks connect the manager to the app.
type Hooks struct {
	Config func() Config
	// Switch moves new connections to regionID; 0 means the official map.
	Switch  func(regionID int, reason string)
	Suggest func(c Candidate, baselineMS int)
	Changed func(Status)
}

type cache struct {
	V              int                 `json:"v"`
	Country        string              `json:"country"`
	ScannedAt      time.Time           `json:"scannedAt"`
	OfficialMS     int                 `json:"officialMs"`
	OfficialRegion int                 `json:"officialRegion"`
	Map            *tailcfg.DERPMap    `json:"map"`
	Candidates     []Candidate         `json:"candidates"`
	Dismissed      map[int]time.Time   `json:"dismissed"`
}

// Manager scans, serves the scanned map locally, and keeps the chosen
// relay alive.
type Manager struct {
	dir   string
	deps  Deps
	hooks Hooks
	now   func() time.Time

	scanMu sync.Mutex

	mu            sync.Mutex
	c             cache
	scanning      bool
	lastErr       string
	engineErrs    map[string]string
	quotas        map[string]KeySlot
	ln            net.Listener
	base          string
	activeFails   int
	officialFails int
}

// New loads the last scan from dir.
func New(dir string, deps Deps, hooks Hooks) *Manager {
	m := &Manager{dir: dir, deps: deps, hooks: hooks, now: time.Now}
	if body, err := os.ReadFile(filepath.Join(dir, cacheFile)); err == nil {
		_ = json.Unmarshal(body, &m.c)
	}
	if m.c.Dismissed == nil {
		m.c.Dismissed = map[int]time.Time{}
	}
	return m
}

func (m *Manager) config() Config {
	if m.hooks.Config == nil {
		return Config{}
	}
	return m.hooks.Config()
}

// Region returns a scanned region that passed its last probe.
func (m *Manager) Region(id int) (*tailcfg.DERPRegion, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.regionLocked(id)
}

func (m *Manager) regionLocked(id int) (*tailcfg.DERPRegion, bool) {
	if m.c.Map == nil {
		return nil, false
	}
	for _, c := range m.c.Candidates {
		if c.RegionID == id {
			r, ok := m.c.Map.Regions[tailcfg.DERPRegionID(id)]
			return r, ok && r != nil
		}
	}
	return nil, false
}

// URL serves the healthy scanned regions on loopback and returns the map URL.
// The query changes with every scan so tailcat's map cache never hands back
// an older region list.
func (m *Manager) URL() (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.base == "" {
		ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", PreferredPort))
		if err != nil {
			ln, err = net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				return "", err
			}
		}
		srv := &http.Server{Handler: http.HandlerFunc(m.serveMap), ReadHeaderTimeout: 5 * time.Second}
		go func() { _ = srv.Serve(ln) }()
		m.ln = ln
		m.base = "http://" + ln.Addr().String() + "/derpmap.json"
	}
	return fmt.Sprintf("%s?v=%d", m.base, m.c.ScannedAt.Unix()), nil
}

// Close stops the local map server.
func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.ln != nil {
		_ = m.ln.Close()
		m.ln = nil
		m.base = ""
	}
}

func (m *Manager) serveMap(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/derpmap.json" {
		http.NotFound(w, r)
		return
	}
	m.mu.Lock()
	body, err := json.Marshal(m.servedLocked())
	m.mu.Unlock()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(body)
}

func (m *Manager) servedLocked() *tailcfg.DERPMap {
	ok := map[int]bool{}
	for _, c := range m.c.Candidates {
		ok[c.RegionID] = true
	}
	return KeepRegions(m.c.Map, ok)
}

// Status snapshots the scan for the UI.
func (m *Manager) Status() Status {
	cfg := m.config()
	m.mu.Lock()
	defer m.mu.Unlock()
	st := Status{
		Country:    m.c.Country,
		Mode:       modeOf(cfg),
		Candidates: append([]Candidate{}, m.c.Candidates...),
		OfficialMS: m.c.OfficialMS,
		Scanning:   m.scanning,
		HasKey:  cfg.HasKey(),
		Engines: append([]string{}, cfg.engineNames()...),
		Keys:    cfg.keySlots(m.quotas),
		Auto:    cfg.Auto,
		Error:   m.lastErr,
	}
	if len(m.engineErrs) > 0 {
		st.EngineErrors = map[string]string{}
		for k, v := range m.engineErrs {
			st.EngineErrors[k] = v
		}
	}
	if !m.c.ScannedAt.IsZero() {
		st.ScannedAt = m.c.ScannedAt.Format(time.RFC3339)
	}
	if st.Mode == ModeScan {
		for _, c := range m.c.Candidates {
			if c.RegionID == cfg.RegionID {
				active := c
				st.Active = &active
			}
		}
	}
	return st
}

func modeOf(cfg Config) string {
	switch {
	case cfg.Custom:
		return ModeCustom
	case cfg.Mode == ModeScan && cfg.RegionID != 0:
		return ModeScan
	default:
		return ModeOfficial
	}
}

func (m *Manager) changed() {
	if m.hooks.Changed != nil {
		m.hooks.Changed(m.Status())
	}
}

// Dismiss mutes the suggestion for regionID for a day.
func (m *Manager) Dismiss(regionID int) {
	m.mu.Lock()
	m.c.Dismissed[regionID] = m.now()
	m.mu.Unlock()
	m.save()
}

// Better reports whether a relay at candMS is worth leaving baseMS for:
// the baseline is unreachable, or the candidate is clearly faster.
func Better(candMS, baseMS int) bool {
	if candMS <= 0 {
		return false
	}
	if baseMS < 0 {
		return true
	}
	if baseMS == 0 {
		return false
	}
	return candMS*10 <= baseMS*7 && baseMS-candMS >= 30
}

// Scan runs the full search → probe → filter pass and then decides whether
// to suggest or fail over.
func (m *Manager) Scan(ctx context.Context) (Status, error) {
	if !m.scanMu.TryLock() {
		return m.Status(), ErrBusy
	}
	defer m.scanMu.Unlock()
	m.setScanning(true, "")
	err := m.scan(ctx)
	msg := ""
	if err != nil {
		msg = err.Error()
	}
	m.setScanning(false, msg)
	if err == nil {
		m.evaluate(ctx)
	}
	return m.Status(), err
}

func (m *Manager) setScanning(on bool, errText string) {
	m.mu.Lock()
	m.scanning = on
	m.lastErr = errText
	m.mu.Unlock()
	m.changed()
}

func (m *Manager) scan(ctx context.Context) error {
	cfg := m.config()
	engines := m.deps.Engines(cfg.Keys)
	if len(engines) == 0 {
		return ErrNoKey
	}
	country, _ := m.Country(ctx)
	assets, engineErrs, err := m.search(ctx, engines, country)
	m.mu.Lock()
	m.engineErrs = engineErrs
	m.mu.Unlock()
	if err != nil {
		return err
	}
	dm := BuildMap(assets)
	results := m.probeAll(ctx, dm)
	ok := map[int]bool{}
	var cands []Candidate
	for id, d := range results {
		ok[id] = true
		cands = append(cands, candidateOf(dm.Regions[tailcfg.DERPRegionID(id)], d))
	}
	sortCandidates(cands)
	officialMS, officialRegion := m.probeOfficial(ctx)

	m.mu.Lock()
	m.c.V = 1
	m.c.Country = country
	m.c.ScannedAt = m.now()
	m.c.Map = KeepRegions(dm, ok)
	m.c.Candidates = cands
	m.c.OfficialMS = officialMS
	m.c.OfficialRegion = officialRegion
	m.mu.Unlock()
	m.save()
	return nil
}

// search tries engines one by one and stops at the first that returns
// hits, so later keys are not spent. Within an engine that can filter by
// country, the user's region is tried first and only an empty or failed
// region query expands to worldwide.
func (m *Manager) search(ctx context.Context, engines []Engine, country string) ([]Asset, map[string]string, error) {
	errs := map[string]string{}
	for i, e := range engines {
		if i > 0 && EnginePause > 0 {
			select {
			case <-ctx.Done():
				return nil, errs, ctx.Err()
			case <-time.After(EnginePause):
			}
		}
		assets, err := searchOne(ctx, e, country)
		if err != nil {
			errs[e.Name()] = err.Error()
			continue
		}
		out := mergeAssets(assets)
		if len(out) == 0 {
			errs[e.Name()] = "no results"
			continue
		}
		if len(errs) == 0 {
			errs = nil
		}
		return out, errs, nil
	}
	if len(errs) == 0 {
		return nil, nil, nil
	}
	var parts []string
	for _, e := range engines {
		if msg, ok := errs[e.Name()]; ok {
			parts = append(parts, e.Name()+": "+msg)
		}
	}
	return nil, errs, errors.New(strings.Join(parts, "; "))
}

func searchOne(ctx context.Context, e Engine, country string) ([]Asset, error) {
	if !e.ByCountry() || country == "" {
		return e.Search(ctx, "")
	}
	assets, err := e.Search(ctx, country)
	if err == nil && len(assets) > 0 {
		return assets, nil
	}
	if EnginePause > 0 {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(EnginePause):
		}
	}
	world, worldErr := e.Search(ctx, "")
	if worldErr == nil && len(world) > 0 {
		return world, nil
	}
	if err != nil {
		return nil, err
	}
	if worldErr != nil {
		return nil, worldErr
	}
	return nil, nil
}

// EnginePause spaces out back-to-back queries so free-plan rate limits
// (ZoomEye: one request every two seconds) are not tripped.
var EnginePause = 2100 * time.Millisecond

// mergeAssets drops repeats of the same ip:port, keeping a domain if any
// hit reported one, and caps the list at MaxRegions.
func mergeAssets(in []Asset) []Asset {
	var out []Asset
	at := map[string]int{}
	for _, a := range in {
		id := strings.ToLower(a.IP + ":" + a.Port)
		if a.IP == "" {
			id = strings.ToLower(a.Domain + ":" + a.Port)
		}
		if i, ok := at[id]; ok {
			if out[i].Domain == "" {
				out[i].Domain = a.Domain
			}
			if out[i].City == "" {
				out[i].City = a.City
			}
			continue
		}
		if a.IP == "" && a.Domain == "" || len(out) >= MaxRegions {
			continue
		}
		at[id] = len(out)
		out = append(out, a)
	}
	return out
}

// Country detects the public IP's country, falling back to the last result.
func (m *Manager) Country(ctx context.Context) (string, error) {
	cc, err := m.deps.Country(ctx)
	m.mu.Lock()
	defer m.mu.Unlock()
	if err == nil && cc != "" {
		m.c.Country = cc
		return cc, nil
	}
	if m.c.Country != "" {
		return m.c.Country, nil
	}
	return "", err
}

func candidateOf(r *tailcfg.DERPRegion, d time.Duration) Candidate {
	c := Candidate{RegionID: int(r.RegionID), Name: r.RegionName, LatencyMS: ms(d)}
	if len(r.Nodes) > 0 {
		c.Host = r.Nodes[0].HostName
		c.Port = r.Nodes[0].DERPPort
	}
	if c.Name == "" {
		c.Name = c.Host
	}
	return c
}

func ms(d time.Duration) int {
	n := int(d.Round(time.Millisecond) / time.Millisecond)
	if n < 1 {
		n = 1
	}
	return n
}

func sortCandidates(cands []Candidate) {
	sort.Slice(cands, func(i, j int) bool {
		if cands[i].LatencyMS != cands[j].LatencyMS {
			return cands[i].LatencyMS < cands[j].LatencyMS
		}
		return cands[i].RegionID < cands[j].RegionID
	})
}

func (m *Manager) probeAll(ctx context.Context, dm *tailcfg.DERPMap) map[int]time.Duration {
	out := map[int]time.Duration{}
	if dm == nil {
		return out
	}
	var (
		mu  sync.Mutex
		wg  sync.WaitGroup
		sem = make(chan struct{}, probeParallel)
	)
	for rid, r := range dm.Regions {
		if r == nil || r.Avoid {
			continue
		}
		id := int(rid)
		wg.Add(1)
		go func(id int, r *tailcfg.DERPRegion) {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
			case <-ctx.Done():
				return
			}
			defer func() { <-sem }()
			d, err := m.deps.Probe(ctx, r)
			if err != nil {
				return
			}
			mu.Lock()
			out[id] = d
			mu.Unlock()
		}(id, r)
	}
	wg.Wait()
	return out
}

// probeOfficial returns the best official round trip and its region,
// or -1 when nothing answered.
func (m *Manager) probeOfficial(ctx context.Context) (int, int) {
	dm, err := m.deps.Official(ctx)
	if err != nil || dm == nil {
		return -1, 0
	}
	best, region := -1, 0
	for id, d := range m.probeAll(ctx, dm) {
		if v := ms(d); best < 0 || v < best {
			best, region = v, id
		}
	}
	return best, region
}

// probeOfficialRegion re-checks only the official region that was fastest
// last time, so routine checks stay cheap.
func (m *Manager) probeOfficialRegion(ctx context.Context) (int, int) {
	m.mu.Lock()
	id := m.c.OfficialRegion
	m.mu.Unlock()
	if id == 0 {
		return -1, 0
	}
	dm, err := m.deps.Official(ctx)
	if err != nil || dm == nil {
		return -1, 0
	}
	r := dm.Regions[tailcfg.DERPRegionID(id)]
	if r == nil {
		return -1, 0
	}
	d, err := m.deps.Probe(ctx, r)
	if err != nil {
		return -1, 0
	}
	return ms(d), id
}

// evaluate turns the latest scan into a suggestion or a failover.
func (m *Manager) evaluate(ctx context.Context) {
	cfg := m.config()
	if cfg.Custom {
		return
	}
	m.mu.Lock()
	cands := append([]Candidate{}, m.c.Candidates...)
	official := m.c.OfficialMS
	m.mu.Unlock()

	if modeOf(cfg) == ModeScan {
		var active *Candidate
		for i := range cands {
			if cands[i].RegionID == cfg.RegionID {
				active = &cands[i]
			}
		}
		if active == nil {
			m.failover(ctx, cfg.RegionID, ReasonGone)
			return
		}
		if len(cands) > 0 && cands[0].RegionID != active.RegionID && Better(cands[0].LatencyMS, active.LatencyMS) {
			m.suggest(cands[0], active.LatencyMS)
		}
		return
	}
	if len(cands) > 0 && Better(cands[0].LatencyMS, official) {
		m.suggest(cands[0], official)
	}
}

func (m *Manager) suggest(c Candidate, baseline int) {
	m.mu.Lock()
	at, muted := m.c.Dismissed[c.RegionID]
	muted = muted && m.now().Sub(at) < dismissFor
	m.mu.Unlock()
	if muted || m.hooks.Suggest == nil {
		return
	}
	m.hooks.Suggest(c, baseline)
}

// failover leaves dead for the fastest scanned relay that still answers,
// or for the official map when none does. When nothing is left it spends
// quota on a fresh search so the next outage has candidates again.
func (m *Manager) failover(ctx context.Context, dead int, reason string) {
	m.dropCandidate(dead)
	m.mu.Lock()
	cands := append([]Candidate{}, m.c.Candidates...)
	m.mu.Unlock()
	for _, c := range cands {
		r, ok := m.Region(c.RegionID)
		if !ok {
			continue
		}
		if _, err := m.deps.Probe(ctx, r); err != nil {
			m.dropCandidate(c.RegionID)
			continue
		}
		m.switchTo(c.RegionID, reason)
		return
	}
	m.switchTo(0, reason)
	m.autoScan(ctx)
}

func (m *Manager) dropCandidate(id int) {
	m.mu.Lock()
	kept := m.c.Candidates[:0]
	for _, c := range m.c.Candidates {
		if c.RegionID != id {
			kept = append(kept, c)
		}
	}
	m.c.Candidates = kept
	m.mu.Unlock()
	m.save()
}

func (m *Manager) switchTo(id int, reason string) {
	m.mu.Lock()
	m.activeFails = 0
	m.officialFails = 0
	m.mu.Unlock()
	if m.hooks.Switch != nil {
		m.hooks.Switch(id, reason)
	}
	m.changed()
}

// Run scans on start (when a FOFA key is saved), rescans every
// few hours, and watches whichever relay is in use.
func (m *Manager) Run(ctx context.Context) {
	if !sleep(ctx, StartDelay) {
		return
	}
	m.autoScan(ctx)
	lastScan := m.now()
	tick := time.NewTicker(MonitorEvery)
	defer tick.Stop()
	n := 0
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			n++
			m.Check(ctx, n%officialEvery == 0)
			if m.now().Sub(lastScan) >= RescanEvery {
				lastScan = m.now()
				m.autoScan(ctx)
			}
		}
	}
}

func sleep(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

func (m *Manager) autoScan(ctx context.Context) {
	cfg := m.config()
	if !cfg.Auto || cfg.Custom || !cfg.HasKey() {
		return
	}
	// A1: while a scanned relay is still in the local map, don't spend
	// search-engine quota. Health is watched by Check; failover rescans
	// when every candidate is gone.
	if modeOf(cfg) == ModeScan {
		if _, ok := m.Region(cfg.RegionID); ok {
			m.evaluate(ctx)
			return
		}
	}
	m.mu.Lock()
	hasCands := len(m.c.Candidates) > 0
	never := m.c.ScannedAt.IsZero()
	m.mu.Unlock()
	if hasCands && !never {
		m.evaluate(ctx)
		return
	}
	_, _ = m.Scan(ctx)
}

// RefreshQuotas asks each saved key for its remaining allowance.
func (m *Manager) RefreshQuotas(ctx context.Context) Status {
	cfg := m.config()
	quotaFn := m.deps.Quota
	if quotaFn == nil {
		quotaFn = FetchQuota
	}
	out := map[string]KeySlot{}
	for _, n := range EngineNames {
		for i, key := range uniqueTrimmed(cfg.Keys[n]) {
			id := quotaID(n, i)
			slot := KeySlot{Engine: n, Index: i, Hint: MaskKey(key)}
			text, err := quotaFn(ctx, n, key)
			if err != nil {
				slot.Error = err.Error()
			} else {
				slot.Quota = text
			}
			out[id] = slot
			if EnginePause > 0 {
				select {
				case <-ctx.Done():
					m.mu.Lock()
					m.quotas = out
					m.mu.Unlock()
					return m.Status()
				case <-time.After(EnginePause):
				}
			}
		}
	}
	m.mu.Lock()
	m.quotas = out
	m.mu.Unlock()
	m.changed()
	return m.Status()
}

// Check probes the relay in use. A scanned relay that fails twice in a row
// is replaced; the official map is checked when official is set, and if it
// stops answering entirely a healthy scanned relay takes over.
func (m *Manager) Check(ctx context.Context, official bool) {
	cfg := m.config()
	if cfg.Custom {
		return
	}
	if modeOf(cfg) == ModeScan {
		r, ok := m.Region(cfg.RegionID)
		if !ok {
			m.failover(ctx, cfg.RegionID, ReasonGone)
			return
		}
		if _, err := m.deps.Probe(ctx, r); err == nil {
			m.mu.Lock()
			m.activeFails = 0
			m.mu.Unlock()
			return
		}
		m.mu.Lock()
		m.activeFails++
		down := m.activeFails >= failLimit
		m.mu.Unlock()
		if down {
			m.failover(ctx, cfg.RegionID, ReasonDown)
		}
		return
	}
	if !official {
		return
	}
	m.mu.Lock()
	hasCands := len(m.c.Candidates) > 0
	m.mu.Unlock()
	if !hasCands {
		return
	}
	best, region := m.probeOfficialRegion(ctx)
	if best < 0 {
		best, region = m.probeOfficial(ctx)
	}
	m.mu.Lock()
	if best >= 0 {
		m.officialFails = 0
		m.c.OfficialMS, m.c.OfficialRegion = best, region
		m.mu.Unlock()
		return
	}
	m.officialFails++
	down := m.officialFails >= failLimit
	if down {
		m.c.OfficialMS = -1
	}
	cands := append([]Candidate{}, m.c.Candidates...)
	m.mu.Unlock()
	if !down {
		return
	}
	for _, c := range cands {
		r, ok := m.Region(c.RegionID)
		if !ok {
			continue
		}
		if _, err := m.deps.Probe(ctx, r); err == nil {
			m.switchTo(c.RegionID, ReasonOfficialDown)
			return
		}
		m.dropCandidate(c.RegionID)
	}
	m.changed()
	m.autoScan(ctx)
}

func (m *Manager) save() {
	m.mu.Lock()
	body, err := json.MarshalIndent(m.c, "", "\t")
	m.mu.Unlock()
	if err != nil || m.dir == "" {
		return
	}
	if err := os.MkdirAll(m.dir, 0o700); err != nil {
		return
	}
	tmp := filepath.Join(m.dir, cacheFile+".tmp")
	if err := os.WriteFile(tmp, append(body, '\n'), 0o600); err != nil {
		return
	}
	_ = os.Rename(tmp, filepath.Join(m.dir, cacheFile))
}
