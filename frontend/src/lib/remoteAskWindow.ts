export type RemoteAskWindow = {
  close: () => void;
};

type Opts = {
  title: string;
  body: string;
  allowLabel: string;
  denyLabel: string;
  onAllow: () => void;
  onDeny: () => void;
  onClosed: () => void;
  host?: Window;
};

/** Open the allow/deny prompt in its own OS window. Null when the webview blocks popups. */
export function openRemoteAskWindow(opts: Opts): RemoteAskWindow | null {
  const host = opts.host ?? window;
  let popup: Window | null = null;
  try {
    // about:blank stays a small prompt. An empty URL makes WebView2 load the app,
    // which errors and disappears in this window.
    popup = host.open("about:blank", "tailcat-remote-ask", "popup=yes,width=420,height=240");
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
    doc.body.style.cssText = "margin:0;background:#16181d;color:#f2f2f2;font:14px/1.45 sans-serif;";
    const box = doc.createElement("div");
    box.style.cssText = "padding:22px 24px;";
    const heading = doc.createElement("h1");
    heading.textContent = opts.title;
    heading.style.cssText = "margin:0 0 10px;font-size:18px;font-weight:650;";
    const text = doc.createElement("p");
    text.textContent = opts.body;
    text.style.cssText = "margin:0 0 18px;";
    const row = doc.createElement("div");
    const allow = doc.createElement("button");
    allow.type = "button";
    allow.textContent = opts.allowLabel;
    allow.style.cssText = "margin-right:8px;padding:8px 14px;border:0;border-radius:10px;background:#6d5efc;color:#fff;cursor:pointer;";
    const deny = doc.createElement("button");
    deny.type = "button";
    deny.textContent = opts.denyLabel;
    deny.style.cssText = "padding:8px 14px;border:1px solid #3a3d44;border-radius:10px;background:transparent;color:#f2f2f2;cursor:pointer;";
    allow.addEventListener("click", () => {
      opts.onAllow();
      finish(true);
    });
    deny.addEventListener("click", () => {
      opts.onDeny();
      finish(true);
    });
    row.append(allow, deny);
    box.append(heading, text, row);
    doc.body.appendChild(box);
    win.stop?.();
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
  }, 400);

  return { close: () => finish(true) };
}
