import test from 'node:test'
import assert from 'node:assert/strict'
import {firePath} from '../src/scene/firePath.ts'
import {tracerEffect} from '../src/scene/TracerEffect.ts'

const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)

test('direct fire spans a valley in a straight 3D line, with the strip and every tracer lane aligned', () => {
  // Unequal endpoint heights, a deep central valley, and a steep cross-slope.
  const ground = (x, y) => 30 + .6 * x - 50 * Math.sin(Math.PI * x / 100) + y * 3
  const samples = Array.from({length: 101}, (_, i) => [i, 0])
  const path = firePath(samples, 20, ground)
  near(path.length, Math.hypot(100, 60))
  for (let i = 0; i <= 100; i++) {
    const p = path.at(i / 100)
    near(p.x, i); near(p.y, 31.4 + .6 * i); near(p.z, 0)
  }
  const tracers = tracerEffect('valley', path.at, path.length, 20)
  for (const geometry of [path.geometry, ...tracers.group.children.map(m => m.geometry)]) {
    const p = geometry.getAttribute('position')
    for (let i = 0; i < p.count; i++) near(p.getY(i), 31.4 + .6 * p.getX(i))
  }
  assert.ok(path.at(.5).y > ground(50, 0) + 40)
  path.geometry.dispose(); tracers.dispose()
})

test('an intervening ridge does not lift the engagement over the terrain', () => {
  const path = firePath([[0, 0], [50, 50], [100, 100]], 12,
    (x, y) => 10 + .2 * y + 100 * Math.sin(Math.PI * x / 100))
  const mid = path.at(.5)
  near(mid.x, 50); near(mid.z, -50); near(mid.y, 21.4)
  // End-to-end slope is shared across the full ribbon width, never draped laterally.
  near(path.at(.5, 6).y, mid.y); near(path.at(.5, -6).y, mid.y)
  near(path.length, Math.hypot(100, 100, 20))
  path.geometry.dispose()
})

test('explicit horizontal control points remain supported without terrain-following heights', () => {
  const path = firePath([[0, 0], [30, 40], [60, 0]], 4, (x, y) => x / 2 + y * 10)
  const mid = path.at(.5)
  near(mid.x, 30); near(mid.z, -40); near(mid.y, 16.4)
  near(path.length, Math.hypot(100, 30))
  path.geometry.dispose()
})

test('repeated and coincident points produce finite geometry', () => {
  for (const points of [[[0, 0], [0, 0], [10, 0]], [[0, 0], [0, 0]]]) {
    const path = firePath(points, 4, () => 3)
    assert.ok([...path.geometry.getAttribute('position').array].every(Number.isFinite))
    for (const u of [0, .5, 1]) assert.ok(path.at(u).toArray().every(Number.isFinite))
    path.geometry.dispose()
  }
})
