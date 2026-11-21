//go:build darwin

package remote

/*
#cgo LDFLAGS: -framework CoreGraphics -framework CoreFoundation
#include <CoreGraphics/CoreGraphics.h>

// cgo cannot call the variadic CGEventCreateScrollWheelEvent directly
// ("unexpected type: ..."). This helper keeps the call in C.
static CGEventRef createScrollWheel(int32_t dy) {
	return CGEventCreateScrollWheelEvent(NULL, kCGScrollEventUnitLine, 1, dy);
}
*/
import "C"
import "sync"

func openInjector() Injector { return &darwinInjector{} }

type darwinInjector struct {
	mu sync.Mutex
	x  float64
	y  float64
}

func (d *darwinInjector) point() C.CGPoint {
	d.mu.Lock()
	x, y := d.x, d.y
	d.mu.Unlock()
	w := float64(C.CGDisplayPixelsWide(C.CGMainDisplayID()))
	h := float64(C.CGDisplayPixelsHigh(C.CGMainDisplayID()))
	return C.CGPointMake(C.double(x*w), C.double(y*h))
}

func (d *darwinInjector) Move(x, y float64) error {
	d.mu.Lock()
	d.x, d.y = x, y
	d.mu.Unlock()
	ev := C.CGEventCreateMouseEvent(0, C.kCGEventMouseMoved, d.point(), C.kCGMouseButtonLeft)
	if ev == 0 {
		return ErrInput
	}
	defer C.CFRelease(C.CFTypeRef(ev))
	C.CGEventPost(C.kCGHIDEventTap, ev)
	return nil
}

func (d *darwinInjector) Button(button string, down bool) error {
	kind := C.CGEventType(C.kCGEventLeftMouseDown)
	cgBtn := C.CGMouseButton(C.kCGMouseButtonLeft)
	if !down {
		kind = C.kCGEventLeftMouseUp
	}
	switch button {
	case "right":
		cgBtn = C.kCGMouseButtonRight
		kind = C.kCGEventRightMouseDown
		if !down {
			kind = C.kCGEventRightMouseUp
		}
	case "middle":
		cgBtn = C.kCGMouseButtonCenter
		kind = C.kCGEventOtherMouseDown
		if !down {
			kind = C.kCGEventOtherMouseUp
		}
	}
	ev := C.CGEventCreateMouseEvent(0, kind, d.point(), cgBtn)
	if ev == 0 {
		return ErrInput
	}
	defer C.CFRelease(C.CFTypeRef(ev))
	C.CGEventPost(C.kCGHIDEventTap, ev)
	return nil
}

func (darwinInjector) Wheel(dy int) error {
	ev := C.createScrollWheel(C.int32_t(-dy))
	if ev == 0 {
		return ErrInput
	}
	defer C.CFRelease(C.CFTypeRef(ev))
	C.CGEventPost(C.kCGHIDEventTap, ev)
	return nil
}

func (darwinInjector) Key(code string, down bool) error {
	keys, ok := domKey(code)
	if !ok {
		return nil
	}
	ev := C.CGEventCreateKeyboardEvent(0, C.CGKeyCode(keys.mac), C.bool(down))
	if ev == 0 {
		return ErrInput
	}
	defer C.CFRelease(C.CFTypeRef(ev))
	C.CGEventPost(C.kCGHIDEventTap, ev)
	return nil
}
