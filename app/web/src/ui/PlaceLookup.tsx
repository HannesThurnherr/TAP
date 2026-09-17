import { useEffect, useState } from 'react'
import { searchPlaces, type PlaceHit } from '../services/placeSearch'

export function PlaceLookup({ term, onChoose }: { term: string; onChoose: (alias: string, hit: PlaceHit) => void }) {
  const [query,setQuery]=useState(term), [alias,setAlias]=useState(term)
  const [hits,setHits]=useState<PlaceHit[]>([]),[status,setStatus]=useState('')
  useEffect(()=>{setQuery(term);setAlias(term)},[term])
  useEffect(()=>{
    const controller=new AbortController()
    setHits([])
    if(query.trim().length<2){setStatus('Mindestens zwei Zeichen eingeben.');return}
    setStatus('Suche …')
    const timer=setTimeout(async()=>{
      try {
        const results=await searchPlaces(query,controller.signal)
        if(controller.signal.aborted)return
        setHits(results);setStatus(results.length?'':'Keine Treffer. Ortsname oder Gemeinde ergänzen.')
      }catch{if(!controller.signal.aborted)setStatus('Ortssuche nicht erreichbar. Bitte erneut versuchen oder Koordinaten manuell eintragen.')}
    },300)
    return()=>{clearTimeout(timer);controller.abort()}
  },[query])
  return <div className="place-lookup">
    <label>Ort suchen · swisstopo<input aria-label="Ort im Manöver suchen" value={query} onChange={e=>setQuery(e.target.value)} placeholder="z. B. Industriestrasse 5 Walenstadt"/></label>
    <label>Bezeichnung im Manöver<input aria-label="Ortsbezeichnung im Manöver" value={alias} onChange={e=>setAlias(e.target.value)}/></label>
    <p className="dim">Bei mehrdeutigen Namen die Gemeinde ergänzen und den passenden Treffer wählen. Übernommen wird ein Lageanker, kein Fahrweg.</p>
    <div role="status">{status}</div>
    <div className="place-results">{hits.map((hit,i)=><button key={`${query}-${i}`} onClick={()=>onChoose(alias,hit)}><span>{hit.label}</span><small>LV95 [{hit.E}, {hit.N}] · Übernehmen ↓</small></button>)}</div>
  </div>
}
