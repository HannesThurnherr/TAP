import { CatmullRomCurve3, Vector3 } from 'three'
import type { Move, Mover, Unit, Pt, Config } from './types'
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
export const ease = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u) }
export function arrowTimes(m: Move, duration: number): [number, number] {
  const start = m.drawFrom ?? m.from ?? 0
  return [start, m.drawTo ?? start + (m.buildup ?? Math.min(8, Math.max(2, ((m.to ?? duration) - start) * 0.3)))]
}
export function arrowProgress(m: Move, t: number, duration: number): number {
  if (m.animation === 'static') return 1
  const [start, end] = arrowTimes(m, duration)
  if (m.animation === 'draw' && (m.drawFrom == null || m.drawTo == null)) return 1
  if (end <= start) return t >= start ? 1 : 0
  return ease((t - start) / (end - start))
}
export function interpolateKeys(keys: [number, number][], t: number): number {
  const sorted = keys.filter(k => k.every(Number.isFinite)).slice().sort((a, b) => a[0] - b[0])
  if (!sorted.length) return 0
  if (t < sorted[0][0]) return clamp01(sorted[0][1])
  for (let i = 1; i < sorted.length; i++) if (t < sorted[i][0]) {
    const [a, p] = sorted[i - 1], [b, q] = sorted[i]
    return clamp01(p + (q - p) * (t - a) / (b - a))
  }
  return clamp01(sorted.at(-1)![1])
}
export function moverKeys(m: Mover, fractions: number[], duration: number): [number, number][] {
  if (m.timing === 'range') return [[m.moveFrom === undefined ? m.keys[0]?.[0] ?? m.from ?? 0 : m.moveFrom ?? 0, 0], [m.moveTo === undefined ? m.keys.at(-1)?.[0] ?? duration : m.moveTo ?? duration, 1]]
  if (m.timing === 'progress' || (!m.timing && m.progress)) return m.progress ?? []
  return m.keys.map(([t, i]) => [t, fractions[Math.max(0, Math.min(fractions.length - 1, i))] ?? 0])
}
export function parseTime(text: string): number | null | undefined {
  const s = text.trim()
  if (!s || s.toLowerCase() === 'ende') return null
  const m = /^(\d+):([0-5]?\d(?:\.\d+)?)$/.exec(s)
  const n = m ? Number(m[1]) * 60 + Number(m[2]) : /^\d+(?:\.\d+)?$/.test(s) ? Number(s) : NaN
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export function unitPosition(unit: Unit, time: number): Pt {
  time=Math.min(time,unit.destroyed??Infinity)
  const keys = (unit.positionKeys ?? []).filter(k => Number.isFinite(k.time) && k.pos.every(Number.isFinite)).slice().sort((a,b) => a.time - b.time)
  if (!keys.length) return unit.pos
  if (time < keys[0].time) return keys[0].pos
  for (let i = 1; i < keys.length; i++) if (time < keys[i].time) {
    const a = keys[i-1], b = keys[i]; let u = (time-a.time)/(b.time-a.time)
    if (unit.interpolation === 'hold') u = 0
    if (unit.interpolation === 'ease') u = ease(u)
    if(unit.smooth && keys.length>2 && Math.hypot(b.pos[0]-a.pos[0],b.pos[1]-a.pos[1])>.001){
      const curve=new CatmullRomCurve3(keys.map(k=>new Vector3(k.pos[0],0,k.pos[1])),false,'catmullrom',.5)
      const p=curve.getPoint((i-1+u)/(keys.length-1));return [p.x,p.z]
    }
    return [a.pos[0]+(b.pos[0]-a.pos[0])*u, a.pos[1]+(b.pos[1]-a.pos[1])*u]
  }
  return keys.at(-1)!.pos
}
/** The trail and unit share one position evaluator, including the exact current endpoint. */
export function unitTrail(unit:Unit,time:number):Pt[] {
  time=Math.min(time,unit.destroyed??Infinity)
  const keys=[...(unit.positionKeys??[])].sort((a,b)=>a.time-b.time)
  if(!keys.length)return [unit.pos]
  const end=Math.min(keys.at(-1)!.time,Math.max(keys[0].time,time)),times=[keys[0].time]
  for(let k=1;k<keys.length;k++){
    const lo=keys[k-1].time,hi=Math.min(end,keys[k].time);if(hi<=lo)continue
    const count=unit.smooth?32:1
    for(let j=1;j<=count;j++)times.push(lo+(hi-lo)*j/count)
  }
  return times.map(t=>unitPosition(unit,t)).filter((p,i,ps)=>i===0||Math.hypot(p[0]-ps[i-1][0],p[1]-ps[i-1][1])>.001)
}
export function mortarState(time: number, from: number, to: number, flight: number) {
  const age = time - from, duration = Math.max(0.01, flight)
  return { visible: time >= from && time <= to, progress: clamp01(age / duration), flying: age >= 0 && age < duration, flash: age >= 0 ? 1-clamp01(age / 0.2) : 0 }
}

function pathFractions(points: Pt[]) { const l = [0]; for (let i = 1; i < points.length; i++) l.push(l[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])); return l.map(v => v / (l.at(-1) || 1)) }
/** position (LV95) and heading (radians, 0 = east, ccw) of a mover at time t */
export function moverPose(m: Mover, t: number, duration: number): { pos: Pt; heading: number } {
  const f = pathFractions(m.points)
  const keys = moverKeys(m, f, duration)
  const dead = m.destroyed ?? Infinity
  const u = interpolateKeys(keys, Math.min(t, dead))
  const curve = m.smooth !== false && m.points.length > 2 ? new CatmullRomCurve3(m.points.map(p => new Vector3(p[0], 0, p[1])), false, 'catmullrom', 0.5) : null
  const at = (v: number): Pt => {
    v = clamp01(v)
    if (curve) { const p = curve.getPointAt(v); return [p.x, p.z] }
    let i = 1; while (i < f.length - 1 && f[i] < v) i++
    const a = m.points[i - 1], b = m.points[i], s = (v - f[i - 1]) / (f[i] - f[i - 1] || 1)
    return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]
  }
  const p = at(u), q = at(Math.min(1, u + 0.01)), r = at(Math.max(0, u - 0.01))
  return { pos: p, heading: Math.atan2(q[1] - r[1], q[0] - r[0]) }
}
/** pose of a unit (position keys) or mover by id, for follow cameras and attached callouts */
export function elementPose(config: Config, id: string, t: number): { pos: Pt; heading: number } | null {
  const el = config.elements.find(e => e.id === id)
  if (!el) return null
  if (el.kind === 'mover') return moverPose(el, t, config.duration)
  if (el.kind === 'unit') { const a = unitPosition(el, t - 0.5), b = unitPosition(el, t + 0.5); const moving = Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.01; return { pos: unitPosition(el, t), heading: moving ? Math.atan2(b[1] - a[1], b[0] - a[0]) : NaN } }
  if ('pos' in el) return { pos: el.pos, heading: NaN }
  return null
}
