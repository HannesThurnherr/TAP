import type {Element,Pt} from './types'
export function elementNodes(el:Element):Pt[] {
 if(el.kind==='unit'&&el.positionKeys?.length)return el.positionKeys.map(k=>k.pos)
 return 'points' in el?el.points:[el.pos]
}
export function dragElementNode(el:Element,index:number,delta:Pt,whole=false):Element {
 const move=(p:Pt):Pt=>[p[0]+delta[0],p[1]+delta[1]]
 if(whole){
  if('points' in el)return {...el,points:el.points.map(move)} as Element
  if(el.kind==='unit')return {...el,pos:move(el.pos),positionKeys:el.positionKeys?.map(k=>({...k,pos:move(k.pos)}))}
  return {...el,pos:move(el.pos)}
 }
 if(el.kind==='unit'&&el.positionKeys?.length)return {...el,pos:index===0?move(el.positionKeys[0].pos):el.pos,positionKeys:el.positionKeys.map((k,i)=>i===index?{...k,pos:move(k.pos)}:k)}
 if('points' in el)return {...el,points:el.points.map((p,i)=>i===index?move(p):p)} as Element
 return {...el,pos:move(el.pos)}
}
