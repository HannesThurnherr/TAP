// Buildings for an arbitrary area from swisstopo's public 3D Tiles feed (swissBUILDINGS3D, LoD2):
//   https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json
// Leaves are b3dm files (~168 x 108 m) holding a Draco-compressed glTF with two primitives (roofs, walls),
// a per-vertex _BATCHID and a batch table with the swissBUILDINGS3D attributes (OBJEKTART, DACH_MAX, GELAENDEPUNKT, ...).
// Positions come in ECEF (WGS84); we convert to LV95 with a per-leaf affine fit and to LN02 heights via the
// roof-height attribute DACH_MAX (LN02): measured, the feed's vertex heights already equal DACH_MAX, so the offset is ~0.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { ecefToLV95, lv95BoundsToWGS, pool, type LV95Bounds } from './geo'
import type { Progress } from './swisstopoDem'

const ROOT = 'https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json'

export interface BuildingRaw { id: string; kind: string; cx: number; cy: number; tris: number[]; dz: number }
export interface EdgeSetRaw { id: string; segs: number[] }
export interface BuildingsResult { buildings: BuildingRaw[]; edges: EdgeSetRaw[]; geoid: number; leaves: number; warning?: string }

let loader: GLTFLoader | null = null
function gltfLoader() {
  if (loader) return loader
  const draco = new DRACOLoader(); draco.setDecoderPath('/draco/')
  loader = new GLTFLoader(); loader.setDRACOLoader(draco)
  return loader
}

const urljoin = (base: string, rel: string) => new URL(rel, base).href

async function collectLeaves(bboxRad: [number, number, number, number], signal?: AbortSignal): Promise<string[]> {
  const leaves: string[] = []
  const intersects = (bv: any) => { if (!bv?.region) return true; const [w, s, e, n] = bv.region; return !(e < bboxRad[0] || w > bboxRad[2] || n < bboxRad[1] || s > bboxRad[3]) }
  async function walk(tile: any, base: string, depth: number) {
    if (depth > 64 || !intersects(tile.boundingVolume)) return
    const uri: string | undefined = tile.content?.uri ?? tile.content?.url
    if (uri) {
      const full = urljoin(base, uri)
      if (uri.endsWith('.json')) { const r = await fetch(full, { signal, cache: 'force-cache' }); if (!r.ok) throw new Error(`3D Tiles ${r.status}`); const sub = await r.json(); await walk(sub.root, full, depth + 1); return }
      leaves.push(full)
    }
    for (const ch of tile.children ?? []) await walk(ch, base, depth + 1)
  }
  const r = await fetch(ROOT, { signal, cache: 'force-cache' })
  if (!r.ok) throw new Error(`3D Tiles ${r.status}`)
  await walk((await r.json()).root, ROOT, 0)
  return [...new Set(leaves)]   // the tree can reference the same leaf twice
}

function parseB3dm(buf: ArrayBuffer) {
  const dv = new DataView(buf)
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3))
  if (magic !== 'b3dm') throw new Error('kein b3dm')
  const len = dv.getUint32(8, true), ftjl = dv.getUint32(12, true), ftbl = dv.getUint32(16, true), btjl = dv.getUint32(20, true), btbl = dv.getUint32(24, true)
  let o = 28
  const dec = new TextDecoder()
  const ftj = JSON.parse(dec.decode(new Uint8Array(buf, o, ftjl))); o += ftjl + ftbl
  const btj = btjl ? JSON.parse(dec.decode(new Uint8Array(buf, o, btjl))) : {}
  const btb = new Uint8Array(buf, o + btjl, btbl); o += btjl + btbl
  const glb = buf.slice(o, len)
  // batch table values are inline arrays or binary refs
  const batch: Record<string, any[]> = {}
  const n = ftj.BATCH_LENGTH ?? 0
  for (const [k, v] of Object.entries<any>(btj)) {
    if (Array.isArray(v)) batch[k] = v
    else if (v && typeof v === 'object' && v.byteOffset != null) {
      const ctor = ({ FLOAT: Float32Array, DOUBLE: Float64Array, UNSIGNED_INT: Uint32Array, UNSIGNED_SHORT: Uint16Array, INT: Int32Array, SHORT: Int16Array, UNSIGNED_BYTE: Uint8Array, BYTE: Int8Array } as any)[v.componentType] ?? Float32Array
      const copy = btb.slice(v.byteOffset, v.byteOffset + n * ctor.BYTES_PER_ELEMENT)
      batch[k] = Array.from(new ctor(copy.buffer))
    }
  }
  return { rtc: (ftj.RTC_CENTER ?? [0, 0, 0]) as [number, number, number], n, batch, glb }
}

