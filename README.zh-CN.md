<p align="center">
  <img src="docs/assets/icon.png" alt="猫砂盆" width="128" />
</p>

<h1 align="center">猫砂盆 Tailcat Box <img src="docs/assets/loading-cat.gif" alt="" height="28" /></h1>

<p align="center">
  基于 <a href="https://github.com/tailscale/tailcat">Tailscale Tailcat</a> 的跨平台桌面客户端：两台电脑之间聊天、通话、传文件、做端口穿透，不用注册账号，也不用自己搭服务器。
</p>

<p align="center">
  <a href="https://github.com/mushroom11s/tailcat-box/releases/latest"><img src="https://img.shields.io/github/v/release/mushroom11s/tailcat-box" alt="最新版本" /></a>
  <a href="https://github.com/mushroom11s/tailcat-box/actions/workflows/ci.yml"><img src="https://github.com/mushroom11s/tailcat-box/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue" alt="许可证：PolyForm Noncommercial 1.0.0" /></a>
  <img src="https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" alt="平台：Windows、macOS、Linux" />
  <a href="https://t.me/+YCUAoqBJ_ZIyZGVh"><img src="https://img.shields.io/badge/Telegram-群聊-2CA5E0?logo=telegram&logoColor=white" alt="Telegram 群" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> | 简体中文
</p>

---

## 简介

