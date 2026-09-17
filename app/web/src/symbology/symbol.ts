import {AFFILIATION_FILL, affiliationForSide, type UnitSymbol, type SymbolStatus, type PointCode} from './catalog.ts'
export interface PathMark {d:string;fill?:string;stroke?:string;width?:number;dash?:boolean;transform?:string}
export interface TextMark {x:number;y:number;text:string;size:number}
export interface SymbolDrawing {paths:PathMark[];texts:TextMark[];width:number;height:number}
const circle=(x:number,y:number,r:number)=>`M ${x-r} ${y} a ${r} ${r} 0 1 0 ${2*r} 0 a ${r} ${r} 0 1 0 ${-2*r} 0`
/** Screen and video consume the same paths. Red construction octagons are intentionally absent. */
export function unitDrawing(s:UnitSymbol,side?:string,status:SymbolStatus='active'):SymbolDrawing {
 const a=s.affiliation??affiliationForSide(side),fill=AFFILIATION_FILL[a],paths:PathMark[]=[],texts:TextMark[]=[]
 const frame={friendly:'M 20 30 H 110 V 90 H 20 Z',hostile:'M 65 18 L 115 60 65 102 15 60 Z',neutral:'M 32 27 H 98 V 93 H 32 Z',unknown:'M 65 28 C 86 5 107 25 98 44 C 126 52 115 80 95 79 C 96 107 69 113 65 92 C 50 115 24 95 32 78 C 8 80 6 49 32 43 C 21 21 47 10 65 28 Z'}[a]
 paths.push({d:frame,fill,stroke:'#111',width:1.4,dash:status==='planned'})
 // Content occupies the common central region, independent of affiliation frame.
 let content=true
 const p=(d:string,solid=false)=>paths.push({d,fill:solid?'#111':'none',stroke:'#111',width:1.4,...(content&&a!=='friendly'?{transform:'translate(22.75 21) scale(0.65)'}:{})})
 const cross='M 25 33 L 105 87 M 25 87 L 105 33',oval='M 48 45 H 82 C 103 45 103 75 82 75 H 48 C 27 75 27 45 48 45 Z'
 if(['infantry','panzergrenadier','rescue'].includes(s.code))p(cross)
 if(['armor','panzergrenadier','armoredRecon','armoredArtillery'].includes(s.code))p(oval)
 if(['recon','armoredRecon'].includes(s.code))p('M 25 85 L 105 35')
 if(['artillery','armoredArtillery'].includes(s.code))p(circle(65,60,4),true)
 if(s.code==='engineer')p('M 44 75 V 47 H 86 V 75 M 65 47 V 68')
 if(s.code==='signals')p('M 35 38 L 76 65 67 47 94 80')
 if(s.code==='logistics')p('M 22 76 H 108')
 if(s.code==='supply')p('M 22 76 H 108 M 48 76 V 44 H 83 V 76')
 if(s.code==='medical')p('M 65 32 V 88 M 22 60 H 108')
 if(s.code==='hospital')texts.push({text:'H',x:65,y:69,size:28})
 if(s.code==='rescue')p('M 65 32 V 88')
 if(s.code==='antiTank')p('M 28 87 L 65 32 102 87')
 content=false
 if(s.hq)p(a==='hostile'?'M 15 60 V 111':a==='neutral'?'M 32 93 V 111':a==='unknown'?'M 32 78 V 111':'M 20 90 V 111')
 const echelon=s.echelon??'platoon',dots={team:1,squad:2,platoon:3}[echelon as 'team']
 const bars={company:1,battalion:2,regiment:3}[echelon as 'company']
 const xs={brigade:1,division:2,corps:3,army:4}[echelon as 'brigade']
 if(dots)for(let i=0;i<dots;i++)p(circle(65+(i-(dots-1)/2)*8,10,2.7),true)
 if(bars)for(let i=0;i<bars;i++){const x=65+(i-(bars-1)/2)*5;p(`M ${x} 5 V 15`)}
 if(xs)for(let i=0;i<xs;i++){const x=65+(i-(xs-1)/2)*12;p(`M ${x-4} 5 L ${x+4} 15 M ${x-4} 15 L ${x+4} 5`)}
 if(echelon==='crew'){p(circle(65,10,5));p('M 60 15 L 70 5')}
 if(s.taskForce)p('M 41 18 V 1 H 89 V 18')
 if(s.strength)texts.push({text:s.strength==='reinforced'?'+':'−',x:124,y:29,size:15})
 return {paths,texts,width:140,height:115}
}
export function pointDrawing(code:PointCode,side?:string,status:SymbolStatus='active',designation?:string):SymbolDrawing {
 const paths:PathMark[]=[],texts:TextMark[]=[],fill=AFFILIATION_FILL[affiliationForSide(side)]
 const p=(d:string,f='none',dash=false)=>paths.push({d,fill:f,stroke:'#111',width:1.5,dash})
 if(code.startsWith('demolition')||code==='destroyed'){
  p(circle(65,60,30),fill)
  if(code==='destroyed')p('M 41 76 L 81 36 M 49 84 L 89 44 M 41 44 L 81 84 M 49 36 L 89 76')
  else {p('M 41 76 L 81 36','none',code!=='demolitionPrepared3');p('M 49 84 L 89 44','none',code==='demolitionPlanned')}
 }else if(code==='post'){p('M 65 25 L 103 88 H 27 Z',fill,status==='planned');p('M 27 88 L 86 60')}
 else if(code==='installation'){p(circle(65,63,30),fill,status==='planned');p('M 55 25 H 75 V 33 H 55 Z','#111')}
 else {p('M 45 27 H 85 V 77 L 65 95 45 77 Z',fill,status==='planned');if(designation)texts.push({x:65,y:66,text:designation,size:16})}
 return {paths,texts,width:140,height:115}
}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export function symbolSvg(d:SymbolDrawing):string {
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}" aria-hidden="true">${d.paths.map(p=>`<path d="${p.d}" fill="${p.fill??'none'}" stroke="${p.stroke??'#111'}" stroke-width="${p.width??1.4}"${p.transform?` transform="${p.transform}"`: ''}${p.dash?' stroke-dasharray="6 4"':''}/>`).join('')}${d.texts.map(t=>`<text x="${t.x}" y="${t.y}" font-family="Arial,sans-serif" font-size="${t.size}" text-anchor="middle" fill="#111">${escape(t.text)}</text>`).join('')}</svg>`
}
export function drawSymbol(ctx:CanvasRenderingContext2D,d:SymbolDrawing,x:number,y:number,w:number,h:number){
 ctx.save();ctx.translate(x,y);ctx.scale(w/d.width,h/d.height)
 for(const p of d.paths){ctx.save();if(p.transform){ctx.translate(22.75,21);ctx.scale(.65,.65)}const path=new Path2D(p.d);ctx.setLineDash(p.dash?[6,4]:[]);ctx.lineWidth=p.width??1.4;if(p.fill&&p.fill!=='none'){ctx.fillStyle=p.fill;ctx.fill(path)}ctx.strokeStyle=p.stroke??'#111';ctx.stroke(path);ctx.restore()}
 ctx.setLineDash([]);ctx.fillStyle='#111';ctx.textAlign='center';ctx.textBaseline='alphabetic'
 for(const t of d.texts){ctx.font=`${t.size}px Arial,sans-serif`;ctx.fillText(t.text,t.x,t.y)}
 ctx.restore()
}
