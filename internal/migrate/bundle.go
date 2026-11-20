package migrate

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	Version   = 1
	Kind      = "tailcat-box-config"
	maxFile   = 1 << 20
	maxBundle = 8 << 20
)

// ErrNotConfig means the file is not a Tailcat Box config export.
var ErrNotConfig = errors.New("This is not a Tailcat Box config file.")

// ErrTooLarge means the file or one of its pieces is bigger than a config export should be.
var ErrTooLarge = errors.New("That config file is too large.")

// ErrBadPath means a stored path would leave the config directories.
var ErrBadPath = errors.New("That config file is not valid.")

// LocalKeys are the webview preferences that travel with a config file.
var LocalKeys = []string{
	"tailcat-locale",
	"tailcat-theme",
	"tailcat-nickname",
	"tailcat-peer-remarks",
	"tailcat-port-mappings",
	"tailcat-remote-trust",
	"tailcat-remote-recent",
	"tailcat-remote-visitors",
	"tailcat-remote-controlled",
	"tailcat-remote-mine",
	"tailcat-remote-history",
	"tailcat-room-pins",
	"tailcat-desktop-notify",
	"tailcat-miao-chunk-streams",
	"tailcat-onboarding-seen",
}

// Bundle is one machine's Tailcat Box setup, without chat history or file transfers.
type Bundle struct {
	V          int               `json:"v"`
	Kind       string            `json:"kind"`
	ExportedAt string            `json:"exportedAt"`
	Files      map[string]string `json:"files"`
	Local      map[string]string `json:"local"`
}

// ParseLocal reads the webview preferences the page sends with an export.
func ParseLocal(raw string) (map[string]string, error) {
	if strings.TrimSpace(raw) == "" {
		return map[string]string{}, nil
	}
	var in map[string]string
	if err := json.Unmarshal([]byte(raw), &in); err != nil {
		return nil, ErrNotConfig
	}
	return filterLocal(in), nil
}

// Collect reads the desktop settings, keys, and the given webview preferences.
func Collect(settingsDir, keysDir string, local map[string]string) (Bundle, error) {
	files := map[string]string{}
	for _, name := range []string{"settings.json", "remote-key.json", "ssh.json"} {
		if err := addFile(files, settingsDir, name, name); err != nil {
			return Bundle{}, err
		}
	}
	if files["settings.json"] != "" {
		files["settings.json"] = string(scrubSettings([]byte(files["settings.json"])))
	}
	ents, err := os.ReadDir(keysDir)
	if err != nil && !os.IsNotExist(err) {
		return Bundle{}, err
	}
	for _, ent := range ents {
		if ent.IsDir() {
			continue
		}
		name := ent.Name()
		if name != "settings.json" {
			continue
		}
		if err := addFile(files, keysDir, name, "keys/"+name); err != nil {
			return Bundle{}, err
		}
	}
	return Bundle{
		V:          Version,
		Kind:       Kind,
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		Files:      files,
		Local:      filterLocal(local),
	}, nil
}

// Select keeps the pieces named in sections. An empty list keeps the whole bundle.
// Section names: network, startup, ssh, remote, profile, tunnel, appearance.
// Private keys and the lasting control key stay on this computer.
func Select(b Bundle, sections []string) Bundle {
	if len(sections) == 0 {
		return b
	}
	want := map[string]bool{}
	for _, name := range sections {
		want[strings.TrimSpace(name)] = true
	}
	files := map[string]string{}
	for name, body := range b.Files {
		if fileSection(name, want) {
			files[name] = body
		}
	}
	local := map[string]string{}
	for key, value := range b.Local {
		if localSection(key, want) {
			local[key] = value
		}
	}
	b.Files = files
	b.Local = local
	return b
}

func fileSection(name string, want map[string]bool) bool {
	switch name {
	case "settings.json":
		return want["startup"]
	case "ssh.json":
		return want["ssh"]
	case "remote-key.json":
		return false
	case "keys/settings.json":
		return want["network"]
	}
	return false
}

func localSection(key string, want map[string]bool) bool {
	switch key {
	case "tailcat-nickname", "tailcat-peer-remarks":
		return want["profile"]
	case "tailcat-port-mappings":
		return want["tunnel"]
	case "tailcat-locale", "tailcat-theme", "tailcat-desktop-notify", "tailcat-room-pins", "tailcat-onboarding-seen":
		return want["appearance"]
	case "tailcat-remote-trust", "tailcat-remote-recent", "tailcat-remote-visitors", "tailcat-remote-controlled", "tailcat-remote-mine", "tailcat-remote-history":
		return want["remote"]
	case "tailcat-miao-chunk-streams":
		return want["startup"]
	default:
		return want["appearance"]
	}
}

