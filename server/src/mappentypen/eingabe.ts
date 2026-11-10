/**
 * Eingaben der Mappentypen bereinigen (#1073, aus dienst.ts): nur bekannte Eigenschaften übernehmen – Felder, Register,
 * Trefferlisten, Archivmodus, Beschriftungen; was beim Ändern bleibt, wenn die Eingabe es nicht nennt.
 */
import {
  BELIEBIGER_TYP, einzigesZiel, ERKENNBAR_AN_MAX, FELDTYPEN, istHistoriengruppe, istSystemspalte, leseZahl, REGISTERARTEN, schluesselAus, standardRegister,
  ZIELTYPEN_MAX, zielTypenAus, type Feld, type MappentypDaten, type Quelle, type Register, type Trefferliste,
} from '../../../shared/src/model';
import { ausgangAus, bereinigeBeschriftungen, ergaenzeBeschriftungen, type Beschriftungen, type FeldTeile, type NamensTeile, type TypTeile } from '../../../shared/src/beschriftung';
import { bereinigeAbschnitte, festigeDarstellung } from '../../../shared/src/darstellung';
import { bereinigeAnzeige } from '../../../shared/src/anzeige';
import { bereinigeFolgtAus } from '../../../shared/src/folgtaus';
import { bereinigeVorbelegen } from '../../../shared/src/vorbelegen';
import { HEUTE, type Feldformat } from '../../../shared/src/feldformate';
import { bereinigeAuswahlfilter } from '../../../shared/src/sichten';
import { bereinigeFrist } from '../../../shared/src/fristen';
import { JAHRE_MAX } from '../../../shared/src/archiv';
import { liesFeldErkennung, liesWiederfinden } from '../../../shared/src/erkennung';
import { leseProzent, leseZeitraum, zeitraumIso } from '../../../shared/src/feldarten';
import { PAKET_ID, SCHLUESSEL, TYP_KENNUNG } from '../../../shared/src/kennungen';
import { TABELLE_NEU_MAX, type Tabellenquelle } from '../../../shared/src/tabelle';
import { Fachfehler } from '../fehler';
import { t } from '../sprache';

const text = (v: unknown) => (v == null ? '' : String(v)).trim();

function zahlOderNull(v: unknown): number | null {
  const n = leseZahl(v);
  return n == null || Number.isNaN(n) ? null : n;
}

/** Teile, die sich je Sprache beschriften lassen (#728). */
const FELD_TEILE = ['label', 'hilfe', 'optionen', 'neu'] as const satisfies ReadonlyArray<keyof FeldTeile>;
const NAMENS_TEILE = ['name'] as const satisfies ReadonlyArray<keyof NamensTeile>;
export const TYP_TEILE = ['name', 'beschreibung'] as const satisfies ReadonlyArray<keyof TypTeile>;
/** Am Mappentyp zusätzlich „Woran man ihn erkennt“ (#937); Ansichten haben das nicht. */
const MAPPENTYP_TEILE = [...TYP_TEILE, 'erkennbarAn'] as const satisfies ReadonlyArray<keyof TypTeile>;
/** Beschriftungen oder nichts – leere Angaben werden nicht gespeichert. */
export const mitBeschriftungen = <T extends object>(b: T | undefined): { beschriftungen?: T } => (b ? { beschriftungen: b } : {});
/**
 * Standard-Beschriftungen eines Systemfelds ergänzen (#729): Was der Administrator schon beschriftet hat, bleibt; Bezeichnung
 * und Hilfetext anderer Sprachen nur, solange der deutsche Text der Standard ist.
 */
export function mitSystemBeschriftung(f: Feld, s: Feld): { beschriftungen?: Beschriftungen<FeldTeile> } {
  const std = structuredClone(s.beschriftungen ?? {}) as Record<string, FeldTeile>;
  for (const e of Object.values(std)) {
    if (f.label && f.label !== s.label) delete e.label;
    if (f.hilfe && f.hilfe !== s.hilfe) delete e.hilfe;
  }
  return mitBeschriftungen(ergaenzeBeschriftungen(f.beschriftungen, std));
}

