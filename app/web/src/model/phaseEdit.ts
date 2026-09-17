import type { Phase } from './types'

/** Insert/edit a phase without ambiguous overlapping active titles. Preserve uncovered pieces. */
export function putPhase(phases: Phase[], phase: Phase, duration: number, newId: () => string): Phase[] {
  if (!phase.title.trim() || !Number.isFinite(phase.start) || !Number.isFinite(phase.end) || phase.start < 0 || phase.end > duration || phase.end <= phase.start) throw new Error('Name und gültiges Zeitfenster innerhalb der Manöverdauer erforderlich.')
  const result: Phase[] = []
  for (const p of phases) {
    if (p.id === phase.id) continue
    if (p.end <= phase.start || p.start >= phase.end) { result.push(p); continue }
    if (p.start < phase.start) result.push({ ...p, end: phase.start })
    if (p.end > phase.end) result.push({ ...p, id: p.start < phase.start ? newId() : p.id, start: phase.end })
  }
  return [...result, { ...phase, title: phase.title.trim() }].sort((a, b) => a.start - b.start)
}
