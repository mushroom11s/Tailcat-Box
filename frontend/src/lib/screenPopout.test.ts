import { describe, expect, it } from "vitest";
import { layoutScreenPopout, screenPopoutChrome, screenPopoutDefault, screenPopoutMin } from "./screenPopout";

describe("layoutScreenPopout", () => {
  it("uses native pixels, clamps that window to the viewport, or keeps a custom size", () => {
    const fitted = layoutScreenPopout({
      kind: "native",
      videoWidth: 800,
      videoHeight: 450,
      viewportWidth: 1000,
      viewportHeight: 800,
      custom: null,
    });
    expect(fitted).toEqual({
      window: { width: 800, height: 450 + screenPopoutChrome.height },
      video: { width: 800, height: 450 },
      scroll: false,
      scale: false,
    });

    const clamped = layoutScreenPopout({
      kind: "native",
      videoWidth: 1920,
      videoHeight: 1080,
      viewportWidth: 1000,
      viewportHeight: 700,
      custom: null,
    });
    expect(clamped.window).toEqual({ width: 1000, height: 700 });
    expect(clamped.video).toEqual({ width: 1920, height: 1080 });
    expect(clamped.scroll).toBe(true);
    expect(clamped.scale).toBe(false);

    const custom = layoutScreenPopout({
      kind: "custom",
      videoWidth: 1920,
      videoHeight: 1080,
      viewportWidth: 1000,
      viewportHeight: 800,
      custom: { width: 400, height: 300 },
    });
    expect(custom.window).toEqual({ width: 400, height: 300 });
    expect(custom.scale).toBe(true);
    expect(custom.scroll).toBe(false);
    expect(custom.video).toEqual({
      width: 400 - screenPopoutChrome.width,
      height: 300 - screenPopoutChrome.height,
    });

    const raised = layoutScreenPopout({
      kind: "custom",
      videoWidth: 1920,
      videoHeight: 1080,
      viewportWidth: 1000,
      viewportHeight: 800,
      custom: { width: 40, height: 40 },
    });
    expect(raised.window).toEqual(screenPopoutMin);

    const roomy = layoutScreenPopout({
      kind: "custom",
      videoWidth: 320,
      videoHeight: 180,
      viewportWidth: 1000,
      viewportHeight: 800,
      custom: { width: 900, height: 700 },
    });
    expect(roomy.scale).toBe(false);
    expect(roomy.video).toEqual({ width: 320, height: 180 });
    expect(roomy.window).toEqual({ width: 900, height: 700 });

    const opened = layoutScreenPopout({
      kind: "default",
      videoWidth: 1920,
      videoHeight: 1080,
      viewportWidth: 1280,
      viewportHeight: 800,
      custom: null,
    });
    expect(opened.window).toEqual(screenPopoutDefault);
    expect(opened.scale).toBe(true);
    expect(opened.scroll).toBe(false);
  });
});
