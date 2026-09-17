# TAP desktop distribution

TAP means **Tactical Animation Planner**. Its icon is the user-supplied image copied unchanged to
[assets/tap-icon.png](assets/tap-icon.png). See [assets/TAP_ICON.txt](assets/TAP_ICON.txt) for provenance.

## Deliverables

`dist/TAP-0.1.10-macOS-universal.zip` contains a native Swift/AppKit launcher and a Go
HTTP server with the production web build embedded in the executable. Both native
binaries are Universal (arm64 + x86_64), target macOS 13+, and are ad-hoc signed.
No paths to the repository, Node/Python runtime, development server, or package manager
are needed at runtime. The native launcher opens Chrome/Edge when available, otherwise
the default browser; closing the launcher hides its window; explicit Quit stops its child server. The child also watches
its parent so it exits if the launcher crashes. Fonts and Äuli data are bundled.

Windows x64 and ARM64 ZIPs contain portable `TAP.exe` binaries with icon/version/manifest
resources. They open the default browser and retain a console window for lifecycle control.
They require no installation or administrator access. Windows execution remains unverified.

Only 127.0.0.1 is bound. Port 8780 is preferred; an existing matching TAP version is reused,
while a port owned by another service causes an ephemeral-port fallback. The server exposes
only bundled assets and a health endpoint. Host and Origin checks reject remote origins;
no write API, file browser, shell endpoint, or source directory is served.

This is private unsigned/notarization-free distribution, not an App Store release. See the
recipient-facing [README.txt](README.txt) for first-run instructions, limitations, and the
app-specific quarantine command. Never globally disable macOS security protections.

## Rebuild on macOS

Prerequisites for the builder only: Xcode Command Line Tools (`swiftc`, `lipo`, `codesign`,
`iconutil`, `sips`), Python 3, pnpm with web dependencies installed, and Go 1.24+.
The build used Go 1.27.1 from go.dev, with its published SHA-256 verified before extraction.
`build.py` finds Go on PATH or `.tools/go/bin/go`; `TAP_GO` can point to another Go executable.
The Windows resource tool is pinned to github.com/tc-hib/go-winres v0.3.3.

```sh
pnpm --dir app/web install --frozen-lockfile
python3 app/desktop/build.py
python3 app/desktop/smoke.py
```

`--skip-web` packages the existing `app/web/dist` snapshot. Version is defined in `build.py`,
`winres.json`, and the recipient README; update them together for a new release. Browser
bundles are immutable snapshots: later source edits do not alter an already-built app.
Third-party notices and release ZIP checksums are generated alongside the binaries.

## Verification performed

- Web suite: 73 tests pass, including straight 3D fire geometry and unchanged terrain-following movement ribbons; production TypeScript/Vite build passes.
- Go server tests: bundled routes, read-only methods, local Host/Origin restrictions, no
  directory traversal/listings, DEM byte-range requests.
- Extracted Mac ZIP to a temporary path containing spaces, started with only system PATH
  (no developer tools), verified HTML/assets/fonts/DEM/decoder and repeat-launch reuse.
- Started the extracted native launcher with that minimal environment and verified exit.
- Opened the actual packaged app, inspected its native controls, loaded Äuli in the packaged
  browser editor, and successfully generated a 3-second 720p/25 fps MP4 with phase title HUD.
- Both Mac architecture slices and code signatures checked; Windows PE machine types and
  embedded icon resources checked. No Intel Mac or Windows machine was available to execute
  those architecture builds.

## Important product limit

Project Save/Open uses portable .tap.json files with maneuver configuration, terrain source,
selection rectangle/rotation, and ground display settings. Local recovery is browser/origin-specific.
Terrain geometry is not embedded; custom terrain reloads from swisstopo when opened.
Map/search and new terrain/building downloads use external services. The runtime does not include
personal browser state, credentials, or unrelated workspace assets.

Successful builds smoke-test the new Mac package, then remove older TAP/Azim release ZIPs
and legacy Azim binaries from dist. Current TAP binaries remain; checksums cover the current ZIPs.

Swiss symbology: see `../docs/SWISS_SYMBOLOGY.md`. The bundled Symbolreferenz page identifies release 0.1.10; the authoring contract remains 0.1.9 (no schema change).

Release 0.1.10 fixes direct-fire rendering: both the engagement strip and tracer lanes interpolate endpoint heights in 3D instead of following intervening terrain. Existing horizontal control points and occlusion settings remain supported. Movement ribbons and mortar arcs keep their existing rendering.

The Hölzli project was also checked in the browser at an active engagement frame with the aerial ground view; no console errors were reported. The new Mac package passed extraction, server, asset, signature and launcher smoke checks. Windows binaries were rebuilt but remain untested on Windows.
