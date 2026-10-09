export const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
export const gatherTimeoutMs = 5000;

export const micDeniedError = "Microphone access was denied.";
export const cameraDeniedError = "Camera access was denied.";
export const screenDeniedError = "Screen sharing was denied.";
/** getUserMedia found no matching device (NotFoundError / OverconstrainedError), so a permissions hint would mislead. */
export const mediaNotFoundError = "No microphone or camera found.";
export const screenUnavailableError = "Screen sharing is unavailable on this system.";
// Distro WebKitGTK builds (Debian, Ubuntu) compile WebRTC out, so Linux
// has no RTCPeerConnection. Voice notes still work there; calls do not.
export const callUnsupportedError = "Calls need WebRTC, which this system's web engine does not include.";
export const liveMediaError =
  "Live media failed. Restrictive networks have no relay for calls, so voice and video can fail while chat still works.";

export type CallMode = "voice" | "video" | "screen";

/** How long the caller rings before giving up (WeChat uses about a minute). */
export const ringTimeoutMs = 60_000;

/** Why a call ended before it connected. Rides on rtc-hangup; older peers omit it. */
export type HangupReason = "decline" | "cancel" | "timeout" | "failed";

export type CallOutcome = "completed" | "declined" | "cancelled" | "missed" | "failed";

/**
 * One side's view of a finished call. Each side derives its own record from the
 * signals it saw, so no extra message goes over the wire.
 * outgoing is true when this side placed the call.
 */
export type CallRecord = {
  mode: CallMode;
  outgoing: boolean;
  outcome: CallOutcome;
  durationSec: number;
};

export type SignalMeta = {
  v: 1;
  type: "rtc-offer" | "rtc-answer" | "rtc-hangup";
  mode?: CallMode;
  reason?: HangupReason;
  description?: { type: RTCSdpType; sdp: string };
};

export type CallView = {
  phase: "idle" | "building" | "ringing" | "live";
  mode: CallMode | null;
  role: "caller" | "answerer" | null;
  error: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  linked: boolean;
  muted: boolean;
};

export type LiveDevices = {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  getDisplayMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
};

export type LiveCall = {
  start: (mode: CallMode) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  hangup: () => Promise<void>;
  toggleMute: () => void;
  receive: (raw: string) => Promise<void>;
  snapshot: () => CallView;
};

type PeerCtor = new (config?: RTCConfiguration) => RTCPeerConnection;

type Options = {
  send: (meta: SignalMeta) => Promise<void>;
  devices?: () => LiveDevices | null | undefined;
  PeerConnection?: () => PeerCtor;
  gatherTimeoutMs?: number;
  onChange?: (view: CallView) => void;
  /** Called once when a call that reached the peer ends. */
  onRecord?: (record: CallRecord) => void;
  ringTimeoutMs?: number;
  now?: () => number;
};

