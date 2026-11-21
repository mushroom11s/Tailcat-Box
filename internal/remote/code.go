package remote

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"strings"
)

func randomToken() (string, error) {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// EncodeCode packs a Tailcat address and token into the connection code.
type codePack struct {
	A string `json:"a"`
	T string `json:"t"`
}

func EncodeCode(addr, token string) string {
	raw, err := json.Marshal(codePack{A: addr, T: token})
	if err != nil {
		return ""
	}
	return "rc1." + base64.RawURLEncoding.EncodeToString(raw)
}

// ParseCode reads a connection code, including one embedded in other text.
func ParseCode(raw string) (addr, token string, ok bool) {
	idx := strings.Index(raw, "rc1.")
	if idx < 0 {
		return "", "", false
	}
	enc := raw[idx+4:]
	if cut := strings.IndexAny(enc, " \t\r\n"); cut >= 0 {
		enc = enc[:cut]
	}
	buf, err := base64.RawURLEncoding.DecodeString(enc)
	if err != nil || len(buf) == 0 {
		return "", "", false
	}
	var packed codePack
	if err := json.Unmarshal(buf, &packed); err != nil {
		return "", "", false
	}
	addr = strings.TrimSpace(packed.A)
	token = packed.T
	if !strings.HasPrefix(addr, "tc") || token == "" {
		return "", "", false
	}
	return addr, token, true
}
