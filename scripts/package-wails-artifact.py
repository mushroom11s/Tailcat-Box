#!/usr/bin/env python3
"""Package a Wails build for a GitHub Release.

Windows jobs publish two files from one ``wails build -nsis``:

* NSIS setup, renamed so the public filename includes ``installer``:
  ``tailcat-box-windows-amd64-installer-v0.4.0.exe``
* Bare portable exe, a copy of the runnable ``tailcat-box.exe``:
  ``tailcat-box-windows-amd64-v0.4.0.exe``

The portable asset is that single file, not a zip. Current Wails output is
the exe alone (the old portable zip contained only ``tailcat-box.exe``), so
sidecar ``.dll`` files are not copied into ``dist-upload``. A future build
that leaves a DLL beside the exe still publishes only this bare exe.

macOS jobs build a compressed disk image that contains the ``.app`` and an
Applications symlink (drag-to-Applications):

    tailcat-box-macos-arm64-v0.4.0.dmg
    tailcat-box-macos-amd64-v0.4.0.dmg

Linux jobs publish a tarball and a Debian package from the bare binary:

    tailcat-box-linux-amd64-v0.4.0.tar.gz   tailcat-box, .desktop, icon, install.sh
    tailcat-box-linux-amd64-v0.4.0.deb      /usr/bin, applications, pixmaps

``version`` keeps the leading ``v`` from the git tag.
"""

from __future__ import annotations

import argparse
import io
import os
import re
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path


VOLUME_NAME = "Tailcat Box"
PORTABLE_EXE_NAME = "tailcat-box.exe"
LINUX_BINARY = "tailcat-box"
DEB_DEPENDS = "libwebkit2gtk-4.1-0, libgtk-3-0t64 | libgtk-3-0"
# GStreamer backs WebKitGTK audio/video, so voice notes need these plugins.
DEB_RECOMMENDS = "gstreamer1.0-plugins-good, gstreamer1.0-plugins-bad, gstreamer1.0-nice"
DEB_MAINTAINER = "mushroom11s <28756933+mushroom11s@users.noreply.github.com>"


def normalize_arch(raw: str) -> str:
    value = (raw or "").strip().lower()
    if value in {"arm64", "aarch64", "arm"}:
        return "arm64"
    if value in {"x86_64", "amd64", "x64", "x86"}:
        return "amd64"
    return value or "unknown"


def _require_arch(arch: str) -> str:
    arch = normalize_arch(arch)
    if arch not in {"arm64", "amd64"}:
        raise SystemExit(f"unsupported arch: {arch}")
    return arch


def artifact_name(os_slug: str, arch: str, version: str) -> str:
    """Public installer name. Windows keeps the word installer in the filename."""
    arch = _require_arch(arch)
    if os_slug == "windows":
        return f"tailcat-box-windows-{arch}-installer-{version}.exe"
    if os_slug == "macos":
        return f"tailcat-box-macos-{arch}-{version}.dmg"
    if os_slug == "linux":
        return f"tailcat-box-linux-{arch}-{version}.tar.gz"
    raise SystemExit(f"unsupported os slug: {os_slug}")


def deb_name(arch: str, version: str) -> str:
    return f"tailcat-box-linux-{_require_arch(arch)}-{version}.deb"


def debian_version(version: str) -> str:
    """v1.2.7 -> 1.2.7; v1.2.7-beta.1 -> 1.2.7~beta.1 (sorts before 1.2.7)."""
    raw = version.strip().lstrip("vV")
    raw = raw.replace("-", "~")
    raw = re.sub(r"[^0-9A-Za-z.+~]", ".", raw)
    if not raw or not raw[0].isdigit():
        raw = f"0.0.0~{raw}"
    return raw


def portable_exe_name(os_slug: str, arch: str, version: str) -> str:
    """Public Windows portable name. A bare runnable exe, not a zip."""
    arch = _require_arch(arch)
    if os_slug != "windows":
        raise SystemExit(f"portable exe is windows-only: {os_slug}")
    return f"tailcat-box-windows-{arch}-{version}.exe"


def detect_arch() -> str:
    if os.environ.get("RUNNER_OS", "").lower() == "windows" or os.name == "nt":
        env_arch = os.environ.get("PROCESSOR_ARCHITECTURE", "")
        mapped = normalize_arch(env_arch)
        if mapped != "unknown":
            return mapped
    return normalize_arch(platform.machine())


def find_macos_app(bin_dir: Path) -> Path:
    if not bin_dir.is_dir():
        raise SystemExit(f"missing build output directory: {bin_dir}")
    apps = sorted(p for p in bin_dir.iterdir() if p.suffix == ".app" and p.is_dir())
    if len(apps) == 1:
        return apps[0]
    if not apps:
        raise SystemExit(f"no .app bundle found in {bin_dir}")
    raise SystemExit(f"expected one .app bundle in {bin_dir}, found {len(apps)}")