export function createLiveCall(options: Options): LiveCall {
  const timeout = options.gatherTimeoutMs ?? gatherTimeoutMs;
  let generation = 0;
  let buildingOffer = false;
  let signaled = false;
  let phase: CallView["phase"] = "idle";
  let mode: CallMode | null = null;
  let role: CallView["role"] = null;
  let error = "";
  let localStream: MediaStream | null = null;
  let remoteStream: MediaStream | null = null;
  let linked = false;
  let muted = false;
  let pending: { gen: number; mode: CallMode; description: { type: RTCSdpType; sdp: string } } | null = null;
  let pc: RTCPeerConnection | null = null;
  const retired = new WeakSet<RTCPeerConnection>();
  const ringMs = options.ringTimeoutMs ?? ringTimeoutMs;
  const now = options.now ?? (() => Date.now());
  let linkedAt: number | null = null;
  let ringTimer: ReturnType<typeof setTimeout> | null = null;

  function clearRing(): void {
    if (ringTimer != null) {
      clearTimeout(ringTimer);
      ringTimer = null;
    }
  }

  function markLinked(): void {
    clearRing();
    linked = true;
    linkedAt = now();
  }

  type Ending = { mode: CallMode | null; role: CallView["role"]; linked: boolean; linkedAt: number | null };

  /** Capture the call before a reset wipes it. */
  function ending(): Ending {
    const was = { mode, role, linked, linkedAt };
    clearRing();
    linkedAt = null;
    return was;
  }

  function record(was: Ending, outcome: CallOutcome | null): void {
    if (!outcome || !was.mode || !was.role) {
      return;
    }
    const durationSec =
      outcome === "completed" && was.linkedAt != null ? Math.max(0, Math.round((now() - was.linkedAt) / 1000)) : 0;
    try {
      options.onRecord?.({ mode: was.mode, outgoing: was.role === "caller", outcome, durationSec });
    } catch {
      // A record is best effort; never break the call flow.
    }
  }

  function snapshot(): CallView {
    return { phase, mode, role, error, localStream, remoteStream, linked, muted };
  }

  function publish(): void {
    options.onChange?.(snapshot());
  }

  function devices(): LiveDevices {
    return options.devices?.() ?? defaultDevices();
  }

  function stopStream(stream: MediaStream | null): void {
    stream?.getTracks().forEach((track) => track.stop());
  }

  function retire(current: RTCPeerConnection | null): void {
    if (!current) {
      return;
    }
    retired.add(current);
    if (pc === current) {
      pc = null;
    }
    current.close();
  }

  function resetMedia(): void {
    retire(pc);
    stopStream(localStream);
    localStream = null;
    remoteStream = null;
  }

  async function capture(nextMode: CallMode): Promise<MediaStream> {
    const media = devices();
    if (nextMode === "screen") {
      if (typeof media.getDisplayMedia !== "function") {
        throw new Error(screenUnavailableError);
      }
      try {
        return await media.getDisplayMedia({ video: true, audio: true });
      } catch {
        throw new Error(screenDeniedError);
      }
    }
    if (typeof media.getUserMedia !== "function") {
      throw new Error(nextMode === "voice" ? micDeniedError : cameraDeniedError);
    }
    try {
      if (nextMode === "voice") {
        return await media.getUserMedia({ audio: true });
      }
      return await media.getUserMedia({ audio: true, video: true });
    } catch (err) {
      if (nextMode === "voice") {
        throw new Error(missingDevice(err) ? mediaNotFoundError : micDeniedError);
      }
      if (missingDevice(err)) {
        throw new Error(mediaNotFoundError);
      }
      const text = err instanceof Error ? `${err.name} ${err.message}`.toLowerCase() : "";
      if (text.includes("microphone") || (text.includes("audio") && !text.includes("video") && !text.includes("camera"))) {
        throw new Error(micDeniedError);
      }
      throw new Error(cameraDeniedError);
    }
  }

  function watchEnded(track: MediaStreamTrack, gen: number): void {
    track.addEventListener("ended", () => {
      if (gen !== generation || mode !== "screen") {
        return;
      }
      void api.hangup();
    });
  }

  function peerCtor(): PeerCtor | undefined {
    try {
      const Ctor = options.PeerConnection?.() ?? (globalThis as { RTCPeerConnection?: PeerCtor }).RTCPeerConnection;
      return typeof Ctor === "function" ? Ctor : undefined;
    } catch {
      // A bare RTCPeerConnection reference throws where the global is missing.
      return undefined;
    }
  }

  function openPeer(gen: number): RTCPeerConnection {
    const Ctor = peerCtor();
    if (!Ctor) {
      throw new Error(callUnsupportedError);
    }
    const next = new Ctor({ iceServers });
    pc = next;
    const takeRemote = (stream: MediaStream | null, track?: MediaStreamTrack | null) => {
      if (!stream || pc !== next) {
        return;
      }
      remoteStream = stream;
      publish();
      if (mode === "screen" && track?.kind === "video") {
        watchEnded(track, gen);
      }
    };
    next.addEventListener("track", (event) => {
      const trackEvent = event as RTCTrackEvent;
      const remote =
        trackEvent.streams?.[0] ??
        (trackEvent.track && typeof MediaStream === "function" ? new MediaStream([trackEvent.track]) : null);
      takeRemote(remote, trackEvent.track);
    });
    // WebKitGTK on GStreamer < 1.26 can skip the track event even though
    // getReceivers() already has live tracks (audio/video RTP still flows).
    const pickReceivers = () => {
      if (pc !== next || remoteStream || typeof MediaStream !== "function") {
        return;
      }
      const tracks = next
        .getReceivers()
        .map((receiver) => receiver.track)
        .filter((track): track is MediaStreamTrack => !!track && track.readyState !== "ended");
      if (!tracks.length) {
        return;
      }
      takeRemote(new MediaStream(tracks), tracks.find((track) => track.kind === "video") ?? tracks[0]);
    };
    const onState = () => {
      if (retired.has(next) || pc !== next || gen !== generation) {
        return;
      }
      if (next.connectionState === "connected") {
        pickReceivers();
      }
      if (next.connectionState === "failed" || next.connectionState === "closed" || next.iceConnectionState === "failed") {
        failLive();
      }
    };
    next.addEventListener("connectionstatechange", onState);
    next.addEventListener("iceconnectionstatechange", onState);
    return next;
  }

  function addLocal(next: RTCPeerConnection, stream: MediaStream): void {
    stream.getTracks().forEach((track) => next.addTrack(track, stream));
  }

  function clearLink(): void {
    pending = null;
    linked = false;
    muted = false;
  }

  function failLive(): void {
    const notify = signaled;
    const was = ending();
    generation += 1;
    buildingOffer = false;
    signaled = false;
    resetMedia();
    clearLink();
    phase = "idle";
    mode = null;
    role = null;
    error = liveMediaError;
    publish();
    // Media that dropped mid-call still counts as a call with a duration.
    record(was, was.linked ? "completed" : notify ? "failed" : null);
    if (notify) {
      void options.send({ v: 1, type: "rtc-hangup", reason: was.linked ? undefined : "failed" }).catch(() => undefined);
    }
  }

  async function describeLocal(next: RTCPeerConnection, gen: number): Promise<{ type: RTCSdpType; sdp: string } | null> {
    await waitGathering(next, timeout);
    if (gen !== generation) {
      return null;
    }
    const desc = next.localDescription;
    if (!desc?.sdp || !desc.type) {
      throw new Error(liveMediaError);
    }
    return { type: desc.type, sdp: desc.sdp };
  }

  async function answerOffer(gen: number, offerMode: CallMode, description: { type: RTCSdpType; sdp: string }): Promise<void> {
    try {
      if (offerMode !== "screen") {
        const stream = await capture(offerMode);
        if (gen !== generation) {
          stopStream(stream);
          return;
        }
        localStream = stream;
        if (muted) {
          stream.getAudioTracks().forEach((track) => {
            track.enabled = false;
          });
        }
        publish();
      }
      if (gen !== generation) {
        return;
      }
      const next = openPeer(gen);
      if (localStream) {
        addLocal(next, localStream);
      }
      await next.setRemoteDescription(description);
      if (gen !== generation) {
        return;
      }
      const answer = await next.createAnswer();
      if (gen !== generation) {
        return;
      }
      await next.setLocalDescription(answer);
      if (gen !== generation) {
        return;
      }
      const local = await describeLocal(next, gen);
      if (gen !== generation || !local?.sdp) {
        return;
      }
      await options.send({ v: 1, type: "rtc-answer", description: local });
      if (gen !== generation) {
        return;
      }
      phase = "live";
      markLinked();
      publish();
    } catch (err) {
      if (gen !== generation) {
        return;
      }
      const notify = signaled;
      const was = ending();
      signaled = false;
      buildingOffer = false;
      resetMedia();
      clearLink();
      phase = "idle";
      mode = null;
      role = null;
      error = failureText(err);
      publish();
      record(was, notify ? "failed" : null);
      if (notify) {
        await options.send({ v: 1, type: "rtc-hangup", reason: "failed" }).catch(() => undefined);
      }
    }
  }

  /** This side ends the call: hang up, cancel, decline, or ring timeout. */
  async function endLocal(timedOut: "timeout" | null): Promise<void> {
    const ringing = phase === "ringing";
    const notify = signaled || ringing;
    const idle = phase === "idle";
    const was = ending();
    generation += 1;
    buildingOffer = false;
    signaled = false;
    resetMedia();
    clearLink();
    phase = "idle";
    mode = null;
    role = null;
    publish();
    let outcome: CallOutcome | null = null;
    let reason: HangupReason | undefined;
    if (!idle && notify) {
      if (was.linked) {
        outcome = "completed";
      } else if (was.role === "caller") {
        outcome = timedOut ? "missed" : "cancelled";
        reason = timedOut ? "timeout" : "cancel";
      } else {
        outcome = "declined";
        reason = "decline";
      }
    }
    record(was, outcome);
    if (notify) {
      try {
        await options.send(reason ? { v: 1, type: "rtc-hangup", reason } : { v: 1, type: "rtc-hangup" });
      } catch (err) {
        error = failureText(err);
        publish();
      }
    }
  }

  const api: LiveCall = {
    async start(nextMode) {
      if (!peerCtor()) {
        // Fail before asking for the microphone or screen.
        error = callUnsupportedError;
        publish();
        return;
      }
      ending();
      const gen = ++generation;
      buildingOffer = true;
      signaled = false;
      resetMedia();
      clearLink();
      phase = "building";
      mode = nextMode;
      role = "caller";
      error = "";
      publish();
      try {
        const stream = await capture(nextMode);
        if (gen !== generation) {
          stopStream(stream);
          return;
        }
        localStream = stream;
        if (muted) {
          stream.getAudioTracks().forEach((track) => {
            track.enabled = false;
          });
        }
        if (nextMode === "screen") {
          stream.getVideoTracks().forEach((track) => watchEnded(track, gen));
        }
        publish();
        const next = openPeer(gen);
        addLocal(next, stream);
        const offer = await next.createOffer();
        if (gen !== generation) {
          return;
        }
        await next.setLocalDescription(offer);
        if (gen !== generation) {
          return;
        }
        const description = await describeLocal(next, gen);
        if (gen !== generation || !description?.sdp) {
          return;
        }
        await options.send({ v: 1, type: "rtc-offer", mode: nextMode, description });
        if (gen !== generation) {
          return;
        }
        signaled = true;
        buildingOffer = false;
        phase = "live";
        if (ringMs > 0 && !linked) {
          clearRing();
          ringTimer = setTimeout(() => {
            ringTimer = null;
            if (gen === generation && !linked && role === "caller") {
              void endLocal("timeout");
            }
          }, ringMs);
        }
        publish();
      } catch (err) {
        if (gen !== generation) {
          return;
        }
        buildingOffer = false;
        signaled = false;
        resetMedia();
        clearLink();
        phase = "idle";
        mode = null;
        role = null;
        error = failureText(err);
        publish();
      }
    },
    async accept() {
      const held = pending;
      if (!held || phase !== "ringing" || held.gen !== generation) {
        return;
      }
      pending = null;
      const gen = held.gen;
      signaled = true;
      buildingOffer = false;
      phase = "building";
      mode = held.mode;
      role = "answerer";
      error = "";
      publish();
      await answerOffer(gen, held.mode, held.description);
    },
    async decline() {
      if (phase !== "ringing") {
        return;
      }
      await api.hangup();
    },
    toggleMute() {
      muted = !muted;
      localStream?.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
      publish();
    },
    async hangup() {
      await endLocal(null);
    },
    async receive(raw) {
      let meta: Partial<SignalMeta>;
      try {
        meta = JSON.parse(raw) as Partial<SignalMeta>;
      } catch {
        return;
      }
      if (meta.type === "rtc-hangup") {
        const idle = phase === "idle";
        const was = ending();
        generation += 1;
        buildingOffer = false;
        signaled = false;
        resetMedia();
        clearLink();
        phase = "idle";
        mode = null;
        role = null;
        publish();
        if (!idle) {
          record(was, remoteOutcome(was, meta.reason));
        }
        return;
      }
      if (meta.type === "rtc-answer") {
        if (!pc || !meta.description?.sdp || !meta.description.type) {
          return;
        }
        const current = pc;
        try {
          await current.setRemoteDescription(meta.description);
          if (pc === current) {
            phase = "live";
            markLinked();
            publish();
          }
        } catch {
          if (pc === current) {
            failLive();
          }
        }
        return;
      }
      if (meta.type !== "rtc-offer" || buildingOffer) {
        return;
      }
      if (!meta.description?.sdp || !meta.description.type) {
        return;
      }
      if (meta.mode !== "voice" && meta.mode !== "video" && meta.mode !== "screen") {
        return;
      }
      ending();
      const gen = ++generation;
      const offerMode = meta.mode;
      const description = meta.description;
      signaled = false;
      resetMedia();
      clearLink();
      buildingOffer = false;
      mode = offerMode;
      role = "answerer";
      error = "";
      if (offerMode !== "screen") {
        pending = { gen, mode: offerMode, description };
        phase = "ringing";
        publish();
        return;
      }
      signaled = true;
      phase = "building";
      publish();
      await answerOffer(gen, offerMode, description);
    },
    snapshot,
  };
  return api;
}

