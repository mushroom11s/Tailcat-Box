package adapter

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"

	"github.com/tailscale/tailcat"
	"tailscale.com/tailcfg"
)

// applyKeyedServerNet sets the DERP options for a port serve. A tc… address
// embeds the full DERP region, so a fixed key only gives a stable address when
// the region is stable too. With a saved key, the region it last served on is
// reused when it still matches the wanted region (no network lookup needed);
// otherwise the region is picked now and returned as updated key JSON to save.
func (r *Real) applyKeyedServerNet(ctx context.Context, srv *tailcat.Server, opts PortServeOpts) (string, error) {
	net := r.NetworkOpts()
	if region := strings.TrimSpace(opts.Region); region != "" {
		net.Region = region
	}
	if net.DERPMapURL != "" {
		srv.DERPMapURL = net.DERPMapURL
	}
	keyJSON := strings.TrimSpace(opts.IdentityJSON)
	if keyJSON == "" {
		if rid := r.resolveRegionID(ctx, net); rid != 0 {
			srv.RegionID = tailcfg.DERPRegionID(rid)
		}
		return "", nil
	}
	var pk tailcat.PrivateKey
	if err := json.Unmarshal([]byte(keyJSON), &pk); err != nil {
		return "", err
	}
	if len(pk.Public.Region) > 0 && regionMatches(pk.Public.Region[0], net.Region) {
		srv.Region = pk.Public.Region[0]
		return "", nil
	}
	ci := &tailcat.ConnInfo{RegionID: -1}
	if rid := r.resolveRegionID(ctx, net); rid != 0 {
		ci.RegionID = tailcfg.DERPRegionID(rid)
	}
	expandOpts := []any{tailcat.ExpandForServer}
	if net.DERPMapURL != "" {
		expandOpts = append(expandOpts, tailcat.DERPMapURL(net.DERPMapURL))
	}
	if err := ci.Expand(ctx, expandOpts...); err != nil {
		return "", err
	}
	srv.Region = ci.Region[0]
	pk.Public.Region = ci.Region[:1]
	pk.Public.RegionID = 0
	body, err := json.Marshal(pk)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

// regionMatches reports whether a saved region satisfies the wanted region
// setting (ID, code, or name substring; empty/auto accepts any).
func regionMatches(reg *tailcfg.DERPRegion, want string) bool {
	if reg == nil || reg.RegionID == 0 || len(reg.Nodes) == 0 {
		return false
	}
	want = strings.TrimSpace(want)
	if want == "" || strings.EqualFold(want, "auto") {
		return true
	}
	if n, err := strconv.Atoi(want); err == nil {
		return int(reg.RegionID) == n
	}
	return strings.EqualFold(reg.RegionCode, want) ||
		strings.Contains(strings.ToLower(reg.RegionName), strings.ToLower(want))
}
