import type { Config, Element } from './types.ts'
import { elementWindow } from './types.ts'
import { arrowTimes, moverKeys } from './timing.ts'
export type TimingDrag = 'move' | 'start' | 'end'
export function timelineWindow(el: Element, duration: number): [number, number] {
  const [start,end] = elementWindow(el, {duration} as Config)
  if (el.kind !== 'mover') return [start,end]
  const keys = moverKeys(el,[],duration)
  return [Math.max(start, keys.length ? Math.min(...keys.map(k=>k[0])) : start),end]
}
/** Resize retimes the whole clip, preserving the relative positions of animation events. */
export function retimeElement(el: Element, duration: number, mode: TimingDrag, delta: number): Element {
  const [start,end] = timelineWindow(el,duration), span = end-start
  const minLength = Math.min(0.1,duration)
  let a=start,b=end
  if(mode==='move') { const d=Math.max(-start,Math.min(duration-end,delta)); a+=d; b+=d }
  else if(mode==='start') a=Math.max(0,Math.min(end-minLength,start+delta))
  else b=Math.min(duration,Math.max(start+minLength,end+delta))
  if(a===start && b===end) return el
  const scale=mode==='move'||span<=0 ? 1 : (b-a)/span
  const map=(t:number)=>Math.max(0, a+(t-start)*scale)
  const result: Element = {...el,from:a,to:b}
  if(result.kind==='unit') {result.positionKeys=result.positionKeys?.map(k=>({...k,time:map(k.time)}));if(result.destroyed!=null)result.destroyed=map(result.destroyed)}
  if(result.kind==='move') {
    const [f,t]=arrowTimes(result,duration)
    // Resolve legacy defaults against the original window before transforming.
    const [oldF,oldT]=arrowTimes(el as typeof result,duration)
    if(result.animation!=='static') { result.drawFrom=map(oldF); result.drawTo=map(oldT) }
    else { if(result.drawFrom!=null) result.drawFrom=map(f); if(result.drawTo!=null) result.drawTo=map(t) }
    if(result.buildup!=null) result.buildup*=scale
  }
  if(result.kind==='mover') {
    const original=el as typeof result
    const range=moverKeys({...original,timing:'range'},[],duration)
    result.moveFrom=map(range[0][0]); result.moveTo=map(range[1][0])
    result.keys=result.keys.map(([t,p])=>[map(t),p])
    result.progress=result.progress?.map(([t,p])=>[map(t),p])
    result.until=b
    if(result.destroyed!=null) result.destroyed=map(result.destroyed)
  }
  if(result.kind==='zone' && result.active!=null) result.active=map(result.active)
  if(result.kind==='mortar') result.flight=Math.max(0.01,(result.flight??1.2)*scale)
  return result
}
