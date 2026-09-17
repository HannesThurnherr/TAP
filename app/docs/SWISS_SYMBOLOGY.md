# Swiss symbology in TAP 0.1.7

This release implements a practical subset of the supplied **Reglement 52.002.04, APM Symbole (2012)**. Page numbers below are printed page numbers (add 18 for PDF page numbers). It is a camera-readable 3D adaptation, not a complete or certified implementation of the manual.

## Using it

- Create a unit with **U**. Select it and choose **Symbol wählen** in the inspector for the visual, searchable catalogue. Set affiliation, echelon, headquarters, task force and reinforcement independently.
- Use **P** for lines, **Z** for areas and **D** for point symbols. Choose the Swiss graphic in the toolbar before drawing, or convert a selected existing element in the inspector. Lines and polygons finish with right-click or Enter.
- **Darstellungsstatus → Geplant** authors a planned depiction. Playback never silently changes planned into executed.
- **Symbolreferenz** opens the bundled visual catalogue. Each entry displays one symbol preview with its source page.
- New unit symbols use the existing movement keyframes, dragging, undo, project saving and linked movement arrows. Existing projects keep their original film symbols until explicitly converted.
- The generated LLM prompt is **TAP AUTHORING CONTRACT 0.1.7** and documents every supported symbol code. A small matched abbreviation glossary provides context without rewriting the user's description.

## Included catalogue

| Family | Count | Coverage | Source pages |
|---|---:|---|---|
| Formations | 15 | Infantry, armour, panzergrenadiers, reconnaissance, armoured reconnaissance, artillery, armoured artillery, engineers, signals, logistics, supply, medical, hospital, rescue, anti-tank | 52, 62, 65, 67, 77, 83, 86, 90 |
| Linear graphics | 14 | Phase/departure lines, boundary, movement, motorised/mechanised movement, withdrawal, observation, direction of fire, wire, barrier, anti-tank barrier, fortified line, forward line | 191–202 |
| Areas | 3 | Assembly area, key terrain, strongpoint | 203, 207 |
| Points | 7 | Checkpoint, observation/reconnaissance post, permanent installation, planned demolition, prepared demolition BG 2/BG 3, destroyed object | 151, 158, 176, 181 |

Affiliation frames: friendly, hostile, neutral, unknown. Echelons: none, crew, team, squad, platoon, company, battalion, regiment, brigade, division, corps, army. Additional modifiers: HQ staff, task-force bracket, reinforced/reduced.

The Swiss column controls inclusion. International-only entries such as the plain observation post, contact point, concertina and occupy/retain/secure area graphics are not silently treated as Swiss graphics. The Swiss observation/reconnaissance post includes its diagonal stroke. Red octagons and point annotations in the manual are construction guides and are omitted. Destruction symbols preserve their different slash/dash patterns, including the double crossed pair for a destroyed object.

## Format additions

Existing JSON version 0 remains valid. Add:

```json
{"kind":"unit","id":"u1","pos":[2742500,1219500],"side":"blue","symbol":{"code":"panzergrenadier","echelon":"company","hq":true},"status":"planned"}
```

- `unit.symbol`: `code`, optional `affiliation`, `echelon`, `hq`, `taskForce`, `strength` (`reinforced` or `reduced`). Affiliation defaults from `side`; conflicting explicit values are rejected on import.
- `line.tactical`: catalogue ID. `width` is decoration size in metres, not a measured obstacle dimension. `flip` changes the decoration side; `color` overrides affiliation colour.
- `zone.tactical`: `assembly`, `keyTerrain` or `strongpoint`; polygon coordinates remain ordinary LV95 points.
- `marker.symbol`: catalogue ID. `designation` optionally writes an identifier of at most eight characters inside a checkpoint. Name labels remain outside.
- `status`: `active` or `planned` for these graphics and movement arrows. Demolition IDs encode their own readiness state; change state with separate adjacent time windows.

See [JSON_AUTHORING.md](JSON_AUTHORING.md) for the complete authoring contract and allowed IDs.

## Deliberate limits

- Labels and formation frames face the camera. Their pixels, strokes and ground offsets are chosen for readability in a 3D view, rather than printed map measurements. Planned status on unsupported historical combinations is a TAP depiction convention, not a claim that every combination is specified by the manual.
- Ground graphics follow terrain. Repeated decorations are bounded for performance; very long lines may have wider spacing. Area shapes follow the user polygon rather than forcing an ellipse.
- Formation symbols and point symbols share exact vector data between SVG/editor and canvas/export. Ground graphics are captured from the same Three.js scene. Generic film effects are retained separately.
- The phase legend explains up to eight distinct Swiss symbol variants and displays an overflow count. The reference catalogue provides the full list; it does not currently provide a multi-page exported legend.
- This is not the complete equipment, weapons, aviation, logistics-installation, civil-protection or international catalogue. It does not replace a formal military review of the symbols or their meaning.
- The abbreviation dictionary is a curated contextual subset of 52.002.02, not a full dictionary; ambiguous `Pat` remains flagged for interpretation.

## Verification

64 automated tests passed, including import validation for every catalogue ID, backward compatibility, all affiliation/echelon combinations, SVG/canvas path parity, demolition readiness patterns, bounded geometry and polygon winding, legend filtering, abbreviation boundaries and the LLM prompt size budget. Production TypeScript/Vite build passed. Browser checks covered live placement, the visual picker, hostile panzergrenadiers and company echelon; the reference page was visually inspected. Portable macOS packaging is checked with an extracted-app smoke test. Windows binaries are cross-compiled; runtime verification on Windows still requires a Windows machine.