export function bereinigeFeld(e: unknown): Feld {
  const f = (e ?? {}) as Record<string, unknown>;
  const typ = (text(f.typ) in FELDTYPEN ? text(f.typ) : 'text') as Feld['typ'];
  const std = f.standard;
  // Auswahl (#728): die festen Werte, jeder einmal; gespeicherte Mappen behalten ihren Wert.
  const optionen = Array.isArray(f.optionen) ? [...new Set(f.optionen.map(text).filter(Boolean))] : [];
  // Ziele (#1036): neu `zielTypen`, sonst wie bisher `zielTyp` – Clients und Dateien älterer Versionen gelten weiter.
  const ziele = zielTypenAus(Array.isArray(f.zielTypen) ? f.zielTypen : f.zielTyp);
  const optional = Array.isArray(f.zielOptional)
    ? [...new Set(f.zielOptional.map(text).filter((k) => k.includes(':') && TYP_KENNUNG.test(k)))].slice(0, ZIELTYPEN_MAX) : [];
  return {
    key: text(f.key),
    // Deutsch ist der Ausgangstext; `beschriftungen.de.label` (z. B. aus einem Paket) gilt als Bezeichnung.
    label: ausgangAus(f.beschriftungen, 'label', text(f.label)),
    typ,
    // Tabelle (#1030): kein Wert – nie Pflicht, kein Standard.
    pflicht: !!f.pflicht && typ !== 'tabelle',
    eindeutig: !!f.eindeutig && (typ === 'text' || typ === 'zahl'),
    hilfe: ausgangAus(f.beschriftungen, 'hilfe', text(f.hilfe)),
    standard: std == null || std === '' || typ === 'passwort' || typ === 'tabelle' ? null : typeof std === 'boolean' ? std : standardText(typ, std),
    minLen: zahlOderNull(f.minLen),
    maxLen: zahlOderNull(f.maxLen),
    muster: text(f.muster),
    // Datum (#535): „heute“ oder ein Datum; ungültige Angaben bleiben stehen, damit die Prüfung sie meldet.
    min: typ === 'datum' ? datumsgrenze(f.min) : zahlOderNull(f.min),
    max: typ === 'datum' ? datumsgrenze(f.max) : zahlOderNull(f.max),
    nachkomma: zahlOderNull(f.nachkomma),
    waehrung: typ === 'betrag' ? (text(f.waehrung) || 'EUR').toUpperCase().slice(0, 3) : undefined,
    // Negative Beträge (#1035): nur gespeichert, wenn an; Vorgabe wie bisher ≥ 0.
    ...(typ === 'betrag' && f.negativ === true ? { negativ: true } : {}),
    optionen,
    mehrfach: !!f.mehrfach && (typ === 'auswahl' || typ === 'referenz'),
    // Ziele (#1036): `zielTypen` (ein oder mehrere Mappentypen); die alte Form `zielTyp` wird gelesen, nie geschrieben.
    ...(typ === 'referenz' ? { zielTypen: ziele } : {}),
    // „Alle vom selben Typ“ (#1036): nur mit mehreren Mappen; die Prüfung meldet, wenn es nur einen Zieltyp gibt.
    ...(typ === 'referenz' && f.gleicherTyp === true ? { gleicherTyp: true } : {}),
    // Optionale Zieltypen aus Paketen (#1036): Kennungen „paket:schluessel“, die (noch) fehlen dürfen.
    ...(typ === 'referenz' && optional.length ? { zielOptional: optional } : {}),
    // Auswahlfilter (#172): nur an Referenzfeldern mit festen Zieltypen (bei mehreren über die gemeinsamen Felder).
    ...(typ === 'referenz' && ziele.length && !ziele.includes(BELIEBIGER_TYP) && bereinigeAuswahlfilter(f.auswahlFilter).length ? { auswahlFilter: bereinigeAuswahlfilter(f.auswahlFilter) } : {}),
    // Folgt aus (#886): nur an Verweisfeldern mit genau einem Zieltyp; geprüft wird im Mappentyp.
    ...(typ === 'referenz' && einzigesZiel({ zielTypen: ziele }) && bereinigeFolgtAus(f.folgtAus) ? { folgtAus: bereinigeFolgtAus(f.folgtAus) } : {}),
    // Beim Auswählen übernehmen (#1037): nur an Verweisfeldern mit festen Zieltypen; ob die Felder passen, prüft der Mappentyp.
    ...(typ === 'referenz' && !ziele.includes(BELIEBIGER_TYP) && bereinigeVorbelegen(f.vorbelegen).length ? { vorbelegen: bereinigeVorbelegen(f.vorbelegen) } : {}),
    verweisart: f.verweisart === 'zugehoerigkeit' ? 'zugehoerigkeit' : 'bezug',
    // Fristen (#129): nur an Datumsfeldern.
    ...(typ === 'datum' && bereinigeFrist(f.frist) ? { frist: bereinigeFrist(f.frist) } : {}),
    // Aus Dokument füllen (#336, #938; früher „Für die Erkennung nutzen“): Art und Erkennungshinweis; nur bei geeigneten Feldarten.
    ...(liesFeldErkennung(f.erkennung, typ) ? { erkennung: liesFeldErkennung(f.erkennung, typ) } : {}),
    // Zum Wiederfinden nutzen (#938): nur Text, Zahl und Verweis.
    ...(liesWiederfinden(f.wiederfinden, typ) ? { wiederfinden: true } : {}),
    // Paket-Update (#534): Verweisfeld, das sich aus einem alten Textfeld füllen lässt.
    ...(typ === 'referenz' && SCHLUESSEL.test(text(f.ausText)) && text(f.ausText) !== text(f.key) ? { ausText: text(f.ausText) } : {}),
    // Feldformat (#535): nur an Textfeldern; das Land-Feld nur beim Format PLZ.
    ...(typ === 'text' && text(f.format) ? { format: text(f.format) as Feldformat } : {}),
    ...(typ === 'text' && text(f.format) === 'plz' && text(f.landFeld) ? { landFeld: text(f.landFeld) } : {}),
    // Beschriftungen je Sprache (#728): Bezeichnung, Hilfetext und – bei Auswahl – die Optionen.
    ...mitBeschriftungen(bereinigeBeschriftungen<FeldTeile>(f.beschriftungen, FELD_TEILE, typ === 'auswahl' ? optionen : undefined)),
    // Ausgeblendet (#655): nur gespeichert, wenn an; Pflicht hebt festigeDarstellung auf.
    ...(f.ausgeblendet === true ? { ausgeblendet: true } : {}),
    // Anzeigen, wenn … (#1033): nur mit mindestens einer Bedingung; ob sie passen, prüft der Dienst beim Speichern.
    ...(bereinigeAnzeige(f.anzeigen) ? { anzeigen: bereinigeAnzeige(f.anzeigen) } : {}),
    // Tabelle (#1030): Quelle wie beim Verknüpfungsregister, dazu die Beschriftung von „+ Neu“; geprüft im Mappentyp.
    ...(typ === 'tabelle' ? { quelle: bereinigeTabellenquelle(f.quelle) } : {}),
    // Berechnet (#1034): Id des Pakets; ob es die Angabe setzen darf, entscheidet behalteBerechnet.
    ...(typ !== 'passwort' && typ !== 'tabelle' && PAKET_ID.test(text(f.berechnetVon)) ? { berechnetVon: text(f.berechnetVon) } : {}),
  };
}

