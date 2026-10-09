//go:build linux

package tray

import "testing"

func TestLinuxNoTrayEnvMeansUnavailable(t *testing.T) {
	t.Setenv("TAILCAT_NO_TRAY", "1")
	if Available() {
		t.Fatal("Available() should be false with TAILCAT_NO_TRAY")
	}
	New(nil, nil, nil).Start(nil)
}
