import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../i18n";
import DerpScanPanel from "./DerpScanPanel";

const base = {
  country: "CN",
  mode: "scan" as const,
  active: { regionId: 901, name: "Shanghai", host: "1.2.3.4", port: 443, latencyMs: 38 },
  candidates: [{ regionId: 901, name: "Shanghai", host: "1.2.3.4", port: 443, latencyMs: 38 }],
  officialMs: 210,
  scannedAt: "2026-11-20T04:00:00Z",
  scanning: false,
  auto: true,
  error: "",
  engines: ["quake"],
  keys: [{ engine: "quake", index: 0, hint: "••••ee12", quota: "积分 1200" }],
  hasKey: true,
};

afterEach(() => {
  localStorage.removeItem("tailcat-locale");
  localStorage.removeItem("tailcat-derp-scan-open");
  delete (window as { go?: unknown }).go;
  cleanup();
});

describe("relay scan panel", () => {
  it("stays collapsed with a summary and expands to manage keys", async () => {
    const add = vi.fn().mockResolvedValue({
      ...base,
      keys: [...base.keys, { engine: "quake", index: 1, hint: "••••9999" }],
    });
    Object.assign(window, {
      go: {
        main: {
          App: {
            DERPStatus: vi.fn().mockResolvedValue(base),
            AddDERPKey: add,
            RemoveDERPKey: vi.fn(),
            RefreshDERPQuotas: vi.fn().mockResolvedValue(base),
            SetDERPAuto: vi.fn().mockResolvedValue(base),
          },
        },
      },
    });
    localStorage.setItem("tailcat-locale", "zh-CN");
    render(
      <LocaleProvider>
        <DerpScanPanel customMap={false} />
      </LocaleProvider>,
    );

    expect(await screen.findByText("就近中继加速")).toBeTruthy();
    expect(screen.getByText("Shanghai")).toBeTruthy();
    expect(screen.getByText("38 毫秒")).toBeTruthy();
    expect(screen.getByText("中国大陆")).toBeTruthy();
    expect(screen.getByText("1 个 Key")).toBeTruthy();
    expect(screen.queryByPlaceholderText("粘贴新的 API Key")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "展开就近中继设置" }));
    expect(await screen.findByText("••••ee12")).toBeTruthy();
    expect(localStorage.getItem("tailcat-derp-scan-open")).toBe("1");
    expect(document.querySelector(".derp-latency .status-dot:not(.bad)")).toBeTruthy();

    const inputs = screen.getAllByPlaceholderText("粘贴新的 API Key");
    await userEvent.type(inputs[3], "second-quake-key");
    await userEvent.click(screen.getAllByRole("button", { name: "添加" })[3]);
    await waitFor(() => expect(add).toHaveBeenCalledWith("quake", "second-quake-key"));
  });

  it("pages the relay list and marks slow relays red", async () => {
    const many = {
      ...base,
      candidates: Array.from({ length: 7 }, (_, i) => ({
        regionId: 900 + i,
        name: `Relay-${i}`,
        host: `1.2.3.${i}`,
        port: 443,
        latencyMs: i === 0 ? 38 : 180 + i,
      })),
    };
    Object.assign(window, {
      go: {
        main: {
          App: {
            DERPStatus: vi.fn().mockResolvedValue(many),
            RefreshDERPQuotas: vi.fn().mockResolvedValue(many),
            SetDERPAuto: vi.fn().mockResolvedValue(many),
          },
        },
      },
    });
    localStorage.setItem("tailcat-locale", "zh-CN");
    localStorage.setItem("tailcat-derp-scan-open", "1");
    render(
      <LocaleProvider>
        <DerpScanPanel customMap={false} />
      </LocaleProvider>,
    );

    expect(await screen.findByText("Relay-0")).toBeTruthy();
    expect(screen.getByText("Relay-4")).toBeTruthy();
    expect(screen.queryByText("Relay-5")).toBeNull();
    expect(screen.getByText("第 1/2 页 · 共 7 条")).toBeTruthy();
    expect(document.querySelectorAll(".derp-latency .status-dot.bad").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(await screen.findByText("Relay-5")).toBeTruthy();
    expect(screen.getByText("Relay-6")).toBeTruthy();
    expect(screen.queryByText("Relay-0")).toBeNull();
    expect(screen.getByText("第 2/2 页 · 共 7 条")).toBeTruthy();
  });

  it("pages a platform once it has two API keys and keeps add on the last page", async () => {
    const keys = [
      { engine: "quake", index: 0, hint: "key-a", quota: "1" },
      { engine: "quake", index: 1, hint: "key-b", quota: "2" },
    ];
    const status = { ...base, keys, candidates: base.candidates };
    Object.assign(window, {
      go: {
        main: {
          App: {
            DERPStatus: vi.fn().mockResolvedValue(status),
            RefreshDERPQuotas: vi.fn().mockResolvedValue(status),
            SetDERPAuto: vi.fn().mockResolvedValue(status),
          },
        },
      },
    });
    localStorage.setItem("tailcat-locale", "zh-CN");
    localStorage.setItem("tailcat-derp-scan-open", "1");
    render(
      <LocaleProvider>
        <DerpScanPanel customMap={false} />
      </LocaleProvider>,
    );

    expect(await screen.findByText("key-a")).toBeTruthy();
    expect(screen.getByText("key-b")).toBeTruthy();
    expect(document.getElementById("derp-key-quake")).toBeNull();
    expect(screen.getByText("第 1/2 页 · 共 2 条")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "360 Quake 下一页" }));
    expect(screen.queryByText("key-a")).toBeNull();
    expect(screen.queryByText("key-b")).toBeNull();
    expect(document.getElementById("derp-key-quake")).toBeTruthy();
    expect(screen.getByText("第 2/2 页 · 共 2 条")).toBeTruthy();
  });
});
