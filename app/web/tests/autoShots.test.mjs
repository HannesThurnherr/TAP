import test from 'node:test'
import assert from 'node:assert/strict'
import {generateShots,fitShot} from '../src/model/autoShots.ts'
const area={id:'aeuli',name:'Äuli',E0:2742500,N0:1219500}
const cfg={version:0,area,duration:30,phases:[{id:'p1',title:'First',start:0,end:10},{id:'p2',title:'Second',start:20,end:30}],shots:[],elements:[{id:'moving',kind:'unit',pos:[2742500,1219500],positionKeys:[{time:0,pos:[2742500,1219500]},{time:10,pos:[2743500,1219500]}],from:0,to:10},{id:'late',kind:'marker',pos:[2746500,1219500],from:20,to:30}]}
test('automatic shots cover phase gaps and complete movement paths without late entities changing early framing',()=>{
 const shots=generateShots(cfg)
 assert.deepEqual(shots.map(s=>[s.start,s.end]),[[0,10],[10,20],[20,30]])
 assert.deepEqual(shots[0].center,[2743000,1219500])
 assert.equal(shots[0].a1-shots[0].a0,24)
 assert.deepEqual(shots[2].center,[2746500,1219500])
})
test('wider framing and narrower vertical field of view increase distance; terrain relief is included',()=>{
 const normal=fitShot(cfg,0,10,16/9)
 assert.ok(fitShot(cfg,0,10,3).alt>normal.alt)
 assert.ok(fitShot(cfg,0,10,16/9,undefined,1.8).alt>normal.alt)
 assert.ok(fitShot(cfg,0,10,16/9,undefined,1.4,p=>p[0]===2743500?900:0).alt>normal.alt)
})
test('empty scenes receive a finite overview and focusing does not mutate the scene',()=>{
 const before=JSON.stringify(cfg)
 const shot=fitShot({...cfg,elements:[]},0,30)
 assert.deepEqual(shot.center,[area.E0,area.N0]);assert.ok(Number.isFinite(shot.alt)&&shot.alt>0)
 fitShot(cfg,0,30,16/9,['late']);assert.equal(JSON.stringify(cfg),before)
})

test('phase framing excludes remote persistent backgrounds and uses only movement within that phase',()=>{
 const scene={...cfg,duration:20,phases:[{start:0,end:10},{start:10,end:20}],elements:[
 {id:'u',kind:'unit',pos:[2742500,1219500],positionKeys:[{time:0,pos:[2742500,1219500]},{time:10,pos:[2742600,1219500]},{time:20,pos:[2742700,1219500]}]},
 {id:'background',kind:'line',points:[[2740000,1217000],[2748000,1225000]]}]}
 const shots=generateShots(scene)
 assert.deepEqual(shots.map(s=>s.center),[[2742550,1219500],[2742650,1219500]])
 assert.ok(shots.every(s=>s.alt<250),'local movement should not produce kilometre-high cameras')
})
test('a single long phase is split into multiple activity windows',()=>{
 const shots=generateShots({...cfg,duration:90,phases:[{start:0,end:90}]})
 assert.equal(shots.length,4);assert.equal(shots[0].start,0);assert.equal(shots.at(-1).end,90)
 assert.ok(shots.every(s=>s.end-s.start<=24&&s.a0!==s.a1))
})
test('vehicles use timed progress including halts and destruction, not their full future path',()=>{
 const mover={id:'v',kind:'mover',points:[[2742500,1219500],[2743500,1219500]],keys:[],timing:'progress',progress:[[0,0],[10,.1],[20,.1],[30,1]],destroyed:22}
 const scene={...cfg,phases:[],elements:[mover]}
 assert.deepEqual(fitShot(scene,0,10).center,[2742550,1219500])
 assert.deepEqual(fitShot(scene,10,20).center,[2742600,1219500])
 const late=fitShot(scene,23,30)
 assert.ok(Math.abs(late.center[0]-2742780)<.001)
})
test('projected ground points fit throughout default orbit with a much closer camera',()=>{
 const scene={...cfg,elements:[{id:'z',kind:'zone',points:[[2742500,1219500],[2742700,1219500],[2742700,1219700],[2742500,1219700]]}]}
 const s=fitShot(scene,0,10,16/9,undefined,1.02),dist=Math.hypot(s.radius,s.alt),elev=Math.atan2(s.alt,s.radius)
 assert.ok(s.alt<300)
 for(let i=0;i<=32;i++)for(const p of scene.elements[0].points){
  const a=(s.a0+(s.a1-s.a0)*i/32)*Math.PI/180,x=p[0]-s.center[0],y=p[1]-s.center[1]
  const depth=dist-Math.cos(elev)*(x*Math.cos(a)+y*Math.sin(a))
  assert.ok(Math.abs(-x*Math.sin(a)+y*Math.cos(a))<depth*.75)
  assert.ok(Math.abs(-Math.sin(elev)*(x*Math.cos(a)+y*Math.sin(a)))<depth*.75/(16/9))
 }
})
