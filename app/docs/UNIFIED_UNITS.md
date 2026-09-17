# Unified units — TAP 0.1.9

Use **Einheit (U)** for military symbols, vehicles and troop appearances. The separate Fahrzeug/Trupp tool has been removed; X is a compatibility shortcut for Einheit.

Choose **Darstellung** in the toolbar before placing an entity or in the inspector afterward: Militärsymbol, SPz/BMP, IFV, APC, Piranha, LKW, Trupp, Gruppe or Zug. These vehicle appearances are the existing screen-readable icons, not new 3D meshes. Changing appearance preserves the entity ID, military-symbol settings, position keyframes and references.

All new units use **Positions-Keyframes**. Choose a playhead time and **Ziel bei Playhead im Gelände setzen**, or capture the current position as a keyframe. Keys can be dragged in the terrain; curves, halts and interpolation work for every appearance. Movement arrows use **Pfeil folgt Einheit** and follow the same path.

**Bewegungsspur** displays the travelled path. **Vernichtet um** freezes the position and displays destruction, flash and smoke; the linked arrow and trail stop at that position too. Scrubbing backward restores the preceding state. Moving/stretching the timeline clip retimes destruction and keyframes together.

## JSON

New output always uses `kind: "unit"`, with ordinary LV95 `pos` and `positionKeys`. Optional `model` selects a vehicle/troop appearance (`bmp|ifv|apc|piranha|truck|team|squad|platoon`). Omit it for a military symbol. Optional `trail` is boolean (default false); `destroyed` is an absolute scenario time or null. Other unit fields are unchanged.

Existing `kind: "mover"` files remain valid and retain their original path, timing and inspector controls. They are not automatically converted: that could change curved-path progress, halts and reversals. New prompts explicitly prefer unified units. The contract revision is **0.1.9**.

## Verification

69 automated tests pass, including appearance-independent positions and camera anchors, destruction stopping at the exact shared trail endpoint, timeline retiming, import validation for each model and preservation of legacy vehicle data. Browser checks covered placing an LKW with U, adding movement keys, its destroyed state, and switching back to a military symbol without changing its keys. No browser errors were reported during those checks. Desktop packaging includes extracted macOS smoke checks; Windows packages require runtime verification on Windows.
