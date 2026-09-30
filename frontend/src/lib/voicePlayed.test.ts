import { afterEach, describe, expect, it } from "vitest";
import { readPlayedVoices, rememberPlayedVoice, VOICE_PLAYED_KEY } from "./voicePlayed";

afterEach(() => {
  localStorage.removeItem(VOICE_PLAYED_KEY);
});

describe("played voice notes", () => {
  it("remembers an id once and ignores junk", () => {
    expect(rememberPlayedVoice(" voice-1 ")).toEqual(["voice-1"]);
    expect(rememberPlayedVoice("voice-1")).toEqual(["voice-1"]);
    expect(rememberPlayedVoice("")).toEqual(["voice-1"]);
    expect(readPlayedVoices()).toEqual(["voice-1"]);
    localStorage.setItem(VOICE_PLAYED_KEY, JSON.stringify(["a", "a", 2, " b ", ""]));
    expect(readPlayedVoices()).toEqual(["a", "b"]);
    localStorage.setItem(VOICE_PLAYED_KEY, "nope");
    expect(readPlayedVoices()).toEqual([]);
  });
});
