const abbreviations=new Set('BLEM WLEM FOP OLTI NATO UNO EU CH LV LV95 WGS EPSG N S E W O NO NW SO SW'.split(' '))
export function extractPlaceNames(text:string):string[] {
 return [...new Set((text.match(/(?<![\p{L}])[A-ZÄÖÜ][A-ZÄÖÜẞ]{2,}(?![\p{L}])/gu)??[]).filter(x=>!abbreviations.has(x)))].slice(0,60)
}
export const normalizePlace=(s:string)=>s.toUpperCase().replace(/Ä/g,'AE').replace(/Ö/g,'OE').replace(/Ü/g,'UE').replace(/ß/gi,'SS').replace(/[^A-Z0-9]/g,'')
export const placeQuery=(s:string)=>s==='RHEINS'?'Rhein':s
