import { useEffect, useRef, useState } from 'react'
import { useStore, fmt } from '../state/store'
import { SIDE_COLOR, ZONE_COLOR, KIND_LABEL, type Element, type Phase } from '../model/types'

import { PhaseDialog, phaseId } from './PhaseDialog'

import { arrowTimes, moverKeys } from '../model/timing'

import { timelineWindow, retimeElement, type TimingDrag } from '../model/timelineEdit'

const LBL = 200, ROW = 22, TOP = 22 + 22 + 18

export function Timeline() {
  const phaseDrag = useRef<{ pointer: number; x: number; start: number; end: number; moved: boolean; existing?: Phase } | null>(null)
  const [phasePreview, setPhasePreview] = useState<[number, number] | null>(null)
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const config = useStore(s => s.config)
  const time = useStore(s => s.time)
  const selected = useStore(s => s.selected)
  const hover = useStore(s => s.hover)
  const [scrollOffset, setScrollOffset] = useState(0)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const scroll = useRef<HTMLDivElement>(null)
  useEffect(() => { const c = canvas.current!; const ro = new ResizeObserver(() => { setWidth(c.clientWidth); setHeight(c.clientHeight) }); ro.observe(c); return () => ro.disconnect() }, [])
  const timed = config.elements
  useEffect(() => { const c = canvas.current; if (c) setScrollOffset(v => Math.min(v, Math.max(0, config.elements.length * ROW - (c.clientHeight - TOP)))) }, [config.elements.length, width, height])

  useEffect(() => {
    const c = canvas.current; if (!c) return
    const dpr = window.devicePixelRatio || 1
    const W = c.clientWidth, H = c.clientHeight
    c.width = W * dpr; c.height = H * dpr
    const g = c.getContext('2d')!; g.scale(dpr, dpr)
    g.clearRect(0, 0, W, H)
    const tw = W - LBL, px = (t: number) => LBL + (t / config.duration) * tw
    g.font = '11px "IBM Plex Mono", Menlo, monospace'
    // ruler
    g.fillStyle = '#1a1e24'; g.fillRect(0, 0, W, 22)
    for (let t = 0; t <= config.duration; t += 5) { const x = px(t); g.strokeStyle = t % 10 === 0 ? '#3a4250' : '#262c35'; g.beginPath(); g.moveTo(x, t % 10 === 0 ? 8 : 14); g.lineTo(x, 22); g.stroke(); if (t % 10 === 0) { g.fillStyle = '#8b93a1'; g.fillText(fmt(t), x + 3, 12) } }
    g.fillStyle = '#8b93a1'; g.font = '600 11px Barlow, sans-serif'; g.fillText('Ruler · Klick = springen', 10, 14)
    // phases
    g.fillText('Phasen', 10, 22 + 15)
    for (const p of config.phases) { const x0 = px(p.start), x1 = px(p.end); const cur = time >= p.start && time < p.end; g.fillStyle = cur ? '#34456a' : '#2c3a55'; g.fillRect(x0 + 1, 24, x1 - x0 - 2, 18); g.fillStyle = cur ? '#6ee0ff' : '#4c8dff'; g.fillRect(x0 + 1, 24, 2, 18); g.fillStyle = '#ffffff'; g.font = '600 11px Barlow, sans-serif'; g.save(); g.beginPath(); g.rect(x0, 24, x1 - x0 - 4, 18); g.clip(); g.fillText(p.title, x0 + 8, 37); g.restore() }
    if (phasePreview) {
      const a = px(phasePreview[0]), b = px(phasePreview[1])
      g.fillStyle = '#6ee0ff77'; g.fillRect(a, 23, Math.max(2, b - a), 20)
      g.strokeStyle = '#6ee0ff'; g.strokeRect(a + .5, 23.5, Math.max(2, b - a) - 1, 19)
    }
    // shots
    g.fillStyle = '#8b93a1'; g.font = '600 11px Barlow, sans-serif'; g.fillText('Kamera', 10, 44 + 13)
    if (!config.shots.length) { g.fillStyle = '#3a4250'; g.font = '10px Barlow, sans-serif'; g.fillText('keine Shots · Kamera frei', LBL + 8, 57) }
    for (const s of config.shots) { const x0 = px(s.start), x1 = px(s.end); g.fillStyle = '#2a3a3f'; g.fillRect(x0 + 1, 46, x1 - x0 - 2, 14); g.strokeStyle = '#3d5a63'; g.strokeRect(x0 + 1.5, 46.5, x1 - x0 - 3, 13); g.fillStyle = '#cfd8e0'; g.font = '10px Barlow, sans-serif'; g.fillText(`${s.id} · ${s.kind === 'orbit' ? 'Orbit' : 'Fahrt'}`, x0 + 6, 57) }
    // rows
    g.save(); g.beginPath(); g.rect(0, TOP, W, H - TOP); g.clip()
    if (!timed.length) { g.fillStyle = '#3a4250'; g.font = '12px Barlow, sans-serif'; g.fillText('Noch keine Elemente. Gezeichnete Elemente erscheinen hier mit ihrem Zeitfenster.', 10, TOP + 18) }
    timed.forEach((el, i) => {
      const y = TOP + i * ROW - scrollOffset; if (y + ROW < TOP || y > H) return
      const sel = el.id === selected, hov = el.id === hover
      if (sel || hov) { g.fillStyle = sel ? '#252b36' : '#1f2530'; g.fillRect(0, y, W, ROW) }
      g.fillStyle = '#1c2026'; g.fillRect(LBL, y + ROW - 1, tw, 1)
      const col = el.kind === 'zone' ? (el.color ?? ZONE_COLOR[el.zoneKind]) : el.kind === 'line' ? (el.color ?? '#cfd8e0') : el.kind === 'callout' ? '#ffb020' : SIDE_COLOR[el.side ?? 'neutral']
      g.fillStyle = col; g.fillRect(10, y + 7, 8, 8)
      g.fillStyle = sel ? '#ffffff' : '#cfd8e0'; g.font = '12px Barlow, sans-serif'
      const name = (el as any).name || (el as any).text || KIND_LABEL[el.kind]
      g.fillText(name.length > 22 ? name.slice(0, 21) + '…' : name, 24, y + 15)
      g.fillStyle = '#8b93a1'; g.font = '10px Barlow, sans-serif'; g.fillText(KIND_LABEL[el.kind], LBL - 8 - g.measureText(KIND_LABEL[el.kind]).width, y + 15)
      const [from, to] = timelineWindow(el, config.duration)
      g.globalAlpha = 0.45; g.fillStyle = col; g.fillRect(px(from), y + 5, Math.max(2, px(to) - px(from)), 12); g.globalAlpha = 1
      g.strokeStyle = col; g.lineWidth = 1; g.strokeRect(px(from) + 0.5, y + 5.5, Math.max(2, px(to) - px(from)) - 1, 11)
      if(sel || hov) { g.fillStyle='#ffffff'; g.fillRect(px(from)+2,y+6,2,10); g.fillRect(px(to)-4,y+6,2,10) }
      if(el.kind==='unit'&&el.destroyed!=null){g.fillStyle='#eb3232';g.font='700 14px Barlow';g.fillText('✕',px(el.destroyed)-5,y+16)}
      if (el.kind === 'mover') { for (const [t] of moverKeys(el, [], config.duration)) { const x = px(t); g.fillStyle = '#cfd8e0'; g.save(); g.translate(x, y + 11); g.rotate(Math.PI / 4); g.fillRect(-4, -4, 8, 8); g.restore() } if (el.destroyed != null) { g.fillStyle = '#eb3232'; g.font = '700 14px Barlow'; g.fillText('✕', px(el.destroyed) - 5, y + 16) } }
      if (el.kind === 'move' && el.animation !== 'static') { const [start, end] = arrowTimes(el, config.duration); g.fillStyle = col; g.fillRect(px(Math.max(from, start)), y + 8, Math.max(0, px(Math.min(to, end)) - px(Math.max(from, start))), 6) }
      if (el.kind === 'unit') for (const key of el.positionKeys ?? []) { g.fillStyle = '#ffffff'; g.save(); g.translate(px(key.time), y+11); g.rotate(Math.PI/4); g.fillRect(-3,-3,6,6); g.restore() }
      if (el.kind === 'zone' && el.active != null) { g.fillStyle = '#ffb020'; g.font = '13px Barlow'; g.fillText('★', px(el.active) - 5, y + 16) }
    })
    g.restore()
    // playhead
    const x = px(time); g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke()
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(x - 6, 0); g.lineTo(x + 6, 0); g.lineTo(x, 8); g.fill()
  }, [config, time, selected, hover, timed.length, scrollOffset, width, height, phasePreview])

  const scrubbing = useRef(false)
  const drag = useRef<{ original: Element; mode: TimingDrag; x: number; pointer: number; moved: boolean } | null>(null)
  const [dragLabel,setDragLabel] = useState('')
  const timeAt = (ev: {clientX:number}) => { const r = canvas.current!.getBoundingClientRect(); return Math.min(Math.max((ev.clientX-r.left-LBL)/(r.width-LBL),0),1)*config.duration }
  const rowAt = (ev: {clientY:number}) => { const r=canvas.current!.getBoundingClientRect(); const y=ev.clientY-r.top; return y>=TOP ? timed[Math.floor((y-TOP+scrollOffset)/ROW)] : undefined }
  const hit = (ev: {clientX:number;clientY:number}) => {
    const el=rowAt(ev), c=canvas.current!; if(!el) return null
    const r=c.getBoundingClientRect(), x=ev.clientX-r.left, y=ev.clientY-r.top
    if(x<LBL || ((y-TOP+scrollOffset)%ROW)<3 || ((y-TOP+scrollOffset)%ROW)>20) return null
    const [from,to]=timelineWindow(el,config.duration), a=LBL+from/config.duration*(r.width-LBL), b=LBL+to/config.duration*(r.width-LBL)
    if(x<a-6 || x>b+6) return null
    const nearStart=Math.abs(x-a)<=6, nearEnd=Math.abs(x-b)<=6
    const mode: TimingDrag=nearStart&&(!nearEnd||Math.abs(x-a)<Math.abs(x-b))?'start':nearEnd?'end':'move'
    return {el,mode}
  }
  const finish = (commit:boolean) => {
    if(drag.current) useStore.getState().finishElementEdit(drag.current.original,commit)
    drag.current=null; phaseDrag.current=null; setPhasePreview(null); scrubbing.current=false; setDragLabel('')
    if(canvas.current) canvas.current.style.cursor='default'
  }
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{ if((drag.current || phaseDrag.current) && e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false)} }
    window.addEventListener('keydown',key,true)
    return ()=>{window.removeEventListener('keydown',key,true); if(drag.current) useStore.getState().finishElementEdit(drag.current.original,false)}
  },[])
  const onDown = (ev:React.PointerEvent<HTMLCanvasElement>) => {
    if(ev.button!==0 || !ev.isPrimary) return
    const r=ev.currentTarget.getBoundingClientRect(), y=ev.clientY-r.top, st=useStore.getState()
    if (y >= 22 && y < 44 && ev.clientX - r.left >= LBL) {
      const t = Math.round(timeAt(ev) * 10) / 10
      st.setPlaying(false); st.setHover(null)
      phaseDrag.current = { pointer: ev.pointerId, x: ev.clientX, start: t, end: t, moved: false, existing: config.phases.find(p => t >= p.start && t < p.end) }
      ev.currentTarget.setPointerCapture(ev.pointerId); return
    }
    if(y>=TOP) {
      const el=rowAt(ev); if(!el)return; st.select(el.id)
      const target=hit(ev)
      if(target){st.setPlaying(false); drag.current={original:el,mode:target.mode,x:ev.clientX,pointer:ev.pointerId,moved:false};ev.currentTarget.setPointerCapture(ev.pointerId)}
      else if(ev.clientX-r.left>LBL) st.setTime(timeAt(ev))
      return
    }
    scrubbing.current=true; ev.currentTarget.setPointerCapture(ev.pointerId); st.setTime(timeAt(ev))
  }
  const onMove = (ev:React.PointerEvent<HTMLCanvasElement>) => {
    const pd = phaseDrag.current
    if (pd) {
      if (pd.pointer !== ev.pointerId) return
      if (!pd.moved && Math.abs(ev.clientX - pd.x) < 4) return
      pd.moved = true; pd.end = Math.round(timeAt(ev) * 10) / 10
      const a = Math.min(pd.start, pd.end), b = Math.max(pd.start, pd.end)
      setPhasePreview([a, b]); setDragLabel(`Neue Phase · ${fmt(a, true)} – ${fmt(b, true)} · Esc abbrechen`)
      ev.currentTarget.style.cursor = 'crosshair'; return
    }
    const d=drag.current
    if(d){
      if(ev.pointerId!==d.pointer)return
      if(!d.moved && Math.abs(ev.clientX-d.x)<3)return
      d.moved=true
      const seconds=(ev.clientX-d.x)/(ev.currentTarget.clientWidth-LBL)*config.duration, step=ev.altKey?0.01:0.1
      const next=retimeElement(d.original,config.duration,d.mode,Math.round(seconds/step)*step)
      useStore.getState().previewElement(next)
      const [a,b]=timelineWindow(next,config.duration)
      setDragLabel(`${d.mode==='move'?'Verschieben':'Dauer ändern'} · ${fmt(a,true)} – ${fmt(b,true)} · Esc abbrechen`)
      ev.currentTarget.style.cursor=d.mode==='move'?'grabbing':'ew-resize';return
    }
    if(scrubbing.current){useStore.getState().setTime(timeAt(ev));return}
    const r = ev.currentTarget.getBoundingClientRect()
    if (ev.clientY-r.top >= 22 && ev.clientY-r.top < 44 && ev.clientX-r.left >= LBL) { ev.currentTarget.style.cursor='crosshair'; useStore.getState().setHover(null); return }
    const target=hit(ev); ev.currentTarget.style.cursor=target?(target.mode==='move'?'grab':'ew-resize'):'default'
    useStore.getState().setHover(rowAt(ev)?.id??null)
  }
  const onUp = (ev:React.PointerEvent<HTMLCanvasElement>) => {
    const pd = phaseDrag.current
    if (pd) {
      if (pd.pointer !== ev.pointerId) return
      if (pd.moved && Math.abs(pd.end - pd.start) >= .1) setEditingPhase({ id: phaseId(), title: '', start: Math.min(pd.start, pd.end), end: Math.max(pd.start, pd.end) })
      else if (!pd.moved && pd.existing) setEditingPhase(pd.existing)
      finish(false)
      if (ev.currentTarget.hasPointerCapture(ev.pointerId)) ev.currentTarget.releasePointerCapture(ev.pointerId)
      return
    }
    const d=drag.current
    if(d && ev.pointerId!==d.pointer)return
    if(d && !d.moved) useStore.getState().setTime(timeAt(ev))
    finish(true)
    if(ev.currentTarget.hasPointerCapture(ev.pointerId))ev.currentTarget.releasePointerCapture(ev.pointerId)
  }
  const onWheel = (ev:React.WheelEvent) => { if(drag.current || !scroll.current)return; scroll.current.scrollTop += ev.deltaY * (ev.deltaMode === 1 ? ROW : ev.deltaMode === 2 ? height : 1); useStore.getState().setHover(null) }
  return <div className="timeline-editor">
    <canvas ref={canvas} className="timeline" aria-label="Timeline: Balken verschieben, Enden ziehen zum Strecken" title="Phasenzeile: ziehen = neue Phase · klicken = bearbeiten. Elemente: Balken verschieben · Enden strecken · Esc abbrechen" style={{touchAction:'none'}} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={()=>finish(false)} onLostPointerCapture={()=>{if(drag.current || phaseDrag.current)finish(false)}} onPointerLeave={()=>{if(!drag.current&&!scrubbing.current)useStore.getState().setHover(null)}} onWheel={onWheel} />
    <div ref={scroll} className="timeline-scroll" tabIndex={0} aria-label="Timeline-Elemente scrollen" onKeyDown={event => event.stopPropagation()} onScroll={event => setScrollOffset(event.currentTarget.scrollTop)}><div style={{height: timed.length * ROW, width: 1}} /></div>
    <button className="phase-add" title="In der Phasenzeile ziehen zum Zeichnen · Phase anklicken zum Bearbeiten" onClick={() => { useStore.getState().setPlaying(false); const start = Math.min(time, Math.max(0, config.duration - 1)); setEditingPhase({ id: phaseId(), title: '', start, end: Math.min(config.duration, start + 10) }) }}>＋ Phase</button>
    {editingPhase && <PhaseDialog phase={editingPhase} onClose={() => setEditingPhase(null)} />}
    {dragLabel && <div className="timeline-drag-status" role="status">{dragLabel}</div>}
  </div>
}
