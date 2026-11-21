import { emitBrowserEvent, type TailcatEvent } from "./wails";

export type RemoteMode = "desk" | "play" | "assist";

export type RemoteView = {
  role: "" | "host" | "guest";
  state: "idle" | "listening" | "incoming" | "waiting" | "live" | "ended";
  address?: string;
  peer?: string;
  mode?: string;
  error?: string;
  peerPath?: "" | "checking" | "direct" | "derp";
  peerOS?: string;
  token?: string;
  code?: string;
  forever?: boolean;
};

export type RemoteInput = {
  kind: "move" | "down" | "up" | "wheel" | "key";
  x?: number;
  y?: number;
  button?: "left" | "right" | "middle";
  dy?: number;
  code?: string;
  down?: boolean;
};

type RemoteApp = {
  StartRemoteHost?: (permanent: boolean) => Promise<RemoteView>;
  StartRemoteHostKey?: (name: string) => Promise<RemoteView>;
  SetRemoteRelay?: (region: string) => Promise<RemoteView>;
  RemoteStatus?: () => Promise<RemoteView>;
  ConnectRemote?: (address: string, mode: string) => Promise<RemoteView>;
  AllowRemote?: () => Promise<void>;
  DenyRemote?: () => Promise<void>;
  EndRemote?: () => Promise<void> | void;
  SendRemoteSignal?: (meta: string) => Promise<void>;
  SendRemoteInput?: (input: RemoteInput) => Promise<void>;
};

function goApp(): RemoteApp | null {
  const host = window as unknown as { go?: { main?: { App?: RemoteApp } } };
  return host.go?.main?.App ?? null;
}

const TRUST_KEY = "tailcat-remote-trust";

export function readTrust(): string[] {
  try {
    const raw = localStorage.getItem(TRUST_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string" && item.startsWith("tc"));
  } catch {
    return [];
  }
}

export function writeTrust(list: string[]): void {
  localStorage.setItem(TRUST_KEY, JSON.stringify(list));
}

export function trustAddress(list: string[], address: string): string[] {
  const clean = address.trim();
  if (!clean.startsWith("tc") || list.includes(clean)) {
    return list;
  }
  return [clean, ...list];
}

export function untrustAddress(list: string[], address: string): string[] {
  return list.filter((item) => item !== address.trim());
}

export function isTrusted(list: string[], address: string): boolean {
  const clean = address.trim();
  return clean !== "" && list.includes(clean);
}

let preview: RemoteView = { role: "", state: "idle" };

function publishPreview(view: RemoteView): RemoteView {
  preview = view;
  emitBrowserEvent({ SessionID: "remote", Kind: "remote", Data: JSON.stringify(view) });
  return view;
}

export function encodeRemoteCode(addr: string, token: string): string {
  const raw = JSON.stringify({ a: addr, t: token });
  const bytes = new TextEncoder().encode(raw);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `rc1.${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
}

export function parseRemoteCode(raw: string): { addr: string; token: string } | null {
  const start = raw.indexOf("rc1.");
  if (start < 0) {
    return null;
  }
  let enc = raw.slice(start + 4);
  const cut = enc.search(/\s/);
  if (cut >= 0) {
    enc = enc.slice(0, cut);
  }
  try {
    const pad = enc.length % 4 === 0 ? "" : "=".repeat(4 - (enc.length % 4));
    const binary = atob(enc.replaceAll("-", "+").replaceAll("_", "/") + pad);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const packed = JSON.parse(new TextDecoder().decode(bytes)) as { a?: string; t?: string };
    const addr = packed.a?.trim() ?? "";
    const token = packed.t ?? "";
    if (!addr.startsWith("tc") || !token) {
      return null;
    }
    return { addr, token };
  } catch {
    return null;
  }
}

/** Pull a connection code out of pasted text, or a bare Tailcat address. */
export function extractRemoteTarget(raw: string): string {
  const match = raw.match(/rc1\.[A-Za-z0-9_-]+/);
  if (match && parseRemoteCode(match[0])) {
    return match[0];
  }
  const direct = raw.trim();
  if (direct.startsWith("tc")) {
    return direct;
  }
  for (const part of raw.split(/\s+/)) {
    if (part.startsWith("tc")) {
      return part;
    }
  }
  return "";
}

export async function remoteStatus(): Promise<RemoteView> {
  const app = goApp();
  if (app?.RemoteStatus) {
    return app.RemoteStatus();
  }
  return preview;
}

export async function setRemoteRelay(region: string): Promise<RemoteView> {
  const app = goApp();
  if (app?.SetRemoteRelay) {
    return app.SetRemoteRelay(region);
  }
  return preview.role === "host" ? preview : remoteStatus();
}

export async function startRemoteHostKey(name: string): Promise<RemoteView> {
  const app = goApp();
  if (app?.StartRemoteHostKey) {
    return app.StartRemoteHostKey(name);
  }
  const clean = name.trim();
  const code = encodeRemoteCode(`tc:preview-${clean}`, `key:${clean}`);
  return publishPreview({
    role: "host",
    state: "listening",
    address: `tc:preview-${clean}`,
    code,
    token: `key:${clean}`,
    forever: true,
  });
}

export async function startRemoteHost(permanent: boolean): Promise<RemoteView> {
  const app = goApp();
  if (app?.StartRemoteHost) {
    return app.StartRemoteHost(permanent);
  }
  const code = encodeRemoteCode("tc:preview-host", permanent ? "permanent" : "temp");
  return publishPreview({ role: "host", state: "listening", address: "tc:preview-host", code, token: permanent ? "permanent" : "temp", forever: permanent });
}

export async function connectRemote(address: string): Promise<RemoteView> {
  const app = goApp();
  if (app?.ConnectRemote) {
    // Mode used to be desk/play/assist UI labels only; wire protocol still
    // expects a value, so we always send desk.
    return app.ConnectRemote(address, "desk");
  }
  return publishPreview({ role: "guest", state: "waiting", peer: address.trim(), mode: "desk" });
}

export async function allowRemote(): Promise<void> {
  const app = goApp();
  if (app?.AllowRemote) {
    await app.AllowRemote();
    return;
  }
  publishPreview({ ...preview, role: "host", state: "live" });
}

export async function denyRemote(): Promise<void> {
  const app = goApp();
  if (app?.DenyRemote) {
    await app.DenyRemote();
    return;
  }
  publishPreview({ ...preview, state: "ended", error: "The request was declined." });
}

export async function endRemote(): Promise<void> {
  const app = goApp();
  if (app?.EndRemote) {
    await app.EndRemote();
    return;
  }
  if (preview.role) {
    publishPreview({ ...preview, state: "ended" });
    return;
  }
  publishPreview({ role: "", state: "idle" });
}

export async function sendRemoteSignal(meta: string): Promise<void> {
  const app = goApp();
  if (app?.SendRemoteSignal) {
    await app.SendRemoteSignal(meta);
  }
}

export async function sendRemoteInput(input: RemoteInput): Promise<void> {
  const app = goApp();
  if (app?.SendRemoteInput) {
    await app.SendRemoteInput(input);
  }
}

export function isRemoteEvent(ev: TailcatEvent): boolean {
  return ev.Kind === "remote" || ev.Kind === "remote-signal";
}
