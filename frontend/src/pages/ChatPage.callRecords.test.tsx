import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../i18n";
import type { CallView, LiveCall } from "../lib/liveCall";
import ChatPage, { type ChatMessage } from "./ChatPage";

function rec(id: string, direction: "in" | "out", mode: string, outcome: string, duration?: number): ChatMessage {
  return { id, direction, type: "call", body: mode, code: outcome, duration, at: "2026-10-09T09:30:00Z" };
}

const records: ChatMessage[] = [
  rec("c1", "out", "voice", "completed", 192),
  rec("c2", "in", "video", "completed", 3723),
  rec("c3", "out", "screen", "completed", 65),
  rec("c4", "out", "video", "declined"),
  rec("c5", "in", "voice", "declined"),
  rec("c6", "out", "voice", "cancelled"),
  rec("c7", "in", "voice", "cancelled"),
  rec("c8", "out", "video", "missed"),
  rec("c9", "in", "voice", "missed"),
  rec("c10", "out", "voice", "failed"),
];

const idle: CallView = {
  phase: "idle",
  mode: null,
  role: null,
  error: "",
  localStream: null,
  remoteStream: null,
  linked: false,
  muted: false,
};

function shellCall(): LiveCall {
  return {
    start: vi.fn(async () => undefined),
    accept: vi.fn(async () => undefined),
    decline: vi.fn(async () => undefined),
    hangup: vi.fn(async () => undefined),
    toggleMute: vi.fn(),
    receive: vi.fn(async () => undefined),
    snapshot: () => idle,
  };
}

function renderRoom(locale: "en" | "zh-CN", call = shellCall(), peer = "tc:peer") {
  localStorage.setItem("tailcat-locale", locale);
  render(
    <LocaleProvider>
      <ChatPage
        address="tc:me"
        peer={peer}
        messages={records}
        roomError=""
        onConnect={vi.fn()}
        onSend={vi.fn()}
        onRetry={vi.fn()}
        shellCall={call}
        shellView={idle}
      />
    </LocaleProvider>,
  );
  return call;
}

function recordText(id: string): string {
  const bubble = document.querySelector(`[data-msgid="${id}"]`) as HTMLElement;
  return bubble.querySelector(".chat-call-record-text")?.textContent ?? "";
}

function side(id: string): string {
  const bubble = document.querySelector(`[data-msgid="${id}"]`) as HTMLElement;
  return bubble.closest(".chat-msg")?.classList.contains("out") ? "out" : "in";
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("call records in the transcript", () => {
  it("renders every outcome in Chinese, on the caller's side", () => {
    renderRoom("zh-CN");
    expect(recordText("c1")).toBe("语音通话 通话时长 03:12");
    expect(recordText("c2")).toBe("视频通话 通话时长 1:02:03");
    expect(recordText("c3")).toBe("屏幕共享 共享时长 01:05");
    expect(recordText("c4")).toBe("对方已拒绝");
    expect(recordText("c5")).toBe("已拒绝");
    expect(recordText("c6")).toBe("已取消");
    expect(recordText("c7")).toBe("对方已取消");
    expect(recordText("c8")).toBe("对方未接听");
    expect(recordText("c9")).toBe("未接听");
    expect(recordText("c10")).toBe("通话失败");
    expect(["c1", "c3", "c4", "c6", "c8", "c10"].map(side)).toEqual(["out", "out", "out", "out", "out", "out"]);
    expect(["c2", "c5", "c7", "c9"].map(side)).toEqual(["in", "in", "in", "in"]);
    // Missed and cancelled incoming calls read red.
    const alerts = [...document.querySelectorAll(".chat-call-record.alert")].map(
      (el) => el.closest("[data-msgid]")?.getAttribute("data-msgid"),
    );
    expect(alerts).toEqual(["c7", "c9"]);
  });

  it("renders every outcome in English with a mode icon", () => {
    renderRoom("en");
    expect(recordText("c1")).toBe("Voice call Call duration 03:12");
    expect(recordText("c3")).toBe("Screen share Duration 01:05");
    expect(recordText("c4")).toBe("Declined");
    expect(recordText("c5")).toBe("You declined");
    expect(recordText("c6")).toBe("Cancelled");
    expect(recordText("c7")).toBe("Caller cancelled");
    expect(recordText("c8")).toBe("No answer");
    expect(recordText("c9")).toBe("Missed call");
    expect(recordText("c10")).toBe("Call failed");
    for (const r of records) {
      const bubble = document.querySelector(`[data-msgid="${r.id}"]`) as HTMLElement;
      expect(bubble.querySelector(".chat-call-record-icon svg")).toBeTruthy();
    }
  });

  it("calls again in the same mode when a record is clicked", async () => {
    const user = userEvent.setup();
    const call = renderRoom("en");
    const bubble = document.querySelector('[data-msgid="c4"]') as HTMLElement;
    await user.click(within(bubble).getByRole("button", { name: /Video call: Declined/ }));
    expect(call.start).toHaveBeenCalledWith("video");
  });

  it("shows plain records without a redial button when no peer is connected", () => {
    renderRoom("en", shellCall(), "");
    const bubble = document.querySelector('[data-msgid="c1"]') as HTMLElement;
    expect(within(bubble).queryByRole("button")).toBeNull();
    expect(recordText("c1")).toBe("Voice call Call duration 03:12");
  });

  it("finds records with chat search", async () => {
    const user = userEvent.setup();
    renderRoom("zh-CN");
    const search = screen.getByRole("searchbox");
    await user.type(search, "未接听");
    expect(document.querySelector('[data-msgid="c9"]')).toBeTruthy();
    expect(document.querySelector('[data-msgid="c1"]')).toBeNull();
  });
});
