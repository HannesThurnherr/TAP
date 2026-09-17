import test from 'node:test'
import assert from 'node:assert/strict'
import {UNIT_SYMBOLS,ECHELONS,AFFILIATIONS,POINT_SYMBOLS,TACTICAL_LINES,TACTICAL_AREAS} from '../src/symbology/catalog.ts'
import {unitDrawing,pointDrawing,symbolSvg,drawSymbol} from '../src/symbology/symbol.ts'
import {tacticalLine,tacticalArea,stations} from '../src/symbology/tactical.ts'
import {swissLegend} from '../src/symbology/legend.ts'
import {matchingAbbreviations} from '../src/model/abbreviations.ts'
import {parseConfig} from '../src/model/configImport.ts'
import {AUTHORING_RULES} from '../src/model/authoring.ts'
import {AEULI} from '../src/model/aeuli.ts'
const p=[AEULI.area.E0,AEULI.area.N0],q=[p[0]+100,p[1]+50],r=[p[0],p[1]+100]
const parse=elements=>parseConfig(JSON.stringify({...AEULI,elements}),AEULI.area)
test('every published symbol can be imported and is documented in the authoring contract',()=>{
 const es=[]
 for(const code of Object.keys(UNIT_SYMBOLS))es.push({id:code,kind:'unit',pos:p,symbol:{code}})
 for(const code of Object.keys(POINT_SYMBOLS))es.push({id:code,kind:'marker',pos:p,symbol:code})
 for(const code of Object.keys(TACTICAL_LINES))es.push({id:code,kind:'line',points:[p,q],tactical:code})
 for(const code of Object.keys(TACTICAL_AREAS))es.push({id:code,kind:'zone',points:[p,q,r],tactical:code})
 assert.deepEqual(parse(es).errors,[])
 for(const e of es)assert.ok(AUTHORING_RULES.includes(e.id),e.id)
})
test('symbol validation rejects unsupported codes, fields, affiliations and contradictory sides',()=>{
 for(const symbol of [{code:'tank'},{code:'infantry',affiliation:'enemy'},{code:'infantry',echelon:'section'},{code:'infantry',hq:1},{code:'infantry',madeUp:true},{code:'infantry',affiliation:'hostile'}])assert.equal(parse([{id:'u',kind:'unit',pos:p,side:'blue',symbol}]).config,null)
 const parsed=parse([{id:'u',kind:'unit',pos:p,symbol:{code:'infantry',affiliation:'hostile'}}]);assert.equal(parsed.config.elements[0].side,'red')
 assert.equal(parse([{id:'m',kind:'marker',pos:p,symbol:'checkpoint',designation:'123456789'}]).config,null)
 assert.equal(parse([{id:'l',kind:'line',points:[p,q],tactical:'concertina'}]).config,null)
})
test('legacy projects do not acquire symbols or lose existing entity fields on import',()=>{
 const result=parse(AEULI.elements);assert.deepEqual(result.errors,[])
 for(const e of result.config.elements)assert.equal(e.symbol,undefined)
 const u=AEULI.elements.find(e=>e.kind==='unit');if(u)assert.deepEqual(result.config.elements.find(e=>e.id===u.id),u)
})
test('active/planned and demolition readiness remain authored states independent of playback',()=>{
 const s={code:'infantry',affiliation:'friendly',echelon:'platoon'}
 assert.equal(unitDrawing(s,'blue','active').paths[0].dash,false)
 assert.equal(unitDrawing(s,'blue','planned').paths[0].dash,true)
 for(const [code,dashes] of [['demolitionPlanned',[true,true]],['demolitionPrepared2',[true,false]],['demolitionPrepared3',[false,false]]])assert.deepEqual(pointDrawing(code).paths.slice(1).map(p=>p.dash),dashes)
 assert.equal(tacticalArea('assembly',[p,q,r]).some(s=>s.dashed),false)
})
test('all affiliations and echelons render finite vectors, with matching SVG/canvas path data',()=>{
 const drawn=[];globalThis.Path2D=class{constructor(d){drawn.push(d)}}
 const ctx=new Proxy({}, {get:()=>()=>{},set:()=>true})
 for(const code of Object.keys(UNIT_SYMBOLS))for(const affiliation of Object.keys(AFFILIATIONS))for(const echelon of Object.keys(ECHELONS)){
  const d=unitDrawing({code,affiliation,echelon,hq:true,taskForce:true,strength:'reinforced'})
  assert.ok(!/NaN|undefined|Infinity/.test(symbolSvg(d)))
  drawn.length=0;drawSymbol(ctx,d,0,0,140,115);assert.deepEqual(drawn,d.paths.map(p=>p.d))
 }
 delete globalThis.Path2D
 assert.ok(symbolSvg(pointDrawing('checkpoint','blue','active','<8>')).includes('&lt;8&gt;'))
})
test('tactical geometry is finite, decorations bounded, and strongpoint ticks face outward for either winding',()=>{
 for(const code of Object.keys(TACTICAL_LINES))for(const points of [[p,q],[p,p,q],[p,[p[0]+50000,p[1]]]])assert.ok(tacticalLine(code,points).every(s=>s.points.flat().every(Number.isFinite)))
 assert.ok(stations([[0,0],[1000000,0]],1).length<=400)
 for(const ps of [[[0,0],[100,0],[100,100],[0,100]],[[0,100],[100,100],[100,0],[0,0]]]){
  for(const {points:[a,b]} of tacticalArea('strongpoint',ps,20).slice(1))assert.ok(Math.hypot(b[0]-50,b[1]-50)>Math.hypot(a[0]-50,a[1]-50))
 }
 assert.deepEqual(tacticalArea('strongpoint',[]),[])
})
test('legend includes only symbols visible during a phase and deduplicates repeated formations',()=>{
 const u={kind:'unit',pos:p,symbol:{code:'infantry'},from:0,to:10}
 const config={duration:30,elements:[{...u,id:'a'},{...u,id:'b'},{...u,id:'c',from:15,to:30,symbol:{code:'armor'}}]}
 assert.equal(swissLegend(config,0,10).length,1)
 assert.match(swissLegend(config,15,20)[0].label,/Panzer/)
})
test('abbreviation hints preserve word boundaries and flag ambiguity without rewriting text',()=>{
 const out=matchingAbbreviations('Inf Kp BRAVO im Rm WEITE. Pat. Keine Inflation oder GruppeZ.')
 assert.deepEqual(out.map(x=>x.short).sort(),['Inf','Kp','Pat','Rm'].sort())
 assert.match(out.find(x=>x.short==='Pat').meaning,/Mehrdeutig/)
})
