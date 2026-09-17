import { useState } from 'react'
import { useStore, fmt } from '../state/store'
import { startExport, cancelExport } from '../scene/exportJob'
import { getCurrentPackage } from '../services/areaLoader'

type Preset = 'praesentation' | 'whatsapp' | 'erweitert'
const PRESETS: Record<Preset, { label: string; hint: string; width: number; height: number; fps: number; bitrate: number }> = {
  praesentation: { label: 'Präsentation', hint: 'PowerPoint / Keynote · 1080p 25 fps', width: 1920, height: 1080, fps: 25, bitrate: 12_000_000 },
  whatsapp: { label: 'WhatsApp', hint: '720p 25 fps · klein', width: 1280, height: 720, fps: 25, bitrate: 2_500_000 },
  erweitert: { label: 'Erweitert', hint: 'eigene Werte', width: 1920, height: 1080, fps: 25, bitrate: 12_000_000 },
}

/** Step 3 · Export: the video settings and the background job list, shown under the camera panel. */
export function ExportPanel() {
  const config = useStore(s => s.config)
  const jobs = useStore(s => s.exportJobs)
  const time = useStore(s => s.time)
  const groundMode = useStore(s => s.groundMode)
  const [preset, setPresetState] = useState<Preset>('praesentation')
  const [height, setHeight] = useState(1080), [fps, setFps] = useState(25), [bitrate, setBitrate] = useState(12)
  const [range, setRange] = useState<'all' | 'phase' | 'test'>('all')
  const [phaseId, setPhaseId] = useState(config.phases[0]?.id ?? '')
  const [title, setTitle] = useState(true), [clock, setClock] = useState(true), [captions, setCaptions] = useState(true), [legend, setLegend] = useState(false), [stand, setStand] = useState(true)
  const [card, setCard] = useState(false), [ort, setOrt] = useState(config.area.name), [verband, setVerband] = useState(''), [ereignis, setEreignis] = useState('')
  const setPreset = (k: Preset) => { setPresetState(k); if (k !== 'erweitert') { setHeight(PRESETS[k].height); setFps(PRESETS[k].fps); setBitrate(PRESETS[k].bitrate / 1e6) } }

  const phase = config.phases.find(p => p.id === phaseId) ?? config.phases[0]
  const start = range === 'phase' && phase ? phase.start : range === 'test' ? Math.min(time, Math.max(0, config.duration - 3)) : 0
  const end = range === 'phase' && phase ? phase.end : range === 'test' ? Math.min(config.duration, start + 3) : config.duration
  const width = Math.round(height * 16 / 9 / 2) * 2
  const lead = card ? 4 : 0
  const frames = Math.ceil((end - start + lead) * fps)
  const sizeMb = ((end - start + lead) * bitrate * 1e6 / 8) / 1048576
  const noShots = config.shots.length === 0
  const unplaced = config.elements.filter(e => !('pos' in e) && !('points' in e)).length
  const pkg = getCurrentPackage()

  function run() {
    const name = `${config.area.name.replace(/[^\p{L}\p{N}]+/gu, '-')}_${range === 'phase' && phase ? phase.title.replace(/[^\p{L}\p{N}]+/gu, '-') : 'manoever'}_${height}p.mp4`
    startExport({ name, config, start, end, width, height, fps, bitrate: bitrate * 1e6, hud: { title, clock, captions, legend, stand, titleCard: card ? { seconds: 4, ort, verband, ereignis: ereignis || config.area.name } : null } })
  }

  return (
    <section className="export-panel" aria-label="Video exportieren" onKeyDown={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerMove={e => e.stopPropagation()}>
      <header><b>Video exportieren</b><span className="dim small">{fmt(config.duration)} · {config.shots.length} Shots</span></header>
      <div className="lbl">Voreinstellung</div>
      <div className="seg wrap">{(Object.keys(PRESETS) as Preset[]).map(k => <button key={k} className={preset === k ? 'on' : ''} onClick={() => setPreset(k)} title={PRESETS[k].hint}>{PRESETS[k].label}</button>)}</div>
      <div className="dim small">{PRESETS[preset].hint}</div>
      {preset === 'erweitert' && <div className="row3">
        <label>Höhe<select value={height} onChange={e => setHeight(Number(e.target.value))}><option value={720}>720p</option><option value={1080}>1080p</option><option value={1440}>1440p</option><option value={2160}>4K</option></select></label>
        <label>fps<select value={fps} onChange={e => setFps(Number(e.target.value))}><option value={24}>24</option><option value={25}>25</option><option value={30}>30</option><option value={60}>60</option></select></label>
        <label>Mbit/s<input type="number" min={1} max={80} value={bitrate} onChange={e => setBitrate(Number(e.target.value))} /></label>
      </div>}
      <div className="lbl">Bereich</div>
      <div className="seg wrap"><button className={range === 'all' ? 'on' : ''} onClick={() => setRange('all')}>Ganzes Manöver</button><button className={range === 'phase' ? 'on' : ''} onClick={() => setRange('phase')}>Phase …</button><button className={range === 'test' ? 'on' : ''} onClick={() => setRange('test')}>3 s ab Playhead</button></div>
      {range === 'phase' && <select value={phase?.id ?? ''} onChange={e => setPhaseId(e.target.value)}>{config.phases.map(p => <option key={p.id} value={p.id}>{p.title} · {fmt(p.start)}–{fmt(p.end)}</option>)}</select>}
      <div className="lbl">Einblendungen</div>
      <div className="checks">
        <label><input type="checkbox" checked={title} onChange={e => setTitle(e.target.checked)} /> Phasentitel</label>
        <label><input type="checkbox" checked={clock} onChange={e => setClock(e.target.checked)} /> Uhr</label>
        <label><input type="checkbox" checked={captions} onChange={e => setCaptions(e.target.checked)} /> Untertitel</label>
        <label><input type="checkbox" checked={legend} onChange={e => setLegend(e.target.checked)} /> Legende</label>
        <label><input type="checkbox" checked={stand} onChange={e => setStand(e.target.checked)} /> Stand-Zeile</label>
      </div>
      <div className="lbl"><label><input type="checkbox" checked={card} onChange={e => setCard(e.target.checked)} /> Titelkarte (4 s)</label></div>
      {card && <div className="row3"><input placeholder="Ort" value={ort} onChange={e => setOrt(e.target.value)} /><input placeholder="Verband" value={verband} onChange={e => setVerband(e.target.value)} /><input placeholder="Ereignis" value={ereignis} onChange={e => setEreignis(e.target.value)} /></div>}
      <div className="lbl">Ausgabe</div>
      <div className="est">
        <div>{width} × {height} · {fps} fps · H.264 MP4</div>
        <div>{frames.toLocaleString('de-CH')} Bilder · {fmt(end - start + lead)}{card ? ' inkl. Titelkarte' : ''} · ca. {sizeMb < 1 ? '<1' : Math.round(sizeMb)} MB</div>
        <div>Bodenbild: {groundMode === 'fui' ? 'Geländebild' : groundMode === 'map' ? 'Landeskarte' : 'Luftbild'} (wie im Bild eingestellt)</div>
      </div>
      <ul className="preflight">
        {!pkg && <li className="bad">Kein Gelände geladen</li>}
        {noShots && <li className="warn">Keine Kamera-Shots: die Übersicht des Gebiets wird gezeigt. Oben lassen sich Shots automatisch erzeugen.</li>}
        {unplaced > 0 && <li className="warn">{unplaced} Elemente ohne Position werden ausgelassen</li>}
        {config.elements.length === 0 && <li className="warn">Keine Elemente im Manöver</li>}
        {!noShots && config.elements.length > 0 && <li className="ok">Bereit</li>}
      </ul>
      <button className="primary big" disabled={!pkg} onClick={run}>Export starten</button>
      <div className="dim small">Rendert im Hintergrund, Bild für Bild. Sie können derweil weiterarbeiten; der Fortschritt steht oben in der Leiste.</div>
      {jobs.length > 0 && <div className="jobs">
        <div className="lbl">Exporte</div>
        {jobs.map(j => <div key={j.id} className={`job ${j.status}`}>
          <div className="job-name">{j.name}</div>
          <div className="job-bar"><div style={{ width: `${Math.round(j.progress * 100)}%` }} /></div>
          <div className="job-msg dim small">{j.message}</div>
          <div className="job-actions">
            {j.status === 'running' && <button className="small" onClick={() => cancelExport(j.id)}>Abbrechen</button>}
            {j.status === 'done' && j.url && <a className="btn small" href={j.url} download={j.name}>Herunterladen</a>}
            {j.status !== 'running' && <button className="small" onClick={() => { if (j.url) URL.revokeObjectURL(j.url); useStore.getState().removeJob(j.id) }}>✕</button>}
          </div>
        </div>)}
      </div>}
    </section>
  )
}

/** progress chip in the top bar; leads to step 3 where the jobs are listed */
export function ExportChip() {
  const jobs = useStore(s => s.exportJobs)
  const screen = useStore(s => s.screen)
  const running = jobs.filter(j => j.status === 'running')
  const done = jobs.filter(j => j.status === 'done')
  if (!running.length && !done.length) return null
  return <button className={`chip export-chip ${running.length ? 'on' : ''}`} title="Zu Schritt 3 · Export" onClick={() => { if (screen !== 'export') useStore.getState().setScreen('export') }}>
    {running.length ? `Export ${Math.round(running[0].progress * 100)} %` : `${done.length} Export${done.length > 1 ? 'e' : ''} bereit`}
  </button>
}
