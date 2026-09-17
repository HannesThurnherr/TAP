# Text → portable prompt → JSON → animation

This is the primary text-authoring workflow. The app assembles a self-contained prompt, the user chooses the external LLM, and the app validates the returned JSON before applying it. There is no provider account, API key, server call, or automatic transmission of the description. The application remains usable for drawing and JSON editing.

Open **Manöver aus Text** in the top bar:

1. Paste the maneuver description, review automatic place matches, add optional coordinate/location notes and additional animation instructions, and choose the animation duration.
2. Copy the prompt. It contains the complete rule guide, area context, optional named scene references, one valid example, and the user's text encoded separately as JSON data.
3. Paste it into the LLM of choice. Bring back the full JSON response.
4. Review validation errors, element/phase/shot counts, duration, and model-authored assumptions. **Animation laden** replaces the current animation in one undoable action. Supplied camera shots are enabled. JSON fenced responses are accepted; prose around JSON is not silently discarded.

If validation fails, the app can copy concise correction feedback for the same LLM conversation. The existing JSON panel uses the same validator. Clipboard failure offers a selectable full-prompt preview for manual copying. Draft input remains while closing/reopening the dialog during the current app session; it is not yet saved across a browser reload.

## Keeping the language small

The authoring contract is `src/model/authoring.ts` (`AUTHORING_RULES`), also exported to `JSON_AUTHORING.md`. It uses the current version-0 config and deliberately teaches only canonical choices:

- one root, one LV95 coordinate system for terrain entities, one seconds clock;
- shared visibility fields and a small set of entity-specific fields;
- explicit static/draw arrows;
- unified units with position keyframes and linked movement arrows; legacy vehicle configurations remain supported;
- a gentle orbit per phase for guided scenes, with empty shots allowed for free-camera output;
- defaults for nonessential properties, with full options available in the compact reference.

The importer supplies compatibility fields used internally, and the original Äuli scene remains loadable. New editor features should first reuse this contract; do not add overlapping timing vocabularies to LLM instructions. Update the contract, validator, example, tests, and generated guide together when changing the authoring surface. Future incompatible coordinate/timing changes need a new version and explicit migration.

The UI estimates the fixed guide and complete prompt sizes and warns above approximately 12,000 tokens. The estimate is character-based and varies by model. Named references are limited to 60; the context reports omitted references. Descriptions are never silently truncated. The published guide is checked against `AUTHORING_RULES` by the test suite.

## Spatial grounding

The initial Äuli example is a preview, not a geographic restriction. Models can define `area.bounds` around verified locations; TAP validates and loads the new region after import. Rectangles up to 100 km per side are supported. Above 8 km, a flat map avoids terrain/building downloads. Partial elevation coverage leaves unmeshed gaps rather than discarding all available data.

The dialog shares the initial map's swisstopo search. Uppercase place candidates are extracted automatically, and users can also select words or phrases to search and append an LV95 anchor. Only search terms go to swisstopo, not the full description. Review ambiguous matches before copying the prompt. The prompt asks the external model to research unresolved real-world anchors and disclose schematic geometry; it does not require permission to leave the current preview region. Routes are not automatically calculated.

`Zusätzliche Anweisungen für die Animation` is an optional user-entered field for camera, pacing, captions and presentation preferences. `buildAuthoringPrompt` appends it as a separate section. These instructions are generated from the user's input, not stored as a fixed standalone file.

## Verification

The tests exercise the copied prompt contract, its budget, every entity family, defaults, legacy scene import, malformed/unknown fields, bad timing/geometry, broken references, and assumptions. Browser checks cover description entry, actual clipboard content, error/disabled-import behavior, valid sample import, and rendered output with no console errors. This validates the app-side workflow; quality across external LLMs still needs evaluation using representative maneuver descriptions and their responses.

## Visual coverage

The guide requires a per-action coverage check: actual unit keyframes for movement, barrier/obstacle lines for described obstructions, and notes for missing inputs or unsupported effects. Schematic geometry does not authorize invented tactical actions. External-model compliance still requires evaluation.
