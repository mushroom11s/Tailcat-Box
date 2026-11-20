import { callUnsupportedError, iceServers, screenDeniedError, screenUnavailableError } from "./liveCall";

export type VideoBox = { left: number; top: number; width: number; height: number };

/** Map a click onto the displayed picture. Letterboxed pixels are outside the screen. */
export function videoPoint(
  box: VideoBox,
  videoWidth: number,
  videoHeight: number,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const vw = videoWidth > 0 ? videoWidth : box.width;
  const vh = videoHeight > 0 ? videoHeight : box.height;
  if (vw <= 0 || vh <= 0 || box.width <= 0 || box.height <= 0) {
    return null;
  }
  const scale = Math.min(box.width / vw, box.height / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const ox = box.left + (box.width - dw) / 2;
  const oy = box.top + (box.height - dh) / 2;
  const x = (clientX - ox) / dw;
  const y = (clientY - oy) / dh;
  if (x < 0 || y < 0 || x > 1 || y > 1) {
    return null;
  }
  return { x, y };
}

type Signal = { v: 1; type: "rtc-offer" | "rtc-answer" | "rtc-hangup"; description?: { type: RTCSdpType; sdp: string } };

export type RemoteLink = "" | "checking" | "direct" | "derp";

export type RemoteQuality = {
  id: "1080p" | "720p" | "540p";
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number;
};

const QUALITY: Record<RemoteQuality["id"], RemoteQuality> = {
  "1080p": { id: "1080p", width: 1920, height: 1080, frameRate: 30, maxBitrate: 6_000_000 },
  "720p": { id: "720p", width: 1280, height: 720, frameRate: 24, maxBitrate: 2_500_000 },
  "540p": { id: "540p", width: 960, height: 540, frameRate: 15, maxBitrate: 800_000 },
};

const QUALITY_RANK: Record<RemoteQuality["id"], number> = { "540p": 0, "720p": 1, "1080p": 2 };

export type NetworkSample = {
  path?: RemoteLink;
  rttMs?: number;
  loss?: number;
};

/** Choose a capture size from the Tailcat path and recent call stats. */
export function pickRemoteQuality(sample: NetworkSample): RemoteQuality {
  const poor = sample.path === "derp" || (sample.rttMs != null && sample.rttMs >= 180) || (sample.loss != null && sample.loss >= 0.08);
  const good = sample.path === "direct" && (sample.rttMs == null || sample.rttMs < 80) && (sample.loss == null || sample.loss < 0.02);
  if (poor) {
    return QUALITY["540p"];
  }
  if (good) {
    return QUALITY["1080p"];
  }
  return QUALITY["720p"];
}

/** Drop resolution immediately when the link gets worse. Climb only after two good samples. */
export function nextRemoteQuality(current: RemoteQuality | null, sample: NetworkSample, goodStreak: number): { quality: RemoteQuality; goodStreak: number } {
  const wanted = pickRemoteQuality(sample);
  if (!current || wanted.id === current.id) {
    return { quality: wanted, goodStreak: 0 };
  }
  if (QUALITY_RANK[wanted.id] < QUALITY_RANK[current.id]) {
    return { quality: wanted, goodStreak: 0 };
  }
  const streak = goodStreak + 1;
  if (streak >= 2) {
    return { quality: wanted, goodStreak: 0 };
  }
  return { quality: current, goodStreak: streak };
}

export type RemoteMedia = {
  share: () => Promise<void>;
  signal: (raw: string) => Promise<void>;
  setLink: (path: RemoteLink) => void;
  close: () => void;
};

export function createRemoteMedia(
  send: (meta: string) => Promise<void>,
  onStream: (stream: MediaStream | null) => void,
  onQuality?: (quality: RemoteQuality) => void,
): RemoteMedia {
  let pc: RTCPeerConnection | null = null;
  let local: MediaStream | null = null;
  let link: RemoteLink = "";
  let quality: RemoteQuality | null = null;
  let goodStreak = 0;
  let statsTimer = 0;

  function close(): void {
    local?.getTracks().forEach((track) => track.stop());
    local = null;
    pc?.close();
    pc = null;
    if (statsTimer) {
      window.clearInterval(statsTimer);
      statsTimer = 0;
    }
    quality = null;
    goodStreak = 0;
    onStream(null);
  }

  async function applyQuality(next: RemoteQuality): Promise<void> {
    const track = local?.getVideoTracks()[0];
    if (track && typeof track.applyConstraints === "function") {
      try {
        await track.applyConstraints({
          width: { ideal: next.width },
          height: { ideal: next.height },
          frameRate: { ideal: next.frameRate, max: next.frameRate },
        });
      } catch {
        // The capture device keeps the previous size when a constraint is refused.
      }
    }
    const sender = pc?.getSenders().find((item) => item.track?.kind === "video");
    if (sender && typeof sender.getParameters === "function") {
      try {
        const params = sender.getParameters();
        const encodings = params.encodings?.length ? params.encodings : [{}];
        encodings[0] = { ...encodings[0], maxBitrate: next.maxBitrate, maxFramerate: next.frameRate };
        params.encodings = encodings;
        await sender.setParameters(params);
      } catch {
        // Some engines only accept sender parameters after the offer is applied.
      }
    }
  }

  function consider(sample: NetworkSample): void {
    const step = nextRemoteQuality(quality, { ...sample, path: sample.path ?? link }, goodStreak);
    goodStreak = step.goodStreak;
    if (quality?.id === step.quality.id) {
      return;
    }
    quality = step.quality;
    onQuality?.(step.quality);
    void applyQuality(step.quality);
  }

  async function readStats(): Promise<void> {
    if (!pc || typeof pc.getStats !== "function") {
      return;
    }
    const report = await pc.getStats();
    let rttMs: number | undefined;
    let lost = 0;
    let sent = 0;
    report.forEach((stat) => {
      const row = stat as {
        type?: string;
        kind?: string;
        packetsLost?: number;
        packetsSent?: number;
        currentRoundTripTime?: number;
        roundTripTime?: number;
      };
      if (row.type === "remote-inbound-rtp" && (row.kind === "video" || row.kind == null)) {
        if (typeof row.roundTripTime === "number") {
          rttMs = row.roundTripTime * 1000;
        }
        if (typeof row.packetsLost === "number") {
          lost = row.packetsLost;
        }
      }
      if (row.type === "candidate-pair" && typeof row.currentRoundTripTime === "number") {
        rttMs = row.currentRoundTripTime * 1000;
      }
      if (row.type === "outbound-rtp" && row.kind === "video" && typeof row.packetsSent === "number") {
        sent = row.packetsSent;
      }
    });
    const loss = sent > 0 ? lost / (sent + lost) : undefined;
    consider({ rttMs, loss });
  }

  function peer(): RTCPeerConnection {
    if (typeof RTCPeerConnection !== "function") {
      throw new Error(callUnsupportedError);
    }
    const next = new RTCPeerConnection({ iceServers });
    next.addEventListener("track", (event) => {
      const stream = (event as RTCTrackEvent).streams?.[0];
      if (stream) {
        onStream(stream);
      }
    });
    pc = next;
    if (!statsTimer) {
      statsTimer = window.setInterval(() => {
        void readStats().catch(() => undefined);
      }, 2000);
    }
    return next;
  }

  async function gathered(conn: RTCPeerConnection): Promise<void> {
    if (conn.iceGatheringState === "complete") {
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 4000);
      conn.addEventListener("icegatheringstatechange", () => {
        if (conn.iceGatheringState === "complete") {
          window.clearTimeout(timer);
          resolve();
        }
      });
    });
  }

  async function sendDesc(type: "rtc-offer" | "rtc-answer", conn: RTCPeerConnection): Promise<void> {
    const desc = conn.localDescription;
    if (!desc?.sdp || !desc.type) {
      throw new Error(screenUnavailableError);
    }
    const meta: Signal = { v: 1, type, description: { type: desc.type, sdp: desc.sdp } };
    await send(JSON.stringify(meta));
  }

  return {
    close,
    setLink(path: RemoteLink) {
      link = path;
      if (local) {
        consider({ path });
      }
    },
    async share() {
      close();
      const media = navigator.mediaDevices;
      if (!media || typeof media.getDisplayMedia !== "function") {
        throw new Error(screenUnavailableError);
      }
      try {
        local = await media.getDisplayMedia({ video: { displaySurface: "monitor" } as MediaTrackConstraints, audio: false });
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "AbortError") {
          throw new Error(screenDeniedError);
        }
        try {
          local = await media.getDisplayMedia({ video: true, audio: false });
        } catch {
          throw new Error(screenDeniedError);
        }
      }
      const conn = peer();
      local.getTracks().forEach((track) => conn.addTrack(track, local as MediaStream));
      consider({ path: link });
      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      await gathered(conn);
      await sendDesc("rtc-offer", conn);
    },
    async signal(raw: string) {
      const meta = JSON.parse(raw) as Signal;
      if (meta.type === "rtc-hangup") {
        close();
        return;
      }
      if (!meta.description?.sdp) {
        return;
      }
      if (meta.type === "rtc-offer") {
        const conn = peer();
        await conn.setRemoteDescription(meta.description);
        const answer = await conn.createAnswer();
        await conn.setLocalDescription(answer);
        await gathered(conn);
        await sendDesc("rtc-answer", conn);
        return;
      }
      if (meta.type === "rtc-answer" && pc) {
        await pc.setRemoteDescription(meta.description);
      }
    },
  };
}
