import {drawSymbol,type SymbolDrawing} from '../symbology/symbol'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Scene } from './Scene'

/**
 * Composites an export frame: the WebGL canvas plus every label drawn with canvas primitives.
 * Labels are HTML in the editor (CSS2DRenderer); here they are re-drawn from their DOM geometry and classes,
 * so no DOM-to-image rasterisation is needed (html-to-image hangs in sandboxed browsers and is slow).
 */
export class CanvasCompositor {
  constructor(private scene: Scene, private scale: number) {}
  async prepare(_signal: AbortSignal, onProgress?: (done: number, total: number) => void) { await document.fonts.ready; onProgress?.(1, 1) }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const node = this.scene.container, root = node.getBoundingClientRect()
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(this.scene.renderer.domElement, 0, 0, width, height)
    ctx.save(); ctx.scale(width / root.width, height / root.height)
    const els: HTMLElement[] = []
    this.scene.overlays.traverse(o => { if (o instanceof CSS2DObject) els.push(o.element as HTMLElement) })
    const visible = els.filter(e => e.style.display !== 'none' && Number(e.style.opacity || 1) > 0 && e.isConnected)
      .sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0))
    const R = (n: Element) => { const r = n.getBoundingClientRect(); return { x: r.left - root.left, y: r.top - root.top, w: r.width, h: r.height } }
    for (const el of visible) {
      ctx.save(); ctx.globalAlpha = Number(el.style.opacity || 1)
      const cs = getComputedStyle(el)
      const side = cs.getPropertyValue('--side').trim() || '#d2d2d2', c = cs.getPropertyValue('--c').trim() || '#ffffff'
      if (el.classList.contains('puck')) this.puck(ctx, el, side, R)
      else if (el.classList.contains('mover')) this.mover(ctx, el, side, R)
      else if (el.classList.contains('callout')) this.callout(ctx, el, c, R)
      else if (el.classList.contains('pill')) this.pill(ctx, el, c, R(el))
      else this.generic(ctx, el, R)
      ctx.restore()
    }
    ctx.restore()
  }
  dispose() {}

  private text(ctx: CanvasRenderingContext2D, node: Element, rect: { x: number; y: number; w: number; h: number }, color?: string) {
    const cs = getComputedStyle(node)
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    ctx.fillStyle = color ?? cs.color; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
    const ls = parseFloat(cs.letterSpacing); if (Number.isFinite(ls)) (ctx as any).letterSpacing = `${ls}px`
    ctx.fillText(node.textContent ?? '', rect.x + parseFloat(cs.paddingLeft || '0'), rect.y + rect.h / 2)
    ;(ctx as any).letterSpacing = '0px'
  }
  private rrect(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, radius: number, fill: string | null, stroke: string | null, lw = 1) {
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, radius)
    if (fill) { ctx.fillStyle = fill; ctx.fill() }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke() }
  }
  private pillNode(ctx: CanvasRenderingContext2D, node: Element | null, R: (n: Element) => { x: number; y: number; w: number; h: number }) {
    if (!node || !node.textContent?.trim()) return
    const r = R(node); this.rrect(ctx, r, 3, '#241e1c', null); this.text(ctx, node, r, '#ffffff')
  }
  private pill(ctx: CanvasRenderingContext2D, el: HTMLElement, c: string, r: { x: number; y: number; w: number; h: number }) {
    const zone = el.classList.contains('zone')
    this.rrect(ctx, r, 3, zone ? c : 'rgba(36,30,28,0.92)', c, 1); this.text(ctx, el, r, zone ? '#ffffff' : c)
  }
  private generic(ctx: CanvasRenderingContext2D, el: HTMLElement, R: (n: Element) => { x: number; y: number; w: number; h: number }) {
    const r = R(el); const cs = getComputedStyle(el)
    if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') this.rrect(ctx, r, parseFloat(cs.borderRadius) || 0, cs.backgroundColor, null)
    if (el.children.length === 0) this.text(ctx, el, r)
  }
  private puck(ctx: CanvasRenderingContext2D, el: HTMLElement, side: string, R: (n: Element) => { x: number; y: number; w: number; h: number }) {
    const swiss=el.querySelector('.swiss-symbol');if(swiss&&el.dataset.symbolDrawing){const r=R(swiss);drawSymbol(ctx,JSON.parse(el.dataset.symbolDrawing) as SymbolDrawing,r.x,r.y,r.w,r.h);this.pillNode(ctx,el.querySelector('.lbl'),R);return}
    const glyph = el.querySelector('.glyph'); if (!glyph) return
    const g = R(glyph)
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2
    this.rrect(ctx, { x: g.x - 2, y: g.y - 2, w: g.w + 4, h: g.h + 4 }, 4, side, null)
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
    this.rrect(ctx, g, 3, '#241e1c', '#ffffff', 2)
    const cx = g.x + g.w / 2, cy = g.y + g.h / 2
    ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.lineCap = 'butt'
    const cls = glyph.classList
    const diag = (sign: number) => { ctx.beginPath(); ctx.moveTo(g.x + 1, sign > 0 ? g.y + 1 : g.y + g.h - 1); ctx.lineTo(g.x + g.w - 1, sign > 0 ? g.y + g.h - 1 : g.y + 1); ctx.stroke() }
    if (cls.contains('infantry')) { diag(1); diag(-1) }
    else if (cls.contains('recon')) diag(-1)
    else if (cls.contains('mech')) { ctx.beginPath(); ctx.ellipse(cx, cy, g.w / 2 - 4, g.h / 2 - 4.5, 0, 0, Math.PI * 2); ctx.stroke() }
    else if (cls.contains('support')) { ctx.fillRect(g.x + 4, cy - 1, g.w - 8, 2) }
    else if (cls.contains('hq')) { ctx.fillRect(g.x + 4, g.y - 8, 1.5, 10); ctx.fillRect(g.x + 5, g.y - 8, 9, 5) }
    const rank = glyph.querySelector('.rank')
    if (rank) { const size = ['team', 'squad', 'platoon', 'company'].find(s => rank.classList.contains(s)); const dots = { team: '•', squad: '••', platoon: '•••', company: '|' }[size ?? 'platoon'] ?? ''; ctx.font = `${size === 'company' ? '700 ' : ''}12px Barlow, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; (ctx as any).letterSpacing = '1px'; ctx.fillText(dots, cx, g.y - 7); (ctx as any).letterSpacing = '0px' }
    this.pillNode(ctx, el.querySelector('.lbl'), R)
  }
  private mover(ctx: CanvasRenderingContext2D, el: HTMLElement, side: string, R: (n: Element) => { x: number; y: number; w: number; h: number }) {
    const box = el.querySelector('.box'); if (!box) return
    const b = R(box), dead = el.classList.contains('dead')
    const cs = getComputedStyle(box)
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1
    this.rrect(ctx, b, parseFloat(cs.borderRadius) || 2, dead ? '#3a1a1a' : side, dead ? '#eb3232' : '#ffffff', 1.5)
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2
    if (dead) { ctx.fillStyle = '#eb3232'; ctx.font = '700 12px Barlow, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✕', cx, cy) }
    else {
      // symbol as in the SVG: viewBox 30x18 scaled to the box
      const sx = b.w / 30, sy = b.h / 18
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4
      const vehicle = ['bmp', 'ifv', 'piranha', 'apc'].some(k => el.classList.contains(k)), wheeled = ['piranha', 'apc'].some(k => el.classList.contains(k))
      ctx.beginPath()
      if (el.classList.contains('truck')) ctx.rect(b.x + 4 * sx, b.y + 3 * sy, 22 * sx, 12 * sy)
      else if (wheeled) { ctx.moveTo(b.x + 4 * sx, cy); ctx.lineTo(b.x + 26 * sx, cy) }
      else { ctx.moveTo(b.x + 4 * sx, b.y + 3 * sy); ctx.lineTo(b.x + 26 * sx, b.y + 15 * sy); ctx.moveTo(b.x + 26 * sx, b.y + 3 * sy); ctx.lineTo(b.x + 4 * sx, b.y + 15 * sy) }
      ctx.stroke()
      if (vehicle) { ctx.beginPath(); ctx.ellipse(cx, cy, 10 * sx, 5.5 * sy, 0, 0, Math.PI * 2); ctx.stroke() }
      const rank = box.querySelector('.rank')?.textContent ?? ''
      if (rank) { ctx.fillStyle = '#ffffff'; ctx.font = '12px Barlow, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; (ctx as any).letterSpacing = '1px'; ctx.fillText(rank, cx, b.y - 8); (ctx as any).letterSpacing = '0px' }
      const chev = box.querySelector<HTMLElement>('.chev')
      if (chev) { const ang = Number(/rotate\(([-\d.e+]+)deg\)/.exec(chev.style.transform)?.[1] ?? 0) * Math.PI / 180; ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -6.6); ctx.lineTo(4, 2.4); ctx.lineTo(-4, 2.4); ctx.closePath(); ctx.fill(); ctx.restore() }
    }
    this.pillNode(ctx, el.querySelector('.lbl'), R)
  }
  private callout(ctx: CanvasRenderingContext2D, el: HTMLElement, c: string, R: (n: Element) => { x: number; y: number; w: number; h: number }) {
    const o = R(el), leader = el.querySelector<HTMLElement>('.leader'), box = el.querySelector<HTMLElement>('.box')
    if (leader) { const len = parseFloat(leader.style.width) || 0, ang = Number(/rotate\(([-\d.e+]+)rad\)/.exec(leader.style.transform)?.[1] ?? 0); ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(ang); ctx.fillStyle = c; ctx.fillRect(0, -0.75, len, 1.5); ctx.restore() }
    if (!box) return
    const b = R(box)
    const hidden = Number(/inset\(0 ([\d.]+)%/.exec(box.style.clipPath)?.[1] ?? 0) / 100
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w * (1 - hidden), b.h); ctx.clip()
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4
    this.rrect(ctx, b, 0, 'rgba(10,14,18,0.92)', null)
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
    ctx.fillStyle = c; ctx.fillRect(b.x, b.y, 3, b.h)
    for (const child of box.children) { const r = R(child); this.text(ctx, child, r, child.classList.contains('s') ? c : '#ffffff') }
    ctx.restore()
  }
}
