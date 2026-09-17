import type {UnitSymbol, SymbolStatus, TacticalLine, TacticalArea, PointCode} from '../symbology/catalog'
// Manöver config, prototype v0.
// Coordinates: LV95 (EPSG:2056) metres [E, N]. Heights are never authored (derived from terrain / roofs).
// Times: scenario seconds on one clock. `from`/`to` null or undefined = open.

export type Pt = [number, number]
export type Side = 'blue' | 'red' | 'neutral' | 'unknown'

export interface Area {
  bounds?: [number,number,number,number] // LV95 west,south,east,north
  mode?: 'auto'|'map'|'terrain'
  id: string
  name: string
  E0: number // LV95 easting of the area centre
  N0: number // LV95 northing of the area centre
  heading?: number // rotation of the selected rectangle in degrees (0 = north-up); framing follows it, the terrain grid stays north-up
}

export interface Phase { id: string; title: string; start: number; end: number; caption?: string }

interface Base { status?: SymbolStatus; occlude?: boolean; id: string; name?: string; side?: Side; from?: number | null; to?: number | null }

export interface PositionKey { time: number; pos: Pt }
export const UNIT_MODELS = {bmp:"SPz / BMP",ifv:"IFV",apc:"APC",piranha:"Piranha",truck:"LKW",team:"Trupp",squad:"Gruppe",platoon:"Zug"} as const
export type UnitModel = keyof typeof UNIT_MODELS
export interface Unit extends Base { model?: UnitModel; trail?: boolean; destroyed?: number | null; symbol?: UnitSymbol; smooth?: boolean; positionKeys?: PositionKey[]; interpolation?: 'linear' | 'ease' | 'hold'; kind: 'unit'; pos: Pt; type: 'infantry' | 'mech' | 'recon' | 'hq' | 'support' | 'obstacle'; size: 'team' | 'squad' | 'platoon' | 'company'; roof?: boolean; footprint?: boolean }
export interface Move extends Base { followUnit?: string | null; kind: 'move'; points: Pt[]; smooth?: boolean; animation?: 'static' | 'draw'; drawFrom?: number | null; drawTo?: number | null; style?: 'solid' | 'dashed'; width?: number; buildup?: number }
export interface Zone extends Base { tactical?: TacticalArea; kind: 'zone'; color?: string; points: Pt[]; zoneKind: 'kill' | 'objective' | 'assembly' | 'dismount' | 'support'; active?: number | null }
export interface Line extends Base { tactical?: TacticalLine; kind: 'line'; smooth?: boolean; width?: number; points: Pt[]; lineKind: 'pl' | 'sperre' | 'hindernis' | 'stellung' | 'route'; color?: string; flip?: boolean }
export interface Mover extends Base { kind: 'mover'; smooth?: boolean; timing?: 'range' | 'keys' | 'progress'; moveFrom?: number | null; moveTo?: number | null; until?: number | null; progress?: [number, number][]; points: Pt[]; moverKind: 'bmp' | 'ifv' | 'apc' | 'piranha' | 'truck' | 'team' | 'squad' | 'platoon'; keys: [number, number][]; destroyed?: number | null; trail?: boolean }
export interface Fire extends Base { kind: 'fire'; fireKind?: 'fire' | 'suppress'; smooth?: boolean; points: Pt[]; width?: number }
export interface Callout extends Base { kind: 'callout'; follow?: boolean; screenPos?: Pt; attachTo?: string | null; roof?: boolean; pos: Pt; text: string; sub?: string; color?: 'amber' | 'blue' | 'red' | 'white'; offset?: [number, number] }

export interface Cone extends Base { kind: 'cone'; points: [Pt, Pt]; angle?: number }
export interface Mortar extends Base { kind: 'mortar'; points: [Pt, Pt]; height?: number; flight?: number }
export interface Marker extends Base { designation?: string; symbol?: PointCode; kind: 'marker'; markerKind: 'contact' | 'breach' | 'casualty'; pos: Pt }

export type Element = Unit | Move | Zone | Line | Mover | Fire | Callout | Cone | Mortar | Marker
export type Kind = Element['kind']

export interface ShotOrbit { id: string; kind: 'orbit'; start: number; end: number; center: Pt; radius: number; alt: number; a0: number; a1: number }
export interface ShotDolly { id: string; kind: 'dolly'; start: number; end: number; p0: [number, number, number]; p1: [number, number, number]; look0: Pt; look1: Pt }
/** fixed camera: position in local metres [east, north, height above Z0], looking at an LV95 point */
export interface ShotStatic { id: string; kind: 'static'; start: number; end: number; pos: [number, number, number]; look: Pt }
/** rear-follow camera behind a unit or mover: distance behind (m), height above it (m), look-ahead (m) */
export interface ShotFollow { id: string; kind: 'follow'; start: number; end: number; target: string; distance?: number; height?: number; lookAhead?: number; bearing?: number }
export type Shot = ShotOrbit | ShotDolly | ShotStatic | ShotFollow
export const SHOT_LABEL: Record<Shot['kind'], string> = { orbit: 'Orbit', dolly: 'Fahrt', static: 'Fest', follow: 'Verfolgen' }

/** subtitle / scene description shown bottom-centre (or top) during [start, end] */
export interface Caption { id: string; text: string; sub?: string; start: number; end: number; position?: 'bottom' | 'top' }

export interface Config {
  notes?: string[]
  version: 0
  area: Area
  duration: number
  phases: Phase[]
  elements: Element[]
  shots: Shot[]
  captions?: Caption[]
}

export const SIDE_COLOR: Record<Side, string> = { blue: '#288cff', red: '#eb3232', neutral: '#d2d2d2', unknown: '#ffff80' }
export const ZONE_COLOR: Record<Zone['zoneKind'], string> = { kill: '#eb3232', objective: '#ffb020', assembly: '#288cff', dismount: '#eb3232', support: '#288cff' }
export const KIND_LABEL: Record<Kind, string> = { unit: 'Einheit', move: 'Bewegung', zone: 'Raum', line: 'Linie', mover: 'Fahrzeug/Trupp', fire: 'Feuer', callout: 'Text', cone: 'Beobachtungssektor', mortar: 'Mörser', marker: 'Ereignis' }

export function elementWindow(el: Element, cfg: Config): [number, number] {
  const from = el.from ?? 0
  const to = (el.kind === 'mover' ? el.until ?? el.to : el.to) ?? cfg.duration
  return [from, to]
}
