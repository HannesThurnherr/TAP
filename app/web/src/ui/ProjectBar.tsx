import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { parseProject, type ProjectFile } from '../model/projectFile'

const KEY='tap.project.recovery.v1'
function snapshot():ProjectFile {const s=useStore.getState();return {format:'tap-project',version:1,config:s.config,terrain:{source:s.areaSource,rectangle:s.areaRect,rotation:s.areaRotation},view:{groundMode:s.groundMode,mapDetail:s.mapDetail}}}
export function ProjectBar() {
 const input=useRef<HTMLInputElement>(null), handle=useRef<any>(null)
 const [base,setBase]=useState(()=>JSON.stringify(snapshot())),[current,setCurrent]=useState(base)
 const [status,setStatus]=useState(''),[busy,setBusy]=useState(false),[filename,setFilename]=useState('Unbenanntes Projekt')
 const [recovery,setRecovery]=useState<ProjectFile|null>(()=>{try{const value=localStorage.getItem(KEY);return value?parseProject(value):null}catch{return null}})
 const dirty=current!==base
 useEffect(()=>{
  const capture=()=>{const doc=JSON.stringify(snapshot());setCurrent(doc);if(recovery)return;try{localStorage.setItem(KEY,doc)}catch{setStatus('Lokale Sicherung nicht möglich. Bitte Projektdatei speichern.')}}
  let timer:ReturnType<typeof setTimeout>|undefined
  const unsubscribe=useStore.subscribe((s,p)=>{if(s.config!==p.config||s.areaSource!==p.areaSource||s.areaRect!==p.areaRect||s.areaRotation!==p.areaRotation||s.groundMode!==p.groundMode||s.mapDetail!==p.mapDetail){clearTimeout(timer);setCurrent(JSON.stringify(snapshot()));timer=setTimeout(capture,500)}})
  const flush=()=>{if(timer){clearTimeout(timer);capture()}}
  window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',flush)
  return()=>{flush();unsubscribe();window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',flush)}
 },[recovery])
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty||useStore.getState().exportJobs.some(j=>j.status==='running')){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty])
 function apply(doc:ProjectFile, name:string, restored=false){
  const json=JSON.stringify(doc)
  useStore.setState({config:doc.config,areaSource:doc.terrain.source,areaRect:doc.terrain.rectangle,areaRotation:doc.terrain.rotation,groundMode:doc.view.groundMode,mapDetail:doc.view.mapDetail,screen:'editor',history:[],future:[],selected:null,hover:null,draft:[],unitKeyPlacement:null,playing:false,time:0,followCamera:doc.config.shots.length>0})
  setCurrent(json);setBase(restored?'':json);setFilename(name);handle.current=null
  try{localStorage.setItem(KEY,json)}catch{}
  setRecovery(null);setStatus(restored?'Wiederhergestellt · bitte als Datei speichern.':'Projekt geöffnet · Gelände wird geladen.')
 }
 async function save(asNew=false){
  if(busy)return;setBusy(true)
  try{
   const doc=snapshot(), json=JSON.stringify(doc), text=JSON.stringify(doc,null,2)
   const suggested=(doc.config.area.name.replace(/[^\p{L}\p{N}-]+/gu,'-')||'Manöver')+'.tap.json'
   if(typeof (window as any).showSaveFilePicker==='function'){
    const h=(!asNew&&handle.current)||await (window as any).showSaveFilePicker({suggestedName:suggested,types:[{description:'TAP Projekt',accept:{'application/json':['.json']}}]})
    const w=await h.createWritable();await w.write(text);await w.close();handle.current=h;setFilename(h.name);setStatus('Projektdatei gespeichert.')
   }else{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=suggested;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);setFilename(suggested);setStatus('Projektdatei als Download angefordert · im Download-Ordner prüfen.')}
   setBase(json);setCurrent(JSON.stringify(snapshot()))
  }catch(e){if((e as Error).name!=='AbortError')setStatus('Speichern fehlgeschlagen: '+(e as Error).message)}finally{setBusy(false)}
 }
 async function openFile(file:File){setBusy(true);try{
   if(file.size>20*1024*1024)throw new Error('Projektdatei ist grösser als 20 MB.')
   const doc=parseProject(await file.text())
   if(dirty&&!confirm('Nicht als Datei gespeicherte Änderungen ersetzen?'))return
   apply(doc,file.name)
 }catch(e){setStatus('Öffnen fehlgeschlagen: '+(e as Error).message)}finally{setBusy(false)}}
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&['s','o'].includes(e.key.toLowerCase())){e.preventDefault();e.stopImmediatePropagation();if(busy)return;if(e.key.toLowerCase()==='s')void save();else input.current?.click()}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true)})
 const [online,setOnline]=useState(navigator.onLine)
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[])
 return <div className="project-shell">
  <div className="project-bar"><strong>TAP</strong><button disabled={busy} onClick={()=>input.current?.click()}>Projekt öffnen…</button><button disabled={busy} onClick={()=>void save()}>Projekt speichern</button><button disabled={busy} onClick={()=>void save(true)}>Speichern unter…</button><span className="project-file">{filename}{dirty?' · Änderungen nicht in Datei gespeichert':''}</span><span className="project-status" role="status">{status||'Lokale Wiederherstellung automatisch · ⌘/Ctrl S speichern · ⌘/Ctrl O öffnen'}</span><input ref={input} type="file" accept=".json,application/json" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void openFile(file)}} /></div>
  {recovery&&<div className="recovery" role="status"><span>Letzte lokale Sitzung: <b>{recovery.config.area.name}</b> · {recovery.config.elements.length} Elemente</span><button onClick={()=>{if(!dirty||confirm('Aktuelle Änderungen durch die letzte lokale Sitzung ersetzen?'))apply(recovery,'Wiederhergestelltes Projekt',true)}}>Sitzung wiederherstellen</button><button onClick={()=>{if(confirm('Lokale Wiederherstellung verwerfen? Gespeicherte Dateien bleiben erhalten.')){try{localStorage.removeItem(KEY)}catch{};setRecovery(null)}}}>Verwerfen</button></div>}
  {!online&&<div className="recovery">Offline: gespeicherte Projekte lassen sich öffnen; neues Gelände benötigt Internet. Das Äuli-Beispiel ist im Paket enthalten.</div>}
 </div>
}