/** Quelle einer Tabelle (#1030): Typ, Verweisfeld, Trefferliste und „+ Neu“ – Texte gekürzt, Leeres weg. */
function bereinigeTabellenquelle(e: unknown): Tabellenquelle {
  const q = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
  const liste = text(q.trefferliste).slice(0, 40);
  const neu = text(q.neu).replace(/\s+/g, ' ').trim().slice(0, TABELLE_NEU_MAX);
  return { typId: text(q.typId), feldKey: text(q.feldKey), ...(liste ? { trefferliste: liste } : {}), ...(neu ? { neu } : {}) };
}

/**
 * Berechnete Felder (#1034): `berechnetVon` setzt nur die Paketverwaltung (`ausPaket`, Id des Pakets, das den Typ
 * mitbringt) – über die Werkbank oder die Schnittstelle lässt sich kein Feld zum berechneten machen. Was schon berechnet
 * ist, bleibt es, auch wenn die Eingabe die Angabe nicht nennt (älteres Programm, Kopie des Typs aus der Oberfläche).
 * „Feld wieder freigeben“: die Angabe ausdrücklich leer (`berechnetVon: null`) – das darf, wer Mappentypen ändern darf
 * (die Route verlangt das), und das Paket selbst bei einem Update, das das Feld nicht mehr berechnet.
 */
