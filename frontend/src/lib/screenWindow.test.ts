import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openScreenWindow, screenWindowSize } from "./screenWindow";

function stream(settings: { width?: number; height?: number } = {}): MediaStream {
  const track = { kind: "video", getSettings: () => settings };
  return { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
}

function fakePopup() {
  const doc = document.implementation.createHTMLDocument("");
  const popup = { document: doc, closed: false, close: vi.fn(() => (popup.closed = true)) };
  return popup;
}

const realSrcObject = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "srcObject");

beforeEach(() => {
  // jsdom rejects fake streams; keep whatever is assigned.
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    get(this: { fakeSrc?: unknown }) {
      return this.fakeSrc ?? null;
    },
    set(this: { fakeSrc?: unknown }, value: unknown) {
      this.fakeSrc = value;
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (realSrcObject) {
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", realSrcObject);
  } else {
    delete (HTMLMediaElement.prototype as { srcObject?: unknown }).srcObject;
  }
});

describe("screenWindowSize", () => {
  it("uses the native size when it fits", () => {
    expect(screenWindowSize(stream({ width: 1280, height: 800 }), { width: 1920, height: 1040 })).toEqual({
      width: 1280,
      height: 800,
    });
  });

  it("clamps to the screen and keeps the aspect ratio", () => {
    expect(screenWindowSize(stream({ width: 2560, height: 1600 }), { width: 1350, height: 720 })).toEqual({
      width: 1152,
      height: 720,
    });
  });

  it("falls back to 1280x720 without track settings", () => {
    expect(screenWindowSize(stream(), { width: 1920, height: 1040 })).toEqual({ width: 1280, height: 720 });
  });
});

describe("openScreenWindow", () => {
  it("opens a titled popup with a muted video bound to the stream", () => {
    const popup = fakePopup();
    const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const media = stream({ width: 800, height: 600 });
    const handle = openScreenWindow(media, { title: "Tailcat Box · Shared screen", onClosed: vi.fn() });
    expect(handle).not.toBeNull();
    expect(open).toHaveBeenCalledTimes(1);
    const [url, name, features] = open.mock.calls[0];
    expect(url).toBe("");
    expect(name).toBe("tailcat-screen-share");
    expect(features).toContain("width=800");
    expect(features).toContain("height=600");
    expect(popup.document.title).toBe("Tailcat Box · Shared screen");
    const video = popup.document.querySelector("video") as HTMLVideoElement & { srcObject: unknown };
    expect(video).toBeTruthy();
    expect(video.muted).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(video.srcObject).toBe(media);
    handle?.close();
    expect(popup.close).toHaveBeenCalled();
  });

  it("returns null when window.open is refused or throws", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    expect(openScreenWindow(stream(), { title: "x", onClosed: vi.fn() })).toBeNull();
    vi.spyOn(window, "open").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(openScreenWindow(stream(), { title: "x", onClosed: vi.fn() })).toBeNull();
  });

  it("reports when the user closes the popup and stops polling", () => {
    vi.useFakeTimers();
    const popup = fakePopup();
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const onClosed = vi.fn();
    expect(openScreenWindow(stream(), { title: "x", onClosed, pollMs: 100 })).not.toBeNull();
    vi.advanceTimersByTime(300);
    expect(onClosed).not.toHaveBeenCalled();
    popup.closed = true;
    vi.advanceTimersByTime(100);
    expect(onClosed).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("closes the popup when the main page goes away", () => {
    const popup = fakePopup();
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    expect(openScreenWindow(stream(), { title: "x", onClosed: vi.fn() })).not.toBeNull();
    expect(popup.close).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("pagehide"));
    expect(popup.close).toHaveBeenCalled();
  });
});
