package tray

import (
	"bytes"
	"image/png"
	"os"
	"strings"
	"sync"
	"testing"
)

func TestMenuTemplateIsGrayAlphaNotColorCat(t *testing.T) {
	data, err := os.ReadFile("icons/menu_template.png")
	if err != nil {
		t.Fatal(err)
	}
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	bounds := img.Bounds()
	if bounds.Dx() != 22 || bounds.Dy() != 22 {
		t.Fatalf("size=%v, want 22x22 menu-bar template", bounds)
	}
	_, _, _, corner := img.At(0, 0).RGBA()
	if corner != 0 {
		t.Fatalf("corner alpha=%d, background should be clear", corner)
	}
	var opaque, partial int
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, a := img.At(x, y).RGBA()
			if r != 0 || g != 0 || b != 0 {
				t.Fatalf("color pixel at %d,%d (%d,%d,%d); template must be black + alpha", x, y, r, g, b)
			}
			if a == 0xffff {
				opaque++
			} else if a > 0 {
				partial++
			}
		}
	}
	if opaque < 40 {
		t.Fatalf("opaque pixels=%d, cat body missing", opaque)
	}
	if partial < 20 {
		t.Fatalf("partial alpha=%d, ears/tray/shirt detail missing", partial)
	}
	color, err := os.ReadFile("icons/icon32.png")
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(data, color) {
		t.Fatal("template icon is the full-color tray PNG")
	}
	darwin := nonCommentCode(t, "tray_install_darwin.go")
	if !strings.Contains(darwin, "SetTemplateIcon(") {
		t.Fatal("darwin status item must be a template image")
	}
	if strings.Contains(darwin, "SetIcon(") {
		t.Fatal("darwin must not rest on the color PNG; only scoop frames are color")
	}
	if !strings.Contains(darwin, "bindIcons(icon, setTemplate, systray.SetIcon, BadgeTemplate)") {
		t.Fatal("darwin must rest on the template, mark unread on the template, and play scoop frames in color")
	}
}

func TestBadgeTemplateStaysTemplate(t *testing.T) {
	data, err := os.ReadFile("icons/menu_template.png")
	if err != nil {
		t.Fatal(err)
	}
	marked, err := BadgeTemplate(data)
	if err != nil {
		t.Fatal(err)
	}
	img, err := png.Decode(bytes.NewReader(marked))
	if err != nil {
		t.Fatal(err)
	}
	if img.Bounds().Dx() != 22 || img.Bounds().Dy() != 22 {
		t.Fatalf("badge changed template size: %v", img.Bounds())
	}
	plain, _ := png.Decode(bytes.NewReader(data))
	changed := 0
	for y := 0; y < 22; y++ {
		for x := 0; x < 22; x++ {
			r, g, b, a := img.At(x, y).RGBA()
			if (r != 0 || g != 0 || b != 0) && a != 0 {
				t.Fatalf("color pixel at %d,%d; unread template must stay black + alpha", x, y)
			}
			_, _, _, pa := plain.At(x, y).RGBA()
			if pa != a {
				changed++
			}
		}
	}
	if changed == 0 {
		t.Fatal("unread template has no mark")
	}
	// Dot centre is solid; bottom-left of the head is untouched.
	if _, _, _, a := img.At(18, 3).RGBA(); a != 0xffff {
		t.Fatalf("dot centre alpha=%d", a)
	}
}

func TestTemplateIconsRestAndColorScoop(t *testing.T) {
	tpl, err := os.ReadFile("icons/menu_template.png")
	if err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	var idle, frames [][]byte
	c := New(nil, nil, nil)
	c.bindIcons(tpl,
		func(b []byte) { mu.Lock(); idle = append(idle, b); mu.Unlock() },
		func(b []byte) { mu.Lock(); frames = append(frames, b); mu.Unlock() },
		BadgeTemplate)
	if len(idle) != 1 || !bytes.Equal(idle[0], tpl) {
		t.Fatal("idle icon is not the template")
	}
	c.SetUnread(true)
	if len(idle) != 2 || bytes.Equal(idle[1], tpl) || redPixels(t, idle[1]) != 0 {
		t.Fatal("unread must be the template with a template dot, not red")
	}
	c.playScoop()
	mu.Lock()
	defer mu.Unlock()
	if len(frames) < 100 {
		t.Fatalf("scoop frames on the frame setter = %d", len(frames))
	}
	if redPixels(t, frames[0]) == 0 {
		t.Fatal("color scoop frames keep the red unread mark")
	}
	last := idle[len(idle)-1]
	if bytes.Equal(last, tpl) || redPixels(t, last) != 0 {
		t.Fatal("after the scoop the template with unread dot must come back")
	}
}