export function behalteBerechnet(roh: unknown, d: MappentypDaten, alt: Pick<MappentypDaten, 'felder'> | undefined, ausPaket?: string): MappentypDaten {
  const r = (roh ?? {}) as Record<string, unknown>;
  const quelle = (key: string) => (Array.isArray(r.felder) ? r.felder : []).find((y) => !!y && typeof y === 'object' && text((y as Record<string, unknown>).key) === key) as Record<string, unknown> | undefined;
  const felder = d.felder.map((f) => {
    const { berechnetVon: neu, ...ohne } = f;
    const vorher = alt?.felder.find((y) => y.key === f.key)?.berechnetVon;
    if (f.system || f.typ === 'passwort') return ohne;
    // Nie Pflicht: Den Wert schreibt nur das Paket, nicht wer die Mappe anlegt.
    if (vorher) {
      const q = quelle(f.key);
      return q && 'berechnetVon' in q && !text(q.berechnetVon) ? ohne : { ...ohne, pflicht: false, berechnetVon: vorher };
    }
    return neu && ausPaket && neu === ausPaket ? { ...f, pflicht: false } : ohne;
  });
  return { ...d, felder };
}

/**
 * Standardwert als Text (#1035): Zeitraum in der kurzen Schreibweise (`P3M` statt „3 Monate“ – gilt in jeder Sprache),
 * Prozent als Zahl („19 %“ → „19“). Was sich nicht lesen lässt, bleibt stehen, damit die Prüfung es meldet.
 */
function standardText(typ: Feld['typ'], std: unknown): string {
  if (typ === 'zeitraum') { const z = leseZeitraum(std); if (z) return zeitraumIso(z); }
  if (typ === 'prozent') { const n = leseProzent(std); if (n != null && Number.isFinite(n)) return String(n); }
  return String(std);
}

/** Datumsgrenze (#535) aus einer Eingabe: leer = keine, sonst getrimmt („Heute“ → „heute“). */
function datumsgrenze(v: unknown): string | null {
  const x = v == null ? '' : String(v).trim();
  return !x ? null : x.toLowerCase() === HEUTE ? HEUTE : x;
}

export function bereinigeRegister(e: unknown, felder: Feld[]): Register[] {
  if (!Array.isArray(e) || !e.length) return standardRegister(felder);
  const bekannt = new Set(felder.map((f) => f.key));
  const reg = e.map((x: Record<string, unknown>): Register => {
    const art = (String(x?.art) in REGISTERARTEN ? x.art : 'felder') as Register['art'];
    const name = ausgangAus(x?.beschriftungen, 'name', text(x?.name));
    const r: Register = { key: text(x?.key) || schluesselAus(name), name, art, ...mitBeschriftungen(bereinigeBeschriftungen<NamensTeile>(x?.beschriftungen, NAMENS_TEILE)) };
    if (art === 'felder') r.felder = (Array.isArray(x?.felder) ? x.felder.map(text) : []).filter((k) => bekannt.has(k));
    // Ausgeblendet (#655): ob es bei diesem Register geht, prüft festigeDarstellung.
    if (x?.ausgeblendet === true) r.ausgeblendet = true;
    if (art === 'verknuepfungen') {
      r.quellen = (Array.isArray(x?.quellen) ? x.quellen : [])
        .map((q: Record<string, unknown>): Quelle => ({ typId: text(q?.typId), feldKey: text(q?.feldKey), ...(text(q?.trefferliste) ? { trefferliste: text(q?.trefferliste).slice(0, 40) } : {}) }))
        .filter((q) => q.typId && q.feldKey);
    }
    // Volltext (#45): nur das Abschalten wird gespeichert; Standard ist an.
    if (art === 'dokumente' && x?.volltext === false) r.volltext = false;
    // Historie (#800): welche Gruppen das Register zeigt – nur bekannte, jede einmal; fehlt = Vorauswahl.
    if (art === 'protokoll' && Array.isArray(x?.zeigt)) r.zeigt = [...new Set(x.zeigt.filter(istHistoriengruppe))];
    // Versionierung (#194): Standard aus; „nur die letzten N“ ab 2, leer = alle.
    if (art === 'dokumente' && x?.versionierung === true) {
      r.versionierung = true;
      const n = Math.trunc(Number(x.versionenBehalten));
      if (x.versionenBehalten != null && x.versionenBehalten !== '' && Number.isFinite(n) && n >= 2) r.versionenBehalten = Math.min(n, 1000);
    }
    return r;
  });
  // Felder ohne Register landen auf dem ersten Feldregister.
  const erstes = reg.find((r) => r.art === 'felder');
  if (erstes) {
    const vergeben = new Set(reg.flatMap((r) => r.felder ?? []));
    for (const f of felder) if (!vergeben.has(f.key)) erstes.felder!.push(f.key);
  }
  // Abschnitte (#890): nur in Feldregistern, nur vor eigenen Feldern; leer = keine (nichts gespeichert).
  reg.forEach((r, i) => {
    if (r.art !== 'felder') return;
    const a = bereinigeAbschnitte((e[i] as Record<string, unknown> | undefined)?.abschnitte, r.felder ?? []);
    if (a?.length) r.abschnitte = a;
  });
  return reg;
}

