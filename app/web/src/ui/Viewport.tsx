import {UNIT_MODELS,type UnitModel} from '../model/types'
import {TACTICAL_LINES,TACTICAL_AREAS,POINT_SYMBOLS,type UnitCode,type TacticalLine,type TacticalArea,type PointCode} from '../symbology/catalog'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CanvasCompositor } from '../scene/CanvasCompositor'
import { EditHandles } from './EditHandles'
import { CameraPanel } from './CameraPanel'
import { Scene, toScene } from '../scene/Scene'
import type { MapStatus } from '../scene/MapGround'
import type { MapDetail } from '../scene/mapProjection'
import { ElementLayer } from '../scene/elements'
import { useStore, newId, type Tool } from '../state/store'
import { unitPosition, elementPose } from '../model/timing'
import { loadAreaPackage, setCurrentPackage } from '../services/areaLoader'
import { elementWindow } from '../model/types'
import type { Element, Pt, Side } from '../model/types'


const HINT: Record<Tool, string> = {
  select: 'Auswahl: Element anklicken · Punkte ziehen · ↔ ganzes Element · Shift+Punkt: alles verschieben · Esc abbrechen',
  unit: 'Einheit: auf das Gelände klicken (auf ein Dach = Einheit auf Dach)',
  move: 'Bewegung: Punkte klicken · Rechtsklick / ⏎ fertig · ⌫ letzter Punkt · Esc abbrechen',
  zone: 'Raum: ≥ 3 Punkte klicken · Rechtsklick / ⏎ schliesst · Esc abbrechen',
  line: 'Linie: Punkte klicken · Rechtsklick / ⏎ fertig · Esc abbrechen',
  fire: 'Feuer: Schütze, Wegpunkte und Ziel klicken · Rechtsklick / ⏎ fertig',
  cone: 'Beobachtungssektor: Beobachter, dann Reichweite / Richtung klicken',
  mortar: 'Mörser: Abschussort, dann Einschlagort klicken',
  marker: 'Ereignis: Position anklicken',
  callout: 'Text: Ankerpunkt klicken',
}

export interface ToolOpts { unitCode?:UnitCode; lineTactical?:TacticalLine; zoneTactical?:TacticalArea; pointSymbol?:PointCode; side: Side; lineKind: string; zoneKind: string; unitModel?: UnitModel }

/** the element a tool would create from the draft points + the cursor (null = nothing to preview yet) */
function buildElement(tool: Tool, pts: Pt[], o: ToolOpts, t0: number, phaseEnd: number, roof: boolean): Element | null {
  const side = o.side
  switch (tool) {
    case 'unit': return pts.length ? { id: newId('unit'), kind: 'unit', side, model:o.unitModel, trail:!!o.unitModel, from:t0,to:phaseEnd,name:o.unitModel?UNIT_MODELS[o.unitModel]:side === 'red' ? 'Feind' : 'Zug', type: 'infantry', size: 'platoon', symbol:{code:o.unitCode??'infantry',echelon:'platoon'}, pos: pts[0], roof } : null
    case 'callout': return pts.length ? { id: newId('callout'), kind: 'callout', text: 'TEXT', color: side === 'red' ? 'red' : side === 'blue' ? 'blue' : 'amber', pos: pts[0], offset: [140, -90], from: t0, to: t0 + 8 } : null
    case 'move': return pts.length >= 2 ? { id: newId('move'), kind: 'move', animation: 'static', smooth: true, side, name: 'Bewegung', points: pts, from: t0, to: phaseEnd } : null
    case 'fire': return pts.length >= 2 ? { id: newId('fire'), kind: 'fire', side, points: pts, fireKind: 'fire', smooth: true, from: t0, to: phaseEnd } : null
    case 'zone': if(o.zoneTactical)return pts.length>=3?{id:newId('zone'),kind:'zone',zoneKind:'objective',tactical:o.zoneTactical,side,name:TACTICAL_AREAS[o.zoneTactical].name,points:pts,from:t0,to:phaseEnd}:null
      return pts.length >= 3 ? { id: newId('zone'), kind: 'zone', zoneKind: o.zoneKind as any, name: o.zoneKind === 'kill' ? 'FEUERRAUM' : o.zoneKind === 'dismount' ? 'ABSITZRAUM' : o.zoneKind === 'assembly' ? 'BEREITSTELLUNG' : 'ZIEL', points: pts } : null
    case 'line': if(o.lineTactical)return pts.length>=2?{id:newId('line'),kind:'line',lineKind:'pl',tactical:o.lineTactical,side,name:TACTICAL_LINES[o.lineTactical].name,points:pts,from:t0,to:phaseEnd}:null
      return pts.length >= 2 ? { id: newId('line'), kind: 'line', lineKind: o.lineKind as any, name: ({ pl: 'PL', sperre: 'Sperre', hindernis: 'Hindernis', stellung: 'Stellung', route: 'Route' } as any)[o.lineKind], points: pts, color: o.lineKind === 'sperre' ? '#e03a3a' : o.lineKind === 'hindernis' ? '#e8e8e8' : o.lineKind === 'pl' ? '#ff4040' : '#2f7cff' } : null
    case 'cone': return pts.length >= 2 ? { id: newId('cone'), kind: 'cone', side, name: 'Beob', points: [pts[0], pts[1]], angle: 60 } : null
    case 'mortar': return pts.length >= 2 ? { id: newId('mortar'), kind: 'mortar', name: 'Mw', points: [pts[0], pts[1]], height: 0.7, flight: 1.2, from: t0, to: phaseEnd } : null
    case 'marker': if(o.pointSymbol)return pts.length?{id:newId('marker'),kind:'marker',markerKind:'contact',symbol:o.pointSymbol,side,name:POINT_SYMBOLS[o.pointSymbol].name,pos:pts[0],from:t0,to:phaseEnd}:null
      return pts.length ? { id: newId('marker'), kind: 'marker', markerKind: 'contact', name: 'Kontakt', side, pos: pts[0], from: t0, to: phaseEnd } : null
    default: return null
  }
}

