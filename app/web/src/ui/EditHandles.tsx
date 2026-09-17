import {useEffect,useRef} from 'react'
import {useStore} from '../state/store'
import type {Element,Pt} from '../model/types'
import {elementNodes,dragElementNode} from '../model/geometryEdit'
import {Scene,toScene} from '../scene/Scene'
export function EditHandles({scene,element,onDragging}:{scene:Scene;element:Element;onDragging:(v:boolean)=>void}){
 const host=useRef<HTMLDivElement>(null)
 const drag=useRef<{original:Element;index:number;anchor:Pt;whole:boolean;pointer:number;button:HTMLButtonElement}|null>(null)
 const points=elementNodes(element)
 const center:Pt=[points.reduce((s,p)=>s+p[0],0)/points.length,points.reduce((s,p)=>s+p[1],0)/points.length]
 const nodes=[...points,center]
 function finish(commit:boolean){
  const d=drag.current;if(!d)return
  drag.current=null;useStore.getState().finishElementEdit(d.original,commit);onDragging(false)
  if(d.button.hasPointerCapture(d.pointer))d.button.releasePointerCapture(d.pointer)
 }
 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{if(drag.current&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(false)}}
  window.addEventListener('keydown',key,true)
  return()=>{window.removeEventListener('keydown',key,true);finish(false)}
 },[element.id])
 useEffect(()=>{
  let raf=0
  const loop=()=>{
   raf=requestAnimationFrame(loop)
   if(!host.current)return
   const rect=scene.container.getBoundingClientRect()
   nodes.forEach((p,i)=>{
    const b=host.current!.children[i] as HTMLElement;if(!b)return
    const [x,y]=scene.lv95ToLocal(p),v=toScene(x,y,scene.terrain.ground(x,y)+3).project(scene.camera)
    b.style.display=v.z>1||v.z< -1?'none':'block'
    b.style.left=((v.x+1)*rect.width/2)+'px';b.style.top=((1-v.y)*rect.height/2+(i===points.length?24:0))+'px'
   })
  };loop();return()=>cancelAnimationFrame(raf)
 },[scene,element])
 return <div className="edit-handles" ref={host}>{nodes.map((_,i)=><button key={i} title={i===points.length?'Ganzes Element verschieben':'Punkt '+(i+1)+' ziehen · Shift: ganzes Element · Esc: abbrechen'} aria-label={i===points.length?'Ganzes Element verschieben':'Kontrollpunkt '+(i+1)} onPointerDown={e=>{
  e.stopPropagation();if(e.button!==0)return
  const hit=scene.pick(e);if(!hit)return
  drag.current={original:element,index:i,anchor:scene.localToLV95(hit.x,hit.y),whole:i===points.length||e.shiftKey,pointer:e.pointerId,button:e.currentTarget}
  e.currentTarget.setPointerCapture(e.pointerId);useStore.getState().setPlaying(false);useStore.getState().setFollow(false);scene.controls.enabled=false;onDragging(true)
 }} onPointerMove={e=>{
  e.stopPropagation();const d=drag.current;if(!d)return
  const hit=scene.pick(e);if(!hit)return
  const p=scene.localToLV95(hit.x,hit.y)
  useStore.getState().previewElement(dragElementNode(d.original,d.index,[p[0]-d.anchor[0],p[1]-d.anchor[1]],d.whole))
 }} onPointerUp={e=>{e.stopPropagation();finish(true)}} onPointerCancel={()=>finish(false)} onLostPointerCapture={()=>finish(false)}>{i===points.length?'↔':i+1}</button>)}</div>
}
