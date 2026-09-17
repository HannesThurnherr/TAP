import {UNIT_MODELS,type UnitModel} from '../model/types'
import {UNIT_SYMBOLS,TACTICAL_LINES,TACTICAL_AREAS,POINT_SYMBOLS,type UnitCode,type TacticalLine,type TacticalArea,type PointCode} from '../symbology/catalog'
import { StageNav } from './StageNav'
import { useState } from 'react'
import { useStore, fmt, EMPTY, type Tool } from '../state/store'
import { Viewport } from './Viewport'
import { TimelinePanel } from './TimelinePanel'
import { ManeuverExchange } from './ManeuverExchange'
import { ExportPanel, ExportChip } from './ExportPanel'
import { Inspector } from './Inspector'
import type { Side } from '../model/types'
import { AEULI } from '../model/aeuli'

const TOOLS: { key: Tool; k: string; label: string; icon: string }[] = [
  { key: 'select', k: 'V', label: 'Auswahl', icon: 'M5 3l14 9-6 1.5L10 20z' },
  { key: 'unit', k: 'U', label: 'Einheit', icon: 'M4 7h16v11H4zM4 7l16 11M20 7L4 18' },
  { key: 'move', k: 'M', label: 'Bewegung', icon: 'M4 18c4-1 6-8 12-8M14 6l5 4-5 4' },
  { key: 'fire', k: 'E', label: 'Feuer', icon: 'M4 12h4M16 12h4M12 4v4M12 16v4M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0' },
  { key: 'line', k: 'P', label: 'Linie', icon: 'M3 17c5-2 7-10 18-10' },
  { key: 'cone', k: 'O', label: 'Beobachtungssektor', icon: 'M4 20L6 4Q16 5 21 16Z' },
  { key: 'mortar', k: 'T', label: 'Mörser', icon: 'M3 20Q9 -8 21 20M2 20h5M18 20h5' },
  { key: 'marker', k: 'D', label: 'Ereignis', icon: 'M12 3l9 17H3zM12 8v6M12 17v1' },
  { key: 'zone', k: 'Z', label: 'Raum', icon: 'M5 8l9-4 5 7-4 9-10-2z' },
  { key: 'callout', k: 'L', label: 'Text', icon: 'M9 4h12v8H9zM9 12l-6 8M13 8h4' },
]

