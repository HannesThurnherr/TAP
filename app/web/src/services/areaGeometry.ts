// Pure geometry of the selected area rectangle (LV95 metres, compass rotation). No runtime imports so node tests can load it.
export type LV95Bounds = [number, number, number, number]

/** the four corners (LV95) of a rectangle rotated by `deg` (compass, clockwise) about its centre: NW, NE, SE, SW in the rectangle's own frame */
export function rotatedCorners(cx: number, cy: number, w: number, h: number, deg: number): [number, number][] {
  const a = -deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
  return ([[-1, 1], [1, 1], [1, -1], [-1, -1]] as const).map(([sx, sy]) => { const x = sx * w / 2, y = sy * h / 2; return [cx + x * c - y * s, cy + x * s + y * c] as [number, number] })
}
/** corner `i` (0 NW, 1 NE, 2 SE, 3 SW in the rectangle's own frame) dragged to LV95 point q; the opposite corner stays fixed */
export function dragCorner(r: { cx: number; cy: number; w: number; h: number }, deg: number, i: number, qx: number, qy: number, min = 200) {
  const [sx, sy] = [[-1, 1], [1, 1], [1, -1], [-1, -1]][i]
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
  // world offset -> local (un-rotate: counter-clockwise by rotation)
  const dx = qx - r.cx, dy = qy - r.cy
  const lx = dx * c - dy * s, ly = dx * s + dy * c
  const fx = -sx * r.w / 2, fy = -sy * r.h / 2   // fixed opposite corner, local
  const w = Math.max(min, Math.abs(lx - fx)), h = Math.max(min, Math.abs(ly - fy))
  const mx = fx + sx * w / 2, my = fy + sy * h / 2   // new centre, local
  return { cx: r.cx + mx * c + my * s, cy: r.cy - mx * s + my * c, w, h }
}
export function cornersBounds(pts: [number, number][]): LV95Bounds {
  return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]
}

