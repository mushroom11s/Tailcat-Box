import { afterEach, describe, expect, it, vi } from "vitest";
import {
  callUnsupportedError,
  cameraDeniedError,
  createLiveCall,
  iceServers,
  liveMediaError,
  mediaNotFoundError,
  micDeniedError,
  screenDeniedError,
  screenUnavailableError,
  type CallRecord,
  type LiveCall,
  type SignalMeta,
} from "./liveCall";

type FakeTrack = {
  kind: "audio" | "video";
  stop: ReturnType<typeof vi.fn>;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
  end: () => void;
};

function fakeStream(kinds: Array<"audio" | "video">) {
  const tracks: FakeTrack[] = kinds.map((kind) => {
    const ended = new Set<() => void>();
    return {
      kind,
      stop: vi.fn(),
      addEventListener(type: string, fn: () => void) {
        if (type === "ended") {
          ended.add(fn);
        }
      },
      removeEventListener(type: string, fn: () => void) {
        if (type === "ended") {
          ended.delete(fn);
        }
      },
      end() {
        ended.forEach((fn) => fn());
      },
    };
  });
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((track) => track.kind === "audio"),
    getVideoTracks: () => tracks.filter((track) => track.kind === "video"),
  };
}

class FakePC {
  static instances: FakePC[] = [];
  static holdNext = false;
  iceGatheringState: RTCIceGatheringState = "new";
  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  config: RTCConfiguration;
  closed = false;
  holdGathering = false;
  tracks: unknown[] = [];
  private listeners = new Map<string, Set<(event?: unknown) => void>>();

  constructor(config?: RTCConfiguration) {
    this.config = config ?? {};
    this.holdGathering = FakePC.holdNext;
    FakePC.holdNext = false;
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

  emit(type: string, event?: unknown): void {
    this.listeners.get(type)?.forEach((fn) => fn(event));
  }

  close(): void {
    this.closed = true;
    this.connectionState = "closed";
    this.emit("connectionstatechange");
  }

  addTrack(track: unknown): void {
    this.tracks.push(track);
  }

  async createOffer(): Promise<{ type: string; sdp: string }> {
    return { type: "offer", sdp: "v=0" };
  }

  async createAnswer(): Promise<{ type: string; sdp: string }> {
    return { type: "answer", sdp: "v=0" };
  }

  async setLocalDescription(desc: { type: string; sdp: string }): Promise<void> {
    this.localDescription = { type: desc.type, sdp: desc.sdp };
    if (this.holdGathering) {
      this.iceGatheringState = "gathering";
      this.emit("icegatheringstatechange");
      return;
    }
    this.iceGatheringState = "complete";
    this.localDescription = { type: desc.type, sdp: `${desc.sdp}\r\na=candidate:1 1 udp 1 1.2.3.4 9 typ host` };
    this.emit("icegatheringstatechange");
  }

  async setRemoteDescription(desc: { type: string; sdp: string }): Promise<void> {
    this.remoteDescription = desc;
  }

  fail(): void {
    this.connectionState = "failed";
    this.emit("connectionstatechange");
  }
}

const PeerConnection = FakePC as unknown as new (config?: RTCConfiguration) => RTCPeerConnection;

function offer(mode: "voice" | "video" | "screen"): string {
  return JSON.stringify({ v: 1, type: "rtc-offer", mode, description: { type: "offer", sdp: "v=remote" } });
}

afterEach(() => {
  FakePC.instances = [];
  FakePC.holdNext = false;
  vi.useRealTimers();
});

function setup(extra?: {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  getDisplayMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  gatherTimeoutMs?: number;
}) {
  const sent: SignalMeta[] = [];
  const voice = fakeStream(["audio"]);
  const video = fakeStream(["audio", "video"]);
  const screen = fakeStream(["video", "audio"]);
  const getUserMedia = extra?.getUserMedia ?? vi.fn(async (constraints: MediaStreamConstraints) => (constraints.video ? video : voice) as unknown as MediaStream);
  const getDisplayMedia = extra && "getDisplayMedia" in extra ? extra.getDisplayMedia : vi.fn(async () => screen as unknown as MediaStream);
  const call = createLiveCall({
    send: async (meta) => {
      sent.push(meta);
    },
    devices: () => ({ getUserMedia, getDisplayMedia }),
    PeerConnection: () => PeerConnection,
    gatherTimeoutMs: extra?.gatherTimeoutMs,
  });
  return { call, sent, getUserMedia, getDisplayMedia, voice, video, screen };
}

describe("live WebRTC signaling", () => {
  it("sends one voice offer after ICE gathering completes, with only the Google STUN server", async () => {
    const { call, sent } = setup();
    await call.start("voice");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ v: 1, type: "rtc-offer", mode: "voice" });
    expect(sent[0].description?.sdp).toContain("a=candidate:");
    expect(FakePC.instances[0]?.config.iceServers).toEqual(iceServers);
    expect(call.snapshot()).toMatchObject({ phase: "live", role: "caller", mode: "voice" });
  });

