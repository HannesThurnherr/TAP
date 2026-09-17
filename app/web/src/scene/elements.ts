import {vehicleMarkup,destructionEffect} from './unitVisual'
import {unitDrawing,pointDrawing,symbolSvg} from '../symbology/symbol'
import {TACTICAL_LINES,TACTICAL_AREAS,affiliationForSide,AFFILIATION_STROKE} from '../symbology/catalog'
import {tacticalLine,tacticalArea,type Stroke} from '../symbology/tactical'
import * as THREE from 'three'
import { terrainRibbon } from './terrainRibbon'
import { firePath } from './firePath'
import { mortarEffect } from './MortarEffect'
import { tracerEffect } from './TracerEffect'
import { arrowProgress, moverKeys, interpolateKeys, clamp01, unitPosition, unitTrail } from '../model/timing'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Scene } from './Scene'
import { toScene } from './Scene'
import { SIDE_COLOR, ZONE_COLOR, elementWindow, type Config, type Element, type Pt, type Mover, type Move, type Zone, type Line, type Unit, type Fire, type Callout } from '../model/types'

// Style in metres (derived from render.py at the reference scale, see docs/research)
const STYLE = {
  moveWidth: 24, fireWidth: 19, footprint: { team: 6, squad: 9.5, platoon: 13.5, company: 19 } as Record<string, number>,
  lineWidthPx: 3, dash: 12, gap: 6.5, lift: 0.5,
}
const FADE = 0.32 // seconds (8 frames @ 25 fps)

const smoothstep = (t: number) => { t = Math.min(Math.max(t, 0), 1); return t * t * (3 - 2 * t) }

/** Catmull-Rom through 2D points, returns N samples (x, y) in local metres */
function spline(pts: [number, number][], samples: number, smooth = true): [number, number][] {
  if (pts.length < 2) return pts
  if (!smooth) {
    const out: [number, number][] = [], total = cumLen(pts).at(-1)! || 1
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(samples * Math.hypot(b[0] - a[0], b[1] - a[1]) / total)); for (let j = 0; j < n; j++) out.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]) }
    out.push(pts.at(-1)!); return out
  }
  if (pts.length === 2) { const out: [number, number][] = []; for (let i = 0; i < samples; i++) { const u = i / (samples - 1); out.push([pts[0][0] + (pts[1][0] - pts[0][0]) * u, pts[0][1] + (pts[1][1] - pts[0][1]) * u]) } return out }
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], 0, p[1])), false, 'catmullrom', 0.5)
  return curve.getSpacedPoints(samples - 1).map(v => [v.x, v.z] as [number, number])
}

function cumLen(pts: [number, number][]): number[] {
  const out = [0]
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  return out
}

function label(text: string, cls: string): CSS2DObject {
  const div = document.createElement('div')
  div.className = cls
  div.textContent = text
  return new CSS2DObject(div)
}

/** invisible pick proxy (raycasting ignores `visible`, so these never render but can be hit) */
const proxyMat = new THREE.MeshBasicMaterial({ visible: false })
function proxy(radius: number, height = 10): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 10), proxyMat)
  m.visible = false
  return m
}

export interface Rendered { el: Element; group: THREE.Group; ctx: { dim: number }; update(t: number): void; highlight(level: 0 | 1 | 2): void; dispose(): void }

const ribbonMaterial = (color: string, alpha: [number, number], dashed: boolean) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { color: { value: new THREE.Color(color) }, progress: { value: 1 }, a0: { value: alpha[0] }, a1: { value: alpha[1] }, fade: { value: 1 }, dashed: { value: dashed ? 1 : 0 }, len: { value: 100 }, hi: { value: 0 } },
  vertexShader: `attribute float along; attribute float across; varying float vA; varying float vX; void main(){ vA = along; vX = across; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 color; uniform float progress, a0, a1, fade, dashed, len, hi; varying float vA; varying float vX;
    void main(){ if (vA > progress) discard; float a = mix(a0, a1, vA / max(progress, 0.001));
      float edge = smoothstep(1.0, 0.85, abs(vX)); a *= edge;
      if (dashed > 0.5) { float d = fract(vA * len / 14.0); a *= (abs(vX) < 0.22 && d < 0.5) ? 1.0 : 0.45; }
      float head = smoothstep(progress - 0.03, progress, vA); a += head * 0.25;
      vec3 c = mix(color, vec3(1.0), hi * 0.35); a += hi * 0.2;
      gl_FragColor = vec4(c, a * fade); }`,
})

/** ground-conforming ribbon with an arrow head; `along` 0..1 along the path, `across` -1..1 */
function ribbon(scene: Scene, pts: [number, number][], width: number, head: boolean, smooth = true): THREE.BufferGeometry {
  const spacing = head ? 2 : 4
  const S = spline(pts, Math.max(24, Math.ceil(cumLen(pts).at(-1)! / spacing) + 1), smooth)
  return terrainRibbon(S, width, head, (x, y) => scene.terrain.ground(x, y))
}

function drapedLine(scene: Scene, pts: [number, number][], smooth: boolean, closed: boolean): number[] {
  const src = closed ? [...pts, pts[0]] : pts
  const S = smooth && src.length > 2 ? spline(src, Math.max(16, Math.round(cumLen(src).at(-1)! / 4))) : (() => { const out: [number, number][] = []; for (let i = 0; i < src.length - 1; i++) { const n = Math.max(2, Math.ceil(Math.hypot(src[i + 1][0] - src[i][0], src[i + 1][1] - src[i][1]) / 4)); for (let k = 0; k < n; k++) { const u = k / n; out.push([src[i][0] + (src[i + 1][0] - src[i][0]) * u, src[i][1] + (src[i + 1][1] - src[i][1]) * u]) } } out.push(src.at(-1)!); return out })()
  const out: number[] = []
  for (const [x, y] of S) out.push(x, scene.terrain.ground(x, y) + STYLE.lift, -y)
  return out
}

