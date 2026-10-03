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
  }, [remoteVideo]);

  if (!visible) {
    return null;
  }

  const modeLabel = view.mode === "video" ? t("chatCallVideo") : t("chatCallVoice");
  const ringing = view.phase === "ringing";
  const status = ringing ? t("chatCallRinging") : linked ? formatDuration(elapsed) : t("chatCallCalling");

  function onPointerDown(event: ReactPointerEvent<HTMLElement>): void {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
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
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {remoteVideo && remoteVideo.getVideoTracks().length > 0 ? (
        <video ref={videoRef} autoPlay playsInline />
      ) : null}
      <p className="call-float-name">{title || modeLabel}</p>
      <p className="call-float-status" role={linked ? "timer" : "status"}>
        {status}
      </p>
      <div className="call-float-actions">
        {ringing ? (
          <>
            <button className="call-float-btn call-float-answer" type="button" onClick={onAccept}>
              {t("chatCallAnswer")}
            </button>
            <button className="call-float-btn call-float-end" type="button" onClick={onDecline}>
              {t("chatCallDecline")}
            </button>
          </>
        ) : (
          <>
            <button className="call-float-btn call-float-mute" type="button" aria-pressed={view.muted} onClick={onMute}>
              {view.muted ? t("chatCallUnmute") : t("chatCallMute")}
            </button>
            <button className="call-float-btn call-float-end" type="button" onClick={onHangup}>
              {t("chatCallEnd")}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
