import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../i18n";
import { emitBrowserEvent } from "../lib/wails";
import DerpSuggest from "./DerpSuggest";
import { ToastProvider } from "./toasts";

const shanghai = { regionId: 901, name: "Shanghai", host: "1.2.3.4", port: 443, latencyMs: 38 };

afterEach(() => {
  localStorage.removeItem("tailcat-locale");
  delete (window as { go?: unknown }).go;
  cleanup();
});

function renderSuggest() {
  localStorage.setItem("tailcat-locale", "zh-CN");
  return render(
    <LocaleProvider>
      <ToastProvider>
        <DerpSuggest />
      </ToastProvider>
    </LocaleProvider>,
  );
}

function emitDerp(payload: unknown) {
  act(() => {
    emitBrowserEvent({ SessionID: "derp", Kind: "derp", Data: JSON.stringify(payload) });
  });
}

describe("faster relay prompt", () => {
  it("offers a faster relay and switches when accepted", async () => {
    const use = vi.fn().mockResolvedValue({ mode: "scan", candidates: [shanghai] });
    Object.assign(window, { go: { main: { App: { UseDERPRegion: use } } } });
    renderSuggest();
    emitDerp({ type: "suggest", candidate: shanghai, baselineMs: 210 });

    const dialog = await screen.findByRole("dialog", { name: "发现更快的中继" });
    expect(dialog.textContent).toContain("Shanghai 的中继延迟约 38 毫秒，当前约 210 毫秒");
    await userEvent.setup().click(screen.getByRole("button", { name: "切换" }));
    expect(use).toHaveBeenCalledWith(901);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("status").textContent).toContain("已切换到 Shanghai 的中继。");
  });

  it("mutes the relay when the user says not now", async () => {
    const dismiss = vi.fn().mockResolvedValue(undefined);
    Object.assign(window, { go: { main: { App: { DismissDERPSuggestion: dismiss } } } });
    renderSuggest();
    emitDerp({ type: "suggest", candidate: shanghai, baselineMs: -1 });
    expect((await screen.findByRole("dialog")).textContent).toContain("官方中继目前无法连接");
    await userEvent.setup().click(screen.getByRole("button", { name: "以后再说" }));
    expect(dismiss).toHaveBeenCalledWith(901);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("tells the user when a dead relay falls back to the official one", async () => {
    renderSuggest();
    emitDerp({ type: "switched", reason: "down" });
    expect((await screen.findByRole("status")).textContent).toContain("已换回官方中继");
  });
});
