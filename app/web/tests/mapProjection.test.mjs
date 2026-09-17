import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { terrainBounds, mapUV, mapRequest, mapResolution } from '../src/scene/mapProjection.ts'
const core = JSON.parse(readFileSync(new URL('../public/areas/aeuli/dem.json', import.meta.url)))
const outer = JSON.parse(readFileSync(new URL('../public/areas/aeuli/dem_outer.json', import.meta.url)))

test('map corners use actual sample intervals and keep north at the top', () => {
  const b = terrainBounds(outer)
  assert.equal(b[2] - b[0], 2994)
  assert.equal(b[3] - b[1], 2994)
  assert.deepEqual(mapUV(b[0], b[3], b), [0, 1])
  assert.deepEqual(mapUV(b[2], b[1], b), [1, 0])
})

test('core and ring agree in LV95, including their overlap, at every sampled vertex', () => {
  const b = terrainBounds(outer)
  for (const m of [core, outer]) for (let r = 0; r < m.rows; r += 17) for (let c = 0; c < m.cols; c += 17) {
    const E = m.E0 - m.half + c * m.step, N = m.N0 + m.half - r * m.step
    const [u, v] = mapUV(E, N, b)
    assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1)
    assert.ok(Math.abs((b[0] + u * (b[2] - b[0])) - E) < 1e-8)
    assert.ok(Math.abs((b[1] + v * (b[3] - b[1])) - N) < 1e-8)
  }
})

test('request uses LV95 easting/northing bounds and the same grey map as the picker', () => {
  const b = terrainBounds(outer), p = new URL(mapRequest(b, 1, 4096).url).searchParams
  assert.equal(p.get('CRS'), 'EPSG:2056')
  assert.equal(p.get('BBOX'), b.join(','))
  assert.equal(p.get('LAYERS'), 'ch.swisstopo.pixelkarte-grau')
  assert.equal(p.get('WIDTH'), '2994')
})

test('texture budgets are respected for local and regional rectangles without changing aspect', () => {
  for (const b of [terrainBounds(outer), [2700000, 1200000, 2742000, 1226000]]) for (const max of [1024, 4096]) {
    const r = mapRequest(b, 0.5, max)
    assert.ok(r.width <= max && r.height <= max)
    assert.ok(Math.abs((b[2] - b[0]) / r.width - (b[3] - b[1]) / r.height) < r.resolution / r.height + 0.001)
  }
})

test('automatic cartographic detail coarsens with viewing distance; overrides remain stable', () => {
  assert.equal(mapResolution('auto', 0.1), 0.5)
  assert.equal(mapResolution('auto', 1.2), 2)
  assert.equal(mapResolution('auto', 7), 8)
  assert.equal(mapResolution('detail', 7), 0.5)
  assert.equal(mapResolution('overview', 0.1), 2)
})
