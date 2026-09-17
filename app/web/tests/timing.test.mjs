import test from 'node:test'
import assert from 'node:assert/strict'
import { arrowProgress, moverKeys, interpolateKeys, parseTime } from '../src/model/timing.ts'
import { elementWindow } from '../src/model/types.ts'
const arrow = { kind: 'move', id: 'a', points: [[0,0],[100,0]] }
const mover = { kind: 'mover', id: 'm', moverKind: 'team', points: [[0,0],[50,0],[100,0]], keys: [[10,0],[20,2]] }
test('static arrows are immediately complete; draw timing is independent of visibility', () => {
  assert.equal(arrowProgress({...arrow, animation:'static', from:10},10,120),1)
  const a = {...arrow, animation:'draw', from:0, to:100, drawFrom:10, drawTo:20}
  assert.equal(arrowProgress(a,5,120),0)
  assert.equal(arrowProgress(a,15,120),0.5)
  assert.equal(arrowProgress(a,20,120),1)
  assert.equal(arrowProgress(a,90,120),1)
  assert.deepEqual(elementWindow(a,{duration:120}),[0,100])
})
test('zero duration arrows and legacy buildup remain supported', () => {
  assert.equal(arrowProgress({...arrow, animation:'draw',drawFrom:10,drawTo:10},9,120),0)
  assert.equal(arrowProgress({...arrow, animation:'draw',drawFrom:10,drawTo:10},10,120),1)
  assert.equal(arrowProgress({...arrow,from:10,buildup:4},12,120),0.5)
  assert.equal(arrowProgress({...arrow,from:10,buildup:0},10,120),1)
  assert.equal(arrowProgress({...arrow,animation:'draw',drawFrom:null,drawTo:20},5,120),1)
})
test('mover departure/arrival and visibility are separate; cleared times use scenario boundaries', () => {
  const m = {...mover,timing:'range',moveFrom:12,moveTo:42,until:80}
  assert.deepEqual(moverKeys(m,[0,0.5,1],120),[[12,0],[42,1]])
  assert.deepEqual(elementWindow(m,{duration:120}),[0,80])
  assert.deepEqual(moverKeys({...m,timing:'range',moveFrom:null,moveTo:null},[],120),[[0,0],[120,1]])
  assert.deepEqual(moverKeys({...mover,timing:'range'},[],120),[[10,0],[20,1]])
})
test('waypoint times, halts, reversing, unordered and simultaneous keys', () => {
  assert.deepEqual(moverKeys(mover,[0,.4,1],120),[[10,0],[20,1]])
  const keys = [[30,.2],[0,0],[10,.8],[20,.8],[40,1]]
  assert.equal(interpolateKeys(keys,5),.4)
  assert.equal(interpolateKeys(keys,15),.8)
  assert.equal(interpolateKeys(keys,25),.5)
  assert.equal(interpolateKeys(keys,99),1)
  assert.equal(interpolateKeys([[0,0],[10,.3],[10,.7],[20,1]],10),.7)
  assert.equal(interpolateKeys([],10),0)
  assert.deepEqual(moverKeys({...mover,timing:'progress',progress:keys},[],120),keys)
})
test('time inputs preserve fractions, support seconds/mm:ss, and reject malformed values', () => {
  assert.equal(parseTime('01:08.5'),68.5)
  assert.equal(parseTime('12.25'),12.25)
  assert.equal(parseTime(''),null)
  assert.equal(parseTime('Ende'),null)
  for (const s of ['-1','NaN','1:99','1:2:3','oops']) assert.equal(parseTime(s),undefined)
})

import { unitPosition, mortarState } from '../src/model/timing.ts'
test('unit position keys interpolate, hold, reverse and stay at the boundary positions', () => {
  const u={kind:'unit',pos:[0,0],positionKeys:[{time:10,pos:[100,40]},{time:0,pos:[0,0]},{time:20,pos:[100,40]},{time:30,pos:[0,0]}]}
  assert.deepEqual(unitPosition(u,5),[50,20])
  assert.deepEqual(unitPosition(u,15),[100,40])
  assert.deepEqual(unitPosition(u,25),[50,20])
  assert.deepEqual(unitPosition(u,-1),[0,0])
  assert.deepEqual(unitPosition(u,100),[0,0])
  assert.deepEqual(unitPosition({...u,interpolation:'hold'},5),[0,0])
  assert.deepEqual(unitPosition({...u,interpolation:'hold'},10),[100,40])
  assert.deepEqual(unitPosition({...u,interpolation:'ease'},2.5),[15.625,6.25])
  assert.deepEqual(unitPosition({...u,positionKeys:[]},10),[0,0])
  assert.deepEqual(unitPosition({...u,positionKeys:[{time:0,pos:[1,1]},{time:0,pos:[2,2]}]},0),[2,2])
})
test('mortar has deterministic launch, continuous flight and persistent spent trail when scrubbing', () => {
  assert.deepEqual(mortarState(9,10,20,2),{visible:false,progress:0,flying:false,flash:0})
  assert.deepEqual(mortarState(10,10,20,2),{visible:true,progress:0,flying:true,flash:1})
  assert.equal(mortarState(11,10,20,2).progress,.5)
  assert.equal(mortarState(11.001,10,20,2).flying,true)
  assert.deepEqual(mortarState(12,10,20,2),{visible:true,progress:1,flying:false,flash:0})
  assert.equal(mortarState(19,10,20,2).visible,true)
  assert.equal(mortarState(21,10,20,2).visible,false)
  assert.equal(mortarState(11,10,20,2).progress,.5)
  assert.equal(mortarState(10,10,20,0).progress,0)
})
