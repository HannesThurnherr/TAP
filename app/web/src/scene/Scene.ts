import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { HeightField, Terrain } from './HeightField'
import { MapGround, type MapStatus } from './MapGround'
import { fuiGroundMaterial } from './FuiGround'
import { gridLabels } from './GridLabels'
import type { GroundMode, MapDetail } from './mapProjection'
import type { Area, Pt, Shot } from '../model/types'
import type { AreaPackage, Building, EdgeSet } from '../services/areaLoader'

export type { Building, EdgeSet }

// three.js frame: x = east, y = up, z = south (-north). Local metres from the area centre, heights relative to Z0.
export const toScene = (x: number, y: number, h: number) => new THREE.Vector3(x, h, -y)

export class Scene {
  renderer: THREE.WebGLRenderer
  labelRenderer: CSS2DRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  terrain!: Terrain
  area!: Area
  root = new THREE.Group()        // terrain + buildings
  overlays = new THREE.Group()    // elements
  pickables: THREE.Object3D[] = []
  lineMaterials: LineMaterial[] = []
  buildingMeshes: THREE.Mesh[] = []
  private buildingShift = new Map<string, number>()
  private raycaster = new THREE.Raycaster()
  private terrainMeshes: THREE.Mesh[] = []
  private gridLabelMesh: THREE.Mesh | null = null
  private mapGround: MapGround | null = null
  private edgeMaterial: LineMaterial | null = null
  onMapStatus: (status: MapStatus) => void = () => {}
  private groundMode: GroundMode = 'fui'
  private mapDetail: MapDetail = 'auto'
  private disposed = false
  private resizeObserver: ResizeObserver

  constructor(public container: HTMLElement, opts: { pixelRatio?: number } = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(opts.pixelRatio ?? Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.AgXToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.domElement.style.display = 'block'
    container.appendChild(this.renderer.domElement)

    this.labelRenderer = new CSS2DRenderer()
    Object.assign(this.labelRenderer.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' })
    container.appendChild(this.labelRenderer.domElement)

    // 24 mm lens on a 36 mm sensor, horizontal fit -> vertical fov depends on aspect
    this.camera = new THREE.PerspectiveCamera(45, 16 / 9, 1, 500000)
    this.camera.position.set(-300, 210, 300)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.12
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02
    this.controls.minDistance = 15
    this.controls.maxDistance = 300000
    this.controls.target.set(0, 0, 0)

    this.scene.add(this.root, this.overlays)
    this.buildSky()
    this.buildLights()
    this.resize()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
  }

  setLens(mm: number) {
    const hfov = 2 * Math.atan(18 / mm)
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / this.camera.aspect)
    this.camera.fov = THREE.MathUtils.radToDeg(vfov)
    this.camera.updateProjectionMatrix()
  }

  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = w + 'px'
    this.renderer.domElement.style.height = h + 'px'
    this.labelRenderer.setSize(w, h)
    this.camera.aspect = w / h
    this.setLens(24)
    for (const m of this.lineMaterials) m.resolution.set(w, h)
  }

