# Entity controls

Parity reference: `overlay/tool/index.html`, `renderProps` and the corresponding drawing functions, plus `overlay/SCHEMA.md`. The original files are unchanged.

All entities expose their ID, name/text, visibility times, terrain/building occlusion, and editable LV95 coordinates. Empty time fields use scenario boundaries. Times accept seconds or `mm:ss.s`, with current-playhead and clear buttons. Every entity appears in the scrollable timeline, including untimed units and lines.

| Entity | Controls |
| --- | --- |
| Unit | Side, six symbols, four echelon sizes, footprint, roof placement, visibility |
| Movement arrow | Side, solid/dashed style, metre width with slider/default reset, smoothing, static or draw-on, draw start/end, separate visibility |
| Fire | Fire/suppress, label, width, horizontal smoothing/control points, visibility; endpoint heights define the 3D path; suppress omits tracers |
| Event marker | Contact, breach, casualty, label, visibility |
| Observation cone | Side, opening angle 10–180°, label, observer/direction/range, visibility |
| Mortar | Arc height relative to ground-track length, flight time, label, firing time, trail end |
| Vehicle/troop | All eight types, side, label, trail, smoothing, departure/arrival, waypoint or progress keys, visibility end, destruction time with wreck and smoke |
| Zone | Five kinds, name, optional color override, activation pulse, visibility |
| Callout | Text/subtitle/color, following or fixed-screen box, roof anchor, attachment to a unit/vehicle, box offset/position, visibility |
| Line | Phase line, barrier, obstacle, supply route, position; name/color, smoothing, barrier width/obstacle tooth size, position-side flip, visibility |

New movement arrows are static by default. Select **Animation → Zwischen zwei Zeiten aufzeichnen**, then set **Zeichnen ab** and **Fertig um**. The completed arrow persists until **Sichtbar bis**. Equal draw times produce an instant arrow; clearing a draw time switches to static. Old v0 scenes without the new animation field keep their existing `buildup` behavior.

Vehicle progress keys use percentages in the UI and fractions in JSON. Repeated progress creates a halt; decreasing progress reverses along the path. Destruction freezes the vehicle at the position at that time, independently of its visibility end. Existing waypoint-index keys remain supported.

Drawing uses left-click control points and right-click or Enter to finish. Right-click does not add a control point. Cone and mortar use two clicks; point entities use one. Escape cancels.

## Adaptation from the video editor

Reference-pixel widths become ground metres; frame numbers become scenario seconds. Optical-flow tracking is replaced by roof placement and explicit attachment to a moving entity. Fixed callout positions are normalized viewport coordinates so they stay in place while the camera or anchor moves. Floating text/symbol labels remain screen overlays; occlusion controls apply to ground/3D graphics as in the original render's floating-label pass.

This is entity-control parity, not an importer for the original video's annotation JSON, nor an implementation of video tracking, section splitting, or render/export workflows. The existing JSON panel continues to use the web app's LV95 config schema.

## Verification

`pnpm --dir app/web test` covers arrow timing, legacy behavior, zero-duration animation, mover range/visibility, pauses/reversals, and time parsing (plus map alignment tests). `pnpm --dir app/web build` checks TypeScript and production bundling.

Browser checks: all ten entity families rendered together without console errors; changed arrow draw times persisted and changed the timeline; static arrows were fully visible at the first frame; vehicle screen position stayed identical at 10/15/20 seconds during a halt and moved backward at 25 seconds; a fixed callout box retained its screen position as its attached vehicle moved; destruction produced the wreck marker.

## Unit position animation

Select a unit, move the timeline playhead, and choose **Ziel bei Playhead im Gelände setzen**, then click the destination. The first destination automatically preserves the original position at the unit's visibility start. Subsequent destinations add or replace a position key at that time. Camera drags do not place keys; Escape cancels placement. **Aktuelle Position als Keyframe** records the currently interpolated position, useful for holds. Each key has editable time and LV95 coordinates, a terrain-placement button, and removal. Diamonds on the unit timeline row mark the keys.

The unit interpolates at constant speed by default; **Übergang** also offers eased movement and held positions with jumps. It stays at the first/last keyed position outside the key range. Repeated positions create halts; destinations can reverse direction. The symbol, selection target, terrain-conforming footprint, and attached callouts follow the animated position. JSON stores `positionKeys: [{time, pos: [E, N]}]` and `interpolation: linear | ease | hold`; units without keys behave as before.

## Mortar rework

The mortar uses a fixed camera-facing ribbon with continuous progress clipping and an additive glow, a bright billboard shot, and a brief launch flash. It follows terrain height plus the configured parabolic arc. A dim completed trail remains until the trail end time, matching the original editor. The shader keeps widths in screen pixels and avoids changing line instance counts during playback. Seeking backward reconstructs the same shot and trail without accumulated state. Mortar/cone placement now commits on the second click (the previous count check used stale pre-click state).

Additional verification: unit placement through the inspector and terrain clicks, interpolation at start/midpoint/end, mortar commit after two clicks, glow/shot at multiple flight times, completed trail, and console checks. Unit interpolation/holds/reversal and mortar launch/flight/trail/scrubbing have automated timing tests.

## Timeline dragging

Drag the middle of an entity bar to shift it in time. Drag its left/right handle to stretch or compress its duration while keeping the opposite end fixed. Hover or select a bar to see the handles. Draw-on times, unit position keys, vehicle departure/arrival/progress/destruction, zone activation, and mortar flight duration are shifted or scaled with the clip; spatial geometry stays unchanged. Full-scenario bars must first be shortened before they have room to slide.

Edits preview live in the scene and inspector, with a timing readout during the drag. Times snap to 0.1-second increments (Alt: 0.01 seconds). Endpoints stay inside the scenario and cannot cross. Escape or a canceled pointer gesture restores the original; releasing commits one undo step. A simple click still selects the row and moves the playhead. Pointer capture keeps the drag active outside the bar. Camera and phase rows retain their existing scrub behavior.

Validation: automated tests cover shift boundaries, both resize directions, event/keyframe retiming, legacy arrows, and mortar flight scaling. Browser drag checks cover both handles, whole-bar movement, inspector updates, and one-step undo.

## Swiss APM profile (TAP 0.1.7)

Units optionally use `symbol: {code, affiliation?, echelon?, hq?, taskForce?, strength?}`. Lines and zones optionally use `tactical`; markers optionally use `symbol` and checkpoint `designation`. These graphics and movement arrows accept authored `status: active|planned`. Existing film fields remain supported. The complete supported IDs, UI controls, source references and limitations are in [SWISS_SYMBOLOGY.md](SWISS_SYMBOLOGY.md) and the generated [JSON_AUTHORING.md](JSON_AUTHORING.md).

## Unified units (TAP 0.1.9)

Vehicles and troop icons now use `kind: unit` with optional `model`, `trail` and `destroyed`, sharing `positionKeys` with military symbols. `mover` remains supported for older projects. See [UNIFIED_UNITS.md](UNIFIED_UNITS.md) for controls and compatibility details.
