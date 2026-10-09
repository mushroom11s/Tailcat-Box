//go:build darwin

package screenwin

/*
#cgo darwin CFLAGS: -x objective-c
#cgo darwin LDFLAGS: -framework AppKit -framework WebKit
#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>

// One popup: its NSWindow and WKWebView. Kept alive in tcPopups until closed.
@interface TCScreenPopup : NSObject <WKUIDelegate, NSWindowDelegate>
@property (nonatomic, retain) NSWindow *window;
@property (nonatomic, retain) WKWebView *webView;
@end

static NSMutableSet *tcPopups;

@implementation TCScreenPopup
- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context {
	NSString *title = self.webView.title;
	if (title.length > 0) {
		self.window.title = title;
	}
}
// window.close() from the opener (hang up, share end).
- (void)webViewDidClose:(WKWebView *)webView {
	[self.window close];
}
// User closed the window, or webViewDidClose closed it. Drop the web view so
// the page goes away and the opener sees popup.closed.
- (void)windowWillClose:(NSNotification *)note {
	[self.webView removeObserver:self forKeyPath:@"title"];
	self.webView.UIDelegate = nil;
	self.window.delegate = nil;
	self.window.contentView = nil;
	TCScreenPopup *me = [self retain];
	[tcPopups removeObject:self];
	dispatch_async(dispatch_get_main_queue(), ^{
		me.webView = nil;
		me.window = nil;
		[me release];
	});
}
@end

// WKUIDelegate webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:
// added to Wails' WailsContext. Returning a web view built from the given
// configuration keeps it related to the opener, so the page can script it.
static WKWebView *tcCreateWebView(id self, SEL _cmd, WKWebView *opener, WKWebViewConfiguration *config,
		WKNavigationAction *action, WKWindowFeatures *features) {
	CGFloat w = features.width ? features.width.doubleValue : 1280;
	CGFloat h = features.height ? features.height.doubleValue : 720;
	NSRect frame = NSMakeRect(0, 0, w, h);
	NSWindow *win = [[NSWindow alloc] initWithContentRect:frame
	                                            styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
	                                                       NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable)
	                                              backing:NSBackingStoreBuffered
	                                                defer:NO];
	win.releasedWhenClosed = NO;
	win.backgroundColor = [NSColor blackColor];
	WKWebView *view = [[WKWebView alloc] initWithFrame:frame configuration:config];
	view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;

	TCScreenPopup *popup = [[TCScreenPopup alloc] init];
	popup.window = win;
	popup.webView = view;
	view.UIDelegate = popup;
	win.delegate = popup;
	[view addObserver:popup forKeyPath:@"title" options:NSKeyValueObservingOptionNew context:NULL];
	win.contentView = view;
	[win center];
	[win makeKeyAndOrderFront:nil];
	[tcPopups addObject:popup];
	[popup release];
	[win release];
	[view autorelease];
	return view;
}

static void tcInstall(void) {
	Class cls = objc_getClass("WailsContext");
	if (cls == Nil) {
		return;
	}
	SEL sel = @selector(webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:);
	if (class_getInstanceMethod(cls, sel) != NULL) {
		return;
	}
	if (tcPopups == nil) {
		tcPopups = [[NSMutableSet alloc] init];
	}
	class_addMethod(cls, sel, (IMP)tcCreateWebView, "@@:@@@@");
}
*/
import "C"

// Install adds the window.open hook to Wails' WKUIDelegate. WebKit caches which
// delegate methods exist when the UI delegate is set, so call this before
// wails.Run creates the window.
func Install() {
	C.tcInstall()
}
