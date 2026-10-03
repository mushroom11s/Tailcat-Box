export type Size = { width: number; height: number };

export type ScreenPopoutKind = "default" | "native" | "custom";

export type ScreenPopoutLayout = {
  window: Size;
  video: Size;
  /** Video stays at the peer's pixel size and the window scrolls. */
  scroll: boolean;
  /** Video scales down to the content box. Never used for the native-size window. */
  scale: boolean;
};

/** Title bar only. A border would steal pixels from the shared frame. */
export const screenPopoutChrome: Size = { width: 0, height: 40 };
export const screenPopoutMin: Size = { width: 280, height: 180 };
export const screenPopoutDefault: Size = { width: 640, height: 400 };

function clamp(n: number, lo: number, hi: number): number {
  if (hi < lo) {
    return hi;
  }
  return Math.min(hi, Math.max(lo, n));
}

function contentSize(window: Size, chrome: Size): Size {
  return {
    width: Math.max(1, window.width - chrome.width),
    height: Math.max(1, window.height - chrome.height),
  };
}

function fitWindow(size: Size, min: Size, viewport: Size): Size {
  return {
    width: clamp(size.width, Math.min(min.width, viewport.width), viewport.width),
    height: clamp(size.height, Math.min(min.height, viewport.height), viewport.height),
  };
}

export function layoutScreenPopout(input: {
  kind: ScreenPopoutKind;
  videoWidth: number;
  videoHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  custom: Size | null;
  chrome?: Size;
  min?: Size;
  fallback?: Size;
}): ScreenPopoutLayout {
  const chrome = input.chrome ?? screenPopoutChrome;
  const min = input.min ?? screenPopoutMin;
  const fallback = input.fallback ?? screenPopoutDefault;
  const viewport = {
    width: Math.max(1, input.viewportWidth),
    height: Math.max(1, input.viewportHeight),
  };
  const known = input.videoWidth > 0 && input.videoHeight > 0;
  const kind = input.kind === "native" && !known ? "default" : input.kind;

  if (kind === "native" && known) {
    const desired = {
      width: input.videoWidth + chrome.width,
      height: input.videoHeight + chrome.height,
    };
    if (desired.width <= viewport.width && desired.height <= viewport.height) {
      return {
        window: desired,
        video: { width: input.videoWidth, height: input.videoHeight },
        scroll: false,
        scale: false,
      };
    }
    return {
      window: { width: viewport.width, height: viewport.height },
      video: { width: input.videoWidth, height: input.videoHeight },
      scroll: true,
      scale: false,
    };
  }

  const outer =
    kind === "custom" && input.custom
      ? fitWindow(input.custom, min, viewport)
      : fitWindow(fallback, min, viewport);
  const content = contentSize(outer, chrome);
  const smaller = known && (content.width < input.videoWidth || content.height < input.videoHeight);
  if (!known || smaller) {
    return { window: outer, video: content, scroll: false, scale: true };
  }
  return {
    window: outer,
    video: { width: input.videoWidth, height: input.videoHeight },
    scroll: false,
    scale: false,
  };
}
