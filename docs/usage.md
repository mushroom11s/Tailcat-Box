# User guide

[简体中文](usage.zh-CN.md) · [Back to the README](../README.md)

Detailed usage, configuration, and troubleshooting for Tailcat Box. For questions about chat rooms, see the [FAQ](faq.md).

## Download

Get the latest build from [GitHub Releases](https://github.com/mushroom11s/tailcat-box/releases/latest). Files for v1.3.0:

| Platform | Architecture | File | Notes |
| --- | --- | --- | --- |
| Windows 10/11 | x64 | `tailcat-box-windows-amd64-installer-v1.3.0.exe` | Installer (recommended) |
| | ARM64 | `tailcat-box-windows-arm64-installer-v1.3.0.exe` | Installer (recommended) |
| | x64 | `tailcat-box-windows-amd64-v1.3.0.exe` | Portable, no installation |
| | ARM64 | `tailcat-box-windows-arm64-v1.3.0.exe` | Portable, no installation |
| macOS | Apple silicon | `tailcat-box-macos-arm64-v1.3.0.dmg` | Disk image |
| | Intel | `tailcat-box-macos-amd64-v1.3.0.dmg` | Disk image |
| Linux | x64 | `tailcat-box-linux-amd64-v1.3.0.deb` | Debian / Ubuntu package |
| | x64 | `tailcat-box-linux-amd64-v1.3.0.tar.gz` | Generic archive |
| | x64 | `tailcat-box-linux-amd64-v1.3.0-full.tar.gz` | Generic archive with a bundled WebKitGTK that supports calls and screen sharing |
| | ARM64 | `tailcat-box-linux-arm64-v1.3.0.deb` | Debian / Ubuntu package |
| | ARM64 | `tailcat-box-linux-arm64-v1.3.0.tar.gz` | Generic archive |

> [!NOTE]
> Release builds are not code-signed (no Authenticode, no Apple notarization). Windows SmartScreen and macOS Gatekeeper will warn on first launch; see [FAQ](#faq-and-troubleshooting).

### System requirements

- **Windows**: Microsoft Edge WebView2 Runtime (preinstalled on current Windows 10 and 11).
- **macOS**: Apple silicon or Intel.
- **Linux**: glibc 2.39 or later (Ubuntu 24.04+, Debian 13+, Fedora 40+), WebKitGTK 4.1, GTK 3, and GStreamer. Voice/video calls and screen sharing require WebRTC, which distribution WebKitGTK builds omit; use the amd64 `-full.tar.gz` for calls. See [Linux notes](#linux-notes).

## Installation

**Windows** — Run the installer. The final page offers to launch Tailcat Box (as the current user, not as administrator). Upgrades install into the previous location by default. The portable `.exe` runs without installation.

**macOS** — Open the `.dmg` and drag Tailcat Box into Applications. On first launch, allow it under System Settings → Privacy & Security → Open Anyway, or right-click the app and choose Open.

**Linux (.deb)**

```bash
sudo apt install ./tailcat-box-linux-amd64-v1.3.0.deb
```

**Linux (.tar.gz)** — Extract the archive, then either run `./install.sh` to install into `~/.local` (no `sudo` needed) or run `./tailcat-box` in place. For calls on amd64, use the `-full.tar.gz` and install the GStreamer plugins listed in [Linux notes](#linux-notes).

## Usage guide

### Chat and calls

- Each room has its own address, listener, current peer, and transcript. A room is a one-to-one conversation, not a group chat: if several people connect to the same address, replies go only to the most recent peer. Details are in the [usage FAQ](faq.md).
- Rooms opened with **Create temporary room** use an ephemeral key, and their address disappears when the app quits. A saved key (Settings → Keys & DERP) keeps the same address until you delete the key.
- Voice, video, and screen sharing run inside the chat room and stay connected when you switch to another page. Incoming calls ring until answered or declined and end automatically after 60 seconds.
- A **New messages** divider marks the first unread message when you return to a room. Nicknames and peer remarks are stored locally and are never sent to the other side.

### Call records

When a voice call, video call, or screen share ends, both peers see a record in the conversation, aligned to the caller's side:

| Outcome | Caller sees | Callee sees |
| --- | --- | --- |
| Completed | Call type and duration, e.g. "Voice call · Call duration 03:12" | Same |
| Declined | Declined | You declined |
| Caller hung up before an answer | Cancelled | Caller cancelled |
| No answer within 60 seconds | No answer | Missed call |
| Connection or device error | Call failed | Call failed |

Click a record to start the same kind of call again.

### Mew Share

- Drop one or more files to create a share. Several shares can run at the same time, each with its own pickup code and QR code.
- Shares up to 300 MiB are copied into the app. Larger shares are served from their original location, so do not move or delete those files while the share is active.
- One pickup code can be used by several recipients. Each completed download counts toward the share's download limit, and the share ends when the limit is reached. Transfers are served one at a time.
- Each share can expire after 1, 7, or 15 days, a custom number of days, or only when you end it, and can limit the number of downloads.
- Recipients paste a pickup code or scan a QR code (camera, image file, or clipboard). Transfers run over Tailcat between two Tailcat Box instances; the sender must stay online.
- Active shares come back with the same code after the app restarts.

### Tunnel (port forwarding)

The Tunnel page stores port mappings that you can start and stop at any time.

- **Port serve** publishes TCP ports on a Tailcat address. The same address can be given to several people, and they can all connect at the same time; each connection is forwarded independently. Enter comma-separated ports or mappings:
  - `8080` exposes port 8080 on this machine.
  - `8080:192.168.1.10:80` exposes port 80 on another host in your LAN as port 8080. The machine running Tailcat Box must be able to reach that host, and the host's firewall must allow the connection.
- **Local forward** listens on a local port and forwards connections to a port on a peer's Tailcat address. You can also open a peer's web port directly in the browser.
- **Stable addresses** — Pick a saved key instead of **Ephemeral** to keep the same `tc…` address across restarts. The address also encodes the DERP region, so Tailcat Box stores the region a key last served on and reuses it while it still matches your region setting, even if the network is not ready at boot. Pinning a region (see [Configuration](#configuration)) keeps the address predictable.
- A key can be used by only one listener at a time (a chat room or a port serve). Do not run the same saved key on two machines simultaneously.
- Each mapping can be set to start automatically when the app launches.

### SSH

SSH is off until you enable **Allow SSH**. It is Tailcat's built-in shell, not the operating system's `sshd`. Access is limited to an allowlist made up of saved devices and peers of open chat rooms; it does not use OS passwords or SSH keys. **Allow any peer** is a separate option and shows a warning. Sessions can be opened in the in-app terminal or the system terminal.

### Tray and background operation

Closing the window hides it to the tray (menu bar on macOS) so that rooms, shares, and tunnels keep running. The tray menu provides Open, Hide, Chat, Tunnel, Settings, and Quit, and shows a badge for unread messages. Choose **Quit** to stop all sessions. On Linux, the tray requires a StatusNotifierItem host; without one, closing the window quits the app.

## Configuration

### Settings

| Setting | Location | Description |
| --- | --- | --- |
| DERP region | Settings → Keys & DERP | Region used by new serve and client sessions, given as an ID, code, or name. Empty means automatic. A numeric ID (for example `301`) is used directly without fetching the DERP map. |
| DERP map URL | Settings → Keys & DERP | Optional custom DERP map. Defaults to Tailcat's public map, [`https://tailcat.dev/derpmap.json`](https://tailcat.dev/derpmap.json), which lists the available region IDs and codes. |
| Beta updates | Settings | Off by default. When on, **Check for updates** also considers GitHub pre-releases. |
| Launch at login | Settings | Starts Tailcat Box when you sign in. |
| Appearance and language | Settings | System, light, or dark theme; English or Simplified Chinese. |

The Keys page also lists keys from the Tailcat CLI directory (`~/.config/tailcat/keys` or the OS equivalent) so you can import them.

### Data directory

Keys and settings are stored under the user configuration directory:

| OS | Path |
| --- | --- |
| Windows | `%AppData%\tailcat-box` |
| macOS | `~/Library/Application Support/tailcat-box` |
| Linux | `~/.config/tailcat-box` |

Keys are saved as `keys/*.private.json`, chat files under `chat/`, and Mew Share copies under `miao/`. If a legacy `tailcat-desktop-client` directory exists and `tailcat-box` does not, the app keeps using the legacy directory; rename it to switch.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `TAILCAT_KEYS_DIR` | Override the keys directory |
| `TAILCAT_SETTINGS_DIR` | Override the settings directory |
| `TAILCAT_CHAT_DIR` | Override the chat file directory |
| `TAILCAT_MIAO_DIR` | Override the Mew Share copy directory |
| `TAILCAT_ADAPTER=fake` | Use the offline fake backend (development only) |

## FAQ and troubleshooting

**Windows SmartScreen says "Windows protected your PC".**
Release builds are unsigned. Click **More info**, then **Run anyway**.

**macOS says the app cannot be opened.**
Unsigned builds are blocked by Gatekeeper on first launch. Open System Settings → Privacy & Security and click **Open Anyway**, or right-click the app and choose **Open**.

**Windows: the microphone or camera does not work, and Tailcat Box is not listed in privacy settings.**
Tailcat Box uses Microsoft Edge WebView2, and Windows does not show a separate permission prompt for desktop apps. Open Settings → Privacy & security → Microphone (and Camera) and make sure both the main switch and **Let desktop apps access your microphone/camera** are on. Recent use appears under **Microsoft Edge WebView2**, not under Tailcat Box. If the switches are on and the call still fails, another application may be holding the device.

**The app says "No microphone or camera found" in a Hyper-V virtual machine.**
Hyper-V VMs have no camera, and often no microphone, by default. Connect with an Enhanced Session and enable audio recording and camera redirection under **Show Options → Local Resources**, or test on a physical machine.

**macOS: no microphone, camera, or screen recording prompt appears.**
macOS prompts on first use. If you previously chose Don't Allow, enable Tailcat Box under System Settings → Privacy & Security → Microphone, Camera, and Screen & System Audio Recording. Screen recording permission is tied to the code signature, so after updating an unsigned build you may need to grant it again and restart the app. When running `wails dev`, macOS may attribute the request to the terminal instead.

**Linux: calls are unavailable.**
Distribution WebKitGTK builds do not include WebRTC. Use the amd64 `-full.tar.gz` package and install the GStreamer plugins listed below.

**My Tunnel address changed after a reboot.**
Use a saved key instead of an ephemeral one, and set a fixed DERP region. The address embeds the region, so a different region produces a different address. Since v1.3.0, a saved key reuses the region it last served on.

More questions about rooms, temporary addresses, nicknames, and remarks are answered in the [usage FAQ](faq.md).

## Linux notes

Runtime dependencies:

```bash
# Debian / Ubuntu (installed automatically with the .deb)
sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0t64 gstreamer1.0-plugins-good gstreamer1.0-plugins-bad
# Additional packages for calls with the -full.tar.gz build
sudo apt install gstreamer1.0-nice
# Fedora
sudo dnf install webkit2gtk4.1 gtk3 gstreamer1-plugins-good gstreamer1-plugins-bad-free
```

- **Tray**: uses the StatusNotifierItem (AppIndicator) protocol over D-Bus. KDE, Xfce, Cinnamon, and Ubuntu's GNOME support it; stock GNOME needs the *AppIndicator and KStatusNotifierItem Support* extension.
- **Full package**: bundles WebKitGTK 2.54.1 built with WebRTC (see [third_party/webkitgtk](../third_party/webkitgtk/README.md)). In-app updates keep a full install on the full package.
- **Open in Terminal** tries `x-terminal-emulator`, `gnome-terminal`, `ptyxis`, `konsole`, `xfce4-terminal`, `kitty`, `alacritty`, `foot`, and `xterm`, in that order.
- **Launch at login** writes `~/.config/autostart/tailcat-box.desktop`.
- **Updates**: the update checker downloads the new `.tar.gz` and opens its folder; install it the same way as before.

## Development

### Prerequisites

| Tool | Version |
| --- | --- |
| Go | 1.27.1 or later (required by Tailcat v0.7.0; `GOTOOLCHAIN=auto` can fetch it) |
| Node.js and npm | Node.js 20.19+ or 22.12+ (required by Vite 7; CI uses Node.js 22) |
| Wails CLI | v2.16.0: `go install github.com/wailsapp/wails/v2/cmd/wails@v2.16.0` |
| Platform toolchain | macOS: Xcode Command Line Tools. Windows: WebView2. Linux: `libgtk-3-dev`, `libwebkit2gtk-4.1-dev` |

Run `wails doctor` to verify the environment.

### Develop

```bash
git clone https://github.com/mushroom11s/tailcat-box.git
cd tailcat-box
wails dev                          # real Tailcat backend, uses public DERP
TAILCAT_ADAPTER=fake wails dev     # offline fake backend
```

On Linux, add `-tags webkit2_41` to `wails dev` and `wails build`. Running `npm run dev` inside `frontend/` starts the UI without Go bindings and falls back to an in-browser fake.

### Build

```bash
wails build                        # Linux: wails build -tags webkit2_41
```

The output is written to `build/bin/` (`tailcat-box.app` on macOS, `tailcat-box.exe` on Windows, `tailcat-box` on Linux).

### Test

```bash
go test ./...
cd frontend && npm ci && npm run build && npm test
```

CI runs `go test ./...`, the packaging script tests, and the frontend build on every pull request and push to `main`. An integration test against real DERP relays is available separately and needs outbound HTTPS/UDP:

```bash
go test -tags=integration ./internal/adapter/ -v -count=1
```

Release packaging and tagging are described in [docs/releases/README.md](releases/README.md).

## Project structure

```text
.
├── main.go, app.go        # Wails entry point and bindings exposed to the frontend
├── internal/
│   ├── adapter/           # The only package that imports Tailcat (real and fake backends)
│   ├── chat/              # Rooms, files, voice notes, live calls
│   ├── miao/              # Mew Share
│   ├── service/           # Session commands: pipe, ports, files, SSH, SOCKS, exit node, exec, ping
│   ├── session/           # Session state
│   ├── settings/, store/  # Settings, named keys, network options
│   ├── sshdesk/, sshterm/ # Built-in SSH server and terminal
│   ├── tray/              # System tray
│   ├── update/            # Update checks
│   └── ...                # autostart, notify, screenwin, linuxwebview, sysinfo, appinfo
├── frontend/              # React + TypeScript UI (Vite)
├── build/                 # Platform packaging: Info.plist, NSIS installer, Linux desktop files
├── third_party/webkitgtk/ # WebRTC-enabled WebKitGTK for the full Linux package (Git LFS)
├── scripts/               # Packaging scripts
└── docs/                  # FAQ, release notes, assets
```

The frontend talks only to the Go service layer; only `internal/adapter` depends on `github.com/tailscale/tailcat`.
