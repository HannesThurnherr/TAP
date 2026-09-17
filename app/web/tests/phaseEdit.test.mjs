import test from 'node:test'
import assert from 'node:assert/strict'
import { putPhase } from '../src/model/phaseEdit.ts'
const base = { id: 'p1', title: 'Lage', start: 0, end: 90, caption: 'Kontext' }
const next = { id: 'p2', title: 'Halten', start: 20, end: 50 }
test('drawing inside a full-duration phase preserves both remaining pieces and captions', () => {
 const before = structuredClone(base)
 assert.deepEqual(putPhase([base], next, 90, () => 'p3'), [{ ...base, end: 20 }, next, { ...base, id: 'p3', start: 50 }])
 assert.deepEqual(base, before)
})
test('editing excludes the old interval and trims across several neighbours', () => {
 const phases = [{ ...base, end: 20 }, next, { ...base, id: 'p3', start: 50 }]
 assert.deepEqual(putPhase(phases, { ...next, start: 10, end: 80 }, 90, () => 'unused'), [{ ...base, end: 10 }, { ...next, start: 10, end: 80 }, { ...base, id: 'p3', start: 80 }])
})
test('adjacent phases stay unchanged; full coverage replaces the covered phases', () => {
 assert.deepEqual(putPhase([{ ...base, end: 20 }], next, 90, () => 'unused'), [{ ...base, end: 20 }, next])
 assert.deepEqual(putPhase([base], { ...next, start: 0, end: 90 }, 90, () => 'unused'), [{ ...next, start: 0, end: 90 }])
})
test('invalid names and out-of-range or reversed times are rejected', () => {
 for (const patch of [{ title: ' ' }, { start: -1 }, { end: 91 }, { start: 60 }, { end: NaN }]) assert.throws(() => putPhase([base], { ...next, ...patch }, 90, () => 'unused'))
})
