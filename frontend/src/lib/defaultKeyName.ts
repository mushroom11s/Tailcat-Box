/** Default display name for a newly created Tailcat key: Tailcat-YYYYMMDD-xxxxxx */
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local calendar date as YYYYMMDD. */
export function formatKeyDate(d: Date = new Date()): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

function randomAlnum(length: number): string {
  const out: string[] = [];
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    for (let i = 0; i < length; i++) {
      out.push(ALNUM[buf[i]! % ALNUM.length]!);
    }
    return out.join("");
  }
  for (let i = 0; i < length; i++) {
    out.push(ALNUM[Math.floor(Math.random() * ALNUM.length)]!);
  }
  return out.join("");
}

/** Tailcat-YYYYMMDD-xxxxxx using the local date and 6 random alphanumeric chars. */
export function defaultKeyName(now: Date = new Date(), suffix?: string): string {
  const tail = suffix ?? randomAlnum(6);
  return `Tailcat-${formatKeyDate(now)}-${tail}`;
}

/** Use draft if non-empty after trim; otherwise a fresh defaultKeyName(). */
export function resolveKeyName(draft: string): string {
  const trimmed = draft.trim();
  return trimmed || defaultKeyName();
}