export const CONFIG_LOCAL_KEYS = [
  "tailcat-locale",
  "tailcat-theme",
  "tailcat-nickname",
  "tailcat-peer-remarks",
  "tailcat-port-mappings",
  "tailcat-remote-trust",
  "tailcat-remote-recent",
  "tailcat-remote-visitors",
  "tailcat-remote-controlled",
  "tailcat-remote-mine",
  "tailcat-remote-history",
  "tailcat-room-pins",
  "tailcat-desktop-notify",
  "tailcat-miao-chunk-streams",
  "tailcat-onboarding-seen",
] as const;

type ConfigApp = {
  ExportConfig?: (localJSON: string, sectionsJSON: string) => Promise<string>;
  ImportConfig?: () => Promise<string>;
  ImportConfigFile?: (path: string) => Promise<string>;
};

export const EXPORT_SECTIONS = ["network", "startup", "ssh", "remote", "profile", "tunnel", "appearance"] as const;

export type ExportSection = (typeof EXPORT_SECTIONS)[number];

function goApp(): ConfigApp | null {
  const host = window as unknown as { go?: { main?: { App?: ConfigApp } } };
  return host.go?.main?.App ?? null;
}

export function readLocalConfig(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of CONFIG_LOCAL_KEYS) {
    const value = localStorage.getItem(key);
    if (value) {
      out[key] = value;
    }
  }
  return out;
}

export function writeLocalConfig(local: Record<string, string>): void {
  const allowed = new Set<string>(CONFIG_LOCAL_KEYS);
  for (const [key, value] of Object.entries(local)) {
    if (allowed.has(key) && typeof value === "string" && value) {
      localStorage.setItem(key, value);
    }
  }
}

export async function exportConfig(sections: readonly string[] = EXPORT_SECTIONS): Promise<string> {
  const app = goApp();
  if (!app?.ExportConfig) {
    throw new Error("save dialog requires a running window");
  }
  return app.ExportConfig(JSON.stringify(readLocalConfig()), JSON.stringify(sections));
}

export async function importConfigFile(path: string): Promise<Record<string, string> | null> {
  const app = goApp();
  if (!app?.ImportConfigFile) {
    throw new Error("file picker requires a running window");
  }
  const raw = await app.ImportConfigFile(path);
  if (!raw) {
    return null;
  }
  return applyImportedLocal(raw);
}

export async function importConfig(): Promise<Record<string, string> | null> {
  const app = goApp();
  if (!app?.ImportConfig) {
    throw new Error("file picker requires a running window");
  }
  const raw = await app.ImportConfig();
  if (!raw) {
    return null;
  }
  return applyImportedLocal(raw);
}

function applyImportedLocal(raw: string): Record<string, string> {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("This is not a Tailcat Box config file.");
  }
  const local: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") {
      local[key] = value;
    }
  }
  writeLocalConfig(local);
  return local;
}

export function reloadWindow(): void {
  window.location.reload();
}
