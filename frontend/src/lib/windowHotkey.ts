export const DEFAULT_WAKE = "Ctrl+Alt+Shift+W";
export const DEFAULT_CLOSE = "Ctrl+Alt+Shift+W";

export type WindowHotkeyPair = { wake: string; close: string };

const MENU = new Set([
  "Ctrl+A",
  "Ctrl+C",
  "Ctrl+V",
  "Ctrl+X",
  "Ctrl+Z",
  "Ctrl+Shift+Z",
  "Ctrl+Y",
  "Ctrl+Q",
  "Ctrl+W",
  "Ctrl+H",
  "Ctrl+M",
  "Ctrl+F",
  "Ctrl+Shift+Esc",
  "Ctrl+Alt+Delete",
  "Alt+F4",
  "Alt+Tab",
  "Ctrl+Esc",
]);

type HotkeyApp = {
  GetWindowHotkeys?: () => Promise<{ Wake?: string; Close?: string }>;
  SetWindowHotkeys?: (wake: string, close: string) => Promise<void>;
  HoldWindowHotkeys?: (hold: boolean) => Promise<void>;
};

function goApp(): HotkeyApp | null {
  const host = window as unknown as { go?: { main?: { App?: HotkeyApp } } };
  return host.go?.main?.App ?? null;
}

export function formatHotkey(chord: string): string {
  return chord.split("+").join(" + ");
}

export function chordFromEvent(event: KeyboardEvent): string | null {
  if (event.metaKey || event.key === "Meta") {
    return null;
  }
  if (isModifier(event.key)) {
    return null;
  }
  const key = normalizeKey(event.key);
  if (!key) {
    return null;
  }
  const parts: string[] = [];
  if (event.ctrlKey) {
    parts.push("Ctrl");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  parts.push(key);
  return parts.join("+");
}

export function isModifier(key: string): boolean {
  return key === "Control" || key === "Alt" || key === "Shift" || key === "Meta";
}

/** Empty when the chord is allowed. Otherwise a stable error code. */
export function hotkeyProblem(chord: string, other: string): string {
  const parts = chord.split("+");
  const key = parts[parts.length - 1] ?? "";
  const mods = parts.slice(0, -1);
  if (!key || mods.length < 2 || chord.includes("Meta") || chord.includes("Win")) {
    return "hotkey-conflict";
  }
  if (MENU.has(chord)) {
    return "hotkey-conflict";
  }
  void other;
  return "";
}

export function hotkeyMessageKey(code: string): "windowHotkeyInvalid" | "windowHotkeyConflict" | "windowHotkeySame" | "windowHotkeyTaken" {
  switch (code) {
    case "hotkey-conflict":
      return "windowHotkeyConflict";
    case "hotkey-same":
      return "windowHotkeySame";
    case "hotkey-taken":
      return "windowHotkeyTaken";
    default:
      return "windowHotkeyInvalid";
  }
}

export async function loadWindowHotkeys(): Promise<WindowHotkeyPair> {
  const app = goApp();
  if (!app?.GetWindowHotkeys) {
    return { wake: DEFAULT_WAKE, close: DEFAULT_CLOSE };
  }
  try {
    const got = await app.GetWindowHotkeys();
    return {
      wake: got.Wake || DEFAULT_WAKE,
      close: got.Close || DEFAULT_CLOSE,
    };
  } catch {
    return { wake: DEFAULT_WAKE, close: DEFAULT_CLOSE };
  }
}

export async function saveWindowHotkeys(pair: WindowHotkeyPair): Promise<void> {
  const app = goApp();
  if (!app?.SetWindowHotkeys) {
    return;
  }
  await app.SetWindowHotkeys(pair.wake, pair.close);
}

export async function holdWindowHotkeys(hold: boolean): Promise<void> {
  const app = goApp();
  if (!app?.HoldWindowHotkeys) {
    return;
  }
  await app.HoldWindowHotkeys(hold);
}

function normalizeKey(key: string): string | null {
  if (key === " ") {
    return "Space";
  }
  if (key === "Escape") {
    return "Esc";
  }
  if (key === "Tab" || key === "Delete") {
    return key;
  }
  if (/^F([1-9]|1[0-2])$/.test(key)) {
    return key;
  }
  if (key.length === 1 && /[a-z0-9]/i.test(key)) {
    return key.toUpperCase();
  }
  return null;
}
