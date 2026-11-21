import { sanitizeNickname } from "./nickname";
import { shareableAddress } from "./qr";

export type RemoteDevice = {
  address: string;
  name: string;
  os: string;
  at: number;
};

export type RemoteHistoryItem = {
  address: string;
  name: string;
  os: string;
  at: number;
  dir: "in" | "out";
};

export type DeviceBook = "visitors" | "controlled" | "mine";

/** My devices sit side by side, four to a page. */
export const MINE_PAGE = 4;
/** Incoming and controlled cards keep only the latest few. Older ones stay in history. */
export const BOOK_SHOW = 4;
export const HISTORY_PAGE = 6;

const DEVICE_LIMIT = 24;
const HISTORY_LIMIT = 40;
const HISTORY_KEY = "tailcat-remote-history";

export const DEVICE_KEYS: Record<DeviceBook, string> = {
  visitors: "tailcat-remote-visitors",
  controlled: "tailcat-remote-controlled",
  mine: "tailcat-remote-mine",
};

const LEGACY_RECENT_KEY = "tailcat-remote-recent";

export function rememberDevice(list: RemoteDevice[], address: string, at = Date.now(), os = ""): RemoteDevice[] {
  const clean = address.trim();
  const prev = list.find((item) => item.address === clean);
  const nextOS = os.trim() || prev?.os || "";
  return [{ address: clean, name: prev?.name ?? "", os: nextOS, at }, ...list.filter((item) => item.address !== clean)].slice(0, DEVICE_LIMIT);
}

export function forgetDevice(list: RemoteDevice[], address: string): RemoteDevice[] {
  return list.filter((item) => item.address !== address);
}

export function renameDevice(list: RemoteDevice[], address: string, name: string): RemoteDevice[] {
  const next = sanitizeNickname(name);
  return list.map((item) => (item.address === address ? { ...item, name: next } : item));
}

function parseDevices(raw: string | null): RemoteDevice[] {
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const row = item as Partial<RemoteDevice>;
      const address = shareableAddress(typeof row.address === "string" ? row.address : "");
      if (!address) {
        return [];
      }
      const name = sanitizeNickname(typeof row.name === "string" ? row.name : "").trim();
      const os = typeof row.os === "string" ? row.os.trim() : "";
      return [{ address, name, os, at: typeof row.at === "number" ? row.at : 0 }];
    });
  } catch {
    return [];
  }
}

export function readDeviceBook(book: DeviceBook): RemoteDevice[] {
  const key = DEVICE_KEYS[book];
  if (book === "mine" && localStorage.getItem(key) === null) {
    const seeded = parseDevices(localStorage.getItem(LEGACY_RECENT_KEY));
    writeDeviceBook("mine", seeded);
    return seeded;
  }
  return parseDevices(localStorage.getItem(key));
}

export function writeDeviceBook(book: DeviceBook, list: RemoteDevice[]): void {
  localStorage.setItem(DEVICE_KEYS[book], JSON.stringify(list));
}

export function readHistory(): RemoteHistoryItem[] {
  return parseHistory(localStorage.getItem(HISTORY_KEY));
}

export function writeHistory(list: RemoteHistoryItem[]): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

export function pushHistory(list: RemoteHistoryItem[], item: RemoteHistoryItem): RemoteHistoryItem[] {
  const top = list[0];
  if (top && top.address === item.address && top.dir === item.dir && item.at - top.at < 15000) {
    if (item.os && item.os !== top.os) {
      return [{ ...top, os: item.os, name: item.name || top.name }, ...list.slice(1)];
    }
    return list;
  }
  return [item, ...list].slice(0, HISTORY_LIMIT);
}

function parseHistory(raw: string | null): RemoteHistoryItem[] {
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const row = item as Partial<RemoteHistoryItem>;
      const address = shareableAddress(typeof row.address === "string" ? row.address : "");
      if (!address || (row.dir !== "in" && row.dir !== "out")) {
        return [];
      }
      const name = sanitizeNickname(typeof row.name === "string" ? row.name : "").trim();
      const os = typeof row.os === "string" ? row.os.trim() : "";
      return [{ address, name, os, at: typeof row.at === "number" ? row.at : 0, dir: row.dir }];
    });
  } catch {
    return [];
  }
}

/** Devices the user saved under 我的设备. Relay sharing does not list visitors or controlled computers. */
export function listShareDevices(): { address: string; label: string }[] {
  const mineKey = DEVICE_KEYS.mine;
  const mine =
    localStorage.getItem(mineKey) === null
      ? parseDevices(localStorage.getItem(LEGACY_RECENT_KEY))
      : parseDevices(localStorage.getItem(mineKey));
  return mine.map((item) => ({ address: item.address, label: item.name || item.address }));
}
