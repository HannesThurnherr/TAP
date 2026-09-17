import {CanvasCompositor} from './CanvasCompositor'
import type {Scene} from './Scene'
import {BufferTarget,CanvasSource,Mp4OutputFormat,Output,canEncodeVideo} from 'mediabunny'

export interface VideoOptions {start:number;end:number;height:number;fps:number;width?:number;bitrate?:number;lead?:number;overlay?:(ctx:CanvasRenderingContext2D,width:number,height:number,sceneTime:number,frameTime:number)=>void;onStage?:(stage:string)=>void}
export function downloadBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
export function attribution(canvas:HTMLCanvasElement){const ctx=canvas.getContext('2d')!;const size=Math.max(12,Math.round(canvas.height/60));ctx.font=`${size}px sans-serif`;ctx.textAlign='right';ctx.fillStyle='#101820cc';ctx.fillRect(canvas.width-size*10,canvas.height-size*2.5,size*10,size*2.5);ctx.fillStyle='white';ctx.fillText('© swisstopo',canvas.width-size,canvas.height-size)}

export async function exportVideo(scene:Scene,options:VideoOptions,render:(t:number)=>Promise<void>,signal:AbortSignal,onProgress:(value:number)=>void){
 const node=scene.container
 const height=Math.round(options.height/2)*2,width=options.width??Math.round(height*node.clientWidth/node.clientHeight/2)*2,bitrate=options.bitrate??6_000_000
 if(!await canEncodeVideo('avc',{width,height,bitrate}))throw new Error('MP4-Encoding wird in diesem Browser nicht unterstützt. Bitte einen aktuellen Chrome- oder Edge-Browser verwenden.')
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
 const ctx=canvas.getContext('2d')!,target=new BufferTarget(),output=new Output({format:new Mp4OutputFormat(),target})
 const source=new CanvasSource(canvas,{codec:'avc',bitrate})
 output.addVideoTrack(source,{frameRate:options.fps})
 const lead=options.lead??0,duration=options.end-options.start+lead,count=Math.ceil(duration*options.fps)
 const compositor=new CanvasCompositor(scene,Math.max(2,height/node.clientHeight))
 try{
  options.onStage?.('Beschriftungen werden vorbereitet …')
  await compositor.prepare(signal,(d,n)=>options.onStage?.(`Beschriftungen ${d}/${n}`))
  options.onStage?.('Encoder wird gestartet …')
  await output.start()
  options.onStage?.('Bilder werden gerendert …')
  for(let i=0;i<count;i++){
   signal.throwIfAborted()
   const t=i/options.fps,sceneTime=options.start+Math.max(0,t-lead)
   if(t>=lead||i===0)await render(sceneTime)
   signal.throwIfAborted()
   compositor.draw(ctx,width,height);options.overlay?.(ctx,width,height,sceneTime,t);attribution(canvas)
   await source.add(t,Math.min(1/options.fps,duration-t))
   onProgress((i+1)/count)
   if(i%8===7)await new Promise(resolve=>setTimeout(resolve,0)) // Let progress paint and cancellation run.
  }
  signal.throwIfAborted();await output.finalize();signal.throwIfAborted()
  return new Blob([target.buffer!],{type:'video/mp4'})
 }catch(error){await output.cancel().catch(()=>{});throw error}
 finally{source.close();compositor.dispose()}
}
