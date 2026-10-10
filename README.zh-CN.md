<p align="center">
  <img src="docs/assets/icon.png" alt="猫砂盆" width="128" />
</p>

<h1 align="center">猫砂盆 Tailcat Box <img src="docs/assets/loading-cat.gif" alt="" height="28" /></h1>

<p align="center">
  <b>让你的电脑之间点对点直连。不用注册账号，不用自建服务器，也不用在路由器上做端口映射。</b>
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

猫砂盆（Tailcat Box）是一款运行在 Windows、macOS 和 Linux 上的桌面应用，能把两台电脑直接连起来，不管它们在哪个网络里。打开应用，把一串 `tc…` 地址或取件码发给对方，就可以在同一个窗口里聊天、通话、传文件、访问对方的服务，或者登录对方的终端。

猫砂盆基于 [Tailscale Tailcat](https://github.com/tailscale/tailcat)：连接先通过公共 DERP 中继建立，网络条件允许时自动切换为直连，所以双方都不需要公网 IP，不用改路由器，也不用注册任何账号。它适合开发者、帮人排查电脑问题的技术人员，以及想在几台机器之间快速建立私密连接、又不想折腾 VPN 或把文件交给网盘的小团队。

## 适用场景

**在外面访问家里或公司的内网服务**
把 NAS 管理页、网站后台或开发环境挂到 Tailcat 地址上，出门在外用笔记本就能打开。不需要公网 IP，也不用在路由器上做端口映射。

**给同事或客户临时演示本地正在开发的网页**
把本机开发服务器的端口共享出去，把地址发给需要看的人。同一个地址可以多人同时连接，大家各自用猫砂盆打开，你这边照常改代码。演示结束，停掉映射即可。

**大文件点对点直传，不走网盘**
把文件拖进喵传，把取件码发给一个人或几个人。对方直接从你的电脑下载，不用先上传，也不经过第三方存储。

**远程帮家人或同事排查问题**
先打个语音或视频电话，让对方共享屏幕看看情况；对方允许的话，还可以通过 SSH 登录到他的电脑上直接处理。

**两台电脑之间的私密沟通**
文字、语音消息和通话都在两端的猫砂盆之间通过 Tailcat 传输，不需要注册任何聊天服务的账号。

**把局域网里的设备分享给远端**
打印机、网络摄像头、路由器或开发板的网页管理界面，只要你的电脑能访问到，就可以转发给远端使用，需要的话几个人可以同时访问。

## 核心能力

### 即时沟通
一对一的聊天房间，能发文字、文件和语音消息，内置语音、视频通话和屏幕共享。
- 粘贴地址或扫一下二维码就能连上
- 可以同时开多个房间，随时切换
- 对方共享的屏幕可以单独开一个窗口，按原始分辨率查看

### 文件传输：喵传
用取件码或二维码点对点传文件。
- 一个取件码可以给多人使用，总次数不超过你设定的下载次数（多人下载时依次传输）
- 可以同时开多份分享，每份单独设置有效期
- 大文件直接从原位置读取，不会额外复制一份
- 重启应用后分享自动恢复，取件码不变

### 内网穿透
让 TCP 服务跨网络可达，两个方向都支持。一个地址可以发给多人，大家可以同时连接使用。
- 共享本机端口，也可以共享局域网里其他机器的端口（如 `8080:192.168.1.10:80`）
- 把对方的端口转到本机，或者直接在浏览器里打开对方的网页
- 使用已保存的密钥，重启后地址保持不变

### 远程终端：SSH
由 Tailcat 提供的内置 shell，和系统自带的 `sshd` 互不相干。
- 默认关闭；打开后只允许已保存的设备和当前聊天对象连接
- 可以在应用内的终端里操作，也可以用系统终端打开

### 全平台可用
- 提供 Windows、macOS、Linux 的 x64 和 ARM64 版本
- 常驻系统托盘，关掉窗口后房间、分享和穿透照常运行
- 中英文界面，浅色、深色主题，支持应用内更新

## 截图

<table>
  <tr>
    <td align="center" valign="top" width="50%">
      <img src="docs/assets/demo/miao-packing.png" alt="喵传正在准备分享" width="100%" /><br />
      <sub>准备分享</sub>
    </td>
    <td align="center" valign="top" width="50%">
      <img src="docs/assets/demo/miao-qr.png" alt="分享卡片上的二维码" width="100%" /><br />
      <sub>取件码和二维码</sub>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="50%">
      <img src="docs/assets/demo/miao-running.png" alt="下载进度" width="100%" /><br />
      <sub>下载中</sub>
    </td>
    <td align="center" valign="top" width="50%">
      <img src="docs/assets/demo/qr-scan.png" alt="扫码" width="100%" /><br />
      <sub>摄像头、图片或剪贴板扫码</sub>
    </td>
  </tr>
</table>

## 下载

到 [GitHub Releases](https://github.com/mushroom11s/tailcat-box/releases/latest) 下载最新版本。

| 平台 | 安装包 |
| --- | --- |
| Windows（x64、ARM64） | 安装版 `…-installer-<版本>.exe`，或便携版 `.exe` |
| macOS（Apple 芯片、Intel） | `.dmg` |
| Linux（x64、ARM64） | `.deb` 或 `.tar.gz`；x64 上需要语音、视频通话请下载 `-full.tar.gz` |

Linux 版需要 glibc 2.39 及以上（Ubuntu 24.04+、Debian 13+、Fedora 40+）。发布包没有代码签名，第一次打开时 Windows SmartScreen 和 macOS Gatekeeper 会要求确认。安装细节见[使用指南](docs/usage.zh-CN.md)。

## 快速上手

1. 两台电脑都装好猫砂盆。
2. **聊天**：一方新建房间，把地址发给对方；对方粘贴或扫码后连接。
3. **传文件**：在「喵传」里拖入文件，把取件码发给对方；对方在「下载」里填入取件码。
4. **访问服务**：在「穿透」里新建一条「端口监听」（比如 `8080`），把地址发给对方；对方新建一条「本地转发」指向这个地址。

## 文档

- [使用指南](docs/usage.zh-CN.md)：功能详解、配置、数据目录、故障排查和 Linux 说明
- [常见问题](docs/faq.zh-CN.md)：房间、临时地址、昵称和备注
- [发布说明](docs/releases/)：各版本的更新内容

## 从源码构建

需要 Go 1.27.1+、Node.js 20.19+（或 22.12+）、[Wails CLI](https://wails.io) v2.16.0，以及对应平台的 webview 开发环境（Linux 上是 `libgtk-3-dev` 和 `libwebkit2gtk-4.1-dev`）。

```bash
git clone https://github.com/mushroom11s/tailcat-box.git
cd tailcat-box
wails dev                          # 开发模式运行
wails build                        # 构建，产物在 build/bin/
go test ./...                      # 运行测试
```

Linux 上请加 `-tags webkit2_41`。设置 `TAILCAT_ADAPTER=fake` 可以离线开发。打包和发版流程见 [docs/releases/README.md](docs/releases/README.md)。

## 参与贡献

欢迎提交 Issue 和拉取请求。反馈问题时请写明系统、架构和应用版本；拉取请求请聚焦单一改动、以 `main` 为目标分支；修改界面文案时请同时更新 `frontend/src/i18n/en.ts` 和 `zh-CN.ts`。

## 安全

拿到房间地址、穿透地址或取件码的人都可以连接，请只发给信任的人，用完及时停止。传输安全由 [Tailcat](https://github.com/tailscale/tailcat) 提供，隧道流量使用 WireGuard 加密，详见其文档。发布包没有签名，请只从本仓库下载。

发现安全漏洞时，请不要公开披露细节。可以先开一个 Issue 申请私下联系的方式，维护者会尽快跟进。

## 许可证

猫砂盆采用 [PolyForm Noncommercial License 1.0.0](LICENSE)，商业使用需另行获得版权方授权。第三方组件（包括 `github.com/tailscale/tailcat`）仍遵循各自的许可证。

## 致谢

猫砂盆基于 [Tailcat](https://github.com/tailscale/tailcat) 和 [Tailscale](https://tailscale.com) 构建，并使用了 [Wails](https://wails.io)、[React](https://react.dev) 和 [WebKitGTK](https://webkitgtk.org)。
