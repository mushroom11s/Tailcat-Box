import type { MessageKey } from "../i18n";
import type { CallMode, CallOutcome } from "./liveCall";

/** The transcript fields a call record uses: type "call", Body = mode, Code = outcome. */
export type CallRecordMessage = {
  type: string;
  direction: "in" | "out" | "system";
  code?: string;
  body?: string;
  duration?: number;
};

export function callRecordMode(msg: CallRecordMessage): CallMode | null {
  return msg.body === "voice" || msg.body === "video" || msg.body === "screen" ? msg.body : null;
}

export function callRecordOutcome(msg: CallRecordMessage): CallOutcome {
  const code = msg.code;
  if (code === "completed" || code === "declined" || code === "cancelled" || code === "missed" || code === "failed") {
    return code;
  }
  return "failed";
}

/** 03:12, or 1:02:03 past an hour. */
export function formatCallDuration(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function callModeLabel(mode: CallMode | null, t: (key: MessageKey) => string): string {
  if (mode === "video") {
    return t("callRecVideo");
  }
  if (mode === "screen") {
    return t("callRecScreen");
  }
  return t("callRecVoice");
}

/**
 * WeChat-style line for one side's record. direction "out" means this side
 * placed the call, so a decline reads "Declined" (by the peer) for the caller
 * and "You declined" for the callee.
 */
export function callRecordText(msg: CallRecordMessage, t: (key: MessageKey) => string): string {
  const outgoing = msg.direction === "out";
  const mode = callRecordMode(msg);
  switch (callRecordOutcome(msg)) {
    case "completed": {
      const key: MessageKey = mode === "screen" ? "callRecShareDuration" : "callRecDuration";
      return `${callModeLabel(mode, t)} ${t(key).replaceAll("{t}", formatCallDuration(msg.duration ?? 0))}`;
    }
    case "declined":
      return t(outgoing ? "callRecDeclinedByPeer" : "callRecDeclined");
    case "cancelled":
      return t(outgoing ? "callRecCancelled" : "callRecCancelledByPeer");
    case "missed":
      return t(outgoing ? "callRecNoAnswer" : "callRecMissed");
    default:
      return t("callRecFailed");
  }
}
