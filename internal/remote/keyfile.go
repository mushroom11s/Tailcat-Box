package remote

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

const keyFileName = "remote-key.json"

// SavedKey is the host connection remembered on disk.
// Key and Token are the permanent identity. SessionKey is what should be
// listening after the app starts again, when Active is set.
type SavedKey struct {
	V            int
	Key          string
	Token        string
	Forever      bool
	Active       bool
	SessionKey   string
	SessionToken string
}

type keyDisk struct {
	V            int    `json:"v"`
	Key          string `json:"key,omitempty"`
	Token        string `json:"token,omitempty"`
	Forever      bool   `json:"forever,omitempty"`
	Active       *bool  `json:"active,omitempty"`
	SessionKey   string `json:"sessionKey,omitempty"`
	SessionToken string `json:"sessionToken,omitempty"`
}

// LoadKey reads remote-key.json. A missing file is not an error.
func LoadKey(dir string) (SavedKey, bool) {
	body, err := os.ReadFile(filepath.Join(dir, keyFileName))
	if err != nil {
		return SavedKey{}, false
	}
	var disk keyDisk
	if json.Unmarshal(body, &disk) != nil || disk.V != 1 {
		return SavedKey{}, false
	}
	saved := SavedKey{
		V:            disk.V,
		Key:          strings.TrimSpace(disk.Key),
		Token:        strings.TrimSpace(disk.Token),
		Forever:      disk.Forever,
		SessionKey:   strings.TrimSpace(disk.SessionKey),
		SessionToken: strings.TrimSpace(disk.SessionToken),
	}
	if disk.Active == nil {
		// Older files only stored a permanent key, and it was still in use.
		saved.Active = saved.Key != "" && saved.Token != ""
		saved.Forever = saved.Active
	} else {
		saved.Active = *disk.Active
	}
	return saved, true
}

// SaveKey writes remote-key.json.
func SaveKey(dir string, saved SavedKey) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	active := saved.Active
	disk := keyDisk{
		V:            1,
		Key:          saved.Key,
		Token:        saved.Token,
		Forever:      saved.Forever,
		Active:       &active,
		SessionKey:   saved.SessionKey,
		SessionToken: saved.SessionToken,
	}
	body, err := json.MarshalIndent(disk, "", "\t")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, keyFileName), append(body, '\n'), 0o600)
}

// DeleteKey removes a remembered connection.
func DeleteKey(dir string) error {
	err := os.Remove(filepath.Join(dir, keyFileName))
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// NextHost chooses the key for a new listening session and the file to store.
func (saved SavedKey) NextHost(permanent bool, newKey, newToken string) (key, token string, next SavedKey) {
	next = saved
	next.V = 1
	next.Active = true
	if permanent {
		if next.Key == "" || next.Token == "" {
			next.Key = newKey
			next.Token = newToken
		}
		next.Forever = true
		next.SessionKey = next.Key
		next.SessionToken = next.Token
		return next.Key, next.Token, next
	}
	next.SessionKey = newKey
	next.SessionToken = newToken
	next.Forever = false
	return newKey, newToken, next
}

// Resume is the session to start again after the app launches.
func (saved SavedKey) Resume() (key, token string, forever bool, ok bool) {
	if !saved.Active {
		return "", "", false, false
	}
	if saved.SessionKey != "" && saved.SessionToken != "" {
		return saved.SessionKey, saved.SessionToken, saved.Forever, true
	}
	if saved.Key != "" && saved.Token != "" {
		return saved.Key, saved.Token, true, true
	}
	return "", "", false, false
}

// AfterEnd keeps a permanent identity and drops a temporary session.
// The bool is true when the file should be deleted.
func (saved SavedKey) AfterEnd() (SavedKey, bool) {
	next := saved
	next.Active = false
	next.SessionKey = ""
	next.SessionToken = ""
	if next.Key == "" || next.Token == "" {
		return SavedKey{}, true
	}
	next.Forever = true
	return next, false
}
