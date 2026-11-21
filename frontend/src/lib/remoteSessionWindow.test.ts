import { afterEach, describe, expect, it, vi } from "vitest";
import { openRemoteSessionWindow } from "./remoteSessionWindow";

function stream(): MediaStream {
  const track = { kind: "video", getSettings: () => ({ width: 1280, height: 720 }) };
  return { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
}

function fakePopup() {
  const doc = document.implementation.createHTMLDocument("");
  const popup = {
    document: doc,
    closed: false,
    close: vi.fn(() => {
      popup.closed = true;
    }),
    focus: vi.fn(),
    addEventListener: vi.fn(),
    stop: vi.fn(),
  };
  return popup;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("remote session window", () => {
  it("opens a separate window with fullscreen and end", () => {
    const popup = fakePopup();
    const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const onEnd = vi.fn();
    const handle = openRemoteSessionWindow({
      title: "远程连接",
      peer: "tc:desk",
      stream: stream(),
      fullscreenLabel: "全屏",
      exitFullscreenLabel: "退出全屏",
      endLabel: "结束",
      onInput: vi.fn(),
      onEnd,
      onClosed: vi.fn(),
    });
    expect(handle).not.toBeNull();
    expect(open.mock.calls[0]?.[0]).toBe("about:blank");
    expect(open.mock.calls[0]?.[1]).toBe("tailcat-remote-session");
    expect(popup.document.title).toBe("远程连接");
    expect(popup.document.body.querySelector("video")).toBeTruthy();
    expect(popup.document.body.textContent).toContain("tc:desk");
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    popup.document.documentElement.requestFullscreen = requestFullscreen;
    popup.document.body.querySelector<HTMLButtonElement>(".full")?.click();
    expect(requestFullscreen).toHaveBeenCalledOnce();
    popup.document.body.querySelector<HTMLButtonElement>(".end")?.click();
    expect(onEnd).toHaveBeenCalledOnce();
    expect(popup.close).toHaveBeenCalled();
  });

  it("returns null when the popup is blocked", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    expect(
      openRemoteSessionWindow({
        title: "远程连接",
        peer: "",
        stream: stream(),
        fullscreenLabel: "全屏",
        exitFullscreenLabel: "退出全屏",
        endLabel: "结束",
        onInput: vi.fn(),
        onEnd: vi.fn(),
        onClosed: vi.fn(),
      }),
    ).toBeNull();
  });
});
