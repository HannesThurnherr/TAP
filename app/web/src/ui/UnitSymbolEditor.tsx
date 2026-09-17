import {useState} from 'react'
import type {Unit} from '../model/types'
import {UNIT_SYMBOLS,ECHELONS,AFFILIATIONS,affiliationForSide,type UnitSymbol,type UnitCode} from '../symbology/catalog'
import {unitDrawing,symbolSvg} from '../symbology/symbol'
export function UnitSymbolEditor({unit,onChange}:{unit:Unit;onChange:(patch:Partial<Unit>)=>void}){
 const [search,setSearch]=useState(''),[open,setOpen]=useState(false)
 const s=unit.symbol
 const change=(patch:Partial<UnitSymbol>)=>{const symbol={code:'infantry' as UnitCode,echelon:unit.size,...s,...patch};onChange({symbol,...(patch.affiliation?{side:({friendly:'blue',hostile:'red',neutral:'neutral',unknown:'unknown'} as const)[patch.affiliation]}:{})})}
 return <div className="symbol-picker">
  <button className="small" onClick={()=>setOpen(!open)}>{s?UNIT_SYMBOLS[s.code].name+' · Symbol wählen':'Schweizer Symbol wählen'}</button>
  {s&&<div className="symbol-preview"><span dangerouslySetInnerHTML={{__html:symbolSvg(unitDrawing(s,unit.side,unit.status))}}/><span>APM 2012 · S. {UNIT_SYMBOLS[s.code].page}<br/>3D-Ansicht: lesbar zur Kamera</span></div>}
  {open&&<><input aria-label="Symbol suchen" placeholder="Inf, Pz Gren, San …" value={search} onChange={e=>setSearch(e.target.value)}/><div className="symbol-options">{Object.entries(UNIT_SYMBOLS).filter(([id,v])=>(id+' '+v.name+' '+v.aliases).toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(([id,v])=><button key={id} title={`${v.name} · Reglement S. ${v.page}`} className={s?.code===id?'on':''} onClick={()=>{change({code:id as UnitCode});setOpen(false)}}><span dangerouslySetInnerHTML={{__html:symbolSvg(unitDrawing({code:id as UnitCode,echelon:'none'},unit.side))}}/>{v.name}</button>)}</div></>}
  {s&&<>
   <label className="field">Zugehörigkeit<select aria-label="Zugehörigkeit" value={s.affiliation??affiliationForSide(unit.side)} onChange={e=>change({affiliation:e.target.value as UnitSymbol['affiliation']})}>{Object.entries(AFFILIATIONS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <label className="field">Hierarchie<select aria-label="Hierarchie" value={s.echelon??'platoon'} onChange={e=>change({echelon:e.target.value as UnitSymbol['echelon']})}>{Object.entries(ECHELONS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <label><input type="checkbox" checked={s.hq??false} onChange={e=>change({hq:e.target.checked})}/> Stab / Kommandoposten</label><br/>
   <label><input type="checkbox" checked={s.taskForce??false} onChange={e=>change({taskForce:e.target.checked})}/> Einsatzverband</label>
   <label className="field">Verstärkung<select aria-label="Verstärkung" value={s.strength??''} onChange={e=>change({strength:e.target.value as UnitSymbol['strength']||undefined})}><option value="">Keine Angabe</option><option value="reinforced">Verstärkt (+)</option><option value="reduced">Vermindert (−)</option></select></label>
   <button className="small" onClick={()=>onChange({symbol:undefined,status:undefined})}>Bisheriges Filmsymbol verwenden</button>
  </>}
 </div>
}
