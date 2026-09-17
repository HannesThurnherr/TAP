# Where the terrain and building data come from

All live data is public swisstopo open data (OGD, attribution "© swisstopo"), fetched directly by the browser. No API
key, no server of our own.

## Terrain (any drawn rectangle)
- Dataset: **swissALTI3D**, 2 m grid, LN02 heights, EPSG:2056.
- Access: STAC API `https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swissalti3d/items?bbox=…`
  returns 1 km × 1 km Cloud-Optimized GeoTIFF tiles (~1 MB each at 2 m). We take the newest acquisition per tile,
  read them with `geotiff` in the browser and mosaic them (`src/services/swisstopoDem.ts`).
- Resolution vs. size: ≤ 3 km side → 2 m; ≤ 6 km → 4 m (tile overview level); up to 8 km → 8 m.
  Above 8 km, map-only mode skips terrain and buildings. Selected areas support up to 100 km per side.
  Missing elevation coverage is masked, so available parts of border regions still render.
- A margin (25 % of the span, 300–1500 m) is loaded around the rectangle so the horizon does not end at the frame.
- Rotated rectangles: the picker stores centre/size/rotation (LV95). What gets loaded is the axis-aligned bounding box
  of the rotated corners; the rotation is kept as `area.heading` and only steers the overview camera (`frameAll`).
  The terrain grid and coordinate labels stay north-up.

## Picker basemaps (preview before loading)
WMTS on `wmts.geo.admin.ch` in Web Mercator: `ch.swisstopo.pixelkarte-grau` (Karte), `ch.swisstopo.swissimage` (Luftbild).
The terrain preview is a thumbnail in the Gebiet panel: `ch.swisstopo.swissalti3d-reliefschattierung` via WMS (EPSG:2056)
for the bounding box of the rectangle, north-up, with the rotated frame drawn on it (`src/ui/AreaThumb.tsx`).

## Buildings
Two sources exist in the app:

1. **Äuli example** (`public/areas/aeuli/`): prepared offline from the **local** 8.3 GB swissBUILDINGS3D **2.0**
   FileGDB, with outlines computed during offline preprocessing. The original preprocessing workspace is not
   required to run or build TAP; the prepared assets are bundled. This is a snapshot from 2021 and only covers the
   3 km around Äuli.
2. **Live areas**: swisstopo's public **3D Tiles feed of swissBUILDINGS3D (LoD2)**,
   `https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json` (the layer map.geo.admin.ch uses for
   its 3D view; data from May 2026). We walk the tile tree to the leaves (~170 × 110 m each, 5–25 KB), decode the
   Draco-compressed glTF with three.js, convert ECEF → LV95, group triangles per building via the `_BATCHID`
   attribute and the batch table (OBJEKTART, DACH_MAX, GELAENDEPUNKT, EGID …), and compute the glowing outlines with
   `EdgesGeometry` after welding vertices (`src/services/swisstopoBuildings.ts`).
   Findings while wiring it up: the feed's vertex heights already equal DACH_MAX (LN02), so no geoid correction is
   needed; every surface is contained twice and buildings that straddle two leaves appear whole in both, so
   triangles are de-duplicated per building; each building's GELAENDEPUNKT is aligned to our DEM so different
   acquisition years do not leave buildings floating. Buildings are enabled automatically up to 5 km side; larger terrain areas can opt in. Map-only areas skip buildings.

## Ground look
- All areas, including Äuli: a procedural shader (`src/scene/FuiGround.ts`): 10 m / 50 m LV95 grid, 1 m contours with 5 m index
  lines, anti-aliased and faded where they get denser than the screen can show. Roads, forest and water classes
  from swissTLM3D / vector tiles are not wired yet. The old Äuli baked texture is no longer used, because its
  grid was relative to the area centre. Grid lines now fall on absolute LV95 multiples of 10 / 50 metres;
  changing the selected area does not shift them. Full E/N coordinate labels follow the terrain alongside
  the grid lines, repeated across the area; regional areas use fewer labels. Labels use a shared GPU texture
  atlas and are included in screenshots/video. They are hidden in Landeskarte mode.
- The ground toggle in the viewer drapes a swisstopo WMS image over any terrain: "Landeskarte" (`ch.swisstopo.pixelkarte-grau`)
  or "Luftbild" (`ch.swisstopo.swissimage`), both requested in EPSG:2056 for the exact terrain extent (`src/scene/MapGround.ts`).
  Background video exports use the ground mode set in the viewer and wait for the texture before each frame.

## Names
The picker and text-to-animation dialog both use the swisstopo SearchServer (`api3.geo.admin.ch`).
The dialog extracts uppercase place candidates, allows manual phrase lookup and inserts reviewed LV95
anchors into the copied prompt. The full description is not sent to the search service.
