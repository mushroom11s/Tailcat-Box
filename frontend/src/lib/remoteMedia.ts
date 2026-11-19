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

export type RemoteMedia = {
  share: () => Promise<void>;
  signal: (raw: string) => Promise<void>;
  close: () => void;
};

export function createRemoteMedia(send: (meta: string) => Promise<void>, onStream: (stream: MediaStream | null) => void): RemoteMedia {
  let pc: RTCPeerConnection | null = null;
  let local: MediaStream | null = null;

  function close(): void {
    local?.getTracks().forEach((track) => track.stop());
    local = null;
    pc?.close();
    pc = null;
    onStream(null);
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
