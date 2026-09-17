import { useEffect, useState } from 'react'
import { extractPlaceNames, normalizePlace, placeQuery } from '../model/placeExtraction'
import { searchPlaces, type PlaceHit } from '../services/placeSearch'
type Row={name:string;hits:PlaceHit[];selected:number;status:string}
export function AutoPlaces({text,onChange}:{text:string;onChange:(notes:string)=>void}) {
 const [rows,setRows]=useState<Row[]>([])
 const [retry,setRetry]=useState(0)
 useEffect(()=>{
  const names=extractPlaceNames(text),controller=new AbortController()
  setRows(names.map(name=>({name,hits:[],selected:-1,status:'Suche …'})))
  const timer=setTimeout(async()=>{
   let next=0
   await Promise.all(Array.from({length:Math.min(names.length,3)},async()=>{
    while(next<names.length&&!controller.signal.aborted){
     const name=names[next++]
     try{
      const hits=await searchPlaces(placeQuery(name),controller.signal,50)
      if(controller.signal.aborted)return
      const matches=hits.map((h,i)=>({h,i})).filter(({h})=>normalizePlace((h.searchName||h.label).split(/[,([]/)[0].trim())===normalizePlace(placeQuery(name)))
      const settlements=matches.filter(({h})=>h.featureKind==='TLM_SIEDLUNGSNAME')
      const exact=settlements.length?settlements:matches.filter(({h})=>h.origin!=='gg25')
      const unique=!['FESTUNG','STAATSSTRASSE','RHEIN','RHEINS','RHEINTAL'].includes(name)&&exact.length>0&&exact.every(({h})=>Math.hypot(h.E-exact[0].h.E,h.N-exact[0].h.N)<200)
      setRows(prev=>prev.map(r=>r.name===name?{name,hits,selected:unique?exact[0].i:-1,status:unique?'Automatischer Vorschlag · bitte prüfen':hits.length?'Mehrdeutig / Schreibweise prüfen':'Nicht gefunden · LLM soll recherchieren'}:r))
     }catch{if(!controller.signal.aborted)setRows(prev=>prev.map(r=>r.name===name?{...r,status:'Suche fehlgeschlagen · erneut versuchen'}:r))}
    }
   }))
  },800)
  return()=>{clearTimeout(timer);controller.abort()}
 },[text,retry])
 useEffect(()=>{onChange(rows.map(r=>r.selected>=0?((h)=>r.name+': LV95 ['+h.E+', '+h.N+']; WGS84 [lon,lat] ['+h.lon+', '+h.lat+']; source: https://api3.geo.admin.ch/rest/services/api/SearchServer?type=locations&sr=2056&searchText='+encodeURIComponent(placeQuery(r.name))+'; label: '+h.label)(r.hits[r.selected]):r.name+': UNRESOLVED ('+r.status+'); research in regional context, do not choose an arbitrary homonym.').join('\n'))},[rows,onChange])
 if(!rows.length)return null
 return <div className="place-lookup"><b>Erkannte Ortsnamen (Grossbuchstaben)</b><p className="dim">Treffer prüfen. Allgemeine Begriffe wie FESTUNG oder STAATSSTRASSE brauchen einen örtlichen Bezug. Nur Ortsnamen werden an swisstopo gesendet.</p>{rows.map(r=><label key={r.name}>{r.name} · {r.status}<select aria-label={'Lageanker '+r.name} value={r.selected} onChange={e=>setRows(prev=>prev.map(x=>x.name===r.name?{...x,selected:Number(e.target.value),status:'Auswahl geprüft'}:x))}><option value={-1}>Offen lassen / durch LLM recherchieren</option>{r.hits.map((h,i)=>({h,i})).filter(({h})=>normalizePlace(h.searchName||h.label).includes(normalizePlace(placeQuery(r.name)))).slice(0,15).map(({h,i})=><option key={i} value={i}>{h.label} · [{Math.round(h.E)}, {Math.round(h.N)}]</option>)}</select></label>)}<button onClick={()=>setRetry(x=>x+1)}>Orte erneut suchen</button></div>
}
