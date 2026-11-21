import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../i18n";
import { ToastProvider } from "../components/toasts";
import * as migrate from "../lib/configMigrate";
import ExportPage from "./ExportPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

function renderPage() {
  localStorage.setItem("tailcat-locale", "zh-CN");
  localStorage.setItem("tailcat-nickname", "Mochi");
  return render(
    <LocaleProvider>
      <ToastProvider>
        <ExportPage />
      </ToastProvider>
    </LocaleProvider>,
  );
}

describe("export config page", () => {
  it("saves the current setup and can import it back", async () => {
    const user = userEvent.setup();
    const exportConfig = vi.spyOn(migrate, "exportConfig").mockResolvedValue("D:\\tailcat-box-config.json");
    const importConfig = vi.spyOn(migrate, "importConfig").mockImplementation(async () => {
      localStorage.setItem("tailcat-nickname", "Nori");
      return { "tailcat-nickname": "Nori" };
    });
    const reloadWindow = vi.spyOn(migrate, "reloadWindow").mockImplementation(() => {});
    renderPage();

    expect(screen.getByRole("heading", { name: "导出配置" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "导出到文件" }));
    expect(exportConfig).toHaveBeenCalledOnce();
    expect(await screen.findByText("已导出。")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "从文件导入" }));
    expect(screen.getByRole("dialog", { name: "导入配置" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "导入" }));
    expect(importConfig).toHaveBeenCalledOnce();
    expect(reloadWindow).toHaveBeenCalledOnce();
    expect(localStorage.getItem("tailcat-nickname")).toBe("Nori");
  });
});
