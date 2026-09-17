import test from 'node:test'
import assert from 'node:assert/strict'
import {dragElementNode} from '../src/model/geometryEdit.ts'
import {unitPosition,unitTrail} from '../src/model/timing.ts'
test('node edits preserve timing; whole drags translate all unit keys and base position',()=>{
 const unit={id:'u',kind:'unit',pos:[0,0],positionKeys:[{time:0,pos:[0,0]},{time:5,pos:[10,20]}]}
 const changed=dragElementNode(unit,1,[2,3])
 assert.deepEqual(changed.positionKeys,[{time:0,pos:[0,0]},{time:5,pos:[12,23]}])
 assert.deepEqual(dragElementNode(unit,0,[2,3],true).positionKeys,[{time:0,pos:[2,3]},{time:5,pos:[12,23]}])
 assert.deepEqual(unit.pos,[0,0])
})
test('curve-node dragging affects one node while whole drag preserves shape',()=>{
 const arrow={id:'a',kind:'move',points:[[0,0],[10,20],[30,0]]}
 assert.deepEqual(dragElementNode(arrow,1,[2,3]).points,[[0,0],[12,23],[30,0]])
 assert.deepEqual(dragElementNode(arrow,1,[2,3],true).points,[[2,3],[12,23],[32,3]])
})
test('curved units meet their timed anchors and preserve holds',()=>{
 const u={kind:'unit',pos:[0,0],smooth:true,positionKeys:[{time:0,pos:[0,0]},{time:10,pos:[100,100]},{time:20,pos:[200,0]}]}
 assert.deepEqual(unitPosition(u,10),[100,100]);assert.deepEqual(unitPosition(u,20),[200,0])
 assert.notDeepEqual(unitPosition(u,5),[50,50])
 assert.deepEqual(unitPosition({...u,interpolation:'hold'},5),[0,0])
})

test('linked trail endpoint agrees with unit through curves, pauses, easing and scrubbing',()=>{
 for(const smooth of [false,true])for(const interpolation of ['linear','ease','hold']){
  const u={kind:'unit',pos:[0,0],smooth,interpolation,positionKeys:[{time:1,pos:[0,0]},{time:4,pos:[100,100]},{time:7,pos:[100,100]},{time:12,pos:[200,0]}]}
  for(const t of [0,1,2.2,4,5,7,10.7,12,20,3,1])assert.deepEqual(unitTrail(u,t).at(-1),unitPosition(u,t))
 }
})
