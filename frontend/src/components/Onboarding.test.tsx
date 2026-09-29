import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../i18n";
import Onboarding, { measureGuideTarget } from "./Onboarding";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function stubRect(el: Element, rect: Partial<DOMRect>) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    top: rect.top ?? 0,
    left: rect.left ?? 0,
    bottom: (rect.top ?? 0) + (rect.height ?? 0),
    right: (rect.left ?? 0) + (rect.width ?? 0),
    width: rect.width ?? 0,
    height: rect.height ?? 0,
    toJSON() {
      return this;
    },
  } as DOMRect);
}

describe("measureGuideTarget", () => {
  it("returns padded viewport box for an existing target", () => {
    const node = document.createElement("button");
    node.setAttribute("data-guide", "chat");
    document.body.appendChild(node);
    stubRect(node, { top: 40, left: 20, width: 100, height: 32 });
    expect(measureGuideTarget("chat")).toEqual({
      top: 32,
      left: 12,
      width: 116,
      height: 48,
    });
  });

  it("ignores visualViewport offset so fixed coords match getBoundingClientRect", () => {
    const node = document.createElement("button");
    node.setAttribute("data-guide", "chat");
    document.body.appendChild(node);
    stubRect(node, { top: 40, left: 20, width: 100, height: 32 });
    vi.stubGlobal("visualViewport", {
      offsetLeft: 24,
      offsetTop: 16,
      width: 800,
      height: 600,
      scale: 1,
      addEventListener() {},
      removeEventListener() {},
    });
    // Adding vv offset would yield top:48 left:36 — must stay at raw rect - PAD.
    expect(measureGuideTarget("chat")).toEqual({
      top: 32,
      left: 12,
      width: 116,
      height: 48,
    });
  });

  it("returns null when the target is missing or zero-sized", () => {
    expect(measureGuideTarget("missing")).toBeNull();
    const node = document.createElement("div");
    node.setAttribute("data-guide", "empty");
    document.body.appendChild(node);
    stubRect(node, { top: 0, left: 0, width: 0, height: 0 });
    expect(measureGuideTarget("empty")).toBeNull();
  });
});

describe("Onboarding spotlight remasure", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0) as unknown as number,
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  });

  it("portals the guide to document.body outside .shell", async () => {
    const shell = document.createElement("div");
    shell.className = "shell";
    document.body.appendChild(shell);
    const mount = document.createElement("div");
    shell.appendChild(mount);

    render(
      <LocaleProvider>
        <Onboarding open onSkip={() => {}} onDismiss={() => {}} onStep={() => {}} />
      </LocaleProvider>,
      { container: mount },
    );

    await waitFor(() => expect(screen.getByTestId("guide-root")).toBeTruthy());
    const guide = screen.getByTestId("guide-root");
    expect(guide.parentElement).toBe(document.body);
    expect(shell.contains(guide)).toBe(false);
  });

  it("waits for a late-mounted target after onStep page switch", async () => {
    const onStep = vi.fn();
    render(
      <LocaleProvider>
        <Onboarding open onSkip={() => {}} onDismiss={() => {}} onStep={onStep} />
      </LocaleProvider>,
    );
    expect(onStep).toHaveBeenCalledWith(0);
    expect(screen.queryByTestId("guide-spot")).toBeNull();

    const node = document.createElement("button");
    node.setAttribute("data-guide", "chat");
    document.body.appendChild(node);
    stubRect(node, { top: 50, left: 30, width: 80, height: 28 });

    await waitFor(() => {
      const spot = screen.getByTestId("guide-spot");
      expect(spot.style.top).toBe("42px");
      expect(spot.style.left).toBe("22px");
      expect(spot.style.width).toBe("96px");
      expect(spot.style.height).toBe("44px");
    });
  });

  it("remeasures on window resize to track non-default sizes", async () => {
    const node = document.createElement("button");
    node.setAttribute("data-guide", "chat");
    document.body.appendChild(node);
    stubRect(node, { top: 10, left: 10, width: 50, height: 20 });

    render(
      <LocaleProvider>
        <Onboarding open onSkip={() => {}} onDismiss={() => {}} onStep={() => {}} />
      </LocaleProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("guide-spot").style.top).toBe("8px"));

    stubRect(node, { top: 120, left: 200, width: 90, height: 40 });
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() => {
      const spot = screen.getByTestId("guide-spot");
      expect(spot.style.top).toBe("112px");
      expect(spot.style.left).toBe("192px");
      expect(spot.style.width).toBe("106px");
      expect(spot.style.height).toBe("56px");
    });
  });

  it("tracks miao-drop after advancing to step 3", async () => {
    localStorage.setItem("tailcat-locale", "en");
    const user = userEvent.setup();
    const onStep = vi.fn();
    render(
      <LocaleProvider>
        <Onboarding open onSkip={() => {}} onDismiss={() => {}} onStep={onStep} />
      </LocaleProvider>,
    );

    const chat = document.createElement("button");
    chat.setAttribute("data-guide", "chat");
    document.body.appendChild(chat);
    stubRect(chat, { top: 10, left: 10, width: 40, height: 20 });
    await waitFor(() => expect(screen.getByTestId("guide-spot")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onStep).toHaveBeenCalledWith(2);

    const drop = document.createElement("div");
    drop.setAttribute("data-guide", "miao-drop");
    document.body.appendChild(drop);
    stubRect(drop, { top: 220, left: 180, width: 260, height: 120 });

    await waitFor(() => {
      const spot = screen.getByTestId("guide-spot");
      expect(spot.style.top).toBe("212px");
      expect(spot.style.left).toBe("172px");
      expect(spot.style.width).toBe("276px");
      expect(spot.style.height).toBe("136px");
    });
  });
});