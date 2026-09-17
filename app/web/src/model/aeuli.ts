// The Äuli reference maneuver (from overlay/standin_aeuli/scenario.py), expressed in the v0 config.
import type { Config, Pt, Element, Shot } from './types'

const E0 = 2742528.273215847
const N0 = 1219500.1708584253
const P = (x: number, y: number): Pt => [Math.round((E0 + x) * 10) / 10, Math.round((N0 + y) * 10) / 10]
const PP = (pts: [number, number][]): Pt[] => pts.map(([x, y]) => P(x, y))
const shifted = (pts: [number, number][], dx: number, dy: number): [number, number][] => pts.map(([x, y]) => [x + dx, y + dy])

const P1: [number, number][] = [[480, -200], [330, -130], [270, -100]]
const P1_IN: [number, number][] = [...P1, [180, -45], [120, -15], [90, -5], [50, 10]]
const P2: [number, number][] = [[430, 330], [300, 220], [200, 140]]

const elements: Element[] = [
  { id: 'u_kp', kind: 'unit', name: 'KP', side: 'blue', type: 'hq', size: 'company', pos: P(-110, 80) },
  { id: 'u_z1', kind: 'unit', name: 'Zug 1', side: 'blue', type: 'infantry', size: 'platoon', pos: P(-15, 62) },
  { id: 'u_z2', kind: 'unit', name: 'Zug 2', side: 'blue', type: 'infantry', size: 'platoon', pos: P(25, -30) },
  { id: 'u_mw', kind: 'unit', name: 'Mw Zug', side: 'blue', type: 'support', size: 'platoon', pos: P(-340, 60) },
  { id: 'u_sp', kind: 'unit', name: 'Späher', side: 'blue', type: 'recon', size: 'team', pos: P(48, -12), roof: true, footprint: false },

  { id: 'pl_gruen', kind: 'line', lineKind: 'pl', name: 'PL GRÜN', points: PP([[-220, 240], [-40, 140], [130, 30], [330, -110]]), color: '#3cc8a0' },
  { id: 'pl_rot', kind: 'line', lineKind: 'pl', name: 'PL ROT', points: PP([[95, 70], [95, -90]]), color: '#ff4040' },
  { id: 'pl_blau', kind: 'line', lineKind: 'pl', name: 'PL BLAU', points: PP([[-45, 110], [-45, -115]]), color: '#4c8dff' },
  { id: 'st1', kind: 'line', lineKind: 'stellung', name: 'Stellung Zug 1', points: PP([[-45, 80], [15, 58]]), flip: true, color: '#2f7cff' },
  { id: 'st2', kind: 'line', lineKind: 'stellung', name: 'Stellung Zug 2', points: PP([[5, -45], [55, -25]]), color: '#2f7cff' },
  { id: 'st3', kind: 'line', lineKind: 'stellung', name: 'Vorposten Zug 3', points: PP([[70, 22], [85, -25]]), color: '#2f7cff', from: 0, to: 52 },
  { id: 'sp1', kind: 'line', lineKind: 'sperre', name: 'Sperre Brücke', points: PP([[105, 35], [135, 5]]), color: '#e03a3a' },
  { id: 'hi1', kind: 'line', lineKind: 'hindernis', name: 'Drahthindernis', points: PP([[40, -120], [95, -70]]), color: '#e8e8e8' },
  { id: 'hi2', kind: 'line', lineKind: 'hindernis', name: 'Hindernis', points: PP([[60, 80], [115, 45]]), color: '#e8e8e8' },
  { id: 'rt1', kind: 'line', lineKind: 'route', name: 'Nachschub', points: PP([[-470, 200], [-250, 150], [-150, 105]]), color: '#2f7cff' },

  { id: 'z_kill', kind: 'zone', zoneKind: 'kill', name: 'FEUERRAUM', points: PP([[10, 40], [70, 18], [62, -22], [5, -5]]), active: 55 },
  { id: 'z_dis1', kind: 'zone', zoneKind: 'dismount', name: 'ABSITZRAUM 1', points: PP([[240, -80], [300, -70], [310, -130], [250, -140]]), from: 20, to: 90 },
  { id: 'z_dis2', kind: 'zone', zoneKind: 'dismount', name: 'ABSITZRAUM 2', points: PP([[170, 150], [230, 170], [240, 110], [180, 100]]), from: 22, to: 90 },

  { id: 'mv_z3', kind: 'mover', moverKind: 'platoon', side: 'blue', name: 'Zug 3', points: PP([[75, -5], [60, 5], [35, 12], [20, 15]]), keys: [[0, 0], [40, 0], [52, 3]], trail: false },
  { id: 'pi1', kind: 'mover', moverKind: 'piranha', side: 'blue', name: 'Pi 1', points: PP([[-75, 118], [-60, 105]]), keys: [[0, 0]], trail: false },
  { id: 'pi2', kind: 'mover', moverKind: 'piranha', side: 'blue', name: 'Pi 2', points: PP([[30, -105], [35, -90]]), keys: [[0, 0]], trail: false },
  { id: 'pi3', kind: 'mover', moverKind: 'piranha', side: 'blue', name: 'Pi 3', points: PP([[-120, -45], [-105, -40]]), keys: [[0, 0]], trail: false },
  { id: 'bmp1', kind: 'mover', moverKind: 'bmp', side: 'red', name: 'SPz 1', points: PP(P1_IN), keys: [[0, 0], [20, 2], [38, 2], [54, 6]], destroyed: 58 },
  { id: 'bmp2', kind: 'mover', moverKind: 'bmp', side: 'red', name: 'SPz 2', points: PP(shifted(P1, 6, 10)), keys: [[0.5, 0], [21, 2], [66, 2], [80, 0]], destroyed: 76 },
  { id: 'bmp3', kind: 'mover', moverKind: 'bmp', side: 'red', name: 'SPz 3', points: PP(shifted(P1, -6, -10)), keys: [[1, 0], [22, 2], [68, 2], [86, 0]], destroyed: 84 },
  { id: 'bmp4', kind: 'mover', moverKind: 'bmp', side: 'red', name: 'SPz 4', points: PP(P2), keys: [[1, 0], [21, 2], [68, 2], [86, 0]], destroyed: 80 },
  { id: 'bmp5', kind: 'mover', moverKind: 'bmp', side: 'red', name: 'SPz 5', points: PP(shifted(P2, 8, 6)), keys: [[2, 0], [22, 2], [66, 2], [84, 0]], destroyed: 82 },
  { id: 'bmp6', kind: 'mover', moverKind: 'bmp', side: 'red', name: 'SPz 6', points: PP(shifted(P2, -8, -6)), keys: [[1.5, 0], [22, 2], [70, 2], [88, 0]], destroyed: 87 },
  { id: 'g1', kind: 'mover', moverKind: 'squad', side: 'red', name: '', points: PP([[265, -105], [180, -45], [120, -15], [80, 0], [45, 12]]), keys: [[22, 0], [54, 4]], destroyed: 57 },
  { id: 'g2', kind: 'mover', moverKind: 'squad', side: 'red', name: '', points: PP([[262, -115], [175, -60], [115, -30], [85, -20], [60, -20]]), keys: [[22, 0], [55, 4]], destroyed: 59 },
  { id: 'g3', kind: 'mover', moverKind: 'squad', side: 'red', name: '', points: PP([[270, -95], [190, -35], [130, -5], [100, 15]]), keys: [[22, 0], [50, 3], [62, 3], [80, 0]], destroyed: 78 },
  { id: 'g4', kind: 'mover', moverKind: 'squad', side: 'red', name: '', points: PP([[200, 140], [130, 45], [110, 20], [75, 30], [40, 42]]), keys: [[24, 0], [54, 4]], destroyed: 58 },
  { id: 'g5', kind: 'mover', moverKind: 'squad', side: 'red', name: '', points: PP([[205, 150], [140, 60], [115, 35], [90, 45]]), keys: [[24, 0], [52, 3], [62, 3], [82, 0]], destroyed: 76 },
  { id: 'g6', kind: 'mover', moverKind: 'squad', side: 'red', name: '', points: PP([[195, 130], [150, 80], [125, 55]]), keys: [[24, 0], [48, 2], [64, 2], [84, 0]], destroyed: 85 },

  { id: 'ef1', kind: 'fire', side: 'red', points: [P(270, -100), P(95, -5)], from: 30, to: 50 },
  { id: 'ef2', kind: 'fire', side: 'red', points: [P(180, 120), P(60, 50)], from: 40, to: 56 },
  { id: 'ef3', kind: 'fire', side: 'red', points: [P(120, -15), P(70, 0)], from: 44, to: 54 },
  { id: 'ef4', kind: 'fire', side: 'red', points: [P(110, 20), P(40, 45)], from: 46, to: 55 },
  { id: 'ff1', kind: 'fire', side: 'blue', points: [P(-15, 62), P(40, 20)], from: 55, to: 66 },
  { id: 'ff2', kind: 'fire', side: 'blue', points: [P(25, -30), P(55, -5)], from: 55, to: 66 },
  { id: 'ff3', kind: 'fire', side: 'blue', points: [P(30, -105), P(55, -5)], from: 56, to: 64 },
  { id: 'ff4', kind: 'fire', side: 'blue', points: [P(20, 15), P(70, 5)], from: 57, to: 65 },
  { id: 'ff5', kind: 'fire', side: 'blue', points: [P(-75, 118), P(40, 40)], from: 57, to: 65 },
  { id: 'ff6', kind: 'fire', side: 'blue', points: [P(25, -30), P(180, -50)], from: 70, to: 82 },
  { id: 'ff7', kind: 'fire', side: 'blue', points: [P(15, 58), P(150, 60)], from: 70, to: 80 },
  { id: 'ff8', kind: 'fire', side: 'blue', points: [P(-75, 118), P(170, 110)], from: 72, to: 84 },

  { id: 'm_att1', kind: 'move', side: 'red', name: 'Angriff Süd', points: PP([[430, -180], [270, -100], [150, -30], [90, 0]]), from: 2, to: 36 },
  { id: 'm_att2', kind: 'move', side: 'red', name: 'Angriff Nord', points: PP([[400, 300], [200, 140], [120, 30]]), from: 3, to: 36 },
  { id: 'm_ret1', kind: 'move', side: 'red', name: 'Rückzug', points: PP([[60, 10], [120, -10], [230, -90]]), from: 62, to: 90, style: 'dashed' },
  { id: 'm_ret2', kind: 'move', side: 'red', name: 'Rückzug', points: PP([[90, 45], [140, 60], [220, 150]]), from: 63, to: 90, style: 'dashed' },

  { id: 'cl1', kind: 'callout', text: 'FEIND ERKANNT', sub: '6 SPz · 2 Zg PzGren', color: 'red', pos: P(300, -120), offset: [140, -90], from: 16, to: 30 },
  { id: 'cl2', kind: 'callout', text: 'ABSITZEN', color: 'red', pos: P(265, -105), offset: [-160, -110], from: 21, to: 32 },
  { id: 'cl3', kind: 'callout', text: 'ZUG 3 WEICHT AUS', sub: 'FEIND WIRD GEZOGEN', color: 'blue', pos: P(60, 5), offset: [-190, -120], from: 40, to: 50 },
  { id: 'cl4', kind: 'callout', text: 'FEIND FOLGT', color: 'red', pos: P(100, 15), offset: [-260, -130], from: 46, to: 54 },
  { id: 'cl5', kind: 'callout', text: 'FEUERRAUM AUSGELÖST', sub: 'ZUG 1 · ZUG 2 · PI 1 · PI 2', color: 'amber', pos: P(40, 8), offset: [170, -120], from: 55, to: 63 },
  { id: 'cl6', kind: 'callout', text: 'RÜCKZUG', color: 'red', pos: P(110, -10), offset: [150, -100], from: 64, to: 72 },
  { id: 'cl7', kind: 'callout', text: 'SPERRFEUER MW', color: 'amber', pos: P(220, -80), offset: [140, -110], from: 73, to: 82 },
  { id: 'cl8', kind: 'callout', text: 'FEIND VERNICHTET', color: 'amber', pos: P(200, -60), offset: [-230, -140], from: 85, to: 90 },
]

