import test from 'node:test'
import assert from 'node:assert/strict'
import {parseConfig} from '../src/model/configImport.ts'
import {extractPlaceNames,normalizePlace} from '../src/model/placeExtraction.ts'
import {areaMapOnly,validateAreaBounds} from '../src/model/sceneArea.ts'
import {HeightField} from '../src/scene/HeightField.ts'
const old={id:'aeuli',name:'Äuli',E0:2742528,N0:1219500}
const area={id:'region',name:'Region',E0:2750000,N0:1220000,bounds:[2730000,1200000,2770000,1240000],mode:'auto'}
const config={version:0,area,duration:90,elements:[{id:'unit',kind:'unit',pos:[2760000,1220000]}],phases:[],shots:[{id:'orbit',kind:'orbit',start:0,end:90,center:[2750000,1220000],radius:30000,alt:20000,a0:0,a1:90}]}
test('extracts military uppercase anchors, splitting area chains and excluding abbreviations',()=>{
 assert.deepEqual(extractPlaceNames('BLEM: Rm SEVELEN-TRIESEN O des RHEINS. WLEM: BALZERS. FOP OLTI RHEIN SCHOLLBERG - HOWAND BALZERS'),['SEVELEN','TRIESEN','RHEINS','BALZERS','RHEIN','SCHOLLBERG','HOWAND'])
 assert.equal(normalizePlace('Trübbach'),normalizePlace('TRUEBBACH'))
})
test('new region imports explicitly and supports distant entities and overview shots',()=>{
 const r=parseConfig(JSON.stringify(config),old,{allowAreaChange:true})
 assert.deepEqual(r.errors,[]);assert.deepEqual(r.config.area,area);assert.equal(areaMapOnly(area),true)
 assert.equal(parseConfig(JSON.stringify(config),old).config,null)
})
test('invalid region bounds, origins, modes and out-of-frame coordinates fail before apply',()=>{
 for(const patch of [{bounds:[2730000,1200000,2900000,1240000]},{E0:1},{mode:'whatever'},{bounds:[2730000,1240000,2770000,1200000]}]){
  assert.equal(parseConfig(JSON.stringify({...config,area:{...area,...patch}}),old,{allowAreaChange:true}).config,null)
 }
 assert.equal(parseConfig(JSON.stringify({...config,elements:[{id:'x',kind:'unit',pos:[9.5,47]}]}),old,{allowAreaChange:true}).config,null)
 assert.equal(validateAreaBounds([0,0,1000,1000]),false)
})
test('coverage marks missing terrain without corrupting supported samples',()=>{
 const f=new HeightField({E0:0,N0:0,west:0,north:2,step:1,rows:3,cols:3,Z0:0},new Float32Array(9).fill(400),new Uint8Array([1,1,0,1,1,0,1,1,0]))
 assert.equal(f.hasCoverage(.5,1.5),true);assert.equal(f.hasCoverage(1.5,1.5),false)
 assert.equal(f.sampleAbs(.5,1.5),400)
})
