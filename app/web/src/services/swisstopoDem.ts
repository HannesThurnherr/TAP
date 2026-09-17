// swissALTI3D elevation for an arbitrary LV95 rectangle, fetched in the browser.
// Source: STAC API data.geo.admin.ch, collection ch.swisstopo.swissalti3d, 1 km x 1 km Cloud-Optimized GeoTIFF tiles
// (2 m grid, float32, EPSG:2056, LN02 heights, nodata -9999). Tiles are named by their LV95 km index "<E>-<N>".
import { fromArrayBuffer } from 'geotiff'
import { lv95BoundsToWGS, pool, type LV95Bounds } from './geo'

const STAC = 'https://data.geo.admin.ch/api/stac/v1'
const NODATA = -9000

export interface DemGrid { west: number; north: number; step: number; rows: number; cols: number; data: Float32Array; coverage: Uint8Array; tiles: number; source: string }
export type Progress = (p: { message: string; done: number; total: number }) => void

interface TileRef { key: string; href: string; datetime: string; kmE: number; kmN: number }

/** grid step (m) for a rectangle: keeps the mesh at roughly <= 1500 samples per side */
export function chooseStep(bounds: LV95Bounds): number {
  const span = Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1])
  if (span <= 3000) return 2
  if (span <= 6000) return 4
  if (span <= 12000) return 8
  return 16
}

export function tileCount(bounds: LV95Bounds): number {
  const e0 = Math.floor(bounds[0] / 1000), e1 = Math.floor((bounds[2] - 0.001) / 1000)
  const n0 = Math.floor(bounds[1] / 1000), n1 = Math.floor((bounds[3] - 0.001) / 1000)
  return (e1 - e0 + 1) * (n1 - n0 + 1)
}

/** all swissALTI3D 2 m tiles intersecting the bounds, newest acquisition per tile */
async function findTiles(bounds: LV95Bounds, signal?: AbortSignal): Promise<TileRef[]> {
  const bbox = lv95BoundsToWGS(bounds)
  let url: string | null = `${STAC}/collections/ch.swisstopo.swissalti3d/items?bbox=${bbox.join(',')}&limit=100`
  const best = new Map<string, TileRef>()
  while (url) {
    const r = await fetch(url, { signal })
    if (!r.ok) throw new Error(`swisstopo STAC ${r.status}`)
    const j = await r.json()
    for (const it of j.features ?? []) {
      const m = /_(\d{4})-(\d{4})$/.exec(it.id)
      if (!m) continue
      const key = `${m[1]}-${m[2]}`
      const asset = Object.entries(it.assets ?? {}).find(([k]) => k.endsWith('.tif') && k.includes('_2_2056')) as [string, { href: string }] | undefined
      if (!asset) continue
      const ref: TileRef = { key, href: asset[1].href, datetime: it.properties?.datetime ?? '', kmE: +m[1], kmN: +m[2] }
      const prev = best.get(key)
      if (!prev || ref.datetime > prev.datetime) best.set(key, ref)
    }
    url = (j.links ?? []).find((l: any) => l.rel === 'next')?.href ?? null
  }
  return [...best.values()]
}

async function readTile(ref: TileRef, overview: boolean, signal?: AbortSignal) {
  const r = await fetch(ref.href, { signal })
  if (!r.ok) throw new Error(`Kachel ${ref.key}: HTTP ${r.status}`)
  const tiff = await fromArrayBuffer(await r.arrayBuffer())
  const base = await tiff.getImage(0)
  const count = await tiff.getImageCount()
  const img = overview && count > 1 ? await tiff.getImage(1) : base
  const [ox, oy] = base.getOrigin()
  const [bx] = base.getResolution()
  const w = img.getWidth(), h = img.getHeight()
  const res = Math.abs(bx) * (base.getWidth() / w)
  const raster = (await img.readRasters({ interleave: true })) as unknown as ArrayLike<number>
  return { ox, oy, res, w, h, data: raster }
}

/** Mosaic of swissALTI3D tiles covering `bounds` at `step` metres (north-up, row 0 = north). */
export async function fetchSwissAlti(bounds: LV95Bounds, step: number, onProgress: Progress, signal?: AbortSignal): Promise<DemGrid> {
  const west = Math.floor(bounds[0] / step) * step, east = Math.ceil(bounds[2] / step) * step
  const south = Math.floor(bounds[1] / step) * step, north = Math.ceil(bounds[3] / step) * step
  const cols = Math.round((east - west) / step) + 1, rows = Math.round((north - south) / step) + 1
  const data = new Float32Array(rows * cols).fill(NODATA)
  onProgress({ message: 'Gelände: Kacheln suchen …', done: 0, total: 1 })
  const tiles = await findTiles([west, south, east, north], signal)
  if (!tiles.length) throw new Error('Keine swissALTI3D-Kacheln für dieses Gebiet (ausserhalb der Schweiz?)')
  const overview = step >= 4
  let done = 0, failed = 0
  onProgress({ message: `Gelände: 0/${tiles.length} Kacheln`, done: 0, total: tiles.length })
  await pool(tiles, 6, async (ref) => {
    let t
    try { t = await readTile(ref, overview, signal) } catch(e) { if(signal?.aborted) throw e; failed++;done++;return }
    // mosaic cells covered by this tile
    const c0 = Math.max(0, Math.ceil((t.ox - west) / step)), c1 = Math.min(cols - 1, Math.floor((t.ox + t.w * t.res - west) / step))
    const r0 = Math.max(0, Math.ceil((north - t.oy) / step)), r1 = Math.min(rows - 1, Math.floor((north - (t.oy - t.h * t.res)) / step))
    for (let r = r0; r <= r1; r++) {
      const N = north - r * step
      const py = Math.min(t.h - 1, Math.max(0, Math.floor((t.oy - N) / t.res)))
      for (let c = c0; c <= c1; c++) {
        const E = west + c * step
        const px = Math.min(t.w - 1, Math.max(0, Math.floor((E - t.ox) / t.res)))
        const v = t.data[py * t.w + px]
        if (v > NODATA) data[r * cols + c] = v
      }
    }
    done++
    onProgress({ message: `Gelände: ${done}/${tiles.length} Kacheln`, done, total: tiles.length })
  })
  const coverage=Uint8Array.from(data,v=>Number.isFinite(v)&&v>NODATA?1:0)
  const valid=coverage.reduce((a,b)=>a+b,0)
  if(!valid) throw new Error('Keine nutzbaren Höhendaten. Bitte Gebiet im Kartenmodus öffnen.')
  fillHoles(data, rows, cols)
  return { west, north, step, rows, cols, data, coverage, tiles: tiles.length, source: (100*valid/data.length).toFixed(0)+'% Höhenabdeckung · '+failed+' fehlgeschlagene Kacheln · Lücken ohne Gelände · '+`swissALTI3D ${step} m · ${tiles.length} Kacheln` }
}

/** nodata cells: nearest valid neighbours, a few dilation passes, then the mean */
function fillHoles(d: Float32Array, rows: number, cols: number) {
  let sum = 0, n = 0
  for (let i = 0; i < d.length; i++) if (d[i] > NODATA) { sum += d[i]; n++ }
  if (!n) { d.fill(500); return }
  const mean = sum / n
  if (n === d.length) return
  for (let i = 0; i < d.length; i++) if (d[i] <= NODATA) d[i] = mean
}
