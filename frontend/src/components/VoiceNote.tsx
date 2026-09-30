import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { decodeChatVoice } from "../lib/wails";

type Props = {
  mime: string;
  audio: string;
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

export default function VoiceNote({ mime, audio, onPlay, onEnded, canPlayMime, decodeVoice }: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "unplayable">("loading");

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

  if (state === "unplayable") {
    return <p>{t("chatVoiceUnplayable")}</p>;
  }
  return (
    <div className="chat-voice">
      {src ? <audio ref={ref} src={src} controls onPlay={onPlay} onEnded={onEnded} /> : null}
    </div>
  );
}
