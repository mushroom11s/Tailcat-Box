import { useEffect, useState } from "react";
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

// Inline call status for the chat call panel: who, state/duration, and the call controls.
export default function CallStatus({ view, title, onAccept, onDecline, onHangup, onMute }: Props) {
  const { t } = useI18n();
  const [elapsed, setElapsed] = useState(0);
  const linked = view.phase !== "idle" && view.linked;

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

  if (view.phase === "idle") {
    return null;
  }

  const modeLabel =
    view.mode === "video" ? t("chatCallVideo") : view.mode === "screen" ? t("chatCallScreen") : t("chatCallVoice");
  const ringing = view.phase === "ringing";
  const status = ringing
    ? t("chatCallRinging")
    : linked
      ? `${t("chatCallInProgress")} ${formatDuration(elapsed)}`
      : t("chatCallCalling");

  return (
    <div className="call-status" role="region" aria-label={t("chatCallCard")}>
      <div className="call-status-copy">
        <p className="call-status-name">{title || modeLabel}</p>
        <p className="call-status-state" role={linked ? "timer" : "status"}>
          {title ? `${modeLabel} · ${status}` : status}
        </p>
      </div>
      <div className="call-status-actions">
        {ringing ? (
          <>
            <button className="call-status-btn call-status-answer" type="button" aria-label={t("chatCallAnswer")} onClick={onAccept}>
              <Glyph d={phonePath} />
            </button>
            <button className="call-status-btn call-status-end" type="button" aria-label={t("chatCallDecline")} onClick={onDecline}>
              <Glyph d={phonePath} />
            </button>
          </>
        ) : (
          <>
            <button
              className="call-status-btn call-status-mute"
              type="button"
              aria-pressed={view.muted}
              aria-label={view.muted ? t("chatCallUnmute") : t("chatCallMute")}
              onClick={onMute}
            >
              <Glyph d={micPath} slash={view.muted} />
            </button>
            <button className="call-status-btn call-status-end" type="button" aria-label={t("chatCallEnd")} onClick={onHangup}>
              <Glyph d={phonePath} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
