// Package screenwin lets the webview's window.open create a real OS window,
// used to show a peer's shared screen outside the main window.
//
// Windows (WebView2) already opens its own popup window for window.open, so
// Install does nothing there. macOS (WKWebView) needs a UI delegate hook; see
// screenwin_darwin.go.
package screenwin
