# WebKitGTK with WebRTC (full Linux package)

Distro and GNOME-runtime WebKitGTK builds leave WebRTC out, so
`RTCPeerConnection` is missing and calls cannot work. The full Linux package
(`tailcat-box-linux-<arch>-<tag>-full.tar.gz`) bundles a private WebKitGTK
4.1 built with `-DENABLE_WEB_RTC=ON` (GStreamer backend).

Files here are Git LFS objects (see `.gitattributes`):

    webkitgtk-webrtc-<version>-linux-<arch>.tar.zst

Each archive holds one `webkit/` folder:

    webkit/lib/             libwebkit2gtk-4.1.so.0, libjavascriptcoregtk-4.1.so.0 (RPATH $ORIGIN)
    webkit/libexec/         WebKitWebProcess, WebKitNetworkProcess, ... (RPATH $ORIGIN/../lib)
    webkit/injected-bundle/ libwebkit2gtkinjectedbundle.so

The app sets `WEBKIT_EXEC_PATH` and `WEBKIT_INJECTED_BUNDLE_PATH` to these
folders at startup. Release WebKit ignores `WEBKIT_EXEC_PATH`, so the build
applies `exec-path.patch` (one moved `#if`) to honor it.
`gst124-request-pad.patch` works around GStreamer 1.24 (Ubuntu 24.04)
webrtcbin: name sink pads after the SDP m-line, paper over the inverted
codec-preferences match, and ignore unassociated transceivers when
counting expected incoming tracks so media can start.

The release workflow checks this folder out with LFS. When an archive exists
for the job's arch, `scripts/package-wails-artifact.py` adds the full
tarball; otherwise it skips it.

Build an archive with the **WebKitGTK prebuilt (WebRTC)** workflow
(`.github/workflows/webkit-prebuilt.yml`, run by hand). It builds on
Ubuntu 24.04, the same base as the release binaries, so the libraries match
(ICU 74, GStreamer 1.24, glibc 2.39). Download the artifact and commit it
here. Do not commit an archive built on a newer distro: it links newer ICU
and glibc and will not load on Ubuntu 24.04.

At runtime the system still provides GTK 3, libsoup 3, and GStreamer. Calls
need the GStreamer WebRTC plugins: on Debian/Ubuntu,
`gstreamer1.0-plugins-bad gstreamer1.0-plugins-good gstreamer1.0-nice`.
