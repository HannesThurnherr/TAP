import {swissLegend} from '../symbology/legend'
import {symbolSvg} from '../symbology/symbol'
import { useEffect, useRef, useState } from 'react'
import { useStore, fmt } from '../state/store'
import { hudState, legendFor } from '../model/hud'
import { Viewport } from './Viewport'
import { KIND_LABEL } from '../model/types'

const LEGEND_LABEL: Record<string, string> = {
  unit: 'Einheit', move: 'Bewegung', fire: 'Feuer', mover: 'Fahrzeug / Trupp', callout: 'Text', cone: 'Beobachtung', mortar: 'Minenwerfer', marker: 'Ereignis',
  'line:pl': 'Phasenlinie', 'line:sperre': 'Sperre', 'line:hindernis': 'Hindernis', 'line:stellung': 'Stellung', 'line:route': 'Route',
  'zone:kill': 'Feuerraum', 'zone:dismount': 'Absitzraum', 'zone:assembly': 'Bereitstellung', 'zone:objective': 'Ziel', 'zone:support': 'Unterstützung',
}
const LEGEND_SWATCH: Record<string, string> = { 'line:pl': '#ff4040', 'line:sperre': '#e03a3a', 'line:hindernis': '#e8e8e8', 'line:stellung': '#2f7cff', 'line:route': '#2f7cff', 'zone:kill': '#eb3232', 'zone:dismount': '#eb3232', 'zone:assembly': '#288cff', 'zone:objective': '#ffb020', 'zone:support': '#288cff', fire: '#ff8c00', mortar: '#ffdc5a', callout: '#ffb020', marker: '#ffb020', cone: '#288cff' }

