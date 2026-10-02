/** WeChat-like voice bubble width from duration (seconds). */
export function voiceBubbleWidthPx(durationSec: number): number {
  const d = Math.max(1, Math.min(60, Math.round(Number.isFinite(durationSec) ? durationSec : 1)));
  const minW = 64;
  const maxW = 200;
  return Math.round(minW + ((maxW - minW) * (d - 1)) / 59);
}

/** Format seconds as WeChat-style `3"`. */
export function formatVoiceDuration(durationSec: number): string {
  const d = Math.max(1, Math.round(Number.isFinite(durationSec) ? durationSec : 1));
  return `${d}"`;
}

/** Elapsed mm:ss for the recording overlay. */
export function formatRecordElapsed(totalSec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(totalSec) ? totalSec : 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Encode PCM/opus bytes for optimistic voice bubbles. */
export function audioBytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
