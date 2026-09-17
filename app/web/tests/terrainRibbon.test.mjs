import test from 'node:test'
import assert from 'node:assert/strict'
import {terrainRibbon} from '../src/scene/terrainRibbon.ts'

test('wide movement arrows follow an interior ridge even when both edges are flat',()=>{
 const ground=(x,y)=>Math.max(0,5-Math.abs(y))
 const g=terrainRibbon(Array.from({length:51},(_,i)=>[i*2,0]),24,true,ground)
 const pos=g.getAttribute('position'),a=g.getAttribute('along'),cross=g.getAttribute('across')
 let ridgeSamples=0
 for(let i=0;i<pos.count;i++){
  assert.ok(Math.abs(pos.getY(i)-ground(pos.getX(i),-pos.getZ(i))-2)<.0001)
  if(Math.abs(pos.getZ(i))<1&&pos.getX(i)<30){assert.ok(pos.getY(i)>6);ridgeSamples++}
  assert.ok(a.getX(i)>=0&&a.getX(i)<=1);assert.ok(Math.abs(cross.getX(i))<=1)
 }
 assert.ok(ridgeSamples>10,'terrain must be sampled inside the ribbon, not only at its sides')
 // Check triangle interiors too: a gentle bump must not poke through between samples.
 const idx=g.index
 for(let i=0;i<idx.count;i+=3){let x=0,y=0,z=0;for(let j=0;j<3;j++){const k=idx.getX(i+j);x+=pos.getX(k)/3;y+=pos.getY(k)/3;z+=pos.getZ(k)/3}assert.ok(y>ground(x,-z))}
 g.dispose()
})
test('non-movement ribbons retain their existing clearance',()=>{
 const g=terrainRibbon([[0,0],[10,0]],8,false,()=>3)
 const p=g.getAttribute('position')
 for(let i=0;i<p.count;i++)assert.equal(p.getY(i),3.5)
 assert.equal(g.userData.length,10);g.dispose()
})
