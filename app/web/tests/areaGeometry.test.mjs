import test from 'node:test'
import assert from 'node:assert/strict'
import { rotatedCorners, cornersBounds, dragCorner } from '../src/services/areaGeometry.ts'

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`)

test('rotatedCorners: 0° is north-up NW,NE,SE,SW; 90° turns the top edge to the east', () => {
  const c0 = rotatedCorners(1000, 2000, 400, 200, 0)
  assert.deepEqual(c0.map(p => p.map(Math.round)), [[800, 2100], [1200, 2100], [1200, 1900], [800, 1900]])
  const c90 = rotatedCorners(1000, 2000, 400, 200, 90)
  // clockwise 90°: the rectangle's "north" points east, so NW corner (-200,+100) -> (+100,+200)
  near(c90[0][0], 1100); near(c90[0][1], 2200)
  const b = cornersBounds(c90)
  assert.deepEqual(b.map(Math.round), [900, 1800, 1100, 2200])
})

test('dragCorner keeps the opposite corner fixed, also when rotated', () => {
  for (const deg of [0, 25, 133, 290]) {
    const r = { cx: 2734500, cy: 1220800, w: 1800, h: 1200 }
    const before = rotatedCorners(r.cx, r.cy, r.w, r.h, deg)
    for (let i = 0; i < 4; i++) {
      const q = [before[i][0] + 300, before[i][1] - 250]   // drag corner i somewhere
      const r2 = dragCorner(r, deg, i, q[0], q[1])
      const after = rotatedCorners(r2.cx, r2.cy, r2.w, r2.h, deg)
      const opp = (i + 2) % 4
      near(after[opp][0], before[opp][0], 1e-3); near(after[opp][1], before[opp][1], 1e-3)
      near(after[i][0], q[0], 1e-3); near(after[i][1], q[1], 1e-3)
    }
  }
})

test('dragCorner enforces the minimum size', () => {
  const r = { cx: 0, cy: 0, w: 1000, h: 1000 }
  const r2 = dragCorner(r, 0, 1, -450, -450)   // NE corner dragged past the SW corner
  assert.equal(r2.w, 200); assert.equal(r2.h, 200)
})
