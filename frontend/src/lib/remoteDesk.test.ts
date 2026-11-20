import { describe, expect, it } from "vitest";
import { encodeRemoteCode, extractRemoteTarget, isTrusted, parseRemoteCode, trustAddress, untrustAddress } from "./remoteDesk";
import { nextRemoteQuality, pickRemoteQuality, videoPoint } from "./remoteMedia";

describe("remote trust", () => {
  it("trusts one address without treating a saved recent address as trusted", () => {
    expect(isTrusted(["tc:home"], "tc:home")).toBe(true);
    expect(isTrusted(["tc:home"], "tc:other")).toBe(false);
    expect(isTrusted([], "tc:home")).toBe(false);
    expect(trustAddress(["tc:home"], "tc:home")).toEqual(["tc:home"]);
    expect(untrustAddress(["tc:home", "tc:office"], "tc:home")).toEqual(["tc:office"]);
  });
});

describe("remote connection code", () => {
  it("round-trips a code and pulls one out of pasted text", () => {
    const code = encodeRemoteCode("tc:room", "abcd");
    expect(code.startsWith("rc1.")).toBe(true);
    expect(parseRemoteCode(code)).toEqual({ addr: "tc:room", token: "abcd" });
    expect(extractRemoteTarget(`口令：${code} 请连接`)).toBe(code);
    expect(extractRemoteTarget("地址 tc:peer-1")).toBe("tc:peer-1");
    expect(extractRemoteTarget("nope")).toBe("");
  });
});

describe("remote picture quality", () => {
  it("uses 1080p on a healthy direct path and 540p on a relay or a poor sample", () => {
    expect(pickRemoteQuality({ path: "direct" }).id).toBe("1080p");
    expect(pickRemoteQuality({ path: "direct", rttMs: 40, loss: 0.01 }).id).toBe("1080p");
    expect(pickRemoteQuality({ path: "checking" }).id).toBe("720p");
    expect(pickRemoteQuality({ path: "direct", rttMs: 120 }).id).toBe("720p");
    expect(pickRemoteQuality({ path: "derp" }).id).toBe("540p");
    expect(pickRemoteQuality({ path: "direct", rttMs: 220 }).id).toBe("540p");
    expect(pickRemoteQuality({ path: "direct", loss: 0.1 }).id).toBe("540p");
  });

  it("drops resolution immediately and climbs only after a second good sample", () => {
    const sharp = pickRemoteQuality({ path: "direct" });
    const dropped = nextRemoteQuality(sharp, { path: "derp" }, 0);
    expect(dropped.quality.id).toBe("540p");
    const held = nextRemoteQuality(dropped.quality, { path: "direct" }, dropped.goodStreak);
    expect(held.quality.id).toBe("540p");
    expect(held.goodStreak).toBe(1);
    expect(nextRemoteQuality(held.quality, { path: "direct" }, held.goodStreak).quality.id).toBe("1080p");
  });
});

describe("remote picture coordinates", () => {
  it("maps a click inside the letterboxed picture and ignores the bars", () => {
    const box = { left: 0, top: 0, width: 200, height: 100 };
    expect(videoPoint(box, 100, 100, 100, 50)).toEqual({ x: 0.5, y: 0.5 });
    expect(videoPoint(box, 100, 100, 10, 50)).toBeNull();
  });
});
