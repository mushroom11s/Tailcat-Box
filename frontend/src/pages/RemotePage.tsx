import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import LoadingCat from "../components/LoadingCat";
import catGif from "../assets/loading-cat.gif";
import HelpTip, { HeadingHelp } from "../components/HelpTip";
import QrCopyButton from "../components/QrCopyButton";
import QrScanButton from "../components/QrScanButton";
import RelayCascade from "../components/RelayCascade";
import remoteQrMark from "../assets/remote-qr-cat.png?inline";
import platformLinux from "../assets/platform-linux.png";
import platformMac from "../assets/platform-mac.png";
import platformWindows from "../assets/platform-windows.png";
import { useI18n, type MessageKey } from "../i18n";
import { displayNickname } from "../lib/nickname";
import { useClipboardFieldPaste, type PasteFailure } from "../lib/clipboardPaste";
import {
  connectRemote,
  endRemote,
  extractRemoteTarget,
  isTrusted,
  parseRemoteCode,
  readTrust,
  sendRemoteInput,
  remoteStatus,
  sendRemoteSignal,
  setRemoteRelay,
  startRemoteHost,
  startRemoteHostKey,
  trustAddress,
  untrustAddress,
  writeTrust,
  type RemoteInput,
  type RemoteView,
} from "../lib/remoteDesk";
import { createRemoteMedia, videoPoint, type RemoteMedia, type RemoteQuality } from "../lib/remoteMedia";
import { openRemoteSessionWindow, type RemoteSessionWindow } from "../lib/remoteSessionWindow";
import { copyQrImage } from "../lib/copyQrImage";
import { encodeQrDataURL, shareableAddress } from "../lib/qr";
import {
  BOOK_SHOW,
  HISTORY_PAGE,
  MINE_PAGE,
  forgetDevice,
  pushHistory,
  readDeviceBook,
  readHistory,
  rememberDevice,
  renameDevice,
  writeDeviceBook,
  writeHistory,
  type DeviceBook,
  type RemoteDevice,
  type RemoteHistoryItem,
} from "../lib/remoteDevices";
import { createKey, listKeys, onTailcatEvent, type KeyInfo } from "../lib/wails";
import { resolveKeyName } from "../lib/defaultKeyName";

const REMOTE_POINTS: MessageKey[] = ["remotePoint1", "remotePoint2", "remotePoint3", "remotePoint4", "remotePoint5"];

const KNOWN_ERRORS: Record<string, MessageKey> = {
  "That is not a Tailcat address.": "remoteBadAddress",
  "The other computer declined.": "remoteDenied",
  "The request was declined.": "remoteDenied",
  "Could not reach the other computer.": "remoteUnreachable",
  "Screen sharing was denied.": "remoteScreenFailed",
  "Screen sharing is unavailable on this system.": "remoteScreenFailed",
  "Choose a server key.": "remoteKeyNeed",
  "That key is already listening in a chat room.": "tunnelKeyInUseRoom",
  "That key is already listening on a port serve.": "tunnelKeyInUsePort",
  "That key is already used for remote control.": "keyInUseRemote",
  "This computer could not apply the remote keyboard and mouse.": "remoteInputFailed",
};

type DevicePlatform = "windows" | "mac" | "linux" | "other";

function qualityLabelKey(id: RemoteQuality["id"]): MessageKey {
  switch (id) {
    case "1080p":
      return "remoteRes1080";
    case "540p":
      return "remoteRes540";
    default:
      return "remoteRes720";
  }
}

