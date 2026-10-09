import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { LocaleProvider } from "./i18n";
import * as wails from "./lib/wails";

class FakePC {
  static instances: FakePC[] = [];
  iceGatheringState: RTCIceGatheringState = "complete";
  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  localDescription: { type: string; sdp: string } | null = null;
  private listeners = new Map<string, Set<(event?: unknown) => void>>();

  constructor() {
    FakePC.instances.push(this);
  }

  addEventListener(type: string, fn: (event?: unknown) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(fn);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, fn: (event?: unknown) => void): void {
    this.listeners.get(type)?.delete(fn);
  }

  close(): void {
    this.connectionState = "closed";
  }

  addTrack(): void {}

  async createOffer(): Promise<{ type: string; sdp: string }> {
    return { type: "offer", sdp: "v=0" };
  }

  async createAnswer(): Promise<{ type: string; sdp: string }> {
    return { type: "answer", sdp: "v=0" };
  }

  async setLocalDescription(desc: { type: string; sdp: string }): Promise<void> {
    this.localDescription = desc;
  }

  async setRemoteDescription(): Promise<void> {}

  emitRemoteVideo(): void {
    const track = {
      kind: "video",
      stop: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const remote = {
      getTracks: () => [track],
      getAudioTracks: () => [],
      getVideoTracks: () => [track],
    };
    this.listeners.get("track")?.forEach((fn) => fn({ streams: [remote], track }));
  }
}

function mediaStream(kinds: Array<"audio" | "video">): MediaStream {
  const tracks = kinds.map((kind) => ({
    kind,
    enabled: true,
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((track) => track.kind === "audio"),
    getVideoTracks: () => tracks.filter((track) => track.kind === "video"),
  } as unknown as MediaStream;
}

const sent: string[] = [];
const realSrcObject = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "srcObject");

async function renderChat() {
  render(
    <LocaleProvider>
      <App />
    </LocaleProvider>,
  );
  fireEvent.click(document.querySelector(".nav-chat > .nav-btn") as HTMLElement);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Create temporary room" }));
  await user.click(await screen.findByRole("button", { name: "Show room details" }));
  await user.type(screen.getByLabelText("Peer"), "tc:fake-echo");
  await user.click(screen.getByRole("button", { name: "Connect" }));
  expect(await screen.findByRole("button", { name: "Voice" })).toBeTruthy();
  return user;
}

async function roomID(): Promise<string> {
  const chats = (await wails.listSessions()).filter((item) => item.Kind === "chat");
  return chats[0]?.ID ?? "";
}

beforeEach(() => {
  wails.resetBrowserRooms();
  localStorage.setItem("tailcat-locale", "en");
  sent.length = 0;
  FakePC.instances = [];
  vi.spyOn(wails, "sendChatSignal").mockImplementation(async (_room, meta) => {
    sent.push(meta);
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => mediaStream(["audio", "video"])),
      getDisplayMedia: vi.fn(async () => mediaStream(["video", "audio"])),
    },
  });
  vi.stubGlobal("RTCPeerConnection", FakePC);
  // jsdom rejects fake streams; keep whatever is assigned so tests can see where audio plays.
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    get(this: { fakeSrc?: unknown }) {
      return this.fakeSrc ?? null;
    },
    set(this: { fakeSrc?: unknown }, value: unknown) {
      this.fakeSrc = value;
    },
  });
});

