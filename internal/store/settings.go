package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

const settingsFile = "settings.json"

// Settings holds app-wide network options (CLI --region / --derpmap-url).
type Settings struct {
	Region     string `json:"region"`
	DERPMapURL string `json:"derpMapUrl"`
	// DERPMode "scan" routes new connections through a scanned relay
	// (DERPRegionID); empty means the official map.
	DERPMode     string `json:"derpMode,omitempty"`
	DERPRegionID int    `json:"derpRegionId,omitempty"`
	// DERPKeys holds search-engine API keys by engine id (fofa, zoomeye, …).
	DERPKeys map[string][]string `json:"derpKeys,omitempty"`
	// Legacy single-key fields; migrated into DERPKeys on load.
	FOFAKey     string `json:"fofaKey,omitempty"`
	ZoomEyeKey  string `json:"zoomeyeKey,omitempty"`
	HunterKey   string `json:"hunterKey,omitempty"`
	QuakeKey    string `json:"quakeKey,omitempty"`
	DERPAutoOff bool   `json:"derpAutoOff,omitempty"`
}

func (s *Store) settingsPath() string {
	return filepath.Join(s.Dir, settingsFile)
}

func (s *Store) LoadSettings() (Settings, error) {
	body, err := os.ReadFile(s.settingsPath())
	if err != nil {
		if os.IsNotExist(err) {
			return Settings{}, nil
		}
		return Settings{}, err
	}
	var out Settings
	if err := json.Unmarshal(body, &out); err != nil {
		return Settings{}, err
	}
	if out.MigrateDERPKeys() {
		_ = s.SaveSettings(out)
	}
	return out, nil
}

func (s *Store) SaveSettings(in Settings) error {
	if err := os.MkdirAll(s.Dir, 0o700); err != nil {
		return err
	}
	in.MigrateDERPKeys()
	body, err := json.MarshalIndent(in, "", "\t")
	if err != nil {
		return err
	}
	return os.WriteFile(s.settingsPath(), append(body, '\n'), 0o600)
}

// MigrateDERPKeys folds legacy single keys into DERPKeys and de-dupes.
// It reports whether the struct changed.
func (s *Settings) MigrateDERPKeys() bool {
	changed := false
	if s.DERPKeys == nil {
		s.DERPKeys = map[string][]string{}
	}
	legacy := []struct {
		id  string
		val *string
	}{
		{"fofa", &s.FOFAKey},
		{"zoomeye", &s.ZoomEyeKey},
		{"hunter", &s.HunterKey},
		{"quake", &s.QuakeKey},
	}
	for _, L := range legacy {
		key := strings.TrimSpace(*L.val)
		if key == "" {
			continue
		}
		if !containsKey(s.DERPKeys[L.id], key) {
			s.DERPKeys[L.id] = append(s.DERPKeys[L.id], key)
			changed = true
		}
		*L.val = ""
		changed = true
	}
	for id, keys := range s.DERPKeys {
		clean := uniqueKeys(keys)
		if len(clean) == 0 {
			delete(s.DERPKeys, id)
			changed = true
			continue
		}
		if len(clean) != len(keys) {
			s.DERPKeys[id] = clean
			changed = true
		}
	}
	if len(s.DERPKeys) == 0 {
		s.DERPKeys = nil
	}
	return changed
}

// EngineKeys returns a copy of the key list for engine.
func (s Settings) EngineKeys(engine string) []string {
	return append([]string{}, s.DERPKeys[engine]...)
}

// SetEngineKeys replaces the key list for engine.
func (s *Settings) SetEngineKeys(engine string, keys []string) {
	if s.DERPKeys == nil {
		s.DERPKeys = map[string][]string{}
	}
	clean := uniqueKeys(keys)
	if len(clean) == 0 {
		delete(s.DERPKeys, engine)
		if len(s.DERPKeys) == 0 {
			s.DERPKeys = nil
		}
		return
	}
	s.DERPKeys[engine] = clean
}

// AddEngineKey appends key when it is new.
func (s *Settings) AddEngineKey(engine, key string) bool {
	key = strings.TrimSpace(key)
	if key == "" {
		return false
	}
	if containsKey(s.DERPKeys[engine], key) {
		return false
	}
	s.SetEngineKeys(engine, append(s.EngineKeys(engine), key))
	return true
}

// RemoveEngineKey drops the key at index.
func (s *Settings) RemoveEngineKey(engine string, index int) bool {
	keys := s.EngineKeys(engine)
	if index < 0 || index >= len(keys) {
		return false
	}
	s.SetEngineKeys(engine, append(keys[:index], keys[index+1:]...))
	return true
}

func uniqueKeys(in []string) []string {
	var out []string
	for _, k := range in {
		k = strings.TrimSpace(k)
		if k == "" || containsKey(out, k) {
			continue
		}
		out = append(out, k)
	}
	return out
}

func containsKey(keys []string, want string) bool {
	for _, k := range keys {
		if k == want {
			return true
		}
	}
	return false
}
