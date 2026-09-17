import type { Area } from './types'
export const MAX_AREA_SPAN = 100000
export const MAP_ONLY_SPAN = 8000
export function validateAreaBounds(b: unknown): b is [number,number,number,number] {
 return Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]>=2300000&&b[2]<=3000000&&b[1]>=900000&&b[3]<=1500000&&b[2]-b[0]>=100&&b[3]-b[1]>=100&&Math.max(b[2]-b[0],b[3]-b[1])<=MAX_AREA_SPAN
}
export const areaMapOnly=(a:Area)=>!!a.bounds&&(a.mode==='map'||Math.max(a.bounds[2]-a.bounds[0],a.bounds[3]-a.bounds[1])>MAP_ONLY_SPAN)
