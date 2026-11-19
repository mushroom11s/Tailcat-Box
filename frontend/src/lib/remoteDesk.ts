import { emitBrowserEvent, type TailcatEvent } from "./wails";

export type RemoteMode = "desk" | "play" | "assist";

export type RemoteView = {
  role: "" | "host" | "guest";
  state: "idle" | "listening" | "incoming" | "waiting" | "live" | "ended";
  address?: string;
  peer?: string;
  mode?: string;
  error?: string;
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
  StartRemoteHost?: () => Promise<RemoteView>;
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

export async function startRemoteHost(): Promise<RemoteView> {
  const app = goApp();
  if (app?.StartRemoteHost) {
    return app.StartRemoteHost();
  }
  return publishPreview({ role: "host", state: "listening", address: "tc:preview-host" });
}

export async function connectRemote(address: string, mode: RemoteMode): Promise<RemoteView> {
  const app = goApp();
  if (app?.ConnectRemote) {
    return app.ConnectRemote(address, mode);
  }
  return publishPreview({ role: "guest", state: "waiting", peer: address.trim(), mode });
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
