import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useI18n } from "../i18n";
import type { CallView } from "../lib/liveCall";

type Props = {
  view: CallView;
  title: string;
  onAccept: () => void;
  onDecline: () => void;
  onHangup: () => void;
  onMute: () => void;
};

function formatDuration(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function Glyph({ d, slash = false }: { d: string; slash?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d={d} />
      {slash ? <path fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" d="M5 19 19 5" /> : null}
    </svg>
  );
}

const micPath =
  "M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z";
const phonePath =
  "M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 12 12 0 0 0 3.6.55 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 12 12 0 0 0 .55 3.6 1 1 0 0 1-.25 1L6.6 10.8z";

export default function CallFloat({ view, title, onAccept, onDecline, onHangup, onMute }: Props) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const voice = view.mode === "voice" || view.mode === "video";
  const visible = voice && view.phase !== "idle";
  const linked = visible && view.linked;
  const remoteVideo = view.mode === "video" ? view.remoteStream : null;
  const showVideo = Boolean(remoteVideo && remoteVideo.getVideoTracks().length > 0);

  useEffect(() => {
    if (!linked) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [linked]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) {
      return;
    }
    try {
      el.srcObject = remoteVideo;
    } catch {
      // Test doubles are not DOM media streams.
    }
  }, [remoteVideo, showVideo]);

  if (!visible) {
    return null;
  }

  const modeLabel = view.mode === "video" ? t("chatCallVideo") : t("chatCallVoice");
  const name = title || modeLabel;
  const ringing = view.phase === "ringing";
  const status = ringing
    ? t("chatCallRinging")
    : linked
      ? `${t("chatCallInProgress")} - ${formatDuration(elapsed)}`
      : t("chatCallCalling");

  function onPointerDown(event: ReactPointerEvent<HTMLElement>): void {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }
    const card = event.currentTarget.parentElement;
    if (!card) {
      return;
    }
    const rect = card.getBoundingClientRect();
    drag.current = { id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>): void {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) {
      return;
    }
    setPos({ x: event.clientX - current.dx, y: event.clientY - current.dy });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLElement>): void {
    if (drag.current?.id === event.pointerId) {
      drag.current = null;
    }
  }

  return (
    <section
      className="call-float"
      role="region"
      aria-label={t("chatCallCard")}
      style={pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined}
    >
      <div
        className="call-float-top"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="call-float-handle" aria-hidden="true" />
        <div className="call-float-row">
          <div className="call-float-avatar" aria-hidden="true">
            {initials(name)}
          </div>
          <div className="call-float-copy">
            <p className="call-float-name">{name}</p>
            <p className="call-float-status" role={linked ? "timer" : "status"}>
              {status}
            </p>
          </div>
          <div className="call-float-actions">
            {ringing ? (
              <>
                <button className="call-float-btn call-float-answer" type="button" aria-label={t("chatCallAnswer")} onClick={onAccept}>
                  <Glyph d={phonePath} />
                </button>
                <button className="call-float-btn call-float-end" type="button" aria-label={t("chatCallDecline")} onClick={onDecline}>
                  <Glyph d={phonePath} />
                </button>
              </>
            ) : (
              <>
                <button
                  className="call-float-btn call-float-mute"
                  type="button"
                  aria-pressed={view.muted}
                  aria-label={view.muted ? t("chatCallUnmute") : t("chatCallMute")}
                  onClick={onMute}
                >
                  <Glyph d={micPath} slash={view.muted} />
                </button>
                <button className="call-float-btn call-float-end" type="button" aria-label={t("chatCallEnd")} onClick={onHangup}>
                  <Glyph d={phonePath} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {showVideo ? <video ref={videoRef} autoPlay playsInline /> : null}
    </section>
  );
}
