import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { focusAppWindow } from "../lib/osNotify";
import { openRemoteAskWindow, type RemoteAskWindow } from "../lib/remoteAskWindow";
import { allowRemote, denyRemote, isTrusted, readTrust, type RemoteView } from "../lib/remoteDesk";
import { onTailcatEvent } from "../lib/wails";

function parseView(raw: string | undefined): RemoteView | null {
  if (!raw) {
    return null;
  }
  try {
    const view = JSON.parse(raw) as RemoteView;
    if (!view || typeof view.state !== "string") {
      return null;
    }
    return view;
  } catch {
    return null;
  }
}

export default function RemoteIncoming() {
  const { t } = useI18n();
  const [ask, setAsk] = useState<RemoteView | null>(null);
  const [fallback, setFallback] = useState(false);
  const popup = useRef<RemoteAskWindow | null>(null);
  const prompted = useRef("");

  useEffect(() => {
    return onTailcatEvent((ev) => {
      if (ev.Kind !== "remote") {
        return;
      }
      const next = parseView(ev.Data);
      if (next?.role === "host" && next.state === "incoming" && next.peer) {
        setAsk(next);
        return;
      }
      setAsk(null);
      setFallback(false);
    });
  }, []);

  useEffect(() => {
    return () => {
      popup.current?.close();
      popup.current = null;
    };
  }, []);

  useEffect(() => {
    const peer = ask?.peer ?? "";
    if (!peer) {
      popup.current?.close();
      popup.current = null;
      prompted.current = "";
      return;
    }
    if (isTrusted(readTrust(), peer)) {
      popup.current?.close();
      popup.current = null;
      if (prompted.current !== `trust:${peer}`) {
        prompted.current = `trust:${peer}`;
        void allowRemote();
      }
      return;
    }
    if (prompted.current === peer) {
      return;
    }
    prompted.current = peer;
    focusAppWindow();
    const opened = openRemoteAskWindow({
      title: t("remoteAskTitle"),
      body: t("remoteIncoming").replaceAll("{peer}", peer),
      allowLabel: t("remoteAllow"),
      denyLabel: t("remoteDeny"),
      onAllow: () => {
        void allowRemote();
      },
      onDeny: () => {
        void denyRemote();
      },
      onClosed: () => {
        popup.current = null;
        setFallback(true);
      },
    });
    if (!opened) {
      setFallback(true);
      return;
    }
    popup.current = opened;
    setFallback(false);
  }, [ask?.peer, t]);

  if (!fallback || !ask?.peer) {
    return null;
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="glass modal modal-compact" role="dialog" aria-modal="true" aria-labelledby="remote-ask-title">
        <h3 id="remote-ask-title">{t("remoteAskTitle")}</h3>
        <p>{t("remoteIncoming").replaceAll("{peer}", ask.peer)}</p>
        <div className="row">
          <button className="btn" type="button" onClick={() => void allowRemote()}>
            {t("remoteAllow")}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => void denyRemote()}>
            {t("remoteDeny")}
          </button>
        </div>
      </div>
    </div>
  );
}
