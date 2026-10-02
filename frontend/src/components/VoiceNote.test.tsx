import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "../i18n";
import VoiceNote from "./VoiceNote";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  localStorage.setItem("tailcat-locale", "en");
});

function renderNote(props: Partial<ComponentProps<typeof VoiceNote>> = {}) {
  return render(
    <LocaleProvider>
      <VoiceNote mime="audio/wav" audio="AAAA" duration={3} direction="in" canPlayMime={() => true} {...props} />
    </LocaleProvider>,
  );
}

describe("VoiceNote", () => {
  it("renders a WeChat-style incoming bubble with duration", async () => {
    renderNote({ direction: "in", duration: 3 });
    const btn = await screen.findByRole("button");
    expect(btn.textContent).toContain('3"');
    expect(btn.className).toContain("chat-voice-bubble");
    const audio = document.querySelector("audio");
    expect(audio).toBeTruthy();
    expect(audio?.hasAttribute("controls")).toBe(false);
  });

  it("mirrors layout for outgoing messages", async () => {
    renderNote({ direction: "out", duration: 5 });
    const btn = await screen.findByRole("button");
    expect(btn.textContent).toContain('5"');
    expect(btn.closest(".chat-voice")?.className).toContain("out");
  });

  it("shows sending state", async () => {
    localStorage.setItem("tailcat-locale", "zh-CN");
    renderNote({ direction: "out", duration: 2, sending: true });
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("发送中");
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
  it("keeps sending bubble when mime is unplayable", async () => {
    renderNote({ direction: "out", duration: 2, sending: true, canPlayMime: () => false, decodeVoice: async () => null });
    expect(await screen.findByText("Sending…")).toBeTruthy();
    expect(document.querySelector(".chat-voice.sending")).toBeTruthy();
    expect(screen.queryByText("Cannot play this voice message.")).toBeNull();
  });
});