function fatLine(scene: Scene, positions: number[], color: string, widthPx: number, dashed: boolean, opacity = 1): Line2 {
  const geo = new LineGeometry(); geo.setPositions(positions)
  const mat = new LineMaterial({ color: new THREE.Color(color), linewidth: widthPx, worldUnits: false, dashed, dashSize: STYLE.dash, gapSize: STYLE.gap, transparent: true, opacity, depthTest: true })
  mat.toneMapped = false
  mat.userData.baseWidth = widthPx
  const w = scene.container.clientWidth, h = scene.container.clientHeight
  mat.resolution.set(w, h)
  scene.lineMaterials.push(mat)
  const line = new Line2(geo, mat)
  line.computeLineDistances()
  return line
}

function fadeAt(t: number, from: number, to: number): number {
  if (t < from || t > to + FADE) return 0
  return Math.min(1, (t - from + FADE) / FADE, (to + FADE - t) / FADE)
}

export class ElementLayer {
  items = new Map<string, Rendered>()
  draft: Rendered | null = null
  selected: string | null = null
  hovered: string | null = null
  private raycaster = new THREE.Raycaster()
  constructor(public scene: Scene) { this.raycaster.params.Line2 = { threshold: 8 } }

  private previousConfig: Config | null = null
  sync(cfg: Config) {
    const ids = new Set(cfg.elements.map(e => e.id))
    for (const [id, r] of this.items) if (!ids.has(id) || r.el !== cfg.elements.find(e => e.id === id) || (r.el.kind==='move'&&r.el.followUnit&&this.previousConfig?.elements.find(e=>e.id===(r.el as Move).followUnit)!==cfg.elements.find(e=>e.id===(r.el as Move).followUnit))) { r.dispose(); this.items.delete(id) }
    for (const el of cfg.elements) if (!this.items.has(el.id)) { const r = this.build(el, cfg); if (r) { this.items.set(el.id, r); this.scene.overlays.add(r.group) } }
    this.previousConfig=cfg
    this.applyHighlights()
  }

  update(t: number) { for (const r of this.items.values()) if (r.el.kind !== 'callout') r.update(t); for (const r of this.items.values()) if (r.el.kind === 'callout') r.update(t); if (this.draft) this.draft.update(t) }

  setSelected(id: string | null) { this.selected = id; this.applyHighlights() }
  setHover(id: string | null) { if (this.hovered === id) return; this.hovered = id; this.applyHighlights() }
  private applyHighlights() { for (const [id, r] of this.items) r.highlight(id === this.selected ? 2 : id === this.hovered ? 1 : 0) }

  /** the element being drawn, rendered exactly like a real one (dimmed) */
  setDraft(el: Element | null, cfg: Config) {
    if (this.draft) { this.draft.dispose(); this.draft = null }
    if (!el) return
    const r = this.build(el, cfg)
    if (!r) return
    r.ctx.dim = 0.7
    r.group.traverse(o => { const e = (o as any).element as HTMLElement | undefined; if (e) e.classList.add('draft') })
    this.draft = r
    this.scene.overlays.add(r.group)
  }

