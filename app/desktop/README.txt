TAP 0.1.10 — Tactical Animation Planner

MAC (macOS 13 or newer; Apple Silicon and Intel)
1. Extract TAP-0.1.10-macOS-universal.zip.
2. Drag TAP.app into Applications (Programme).
3. Open TAP. It opens the editor in Chrome/Edge if installed, otherwise your default browser.
4. Closing the small TAP launcher hides it; the server continues running.
   Click TAP in the Dock to show it again. Choose Quit to stop the server.
   Closing the browser tab alone does not quit the launcher; "Im Browser öffnen" reopens it.

This private build is ad-hoc signed, not Apple-notarized. On another Mac, first try opening
it, then use System Settings > Privacy & Security > Open Anyway.
Apple's instructions: https://support.apple.com/102445
If that does not work and you trust the package received from its author, this targeted
Terminal command removes quarantine from this app only (no sudo needed for a user-owned app):

  xattr -dr com.apple.quarantine "/Applications/TAP.app"

Then open TAP again. Do not disable Gatekeeper globally.

WINDOWS (Windows 10/11, portable)
Extract the Windows-x64 ZIP and double-click TAP.exe. For ARM Windows use Windows-arm64.
The editor opens in your default browser. Use current Chrome or Edge for video export.
Keep the TAP console window open; close it or press Ctrl+C to quit.
This build is unsigned, so Windows may show a publisher/SmartScreen warning. Only allow
this specific file if you trust its source. No administrator access is required.
The Windows binaries are cross-compiled on macOS; they have not yet been run on Windows.

WHAT'S INCLUDED
The editor, local server/runtime, fonts, Draco decoder and Äuli example terrain are bundled.
Recipients do not need Node, Python, Go, pnpm, Xcode, or the source folder.
Regions up to 100 km per side are supported. Above 8 km, map-only mode skips elevation
and building downloads; it can also be selected manually for smaller areas.
Border terrain loads available heights and leaves uncovered parts unmeshed.
The text workflow extracts uppercase names and searches for coordinate candidates.
Review ambiguous names; the prompt asks your external model to research unresolved locations
and lets it define area.bounds. Search failure is shown rather than silently guessed.
TAP serves only on this machine (127.0.0.1); it does not publish an internet-facing server.
The usual address is http://127.0.0.1:8780/. If that port belongs to another program, TAP
chooses an available port and opens that address. A second launch reuses the same version.

INTERNET / WORK / EXPORT
New maps, search and terrain/building downloads require access to swisstopo's services.
Äuli's included terrain can open without internet. No developer credentials are included.
Use "Projekt speichern" (Cmd/Ctrl+S) to save an editable .tap.json file.
Use "Projekt öffnen" (Cmd/Ctrl+O) on another machine to continue editing.
The file includes the maneuver, camera shots, selected area coordinates/rotation, and ground view.
Terrain geometry is not embedded: custom terrain is downloaded again when opened.
A local recovery copy is offered after reopening in the same browser at the same address.
Recovery is not a portable backup; save a project file before quitting TAP.
LLM-generated maneuver JSON still belongs in "Manöver aus Text / LLM".
A downloaded video does not save editable work.
Video export depends on the browser and GPU; current Chrome/Edge is recommended.

CHECKSUMS / LICENSES
SHA256SUMS.txt beside the release ZIPs records their SHA-256 checksums.
Third-party software licenses are inside the Mac app's Contents/Resources folder and in
the Windows ZIP. Map and terrain attribution remains visible in the app and exports.