/** Full-window playback: the same picture the export produces, with phase header, clock, captions, legend and a phase strip. */
export function Presentation() {
  const config = useStore(s => s.config)
  const time = useStore(s => s.time)
  const playing = useStore(s => s.playing)
  const follow = useStore(s => s.followCamera)
  const [legend, setLegend] = useState(true)
  const [controls, setControls] = useState(true)
  const hideTimer = useRef<number | undefined>(undefined)
  const st = useStore.getState
  const hud = hudState(config, time)
  const phase = hud.phase
  const symbols=swissLegend(config,phase?.start??0,phase?.end??config.duration)
  const leg = legendFor(config, phase?.start ?? 0, phase?.end ?? config.duration)

  const poke = () => { setControls(true); window.clearTimeout(hideTimer.current); hideTimer.current = window.setTimeout(() => { if (useStore.getState().playing) setControls(false) }, 3000) }
  useEffect(() => { poke(); return () => window.clearTimeout(hideTimer.current) }, [playing])

  const jumpPhase = (dir: 1 | -1) => {
    const phases = [...config.phases].sort((a, b) => a.start - b.start)
    const i = phases.findIndex(p => time >= p.start && time < p.end)
    const target = phases[Math.max(0, Math.min(phases.length - 1, (i < 0 ? 0 : i) + dir))]
    if (target) { st().setTime(target.start); st().setPlaying(false) }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName; if (tag === 'INPUT' || tag === 'TEXTAREA') return
      poke()
      if (e.key === ' ') { e.preventDefault(); st().setPlaying(!st().playing) }
      else if (e.key === 'Escape') { st().setPlaying(false); st().setScreen('editor') }
      else if (e.key === 'ArrowRight') jumpPhase(1)
      else if (e.key === 'ArrowLeft') jumpPhase(-1)
      else if (e.key === 'ArrowUp') st().setTime(st().time + 5)
      else if (e.key === 'ArrowDown') st().setTime(st().time - 5)
      else if (e.key.toLowerCase() === 'k') { if (st().config.shots.length) st().setFollow(!st().followCamera) }
      else if (e.key.toLowerCase() === 'l') setLegend(v => !v)
      else if (e.key === 'Home') st().setTime(0)
      else if (/^[1-9]$/.test(e.key)) { const p = [...config.phases].sort((a, b) => a.start - b.start)[Number(e.key) - 1]; if (p) { st().setTime(p.start); st().setPlaying(false) } }
    }
    window.addEventListener('keydown', onKey, true); return () => window.removeEventListener('keydown', onKey, true)
  }, [config])

  const pct = (t: number) => `${(t / config.duration) * 100}%`
  const scrub = (ev: React.MouseEvent<HTMLDivElement>) => { const r = ev.currentTarget.getBoundingClientRect(); st().setTime(((ev.clientX - r.left) / r.width) * config.duration) }

  return (
    <div className={`present ${controls ? '' : 'idle'}`} onMouseMove={poke} onClick={poke}>
      <Viewport present exportMode={false} cameraMount={null} side="blue" lineKind="pl" zoneKind="kill" />
      {/* HUD (what the export burns in) */}
      {phase && <div className="ph-title">{phase.title}</div>}
      <div className="ph-clock mono">SZENARIO {hud.clock}</div>
      {hud.captions.map(c => <div key={c.id} className={`ph-caption ${c.position === 'top' ? 'top' : ''}`}><div className="t">{c.text}</div>{c.sub && <div className="s">{c.sub}</div>}</div>)}
      {legend && (leg.sides.length + leg.kinds.length > 0) && <div className={`ph-legend ${symbols.length?'swiss-legend':''}`}>
        {symbols.slice(0,8).map((entry,i)=><div className="symbol-legend-row" key={'symbol'+i}><span dangerouslySetInnerHTML={{__html:symbolSvg(entry.drawing)}}/>{entry.label}</div>)}
        {symbols.length>8&&<div>+ {symbols.length-8} weitere Symbole</div>}
        {!symbols.length&&leg.sides.map(s => <div key={s}><span className="sw" style={{ background: s === 'blue' ? '#288cff' : s === 'red' ? '#eb3232' : '#d2d2d2' }} />{s === 'blue' ? 'Eigene' : s === 'red' ? 'Feind' : 'Neutral'}</div>)}
        {!symbols.length&&leg.kinds.filter(k => k !== 'unit' && k !== 'mover' && k !== 'move').slice(0, 8).map(k => <div key={k}><span className="sw" style={{ background: LEGEND_SWATCH[k] ?? '#cfd8e0' }} />{LEGEND_LABEL[k] ?? KIND_LABEL[k as keyof typeof KIND_LABEL] ?? k}</div>)}
      </div>}
      <div className="ph-stand mono">{config.area.name} · Stand {new Date().toLocaleDateString('de-CH')}</div>
      {/* controls (auto-hide) */}
      <div className="ph-bar">
        <div className="ph-phases">{[...config.phases].sort((a, b) => a.start - b.start).map((p, i) => <button key={p.id} className={p.id === phase?.id ? 'on' : ''} onClick={() => { st().setTime(p.start); st().setPlaying(false) }}>{p.title || `Phase ${i + 1}`}</button>)}</div>
        <div className="ph-transport">
          <button onClick={() => jumpPhase(-1)} title="Vorherige Phase (←)">⏮</button>
          <button className="big" onClick={() => st().setPlaying(!playing)} title="Wiedergabe (Leertaste)">{playing ? '❚❚' : '▶'}</button>
          <button onClick={() => jumpPhase(1)} title="Nächste Phase (→)">⏭</button>
          <div className="ph-scrub" onMouseDown={scrub} onMouseMove={e => { if (e.buttons) scrub(e) }}>
            <div className="fill" style={{ width: pct(time) }} />
            {config.phases.map(p => <div key={p.id} className="tick" style={{ left: pct(p.start) }} />)}
            <div className="knob" style={{ left: pct(time) }} />
          </div>
          <span className="mono">{fmt(time)} / {fmt(config.duration)}</span>
          {config.shots.length > 0 && <button className={follow ? 'on' : ''} onClick={() => st().setFollow(!follow)} title="Kamerafolge (K)">{follow ? 'Kamera folgt' : 'Kamera frei'}</button>}
          <button className={legend ? 'on' : ''} onClick={() => setLegend(!legend)} title="Legende (L)">Legende</button>
          <button onClick={() => { st().setPlaying(false); st().setScreen('editor') }} title="Zurück zum Editor (Esc)">✕ Editor</button>
        </div>
      </div>
    </div>
  )
}
