import {UNIT_SYMBOLS, ECHELONS, AFFILIATIONS, TACTICAL_LINES, TACTICAL_AREAS, POINT_SYMBOLS} from '../symbology/catalog.ts'
import { validateAreaBounds } from './sceneArea.ts'
import type { Area, Config } from './types'

export interface ImportResult { config: Config | null; errors: string[]; warnings: string[] }
const common = 'id kind name side from to occlude status'
const fields: Record<string,string> = {
  unit:'model trail destroyed symbol smooth pos type size roof footprint positionKeys interpolation', move:'followUnit points smooth animation drawFrom drawTo style width buildup',
  fire:'points fireKind smooth width', line:'tactical points lineKind smooth width color flip', zone:'tactical points zoneKind color active',
  mover:'points moverKind smooth timing moveFrom moveTo until progress keys destroyed trail',
  callout:'pos text sub color offset follow screenPos attachTo roof', cone:'points angle', mortar:'points height flight', marker:'symbol designation pos markerKind'
}
const enums: Record<string,string[]> = {
  status:['active','planned'],side:['blue','red','neutral','unknown'],type:['infantry','mech','recon','hq','support','obstacle'],size:['team','squad','platoon','company'],
  interpolation:['linear','ease','hold'], animation:['static','draw'],style:['solid','dashed'],fireKind:['fire','suppress'],
  lineKind:['pl','sperre','hindernis','stellung','route'],zoneKind:['kill','objective','assembly','dismount','support'],
  model:['bmp','ifv','apc','piranha','truck','team','squad','platoon'],moverKind:['bmp','ifv','apc','piranha','truck','team','squad','platoon'],timing:['range','keys','progress'],markerKind:['contact','breach','casualty']
}
const object = (x:any): x is Record<string,any> => x!==null && typeof x==='object' && !Array.isArray(x)
export function parseConfig(text: string, area: Area, options: { projectFile?: boolean; allowAreaChange?: boolean } = {}): ImportResult {
  const errors:string[]=[], warnings:string[]=[]
  let outsideTerrain=false
  const err=(p:string,m:string)=>{if(errors.length<30)errors.push(`${p}: ${m}`)}
  let c:any
  try { const trimmed=text.trim().replace(/^\uFEFF/,''); const fence=/^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed); c=JSON.parse(fence?fence[1]:trimmed) }
  catch { return {config:null,errors:['Ungültiges JSON. Die vollständige JSON-Antwort einfügen (ohne Einleitung; ein JSON-Codeblock ist erlaubt).'],warnings} }
  if(!object(c))return {config:null,errors:['Die Antwort muss ein JSON-Objekt sein.'],warnings}
  if(options.allowAreaChange && object(c.area) && c.area.bounds!==undefined) {
    if(!validateAreaBounds(c.area.bounds)) return {config:null,errors:['area.bounds: LV95 [West,Süd,Ost,Nord], 100 m bis 100 km Seitenlänge erwartet.'],warnings}
    const b=c.area.bounds
    if(!Number.isFinite(c.area.E0)||!Number.isFinite(c.area.N0)||Math.abs(c.area.E0-(b[0]+b[2])/2)>1||Math.abs(c.area.N0-(b[1]+b[3])/2)>1) return {config:null,errors:['area: E0/N0 müssen dem Mittelpunkt von bounds entsprechen.'],warnings}
    area=c.area as unknown as Area
    warnings.push('Gebiet wird aus der JSON-Antwort übernommen; Karte / verfügbares Gelände werden neu geladen.')
  }
  const allowed=(o:any,names:string,p:string)=>{ for(const k of Object.keys(o))if(!names.split(' ').includes(k))err(`${p}.${k}`,'Unbekanntes Feld') }
  const num=(v:any,p:string,min=-Infinity,max=Infinity)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)err(p,`Zahl zwischen ${min} und ${max} erwartet`)}
  const str=(v:any,p:string)=>{if(typeof v!=='string'||v.length>4000)err(p,'Text (max. 4000 Zeichen) erwartet')}
  const point=(v:any,p:string,n=2,geo=true)=>{if(!Array.isArray(v)||v.length!==n){err(p,`${n} Koordinaten erwartet`);return}v.forEach((x:any,i:number)=>num(x,`${p}[${i}]`)); if(geo&&v.every(Number.isFinite)&&area.id==='aeuli'&&(Math.abs(v[0]-area.E0)>1494||Math.abs(v[1]-area.N0)>1494))outsideTerrain=true; if(!options.projectFile&&area.bounds&&geo&&v.every(Number.isFinite)&&(v[0]<area.bounds[0]||v[0]>area.bounds[2]||v[1]<area.bounds[1]||v[1]>area.bounds[3]))err(p,'Ausserhalb von area.bounds'); if(!area.bounds&&!options.projectFile&&geo&&v.every(Number.isFinite)&&Math.hypot(v[0]-area.E0,v[1]-area.N0)>5000)err(p,'Ausserhalb des geladenen Geländes; LV95 [Ost, Nord] verwenden') }
  allowed(c,'version area duration phases elements shots notes captions','config')
  if(c.version!==0)err('version','Unterstützt wird Version 0')
  num(c.duration,'duration',0.1,86400)
  const duration=typeof c.duration==='number'?c.duration:90
  if(!object(c.area)||c.area.id!==area.id||typeof c.area.E0!=='number'||typeof c.area.N0!=='number'||Math.abs(c.area.E0-area.E0)>0.01||Math.abs(c.area.N0-area.N0)>0.01)err('area','Gebiet / Ursprung muss zum aktuell geladenen Gelände passen')
  else {allowed(c.area,'id name E0 N0 heading bounds mode','area');str(c.area.id,'area.id');str(c.area.name,'area.name');if(c.area.bounds!==undefined&&!validateAreaBounds(c.area.bounds))err('area.bounds','Ungültiger Ausschnitt');if(c.area.mode!==undefined&&!['auto','map','terrain'].includes(c.area.mode))err('area.mode','auto, map oder terrain erwartet');if(c.area.heading!==undefined)num(c.area.heading,'area.heading')}
  if(c.notes!==undefined){if(!Array.isArray(c.notes)||c.notes.length>30)err('notes','Maximal 30 Hinweise erwartet');else c.notes.forEach((s:any,i:number)=>str(s,`notes[${i}]`))}
  const time=(v:any,p:string)=>{if(v!=null)num(v,p,0,duration)}
  const window=(o:any,p:string,a='from',b='to')=>{time(o[a],`${p}.${a}`);time(o[b],`${p}.${b}`);if(o[a]!=null&&o[b]!=null&&o[b]<o[a])err(p,`${b} muss nach ${a} liegen`)}
  c.phases??=[{id:'phase1',title:'Manöver',start:0,end:duration}];c.shots??=[]
  for(const key of ['elements','phases','shots'])if(!Array.isArray(c[key])||c[key].length>500)err(key,'Liste mit maximal 500 Einträgen erwartet')
  if(errors.length)return {config:null,errors,warnings}
  const ids=new Set<string>()
  c.elements.forEach((el:any,i:number)=>{
    const p=`elements[${i}]`
    if(!object(el)){err(p,'Objekt erwartet');return}
    if(typeof el.kind!=='string'||!Object.hasOwn(fields,el.kind)){err(`${p}.kind`,'Unbekannter Elementtyp');return}
    allowed(el,`${common} ${fields[el.kind]}`,p)
    if(typeof el.id!=='string'||!el.id.trim()||el.id.length>120||ids.has(el.id))err(`${p}.id`,'Eindeutige, nicht leere ID erwartet');else ids.add(el.id)
    for(const k of ['name','text','sub'])if(el[k]!==undefined)str(el[k],`${p}.${k}`)
    for(const k of Object.keys(enums))if(el[k]!==undefined&&!enums[k].includes(el[k]))err(`${p}.${k}`,`Erlaubt: ${enums[k].join(', ')}`)
    for(const k of ['occlude','roof','footprint','smooth','trail','follow','flip'])if(el[k]!==undefined&&typeof el[k]!=='boolean')err(`${p}.${k}`,'true oder false erwartet')
    window(el,p)
    for(const k of ['active','drawFrom','drawTo','moveFrom','moveTo','until','destroyed'])time(el[k],`${p}.${k}`)
    if(['unit','callout','marker'].includes(el.kind))point(el.pos,`${p}.pos`)
    else {
      const min=el.kind==='zone'?3:2,max=['cone','mortar'].includes(el.kind)?2:200
      if(!Array.isArray(el.points)||el.points.length<min||el.points.length>max)err(`${p}.points`,`${min}–${max} Punkte erwartet`)
      else { el.points.forEach((x:any,j:number)=>point(x,`${p}.points[${j}]`)); if(el.points.every((x:any)=>Array.isArray(x)&&x.length===2)&&new Set(el.points.map((x:any)=>JSON.stringify(x))).size<min)err(`${p}.points`,'Zu wenige unterschiedliche Punkte') }
    }
    if(Array.isArray(el.points)&&el.points.every((pt:any)=>Array.isArray(pt)&&pt.length===2&&pt.every(Number.isFinite))) {
      if(el.points.some((pt:any,j:number)=>j>0&&pt[0]===el.points[j-1][0]&&pt[1]===el.points[j-1][1]))err(`${p}.points`,'Benachbarte Punkte dürfen nicht identisch sein')
      if(el.kind==='zone'&&el.points.length>=3) { const origin=el.points[0]; const area2=el.points.reduce((sum:number,pt:any,j:number)=>{const next=el.points[(j+1)%el.points.length];return sum+(pt[0]-origin[0])*(next[1]-origin[1])-(next[0]-origin[0])*(pt[1]-origin[1])},0);if(Math.abs(area2)<0.01)err(`${p}.points`,'Polygon muss eine Fläche einschliessen') }
    }
    for(const k of ['width','height','flight'])if(el[k]!=null)num(el[k],`${p}.${k}`,0.01,k==='width'?1000:k==='flight'?duration:2)
    if(el.buildup!=null)num(el.buildup,`${p}.buildup`,0,duration)
    if(el.angle!==undefined)num(el.angle,`${p}.angle`,10,180)
    if(el.color!==undefined){if(el.kind==='callout'){if(!['amber','blue','red','white'].includes(el.color))err(`${p}.color`,'amber, blue, red oder white erwartet')}else if(typeof el.color!=='string'||!/^#[\da-f]{6}$/i.test(el.color))err(`${p}.color`,'Farbe als #RRGGBB erwartet')}
    if(el.tactical!==undefined){const cat=el.kind==='line'?TACTICAL_LINES:TACTICAL_AREAS;if(typeof el.tactical!=='string'||!Object.hasOwn(cat,el.tactical))err(`${p}.tactical`,'Unbekanntes taktisches Zeichen')}
    if(el.kind==='marker'&&el.symbol!==undefined&&(typeof el.symbol!=='string'||!Object.hasOwn(POINT_SYMBOLS,el.symbol)))err(`${p}.symbol`,'Unbekanntes Punktsymbol')
    if(el.designation!==undefined&&(typeof el.designation!=='string'||el.designation.length>8))err(`${p}.designation`,'Maximal 8 Zeichen erwartet')
    if(el.kind==='unit'&&el.symbol!==undefined){
      const sym=el.symbol;if(!object(sym))err(`${p}.symbol`,'Symbol-Objekt erwartet');else{
        allowed(sym,'code affiliation echelon hq taskForce strength',`${p}.symbol`)
        if(typeof sym.code!=='string'||!Object.hasOwn(UNIT_SYMBOLS,sym.code))err(`${p}.symbol.code`,'Unbekanntes Schweizer Einheitssymbol')
        for(const [key,cat] of [['affiliation',AFFILIATIONS],['echelon',ECHELONS]] as const)if(sym[key]!==undefined&&(typeof sym[key]!=='string'||!Object.hasOwn(cat,sym[key])))err(`${p}.symbol.${key}`,'Unbekannter Wert')
        if(sym.affiliation&&Object.hasOwn(AFFILIATIONS,sym.affiliation)){const side=({friendly:'blue',hostile:'red',neutral:'neutral',unknown:'unknown'} as Record<string,string>)[sym.affiliation];if(el.side!==undefined&&el.side!==side)err(`${p}.side`,'Seite und Symbolzugehörigkeit widersprechen sich');else el.side=side}
        for(const key of ['hq','taskForce'])if(sym[key]!==undefined&&typeof sym[key]!=='boolean')err(`${p}.symbol.${key}`,'true oder false erwartet')
        if(sym.strength!==undefined&&!['reinforced','reduced'].includes(sym.strength))err(`${p}.symbol.strength`,'reinforced oder reduced erwartet')
      }
    }
    if(el.kind==='unit') {
      el.type??='infantry';el.size??='platoon'
      if(el.positionKeys!==undefined){if(!Array.isArray(el.positionKeys)||el.positionKeys.length>200)err(`${p}.positionKeys`,'Maximal 200 Keys erwartet');else el.positionKeys.forEach((k:any,j:number)=>{const path=`${p}.positionKeys[${j}]`;if(!object(k)){err(path,'{time,pos} erwartet');return}allowed(k,'time pos',path);num(k.time,`${path}.time`,0,duration);point(k.pos,`${path}.pos`)})}
    }
    if(el.kind==='move') {if(el.animation==='draw'&&!el.followUnit){if(el.drawFrom==null&&el.buildup==null)err(`${p}.drawFrom`,'Start der Zeichenanimation fehlt');if(el.drawTo==null&&el.buildup==null)err(`${p}.drawTo`,'Ende der Zeichenanimation fehlt');window(el,p,'drawFrom','drawTo')}}
    if(el.kind==='line')el.lineKind??='pl'
    if(el.kind==='zone')el.zoneKind??='objective'
    if(el.kind==='marker')el.markerKind??='contact'
    if(el.kind==='callout') {str(el.text,`${p}.text`);if(el.offset!==undefined)point(el.offset,`${p}.offset`,2,false);if(el.screenPos!==undefined){point(el.screenPos,`${p}.screenPos`,2,false);if(Array.isArray(el.screenPos))el.screenPos.forEach((v:any)=>num(v,`${p}.screenPos`,0,1))}if(el.attachTo!=null)str(el.attachTo,`${p}.attachTo`)}
    if(el.kind==='mover') {
      el.moverKind??='team';el.timing??=el.progress?'progress':el.keys?'keys':'range'
      const legacy=Array.isArray(el.keys)?el.keys:[];el.moveFrom??=legacy[0]?.[0]??el.from??0;el.moveTo??=legacy.at(-1)?.[0]??el.to??duration;el.until??=el.to??duration;el.keys??=[[el.moveFrom,0],[el.moveTo,(el.points?.length??2)-1]]
      window(el,p,'moveFrom','moveTo');window({from:el.from,to:el.until},p)
      for(const field of ['keys','progress'])if(el[field]!==undefined){if(!Array.isArray(el[field])||el[field].length>200||!el[field].length)err(`${p}.${field}`,'1–200 Zeitpunkte erwartet');else el[field].forEach((k:any,j:number)=>{const path=`${p}.${field}[${j}]`;if(!Array.isArray(k)||k.length!==2){err(path,'[Zeit, Wert] erwartet');return}num(k[0],path,0,duration);num(k[1],path,0,field==='keys'?(el.points?.length??1)-1:1);if(field==='keys'&&!Number.isInteger(k[1]))err(path,'Wegpunktindex muss ganzzahlig sein')})}
      if(el.timing==='progress'&&!el.progress)err(`${p}.progress`,'Fortschrittszeiten fehlen')
    }
  })
  for(const [list,type] of [[c.phases,'phases'],[c.shots,'shots']] as const){const used=new Set();list.forEach((s:any,i:number)=>{const p=`${type}[${i}]`;if(!object(s)){err(p,'Objekt erwartet');return}if(typeof s.id!=='string'||used.has(s.id))err(`${p}.id`,'Eindeutige ID erwartet');used.add(s.id);num(s.start,`${p}.start`,0,duration);num(s.end,`${p}.end`,0,duration);if(s.end<=s.start)err(p,'end muss nach start liegen');if(type==='phases'){allowed(s,'id title start end caption',p);str(s.title,`${p}.title`);if(s.caption!==undefined)str(s.caption,`${p}.caption`)}else if(s.kind==='orbit'){allowed(s,'id kind start end center radius alt a0 a1',p);point(s.center,`${p}.center`);num(s.radius,`${p}.radius`,1,200000);num(s.alt,`${p}.alt`,1,200000);num(s.a0,`${p}.a0`);num(s.a1,`${p}.a1`)}else if(s.kind==='dolly'){allowed(s,'id kind start end p0 p1 look0 look1',p);point(s.p0,`${p}.p0`,3,false);point(s.p1,`${p}.p1`,3,false);point(s.look0,`${p}.look0`);point(s.look1,`${p}.look1`)}else if(s.kind==='static'){allowed(s,'id kind start end pos look',p);point(s.pos,`${p}.pos`,3,false);point(s.look,`${p}.look`)}else if(s.kind==='follow'){allowed(s,'id kind start end target distance height lookAhead bearing',p);if(typeof s.target!=='string'||!c.elements.some((e:any)=>e?.id===s.target&&(e.kind==='unit'||e.kind==='mover')))err(`${p}.target`,'ID einer Einheit oder eines Fahrzeugs erwartet');for(const k of ['distance','height','lookAhead'])if(s[k]!==undefined)num(s[k],`${p}.${k}`,1,2000);if(s.bearing!==undefined)num(s.bearing,`${p}.bearing`,-360,360)}else err(`${p}.kind`,'orbit, dolly, static oder follow erwartet')})}
  if(c.captions!==undefined){if(!Array.isArray(c.captions)||c.captions.length>200)err('captions','Liste mit maximal 200 Untertiteln erwartet');else{const used=new Set();c.captions.forEach((cp:any,i:number)=>{const p=`captions[${i}]`;if(!object(cp)){err(p,'Objekt erwartet');return}allowed(cp,'id text sub start end position',p);if(typeof cp.id!=='string'||used.has(cp.id))err(`${p}.id`,'Eindeutige ID erwartet');used.add(cp.id);str(cp.text,`${p}.text`);if(cp.sub!==undefined)str(cp.sub,`${p}.sub`);num(cp.start,`${p}.start`,0,duration);num(cp.end,`${p}.end`,0,duration);if(cp.end<=cp.start)err(p,'end muss nach start liegen');if(cp.position!==undefined&&!['bottom','top'].includes(cp.position))err(`${p}.position`,'bottom oder top erwartet')})}}
  for(const el of c.elements)if(el?.kind==='callout'&&el.attachTo!=null&&!c.elements.some((t:any)=>t?.id===el.attachTo&&['unit','mover'].includes(t.kind)))err(`${el.id}.attachTo`,'Ziel muss die ID einer Einheit oder eines Fahrzeugs sein')
  for(const el of c.elements)if(el?.kind==='move'&&el.followUnit!=null&&!c.elements.some((t:any)=>t?.id===el.followUnit&&t.kind==='unit'&&t.positionKeys?.length>=2))err(el.id+'.followUnit','Ziel muss eine Einheit mit Positions-Keyframes sein')
  if(outsideTerrain)warnings.push('Einige Punkte liegen ausserhalb des geladenen Äuli-Geländes (ca. ±1.5 km). Dort ist die Darstellung nicht geografisch zuverlässig; Koordinaten prüfen.')
  if(c.notes?.length)warnings.push(...c.notes)
  if(c.shots.length===0)warnings.push('Keine Kamera-Shots: Die Kamera bleibt frei bedienbar.')
  return {config:errors.length?null:c as Config,errors,warnings}
}