export function Viewport(opts: ToolOpts & {exportMode:boolean;present?:boolean;cameraMount:HTMLElement|null}) {
  const ref = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<Scene | null>(null)
  const editDragging = useRef(false)
  const exporting = useRef(false)
  const liveMapStatus=useRef<MapStatus>({loading:false,error:null,resolution:null})
  const [captureStatus,setCaptureStatus] = useState('')
  const [capturing,setCapturing] = useState(false)
  const [ready, setReady] = useState(false)
  const [loadMsg, setLoadMsg] = useState<{ message: string; done: number; total: number; error?: string }>({ message: 'Gelände wird geladen …', done: 0, total: 1 })
  const areaSource = useStore(s => s.areaSource)
  const [mapStatus, setMapStatus] = useState<MapStatus>({ loading: false, error: null, resolution: null })
  const areaNotes = useStore(s=>s.areaNotes)
  const groundMode = useStore(s => s.groundMode)
  const mapDetail = useStore(s => s.mapDetail)
  const [cursor, setCursor] = useState<{ x: number; y: number; h: number } | null>(null)
  const tool = useStore(s => s.tool)
  const keyPlacement = useStore(s => s.unitKeyPlacement)
  const draft = useStore(s => s.draft)
  const selected = useStore(s => s.selected)
  const hover = useStore(s => s.hover)
  const config = useStore(s => s.config)
  const time = useStore(s => s.time)
  const layerRef = useRef<ElementLayer | null>(null)
  const optsRef = useRef(opts); optsRef.current = opts
  const down = useRef<{ x: number; y: number; dragged: boolean; id: number; button: number } | null>(null)
  const lastCursor = useRef<Pt | null>(null)
  const lastRoof = useRef(false)

  useEffect(() => {
    if (!ref.current) return
    const scene = new Scene(ref.current)
    sceneRef.current = scene
    ;(window as any).__scene = scene   // dev hook
    scene.onMapStatus = status=>{liveMapStatus.current=status;setMapStatus(status)}
    scene.setGround(useStore.getState().groundMode, useStore.getState().mapDetail)
    const layer = new ElementLayer(scene)
    layerRef.current = layer
    let active = true
    let raf = 0, last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const st = useStore.getState()
      const dt = (now - last) / 1000; last = now
      if(exporting.current)return
      if (st.playing) { const t = st.time + dt; if (t >= st.config.duration) { st.setTime(st.config.duration); st.setPlaying(false) } else st.setTime(t) }
      if (st.followCamera && scene.terrain && st.config.shots.length) { const ordered=[...st.config.shots].sort((a,b)=>a.start-b.start); const shot = ordered.find(s => st.time >= s.start && st.time < s.end) ?? ordered.filter(s=>s.start<=st.time).at(-1) ?? ordered[0]; if (shot) scene.applyShot(shot, st.time, id => elementPose(st.config, id, st.time)) }
      if (scene.terrain) layer.update(st.time)
      scene.controls.enabled = !editDragging.current && (!st.followCamera || !st.config.shots.length)
      scene.render()
    }
    raf = requestAnimationFrame(loop)
    return () => { active = false; cancelAnimationFrame(raf); layer.dispose(); scene.dispose(); sceneRef.current = null }
  }, [])

  // load (and reload) the terrain whenever the area source changes
  useEffect(() => {
    const scene = sceneRef.current, layer = layerRef.current
    if (!scene || !layer) return
    const controller = new AbortController()
    setReady(false); setLoadMsg({ message: 'Gelände wird geladen …', done: 0, total: 1 })
    const st = useStore.getState()
    loadAreaPackage(areaSource, st.config.area, p => { if (!controller.signal.aborted) setLoadMsg(p) }, controller.signal)
      .then(async pkg => {
        if (controller.signal.aborted) return
        await scene.loadPackage(pkg)
        ;(window as any).__pkg = pkg   // dev hook
        setCurrentPackage(pkg)
        if (controller.signal.aborted) return
        useStore.getState().setAreaNotes(pkg.notes)
        layer.dispose(); layer.sync(useStore.getState().config)
        scene.frameAll(); setReady(true)
      })
      .catch(e => { if (!controller.signal.aborted) setLoadMsg({ message: 'Laden fehlgeschlagen', done: 0, total: 1, error: e instanceof Error ? e.message : String(e) }) })
    return () => controller.abort()
  }, [areaSource])

  useEffect(() => { sceneRef.current?.setGround(groundMode, mapDetail) }, [groundMode, mapDetail, ready])

  useEffect(() => { if (ready && layerRef.current) layerRef.current.sync(config) }, [config, ready])
  useEffect(() => { layerRef.current?.setSelected(selected) }, [selected])
  useEffect(() => { layerRef.current?.setHover(hover) }, [hover])

  function previewElement(cursorPt: Pt | null, roof: boolean): Element | null {
    const st = useStore.getState(); const scene = sceneRef.current
    if (!scene?.terrain || st.tool === 'select') return null
    const raw: Pt[] = cursorPt ? [...st.draft, cursorPt] : [...st.draft]
    const pts = raw.filter((p, i) => i === 0 || Math.hypot(p[0] - raw[i - 1][0], p[1] - raw[i - 1][1]) > 0.05)
    const t0 = Math.round(st.time * 10) / 10
    const phase = st.config.phases.find(p => t0 >= p.start && t0 < p.end)
    return buildElement(st.tool, pts, optsRef.current, t0, phase ? phase.end : st.config.duration, roof)
  }

  // live preview: same renderer as the real element
  const refreshPreview = () => { const el = previewElement(lastCursor.current, lastRoof.current); if (el) el.id = '__draft'; layerRef.current?.setDraft(el, useStore.getState().config) }
  useEffect(() => { refreshPreview() }, [draft, tool, opts.side, opts.lineKind, opts.zoneKind, opts.unitModel, opts.unitCode, opts.lineTactical, opts.zoneTactical, opts.pointSymbol, time])

  function finishDraft() {
    const st = useStore.getState()
    const el = previewElement(null, false)
    if (!el) return
    st.clearDraft()
    st.addElement(el); layerRef.current?.setDraft(null, st.config)
  }

  function onPointerDown(ev: React.PointerEvent) {
    if (!ev.isPrimary) { if (down.current) down.current.dragged = true; return }
    if ((ev.button !== 0 && ev.button !== 2) || !(ev.target instanceof HTMLCanvasElement)) return
    down.current = { x: ev.clientX, y: ev.clientY, dragged: false, id: ev.pointerId, button: ev.button }
  }

  function onPointerUp(ev: React.PointerEvent) {
    const d = down.current; down.current = null
    if(optsRef.current.exportMode||optsRef.current.present||exporting.current)return
    if (!d || ev.pointerId !== d.id || ev.button !== d.button) return
    if (d.dragged || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 6) return   // a drag, not a click
    const scene = sceneRef.current; if (!scene?.terrain) return
    const st = useStore.getState()
    if (d.button === 2) { if (st.draft.length) finishDraft(); return }
    if (st.unitKeyPlacement) {
      const hit = scene.pick(ev), key = st.unitKeyPlacement, unit = st.config.elements.find(e => e.id === key.id)
      if (hit && unit?.kind === 'unit') {
        const keys = unit.positionKeys?.length ? unit.positionKeys : [{ time: unit.from ?? 0, pos: unitPosition(unit, 0) }]
        st.updateElement(unit.id, { positionKeys: [...keys.filter(k => k.time !== key.time), { time: key.time, pos: scene.localToLV95(hit.x, hit.y) }].sort((a,b) => a.time-b.time) })
        st.setUnitKeyPlacement(null)
      }
      return
    }
    if (st.tool === 'select') { st.select(layerRef.current?.pick(ev) ?? null); return }
    const hit = scene.pick(ev); if (!hit) return
    const p = scene.localToLV95(hit.x, hit.y)
    if (st.tool === 'unit' || st.tool === 'callout' || st.tool === 'marker') {
      lastCursor.current = p; lastRoof.current = hit.building
      const el = previewElement(p, hit.building)
      if (el) st.addElement(el)
      return
    }
    st.pushDraft(p)
    if ((st.tool === 'cone' || st.tool === 'mortar') && st.draft.length + 1 >= 2) finishDraft()
  }

  function onPointerMove(ev: React.PointerEvent) {
    const scene = sceneRef.current; if (!scene?.terrain) return
    const st = useStore.getState()
    if (ev.buttons !== 0) {
      if (down.current && Math.hypot(ev.clientX - down.current.x, ev.clientY - down.current.y) > 6) { down.current.dragged = true; st.setFollow(false) }
      layerRef.current?.setDraft(null, st.config); st.setHover(null); return
    }
    if(optsRef.current.exportMode||optsRef.current.present||exporting.current)return
    if (st.tool === 'select') { st.setHover(layerRef.current?.pick(ev) ?? null); const hit = scene.pick(ev); setCursor(hit ? { x: hit.x, y: hit.y, h: hit.h } : null); return }
    const hit = scene.pick(ev)
    setCursor(hit ? { x: hit.x, y: hit.y, h: hit.h } : null)
    lastCursor.current = hit ? scene.localToLV95(hit.x, hit.y) : null
    lastRoof.current = !!hit?.building
    refreshPreview()
  }

  function onPointerLeave() { down.current = null; lastCursor.current = null; refreshPreview(); useStore.getState().setHover(null) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if(exporting.current||optsRef.current.present)return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const st = useStore.getState()
      if (e.key === 'Enter' && st.draft.length) { e.preventDefault(); finishDraft(); return }
      if (e.key === 'Escape') { if (st.unitKeyPlacement) { st.setUnitKeyPlacement(null); return }; if (st.draft.length) st.clearDraft(); else if (st.selected) st.select(null); else st.setTool('select'); return }
      if (e.key === 'Backspace' || e.key === 'Delete') { if (st.draft.length) st.popDraft(); else if (st.selected) st.removeElement(st.selected); return }
      if (e.key === ' ') { e.preventDefault(); st.setPlaying(!st.playing); return }
      if (e.key === 'ArrowLeft') { st.setTime(st.time - (e.shiftKey ? 10 : 1)); return }
      if (e.key === 'ArrowRight') { st.setTime(st.time + (e.shiftKey ? 10 : 1)); return }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? st.redo() : st.undo(); return }
      if (e.key.toLowerCase() === 'k') { if (st.config.shots.length) st.setFollow(!st.followCamera); return }
      if (e.key === 'Home' && sceneRef.current) { e.preventDefault(); st.setFollow(false); sceneRef.current.frameAll(); return }
      if (e.key.toLowerCase() === 'f' && sceneRef.current) { const el = st.config.elements.find(x => x.id === st.selected); const p = el && (el.kind === 'unit' ? unitPosition(el, st.time) : 'pos' in el ? el.pos : 'points' in el ? el.points[0] : null); if (p) { const [x, y] = sceneRef.current.lv95ToLocal(p); sceneRef.current.controls.target.copy(toScene(x, y, sceneRef.current.terrain.ground(x, y))) } return }
      const map: Record<string, Tool> = { v: 'select', u: 'unit', m: 'move', z: 'zone', p: 'line', x: 'unit', e: 'fire', l: 'callout', o: 'cone', t: 'mortar', d: 'marker' }
      if(optsRef.current.exportMode)return
      const t = map[e.key.toLowerCase()]; if (t) st.setTool(t)
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function screenshot() {
    const scene=sceneRef.current,layer=layerRef.current,st=useStore.getState()
    if(!scene||!layer||!ref.current||exporting.current)return
    setCapturing(true);setCaptureStatus('PNG wird erstellt …');st.setPlaying(false)
    exporting.current=true
    const controlsEnabled=scene.controls.enabled;scene.controls.enabled=false
    try {
      layer.setSelected(null);layer.setHover(null);layer.setDraft(null,st.config);layer.update(st.time);scene.render()
      await document.fonts.ready
      const scale=Math.min(window.devicePixelRatio,2)
      const canvas=document.createElement('canvas');canvas.width=Math.round(ref.current.clientWidth*scale);canvas.height=Math.round(ref.current.clientHeight*scale)
      const ctx=canvas.getContext('2d')!
      const comp=new CanvasCompositor(scene,scale);await comp.prepare(new AbortController().signal);comp.draw(ctx,canvas.width,canvas.height)
      ctx.save();ctx.scale(scale,scale);ctx.font='12px sans-serif';ctx.textAlign='right';ctx.fillStyle='rgba(10,14,18,.8)';ctx.fillRect(ref.current.clientWidth-110,ref.current.clientHeight-28,110,28);ctx.fillStyle='white';ctx.fillText('© swisstopo',ref.current.clientWidth-10,ref.current.clientHeight-10);ctx.restore()
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG konnte nicht erstellt werden')),'image/png'))
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`manöver-${st.config.area.id}-${st.time.toFixed(1)}s.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)
      setCaptureStatus('PNG heruntergeladen.')
    }catch(error){setCaptureStatus(`Screenshot fehlgeschlagen: ${error instanceof Error?error.message:'Bitte erneut versuchen.'}`)}
    finally {scene.controls.enabled=controlsEnabled;layer.setSelected(useStore.getState().selected);layer.setHover(useStore.getState().hover);exporting.current=false;setCapturing(false);refreshPreview()}
  }

  const scene = sceneRef.current
  const phase = config.phases.find(p => time >= p.start && time < p.end)
  return (
    <div className={`viewport tool-${tool} ${hover ? 'hov' : ''}`} onContextMenu={e => { if (e.target instanceof HTMLCanvasElement) e.preventDefault() }} onPointerCancel={() => { down.current = null }} onPointerDownCapture={e=>{if(e.target instanceof HTMLCanvasElement&&sceneRef.current&&!exporting.current){useStore.getState().setFollow(false);sceneRef.current.controls.enabled=true}}} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <div className="gl" ref={ref} />
      {!opts.present&&!opts.exportMode&&!capturing&&ready&&scene&&tool==='select'&&config.elements.filter(e=>{const [a,b]=elementWindow(e,config);return e.id===selected&&time>=a&&time<=b}).map(e=>e.kind==='move'&&e.followUnit?(config.elements.find(t=>t.id===e.followUnit)||e):e).map(e=><EditHandles key={e.id} scene={scene} element={e} onDragging={v=>{editDragging.current=v}}/>)}
      {!opts.present&&<div className="capture-controls" onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onPointerMove={e=>e.stopPropagation()}><button disabled={!ready||capturing||mapStatus.loading} onClick={screenshot}>▣ Screenshot</button><span role="status">{captureStatus}</span></div>}
      {opts.exportMode&&opts.cameraMount&&ready&&scene&&createPortal(<CameraPanel scene={scene}/>,opts.cameraMount)}
      {!ready && <div className="loading"><div className="load-box"><div className="load-title">{loadMsg.error ? 'Gelände konnte nicht geladen werden' : 'Gelände wird geladen'}</div><div className="load-msg">{loadMsg.error ?? loadMsg.message}</div>{!loadMsg.error && <div className="load-bar"><div style={{ width: `${Math.round(100 * loadMsg.done / Math.max(1, loadMsg.total))}%` }} /></div>}{loadMsg.error && <button className="small" onClick={() => useStore.getState().setScreen('area')}>Zurück zur Karte</button>}</div></div>}
      {!opts.present && <div className="hud-tl">
        {phase && <div className="chip strong">{phase.title}</div>}
        <CameraChip />
      </div>}
      {!opts.present && <div className="ground-control" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerMove={e => e.stopPropagation()}>
        <div className="seg" role="group" aria-label="Bodenansicht">
          <button aria-pressed={groundMode === 'fui'} className={groundMode === 'fui' ? 'on' : ''} onClick={() => useStore.getState().setGroundMode('fui')}>Geländebild</button>
          <button aria-pressed={groundMode === 'map'} className={groundMode === 'map' ? 'on' : ''} onClick={() => useStore.getState().setGroundMode('map')}>Landeskarte</button>
          <button aria-pressed={groundMode === 'sat'} className={groundMode === 'sat' ? 'on' : ''} onClick={() => useStore.getState().setGroundMode('sat')}>Luftbild</button>
        </div>
        {groundMode !== 'fui' && <>
          <label>Detail <select aria-label="Kartendetail" value={mapDetail} onChange={e => useStore.getState().setMapDetail(e.target.value as MapDetail)}>
            <option value="auto">Automatisch</option><option value="overview">Übersicht</option><option value="detail">Detail</option>
          </select></label>
          <span className="map-status" role="status">{mapStatus.loading ? (groundMode === 'sat' ? 'Luftbild wird geladen …' : 'Karte wird geladen …') : mapStatus.error ? 'Laden fehlgeschlagen' : mapStatus.resolution ? `≈ ${mapStatus.resolution.toFixed(1)} m/Pixel` : ''}</span>
          {mapStatus.error && <button title={mapStatus.error} onClick={() => sceneRef.current?.setGround(groundMode, mapDetail)}>Erneut versuchen</button>}
        </>}
        <a href="https://www.swisstopo.admin.ch/" target="_blank" rel="noreferrer">© swisstopo</a>
      </div>}
      {!opts.present && <div className="hud-bl">{cursor && scene && <span className="chip mono">{Math.round(scene.area.E0 + cursor.x).toLocaleString('de-CH')} / {Math.round(scene.area.N0 + cursor.y).toLocaleString('de-CH')} · {Math.round(cursor.h + scene.terrain.Z0)} m</span>}</div>}
      {!opts.present && <div className="terrain-notice" role="status">{areaNotes.filter(n=>n.includes('Höhenabdeckung')||n.startsWith('Kartenmodus')).join(' · ')}</div>}
      {!opts.present && !opts.exportMode && draft.length > 0 && <div className="drawing-actions" onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()}><span>{draft.length} Punkte · weitere Punkte ins Gelände klicken</span><button disabled={draft.length < (tool === 'zone' ? 3 : 2)} onClick={finishDraft}>Zeichnung fertigstellen</button><button onClick={()=>useStore.getState().popDraft()}>Letzter Punkt zurück</button><button onClick={()=>useStore.getState().clearDraft()}>Abbrechen</button></div>}
      {!opts.present && <div className="hint">{opts.exportMode?'Kamera ziehen = frei einstellen · Shot-Vorschau = gespeicherte Kamerafolge':keyPlacement ? `Positions-Keyframe bei ${keyPlacement.time.toFixed(1)} s: Ziel im Gelände klicken · Esc abbrechen` : HINT[tool]}{draft.length ? ` · ${draft.length} Punkte` : ''}</div>}
    </div>
  )
}

function CameraChip() {
  const follow=useStore(s=>s.followCamera),time=useStore(s=>s.time),shots=useStore(s=>s.config.shots)
  const shot=shots.find(s=>time>=s.start&&time<s.end)??shots.filter(s=>s.start<=time).at(-1)
  return <button className={`camera-indicator ${follow&&shots.length?'planned':'free'}`} onClick={()=>{const st=useStore.getState();st.setPlaying(false);st.setFollow(shots.length?!follow:false)}}>
    {follow&&shots.length?`● SHOT-VORSCHAU · ${shot?.id??''}`:'◉ FREIE KAMERA'}
    <span>{follow&&shots.length?'Klicken: frei einstellen':shots.length?'Klicken: Kamerafolge zeigen':'Drehen · Verschieben · Zoomen'}</span>
  </button>
}
