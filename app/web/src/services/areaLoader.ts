// Builds an "area package" for the scene: terrain grid(s), buildings, edges, ground look.
// Two sources: the pre-baked Äuli demo (static files) and live swisstopo data for any drawn rectangle.
import { MAX_AREA_SPAN, MAP_ONLY_SPAN } from '../model/sceneArea'
import { HeightField, type DemMeta } from '../scene/HeightField'
import type { Area } from '../model/types'
import { chooseStep, fetchSwissAlti, type Progress } from './swisstopoDem'
import { fetchBuildings } from './swisstopoBuildings'
import type { LV95Bounds } from './geo'

export type AreaSource = { kind: 'aeuli' } | { kind: 'swisstopo'; bounds: LV95Bounds; name: string; buildings: boolean; mode?: 'auto'|'map'|'terrain' }

export interface Building { id: string; kind: string; cx: number; cy: number; tris: number[]; dz?: number }
export interface EdgeSet { id: string; segs: number[] }
export interface AreaPackage {
  area: Area
  core: HeightField
  outer: HeightField | null
  buildings: Building[]
  edges: EdgeSet[]
  ground: { kind: 'texture'; url: string; outerUrl: string } | { kind: 'procedural' }
  notes: string[]
}

export const MAX_SPAN_M = MAX_AREA_SPAN
/** buildings are loaded automatically up to this side length; above it the user opts in */
export const AUTO_BUILDINGS_M = 5000
/** rough estimate of tile leaves (~170 x 110 m) the building feed needs for an area */
export const buildingLeafEstimate = (b: LV95Bounds) => Math.ceil((b[2] - b[0] + 80) / 170) * Math.ceil((b[3] - b[1] + 80) / 110)

export function areaFromBounds(bounds: LV95Bounds, name: string, heading = 0): Area {
  const E0 = Math.round((bounds[0] + bounds[2]) / 2), N0 = Math.round((bounds[1] + bounds[3]) / 2)
  const area: Area = { id: `lv95-${E0}-${N0}`, name, E0, N0, bounds }
  if (heading) area.heading = heading
  return area
}

export { rotatedCorners, cornersBounds, dragCorner } from './areaGeometry'

export async function loadAreaPackage(source: AreaSource, area: Area, onProgress: Progress, signal?: AbortSignal): Promise<AreaPackage> {
  if (source.kind === 'aeuli') {
    const base = '/areas/aeuli'
    onProgress({ message: 'Gelände Äuli laden …', done: 0, total: 1 })
    const [core, outer, buildings, edges] = await Promise.all([
      HeightField.load(base, 'dem'), HeightField.load(base, 'dem_outer'),
      fetch(`${base}/buildings.json`).then(r => r.json() as Promise<Building[]>),
      fetch(`${base}/edges.json`).then(r => r.json() as Promise<EdgeSet[]>),
    ])
    return { area, core, outer, buildings, edges, ground: { kind: 'texture', url: `${base}/ground.jpg`, outerUrl: `${base}/ground_outer.jpg` }, notes: ['swissALTI3D 2 m (1 km) + 6 m Ring (3 km)', 'Gebäude: swissBUILDINGS3D 2.0 (lokaler Auszug)'] }
  }
  const { bounds } = source
  const span = Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1])
  if (span > MAX_SPAN_M) throw new Error(`Gebiet zu gross für den Prototyp (${(span / 1000).toFixed(1)} km, max. ${MAX_SPAN_M / 1000} km Seitenlänge)`)
  if(source.mode==='map'||span>MAP_ONLY_SPAN) {
    const step=Math.max(bounds[2]-bounds[0],bounds[3]-bounds[1])/64
    const cols=Math.ceil((bounds[2]-bounds[0])/step)+1,rows=Math.ceil((bounds[3]-bounds[1])/step)+1
    const core=new HeightField({E0:area.E0,N0:area.N0,west:bounds[0],north:bounds[3],step,rows,cols,Z0:0},new Float32Array(rows*cols))
    return {area,core,outer:null,buildings:[],edges:[],ground:{kind:'procedural'},notes:['Kartenmodus: ebene Fläche ohne Höhen- und Gebäudedownload. Kartenabdeckung im Ausland abhängig vom Anbieter.']}
  }
  const step = chooseStep(bounds)
  // margin around the rectangle so the horizon does not end at the frame edge
  const m = Math.min(1500, Math.max(300, span * 0.25))
  const grid = await fetchSwissAlti([bounds[0] - m, bounds[1] - m, bounds[2] + m, bounds[3] + m], step, onProgress, signal)
  const meta: DemMeta = { E0: area.E0, N0: area.N0, west: grid.west, north: grid.north, step: grid.step, rows: grid.rows, cols: grid.cols, Z0: 0 }
  const tmp = new HeightField(meta, grid.data, grid.coverage)
  meta.Z0 = Math.round(tmp.sampleAbs(0, 0) * 100) / 100
  const core = new HeightField(meta, grid.data, grid.coverage)
  const notes = [grid.source]
  let buildings: Building[] = [], edges: EdgeSet[] = []
  if (source.buildings) {
    const res = await fetchBuildings(bounds, area.E0, area.N0, (x, y) => core.sampleAbs(x, y), onProgress, signal)
    buildings = res.buildings; edges = res.edges
    notes.push(res.warning ?? `swissBUILDINGS3D (3D Tiles) · ${res.buildings.length} Gebäude aus ${res.leaves} Kacheln`)
  } else notes.push('Gebäude: nicht geladen (in der Gebietsauswahl einschaltbar)')
  onProgress({ message: 'Szene aufbauen …', done: 1, total: 1 })
  return { area, core, outer: null, buildings, edges, ground: { kind: 'procedural' }, notes }
}

let currentPackage: AreaPackage | null = null
/** the package the editor currently shows (background export jobs render it in a second scene) */
export const setCurrentPackage = (pkg: AreaPackage | null) => { currentPackage = pkg }
export const getCurrentPackage = () => currentPackage
