import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { useI18n, type MessageKey } from "../i18n";
import {
  allowRemote,
  connectRemote,
  denyRemote,
  endRemote,
  isTrusted,
  readTrust,
  sendRemoteInput,
  sendRemoteSignal,
  startRemoteHost,
  trustAddress,
  untrustAddress,
  writeTrust,
  type RemoteInput,
  type RemoteView,
} from "../lib/remoteDesk";
import { createRemoteMedia, videoPoint, type RemoteMedia } from "../lib/remoteMedia";
import { shareableAddress } from "../lib/qr";
import { onTailcatEvent } from "../lib/wails";

export type RemoteMode = "desk" | "play" | "assist";

export type RemoteRecent = {
  address: string;
  mode: RemoteMode;
  at: number;
};

const RECENT_KEY = "tailcat-remote-recent";
const RECENT_LIMIT = 8;

const MODES: RemoteMode[] = ["desk", "play", "assist"];

const MODE_LABEL: Record<RemoteMode, MessageKey> = {
  desk: "remoteDesk",
  play: "remotePlay",
  assist: "remoteAssist",
};

const MODE_BODY: Record<RemoteMode, MessageKey> = {
  desk: "remoteDeskBody",
  play: "remotePlayBody",
  assist: "remoteAssistBody",
};

const MODE_POINTS: Record<RemoteMode, [MessageKey, MessageKey, MessageKey]> = {
  desk: ["remotePointDesk1", "remotePointDesk2", "remotePointDesk3"],
  play: ["remotePointPlay1", "remotePointPlay2", "remotePointPlay3"],
  assist: ["remotePointAssist1", "remotePointAssist2", "remotePointAssist3"],
};

const KNOWN_ERRORS: Record<string, MessageKey> = {
  "That is not a Tailcat address.": "remoteBadAddress",
  "The other computer declined.": "remoteDenied",
  "The request was declined.": "remoteDenied",
  "Could not reach the other computer.": "remoteUnreachable",
  "Screen sharing was denied.": "remoteScreenFailed",
  "Screen sharing is unavailable on this system.": "remoteScreenFailed",
  "This computer could not apply the remote keyboard and mouse.": "remoteInputFailed",
};

export function rememberRemote(list: RemoteRecent[], address: string, mode: RemoteMode, at = Date.now()): RemoteRecent[] {
  const clean = address.trim();
  return [{ address: clean, mode, at }, ...list.filter((item) => item.address !== clean)].slice(0, RECENT_LIMIT);
}

export function forgetRemote(list: RemoteRecent[], address: string): RemoteRecent[] {
  return list.filter((item) => item.address !== address);
}

function readRecent(): RemoteRecent[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const row = item as Partial<RemoteRecent>;
      if (row.mode !== "desk" && row.mode !== "play" && row.mode !== "assist") {
        return [];
      }
      const address = typeof row.address === "string" ? row.address.trim() : "";
      if (!shareableAddress(address)) {
        return [];
      }
      return [{ address, mode: row.mode, at: typeof row.at === "number" ? row.at : 0 }];
    });
  } catch {
    return [];
  }
}