  it("sends the offer after 5 seconds when gathering never completes", async () => {
    vi.useFakeTimers();
    FakePC.holdNext = true;
    const { call, sent } = setup();
    const pending = call.start("voice");
    await vi.advanceTimersByTimeAsync(4999);
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(sent).toHaveLength(1);
    expect(sent[0].description?.sdp).toBe("v=0");
  });

  it("captures audio and video for a video call and display media for screen share", async () => {
    const { call, sent, getUserMedia, getDisplayMedia, screen } = setup();
    await call.start("video");
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
    await call.start("screen");
    expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: true });
    expect(sent.map((meta) => meta.mode)).toEqual(["video", "screen"]);
    expect(sent.some((meta) => meta.type === "rtc-hangup")).toBe(false);
    expect(FakePC.instances[0]?.closed).toBe(true);
    screen.getVideoTracks()[0]?.end();
    await vi.waitFor(() => expect(sent.at(-1)?.type).toBe("rtc-hangup"));
    expect(call.snapshot().phase).toBe("idle");
    expect(call.snapshot().error).toBe("");
  });

  it("ignores an inbound offer while building an outgoing offer", async () => {
    let release: (stream: MediaStream) => void = () => undefined;
    const pendingMedia = new Promise<MediaStream>((resolve) => {
      release = resolve;
    });
    const getUserMedia = vi.fn(() => pendingMedia);
    const { call, sent } = setup({ getUserMedia });
    const starting = call.start("voice");
    await Promise.resolve();
    await call.receive(offer("video"));
    expect(sent).toEqual([]);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    release(fakeStream(["audio"]) as unknown as MediaStream);
    await starting;
    expect(sent.map((meta) => meta.type)).toEqual(["rtc-offer"]);
    expect(sent[0]?.mode).toBe("voice");
  });

  it("does not send hangup when the caller cancels before the offer is sent", async () => {
    let release: (stream: MediaStream) => void = () => undefined;
    const pendingMedia = new Promise<MediaStream>((resolve) => {
      release = resolve;
    });
    const { call, sent } = setup({ getUserMedia: () => pendingMedia });
    const starting = call.start("voice");
    await Promise.resolve();
    await call.hangup();
    release(fakeStream(["audio"]) as unknown as MediaStream);
    await starting;
    expect(sent).toEqual([]);
    expect(call.snapshot().phase).toBe("idle");
  });

  it("sends rtc-hangup for an established link and answers a screen offer without local capture", async () => {
    const { call, sent, getUserMedia, getDisplayMedia } = setup();
    await call.start("voice");
    await call.hangup();
    expect(sent.at(-1)).toMatchObject({ type: "rtc-hangup" });
    await call.receive(offer("screen"));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getDisplayMedia).not.toHaveBeenCalled();
    expect(sent.at(-1)).toMatchObject({ type: "rtc-answer", description: { type: "answer", sdp: expect.stringContaining("a=candidate:") } });
    expect(sent.at(-1)?.mode).toBeUndefined();
    expect(call.snapshot()).toMatchObject({ phase: "live", role: "answerer", mode: "screen" });
  });

  it("captures only audio when answering a voice offer", async () => {
    const { call, sent, getUserMedia } = setup();
    await call.receive(offer("voice"));
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
    expect(call.snapshot()).toMatchObject({ phase: "ringing", mode: "voice", role: "answerer" });
    await call.accept();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(sent.map((meta) => meta.type)).toEqual(["rtc-answer"]);
    expect(call.snapshot()).toMatchObject({ phase: "live", role: "answerer", linked: true });
  });

  it("declines a video offer with hangup and does not capture", async () => {
    const { call, sent, getUserMedia } = setup();
    await call.receive(offer("video"));
    expect(call.snapshot()).toMatchObject({ phase: "ringing", mode: "video" });
    await call.decline();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(sent).toEqual([{ v: 1, type: "rtc-hangup", reason: "decline" }]);
    expect(call.snapshot().phase).toBe("idle");
  });

  it("ends a failed link with the relay error and leaves another call possible", async () => {
    const { call, sent } = setup();
    await call.start("voice");
    FakePC.instances.at(-1)?.fail();
    await vi.waitFor(() => expect(sent.at(-1)?.type).toBe("rtc-hangup"));
    expect(call.snapshot().error).toBe(liveMediaError);
    expect(call.snapshot().phase).toBe("idle");
    await call.start("video");
    expect(call.snapshot()).toMatchObject({ phase: "live", mode: "video", error: "" });
  });

  it("reports permission denials and a missing screen API without placing a call", async () => {
    const denied = setup({
      getUserMedia: async () => {
        throw new DOMException("denied", "NotAllowedError");
      },
    });
    await denied.call.start("voice");
    expect(denied.call.snapshot().error).toBe(micDeniedError);
    await denied.call.start("video");
    expect(denied.call.snapshot().error).toBe(cameraDeniedError);
    const micOnVideo = setup({
      getUserMedia: async () => {
        throw new Error("Permission denied for microphone");
      },
    });
    await micOnVideo.call.start("video");
    expect(micOnVideo.call.snapshot().error).toBe(micDeniedError);
    const unavailable = setup({ getDisplayMedia: undefined });
    await unavailable.call.start("screen");
    expect(unavailable.call.snapshot().error).toBe(screenUnavailableError);
    const blocked = setup({
      getDisplayMedia: async () => {
        throw new Error("denied");
      },
    });
    await blocked.call.start("screen");
    expect(blocked.call.snapshot().error).toBe(screenDeniedError);
    expect(denied.sent).toEqual([]);
    expect(unavailable.sent).toEqual([]);
    expect(blocked.sent).toEqual([]);
  });

  it("clears the dock on a remote hangup without sending another hangup", async () => {
    const { call, sent } = setup();
    await call.start("voice");
    await call.receive(JSON.stringify({ v: 1, type: "rtc-hangup" }));
    expect(call.snapshot().phase).toBe("idle");
    expect(sent.map((meta) => meta.type)).toEqual(["rtc-offer"]);
  });

  it("reports missing WebRTC before capturing media, like WebKitGTK on Linux", async () => {
    const getUserMedia = vi.fn();
    const sent: SignalMeta[] = [];
    const call = createLiveCall({
      send: async (meta) => {
        sent.push(meta);
      },
      devices: () => ({ getUserMedia }),
      PeerConnection: () => {
        throw new ReferenceError("Can't find variable: RTCPeerConnection");
      },
    });
    await call.start("voice");
    expect(call.snapshot()).toMatchObject({ phase: "idle", error: callUnsupportedError });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });
});

