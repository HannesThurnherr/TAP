import { useEffect, useRef, useState } from 'react'
import type { AreaRect } from '../state/store'
import { rotatedCorners, cornersBounds } from '../services/areaGeometry'

const W = 300   // css px
/** Relief preview of the selected rectangle (swissALTI3D hillshade via WMS, north-up) with the rotated frame drawn on it. */
export function AreaThumb({ rect, rotation }: { rect: AreaRect; rotation: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const key = `${Math.round(rect.cx / 20)}|${Math.round(rect.cy / 20)}|${Math.round(rect.w / 20)}|${Math.round(rect.h / 20)}|${rotation}`
  useEffect(() => {
    const pts = rotatedCorners(rect.cx, rect.cy, rect.w, rect.h, rotation)
    const b = cornersBounds(pts)
    const pad = Math.max(60, Math.max(b[2] - b[0], b[3] - b[1]) * 0.08)
    const bb: [number, number, number, number] = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]
    const spanX = bb[2] - bb[0], spanY = bb[3] - bb[1]
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const width = Math.round(W * dpr), height = Math.round(W * spanY / spanX * dpr)
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setState('loading')
      const params = new URLSearchParams({ SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.3.0', LAYERS: 'ch.swisstopo.swissalti3d-reliefschattierung', STYLES: 'default', CRS: 'EPSG:2056', BBOX: bb.join(','), WIDTH: String(Math.min(1200, width)), HEIGHT: String(Math.min(1200, height)), FORMAT: 'image/png' })
      try {
        const blob = await fetch(`https://wms.geo.admin.ch/?${params}`, { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.blob() })
        const img = await createImageBitmap(blob)
        const c = canvas.current; if (!c || controller.signal.aborted) return
        c.width = width; c.height = height
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#0e1216'; ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        const px = (p: [number, number]) => [(p[0] - bb[0]) / spanX * width, (bb[3] - p[1]) / spanY * height] as [number, number]
        const poly = pts.map(px)
        // dim everything outside the rectangle
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, width, height)
        ctx.moveTo(...poly[0]); for (let i = poly.length - 1; i >= 0; i--) ctx.lineTo(...poly[i]); ctx.closePath()
        ctx.fillStyle = 'rgba(14,18,22,0.55)'; ctx.fill('evenodd'); ctx.restore()
        ctx.beginPath(); ctx.moveTo(...poly[0]); for (const p of poly.slice(1)) ctx.lineTo(...p); ctx.closePath()
        ctx.strokeStyle = '#6ee0ff'; ctx.lineWidth = 1.5 * dpr; ctx.stroke()
        // north arrow
        ctx.fillStyle = '#ffffff'; ctx.font = `${11 * dpr}px "IBM Plex Mono", monospace`; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('N ↑', width - 6 * dpr, 5 * dpr)
        setState('ok')
      } catch (e) { if (!controller.signal.aborted) setState('error') }
    }, 500)
    return () => { clearTimeout(timer); controller.abort() }
  }, [key])
  return <div className="area-thumb">
    <canvas ref={canvas} style={{ width: '100%', display: 'block' }} />
    <div className="area-thumb-cap dim small">{state === 'loading' ? 'Relief wird geladen …' : state === 'error' ? 'Relief nicht erreichbar' : 'Relief swissALTI3D · nordorientiert'}</div>
  </div>
}
