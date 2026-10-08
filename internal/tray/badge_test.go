package tray

import (
	"bytes"
	"image"
	"image/png"
	"os"
	"testing"
)

func TestBadgePNGAddsRedMark(t *testing.T) {
	raw, err := os.ReadFile("icons/icon32.png")
	if err != nil {
		t.Fatal(err)
	}
	if redPixels(t, raw) != 0 {
		t.Fatal("idle tray icon already has a red mark")
	}
	marked, err := BadgeIcon(raw)
	if err != nil {
		t.Fatal(err)
	}
	if redPixels(t, marked) == 0 {
		t.Fatal("unread tray icon has no red mark")
	}
	img, err := png.Decode(bytes.NewReader(marked))
	if err != nil {
		t.Fatal(err)
	}
	if img.Bounds().Dx() != 32 || img.Bounds().Dy() != 32 {
		t.Fatalf("badge changed icon size: %v", img.Bounds())
	}
}

func TestBadgeICOKeepsEverySize(t *testing.T) {
	raw, err := os.ReadFile("icons/icon.ico")
	if err != nil {
		t.Fatal(err)
	}
	marked, err := BadgeIcon(raw)
	if err != nil {
		t.Fatal(err)
	}
	if !isICO(marked) {
		t.Fatal("windows unread icon must stay an ico")
	}
	if marked[4] != raw[4] || marked[5] != raw[5] {
		t.Fatal("badge dropped an ico image")
	}
	// The 32px image is the third entry.
	pngBytes := icoImage(t, marked, 2)
	if redPixels(t, pngBytes) == 0 {
		t.Fatal("unread ico has no red mark")
	}
}

func icoImage(t *testing.T, data []byte, index int) []byte {
	t.Helper()
	off := 6 + index*16
	size := int(data[off+8]) | int(data[off+9])<<8 | int(data[off+10])<<16 | int(data[off+11])<<24
	start := int(data[off+12]) | int(data[off+13])<<8 | int(data[off+14])<<16 | int(data[off+15])<<24
	if start < 0 || size <= 0 || start+size > len(data) {
		t.Fatalf("bad ico entry %d", index)
	}
	return data[start : start+size]
}

func redPixels(t *testing.T, data []byte) int {
	t.Helper()
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			r, g, bl, a := img.At(x, y).RGBA()
			if a > 0x8000 && r > 0xC000 && g < 0x4000 && bl < 0x4000 {
				n++
			}
		}
	}
	return n
}

func TestScoopFramesComeFromPackagedGIF(t *testing.T) {
	frames := scoopFrames()
	if len(frames) < 100 {
		t.Fatalf("scoop frames = %d, want the packaged gif", len(frames))
	}
	var opaque, clear int
	img, err := png.Decode(bytes.NewReader(frames[0].plain))
	if err != nil {
		t.Fatal(err)
	}
	if img.Bounds().Dx() != scoopSide || img.Bounds().Dy() != scoopSide {
		t.Fatalf("frame size %v", img.Bounds())
	}
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			_, _, _, a := img.At(x, y).RGBA()
			if a == 0 {
				clear++
			} else if a > 0x8000 {
				opaque++
			}
		}
	}
	if opaque == 0 || clear == 0 {
		t.Fatalf("opaque=%d clear=%d, frame should keep the cat and its clear background", opaque, clear)
	}
	if frames[0].delay < 10*1e6 { // 10ms, time.Duration
		t.Fatalf("delay %s", frames[0].delay)
	}
	second, err := png.Decode(bytes.NewReader(frames[len(frames)/2].plain))
	if err != nil {
		t.Fatal(err)
	}
	if sameImage(img, second) {
		t.Fatal("scoop frames do not move")
	}
	if redPixels(t, frames[0].plain) != 0 {
		t.Fatal("plain scoop frame already has the unread mark")
	}
	if redPixels(t, frames[0].marked) == 0 {
		t.Fatal("marked scoop frame has no red mark")
	}
}

func sameImage(a, b image.Image) bool {
	if a.Bounds() != b.Bounds() {
		return false
	}
	for y := a.Bounds().Min.Y; y < a.Bounds().Max.Y; y++ {
		for x := a.Bounds().Min.X; x < a.Bounds().Max.X; x++ {
			ar, ag, ab, aa := a.At(x, y).RGBA()
			br, bg, bb, ba := b.At(x, y).RGBA()
			if ar != br || ag != bg || ab != bb || aa != ba {
				return false
			}
		}
	}
	return true
}
