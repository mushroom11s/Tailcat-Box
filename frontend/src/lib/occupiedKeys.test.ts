import { describe, expect, it } from "vitest";
import { filterAvailableKeys, occupiedKeyNames } from "./occupiedKeys";

describe("occupiedKeyNames", () => {
  it("unions room and serve mapping keys and can exempt one mapping", () => {
    const occupied = occupiedKeyNames({
      rooms: [{ keyName: "home" }, { keyName: "" }, { keyName: " desk " }],
      mappings: [
        { id: "a", mode: "serve", keyName: "port1" },
        { id: "b", mode: "forward", keyName: "ignored" },
        { id: "c", mode: "serve", keyName: "home" },
      ],
      allowMappingId: "a",
    });
    expect([...occupied].sort()).toEqual(["desk", "home"]);
  });
});

describe("filterAvailableKeys", () => {
  it("drops occupied names", () => {
    expect(
      filterAvailableKeys(
        [
          { name: "home" },
          { name: "port1" },
          { name: "free" },
        ],
        new Set(["home", "port1"]),
      ).map((k) => k.name),
    ).toEqual(["free"]);
  });
});
