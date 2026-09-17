/** Curated subset of 52.002.02, not a claim to cover all military abbreviations. */
const glossary:Record<string,string>={
 'Pz Gren':'Panzergrenadier','Inf':'Infanterie','Pz':'Panzer','Kp':'Kompanie','Bat':'Bataillon','Abt':'Abteilung','Br':'Brigade','Gr':'Gruppe','Z':'Zug','Gn':'Gegner','Rm':'Raum','Vb':'Verband','Fhr':'Führung','Kdt':'Kommandant','Log':'Logistik','San':'Sanität','Spit':'Spital','Uem':'Übermittlung','Art':'Artillerie','Pat':'Mehrdeutig: Patient oder Patrone; Kontext prüfen',
}
export function matchingAbbreviations(text:string){
 return Object.entries(glossary).filter(([short])=>new RegExp(`(?<![\\p{L}\\p{N}])${short}(?![\\p{L}\\p{N}])`,'u').test(text)).map(([short,meaning])=>({short,meaning}))
}
