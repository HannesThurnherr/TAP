import * as THREE from 'three'

// Tracer streaks along a fire path: N thin camera-facing ribbons (one per lateral lane), each showing one glowing
// head with a fading tail. Bullet speed ~800 m/s, so a 200 m stripe is crossed in a quarter second; the tail is
// the streak the eye keeps (~20 m). Deterministic per element id (fnv1a -> mulberry32), as in render.py.
const SPEED = 800          // m/s
const RATE = 9             // tracers per second per stripe
const TAIL = 22            // m visible streak

function fnv1a(s: string) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) } return h >>> 0 }
function mulberry32(a: number) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

const VERT = `attribute vec3 tangent; attribute float along, across; uniform vec2 viewport; uniform float widthPx; varying float vAlong, vAcross;
  void main(){ vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); vec4 q = projectionMatrix * modelViewMatrix * vec4(position + tangent, 1.0);
    vec2 d = (q.xy / max(q.w, 0.001) - p.xy / max(p.w, 0.001)) * viewport; d = length(d) > 0.0001 ? normalize(d) : vec2(1.0, 0.0);
    p.xy += vec2(-d.y, d.x) * across * widthPx * 2.0 / viewport * p.w; gl_Position = p; vAlong = along; vAcross = across; }`
const FRAG = `uniform float head, tail, fade; varying float vAlong, vAcross;
  void main(){ float back = head - vAlong; if (back < 0.0 || back > tail) discard;
    float t = back / tail;                       // 0 at the head, 1 at the tail end
    float x = abs(vAcross);
    float core = exp(-x * x * 90.0) * (1.0 - t * t);
    float glow = exp(-x * x * 6.0) * 0.45 * (1.0 - t);
    vec3 col = mix(vec3(1.0, 0.86, 0.35), vec3(1.0, 0.98, 0.85), core);
    gl_FragColor = vec4(col, (core + glow) * fade); }`

/** at(u, lateral) returns the scene point at fraction u along the path, offset laterally by `lateral` metres */
export function tracerEffect(id: string, at: (u: number, lateral: number) => THREE.Vector3, lengthM: number, width: number, lanes = 6) {
  const group = new THREE.Group()
  const rnd = mulberry32(fnv1a(id))
  const count = Math.max(24, Math.round(lengthM / 3))
  const items: { mat: THREE.ShaderMaterial; phase: number; lane: number }[] = []
  for (let l = 0; l < lanes; l++) {
    const lateral = (rnd() - 0.5) * width * 0.8
    const pos: number[] = [], tan: number[] = [], along: number[] = [], across: number[] = [], idx: number[] = []
    for (let i = 0; i <= count; i++) {
      const u = i / count, p = at(u, lateral)
      const tg = at(Math.min(1, u + 0.01), lateral).sub(at(Math.max(0, u - 0.01), lateral)).normalize()
      for (const s of [-1, 1]) { pos.push(p.x, p.y, p.z); tan.push(tg.x, tg.y, tg.z); along.push(u); across.push(s) }
      if (i < count) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2) }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('tangent', new THREE.Float32BufferAttribute(tan, 3))
    geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1)); geo.setAttribute('across', new THREE.Float32BufferAttribute(across, 1)); geo.setIndex(idx)
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { viewport: { value: new THREE.Vector2(1, 1) }, widthPx: { value: 2.2 }, head: { value: -1 }, tail: { value: TAIL / Math.max(1, lengthM) }, fade: { value: 1 } },
      vertexShader: VERT, fragmentShader: FRAG })
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 22; mesh.raycast = () => {}
    group.add(mesh)
    items.push({ mat, phase: rnd(), lane: l })
  }
  const flight = lengthM / SPEED                        // seconds shooter -> target
  const period = lanes / RATE                           // each lane fires every `period` seconds
  return {
    group,
    update(t: number, width: number, height: number, fade: number, from: number) {
      for (const it of items) {
        const local = (t - from) + it.phase * period
        const k = Math.floor(local / period), tt = local - k * period   // time since this lane's last shot
        // head position beyond 1 keeps the tail visible until it leaves the far end
        const head = tt <= flight + TAIL / SPEED ? tt / flight : -1
        it.mat.uniforms.head.value = head
        it.mat.uniforms.fade.value = fade
        it.mat.uniforms.viewport.value.set(width, height)
      }
    },
    dispose() { for (const m of group.children) { (m as THREE.Mesh).geometry.dispose(); ((m as THREE.Mesh).material as THREE.Material).dispose() } },
  }
}
