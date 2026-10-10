<p align="center">
  <img src="docs/assets/icon.png" alt="Tailcat Box" width="128" />
</p>

<h1 align="center">Tailcat Box <img src="docs/assets/loading-cat.gif" alt="" height="28" /></h1>

<p align="center">
  <b>Private, peer-to-peer connections between your computers. No account, no server to run, no port forwarding.</b>
</p>

<p align="center">
  <a href="https://github.com/mushroom11s/tailcat-box/releases/latest"><img src="https://img.shields.io/github/v/release/mushroom11s/tailcat-box" alt="Latest release" /></a>
  <a href="https://github.com/mushroom11s/tailcat-box/actions/workflows/ci.yml"><img src="https://github.com/mushroom11s/tailcat-box/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue" alt="License: PolyForm Noncommercial 1.0.0" /></a>
  <img src="https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" alt="Platforms: Windows, macOS, Linux" />
  <a href="https://t.me/+YCUAoqBJ_ZIyZGVh"><img src="https://img.shields.io/badge/Telegram-chat-2CA5E0?logo=telegram&logoColor=white" alt="Telegram" /></a>
</p>

<p align="center">
  English | <a href="README.zh-CN.md">简体中文</a>
</p>

---

Tailcat Box (猫砂盆) is a desktop app for Windows, macOS, and Linux that connects two computers directly, wherever they are. Open the app, share a short `tc…` address or code, and you can talk, send files, reach each other's services, or open a remote shell, all from one window.

