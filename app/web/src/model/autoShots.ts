import { CatmullRomCurve3, Vector3 } from 'three'
import type { Config, Element, Pt, ShotOrbit, Mover } from './types'
import { elementWindow } from './types.ts'
import { arrowTimes, moverKeys, interpolateKeys, unitPosition } from './timing.ts'

function fractions(points: Pt[]) {
  const lengths=[0]
  for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]))
  return lengths.map(l=>l/(lengths.at(-1)||1))
}
function vehicleKeys(e:Mover,duration:number){return moverKeys(e,fractions(e.points),duration).slice().sort((a,b)=>a[0]-b[0])}
function vehiclePoints(e:Mover,start:number,end:number,duration:number):Pt[] {
  const keys=vehicleKeys(e,duration),dead=e.destroyed??Infinity
  const times=[start,end,...keys.map(k=>k[0]).filter(t=>t>start&&t<end)].map(t=>Math.min(t,dead))
  const progress=times.map(t=>interpolateKeys(keys,t)),lo=Math.min(...progress),hi=Math.max(...progress)
  const f=fractions(e.points)
  const curve=e.smooth!==false&&e.points.length>2?new CatmullRomCurve3(e.points.map(p=>new Vector3(p[0],0,p[1])),false,'catmullrom',.5):null
  const at=(u:number):Pt=>{
    if(curve){const p=curve.getPointAt(u);return [p.x,p.z]}
    let i=1;while(i<f.length-1&&f[i]<u)i++
    const a=e.points[i-1],b=e.points[i],v=(u-f[i-1])/(f[i]-f[i-1]||1)
    return [a[0]+(b[0]-a[0])*v,a[1]+(b[1]-a[1])*v]
  }
  return [...Array.from({length:33},(_,i)=>at(lo+(hi-lo)*i/32)),...f.filter(u=>u>=lo&&u<=hi).map(at)]
}

export function framingPoints(elements:Element[],start=0,end=Infinity,config?:Config):Pt[] {
  return elements.flatMap(e=>{
    if(e.kind==='unit')return [unitPosition(e,start),unitPosition(e,end),...(e.positionKeys??[]).filter(k=>k.time>start&&k.time<end).map(k=>k.pos)]
    if(e.kind==='mover')return vehiclePoints(e,start,end,config?.duration??end)
    if(e.kind==='callout'&&e.attachTo&&config){const target=config.elements.find(t=>t.id===e.attachTo&&(t.kind==='unit'||t.kind==='mover'));if(target)return framingPoints([target],start,end,config)}
    return 'points' in e?e.points:[e.pos]
  })
}
function changes(e:Element,start:number,end:number,config:Config):boolean {
  const event=(t:number|null|undefined)=>t!=null&&t>=start&&t<end
  if(e.kind==='unit') {
    const keys=e.positionKeys??[]
    if(keys.some((k,i)=>i>0&&k.time>start&&keys[i-1].time<end&&(k.pos[0]!==keys[i-1].pos[0]||k.pos[1]!==keys[i-1].pos[1])))return true
  }
  if(e.kind==='mover') {
    const keys=vehicleKeys(e,config.duration)
    if(event(e.destroyed)||keys.some((k,i)=>i>0&&k[0]>start&&keys[i-1][0]<end&&keys[i-1][1]!==k[1]&&(e.destroyed??Infinity)>start))return true
  }
  if(e.kind==='fire'||e.kind==='mortar'||e.kind==='callout')return true
  if(e.kind==='zone'&&event(e.active))return true
  if(e.kind==='move'&&e.animation!=='static'){const [a,b]=arrowTimes(e,config.duration);if(a<end&&b>start)return true}
  // Untimed background lines/areas are context, not activity in every phase.
  return e.from!=null&&e.from>0&&event(e.from)
}

export function fitShot(config:Config,start:number,end:number,aspect=16/9,ids?:string[],padding=1.2,ground:(p:Pt)=>number=()=>0,sweep=24):Omit<ShotOrbit,'id'> {
  const visible=config.elements.filter(e=>{const [a,b]=elementWindow(e,config);return Math.max(a,e.kind==='mover'?(vehicleKeys(e,config.duration)[0]?.[0]??a):a)<end&&b>start})
  const active=visible.filter(e=>changes(e,start,end,config))
  const chosen=ids?.length?visible.filter(e=>ids.includes(e.id)):active.length?active:visible
  const points=framingPoints(chosen,start,end,config)
  if(!points.length)points.push([config.area.E0-80,config.area.N0-80],[config.area.E0+80,config.area.N0+80])
  const east=points.map(p=>p[0]),north=points.map(p=>p[1])
  const center:Pt=[(Math.min(...east)+Math.max(...east))/2,(Math.min(...north)+Math.max(...north))/2]
  const base=ground(center)
  const spatial=points.map(p=>[p[0]-center[0],p[1]-center[1],ground(p)-base])
  for(const e of chosen){
    if(e.kind==='mortar'){
      const a=e.points[0],b=e.points[1]
      spatial.push([(a[0]+b[0])/2-center[0],(a[1]+b[1])/2-center[1],Math.max(ground(a),ground(b))-base+Math.hypot(a[0]-b[0],a[1]-b[1])*(e.height??.7)])
    }
    if(e.kind==='cone'){
      const a=e.points[0],b=e.points[1],r=Math.hypot(b[0]-a[0],b[1]-a[1]),heading=Math.atan2(b[1]-a[1],b[0]-a[0]),angle=(e.angle??60)*Math.PI/180
      for(let i=0;i<=12;i++){const t=heading-angle/2+angle*i/12,p:Pt=[a[0]+r*Math.cos(t),a[1]+r*Math.sin(t)];spatial.push([p[0]-center[0],p[1]-center[1],ground(p)-base])}
    }
  }
  const a0=225-sweep/2,a1=225+sweep/2,elevation=35*Math.PI/180,ce=Math.cos(elevation),se=Math.sin(elevation)
  const tanH=.75,tanV=tanH/Math.max(.1,aspect)
  let distance=120
  // Fit actual projected extents throughout the orbit, rather than a bounding sphere.
  for(let i=0;i<=16;i++){
    const a=(a0+(a1-a0)*i/16)*Math.PI/180,c=Math.cos(a),s=Math.sin(a)
    for(const [x,y,z] of spatial){
      const depth=ce*(x*c+y*s)+se*z,right=-x*s+y*c,up=-se*(x*c+y*s)+ce*z
      distance=Math.max(distance,depth+Math.max((Math.abs(right)+18)/tanH,(Math.abs(up)+25)/tanV)*padding)
    }
  }
  return {kind:'orbit',start,end,center,radius:distance*ce,alt:distance*se,a0,a1}
}

export function generateShots(config:Config,aspect=16/9,padding=1.2,ground?:(p:Pt)=>number,sweep=24):ShotOrbit[] {
  const boundaries=[...new Set([0,config.duration,...config.phases.flatMap(p=>[p.start,p.end])].filter(t=>Number.isFinite(t)&&t>=0&&t<=config.duration))].sort((a,b)=>a-b)
  const cuts=boundaries.flatMap((a,i)=>{const b=boundaries[i+1];if(b===undefined)return [a];const n=Math.ceil((b-a)/24);return Array.from({length:n},(_,j)=>a+(b-a)*j/n)})
  return cuts.slice(0,-1).map((start,i)=>({id:`auto-${i+1}`,...fitShot(config,start,cuts[i+1],aspect,undefined,padding,ground,sweep)}))
}
