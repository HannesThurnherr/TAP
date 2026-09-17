// Background video export: a second, hidden scene renders the frames so the editor stays usable meanwhile.
import { Scene } from './Scene'
import { ElementLayer } from './elements'
import { exportVideo } from './videoExport'
import { drawHud, type HudOptions } from './hudCanvas'
import type { MapStatus } from './MapGround'
import { elementPose } from '../model/timing'
import { getCurrentPackage } from '../services/areaLoader'
import { useStore } from '../state/store'
import type { Config } from '../model/types'

export interface ExportRequest { name: string; config: Config; start: number; end: number; width: number; height: number; fps: number; bitrate: number; hud: HudOptions }

const controllers = new Map<string, AbortController>()
export const cancelExport = (id: string) => controllers.get(id)?.abort()

export function startExport(req: ExportRequest): string {
  const id = `job-${Date.now().toString(36)}`
  const st = useStore.getState()
  const controller = new AbortController(); controllers.set(id, controller)
  st.addJob({ id, name: req.name, progress: 0, status: 'running', message: 'Szene wird vorbereitet …', started: Date.now() })
  const update = (patch: Parameters<typeof st.updateJob>[1]) => useStore.getState().updateJob(id, patch)
  ;(async () => {
    const pkg = getCurrentPackage()
    if (!pkg) throw new Error('Kein Gelände geladen')
    // hidden viewport with the exact output aspect; pixel ratio 1 so the WebGL canvas equals the frame size
    const host = document.createElement('div')
    Object.assign(host.style, { position: 'fixed', left: '-100000px', top: '0', width: `${req.width}px`, height: `${req.height}px`, overflow: 'hidden', pointerEvents: 'none' })
    document.body.appendChild(host)
    const scene = new Scene(host, { pixelRatio: 1 })
    const layer = new ElementLayer(scene)
    try {
      await scene.loadPackage(pkg)
      controller.signal.throwIfAborted()
      let mapStatus: MapStatus = { loading: false, error: null, resolution: null }
      scene.onMapStatus = s => { mapStatus = s }
      scene.setGround(st.groundMode, st.mapDetail)
      const waitForGround = async () => {
        const deadline = performance.now() + 30000
        while (mapStatus.loading) { controller.signal.throwIfAborted(); if (performance.now() > deadline) throw new Error('Bodenbild lädt zu lange. Kartendetail fest einstellen oder Geländebild verwenden.'); await new Promise(r => setTimeout(r, 50)) }
        if (mapStatus.error) throw new Error(`Bodenbild konnte nicht geladen werden: ${mapStatus.error}`)
      }
      layer.sync(req.config)
      const shots = [...req.config.shots].sort((a, b) => a.start - b.start)
      const lead = req.hud.titleCard?.seconds ?? 0
      update({ message: 'Bilder werden gerendert …' })
      const blob = await exportVideo(scene, {
        start: req.start, end: req.end, height: req.height, width: req.width, fps: req.fps, bitrate: req.bitrate, lead,
        overlay: (ctx, w, h, sceneTime, frameTime) => drawHud(ctx, w, h, req.config, sceneTime, req.hud, frameTime, req.config.area.name),
        onStage: stage => update({ message: stage }),
      }, async t => {
        controller.signal.throwIfAborted()
        const shot = shots.find(s => t >= s.start && t < s.end) ?? shots.filter(s => s.start <= t).at(-1) ?? shots[0]
        if (shot) scene.applyShot(shot, t, eid => elementPose(req.config, eid, t)); else scene.frameAll()
        layer.update(t); scene.render()
        if (st.groundMode !== 'fui') { await waitForGround(); scene.render() }
      }, controller.signal, p => update({ progress: p, message: `MP4 wird erstellt · ${Math.round(p * 100)} %` }))
      const url = URL.createObjectURL(blob)
      update({ progress: 1, status: 'done', message: `Fertig · ${(blob.size / 1048576).toFixed(1)} MB`, url, size: blob.size })
    } catch (e) {
      update({ status: controller.signal.aborted ? 'cancelled' : 'error', message: controller.signal.aborted ? 'Abgebrochen' : `Fehler: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      layer.dispose(); scene.dispose(); host.remove(); controllers.delete(id)
    }
  })().catch(e => update({ status: 'error', message: e instanceof Error ? e.message : String(e) }))
  return id
}
