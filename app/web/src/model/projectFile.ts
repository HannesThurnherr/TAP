import { parseConfig } from './configImport.ts'
import type { Config } from './types'
import type { AreaSource } from '../services/areaLoader'

export interface ProjectFile {
  format: 'tap-project'; version: 1; config: Config
  terrain: { source: AreaSource; rectangle: {cx:number;cy:number;w:number;h:number}|null; rotation:number }
  view: { groundMode: 'fui'|'map'|'sat'; mapDetail:'auto'|'overview'|'detail' }
}
export function parseProject(text: string): ProjectFile {
  const p = JSON.parse(text.replace(/^\uFEFF/,''))
  if (p?.format !== 'tap-project' || p.version !== 1) throw new Error('Bitte eine TAP-Projektdatei öffnen. LLM-Manöver-JSON wird über „Manöver aus Text / LLM“ importiert.')
  if (!['elements','phases','shots'].every(k=>Array.isArray(p.config?.[k]))) throw new Error('Projekt enthält keine vollständige Manöverkonfiguration.')
  const a=p.config?.area
  if (!a || typeof a.id!=='string' || typeof a.name!=='string' || !Number.isFinite(a.E0) || !Number.isFinite(a.N0)) throw new Error('Gebietskoordinaten fehlen oder sind ungültig.')
  const result=parseConfig(JSON.stringify(p.config),a,{projectFile:true})
  if (!result.config) throw new Error(result.errors.join(' · '))
  const t=p.terrain, s=t?.source
  if (s?.kind==='swisstopo') {
    const b=s.bounds
    if (!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||b[0]>=b[2]||b[1]>=b[3]||Math.max(b[2]-b[0],b[3]-b[1])>100000||typeof s.name!=='string'||typeof s.buildings!=='boolean') throw new Error('Ungültiger Geländeausschnitt (max. 100 km).')
    if (s.mode!==undefined&&!['auto','map','terrain'].includes(s.mode)) throw new Error('Ungültiger Geländemodus.')
    if (Math.abs(a.E0-(b[0]+b[2])/2)>1 || Math.abs(a.N0-(b[1]+b[3])/2)>1) throw new Error('Geländeausschnitt und Szenenursprung passen nicht zusammen.')
  } else if(s?.kind!=='aeuli' || Math.abs(a.E0-2742528.273215847)>1 || Math.abs(a.N0-1219500.1708584253)>1) throw new Error('Unbekanntes Gelände oder falscher Äuli-Ursprung.')
  if (!Number.isFinite(t.rotation)) throw new Error('Ungültige Gebietsdrehung.')
  if(t.rectangle!==null && (!t.rectangle || !['cx','cy','w','h'].every(k=>Number.isFinite(t.rectangle[k])) || t.rectangle.w<=0 || t.rectangle.h<=0)) throw new Error('Ungültiges Auswahlrechteck.')
  if (!['fui','map','sat'].includes(p.view?.groundMode)||!['auto','overview','detail'].includes(p.view?.mapDetail)) throw new Error('Ungültige Bodenansicht.')
  return {format:'tap-project',version:1,config:p.config,terrain:t,view:p.view}
}
