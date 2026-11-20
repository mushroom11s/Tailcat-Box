import type { TailcatEvent } from "./wails";

export type DerpCandidate = {
  regionId: number;
  name: string;
  host: string;
  port: number;
  latencyMs: number;
};

/** Search engines that can find public relays, in display order. */
export const DERP_ENGINES = [
  { id: "fofa", name: "FOFA" },
  { id: "zoomeye", name: "ZoomEye" },
  { id: "hunter", name: "Hunter" },
  { id: "quake", name: "Quake" },
] as const;

export type DerpEngineId = (typeof DERP_ENGINES)[number]["id"];

export type DerpKeySlot = {
  engine: string;
  index: number;
  hint: string;
  quota?: string;
  error?: string;
};

export type DerpStatus = {
  country: string;
  mode: "official" | "scan" | "custom";
  active?: DerpCandidate;
  candidates: DerpCandidate[];
  /** Best official round trip: 0 unknown, -1 unreachable. */
  officialMs: number;
  scannedAt: string;
  scanning: boolean;
  hasKey: boolean;
  /** Engine ids with at least one saved key. */
  engines: string[];
  /** Masked key slots with optional quota text. */
  keys: DerpKeySlot[];
  /** Last scan's failures keyed by engine display name. */
  engineErrors?: Record<string, string>;
  auto: boolean;
  error: string;
};

export type DerpEvent =
  | { type: "status"; status: DerpStatus }
  | { type: "shared"; status: DerpStatus }
  | { type: "suggest"; candidate: DerpCandidate; baselineMs: number }
  | { type: "switched"; candidate?: DerpCandidate; reason: string };

type DerpApp = {
  DERPStatus?: () => Promise<DerpStatus>;
  SetDERPAuto?: (auto: boolean) => Promise<DerpStatus>;
  AddDERPKey?: (engine: string, key: string) => Promise<DerpStatus>;
  RemoveDERPKey?: (engine: string, index: number) => Promise<DerpStatus>;
  RefreshDERPQuotas?: () => Promise<DerpStatus>;
  ScanDERP?: () => Promise<DerpStatus>;
  UseDERPRegion?: (regionId: number) => Promise<DerpStatus>;
  DismissDERPSuggestion?: (regionId: number) => Promise<void>;
  ExportRelayShare?: () => Promise<string>;
  ImportRelayShare?: () => Promise<string>;
  SendRelayShare?: (address: string) => Promise<void>;
};

function goApp(): DerpApp | null {
  const host = window as unknown as { go?: { main?: { App?: DerpApp } } };
  return host.go?.main?.App ?? null;
}

let preview: DerpStatus = {
  country: "",
  mode: "official",
  candidates: [],
  officialMs: 0,
  scannedAt: "",
  scanning: false,
  hasKey: false,
  engines: [],
  keys: [],
  auto: true,
  error: "",
};

function normalize(st: DerpStatus): DerpStatus {
  return {
    ...st,
    candidates: st.candidates ?? [],
    engines: st.engines ?? [],
    keys: st.keys ?? [],
  };
}

export async function derpStatus(): Promise<DerpStatus> {
  const app = goApp();
  return normalize(app?.DERPStatus ? await app.DERPStatus() : preview);
}

export async function setDerpAuto(auto: boolean): Promise<DerpStatus> {
  const app = goApp();
  if (app?.SetDERPAuto) {
    return normalize(await app.SetDERPAuto(auto));
  }
  preview = { ...preview, auto };
  return preview;
}

export async function addDerpKey(engine: string, key: string): Promise<DerpStatus> {
  const app = goApp();
  if (app?.AddDERPKey) {
    return normalize(await app.AddDERPKey(engine, key));
  }
  const keys = [
    ...preview.keys,
    { engine, index: preview.keys.filter((k) => k.engine === engine).length, hint: "••••" + key.slice(-4) },
  ];
  const engines = DERP_ENGINES.map((e) => e.id).filter((id) => keys.some((k) => k.engine === id));
  preview = { ...preview, keys, engines, hasKey: keys.length > 0 };
  return preview;
}

export async function removeDerpKey(engine: string, index: number): Promise<DerpStatus> {
  const app = goApp();
  if (app?.RemoveDERPKey) {
    return normalize(await app.RemoveDERPKey(engine, index));
  }
  const keys = preview.keys.filter((k) => !(k.engine === engine && k.index === index));
  const engines = DERP_ENGINES.map((e) => e.id).filter((id) => keys.some((k) => k.engine === id));
  preview = { ...preview, keys, engines, hasKey: keys.length > 0 };
  return preview;
}

export async function refreshDerpQuotas(): Promise<DerpStatus> {
  const app = goApp();
  if (app?.RefreshDERPQuotas) {
    return normalize(await app.RefreshDERPQuotas());
  }
  return preview;
}

export async function scanDerp(): Promise<DerpStatus> {
  const app = goApp();
  if (app?.ScanDERP) {
    return normalize(await app.ScanDERP());
  }
  return preview;
}

export async function switchDerpRegion(regionId: number): Promise<DerpStatus> {
  const app = goApp();
  if (app?.UseDERPRegion) {
    return normalize(await app.UseDERPRegion(regionId));
  }
  const active = preview.candidates.find((c) => c.regionId === regionId);
  preview = { ...preview, mode: active ? "scan" : "official", active };
  return preview;
}

export async function exportRelayShare(): Promise<string> {
  const app = goApp();
  if (!app?.ExportRelayShare) {
    throw new Error("save dialog requires a running window");
  }
  return app.ExportRelayShare();
}

export async function importRelayShare(): Promise<DerpStatus | null> {
  const app = goApp();
  if (!app?.ImportRelayShare) {
    throw new Error("file picker requires a running window");
  }
  const path = await app.ImportRelayShare();
  if (!path) {
    return null;
  }
  return derpStatus();
}

export async function sendRelayShare(address: string): Promise<void> {
  const app = goApp();
  if (!app?.SendRelayShare) {
    throw new Error("save dialog requires a running window");
  }
  await app.SendRelayShare(address);
}

export async function dismissDerpSuggestion(regionId: number): Promise<void> {
  const app = goApp();
  if (app?.DismissDERPSuggestion) {
    await app.DismissDERPSuggestion(regionId);
  }
}

export function parseDerpEvent(ev: TailcatEvent): DerpEvent | null {
  if (ev.Kind !== "derp" || !ev.Data) {
    return null;
  }
  try {
    const parsed = JSON.parse(ev.Data) as DerpEvent;
    if ((parsed.type === "status" || parsed.type === "shared") && parsed.status) {
      return { type: parsed.type, status: normalize(parsed.status) };
    }
    if (parsed.type === "suggest" && parsed.candidate) {
      return parsed;
    }
    if (parsed.type === "switched") {
      return parsed;
    }
  } catch {
    // ignore malformed payloads
  }
  return null;
}

export function relayLabel(c: DerpCandidate): string {
  return c.name || c.host || `#${c.regionId}`;
}
