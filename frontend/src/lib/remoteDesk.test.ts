import { describe, expect, it } from "vitest";
import { isTrusted, trustAddress, untrustAddress } from "./remoteDesk";
import { videoPoint } from "./remoteMedia";

describe("remote trust", () => {
  it("trusts one address without treating a saved recent address as trusted", () => {
    expect(isTrusted(["tc:home"], "tc:home")).toBe(true);
    expect(isTrusted(["tc:home"], "tc:other")).toBe(false);
    expect(isTrusted([], "tc:home")).toBe(false);
    expect(trustAddress(["tc:home"], "tc:home")).toEqual(["tc:home"]);
    expect(untrustAddress(["tc:home", "tc:office"], "tc:home")).toEqual(["tc:office"]);
  });
});

describe("remote picture coordinates", () => {
  it("maps a click inside the letterboxed picture and ignores the bars", () => {
    const box = { left: 0, top: 0, width: 200, height: 100 };
    expect(videoPoint(box, 100, 100, 100, 50)).toEqual({ x: 0.5, y: 0.5 });
    expect(videoPoint(box, 100, 100, 10, 50)).toBeNull();
  });
});