afterEach(() => {
  cleanup();
  if (realSrcObject) {
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", realSrcObject);
  } else {
    delete (HTMLMediaElement.prototype as { srcObject?: unknown }).srcObject;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  wails.resetBrowserRooms();
});

describe("calls survive page navigation", () => {
  it("keeps a voice call up across tunnel and settings until the user hangs up", async () => {
    const user = await renderChat();
    await user.click(screen.getByRole("button", { name: "Voice" }));
    const status = await screen.findByRole("region", { name: "Call" });
    expect(status.closest(".call-panel")).toBeTruthy();
    expect(document.querySelector(".call-float")).toBeNull();
    expect(screen.queryByRole("button", { name: "Hang up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Expand" })).toBeNull();
    await waitFor(() => expect(sent.some((meta) => meta.includes("rtc-offer"))).toBe(true));
    FakePC.instances.at(-1)?.emitRemoteVideo();
    const audio = document.querySelector(".shell-call-audio") as HTMLAudioElement & { srcObject: unknown };
    await waitFor(() => expect(audio.srcObject).toBeTruthy());

    await user.click(screen.getByRole("button", { name: "Tunnel" }));
    expect(screen.getByRole("heading", { name: "Tunnel" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Call" })).toBeNull();
    expect(audio.srcObject).toBeTruthy();
    expect(sent.some((meta) => meta.includes("rtc-hangup"))).toBe(false);

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(audio.srcObject).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Chat" }));
    expect(await screen.findByRole("region", { name: "Call" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "End call" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Call" })).toBeNull());
    expect(audio.srcObject).toBeFalsy();
    expect(sent.some((meta) => meta.includes("rtc-hangup"))).toBe(true);
  });

  it("still ends the call when the peer hangs up off the chat page", async () => {
    const user = await renderChat();
    await user.click(screen.getByRole("button", { name: "Voice" }));
    expect(await screen.findByRole("region", { name: "Call" })).toBeTruthy();
    const id = await roomID();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    wails.emitBrowserEvent({
      Kind: "signal",
      SessionID: id,
      Data: JSON.stringify({ v: 1, type: "rtc-hangup" }),
    });
    await user.click(screen.getByRole("button", { name: "Chat" }));
    expect(await screen.findByText("Start a voice call, video call, or screen share.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Call" })).toBeNull();
    expect(sent.some((meta) => meta.includes("rtc-hangup"))).toBe(false);
  });

  it("keeps an unanswered call ringing off the chat page and decline still hangs up", async () => {
    const user = await renderChat();
    const id = await roomID();
    wails.emitBrowserEvent({
      Kind: "signal",
      SessionID: id,
      Data: JSON.stringify({
        v: 1,
        type: "rtc-offer",
        mode: "video",
        description: { type: "offer", sdp: "v=0" },
      }),
    });
    expect(await screen.findByRole("button", { name: "Answer" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Call" }).closest(".call-panel")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tunnel" }));
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
    expect(sent.some((meta) => meta.includes("rtc-hangup"))).toBe(false);
    await user.click(screen.getByRole("button", { name: "Chat" }));
    await user.click(await screen.findByRole("button", { name: "Decline" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Call" })).toBeNull());
    expect(sent.some((meta) => meta.includes("rtc-hangup"))).toBe(true);
  });

  it("opens the shared screen in a separate OS window and closes it on hang up", async () => {
    const doc = document.implementation.createHTMLDocument("");
    const popup = { document: doc, closed: false, close: vi.fn(() => (popup.closed = true)) };
    const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const user = await renderChat();
    await user.click(screen.getByRole("button", { name: "Screen share" }));
    await screen.findByRole("button", { name: "End call" });
    FakePC.instances.at(-1)?.emitRemoteVideo();
    await user.click(await screen.findByRole("button", { name: "Expand" }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(doc.title).toBe("Tailcat Box · Shared screen");
    expect(doc.querySelector("video")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Shared screen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Expand" })).toBeNull();

    // User closes the OS window: the icon comes back.
    popup.closed = true;
    await user.click(await screen.findByRole("button", { name: "Expand" }));
    expect(open).toHaveBeenCalledTimes(2);
    popup.closed = false;
    popup.close.mockClear();

    // Off the chat page the window stays; hang up closes it.
    await user.click(screen.getByRole("button", { name: "Tunnel" }));
    expect(popup.close).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Chat" }));
    await user.click(await screen.findByRole("button", { name: "End call" }));
    await waitFor(() => expect(popup.close).toHaveBeenCalled());
  });

  it("shows the shared screen inline, expands it from the corner icon, and keeps it across tunnel until hang up", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const user = await renderChat();
    await user.click(screen.getByRole("button", { name: "Screen share" }));
    expect(await screen.findByRole("button", { name: "End call" })).toBeTruthy();
    const status = screen.getByRole("region", { name: "Call" });
    expect(status.className).toBe("call-status");
    expect(status.closest(".media-frame")?.querySelector("video")).toBeTruthy();
    expect(status.textContent).toContain("Screen share");
    expect(screen.getByRole("button", { name: "Mute" }).className).toContain("call-status-mute");
    FakePC.instances.at(-1)?.emitRemoteVideo();
    const expand = await screen.findByRole("button", { name: "Expand" });
    expect(expand.closest(".media-frame")?.querySelector(".call-status")).toBeTruthy();
    expect(screen.getAllByRole("region", { name: "Call" })).toHaveLength(1);
    expect(expand.closest(".media-frame")?.querySelector("video")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Shared screen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pop out" })).toBeNull();
    await user.click(expand);
    expect(await screen.findByRole("region", { name: "Shared screen" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Expand" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Enlarge" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hang up" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Shared screen" })).toBeNull());
    await user.click(await screen.findByRole("button", { name: "Expand" }));
    expect(await screen.findByRole("region", { name: "Shared screen" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Tunnel" }));
    expect(screen.getByRole("heading", { name: "Tunnel" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Shared screen" })).toBeTruthy();
    expect(sent.some((meta) => meta.includes("rtc-hangup"))).toBe(false);

    await user.click(screen.getByRole("button", { name: "Chat" }));
    await user.click(await screen.findByRole("button", { name: "End call" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Shared screen" })).toBeNull());
    expect(screen.getByText("Start a voice call, video call, or screen share.")).toBeTruthy();
    expect(sent.some((meta) => meta.includes("rtc-hangup"))).toBe(true);
  });
});