  /** nearest visible element under the pointer */
  pick(ev: { clientX: number; clientY: number }): string | null {
    const scene = this.scene
    const rect = scene.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, scene.camera)
    // CSS symbols live in screen space; pick their actual visible boxes, not metre-sized proxies.
    const labels: { id: string; z: number }[] = []
    for (const [id, r] of this.items) {
      if (!r.group.visible) continue
      r.group.traverse(o => {
        if (!(o instanceof CSS2DObject) || o.element.style.display === 'none' || Number(o.element.style.opacity) <= 0) return
        const targets = o.element.classList.contains('callout') ? [...o.element.querySelectorAll<HTMLElement>('.box')] : [o.element]
        for (const el of targets) {
          if (el.style.clipPath === 'inset(0 100% 0 0)') continue
          const b = el.getBoundingClientRect()
          if (b.width && b.height && ev.clientX >= b.left - 3 && ev.clientX <= b.right + 3 && ev.clientY >= b.top - 3 && ev.clientY <= b.bottom + 3) labels.push({ id, z: Number(o.element.style.zIndex) || 0 })
        }
      })
    }
    if (labels.length) return labels.sort((a, b) => b.z - a.z)[0].id
    const objects: THREE.Object3D[] = []
    for (const r of this.items.values()) if (r.group.visible) r.group.traverseVisible(o => { if (o instanceof THREE.Mesh) objects.push(o) })
    const hits = this.raycaster.intersectObjects(objects, false)
    const surface = scene.pick(ev)
    const surfaceDistance = surface ? scene.camera.position.distanceTo(toScene(surface.x, surface.y, surface.h)) : Infinity
    for (const h of hits) {
      let owner: THREE.Object3D | null = h.object
      while (owner && !owner.userData.elementId) owner = owner.parent
      const candidate = owner ? this.items.get(owner.userData.elementId) : undefined
      if (candidate?.el.occlude !== false && h.distance > surfaceDistance + 1.5) continue
      const mesh = h.object as THREE.Mesh
      const material = mesh.material as THREE.ShaderMaterial
      // Raycasting cannot see fragment-shader discard: reject the undrawn part of a ribbon.
      const along = mesh.geometry.getAttribute('along')
      if (along && h.face && material.uniforms?.progress) {
        const p = mesh.worldToLocal(h.point.clone()), positions = mesh.geometry.getAttribute('position')
        const a = new THREE.Vector3().fromBufferAttribute(positions, h.face.a), b = new THREE.Vector3().fromBufferAttribute(positions, h.face.b), c = new THREE.Vector3().fromBufferAttribute(positions, h.face.c)
        const bary = THREE.Triangle.getBarycoord(p, a, b, c, new THREE.Vector3())
        if (!bary || bary.x * along.getX(h.face.a) + bary.y * along.getX(h.face.b) + bary.z * along.getX(h.face.c) > material.uniforms.progress.value) continue
      }
      let o: THREE.Object3D | null = h.object
      while (o) { if (o.userData.elementId) return o.userData.elementId as string; o = o.parent }
    }
    return null
  }

  dispose() {
    this.draft?.dispose(); this.draft = null
    for (const r of this.items.values()) r.dispose()
    this.items.clear()
  }

  private build(el: Element, cfg: Config): Rendered | null {
    const scene = this.scene
    const local = (p: Pt) => scene.lv95ToLocal(p)
    const group = new THREE.Group(); group.userData.elementId = el.id
    const [from, to] = elementWindow(el, cfg)
    const side = el.side ?? 'neutral'
    const col = SIDE_COLOR[side]
    const escapeText = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
    const ctx = { dim: 1 }
    const disposers: (() => void)[] = []
    const cssEls: HTMLElement[] = []
    const shaderMats: THREE.ShaderMaterial[] = []
    let update: (t: number) => void = () => {}

    const addCss = (obj: CSS2DObject) => { obj.element.dataset.elementId = el.id; cssEls.push(obj.element as HTMLElement); group.add(obj) }

    const addStrokes=(strokes:Stroke[],color:string)=>{
      for(const stroke of strokes){
        const points=stroke.closed?[...stroke.points,stroke.points[0]]:stroke.points
        if(stroke.fill&&stroke.points.length>=3){
          const pts=stroke.points,tris=THREE.ShapeUtils.triangulateShape(pts.map(p=>new THREE.Vector2(...p)),[]),geo=new THREE.BufferGeometry()
          geo.setAttribute('position',new THREE.Float32BufferAttribute(pts.flatMap(p=>[p[0],scene.terrain.ground(...p)+2,-p[1]]),3));geo.setIndex(tris.flat())
          group.add(new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.95,depthWrite:false})))
        }else group.add(fatLine(scene,drapedLine(scene,points,false,false),color,2,el.status==='planned'||!!stroke.dashed))
      }
    }
    if((el.kind==='line'||el.kind==='zone')&&el.tactical){
      const pts=el.points.map(local),color=el.color??AFFILIATION_STROKE[affiliationForSide(el.side)]
      const samples=el.kind==='line'?spline(pts,Math.min(1024,Math.max(2,Math.ceil(cumLen(pts).at(-1)!/8))),el.smooth!==false):pts
      addStrokes(el.kind==='line'?tacticalLine(el.tactical,samples,el.width??20,el.flip):tacticalArea(el.tactical,pts,20),color)
      const defaults=el.kind==='line'?TACTICAL_LINES[el.tactical].name:TACTICAL_AREAS[el.tactical].name
      const text=(el.kind==='line'&&el.tactical==='phaseLine'?'PL ':el.kind==='line'&&el.tactical==='departureLine'?'AL ':'')+(el.name||defaults)
      const mid=samples[Math.floor(samples.length/2)],lab=label(text,'pill');lab.element.style.setProperty('--c',color);lab.position.copy(toScene(mid[0],mid[1],scene.terrain.ground(...mid)+3));addCss(lab)
      update=t=>{const a=fadeAt(t,from,to)*ctx.dim;group.visible=a>0;lab.element.style.opacity=String(a)}
    } else switch (el.kind) {
      case 'unit': {
        const u = el as Unit
        const [x, y] = local(u.pos)
        let h = scene.terrain.ground(x, y)
        if (u.roof) { const hit = this.roofHeight(x, y); if (hit !== null) h = hit }
        const r = STYLE.footprint[u.size] ?? 10
        let footprint: Line2 | null = null
        if (u.footprint !== false && !u.roof) {
          const ringPts: [number, number][] = []
          for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; ringPts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]) }
          footprint = fatLine(scene, drapedLine(scene, ringPts, false, false), col, 2, false, 0.85); group.add(footprint)
          const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, depthWrite: false }))
          disc.rotation.x = -Math.PI / 2; disc.position.copy(toScene(x, y, h + 0.4)); group.add(disc)
        }
        const puck = document.createElement('div'); puck.className = `puck ${side} ${u.type}`
        if(u.model){puck.className=`mover ${side} ${u.model}`;puck.innerHTML=vehicleMarkup(u.model,escapeText(u.name??''))}
        else if(u.symbol){const drawing=unitDrawing(u.symbol,u.side,u.status);puck.classList.add('swiss-puck');puck.innerHTML=`<div class="swiss-symbol">${symbolSvg(drawing)}</div><div class="lbl">${escapeText(u.name??'')}</div>`;puck.dataset.symbolDrawing=JSON.stringify(drawing)}
        else puck.innerHTML = `<div class="glyph ${u.type}"><span class="rank ${u.size}"></span></div><div class="lbl">${escapeText(u.name ?? '')}</div>`
        const obj = new CSS2DObject(puck); obj.position.copy(toScene(x, y, h + 2)); addCss(obj)
        const px = proxy(Math.max(r, 8) + 2, 16); px.position.copy(toScene(x, y, h + 6)); group.add(px)
        let trail:Line2|null=null
        if(u.trail){trail=fatLine(scene,[x,h+.6,-y,x+.001,h+.6,-y],col,1.5,true,.7);(trail.material as LineMaterial).dashSize=2;(trail.material as LineMaterial).gapSize=3;group.add(trail)}
        const destruction=u.destroyed!=null?destructionEffect():null
        if(destruction){destruction.group.position.copy(toScene(x,y,h));group.add(destruction.group)}
        let wasDead=false,trailTime=NaN
        let previousX = NaN, previousY = NaN
        update = (t) => {
          const a = fadeAt(t, from, to) * ctx.dim; group.visible = a > 0; puck.style.opacity = String(a)
          const [mx,my] = local(unitPosition(u,t))
          if (mx !== previousX || my !== previousY) {
            const mh = u.roof ? this.roofHeight(mx,my) ?? scene.terrain.ground(mx,my) : scene.terrain.ground(mx,my)
            group.position.set(mx-x,mh-h,-(my-y)); previousX=mx; previousY=my
            if (footprint) { const ring: number[] = []; for(let i=0;i<=48;i++){ const theta=i/48*Math.PI*2, rx=mx+Math.cos(theta)*r, ry=my+Math.sin(theta)*r; ring.push(rx-group.position.x,scene.terrain.ground(rx,ry)+0.6-group.position.y,-ry-group.position.z) }; footprint.geometry.setPositions(ring) }
          }
          const dead=u.destroyed!=null&&t>=u.destroyed
          puck.classList.toggle('dead',dead)
          destruction?.update(dead?t-u.destroyed!:-1,a)
          if(dead!==wasDead){
            if(u.symbol&&!u.model){const drawing=unitDrawing(u.symbol,u.side,u.status);if(dead)drawing.paths.push({d:'M 15 25 L 115 100 M 15 100 L 115 25',stroke:'#eb3232',width:4});puck.querySelector('.swiss-symbol')!.innerHTML=symbolSvg(drawing);puck.dataset.symbolDrawing=JSON.stringify(drawing)}
            else if(!u.model)puck.querySelector('.lbl')!.textContent=(u.name??'')+(dead?' · ✕':'')
            wasDead=dead
          }
          if(u.model){const mt=Math.min(t,u.destroyed??Infinity),a=unitPosition(u,mt-.1),b=unitPosition(u,mt+.1);if(Math.hypot(b[0]-a[0],b[1]-a[1])>.001)(puck.querySelector('.chev') as HTMLElement).style.transform=`rotate(${-Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI+90}deg) translateY(-18px)`}
          if(trail&&trailTime!==t){trailTime=t;const ps=unitTrail(u,t).map(local);trail.visible=ps.length>1;if(ps.length>1){const positions=drapedLine(scene,ps,false,false);for(let i=0;i<positions.length;i+=3){positions[i]-=group.position.x;positions[i+1]-=group.position.y;positions[i+2]-=group.position.z}trail.geometry.dispose();trail.geometry.setPositions(positions);trail.computeLineDistances()}}

        }
        break
      }
      case 'move': {
        const m = el as Move
        const target=m.followUnit?cfg.elements.find(e=>e.id===m.followUnit):null
        if(target?.kind==='unit'&&target.positionKeys&&target.positionKeys.length>=2){
          const keys=[...target.positionKeys].sort((a,b)=>a.time-b.time)
          const mat=ribbonMaterial(col,[.25,.75],m.style==='dashed'||m.status==='planned');shaderMats.push(mat)
          const mesh=new THREE.Mesh(new THREE.BufferGeometry(),mat);mesh.renderOrder=2;group.add(mesh)
          const lab=m.name?label(m.name,'pill'):null;if(lab)addCss(lab)
          let previousTime=NaN
          update=(t)=>{
            const end=Math.min(keys.at(-1)!.time,Math.max(keys[0].time,t))
            const a=fadeAt(t,from,to)*ctx.dim;group.visible=a>0&&end>keys[0].time;mat.uniforms.fade.value=a;mat.uniforms.progress.value=1;if(lab)lab.element.style.opacity=String(a)
            if(end===previousTime)return;previousTime=end
            const pts=unitTrail(target,end).map(local)
            if(lab&&pts.length){const mid=pts[Math.floor(pts.length/2)];lab.position.copy(toScene(mid[0],mid[1],scene.terrain.ground(...mid)+3))}
            mesh.geometry.dispose()
            mesh.geometry=pts.length>=2?terrainRibbon(spline(pts,Math.min(1024,Math.max(32,Math.ceil(cumLen(pts).at(-1)!/4))),false),m.width??STYLE.moveWidth,true,(x,y)=>scene.terrain.ground(x,y)):new THREE.BufferGeometry()
            mat.uniforms.len.value=mesh.geometry.userData.length??1
          }
          disposers.push(()=>{mesh.geometry.dispose();mat.dispose()})
          break
        }
        const pts = m.points.map(local)
        const geo = ribbon(scene, pts, m.width ?? STYLE.moveWidth, true, m.smooth !== false)
        const mat = ribbonMaterial(col, [0.25, 0.75], m.style === 'dashed'||m.status==='planned'); mat.uniforms.len.value = geo.userData.length; shaderMats.push(mat)
        const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 2; group.add(mesh)
        const lab = m.name ? label(m.name, 'pill') : null
        if (lab) { const mid = spline(pts, 21, m.smooth !== false)[10] ?? pts[0]; lab.position.copy(toScene(mid[0], mid[1], scene.terrain.ground(...mid) + 1)); addCss(lab) }
        update = (t) => { const a = fadeAt(t, from, to) * ctx.dim; group.visible = a > 0; mat.uniforms.fade.value = a; const progress = ctx.dim < 1 ? 1 : arrowProgress(m, t, cfg.duration); mat.uniforms.progress.value = progress; if (lab) lab.element.style.opacity = String(progress > 0.5 ? a : 0) }
        disposers.push(() => { geo.dispose(); mat.dispose() })
        break
      }
      case 'fire': {
        const f = el as Fire
        const pts = spline(f.points.map(local), 100, f.smooth !== false)
        const fc = side === 'blue' ? '#ff8c00' : '#ff281e'
        const path = firePath(pts, f.width ?? STYLE.fireWidth, (x, y) => scene.terrain.ground(x, y))
        const geo = path.geometry
        const mat = ribbonMaterial(fc, [0.08, 0.42], false); mat.uniforms.len.value = geo.userData.length; shaderMats.push(mat)
        const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 3; group.add(mesh)
        const tracers = f.fireKind === 'suppress' || path.length === 0 ? null : tracerEffect(el.id, path.at, path.length, f.width ?? STYLE.fireWidth)
        if (tracers) { group.add(tracers.group); disposers.push(() => tracers.dispose()) }
        const fireLab = f.name ? label(f.name, 'pill') : null
        if (fireLab) { fireLab.position.copy(path.at(0.5)); fireLab.position.y += 1; addCss(fireLab) }
        update = (t) => {
          const a = fadeAt(t, from, to) * ctx.dim; group.visible = a > 0; mat.uniforms.fade.value = a; mat.uniforms.progress.value = ctx.dim < 1 ? 1 : smoothstep((t - from + 0.05) / 1)
          if (fireLab) fireLab.element.style.opacity = String(a)
          tracers?.update(t, scene.container.clientWidth || 1, scene.container.clientHeight || 1, ctx.dim < 1 ? 0 : a, from)
        }
        break
      }
      case 'zone': {
        const z = el as Zone
        const pts = z.points.map(local)
        const zc = z.color ?? ZONE_COLOR[z.zoneKind]
        const shape = pts.map(p => new THREE.Vector2(p[0], p[1]))
        const tris = THREE.ShapeUtils.triangulateShape(shape, [])
        const pos: number[] = [], idx: number[] = []
        for (const p of pts) pos.push(p[0], scene.terrain.ground(p[0], p[1]) + STYLE.lift, -p[1])
        for (const tr of tris) idx.push(tr[0], tr[1], tr[2])
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx)
        const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
          uniforms: { color: { value: new THREE.Color(zc) }, fade: { value: 1 }, pulse: { value: 0 }, hi: { value: 0 } },
          vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: `uniform vec3 color; uniform float fade, pulse, hi; varying vec3 vW; void main(){ float s = fract((vW.x - vW.z) / 6.5); float hatch = s < 0.14 ? 0.55 : 0.10; gl_FragColor = vec4(mix(color, vec3(1.0), hi * 0.3), (hatch + pulse * 0.35 + hi * 0.15) * fade); }` })
        shaderMats.push(mat)
        const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 1; group.add(mesh)
        group.add(fatLine(scene, drapedLine(scene, pts, false, true), zc, 2, true, 0.9))
        const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
        const lab = label(z.name ?? '', `pill zone`); lab.position.copy(toScene(cx, cy, scene.terrain.ground(cx, cy) + 1)); addCss(lab); (lab.element as HTMLElement).style.setProperty('--c', zc)
        update = (t) => { const a = fadeAt(t, from, to) * ctx.dim; group.visible = a > 0; mat.uniforms.fade.value = a; (lab.element as HTMLElement).style.opacity = String(a)
          let pulse = 0; if (z.active != null && t >= z.active) { const dt = t - z.active; pulse = dt < 0.4 ? 1 - dt / 0.4 : 0.5 + 0.5 * Math.sin(dt * Math.PI * 2 / 0.96) * 0.6 } mat.uniforms.pulse.value = pulse }
        break
      }
      case 'line': {
        const l = el as Line
        const pts = l.points.map(local)
        const color = l.color ?? '#ff4040'
        const dashed = l.lineKind === 'pl'
        if (l.lineKind === 'sperre') group.add(new THREE.Mesh(ribbon(scene, pts, l.width ?? 7.5, false, l.smooth !== false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide })))
        else group.add(fatLine(scene, drapedLine(scene, pts, l.smooth !== false, false), color, STYLE.lineWidthPx, dashed, 0.95))
        if (l.lineKind === 'sperre' || l.lineKind === 'hindernis' || l.lineKind === 'stellung') {
          const S = spline(pts, Math.max(8, Math.round(cumLen(pts).at(-1)! / (l.lineKind === 'sperre' ? 16.5 : l.lineKind === 'hindernis' ? 9.5 : 6))), l.smooth !== false)
          for (let i = 0; i < S.length; i++) {
            const p = S[i], q = S[Math.min(i + 1, S.length - 1)], r = S[Math.max(i - 1, 0)]
            let tx = q[0] - r[0], ty = q[1] - r[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl
            const nx = -ty, ny = tx, s = l.lineKind === 'sperre' ? (l.width ?? 7.5) / 2 : l.lineKind === 'hindernis' ? (l.width ?? 6) : 3.2
            let segs: number[] = []
            if (l.lineKind === 'sperre') segs = [p[0] - (tx + nx) * s, p[1] - (ty + ny) * s, p[0] + (tx + nx) * s, p[1] + (ty + ny) * s, p[0] - (tx - nx) * s, p[1] - (ty - ny) * s, p[0] + (tx - nx) * s, p[1] + (ty - ny) * s]
            else if (l.lineKind === 'hindernis') { segs = [p[0] - tx * s / 2, p[1] - ty * s / 2, p[0] + nx * s, p[1] + ny * s, p[0] + nx * s, p[1] + ny * s, p[0] + tx * s / 2, p[1] + ty * s / 2] }
            else { const f = l.flip ? -1 : 1; const arc: number[] = []; for (let k = 0; k <= 6; k++) { const a = Math.PI * k / 6; arc.push(p[0] + tx * Math.cos(a) * s + nx * f * Math.sin(a) * s, p[1] + ty * Math.cos(a) * s + ny * f * Math.sin(a) * s) } segs = arc }
            const pl: [number, number][] = []; for (let k = 0; k < segs.length; k += 2) pl.push([segs[k], segs[k + 1]])
            if (l.lineKind === 'sperre') { group.add(fatLine(scene, drapedLine(scene, [pl[0], pl[1]], false, false), '#ffffff', 2, false)); group.add(fatLine(scene, drapedLine(scene, [pl[2], pl[3]], false, false), '#ffffff', 2, false)) }
            else group.add(fatLine(scene, drapedLine(scene, pl, false, false), color, 2, false))
          }
        }
        const routePts = l.lineKind === 'route' ? spline(pts, Math.max(20, Math.round(cumLen(pts).at(-1)! / 2)), l.smooth !== false) : []
        const routeLines: Line2[] = []
        if (routePts.length) for (let i = 0; i < Math.min(200, Math.max(1, Math.round(cumLen(routePts).at(-1)! / 16))); i++) {
          const line = fatLine(scene, [0, 0, 0, 1, 0, 0, 2, 0, 0], color, 2, false); group.add(line); routeLines.push(line)
        }
        if (l.name) { const mid = pts[Math.floor(pts.length / 2)]; const lab = label(l.name, 'pill'); (lab.element as HTMLElement).style.setProperty('--c', color); lab.position.copy(toScene(mid[0], mid[1], scene.terrain.ground(mid[0], mid[1]) + 1)); addCss(lab) }
        update = (t) => {
          const a = fadeAt(t, from, to) * ctx.dim; group.visible = a > 0; for (const e of cssEls) e.style.opacity = String(a)
          routeLines.forEach((line, i) => {
            const u = (i / routeLines.length + Math.max(0, t - from) * 0.04) % 1, index = Math.min(routePts.length - 2, Math.floor(u * (routePts.length - 1)))
            const p = routePts[index], q = routePts[index + 1], heading = Math.atan2(q[1] - p[1], q[0] - p[0])
            const tri: [number, number][] = [[p[0] - 4 * Math.cos(heading) - 3 * Math.sin(heading), p[1] - 4 * Math.sin(heading) + 3 * Math.cos(heading)], p, [p[0] - 4 * Math.cos(heading) + 3 * Math.sin(heading), p[1] - 4 * Math.sin(heading) - 3 * Math.cos(heading)]]
            line.geometry.setPositions(drapedLine(scene, tri, false, false))
          })
        }
        break
      }
      case 'mover': {
        const mv = el as Mover
        const pts = mv.points.map(local)
        const S = spline(pts, Math.max(16, Math.round(cumLen(pts).at(-1)! / 3)), mv.smooth !== false)
        const L = cumLen(S), total = L.at(-1)! || 1
        const vertexFrac = cumLen(pts).map((v, _, arr) => v / (arr.at(-1)! || 1))
        const keys = moverKeys(mv, vertexFrac, cfg.duration).sort((a, b) => a[0] - b[0])
        const sym = document.createElement('div'); sym.className = `mover ${side} ${mv.moverKind}`
        sym.innerHTML=vehicleMarkup(mv.moverKind,escapeText(mv.name??''))
        const obj = new CSS2DObject(sym); addCss(obj)
        const px = proxy(9, 12); group.add(px)
        let trail: Line2 | null = null
        if (mv.trail !== false) { const positions: number[] = []; for (const [x, y] of S) positions.push(x, scene.terrain.ground(x, y) + 0.6, -y); trail = fatLine(scene, positions, col, 1.5, true, 0.7); (trail.material as LineMaterial).dashSize = 2; (trail.material as LineMaterial).gapSize = 3; group.add(trail) }
        const smoke: THREE.Mesh[] = []
        for (let i = 0; i < 5; i++) {
          const puff = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), new THREE.MeshBasicMaterial({ color: '#303237', transparent: true, opacity: 0 }))
          puff.material.userData.dynamic = true; puff.raycast = () => {}; group.add(puff); smoke.push(puff)
        }
        const flash = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd868', transparent: true, opacity: 0 }))
        flash.material.userData.dynamic = true; flash.raycast = () => {}; group.add(flash)
        const pointAt = (frac: number) => { const d = frac * total; let i = 1; while (i < L.length - 1 && L[i] < d) i++; const u = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1); return [S[i - 1][0] + (S[i][0] - S[i - 1][0]) * u, S[i - 1][1] + (S[i][1] - S[i - 1][1]) * u, Math.atan2(S[i][1] - S[i - 1][1], S[i][0] - S[i - 1][0])] }
        const fracAt = (t: number) => interpolateKeys(keys, t)
        update = (t) => {
          const start = Math.max(from, keys[0]?.[0] ?? from); const a = (ctx.dim < 1 ? 1 : fadeAt(t, start, to)) * ctx.dim; group.visible = a > 0; sym.style.opacity = String(a)
          const dead = mv.destroyed != null && t >= mv.destroyed
          const frac = fracAt(dead ? mv.destroyed! : t); const [x, y, ang] = pointAt(frac)
          const h = scene.terrain.ground(x, y)
          obj.position.copy(toScene(x, y, h + 1.5)); px.position.copy(toScene(x, y, h + 4))
          sym.classList.toggle('dead', dead)
          const deadAge = dead ? t - mv.destroyed! : -1
          flash.visible = deadAge >= 0 && deadAge < 0.5; flash.position.copy(toScene(x, y, h + 4)); flash.scale.setScalar(1 + Math.max(0, deadAge) * 5); flash.material.opacity = a * (1 - clamp01(deadAge / 0.5))
          smoke.forEach((puff, i) => {
            const age = deadAge - i * 0.3, cycle = ((age % 3) + 3) % 3
            puff.visible = age >= 0; puff.position.copy(toScene(x + Math.sin(i * 2) * cycle * 2, y + Math.cos(i * 2) * cycle * 2, h + 4 + cycle * 9)); puff.scale.setScalar(1 + cycle * 1.2)
            ;(puff.material as THREE.MeshBasicMaterial).opacity = a * 0.45 * Math.sin(cycle / 3 * Math.PI)
          })
          const heading = -ang * 180 / Math.PI + 90; (sym.querySelector('.chev') as HTMLElement).style.transform = `rotate(${heading}deg) translateY(-18px)`
          if (trail) { const n = Math.max(2, Math.round((ctx.dim < 1 ? 1 : frac) * (S.length - 1)) + 1); (trail.geometry as any).instanceCount = n - 1 }
        }
        break
      }
      case 'cone': {
        const [a, b] = el.points.map(local), radius = Math.hypot(b[0] - a[0], b[1] - a[1]), heading = Math.atan2(b[1] - a[1], b[0] - a[0])
        const angle = THREE.MathUtils.degToRad(Math.max(10, Math.min(180, el.angle ?? 60)))
        const pts: [number, number][] = [a]
        for (let i = 0; i <= 48; i++) { const theta = heading - angle / 2 + angle * i / 48; pts.push([a[0] + radius * Math.cos(theta), a[1] + radius * Math.sin(theta)]) }
        const positions: number[] = [], indices: number[] = []
        for (const p of pts) positions.push(p[0], scene.terrain.ground(...p) + 0.6, -p[1])
        for (let i = 1; i < pts.length - 1; i++) indices.push(0, i, i + 1)
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setIndex(indices)
        group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, side: THREE.DoubleSide })))
        group.add(fatLine(scene, drapedLine(scene, pts, false, true), col, 2, true))
        const lab = label(el.name ?? '', 'pill'); lab.position.copy(toScene(a[0], a[1], scene.terrain.ground(...a) + 1)); addCss(lab)
        update = t => { const alpha = fadeAt(t, from, to) * ctx.dim; group.visible = alpha > 0; lab.element.style.opacity = String(alpha) }
        break
      }
      case 'mortar': {
        const [a, b] = el.points.map(local), length = Math.hypot(b[0] - a[0], b[1] - a[1]), apex = length * (el.height ?? 0.7)
        const flight = Math.max(0.01, el.flight ?? 1.2)
        const ha = scene.terrain.ground(a[0], a[1]) + 1, hb = scene.terrain.ground(b[0], b[1]) + 1
        const at = (u: number) => { const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u; return toScene(x, y, ha + (hb - ha) * u + 4 * apex * u * (1 - u)) }
        const effect = mortarEffect(at,from,to,flight); group.add(effect.group)
        group.add(fatLine(scene, drapedLine(scene, [a, b], false, false), '#ffffff', 1.2, true, 0.35))
        const lab = label(el.name ?? 'Mw', 'pill'); lab.position.copy(at(0)); addCss(lab)
        update = t => {
          const visible = ctx.dim < 1 || (t >= from && t <= to)
          group.visible = visible; lab.element.style.opacity = visible ? String(ctx.dim) : '0'
          effect.update(t,scene.container.clientWidth || 1,scene.container.clientHeight || 1,ctx.dim)
        }
        break
      }
      case 'marker': {
        const [x, y] = local(el.pos), h = scene.terrain.ground(x, y)
        const lab = el.symbol ? new CSS2DObject(document.createElement('div')) : label(`${({ contact: '⚠', breach: '↯', casualty: '✕' })[el.markerKind]} ${el.name ?? ''}`, `pill event-marker ${el.markerKind}`)
        if(el.symbol){const drawing=pointDrawing(el.symbol,el.side,el.status,el.designation);lab.element.className='puck swiss-puck';lab.element.innerHTML=`<div class="swiss-symbol">${symbolSvg(drawing)}</div><div class="lbl">${escapeText(el.name??'')}</div>`;lab.element.dataset.symbolDrawing=JSON.stringify(drawing)}
        lab.element.style.setProperty('--c', col); lab.position.copy(toScene(x, y, h + 2)); addCss(lab)
        const ring = fatLine(scene, drapedLine(scene, Array.from({ length: 33 }, (_, i) => [x + Math.cos(i * Math.PI / 16) * 5, y + Math.sin(i * Math.PI / 16) * 5] as [number, number]), false, true), col, 2, false); group.add(ring)
        update = t => { const alpha = fadeAt(t, from, to) * ctx.dim; group.visible = alpha > 0; lab.element.style.opacity = String(alpha) }
        break
      }
      case 'callout': {
        const c = el as Callout
        const [x, y] = local(c.pos)
        const div = document.createElement('div'); div.className = `callout ${c.color ?? 'amber'}`
        div.innerHTML = `<div class="leader"></div><div class="box"><div class="t">${escapeText(c.text)}</div>${c.sub ? `<div class="s">${escapeText(c.sub)}</div>` : ''}</div>`
        const [ox, oy] = c.offset ?? [140, -90]
        const box = div.querySelector('.box') as HTMLElement; box.style.transform = `translate(${ox}px, ${oy}px)`
        const leader = div.querySelector('.leader') as HTMLElement; const len = Math.hypot(ox, oy); leader.style.width = len + 'px'; leader.style.transform = `rotate(${Math.atan2(oy, ox)}rad)`
        const h = c.roof ? this.roofHeight(x, y) ?? scene.terrain.ground(x, y) : scene.terrain.ground(x, y)
        const obj = new CSS2DObject(div); obj.position.copy(toScene(x, y, h + 1)); addCss(obj)
        const px = proxy(8, 10); px.position.copy(toScene(x, y, h + 4)); group.add(px)
        const ring = new THREE.Mesh(new THREE.RingGeometry(2, 3, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(c.color === 'red' ? '#eb3232' : c.color === 'blue' ? '#288cff' : c.color === 'white' ? '#f0f0f0' : '#ffb020'), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.copy(toScene(x, y, h + 0.6)); ring.raycast = () => {}; group.add(ring)
        update = (t) => {
          const a = fadeAt(t, from, to) * ctx.dim; group.visible = a > 0; div.style.opacity = String(a)
          const target = c.attachTo ? this.items.get(c.attachTo) : null
          const anchor = target?.group.children.find(o => o instanceof CSS2DObject)
          if (anchor) { anchor.updateWorldMatrix(true, false); const world = anchor.getWorldPosition(new THREE.Vector3()); obj.position.copy(world); ring.position.copy(world); px.position.copy(world) }
          else { obj.position.copy(toScene(x, y, h + 1)); ring.position.copy(toScene(x, y, h + 0.6)) }
          let dx = ox, dy = oy
          if (c.follow === false) {
            const projected = obj.position.clone().project(scene.camera), W = scene.container.clientWidth, H = scene.container.clientHeight
            const fixed = c.screenPos ?? [0.7, 0.25]
            dx = fixed[0] * W - (projected.x + 1) * W / 2; dy = fixed[1] * H - (1 - projected.y) * H / 2
          }
          box.style.transform = `translate(${dx}px, ${dy}px)`
          leader.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`
          const w = ctx.dim < 1 ? 1 : smoothstep((t - from) / 0.4)
          leader.style.width = (Math.hypot(dx, dy) * w) + 'px'
          box.style.clipPath = `inset(0 ${100 - Math.round((ctx.dim < 1 ? 1 : smoothstep((t - from - 0.3) / 0.35)) * 100)}% 0 0)`
        }
        break
      }
    }

    const normalMats = new Map<THREE.Material, number>()
    group.traverse(o => { const mat = (o as THREE.Mesh).material as THREE.Material | undefined; if (!mat || mat === proxyMat) return; mat.depthTest = el.occlude !== false; mat.depthWrite = false; if (el.occlude === false) o.renderOrder = 100; if (!(mat instanceof THREE.ShaderMaterial) || mat instanceof LineMaterial) { mat.transparent = true; normalMats.set(mat, mat.opacity) } })
    const animate = update
    update = (t) => { animate(t); const a = fadeAt(t, from, to) * ctx.dim; for (const [mat, opacity] of normalMats) if (!mat.userData.dynamic) mat.opacity = opacity * a }
    const lineMats: LineMaterial[] = []
    group.traverse(o => { const m = (o as any).material; if (m instanceof LineMaterial) lineMats.push(m) })
    const highlight = (level: 0 | 1 | 2) => {
      for (const e of cssEls) { e.classList.toggle('hov', level === 1); e.classList.toggle('sel', level === 2) }
      for (const m of shaderMats) m.uniforms.hi.value = level === 2 ? 1 : level === 1 ? 0.5 : 0
      for (const m of lineMats) m.linewidth = m.userData.baseWidth * (level === 2 ? 1.8 : level === 1 ? 1.4 : 1)
    }
    return { el, group, ctx, update, highlight, dispose: () => { scene.overlays.remove(group); scene.lineMaterials = scene.lineMaterials.filter(m => !lineMats.includes(m)); group.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = (m as any).material; if (mat?.dispose && mat !== proxyMat) mat.dispose(); if ((o as any).element) (o as any).element.remove() }); disposers.forEach(d => d()) } }
  }

  private roofHeight(x: number, y: number): number | null {
    const ray = new THREE.Raycaster(toScene(x, y, 500), new THREE.Vector3(0, -1, 0))
    const hits = ray.intersectObjects(this.scene.buildingMeshes, false)
    return hits.length ? hits[0].point.y : null
  }
}
