import {swissLegend} from '../symbology/legend'
import {drawSymbol} from '../symbology/symbol'
import type { Config } from '../model/types'
import { hudState, legendFor } from '../model/hud'

export interface HudOptions { title: boolean; clock: boolean; captions: boolean; legend: boolean; stand: boolean; titleCard: { seconds: number; ort: string; verband: string; ereignis: string } | null }

const ease = (x: number) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u) }

function chip(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, font: string, size: number, align: CanvasTextAlign, pad: number, color = '#ffffff') {
  ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'middle'
  const w = ctx.measureText(text).width + pad * 2, h = pad * 2 + size * 1.05
  const left = align === 'left' ? x : align === 'right' ? x - w : x - w / 2
  ctx.fillStyle = 'rgba(10,14,18,0.86)'; ctx.beginPath(); ctx.roundRect(left, y, w, h, 4); ctx.fill()
  ctx.fillStyle = color; ctx.fillText(text, align === 'left' ? x + pad : align === 'right' ? x - pad : x, y + h / 2)
  return h
}

/** Burns the presentation HUD into an export frame (same layout as Presentation.tsx, scaled by the frame height). */
export function drawHud(ctx: CanvasRenderingContext2D, w: number, h: number, config: Config, t: number, opts: HudOptions, frameTime: number, areaName: string) {
  const s = h / 900
  if (opts.titleCard && frameTime < opts.titleCard.seconds) {
    const k = opts.titleCard.seconds
    const a = frameTime < 0.5 ? ease(frameTime / 0.5) : frameTime > k - 0.6 ? ease((k - frameTime) / 0.6) : 1
    ctx.fillStyle = '#0e1216'; ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#8b93a1'; ctx.font = `300 ${Math.round(22 * s)}px "IBM Plex Mono", monospace`; ctx.fillText(opts.titleCard.ort.toUpperCase(), w / 2, h / 2 - 90 * s)
    ctx.fillStyle = '#ffffff'; ctx.font = `700 ${Math.round(64 * s)}px Barlow, sans-serif`; ctx.fillText(opts.titleCard.ereignis, w / 2, h / 2)
    ctx.fillStyle = '#ffb020'; ctx.font = `600 ${Math.round(26 * s)}px Barlow, sans-serif`; ctx.fillText(opts.titleCard.verband, w / 2, h / 2 + 70 * s)
    ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 2 * s
    for (const [cx, cy, dx, dy] of [[w * 0.2, h * 0.2, 1, 1], [w * 0.8, h * 0.2, -1, 1], [w * 0.2, h * 0.8, 1, -1], [w * 0.8, h * 0.8, -1, -1]]) { ctx.beginPath(); ctx.moveTo(cx, cy + dy * 28 * s); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * 28 * s, cy); ctx.stroke() }
    ctx.globalAlpha = 1
    return
  }
  const hud = hudState(config, t)
  if (opts.title && hud.phase) chip(ctx, 22 * s, 18 * s, hud.phase.title, `700 ${Math.round(17 * s)}px Barlow, sans-serif`, 17 * s, 'left', 8 * s)
  if (opts.clock) chip(ctx, w - 22 * s, 18 * s, `SZENARIO ${hud.clock}`, `400 ${Math.round(14 * s)}px "IBM Plex Mono", monospace`, 14 * s, 'right', 8 * s, '#cfd8e0')
  if (opts.captions) for (const c of hud.captions) {
    const top = c.position === 'top'
    const y = top ? 64 * s : h - 96 * s - (c.sub ? 58 : 40) * s
    ctx.font = `600 ${Math.round(18 * s)}px Barlow, sans-serif`
    const width = Math.max(ctx.measureText(c.text).width, c.sub ? (ctx.font = `300 ${Math.round(12 * s)}px "IBM Plex Mono", monospace`, ctx.measureText(c.sub).width) : 0) + 32 * s
    const height = (c.sub ? 58 : 40) * s
    ctx.fillStyle = 'rgba(10,14,18,0.86)'; ctx.beginPath(); ctx.roundRect(w / 2 - width / 2, y, width, height, 4 * s); ctx.fill()
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'; ctx.font = `600 ${Math.round(18 * s)}px Barlow, sans-serif`; ctx.fillText(c.text, w / 2, y + 20 * s)
    if (c.sub) { ctx.fillStyle = '#ffb020'; ctx.font = `300 ${Math.round(12 * s)}px "IBM Plex Mono", monospace`; ctx.fillText(c.sub, w / 2, y + 42 * s) }
  }
  const symbolEntries=opts.legend?swissLegend(config,hud.phase?.start??0,hud.phase?.end??config.duration):[]
  if(symbolEntries.length){
    const shown=symbolEntries.slice(0,8),row=38*s,bw=300*s,bh=(shown.length+(symbolEntries.length>8?1:0))*row+16*s,x=w-22*s-bw,y=h-96*s-bh
    ctx.fillStyle='rgba(235,241,244,0.94)';ctx.fillRect(x,y,bw,bh)
    shown.forEach((entry,i)=>{const yy=y+8*s+i*row;drawSymbol(ctx,entry.drawing,x+6*s,yy,44*s,36*s);ctx.fillStyle='#111';ctx.textAlign='left';ctx.textBaseline='middle';ctx.font=`${11*s}px Arial,sans-serif`;ctx.fillText(entry.label,x+54*s,yy+row/2,bw-62*s)})
    if(symbolEntries.length>8){ctx.fillStyle='#111';ctx.fillText(`+ ${symbolEntries.length-8} weitere Symbole`,x+12*s,y+bh-20*s)}
  }
  if (opts.legend && hud.phase && !symbolEntries.length) {
    const leg = legendFor(config, hud.phase.start, hud.phase.end)
    const rows: [string, string][] = leg.sides.map(sd => [sd === 'blue' ? '#288cff' : sd === 'red' ? '#eb3232' : '#d2d2d2', sd === 'blue' ? 'Eigene' : sd === 'red' ? 'Feind' : 'Neutral'])
    const names: Record<string, [string, string]> = { 'line:pl': ['#ff4040', 'Phasenlinie'], 'line:sperre': ['#e03a3a', 'Sperre'], 'line:hindernis': ['#e8e8e8', 'Hindernis'], 'line:stellung': ['#2f7cff', 'Stellung'], 'line:route': ['#2f7cff', 'Route'], 'zone:kill': ['#eb3232', 'Feuerraum'], 'zone:dismount': ['#eb3232', 'Absitzraum'], 'zone:assembly': ['#288cff', 'Bereitstellung'], 'zone:objective': ['#ffb020', 'Ziel'], fire: ['#ff8c00', 'Feuer'], mortar: ['#ffdc5a', 'Minenwerfer'] }
    for (const k of leg.kinds) if (names[k]) rows.push(names[k])
    if (rows.length) {
      const lh = 19 * s, pad = 10 * s, bw = 150 * s, bh = rows.length * lh + pad * 2
      const x = w - 22 * s - bw, y = h - 96 * s - bh
      ctx.fillStyle = 'rgba(10,14,18,0.86)'; ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 4 * s); ctx.fill()
      ctx.font = `400 ${Math.round(12 * s)}px Barlow, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      rows.slice(0, 10).forEach(([col, label], i) => { const yy = y + pad + i * lh + lh / 2; ctx.fillStyle = col; ctx.fillRect(x + pad, yy - 4 * s, 12 * s, 8 * s); ctx.fillStyle = '#e6e8ec'; ctx.fillText(label, x + pad + 20 * s, yy) })
    }
  }
  if (opts.stand) { ctx.font = `300 ${Math.round(11 * s)}px "IBM Plex Mono", monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = 'rgba(207,216,224,0.75)'; ctx.fillText(`${areaName} · Stand ${new Date().toLocaleDateString('de-CH')}`, 22 * s, h - 96 * s) }
}
