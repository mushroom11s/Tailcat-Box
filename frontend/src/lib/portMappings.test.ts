import { beforeEach, describe, expect, it } from "vitest";
import { MAPPINGS_KEY, draftMapping, readMappings, writeMappings } from "./portMappings";

beforeEach(() => {
  localStorage.removeItem(MAPPINGS_KEY);
});

describe("port mapping drafts", () => {
  it("saves one serve port", () => {
    const record = draftMapping({ mode: "serve", spec: "8080", peer: "", openBrowser: false });
    expect(record.mode).toBe("serve");
    expect(record.localPort).toBe(8080);
    expect(record.remoteHost).toBe("");
    expect(record.remotePort).toBe(0);
    expect(record.peer).toBe("");
    expect(record.openBrowser).toBe(false);
    expect(record.keyName).toBe("");
    expect(record.autostart).toBe(false);
    expect(record.id).toBeTruthy();
  });

  it("saves a serve mapping with a persisted key name", () => {
    const record = draftMapping({
      mode: "serve",
      spec: "8080",
      peer: "",
      openBrowser: false,
      keyName: " home ",
    });
    expect(record.keyName).toBe("home");
  });

  it("saves serve autostart independently", () => {
    const on = draftMapping({
      mode: "serve",
      spec: "8080",
      peer: "",
      openBrowser: false,
      autostart: true,
    });
    const off = draftMapping({
      mode: "serve",
      spec: "9090",
      peer: "",
      openBrowser: false,
      autostart: false,
    });
    expect(on.autostart).toBe(true);
    expect(off.autostart).toBe(false);
  });

  it("ignores autostart on forward mappings", () => {
    const record = draftMapping({
      mode: "forward",
      spec: "18080:8080",
      peer: "tc:peer",
      openBrowser: false,
      autostart: true,
    });
    expect(record.autostart).toBe(false);
  });

  it("saves a serve mapping with a remote host", () => {
    const record = draftMapping({
      mode: "serve",
      spec: "5555:127.0.0.1:3306",
      peer: "ignored",
      openBrowser: true,
    });
    expect(record).toMatchObject({
      mode: "serve",
      localPort: 5555,
      remoteHost: "127.0.0.1",
      remotePort: 3306,
      peer: "",
      openBrowser: false,
      keyName: "",
      autostart: false,
    });
  });

  it("saves one forward mapping and an ephemeral browser port", () => {
    expect(
      draftMapping({ mode: "forward", spec: "18080:8080", peer: " tc:peer ", openBrowser: false }),
    ).toMatchObject({
      mode: "forward",
      localPort: 18080,
      remoteHost: "",
      remotePort: 8080,
      peer: "tc:peer",
      openBrowser: false,
      keyName: "",
      autostart: false,
    });
    expect(
      draftMapping({ mode: "forward", spec: "80", peer: "tc:peer", openBrowser: true }),
    ).toMatchObject({
      localPort: 0,
      remotePort: 80,
      openBrowser: true,
      keyName: "",
      autostart: false,
    });
  });

  it("rejects an empty forward peer and more than one mapping", () => {
    expect(() => draftMapping({ mode: "forward", spec: "8080", peer: "  ", openBrowser: false })).toThrow(
      "peer-required",
    );
    expect(() => draftMapping({ mode: "serve", spec: "8080,8443", peer: "", openBrowser: false })).toThrow(
      "one-mapping",
    );
  });
});

describe("port mapping persistence", () => {
  it("round-trips saved mappings and drops invalid entries", () => {
    const serve = draftMapping({ mode: "serve", spec: "8080", peer: "", openBrowser: false, autostart: true });
    const forward = draftMapping({ mode: "forward", spec: "18080:8080", peer: "tc:peer", openBrowser: false });
    writeMappings([serve, forward]);
    expect(readMappings()).toEqual([serve, forward]);

    localStorage.setItem(
      MAPPINGS_KEY,
      JSON.stringify([
        serve,
        { id: "", mode: "serve", localPort: 1, remoteHost: "", remotePort: 0, peer: "", openBrowser: false },
        { id: "bad", mode: "nope" },
        { id: "fwd", mode: "forward", localPort: 1, remoteHost: "", remotePort: 2, peer: "", openBrowser: false },
      ]),
    );
    expect(readMappings()).toEqual([serve]);
    localStorage.setItem(MAPPINGS_KEY, "{");
    expect(readMappings()).toEqual([]);
  });

  it("defaults missing autostart to false for legacy serve rows", () => {
    localStorage.setItem(
      MAPPINGS_KEY,
      JSON.stringify([
        {
          id: "legacy",
          mode: "serve",
          localPort: 8080,
          remoteHost: "",
          remotePort: 0,
          peer: "",
          openBrowser: false,
          keyName: "home",
        },
      ]),
    );
    expect(readMappings()).toEqual([
      {
        id: "legacy",
        mode: "serve",
        localPort: 8080,
        remoteHost: "",
        remotePort: 0,
        peer: "",
        openBrowser: false,
        keyName: "home",
        autostart: false,
      },
    ]);
  });
});
