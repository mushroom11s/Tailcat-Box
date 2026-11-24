import { describe, expect, it } from "vitest";
import { formatAccessLine } from "./accessLog";
import { translate } from "../i18n";

const t = (key: Parameters<typeof translate>[1]) => translate("en", key);

describe("formatAccessLine", () => {
  it("translates allow, refuse, open, and close", () => {
    expect(formatAccessLine(JSON.stringify({ op: "allow", peer: "nodekey:abc" }), t)).toBe("Allowed nodekey:abc");
    expect(formatAccessLine(JSON.stringify({ op: "refuse", peer: "nodekey:no" }), t)).toBe("Refused nodekey:no");
    expect(
      formatAccessLine(
        JSON.stringify({ op: "open", proto: "tcp", port: 8080, peer: "nodekey:abc", via: "direct:10.0.0.2:9" }),
        t,
      ),
    ).toBe("tcp 8080 opened · nodekey:abc · Direct 10.0.0.2:9");
    expect(
      formatAccessLine(JSON.stringify({ op: "close", proto: "tcp", port: 8080, peer: "nodekey:abc", dur: "12ms" }), t),
    ).toBe("tcp 8080 closed · nodekey:abc · 12ms");
  });

  it("names a relay path with the existing relay word", () => {
    expect(formatAccessLine(JSON.stringify({ op: "open", proto: "tcp", port: 80, peer: "k", via: "derp:sea" }), t)).toBe(
      "tcp 80 opened · k · Relay sea",
    );
  });
});
