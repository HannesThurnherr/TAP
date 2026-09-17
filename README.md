# TAP — Tactical Animation Planner

TAP turns maneuver descriptions and manually drawn elements into animations over Swiss terrain or maps. The editor supports units, movement paths, engagements, Swiss military symbols, phases, camera shots, screenshots and video export.

This is a private repository. Repository files and release downloads are available only to the owner and invited collaborators. Raw footage, older prototypes, local exercises, caches and developer settings are kept outside version control.

## Install and run

Download **v0.1.10** from [Releases](https://github.com/HannesThurnherr/TAP/releases/latest):

| Package | Machine |
| --- | --- |
| `TAP-0.1.10-macOS-universal.zip` | macOS 13+, Apple Silicon or Intel |
| `TAP-0.1.10-Windows-x64.zip` | Windows 10/11, Intel or AMD x64 |
| `TAP-0.1.10-Windows-arm64.zip` | Windows on ARM64 |

Each ZIP includes `README.txt` with setup, first-launch and troubleshooting instructions. Mac: extract, move `TAP.app` to Applications, then open it. Windows: extract the appropriate ZIP and open `TAP.exe`. The app starts a local server and opens the editor in the browser. Recipients do not need developer tools. See the full [installation guide](app/desktop/README.txt).

Mac builds are ad-hoc signed, not notarized. Windows builds are unsigned and cross-compiled; execution on Windows has not yet been verified. New terrain and map searches require internet access. The included Äuli example terrain is bundled.

Use **Projekt speichern** to keep your work in a portable `.tap.json` file and **Projekt öffnen…** to reopen it. The file records the animation and terrain selection; downloaded terrain is fetched again when needed.

## Copy a prompt for an external AI model

The copyable format instructions are in **[JSON_AUTHORING.md](app/docs/JSON_AUTHORING.md)**. Copy the contract starting at `TAP AUTHORING CONTRACT`, then add the maneuver description and any location or presentation preferences.

For a complete prompt with scene context, use **Manöver aus Text / LLM → Prompt erstellen → Prompt kopieren** in TAP. Enter the description, review place matches and optionally fill **Zusätzliche Anweisungen für die Animation**. TAP combines these inputs with the format rules and a valid JSON example. Paste the result into your chosen model, then bring its JSON back to **JSON einfügen**.

The source is [`AUTHORING_RULES` and `buildAuthoringPrompt`](app/web/src/model/authoring.ts); the input fields live in [ManeuverExchange.tsx](app/web/src/ui/ManeuverExchange.tsx). The current prompt contract is **0.1.9**; the app release is **0.1.10**. The rendering fix in 0.1.10 did not change the JSON schema.

## Develop locally

Verified with Node.js **24.15.0** and pnpm **12.3.4**. From the repository root:

```sh
pnpm --dir app/web install --frozen-lockfile
pnpm --dir app/web dev
```

Open the local URL printed by Vite (default `http://127.0.0.1:5180/`). The port must be free. All required example terrain, fonts, decoding assets and icons are included in this repository.

```sh
pnpm --dir app/web test
pnpm --dir app/web build
```

The web suite currently has 73 tests. Desktop packaging on macOS additionally requires Xcode Command Line Tools, Python 3 and Go 1.24+. Build instructions and platform limitations are in [app/desktop/README.md](app/desktop/README.md).

```sh
python3 app/desktop/build.py
```

Packaging runs web tests/build, creates Mac Universal and Windows packages, and tests the extracted Mac app. Generated binaries, developer toolchains and dependencies are ignored by Git; installers belong in GitHub Releases.

## Project layout

- `app/web/src`: React/TypeScript editor, Three.js rendering, map services, model and prompt contract.
- `app/web/tests`: model, geometry and import regression tests.
- `app/web/public`: required bundled assets and the Äuli terrain example.
- `app/desktop`: Swift launcher, Go local server and packaging scripts.
- `app/docs`: feature and data documentation; older design notes may describe earlier versions.

Map data attribution remains visible in the app. Bundled third-party fonts and Draco assets include their license notices; desktop builds also collect dependency notices in `THIRD-PARTY-NOTICES.txt`. Swiss symbols are an implemented subset, not a certification of standard compliance.