const median = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

/**
 * Buildings inside `bounds` (LV95), in local metres relative to (E0, N0) with absolute LN02 heights.
 * `groundAbs` gives the DEM height at a local point so each building's terrain reference is aligned to our terrain.
 */
export async function fetchBuildings(bounds: LV95Bounds, E0: number, N0: number, groundAbs: (x: number, y: number) => number, onProgress: Progress, signal?: AbortSignal): Promise<BuildingsResult> {
  const margin = 40
  const wb = lv95BoundsToWGS([bounds[0] - margin, bounds[1] - margin, bounds[2] + margin, bounds[3] + margin])
  const bboxRad = wb.map(v => v * Math.PI / 180) as [number, number, number, number]
  onProgress({ message: 'Gebäude: Kachelbaum lesen …', done: 0, total: 1 })
  let leaves: string[]
  try { leaves = await collectLeaves(bboxRad, signal) } catch (e) { return { buildings: [], edges: [], geoid: NaN, leaves: 0, warning: `Gebäude-Feed nicht erreichbar (${(e as Error).message})` } }
  if (!leaves.length) return { buildings: [], edges: [], geoid: NaN, leaves: 0 }
  const gl = gltfLoader()
  let done = 0
  onProgress({ message: `Gebäude: 0/${leaves.length} Kacheln`, done: 0, total: leaves.length })

  interface Acc { id: string; kind: string; tris: number[]; zmax: number; dachMax: number | null; gelaende: number | null; leaf: string }
  const accs = new Map<string, Acc>()   // a building straddling two leaves is contained whole in both: keep the first leaf's copy only
  const geoidSamples: number[] = []

  await pool(leaves, 6, async (url) => {
    try {
      const r = await fetch(url, { signal })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const { rtc, batch, glb } = parseB3dm(await r.arrayBuffer())
      const gltf = await gl.parseAsync(glb, '')
      gltf.scene.updateMatrixWorld(true)
      // ECEF -> LV95 affine fit around the leaf centre (leaves are ~200 m, so a linear map is exact to < 1 cm)
      const c = ecefToLV95(rtc[0], rtc[1], rtc[2])
      const J: number[][] = []
      for (let k = 0; k < 3; k++) { const d = [0, 0, 0]; d[k] = 1; const p = ecefToLV95(rtc[0] + d[0], rtc[1] + d[1], rtc[2] + d[2]); J.push([p[0] - c[0], p[1] - c[1], p[2] - c[2]]) }
      const v = new THREE.Vector3()
      gltf.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh) return
        const geo = mesh.geometry
        const pos = geo.getAttribute('position'), bid = geo.getAttribute('_batchid')
        const idx = geo.getIndex()
        const count = idx ? idx.count : pos.count
        const world: number[] = new Array(pos.count * 3)
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
          // glTF y-up -> 3D Tiles z-up, then RTC offset (ECEF)
          const ex = v.x, ey = -v.z, ez = v.y
          const E = c[0] + J[0][0] * ex + J[1][0] * ey + J[2][0] * ez
          const N = c[1] + J[0][1] * ex + J[1][1] * ey + J[2][1] * ez
          const H = c[2] + J[0][2] * ex + J[1][2] * ey + J[2][2] * ez
          world[i * 3] = E - E0; world[i * 3 + 1] = N - N0; world[i * 3 + 2] = H
        }
        for (let t = 0; t < count; t += 3) {
          const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, d = idx ? idx.getX(t + 2) : t + 2
          const bi = bid ? Math.round(bid.getX(a)) : 0
          const gid = (batch['gml:id']?.[bi] ?? batch['UUID']?.[bi] ?? `${url}#${bi}`) as string
          let acc = accs.get(gid)
          if (!acc) {
            const dm = Number(batch['DACH_MAX']?.[bi]), gp = Number(batch['GELAENDEPUNKT']?.[bi])
            acc = { id: gid, kind: String(batch['OBJEKTART']?.[bi] ?? ''), tris: [], zmax: -Infinity, dachMax: Number.isFinite(dm) ? dm : null, gelaende: Number.isFinite(gp) ? gp : null, leaf: url }
            accs.set(gid, acc)
          } else if (acc.leaf !== url) continue
          for (const k of [a, b, d]) { acc.tris.push(world[k * 3], world[k * 3 + 1], world[k * 3 + 2]); if (world[k * 3 + 2] > acc.zmax) acc.zmax = world[k * 3 + 2] }
        }
      })
    } catch (e) { console.warn('b3dm', url, e) }
    done++
    onProgress({ message: `Gebäude: ${done}/${leaves.length} Kacheln`, done, total: leaves.length })
  })

  // geoid offset: mesh ridge (ellipsoidal) minus DACH_MAX (LN02), median over the area
  for (const a of accs.values()) if (a.dachMax != null && Number.isFinite(a.zmax)) geoidSamples.push(a.zmax - a.dachMax)
  // measured: the feed's vertex heights already match DACH_MAX (LN02), so the offset is ~0; keep the check as a guard
  let geoid = median(geoidSamples)
  if (!Number.isFinite(geoid) || geoid < -5 || geoid > 60) geoid = 0

  const buildings: BuildingRaw[] = [], edges: EdgeSetRaw[] = []
  const [bw, bs, be, bn] = bounds
  for (const a of accs.values()) {
    const t = dedupeTriangles(a.tris)   // the feed contains every surface twice
    if (t.length < 9) continue
    let sx = 0, sy = 0; const n = t.length / 3
    for (let i = 0; i < t.length; i += 3) { sx += t[i]; sy += t[i + 1] }
    const cx = sx / n, cy = sy / n
    const E = cx + E0, N = cy + N0
    if (E < bw - margin || E > be + margin || N < bs - margin || N > bn + margin) continue
    for (let i = 2; i < t.length; i += 3) t[i] -= geoid    // ellipsoidal -> LN02
    // align the building's own terrain reference to our DEM (different acquisition years)
    const dz = a.gelaende != null ? groundAbs(cx, cy) - a.gelaende : 0
    buildings.push({ id: a.id, kind: a.kind, cx, cy, tris: t, dz: Math.abs(dz) < 6 ? dz : 0 })
    edges.push({ id: a.id, segs: outline(t) })
  }
  return { buildings, edges, geoid, leaves: leaves.length }
}

/** drop repeated triangles (same three vertices, any order) */
function dedupeTriangles(t: number[]): number[] {
  const seen = new Set<string>(), out: number[] = []
  const k = (i: number) => `${Math.round(t[i] * 20)},${Math.round(t[i + 1] * 20)},${Math.round(t[i + 2] * 20)}`
  for (let i = 0; i < t.length; i += 9) {
    const key = [k(i), k(i + 3), k(i + 6)].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)
    for (let j = 0; j < 9; j++) out.push(t[i + j])
  }
  return out
}

/** clean outline segments of a building: merge vertices, keep edges where adjacent faces bend by > 12° */
function outline(tris: number[]): number[] {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3))
  const merged = mergeVertices(geo, 0.08)
  const eg = new THREE.EdgesGeometry(merged, 12)
  const p = eg.getAttribute('position')
  const out: number[] = new Array(p.count * 3)
  for (let i = 0; i < p.count; i++) { out[i * 3] = p.getX(i); out[i * 3 + 1] = p.getY(i); out[i * 3 + 2] = p.getZ(i) }
  geo.dispose(); merged.dispose(); eg.dispose()
  return out
}