export function Editor() {
  const tool = useStore(s => s.tool)
  const setTool = useStore(s => s.setTool)
  const time = useStore(s => s.time)
  const playing = useStore(s => s.playing)
  const config = useStore(s => s.config)
  const railWide = useStore(s => s.railWide)
  const exportMode=useStore(s=>s.screen)==='export'
  const [cameraMount,setCameraMount]=useState<HTMLDivElement|null>(null)
  const [exchangeOpen,setExchangeOpen] = useState(false)
  const [side, setSide] = useState<Side>('blue')
  const [unitCode,setUnitCode]=useState<UnitCode>('infantry'),[lineTactical,setLineTactical]=useState<TacticalLine|undefined>(),[zoneTactical,setZoneTactical]=useState<TacticalArea|undefined>(),[pointSymbol,setPointSymbol]=useState<PointCode|undefined>()
  const [lineKind, setLineKind] = useState('pl')
  const [zoneKind, setZoneKind] = useState('kill')
  const [unitModel,setUnitModel]=useState<UnitModel|undefined>()
  const st = useStore.getState

  return (
    <div className={`editor ${exportMode?'export-workspace':''}`}>
      <fieldset className="topbar"><StageNav/>
        {!exportMode&&<button className="ghost" aria-label="Werkzeuge ein-/ausklappen" aria-expanded={railWide} title="Werkzeuge ein-/ausklappen" onClick={() => st().toggleRail()}>☰</button>}

        <div className="title">{config.area.name}</div>

        {!exportMode&&<button className="ghost small" onClick={() => { if (config.elements.length === 0 || confirm('Alle Elemente entfernen und leer starten?')) st().replaceConfig({ ...EMPTY, area: config.area }) }}>Leer starten</button>}
        {!exportMode&&<button className="ghost small" onClick={() => { if (config.elements.length === 0 || confirm('Aktuelle Elemente durch das Beispiel Äuli ersetzen?')) { st().replaceConfig(AEULI); useStore.setState({areaRect:null,areaRotation:0}); if (st().areaSource.kind !== 'aeuli') st().setAreaSource({ kind: 'aeuli' }); st().setFollow(true) } }}>Animierte Demo</button>}
        <div className="grow" />
        <div className="transport">
          <button onClick={() => st().setTime(0)}>⏮</button>
          <button onClick={() => st().setTime(time - 1)}>◀</button>
          <button className={playing ? 'on' : ''} onClick={() => st().setPlaying(!playing)}>{playing ? '❚❚' : '▶'}</button>
          <button onClick={() => st().setTime(time + 1)}>▶|</button>
          <span className="mono clock">{fmt(time, true)} <span className="dim">/ {fmt(config.duration)}</span></span>
        </div>
        <div className="grow" />
        <button className="ghost" title="Rückgängig (⌘Z)" onClick={() => { st().undo() }}>↶</button>
        <button className="ghost" title="Wiederholen (⇧⌘Z)" onClick={() => { st().redo() }}>↷</button>
        <button className="ghost" title="Präsentation (Vollbild-Wiedergabe)" onClick={() => { st().setPlaying(false); st().setTool('select'); st().clearDraft(); st().setFollow(config.shots.length > 0); st().setScreen('present') }}>▶ Präsentation</button>
        {!exportMode&&<button className="accent" title="Manöverbeschreibung → Prompt kopieren → JSON laden" onClick={() => setExchangeOpen(true)}>✦ Manöver aus Text / LLM</button>}
        <button className="ghost" onClick={()=>window.open('/symbol-reference.html','_blank','noopener')}>Symbolreferenz</button><ExportChip />

      </fieldset>
      <div className={`main ${exportMode?'export-mode':''}`}>
        {exportMode?<div className="export-sidebar"><div ref={setCameraMount}/><ExportPanel/></div>:<><div className={`rail ${railWide ? 'wide' : ''}`}>
          {TOOLS.map(t => <button key={t.key} className={tool === t.key ? 'on' : ''} title={`${t.label} (${t.k})`} onClick={() => setTool(t.key)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"><path d={t.icon} /></svg>{railWide && <span className="name">{t.label}</span>}<span className="key">{t.k}</span></button>)}
        </div>
        <Inspector /></>}
        <div className="centre">
          {!exportMode&&<div className="strip">
            <b>{TOOLS.find(t => t.key === tool)?.label}</b>
            {tool !== 'select' && <div className="seg">{(['blue', 'red', 'neutral','unknown'] as const).map(s => <button key={s} className={side === s ? `on ${s}` : ''} onClick={() => setSide(s)}>{s === 'blue' ? 'Blau' : s === 'red' ? 'Rot' : s==='unknown'?'Unbekannt':'Neutral'}</button>)}</div>}
            {tool==='unit'&&<select aria-label="Darstellung neuer Einheiten" value={unitModel??''} onChange={e=>setUnitModel(e.target.value as UnitModel||undefined)}><option value="">Militärsymbol</option>{Object.entries(UNIT_MODELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>}
            {tool==='unit'&&!unitModel&&<select aria-label="Einheitssymbol für neue Elemente" value={unitCode} onChange={e=>setUnitCode(e.target.value as UnitCode)}>{Object.entries(UNIT_SYMBOLS).map(([k,v])=><option key={k} value={k}>{v.name}</option>)}</select>}
            {tool==='line'&&<select aria-label="Linienzeichen für neue Elemente" value={lineTactical??''} onChange={e=>setLineTactical(e.target.value as TacticalLine||undefined)}><option value="">Film-Linie</option>{Object.entries(TACTICAL_LINES).map(([k,v])=><option key={k} value={k}>{v.name}</option>)}</select>}
            {tool==='zone'&&<select aria-label="Flächenzeichen für neue Elemente" value={zoneTactical??''} onChange={e=>setZoneTactical(e.target.value as TacticalArea||undefined)}><option value="">Film-Raum</option>{Object.entries(TACTICAL_AREAS).map(([k,v])=><option key={k} value={k}>{v.name}</option>)}</select>}
            {tool==='marker'&&<select aria-label="Punktsymbol für neue Elemente" value={pointSymbol??''} onChange={e=>setPointSymbol(e.target.value as PointCode||undefined)}><option value="">Film-Ereignis</option>{Object.entries(POINT_SYMBOLS).map(([k,v])=><option key={k} value={k}>{v.name}</option>)}</select>}
            {tool === 'line' && !lineTactical && <div className="seg">{[['pl', 'Phasenlinie'], ['sperre', 'Sperre'], ['hindernis', 'Hindernis'], ['stellung', 'Stellung'], ['route', 'Route']].map(([k, l]) => <button key={k} className={lineKind === k ? 'on' : ''} onClick={() => setLineKind(k)}>{l}</button>)}</div>}
            {tool === 'zone' && !zoneTactical && <div className="seg">{[['kill', 'Feuerraum'], ['dismount', 'Absitzraum'], ['assembly', 'Bereitstellung'], ['objective', 'Ziel']].map(([k, l]) => <button key={k} className={zoneKind === k ? 'on' : ''} onClick={() => setZoneKind(k)}>{l}</button>)}</div>}
            <div className="grow" />
            <span className="dim">Tasten: V U M E P O T D Z L · Space Play · ←/→ ±1 s · K Kamera · Home Übersicht · ⌘Z</span>
          </div>}
          <Viewport unitCode={unitCode} lineTactical={lineTactical} zoneTactical={zoneTactical} pointSymbol={pointSymbol} exportMode={exportMode} cameraMount={cameraMount} side={side} lineKind={lineKind} zoneKind={zoneKind} unitModel={unitModel} />
        </div>
      </div>
      <TimelinePanel busy={false} exportMode={exportMode} />
      <ManeuverExchange open={exchangeOpen} onClose={()=>setExchangeOpen(false)} />
    </div>
  )
}