猫砂盆（英文名 Tailcat Box）把 [Tailcat](https://github.com/tailscale/tailcat) 做成了 Windows、macOS 和 Linux 上的桌面应用。Tailcat 给每个端点分配一个 `tc…` 地址，通过 Tailscale 的 DERP 中继把两端连起来，网络条件允许时会自动切到直连。猫砂盆在此基础上提供一对一聊天和音视频通话、点对点传文件、TCP 端口穿透，以及可选的内置 SSH。

应用用 [Wails](https://wails.io) v2 开发（后端 Go，前端 React + TypeScript），内置 `github.com/tailscale/tailcat` **v0.7.0**。当前正式版为 **[v1.3.0](https://github.com/mushroom11s/tailcat-box/releases/tag/v1.3.0)**。

## 主要功能

- **聊天**：开一个房间，把 Tailcat 地址发给对方（文字、二维码或粘贴二维码图片都行），就能互发文字、文件和语音消息，也支持阅后即焚。最多可以同时开 8 个房间。
- **语音、视频和共享屏幕**：来电会先响铃，由你接听或拒绝，60 秒没人接自动结束。对方共享的屏幕可以单独开一个系统窗口，按原始分辨率显示。
- **通话记录**：通话结束后，双方的对话里都会留一条记录，写明通话时长，或者已拒绝、已取消、未接听、通话失败。
- **喵传**：点对点传文件，用取件码或二维码收取。可以同时开多份分享，每份单独设置有效期和下载次数。
- **穿透**：把本机的 TCP 端口挂到 Tailcat 地址上，也可以挂局域网里其他机器的端口；或者把对方的端口转到本机。用已保存的密钥，重启后地址不变。
- **SSH**：默认关闭。用的是 Tailcat 自带的 shell，不是系统 `sshd`，只允许名单里的设备连接。
- **后台常驻**：关闭窗口只是收到托盘，房间、分享和穿透都继续运行，也可以设置开机时启动。
- **细节**：浅色、深色主题，中英文界面，应用内检查更新，可选接收 Beta 版本。

## 截图

<table>
  <tr>
    <td align="center" valign="top" width="50%">
      <img src="docs/assets/demo/miao-packing.png" alt="喵传正在把文件打包成一份分享" width="100%" /><br />
      <sub>喵传：准备分享</sub>
    </td>
    <td align="center" valign="top" width="50%">
      <img src="docs/assets/demo/miao-qr.png" alt="分享卡片上的二维码" width="100%" /><br />
      <sub>喵传：取件码和二维码</sub>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="50%">
      <img src="docs/assets/demo/miao-running.png" alt="下载进度" width="100%" /><br />
      <sub>喵传：下载中</sub>
    </td>
    <td align="center" valign="top" width="50%">
      <img src="docs/assets/demo/qr-scan.png" alt="扫码对话框，可以用摄像头、图片或粘贴" width="100%" /><br />
      <sub>扫码：摄像头、图片或剪贴板</sub>
    </td>
  </tr>
</table>

## 下载

到 [GitHub Releases](https://github.com/mushroom11s/tailcat-box/releases/latest) 下载最新版本。v1.3.0 的文件如下：

| 平台 | 架构 | 文件 | 说明 |
| --- | --- | --- | --- |
| Windows 10/11 | x64 | `tailcat-box-windows-amd64-installer-v1.3.0.exe` | 安装版（推荐） |
| | ARM64 | `tailcat-box-windows-arm64-installer-v1.3.0.exe` | 安装版（推荐） |
| | x64 | `tailcat-box-windows-amd64-v1.3.0.exe` | 便携版，无需安装 |
| | ARM64 | `tailcat-box-windows-arm64-v1.3.0.exe` | 便携版，无需安装 |
| macOS | Apple 芯片 | `tailcat-box-macos-arm64-v1.3.0.dmg` | 磁盘映像 |
| | Intel | `tailcat-box-macos-amd64-v1.3.0.dmg` | 磁盘映像 |
| Linux | x64 | `tailcat-box-linux-amd64-v1.3.0.deb` | Debian / Ubuntu 安装包 |
| | x64 | `tailcat-box-linux-amd64-v1.3.0.tar.gz` | 通用压缩包 |
| | x64 | `tailcat-box-linux-amd64-v1.3.0-full.tar.gz` | 完整版压缩包，自带支持通话和共享屏幕的 WebKitGTK |
| | ARM64 | `tailcat-box-linux-arm64-v1.3.0.deb` | Debian / Ubuntu 安装包 |
| | ARM64 | `tailcat-box-linux-arm64-v1.3.0.tar.gz` | 通用压缩包 |

> [!NOTE]
> 发布包都没有做代码签名（没有 Authenticode，也没有 Apple 公证），第一次打开时 Windows SmartScreen 和 macOS Gatekeeper 会拦一下，处理方法见[常见问题](#常见问题与故障排查)。

### 系统要求

- **Windows**：需要 Microsoft Edge WebView2 运行时，较新的 Windows 10 和 11 已自带。
- **macOS**：Apple 芯片和 Intel 机型都支持。
- **Linux**：glibc 2.39 及以上（Ubuntu 24.04+、Debian 13+、Fedora 40+），需要 WebKitGTK 4.1、GTK 3 和 GStreamer。语音、视频通话和共享屏幕依赖 WebRTC，而各发行版自带的 WebKitGTK 都没有编入它，所以要通话请用 amd64 的 `-full.tar.gz`。详见 [Linux 说明](#linux-说明)。

## 安装

**Windows**：运行安装程序。最后一页可以勾选「Run Tailcat Box」直接启动，应用会以当前用户身份运行，而不是管理员。升级时默认装回上次的位置。便携版 `.exe` 双击就能用。

**macOS**：打开 `.dmg`，把 Tailcat Box 拖进「应用程序」。第一次打开时，到「系统设置 → 隐私与安全性」点「仍要打开」，或者右键应用选「打开」。

**Linux（.deb）**

```bash
sudo apt install ./tailcat-box-linux-amd64-v1.3.0.deb
```

**Linux（.tar.gz）**：解压后运行 `./install.sh` 装到 `~/.local`（不需要 sudo），或者直接运行 `./tailcat-box`。amd64 上要通话的话，请用 `-full.tar.gz`，并按 [Linux 说明](#linux-说明) 装好 GStreamer 插件。

## 快速上手

1. 两台电脑都装好猫砂盆并打开，默认进入喵传页面。
2. **聊天**：在一台电脑上进入「聊天」，新建一个房间，把房间的 `tc…` 地址复制或用二维码发给对方。对方粘贴或扫码后点连接即可。
3. **传文件**：在「喵传」里拖入文件，生成一份分享，把取件码发给对方。对方在「下载」里粘贴取件码。下载完成前，发送方要保持在线。
4. **映射端口**：在「穿透」里新建一条「端口监听」，比如填 `8080`，启动后把地址发给对方。对方新建一条「本地转发」指向这个地址，再访问本机对应端口就行。

## 使用说明

### 聊天与通话

- 每个房间有独立的地址、监听、当前对象和聊天记录。房间是一对一的，不是群聊：多人连到同一个地址时，回复只会发给最后连上的那个人。详见[使用常见问题](docs/faq.zh-CN.md)。
- 用「新建临时房间」开的房间使用临时密钥，退出应用后地址就作废了。用已保存的密钥（设置 → 密钥和 DERP）开的房间，在删除密钥之前地址一直不变。
- 语音、视频和共享屏幕都在聊天房间里发起，切到其他页面也不会断。来电响铃 60 秒无人接听会自动结束。
- 回到有未读消息的房间时，第一条未读消息上方会出现一条「新消息」分隔线。昵称和备注只保存在本机，不会发给对方。

### 通话记录

语音、视频或共享屏幕结束后，双方的对话里都会出现一条记录，显示在发起方一侧：

| 情况 | 发起方看到 | 接听方看到 |
| --- | --- | --- |
| 正常结束 | 通话类型和时长，例如「语音通话 通话时长 03:12」 | 相同 |
| 被拒绝 | 对方已拒绝 | 已拒绝 |
| 接通前发起方挂断 | 已取消 | 对方已取消 |
| 60 秒无人接听 | 对方未接听 | 未接听 |
| 连接失败或设备打不开 | 通话失败 | 通话失败 |

点一下记录，可以用同样的方式再次发起。

### 喵传

- 拖入一个或多个文件就生成一份分享。可以同时开多份，每份有自己的取件码和二维码。
- 300 MiB 以内的分享会复制到应用里；更大的直接从原位置读取，分享期间请不要移动或删除这些文件。
- 有效期可以选 1 天、7 天、15 天、自定义天数或「直到我结束」，也可以限制下载次数。
- 接收方粘贴取件码，或者用摄像头、图片、剪贴板扫码。传输走 Tailcat，两边都要用猫砂盆，发送方要保持在线。
- 重启应用后，还没结束的分享会恢复，取件码不变。

### 穿透（端口映射）

「穿透」页面保存的端口映射可以随时启动、停止。

- **端口监听**：把 TCP 端口挂到 Tailcat 地址上。可以填多个端口或映射，用逗号分隔：
  - `8080`：对外提供本机的 8080 端口。
  - `8080:192.168.1.10:80`：对方访问 8080，实际转到局域网里 192.168.1.10 的 80 端口。前提是运行猫砂盆的这台电脑能访问到那台机器，而且那台机器的防火墙放行了这个端口。
- **本地转发**：在本机监听一个端口，把连接转到对方 Tailcat 地址上的某个端口。也可以直接在浏览器里打开对方的网页端口。
- **固定地址**：密钥选已保存的密钥，不要选「临时」，`tc…` 地址在重启后就不会变。地址里还包含 DERP 区域，所以猫砂盆会把这个密钥上次使用的区域记下来；只要跟当前的区域设置一致，下次就直接沿用，即使开机时网络还没就绪也不受影响。建议同时在设置里固定区域（见[配置](#配置)）。
- 同一个密钥同一时间只能用在一个地方（一个聊天房间或一条端口监听），也不要在两台电脑上同时用同一个密钥。
- 每条映射都可以单独设置「随软件启动自动开始」。

### SSH

SSH 默认关闭，打开「允许别人连」后才会监听。它用的是 Tailcat 自带的 shell，不是系统的 `sshd`。能连进来的只有允许名单里的对象，也就是已保存的设备和当前打开的聊天房间里的对方，不用系统密码，也不用 SSH 密钥。「谁都可以连」是单独的选项，打开时会有警告。连接后可以在应用内的终端里操作，也可以打开系统终端。

### 托盘与后台运行

关闭窗口时应用会收到托盘（macOS 上是菜单栏），房间、分享和穿透都继续运行。托盘菜单里有打开、隐藏、聊天、穿透、设置和退出，有未读消息时图标会出现红点。要彻底停止所有会话，请选「退出」。Linux 上需要桌面支持 StatusNotifierItem 托盘；没有托盘时，关闭窗口就是退出。

## 配置

### 设置项

| 设置 | 位置 | 说明 |
| --- | --- | --- |
| DERP 区域 | 设置 → 密钥和 DERP | 之后新开的监听和连接使用的中继区域，可以填 ID、代码或名称，留空表示自动选择。填数字 ID（比如 `301`）时直接使用，不需要联网查询 DERP 地图。 |
| DERP 地图 URL | 设置 → 密钥和 DERP | 可选，自定义 DERP 地图。默认使用 Tailcat 公开的 [`https://tailcat.dev/derpmap.json`](https://tailcat.dev/derpmap.json)，里面可以查到各区域的 ID 和代码。 |
| Beta 版本 | 设置 | 默认关闭。打开后，「检查更新」也会把 GitHub 上的预发布版本算进去。 |
| 开机时启动 | 设置 | 登录系统后自动启动猫砂盆。 |
| 外观和语言 | 设置 | 跟随系统、浅色或深色；中文或英文。 |

密钥页面还会列出 Tailcat 命令行工具的密钥目录（一般是 `~/.config/tailcat/keys`），方便把已有的密钥导入进来。

### 数据目录

密钥和设置保存在用户配置目录下：

| 系统 | 路径 |
| --- | --- |
| Windows | `%AppData%\tailcat-box` |
| macOS | `~/Library/Application Support/tailcat-box` |
| Linux | `~/.config/tailcat-box` |

密钥保存为 `keys/*.private.json`，聊天文件在 `chat/`，喵传的副本在 `miao/`。如果电脑上已有旧目录 `tailcat-desktop-client`、但还没有 `tailcat-box`，应用会继续使用旧目录，把它改名为 `tailcat-box` 即可切换。

### 环境变量

| 变量 | 作用 |
| --- | --- |
| `TAILCAT_KEYS_DIR` | 指定密钥目录 |
| `TAILCAT_SETTINGS_DIR` | 指定设置目录 |
| `TAILCAT_CHAT_DIR` | 指定聊天文件目录 |
| `TAILCAT_MIAO_DIR` | 指定喵传副本目录 |
| `TAILCAT_ADAPTER=fake` | 使用离线的模拟后端（仅用于开发） |

## 常见问题与故障排查

**Windows 提示「Windows 已保护你的电脑」**
发布包没有签名。点「更多信息」，再点「仍要运行」。

**macOS 提示无法打开应用**
未签名的应用第一次打开会被 Gatekeeper 拦下。到「系统设置 → 隐私与安全性」点「仍要打开」，或者右键应用选「打开」。

**Windows 上麦克风或摄像头用不了，隐私设置里也找不到猫砂盆**
猫砂盆通过 Microsoft Edge WebView2 使用麦克风和摄像头，Windows 不会给桌面应用单独弹授权框。请到「设置 → 隐私和安全性 → 麦克风」（摄像头同理），确认最上面的总开关和「允许桌面应用访问你的麦克风/摄像头」都已打开。最近使用记录里显示的是「Microsoft Edge WebView2」，不是猫砂盆。如果开关都开着还是失败，可能是设备被其他程序占用了。

**在 Hyper-V 虚拟机里提示「未检测到麦克风或摄像头」**
Hyper-V 虚拟机默认没有摄像头，往往也没有麦克风。可以用增强会话连接，在「显示选项 → 本地资源」里打开录音和摄像头重定向；或者直接在实体机上测试。

**macOS 上没有弹出麦克风、摄像头或屏幕录制的授权**
macOS 会在第一次使用时询问。如果之前点了「不允许」，请到「系统设置 → 隐私与安全性」，在「麦克风」「摄像头」和「屏幕与系统音频录制」里打开猫砂盆。屏幕录制权限和代码签名绑定，更新未签名的新版本后可能需要重新授权，并重启应用才生效。用 `wails dev` 运行时，系统可能会把请求算到启动它的终端上。

**Linux 上不能通话**
发行版自带的 WebKitGTK 没有编入 WebRTC。请改用 amd64 的 `-full.tar.gz`，并装好下面列出的 GStreamer 插件。

**重启电脑后，穿透的地址变了**
请用已保存的密钥，不要用临时密钥，并在设置里固定 DERP 区域。地址里包含区域信息，区域变了地址也会变。从 v1.3.0 起，已保存的密钥会沿用上次使用的区域。

房间、临时地址、昵称和备注等问题，见[使用常见问题](docs/faq.zh-CN.md)。

## Linux 说明

运行时依赖：

```bash
# Debian / Ubuntu（安装 .deb 时会自动装上）
sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0t64 gstreamer1.0-plugins-good gstreamer1.0-plugins-bad
# 使用 -full.tar.gz 通话时还需要
sudo apt install gstreamer1.0-nice
# Fedora
sudo dnf install webkit2gtk4.1 gtk3 gstreamer1-plugins-good gstreamer1-plugins-bad-free
```

- **托盘**：通过 D-Bus 上的 StatusNotifierItem（AppIndicator）协议显示。KDE、Xfce、Cinnamon 和 Ubuntu 自带的 GNOME 都支持；原版 GNOME 需要安装 *AppIndicator and KStatusNotifierItem Support* 扩展。
- **完整版**：自带编入 WebRTC 的 WebKitGTK 2.54.1（见 [third_party/webkitgtk](third_party/webkitgtk/README.md)）。完整版在应用内更新时，下载的仍然是完整版。
- **在终端中打开**：依次尝试 `x-terminal-emulator`、`gnome-terminal`、`ptyxis`、`konsole`、`xfce4-terminal`、`kitty`、`alacritty`、`foot` 和 `xterm`。
- **开机时启动**：会写入 `~/.config/autostart/tailcat-box.desktop`。
- **更新**：检查到新版本后会下载新的 `.tar.gz` 并打开所在文件夹，按原来的方式安装即可。

## 从源码构建

### 环境要求

| 工具 | 版本 |
| --- | --- |
| Go | 1.27.1 及以上（Tailcat v0.7.0 的要求；设置 `GOTOOLCHAIN=auto` 可自动下载） |
| Node.js 和 npm | Node.js 20.19+ 或 22.12+（Vite 7 的要求；CI 使用 Node.js 22） |
| Wails CLI | v2.16.0：`go install github.com/wailsapp/wails/v2/cmd/wails@v2.16.0` |
| 平台工具链 | macOS：Xcode Command Line Tools；Windows：WebView2；Linux：`libgtk-3-dev`、`libwebkit2gtk-4.1-dev` |

可以先运行 `wails doctor` 检查环境。

### 开发

```bash
git clone https://github.com/mushroom11s/tailcat-box.git
cd tailcat-box
wails dev                          # 使用真实的 Tailcat 后端，走公网 DERP
TAILCAT_ADAPTER=fake wails dev     # 使用离线模拟后端
```

Linux 上运行 `wails dev` 和 `wails build` 时要加 `-tags webkit2_41`。在 `frontend/` 里单独运行 `npm run dev` 时没有 Go 绑定，界面会改用浏览器内的模拟数据。

### 构建

```bash
wails build                        # Linux：wails build -tags webkit2_41
```

产物在 `build/bin/` 下（macOS 是 `tailcat-box.app`，Windows 是 `tailcat-box.exe`，Linux 是 `tailcat-box`）。

### 测试

```bash
go test ./...
cd frontend && npm ci && npm run build && npm test
```

每个拉取请求和推送到 `main` 的提交，CI 都会运行 `go test ./...`、打包脚本测试和前端构建。连接真实 DERP 中继的集成测试需要单独运行，并且要能访问外网 HTTPS/UDP：

```bash
go test -tags=integration ./internal/adapter/ -v -count=1
```

打包和发版流程见 [docs/releases/README.md](docs/releases/README.md)。

## 项目结构

```text
.
├── main.go, app.go        # Wails 入口，以及暴露给前端的方法
├── internal/
│   ├── adapter/           # 唯一引入 Tailcat 的包（真实与模拟两套实现）
│   ├── chat/              # 房间、文件、语音消息、实时通话
│   ├── miao/              # 喵传
│   ├── service/           # 会话命令：管道、端口、文件、SSH、SOCKS、出口节点、Exec、Ping
│   ├── session/           # 会话状态
│   ├── settings/, store/  # 设置、命名密钥、网络选项
│   ├── sshdesk/, sshterm/ # 内置 SSH 服务和终端
│   ├── tray/              # 系统托盘
│   ├── update/            # 检查更新
│   └── ...                # autostart、notify、screenwin、linuxwebview、sysinfo、appinfo
├── frontend/              # React + TypeScript 界面（Vite）
├── build/                 # 各平台打包配置：Info.plist、NSIS 安装程序、Linux 桌面文件
├── third_party/webkitgtk/ # Linux 完整版使用的、带 WebRTC 的 WebKitGTK（Git LFS）
├── scripts/               # 打包脚本
└── docs/                  # 常见问题、发布说明、图片资源
```

前端只和 Go 服务层通信，只有 `internal/adapter` 依赖 `github.com/tailscale/tailcat`。

## 参与贡献

欢迎提交问题和拉取请求。

- 缺陷和功能建议请提到 [Issues](https://github.com/mushroom11s/tailcat-box/issues)，并写明系统、架构、应用版本和复现步骤。
- 拉取请求请尽量聚焦单一改动，目标分支为 `main`，提交前确认 `go test ./...` 和 `frontend/` 下的 `npm run build` 都能通过。
- 界面文案在 `frontend/src/i18n/en.ts` 和 `frontend/src/i18n/zh-CN.ts` 中，修改时请两份一起更新。

## 安全

- 拿到房间地址、穿透地址或喵传取件码的人都可以连接，请像对待密码一样保管，不用的及时停止或删除。
- 「端口监听」会把目标端口开放给持有地址的任何人，只开放适合对方访问的服务。
- SSH 默认关闭，并且只允许名单内的对象连接；打开「谁都可以连」会取消这一限制。
- 传输安全由内置的 Tailcat 库提供，其协议和安全特性请参阅 [Tailcat 项目](https://github.com/tailscale/tailcat)。
- 发布包没有签名，请只从本仓库的 [Releases](https://github.com/mushroom11s/tailcat-box/releases) 页面下载。

如发现安全漏洞，请不要在公开 Issue 中披露细节。可以先开一个 Issue 申请私下联系的方式，维护者会尽快跟进。

## 许可证

猫砂盆自身的源代码采用 [PolyForm Noncommercial License 1.0.0](LICENSE)：允许非商业使用，商业使用需另行获得版权方授权。

内嵌和随附的第三方代码（包括 `github.com/tailscale/tailcat`）仍遵循各自的许可证，不因本项目的许可证而改变。

## 致谢

- [Tailcat](https://github.com/tailscale/tailcat) 与 [Tailscale](https://tailscale.com)：本应用的网络能力都建立在它们之上。
- [Wails](https://wails.io)、[React](https://react.dev) 和 [WebKitGTK](https://webkitgtk.org)。
