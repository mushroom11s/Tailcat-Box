import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useI18n } from "../i18n";
import {
  layoutScreenPopout,
  screenPopoutChrome,
  type ScreenPopoutKind,
  type Size,
} from "../lib/screenPopout";

function viewportOf(node: HTMLElement | null): Size {
  const shell = node?.closest(".shell") as HTMLElement | null;
  const el = shell ?? document.documentElement;
  return {
    width: Math.max(1, el.clientWidth),
    height: Math.max(1, el.clientHeight),
  };
}

function clampPoint(point: { x: number; y: number }, window: Size, viewport: Size): { x: number; y: number } {
  return {
    x: Math.min(Math.max(0, viewport.width - window.width), Math.max(0, point.x)),
    y: Math.min(Math.max(0, viewport.height - window.height), Math.max(0, point.y)),
  };
}

export default function ScreenSharePopout({ stream, onClose }: { stream: MediaStream; onClose: () => void }) {
  const { t } = useI18n();
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const placed = useRef(false);
  const [intrinsic, setIntrinsic] = useState<Size>({ width: 0, height: 0 });
  const [kind, setKind] = useState<ScreenPopoutKind>("default");
  const [custom, setCustom] = useState<Size | null>(null);
  const [viewport, setViewport] = useState<Size | null>(null);
  const [pos, setPos] = useState({ x: 16, y: 16 });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const read = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setIntrinsic({ width: video.videoWidth, height: video.videoHeight });
      }
    };
    try {
      video.srcObject = stream;
    } catch {
      // Test doubles are not DOM media streams.
    }
    video.addEventListener("loadedmetadata", read);
    video.addEventListener("resize", read);
    read();
    return () => {
      video.removeEventListener("loadedmetadata", read);
      video.removeEventListener("resize", read);
    };
  }, [stream]);

  useLayoutEffect(() => {
    const read = () => setViewport(viewportOf(frameRef.current));
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  const view = viewport ?? { width: 1, height: 1 };
  const layout = layoutScreenPopout({
    kind,
    videoWidth: intrinsic.width,
    videoHeight: intrinsic.height,
    viewportWidth: view.width,
    viewportHeight: view.height,
    custom,
  });

  useLayoutEffect(() => {
    if (!viewport) {
      return;
    }
    setPos((current) => {
      if (!placed.current) {
        placed.current = true;
        return {
          x: Math.max(16, viewport.width - layout.window.width - 16),
          y: 16,
        };
      }
      return clampPoint(current, layout.window, viewport);
    });
  }, [layout.window.width, layout.window.height, viewport]);

  function track(event: ReactPointerEvent<HTMLElement>, onMove: (dx: number, dy: number) => void): void {
    if (event.button !== 0) {
      return;
    }
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (ev: PointerEvent) => onMove(ev.clientX - startX, ev.clientY - startY);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function onDrag(event: ReactPointerEvent<HTMLElement>): void {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }
    const origin = pos;
    track(event, (dx, dy) => {
      setPos(clampPoint({ x: origin.x + dx, y: origin.y + dy }, layout.window, view));
    });
  }

  function onResize(event: ReactPointerEvent<HTMLElement>): void {
    event.stopPropagation();
    const origin = layout.window;
    track(event, (dx, dy) => {
      setKind("custom");
      setCustom({ width: Math.round(origin.width + dx), height: Math.round(origin.height + dy) });
    });
  }

  const bodyClass = `screen-popout-body${layout.scroll ? " scroll" : ""}${layout.scale ? " scale" : " native"}`;

  return (
    <div
      ref={frameRef}
      className="glass screen-popout"
      role="region"
      aria-label={t("chatScreenPopoutTitle")}
      style={{ left: pos.x, top: pos.y, width: layout.window.width, height: layout.window.height }}
    >
      <div className="screen-popout-title" style={{ height: screenPopoutChrome.height }} onPointerDown={onDrag}>
        <span>{t("chatScreenPopoutTitle")}</span>
        <button className="btn" type="button" onClick={() => setKind("native")}>
          {t("chatScreenEnlarge")}
        </button>
        <button className="btn" type="button" onClick={onClose}>
          {t("chatScreenClose")}
        </button>
      </div>
      <div className={bodyClass}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={layout.scale ? undefined : { width: layout.video.width, height: layout.video.height }}
        />
      </div>
      <button className="screen-popout-resize" type="button" aria-label={t("chatScreenResize")} onPointerDown={onResize} />
    </div>
  );
}
