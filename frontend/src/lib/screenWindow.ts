// Opens the peer's shared screen in a real OS window via window.open.
// WebView2 (Windows) hosts the about:blank popup itself; the opener fills it
// with a <video> bound to the same MediaStream, so no frames cross processes.
// Returns null when the webview refuses popups (macOS WKWebView today) so the
// caller can fall back to the in-app popout.

export type ScreenWindow = {
  stream: MediaStream;
  close: () => void;
};

type Opts = {
  title: string;
  onClosed: () => void;
  host?: Window;
  pollMs?: number;
};

export const screenWindowFallback = { width: 1280, height: 720 };

export function screenWindowSize(
  stream: MediaStream,
  avail: { width: number; height: number },
): { width: number; height: number } {
  let width = 0;
  let height = 0;
  try {
    const settings = stream.getVideoTracks()[0]?.getSettings?.() ?? {};
    width = Math.round(settings.width ?? 0);
    height = Math.round(settings.height ?? 0);
  } catch {
    // Some test doubles have no settings.
  }
  if (width <= 0 || height <= 0) {
    width = screenWindowFallback.width;
    height = screenWindowFallback.height;
  }
  // Clamp to the screen and keep the aspect ratio.
  const scale = Math.min(1, avail.width / width, avail.height / height);
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

export function openScreenWindow(stream: MediaStream, opts: Opts): ScreenWindow | null {
  const host = opts.host ?? window;
  const scr = host.screen as Screen & { availLeft?: number; availTop?: number };
  // Leave room for the popup title bar and borders.
  const avail = { width: (scr?.availWidth || 1280) - 16, height: (scr?.availHeight || 800) - 48 };
  const size = screenWindowSize(stream, avail);
  const left = Math.max(0, Math.round((scr?.availLeft ?? 0) + (avail.width - size.width) / 2));
  const top = Math.max(0, Math.round((scr?.availTop ?? 0) + (avail.height - size.height) / 2));
  let popup: Window | null = null;
  try {
    popup = host.open(
      "",
      "tailcat-screen-share",
      `popup=yes,width=${size.width},height=${size.height},left=${left},top=${top}`,
    );
  } catch {
    popup = null;
  }
  if (!popup) {
    return null;
  }
  const win = popup;
  try {
    const doc = win.document;
    doc.title = opts.title;
    doc.body.replaceChildren();
    doc.body.style.cssText = "margin:0;background:#000;overflow:hidden;";
    const video = doc.createElement("video");
    video.autoplay = true;
    video.muted = true; // Call audio keeps playing in the main window.
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.style.cssText = "display:block;width:100vw;height:100vh;object-fit:contain;background:#000;";
    (video as HTMLVideoElement & { srcObject: MediaStream | null }).srcObject = stream;
    doc.body.appendChild(video);
    void video.play?.()?.catch?.(() => undefined);
  } catch {
    try {
      win.close();
    } catch {
      // Already gone.
    }
    return null;
  }

  let done = false;
  const finish = (closePopup: boolean) => {
    if (done) {
      return;
    }
    done = true;
    host.clearInterval(timer);
    host.removeEventListener("pagehide", onHostGone);
    if (closePopup) {
      try {
        win.close();
      } catch {
        // Already gone.
      }
    }
  };
  const onHostGone = () => finish(true);
  const timer = host.setInterval(() => {
    if (win.closed) {
      finish(false);
      opts.onClosed();
    }
  }, opts.pollMs ?? 400);
  host.addEventListener("pagehide", onHostGone);

  return {
    stream,
    close: () => finish(true),
  };
}
