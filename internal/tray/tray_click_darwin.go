//go:build darwin

package tray

/*
#cgo darwin CFLAGS: -x objective-c
#cgo darwin LDFLAGS: -framework AppKit
#import <AppKit/AppKit.h>

extern void trayMenuBegan(void);

// trayWatchMenu makes the menu-bar icon behave like the Windows tray: a
// plain left click opens the app, right/ctrl-click shows the menu. The menu
// stays permanently attached (SetOnClick tears it down and crashes), so a
// local event monitor swallows plain left mouse-downs on our status bar
// window before the button can open the menu. Right-click and ctrl-click
// pass through and AppKit shows the attached menu as before.
static void trayWatchMenu(void) {
	Class bar = NSClassFromString(@"NSStatusBarWindow");
	[NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskLeftMouseDown
	                                      handler:^NSEvent *(NSEvent *event) {
		if (bar == nil || ![event.window isKindOfClass:bar]) {
			return event;
		}
		if (event.modifierFlags & NSEventModifierFlagControl) {
			return event;
		}
		trayMenuBegan();
		return nil;
	}];
}
*/
import "C"
import "sync"

var (
	clickMu   sync.Mutex
	clickTray func()
	watchOnce sync.Once
)

func watchTrayClicks(fn func()) {
	clickMu.Lock()
	clickTray = fn
	clickMu.Unlock()
	watchOnce.Do(func() { C.trayWatchMenu() })
}
