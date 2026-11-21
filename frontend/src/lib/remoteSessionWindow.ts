import type { RemoteInput } from "./remoteDesk";
import { videoPoint } from "./remoteMedia";

export type RemoteSessionWindow = {
  setStream: (stream: MediaStream) => void;
  close: () => void;
};

type Opts = {
  title: string;
  peer: string;
  stream: MediaStream;
  fullscreenLabel: string;
  exitFullscreenLabel: string;
  endLabel: string;
  onInput: (input: RemoteInput) => void;
  onEnd: () => void;
  onClosed: () => void;
  host?: Window;
  pollMs?: number;
};

/** The remote screen in its own window, with a bar for fullscreen and ending the session. */
export function openRemoteSessionWindow(opts: Opts): RemoteSessionWindow | null {
  const host = opts.host ?? window;
  const scr = host.screen as Screen & { availLeft?: number; availTop?: number; availWidth?: number; availHeight?: number };
  const availW = scr?.availWidth || 1280;
  const availH = scr?.availHeight || 800;
  const width = Math.min(1280, Math.max(640, availW - 80));
  const height = Math.min(800, Math.max(480, availH - 120));
  const left = Math.max(0, Math.round((scr?.availLeft ?? 0) + (availW - width) / 2));
  const top = Math.max(0, Math.round((scr?.availTop ?? 0) + (availH - height) / 2));
  let popup: Window | null = null;
  try {
    popup = host.open(
      "about:blank",
      "tailcat-remote-session",
      `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
    );
  } catch {
    popup = null;
  }
  if (!popup) {
    return null;
  }
  const win = popup;
  let video: HTMLVideoElement;
  let bar: HTMLDivElement;
  let fullBtn: HTMLButtonElement;
  let endBtn: HTMLButtonElement;
  try {
    const doc = win.document;
    doc.title = opts.title;
    doc.body.replaceChildren();
    const style = doc.createElement("style");
    style.textContent = [
      "html,body{height:100%;margin:0;background:#0e0e10;overflow:hidden;}",
      "video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;outline:none;}",
      ".bar{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;max-width:calc(100% - 24px);padding:8px 10px 8px 14px;border-radius:14px;background:rgba(22,22,26,.94);color:#f4f4f5;font:13px/1.2 sans-serif;z-index:2;}",
      ".bar.overlay{opacity:0;transition:opacity .18s;}",
      ".bar.overlay.show{opacity:1;}",
      ".title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px;}",
      "button{appearance:none;border-radius:9px;padding:6px 12px;font:600 13px/1 sans-serif;cursor:pointer;}",
      ".full{border:1px solid #3a3a40;background:transparent;color:#f4f4f5;}",
      ".end{border:0;background:#e5484d;color:#fff;}",
    ].join("");
    const built = doc.createElement("video");
    built.autoplay = true;
    built.playsInline = true;
    built.tabIndex = 0;
    built.setAttribute("playsinline", "");
    bar = doc.createElement("div");
    bar.className = "bar show";
    const title = doc.createElement("span");
    title.className = "title";
    title.textContent = opts.peer || opts.title;
    fullBtn = doc.createElement("button");
    fullBtn.type = "button";
    fullBtn.className = "full";
    fullBtn.textContent = opts.fullscreenLabel;
    endBtn = doc.createElement("button");
    endBtn.type = "button";
    endBtn.className = "end";
    endBtn.textContent = opts.endLabel;
    bar.append(title, fullBtn, endBtn);
    doc.head.appendChild(style);
    doc.body.append(built, bar);
    video = built;
    win.stop?.();
  } catch {
    try {
      win.close();
    } catch {
      // Already gone.
    }
    return null;
  }

  const doc = win.document;
  const applyStream = (stream: MediaStream) => {
    try {
      (video as HTMLVideoElement & { srcObject: MediaStream | null }).srcObject = stream;
      void video.play?.()?.catch?.(() => undefined);
    } catch {
      // Test doubles are not real media streams.
    }
  };
  applyStream(opts.stream);
  try {
    video.focus();
    win.focus();
  } catch {
    // Some popups reject focus.
  }

  const toggleFullscreen = () => {
    const root = doc.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
    if (doc.fullscreenElement) {
      void doc.exitFullscreen?.();
      return;
    }
    void root.requestFullscreen?.();
  };
  const syncBar = () => {
    const fullscreen = Boolean(doc.fullscreenElement);
    fullBtn.textContent = fullscreen ? opts.exitFullscreenLabel : opts.fullscreenLabel;
    bar.classList.toggle("overlay", fullscreen);
    if (!fullscreen) {
      bar.classList.add("show");
    }
  };
  let hideTimer = 0;
  const pokeBar = () => {
    bar.classList.add("show");
    host.clearTimeout(hideTimer);
    if (doc.fullscreenElement) {
      hideTimer = host.setTimeout(() => bar.classList.remove("show"), 2200);
    }
  };
  fullBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFullscreen();
  });
  endBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    opts.onEnd();
    finish(true);
  });
  doc.addEventListener("fullscreenchange", syncBar);
  video.addEventListener("dblclick", () => toggleFullscreen());
  win.addEventListener("pointermove", pokeBar);

  let moveAt = 0;
  const pointOf = (event: PointerEvent) => {
    const box = video.getBoundingClientRect();
    return videoPoint(box, video.videoWidth, video.videoHeight, event.clientX, event.clientY);
  };
  const sendPointer = (event: PointerEvent, kind: "move" | "down" | "up") => {
    if (kind === "move") {
      const now = Date.now();
      if (now - moveAt < 30) {
        return;
      }
      moveAt = now;
    }
    const point = pointOf(event);
    if (!point) {
      return;
    }
    const button = event.button === 2 ? "right" : event.button === 1 ? "middle" : "left";
    if (kind === "move") {
      opts.onInput({ kind, x: point.x, y: point.y });
      return;
    }
    opts.onInput({ kind: "move", x: point.x, y: point.y });
    opts.onInput({ kind, button });
  };
  video.addEventListener("pointermove", (event) => sendPointer(event, "move"));
  video.addEventListener("pointerdown", (event) => {
    video.focus();
    try {
      video.setPointerCapture(event.pointerId);
    } catch {
      // Capture is optional.
    }
    sendPointer(event, "down");
  });
  video.addEventListener("pointerup", (event) => sendPointer(event, "up"));
  video.addEventListener("contextmenu", (event) => event.preventDefault());
  video.addEventListener("wheel", (event) => {
    event.preventDefault();
    const dy = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;
    if (dy) {
      opts.onInput({ kind: "wheel", dy });
    }
  });
  const onKey = (down: boolean) => (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".bar")) {
      return;
    }
    if (event.code === "Escape" && doc.fullscreenElement) {
      event.preventDefault();
      void doc.exitFullscreen?.();
      return;
    }
    if (!event.code) {
      return;
    }
    event.preventDefault();
    opts.onInput({ kind: "key", code: event.code, down });
  };
  win.addEventListener("keydown", onKey(true));
  win.addEventListener("keyup", onKey(false));

  let done = false;
  const finish = (closePopup: boolean) => {
    if (done) {
      return;
    }
    done = true;
    host.clearInterval(timer);
    host.clearTimeout(hideTimer);
    if (closePopup) {
      try {
        win.close();
      } catch {
        // Already gone.
      }
    }
  };
  const timer = host.setInterval(() => {
    if (win.closed) {
      finish(false);
      opts.onClosed();
    }
  }, opts.pollMs ?? 400);

  return {
    setStream: applyStream,
    close: () => finish(true),
  };
}