function pathLabelKey(path: RemoteView["peerPath"]): MessageKey {
  switch (path) {
    case "direct":
      return "remotePathDirect";
    case "derp":
      return "remotePathRelay";
    default:
      return "remotePathChecking";
  }
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

export default function RemotePage({
  occupied = new Set<string>(),
  onHoldKey,
}: {
  occupied?: ReadonlySet<string>;
  onHoldKey?: (name: string) => void;
}) {
  const { t } = useI18n();
  const [qrSrc, setQrSrc] = useState("");
  const [qrNote, setQrNote] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [visitors, setVisitors] = useState<RemoteDevice[]>(() => readDeviceBook("visitors"));
  const [controlled, setControlled] = useState<RemoteDevice[]>(() => readDeviceBook("controlled"));
  const [mine, setMine] = useState<RemoteDevice[]>(() => readDeviceBook("mine"));
  const [history, setHistory] = useState<RemoteHistoryItem[]>(readHistory);
  const [minePage, setMinePage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const noted = useRef("");
  const [trusted, setTrusted] = useState<string[]>(readTrust);
  const [view, setView] = useState<RemoteView>({ role: "", state: "idle" });
  const [creating, setCreating] = useState(false);
  const [shareOn, setShareOn] = useState<boolean | null>(null);
  const [keyNeed, setKeyNeed] = useState(false);
  const [shareError, setShareError] = useState("");
  const [relay, setRelay] = useState("");
  const [relayLabel, setRelayLabel] = useState("");
  const [life, setLife] = useState<"temp" | "key">("temp");
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [keyName, setKeyName] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [deskOpen, setDeskOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [quality, setQuality] = useState<RemoteQuality | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRef = useRef<RemoteMedia | null>(null);
  const deskRef = useRef<RemoteSessionWindow | null>(null);
  const shared = useRef(false);
  const hostGen = useRef(0);
  const hostIntent = useRef<"on" | "off">("off");
  const qrTicket = useRef(0);
  const moveAt = useRef(0);

  function media(): RemoteMedia {
    if (!mediaRef.current) {
      mediaRef.current = createRemoteMedia(sendRemoteSignal, setStream, setQuality);
    }
    return mediaRef.current;
  }

  useEffect(() => {
    let live = true;
    void remoteStatus().then((next) => {
      if (!live) {
        return;
      }
      if (next.state && next.state !== "idle") {
        setView(next);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    listKeys()
      .then((list) => {
        if (alive) {
          setKeys(list.filter((item) => !item.Client && item.Source !== "cli"));
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

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

  function forgetQr(): void {
    qrTicket.current += 1;
    setQrSrc("");
    setQrNote("");
  }

  useEffect(() => {
    const active = view.role === "host" && view.state !== "idle" && view.state !== "ended";
    const code = active ? (view.code ?? "").trim() : "";
    const ticket = ++qrTicket.current;
    if (!code) {
      setQrSrc("");
      return;
    }
    void encodeQrDataURL(code, { errorCorrectionLevel: "H", centerMark: remoteQrMark })
      .then((url) => {
        if (qrTicket.current === ticket) {
          setQrSrc(url);
        }
      })
      .catch(() => {
        if (qrTicket.current === ticket) {
          setQrSrc("");
        }
      });
  }, [view.code, view.role, view.state]);

  useEffect(() => {
    const path = view.peerPath;
    if (path === "checking" || path === "direct" || path === "derp") {
      media().setLink(path);
    }
  }, [view.peerPath]);

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
      mediaRef.current?.close();
    }
  }, [view.state]);

  useEffect(() => {
    const ready = view.role === "guest" && view.state === "live" && stream;
    if (!ready || !stream) {
      deskRef.current?.close();
      deskRef.current = null;
      setDeskOpen(false);
      return;
    }
    if (deskRef.current) {
      deskRef.current.setStream(stream);
      return;
    }
    const opened = openRemoteSessionWindow({
      title: t("remoteWindowTitle"),
      peer: view.peer || "",
      stream,
      fullscreenLabel: t("remoteFullscreen"),
      exitFullscreenLabel: t("remoteExitFullscreen"),
      endLabel: t("remoteEnd"),
      onInput: (input) => {
        void sendRemoteInput(input).catch(() => undefined);
      },
      onEnd: () => {
        void endRemote();
      },
      onClosed: () => {
        deskRef.current = null;
        setDeskOpen(false);
        void endRemote();
      },
    });
    if (!opened) {
      setDeskOpen(false);
      return;
    }
    deskRef.current = opened;
    setDeskOpen(true);
  }, [stream, t, view.peer, view.role, view.state]);

  useEffect(() => {
    return () => {
      deskRef.current?.close();
      deskRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!creating) {
      return;
    }
    document.body.classList.add("scoop-wait");
    return () => {
      document.body.classList.remove("scoop-wait");
    };
  }, [creating]);

  useEffect(() => {
    const peer = view.peer?.trim() ?? "";
    if (!peer.startsWith("tc")) {
      return;
    }
    if (view.state !== "incoming" && view.state !== "waiting" && view.state !== "live") {
      return;
    }
    const book: DeviceBook | "" = view.role === "host" ? "visitors" : view.role === "guest" ? "controlled" : "";
    if (!book) {
      return;
    }
    const os = view.peerOS?.trim() ?? "";
    const dir = book === "visitors" ? "in" : "out";
    const mark = `${dir}:${peer}:${view.state}:${os}`;
    if (noted.current === mark) {
      return;
    }
    noted.current = mark;
    const apply = book === "visitors" ? setVisitors : setControlled;
    apply((prev) => {
      const known = prev.find((item) => item.address === peer);
      if (known && known.os === (os || known.os) && prev[0]?.address === peer) {
        return prev;
      }
      const next = rememberDevice(prev, peer, Date.now(), os);
      writeDeviceBook(book, next);
      return next;
    });
    setMine((prev) => {
      if (!prev.some((item) => item.address === peer) || !os) {
        return prev;
      }
      const next = rememberDevice(prev, peer, Date.now(), os);
      writeDeviceBook("mine", next);
      return next;
    });
    setHistory((prev) => {
      const named = prev.find((item) => item.address === peer)?.name ?? "";
      const next = pushHistory(prev, { address: peer, name: named, os, at: Date.now(), dir });
      if (next === prev) {
        return prev;
      }
      writeHistory(next);
      return next;
    });
  }, [view.peer, view.peerOS, view.role, view.state]);

  function openDevice(value: string): void {
    setError("");
    setAddress(value);
    queueMicrotask(() => {
      const field = document.getElementById("remote-address");
      field?.scrollIntoView?.({ block: "center" });
      if (field instanceof HTMLTextAreaElement) {
        field.focus();
      }
    });
  }

  function keep(nextAddress: string): void {
    const target = extractRemoteTarget(nextAddress);
    const parsed = target ? parseRemoteCode(target) : null;
    const clean = shareableAddress(parsed?.addr || target);
    if (!clean) {
      setError(t("remoteBadAddress"));
      return;
    }
    setError("");
    if (!parsed) {
      setAddress(clean);
    }
    setMine((prev) => {
      const next = rememberDevice(prev, clean);
      writeDeviceBook("mine", next);
      return next;
    });
  }

  function books(): Record<DeviceBook, RemoteDevice[]> {
    return { visitors, controlled, mine };
  }

  function applyBook(book: DeviceBook, next: RemoteDevice[]): void {
    writeDeviceBook(book, next);
    if (book === "visitors") {
      setVisitors(next);
    } else if (book === "controlled") {
      setControlled(next);
    } else {
      setMine(next);
    }
  }

  function drop(book: DeviceBook, target: string): void {
    applyBook(book, forgetDevice(books()[book], target));
    if (book === "mine") {
      trust(target, false);
    }
  }

  function rename(book: DeviceBook, target: string, name: string): void {
    applyBook(book, renameDevice(books()[book], target, name));
    const clean = displayNickname(name);
    setHistory((prev) => {
      const next = prev.map((item) => (item.address === target ? { ...item, name: clean } : item));
      writeHistory(next);
      return next;
    });
  }

  function trust(target: string, on: boolean): void {
    const next = on ? trustAddress(trusted, target) : untrustAddress(trusted, target);
    setTrusted(next);
    writeTrust(next);
  }

  function showError(err: unknown): void {
    setError(err instanceof Error ? err.message : t("remoteUnreachable"));
  }

  function showShareError(err: unknown): void {
    const raw = err instanceof Error ? err.message : "";
    setShareError(raw && KNOWN_ERRORS[raw] ? t(KNOWN_ERRORS[raw]) : raw || t("remoteScreenFailed"));
  }

  async function control(): Promise<void> {
    const target = extractRemoteTarget(address);
    if (!target) {
      setError(t("remoteBadCode"));
      return;
    }
    setError("");
    const parsed = parseRemoteCode(target);
    keep(parsed?.addr || target);
    try {
      setView(await connectRemote(target));
    } catch (err) {
      showError(err);
    }
  }

  async function stopHost(): Promise<void> {
    hostIntent.current = "off";
    hostGen.current += 1;
    onHoldKey?.("");
    forgetQr();
    setShareOn(false);
    setShareError("");
    try {
      await endRemote();
    } catch (err) {
      setShareOn(null);
      showShareError(err);
    }
  }

  async function setSharing(on: boolean): Promise<void> {
    setError("");
    if (on && life === "key" && !keyName) {
      setKeyNeed(true);
      return;
    }
    setKeyNeed(false);
    if (!on) {
      await stopHost();
      return;
    }
    await openHost(life === "key" ? keyName : "");
  }

  async function openHost(named: string): Promise<void> {
    const gen = ++hostGen.current;
    hostIntent.current = "on";
    if (!named) {
      onHoldKey?.("");
    }
    forgetQr();
    shared.current = false;
    setShareOn(true);
    setCreating(true);
    try {
      const started = named ? await startRemoteHostKey(named) : await startRemoteHost(false);
      if (hostGen.current !== gen) {
        if (hostIntent.current !== "on") {
          await endRemote();
          onHoldKey?.("");
        }
        return;
      }
      setView(started);
      if (relay) {
        const routed = await setRemoteRelay(relay);
        if (hostGen.current !== gen) {
          if (hostIntent.current !== "on") {
            await endRemote();
            onHoldKey?.("");
          }
          return;
        }
        setView(routed);
      }
      if (hostIntent.current !== "on") {
        await endRemote();
        onHoldKey?.("");
        return;
      }
      onHoldKey?.(named);
      setShareError("");
    } catch (err) {
      if (hostGen.current === gen) {
        setShareOn(null);
        showShareError(err);
      }
    } finally {
      if (hostGen.current === gen || hostIntent.current !== "on") {
        setCreating(false);
      }
    }
  }

  async function chooseLife(next: "temp" | "key"): Promise<void> {
    if (creating || next === life) {
      return;
    }
    if (next === "key" && !keyName) {
      setLife("key");
      setKeyNeed(true);
      if (switchOn) {
        await stopHost();
      }
      return;
    }
    setKeyNeed(false);
    setLife(next);
    if (!switchOn) {
      return;
    }
    if (next === "temp") {
      onHoldKey?.("");
    }
    await openHost(next === "key" ? keyName : "");
  }

  async function connectTo(target: string): Promise<void> {
    setAddress(target);
    setError("");
    keep(target);
    try {
      setView(await connectRemote(target));
    } catch (err) {
      showError(err);
    }
  }

  async function makeKey(): Promise<void> {
    const name = resolveKeyName(keyDraft, relayLabel);
    setError("");
    setCreating(true);
    try {
      const region = relay.startsWith("region:") ? relay.slice("region:".length) : "";
      await createKey(name, false, region);
      const list = await listKeys();
      setKeys(list.filter((item) => !item.Client && item.Source !== "cli"));
      setKeyName(name);
      setKeyDraft("");
      setLife("key");
      setKeyNeed(false);
      if (switchOn) {
        await openHost(name);
      }
    } catch (err) {
      showError(err);
    } finally {
      setCreating(false);
    }
  }

  async function chooseRelay(next: string, label = ""): Promise<void> {
    const previous = relay;
    const previousLabel = relayLabel;
    setRelay(next);
    setRelayLabel(label);
    if (!sharing) {
      return;
    }
    setError("");
    setCreating(true);
    try {
      setView(await setRemoteRelay(next));
    } catch (err) {
      setRelay(previous);
      setRelayLabel(previousLabel);
      showError(err);
    } finally {
      setCreating(false);
    }
  }

  const onAddressPaste = useClipboardFieldPaste(
    address,
    (value) => {
      setError("");
      setAddress(value);
    },
    extractRemoteTarget,
    (reason: PasteFailure) => {
      setError(reason === "no-qr" || reason === "invalid" ? t("remoteBadCode") : t("remoteBadAddress"));
    },
  );

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
  const linked = (view.peer ?? "").trim();
  const showLinked =
    linked.startsWith("tc") && (view.state === "incoming" || view.state === "waiting" || view.state === "live");
  const sharing = view.role === "host" && view.state !== "idle" && view.state !== "ended" && Boolean(view.code);
  const switchOn = shareOn ?? sharing;
  const toolsLive = switchOn && sharing;
  const keyField = (
    <div className="field">
      <label htmlFor="remote-key">{t("remoteKeyPick")}</label>
      <select
        id="remote-key"
        className="glass-select"
        value={keyName}
        onChange={(event) => {
          const name = event.target.value;
          setKeyName(name);
          if (!name) {
            setKeyNeed(true);
            if (switchOn) {
              void stopHost();
            }
            return;
          }
          setKeyNeed(false);
          if (switchOn) {
            void openHost(name);
          }
        }}
      >
        <option value="">{t("remoteKeyPick")}</option>
        {keys
          .filter((item) => item.Name === keyName || !occupied.has(item.Name))
          .map((item) => (
            <option key={item.Name} value={item.Name}>
              {item.Name}
            </option>
          ))}
      </select>
      {keyNeed ? (
        <p className="err remote-key-need" role="alert">
          {t("remoteKeyNeed")}
        </p>
      ) : null}
    </div>
  );
  const keyCreate = (
    <form
      className="remote-key-create"
      onSubmit={(event) => {
        event.preventDefault();
        void makeKey();
      }}
    >
      <input
        value={keyDraft}
        aria-label={t("remoteKeyName")}
        placeholder={t("remoteKeyName")}
        autoComplete="off"
        onChange={(event) => setKeyDraft(event.target.value)}
      />
      <button className="btn btn-ghost" type="submit" disabled={creating}>
        {t("remoteKeyCreate")}
      </button>
    </form>
  );

  useEffect(() => {
    if (shareOn !== null && shareOn === sharing) {
      setShareOn(null);
    }
  }, [shareOn, sharing]);

  return (
    <div className={`remote-page${creating ? " is-creating" : ""}`}>
      {creating ? <ScoopCursor /> : null}
      <header className="chat-lobby-head">
        <HeadingHelp as="h2" title={t("remoteTitle")} help={t("remoteLede")} />
      </header>

      <div className="remote-split">
      <section className="glass chat-lobby-panel remote-panel remote-connect" aria-label={t("remoteConnectTitle")}>
        <HeadingHelp as="h3" title={t("remoteConnectTitle")} help={t("remoteConnectHelp")} />
        {message ? (
          <p className="err" role="alert">
            {message}
          </p>
        ) : null}
        <form
          className="remote-form"
          onSubmit={(event) => {
            event.preventDefault();
            keep(address);
          }}
        >
          <div className="field">
            <div className="qr-field">
              <textarea
                id="remote-address"
                aria-label={t("remoteAddress")}
                value={address}
                placeholder={t("remoteAddressPlaceholder")}
                autoComplete="off"
                spellCheck={false}
                rows={2}
                onChange={(event) => {
                  setAddress(event.target.value);
                  setError("");
                }}
                onPaste={onAddressPaste}
              />
              <QrScanButton
                iconOnly
                accept={(raw) => {
                  const value = extractRemoteTarget(raw);
                  return value ? { ok: true, value } : { ok: false };
                }}
                invalidKey="remoteBadCode"
                normalizePastedText={extractRemoteTarget}
                onAccept={(value) => {
                  setError("");
                  setAddress(value);
                }}
              />
            </div>
          </div>
          <div className="row">
            <button className="btn" type="button" onClick={() => void control()}>
              {t("remoteGuest")}
            </button>
            <button className="btn btn-ghost" type="submit">
              {t("remoteRemember")}
            </button>
            {view.role === "guest" && (view.state === "waiting" || view.state === "live") ? (
              <button className="btn btn-danger" type="button" onClick={() => void endRemote()}>
                {t("remoteEnd")}
              </button>
            ) : null}
          </div>
        </form>
        {view.role === "guest" && view.state === "waiting" ? <p className="chat-quiet">{t("remoteWaiting")}</p> : null}
        {view.role === "guest" && live ? <p className="chat-quiet">{t("remoteLive")}</p> : null}
        {deskOpen ? <p className="chat-quiet">{t("remoteWindowHint")}</p> : null}
        {quality ? (
          <p className="chat-quiet">
            {t("remoteQuality")
              .replaceAll("{label}", t(qualityLabelKey(quality.id)))
              .replaceAll("{path}", t(pathLabelKey(view.peerPath)))}
          </p>
        ) : null}
        {view.role === "guest" && live && !deskOpen ? (
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
        {showLinked && view.role === "guest" ? (
          <div className="remote-linked">
            <h3>{t("remotePeerGuest")}</h3>
            <p className="remote-recent-addr">{linked}</p>
            {live ? null : (
              <div className="row">
                <button className="btn" type="button" onClick={() => void connectTo(linked)}>
                  {t("remotePeerConnect")}
                </button>
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section className="glass chat-lobby-panel remote-panel" aria-label={t("remoteHost")}>
        <div className="remote-share-head">
          <HeadingHelp
            as="h3"
            title={t("remoteHost")}
            help={
              <ul className="remote-points">
                {REMOTE_POINTS.map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            }
          />
          <label className="burn-switch">
            <input
              className="switch"
              type="checkbox"
              role="switch"
              aria-label={t("remoteShareSwitch")}
              checked={switchOn}
              disabled={creating}
              onChange={(event) => void setSharing(event.target.checked)}
            />
          </label>
        </div>
        <div className="remote-life-setup">
            <div className="remote-life" role="radiogroup" aria-label={t("remoteHost")}>
              <button type="button" role="radio" aria-checked={life === "temp"} disabled={creating} onClick={() => void chooseLife("temp")}>
                {t("remoteLifeTemp")}
              </button>
              <button type="button" role="radio" aria-checked={life === "key"} disabled={creating} onClick={() => void chooseLife("key")}>
                {t("remoteLifeKey")}
              </button>
            </div>
            {switchOn && life === "key" && keyName && !keyNeed ? (
              <p className="pill remote-life-now">{t("remoteLifeUsing").replace("{name}", keyName)}</p>
            ) : null}
            {shareError ? (
              <p className="err" role="alert">
                {shareError}
              </p>
            ) : null}
            {life === "key" && !toolsLive && (!switchOn || keyNeed) ? (
              <div className="remote-key-setup">
                {keyField}
                {keyCreate}
              </div>
            ) : null}
        </div>
        <div className={`remote-host-stage${switchOn ? " is-live" : ""}`}>
          {switchOn ? <div key={life} className="remote-stage-body">
          <div className="remote-visual">
            {creating ? <LoadingCat layout="block" label={t("remoteCreating")} /> : null}
            {toolsLive && qrSrc && !creating ? (
              <div className="miao-qr">
                <img src={qrSrc} alt={t("remoteQr")} width={172} height={172} />
                <QrCopyButton
                  onClick={() => {
                    setQrNote("");
                    void copyQrImage(qrSrc, view.code)
                      .then(() => setQrNote(""))
                      .catch(() => setQrNote(t("qrCopyFailed")));
                  }}
                />
                {qrNote ? <p className="chat-quiet">{qrNote}</p> : null}
              </div>
            ) : null}
          </div>
          {toolsLive ? (
            <>
              <div className="remote-tool-row">
                {life === "key" ? keyField : null}
                <div className="field">
                  <div className="label-with-help">
                    <label htmlFor="remote-relay">{t("remoteRelay")}</label>
                    <HelpTip>{t("remoteRelayHelp")}</HelpTip>
                  </div>
                  <RelayCascade id="remote-relay" value={relay} disabled={creating} onChange={(value, label) => void chooseRelay(value, label ?? "")} />
                </div>
              </div>
              {life === "key" && keyNeed ? keyCreate : null}
            </>
          ) : null}
          </div> : null}
        </div>
        {showLinked && view.role === "host" ? (
          <div className="remote-linked">
            <h3>{t("remotePeerHost")}</h3>
            <p className="remote-recent-addr">{linked}</p>
          </div>
        ) : null}
      </section>

      </div>

      <div className="remote-books">
        <DeviceBookCard
          book="mine"
          title={t("remoteMine")}
          help={t("remoteTrustHelp")}
          empty={t("remoteMineEmpty")}
          list={mine}
          page={minePage}
          pageSize={MINE_PAGE}
          onPage={setMinePage}
          trustable
          trusted={trusted}
          linked={linked}
          showLinked={showLinked}
            onConnect={(value) => void connectTo(value)}
            onRename={(value, name) => rename("mine", value, name)}
          onDrop={(value) => drop("mine", value)}
          onTrust={trust}
        />
        <div className="remote-book-row">
          <DeviceBookCard
            book="visitors"
            title={t("remoteVisitors")}
            empty={t("remoteVisitorsEmpty")}
            list={visitors}
            page={0}
            pageSize={BOOK_SHOW}
            capped
            onPage={() => undefined}
            trustable={false}
            trusted={trusted}
            linked={linked}
            showLinked={showLinked}
            onConnect={(value) => void connectTo(value)}
            onRename={(value, name) => rename("visitors", value, name)}
            onDrop={(value) => drop("visitors", value)}
            onTrust={trust}
          />
          <DeviceBookCard
            book="controlled"
            title={t("remoteControlled")}
            empty={t("remoteControlledEmpty")}
            list={controlled}
            page={0}
            pageSize={BOOK_SHOW}
            capped
            onPage={() => undefined}
            trustable={false}
            trusted={trusted}
            linked={linked}
            showLinked={showLinked}
            onConnect={(value) => void connectTo(value)}
            onRename={(value, name) => rename("controlled", value, name)}
            onDrop={(value) => drop("controlled", value)}
            onTrust={trust}
          />
        </div>
        <HistoryCard list={history} page={historyPage} onPage={setHistoryPage} onOpen={openDevice} />
      </div>
    </div>
  );
}

function DeviceBookCard({
  book,
  title,
  help,
  empty,
  list,
  page,
  pageSize,
  capped = false,
  onPage,
  trustable,
  trusted,
  linked,
  showLinked,
  onConnect,
  onRename,
  onDrop,
  onTrust,
}: {
  book: DeviceBook;
  title: string;
  help?: string;
  empty: string;
  list: RemoteDevice[];
  page: number;
  pageSize: number;
  capped?: boolean;
  onPage: (page: number) => void;
  trustable: boolean;
  trusted: string[];
  linked: string;
  showLinked: boolean;
  onConnect: (address: string) => void;
  onRename: (address: string, name: string) => void;
  onDrop: (address: string) => void;
  onTrust: (address: string, on: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const safe = Math.min(page, pages - 1);
  const shown = list.slice(safe * pageSize, safe * pageSize + pageSize);
  const hidden = capped ? Math.max(0, list.length - shown.length) : 0;
  return (
    <section className={`glass chat-lobby-panel remote-panel remote-book${book === "mine" ? " remote-book-mine" : ""}`} aria-label={title}>
      {help ? <HeadingHelp as="h3" title={title} help={help} /> : <h3>{title}</h3>}
      <div className="remote-book-list">
        {shown.length === 0 ? <p className="chat-quiet remote-devices-empty">{empty}</p> : null}
        {shown.map((item) => {
          const online = showLinked && linked === item.address;
          const trustedOn = trustable && isTrusted(trusted, item.address);
          return (
            <article key={item.address} className="remote-device">
              <PlatformMark platform={platformOf(item.os)} />
              <div className="remote-device-body">
                <input
                  className="nickname-input remote-device-name"
                  value={item.name}
                  placeholder={t("remoteDeviceName")}
                  aria-label={`${t("remoteDeviceName")} ${item.address}`}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => onRename(item.address, event.target.value)}
                  onBlur={(event) => onRename(item.address, displayNickname(event.currentTarget.value))}
                />
                <div className="remote-device-main">
                  <span className="remote-recent-addr" title={item.address}>
                    {item.address}
                  </span>
                  <span className="remote-device-meta">
                    {online ? (
                      <span className="remote-presence">
                        <span className="remote-presence-dot" />
                        {t("remoteOnline")}
                      </span>
                    ) : null}
                    {item.os ? <span className="remote-device-os">{item.os}</span> : null}
                    {item.at > 0 ? <span className="remote-device-seen">{formatSeen(item.at, locale)}</span> : null}
                    {trustedOn ? <span className="remote-recent-mode">{t("remoteTrusted")}</span> : null}
                  </span>
                </div>
                <div className="remote-device-actions">
                  <button type="button" className="btn" onClick={() => onConnect(item.address)}>
                    {t("remoteGuest")}
                  </button>
                  {trustable ? (
                    <button type="button" className="btn btn-ghost" onClick={() => onTrust(item.address, !trustedOn)}>
                      {trustedOn ? t("remoteUntrust") : t("remoteTrust")}
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-ghost" onClick={() => onDrop(item.address)}>
                    {t("remoteForget")}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {hidden > 0 ? <p className="chat-quiet remote-book-more">{t("remoteHistoryMore")}</p> : null}
      <div className="remote-book-pager">
        {!capped && pages > 1 ? (
          <div className="derp-list-pager">
            <button className="btn btn-ghost btn-small" type="button" disabled={safe <= 0} onClick={() => onPage(Math.max(0, safe - 1))}>
              {t("derpListPrev")}
            </button>
            <span className="derp-list-page">
              {t("derpListPage").replace("{page}", String(safe + 1)).replace("{pages}", String(pages)).replace("{total}", String(list.length))}
            </span>
            <button className="btn btn-ghost btn-small" type="button" disabled={safe >= pages - 1} onClick={() => onPage(Math.min(pages - 1, safe + 1))}>
              {t("derpListNext")}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function HistoryCard({
  list,
  page,
  onPage,
  onOpen,
}: {
  list: RemoteHistoryItem[];
  page: number;
  onPage: (page: number) => void;
  onOpen: (address: string) => void;
}) {
  const { t, locale } = useI18n();
  const pages = Math.max(1, Math.ceil(list.length / HISTORY_PAGE));
  const safe = Math.min(page, pages - 1);
  const shown = list.slice(safe * HISTORY_PAGE, safe * HISTORY_PAGE + HISTORY_PAGE);
  return (
    <section className="glass chat-lobby-panel remote-panel remote-book remote-history" aria-label={t("remoteHistory")}>
      <h3>{t("remoteHistory")}</h3>
      <div className="remote-history-list">
        {shown.length === 0 ? <p className="chat-quiet remote-devices-empty">{t("remoteHistoryEmpty")}</p> : null}
        {shown.map((item, index) => (
          <button
            key={`${item.dir}:${item.address}:${item.at}:${index}`}
            type="button"
            className="remote-history-row"
            onClick={() => onOpen(item.address)}
          >
            <span className="pill">{item.dir === "in" ? t("remoteHistoryIn") : t("remoteHistoryOut")}</span>
            <span className="remote-history-name">{item.name || item.address}</span>
            {item.os ? <span className="remote-device-os">{item.os}</span> : null}
            <span className="remote-device-seen">{formatSeen(item.at, locale)}</span>
          </button>
        ))}
      </div>
      <div className="remote-book-pager">
        {pages > 1 ? (
          <div className="derp-list-pager">
            <button className="btn btn-ghost btn-small" type="button" disabled={safe <= 0} onClick={() => onPage(Math.max(0, safe - 1))}>
              {t("derpListPrev")}
            </button>
            <span className="derp-list-page">
              {t("derpListPage").replace("{page}", String(safe + 1)).replace("{pages}", String(pages)).replace("{total}", String(list.length))}
            </span>
            <button className="btn btn-ghost btn-small" type="button" disabled={safe >= pages - 1} onClick={() => onPage(Math.min(pages - 1, safe + 1))}>
              {t("derpListNext")}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function platformOf(os: string): DevicePlatform {
  if (/windows/i.test(os)) {
    return "windows";
  }
  if (/mac/i.test(os)) {
    return "mac";
  }
  if (/linux/i.test(os)) {
    return "linux";
  }
  return "other";
}

function formatSeen(at: number, locale: string): string {
  if (!at) {
    return "";
  }
  return new Date(at).toLocaleString(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function PlatformMark({ platform }: { platform: DevicePlatform }) {
  const { t } = useI18n();
  const label =
    platform === "windows"
      ? t("remoteOsWindows")
      : platform === "mac"
        ? t("remoteOsMac")
        : platform === "linux"
          ? t("remoteOsLinux")
          : t("remoteOsOther");
  const art = platform === "windows" ? platformWindows : platform === "mac" ? platformMac : platform === "linux" ? platformLinux : "";
  return (
    <span className={`remote-os remote-os-${platform}`} role="img" aria-label={label} title={label}>
      {art ? <img src={art} alt="" /> : <DeviceIcon />}
    </span>
  );
}

function DeviceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 19h8M12 15v4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ScoopCursor() {
  const node = useRef<HTMLImageElement>(null);
  useEffect(() => {
    function move(event: PointerEvent): void {
      const el = node.current;
      if (!el) {
        return;
      }
      el.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      el.style.opacity = "1";
    }
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);
  return <img ref={node} className="scoop-cursor" src={catGif} alt="" />;
}
