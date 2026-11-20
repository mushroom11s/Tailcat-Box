import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "../i18n";
import { forgetDevice, listShareDevices, rememberDevice, renameDevice, writeDeviceBook } from "../lib/remoteDevices";
import RemotePage from "./RemotePage";

afterEach(() => {
  localStorage.removeItem("tailcat-remote-recent");
  localStorage.removeItem("tailcat-remote-visitors");
  localStorage.removeItem("tailcat-remote-controlled");
  localStorage.removeItem("tailcat-remote-mine");
  localStorage.removeItem("tailcat-remote-hosts");
  localStorage.removeItem("tailcat-remote-trust");
  localStorage.removeItem("tailcat-remote-history");
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

describe("remote control", () => {
  it("keeps a device at the front and drops it", () => {
    const first = rememberDevice([], "tc:desk", 1);
    const named = renameDevice(first, "tc:desk", "书房");
    const second = rememberDevice(named, "tc:play", 2);
    const again = rememberDevice(second, "tc:desk", 3);
    expect(again.map((item) => item.address)).toEqual(["tc:desk", "tc:play"]);
    expect(again[0]?.name).toBe("书房");
    expect(forgetDevice(again, "tc:play").map((item) => item.address)).toEqual(["tc:desk"]);
  });

  it("remembers a Tailcat address without usage tabs", async () => {
    const user = userEvent.setup();
    localStorage.setItem("tailcat-locale", "zh-CN");
    renderPage();

    expect(screen.getByRole("heading", { name: "远程控制" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "开启远程控制" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "连接设备" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "连接此电脑" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "控制过的设备" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "我的设备" })).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    const share = screen.getByRole("region", { name: "开启远程控制" });
    const connect = screen.getByRole("region", { name: "连接设备" });
    expect(within(connect).queryByText("设备地址")).toBeNull();
    expect(within(share).queryByText("打开后把二维码发给对方，对方就能看到并操作这台电脑。")).toBeNull();
    await user.click(within(share).getByRole("button", { name: "说明" }));
    expect(await screen.findByText("打开后把二维码发给对方，对方就能看到并操作这台电脑。")).toBeTruthy();

    const field = screen.getByRole("textbox", { name: /设备地址/ });
    await user.type(field, "not-an-address");
    await user.click(screen.getByRole("button", { name: "保存至我的设备" }));
    expect(screen.getByRole("alert").textContent).toBe("这不是有效的 Tailcat 地址。");

    await user.clear(field);
    await user.type(field, "tc:home");
    await user.click(screen.getByRole("button", { name: "保存至我的设备" }));
    expect(screen.queryByRole("alert")).toBeNull();
    const mine = screen.getByRole("region", { name: "我的设备" });
    expect(within(mine).getByText("tc:home")).toBeTruthy();
    expect(within(mine).getByText("tc:home").closest("button")).toBeNull();
    expect(within(mine).getByRole("button", { name: "连接" })).toBeTruthy();
    expect(within(mine).getByRole("button", { name: "信任" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "连接此电脑" })).queryByRole("button", { name: "信任" })).toBeNull();
    expect(within(screen.getByRole("region", { name: "控制过的设备" })).queryByRole("button", { name: "信任" })).toBeNull();
    const name = within(mine).getByRole("textbox", { name: /名称/ });
    await user.type(name, "家里");
    expect((name as HTMLInputElement).value).toBe("家里");
    expect(document.querySelector(".remote-os")).toBeTruthy();
    expect(screen.queryByText("远程办公")).toBeNull();
    expect(screen.queryByText("远程游戏")).toBeNull();
    expect(screen.queryByText("远程协助")).toBeNull();
    expect(within(mine).queryByText("还没有我的设备")).toBeNull();

    await user.click(within(mine).getByRole("button", { name: "移除" }));
    expect(within(mine).getByText("还没有我的设备")).toBeTruthy();

    const toggle = within(share).getByRole("switch", { name: "开启远程控制" });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    expect(within(share).queryByText("中继")).toBeNull();
    await user.click(within(share).getByRole("radio", { name: "长期控制码" }));
    await user.click(toggle);
    expect(within(share).getByRole("alert").textContent).toBe("先选择或创建一把密钥。");
    expect(within(screen.getByRole("region", { name: "连接设备" })).queryByRole("alert")).toBeNull();
    expect(within(share).queryByRole("combobox", { name: "中继" })).toBeNull();
    await user.click(within(share).getByRole("radio", { name: "临时控制码" }));
    await user.click(toggle);
    const relay = await within(share).findByRole("combobox", { name: "中继" });
    expect(screen.queryByText("连接码")).toBeNull();
    await user.click(relay);
    expect(await screen.findByRole("button", { name: "官方中继" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "扫描节点" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "扫描节点" }));
    expect(await screen.findByText("还没有扫描到节点")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "已创建的连接" })).toBeNull();
    expect(screen.queryByRole("button", { name: "永久" })).toBeNull();

    await user.keyboard("{Escape}");
    await user.click(within(share).getByRole("radio", { name: "长期控制码" }));
    expect(within(share).getByRole("alert").textContent).toBe("先选择或创建一把密钥。");
    expect(within(share).queryByRole("combobox", { name: "中继" })).toBeNull();
    expect(within(share).queryByRole("img", { name: "远程控制二维码" })).toBeNull();
    expect((toggle as HTMLInputElement).checked).toBe(false);
  });

  it("hides end once the guest session is over", async () => {
    const user = userEvent.setup();
    localStorage.setItem("tailcat-locale", "zh-CN");
    renderPage();
    const connect = screen.getByRole("region", { name: "连接设备" });
    expect(within(connect).queryByRole("button", { name: "结束" })).toBeNull();
    await user.type(within(connect).getByRole("textbox", { name: /设备地址/ }), "tc:home");
    await user.click(within(connect).getByRole("button", { name: "连接" }));
    expect(await within(connect).findByRole("button", { name: "结束" })).toBeTruthy();
    await user.click(within(connect).getByRole("button", { name: "结束" }));
    expect(within(connect).queryByRole("button", { name: "结束" })).toBeNull();
    expect(within(connect).queryByText("等待对方允许…")).toBeNull();
  });

  it("draws the lasting code again after a temporary detour and a restart", async () => {
    const user = userEvent.setup();
    localStorage.setItem("tailcat-locale", "zh-CN");
    renderPage();
    const share = screen.getByRole("region", { name: "开启远程控制" });
    const qrName = "远程控制二维码";
    await user.click(within(share).getByRole("radio", { name: "长期控制码" }));
    await user.type(within(share).getByRole("textbox", { name: "密钥名称" }), "home");
    await user.click(within(share).getByRole("button", { name: "创建密钥" }));
    await user.click(within(share).getByRole("switch", { name: "开启远程控制" }));
    expect(await within(share).findByRole("img", { name: qrName })).toBeTruthy();

    await user.click(within(share).getByRole("radio", { name: "临时控制码" }));
    expect(await within(share).findByRole("img", { name: qrName })).toBeTruthy();
    await user.click(within(share).getByRole("radio", { name: "长期控制码" }));
    expect(await within(share).findByRole("img", { name: qrName })).toBeTruthy();

    const toggle = within(share).getByRole("switch", { name: "开启远程控制" });
    await user.click(toggle);
    expect(within(share).queryByRole("img", { name: qrName })).toBeNull();
    await user.click(toggle);
    expect(await within(share).findByRole("img", { name: qrName })).toBeTruthy();
  });

  it("shares relay nodes only from my devices", () => {
    writeDeviceBook("mine", [{ address: "tc:mine", name: "书房", os: "", at: 1 }]);
    writeDeviceBook("visitors", [{ address: "tc:visitor", name: "客人", os: "", at: 2 }]);
    writeDeviceBook("controlled", [{ address: "tc:controlled", name: "对方", os: "", at: 3 }]);
    expect(listShareDevices()).toEqual([{ address: "tc:mine", label: "书房" }]);
  });

  it("pages connection history after six records", () => {
    localStorage.setItem("tailcat-locale", "zh-CN");
    localStorage.setItem(
      "tailcat-remote-history",
      JSON.stringify(
        Array.from({ length: 7 }, (_, i) => ({
          address: `tc:h${6 - i}`,
          name: "",
          os: "",
          at: 1_700_000_000_000 + i,
          dir: "in",
        })),
      ),
    );
    renderPage();
    const history = screen.getByRole("region", { name: "连接历史" });
    expect(within(history).getByText("第 1/2 页 · 共 7 条")).toBeTruthy();
    expect(within(history).getByText("tc:h6")).toBeTruthy();
    expect(within(history).queryByText("tc:h0")).toBeNull();
  });
});
