package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/mushroom11s/tailcat-box/internal/adapter"
	"github.com/mushroom11s/tailcat-box/internal/derpscan"
	"github.com/mushroom11s/tailcat-box/internal/store"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// derpEvent travels on tailcat:event with Kind "derp".
type derpEvent struct {
	Type       string              `json:"type"` // status | suggest | switched
	Status     *derpscan.Status    `json:"status,omitempty"`
	Candidate  *derpscan.Candidate `json:"candidate,omitempty"`
	BaselineMS int                 `json:"baselineMs,omitempty"`
	Reason     string              `json:"reason,omitempty"`
}

func (a *App) newDERPScanner() *derpscan.Manager {
	dir := "keys"
	if a.keys != nil && a.keys.Dir != "" {
		dir = a.keys.Dir
	}
	return derpscan.New(dir, derpscan.DefaultDeps(adapter.FetchOfficialDERPMap), derpscan.Hooks{
		Config: a.derpConfig,
		Switch: func(id int, reason string) {
			_ = a.useDERPRegion(id)
			var to *derpscan.Candidate
			if a.derp != nil {
				for _, c := range a.derp.Status().Candidates {
					if c.RegionID == id {
						c := c
						to = &c
					}
				}
			}
			a.emitDERP(derpEvent{Type: "switched", Candidate: to, Reason: reason})
		},
		Suggest: func(c derpscan.Candidate, baseline int) {
			a.emitDERP(derpEvent{Type: "suggest", Candidate: &c, BaselineMS: baseline})
		},
		Changed: func(st derpscan.Status) {
			a.emitDERP(derpEvent{Type: "status", Status: &st})
		},
	})
}

func (a *App) loadNetSettings() store.Settings {
	if a.keys == nil {
		return store.Settings{}
	}
	s, _ := a.keys.LoadSettings()
	return s
}

func (a *App) derpConfig() derpscan.Config {
	s := a.loadNetSettings()
	keys := map[string][]string{}
	for _, name := range derpscan.EngineNames {
		if list := s.EngineKeys(name); len(list) > 0 {
			keys[name] = list
		}
	}
	return derpscan.Config{
		Mode:     s.DERPMode,
		RegionID: s.DERPRegionID,
		Keys:     keys,
		Auto:     !s.DERPAutoOff,
		Custom:   strings.TrimSpace(s.DERPMapURL) != "",
	}
}

// effectiveNet is what new connections use: the user's own map URL wins,
// then a scanned relay served on loopback, then the official map.
func (a *App) effectiveNet(s store.Settings) adapter.NetworkOpts {
	if strings.TrimSpace(s.DERPMapURL) == "" && s.DERPMode == derpscan.ModeScan && s.DERPRegionID != 0 && a.derp != nil {
		if _, ok := a.derp.Region(s.DERPRegionID); ok {
			if u, err := a.derp.URL(); err == nil {
				return adapter.NetworkOpts{Region: strconv.Itoa(s.DERPRegionID), DERPMapURL: u}
			}
		}
	}
	return adapter.NetworkOpts{Region: s.Region, DERPMapURL: s.DERPMapURL}
}

// remoteRelayNet is the route for this remote session only.
// An empty token follows the app's current network settings.
// "region:tok" uses the official map for that city.
// "scan:901" uses one scanned node and does not change other connections.
func (a *App) remoteRelayNet(token string) (adapter.NetworkOpts, error) {
	base := adapter.NetworkOpts{}
	if a.svc != nil {
		base = a.svc.NetworkOpts()
	}
	token = strings.TrimSpace(token)
	if token == "" || token == "auto" {
		return base, nil
	}
	if strings.HasPrefix(token, "scan:") {
		id, err := strconv.Atoi(strings.TrimPrefix(token, "scan:"))
		if err != nil || id <= 0 || a.derp == nil {
			return adapter.NetworkOpts{}, fmt.Errorf("relay %s is not available", strings.TrimPrefix(token, "scan:"))
		}
		if _, ok := a.derp.Region(id); !ok {
			return adapter.NetworkOpts{}, fmt.Errorf("relay %d is not available", id)
		}
		u, err := a.derp.URL()
		if err != nil {
			return adapter.NetworkOpts{}, err
		}
		return adapter.NetworkOpts{Region: strconv.Itoa(id), DERPMapURL: u}, nil
	}
	code := strings.TrimPrefix(token, "region:")
	code = strings.TrimSpace(code)
	if code == "" {
		return base, nil
	}
	return adapter.NetworkOpts{Region: code}, nil
}

