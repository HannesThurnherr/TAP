import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { StageNav } from './StageNav'
import { useStore, type AreaRect } from '../state/store'
import { searchPlaces } from '../services/placeSearch'
import { lv95ToWGS, wgsToLV95 } from '../services/geo'
import { MAP_ONLY_SPAN } from '../model/sceneArea'
import { areaFromBounds, rotatedCorners, cornersBounds, dragCorner, MAX_SPAN_M, AUTO_BUILDINGS_M, buildingLeafEstimate } from '../services/areaLoader'
import { chooseStep, tileCount } from '../services/swisstopoDem'
import { AEULI } from '../model/aeuli'
import { AreaThumb } from './AreaThumb'

type Base = 'karte' | 'luftbild'
const WMTS = (layer: string, ext: string) => [`https://wmts.geo.admin.ch/1.0.0/${layer}/default/current/3857/{z}/{x}/{y}.${ext}`]

/** map point -> LV95 */
const toLV = (p: maplibregl.LngLat) => wgsToLV95(p.lng, p.lat)
const toLngLat = (E: number, N: number) => { const [lon, lat] = lv95ToWGS(E, N); return [lon, lat] as [number, number] }
const norm = (deg: number) => ((deg % 360) + 360) % 360

export function AreaPicker() {
  const mapRef = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<{ corners: maplibregl.Marker[]; rot: maplibregl.Marker } | null>(null)
  const ready = useRef(false)
  const rect = useStore(s => s.areaRect)
  const rotation = useStore(s => s.areaRotation)
  const config = useStore(s => s.config)
  const [drawing, setDrawing] = useState(false)
  const [base, setBase] = useState<Base>('karte')
  const [q, setQ] = useState('')
  const [placeName, setPlaceName] = useState('')
  const [buildingsChoice, setBuildingsChoice] = useState<boolean | null>(null)   // null = automatic
  const [searchError, setSearchError] = useState('')
  const [hits, setHits] = useState<{ label: string; lat: number; lon: number }[]>([])
  const searchRequest = useRef(0)
  const gesture = useRef<{ id: number; x: number; y: number; E: number; N: number; previous: AreaRect | null; previousRot: number } | null>(null)

  const corners = rect ? rotatedCorners(rect.cx, rect.cy, rect.w, rect.h, rotation) : null

  /** polygon + handles follow the store */
  function paint(m: maplibregl.Map) {
    const st = useStore.getState(), r = st.areaRect
    const pts = r ? rotatedCorners(r.cx, r.cy, r.w, r.h, st.areaRotation) : null
    const source = m.getSource('selection') as maplibregl.GeoJSONSource | undefined
    const ring = pts ? [...pts, pts[0]].map(p => toLngLat(p[0], p[1])) : []
    source?.setData({ type: 'FeatureCollection', features: pts ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] : [] })
    const mk = markers.current; if (!mk) return
    const attach = (k: maplibregl.Marker, ll: maplibregl.LngLatLike) => { k.setLngLat(ll); if (!k.getElement().isConnected) k.addTo(m) }
    if (!pts || !r) { mk.corners.forEach(c => c.remove()); mk.rot.remove(); return }
    pts.forEach((p, i) => attach(mk.corners[i], toLngLat(p[0], p[1])))
    // rotation handle: outside the top edge, at a fixed screen distance
    const top = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2]
    const a = st.areaRotation * Math.PI / 180
    const px = m.project(toLngLat(top[0], top[1]))
    const handle = m.unproject([px.x + Math.sin(a) * 34, px.y - Math.cos(a) * 34])
    attach(mk.rot, handle)
  }

  useEffect(() => {
    const m = new maplibregl.Map({
      container: mapRef.current!,
      style: {
        version: 8,
        sources: {
          karte: { type: 'raster', tiles: WMTS('ch.swisstopo.pixelkarte-grau', 'jpeg'), tileSize: 256, attribution: '© swisstopo' },
          luftbild: { type: 'raster', tiles: WMTS('ch.swisstopo.swissimage', 'jpeg'), tileSize: 256, attribution: '© swisstopo' },
        },
        layers: [
          { id: 'karte', type: 'raster', source: 'karte', paint: { 'raster-brightness-max': 0.62 } },
          { id: 'luftbild', type: 'raster', source: 'luftbild', layout: { visibility: 'none' }, paint: { 'raster-brightness-max': 0.85, 'raster-saturation': -0.35 } },
        ],
      },
      center: [9.316676, 47.111148], zoom: 13.6,
    })
    map.current = m
    ;(window as any).__areaMap = m   // dev hook
    m.on('error', e => console.warn('[map]', e.error?.message ?? e))
    m.dragRotate.disable(); m.touchZoomRotate.disableRotation()
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left')
    m.on('load', () => {
      m.addSource('selection', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({ id: 'selection-fill', type: 'fill', source: 'selection', paint: { 'fill-color': '#6ee0ff', 'fill-opacity': 0.12 } })
      m.addLayer({ id: 'selection-edge', type: 'line', source: 'selection', paint: { 'line-color': '#6ee0ff', 'line-width': 2 } })

      // corner handles: drag a corner, the opposite one stays put (in the rectangle's own rotated frame)
      const cornerMarkers = [0, 1, 2, 3].map(i => {
        const el = document.createElement('div'); el.className = 'corner'; el.title = 'Ecke ziehen'
        const mk = new maplibregl.Marker({ element: el, draggable: true })
        mk.on('drag', () => {
          const st = useStore.getState(), r = st.areaRect; if (!r) return
          const [qx, qy] = toLV(mk.getLngLat())
          st.setAreaRect(dragCorner(r, st.areaRotation, i, qx, qy))
        })
        mk.on('dragend', () => paint(m))
        return mk
      })
      const rotEl = document.createElement('div'); rotEl.className = 'rot-handle'; rotEl.title = 'Drehen (ziehen)'
      const rot = new maplibregl.Marker({ element: rotEl, draggable: true })
      rot.on('drag', () => {
        const st = useStore.getState(), r = st.areaRect; if (!r) return
        const [qx, qy] = toLV(rot.getLngLat())
        const deg = Math.round(Math.atan2(qx - r.cx, qy - r.cy) * 180 / Math.PI)
        st.setAreaRotation(norm(deg))
      })
      rot.on('dragend', () => paint(m))
      markers.current = { corners: cornerMarkers, rot }
      ready.current = true

      // drag inside the rectangle moves it
      let moving: { E: number; N: number; cx: number; cy: number } | null = null
      m.on('mouseenter', 'selection-fill', () => { m.getCanvas().style.cursor = 'move' })
      m.on('mouseleave', 'selection-fill', () => { m.getCanvas().style.cursor = '' })
      m.on('mousedown', 'selection-fill', e => {
        const r = useStore.getState().areaRect; if (!r || e.originalEvent.button !== 0) return
        if ((e.originalEvent.target as HTMLElement | null)?.closest?.('.maplibregl-marker')) return
        e.preventDefault(); m.dragPan.disable()
        const [E, N] = toLV(e.lngLat); moving = { E, N, cx: r.cx, cy: r.cy }
      })
      m.on('mousemove', e => {
        if (!moving) return
        const st = useStore.getState(), r = st.areaRect; if (!r) return
        const [E, N] = toLV(e.lngLat)
        st.setAreaRect({ ...r, cx: Math.round(moving.cx + E - moving.E), cy: Math.round(moving.cy + N - moving.N) })
      })
      const endMove = () => { if (moving) { moving = null; m.dragPan.enable() } }
      m.on('mouseup', endMove); m.getCanvas().addEventListener('mouseleave', endMove)

      m.on('move', () => paint(m))
      paint(m)
      const r = useStore.getState().areaRect
      if (r) { const b = cornersBounds(rotatedCorners(r.cx, r.cy, r.w, r.h, useStore.getState().areaRotation)); m.fitBounds([toLngLat(b[0], b[1]), toLngLat(b[2], b[3])], { padding: 80, duration: 0 }) }
    })
    const ro = new ResizeObserver(() => m.resize()); ro.observe(mapRef.current!)
    return () => { ro.disconnect(); m.remove(); map.current = null; markers.current = null; ready.current = false }
  }, [])

  useEffect(() => { if (map.current && ready.current) paint(map.current) }, [rect, rotation])
  useEffect(() => { const m = map.current; if (!m) return; drawing ? m.dragPan.disable() : m.dragPan.enable() }, [drawing])
  useEffect(() => {
    const m = map.current; if (!m) return
    const apply = () => {
      const vis = (id: string, on: boolean) => m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
      vis('karte', base === 'karte'); vis('luftbild', base === 'luftbild')
    }
    if (ready.current) apply(); else m.once('load', apply)
  }, [base])

  async function search(text: string) {
    setQ(text); setSearchError('')
    const request = ++searchRequest.current
    if (text.length < 2) { setHits([]); return }
    try {
      const results = await searchPlaces(text)
      if (request === searchRequest.current) setHits(results)
    } catch { if (request === searchRequest.current) { setHits([]); setSearchError('Ortssuche nicht erreichbar. Die Karte kann weiterhin verschoben werden.') } }
  }

  function point(ev: React.PointerEvent) {
    const r = mapRef.current!.getBoundingClientRect()
    return toLV(map.current!.unproject([Math.max(0, Math.min(r.width, ev.clientX - r.left)), Math.max(0, Math.min(r.height, ev.clientY - r.top))]))
  }
  function start(ev: React.PointerEvent<HTMLDivElement>) {
    if (ev.button !== 0 || !ev.isPrimary || !map.current) return
    const [E, N] = point(ev)
    gesture.current = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, E, N, previous: rect, previousRot: rotation }
    useStore.getState().setAreaRotation(0)
    ev.currentTarget.setPointerCapture(ev.pointerId)
  }
  function move(ev: React.PointerEvent) {
    const g = gesture.current; if (!g || ev.pointerId !== g.id) return
    const [E, N] = point(ev)
    useStore.getState().setAreaRect({ cx: Math.round((g.E + E) / 2), cy: Math.round((g.N + N) / 2), w: Math.round(Math.abs(E - g.E)), h: Math.round(Math.abs(N - g.N)) })
  }
  function cancel() { if (gesture.current) { useStore.getState().setAreaRect(gesture.current.previous); useStore.getState().setAreaRotation(gesture.current.previousRot) } gesture.current = null; setDrawing(false) }
  function finish(ev: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current; if (!g || ev.pointerId !== g.id) return
    if (Math.abs(ev.clientX - g.x) < 6 || Math.abs(ev.clientY - g.y) < 6) { cancel(); return }
    move(ev); gesture.current = null; setDrawing(false)
  }
  useEffect(() => {
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') cancel() }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  }, [])

  const lv = corners ? cornersBounds(corners) : null       // axis-aligned LV95 bounds of the (rotated) rectangle: what gets loaded
  const width = rect ? rect.w / 1000 : 0, height = rect ? rect.h / 1000 : 0
  const span = lv ? Math.max(lv[2] - lv[0], lv[3] - lv[1]) : 0
  const [mapChoice,setMapChoice]=useState(false)
  const tooBig = span > MAX_SPAN_M
  const step = lv ? chooseStep(lv) : 2
  const tiles = lv ? tileCount([lv[0] - 300, lv[1] - 300, lv[2] + 300, lv[3] + 300]) : 0
  const autoBuildings = span <= AUTO_BUILDINGS_M
  const mapOnly = span > MAP_ONLY_SPAN || mapChoice
  const withBuildings = !mapOnly && (buildingsChoice ?? autoBuildings)
  const leaves = lv ? buildingLeafEstimate(lv) : 0
  const defaultName = rect ? `Gebiet ${Math.round(rect.cx / 1000)} / ${Math.round(rect.cy / 1000)}` : ''

  function setSize(w: number, h: number) { if (rect && w >= 0.2 && h >= 0.2) useStore.getState().setAreaRect({ ...rect, w: Math.round(w * 1000), h: Math.round(h * 1000) }) }
  function load() {
    if (!lv || !rect || tooBig) return
    const st = useStore.getState()
    const name = placeName || defaultName
    const area = areaFromBounds(lv, name, rotation)
    if(mapOnly) st.setGroundMode('map')
    st.setAreaSource({ kind: 'swisstopo', bounds: lv, name, buildings: withBuildings, mode:mapOnly?'map':'terrain' })
    // keep elements (they are LV95 absolute) but move the local origin to the new area
    useStore.setState({ config: { ...st.config, area } })
    st.setScreen('editor')
  }
  function loadAeuli(demo = false) {
    const st = useStore.getState()
    if (demo && st.config.elements.length && !confirm('Aktuelles Manöver durch Demo ersetzen? Vorher als Projektdatei speichern.')) return
    st.setAreaSource({ kind: 'aeuli' })
    useStore.setState({ config: demo ? AEULI : { ...st.config, area: AEULI.area }, areaRect: null, areaRotation: 0, time: 0, playing: false, followCamera: demo })
    st.setScreen('editor')
  }

  return <div className="area">
    <div className="topbar"><StageNav/><div className="title">Gebiet wählen</div><div className="dim">Rechteck zeichnen, dann an den Ecken ziehen oder drehen</div><div className="grow" /><span className="dim">Karte © swisstopo</span></div>
    <div className="area-body">
      <div className="map">
        <div className="map-gl" ref={mapRef} />
        {drawing && <div className="rectangle-draw" aria-label="Gebietsrechteck zeichnen" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} />}
        <div className="search"><input aria-label="Ort suchen" placeholder="Ort, Adresse, Flurname …" value={q} onChange={e => search(e.target.value)} />
          {hits.length > 0 && <div className="hits">{hits.map((h, i) => <button key={i} onClick={() => { ++searchRequest.current; map.current?.flyTo({ center: [h.lon, h.lat], zoom: 14 }); setHits([]); setQ(h.label); setPlaceName(h.label.split(' · ')[0].split(',')[0]) }}>{h.label}</button>)}</div>}
          {searchError && <div className="note">{searchError}</div>}
        </div>
        <div className="presets"><button className={drawing ? 'on' : ''} onClick={() => drawing ? cancel() : setDrawing(true)}>{drawing ? 'Abbrechen (Esc)' : rect ? 'Rechteck neu zeichnen' : 'Rechteck zeichnen'}</button>
          {rect && !drawing && rotation !== 0 && <button onClick={() => useStore.getState().setAreaRotation(0)}>Nach Norden</button>}
          {rect && !drawing && <button onClick={() => useStore.getState().setAreaRect(null)}>Auswahl löschen</button>}
          <span className="dim">{drawing ? 'Von einer Ecke zur anderen ziehen' : rect ? 'Ecken ziehen = Grösse · ↻ = drehen · Fläche ziehen = verschieben' : 'Ziehen = Karte verschieben · Rad = zoomen'}</span>
        </div>
        <div className="layers seg">
          <button className={base === 'karte' ? 'on' : ''} onClick={() => setBase('karte')}>Karte</button>
          <button className={base === 'luftbild' ? 'on' : ''} onClick={() => setBase('luftbild')}>Luftbild</button>
        </div>
        {rect && <div className="rect-size mono">{width.toFixed(1)} × {height.toFixed(1)} km · {(width * height).toFixed(1)} km²{rotation ? ` · ${rotation}°` : ''}</div>}
      </div>
      <div className="panel"><h3>Gebiet</h3>
        {rect ? <>
          <AreaThumb rect={rect} rotation={rotation} />
          <div className="row"><span>Name</span><input aria-label="Gebietsname" value={placeName} placeholder={defaultName} onChange={e => setPlaceName(e.target.value)} style={{ width: 170 }} /></div>
          <div className="row"><span>Mitte (LV95)</span><span className="mono">{Math.round(rect.cx).toLocaleString('de-CH')} / {Math.round(rect.cy).toLocaleString('de-CH')}</span></div>
          <div className="row"><span>Grösse (km)</span><span className="row-inputs"><input aria-label="Breite km" type="number" step={0.1} min={0.2} value={width.toFixed(2)} onChange={e => setSize(Number(e.target.value), height)} /> × <input aria-label="Höhe km" type="number" step={0.1} min={0.2} value={height.toFixed(2)} onChange={e => setSize(width, Number(e.target.value))} /></span></div>
          <div className="row"><span>Drehung</span><span className="row-inputs"><input aria-label="Drehung Grad" type="number" step={1} value={rotation} onChange={e => useStore.getState().setAreaRotation(norm(Math.round(Number(e.target.value))))} /> °{rotation ? <span className="dim"> · Blick entlang der Drehung</span> : <span className="dim"> · Nord oben</span>}</span></div>
          <div className="row"><span>Gelände swissALTI3D</span><span className="dim">{step} m Raster · {tiles} Kacheln{rotation ? ` · ${(span / 1000).toFixed(1)} km umschliessend` : ''}</span></div>
          <div className="row"><span><label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" disabled={mapOnly} checked={withBuildings} onChange={e => setBuildingsChoice(e.target.checked === autoBuildings ? null : e.target.checked)} /> Gebäude laden</label></span><span className="dim">{withBuildings ? `≈ ${leaves} Kacheln · ${Math.round(leaves * 0.03)} MB` : autoBuildings ? 'aus' : `aus (ab ${AUTO_BUILDINGS_M / 1000} km Seitenlänge)`}</span></div>
          <div className="row"><span>Bodenbild</span><span className="dim">Raster + Höhenlinien (prozedural)</span></div>
        </> : <p className="dim">Karte zum gewünschten Ort verschieben, «Rechteck zeichnen» wählen und das Gebiet aufziehen. Rechts erscheint eine Reliefvorschau des Geländes.</p>}
        <label><input type="checkbox" checked={mapOnly} disabled={span > MAP_ONLY_SPAN} onChange={e=>setMapChoice(e.target.checked)}/> Nur Karte · ohne Höhen / Gebäude (automatisch über 8 km)</label>
        {tooBig && <div className="note warn">Zu gross für den Prototyp: maximal {MAX_SPAN_M / 1000} km Seitenlänge{rotation ? ' (umschliessendes Rechteck der gedrehten Auswahl)' : ''}. Grössere Gebiete brauchen ein gestuftes Laden (grob für die Übersicht, fein wo die Kamera hinschaut) – noch nicht umgesetzt.</div>}
        {!mapOnly && !tooBig && span > AUTO_BUILDINGS_M && <div className={`note ${withBuildings ? 'warn' : ''}`}>{withBuildings ? `Grosses Gebiet mit Gebäuden: ${leaves} Kacheln, mehrere zehntausend Gebäude möglich – langsam und speicherhungrig. Für die Übersicht besser ohne.` : `Grosses Gebiet: Gelände mit ${step} m Raster; Gebäude sind ausgeschaltet (Häkchen setzt sie wieder ein).`}</div>}
        {rect && rotation !== 0 && <div className="note">Gedrehte Auswahl: geladen wird das umschliessende Nord-Süd-Rechteck; die Übersichtskamera blickt entlang der Drehung ({rotation}°), das Koordinatengitter bleibt LV95.</div>}
        <div className="note">{mapOnly ? 'Kartenmodus: nur Kartenbilder, keine Höhen- oder Gebäudekacheln.' : 'Höhendaten und optional Gebäude werden von swisstopo geladen. Fehlende Höhenabdeckung bleibt ausgespart.'} Projekt speichern sichert den Ausschnitt und den Lademodus.</div>
        <button className="primary big" disabled={!lv || tooBig} onClick={load}>{lv ? (mapOnly?'Karte laden':'Gelände laden') : 'Zuerst ein Rechteck zeichnen'}</button>
        <button className="ghost small" onClick={() => loadAeuli()}>Äuli-Gelände öffnen (ohne Demo)</button><button className="primary big" onClick={() => loadAeuli(true)}>Animierte Äuli-Demo öffnen</button>
        {config.elements.length > 0 && <div className="dim small">{config.elements.length} Elemente bleiben erhalten (LV95-Koordinaten).</div>}
      </div>
    </div>
  </div>
}