const shots: Shot[] = [
  { id: 'A', kind: 'orbit', start: 0, end: 14, center: P(-20, 0), radius: 340, alt: 210, a0: -10, a1: 55 },
  { id: 'B', kind: 'dolly', start: 14, end: 36, p0: [430, 300, 150], p1: [330, 210, 120], look0: P(230, -10), look1: P(170, 10) },
  { id: 'C', kind: 'dolly', start: 36, end: 55, p0: [185, -160, 72], p1: [125, -125, 56], look0: P(65, -10), look1: P(35, 5) },
  { id: 'D', kind: 'orbit', start: 55, end: 70, center: P(35, 5), radius: 70, alt: 175, a0: 210, a1: 265 },
  { id: 'E', kind: 'dolly', start: 70, end: 90, p0: [-260, -310, 195], p1: [-190, -250, 170], look0: P(140, -20), look1: P(230, -30) },
]

export const AEULI: Config = {
  version: 0,
  area: { id: 'aeuli', name: 'Äuli · Walenstadt', E0, N0 },
  duration: 90,
  phases: [
    { id: 'p1', title: '1 · LAGE', start: 0, end: 14 },
    { id: 'p2', title: '2 · ANNÄHERUNG UND ABSITZEN', start: 14, end: 36 },
    { id: 'p3', title: '3 · ORTSRAND OST', start: 36, end: 55 },
    { id: 'p4', title: '4 · FEUERRAUM', start: 55, end: 70 },
    { id: 'p5', title: '5 · RÜCKZUG UND VERNICHTUNG', start: 70, end: 90 },
  ],
  elements,
  shots,
}
