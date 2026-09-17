import * as THREE from 'three'
import { mapRequest, mapResolution, mapUV, terrainBounds, GROUND_LAYER, type GroundMode, type MapDetail } from './mapProjection'
import type { DemMeta } from './HeightField'

export interface MapStatus { loading: boolean; error: string | null; resolution: number | null }

/** One georeferenced image shared by core and ring: no independent rescaling at their seam. */
export class MapGround {
  private mode: GroundMode = 'fui'
  private detail: MapDetail = 'auto'
  private originals: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[]; uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute; mapUV: THREE.BufferAttribute }[] = []
  private material = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, toneMapped: false })
  private textures = new Map<string, THREE.Texture>()
  private detailUniforms={tapDetail:{value:null as THREE.Texture|null},tapDetailRect:{value:new THREE.Vector4()},tapDetailEnabled:{value:0}}
  private detailTexture:THREE.Texture|null=null
  private detailErrorKey=''
  private detailKey=''
  private detailPending=''
  private detailAbort:AbortController|null=null
  private detailTimer:ReturnType<typeof setTimeout>|undefined
  private detailResolution:number|null=null
  private origin:{E:number;N:number}
  private currentKey = ''
  private pendingKey = ''
  private timer: ReturnType<typeof setTimeout> | undefined
  private request: AbortController | null = null
  private disposed = false
  private errorKey = ''
  private bounds
  private status: MapStatus = { loading: false, error: null, resolution: null }

  constructor(meshes: THREE.Mesh[], meta: DemMeta, private renderer: THREE.WebGLRenderer, private report: (status: MapStatus) => void) {
    this.bounds = terrainBounds(meta)
    this.origin={E:meta.E0,N:meta.N0}
    this.material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,this.detailUniforms)
      shader.fragmentShader='uniform sampler2D tapDetail; uniform vec4 tapDetailRect; uniform float tapDetailEnabled;\n'+shader.fragmentShader
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n#ifdef USE_MAP\nvec2 duv=(vMapUv-tapDetailRect.xy)/tapDetailRect.zw; if(tapDetailEnabled>0.5 && duv.x>=0.0 && duv.y>=0.0 && duv.x<=1.0 && duv.y<=1.0) {vec4 detailColor=texture2D(tapDetail,duv); float border=min(min(duv.x,duv.y),min(1.0-duv.x,1.0-duv.y)); diffuseColor=mix(diffuseColor,vec4(diffuse,opacity)*detailColor,smoothstep(0.0,0.02,border));}\n#endif')
    }
    for (const mesh of meshes) {
      const positions = mesh.geometry.getAttribute('position'), values = new Float32Array(positions.count * 2)
      for (let i = 0; i < positions.count; i++) {
        const [u, v] = mapUV(meta.E0 + positions.getX(i), meta.N0 - positions.getZ(i), this.bounds)
        values[i * 2] = u; values[i * 2 + 1] = v
      }
      this.originals.push({ mesh, material: mesh.material, uv: mesh.geometry.getAttribute('uv'), mapUV: new THREE.BufferAttribute(values, 2) })
    }
  }

  set(mode: GroundMode, detail: MapDetail) {
    if(this.mode!==mode||this.detail!==detail){
      this.detailAbort?.abort();clearTimeout(this.detailTimer);this.detailPending='';this.detailKey='';this.detailUniforms.tapDetailEnabled.value=0
    }
    this.mode = mode; this.detail = detail; this.errorKey = '';this.detailErrorKey=''
    if (mode === 'fui') {
      this.cancel()
      for (const o of this.originals) { o.mesh.material = o.material; o.mesh.geometry.setAttribute('uv', o.uv) }
      this.emit({ loading: false, error: null })
    } else if (this.material.map) this.apply()
  }

  private emit(patch: Partial<MapStatus>) { this.status = { ...this.status, ...patch }; if (!this.disposed) this.report({...this.status,loading:this.status.loading||!!this.detailPending||!!this.pendingKey,resolution:this.detailUniforms.tapDetailEnabled.value?this.detailResolution:this.status.resolution}) }
  private cancel() { clearTimeout(this.timer); this.timer = undefined; this.request?.abort(); this.request = null; this.pendingKey = '' }
  private apply() { for (const o of this.originals) { o.mesh.material = this.material; o.mesh.geometry.setAttribute('uv', o.mapUV) } }

  update(camera: THREE.PerspectiveCamera, target: THREE.Vector3) {
    if (this.mode === 'fui' || this.disposed) return
    const height = this.renderer.domElement.height
    const viewMpp = 2 * camera.position.distanceTo(target) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.max(1, height)
    this.updateDetail(camera,target,viewMpp)
    const req = mapRequest(this.bounds, mapResolution(this.detail, viewMpp), Math.min(4096, this.renderer.capabilities.maxTextureSize), GROUND_LAYER[this.mode])
    if (req.url === this.currentKey) { if (this.pendingKey) { this.cancel(); this.emit({ loading: false, error: null }) } return }
    if (req.url === this.pendingKey || req.url === this.errorKey) return
    this.cancel(); this.pendingKey = req.url
    this.emit({ loading: true, error: null })
    this.timer = setTimeout(() => { void this.load(req) }, 400)
  }

  private updateDetail(camera:THREE.PerspectiveCamera,target:THREE.Vector3,viewMpp:number){
    const distance=camera.position.distanceTo(target)
    const focusDistance=Math.min(distance,Math.max(15,Math.abs(camera.position.y-target.y)*2))
    const mpp=mapResolution(this.detail,viewMpp*focusDistance/Math.max(1,distance))
    const maxSize=Math.min(2048,this.renderer.capabilities.maxTextureSize)
    const baseResolution=Math.max(this.bounds[2]-this.bounds[0],this.bounds[3]-this.bounds[1])/Math.min(4096,this.renderer.capabilities.maxTextureSize)
    if(this.detail==='overview'||baseResolution<=mpp*1.2){
      const changed=!!this.detailPending||!!this.detailUniforms.tapDetailEnabled.value;this.detailAbort?.abort();clearTimeout(this.detailTimer);this.detailPending='';this.detailUniforms.tapDetailEnabled.value=0;if(changed)this.emit({});return
    }
    const focus=camera.position.clone().lerp(target,focusDistance/Math.max(1,distance))
    const span=mpp*maxSize,snap=span/4
    const e=Math.round((this.origin.E+focus.x)/snap)*snap,n=Math.round((this.origin.N-focus.z)/snap)*snap
    const b:[number,number,number,number]=[Math.max(this.bounds[0],e-span/2),Math.max(this.bounds[1],n-span/2),Math.min(this.bounds[2],e+span/2),Math.min(this.bounds[3],n+span/2)]
    if(b[2]<=b[0]||b[3]<=b[1])return
    const req=mapRequest(b,mpp,maxSize,GROUND_LAYER[this.mode as 'map'|'sat'])
    if(req.url===this.detailKey){const changed=!!this.detailPending||!this.detailUniforms.tapDetailEnabled.value;this.detailAbort?.abort();clearTimeout(this.detailTimer);this.detailPending='';this.detailUniforms.tapDetailEnabled.value=1;if(changed)this.emit({});return}
    if(req.url===this.detailPending||req.url===this.detailErrorKey)return
    this.detailAbort?.abort();clearTimeout(this.detailTimer);this.detailPending=req.url
    this.emit({error:null})
    this.detailTimer=setTimeout(async()=>{
      const controller=new AbortController();this.detailAbort=controller
      try{
        const response=await fetch(req.url,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])})
        if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw new Error('map unavailable')
        const url=URL.createObjectURL(await response.blob())
        let texture:THREE.Texture
        try{texture=await new THREE.TextureLoader().loadAsync(url)}finally{URL.revokeObjectURL(url)}
        if(controller.signal.aborted||this.disposed){texture.dispose();return}
        texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=this.renderer.capabilities.getMaxAnisotropy()
        const u0=mapUV(b[0],b[1],this.bounds),u1=mapUV(b[2],b[3],this.bounds)
        this.detailUniforms.tapDetailRect.value.set(u0[0],u0[1],u1[0]-u0[0],u1[1]-u0[1])
        this.detailUniforms.tapDetail.value=texture;this.detailTexture?.dispose();this.detailTexture=texture
        this.detailUniforms.tapDetailEnabled.value=1;this.detailKey=req.url;this.detailPending='';this.detailResolution=req.resolution
        this.emit({loading:false,error:null})
      }catch{if(!controller.signal.aborted&&!this.disposed){this.detailErrorKey=req.url;this.detailPending='';this.emit({loading:false,error:'Detailkarte konnte nicht geladen werden.'})}}
    },180)
  }

  private async load(req: ReturnType<typeof mapRequest>) {
    const controller = new AbortController(); this.request = controller
    try {
      let texture = this.textures.get(req.url)
      if (!texture) {
        const response = await fetch(req.url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) })
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('map unavailable')
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        try { texture = await new THREE.TextureLoader().loadAsync(url) } finally { URL.revokeObjectURL(url) }
        if (controller.signal.aborted || this.disposed) { texture.dispose(); return }
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
        texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter
        texture.generateMipmaps = true
        this.textures.set(req.url, texture)
      }
      if (controller.signal.aborted || this.disposed) return
      this.material.map = texture; this.material.needsUpdate = true
      this.currentKey = req.url; this.pendingKey = ''; this.request = null
      this.apply()
      // At most two decoded map images retained, including the currently visible one.
      this.textures.delete(req.url); this.textures.set(req.url, texture)
      while (this.textures.size > 2) { const key = this.textures.keys().next().value!; this.textures.get(key)!.dispose(); this.textures.delete(key) }
      this.emit({ loading: false, error: null, resolution: req.resolution })
    } catch {
      if (controller.signal.aborted || this.disposed) return
      this.errorKey = req.url; this.pendingKey = ''; this.request = null
      this.emit({ loading: false, error: 'Karte konnte nicht geladen werden. Erneut versuchen.' })
    }
  }

  dispose() {
    this.disposed = true; this.cancel();this.detailAbort?.abort();clearTimeout(this.detailTimer);this.detailTexture?.dispose()
    for (const o of this.originals) { o.mesh.material = o.material; o.mesh.geometry.setAttribute('uv', o.uv) }
    for (const t of this.textures.values()) t.dispose()
    this.textures.clear(); this.material.dispose()
  }
}
