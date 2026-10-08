package tray

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
)

// BadgeIcon returns icon with a red mark in the corner.
// icon is a PNG or a PNG-compressed ICO, the same bytes the tray already uses.
func BadgeIcon(icon []byte) ([]byte, error) {
	if isPNG(icon) {
		return badgePNG(icon)
	}
	if isICO(icon) {
		return badgeICO(icon)
	}
	return nil, fmt.Errorf("unsupported tray icon")
}

func isPNG(b []byte) bool {
	return len(b) >= 8 && bytes.Equal(b[:8], []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
}

func isICO(b []byte) bool {
	return len(b) >= 6 && b[0] == 0 && b[1] == 0 && b[2] == 1 && b[3] == 0
}

func badgePNG(data []byte) ([]byte, error) {
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	marked := image.NewRGBA(img.Bounds())
	draw.Draw(marked, marked.Bounds(), img, img.Bounds().Min, draw.Src)
	paintDot(marked)
	return encodePNG(marked)
}

func badgeICO(data []byte) ([]byte, error) {
	count := int(binary.LittleEndian.Uint16(data[4:6]))
	if count <= 0 || len(data) < 6+count*16 {
		return nil, fmt.Errorf("bad tray ico")
	}
	type part struct {
		hdr  []byte
		png  []byte
		w, h int
	}
	parts := make([]part, 0, count)
	for i := 0; i < count; i++ {
		hdr := append([]byte(nil), data[6+i*16:6+(i+1)*16]...)
		size := int(binary.LittleEndian.Uint32(hdr[8:12]))
		off := int(binary.LittleEndian.Uint32(hdr[12:16]))
		if size <= 0 || off < 0 || off+size > len(data) {
			return nil, fmt.Errorf("bad tray ico image")
		}
		raw := data[off : off+size]
		if !isPNG(raw) {
			return nil, fmt.Errorf("tray ico image is not png")
		}
		img, err := png.Decode(bytes.NewReader(raw))
		if err != nil {
			return nil, err
		}
		marked := image.NewRGBA(img.Bounds())
		draw.Draw(marked, marked.Bounds(), img, img.Bounds().Min, draw.Src)
		paintDot(marked)
		encoded, err := encodePNG(marked)
		if err != nil {
			return nil, err
		}
		parts = append(parts, part{hdr: hdr, png: encoded, w: marked.Bounds().Dx(), h: marked.Bounds().Dy()})
	}
	out := make([]byte, 6, 6+count*16)
	copy(out, data[:6])
	blobs := make([]byte, 0)
	off := 6 + count*16
	for _, part := range parts {
		hdr := part.hdr
		hdr[0] = icoDim(part.w)
		hdr[1] = icoDim(part.h)
		binary.LittleEndian.PutUint32(hdr[8:12], uint32(len(part.png)))
		binary.LittleEndian.PutUint32(hdr[12:16], uint32(off))
		out = append(out, hdr...)
		blobs = append(blobs, part.png...)
		off += len(part.png)
	}
	return append(out, blobs...), nil
}

func icoDim(n int) byte {
	if n >= 256 {
		return 0
	}
	return byte(n)
}

func encodePNG(img image.Image) ([]byte, error) {
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// paintDot draws a solid red circle at the top-right of dst.
func paintDot(dst *image.RGBA) {
	b := dst.Bounds()
	r := b.Dx() / 6
	if r < 2 {
		r = 2
	}
	cx := b.Max.X - r - 1
	cy := b.Min.Y + r + 1
	col := color.RGBA{R: 0xE8, G: 0x22, B: 0x22, A: 0xFF}
	for y := cy - r; y <= cy+r; y++ {
		for x := cx - r; x <= cx+r; x++ {
			if x < b.Min.X || y < b.Min.Y || x >= b.Max.X || y >= b.Max.Y {
				continue
			}
			dx, dy := x-cx, y-cy
			if dx*dx+dy*dy <= r*r {
				dst.SetRGBA(x, y, col)
			}
		}
	}
}

func pngAsICO(pngBytes []byte, w, h int) []byte {
	out := make([]byte, 22+len(pngBytes))
	out[2] = 1
	out[4] = 1
	out[6] = icoDim(w)
	out[7] = icoDim(h)
	binary.LittleEndian.PutUint16(out[10:12], 1)
	binary.LittleEndian.PutUint16(out[12:14], 32)
	binary.LittleEndian.PutUint32(out[14:18], uint32(len(pngBytes)))
	binary.LittleEndian.PutUint32(out[18:22], 22)
	copy(out[22:], pngBytes)
	return out
}

// BadgeTemplate marks a macOS template icon (black + alpha). A template can
// only carry alpha, so AppKit would tint a red dot like the rest of the cat.
// Instead the mark is a smooth solid dot in the same corner, cut free of the
// cat by a clear ring, and the system tints it with the head.
func BadgeTemplate(icon []byte) ([]byte, error) {
	if !isPNG(icon) {
		return nil, fmt.Errorf("unsupported template icon")
	}
	img, err := png.Decode(bytes.NewReader(icon))
	if err != nil {
		return nil, err
	}
	marked := image.NewNRGBA(img.Bounds())
	draw.Draw(marked, marked.Bounds(), img, img.Bounds().Min, draw.Src)
	b := marked.Bounds()
	r := float64(b.Dx()) * 0.16
	ring := r + 1.4
	cx := float64(b.Max.X) - r - 0.5
	cy := float64(b.Min.Y) + r + 0.5
	const sub = 4
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			var in, gap int
			for sy := 0; sy < sub; sy++ {
				for sx := 0; sx < sub; sx++ {
					dx := float64(x) + (float64(sx)+0.5)/sub - cx
					dy := float64(y) + (float64(sy)+0.5)/sub - cy
					d := dx*dx + dy*dy
					if d <= r*r {
						in++
					} else if d <= ring*ring {
						gap++
					}
				}
			}
			if in == 0 && gap == 0 {
				continue
			}
			// Dot coverage wins, the ring clears the cat, the rest keeps it.
			old := float64(marked.NRGBAAt(x, y).A)
			keep := float64(sub*sub-in-gap) / (sub * sub)
			a := float64(in)/(sub*sub)*255 + old*keep
			if a > 255 {
				a = 255
			}
			marked.SetNRGBA(x, y, color.NRGBA{A: uint8(a + 0.5)})
		}
	}
	return encodePNG(marked)
}
