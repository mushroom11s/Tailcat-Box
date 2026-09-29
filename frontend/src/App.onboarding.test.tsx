import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { LocaleProvider } from "./i18n";
import { ONBOARDING_SEEN_KEY } from "./lib/onboarding";

afterEach(() => {
  cleanup();
  localStorage.removeItem(ONBOARDING_SEEN_KEY);
  localStorage.removeItem("tailcat-locale");
  vi.restoreAllMocks();
});

function renderApp() {
  return render(
    <LocaleProvider>
      <App />
    </LocaleProvider>,
  );
}

function stubGuideRect(selector: string, rect: Partial<DOMRect>) {
  const el = document.querySelector(selector);
  if (!el) {
    throw new Error(`missing ${selector}`);
  }
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    top: rect.top ?? 0,
    left: rect.left ?? 0,
    bottom: (rect.top ?? 0) + (rect.height ?? 0),
    right: (rect.left ?? 0) + (rect.width ?? 0),
    width: rect.width ?? 40,
    height: rect.height ?? 24,
    toJSON() {
      return this;
    },
  } as DOMRect);
  return el;
}

describe("first-run onboarding", () => {
  it("walks three steps, and Skip leaves it for the next launch", async () => {
    localStorage.setItem("tailcat-locale", "en");
    localStorage.setItem(ONBOARDING_SEEN_KEY, "0");
    const user = userEvent.setup();
    const view = renderApp();
    const dialog = await screen.findByRole("dialog", { name: "Share your address" });
    expect(dialog.textContent).toContain("1 / 3");
    expect(dialog.textContent).not.toMatch(/DERP/i);
    expect(document.querySelector("[data-guide='chat']")).toBeTruthy();
    stubGuideRect("[data-guide='chat']", { top: 40, left: 16, width: 100, height: 32 });
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    await waitFor(() => expect(document.querySelector(".guide-spot")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("dialog", { name: "Join or create a room" })).toBeTruthy();
    expect(document.querySelector("[data-guide='new-room']")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("dialog", { name: "Mew Share pickup codes" }).textContent).toContain("pickup code");
    await waitFor(() => expect(document.querySelector("[data-guide='miao-drop']")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("dialog", { name: "Join or create a room" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(ONBOARDING_SEEN_KEY)).toBe("0");
    view.unmount();
    renderApp();
    expect(await screen.findByRole("dialog", { name: "Share your address" })).toBeTruthy();
  });

  it("hides for good after Don't show again, and Settings can open it again", async () => {
    localStorage.setItem("tailcat-locale", "zh-CN");
    localStorage.setItem(ONBOARDING_SEEN_KEY, "0");
    const user = userEvent.setup();
    const view = renderApp();
    expect((await screen.findByRole("dialog")).textContent).toContain("把我的地址发给对方");
    await user.click(screen.getByRole("button", { name: "不再显示" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(ONBOARDING_SEEN_KEY)).toBe("1");
    view.unmount();
    renderApp();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "设置" }));
    await user.click(screen.getByRole("button", { name: "使用引导" }));
    expect(screen.getByRole("dialog", { name: "把我的地址发给对方" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("dialog").textContent).toContain("取件码");
    await user.click(screen.getByRole("button", { name: "知道了" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("spotlight remasures to the target rect after resize and page switch", async () => {
    localStorage.setItem("tailcat-locale", "en");
    localStorage.setItem(ONBOARDING_SEEN_KEY, "0");
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0) as unknown as number,
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("dialog", { name: "Share your address" });

    stubGuideRect("[data-guide='chat']", { top: 64, left: 18, width: 120, height: 36 });
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    await waitFor(() => {
      const spot = document.querySelector(".guide-spot") as HTMLElement;
      expect(spot).toBeTruthy();
      expect(spot.style.top).toBe("56px");
      expect(spot.style.left).toBe("10px");
      expect(spot.style.width).toBe("136px");
      expect(spot.style.height).toBe("52px");
    });

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(document.querySelector("[data-guide='miao-drop']")).toBeTruthy());
    stubGuideRect("[data-guide='miao-drop']", { top: 200, left: 300, width: 240, height: 100 });
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    await waitFor(() => {
      const spot = document.querySelector(".guide-spot") as HTMLElement;
      expect(spot.style.top).toBe("192px");
      expect(spot.style.left).toBe("292px");
      expect(spot.style.width).toBe("256px");
      expect(spot.style.height).toBe("116px");
    });
  });
});