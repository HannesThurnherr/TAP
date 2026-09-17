import proj4 from 'proj4'

// Swiss LV95 (EPSG:2056). The towgs84 parameters matter: without them positions shift by hundreds of metres.
proj4.defs('EPSG:2056', '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs')

export type LV95Bounds = [number, number, number, number]   // west, south, east, north (metres)
export type WGSBounds = [number, number, number, number]    // minLon, minLat, maxLon, maxLat (degrees)

export const wgsToLV95 = (lon: number, lat: number) => proj4('EPSG:4326', 'EPSG:2056', [lon, lat]) as [number, number]
export const lv95ToWGS = (E: number, N: number) => proj4('EPSG:2056', 'EPSG:4326', [E, N]) as [number, number]

export function lv95BoundsToWGS(b: LV95Bounds): WGSBounds {
  const corners = [lv95ToWGS(b[0], b[1]), lv95ToWGS(b[2], b[1]), lv95ToWGS(b[2], b[3]), lv95ToWGS(b[0], b[3])]
  return [Math.min(...corners.map(c => c[0])), Math.min(...corners.map(c => c[1])), Math.max(...corners.map(c => c[0])), Math.max(...corners.map(c => c[1]))]
}

export function wgsBoundsToLV95(b: WGSBounds): LV95Bounds {
  const corners = [wgsToLV95(b[0], b[1]), wgsToLV95(b[2], b[1]), wgsToLV95(b[2], b[3]), wgsToLV95(b[0], b[3])]
  return [Math.min(...corners.map(c => c[0])), Math.min(...corners.map(c => c[1])), Math.max(...corners.map(c => c[0])), Math.max(...corners.map(c => c[1]))]
}

/** WGS84 ECEF (metres) -> geodetic lon/lat (degrees) + ellipsoidal height. Closed form (Bowring). */
export function ecefToGeodetic(x: number, y: number, z: number): [number, number, number] {
  const a = 6378137, f = 1 / 298.257223563, b = a * (1 - f), e2 = 1 - (b * b) / (a * a), ep2 = (a * a - b * b) / (b * b)
  const p = Math.hypot(x, y)
  const th = Math.atan2(z * a, p * b)
  const lon = Math.atan2(y, x)
  const lat = Math.atan2(z + ep2 * b * Math.sin(th) ** 3, p - e2 * a * Math.cos(th) ** 3)
  const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2)
  const h = p / Math.cos(lat) - N
  return [lon * 180 / Math.PI, lat * 180 / Math.PI, h]
}

/** ECEF -> LV95 E, N, ellipsoidal height */
export function ecefToLV95(x: number, y: number, z: number): [number, number, number] {
  const [lon, lat, h] = ecefToGeodetic(x, y, z)
  const [E, N] = wgsToLV95(lon, lat)
  return [E, N, h]
}

/** run up to `limit` async jobs concurrently, preserving order of results */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i) }
  }))
  return out
}