func (a *App) applyNet() {
	if a.svc == nil {
		return
	}
	a.svc.SetNetworkOpts(a.effectiveNet(a.loadNetSettings()))
}

func (a *App) emitDERP(ev derpEvent) {
	if a.ctx == nil {
		return
	}
	body, err := json.Marshal(ev)
	if err != nil {
		return
	}
	runtime.EventsEmit(a.ctx, tailcatEventName, adapter.Event{SessionID: "derp", Kind: "derp", Data: string(body)})
}

func (a *App) runDERPScanner(ctx context.Context) {
	if a.derp == nil {
		return
	}
	a.derp.Run(ctx)
}

// DERPStatus reports the relay scan for Settings.
func (a *App) DERPStatus() derpscan.Status {
	if a.derp == nil {
		return derpscan.Status{Mode: derpscan.ModeOfficial}
	}
	return a.derp.Status()
}

func (a *App) knownEngine(engine string) error {
	for _, n := range derpscan.EngineNames {
		if n == engine {
			return nil
		}
	}
	return fmt.Errorf("unknown search engine %q", engine)
}

// SetDERPAuto turns automatic scanning on or off.
func (a *App) SetDERPAuto(auto bool) (derpscan.Status, error) {
	if a.keys == nil {
		return a.DERPStatus(), fmt.Errorf("key store unavailable")
	}
	s := a.loadNetSettings()
	s.DERPAutoOff = !auto
	if err := a.keys.SaveSettings(s); err != nil {
		return a.DERPStatus(), err
	}
	return a.DERPStatus(), nil
}

// AddDERPKey appends an API key for engine (fofa / zoomeye / hunter / quake).
func (a *App) AddDERPKey(engine, key string) (derpscan.Status, error) {
	if a.keys == nil {
		return a.DERPStatus(), fmt.Errorf("key store unavailable")
	}
	if err := a.knownEngine(engine); err != nil {
		return a.DERPStatus(), err
	}
	key = strings.TrimSpace(key)
	if key == "" {
		return a.DERPStatus(), fmt.Errorf("empty key")
	}
	s := a.loadNetSettings()
	if !s.AddEngineKey(engine, key) {
		return a.DERPStatus(), fmt.Errorf("key already saved")
	}
	if err := a.keys.SaveSettings(s); err != nil {
		return a.DERPStatus(), err
	}
	return a.DERPStatus(), nil
}

// RemoveDERPKey deletes one saved key by engine and index.
func (a *App) RemoveDERPKey(engine string, index int) (derpscan.Status, error) {
	if a.keys == nil {
		return a.DERPStatus(), fmt.Errorf("key store unavailable")
	}
	if err := a.knownEngine(engine); err != nil {
		return a.DERPStatus(), err
	}
	s := a.loadNetSettings()
	if !s.RemoveEngineKey(engine, index) {
		return a.DERPStatus(), fmt.Errorf("key not found")
	}
	if err := a.keys.SaveSettings(s); err != nil {
		return a.DERPStatus(), err
	}
	return a.DERPStatus(), nil
}

// RefreshDERPQuotas asks each saved key for its remaining allowance.
func (a *App) RefreshDERPQuotas() (derpscan.Status, error) {
	if a.derp == nil {
		return derpscan.Status{}, nil
	}
	parent := a.ctx
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithTimeout(parent, 45*time.Second)
	defer cancel()
	return a.derp.RefreshQuotas(ctx), nil
}

