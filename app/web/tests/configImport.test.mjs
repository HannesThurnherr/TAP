import test from 'node:test'
import assert from 'node:assert/strict'
import { parseConfig } from '../src/model/configImport.ts'
import { AUTHORING_RULES, authoringExample, buildAuthoringPrompt, estimateTokens } from '../src/model/authoring.ts'
import { AEULI } from '../src/model/aeuli.ts'
const area=AEULI.area, p=[area.E0,area.N0], q=[area.E0+50,area.N0+20]
const input=(elements=[])=>({version:0,area,duration:90,elements})
const parse=x=>parseConfig(JSON.stringify(x),area)
test('entire authoring guide stays far below token budget; prompt carries complete context and verbatim description',()=>{
  assert.ok(estimateTokens(AUTHORING_RULES)<12000)
  const description='Zug 1 bewegt sich nach Norden. "Warten"\nDanach sichern.'
  const prompt=buildAuthoringPrompt(AEULI,description,'Ortsangabe: Äuli',90,false)
  assert.ok(prompt.includes(JSON.stringify(description)))
  assert.ok(prompt.includes(JSON.stringify(area.E0)))
  assert.ok(prompt.includes('"references":[]'))
  assert.ok(estimateTokens(prompt)<12000)
  assert.ok(parse(authoringExample(AEULI)).config)
})
test('legacy example remains loadable and JSON code fences are accepted',()=>{
  assert.deepEqual(parse(AEULI).errors,[])
  assert.ok(parseConfig('```json\n'+JSON.stringify(input())+'\n```',area).config)
  assert.equal(parseConfig('Here is the JSON: '+JSON.stringify(input()),area).config,null)
})
test('minimal canonical entities receive safe defaults and range movement needs no legacy keys',()=>{
  const c=input([{id:'u',kind:'unit',pos:p},{id:'v',kind:'mover',points:[p,q],timing:'range',moveFrom:5,moveTo:20,from:5,to:80},{id:'a',kind:'move',points:[p,q],animation:'static'},{id:'f',kind:'fire',points:[p,q]},{id:'l',kind:'line',points:[p,q]},{id:'z',kind:'zone',points:[p,q,[area.E0+20,area.N0+70]]},{id:'m',kind:'marker',pos:p},{id:'c',kind:'cone',points:[p,q]},{id:'mw',kind:'mortar',points:[p,q]},{id:'text',kind:'callout',pos:p,text:'Test',attachTo:'u'}])
  const result=parse(c)
  assert.deepEqual(result.errors,[])
  assert.equal(result.config.elements[0].size,'platoon')
  assert.deepEqual(result.config.elements[1].keys,[[5,0],[20,1]])
  assert.equal(result.config.elements[1].until,80)
  assert.equal(result.config.phases.length,1)
  assert.deepEqual(result.config.shots,[])
})
test('rejects malformed types, unknown fields/kinds, wrong area and invalid geometry without throwing',()=>{
  for(const el of [null,[],42,{kind:'toString'},{kind:'__proto__'},{id:'a',kind:'banana'},{id:'u',kind:'unit',pos:[1]},{id:'u',kind:'unit',pos:p,type:'tank'},{id:'a',kind:'move',points:[p,p]},{id:'a',kind:'move',points:[p,q],speeed:3},{id:'a',kind:'mover',points:[p,q],keys:'oops'},{id:'a',kind:'unit',pos:p,positionKeys:[null]},{id:'a',kind:'mover',points:[p,q],keys:[[0,5]]}]) assert.equal(parse(input([el])).config,null,JSON.stringify(el))
  assert.equal(parse({...input(),area:{...area,E0:area.E0+100}}).config,null)
  assert.equal(parse({...input(),duration:'90'}).config,null)
  assert.equal(parse(input([{id:'u',kind:'unit',pos:[9.3,47.1]}])).config,null)
  assert.equal(parse({...input(),shots:[{kind:'orbit',id:'shot',start:0,end:20,center:p,radius:-1,alt:100,a0:0,a1:90}]}).config,null)
})
test('rejects invalid time windows, missing draw times, duplicate IDs and broken attachments',()=>{
  for(const es of [[{id:'a',kind:'move',points:[p,q],animation:'draw'}],[{id:'a',kind:'unit',pos:p,from:20,to:10}],[{id:'u',kind:'unit',pos:p},{id:'u',kind:'unit',pos:q}],[{id:'a',kind:'callout',pos:p,text:'x',attachTo:'missing'}],[null,{id:'a',kind:'callout',pos:p,text:'x',attachTo:'missing'}]])assert.equal(parse(input(es)).config,null)
})
test('assumptions and out-of-terrain placements are visible in import review',()=>{
  const r=parse({...input([{id:'u',kind:'unit',pos:[area.E0+2000,area.N0]}]),notes:['Timing is illustrative.']})
  assert.ok(r.config);assert.ok(r.warnings.includes('Timing is illustrative.'));assert.ok(r.warnings.some(w=>w.includes('ausserhalb')))
})
test('malformed compatibility fields cannot crash validation; degenerate zones are rejected',()=>{
  for(const keys of [{at:8},[null],{length:1},true,12])assert.equal(parse(input([{id:'m',kind:'mover',points:[p,q],keys}])).config,null)
  assert.equal(parse(input([{id:'z',kind:'zone',points:[p,q,[p[0]+100,p[1]+40]]}])).config,null)
})
test('reference context is bounded even with large geometry and long labels',()=>{
  const huge={...AEULI,elements:Array.from({length:500},(_,i)=>({id:'ref'+i,kind:'line',name:'Label'.repeat(800),points:Array.from({length:200},(_,j)=>[area.E0+j,area.N0+j])}))}
  assert.ok(estimateTokens(buildAuthoringPrompt(huge,'description','',90,true))<12000)
})

test('published guide stays synchronized with the prompt contract',async()=>{
  const {readFile}=await import('node:fs/promises')
  const guide=await readFile(new URL('../../docs/JSON_AUTHORING.md',import.meta.url),'utf8')
  assert.ok(guide.endsWith(AUTHORING_RULES+'\n'))
})

test('prompt separates preview terrain, schematic movement and alternative-case semantics',()=>{
 const p=buildAuthoringPrompt(AEULI,'BLEM: aus A in B stossen. WLEM: anderer Fall.','',90,false)
 assert.ok(p.includes('"currentAreaIsPreviewOnly":true'))
 assert.ok(p.includes('"canLoadNewAreaFromJSON":true'))
 assert.ok(p.includes('schematic visualization of the supplied actions between verified geographic anchors by default'))
 assert.ok(p.includes('Never imply that alternatives are cumulative'))
 assert.ok(p.includes('Missing targets/times for those capabilities must not block'))
 assert.ok(!p.includes('outerHalfExtentMetres'))
 assert.ok(!p.includes('If movement is requested but start, destination, or route is missing, ask'))
 assert.ok(estimateTokens(p)<12000)
})