/** What this side saw when the peer sent rtc-hangup. */
function remoteOutcome(was: { role: CallView["role"]; linked: boolean }, reason: unknown): CallOutcome {
  if (was.linked) {
    return "completed";
  }
  if (reason === "failed") {
    return "failed";
  }
  if (was.role === "caller") {
    // The callee hung up before answering. Older peers send no reason.
    return "declined";
  }
  return reason === "timeout" ? "missed" : "cancelled";
}

function defaultDevices(): LiveDevices {
  const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (!media) {
    return {};
  }
  return {
    getUserMedia: (constraints) => media.getUserMedia(constraints),
    getDisplayMedia: typeof media.getDisplayMedia === "function" ? (constraints) => media.getDisplayMedia(constraints) : undefined,
  };
}

function failureText(err: unknown): string {
  if (!(err instanceof Error)) {
    return liveMediaError;
  }
  if (
    err.message === micDeniedError ||
    err.message === cameraDeniedError ||
    err.message === screenDeniedError ||
    err.message === mediaNotFoundError ||
    err.message === screenUnavailableError ||
    err.message === liveMediaError ||
    err.message === callUnsupportedError ||
    err.message === "Could not reach peer. Check the address and that they are online." ||
    err.message === "no peer"
  ) {
    return err.message;
  }
  return liveMediaError;
}

function missingDevice(err: unknown): boolean {
  const name = typeof err === "object" && err !== null ? String((err as { name?: unknown }).name ?? "") : "";
  // DevicesNotFoundError is the legacy Chromium name for NotFoundError.
  return name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError";
}

function waitGathering(pc: RTCPeerConnection, ms: number): Promise<void> {
  if (pc.iceGatheringState === "complete") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      pc.removeEventListener("icegatheringstatechange", onState);
      window.clearTimeout(timer);
      resolve();
    };
    const onState = () => {
      if (pc.iceGatheringState === "complete") {
        finish();
      }
    };
    pc.addEventListener("icegatheringstatechange", onState);
    const timer = window.setTimeout(finish, ms);
    if (pc.iceGatheringState === "complete") {
      finish();
    }
  });
}
