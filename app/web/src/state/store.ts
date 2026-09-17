import { create } from 'zustand'
import type { Config, Element, Kind } from '../model/types'
import type { GroundMode, MapDetail } from '../scene/mapProjection'
import { AEULI } from '../model/aeuli'
import type { AreaSource } from '../services/areaLoader'
export interface AreaRect { cx: number; cy: number; w: number; h: number }

export interface ExportJobInfo { id: string; name: string; progress: number; status: 'running' | 'done' | 'error' | 'cancelled'; message: string; url?: string; size?: number; started: number }

export type Tool = 'select' | 'unit' | 'move' | 'zone' | 'line' | 'fire' | 'callout' | 'cone' | 'mortar' | 'marker'
export type Screen = 'area' | 'editor' | 'export' | 'present'

/** clean sheet on the Äuli terrain */
export const EMPTY: Config = {
  version: 0,
  area: AEULI.area,
  duration: 90,
  phases: [{ id: 'p1', title: '1 · LAGE', start: 0, end: 90 }],
  elements: [],
  shots: [],
}

interface State {
  unitKeyPlacement: { id: string; time: number } | null
  setUnitKeyPlacement(value: { id: string; time: number } | null): void
  screen: Screen
  config: Config
  time: number
  playing: boolean
  groundMode: GroundMode
  mapDetail: MapDetail
  setGroundMode(mode: GroundMode): void
  setMapDetail(detail: MapDetail): void
  followCamera: boolean
  tool: Tool
  selected: string | null
  hover: string | null
  draft: [number, number][]   // LV95 points of the element being drawn
  railWide: boolean
  /** selected rectangle in LV95: centre, size (m); rotated by areaRotation (compass degrees) about the centre */
  areaRect: AreaRect | null
  setAreaRect(rect: AreaRect | null): void
  areaRotation: number
  setAreaRotation(deg: number): void
  areaSource: AreaSource
  areaNotes: string[]
  exportJobs: ExportJobInfo[]
  addJob(job: ExportJobInfo): void
  updateJob(id: string, patch: Partial<ExportJobInfo>): void
  removeJob(id: string): void
  setAreaSource(source: AreaSource): void
  setAreaNotes(notes: string[]): void
  history: Config[]
  future: Config[]
  setScreen(s: Screen): void
  setTime(t: number): void
  setPlaying(p: boolean): void
  setFollow(f: boolean): void
  setTool(t: Tool): void
  select(id: string | null): void
  setHover(id: string | null): void
  pushDraft(p: [number, number]): void
  popDraft(): void
  clearDraft(): void
  toggleRail(): void
  commit(mut: (c: Config) => Config): void
  previewElement(el: Element): void
  finishElementEdit(original: Element, commit: boolean): void
  updateElement(id: string, patch: Partial<Element>): void
  removeElement(id: string): void
  addElement(el: Element): void
  replaceConfig(c: Config): void
  undo(): void
  redo(): void
}

let counter = 1
export const newId = (kind: Kind) => `${kind[0]}${Date.now().toString(36).slice(-4)}${counter++}`

export const useStore = create<State>((set, get) => ({
  unitKeyPlacement: null,
  setUnitKeyPlacement: (unitKeyPlacement) => set({ unitKeyPlacement, playing: false, tool: 'select', draft: [] }),
  screen: 'area',
  config: EMPTY,
  time: 0,
  playing: false,
  followCamera: false,
  groundMode: 'fui',
  mapDetail: 'auto',
  setGroundMode: (groundMode) => set({ groundMode }),
  setMapDetail: (mapDetail) => set({ mapDetail }),
  tool: 'select',
  selected: null,
  hover: null,
  draft: [],
  railWide: true,
  areaRect: null,
  setAreaRect: (areaRect) => set({ areaRect }),
  areaRotation: 0,
  setAreaRotation: (areaRotation) => set({ areaRotation }),
  areaSource: { kind: 'aeuli' },
  areaNotes: [],
  exportJobs: [],
  addJob: (job) => set({ exportJobs: [job, ...get().exportJobs] }),
  updateJob: (id, patch) => set({ exportJobs: get().exportJobs.map(j => j.id === id ? { ...j, ...patch } : j) }),
  removeJob: (id) => set({ exportJobs: get().exportJobs.filter(j => j.id !== id) }),
  setAreaSource: (areaSource) => set({ areaSource }),
  setAreaNotes: (areaNotes) => set({ areaNotes }),
  history: [],
  future: [],
  setScreen: (screen) => set({ screen }),
  setTime: (time) => set({ time: Math.min(Math.max(time, 0), get().config.duration) }),
  setPlaying: (playing) => set({ playing }),
  setFollow: (followCamera) => set({ followCamera }),
  setTool: (tool) => set({ tool, draft: [], hover: null, unitKeyPlacement: null }),
  select: (selected) => set({ selected, unitKeyPlacement: null }),
  setHover: (hover) => { if (get().hover !== hover) set({ hover }) },
  pushDraft: (p) => set({ draft: [...get().draft, p] }),
  popDraft: () => set({ draft: get().draft.slice(0, -1) }),
  clearDraft: () => set({ draft: [] }),
  toggleRail: () => set({ railWide: !get().railWide }),
  commit: (mut) => { const { config, history } = get(); set({ config: mut(config), history: [...history.slice(-199), config], future: [] }) },
  previewElement: (el) => set({ config: { ...get().config, elements: get().config.elements.map(e => e.id === el.id ? el : e) } }),
  finishElementEdit: (original, commit) => {
    const {config,history}=get(), current=config.elements.find(e=>e.id===original.id)
    if (!current || current===original) return
    const before={...config,elements:config.elements.map(e=>e.id===original.id?original:e)}
    if(commit) set({history:[...history.slice(-199),before],future:[]})
    else set({config:before})
  },
  updateElement: (id, patch) => get().commit(c => ({ ...c, elements: c.elements.map(e => e.id === id ? ({ ...e, ...patch } as Element) : e) })),
  removeElement: (id) => { get().commit(c => ({ ...c, elements: c.elements.filter(e => e.id !== id) })); if (get().selected === id) set({ selected: null }) },
  addElement: (el) => { get().commit(c => ({ ...c, elements: [...c.elements, el] })); set({ selected: el.id }) },
  replaceConfig: (config) => { get().commit(() => config); set({ unitKeyPlacement: null, selected: null, hover: null, draft: [], playing: false, time: 0, followCamera: config.shots.length > 0 && get().followCamera }) },
  undo: () => { const { history, config, future } = get(); if (!history.length) return; set({ config: history.at(-1)!, history: history.slice(0, -1), future: [config, ...future] }) },
  redo: () => { const { history, config, future } = get(); if (!future.length) return; set({ config: future[0], future: future.slice(1), history: [...history, config] }) },
}))

export const fmt = (t: number, tenths = false) => { const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${tenths ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0')}` }
