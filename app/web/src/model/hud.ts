import type { Config, Caption, Phase } from './types'
import { fmt } from '../state/store'

export interface HudState { phase: Phase | null; captions: Caption[]; clock: string }
/** what the presentation and the export burn in at time t */
export function hudState(config: Config, t: number): HudState {
  const phase = config.phases.find(p => t >= p.start && t < p.end) ?? (t >= config.duration ? config.phases.at(-1) ?? null : null)
  const captions = (config.captions ?? []).filter(c => t >= c.start && t < c.end)
  if (phase?.caption && !captions.length) captions.push({ id: `phase-${phase.id}`, text: phase.caption, start: phase.start, end: phase.end })
  return { phase, captions, clock: fmt(Math.max(0, t), true) }
}
/** kinds/sides present in a time window, for the legend */
export function legendFor(config: Config, start: number, end: number) {
  const active = config.elements.filter(e => (e.from ?? 0) < end && (e.to ?? config.duration) > start)
  const sides = new Set(active.map(e => e.side).filter(Boolean))
  const kinds = new Set(active.map(e => e.kind === 'line' ? `line:${e.lineKind}` : e.kind === 'zone' ? `zone:${e.zoneKind}` : e.kind))
  return { sides: [...sides] as ('blue' | 'red' | 'neutral')[], kinds: [...kinds] }
}
