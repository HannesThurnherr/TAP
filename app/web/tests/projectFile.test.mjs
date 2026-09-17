import test from 'node:test'
import assert from 'node:assert/strict'
import { parseProject } from '../src/model/projectFile.ts'
import { AEULI } from '../src/model/aeuli.ts'
const fixture=()=>({format:'tap-project',version:1,config:structuredClone(AEULI),terrain:{source:{kind:'aeuli'},rectangle:null,rotation:0},view:{groundMode:'map',mapDetail:'detail'}})
test('project round trip preserves the full example, shots, and terrain view',()=>{
 const p=fixture(), loaded=parseProject(JSON.stringify(p))
 assert.deepEqual(loaded,p)
})
test('live terrain preserves exact bounds, rotated selection, and building preference',()=>{
 const p=fixture()
 p.config.area={id:'custom',name:'Test',E0:2742500,N0:1219500,heading:30}
 p.terrain={source:{kind:'swisstopo',bounds:[2741500,1218500,2743500,1220500],name:'Test',buildings:false},rectangle:{cx:2742500,cy:1219500,w:1200,h:1600},rotation:30}
 assert.deepEqual(parseProject(JSON.stringify(p)),p)
})
test('rejects mismatched terrain, malformed selections, unsupported files and invalid scenes',()=>{
 for(const change of [
  p=>p.version=2,
  p=>delete p.config.shots,
  p=>p.terrain.source={kind:'unknown'},
  p=>p.terrain.rotation=null,
  p=>p.terrain.rectangle={cx:1,cy:2,w:-1,h:2},
  p=>p.config.area.E0+=1000,
  p=>p.view.groundMode='invalid',
  p=>p.config.elements=[{kind:'unknown'}],
  p=>p.terrain.source={kind:'swisstopo',bounds:[0,0,50000,1000],name:'Too large',buildings:true},
 ]){
  const p=fixture();change(p);assert.throws(()=>parseProject(JSON.stringify(p)))
 }
 assert.throws(()=>parseProject(JSON.stringify(AEULI)),/LLM/)
 assert.throws(()=>parseProject('{'))
})

test('regional projects retain distant elements beyond the LLM import radius',()=>{
 const p=fixture()
 p.config.elements[0].pos=[p.config.area.E0+12000,p.config.area.N0]
 assert.deepEqual(parseProject(JSON.stringify(p)),p)
})
