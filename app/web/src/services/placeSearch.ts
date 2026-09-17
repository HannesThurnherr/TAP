export type PlaceHit = { label: string; searchName?: string; featureKind?: string; origin?: string; lat: number; lon: number; E: number; N: number }

export function parsePlaceResults(data: any): PlaceHit[] {
  return (Array.isArray(data?.results) ? data.results : []).flatMap((result: any) => {
    const a = result?.attrs
    // SearchServer uses y for easting and x for northing with sr=2056.
    if (!a || ![a.y,a.x,a.lat,a.lon].every(v => typeof v === 'number' && Number.isFinite(v)) || typeof a.label !== 'string') return []
    if (a.y < 2400000 || a.y > 2900000 || a.x < 1000000 || a.x > 1400000) return []
    return [{ ...(a.origin ? {origin:a.origin,featureKind:a.objectclass,searchName:(a.label.match(/<b>(.*?)<\/b>/)?.[1] ?? '').replace(/<[^>]*>/g,'').split(' (')[0]} : {}), label: a.label.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' '), E: a.y, N: a.x, lat: a.lat, lon: a.lon }]
  })
}

export async function searchPlaces(query: string, signal?: AbortSignal, limit=8): Promise<PlaceHit[]> {
  const params = new URLSearchParams({type:'locations',searchText:query.trim(),sr:'2056',limit:String(limit)})
  const response = await fetch(`https://api3.geo.admin.ch/rest/services/api/SearchServer?${params}`, {signal})
  if (!response.ok) throw new Error('Ortssuche nicht erreichbar')
  return parsePlaceResults(await response.json())
}

export function appendPlaceReference(notes: string, alias: string, hit: PlaceHit): string {
  const line = `${alias.trim() || hit.label}: [${hit.E}, ${hit.N}] (LV95; swisstopo: ${hit.label})`
  if (notes.split('\n').includes(line)) return notes
  return `${notes.trimEnd()}${notes.trim() ? '\n' : ''}${line}`
}
