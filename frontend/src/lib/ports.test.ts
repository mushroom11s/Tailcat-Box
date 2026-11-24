import { describe, expect, it } from "vitest";
import { forwardPortMappings, parsePortMappings } from "./ports";

describe("forwardPortMappings", () => {
  it("keeps an explicit local:remote mapping", () => {
    expect(forwardPortMappings("18080:8080", true)).toEqual([
      { LocalPort: 18080, RemoteHost: "", RemotePort: 8080 },
    ]);
  });

  it("treats a bare port as the remote port with an ephemeral local listener when opening a browser", () => {
    expect(forwardPortMappings("80", false)).toEqual([{ LocalPort: 80, RemoteHost: "", RemotePort: 0 }]);
    expect(forwardPortMappings("80", true)).toEqual([{ LocalPort: 0, RemoteHost: "", RemotePort: 80 }]);
  });

  it("leaves an explicit ephemeral mapping unchanged", () => {
    expect(forwardPortMappings("0:80", true)).toEqual([{ LocalPort: 0, RemoteHost: "", RemotePort: 80 }]);
  });

  it("rejects a Unix socket as a forward target", () => {
    expect(() => forwardPortMappings("/tmp/app.sock", false)).toThrow("socket-serve-only");
  });
});

describe("parsePortMappings", () => {
  it("keeps a local port, a different local port, and a LAN host", () => {
    expect(parsePortMappings("8080")).toEqual([{ LocalPort: 8080, RemoteHost: "", RemotePort: 0 }]);
    expect(parsePortMappings("8080:80")).toEqual([{ LocalPort: 8080, RemoteHost: "", RemotePort: 80 }]);
    expect(parsePortMappings("5555:printer.lan:5555")).toEqual([
      { LocalPort: 5555, RemoteHost: "printer.lan", RemotePort: 5555 },
    ]);
    expect(parsePortMappings("5555:[::1]:5555")).toEqual([
      { LocalPort: 5555, RemoteHost: "::1", RemotePort: 5555 },
    ]);
  });

  it("parses a Unix socket target and a catch-all socket", () => {
    expect(parsePortMappings("8022:/tmp/app.sock")).toEqual([
      { LocalPort: 8022, RemoteHost: "", RemotePort: 0, Socket: "/tmp/app.sock" },
    ]);
    expect(parsePortMappings("unix:/tmp/app.sock")).toEqual([
      { LocalPort: 0, RemoteHost: "", RemotePort: 0, Socket: "/tmp/app.sock" },
    ]);
  });
});
