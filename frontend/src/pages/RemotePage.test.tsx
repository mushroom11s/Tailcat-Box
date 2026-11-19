import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../i18n";
import { emitBrowserEvent } from "../lib/wails";
import RemotePage, { forgetRemote, rememberRemote } from "./RemotePage";

afterEach(() => {
  localStorage.removeItem("tailcat-remote-recent");
  localStorage.removeItem("tailcat-remote-trust");
  localStorage.removeItem("tailcat-locale");
  delete (window as { go?: unknown }).go;
  cleanup();
});

function renderPage() {
  return render(
    <LocaleProvider>
      <RemotePage />
    </LocaleProvider>,
  );
}

describe("remote control menu", () => {
  it("keeps a device at the front and drops it", () => {
    const first = rememberRemote([], "tc:desk", "desk", 1);
    const second = rememberRemote(first, "tc:play", "play", 2);
    const again = rememberRemote(second, "tc:desk", "assist", 3);
    expect(again.map((item) => item.address)).toEqual(["tc:desk", "tc:play"]);
    expect(again[0]?.mode).toBe("assist");
    expect(forgetRemote(again, "tc:play").map((item) => item.address)).toEqual(["tc:desk"]);
  });

  it("switches the three uses and remembers a Tailcat address", async () => {
    const user = userEvent.setup();
    localStorage.setItem("tailcat-locale", "zh-CN");
    renderPage();

    expect(screen.getByRole("heading", { name: "远程控制" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /远程办公/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("在这边操作对方的屏幕。")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: /远程游戏/ }));
    expect(screen.getByText("用来连自己的电脑。")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /远程协助/ }).getAttribute("aria-selected")).toBe("false");

    await user.click(screen.getByRole("tab", { name: /远程协助/ }));
    const field = screen.getByLabelText("对方的 Tailcat 地址");
    await user.type(field, "not-an-address");
    await user.click(screen.getByRole("button", { name: "记下这台" }));
    expect(screen.getByRole("alert").textContent).toBe("这不是 Tailcat 地址。");

    await user.clear(field);
    await user.type(field, "tc:home");
    await user.click(screen.getByRole("button", { name: "记下这台" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("tc:home")).toBeTruthy();
    expect(screen.getAllByText("远程协助").length).toBeGreaterThan(1);
    expect(screen.queryByText("还没有记过的设备。")).toBeNull();

    await user.click(screen.getByRole("button", { name: "移除" }));
    expect(screen.getByText("还没有记过的设备。")).toBeTruthy();
  });

  it("allows a trusted computer without another click", async () => {
    const allow = vi.fn().mockResolvedValue(undefined);
    Object.assign(window, { go: { main: { App: { AllowRemote: allow } } } });
    localStorage.setItem("tailcat-locale", "zh-CN");
    localStorage.setItem("tailcat-remote-trust", JSON.stringify(["tc:home"]));
    renderPage();
    emitBrowserEvent({
      SessionID: "remote",
      Kind: "remote",
      Data: JSON.stringify({ role: "host", state: "incoming", peer: "tc:home", mode: "assist" }),
    });
    await waitFor(() => {
      expect(allow).toHaveBeenCalledOnce();
    });
    expect(screen.queryByRole("button", { name: "允许" })).toBeNull();
  });

  it("asks before a computer that is only remembered", async () => {
    const allow = vi.fn().mockResolvedValue(undefined);
    Object.assign(window, { go: { main: { App: { AllowRemote: allow } } } });
    localStorage.setItem("tailcat-locale", "zh-CN");
    renderPage();
    emitBrowserEvent({
      SessionID: "remote",
      Kind: "remote",
      Data: JSON.stringify({ role: "host", state: "incoming", peer: "tc:new", mode: "desk" }),
    });
    expect(await screen.findByRole("button", { name: "允许" })).toBeTruthy();
    expect(allow).not.toHaveBeenCalled();
  });
});
