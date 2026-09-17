import type {Pt} from '../model/types'
import type {TacticalLine,TacticalArea} from './catalog'
export interface Stroke {points:Pt[];closed?:boolean;fill?:boolean;dashed?:boolean}
const len=(a:Pt,b:Pt)=>Math.hypot(b[0]-a[0],b[1]-a[1])
/** Arc-length stations keep decorations spaced consistently through corners. */
export function stations(points:Pt[],spacing:number,closed=false){
 const ps=closed?[...points,points[0]]:points,dist=[0];for(let i=1;i<ps.length;i++)dist.push(dist[i-1]+len(ps[i-1],ps[i]))
 const total=dist.at(-1)??0,out:{p:Pt;t:Pt}[]=[]
 if(total<.001)return out
 const count=Math.max(1,Math.min(400,Math.floor(total/Math.max(1,spacing))))
 for(let k=0;k<count;k++){const d=(k+.5)*total/count;let i=1;while(i<ps.length-1&&dist[i]<d)i++;const a=ps[i-1],b=ps[i],l=len(a,b)||1,u=(d-dist[i-1])/l;out.push({p:[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u],t:[(b[0]-a[0])/l,(b[1]-a[1])/l]})}
 return out
}
export function tacticalLine(code:TacticalLine,points:Pt[],scale=20,flip=false):Stroke[]{
 if(points.length<2)return []
 const w=Math.max(1,scale),out:Stroke[]=[],sign=flip?-1:1
 const path=(ps:Pt[],fill=false)=>out.push({points:ps,fill,closed:fill})
 const at=(p:Pt,t:Pt,x:number,y:number):Pt=>[p[0]+t[0]*x-t[1]*y*sign,p[1]+t[1]*x+t[0]*y*sign]
 const start=points[0],end=points.at(-1)!,prev=points.at(-2)!,dl=len(prev,end)||1,t:Pt=[(end[0]-prev[0])/dl,(end[1]-prev[1])/dl]
 if(code==='observe') {const range=len(start,end),dir:Pt=[(end[0]-start[0])/(range||1),(end[1]-start[1])/(range||1)];path([at(start,dir,-w*.5,-w*.4),at(start,dir,0,w*.5),at(start,dir,w*.5,-w*.4),at(start,dir,-w*.5,-w*.4)]);path([at(end,dir,0,.3*range),at(start,dir,w*.9,0),at(end,dir,0,-.3*range)]);return out}
 if(!['fortified','front','wire'].includes(code))path(points)
 if(['movement','motorized','mechanized','withdrawal'].includes(code)){
  path([at(end,t,-w,.4*w),end,at(end,t,-w,-.4*w)])
  if(code==='withdrawal'){
   const a=points[0],b=points[1],l=len(a,b)||1,dir:Pt=[(b[0]-a[0])/l,(b[1]-a[1])/l]
   path(Array.from({length:17},(_,i)=>{const angle=-Math.PI/2+i*Math.PI/16;return at(a,dir,-Math.cos(angle)*w,w+Math.sin(angle)*w)}))
  }
  if(code==='motorized'||code==='mechanized'){
   const mid=stations(points,1e9)[0];if(mid){const {p,t}=mid
    if(code==='motorized')for(const x of [-w*.3,w*.3])path(Array.from({length:17},(_,i)=>at(p,t,x+Math.cos(i*Math.PI/8)*w*.14,-w*.3+Math.sin(i*Math.PI/8)*w*.14)))
    else path(Array.from({length:25},(_,i)=>at(p,t,Math.cos(i*Math.PI/12)*w*.55,-w*.4+Math.sin(i*Math.PI/12)*w*.16)))
   }
  }
 }
 if(code==='boundary'){const mid=stations(points,1e9)[0];if(mid){path([at(mid.p,mid.t,-.2*w,-.2*w),at(mid.p,mid.t,.2*w,.2*w)]);path([at(mid.p,mid.t,-.2*w,.2*w),at(mid.p,mid.t,.2*w,-.2*w)])}}
 if(code==='fireDirection')path(Array.from({length:25},(_,i)=>at(end,t,Math.cos(i*Math.PI/12)*w*.25,Math.sin(i*Math.PI/12)*w*.25)),true)
 if(code==='wire')for(const {p,t} of stations(points,w*.7)){path([at(p,t,-w*.2,-w*.2),at(p,t,w*.2,w*.2)]);path([at(p,t,-w*.2,w*.2),at(p,t,w*.2,-w*.2)])}
 if(code==='antiTankBarrier')for(const {p,t} of stations(points,w*.7))path([at(p,t,-w*.3,0),at(p,t,0,w*.6),at(p,t,w*.3,0)],true)
 if(code==='barrier')for(const {p,t} of stations(points,w*.55))path([p,at(p,t,0,w*.4)])
 if(code==='front')for(const {p,t} of stations(points,w))path(Array.from({length:13},(_,i)=>at(p,t,Math.cos(i*Math.PI/12)*w*.5,Math.sin(i*Math.PI/12)*w*.5)))
 if(code==='fortified')for(const {p,t} of stations(points,w))path([at(p,t,-w*.5,0),at(p,t,-w*.25,0),at(p,t,-w*.25,w*.5),at(p,t,w*.25,w*.5),at(p,t,w*.25,0),at(p,t,w*.5,0)])
 return out
}
export function tacticalArea(code:TacticalArea,points:Pt[],scale=20):Stroke[]{
 if(points.length<3)return []
 const out:Stroke[]=[{points,closed:true}]
 if(code==='strongpoint'){
  // Positive polygon winding has its outside on the right of an edge.
  const signed=points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[1]-q[0]*p[1]},0),sign=signed>=0?-1:1
  for(const {p,t} of stations(points,scale*.55,true))out.push({points:[p,[p[0]-t[1]*scale*.4*sign,p[1]+t[0]*scale*.4*sign]]})
 }
 if(code==='keyTerrain'){
  // Circle on the northern boundary; the source's C/Pt arrows are construction annotations.
  const p=points.reduce((a,b)=>a[1]>b[1]?a:b),r=scale*.7
  out.push({points:Array.from({length:25},(_,i)=>[p[0]+Math.cos(i*Math.PI/12)*r,p[1]+Math.sin(i*Math.PI/12)*r]),closed:true})
 }
 return out
}