def is_arch_installer(name: str, arch: str) -> bool:
    lower = name.lower()
    suffix = f"-{arch}-installer.exe"
    # Reject a combined amd64_arm64 installer; each matrix cell ships one arch.
    return lower.endswith(suffix) and not lower.endswith(f"_{arch}-installer.exe")


def is_nsis_installer(name: str) -> bool:
    return name.lower().endswith("-installer.exe")


def find_windows_installer(bin_dir: Path, arch: str) -> Path:
    if not bin_dir.is_dir():
        raise SystemExit(f"missing build output directory: {bin_dir}")
    arch = normalize_arch(arch)
    matches = sorted(
        p for p in bin_dir.iterdir() if p.is_file() and is_arch_installer(p.name, arch)
    )
    if len(matches) == 1:
        return matches[0]
    if not matches:
        raise SystemExit(
            f"no NSIS installer for {arch} in {bin_dir}. "
            "Install NSIS so makensis is on PATH, then run `wails build -nsis`."
        )
    names = ", ".join(p.name for p in matches)
    raise SystemExit(f"expected one {arch} NSIS installer in {bin_dir}, found: {names}")


def find_windows_portable_exe(bin_dir: Path) -> Path:
    """The double-clickable app, not the NSIS setup sitting next to it."""
    if not bin_dir.is_dir():
        raise SystemExit(f"missing build output directory: {bin_dir}")
    exes = sorted(
        p
        for p in bin_dir.iterdir()
        if p.is_file() and p.suffix.lower() == ".exe" and not is_nsis_installer(p.name)
    )
    preferred = [p for p in exes if p.name.lower() == PORTABLE_EXE_NAME]
    chosen = preferred or exes
    if len(chosen) == 1:
        return chosen[0]
    if not exes:
        raise SystemExit(
            f"no portable .exe in {bin_dir}. "
            "`wails build -nsis` leaves tailcat-box.exe next to the NSIS setup."
        )
    names = ", ".join(p.name for p in exes)
    raise SystemExit(f"expected one portable exe in {bin_dir}, found: {names}")


def copy_bundle(src: Path, dest: Path) -> None:
    if shutil.which("ditto"):
        subprocess.run(["ditto", str(src), str(dest)], check=True)
        return
    shutil.copytree(src, dest, symlinks=True)


def stage_macos_layout(app: Path, staging: Path) -> None:
    """Place the app and an Applications symlink at the disk-image root."""
    copy_bundle(app, staging / app.name)
    applications = staging / "Applications"
    applications.symlink_to("/Applications")


def create_dmg(staging: Path, dest: Path, volume_name: str) -> None:
    if shutil.which("hdiutil") is None:
        raise SystemExit("hdiutil is required to build the macOS disk image")
    if dest.exists():
        dest.unlink()
    # Stock hdiutil. Finder AppleScript layout hangs on headless GitHub runners,
    # so the image root is just the .app plus the Applications symlink.
    subprocess.run(
        [
            "hdiutil",
            "create",
            "-volname",
            volume_name,
            "-srcfolder",
            str(staging),
            "-ov",
            "-format",
            "UDZO",
            str(dest),
        ],
        check=True,
    )


def package_macos_dmg(app: Path, dest: Path, volume_name: str = VOLUME_NAME) -> None:
    staging = Path(tempfile.mkdtemp(prefix="tailcat-dmg-"))
    try:
        stage_macos_layout(app, staging)
        create_dmg(staging, dest, volume_name)
    finally:
        shutil.rmtree(staging)


def package_windows_installer(bin_dir: Path, dest: Path, arch: str) -> None:
    installer = find_windows_installer(bin_dir, arch)
    if dest.exists():
        dest.unlink()
    shutil.copy2(installer, dest)


def package_windows_portable(bin_dir: Path, dest: Path) -> None:
    """Copy the runnable exe to the public portable name. No zip."""
    app = find_windows_portable_exe(bin_dir)
    if dest.exists():
        dest.unlink()
    shutil.copy2(app, dest)


def find_linux_binary(bin_dir: Path) -> Path:
    binary = bin_dir / LINUX_BINARY
    if not binary.is_file():
        raise SystemExit(f"missing Linux binary: {binary}")
    return binary


def _add_file(tar: tarfile.TarFile, name: str, data: bytes, mode: int) -> None:
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mode = mode
    info.mtime = int(time.time())
    tar.addfile(info, io.BytesIO(data))


