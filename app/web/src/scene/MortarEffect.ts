import * as THREE from 'three'
import { mortarState } from '../model/timing'

/** Fixed geometry, continuous shader clipping: no changing instance counts or degenerate head segments. */
export function mortarEffect(at: (u: number) => THREE.Vector3, from: number, to: number, flight: number) {
  const group = new THREE.Group(), count = 192
  const positions: number[] = [], tangents: number[] = [], along: number[] = [], across: number[] = [], indices: number[] = []
  for (let i = 0; i <= count; i++) {
    const u = i/count, p = at(u), tangent = at(Math.min(1,u+0.001)).sub(at(Math.max(0,u-0.001))).normalize()
    for (const side of [-1,1]) { positions.push(...p.toArray()); tangents.push(...tangent.toArray()); along.push(u); across.push(side) }
    if (i < count) { const j = i*2; indices.push(j,j+1,j+2,j+1,j+3,j+2) }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3)); geometry.setAttribute('tangent', new THREE.Float32BufferAttribute(tangents,3)); geometry.setAttribute('along', new THREE.Float32BufferAttribute(along,1)); geometry.setAttribute('across', new THREE.Float32BufferAttribute(across,1)); geometry.setIndex(indices)
  const material = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, side:THREE.DoubleSide, blending:THREE.AdditiveBlending,
    uniforms:{ viewport:{value:new THREE.Vector2(1,1)}, progress:{value:0}, fade:{value:1}, flying:{value:1} },
    vertexShader:`attribute vec3 tangent; attribute float along, across; uniform vec2 viewport; varying float vAlong,vAcross;
    void main(){ vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); vec4 q=projectionMatrix*modelViewMatrix*vec4(position+tangent,1.0);
      vec2 d=(q.xy/max(q.w,0.001)-p.xy/max(p.w,0.001))*viewport; d=length(d)>0.0001?normalize(d):vec2(1.,0.);
      p.xy+=vec2(-d.y,d.x)*across*8.0*2.0/viewport*p.w; gl_Position=p; vAlong=along; vAcross=across; }`,
    fragmentShader:`uniform float progress,fade,flying; varying float vAlong,vAcross;
      void main(){ if(vAlong>progress) discard; float x=abs(vAcross); float core=exp(-x*x*180.); float glow=exp(-x*x*5.)*0.36;
        float alpha=(core+glow)*(flying>0.5?1.:0.43)*fade; gl_FragColor=vec4(mix(vec3(1.,.64,.12),vec3(1.,.97,.82),core),alpha); }`
  })
  const trail = new THREE.Mesh(geometry,material); trail.frustumCulled=false; trail.renderOrder=20; group.add(trail)
  function light(size:number) {
    const mat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
      uniforms:{ viewport:{value:new THREE.Vector2(1,1)}, size:{value:size}, fade:{value:1} },
      vertexShader:`uniform vec2 viewport; uniform float size; varying vec2 vUv; void main(){ vUv=uv; vec4 p=projectionMatrix*modelViewMatrix*vec4(0.,0.,0.,1.); p.xy+=position.xy*size*2./viewport*p.w; gl_Position=p; }`,
      fragmentShader:`uniform float fade; varying vec2 vUv; void main(){ float r=length(vUv-.5)*2.; float core=exp(-r*r*40.); float glow=exp(-r*r*4.); gl_FragColor=vec4(mix(vec3(1.,.65,.14),vec3(1.,.99,.9),core), (core+glow*.6)*fade); }`
    })
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),mat); mesh.frustumCulled=false; mesh.renderOrder=21; mesh.raycast=()=>{}; group.add(mesh); return mesh
  }
  const shot=light(24), flash=light(44)
  return { group, update(time:number, width:number,height:number,dim:number) {
    const state=mortarState(time,from,to,flight), preview=dim<1
    group.visible=preview||state.visible
    material.uniforms.viewport.value.set(width,height); material.uniforms.progress.value=preview?1:state.progress; material.uniforms.fade.value=dim; material.uniforms.flying.value=state.flying&&!preview?1:0
    shot.visible=state.flying&&!preview; shot.position.copy(at(state.progress)); shot.material.uniforms.viewport.value.set(width,height)
    flash.visible=state.flash>0&&!preview; flash.position.copy(at(0)); flash.material.uniforms.viewport.value.set(width,height); flash.material.uniforms.fade.value=state.flash; flash.material.uniforms.size.value=24+state.flash*28
  } }
}