/** Nur bekannte Spalten, jede einmal; Spalten entfernter Felder, Passwortfelder und Tabellen (#1030) fallen still weg. */
function bereinigeSpalten(e: unknown, felder: Feld[]): string[] {
  return [...new Set((Array.isArray(e) ? e : []).map(text))]
    .filter((k) => (istSystemspalte(k) && k !== '_typ') || felder.some((f) => f.key === k && f.typ !== 'passwort' && f.typ !== 'tabelle'));
}

/**
 * Trefferlisten (#75): mindestens eine, Schlüssel eindeutig, genau eine ist Standard.
 * Die ältere Angabe `trefferliste` (nur Spalten) ersetzt – falls angegeben – die Spalten der Standardliste.
 */
export function bereinigeTrefferlisten(t: Record<string, unknown>, felder: Feld[]): { trefferlisten: Trefferliste[]; trefferliste: string[] } {
  const roh = Array.isArray(t.trefferlisten) ? (t.trefferlisten as Array<Record<string, unknown>>) : [];
  const listen: Trefferliste[] = [];
  for (const x of roh) {
    const name = ausgangAus(x?.beschriftungen, 'name', text(x?.name)).slice(0, 80) || 'Trefferliste';
    let key = (text(x?.key) || schluesselAus(name) || 'liste').slice(0, 40);
    for (let i = 2; listen.some((l) => l.key === key); i++) key = `${(text(x?.key) || schluesselAus(name) || 'liste').slice(0, 36)}_${i}`;
    listen.push({ key, name, spalten: bereinigeSpalten(x?.spalten, felder), ...(x?.standard === true ? { standard: true } : {}), ...mitBeschriftungen(bereinigeBeschriftungen<NamensTeile>(x?.beschriftungen, NAMENS_TEILE)) });
  }
  if (!listen.length) listen.push({ key: 'standard', name: 'Standard', spalten: [], standard: true });
  const std = listen.find((l) => l.standard) ?? listen[0];
  for (const l of listen) { if (l === std) l.standard = true; else delete l.standard; }
  if (Array.isArray(t.trefferliste) && (!roh.length || JSON.stringify(t.trefferliste) !== JSON.stringify(std.spalten))) {
    // Nur die alte Form angegeben, oder sie weicht ab (z. B. { ...typ, trefferliste: [...] } über die API).
    std.spalten = bereinigeSpalten(t.trefferliste, felder);
  }
  return { trefferlisten: listen, trefferliste: std.spalten };
}

