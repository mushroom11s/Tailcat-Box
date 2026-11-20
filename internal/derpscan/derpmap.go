package derpscan

import (
	"fmt"
	"strconv"

	"tailscale.com/tailcfg"
)

const (
	// FirstRegionID and LastRegionID bound scanned regions so they never
	// collide with the official map's region IDs.
	FirstRegionID = 900
	LastRegionID  = 999
	MaxRegions    = LastRegionID - FirstRegionID + 1
)

// BuildMap gives every asset its own region, starting at FirstRegionID.
// Scanned relays mostly run on bare IPs with self-signed certificates,
// so nodes skip certificate checks; WireGuard still encrypts the payload.
func BuildMap(assets []Asset) *tailcfg.DERPMap {
	dm := &tailcfg.DERPMap{Regions: map[tailcfg.DERPRegionID]*tailcfg.DERPRegion{}, OmitDefaultRegions: true}
	id := FirstRegionID
	for _, a := range assets {
		if id > LastRegionID {
			break
		}
		port, err := strconv.Atoi(a.Port)
		if err != nil || port <= 0 || port > 65535 || a.IP == "" {
			continue
		}
		label := a.IP
		if a.Domain != "" {
			label = a.Domain
		}
		rid := tailcfg.DERPRegionID(id)
		node := &tailcfg.DERPNode{
			Name:             fmt.Sprintf("%d-%s", id, label),
			RegionID:         rid,
			DERPPort:         port,
			InsecureForTests: true,
		}
		if a.Domain != "" {
			node.HostName = a.Domain
		} else {
			node.HostName = a.IP
			node.IPv4 = a.IP
		}
		dm.Regions[rid] = &tailcfg.DERPRegion{
			RegionID:   rid,
			RegionCode: fmt.Sprintf("custom%d", id),
			RegionName: a.City,
			Nodes:      []*tailcfg.DERPNode{node},
		}
		id++
	}
	return dm
}

// KeepRegions returns a copy of dm holding only scanned regions in ok.
func KeepRegions(dm *tailcfg.DERPMap, ok map[int]bool) *tailcfg.DERPMap {
	out := &tailcfg.DERPMap{Regions: map[tailcfg.DERPRegionID]*tailcfg.DERPRegion{}, OmitDefaultRegions: true}
	if dm == nil {
		return out
	}
	for rid, r := range dm.Regions {
		id := int(rid)
		if ok[id] && id >= FirstRegionID && id <= LastRegionID {
			out.Regions[rid] = r
		}
	}
	return out
}
