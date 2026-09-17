import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { fitShot, generateShots } from '../model/autoShots'
import type { Scene } from '../scene/Scene'
import type { Shot, ShotDolly } from '../model/types'

function NumberField({label,value,onChange,min,max}:{label:string;value:number;onChange:(n:number)=>void;min?:number;max?:number}) {
  return <label>{label}<input key={value} type="number" defaultValue={Math.round(value*100)/100} min={min} max={max} step="any" onBlur={e=>{const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n)&&(min===undefined||n>=min)&&(max===undefined||n<=max))onChange(n);else e.target.value=String(value)}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/></label>
}

export function CameraPanel({scene}:{scene:Scene}) {
  const config=useStore(s=>s.config)
  const time=useStore(s=>s.time)
  const follow=useStore(s=>s.followCamera)
  const [selected,setSelected]=useState(config.shots[0]?.id??'')
  const [padding,setPadding]=useState(1.2)
  const [sweep,setSweep]=useState(24)
  const [focus,setFocus]=useState<string[]>([])
  const shot=config.shots.find(s=>s.id===selected)??config.shots[0]
  const ground=(p:[number,number])=>scene.terrain.ground(...scene.lv95ToLocal(p))
  function generate(){const st=useStore.getState();const shots=generateShots(st.config,scene.camera.aspect,padding,ground,sweep);st.setPlaying(false);st.commit(c=>({...c,shots}));setSelected(shots[0]?.id??'');st.setFollow(true);st.setTime(0)}
  useEffect(()=>{if(!useStore.getState().config.shots.length)generate()},[])
  useEffect(()=>setFocus([]),[shot?.id])
  const ordered=[...config.shots].sort((a,b)=>a.start-b.start)
  const shotIndex=ordered.findIndex(s=>s.id===shot?.id),previous=ordered[shotIndex-1],following=ordered[shotIndex+1]
  function update(next:Shot){useStore.getState().commit(c=>({...c,shots:c.shots.map(s=>{
    if(s.id===next.id)return next
    if(shot&&s.id===previous?.id&&next.start!==shot.start&&s.end>=Math.min(shot.start,next.start))return {...s,end:next.start}
    if(shot&&s.id===following?.id&&next.end!==shot.end&&s.start<=Math.max(shot.end,next.end))return {...s,start:next.end}
    return s
  })}))}
  function preview(){if(!shot)return;const st=useStore.getState();st.setPlaying(false);st.setTime(shot.start);st.setFollow(true)}
  function capture(which:'start'|'end'|'still'){
    if(!shot)return
    const p=scene.camera.position.clone(),target=scene.controls.target.clone()
    const current={pos:[p.x,-p.z,p.y] as [number,number,number],look:scene.localToLV95(target.x,-target.z)}
    const pose=(t:number)=>{scene.applyShot(shot,t);return {pos:[scene.camera.position.x,-scene.camera.position.z,scene.camera.position.y] as [number,number,number],look:scene.localToLV95(scene.controls.target.x,-scene.controls.target.z)}}
    const first=which==='end'?pose(shot.start):current,last=which==='start'?pose(shot.end):current
    scene.camera.position.copy(p);scene.controls.target.copy(target);scene.camera.lookAt(target)
    const next:ShotDolly={id:shot.id,kind:'dolly',start:shot.start,end:shot.end,p0:first.pos,p1:last.pos,look0:first.look,look1:last.look}
    update(next);useStore.getState().setFollow(false)
  }
  return <aside className="camera-panel" aria-label="Kamera und Export" onKeyDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onPointerMove={e=>e.stopPropagation()}>
    <header><b>Kamerafolge</b></header>
    <div className={`camera-mode ${follow?'planned':'free'}`}><b>{follow?'● Shot-Vorschau':'◉ Freie Kamera'}</b><span>{follow?'Die gespeicherte Kamerafolge wird gezeigt.':'Drehen, verschieben und zoomen; dann Ansicht speichern.'}</span></div>
    <fieldset>
    <div className="camera-switch"><button className={!follow?'on':''} onClick={()=>{useStore.getState().setPlaying(false);useStore.getState().setFollow(false)}}>Freie Kamera</button><button className={follow?'on':''} onClick={preview}>Shot-Vorschau</button></div>
    <details className="camera-auto"><summary>Automatische Kamerafolge</summary><p>Jede Phase erhält eigene Ansichten ihrer aktuellen Bewegungen und Ereignisse. Lange Phasen werden unterteilt. Die Kamera umkreist das Geschehen langsam.</p>
    <label>Bildausschnitt<select value={padding} onChange={e=>{const p=Number(e.target.value);setPadding(p);if(shot)update({id:shot.id,...fitShot(config,shot.start,shot.end,scene.camera.aspect,focus,p,ground,sweep)});preview()}}><option value={1.2}>Weit (Standard)</option><option value={1.5}>Sehr weit</option><option value={1.02}>Näher</option></select></label>
    <label>Kamerabewegung<select value={sweep} onChange={e=>{const n=Number(e.target.value);setSweep(n);if(shot)update({id:shot.id,...fitShot(config,shot.start,shot.end,scene.camera.aspect,focus,padding,ground,n)});preview()}}><option value={24}>Langsamer Orbit (Standard)</option><option value={45}>Weiter Orbit</option><option value={0}>Feststehend</option></select></label>
    <small>Ändert den gewählten Shot sofort und gilt für neu erzeugte Shots.</small>
    <button onClick={generate}>Shots automatisch neu erstellen</button>
    <small>Ersetzt die Kamerafolge · ⌘Z macht es rückgängig. Vorhandene Shots bleiben beim Öffnen erhalten.</small>
    </details>
    <div className="shot-list">{config.shots.map(s=><button className={s.id===shot?.id?'on':''} key={s.id} onClick={()=>{setSelected(s.id);const st=useStore.getState();st.setTime(s.start);st.setPlaying(false);st.setFollow(true)}}>{config.phases.find(p=>s.start>=p.start&&s.start<p.end)?.title??s.id} · {s.start.toFixed(1)}–{s.end.toFixed(1)} s</button>)}</div>
    {shot&&<>
      <div className="camera-fields"><NumberField label="Start (s)" value={shot.start} min={previous?previous.start+.01:0} max={shot.end-.01} onChange={start=>update({...shot,start})}/><NumberField label="Ende (s)" value={shot.end} min={shot.start+.01} max={following?following.end-.01:config.duration} onChange={end=>update({...shot,end})}/></div>
      <button onClick={preview}>Shot ansehen</button>
      <button disabled={time<=shot.start||time>=shot.end} onClick={()=>{const id=`shot-${Date.now()}`;useStore.getState().commit(c=>({...c,shots:c.shots.flatMap(s=>s.id===shot.id?[{...s,end:time},{...s,id,start:time}]:[s])}));setSelected(id)}}>Shot am Playhead teilen</button>
      <h3>Ansichten aus dem Bild übernehmen</h3>
      <p>In „Freie Kamera“ die Ansicht einstellen. Start und Ende ergeben eine Kamerafahrt.</p>
      <div className="view-keyframes"><button disabled={follow} onClick={()=>capture('start')}>① Als Startansicht</button><button disabled={follow} onClick={()=>capture('end')}>② Als Endansicht</button><button disabled={follow} onClick={()=>capture('still')}>Als feste Ansicht</button></div>
      {shot.kind==='dolly'&&<small>Gespeichert: Start- und Endansicht · „Shot-Vorschau“ zum Prüfen.</small>}
      <details><summary>Auf bestimmte Elemente ausrichten</summary><label>Auf diese Elemente ausrichten<select multiple value={focus} onChange={e=>setFocus(Array.from(e.target.selectedOptions,o=>o.value))}>{config.elements.map(e=><option key={e.id} value={e.id}>{e.name??(e.kind==='callout'?e.text:e.id)}</option>)}</select></label>
      <small>Mehrfachwahl mit ⌘/Ctrl. Ohne Auswahl: aktuelles Geschehen, sonst sichtbare Elemente. Andere Elemente bleiben sichtbar.</small>
      <button onClick={()=>update({id:shot.id,...fitShot(config,shot.start,shot.end,scene.camera.aspect,focus,padding,ground,sweep)})}>Diesen Shot neu einrahmen</button></details>
    </>}
    </fieldset>
  </aside>
}