def package_linux_tarball(binary: Path, linux_dir: Path, icon: Path, dest: Path) -> None:
    """One top-level folder named like the tarball, so extracting is tidy."""
    top = dest.name[: -len(".tar.gz")]
    if dest.exists():
        dest.unlink()
    with tarfile.open(dest, "w:gz") as tar:
        _add_file(tar, f"{top}/{LINUX_BINARY}", binary.read_bytes(), 0o755)
        _add_file(tar, f"{top}/install.sh", (linux_dir / "install.sh").read_bytes(), 0o755)
        _add_file(tar, f"{top}/tailcat-box.desktop", (linux_dir / "tailcat-box.desktop").read_bytes(), 0o644)
        _add_file(tar, f"{top}/tailcat-box.png", icon.read_bytes(), 0o644)


def deb_control(version: str, arch: str, installed_kb: int) -> str:
    return (
        "Package: tailcat-box\n"
        f"Version: {debian_version(version)}\n"
        f"Architecture: {_require_arch(arch)}\n"
        f"Maintainer: {DEB_MAINTAINER}\n"
        f"Installed-Size: {installed_kb}\n"
        f"Depends: {DEB_DEPENDS}\n"
        f"Recommends: {DEB_RECOMMENDS}\n"
        "Section: net\n"
        "Priority: optional\n"
        "Homepage: https://github.com/mushroom11s/Tailcat-Box\n"
        "Description: Desktop GUI for Tailscale Tailcat\n"
        " Chat rooms, voice notes, Mew Share file transfer, port tunnels, and SSH over Tailcat.\n"
    )


def package_linux_deb(binary: Path, linux_dir: Path, icon: Path, dest: Path, version: str, arch: str) -> None:
    if shutil.which("dpkg-deb") is None:
        raise SystemExit("dpkg-deb is required to build the .deb")
    root = Path(tempfile.mkdtemp(prefix="tailcat-deb-"))
    try:
        files = {
            root / "usr/bin" / LINUX_BINARY: (binary, 0o755),
            root / "usr/share/applications/tailcat-box.desktop": (linux_dir / "tailcat-box.desktop", 0o644),
            root / "usr/share/pixmaps/tailcat-box.png": (icon, 0o644),
        }
        size = 0
        for target, (src, mode) in files.items():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, target)
            target.chmod(mode)
            size += target.stat().st_size
        control = root / "DEBIAN/control"
        control.parent.mkdir()
        control.write_text(deb_control(version, arch, (size + 1023) // 1024))
        for d in [root, *[p for p in root.rglob("*") if p.is_dir()]]:
            d.chmod(0o755)
        if dest.exists():
            dest.unlink()
        subprocess.run(["dpkg-deb", "--root-owner-group", "--build", str(root), str(dest)], check=True)
    finally:
        shutil.rmtree(root)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True)
    parser.add_argument("--os-slug", required=True, choices=("macos", "windows", "linux"))
    parser.add_argument("--arch", default="", help="amd64 or arm64. Defaults to this machine.")
    parser.add_argument("--bin-dir", default="build/bin")
    parser.add_argument("--out-dir", default="dist-upload")
    parser.add_argument("--volume-name", default=VOLUME_NAME)
    parser.add_argument("--linux-dir", default="build/linux")
    parser.add_argument("--icon", default="build/appicon.png")
    args = parser.parse_args()

    bin_dir = Path(args.bin_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    arch = args.arch or detect_arch()
    if args.os_slug == "windows":
        # Resolve both inputs before writing, so a missing file does not leave
        # a half-published dist-upload directory.
        find_windows_installer(bin_dir, arch)
        find_windows_portable_exe(bin_dir)
        installer = out_dir / artifact_name(args.os_slug, arch, args.version)
        portable = out_dir / portable_exe_name(args.os_slug, arch, args.version)
        package_windows_installer(bin_dir, installer, arch)
        package_windows_portable(bin_dir, portable)
        print(installer)
        print(portable)
    elif args.os_slug == "linux":
        binary = find_linux_binary(bin_dir)
        linux_dir, icon = Path(args.linux_dir), Path(args.icon)
        tarball = out_dir / artifact_name(args.os_slug, arch, args.version)
        deb = out_dir / deb_name(arch, args.version)
        package_linux_tarball(binary, linux_dir, icon, tarball)
        package_linux_deb(binary, linux_dir, icon, deb, args.version, arch)
        print(tarball)
        print(deb)
    else:
        dest = out_dir / artifact_name(args.os_slug, arch, args.version)
        package_macos_dmg(find_macos_app(bin_dir), dest, args.volume_name)
        print(dest)
    return 0


if __name__ == "__main__":
    sys.exit(main())
