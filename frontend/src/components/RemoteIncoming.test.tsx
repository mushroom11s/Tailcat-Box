import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../i18n";
import { emitBrowserEvent } from "../lib/wails";
import RemoteIncoming from "./RemoteIncoming";

afterEach(() => {
  localStorage.removeItem("tailcat-remote-trust");
  localStorage.removeItem("tailcat-locale");
  delete (window as { go?: unknown }).go;
  vi.unstubAllGlobals();
  cleanup();
});

function renderAsk() {
  localStorage.setItem("tailcat-locale", "zh-CN");
  return render(
    <LocaleProvider>
      <RemoteIncoming />
    </LocaleProvider>,
  );
}

describe("remote connection request window", () => {
  it("allows a trusted computer without opening a window", async () => {
    const allow = vi.fn().mockResolvedValue(undefined);
    const open = vi.fn();
    vi.stubGlobal("open", open);
    Object.assign(window, { go: { main: { App: { AllowRemote: allow } } } });
    localStorage.setItem("tailcat-remote-trust", JSON.stringify(["tc:home"]));
    renderAsk();
    emitBrowserEvent({
      SessionID: "remote",
      Kind: "remote",
      Data: JSON.stringify({ role: "host", state: "incoming", peer: "tc:home", mode: "assist" }),
    });
    await waitFor(() => {
      expect(allow).toHaveBeenCalledOnce();
    });
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens its own window for a computer that is not trusted", async () => {
    const allow = vi.fn().mockResolvedValue(undefined);
    const popup = document.implementation.createHTMLDocument("ask");
    const opened = { document: popup, close: vi.fn(), closed: false } as unknown as Window;
    const open = vi.fn(() => opened);
    vi.stubGlobal("open", open);
    Object.assign(window, { go: { main: { App: { AllowRemote: allow, DenyRemote: vi.fn() } } } });
    renderAsk();
    emitBrowserEvent({
      SessionID: "remote",
      Kind: "remote",
      Data: JSON.stringify({ role: "host", state: "incoming", peer: "tc:new", mode: "desk" }),
    });
    await waitFor(() => {
      expect(open).toHaveBeenCalled();
    });
    expect(popup.body.textContent).toContain("tc:new");
    expect(popup.body.textContent).toContain("允许");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(allow).not.toHaveBeenCalled();
    emitBrowserEvent({
      SessionID: "remote",
      Kind: "remote",
      Data: JSON.stringify({ role: "host", state: "incoming", peer: "tc:new", mode: "desk", peerPath: "checking" }),
    });
    await waitFor(() => {
      expect(open).toHaveBeenCalledOnce();
    });
    expect(opened.close).not.toHaveBeenCalled();
  });

  it("uses a dialog when the webview blocks the popup", async () => {
    vi.stubGlobal("open", vi.fn(() => null));
    const allow = vi.fn().mockResolvedValue(undefined);
    Object.assign(window, { go: { main: { App: { AllowRemote: allow, DenyRemote: vi.fn() } } } });
    renderAsk();
    emitBrowserEvent({
      SessionID: "remote",
      Kind: "remote",
      Data: JSON.stringify({ role: "host", state: "incoming", peer: "tc:new", mode: "desk" }),
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "允许" }));
    expect(allow).toHaveBeenCalledOnce();
  });
});
