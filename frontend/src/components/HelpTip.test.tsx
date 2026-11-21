import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "../i18n";
import HelpTip from "./HelpTip";

afterEach(() => {
  localStorage.removeItem("tailcat-locale");
  cleanup();
});

describe("help tip", () => {
  it("hides copy until the question mark is pressed", async () => {
    localStorage.setItem("tailcat-locale", "zh-CN");
    render(
      <LocaleProvider>
        <HelpTip>这是灰色说明</HelpTip>
      </LocaleProvider>,
    );
    expect(screen.queryByText("这是灰色说明")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "说明" }));
    expect(screen.getByText("这是灰色说明")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("这是灰色说明")).toBeNull();
  });
});
