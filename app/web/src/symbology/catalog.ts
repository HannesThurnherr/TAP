/** Swiss APM profile: supplied Reglement 52.002.04 (2012), printed page references. */
export const UNIT_SYMBOLS = {
 infantry:{name:'Infanterie',page:62,aliases:'Inf'}, armor:{name:'Panzer',page:65,aliases:'Pz'},
 panzergrenadier:{name:'Panzergrenadiere',page:65,aliases:'Pz Gren mechanisierte Infanterie'}, recon:{name:'Aufklärung',page:52,aliases:'Aufkl'}, armoredRecon:{name:'Aufklärung mechanisiert',page:65,aliases:'Pz Aufkl'},
 artillery:{name:'Artillerie',page:67,aliases:'Art'}, armoredArtillery:{name:'Panzerartillerie',page:67,aliases:'Pz Art'},
 engineer:{name:'Genie',page:77,aliases:'G Sap Sappeur'}, signals:{name:'Übermittlung',page:83,aliases:'Uem'},
 logistics:{name:'Logistik',page:86,aliases:'Log'}, supply:{name:'Nachschub',page:86,aliases:'Ns'},
 medical:{name:'Sanität',page:90,aliases:'San'}, hospital:{name:'Spital',page:90,aliases:'Spit H'},
 rescue:{name:'Rettung',page:52,aliases:'Rttg'}, antiTank:{name:'Panzerabwehr',page:52,aliases:'Pzaw'},
} as const
export type UnitCode=keyof typeof UNIT_SYMBOLS
export const ECHELONS={none:'Ohne',crew:'Team / Besatzung',team:'Trupp',squad:'Gruppe',platoon:'Zug',company:'Kompanie / Batterie',battalion:'Bataillon / Abteilung',regiment:'Regiment',brigade:'Brigade',division:'Division',corps:'Armeekorps',army:'Armee'} as const
export type Echelon=keyof typeof ECHELONS
export const AFFILIATIONS={friendly:'Freund',hostile:'Gegner / Gegenseite',neutral:'Neutral',unknown:'Unbekannt'} as const
export type Affiliation=keyof typeof AFFILIATIONS
export interface UnitSymbol {code:UnitCode; affiliation?:Affiliation; echelon?:Echelon; hq?:boolean; taskForce?:boolean; strength?:'reinforced'|'reduced'}
export type SymbolStatus='active'|'planned'
export const TACTICAL_LINES={
 phaseLine:{name:'Phasenlinie',page:191}, departureLine:{name:'Ablauflinie',page:192}, boundary:{name:'Abschnittsgrenze',page:191},
 movement:{name:'Verschiebung',page:192}, motorized:{name:'Motorisierte Verschiebung',page:193}, mechanized:{name:'Mechanisierte Verschiebung',page:193},
 withdrawal:{name:'Rückzug',page:197}, observe:{name:'Beobachten',page:199}, fireDirection:{name:'Schussrichtung',page:200},
 wire:{name:'Drahthindernis',page:200}, barrier:{name:'Sperre',page:201},
 antiTankBarrier:{name:'Panzersperre',page:201}, fortified:{name:'Befestigte Linie',page:202}, front:{name:'Vordere Linie eigener Truppen',page:191},
} as const
export type TacticalLine=keyof typeof TACTICAL_LINES
export const TACTICAL_AREAS={assembly:{name:'Bereitschaftsraum',page:203},keyTerrain:{name:'Schlüsselgelände',page:203},strongpoint:{name:'Stützpunkt',page:207}} as const
export type TacticalArea=keyof typeof TACTICAL_AREAS
export const POINT_SYMBOLS={checkpoint:{name:'Check-Point',page:176},post:{name:'Beobachtungs- / Aufklärungsposten',page:158},installation:{name:'Permanente Einrichtung',page:151},demolitionPlanned:{name:'Geplante Zerstörung',page:181},demolitionPrepared2:{name:'Vorbereitete Zerstörung BG 2',page:181},demolitionPrepared3:{name:'Vorbereitete Zerstörung BG 3',page:181},destroyed:{name:'Objekt zerstört / gesprengt',page:181}} as const
export type PointCode=keyof typeof POINT_SYMBOLS
export const affiliationForSide=(side?:string):Affiliation=>side==='blue'?'friendly':side==='red'?'hostile':side==='unknown'?'unknown':'neutral'
export const AFFILIATION_FILL:Record<Affiliation,string>={friendly:'#80e0ff',hostile:'#ff8080',neutral:'#aaffaa',unknown:'#ffff80'}
export const AFFILIATION_STROKE:Record<Affiliation,string>={friendly:'#167acc',hostile:'#e83232',neutral:'#258a36',unknown:'#c6aa00'}
export const labels=(catalog:Record<string,{name:string}>)=>Object.fromEntries(Object.entries(catalog).map(([id,item])=>[id,item.name]))
