import * as THREE from 'three'
import type {UnitModel} from '../model/types'
/** The retained vehicle/trupp appearance, shared by new units and legacy movers. */
export function vehicleMarkup(kind:UnitModel,escapedName:string){
 const vehicle=['bmp','ifv','piranha','apc'].includes(kind),wheeled=['piranha','apc'].includes(kind)
 const mark=kind==='truck'?'<rect x="4" y="3" width="22" height="12" />':wheeled?'<path d="M4 9H26" />':'<path d="M4 3L26 15M26 3L4 15" />'
 const dots=({team:'•',squad:'••',platoon:'•••'} as Record<string,string>)[kind]??''
 return `<div class="box"><svg class="symbol" viewBox="0 0 30 18" fill="none" stroke="white" stroke-width="1.4">${mark}${vehicle?'<ellipse cx="15" cy="9" rx="10" ry="5.5" />':''}</svg><span class="rank">${dots}</span><div class="chev"></div></div><div class="lbl">${escapedName}</div>`
}
export function destructionEffect(){
 const group=new THREE.Group()
 const smoke=Array.from({length:5},()=>{const p=new THREE.Mesh(new THREE.SphereGeometry(3,8,6),new THREE.MeshBasicMaterial({color:'#303237',transparent:true,opacity:0}));p.material.userData.dynamic=true;p.raycast=()=>{};group.add(p);return p})
 const flash=new THREE.Mesh(new THREE.SphereGeometry(4,10,8),new THREE.MeshBasicMaterial({color:'#ffd868',transparent:true,opacity:0}));flash.material.userData.dynamic=true;flash.raycast=()=>{};group.add(flash)
 return {group,update(age:number,alpha:number){
  flash.visible=age>=0&&age<.5;flash.position.y=4;flash.scale.setScalar(1+Math.max(0,age)*5);flash.material.opacity=alpha*Math.max(0,1-age/.5)
  smoke.forEach((p,i)=>{const a=age-i*.3,cycle=((a%3)+3)%3;p.visible=a>=0;p.position.set(Math.sin(i*2)*cycle*2,4+cycle*9,-Math.cos(i*2)*cycle*2);p.scale.setScalar(1+cycle*1.2);p.material.opacity=alpha*.45*Math.sin(cycle/3*Math.PI)})
 }}
}
