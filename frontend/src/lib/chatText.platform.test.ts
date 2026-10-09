import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../i18n/en";
import { localizeChatError } from "./chatText";
import { cameraDeniedError, micDeniedError } from "./liveCall";

const t = (key: keyof typeof en) => en[key];

describe("media permission hints per OS", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("points Windows users at the desktop-app privacy switches", () => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/154.0" });
    expect(localizeChatError(micDeniedError, t)).toBe(en.chatMicDeniedWin);
    expect(localizeChatError(cameraDeniedError, t)).toBe(en.chatCamDeniedWin);
    expect(en.chatMicDeniedWin).toContain("Let desktop apps access your microphone");
    expect(en.chatCamDeniedWin).toContain("Microsoft Edge WebView2");
  });

  it("keeps the macOS System Settings hint elsewhere", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15" });
    expect(localizeChatError(micDeniedError, t)).toBe(en.chatMicDenied);
    expect(localizeChatError(cameraDeniedError, t)).toBe(en.chatCamDenied);
  });
});
