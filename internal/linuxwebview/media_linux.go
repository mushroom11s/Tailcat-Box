//go:build linux && (dev || production)

package linuxwebview

/*
#cgo !webkit2_41 pkg-config: gtk+-3.0 webkit2gtk-4.0
#cgo webkit2_41 pkg-config: gtk+-3.0 webkit2gtk-4.1
#include <gtk/gtk.h>
#include <webkit2/webkit2.h>

static void setBool(GObject *obj, const char *name, gboolean value) {
	// Older WebKitGTK lacks some properties (enable-webrtc is 2.38+).
	if (g_object_class_find_property(G_OBJECT_GET_CLASS(obj), name) != NULL) {
		g_object_set(obj, name, value, NULL);
	}
}

static gboolean allowMedia(WebKitWebView *view, WebKitPermissionRequest *req, gpointer data) {
	if (WEBKIT_IS_USER_MEDIA_PERMISSION_REQUEST(req) || WEBKIT_IS_DEVICE_INFO_PERMISSION_REQUEST(req)) {
		webkit_permission_request_allow(req);
		return TRUE;
	}
	return FALSE;
}

static WebKitWebView *findWebView(GtkWidget *w) {
	if (WEBKIT_IS_WEB_VIEW(w)) {
		return WEBKIT_WEB_VIEW(w);
	}
	if (!GTK_IS_CONTAINER(w)) {
		return NULL;
	}
	WebKitWebView *found = NULL;
	GList *kids = gtk_container_get_children(GTK_CONTAINER(w));
	for (GList *l = kids; l != NULL && found == NULL; l = l->next) {
		found = findWebView(GTK_WIDGET(l->data));
	}
	g_list_free(kids);
	return found;
}

static gboolean setupMedia(gpointer data) {
	GList *tops = gtk_window_list_toplevels();
	for (GList *l = tops; l != NULL; l = l->next) {
		WebKitWebView *view = findWebView(GTK_WIDGET(l->data));
		if (view == NULL || g_object_get_data(G_OBJECT(view), "tailcat-media") != NULL) {
			continue;
		}
		g_object_set_data(G_OBJECT(view), "tailcat-media", GINT_TO_POINTER(1));
		GObject *settings = G_OBJECT(webkit_web_view_get_settings(view));
		setBool(settings, "enable-media-stream", TRUE);
		setBool(settings, "enable-mediasource", TRUE);
		setBool(settings, "enable-webrtc", TRUE);
		setBool(settings, "enable-encrypted-media", TRUE);
		setBool(settings, "media-playback-requires-user-gesture", FALSE);
		// wails:// is a custom scheme. getUserMedia needs a secure context.
		WebKitSecurityManager *sec = webkit_web_context_get_security_manager(webkit_web_view_get_context(view));
		webkit_security_manager_register_uri_scheme_as_secure(sec, "wails");
		g_signal_connect(view, "permission-request", G_CALLBACK(allowMedia), NULL);
		// The page may already be loading without these settings.
		if (webkit_web_view_get_uri(view) != NULL) {
			webkit_web_view_reload(view);
		}
	}
	g_list_free(tops);
	return G_SOURCE_REMOVE;
}

static void scheduleSetupMedia(void) {
	g_idle_add(setupMedia, NULL);
}
*/
import "C"

// EnableMedia turns on microphone, camera, screen capture, and WebRTC in the
// WebKitGTK view. Wails v2 leaves them off and denies permission requests, so
// voice notes and calls would fail on Linux. Call it once from OnStartup; the
// work runs on the GTK main loop.
func EnableMedia() {
	C.scheduleSetupMedia()
}
