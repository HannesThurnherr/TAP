import {BufferGeometry, Float32BufferAttribute, Vector3} from 'three'
import type {Pt} from '../model/types'

/** Only the firing and target points touch the terrain. Authored horizontal curves
 * remain supported, but relief between the endpoints must not bend the fire. */
export function firePath(samples: Pt[], width: number, ground: (x: number, y: number) => number) {
  const points = samples.filter((p, i) => i === 0 || Math.hypot(p[0] - samples[i - 1][0], p[1] - samples[i - 1][1]) > 1e-8)
  if (!points.length) points.push([0, 0])
  const distances = [0]
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]))
  const total = distances.at(-1)!
  const first = points[0], last = points.at(-1)!
  const startHeight = ground(...first) + 1.4, endHeight = ground(...last) + 1.4
  const length = Math.hypot(total, endHeight - startHeight)
  // Height changes linearly with distance along the authored horizontal path.
  // On a two-point engagement this is exactly a straight segment in 3D.
  const at = (u: number, lateral = 0): Vector3 => {
    u = Math.max(0, Math.min(1, u))
    if (points.length === 1) return new Vector3(first[0], startHeight, -first[1])
    const d = u * total
    let i = 1
    while (i < distances.length - 1 && distances[i] < d) i++
    const p = points[i - 1], q = points[i]
    const segment = distances[i] - distances[i - 1], s = (d - distances[i - 1]) / segment
    const dx = q[0] - p[0], dy = q[1] - p[1]
    return new Vector3(
      p[0] + dx * s - dy / segment * lateral,
      startHeight + (endHeight - startHeight) * u,
      -(p[1] + dy * s + dx / segment * lateral),
    )
  }
  // The translucent strip and the tracer lanes share the very same 3D path.
  const positions: number[] = [], along: number[] = [], across: number[] = [], indices: number[] = []
  for (let i = 0; i < points.length; i++) {
    const u = total ? distances[i] / total : 0
    for (const side of [-1, 1]) {
      const p = at(u, side * width / 2)
      positions.push(p.x, p.y, p.z); along.push(u); across.push(side)
    }
    if (i > 0) { const j = (i - 1) * 2; indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2) }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('along', new Float32BufferAttribute(along, 1))
  geometry.setAttribute('across', new Float32BufferAttribute(across, 1))
  geometry.setIndex(indices); geometry.userData.length = length
  return {at, length, geometry}
}
