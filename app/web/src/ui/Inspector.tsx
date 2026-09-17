import {UNIT_MODELS} from '../model/types'
import {UnitSymbolEditor} from './UnitSymbolEditor'
import {TACTICAL_LINES,TACTICAL_AREAS,POINT_SYMBOLS,labels,AFFILIATION_STROKE,affiliationForSide} from '../symbology/catalog'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { useStore, fmt } from '../state/store'
import { KIND_LABEL, SIDE_COLOR, ZONE_COLOR, type Config, type Element, type Pt } from '../model/types'
import { parseConfig } from '../model/configImport'
import { arrowTimes, parseTime, unitPosition } from '../model/timing'

function Field({ title, children }: { title: string; children: ReactNode }) { return <div className="field"><span className="field-label">{title}</span>{children}</div> }
function Numeric({ title, value, onChange, fallback = 0, min = 0, max, step = 0.1, nullable = false, slider = false, sliderMin, sliderMax }: { title: string; value?: number | null; onChange(v: number | null): void; fallback?: number; min?: number; max?: number; step?: number; nullable?: boolean; slider?: boolean; sliderMin?: number; sliderMax?: number }) {
  const [txt, setTxt] = useState(value == null ? '' : String(value))
  const [error, setError] = useState(false)
  useEffect(() => { setTxt(value == null ? '' : String(value)); setError(false) }, [value])
  function commit() { const n = txt.trim() === '' ? nullable ? null : fallback : Number(txt); if (n !== null && (!Number.isFinite(n) || n < min || (max != null && n > max))) { setError(true); return } setError(false); if (n !== (value ?? null)) onChange(n) }
  return <Field title={title}><input aria-label={title} aria-invalid={error} type="number" min={min} max={max} step={step} value={txt} placeholder={String(fallback)} onChange={e => setTxt(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
    {slider && <input aria-label={`${title} Regler`} type="range" min={sliderMin ?? min} max={sliderMax ?? max} step={step} value={Number(txt || fallback)} onChange={e => setTxt(e.target.value)} onPointerUp={e => onChange(Number(e.currentTarget.value))} onKeyUp={e => onChange(Number(e.currentTarget.value))} />}
    {nullable && <button className="small" aria-label={`${title} zurücksetzen`} onClick={() => onChange(null)}>×</button>}
  </Field>
}
function TimeRow({ title, value, onChange, placeholder = 'Ende' }: { title: string; value?: number | null; onChange(v: number | null): void; placeholder?: string }) {
  const [txt, setTxt] = useState(value == null ? '' : fmt(value, true)); const [error, setError] = useState(false)
  useEffect(() => { setTxt(value == null ? '' : fmt(value, true)); setError(false) }, [value])
  const commit = () => { const n = parseTime(txt); if (n === undefined) { setError(true); return } setError(false); if (n !== (value ?? null)) onChange(n) }
  return <Field title={title}><input aria-label={title} aria-invalid={error} title={error ? 'Sekunden oder mm:ss eingeben' : 'Sekunden oder mm:ss'} className="mono" value={txt} placeholder={placeholder} onChange={e => setTxt(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} /><button className="small" aria-label={`${title} jetzt`} onClick={() => onChange(Math.round(useStore.getState().time * 10) / 10)}>jetzt</button><button className="small" aria-label={`${title} löschen`} onClick={() => onChange(null)}>×</button></Field>
}
const sides = { blue: 'Blau', red: 'Rot', neutral: 'Neutral', unknown:'Unbekannt' }
const movers = { team: 'Trupp', squad: 'Gruppe', platoon: 'Zug', bmp: 'SPz / BMP', ifv: 'IFV', piranha: 'Piranha', apc: 'APC', truck: 'LKW' }

export function Inspector() {
  const config = useStore(s => s.config), selected = useStore(s => s.selected)
  const el = config.elements.find(e => e.id === selected)
  return <div className="inspector">
    {el ? <Properties key={el.id} el={el} config={config} /> : <div className="empty">Element im Bild oder in der Timeline anklicken.<br /><span className="dim">U Einheit · M Bewegung · E Feuer · P Linie · O Sektor · T Mörser · D Ereignis · Z Raum · L Text</span></div>}
    <JsonPanel config={config} />
  </div>
}
function Properties({ el, config }: { el: Element; config: Config }) {
  const prefix = useId()
  const data = el as unknown as Record<string, any>
  const upd = (patch: Record<string, unknown>) => useStore.getState().updateElement(el.id, patch as Partial<Element>)
  const text = (key: string, title: string) => <Field title={title}><input aria-label={title} value={data[key] ?? ''} onChange={e => upd({ [key]: e.target.value })} /></Field>
  const check = (key: string, title: string, def = true) => <div className="field check-field"><input id={`${prefix}-${key}`} type="checkbox" checked={data[key] ?? def} onChange={e => upd({ [key]: e.target.checked })} /><label htmlFor={`${prefix}-${key}`}>{title}</label></div>
  const select = (key: string, title: string, options: Record<string, string>, fallback: string) => <Field title={title}><select aria-label={title} value={data[key] ?? fallback} onChange={e => upd({ [key]: e.target.value || undefined, ...(key==='side'&&el.kind==='unit'&&el.symbol?{symbol:{...el.symbol,affiliation:affiliationForSide(e.target.value)}}:{}) })}>{Object.entries(options).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></Field>
  const time = (key: string, title: string, placeholder?: string) => <TimeRow title={title} value={data[key]} placeholder={placeholder} onChange={v => upd({ [key]: v })} />
  const width = (fallback: number, title = 'Breite (m)') => <Numeric title={title} value={data.width} fallback={fallback} min={0.5} sliderMin={fallback * 0.25} sliderMax={fallback * 3} step={0.5} nullable slider onChange={v => upd({ width: v ?? undefined })} />
  const name = el.kind === 'callout' ? el.text : el.name
  return <>
    <div className="head"><span className="dot" style={{ background: SIDE_COLOR[el.side ?? 'neutral'] }} /><b>{name || KIND_LABEL[el.kind]}</b><span className="grow" /><button className="small danger" onClick={() => useStore.getState().removeElement(el.id)}>Löschen</button></div>
    <div className="sub">{KIND_LABEL[el.kind]} · {el.id}</div>
    {el.kind !== 'callout' && text('name', 'Bezeichnung')}
    {check('occlude', 'Hinter Gelände / Gebäuden verdecken')}
    {!(el.kind==='unit'&&el.symbol&&!el.model)&&!['callout', 'mortar'].includes(el.kind) && select('side', 'Seite', sides, 'neutral')}
    {((el.kind==='unit'&&el.symbol&&!el.model)||(el.kind==='line'&&el.tactical)||(el.kind==='zone'&&el.tactical)||(el.kind==='marker'&&el.symbol)||el.kind==='move')&&select('status','Darstellungsstatus',{active:'Aktiv / bestehend',planned:'Geplant'},'active')}
    {el.kind === 'unit' && <>
      {select('model','Darstellung',{'':'Militärsymbol',...UNIT_MODELS},'')}
      {!el.model&&<UnitSymbolEditor unit={el} onChange={upd}/>}
      {check('trail','Bewegungsspur',false)}{time('destroyed','Vernichtet um','Nie')}
      {!el.model&&!el.symbol&&<>
      {select('type', 'Typ', { infantry: 'Infanterie', mech: 'Mechanisiert', recon: 'Aufklärung', hq: 'Kommandoposten', support: 'Unterstützung', obstacle: 'Sperre' }, 'infantry')}
      {select('size', 'Grösse', { team: 'Trupp', squad: 'Gruppe', platoon: 'Zug', company: 'Kompanie' }, 'platoon')}</>}
      {check('footprint', 'Kreis auf dem Boden')}{check('roof', 'Auf Dach / erhöht', false)}
      <div className="sub">Positions-Keyframes</div>{check('smooth', 'Kurve durch Wegpunkte', false)}
      {select('interpolation', 'Übergang', { linear: 'Gleichmässig', ease: 'Sanft anfahren / anhalten', hold: 'Position halten / springen' }, 'linear')}
      <button className="small inset" onClick={() => { const st = useStore.getState(); st.setUnitKeyPlacement({ id: el.id, time: st.time }) }}>Ziel bei Playhead im Gelände setzen</button>
      <button className="small inset" onClick={() => { const t = useStore.getState().time; upd({ positionKeys: [...(el.positionKeys ?? []).filter(k => k.time !== t), { time: t, pos: unitPosition(el, t) }].sort((a,b) => a.time-b.time) }) }}>Aktuelle Position als Keyframe</button>
      <div className="dim small">Zeit wählen, Ziel im Gelände setzen. Gleiche Positionen erzeugen einen Halt. Vor / nach den Keys bleibt die Einheit am ersten / letzten Punkt.</div>
      {(el.positionKeys ?? []).map((key, i) => <div className="keyframe" key={i}>
        <TimeRow title={`Position Zeit ${i+1}`} value={key.time} onChange={v => upd({ positionKeys: el.positionKeys!.map((k,j) => j === i ? { ...k, time: v ?? 0 } : k) })} />
        {([0,1] as const).map(axis => <Numeric key={axis} title={`${axis === 0 ? 'Ost' : 'Nord'} Key ${i+1}`} value={key.pos[axis]} step={0.1} onChange={v => { if(v == null) return; const pos: Pt = [...key.pos]; pos[axis] = v; upd({ positionKeys: el.positionKeys!.map((k,j) => j === i ? {...k,pos} : k) }) }} />)}
        <button className="small" onClick={() => { useStore.getState().setTime(key.time); useStore.getState().setUnitKeyPlacement({ id: el.id, time: key.time }) }}>Ziel im Gelände ändern</button>
        <button className="small" onClick={() => upd({ positionKeys: el.positionKeys!.filter((_,j) => i !== j) })}>Keyframe entfernen</button>
      </div>)}

    </>}
    {el.kind === 'move' && <>
      <Field title="Pfeil folgt Einheit"><select aria-label="Pfeil folgt Einheit" value={el.followUnit??''} onChange={e=>upd({followUnit:e.target.value||null})}><option value="">Unabhängiger Pfeil</option>{config.elements.filter(e=>e.kind==='unit'&&(e.positionKeys?.length??0)>=2).map(e=><option key={e.id} value={e.id}>{e.name||e.id}</option>)}</select></Field>
      {el.followUnit&&<p className="dim">Weg, Pfeilspitze und Timing folgen den Positions-Keyframes der Einheit. Wegpunkte an der Einheit bearbeiten.</p>}

      {select('style', 'Stil', { solid: 'Durchgezogen', dashed: 'Geplant / gestrichelt' }, 'solid')}{width(24)}{!el.followUnit&&<>{check('smooth', 'Kurve durch Kontrollpunkte')}
      <div className="sub">Aufzeichnen</div>
      <Field title="Animation"><select aria-label="Pfeilanimation" value={el.animation ?? 'draw'} onChange={e => { const [start, end] = arrowTimes(el, config.duration); upd({ animation: e.target.value, drawFrom: start, drawTo: end }) }}><option value="static">Statisch – sofort vollständig</option><option value="draw">Zwischen zwei Zeiten aufzeichnen</option></select></Field>
      {(el.animation ?? 'draw') === 'draw' && <>
        <TimeRow title="Zeichnen ab" value={el.drawFrom ?? arrowTimes(el, config.duration)[0]} placeholder="Statisch" onChange={v => upd({ drawFrom: v, animation: v == null ? 'static' : 'draw', drawTo: el.drawTo ?? arrowTimes(el, config.duration)[1] })} />
        <TimeRow title="Fertig um" value={el.drawTo ?? arrowTimes(el, config.duration)[1]} placeholder="Statisch" onChange={v => upd({ drawTo: v, animation: v == null ? 'static' : 'draw', drawFrom: el.drawFrom ?? arrowTimes(el, config.duration)[0] })} />
        <div className="dim small">Der fertige Pfeil bleibt bis zum Ende seines Sichtbarkeitsfensters stehen.</div>
      </>}</>}
    </>}
    {el.kind === 'fire' && <>{select('fireKind', 'Feuerart', { fire: 'Feuer mit Leuchtspuren', suppress: 'Niederhalten ohne Leuchtspuren' }, 'fire')}{width(19)}{check('smooth', 'Kurve durch Kontrollpunkte')}</>}
    {el.kind === 'marker' && <>{select('symbol','Schweizer Punktsymbol',{'':'Filmsymbol',...labels(POINT_SYMBOLS)},'')}{el.symbol==='checkpoint'&&text('designation','Nummer / Kennung (max. 8 Zeichen)')}{!el.symbol&&select('markerKind', 'Ereignisart', { contact: 'Kontakt', breach: 'Durchbruch', casualty: 'Ausfall' }, 'contact')}</>}
    {el.kind === 'line' && <>
      {select('tactical','Schweizer Linienzeichen',{'':'Film / bisherige Linie',...labels(TACTICAL_LINES)},'')}
      {!el.tactical&&<>      {select('lineKind', 'Linienart', { pl: 'Phasenlinie', sperre: 'Sperre', hindernis: 'Hindernis', route: 'Nachschubroute', stellung: 'Stellung' }, 'pl')}</>}
      <Field title="Farbe"><input aria-label="Linienfarbe" type="color" value={el.color ?? (el.tactical?AFFILIATION_STROKE[affiliationForSide(el.side)]:'#ff4040')} onChange={e => upd({ color: e.target.value })} /></Field>
      {check('smooth', 'Kurve durch Kontrollpunkte')}
      {el.tactical&&<>{width(20,'Zeichengrösse (m)')}{check('flip','Zeichenseite umkehren',false)}</>}
      {!el.tactical&&el.lineKind === 'stellung' && check('flip', 'Bögen auf der anderen Seite', false)}
      {!el.tactical&&el.lineKind === 'sperre' && width(7.5)}{!el.tactical&&el.lineKind === 'hindernis' && width(6, 'Zahngrösse (m)')}
    </>}
    {el.kind === 'cone' && <Numeric title="Öffnungswinkel (°)" value={el.angle} fallback={60} min={10} max={180} step={2} slider onChange={v => upd({ angle: v ?? 60 })} />}
    {el.kind === 'mortar' && <>
      <Numeric title="Bogenhöhe × Strecke" value={el.height} fallback={0.7} min={0.1} max={2} step={0.05} slider onChange={v => upd({ height: v ?? 0.7 })} />
      <Numeric title="Flugzeit (s)" value={el.flight} fallback={1.2} min={0.01} sliderMin={0.3} sliderMax={4} step={0.1} slider onChange={v => upd({ flight: v ?? 1.2 })} />
    </>}
    {el.kind === 'zone' && <>
      {select('tactical','Schweizer Flächenzeichen',{'':'Film / bisheriger Raum',...labels(TACTICAL_AREAS)},'')}
      {!el.tactical&&<>      {select('zoneKind', 'Raumart', { kill: 'Feuerraum', objective: 'Ziel', assembly: 'Bereitstellung', dismount: 'Absitzraum', support: 'Unterstützung' }, 'kill')}</>}
      <Field title="Eigene Farbe"><input aria-label="Raumfarbe" type="color" value={el.color ?? (el.tactical?AFFILIATION_STROKE[affiliationForSide(el.side)]:ZONE_COLOR[el.zoneKind])} onChange={e => upd({ color: e.target.value })} /><button className="small" onClick={() => upd({ color: undefined })}>Standard</button></Field>
      {!el.tactical&&time('active', 'Auslösen um', 'Nie')}
    </>}
    {el.kind === 'mover' && <>
      <p className="dim">Einheit aus einem älteren Projekt. Ihre bisherigen Weg- und Zeitangaben bleiben erhalten. Neue Fahrzeuge werden über Einheit (U) erstellt.</p>
      {select('moverKind', 'Fahrzeug / Trupp', movers, 'team')}{check('smooth', 'Kurve durch Kontrollpunkte')}{check('trail', 'Gepunktete Bewegungsspur')}
      <div className="sub">Bewegungszeiten</div>
      {select('timing', 'Zeitsteuerung', { range: 'Abfahrt / Ankunft', keys: 'Wegpunktzeiten', progress: 'Fortschrittszeiten / Halte' }, el.progress ? 'progress' : 'keys')}
      {el.timing === 'range' ? <>
        <TimeRow title="Fahrt ab" value={el.moveFrom === undefined ? el.keys[0]?.[0] : el.moveFrom} placeholder="00:00" onChange={v => upd({ moveFrom: v })} />
        <TimeRow title="Ankunft um" value={el.moveTo === undefined ? el.keys.at(-1)?.[0] : el.moveTo} onChange={v => upd({ moveTo: v })} />
      </> : (el.timing === 'progress' || (!el.timing && el.progress)) ? <>
        {(el.progress ?? []).map(([t, p], i) => <div className="keyframe" key={i}>
          <TimeRow title={`Zeit ${i + 1}`} value={t} onChange={v => upd({ progress: el.progress!.map((k, j) => j === i ? [v ?? 0, k[1]] : k) })} />
          <Numeric title={`Fortschritt ${i + 1} (%)`} value={p * 100} min={0} max={100} step={1} onChange={v => upd({ progress: el.progress!.map((k, j) => j === i ? [k[0], (v ?? 0) / 100] : k) })} />
          <button className="small" onClick={() => upd({ progress: el.progress!.filter((_, j) => j !== i) })}>Zeitpunkt entfernen</button>
        </div>)}<button className="small inset" onClick={() => upd({ progress: [...(el.progress ?? []), [useStore.getState().time, el.progress?.at(-1)?.[1] ?? 0]] })}>+ Fortschrittszeit</button>
      </> : <>
        {el.keys.map(([t, vi], i) => <div className="keyframe" key={i}>
          <TimeRow title={`Ankunft ${i + 1}`} value={t} onChange={v => upd({ keys: el.keys.map((k, j) => j === i ? [v ?? 0, k[1]] : k) })} />
          <Field title="Wegpunkt"><select aria-label={`Wegpunkt ${i + 1}`} value={vi} onChange={e => upd({ keys: el.keys.map((k, j) => j === i ? [k[0], Number(e.target.value)] : k) })}>{el.points.map((_, n) => <option key={n} value={n}>{n + 1}</option>)}</select><button className="small" onClick={() => upd({ keys: el.keys.filter((_, j) => j !== i) })}>×</button></Field>
        </div>)}<button className="small inset" onClick={() => upd({ keys: [...el.keys, [useStore.getState().time, Math.min(el.points.length - 1, (el.keys.at(-1)?.[1] ?? -1) + 1)]] })}>+ Wegpunktzeit</button>
      </>}
      {time('destroyed', 'Vernichtet um', 'Nie')}
    </>}
    {el.kind === 'callout' && <>
      {text('text', 'Text')}{text('sub', 'Zweite Zeile')}{select('color', 'Textfarbe', { amber: 'Amber', blue: 'Blau', red: 'Rot', white: 'Weiss' }, 'amber')}
      <div className="field check-field"><input id={`${prefix}-follow`} type="checkbox" checked={el.follow !== false} onChange={e => {
        const label = [...document.querySelectorAll<HTMLElement>('[data-element-id]')].find(n => n.dataset.elementId === el.id)
        const box = label?.querySelector('.box')?.getBoundingClientRect(), view = document.querySelector('.viewport')?.getBoundingClientRect()
        upd({ follow: e.target.checked, screenPos: box && view ? [(box.left - view.left) / view.width, (box.top - view.top) / view.height] : el.screenPos ?? [0.7, 0.25] })
      }} /><label htmlFor={`${prefix}-follow`}>Textkasten folgt dem Anker</label></div>
      {check('roof', 'Anker auf Dach / erhöht', false)}
      <Field title="Anker folgt"><select aria-label="Anker folgt" value={el.attachTo ?? ''} onChange={e => upd({ attachTo: e.target.value || null })}><option value="">Fester Geländepunkt</option>{config.elements.filter(x => x.kind === 'unit' || x.kind === 'mover').map(x => <option key={x.id} value={x.id}>{x.name || x.id}</option>)}</select></Field>
      {el.follow !== false ? <>{([0, 1] as const).map(i => <Numeric key={i} title={`Textversatz ${i === 0 ? 'X' : 'Y'} (px)`} value={(el.offset ?? [140, -90])[i]} min={-4000} max={4000} step={1} onChange={v => { const offset: Pt = [...(el.offset ?? [140, -90])]; offset[i] = v ?? 0; upd({ offset }) }} />)}</> : <>{([0, 1] as const).map(i => <Numeric key={i} title={`Bildposition ${i === 0 ? 'X' : 'Y'} (%)`} value={(el.screenPos ?? [0.7, 0.25])[i] * 100} min={0} max={100} step={1} onChange={v => { const screenPos: Pt = [...(el.screenPos ?? [0.7, 0.25])]; screenPos[i] = (v ?? 0) / 100; upd({ screenPos }) }} />)}</>}
    </>}
    <div className="sub">{el.kind === 'mortar' ? 'Abschuss und Flugbahn' : 'Sichtbarkeit'}</div>
    {time('from', el.kind === 'mortar' ? 'Abschuss um' : 'Sichtbar ab', '00:00')}
    {time(el.kind === 'mover' ? 'until' : 'to', el.kind === 'mortar' ? 'Flugbahn bis' : 'Sichtbar bis')}
    {!(el.kind==='move'&&el.followUnit)&&<details className="coordinates"><summary>Positionen / Kontrollpunkte (LV95)</summary>
      {('points' in el ? el.points : [el.pos]).map((p, i) => <div key={i}><div className="sub">Punkt {i + 1}</div>{([0, 1] as const).map(axis => <Numeric key={axis} title={`${axis === 0 ? 'Ost' : 'Nord'} ${i + 1}`} value={p[axis]} min={0} step={0.1} onChange={v => { if (v == null) return; const point: Pt = [...p]; point[axis] = v; upd('points' in el ? { points: el.points.map((q, j) => j === i ? point : q) } : { pos: point }) }} />)}</div>)}
    </details>}
  </>
}
const CAMERA_TEMPLATE = (c: Config) => JSON.stringify({
  duration: c.duration,
  phases: c.phases.length ? c.phases : [{ id: 'p1', title: '1 · LAGE', start: 0, end: c.duration }],
  shots: c.shots.length ? c.shots : [
    { id: 'A', kind: 'orbit', start: 0, end: Math.min(20, c.duration), center: [c.area.E0, c.area.N0], radius: 320, alt: 200, a0: -10, a1: 50 },
    { id: 'B', kind: 'static', start: Math.min(20, c.duration), end: c.duration, pos: [-250, -300, 190], look: [c.area.E0, c.area.N0] },
  ],
  captions: c.captions?.length ? c.captions : [{ id: 'c1', text: 'Lage', sub: 'Beispiel-Untertitel', start: 0, end: 6 }],
}, null, 1)

/** JSON view: the whole maneuver, or only the film part (duration, phases, shots, captions) */
function JsonPanel({ config }: { config: Config }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'all' | 'film'>('all')
  const [txt, setTxt] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const film = (c: Config) => ({ duration: c.duration, phases: c.phases, shots: c.shots, captions: c.captions ?? [] })
  useEffect(() => { if (open) setTxt(JSON.stringify(mode === 'all' ? config : film(config), null, 1)) }, [config, open, mode])
  const apply = () => {
    let merged = txt
    if (mode === 'film') { try { const part = JSON.parse(txt); merged = JSON.stringify({ ...config, ...part }) } catch { setErr('Ungültiges JSON'); return } }
    const result = parseConfig(merged, config.area)
    if (result.config) { useStore.getState().replaceConfig(result.config); setErr(null) } else setErr(result.errors.join(' · '))
  }
  return (
    <div className="json">
      <div className="sec" onClick={() => setOpen(!open)}><span>JSON</span><span className={err ? 'bad' : 'ok'}>{err ? 'Fehler' : 'gültig'}</span></div>
      {open && <>
        <div className="row"><div className="seg"><button className={mode === 'all' ? 'on' : ''} onClick={() => setMode('all')}>Ganzes Manöver</button><button className={mode === 'film' ? 'on' : ''} onClick={() => setMode('film')}>Kamera & Text</button></div>{mode === 'film' && <button className="small" title="Beispiel mit Orbit, fester Ansicht und Untertitel einsetzen" onClick={() => setTxt(CAMERA_TEMPLATE(config))}>Vorlage</button>}</div>
        {mode === 'film' && <div className="dim small">Shots: orbit · dolly · static (pos = lokale Meter [Ost, Nord, Höhe]) · follow (target = Element-ID, distance/height/lookAhead). Untertitel: captions[] mit text, sub, start, end, position.</div>}
        <textarea className="mono" value={txt} onChange={e => setTxt(e.target.value)} spellCheck={false} />
        <div className="row"><button className="primary small" onClick={apply}>Übernehmen</button><button className="small" onClick={() => { navigator.clipboard.writeText(txt) }}>Kopieren</button>{err && <span className="bad small">{err}</span>}</div>
      </>}
    </div>
  )
}