// ScanDERP searches and probes relays now.
func (a *App) ScanDERP() (derpscan.Status, error) {
	if a.derp == nil {
		return derpscan.Status{}, nil
	}
	parent := a.ctx
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithTimeout(parent, 2*time.Minute)
	defer cancel()
	return a.derp.Scan(ctx)
}

// UseDERPRegion routes new connections through a scanned relay; 0 goes
// back to the official map.
func (a *App) UseDERPRegion(regionID int) (derpscan.Status, error) {
	err := a.useDERPRegion(regionID)
	return a.DERPStatus(), err
}

func (a *App) useDERPRegion(regionID int) error {
	if regionID != 0 {
		if a.derp == nil {
			return fmt.Errorf("relay %d is not available", regionID)
		}
		if _, ok := a.derp.Region(regionID); !ok {
			return fmt.Errorf("relay %d is not available", regionID)
		}
	}
	s := a.loadNetSettings()
	if regionID == 0 {
		s.DERPMode, s.DERPRegionID = "", 0
	} else {
		s.DERPMode, s.DERPRegionID = derpscan.ModeScan, regionID
		s.DERPMapURL = ""
	}
	if err := a.keys.SaveSettings(s); err != nil {
		return err
	}
	a.applyNet()
	return nil
}

// ExportRelayShare writes the scanned relays to a file the user chooses.
// An empty path means the save dialog was cancelled. The file has no API keys.
func (a *App) ExportRelayShare() (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("save dialog requires a running window")
	}
	if a.derp == nil {
		return "", fmt.Errorf("no relays to share")
	}
	body, err := a.derp.ExportShare()
	if err != nil {
		return "", err
	}
	dest, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultFilename: "tailcat-relays.json",
		Title:           "Export relays",
		Filters: []runtime.FileFilter{{
			DisplayName: "Tailcat relays (*.json)",
			Pattern:     "*.json",
		}},
	})
	if err != nil || strings.TrimSpace(dest) == "" {
		return "", err
	}
	if !strings.HasSuffix(strings.ToLower(dest), ".json") {
		dest += ".json"
	}
	if err := os.WriteFile(dest, body, 0o600); err != nil {
		return "", err
	}
	return dest, nil
}

// ImportRelayShare reads a relay file and starts using the fastest node in it.
// An empty path means the dialog was cancelled.
func (a *App) ImportRelayShare() (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("file picker requires a running window")
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Import relays",
		Filters: []runtime.FileFilter{{
			DisplayName: "Tailcat relays (*.json)",
			Pattern:     "*.json",
		}},
	})
	if err != nil || strings.TrimSpace(path) == "" {
		return "", err
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	if err := a.acceptRelayShare(string(raw), false); err != nil {
		return "", err
	}
	return path, nil
}

// SendRelayShare gives the scanned relays to a saved device that is in an open chat.
func (a *App) SendRelayShare(address string) error {
	if a.derp == nil || a.rooms == nil {
		return fmt.Errorf("no relays to share")
	}
	body, err := a.derp.ExportShare()
	if err != nil {
		return err
	}
	id := a.rooms.IDByPeer(address)
	if id == "" {
		return fmt.Errorf("device is not in an open chat")
	}
	return a.rooms.SendRelay(id, body)
}

func (a *App) acceptRelayShare(raw string, notify bool) error {
	if a.derp == nil {
		return fmt.Errorf("no relays to share")
	}
	if err := a.derp.ImportShare([]byte(raw)); err != nil {
		return err
	}
	if id := derpscan.FastestRegion(a.derp.Status()); id != 0 {
		if err := a.useDERPRegion(id); err != nil {
			return err
		}
	}
	if notify {
		st := a.DERPStatus()
		a.emitDERP(derpEvent{Type: "shared", Status: &st})
	}
	return nil
}

// DismissDERPSuggestion mutes a suggested relay for a day.
func (a *App) DismissDERPSuggestion(regionID int) {
	if a.derp != nil {
		a.derp.Dismiss(regionID)
	}
}
