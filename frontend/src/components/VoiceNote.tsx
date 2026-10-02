import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useI18n } from "../i18n";
import { formatVoiceDuration, voiceBubbleWidthPx } from "../lib/voiceBubble";
import { decodeChatVoice } from "../lib/wails";

type Props = {
  mime: string;
  audio: string;
  duration?: number;
  direction?: "in" | "out";
  sending?: boolean;
  onPlay?: () => void;
  onEnded?: () => void;
  canPlayMime?: (mime: string) => boolean;
  decodeVoice?: (mime: string, audio: string) => Promise<string | null>;
};

function defaultCanPlay(mime: string): boolean {
  const audio = document.createElement("audio");
  return audio.canPlayType(mime) !== "";
}

async function defaultDecode(mime: string, audio: string): Promise<string | null> {
  try {
    const wav = await decodeChatVoice(mime, audio);
    return wav || null;
  } catch {
    return null;
  }
}

function VoiceWaveIcon({ playing }: { playing: boolean }) {
  return (
    <svg className={`chat-voice-wave${playing ? " playing" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path
        className="chat-voice-arc chat-voice-arc-1"
        d="M10 9.2a3.2 3.2 0 0 1 0 5.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        className="chat-voice-arc chat-voice-arc-2"
        d="M12.6 7.2a5.8 5.8 0 0 1 0 9.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        className="chat-voice-arc chat-voice-arc-3"
        d="M15.2 5.2a8.4 8.4 0 0 1 0 13.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="7.2" cy="12" r="1.7" fill="currentColor" />
    </svg>
  );
}

export default function VoiceNote({
  mime,
  audio,
  duration,
  direction = "in",
  sending = false,
  onPlay,
  onEnded,
  canPlayMime,
  decodeVoice,
}: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "unplayable">("loading");
  const [playing, setPlaying] = useState(false);
  const [resolvedDur, setResolvedDur] = useState(() => Math.max(1, Math.round(duration ?? 1)));

  useEffect(() => {
    if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
      setResolvedDur(Math.max(1, Math.round(duration)));
    }
  }, [duration]);

  useEffect(() => {
    let cancel = false;
    const canPlay = canPlayMime ?? defaultCanPlay;
    const decode = decodeVoice ?? defaultDecode;
    void (async () => {
      if (!audio) {
        if (!cancel) {
          setState("unplayable");
        }
        return;
      }
      let playMime = mime;
      let playAudio = audio;
      if (!canPlay(playMime)) {
        const wav = await decode(playMime, playAudio);
        if (cancel) {
          return;
        }
        if (!wav) {
          setState("unplayable");
          return;
        }
        playMime = "audio/wav";
        playAudio = wav;
      }
      if (cancel) {
        return;
      }
      setSrc(`data:${playMime};base64,${playAudio}`);
      setState("ready");
    })();
    return () => {
      cancel = true;
    };
  }, [mime, audio, canPlayMime, decodeVoice]);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const onMeta = () => {
      if (typeof duration === "number" && duration > 0) {
        return;
      }
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setResolvedDur(Math.max(1, Math.round(el.duration)));
      }
    };
    el.addEventListener("loadedmetadata", onMeta);
    return () => el.removeEventListener("loadedmetadata", onMeta);
  }, [src, duration]);

  async function togglePlay(): Promise<void> {
    const el = ref.current;
    if (!el || state !== "ready" || sending) {
      return;
    }
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    try {
      await el.play();
      // onPlay prop is fired from the <audio onPlay> handler
    } catch {
      setPlaying(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>): void {
    if (e.key !== "Enter" && e.key !== " ") {
      return;
    }
    e.preventDefault();
    void togglePlay();
  }

  // Keep the WeChat bubble + "Sending…" visible for optimistic outs even if
  // the webview cannot play the mime yet (jsdom / no decoder bindings).
  if (state === "unplayable" && !sending) {
    return <p>{t("chatVoiceUnplayable")}</p>;
  }

  const outgoing = direction === "out";
  const label = sending ? t("chatSending") : playing ? t("chatVoicePause") : t("chatPlay");
  const width = voiceBubbleWidthPx(resolvedDur);

  return (
    <div className={`chat-voice${outgoing ? " out" : " in"}${sending ? " sending" : ""}`}>
      <button
        type="button"
        className={`chat-voice-bubble${playing ? " playing" : ""}`}
        style={{ width }}
        aria-label={`${label} ${formatVoiceDuration(resolvedDur)}`}
        aria-busy={sending || undefined}
        disabled={state !== "ready" || sending}
        onClick={() => void togglePlay()}
        onKeyDown={onKey}
      >
        {!outgoing ? <VoiceWaveIcon playing={playing} /> : null}
        <span className="chat-voice-dur">{formatVoiceDuration(resolvedDur)}</span>
        {outgoing ? <VoiceWaveIcon playing={playing} /> : null}
      </button>
      {sending ? (
        <span className="chat-voice-sending" role="status">
          <span className="chat-voice-spinner" aria-hidden="true" />
          {t("chatSending")}
        </span>
      ) : null}
      {src ? (
        <audio
          ref={ref}
          src={src}
          preload="metadata"
          onPlay={() => {
            setPlaying(true);
            onPlay?.();
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            onEnded?.();
          }}
        />
      ) : null}
    </div>
  );
}
