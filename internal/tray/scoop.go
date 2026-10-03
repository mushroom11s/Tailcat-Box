package tray

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	"sync"
	"time"

	_ "embed"
)

// scoopGIF is the packaged litter-box cat (frontend/src/assets/loading-cat.gif).
// Tray clicks play these frames. They are not redrawn.
//
//go:embed icons/loading-cat.gif
var scoopGIF []byte

type scoopFrame struct {
	delay  time.Duration
	plain  []byte
	marked []byte
}

var (
	scoopOnce   sync.Once
	scoopCached []scoopFrame
)

func warmScoop() {
	_ = scoopFrames()
}

func scoopFrames() []scoopFrame {
	scoopOnce.Do(func() {
		scoopCached = decodeScoop(scoopGIF)
	})
	return scoopCached
}

const scoopSide = 32

func decodeScoop(data []byte) []scoopFrame {
	g, err := gif.DecodeAll(bytes.NewReader(data))
	if err != nil || len(g.Image) == 0 || g.Config.Width == 0 || g.Config.Height == 0 {
		return nil
	}
	canvas := image.NewRGBA(image.Rect(0, 0, g.Config.Width, g.Config.Height))
	backup := image.NewRGBA(canvas.Bounds())
	out := make([]scoopFrame, 0, len(g.Image))
	for i, pal := range g.Image {
		disposal := byte(0)
		if i < len(g.Disposal) {
			disposal = g.Disposal[i]
		}
		if disposal == gif.DisposalPrevious {
			draw.Draw(backup, backup.Bounds(), canvas, image.Point{}, draw.Src)
		}
		draw.Draw(canvas, pal.Bounds(), pal, pal.Bounds().Min, draw.Over)
		snap := image.NewRGBA(canvas.Bounds())
		draw.Draw(snap, snap.Bounds(), canvas, image.Point{}, draw.Src)
		fitted := fitNearest(snap, scoopSide)
		marked := image.NewRGBA(fitted.Bounds())
		draw.Draw(marked, marked.Bounds(), fitted, fitted.Bounds().Min, draw.Src)
		paintDot(marked)
		plain, err := frameIcon(fitted)
		if err != nil {
			return nil
		}
		badged, err := frameIcon(marked)
		if err != nil {
			return nil
		}
		delay := 30 * time.Millisecond
		if i < len(g.Delay) && g.Delay[i] > 0 {
			delay = time.Duration(g.Delay[i]) * 10 * time.Millisecond
		}
		out = append(out, scoopFrame{delay: delay, plain: plain, marked: badged})
		switch disposal {
		case gif.DisposalBackground:
			clearRect(canvas, pal.Bounds())
		case gif.DisposalPrevious:
			draw.Draw(canvas, canvas.Bounds(), backup, image.Point{}, draw.Src)
		}
	}
	return out
}

func frameIcon(img *image.RGBA) ([]byte, error) {
	pngBytes, err := encodePNG(img)
	if err != nil {
		return nil, err
	}
	if icoTrayIcon() {
		return pngAsICO(pngBytes, img.Bounds().Dx(), img.Bounds().Dy()), nil
	}
	return pngBytes, nil
}

func clearRect(dst *image.RGBA, r image.Rectangle) {
	r = r.Intersect(dst.Bounds())
	for y := r.Min.Y; y < r.Max.Y; y++ {
		for x := r.Min.X; x < r.Max.X; x++ {
			dst.SetRGBA(x, y, color.RGBA{})
		}
	}
}

// fitNearest scales src into a square of side, letterboxed, nearest-neighbor
// so the pixel-art cat stays the packaged art.
func fitNearest(src image.Image, side int) *image.RGBA {
	b := src.Bounds()
	sw, sh := b.Dx(), b.Dy()
	dst := image.NewRGBA(image.Rect(0, 0, side, side))
	if sw <= 0 || sh <= 0 {
		return dst
	}
	dw, dh := side, side
	if sw > sh {
		dh = sh * side / sw
	} else if sh > sw {
		dw = sw * side / sh
	}
	if dw < 1 {
		dw = 1
	}
	if dh < 1 {
		dh = 1
	}
	ox := (side - dw) / 2
	oy := (side - dh) / 2
	for y := 0; y < dh; y++ {
		sy := b.Min.Y + y*sh/dh
		for x := 0; x < dw; x++ {
			sx := b.Min.X + x*sw/dw
			dst.Set(ox+x, oy+y, src.At(sx, sy))
		}
	}
	return dst
}
