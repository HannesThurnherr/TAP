import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { Timeline } from './Timeline'

export function TimelinePanel({ busy, exportMode }: { busy: boolean; exportMode: boolean }) {
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointer: number; y: number; height: number } | null>(null)
  const [heights, setHeights] = useState({ editor: 220, export: 64 })
  const [maximum, setMaximum] = useState(600)
  const [resizing, setResizing] = useState(false)
  const config = useStore(s => s.config)
  const mode = exportMode ? 'export' : 'editor'
  const minimum = 64
  const height = Math.max(minimum, Math.min(maximum, heights[mode]))
  const resize = (value: number) => setHeights(previous => ({ ...previous, [mode]: Math.round(Math.max(minimum, Math.min(maximum, value))) }))
  useEffect(() => {
    const editor = panel.current!.parentElement!
    const measure = () => setMaximum(Math.max(minimum, editor.clientHeight - (editor.querySelector('.topbar')?.getBoundingClientRect().height ?? 44) - 28 - 180))
    const observer = new ResizeObserver(measure)
    observer.observe(editor); measure()
    return () => observer.disconnect()
  }, [])
  const finish = () => { drag.current = null; setResizing(false) }
  return <div ref={panel} className={`timeline-panel${resizing ? ' resizing' : ''}`}>
    <div className="tl-head" role="separator" aria-label="Timeline-Höhe" aria-orientation="horizontal" aria-controls="timeline-content" aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={height} aria-valuetext={`${height} Pixel`} aria-disabled={busy} tabIndex={busy ? -1 : 0}
      title="Ziehen zum Vergrößern / Verkleinern · Pfeiltasten ↑ ↓"
      onPointerDown={event => {
        if (busy || event.button !== 0 || !event.isPrimary) return
        event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { pointer: event.pointerId, y: event.clientY, height }; setResizing(true)
      }}
      onPointerMove={event => { const start = drag.current; if (start && start.pointer === event.pointerId) resize(start.height + start.y - event.clientY) }}
      onPointerUp={event => { if (drag.current?.pointer !== event.pointerId) return; finish(); event.currentTarget.releasePointerCapture(event.pointerId) }}
      onPointerCancel={finish} onLostPointerCapture={finish}
      onKeyDown={event => {
        event.stopPropagation()
        if (busy) return
        const step = event.shiftKey ? 50 : 20
        if (event.key === 'ArrowUp') { event.preventDefault(); resize(height + step) }
        if (event.key === 'ArrowDown') { event.preventDefault(); resize(height - step) }
        if (event.key === 'Home') { event.preventDefault(); resize(minimum) }
        if (event.key === 'End') { event.preventDefault(); resize(maximum) }
      }}>
      <span>Timeline</span><span className="tl-grip" aria-hidden="true" /><span className="dim">{config.elements.length} Elemente · {config.phases.length} Phasen · {config.shots.length} Shots</span>
    </div>
    <div id="timeline-content" className="timeline-wrap" style={{ height }} inert={busy}><Timeline /></div>
  </div>
}
