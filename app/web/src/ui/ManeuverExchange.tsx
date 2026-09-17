import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { AUTHORING_RULES, PROMPT_REVISION, buildAuthoringPrompt, estimateTokens } from '../model/authoring'
import { AutoPlaces } from './AutoPlaces'
import { areaMapOnly } from '../model/sceneArea'
import { PlaceLookup } from './PlaceLookup'
import { appendPlaceReference } from '../services/placeSearch'
import { parseConfig } from '../model/configImport'

export function ManeuverExchange({open,onClose}:{open:boolean;onClose():void}) {
  const dialog=useRef<HTMLDialogElement>(null), first=useRef<HTMLTextAreaElement>(null)
  const config=useStore(s=>s.config)
  const [description,setDescription]=useState(''),[locations,setLocations]=useState(''),[duration,setDuration]=useState(config.duration)
  const [confirmArea,setConfirmArea]=useState(false)
  const [autoLocations,setAutoLocations]=useState('')
  const [animationInstructions,setAnimationInstructions]=useState('')
  const [references,setReferences]=useState(true),[answer,setAnswer]=useState(''),[status,setStatus]=useState(''),[tab,setTab]=useState<'prompt'|'import'>('prompt')
  useEffect(()=>{if(open){useStore.getState().setPlaying(false);dialog.current?.showModal();first.current?.focus()}else dialog.current?.close()},[open])
  const [placeMode,setPlaceMode]=useState(false),[placeTerm,setPlaceTerm]=useState('')
  const prompt=useMemo(()=>buildAuthoringPrompt(config,description,locations+'\n\nAUTOMATIC PLACE MATCHING\n'+autoLocations,duration,references,animationInstructions),[config,description,locations,autoLocations,duration,references,animationInstructions])
  const result=useMemo(()=>answer.trim()?parseConfig(answer,config.area,{allowAreaChange:true}):null,[answer,config.area])
  const copy=async()=>{try{await navigator.clipboard.writeText(prompt);setStatus('Prompt kopiert. In dein LLM einfügen und dessen JSON-Antwort hier zurückbringen.')}catch{setStatus('Kopieren war nicht möglich. Unten „Prompt ansehen“ öffnen und den Text manuell kopieren.')}}
  function apply(){
    if(!result?.config)return
    const c=result.config,st=useStore.getState()
    if(c.area.bounds){
      if(st.config.elements.length && !confirmArea)return
      const b=c.area.bounds,map=areaMapOnly(c.area)
      useStore.setState({config:c,areaSource:{kind:'swisstopo',bounds:b,name:c.area.name,buildings:!map&&Math.max(b[2]-b[0],b[3]-b[1])<=5000,mode:map?'map':'terrain'},areaRect:{cx:c.area.E0,cy:c.area.N0,w:b[2]-b[0],h:b[3]-b[1]},areaRotation:0,history:[],future:[],selected:null,hover:null,unitKeyPlacement:null,draft:[],time:0,playing:false,groundMode:map?'map':st.groundMode})
    }else st.replaceConfig(c)
    st.setTool('select');st.setFollow(c.shots.length>0);onClose()
  }

  return <dialog ref={dialog} className="exchange" aria-labelledby="exchange-title" onCancel={e=>{e.preventDefault();onClose()}} onKeyDown={e=>e.stopPropagation()}>
    <header><div><h2 id="exchange-title">Manöver aus Text</h2><small>Prompt-Stand {PROMPT_REVISION}</small><p>Mit externem KI-Modell: Beschreiben → Prompt in ChatGPT, Claude oder Gemini einfügen → JSON hier importieren</p></div><button aria-label="Dialog schliessen" onClick={onClose}>✕</button></header>
    <nav aria-label="Manöver-Austausch"><button className={tab==='prompt'?'on':''} onClick={()=>setTab('prompt')}>1 · Prompt erstellen</button><button className={tab==='import'?'on':''} onClick={()=>setTab('import')}>2 · JSON einfügen</button></nav>
    {tab==='prompt'?<section>
      <p>Nutze ChatGPT, Gemini, Claude oder ein anderes LLM. Diese App stellt den Prompt zusammen; sie sendet deine Beschreibung an keinen Anbieter.</p>
      <label htmlFor="maneuver-description">Manöverbeschreibung</label>
      <textarea ref={first} id="maneuver-description" value={description} onChange={e=>{setDescription(e.target.value);setStatus('')}} onMouseUp={e=>{const t=e.currentTarget;const selected=t.value.slice(t.selectionStart,t.selectionEnd).trim();if(selected && selected.split(/\s+/).length<=10){setPlaceTerm(selected);setPlaceMode(true)}}} placeholder="Befehl oder Manöverbeschreibung hier einfügen …" />
      <AutoPlaces text={description} onChange={setAutoLocations}/>
      <button className={placeMode?'on':''} onClick={()=>setPlaceMode(!placeMode)}>{placeMode?'Ortssuche schliessen':'Ortsnamen anklicken / Koordinaten suchen'}</button>
      {placeMode&&<>
        <p className="dim">Ein Wort unten anklicken oder mehrere Wörter oben markieren. Anschliessend den passenden Suchtreffer übernehmen.</p>
        <div className="place-text">{description.split(/([\p{L}\p{N}][\p{L}\p{N}_.-]*(?:[ \t]+\d+(?:\.\d+)?)?)/u).map((part,i)=>/[\p{L}\p{N}]/u.test(part)?<button key={i} onClick={()=>setPlaceTerm(part)}>{part}</button>:<span key={i}>{part}</span>)}</div>
        <PlaceLookup term={placeTerm} onChoose={(alias,hit)=>{setLocations(previous=>appendPlaceReference(previous,alias,hit));setStatus(`Lageanker „${alias||hit.label}“ in die räumlichen Hinweise übernommen.`)}}/>
      </>}
      <label htmlFor="maneuver-locations">Orte / räumliche Hinweise <span className="dim">(optional)</span></label>
      <textarea id="maneuver-locations" className="short" value={locations} onChange={e=>setLocations(e.target.value)} placeholder="Koordinaten oder Bezüge zu benannten Elementen. Falls gewünscht: schematische Platzierung im geladenen Gebiet erlauben." />
      <label htmlFor="animation-instructions">Zusätzliche Anweisungen für die Animation <span className="dim">(optional)</span></label>
      <textarea id="animation-instructions" className="short" value={animationInstructions} onChange={e=>{setAnimationInstructions(e.target.value);setStatus('')}} placeholder="z. B. Ruhige Kamerafahrten, jede Phase mit einer Übersicht beginnen, Bewegungen langsam zeigen und Beschriftungen auf Deutsch." />
      <p className="dim">Wünsche zu Kamera, Tempo, Beschriftung und Darstellung werden dem kopierten Prompt separat beigefügt.</p>
      <div className="exchange-options"><label>Animationsdauer (s)<input aria-label="Animationsdauer (s)" type="number" min="1" max="86400" value={duration} onChange={e=>setDuration(Number(e.target.value))}/></label><label><input type="checkbox" checked={references} onChange={e=>setReferences(e.target.checked)}/> Benannte Szenenelemente als Ortsreferenzen beilegen (max. 60)</label></div>
      <p className="dim">Geladen: {config.area.name}. Das LLM darf mit area.bounds einen neuen Ausschnitt definieren. Andere Ausschnitte lassen sich im Schritt „Gebiet“ laden. Lageanker lassen sich oben über die Ortssuche ergänzen. Über 8 km Seitenlänge wird automatisch eine ebene Karte geladen. Fahrwege werden nicht automatisch berechnet.</p>
      <div className="exchange-actions"><button className="primary" disabled={!description.trim()||!Number.isFinite(duration)||duration<1||duration>86400} onClick={copy}>Prompt kopieren</button><span className="dim">Regeln ≈ {estimateTokens(AUTHORING_RULES).toLocaleString('de-CH')} Tokens · Gesamt ≈ {estimateTokens(prompt).toLocaleString('de-CH')} <small>(Schätzung, modellabhängig)</small></span></div>
      {estimateTokens(prompt)>12000&&<p className="bad">Der gesamte Prompt ist durch Beschreibung / Referenzen länger als ca. 12’000 Tokens. Bei Bedarf den Text kürzen oder Ortsreferenzen abwählen; die Formatregeln bleiben kompakt.</p>}
      <details><summary>Prompt ansehen / manuell kopieren</summary><textarea aria-label="Vollständiger Prompt" className="mono prompt-preview" value={prompt} readOnly onFocus={e=>e.currentTarget.select()}/></details>
    </section>:<section>
      <p>Die vollständige JSON-Antwort deines LLM einfügen. Die Prüfung verändert die Szene noch nicht.</p>
      <label htmlFor="maneuver-answer">JSON-Antwort</label><textarea id="maneuver-answer" className="mono answer" value={answer} onChange={e=>{setAnswer(e.target.value);setConfirmArea(false);setStatus('')}} placeholder={'{ "version": 0, "area": …, "duration": …, "elements": […] }'}/>
      {result&&<div className="import-report" aria-live="polite">{result.config?<><p className="ok">Bereit: {result.config.elements.length} Elemente · {result.config.phases.length} Phasen · {result.config.shots.length} Kamera-Shots · {result.config.duration} Sekunden</p>{result.warnings.length>0&&<><b>Hinweise / Annahmen</b><ul>{result.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></>}</>:<><b className="bad">Bitte diese Punkte korrigieren lassen:</b><ul>{result.errors.map((e,i)=><li key={i}>{e}</li>)}</ul><button onClick={async()=>{try{await navigator.clipboard.writeText(`Correct the JSON you just produced. Keep the maneuver and the original format contract. Return only the complete corrected JSON. Validation errors:\n${result.errors.join('\n')}`);setStatus('Korrekturhinweise kopiert. Im selben LLM-Chat einfügen.')}catch{setStatus('Bitte die sichtbaren Fehlermeldungen manuell kopieren.')}}}>Korrekturhinweise kopieren</button></>}</div>}
      {result?.config?.area.bounds && config.elements.length>0 && <label><input type="checkbox" checked={confirmArea} onChange={e=>setConfirmArea(e.target.checked)}/> Aktuelles Manöver und Gebiet ersetzen (bei Bedarf vorher Projekt speichern)</label>}
      <div className="exchange-actions"><button className="primary" disabled={!result?.config || (!!result.config.area.bounds && config.elements.length>0 && !confirmArea)} onClick={apply}>Animation laden</button><span className="dim">Ersetzt die Szene; bei neuem Gebiet vorher Projekt speichern</span></div>
    </section>}
    {status&&<p className="exchange-status" role="status">{status}</p>}
  </dialog>
}
