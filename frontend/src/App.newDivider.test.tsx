import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { LocaleProvider } from "./i18n";
import { listSessions, resetBrowserRooms, resetTrayUnreadForTests, sendChatText, trayUnreadForTests } from "./lib/wails";

let focused = true;

function openChatNav() {
  fireEvent.click(document.querySelector(".nav-chat > .nav-btn") as HTMLElement);
}

async function roomId(): Promise<string> {
  const chats = (await listSessions()).filter((item) => item.Kind === "chat");
  return chats[0]?.ID ?? "";
}

function divider(): HTMLElement | null {
  return screen.queryByRole("separator", { name: "New messages" });
}

// The divider's previous row is the message I sent just before the unread echo.
function above(): string {
  return divider()?.previousElementSibling?.textContent ?? "";
}

beforeEach(() => {
  resetBrowserRooms();
  resetTrayUnreadForTests();
  localStorage.setItem("tailcat-locale", "en");
  focused = true;
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("new messages divider in rooms", () => {
  it("marks the first unread on return and keeps it until the next unread visit", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <App />
      </LocaleProvider>,
    );
    openChatNav();
    await user.type(screen.getByLabelText("Peer address (optional)"), "tc:fake-echo");
    await user.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByRole("button", { name: "Show room details" });
    const id = await roomId();

    // Read on arrival while viewing the room: no divider.
    await user.type(screen.getByLabelText("Message"), "hi");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("echo");
    expect(divider()).toBeNull();

    // Arrives while on another page: unread, divider on return.
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await act(async () => {
      await sendChatText(id, "away", false, 0);
    });
    await waitFor(() => expect(trayUnreadForTests()).toBe(true));
    openChatNav();
    await waitFor(() => expect(divider()).toBeTruthy());
    expect(above()).toContain("away");
    expect(divider()?.nextElementSibling?.textContent).toContain("echo");
    expect(trayUnreadForTests()).toBe(false);

    // More messages while reading do not move it.
    await user.type(screen.getByLabelText("Message"), "here");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getAllByText("echo")).toHaveLength(3));
    expect(above()).toContain("away");

    // Leaving and coming back with nothing new keeps the same spot.
    await user.click(screen.getByRole("button", { name: "Settings" }));
    openChatNav();
    await waitFor(() => expect(divider()).toBeTruthy());
    expect(above()).toContain("away");

    // Unfocused window: unread, and the divider moves when focus returns.
    focused = false;
    await act(async () => {
      await sendChatText(id, "blurred", false, 0);
    });
    await waitFor(() => expect(screen.getAllByText("echo")).toHaveLength(4));
    expect(above()).toContain("away");
    focused = true;
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(above()).toContain("blurred"));
    expect(screen.getAllByRole("separator", { name: "New messages" })).toHaveLength(1);
  });
});