function writeRecent(list: RemoteRecent[]): void {
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

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

export default function RemotePage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<RemoteMode>("desk");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<RemoteRecent[]>(readRecent);
  const [trusted, setTrusted] = useState<string[]>(readTrust);
  const [view, setView] = useState<RemoteView>({ role: "", state: "idle" });
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRef = useRef<RemoteMedia | null>(null);
  const allowing = useRef("");
  const shared = useRef(false);
  const moveAt = useRef(0);

  function media(): RemoteMedia {
    if (!mediaRef.current) {
      mediaRef.current = createRemoteMedia(sendRemoteSignal, setStream);
    }
    return mediaRef.current;
  }

  useEffect(() => {
    return onTailcatEvent((ev) => {
      if (ev.Kind === "remote") {
        const next = parseView(ev.Data);
        if (next) {
          setView(next);
          if (next.error) {
            setError(next.error);
          }
        }
        return;
      }
      if (ev.Kind === "remote-signal" && ev.Data) {
        void media().signal(ev.Data).catch((err: unknown) => {
          setError(err instanceof Error ? err.message : t("remoteScreenFailed"));
        });
      }
    });
  }, [t]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) {
      return;
    }
    node.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    return () => {
      mediaRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (view.role !== "host" || view.state !== "incoming" || !view.peer || !isTrusted(trusted, view.peer)) {
      return;
    }
    if (allowing.current === view.peer) {
      return;
    }
    allowing.current = view.peer;
    void allowRemote().catch((err: unknown) => {
      allowing.current = "";
      setError(err instanceof Error ? err.message : t("remoteUnreachable"));
    });
  }, [t, trusted, view.peer, view.role, view.state]);

  useEffect(() => {
    if (view.role !== "host" || view.state !== "live" || shared.current) {
      return;
    }
    shared.current = true;
    void media()
      .share()
      .catch((err: unknown) => {
        shared.current = false;
        setError(err instanceof Error ? err.message : t("remoteScreenFailed"));
      });
  }, [t, view.role, view.state]);

  useEffect(() => {
    if (view.state === "ended" || view.state === "idle") {
      shared.current = false;
      allowing.current = "";
      mediaRef.current?.close();
    }
  }, [view.state]);

  function keep(nextAddress: string, nextMode: RemoteMode): void {
    const clean = shareableAddress(nextAddress);
    if (!clean) {
      setError(t("remoteBadAddress"));
      return;
    }
    setError("");
    setAddress(clean);
    setMode(nextMode);
    const next = rememberRemote(recent, clean, nextMode);
    setRecent(next);
    writeRecent(next);
  }

  function drop(target: string): void {
    const next = forgetRemote(recent, target);
    setRecent(next);
    writeRecent(next);
  }

  function trust(target: string, on: boolean): void {
    const next = on ? trustAddress(trusted, target) : untrustAddress(trusted, target);
    setTrusted(next);
    writeTrust(next);
  }

  function showError(err: unknown): void {
    setError(err instanceof Error ? err.message : t("remoteUnreachable"));
  }

  async function control(): Promise<void> {
    const clean = shareableAddress(address);
    if (!clean) {
      setError(t("remoteBadAddress"));
      return;
    }
    setError("");
    keep(clean, mode);
    try {
      setView(await connectRemote(clean, mode));
    } catch (err) {
      showError(err);
    }
  }

  async function host(): Promise<void> {
    setError("");
    shared.current = false;
    try {
      setView(await startRemoteHost());
    } catch (err) {
      showError(err);
    }
  }

  function sendInput(input: RemoteInput): void {
    if (view.role !== "guest" || view.state !== "live") {
      return;
    }
    void sendRemoteInput(input).catch(() => undefined);
  }

  function pointer(event: ReactPointerEvent<HTMLVideoElement>, kind: "move" | "down" | "up"): void {
    if (kind === "move") {
      const now = Date.now();
      if (now - moveAt.current < 30) {
        return;
      }
      moveAt.current = now;
    }
    const point = videoPoint(
      event.currentTarget.getBoundingClientRect(),
      event.currentTarget.videoWidth,
      event.currentTarget.videoHeight,
      event.clientX,
      event.clientY,
    );
    if (!point) {
      return;
    }
    const button = event.button === 2 ? "right" : event.button === 1 ? "middle" : "left";
    if (kind === "move") {
      sendInput({ kind, x: point.x, y: point.y });
      return;
    }
    sendInput({ kind: "move", x: point.x, y: point.y });
    sendInput({ kind, button });
  }

  function wheel(event: WheelEvent<HTMLVideoElement>): void {
    event.preventDefault();
    const dy = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;
    if (dy) {
      sendInput({ kind: "wheel", dy });
    }
  }

  const message = error && KNOWN_ERRORS[error] ? t(KNOWN_ERRORS[error]) : error;
  const live = view.state === "live";

  return (
    <div className="remote-page">
      <header className="chat-lobby-head">
        <h2>{t("remoteTitle")}</h2>
        <p className="lede">{t("remoteLede")}</p>
      </header>
      <div className="remote-menu" role="tablist" aria-label={t("remoteMenuLabel")}>
        {MODES.map((item) => (
          <button
            key={item}
            type="button"
            className={`remote-mode${mode === item ? " active" : ""}`}
            role="tab"
            aria-selected={mode === item}
            onClick={() => setMode(item)}
          >
            <strong>{t(MODE_LABEL[item])}</strong>
            <span>{t(MODE_BODY[item])}</span>
          </button>
        ))}
      </div>
      <section className="glass remote-panel" aria-label={t(MODE_LABEL[mode])}>
        <ul className="remote-points">
          {MODE_POINTS[mode].map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
        <div className="row">
          <button className="btn" type="button" onClick={() => void host()}>
            {t("remoteHost")}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => void control()}>
            {t("remoteGuest")}
          </button>
          {view.state !== "idle" ? (
            <button className="btn btn-danger" type="button" onClick={() => void endRemote()}>
              {t("remoteEnd")}
            </button>
          ) : null}
        </div>
        {view.role === "host" && view.address ? (
          <p className="chat-quiet remote-address">
            {t("remoteHostHelp")} <code>{view.address}</code>
          </p>
        ) : null}
        {view.role === "host" && view.state === "incoming" && view.peer && !isTrusted(trusted, view.peer) ? (
          <div className="remote-ask" role="status">
            <p>{t("remoteIncoming").replaceAll("{peer}", view.peer)}</p>
            <div className="row">
              <button className="btn" type="button" onClick={() => void allowRemote().catch(showError)}>
                {t("remoteAllow")}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => void denyRemote().catch(showError)}>
                {t("remoteDeny")}
              </button>
            </div>
          </div>
        ) : null}
        {view.role === "guest" && view.state === "waiting" ? <p className="chat-quiet">{t("remoteWaiting")}</p> : null}
        {live ? <p className="chat-quiet">{t("remoteLive")}</p> : null}
        {message ? (
          <p className="err" role="alert">
            {message}
          </p>
        ) : null}
        <form
          className="remote-form"
          onSubmit={(event) => {
            event.preventDefault();
            keep(address, mode);
          }}
        >
          <label className="field" htmlFor="remote-address">
            {t("remoteAddress")}
            <input
              id="remote-address"
              value={address}
              placeholder={t("remoteAddressPlaceholder")}
              autoComplete="off"
              onChange={(event) => {
                setAddress(event.target.value);
                setError("");
              }}
            />
          </label>
          <div className="row">
            <button className="btn" type="submit">
              {t("remoteRemember")}
            </button>
          </div>
        </form>
        {view.role === "guest" && live ? (
          <video
            ref={videoRef}
            className="remote-stage"
            autoPlay
            playsInline
            tabIndex={0}
            onPointerMove={(event) => pointer(event, "move")}
            onPointerDown={(event) => {
              event.currentTarget.focus();
              pointer(event, "down");
            }}
            onPointerUp={(event) => pointer(event, "up")}
            onContextMenu={(event) => event.preventDefault()}
            onWheel={wheel}
            onKeyDown={(event) => {
              event.preventDefault();
              sendInput({ kind: "key", code: event.code, down: true });
            }}
            onKeyUp={(event) => {
              event.preventDefault();
              sendInput({ kind: "key", code: event.code, down: false });
            }}
          />
        ) : null}
        <div className="remote-recent">
          <h3>{t("remoteRecent")}</h3>
          {recent.length === 0 ? <p className="chat-quiet">{t("remoteRecentEmpty")}</p> : null}
          {recent.map((item) => (
            <div key={item.address} className="remote-recent-row">
              <button type="button" className="remote-recent-main" onClick={() => keep(item.address, item.mode)}>
                <span className="remote-recent-addr">{item.address}</span>
                <span className="remote-recent-mode">{t(MODE_LABEL[item.mode])}</span>
                {isTrusted(trusted, item.address) ? <span className="remote-recent-mode">{t("remoteTrusted")}</span> : null}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => trust(item.address, !isTrusted(trusted, item.address))}
              >
                {isTrusted(trusted, item.address) ? t("remoteUntrust") : t("remoteTrust")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => drop(item.address)}>
                {t("remoteForget")}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