export function bereinigeTyp(e: unknown): MappentypDaten {
  const t = (e ?? {}) as Record<string, unknown>;
  const felder = Array.isArray(t.felder) ? t.felder.map(bereinigeFeld) : [];
  // Archivmodus (#212): Frist 1–30 Jahre, Stichtag ein Feldschlüssel oder null (Anlagedatum).
  const a = t.archiv && typeof t.archiv === 'object' ? t.archiv as Record<string, unknown> : null;
  const jahre = a ? Math.trunc(Number(a.jahre)) : 0;
  const archiv = a && jahre >= 1 && jahre <= JAHRE_MAX ? { jahre, stichtag: text(a.stichtag) || null } : null;
  const register = bereinigeRegister(t.register, felder);
  // Im Archivmodus ist die Versionierung Pflicht, und ältere Versionen bleiben bis zum Fristende.
  if (archiv) for (const r of register) if (r.art === 'dokumente') { r.versionierung = true; delete r.versionenBehalten; }
  // Ausblenden (#655): nur, wo es geht; ausgeblendete Felder sind nie Pflicht.
  festigeDarstellung({ felder, register });
  return {
    name: ausgangAus(t.beschriftungen, 'name', text(t.name)),
    ...(text(t.schluessel) ? { schluessel: text(t.schluessel) } : {}),
    beschreibung: ausgangAus(t.beschriftungen, 'beschreibung', text(t.beschreibung)),
    // Name, Beschreibung und „Woran man ihn erkennt“ je Sprache (#728, #937); undefined = keine (die Datenbank speichert NULL).
    beschriftungen: kuerzeErkennbarAn(bereinigeBeschriftungen<TypTeile>(t.beschriftungen, MAPPENTYP_TEILE)),
    // Kann aus Post angelegt werden (#937): ja, nein oder null = Vorgabe (an mit Dokumentenregister).
    ausPost: typeof t.ausPost === 'boolean' ? t.ausPost : null,
    // Woran man ihn erkennt (#937): kurz, für die Klassifizierung.
    erkennbarAn: ausgangAus(t.beschriftungen, 'erkennbarAn', text(t.erkennbarAn)).replace(/\s+/g, ' ').trim().slice(0, ERKENNBAR_AN_MAX),
    // Altes Format: titelFeld → Vorlage {feld}
    titelVorlage: text(t.titelVorlage) || (text(t.titelFeld) ? `{${text(t.titelFeld)}}` : ''),
    felder,
    register,
    ...bereinigeTrefferlisten(t, felder),
    archiv,
    // Die Haken „Neue Mappen/Löschen erlauben“ gibt es nicht mehr (#146): das regeln die Berechtigungen.
    erstellenErlaubt: true,
    loeschenErlaubt: true,
  };
}

/** „Woran man ihn erkennt“ (#937) auch in anderen Sprachen höchstens ERKENNBAR_AN_MAX Zeichen. */
function kuerzeErkennbarAn(b: Beschriftungen<TypTeile> | undefined): Beschriftungen<TypTeile> | undefined {
  if (!b) return b;
  for (const x of Object.values(b)) if (x?.erkennbarAn) x.erkennbarAn = x.erkennbarAn.replace(/\s+/g, ' ').trim().slice(0, ERKENNBAR_AN_MAX);
  return b;
}

/**
 * Angaben behalten, die eine Eingabe nicht nennt (#937, #938): Wer einen Mappentyp ohne `ausPost` bzw. `erkennbarAn`
 * speichert (z. B. ein älteres Programm über die API), behält die bisherigen; ebenso je Feld `wiederfinden`.
 */
export function behalteErkennung(roh: unknown, d: MappentypDaten, alt: Pick<MappentypDaten, 'ausPost' | 'erkennbarAn' | 'felder'>): MappentypDaten {
  const r = (roh ?? {}) as Record<string, unknown>;
  const rohFelder = Array.isArray(r.felder) ? r.felder as unknown[] : [];
  const felder = d.felder.map((f) => {
    const q = rohFelder.find((y) => !!y && typeof y === 'object' && text((y as Record<string, unknown>).key) === f.key) as Record<string, unknown> | undefined;
    if (q && 'wiederfinden' in q) return f;
    const vorher = alt.felder.find((y) => y.key === f.key && y.typ === f.typ);
    return vorher?.wiederfinden ? { ...f, wiederfinden: true } : f;
  });
  return {
    ...d, felder,
    ...('ausPost' in r ? {} : { ausPost: alt.ausPost ?? null }),
    ...('erkennbarAn' in r || hatErkennbarAnBeschriftung(r.beschriftungen) ? {} : { erkennbarAn: alt.erkennbarAn ?? '' }),
  };
}
/**
 * Darstellung behalten (#655, #890, #1033): Wer einen Mappentyp ohne `ausgeblendet` bzw. `anzeigen` an Feld bzw. Register oder ohne `abschnitte`
 * an einem Feldregister speichert (z. B. ein älteres Programm über die API), behält die bisherigen Angaben. Abschnitte
 * vor Feldern, die nicht mehr auf dem Register liegen, fallen weg.
 */
