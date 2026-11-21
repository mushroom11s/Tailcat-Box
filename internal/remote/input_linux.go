//go:build linux

package remote

import (
	"unsafe"

	"golang.org/x/sys/unix"
)

const (
	evSyn = 0
	evKey = 1
	evRel = 2
	evAbs = 3

	absX     = 0
	absY     = 1
	relWheel = 8

	btnLeft   = 0x110
	btnRight  = 0x111
	btnMiddle = 0x112

	synReport = 0

	uiSetEvbit  = 0x40045564
	uiSetKeybit = 0x40045565
	uiSetRelbit = 0x40045566
	uiSetAbsbit = 0x40045567
	uiDevCreate = 0x5501
	uiAbsSetup  = 0x401c5504
	uiDevSetup  = 0x405c5503
)

type inputEvent struct {
	Sec   int64
	Usec  int64
	Type  uint16
	Code  uint16
	Value int32
}

type inputAbsInfo struct {
	Value      int32
	Minimum    int32
	Maximum    int32
	Fuzz       int32
	Flat       int32
	Resolution int32
}

type uinputAbsSetup struct {
	Code uint16
	Pad  uint16
	Info inputAbsInfo
}

type inputID struct {
	BusType uint16
	Vendor  uint16
	Product uint16
	Version uint16
}

type uinputSetup struct {
	ID           inputID
	Name         [80]byte
	FFEffectsMax uint32
}

type linuxInjector struct {
	fd int
}

func openInjector() Injector {
	fd, err := unix.Open("/dev/uinput", unix.O_WRONLY|unix.O_NONBLOCK, 0)
	if err != nil {
		return errInjector{err}
	}
	dev := &linuxInjector{fd: fd}
	if err := dev.setup(); err != nil {
		_ = unix.Close(fd)
		return errInjector{err}
	}
	return dev
}

func (d *linuxInjector) setup() error {
	if err := ioctl(d.fd, uiSetEvbit, evKey); err != nil {
		return err
	}
	if err := ioctl(d.fd, uiSetEvbit, evAbs); err != nil {
		return err
	}
	if err := ioctl(d.fd, uiSetEvbit, evRel); err != nil {
		return err
	}
	for _, bit := range []uintptr{btnLeft, btnRight, btnMiddle} {
		if err := ioctl(d.fd, uiSetKeybit, bit); err != nil {
			return err
		}
	}
	for code := range namedKeys {
		keys, _ := domKey(code)
		if err := ioctl(d.fd, uiSetKeybit, uintptr(keys.linux)); err != nil {
			return err
		}
	}
	for ch := byte('A'); ch <= 'Z'; ch++ {
		keys, _ := domKey("Key" + string(ch))
		if err := ioctl(d.fd, uiSetKeybit, uintptr(keys.linux)); err != nil {
			return err
		}
	}
	for ch := byte('0'); ch <= '9'; ch++ {
		keys, _ := domKey("Digit" + string(ch))
		if err := ioctl(d.fd, uiSetKeybit, uintptr(keys.linux)); err != nil {
			return err
		}
	}
	if err := ioctl(d.fd, uiSetAbsbit, absX); err != nil {
		return err
	}
	if err := ioctl(d.fd, uiSetAbsbit, absY); err != nil {
		return err
	}
	if err := ioctl(d.fd, uiSetRelbit, relWheel); err != nil {
		return err
	}
	for _, axis := range []uint16{absX, absY} {
		spec := uinputAbsSetup{Code: axis, Info: inputAbsInfo{Maximum: 65535}}
		if err := ioctlPtr(d.fd, uiAbsSetup, unsafe.Pointer(&spec)); err != nil {
			return err
		}
	}
	var setup uinputSetup
	copy(setup.Name[:], "tailcat-remote")
	setup.ID.BusType = 0x06
	setup.ID.Vendor = 0x1234
	setup.ID.Product = 0x5678
	if err := ioctlPtr(d.fd, uiDevSetup, unsafe.Pointer(&setup)); err != nil {
		return err
	}
	return ioctl(d.fd, uiDevCreate, 0)
}

func (d *linuxInjector) Move(x, y float64) error {
	if err := d.write(evAbs, absX, int32(x*65535)); err != nil {
		return err
	}
	if err := d.write(evAbs, absY, int32(y*65535)); err != nil {
		return err
	}
	return d.write(evSyn, synReport, 0)
}

func (d *linuxInjector) Button(button string, down bool) error {
	code := uint16(btnLeft)
	switch button {
	case "right":
		code = btnRight
	case "middle":
		code = btnMiddle
	}
	val := int32(0)
	if down {
		val = 1
	}
	if err := d.write(evKey, code, val); err != nil {
		return err
	}
	return d.write(evSyn, synReport, 0)
}

func (d *linuxInjector) Wheel(dy int) error {
	if err := d.write(evRel, relWheel, int32(-dy)); err != nil {
		return err
	}
	return d.write(evSyn, synReport, 0)
}

func (d *linuxInjector) Key(code string, down bool) error {
	keys, ok := domKey(code)
	if !ok {
		return nil
	}
	val := int32(0)
	if down {
		val = 1
	}
	if err := d.write(evKey, keys.linux, val); err != nil {
		return err
	}
	return d.write(evSyn, synReport, 0)
}

func (d *linuxInjector) write(typ, code uint16, val int32) error {
	ev := inputEvent{Type: typ, Code: code, Value: val}
	buf := unsafe.Slice((*byte)(unsafe.Pointer(&ev)), int(unsafe.Sizeof(ev)))
	_, err := unix.Write(d.fd, buf)
	return err
}

func ioctl(fd int, req uint, arg uintptr) error {
	return ioctlPtr(fd, req, unsafe.Pointer(arg))
}

func ioctlPtr(fd int, req uint, arg unsafe.Pointer) error {
	_, _, errno := unix.Syscall(unix.SYS_IOCTL, uintptr(fd), uintptr(req), uintptr(arg))
	if errno != 0 {
		return errno
	}
	return nil
}

type errInjector struct{ err error }

func (e errInjector) Move(float64, float64) error { return ErrInput }
func (e errInjector) Button(string, bool) error   { return ErrInput }
func (e errInjector) Wheel(int) error             { return ErrInput }
func (e errInjector) Key(string, bool) error      { return ErrInput }
