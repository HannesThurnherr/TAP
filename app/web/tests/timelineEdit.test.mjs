import test from 'node:test'
import assert from 'node:assert/strict'
import { retimeElement, timelineWindow } from '../src/model/timelineEdit.ts'
const base={id:'a',kind:'move',points:[[0,0],[100,0]],from:10,to:30,animation:'draw',drawFrom:12,drawTo:20}
test('moving an arrow preserves duration, offsets and geometry without mutating the original',()=>{
  const moved=retimeElement(base,90,'move',5)
  assert.deepEqual([moved.from,moved.to,moved.drawFrom,moved.drawTo],[15,35,17,25])
  assert.equal(moved.points,base.points)
  assert.equal(base.from,10)
  assert.deepEqual(timelineWindow(retimeElement(base,90,'move',-100),90),[0,20])
  assert.deepEqual(timelineWindow(retimeElement(base,90,'move',100),90),[70,90])
})
test('either end retimes events proportionally and cannot cross the other',()=>{
  let e=retimeElement(base,90,'end',20)
  assert.deepEqual([e.from,e.to,e.drawFrom,e.drawTo],[10,50,14,30])
  e=retimeElement(base,90,'start',-10)
  assert.deepEqual([e.from,e.to,e.drawFrom,e.drawTo],[0,30,3,15])
  assert.ok(retimeElement(base,90,'start',100).from<30)
  assert.ok(retimeElement(base,90,'end',-100).to>10)
})
test('unit keys, activation, mortar flight and default boundaries retime with the clip',()=>{
  const u={kind:'unit',id:'u',pos:[0,0],from:10,to:30,positionKeys:[{time:10,pos:[0,0]},{time:20,pos:[10,10]}]}
  assert.deepEqual(retimeElement(u,90,'end',20).positionKeys.map(k=>k.time),[10,30])
  assert.equal(retimeElement({kind:'zone',from:10,to:30,active:20},90,'end',20).active,30)
  const m=retimeElement({kind:'mortar',from:10,to:30,flight:2},90,'end',20)
  assert.equal(m.flight,4)
  assert.equal(retimeElement({kind:'mortar',from:10,to:30,flight:2},90,'move',10).flight,2)
  assert.deepEqual(timelineWindow(retimeElement({kind:'unit',pos:[0,0]},90,'end',-30),90),[0,60])
})
test('vehicle effective start, range keys, progress, destruction and visibility stay consistent',()=>{
  const mv={kind:'mover',id:'v',points:[[0,0],[1,1]],keys:[[10,0],[20,1]],progress:[[10,0],[15,.4],[20,1]],timing:'progress',until:30,destroyed:25}
  assert.deepEqual(timelineWindow(mv,90),[10,30])
  const shifted=retimeElement(mv,90,'move',5)
  assert.deepEqual(timelineWindow(shifted,90),[15,35])
  assert.deepEqual(shifted.progress,[[15,0],[20,.4],[25,1]])
  assert.equal(shifted.destroyed,30)
  const stretched=retimeElement({...mv,timing:'range'},90,'end',20)
  assert.equal(stretched.moveFrom,10)
  assert.equal(stretched.moveTo,30)
  assert.equal(stretched.until,50)
  assert.equal(stretched.destroyed,40)
})
test('legacy arrow draw defaults resolve before changing the duration',()=>{
  const e=retimeElement({...base,animation:undefined,drawFrom:undefined,drawTo:undefined,buildup:4},90,'end',20)
  assert.equal(e.drawFrom,10);assert.equal(e.drawTo,18);assert.equal(e.buildup,8)
  assert.equal(retimeElement(base,90,'move',0),base)
})