export function behalteDarstellung(roh: unknown, d: MappentypDaten, alt: Pick<MappentypDaten, 'felder' | 'register'>): MappentypDaten {
  const r = (roh ?? {}) as Record<string, unknown>;
  const quelle = (liste: unknown, key: string) => (Array.isArray(liste) ? liste : []).find((y) => !!y && typeof y === 'object' && text((y as Record<string, unknown>).key) === key) as Record<string, unknown> | undefined;
  const felder = d.felder.map((f) => {
    const q = quelle(r.felder, f.key);
    const vorher = alt.felder.find((y) => y.key === f.key);
    let neu = f;
    if (!(q && 'ausgeblendet' in q) && vorher?.ausgeblendet) neu = { ...neu, ausgeblendet: true };
    // Anzeigen, wenn … (#1033): Wer es nicht nennt (älteres Programm), behält die bisherige Regel.
    if (!(q && 'anzeigen' in q) && vorher?.anzeigen) neu = { ...neu, anzeigen: vorher.anzeigen };
    return neu;
  });
  const register = d.register.map((x) => {
    const q = quelle(r.register, x.key);
    const vorher = alt.register.find((y) => y.key === x.key && y.art === x.art);
    let neu = x;
    if (!(q && 'ausgeblendet' in q) && vorher?.ausgeblendet) neu = { ...neu, ausgeblendet: true };
    if (x.art === 'felder' && !(q && 'abschnitte' in q) && vorher?.abschnitte?.length) {
      const a = bereinigeAbschnitte(vorher.abschnitte, x.felder ?? []);
      if (a?.length) neu = { ...neu, abschnitte: a };
    }
    return neu;
  });
  const erg = { ...d, felder, register };
  festigeDarstellung(erg);
  return erg;
}
const hatErkennbarAnBeschriftung = (b: unknown) => !!b && typeof b === 'object' && Object.values(b as Record<string, unknown>).some((x) => !!x && typeof x === 'object' && 'erkennbarAn' in x && (x as Record<string, unknown>).erkennbarAn != null);

/**
 * Beschriftungen behalten (#728): Wer einen Mappentyp ohne die Angabe `beschriftungen` speichert (z. B. ein älteres
 * Programm über die API), löscht damit keine – je Typ, Feld, Register und Trefferliste bleiben dann die bisherigen.
 * Wer sie mitgibt (auch leer oder null), setzt sie neu.
 */
export function behalteBeschriftungen(roh: unknown, d: MappentypDaten, alt: Pick<MappentypDaten, 'beschriftungen' | 'felder' | 'register' | 'trefferlisten'>): MappentypDaten {
  const r = (roh ?? {}) as Record<string, unknown>;
  const hat = (x: unknown) => !!x && typeof x === 'object' && 'beschriftungen' in x;
  const nachKey = <T extends { key: string; beschriftungen?: unknown }>(neu: T[], rohe: unknown, vorher: T[] | undefined): T[] => {
    const liste = Array.isArray(rohe) ? rohe : [];
    return neu.map((x) => {
      const quelle = liste.find((y) => !!y && typeof y === 'object' && text((y as Record<string, unknown>).key) === x.key);
      if (hat(quelle)) return x;
      const a = vorher?.find((y) => y.key === x.key);
      return a?.beschriftungen ? { ...x, beschriftungen: a.beschriftungen } : x;
    });
  };
  const felder = nachKey(d.felder, r.felder, alt.felder).map((f) => {
    // Beschriftungen entfernter Optionen fallen weg.
    if (!f.beschriftungen) return f;
    const b = bereinigeBeschriftungen<FeldTeile>(f.beschriftungen, FELD_TEILE, f.typ === 'auswahl' ? f.optionen : undefined);
    const { beschriftungen: _b, ...rest } = f;
    return b ? { ...rest, beschriftungen: b } : rest;
  });
  return {
    ...d,
    ...(hat(r) ? {} : { beschriftungen: alt.beschriftungen }),
    felder,
    register: nachKey(d.register, r.register, alt.register),
    ...(d.trefferlisten ? { trefferlisten: nachKey(d.trefferlisten, r.trefferlisten, alt.trefferlisten) } : {}),
  };
}

/** Stand einer Änderung (#609): „zuletzt geändert“ als ISO-Zeitpunkt; fehlt = ohne Prüfung. */
export function liesStand(v: unknown, fehler: 'mappen.konflikt.standUngueltig' | 'meldungen.dienst.stand-ungueltig' = 'mappen.konflikt.standUngueltig'): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const ms = typeof v === 'string' ? Date.parse(v) : NaN;
  if (!Number.isFinite(ms)) throw new Fachfehler(422, t(fehler));
  return new Date(ms).toISOString();
}
