import type { DemMeta } from './HeightField'

export type MapBounds = [number, number, number, number]
export type MapDetail = 'auto' | 'overview' | 'detail'
export type GroundMode = 'fui' | 'map' | 'sat'
/** swisstopo WMS layer draped on the terrain for a ground mode */
export const GROUND_LAYER: Record<Exclude<GroundMode, 'fui'>, string> = { map: 'ch.swisstopo.pixelkarte-grau', sat: 'ch.swisstopo.swissimage' }

/** Exact mesh vertex extent (LV95 west, south, east, north), not 2*half: a 500-sample grid has 499 intervals. */
export function terrainBounds(meta: DemMeta): MapBounds {
  const half = meta.half ?? 0
  const west = meta.west ?? meta.E0 - half, north = meta.north ?? meta.N0 + half
  return [west, north - (meta.rows - 1) * meta.step, west + (meta.cols - 1) * meta.step, north]
}

export function mapUV(easting: number, northing: number, b: MapBounds): [number, number] {
  return [(easting - b[0]) / (b[2] - b[0]), (northing - b[1]) / (b[3] - b[1])]
}

export function mapRequest(bounds: MapBounds, metresPerPixel: number, maxSize: number, layer = GROUND_LAYER.map) {
  const spanX = bounds[2] - bounds[0], spanY = bounds[3] - bounds[1]
  const resolution = Math.max(metresPerPixel, spanX / maxSize, spanY / maxSize)
  const width = Math.max(1, Math.ceil(spanX / resolution)), height = Math.max(1, Math.ceil(spanY / resolution))
  const params = new URLSearchParams({ SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.3.0',
    LAYERS: layer, STYLES: 'default', CRS: 'EPSG:2056',
    BBOX: bounds.join(','), WIDTH: String(width), HEIGHT: String(height), FORMAT: 'image/jpeg' })
  return { url: `https://wms.geo.admin.ch/?${params}`, width, height, resolution: Math.max(spanX / width, spanY / height) }
}

/** Discrete cartographic scales prevent continuous refetches while orbiting. */
export function mapResolution(detail: MapDetail, viewMetresPerPixel: number): number {
  if (detail === 'overview') return 2
  if (detail === 'detail') return 0.5
  const levels = [0.5, 1, 2, 4, 8, 16, 32, 64, 128]
  return levels.find(v => v >= Math.max(0.5, viewMetresPerPixel)) ?? 128
}
