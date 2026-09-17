# Workflow, camera planning and export

The app has three workspaces: **1 · Gebiet**, **2 · Manöver**, and **3 · Export**. Area selection retains the map rectangle workflow. Maneuver editing has entity controls on the left. Export replaces those controls with a dedicated shot sidebar; it does not cover the viewport. Regional terrain loading remains separate.

## Phase authoring

Drag horizontally in the timeline's phase row to draw a phase (either direction, 0.1-second precision). Releasing opens a modal for its name, start/end and optional subtitle. Click an existing phase to edit or delete it; the + Phase button also opens a new phase at the playhead. Escape/cancel discards the draft. Saving trims or splits overlapping phases while preserving their uncovered parts, so active phase titles remain unambiguous. Edits and deletion are undoable. Element and shot times do not move with phase edits; regenerate automatic shots if they should follow new phase boundaries.

The Export dialog already offers **Einblendungen → Phasentitel** (enabled by default): a dark upper-left badge showing the active phase. **Untertitel** also displays the phase caption when no explicit caption is active. These use the same `phases` array edited by the timeline.

## Camera planning

Entering Export with no shots creates an undoable starting sequence. Existing shots remain until regenerated. The generator respects phase boundaries and divides intervals longer than 24 seconds. It prioritizes timed movement and events, fitting unit/vehicle positions within each interval instead of their complete future paths. Persistent backgrounds do not force all phases to share an overview. Quiet intervals fall back to visible elements.

Default shots use a slow 24-degree orbit at a 35-degree elevation. Projected point bounds, terrain relief, and symbol margins determine distance. Framing/motion selectors change the selected shot immediately and supply regeneration settings. These are geometric/timing heuristics, not an occlusion or label-overlap solver.

**Freie Kamera** (amber) lets the user position the viewport; **Shot-Vorschau** (cyan) shows the saved shot sequence. No camera-coordinate, altitude, or heading entry is exposed. Capture the current view as a start keyframe, end keyframe, or fixed view. Start/end views use the existing dolly schema and interpolate smoothly. Split a shot at the playhead for additional perspectives. All edits remain undoable and are stored in the existing JSON `shots` array. Shot time fields remain editable.

## PNG

The viewport screenshot button pauses playback and downloads a PNG including terrain, HTML/SVG unit and vehicle symbols, labels, callouts and swisstopo attribution. Editor selections and drawing previews are excluded. Resolution follows the viewport and device pixel ratio (up to 2×).

## MP4

The Export sidebar downloads the whole maneuver, a selected shot, or a short 3-second preview as H.264 MP4. Options are 720p/1080p and 24/30 fps; the aspect ratio matches the viewer. Output has no audio. Mediabunny/CanvasSource encodes a Canvas2D composite of the preserved WebGL canvas and cached symbol/label images. At export startup, html-to-image rasterizes each CSS2D element once (including future labels and destroyed vehicle variants). Each frame draws those cached images at their current projected positions, preserving visibility, fading, callout reveals, stacking and moving vehicle headings. The interactive editor still uses CSS2D; full-frame HTML rasterization is no longer part of the video frame loop. The loop yields periodically so progress and cancellation remain responsive. Each frame uses an explicit scenario timestamp, independent of rendering speed. The module is loaded only when exporting.

During encoding the UI locks edits, renders planned shots, waits for pending map loads, reports progress, and supports cancellation. Playback remains paused and the previous playhead/camera are restored afterward. The encoder checks browser H.264 support before rendering. Browser encoding support is required; a clear error is shown when unavailable. Long exports can take longer than their playback duration. Encoded output is buffered in memory before downloading.

## Verification

Browser checks exercised all three workspaces, the separate export sidebar, free/preview indicators, mouse-positioned start/end capture and interpolated playback, and export cancellation with state restoration. A downloaded 3-second test MP4 was checked with ffprobe: H.264, 720 pixels high, 24 fps, 72 frames, exactly 3 seconds. A decoded frame was visually inspected for terrain, symbols, labels, and attribution. The cached compositor was also verified with full 90-second exports: 720p/24 fps produced 2160 frames in 10.1 seconds; 1080p/30 fps produced 2700 frames in 13.7 seconds. Both files were checked with ffprobe for H.264, exact duration, resolution and frame count. Decoded later frames were inspected for callouts, moving units and destroyed vehicles. The earlier 3-second 720p export took 17.8 seconds with full-frame HTML capture versus 1.5 seconds with the initial cached compositor. These timings are measurements on the local example and browser, not performance guarantees. Cancellation with UI restoration was retested. All 36 automated model tests and the production build pass.
