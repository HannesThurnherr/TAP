# Projected national map

The viewport's **Geländebild / Landeskarte** control switches between the original ground materials and the same `ch.swisstopo.pixelkarte-grau` national map used by the area picker. Detail is automatic, with Übersicht / Detail overrides. This is a display preference in the current session; the prototype does not yet export it to scenario JSON.

## Registration

WMS 1.3.0 requests use `CRS=EPSG:2056` and BBOX `[west,south,east,north]` in LV95 metres. Swisstopo performs the source-map reprojection; Web Mercator tiles are not stretched onto an LV95 rectangle.

The bounding box comes from the outer DEM's actual vertex extent: `cols-1` and `rows-1` intervals, not `2*half`. Current outer extent is 2994 m, core extent 998 m. Each vertex maps its absolute easting/northing into that shared box; north is v=1. Both meshes use the same map image and material, avoiding changes in cartographic scale or image registration at the core/ring boundary. Existing terrain geometry and height sampling are unchanged. This establishes alignment to the existing prototype mesh; map symbols are cartographic representations, not survey-grade building footprints.

## Detail and resource limits

Automatic resolution uses camera distance to its target, vertical field of view and drawing-buffer height, rounded to discrete map scales. Requests wait 400 ms for the scale to settle. Overview targets 2 m/px; Detail targets 0.5 m/px. Images are limited to the smaller of 4096 pixels and the GPU texture limit, so the current 3 km area reaches about 0.73 m/px at maximum detail. The control reports actual resolution. This is texture sampling resolution, not source positional accuracy.

Mipmaps and maximum supported anisotropic filtering reduce aliasing and blur at oblique angles. Two textures are cached per scene. Stale fetches are aborted, requests time out after 20 seconds, and the previous ground image stays visible during loading or errors. An explicit retry is available. Scene disposal releases textures and aborts work.

Regional terrain loading remains future work. The image budget prevents giant allocations, but close-up detail over dozens of kilometres requires tiled textures with geographic bounds and LOD rather than increasing this single-image limit.

## Verification

`pnpm --dir app/web test` checks north-up mapping, actual sample extents, LV95 round-trips across both meshes, WMS parameters, aspect ratios, texture budgets and scale selection. `pnpm --dir app/web build` checks TypeScript and production bundling.

Source: https://docs.geo.admin.ch/visualize-data/wms.html (WMS parameters and supported CRS); live GetCapabilities verified the grey national-map layer supports EPSG:2056 on 2026-09-09.
