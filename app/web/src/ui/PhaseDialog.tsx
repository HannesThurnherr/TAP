import { useEffect, useRef, useState } from 'react'
import type { Phase } from '../model/types'
import { putPhase } from '../model/phaseEdit'
import { useStore } from '../state/store'

export const phaseId = () => `phase-${crypto.randomUUID()}`
export function PhaseDialog({ phase, onClose }: { phase: Phase; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState(phase.title), [caption, setCaption] = useState(phase.caption ?? '')
  const [start, setStart] = useState(String(phase.start)), [end, setEnd] = useState(String(phase.end))
  const [error, setError] = useState('')
  const config = useStore(s => s.config)
  const existing = config.phases.some(p => p.id === phase.id)
  const overlaps = config.phases.filter(p => p.id !== phase.id && p.start < Number(end) && p.end > Number(start))
  useEffect(() => { dialog.current?.showModal() }, [])
  function save() {
    try {
      if (!start.trim() || !end.trim()) throw new Error('Start und Ende eingeben.')
      const st = useStore.getState()
      const phases = putPhase(st.config.phases, { ...phase, title, start: Number(start), end: Number(end), caption: caption.trim() || undefined }, st.config.duration, phaseId)
      st.commit(c => ({ ...c, phases })); onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Ungültige Phase') }
  }
  return <dialog ref={dialog} className="phase-dialog" aria-labelledby="phase-dialog-title" onCancel={e => { e.preventDefault(); onClose() }} onKeyDown={e => e.stopPropagation()}>
    <form onSubmit={e => { e.preventDefault(); save() }}>
      <h2 id="phase-dialog-title">{existing ? 'Phase bearbeiten' : 'Neue Phase'}</h2>
      <label>Name<input autoFocus required value={title} onChange={e => setTitle(e.target.value)} placeholder="z. B. Vorbereitung" /></label>
      <div className="phase-times"><label>Start (s)<input required type="number" min={0} max={config.duration} step="any" value={start} onChange={e => setStart(e.target.value)} /></label><label>Ende (s)<input required type="number" min={0} max={config.duration} step="any" value={end} onChange={e => setEnd(e.target.value)} /></label></div>
      <label>Untertitel (optional)<textarea rows={2} value={caption} onChange={e => setCaption(e.target.value)} placeholder="Kurze Erklärung der Phase" /></label>
      {overlaps.length > 0 && <p className="dim">Betroffen: {overlaps.map(p => p.title).join(', ')}. Diese Phasen werden beim Übernehmen gekürzt oder geteilt. Ihre übrigen Zeitabschnitte bleiben erhalten.</p>}
      <p className="dim">Elemente und Kamera-Shots behalten ihre Zeiten. Die automatische Kamerafolge lässt sich im Export-Schritt neu erzeugen.</p>
      {error && <p className="bad" role="alert">{error}</p>}
      <footer>{existing && <button type="button" className="danger" onClick={() => { useStore.getState().commit(c => ({ ...c, phases: c.phases.filter(p => p.id !== phase.id) })); onClose() }}>Phase löschen</button>}<span className="grow" /><button type="button" onClick={onClose}>Abbrechen</button><button className="primary" type="submit">Übernehmen</button></footer>
    </form>
  </dialog>
}