describe("call records", () => {
  function pair(opts?: { ringTimeoutMs?: number }) {
    let clock = 1_000_000;
    const recA: CallRecord[] = [];
    const recB: CallRecord[] = [];
    const wire: { a: SignalMeta[]; b: SignalMeta[] } = { a: [], b: [] };
    const media = () => ({
      getUserMedia: vi.fn(async (c: MediaStreamConstraints) => fakeStream(c.video ? ["audio", "video"] : ["audio"]) as unknown as MediaStream),
      getDisplayMedia: vi.fn(async () => fakeStream(["video", "audio"]) as unknown as MediaStream),
    });
    const devA = media();
    const devB = media();
    let a: LiveCall;
    let b: LiveCall;
    a = createLiveCall({
      send: async (meta) => {
        wire.a.push(meta);
        await b.receive(JSON.stringify(meta));
      },
      devices: () => devA,
      PeerConnection: () => PeerConnection,
      onRecord: (r) => recA.push(r),
      now: () => clock,
      ringTimeoutMs: opts?.ringTimeoutMs,
    });
    b = createLiveCall({
      send: async (meta) => {
        wire.b.push(meta);
        await a.receive(JSON.stringify(meta));
      },
      devices: () => devB,
      PeerConnection: () => PeerConnection,
      onRecord: (r) => recB.push(r),
      now: () => clock,
      ringTimeoutMs: opts?.ringTimeoutMs,
    });
    return {
      a,
      b,
      recA,
      recB,
      wire,
      tick(ms: number) {
        clock += ms;
      },
    };
  }

  it("records a completed voice call with the same duration on both sides", async () => {
    const p = pair();
    await p.a.start("voice");
    expect(p.b.snapshot().phase).toBe("ringing");
    await p.b.accept();
    await vi.waitFor(() => expect(p.a.snapshot().linked).toBe(true));
    p.tick(192_400);
    await p.a.hangup();
    expect(p.recA).toEqual([{ mode: "voice", outgoing: true, outcome: "completed", durationSec: 192 }]);
    expect(p.recB).toEqual([{ mode: "voice", outgoing: false, outcome: "completed", durationSec: 192 }]);
    expect(p.wire.a.at(-1)).toEqual({ v: 1, type: "rtc-hangup" });
  });

  it("records a declined video call: caller sees declined, callee too", async () => {
    const p = pair();
    await p.a.start("video");
    await p.b.decline();
    expect(p.wire.b).toEqual([{ v: 1, type: "rtc-hangup", reason: "decline" }]);
    expect(p.recA).toEqual([{ mode: "video", outgoing: true, outcome: "declined", durationSec: 0 }]);
    expect(p.recB).toEqual([{ mode: "video", outgoing: false, outcome: "declined", durationSec: 0 }]);
  });

  it("records a call the caller cancelled before it was answered", async () => {
    const p = pair();
    await p.a.start("voice");
    p.tick(5000);
    await p.a.hangup();
    expect(p.wire.a.at(-1)).toEqual({ v: 1, type: "rtc-hangup", reason: "cancel" });
    expect(p.recA).toEqual([{ mode: "voice", outgoing: true, outcome: "cancelled", durationSec: 0 }]);
    expect(p.recB).toEqual([{ mode: "voice", outgoing: false, outcome: "cancelled", durationSec: 0 }]);
  });

  it("gives up ringing after the timeout and records a missed call on both sides", async () => {
    vi.useFakeTimers();
    const p = pair({ ringTimeoutMs: 60_000 });
    await p.a.start("voice");
    await vi.advanceTimersByTimeAsync(59_999);
    expect(p.b.snapshot().phase).toBe("ringing");
    await vi.advanceTimersByTimeAsync(1);
    expect(p.a.snapshot().phase).toBe("idle");
    expect(p.b.snapshot().phase).toBe("idle");
    expect(p.wire.a.at(-1)).toEqual({ v: 1, type: "rtc-hangup", reason: "timeout" });
    expect(p.recA).toEqual([{ mode: "voice", outgoing: true, outcome: "missed", durationSec: 0 }]);
    expect(p.recB).toEqual([{ mode: "voice", outgoing: false, outcome: "missed", durationSec: 0 }]);
  });

  it("does not time out a call once it is answered", async () => {
    vi.useFakeTimers();
    const p = pair({ ringTimeoutMs: 1000 });
    await p.a.start("voice");
    await p.b.accept();
    await vi.advanceTimersByTimeAsync(5000);
    expect(p.a.snapshot().phase).toBe("live");
    expect(p.recA).toEqual([]);
  });

  it("records a completed screen share ended by the viewer", async () => {
    const p = pair();
    await p.a.start("screen");
    await vi.waitFor(() => expect(p.b.snapshot().linked).toBe(true));
    p.tick(65_000);
    await p.b.hangup();
    expect(p.recA).toEqual([{ mode: "screen", outgoing: true, outcome: "completed", durationSec: 65 }]);
    expect(p.recB).toEqual([{ mode: "screen", outgoing: false, outcome: "completed", durationSec: 65 }]);
  });

  it("records a failed call when the callee cannot capture media", async () => {
    const p = pair();
    await p.a.start("voice");
    expect(p.b.snapshot().phase).toBe("ringing");
    // A second callee whose microphone is denied answers the same offer.
    const deny = vi.fn(async () => {
      throw new Error("denied");
    });
    const failing = createLiveCall({
      send: async (meta) => {
        await p.a.receive(JSON.stringify(meta));
      },
      devices: () => ({ getUserMedia: deny }),
      PeerConnection: () => PeerConnection,
      onRecord: (r) => p.recB.push(r),
    });
    await failing.receive(offer("voice"));
    await failing.accept();
    expect(failing.snapshot().error).toBe(micDeniedError);
    expect(p.recB).toEqual([{ mode: "voice", outgoing: false, outcome: "failed", durationSec: 0 }]);
    expect(p.recA).toEqual([{ mode: "voice", outgoing: true, outcome: "failed", durationSec: 0 }]);
  });

  it("treats a reason-less hangup from an older peer as declined or cancelled", async () => {
    const recs: CallRecord[] = [];
    const caller = createLiveCall({
      send: async () => undefined,
      devices: () => ({ getUserMedia: async () => fakeStream(["audio"]) as unknown as MediaStream }),
      PeerConnection: () => PeerConnection,
      onRecord: (r) => recs.push(r),
    });
    await caller.start("voice");
    await caller.receive(JSON.stringify({ v: 1, type: "rtc-hangup" }));
    const callee = createLiveCall({
      send: async () => undefined,
      PeerConnection: () => PeerConnection,
      onRecord: (r) => recs.push(r),
    });
    await callee.receive(offer("video"));
    await callee.receive(JSON.stringify({ v: 1, type: "rtc-hangup" }));
    expect(recs).toEqual([
      { mode: "voice", outgoing: true, outcome: "declined", durationSec: 0 },
      { mode: "video", outgoing: false, outcome: "cancelled", durationSec: 0 },
    ]);
  });

  it("writes no record when nothing reached the peer", async () => {
    const recs: CallRecord[] = [];
    const call = createLiveCall({
      send: async () => {
        throw new Error("Could not reach peer. Check the address and that they are online.");
      },
      devices: () => ({ getUserMedia: async () => fakeStream(["audio"]) as unknown as MediaStream }),
      PeerConnection: () => PeerConnection,
      onRecord: (r) => recs.push(r),
    });
    await call.start("voice");
    await call.hangup();
    await call.receive(JSON.stringify({ v: 1, type: "rtc-hangup" }));
    expect(recs).toEqual([]);
  });
});

describe("missing devices", () => {
  for (const name of ["NotFoundError", "OverconstrainedError"]) {
    for (const mode of ["voice", "video"] as const) {
      it(`says no device was found for ${name} on a ${mode} call`, async () => {
        const call = createLiveCall({
          send: async () => undefined,
          devices: () => ({
            getUserMedia: async () => {
              throw Object.assign(new Error("Requested device not found"), { name });
            },
          }),
          PeerConnection: () => PeerConnection,
        });
        await call.start(mode);
        expect(call.snapshot().error).toBe(mediaNotFoundError);
      });
    }
  }

  it("keeps the permissions hint for NotAllowedError", async () => {
    const call = createLiveCall({
      send: async () => undefined,
      devices: () => ({
        getUserMedia: async () => {
          throw Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
        },
      }),
      PeerConnection: () => PeerConnection,
    });
    await call.start("voice");
    expect(call.snapshot().error).toBe(micDeniedError);
  });
});
