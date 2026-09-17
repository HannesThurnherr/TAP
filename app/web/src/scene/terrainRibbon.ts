import {BufferGeometry,Float32BufferAttribute} from 'three'
import type {Pt} from '../model/types'

/** Drape the whole ribbon surface, not just its outer edges. Heights are local metres. */
export function terrainRibbon(samples:Pt[],width:number,head:boolean,ground:(x:number,y:number)=>number):BufferGeometry {
 const lengths=[0]
 for(let i=1;i<samples.length;i++)lengths.push(lengths[i-1]+Math.hypot(samples[i][0]-samples[i-1][0],samples[i][1]-samples[i-1][1]))
 const total=lengths.at(-1)||1,headLength=head?Math.min(width*1.6,total*.35):0
 // The arrowhead is up to 2.3 widths across. Keep cells around two metres wide.
 const columns=head?Math.max(2,Math.min(128,Math.ceil(width*2.3/2))):1,stride=columns+1
 const lift=head?2:.5
 const positions:number[]=[],along:number[]=[],across:number[]=[],indices:number[]=[]
 for(let i=0;i<samples.length;i++){
  const p=samples[i],q=samples[Math.min(i+1,samples.length-1)],r=samples[Math.max(i-1,0)]
  const tx=q[0]-r[0],ty=q[1]-r[1],length=Math.hypot(tx,ty)||1,nx=-ty/length,ny=tx/length
  const remaining=total-lengths[i]
  let halfWidth=width/2
  if(head&&remaining<headLength)halfWidth=width*1.15*(remaining/headLength)+.01
  else if(head&&remaining<headLength+4)halfWidth=width*1.15
  for(let j=0;j<=columns;j++){
   const side=2*j/columns-1,x=p[0]+nx*halfWidth*side,y=p[1]+ny*halfWidth*side
   positions.push(x,ground(x,y)+lift,-y);along.push(lengths[i]/total);across.push(side)
   if(i>0&&j<columns){const a=(i-1)*stride+j,b=i*stride+j;indices.push(a,a+1,b,a+1,b+1,b)}
  }
 }
 const geometry=new BufferGeometry()
 geometry.setAttribute('position',new Float32BufferAttribute(positions,3))
 geometry.setAttribute('along',new Float32BufferAttribute(along,1))
 geometry.setAttribute('across',new Float32BufferAttribute(across,1))
 geometry.setIndex(indices);geometry.userData.length=total
 return geometry
}