// Encode writes a bundle as indented JSON.
func Encode(b Bundle) ([]byte, error) {
	body, err := json.MarshalIndent(b, "", "\t")
	if err != nil {
		return nil, err
	}
	body = append(body, '\n')
	if len(body) > maxBundle {
		return nil, ErrTooLarge
	}
	return body, nil
}

// Parse reads a bundle and checks its kind.
func Parse(raw []byte) (Bundle, error) {
	if len(raw) > maxBundle {
		return Bundle{}, ErrTooLarge
	}
	var b Bundle
	if err := json.Unmarshal(raw, &b); err != nil || b.V != Version || b.Kind != Kind {
		return Bundle{}, ErrNotConfig
	}
	if b.Files == nil {
		b.Files = map[string]string{}
	}
	b.Local = filterLocal(b.Local)
	return b, nil
}

// Apply writes the bundle's files into the settings and key directories.
func Apply(settingsDir, keysDir string, b Bundle) error {
	if b.V != Version || b.Kind != Kind {
		return ErrNotConfig
	}
	for name, body := range b.Files {
		rel, err := safeRel(name)
		if err != nil {
			return err
		}
		raw := []byte(body)
		if len(raw) == 0 || len(raw) > maxFile || !utf8.Valid(raw) || !json.Valid(raw) {
			return ErrNotConfig
		}
		var dir, base string
		if rel == "remote-key.json" {
			continue
		}
		if rest, ok := strings.CutPrefix(rel, "keys/"); ok {
			if strings.HasSuffix(rest, ".private.json") {
				continue
			}
			dir, base = keysDir, rest
		} else {
			dir, base = settingsDir, rel
		}
		if err := writeInside(dir, base, raw); err != nil {
			return err
		}
	}
	return nil
}

// LocalJSON is the webview half of a bundle, for the page to restore.
func LocalJSON(b Bundle) (string, error) {
	body, err := json.Marshal(filterLocal(b.Local))
	if err != nil {
		return "", err
	}
	return string(body), nil
}

func addFile(files map[string]string, dir, name, rel string) error {
	body, err := os.ReadFile(filepath.Join(dir, name))
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if len(body) > maxFile || !utf8.Valid(body) {
		return ErrTooLarge
	}
	files[rel] = string(body)
	return nil
}

func filterLocal(in map[string]string) map[string]string {
	allowed := map[string]bool{}
	for _, key := range LocalKeys {
		allowed[key] = true
	}
	out := map[string]string{}
	for key, value := range in {
		if !allowed[key] || value == "" || len(value) > maxFile {
			continue
		}
		out[key] = value
	}
	return out
}

func safeRel(name string) (string, error) {
	name = strings.TrimSpace(strings.ReplaceAll(name, `\`, "/"))
	if name == "" || strings.HasPrefix(name, "/") || strings.Contains(name, "..") {
		return "", ErrBadPath
	}
	switch name {
	case "settings.json", "remote-key.json", "ssh.json":
		return name, nil
	}
	rest, ok := strings.CutPrefix(name, "keys/")
	if !ok || rest == "" || strings.Contains(rest, "/") {
		return "", ErrBadPath
	}
	if rest == "settings.json" {
		return name, nil
	}
	base, ok := strings.CutSuffix(rest, ".private.json")
	if !ok || base == "" || base == "." || strings.ContainsAny(base, `/\`) {
		return "", ErrBadPath
	}
	return name, nil
}

func scrubSettings(body []byte) []byte {
	var doc map[string]json.RawMessage
	if json.Unmarshal(body, &doc) != nil {
		return body
	}
	raw, ok := doc["Update"]
	if !ok {
		return body
	}
	var upd map[string]json.RawMessage
	if json.Unmarshal(raw, &upd) != nil {
		return body
	}
	if _, exists := upd["DownloadedPath"]; !exists {
		return body
	}
	delete(upd, "DownloadedPath")
	next, err := json.Marshal(upd)
	if err != nil {
		return body
	}
	doc["Update"] = next
	out, err := json.MarshalIndent(doc, "", "\t")
	if err != nil {
		return body
	}
	return append(out, '\n')
}

func writeInside(dir, name string, body []byte) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	dest := filepath.Join(dir, name)
	rel, err := filepath.Rel(dir, dest)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return ErrBadPath
	}
	return os.WriteFile(dest, body, 0o600)
}
