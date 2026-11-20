import { regionOptions } from "./miao";
import type { Locale } from "../i18n/locale";

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

/** The city name in a relay label, safe to append to a key file name. */
export function relaySlug(label: string): string {
  const text = label.trim();
  if (!text) {
    return "";
  }
  const name = text.split("·")[0]?.trim() ?? "";
  return name.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "").slice(0, 32);
}

/** Use draft if non-empty after trim; otherwise a fresh defaultKeyName(). A chosen relay is appended. */
export function resolveKeyName(draft: string, relayLabel = ""): string {
  const base = draft.trim() || defaultKeyName();
  const extra = relaySlug(relayLabel);
  if (!extra) {
    return base;
  }
  const suffix = `-${extra}`;
  if (base.endsWith(suffix)) {
    return base;
  }
  return `${base}${suffix}`;
}

/** Name a key from the official region code chosen in settings or the lobby. */
export function keyNameForRegion(draft: string, regionCode: string, locale: Locale): string {
  const code = regionCode.trim();
  if (!code) {
    return resolveKeyName(draft);
  }
  const label = regionOptions(locale).find((item) => item.code === code)?.label ?? code;
  return resolveKeyName(draft, label);
}