It is built on [Tailscale Tailcat](https://github.com/tailscale/tailcat): connections are brokered through public DERP relays and switch to a direct path when the network allows, so neither side needs a public IP, router configuration, or an account. Tailcat Box is for developers, IT helpers, and small teams who want a quick, private link between machines without setting up a VPN or relying on a cloud service to hold their files.

## Use cases

**Reach your home or office network from anywhere**
Publish a NAS dashboard, an admin web page, or a development server on a Tailcat address, then open it from your laptop on another network. No public IP or router port forwarding required.

**Show a work-in-progress site to a colleague or client**
Share the local port your dev server is running on and send the address to everyone who needs it. Several people can connect with the same address at the same time, each through their own Tailcat Box, while you keep coding. Stop the mapping when the demo is over.

**Send large files directly, without a cloud drive**
Drop files into Mew Share and send the pickup code to one person or several. Recipients download straight from your computer, with no upload step and no third-party storage.

**Help a family member or coworker remotely**
Talk it through on a voice or video call, ask them to share their screen, and, if they allow it, open a shell on their machine over SSH to fix the problem.

**Keep a private conversation between two machines**
Chat, voice notes, and calls go between the two Tailcat Box apps through Tailcat, with no chat service account involved.

**Expose a device on your LAN to someone remote**
Forward the web interface of a printer, an IP camera, a router, or an embedded board that sits on your local network, so remote peers can reach it through your computer, several at once if needed.

## Highlights

### Communicate
One-to-one rooms for text, files, and voice notes, with voice and video calls and screen sharing built in.
- Connect by pasting an address or scanning a QR code
- Keep several rooms open and switch between them
- Open a shared screen in its own window at full resolution

### Share files: Mew Share
Peer-to-peer file sharing with a pickup code or QR code.
- One pickup code can be used by several recipients, up to the download limit you set (transfers are served one at a time)
- Run several shares at once, each with its own expiry
- Large shares are served from their original location instead of being copied
- Shares resume with the same code after the app restarts

### Reach your services: Tunnel
Make TCP services reachable across networks, in either direction. One address can be shared with many people, and they can all connect at the same time.
- Publish ports on this machine, or on another host in your LAN (`8080:192.168.1.10:80`)
- Forward a peer's port to your own machine, or open their web page directly
- Use a saved key to keep the same address across restarts

### Remote access: SSH
A built-in shell served by Tailcat, separate from the operating system's `sshd`.
- Off by default; only saved devices and current chat peers are allowed in
- Open sessions in the in-app terminal or your system terminal

### Everywhere
- Native builds for Windows, macOS, and Linux on x64 and ARM64
- Runs in the system tray, so rooms, shares, and tunnels keep working when the window is closed
- English and Simplified Chinese, light and dark themes, in-app updates

## Screenshots

<table>
  <tr>
    <td align="center" valign="top" width="50%">
      <img src="docs/assets/demo/en/miao-packing.png" alt="Mew Share preparing a share" width="100%" /><br />
      <sub>Preparing a share</sub>
    </td>
    <td align="center" valign="top" width="50%">
      <img src="docs/assets/demo/en/miao-qr.png" alt="Share card with a QR code" width="100%" /><br />
      <sub>Pickup code and QR code</sub>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="50%">
      <img src="docs/assets/demo/en/miao-running.png" alt="Download in progress" width="100%" /><br />
      <sub>Download in progress</sub>
    </td>
    <td align="center" valign="top" width="50%">
      <img src="docs/assets/demo/en/qr-scan.png" alt="Scanning a QR code" width="100%" /><br />
      <sub>Scan from the camera, an image, or the clipboard</sub>
    </td>
  </tr>
</table>

## Download

Download the latest version from [GitHub Releases](https://github.com/mushroom11s/tailcat-box/releases/latest).

| Platform | Package |
| --- | --- |
| Windows (x64, ARM64) | Installer `…-installer-<version>.exe`, or portable `.exe` |
| macOS (Apple silicon, Intel) | `.dmg` |
| Linux (x64, ARM64) | `.deb` or `.tar.gz`. For voice/video calls on x64, use `-full.tar.gz` |

Linux builds require glibc 2.39 or later (Ubuntu 24.04+, Debian 13+, Fedora 40+). Release builds are not code-signed, so Windows SmartScreen and macOS Gatekeeper will ask for confirmation on first launch. See the [user guide](docs/usage.md) for installation details.

## Quick start

1. Install Tailcat Box on both computers.
2. **Chat**: create a room on one side and send its address; the other side pastes or scans it and connects.
3. **Files**: drop files into **Mew Share** and send the pickup code; the recipient enters it under **Download**.
4. **Services**: in **Tunnel**, add a **Port serve** mapping (for example `8080`) and send the address; the peer adds a **Local forward** to it.

## Documentation

- [User guide](docs/usage.md): features in detail, configuration, data locations, troubleshooting, and Linux notes
- [FAQ](docs/faq.md): rooms, temporary addresses, nicknames, and remarks
- [Release notes](docs/releases/): changes in each version

## Build from source

Requirements: Go 1.27.1+, Node.js 20.19+ (or 22.12+), and [Wails CLI](https://wails.io) v2.16.0, plus the platform webview toolchain (`libgtk-3-dev` and `libwebkit2gtk-4.1-dev` on Linux).

```bash
git clone https://github.com/mushroom11s/tailcat-box.git
cd tailcat-box
wails dev                          # run in development mode
wails build                        # build into build/bin/
go test ./...                      # run tests
```

On Linux, add `-tags webkit2_41`. Set `TAILCAT_ADAPTER=fake` to develop offline. Packaging and releases are covered in [docs/releases/README.md](docs/releases/README.md).

## Contributing

Issues and pull requests are welcome. Please describe your OS, architecture, and app version when reporting a bug, target `main` with focused pull requests, and update both `frontend/src/i18n/en.ts` and `zh-CN.ts` when changing UI text.

## Security

Anyone who has a room address, Tunnel address, or pickup code can connect to it, so share them only with people you trust and stop them when you are done. Transport security is provided by [Tailcat](https://github.com/tailscale/tailcat), which encrypts tunnel traffic with WireGuard; see its documentation for details. Release binaries are unsigned; download them only from this repository.

To report a vulnerability, please do not post details publicly. Open an issue asking for a private contact channel and the maintainer will follow up.

## License

Tailcat Box is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). Commercial use requires a separate license from the copyright holder. Third-party components, including `github.com/tailscale/tailcat`, remain under their own licenses.

## Acknowledgements

Tailcat Box is built on [Tailcat](https://github.com/tailscale/tailcat) and [Tailscale](https://tailscale.com), with [Wails](https://wails.io), [React](https://react.dev), and [WebKitGTK](https://webkitgtk.org).
