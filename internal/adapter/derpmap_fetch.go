package adapter

import (
	"context"

	"github.com/tailscale/tailcat"
	"tailscale.com/tailcfg"
)

// FetchOfficialDERPMap returns tailcat's public DERP map.
func FetchOfficialDERPMap(ctx context.Context) (*tailcfg.DERPMap, error) {
	return tailcat.FetchDERPMap(ctx)
}
