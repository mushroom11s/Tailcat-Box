import { describe, expect, it } from "vitest";
import { audioBytesToBase64, formatRecordElapsed, formatVoiceDuration, voiceBubbleWidthPx } from "./voiceBubble";

describe("voiceBubbleWidthPx", () => {
  it("clamps short and long durations", () => {
    expect(voiceBubbleWidthPx(1)).toBe(64);
    expect(voiceBubbleWidthPx(60)).toBe(200);
    expect(voiceBubbleWidthPx(0)).toBe(64);
    expect(voiceBubbleWidthPx(999)).toBe(200);
  });

  it("grows with duration between min and max", () => {
    const a = voiceBubbleWidthPx(3);
    const b = voiceBubbleWidthPx(12);
    expect(a).toBeGreaterThan(64);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(200);
  });
});

describe("formatVoiceDuration", () => {
  it("formats WeChat-style seconds", () => {
    expect(formatVoiceDuration(3)).toBe('3"');
    expect(formatVoiceDuration(1.4)).toBe('1"');
  });
});

describe("formatRecordElapsed", () => {
  it("formats mm:ss", () => {
    expect(formatRecordElapsed(0)).toBe("0:00");
    expect(formatRecordElapsed(5)).toBe("0:05");
    expect(formatRecordElapsed(65)).toBe("1:05");
  });
});

describe("audioBytesToBase64", () => {
  it("encodes bytes", () => {
    expect(audioBytesToBase64(Uint8Array.from([1, 2, 3, 4]))).toBe(btoa("\u0001\u0002\u0003\u0004"));
  });
});
