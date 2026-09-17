import * as THREE from 'three'
import type { Terrain } from './HeightField'

/** A single terrain-following mesh and text atlas, also captured by GPU video export. */
export function gridLabels(terrain: Terrain): THREE.Mesh {
  const field = terrain.outer ?? terrain.core
  const [x0, y0, x1, y1] = field.extent()
  const { E0, N0 } = field.meta
  // Bound label density for regional terrain while retaining absolute grid multiples.
  const step = Math.max(50, Math.ceil(Math.max(x1 - x0, y1 - y0) / 3000) * 50)
  const repeat = step * 5, scale = step / 50
  const west = E0 + x0, east = E0 + x1, south = N0 + y0, north = N0 + y1
  const labels: { axis: 'E' | 'N'; value: number }[] = []
  for (let e = Math.ceil(west / step) * step; e <= east; e += step) labels.push({ axis: 'E', value: e })
  for (let n = Math.ceil(south / step) * step; n <= north; n += step) labels.push({ axis: 'N', value: n })
  const cellW = 256, cellH = 48, columns = 8
  const canvas = document.createElement('canvas')
  canvas.width = cellW * columns; canvas.height = THREE.MathUtils.ceilPowerOfTwo(Math.max(cellH, Math.ceil(labels.length / columns) * cellH))
  const ctx = canvas.getContext('2d')!
  ctx.font = '28px monospace'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#9aaebc'
  const positions: number[] = [], uvs: number[] = [], indices: number[] = []
  labels.forEach((label, index) => {
    const tx = index % columns * cellW, ty = Math.floor(index / columns) * cellH
    const value = String(label.value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    ctx.fillText(`${label.axis} ${value}`, tx + 4, ty + cellH / 2)
    const alongMin = label.axis === 'E' ? south : west, alongMax = label.axis === 'E' ? north : east
    for (let anchor = Math.ceil(alongMin / repeat) * repeat; anchor < alongMax; anchor += repeat) {
      const width = 32 * scale, height = 6 * scale
      const base = positions.length / 3, segments = 16
      let inside = true
      const patch: number[] = [], patchUV: number[] = []
      for (let row = 0; row <= 3; row++) for (let col = 0; col <= segments; col++) {
        const u = col / segments, v = row / 3
        // E text runs north along its easting line; N text runs east along its northing line.
        const e = label.axis === 'E' ? label.value - 1.5 * scale - v * height : anchor + 12 * scale + u * width
        const n = label.axis === 'E' ? anchor + 12 * scale + u * width : label.value + 1.5 * scale + v * height
        const x = e - E0, y = n - N0
        if (!field.hasCoverage(x,y) || x < x0 || x > x1 || y < y0 || y > y1) inside = false
        patch.push(x, terrain.ground(x, y) + 0.45, -y)
        patchUV.push((tx + u * cellW) / canvas.width, 1 - (ty + (1 - v) * cellH) / canvas.height)
      }
      if (!inside) continue
      positions.push(...patch); uvs.push(...patchUV)
      for (let row = 0; row < 3; row++) for (let col = 0; col < segments; col++) {
        const a = base + row * (segments + 1) + col, b = a + segments + 1
        indices.push(a, a + 1, b, a + 1, b + 1, b)
      }
    }
  })
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
  return new THREE.Mesh(geometry, material)
}
