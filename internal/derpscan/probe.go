package derpscan

import (
	"bytes"
	"context"
	"crypto/rand"
	"errors"
	"time"

	"tailscale.com/derp"
	"tailscale.com/derp/derphttp"
	"tailscale.com/net/netmon"
	"tailscale.com/tailcfg"
	"tailscale.com/types/key"
	"tailscale.com/types/logger"
)

// ProbeTimeout bounds one region probe.
const ProbeTimeout = 8 * time.Second

const probeRounds = 3

// Probe joins two throwaway clients to region and relays packets between
// them, the same check tailscale's derpprober runs. It returns the best
// round trip seen, which covers us → relay → us.
func Probe(ctx context.Context, region *tailcfg.DERPRegion) (time.Duration, error) {
	if region == nil || len(region.Nodes) == 0 {
		return 0, errors.New("empty region")
	}
	ctx, cancel := context.WithTimeout(ctx, ProbeTimeout)
	defer cancel()

	from, err := dialRegion(ctx, region)
	if err != nil {
		return 0, err
	}
	defer from.Close()
	to, err := dialRegion(ctx, region)
	if err != nil {
		return 0, err
	}
	defer to.Close()

	nonce := make([]byte, 8)
	_, _ = rand.Read(nonce)
	got := make(chan byte, probeRounds*4)
	recvErr := make(chan error, 1)
	src := from.SelfPublicKey()
	go func() {
		for {
			m, err := to.Recv()
			if err != nil {
				recvErr <- err
				return
			}
			p, ok := m.(derp.ReceivedPacket)
			if !ok || p.Source != src || len(p.Data) != len(nonce)+1 || !bytes.Equal(p.Data[:len(nonce)], nonce) {
				continue
			}
			select {
			case got <- p.Data[len(nonce)]:
			default:
			}
		}
	}()

	// The relay may not have registered the receiver yet when the first
	// packet lands, so keep sending until enough rounds come back.
	sentAt := map[byte]time.Time{}
	var seq byte
	send := func() error {
		seq++
		sentAt[seq] = time.Now()
		return from.Send(to.SelfPublicKey(), append(append([]byte{}, nonce...), seq))
	}
	if err := send(); err != nil {
		return 0, err
	}
	tick := time.NewTicker(400 * time.Millisecond)
	defer tick.Stop()
	best := time.Duration(0)
	rounds := 0
	for {
		select {
		case <-ctx.Done():
			if rounds > 0 {
				return best, nil
			}
			return 0, ctx.Err()
		case err := <-recvErr:
			if rounds > 0 {
				return best, nil
			}
			return 0, err
		case s := <-got:
			at, ok := sentAt[s]
			if !ok {
				continue
			}
			delete(sentAt, s)
			rtt := time.Since(at)
			if best == 0 || rtt < best {
				best = rtt
			}
			rounds++
			if rounds >= probeRounds {
				return best, nil
			}
			if err := send(); err != nil {
				return best, nil
			}
		case <-tick.C:
			if err := send(); err != nil {
				return 0, err
			}
		}
	}
}

func dialRegion(ctx context.Context, region *tailcfg.DERPRegion) (*derphttp.Client, error) {
	c := derphttp.NewRegionClient(key.NewNode(), logger.Discard, netmon.NewStatic(), func() *tailcfg.DERPRegion {
		return region
	})
	if err := c.Connect(ctx); err != nil {
		c.Close()
		return nil, err
	}
	return c, nil
}
