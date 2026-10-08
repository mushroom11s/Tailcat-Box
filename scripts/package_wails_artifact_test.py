#!/usr/bin/env python3
"""Tests for release installer naming and packaging. No hdiutil required."""

from __future__ import annotations

import importlib.util
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path


def load_module():
    path = Path(__file__).with_name("package-wails-artifact.py")
    spec = importlib.util.spec_from_file_location("package_wails_artifact", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pkg = load_module()
SCRIPT = Path(__file__).with_name("package-wails-artifact.py")


class ArtifactNameTest(unittest.TestCase):
    def test_release_names(self) -> None:
        self.assertEqual(
            pkg.artifact_name("windows", "amd64", "v0.4.0"),
            "tailcat-box-windows-amd64-installer-v0.4.0.exe",
        )
        self.assertEqual(
            pkg.artifact_name("windows", "arm64", "v0.4.0"),
            "tailcat-box-windows-arm64-installer-v0.4.0.exe",
        )
        self.assertEqual(
            pkg.portable_exe_name("windows", "amd64", "v0.4.0"),
            "tailcat-box-windows-amd64-v0.4.0.exe",
        )
        self.assertEqual(
            pkg.portable_exe_name("windows", "arm64", "v0.4.0"),
            "tailcat-box-windows-arm64-v0.4.0.exe",
        )
        self.assertEqual(
            pkg.artifact_name("macos", "arm64", "v0.4.0"),
            "tailcat-box-macos-arm64-v0.4.0.dmg",
        )
        self.assertEqual(
            pkg.artifact_name("macos", "amd64", "v0.4.0"),
            "tailcat-box-macos-amd64-v0.4.0.dmg",
        )

    def test_arch_aliases_keep_version_prefix(self) -> None:
        self.assertEqual(
            pkg.artifact_name("macos", "x86_64", "v0.4.0"),
            "tailcat-box-macos-amd64-v0.4.0.dmg",
        )
        self.assertEqual(
            pkg.artifact_name("windows", "aarch64", "dev-abc1234"),
            "tailcat-box-windows-arm64-installer-dev-abc1234.exe",
        )
        self.assertEqual(
            pkg.portable_exe_name("windows", "x64", "dev-abc1234"),
            "tailcat-box-windows-amd64-dev-abc1234.exe",
        )


class WindowsPackageTest(unittest.TestCase):
    def test_ships_labeled_installer_and_bare_portable_exe(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            bin_dir = root / "bin"
            out_dir = root / "out"
            bin_dir.mkdir()
            (bin_dir / "tailcat-box.exe").write_bytes(b"app-exe")
            (bin_dir / "WebView2Loader.dll").write_bytes(b"sidecar-dll")
            (bin_dir / "tailcat-box-amd64-installer.exe").write_bytes(b"setup-amd64")
            (bin_dir / "tailcat-box-arm64-installer.exe").write_bytes(b"setup-arm64")
            (bin_dir / "tailcat-box-amd64_arm64-installer.exe").write_bytes(b"combined")

            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--version",
                    "v0.4.0",
                    "--os-slug",
                    "windows",
                    "--arch",
                    "amd64",
                    "--bin-dir",
                    str(bin_dir),
                    "--out-dir",
                    str(out_dir),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            installer = out_dir / "tailcat-box-windows-amd64-installer-v0.4.0.exe"
            portable = out_dir / "tailcat-box-windows-amd64-v0.4.0.exe"
            self.assertEqual(installer.read_bytes(), b"setup-amd64")
            self.assertEqual(portable.read_bytes(), b"app-exe")
            self.assertEqual(
                sorted(p.name for p in out_dir.iterdir()),
                [installer.name, portable.name],
            )
            self.assertEqual(list(out_dir.glob("*.zip")), [])

    def test_arm64_installer_is_separate_from_the_portable_exe(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            bin_dir = root / "bin"
            out_dir = root / "out"
            bin_dir.mkdir()
            (bin_dir / "tailcat-box.exe").write_bytes(b"app-exe")
            (bin_dir / "tailcat-box-amd64-installer.exe").write_bytes(b"setup-amd64")
            (bin_dir / "tailcat-box-arm64-installer.exe").write_bytes(b"setup-arm64")

            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--version",
                    "v0.4.0",
                    "--os-slug",
                    "windows",
                    "--arch",
                    "arm64",
                    "--bin-dir",
                    str(bin_dir),
                    "--out-dir",
                    str(out_dir),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            installer = out_dir / "tailcat-box-windows-arm64-installer-v0.4.0.exe"
            portable = out_dir / "tailcat-box-windows-arm64-v0.4.0.exe"
            self.assertEqual(installer.read_bytes(), b"setup-arm64")
            self.assertEqual(portable.read_bytes(), b"app-exe")
            self.assertEqual(list(out_dir.glob("*.zip")), [])

    def test_missing_portable_exe_fails(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            bin_dir = root / "bin"
            bin_dir.mkdir()
            (bin_dir / "tailcat-box-amd64-installer.exe").write_bytes(b"setup-amd64")
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--version",
                    "v0.4.0",
                    "--os-slug",
                    "windows",
                    "--arch",
                    "amd64",
                    "--bin-dir",
                    str(bin_dir),
                    "--out-dir",
                    str(root / "out"),
                ],
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("portable", result.stderr + result.stdout)
            self.assertEqual(list((root / "out").glob("*")), [])

    def test_missing_installer_fails(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            bin_dir = root / "bin"
            bin_dir.mkdir()
            (bin_dir / "tailcat-box.exe").write_bytes(b"app-exe")
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--version",
                    "v0.4.0",
                    "--os-slug",
                    "windows",
                    "--arch",
                    "arm64",
                    "--bin-dir",
                    str(bin_dir),
                    "--out-dir",
                    str(root / "out"),
                ],
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("NSIS", result.stderr + result.stdout)


class MacStageTest(unittest.TestCase):
    def test_layout_has_app_and_applications_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            app = root / "tailcat-box.app"
            contents = app / "Contents"
            contents.mkdir(parents=True)
            (contents / "Info.plist").write_text("plist", encoding="utf-8")
            staging = root / "stage"
            staging.mkdir()
            pkg.stage_macos_layout(app, staging)
            staged = staging / "tailcat-box.app" / "Contents" / "Info.plist"
            self.assertEqual(staged.read_text(encoding="utf-8"), "plist")
            link = staging / "Applications"
            self.assertTrue(link.is_symlink())
            self.assertEqual(os_readlink(link), "/Applications")


class LinuxPackageTest(unittest.TestCase):
    def test_names_and_debian_version(self) -> None:
        self.assertEqual(
            pkg.artifact_name("linux", "x86_64", "v1.2.7"),
            "tailcat-box-linux-amd64-v1.2.7.tar.gz",
        )
        self.assertEqual(pkg.deb_name("aarch64", "v1.2.7"), "tailcat-box-linux-arm64-v1.2.7.deb")
        self.assertEqual(pkg.debian_version("v1.2.7"), "1.2.7")
        self.assertEqual(pkg.debian_version("v1.2.7-beta.1"), "1.2.7~beta.1")
        self.assertEqual(pkg.debian_version("dev-abc1234"), "0.0.0~dev~abc1234")

    def _fixture(self, root: Path) -> tuple[Path, Path, Path]:
        bin_dir = root / "bin"
        bin_dir.mkdir()
        (bin_dir / "tailcat-box").write_bytes(b"ELF")
        repo = Path(__file__).resolve().parent.parent
        return bin_dir, repo / "build" / "linux", repo / "build" / "appicon.png"

    def test_tarball_has_one_folder_with_executable_files(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            bin_dir, linux_dir, icon = self._fixture(root)
            dest = root / pkg.artifact_name("linux", "amd64", "v1.2.7")
            pkg.package_linux_tarball(pkg.find_linux_binary(bin_dir), linux_dir, icon, dest)
            with tarfile.open(dest) as tar:
                members = {m.name: m for m in tar.getmembers()}
            top = "tailcat-box-linux-amd64-v1.2.7"
            self.assertEqual(
                sorted(members),
                sorted(f"{top}/{n}" for n in ["tailcat-box", "install.sh", "tailcat-box.desktop", "tailcat-box.png"]),
            )
            self.assertEqual(members[f"{top}/tailcat-box"].mode, 0o755)
            self.assertEqual(members[f"{top}/install.sh"].mode, 0o755)

    @unittest.skipIf(shutil.which("dpkg-deb") is None, "dpkg-deb not installed")
    def test_deb_installs_binary_desktop_entry_and_icon(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            bin_dir, linux_dir, icon = self._fixture(root)
            dest = root / pkg.deb_name("amd64", "v1.2.7-beta.1")
            pkg.package_linux_deb(pkg.find_linux_binary(bin_dir), linux_dir, icon, dest, "v1.2.7-beta.1", "amd64")
            listing = subprocess.run(["dpkg-deb", "-c", str(dest)], capture_output=True, text=True, check=True).stdout
            for path in ["./usr/bin/tailcat-box", "./usr/share/applications/tailcat-box.desktop", "./usr/share/pixmaps/tailcat-box.png"]:
                self.assertIn(path, listing)
            version = subprocess.run(["dpkg-deb", "-f", str(dest), "Version"], capture_output=True, text=True, check=True).stdout
            self.assertEqual(version.strip(), "1.2.7~beta.1")

    def test_lfs_pointer_and_missing_archive(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            self.assertIsNone(pkg.find_webkit_archive(root, "amd64"))
            (root / "webkitgtk-webrtc-2.54.1-linux-amd64.tar.zst").write_text(
                "version https://git-lfs.github.com/spec/v1\noid sha256:00\nsize 1\n"
            )
            with self.assertRaises(SystemExit):
                pkg.find_webkit_archive(root, "amd64")

    @unittest.skipIf(
        not (shutil.which("patchelf") and shutil.which("zstd") and Path("/bin/true").is_file()),
        "patchelf/zstd not installed",
    )
    def test_full_tarball_bundles_webkit_and_sets_rpath(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            _, linux_dir, icon = self._fixture(root)
            binary = root / "tailcat-box"
            shutil.copyfile("/bin/true", binary)
            src = root / "src"
            (src / "webkit" / "libexec").mkdir(parents=True)
            (src / "webkit" / "libexec" / "WebKitWebProcess").write_bytes(b"x")
            wk = root / "wk"
            wk.mkdir()
            archive = wk / "webkitgtk-webrtc-2.54.1-linux-amd64.tar.zst"
            subprocess.run(["tar", "--zstd", "-cf", str(archive), "-C", str(src), "webkit"], check=True)
            self.assertEqual(pkg.find_webkit_archive(wk, "amd64"), archive)
            dest = root / pkg.full_artifact_name("amd64", "v1.2.7")
            self.assertEqual(dest.name, "tailcat-box-linux-amd64-v1.2.7-full.tar.gz")
            pkg.package_linux_full(binary, linux_dir, icon, archive, dest)
            out = root / "out"
            with tarfile.open(dest) as tar:
                names = tar.getnames()
                tar.extractall(out)
            top = "tailcat-box-linux-amd64-v1.2.7-full"
            self.assertIn(f"{top}/webkit/libexec/WebKitWebProcess", names)
            self.assertIn(f"{top}/install.sh", names)
            rpath = subprocess.run(
                ["patchelf", "--print-rpath", str(out / top / "tailcat-box")], capture_output=True, text=True, check=True
            ).stdout.strip()
            self.assertEqual(rpath, "$ORIGIN/webkit/lib")


def os_readlink(path: Path) -> str:
    return str(path.readlink())


if __name__ == "__main__":
    unittest.main()
