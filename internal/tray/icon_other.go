//go:build !windows

package tray

import _ "embed"

// DefaultIcon is the macOS and Linux tray image: the same pixel-art cat as
// build/appicon.png, at 32×32 with a transparent background. macOS shows it
// at 16pt in the menu bar, so the 32px PNG is the @2x Retina image.
//
//go:embed icons/icon32.png
var DefaultIcon []byte
