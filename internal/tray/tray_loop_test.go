package tray

import (
	"os"
	"strings"
	"testing"
)

func TestDarwinTrayStartsOnMainThread(t *testing.T) {
	code := nonCommentCode(t, "tray_start_darwin.go")
	if strings.Contains(code, "go start()") {
		t.Fatal("darwin nativeStart creates NSStatusItem on the caller; launch it with startLoop, not go start()")
	}
	if !strings.Contains(code, "RunWithExternalLoop") || !strings.Contains(code, "startLoop(start)") {
		t.Fatal("darwin must keep RunWithExternalLoop dispatched onto the AppKit main queue")
	}
	if strings.Contains(code, "systray.Run(") {
		t.Fatal("systray.Run owns the AppKit loop; darwin must keep the external loop")
	}
	if !strings.Contains(code, "skipTray(c)") {
		t.Fatal("TAILCAT_NO_TRAY must still skip the darwin tray")
	}

	// tray_native.go was split into platform install files.
	for _, name := range []string{"tray_install_darwin.go", "tray_install_systray.go"} {
		install := nonCommentCode(t, name)
		if strings.Contains(install, "go start()") || strings.Contains(install, "RunWithExternalLoop") || strings.Contains(install, "systray.Run(") {
			t.Fatalf("%s must not start the platform loop", name)
		}
		if strings.Contains(install, "SetOnRClick") {
			t.Fatalf("%s: right-click should keep the platform default menu", name)
		}
		for _, needle := range []string{
			"labels.Open",
			"labels.Hide",
			"labels.Chat",
			"labels.Tunnel",
			"labels.Settings",
			"labels.Quit",
			"SessionCountLabel",
			"countItem.Disable()",
		} {
			if !strings.Contains(install, needle) {
				t.Fatalf("%s menu missing %s", name, needle)
			}
		}
	}
	windows := nonCommentCode(t, "tray_install_systray.go")
	if !strings.Contains(windows, "SetOnClick") {
		t.Fatal("windows tray must open on left-click")
	}
	if !strings.Contains(windows, "c.Scoop()") {
		t.Fatal("windows tray click must play the litter scoop")
	}
	darwin := nonCommentCode(t, "tray_install_darwin.go")
	// Permanently attach NSMenu via CreateMenu. SetOnClick/SetOnRClick enable
	// the show_menu attach/performClick/setMenu:nil path that errors on use.
	if strings.Contains(darwin, "SetOnClick") || strings.Contains(darwin, "SetOnRClick") {
		t.Fatal("darwin must not SetOnClick/SetOnRClick; those break the menu")
	}
	if !strings.Contains(darwin, "CreateMenu()") {
		t.Fatal("darwin must CreateMenu so the status item has a permanent NSMenu")
	}
	if !strings.Contains(darwin, "watchTrayClicks(c.Scoop)") {
		t.Fatal("darwin tray click (menu open) must play the litter scoop")
	}
	// Click handlers already run on the AppKit main thread. Wrapping Wails
	// Open/Navigate/Quit in invokeMenu runs them inline during menu tracking
	// and crashes. Actions must go through runAction (async goroutine).
	if !strings.Contains(darwin, "runAction(") {
		t.Fatal("darwin menu actions must use runAction so Wails work leaves the NSMenu callback")
	}
	if strings.Contains(darwin, "runAction(") && strings.Contains(darwin, "invokeMenu(c.") {
		t.Fatal("darwin must not invokeMenu controller actions")
	}
	// Ensure Chat/Tunnel/Settings go through runAction, not a bare Navigate in Click.
	for _, page := range []string{"PageChat", "PageTunnel", "PageSettings"} {
		if !strings.Contains(darwin, "c.Navigate("+page+")") || !strings.Contains(darwin, "runAction(func() {") {
			t.Fatalf("darwin %s action must use runAction(Navigate)", page)
		}
	}
	if strings.Contains(darwin, "systray.Quit()") {
		t.Fatal("darwin quit must not call systray.Quit ([NSApp terminate] races Wails)")
	}
}

func TestWindowsTrayMessageLoopSharesOSThread(t *testing.T) {
	code := nonCommentCode(t, "tray_loop_windows.go")
	if strings.Contains(code, "RunWithExternalLoop") || strings.Contains(code, "go start()") {
		t.Fatal("windows must not split HWND creation and GetMessage across threads")
	}
	if !strings.Contains(code, "runtime.LockOSThread()") {
		t.Fatal("windows tray loop must LockOSThread so the goroutine cannot migrate")
	}
	if !strings.Contains(code, "systray.Run(") {
		t.Fatal("windows must use systray.Run so creation and GetMessage share the caller")
	}
	if !strings.Contains(code, "skipTray(c)") {
		t.Fatal("TAILCAT_NO_TRAY must still skip the windows tray")
	}
	if strings.Contains(code, "SetOnRClick") {
		t.Fatal("right-click should keep the default windows menu")
	}

	// LockOSThread and systray.Run must sit on the same goroutine, lock first.
	start := strings.Index(code, "go func()")
	if start < 0 {
		t.Fatal("systray.Run must run on a dedicated goroutine so Wails startup is not blocked")
	}
	rest := code[start:]
	lock := strings.Index(rest, "runtime.LockOSThread()")
	run := strings.Index(rest, "systray.Run(")
	if lock < 0 || run < 0 || lock > run {
		t.Fatal("LockOSThread must happen on the systray.Run goroutine before Run")
	}
	if strings.Contains(rest[lock:run], "go ") {
		t.Fatal("GetMessage must stay on the locked goroutine")
	}
}

func TestSkipTrayEnv(t *testing.T) {
	if !skipTray(nil) {
		t.Fatal("nil controller should skip the tray")
	}
	c := New(nil, nil, nil)
	t.Setenv("TAILCAT_NO_TRAY", "")
	if skipTray(c) {
		t.Fatal("empty TAILCAT_NO_TRAY should still start the tray")
	}
	t.Setenv("TAILCAT_NO_TRAY", "1")
	if !skipTray(c) {
		t.Fatal("TAILCAT_NO_TRAY should skip the tray")
	}
}

func nonCommentCode(t *testing.T, name string) string {
	t.Helper()
	src, err := os.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	var b strings.Builder
	for _, line := range strings.Split(string(src), "\n") {
		code := strings.TrimSpace(line)
		if strings.HasPrefix(code, "//") {
			continue
		}
		b.WriteString(code)
		b.WriteByte('\n')
	}
	return b.String()
}
