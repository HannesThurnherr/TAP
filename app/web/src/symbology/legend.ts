import type {Config} from '../model/types'
import {UNIT_SYMBOLS,POINT_SYMBOLS,TACTICAL_LINES,TACTICAL_AREAS,ECHELONS,AFFILIATIONS,affiliationForSide} from './catalog.ts'
import {unitDrawing,pointDrawing,type SymbolDrawing} from './symbol.ts'
import {tacticalLine,tacticalArea} from './tactical.ts'
export function swissLegend(config:Config,start=0,end=config.duration){
 const entries=new Map<string,{label:string;drawing:SymbolDrawing}>()
 for(const e of config.elements){
  if((e.from??0)>=end||(e.to??config.duration)<=start)continue
  let label='',drawing:SymbolDrawing|undefined
  if(e.kind==='unit'&&e.symbol&&!e.model){label=UNIT_SYMBOLS[e.symbol.code].name+' · '+ECHELONS[e.symbol.echelon??'platoon']+' · '+AFFILIATIONS[e.symbol.affiliation??affiliationForSide(e.side)];if(e.symbol.hq)label+=' · Stab';if(e.symbol.taskForce)label+=' · Einsatzverband';if(e.symbol.strength)label+=e.symbol.strength==='reinforced'?' · verstärkt':' · vermindert';drawing=unitDrawing(e.symbol,e.side,e.status)}
  if(e.kind==='marker'&&e.symbol){label=POINT_SYMBOLS[e.symbol].name;drawing=pointDrawing(e.symbol,e.side,e.status)}
  if((e.kind==='line'||e.kind==='zone')&&e.tactical){
   label=e.kind==='line'?TACTICAL_LINES[e.tactical].name:TACTICAL_AREAS[e.tactical].name
   const strokes=e.kind==='line'?tacticalLine(e.tactical,[[15,75],[65,50],[120,60]],14,e.flip):tacticalArea(e.tactical,[[25,35],[110,25],[115,80],[30,85]],12)
   drawing={width:140,height:115,texts:[],paths:strokes.map(s=>({d:s.points.map((p,i)=>(i?'L':'M')+p.join(' ')).join(' ')+(s.closed?' Z':''),fill:s.fill?'#111':'none',stroke:'#111',width:1.8,dash:e.status==='planned'||s.dashed}))}
  }
  if(drawing){if(e.status==='planned')label+=' · geplant';const key=JSON.stringify(drawing)+label;entries.set(key,{label,drawing})}
 }
 return [...entries.values()]
}
