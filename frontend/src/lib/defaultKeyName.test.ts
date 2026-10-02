import { describe, expect, it, vi } from "vitest";
import { defaultKeyName, formatKeyDate, resolveKeyName } from "./defaultKeyName";

describe("defaultKeyName", () => {
  it("formats local date as YYYYMMDD", () => {
    expect(formatKeyDate(new Date(2026, 9, 3))).toBe("20261003");
    expect(formatKeyDate(new Date(2026, 0, 9))).toBe("20260109");
  });

  it("builds Tailcat-YYYYMMDD-xxxxxx with a fixed suffix", () => {
    expect(defaultKeyName(new Date(2026, 9, 3), "Ab12Cd")).toBe("Tailcat-20261003-Ab12Cd");
  });

  it("generates a 6-char alphanumeric suffix by default", () => {
    const name = defaultKeyName(new Date(2026, 9, 3));
    expect(name).toMatch(/^Tailcat-20261003-[A-Za-z0-9]{6}$/);
  });

  it("resolveKeyName keeps a trimmed draft and fills when empty", () => {
    expect(resolveKeyName("  home  ")).toBe("home");
    expect(resolveKeyName("")).toMatch(/^Tailcat-\d{8}-[A-Za-z0-9]{6}$/);
    expect(resolveKeyName("   ")).toMatch(/^Tailcat-\d{8}-[A-Za-z0-9]{6}$/);
  });

  it("uses crypto.getRandomValues when available", () => {
    const spy = vi.spyOn(crypto, "getRandomValues").mockImplementation((arr: ArrayBufferView) => {
      const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      bytes.fill(1);
      return arr;
    });
    expect(defaultKeyName(new Date(2026, 9, 3))).toBe("Tailcat-20261003-BBBBBB");
    spy.mockRestore();
  });
});