  private buildSky() {
    // vertical gradient: muted blue-grey haze at the horizon, dark slate at the zenith (as the Blender world ramp)
    const geo = new THREE.SphereGeometry(450000, 32, 16)
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x1a2028) }, horizon: { value: new THREE.Color(0x8c9eab) } },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float t = clamp(normalize(vP).y * 3.2, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, t), 1.0); }`,
      toneMapped: false,
    })
    const sky = new THREE.Mesh(geo, mat)
    sky.renderOrder = -10
    this.scene.add(sky)
    this.scene.fog = new THREE.Fog(0x8c9eab, 1800, 6000)
  }

  private buildLights() {
    // sun from compass 345° (NNW), 18° elevation, as measured in the films
    const az = THREE.MathUtils.degToRad(345), el = THREE.MathUtils.degToRad(18)
    const sun = new THREE.DirectionalLight(0xffffff, 2.2)
    sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(1000)
    this.scene.add(sun)
    this.scene.add(new THREE.HemisphereLight(0x4d6175, 0x0d1116, 0.55))
  }

  /** replace terrain, buildings and edges with a new area package */
  async loadPackage(pkg: AreaPackage) {
    this.area = pkg.area
    this.terrain = new Terrain(pkg.core, pkg.outer)
    // drop the previous world
    this.mapGround?.dispose(); this.mapGround = null
    for (const o of [...this.root.children]) { this.root.remove(o); (o as THREE.Mesh).geometry?.dispose(); const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && m !== this.edgeMaterial) { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose() } }
    this.terrainMeshes = []; this.buildingMeshes = []; this.buildingShift.clear()
    if (this.edgeMaterial) { this.lineMaterials = this.lineMaterials.filter(m => m !== this.edgeMaterial); this.edgeMaterial.dispose(); this.edgeMaterial = null }

    // Generate the grid from absolute LV95 coordinates for every area, including
    // the legacy Äuli package whose baked texture used an area-relative grid.
    const groundMaterial = (hf: HeightField, zoff = 0) => fuiGroundMaterial(hf.meta.E0, hf.meta.N0, hf.meta.Z0 - zoff)
    this.root.add(this.terrainMesh(pkg.core, 0, groundMaterial(pkg.core), null))
    if (pkg.outer) this.root.add(this.terrainMesh(pkg.outer, -1, groundMaterial(pkg.outer, -1), pkg.ground.kind === 'texture' ? (pkg.core.meta.half ?? 500) - 30 : null))
    this.gridLabelMesh = gridLabels(this.terrain)
    this.gridLabelMesh.visible = this.groundMode === 'fui'
    this.root.add(this.gridLabelMesh)
    const span = Math.max(...this.spanXY())
    this.scene.fog = new THREE.Fog(0x8c9eab, Math.max(1800, span * 1.2), Math.max(6000, span * 4))
    this.mapGround = new MapGround(this.terrainMeshes, (pkg.outer ?? pkg.core).meta, this.renderer, s => this.onMapStatus(s))
    this.mapGround.set(this.groundMode, this.mapDetail)
    this.buildBuildings(pkg.buildings)
    this.buildEdges(pkg.edges)
  }

  /** width / height of the core terrain in metres */
  spanXY(): [number, number] { const [x0, y0, x1, y1] = this.terrain.core.extent(); return [x1 - x0, y1 - y0] }

  setGround(mode: GroundMode, detail: MapDetail) {
    this.groundMode = mode; this.mapDetail = detail
    if (this.gridLabelMesh) this.gridLabelMesh.visible = mode === 'fui'
    this.mapGround?.set(mode, detail)
  }

  private terrainMesh(hf: HeightField, zoff: number, mat: THREE.Material, hole: number | null) {
    const { rows, cols, step, Z0, E0, N0 } = hf.meta
    const west = hf.west - E0, north = hf.north - N0   // local metres
    const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2)
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const x = west + c * step, y = north - r * step
      pos[i * 3] = x; pos[i * 3 + 1] = hf.data[i] - Z0 + zoff; pos[i * 3 + 2] = -y
      uv[i * 2] = c / (cols - 1); uv[i * 2 + 1] = 1 - r / (rows - 1)
    }
    const idx: number[] = []
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      if (hole !== null) { const x = west + (c + 0.5) * step, y = north - (r + 0.5) * step; if (Math.abs(x) < hole && Math.abs(y) < hole) continue }
      const i = r * cols + c
      if(hf.coverage && ![i,i+1,i+cols,i+cols+1].every(j=>hf.coverage![j])) continue
      idx.push(i, i + cols, i + 1, i + 1, i + cols, i + cols + 1)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, mat)
    mesh.userData.terrain = true
    this.terrainMeshes.push(mesh)
    return mesh
  }

  private buildBuildings(list: Building[]) {
    const Z0 = this.terrain.Z0
    const roofMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.40, 0.44, 0.50), roughness: 0.9, flatShading: true, side: THREE.DoubleSide })
    const wallMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.26, 0.29, 0.34), roughness: 0.9, flatShading: true, side: THREE.DoubleSide })
    const roof: number[] = [], wall: number[] = []
    for (const b of list) {
      const t = b.tris
      let minz = Infinity
      for (let i = 2; i < t.length; i += 3) minz = Math.min(minz, t[i])
      // live swisstopo buildings carry their own terrain alignment (dz); the Äuli extract uses the film rule (lowest vertex 0.3 m below terrain)
      const dz = b.dz !== undefined ? b.dz : (this.terrain.ground(b.cx, b.cy) - 0.3) - (minz - Z0)
      this.buildingShift.set(b.id, dz)
      const gz = this.terrain.ground(b.cx, b.cy) + 4
      for (let i = 0; i < t.length; i += 9) {
        const ax = t[i], ay = t[i + 1], az = t[i + 2] - Z0 + dz
        const bx = t[i + 3], by = t[i + 4], bz = t[i + 5] - Z0 + dz
        const cx = t[i + 6], cy = t[i + 7], cz = t[i + 8] - Z0 + dz
        // normal in local frame (x east, y north, z up)
        const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
        const len = Math.hypot(nx, ny, nz) || 1
        const target = Math.abs(nz / len) > 0.35 ? roof : wall
        // outward-facing winding: flip if the normal points towards the building centre
        const mx = (ax + bx + cx) / 3 - b.cx, my = (ay + by + cy) / 3 - b.cy, mz = (az + bz + cz) / 3 - gz
        if (nx * mx + ny * my + nz * mz < 0) target.push(ax, az, -ay, cx, cz, -cy, bx, bz, -by)
        else target.push(ax, az, -ay, bx, bz, -by, cx, cz, -cy)
      }
    }
    for (const [arr, mat] of [[roof, roofMat], [wall, wallMat]] as const) {
      if (!arr.length) continue
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3))
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo, mat)
      mesh.userData.building = true
      this.buildingMeshes.push(mesh)
      this.root.add(mesh)
    }
  }

  private buildEdges(list: EdgeSet[]) {
    const Z0 = this.terrain.Z0
    const pts: number[] = []
    for (const e of list) {
      const dz = this.buildingShift.get(e.id)
      if (dz === undefined) continue
      const s = e.segs
      for (let i = 0; i < s.length; i += 6) pts.push(s[i], s[i + 2] - Z0 + dz + 0.05, -s[i + 1], s[i + 3], s[i + 5] - Z0 + dz + 0.05, -s[i + 4])
    }
    if (!pts.length) return
    const geo = new LineSegmentsGeometry()
    geo.setPositions(pts)
    const mat = new LineMaterial({ color: 0xeafaff, linewidth: 1.6, worldUnits: false, depthTest: true, transparent: true, opacity: 0.95 })
    mat.toneMapped = false
    this.edgeMaterial = mat
    this.lineMaterials.push(mat)
    const lines = new LineSegments2(geo, mat)
    this.root.add(lines)
    this.resize()
  }

  /** ray from a pointer event -> terrain / building hit in local metres (x east, y north, h up) */
  pick(ev: { clientX: number; clientY: number }, targets: THREE.Object3D[] = [...this.terrainMeshes, ...this.buildingMeshes]) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const hits = this.raycaster.intersectObjects(targets, false)
    if (!hits.length) return null
    const h = hits[0]
    return { x: h.point.x, y: -h.point.z, h: h.point.y, building: !!h.object.userData.building, object: h.object }
  }

  pickOverlay(ev: { clientX: number; clientY: number }) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    this.raycaster.params.Line2 = { threshold: 6 }
    const hits = this.raycaster.intersectObjects(this.pickables, true)
    for (const h of hits) { let o: THREE.Object3D | null = h.object; while (o) { if (o.userData.elementId) return o.userData.elementId as string; o = o.parent } }
    return null
  }

  localToLV95(x: number, y: number): Pt { return [this.area.E0 + x, this.area.N0 + y] }
  lv95ToLocal(p: Pt): [number, number] { return [p[0] - this.area.E0, p[1] - this.area.N0] }

  /** camera from a shot at scenario time t (local metres). `poseOf` resolves follow targets (LV95 pos + heading). */
  applyShot(shot: Shot, t: number, poseOf?: (id: string) => { pos: Pt; heading: number } | null): boolean {
    const u = Math.min(Math.max((t - shot.start) / Math.max(1e-6, shot.end - shot.start), 0), 1)
    if (shot.kind === 'static') {
      const [lx, ly] = this.lv95ToLocal(shot.look)
      this.camera.position.copy(toScene(shot.pos[0], shot.pos[1], shot.pos[2]))
      this.controls.target.copy(toScene(lx, ly, this.terrain.ground(lx, ly)))
    } else if (shot.kind === 'follow') {
      const pose = poseOf?.(shot.target)
      if (!pose) return false
      const [tx, ty] = this.lv95ToLocal(pose.pos)
      const heading = Number.isFinite(pose.heading) ? pose.heading : (shot.bearing ?? 45) * Math.PI / 180
      const dist = shot.distance ?? 60, height = shot.height ?? 28, ahead = shot.lookAhead ?? 25
      const cx = tx - Math.cos(heading) * dist, cy = ty - Math.sin(heading) * dist
      const gz = this.terrain.ground(tx, ty)
      const camH = Math.max(this.terrain.ground(cx, cy) + 6, gz + height)
      this.camera.position.copy(toScene(cx, cy, camH))
      const lx = tx + Math.cos(heading) * ahead, ly = ty + Math.sin(heading) * ahead
      this.controls.target.copy(toScene(lx, ly, gz + 1.5))
    } else if (shot.kind === 'orbit') {
      const [cx, cy] = this.lv95ToLocal(shot.center)
      const a = THREE.MathUtils.degToRad(shot.a0 + (shot.a1 - shot.a0) * u)
      const cz = this.terrain.ground(cx, cy)
      this.camera.position.copy(toScene(cx + shot.radius * Math.cos(a), cy + shot.radius * Math.sin(a), cz + shot.alt))
      this.controls.target.copy(toScene(cx, cy, cz))
    } else {
      const e = u * u * (3 - 2 * u)
      const p = shot.p0.map((v, i) => v + (shot.p1[i] - v) * e)
      const l0 = this.lv95ToLocal(shot.look0), l1 = this.lv95ToLocal(shot.look1)
      const lx = l0[0] + (l1[0] - l0[0]) * e, ly = l0[1] + (l1[1] - l0[1]) * e
      this.camera.position.copy(toScene(p[0], p[1], p[2]))
      this.controls.target.copy(toScene(lx, ly, this.terrain.ground(lx, ly)))
    }
    this.camera.lookAt(this.controls.target)
    return true
  }

  /** oblique overview of the whole area; the camera looks along the area heading (0 = looking north) */
  frameAll(headingDeg = this.area?.heading ?? 0) {
    if (!this.terrain) return
    const [x0, y0, x1, y1] = this.terrain.core.extent()
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    const span = Math.max(x1 - x0, y1 - y0)
    const h = this.terrain.ground(cx, cy)
    const a = (90 - headingDeg) * Math.PI / 180   // compass heading -> math angle (0 = east, ccw)
    this.controls.target.copy(toScene(cx, cy, h))
    if(span>8000) {
      const halfV=THREE.MathUtils.degToRad(this.camera.fov/2),halfH=Math.atan(Math.tan(halfV)*this.camera.aspect)
      const distance=Math.hypot(x1-x0,y1-y0)/2/Math.sin(Math.min(halfV,halfH))*1.08
      this.camera.position.copy(toScene(cx-Math.cos(a)*distance*.57,cy-Math.sin(a)*distance*.57,h+distance*.822))
      this.camera.lookAt(this.controls.target);return
    }
    this.camera.position.copy(toScene(cx - Math.cos(a) * span * 0.57, cy - Math.sin(a) * span * 0.57, h + span * 0.26 + 60))
    this.camera.lookAt(this.controls.target)
  }

  render() {
    if (this.disposed) return
    if (this.controls.enabled) this.controls.update()
    this.mapGround?.update(this.camera, this.controls.target)
    this.renderer.render(this.scene, this.camera)
    this.labelRenderer.render(this.scene, this.camera)
  }

  dispose() { this.disposed = true; this.mapGround?.dispose(); this.resizeObserver.disconnect(); this.scene.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); const materials = Array.isArray(m.material) ? m.material : [m.material]; for (const mat of materials) if (mat) { const textured = mat as THREE.MeshStandardMaterial; textured.map?.dispose(); mat.dispose() } }); this.controls.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); this.labelRenderer.domElement.remove() }
}
