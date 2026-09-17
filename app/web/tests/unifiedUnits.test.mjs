import test from 'node:test'
import assert from 'node:assert/strict'
import {UNIT_MODELS} from '../src/model/types.ts'
import {unitPosition,unitTrail,elementPose} from '../src/model/timing.ts'
import {retimeElement} from '../src/model/timelineEdit.ts'
import {parseConfig} from '../src/model/configImport.ts'
import {AEULI} from '../src/model/aeuli.ts'
const p=[AEULI.area.E0,AEULI.area.N0]
const u={id:'u',kind:'unit',pos:p,type:'infantry',size:'platoon',from:0,to:60,smooth:true,symbol:{code:'infantry'},positionKeys:[{time:0,pos:p},{time:10,pos:[p[0]+100,p[1]+70]},{time:20,pos:[p[0]+250,p[1]]}]}
const parse=elements=>parseConfig(JSON.stringify({...AEULI,elements}),AEULI.area)
test('all vehicle appearances import as units and retain their keyframes and linked arrow',()=>{
 for(const model of Object.keys(UNIT_MODELS)){
  const c=parse([{...u,model,trail:true,destroyed:15},{id:'arrow',kind:'move',followUnit:'u',points:[p,[p[0]+250,p[1]]]}]);assert.deepEqual(c.errors,[]);assert.equal(c.config.elements[0].kind,'unit');assert.deepEqual(c.config.elements[0].positionKeys,u.positionKeys)
 }
 for(const extra of [{model:'tank'},{trail:1},{destroyed:-1}])assert.equal(parse([{...u,...extra}]).config,null)
})
test('changing appearance preserves every position, trail and camera anchor',()=>{
 for(const t of [0,4,9,10,13,20,35])for(const model of Object.keys(UNIT_MODELS)){
  const v={...u,model};assert.deepEqual(unitPosition(v,t),unitPosition(u,t));assert.deepEqual(unitTrail(v,t),unitTrail(u,t));assert.deepEqual(elementPose({elements:[v]},'u',t),elementPose({elements:[u]},'u',t))
 }
})
test('destruction freezes unit, linked trail endpoint and camera; scrubbing back restores movement',()=>{
 const v={...u,model:'truck',destroyed:13},stop=unitPosition(u,13)
 for(const t of [13,15,20,90]){assert.deepEqual(unitPosition(v,t),stop);assert.deepEqual(unitTrail(v,t).at(-1),stop);assert.deepEqual(elementPose({elements:[v]},'u',t).pos,stop)}
 assert.deepEqual(unitPosition(v,5),unitPosition(u,5));assert.deepEqual(unitTrail(v,5).at(-1),unitPosition(v,5))
})
test('timeline moves and stretches destruction together with movement keys',()=>{
 const v={...u,destroyed:15}
 const shifted=retimeElement(v,90,'move',10);assert.equal(shifted.destroyed,25);assert.equal(shifted.positionKeys[1].time,20)
 const stretched=retimeElement(v,90,'end',30);assert.equal(stretched.destroyed,22.5);assert.equal(stretched.positionKeys[1].time,15)
})
test('legacy vehicle timing and fields are preserved without lossy automatic conversion',()=>{
 const m={id:'old',kind:'mover',moverKind:'bmp',points:[p,[p[0]+100,p[1]]],keys:[[0,0],[20,1]],timing:'progress',progress:[[0,0],[5,.4],[10,.4],[20,1]],trail:true,destroyed:18,until:60}
 const c=parse([m]);assert.deepEqual(c.errors,[]);for(const [key,value] of Object.entries(m))assert.deepEqual(c.config.elements[0][key],value)
})
