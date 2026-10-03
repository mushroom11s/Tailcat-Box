//go:build darwin

package tray

/*
#cgo darwin CFLAGS: -x objective-c
#cgo darwin LDFLAGS: -framework AppKit
#import <AppKit/AppKit.h>

extern void trayMenuBegan(void);

// trayWatchMenu hears the status menu open. Darwin cannot SetOnClick: that
// path tears the NSMenu down and crashes. Clicking the tray icon opens this
// menu, so menu-begin is the click.
static void trayWatchMenu(void) {
	[[NSNotificationCenter defaultCenter]
		addObserverForName:NSMenuDidBeginTrackingNotification
		            object:nil
		             queue:nil
		         usingBlock:^(NSNotification *note) {
		NSMenu *menu = (NSMenu *)note.object;
		if (![menu isKindOfClass:[NSMenu class]] || [menu numberOfItems] < 1) {
			return;
		}
		NSString *title = [[menu itemAtIndex:0] title];
		if ([title isEqualToString:@"Open"] || [title isEqualToString:@"打开"]) {
			trayMenuBegan();
		}
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
