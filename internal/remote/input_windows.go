//go:build windows

package remote

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	user32        = windows.NewLazySystemDLL("user32.dll")
	procSendInput = user32.NewProc("SendInput")
)

const (
	inputMouse    = 0
	inputKeyboard = 1

	mouseMove      = 0x0001
	mouseLeftDown  = 0x0002
	mouseLeftUp    = 0x0004
	mouseRightDown = 0x0008
	mouseRightUp   = 0x0010
	mouseMidDown   = 0x0020
	mouseMidUp     = 0x0040
	mouseWheel     = 0x0800
	mouseAbsolute  = 0x8000
	mouseVirtual   = 0x4000

	keyUp = 0x0002
)

type mouseInput struct {
	Type  uint32
	Pad   uint32
	Dx    int32
	Dy    int32
	Data  uint32
	Flag  uint32
	Time  uint32
	Pad2  uint32
	Extra uintptr
}

type keyInput struct {
	Type  uint32
	Pad   uint32
	Vk    uint16
	Scan  uint16
	Flag  uint32
	Time  uint32
	Pad2  uint32
	Extra uintptr
	Tail  uint64
}

func openInjector() Injector { return windowsInjector{} }

type windowsInjector struct{}

func (windowsInjector) Move(x, y float64) error {
	in := mouseInput{
		Type: inputMouse,
		Dx:   int32(x * 65535),
		Dy:   int32(y * 65535),
		Flag: mouseMove | mouseAbsolute | mouseVirtual,
	}
	return send(unsafe.Pointer(&in), unsafe.Sizeof(in))
}

func (windowsInjector) Button(button string, down bool) error {
	flag := uint32(mouseLeftDown)
	if !down {
		flag = mouseLeftUp
	}
	switch button {
	case "right":
		flag = mouseRightDown
		if !down {
			flag = mouseRightUp
		}
	case "middle":
		flag = mouseMidDown
		if !down {
			flag = mouseMidUp
		}
	}
	in := mouseInput{Type: inputMouse, Flag: flag}
	return send(unsafe.Pointer(&in), unsafe.Sizeof(in))
}

func (windowsInjector) Wheel(dy int) error {
	in := mouseInput{Type: inputMouse, Data: uint32(int32(-dy * 120)), Flag: mouseWheel}
	return send(unsafe.Pointer(&in), unsafe.Sizeof(in))
}

func (windowsInjector) Key(code string, down bool) error {
	keys, ok := domKey(code)
	if !ok {
		return nil
	}
	flag := uint32(0)
	if !down {
		flag = keyUp
	}
	in := keyInput{Type: inputKeyboard, Vk: keys.win, Flag: flag}
	return send(unsafe.Pointer(&in), unsafe.Sizeof(in))
}

func send(in unsafe.Pointer, size uintptr) error {
	ret, _, err := procSendInput.Call(1, uintptr(in), size)
	if ret == 0 {
		if err != nil && err != windows.ERROR_SUCCESS {
			return ErrInput
		}
		return ErrInput
	}
	return nil
}
