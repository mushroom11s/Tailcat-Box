import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../i18n";
import ChatPage, { type ChatMessage } from "./ChatPage";

function text(id: string, direction: "in" | "out", body: string): ChatMessage {
  return { id, direction, type: "text", body, at: "2026-10-09T09:30:00Z" };
}

const base: ChatMessage[] = [text("m1", "in", "old"), text("m2", "out", "mine"), text("m3", "in", "fresh one"), text("m4", "in", "fresh two")];

function room(messages: ChatMessage[], newMarkerId: string, locale: "en" | "zh-CN" = "en") {
  localStorage.setItem("tailcat-locale", locale);
  return (
    <LocaleProvider>
      <ChatPage
        address="tc:me"
        peer="tc:peer"
        messages={messages}
        newMarkerId={newMarkerId}
        roomError=""
        onConnect={vi.fn()}
        onSend={vi.fn()}
        onRetry={vi.fn()}
      />
    </LocaleProvider>
  );
}

function rowsAround(divider: HTMLElement): [string, string] {
  const prev = divider.previousElementSibling?.textContent ?? "";
  const next = divider.nextElementSibling?.textContent ?? "";
  return [prev, next];
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("new messages divider", () => {
  it("sits right above the first unread inbound message", () => {
    render(room(base, "m3"));
    const dividers = screen.getAllByRole("separator", { name: "New messages" });
    expect(dividers).toHaveLength(1);
    const [prev, next] = rowsAround(dividers[0]);
    expect(prev).toContain("mine");
    expect(next).toContain("fresh one");
  });

  it("uses the Chinese label", () => {
    render(room(base, "m3", "zh-CN"));
    expect(screen.getByRole("separator", { name: "新消息" }).textContent).toBe("新消息");
  });

  it("is hidden without a marker, and never above my own message", () => {
    const { rerender } = render(room(base, ""));
    expect(screen.queryByRole("separator", { name: "New messages" })).toBeNull();
    rerender(room(base, "m2"));
    expect(screen.queryByRole("separator", { name: "New messages" })).toBeNull();
  });

  it("stays put while more messages arrive", () => {
    const { rerender } = render(room(base, "m3"));
    rerender(room([...base, text("m5", "in", "later"), text("m6", "out", "reply")], "m3"));
    const dividers = screen.getAllByRole("separator", { name: "New messages" });
    expect(dividers).toHaveLength(1);
    expect(rowsAround(dividers[0])[1]).toContain("fresh one");
  });

  it("opens at the divider when the unread run is taller than the log, else at the latest", () => {
    const tops = new WeakMap<Element, number>();
    let dividerTop = 500;
    const restore = [
      mockGetter("scrollHeight", (el) => (el.classList.contains("chat-log") ? 2000 : 0)),
      mockGetter("clientHeight", (el) => (el.classList.contains("chat-log") ? 400 : 0)),
      mockGetter("offsetTop", (el) => (el.classList.contains("chat-new-divider") ? dividerTop : 0)),
    ];
    const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTop");
    Object.defineProperty(HTMLElement.prototype, "scrollTop", {
      configurable: true,
      get() {
        return tops.get(this) ?? 0;
      },
      set(v: number) {
        tops.set(this, v);
      },
    });
    try {
      render(room(base, "m3"));
      expect((document.querySelector(".chat-log") as HTMLElement).scrollTop).toBe(492);
      cleanup();
      dividerTop = 1800;
      render(room(base, "m3"));
      expect((document.querySelector(".chat-log") as HTMLElement).scrollTop).toBe(2000);
    } finally {
      restore.forEach((fn) => fn());
      if (scroll) {
        Object.defineProperty(HTMLElement.prototype, "scrollTop", scroll);
      } else {
        delete (HTMLElement.prototype as { scrollTop?: number }).scrollTop;
      }
    }
  });
});

function mockGetter(name: string, get: (el: Element) => number, proto: object = HTMLElement.prototype): () => void {
  const prev = Object.getOwnPropertyDescriptor(proto, name);
  Object.defineProperty(proto, name, {
    configurable: true,
    get() {
      return get(this as Element);
    },
  });
  return () => {
    if (prev) {
      Object.defineProperty(proto, name, prev);
    } else {
      delete (proto as Record<string, unknown>)[name];
    }
  };
}
