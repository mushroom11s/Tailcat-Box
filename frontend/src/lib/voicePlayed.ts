export const VOICE_PLAYED_KEY = "tailcat-voice-played";

const MAX_PLAYED = 400;

export function readPlayedVoices(): string[] {
  try {
    const raw = localStorage.getItem(VOICE_PLAYED_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item !== "string") {
        continue;
      }
      const id = item.trim();
      if (!id || out.includes(id)) {
        continue;
      }
      out.push(id);
    }
    return out.slice(-MAX_PLAYED);
  } catch {
    return [];
  }
}

export function rememberPlayedVoice(id: string): string[] {
  const key = id.trim();
  const current = readPlayedVoices();
  if (!key || current.includes(key)) {
    return current;
  }
  const next = [...current, key].slice(-MAX_PLAYED);
  try {
    localStorage.setItem(VOICE_PLAYED_KEY, JSON.stringify(next));
  } catch {
    // A full quota or private mode should not block playback.
  }
  return next;
}
