/**
 * Paketverwaltung (#188): Katalog der Registry, Versionen und installierte Pakete.
 * Format von Katalog und Paket: motom001/dms-registry (README, schema/). Server und Oberfläche teilen diese Datei.
 */
import type { Hilfeort } from './hilfe';

/** Der offizielle Katalog (Branch gh-pages der Registry). */
export const OFFIZIELLER_KATALOG = 'https://raw.githubusercontent.com/motom001/dms-registry/gh-pages/katalog.json';
/** Die Registry selbst – Quellen, Regeln, Vorlage. */
export const REGISTRY = 'https://github.com/motom001/dms-registry';

export const PAKET_ID = /^[a-z][a-z0-9_]{1,19}$/;
export const VERSION = /^\d+\.\d+\.\d+$/;
export const BEREICH = /^(>=|>|=|\^|~)?(\d+\.\d+\.\d+)( <(\d+\.\d+\.\d+))?$/;

export interface Benannt { schluessel: string; name: string }
export interface KatalogVersion {
  version: string;
  /** Nötige DMS-Version, z. B. „>=0.63.0“. */
  dms: string;
  abhaengigkeiten: Record<string, string>;
  inhalt: { mappentypen: Benannt[]; sichten: Benannt[]; beispiele: number };
  code: boolean;
  /** Adresse des Archivs, relativ zu katalog.json. */
  archiv: string;
  sha256: string;
  groesse: number;
  veroeffentlicht: string;
  quelle: string; readme: string; changelog: string;
}
export interface KatalogPaket {
  id: string; name: string; beschreibung: string;
  autor: { name: string; github: string };
  lizenz: string; aktuell: string;
  /** Neueste zuerst. */
  versionen: KatalogVersion[];
}
export interface Katalog { format: number; erstellt: string; quelle: string; pakete: KatalogPaket[] }

/** Woher ein installiertes Paket stammt. */
export type Herkunft =
  | { art: 'katalog'; url: string }
  | { art: 'hochgeladen'; von: string | null; am: string };

export interface InstalliertesPaket {
  id: string; name: string; version: string; beschreibung: string; lizenz: string;
  autor: { name: string; github: string };
  herkunft: Herkunft;
  installiert: string; installiertVon: string | null;
  aktualisiert: string | null; aktualisiertVon: string | null;
  /** Lokaler Schlüssel → Id des Mappentyps bzw. der Sicht im DMS. */
  typen: Record<string, string>;
  sichten: Record<string, string>;
  /** Schlüssel der Beispiel-Mappen → Id (#347), nur wenn Beispiele mit Schlüssel angelegt wurden. */
  beispiele?: Record<string, string>;
  abhaengigkeiten: Record<string, string>;
  /** Einstellungen, wie das Paket sie beschreibt (#197); null = keine. */
  einstellungen?: import('./paketeinstellungen').Einstellungsbeschreibung | null;
  /** Nur in der Antwort der Werkbank: Pflichtfelder der Einstellungen fehlen (#197). */
  einstellungenNoetig?: boolean;
  /** Das Paket enthält Code (#338: läuft im Paket-Läufer). */
  code?: boolean;
  /** Code des Pakets (#338): Ereignisse, bestätigte Rechte und erlaubte Adressen im Netzwerk/Internet, Prüfwert des Moduls. */
  laeufer?: PaketCode;
  /** Links aus dem Katalog (README, Changelog, Quelle), sofern bekannt. */
  links?: { readme?: string; changelog?: string; quelle?: string };
}

/* ---------- Versionen ---------- */

const teile = (v: string) => v.split('.').map((x) => Number.parseInt(x, 10) || 0);

/** < 0: a älter, 0: gleich, > 0: a neuer. Vorspann wie „v“ und Zusätze wie „-rc1“ zählen nicht. */
export function vergleicheVersion(a: string, b: string): number {
  const x = teile(a.replace(/^v/, '').split('-')[0]), y = teile(b.replace(/^v/, '').split('-')[0]);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

/**
 * Passt eine Version zu einem Bereich? „>=1.2.0“, „>1.2.0“, „=1.2.0“ bzw. „1.2.0“ (genau),
 * „^1.2.0“ (gleiche Hauptversion; bei 0.x gleiche Nebenversion), „~1.2.0“ (gleiche Nebenversion),
 * optional mit Obergrenze „ <2.0.0“.
 */
export function passt(version: string, bereich: string): boolean {
  const m = BEREICH.exec(bereich.trim());
  if (!m) return false;
  const [, op = '=', basis, , ober] = m;
  const c = vergleicheVersion(version, basis);
  const [haupt, neben] = teile(basis);
  let ok: boolean;
  switch (op) {
    case '>=': ok = c >= 0; break;
    case '>': ok = c > 0; break;
    case '^': ok = c >= 0 && (haupt > 0 ? vergleicheVersion(version, `${haupt + 1}.0.0`) < 0 : vergleicheVersion(version, `0.${neben + 1}.0`) < 0); break;
    case '~': ok = c >= 0 && vergleicheVersion(version, `${haupt}.${neben + 1}.0`) < 0; break;
    default: ok = c === 0;
  }
  return ok && (!ober || vergleicheVersion(version, ober) < 0);
}

/** Eine DMS-Version ohne Zahl (z. B. „Entwicklung“) gilt als passend. */
export const dmsPasst = (dms: string, bereich: string) => !/^\d+\.\d+\.\d+/.test(dms.replace(/^v/, '')) || passt(dms.replace(/^v/, ''), bereich);

/** Neueste Version eines Katalogpakets, die zu einem Bereich passt. */
export function neuestePassende(p: KatalogPaket, bereich?: string): KatalogVersion | undefined {
  return [...p.versionen].sort((a, b) => vergleicheVersion(b.version, a.version)).find((v) => !bereich || passt(v.version, bereich));
}

/* ---------- Katalog lesen ---------- */

const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** Prüft und vereinheitlicht einen geladenen Katalog; wirft mit verständlicher Meldung. */
export function liesKatalog(j: unknown): Katalog {
  const k = j as Partial<Katalog> | null;
  if (!k || typeof k !== 'object' || !Array.isArray(k.pakete)) throw new Error('Das ist kein Paketkatalog (katalog.json).');
  if (k.format !== 1) throw new Error(`Katalogformat ${String(k.format)} kennt dieses DMS nicht – bitte das DMS aktualisieren.`);
  const pakete: KatalogPaket[] = [];
  for (const p of k.pakete) {
    if (!p || !PAKET_ID.test(text(p.id)) || !Array.isArray(p.versionen)) continue;
    const versionen = p.versionen.filter((v) => v && VERSION.test(text(v.version)) && /^[0-9a-f]{64}$/.test(text(v.sha256)) && text(v.archiv))
      .map((v) => ({
        ...v,
        dms: text(v.dms) || '>=0.0.0',
        abhaengigkeiten: v.abhaengigkeiten && typeof v.abhaengigkeiten === 'object' ? v.abhaengigkeiten : {},
        inhalt: { mappentypen: v.inhalt?.mappentypen ?? [], sichten: v.inhalt?.sichten ?? [], beispiele: Number(v.inhalt?.beispiele) || 0 },
        code: !!v.code,
      }))
      .sort((a, b) => vergleicheVersion(b.version, a.version));
    if (!versionen.length) continue;
    pakete.push({
      id: p.id, name: text(p.name) || p.id, beschreibung: text(p.beschreibung),
      autor: { name: text(p.autor?.name), github: text(p.autor?.github) }, lizenz: text(p.lizenz),
      aktuell: VERSION.test(text(p.aktuell)) ? p.aktuell : versionen[0].version, versionen,
    });
  }
  return { format: 1, erstellt: text(k.erstellt), quelle: text(k.quelle), pakete: pakete.sort((a, b) => a.name.localeCompare(b.name, 'de')) };
}

/** Herkunft lesbar, z. B. „offizieller Katalog“ oder „hochgeladen von … am …“. */
export function herkunftText(h: Herkunft, person: (id: string | null) => string = (x) => x ?? '–'): string {
  if (h.art === 'katalog') return h.url === OFFIZIELLER_KATALOG ? 'offizieller Katalog' : `Katalog ${h.url}`;
  return `hochgeladen von ${person(h.von)} am ${new Date(h.am).toLocaleDateString('de-DE')}`;
}

/* ---------- Pakete mit Code (#338) ---------- */

/** Volltext von einem Paket: so beginnt ocr.info; die eingebaute Texterkennung lässt ihn stehen. */
export const PAKET_TEXT = 'Texterkennung durch Paket ';

/** Was ein Paket mit Dokumenten darf. */
export type DokumentRecht = 'keine' | 'lesen' | 'schreiben';
export const DOKUMENT_RECHTE: Record<DokumentRecht, string> = { keine: 'keine Dokumente', lesen: 'Dokumente lesen', schreiben: 'Dokumente lesen und Volltext schreiben' };
/** Ereignisse, die ein Paket abonnieren kann (nicht blockierend, mit Wiederholung). */
export const EREIGNISSE = {
  'post.angelegt': 'Neue Post ist angelegt',
  'dokument.hochgeladen': 'Ein Dokument wurde hochgeladen',
  'texterkennung.fertig': 'Die Texterkennung eines Dokuments ist fertig',
  'paket.einstellungen_geaendert': 'Die Einstellungen des Pakets wurden geändert',
} as const;
export type EreignisArt = keyof typeof EREIGNISSE;
/** Alle Mappentypen (außer Benutzer) – für Pakete wie die Texterkennung, die an jedes Dokument müssen. */
export const ALLE_TYPEN = '*';

export interface PaketCode {
  sprache: string;
  ereignisse: EreignisArt[];
  /** Typverweise wie in Inhalten (eigene ohne Präfix, <paket>:<schluessel>, dms:<kennung>) oder „*“. */
  rechte: { lesen: string[]; schreiben: string[]; dokumente: DokumentRecht };
  /** Erlaubte Adressen (https://host…); alles andere ist gesperrt. */
  netz: string[];
  /** Das WebAssembly-Modul (code/modul.wasm) und Daten (code/daten/…), nur im installierten Paket. */
  modul?: { sha256: string; groesse: number };
  daten?: string[];
}

/**
 * Mappentypen des DMS, die `code.rechte` mit `dms:<kennung>` nennen darf (#435): Ablageort, Rolle und Post.
 * `dms:benutzer` ist verboten (Pakete sehen keine Benutzer). Post gibt es hier – anders als bei Verweisen in
 * Inhalten –, damit ein Paket wie Trennblatt nur Post lesen und schreiben darf statt aller Typen („*“).
 */
export const DMS_RECHTE_TYPEN: Record<string, string> = { ablageort: 'Ablageort', rolle: 'Rolle', post: 'Post' };
/** Ab dieser Version kennt das DMS `dms:post` in code.rechte (#435); ältere ignorieren die Kennung. */
export const DMS_POST_RECHT_AB = '0.94.0';

const SPRACHEN = ['rust', 'go', 'c', 'assemblyscript', 'javascript'];
const TYPVERWEIS_ODER_ALLE = /^(\*|([a-z][a-z0-9_]{1,19}:)?[a-z][a-z0-9_]{0,39})$/;

/** Höchstens so groß sind alle Dateien unter code/ eines Pakets zusammen (#403); dms-registry prüft dieselbe Grenze. */
export const CODE_MAX = 32 * 1024 * 1024;

/**
 * Liest code: aus dem Manifest (ohne einstellungen/aktionen – die liest paketeinstellungen.ts).
 * dateien: Dateien unter code/ des Pakets (Name, Größe in Bytes) für die Größengrenze.
 */
export function liesCode(c: unknown, dateien: Array<{ name: string; groesse: number }> = []): { code: PaketCode | null; fehler: string[] } {
  const fehler: string[] = [];
  const summe = dateien.filter((d) => d.name.startsWith('code/')).reduce((n, d) => n + d.groesse, 0);
  if (summe > CODE_MAX) fehler.push(`code/: Die Dateien unter code/ sind zusammen ${(summe / 1048576).toFixed(1).replace('.', ',')} MB groß – erlaubt sind höchstens ${CODE_MAX / 1048576} MB je Paket (modul.wasm, daten/ und Quellcode).`);
  if (c === undefined || c === null) return { code: null, fehler };
  if (typeof c !== 'object' || Array.isArray(c)) return { code: null, fehler: ['code: muss ein Objekt sein.'] };
  const x = c as Record<string, unknown>;
  const sprache = String(x.sprache ?? '');
  if (!SPRACHEN.includes(sprache)) fehler.push(`code.sprache: eine von ${SPRACHEN.join(', ')}.`);
  const liste = (v: unknown, wo: string): string[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.some((y) => typeof y !== 'string')) { fehler.push(`${wo}: Liste von Texten erwartet.`); return []; }
    return [...new Set(v as string[])];
  };
  const ereignisse = liste(x.ereignisse, 'code.ereignisse');
  for (const e of ereignisse) if (!(e in EREIGNISSE)) fehler.push(`code.ereignisse: „${e}“ gibt es nicht. Möglich: ${Object.keys(EREIGNISSE).join(', ')}.`);
  const r = (x.rechte ?? {}) as Record<string, unknown>;
  if (typeof r !== 'object' || Array.isArray(r)) fehler.push('code.rechte: muss ein Objekt sein.');
  const lesen = liste(r.lesen, 'code.rechte.lesen'), schreiben = liste(r.schreiben, 'code.rechte.schreiben');
  for (const t of [...lesen, ...schreiben]) if (!TYPVERWEIS_ODER_ALLE.test(t)) fehler.push(`code.rechte: „${t}“ ist kein gültiger Mappentyp-Verweis.`);
  // Benutzer sehen Pakete nie (auch nicht mit "*"), siehe Handbuch „Pakete mit Code“.
  for (const t of [...lesen, ...schreiben]) if (t === 'dms:benutzer') fehler.push('code.rechte: dms:benutzer ist für Pakete nicht erlaubt – Pakete sehen keine Benutzer.');
  else if (t.startsWith('dms:') && !DMS_RECHTE_TYPEN[t.slice(4)]) fehler.push(`code.rechte: „${t}“ – diesen Mappentyp bringt das DMS nicht mit. Erlaubt sind ${Object.keys(DMS_RECHTE_TYPEN).map((k) => `dms:${k}`).join(', ')}.`);
  const dokumente = (r.dokumente ?? 'keine') as DokumentRecht;
  if (!(dokumente in DOKUMENT_RECHTE)) fehler.push('code.rechte.dokumente: keine, lesen oder schreiben.');
  const netz = liste(x.netz, 'code.netz');
  for (const n of netz) {
    let ok = false;
    try { const u = new URL(n); ok = u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash; } catch { /* unten */ }
    if (!ok) fehler.push(`code.netz: „${n}“ ist keine erlaubte Adresse (nur https://…, ohne Zugangsdaten).`);
  }
  // Schreiben setzt Lesen voraus.
  const lesenAlle = [...new Set([...lesen, ...schreiben])];
  return { code: fehler.length ? null : { sprache, ereignisse: ereignisse as EreignisArt[], rechte: { lesen: lesenAlle, schreiben, dokumente }, netz }, fehler };
}

/** Zustand des Paket-Läufers (#403): aus (kein Paket mit Code), startet, bereit, neustart (nach Absturz), pausiert (Wartung). */
export type LaeuferZustand = 'aus' | 'startet' | 'bereit' | 'neustart' | 'pausiert';

/**
 * Text für „Stand“ in der Werkbank – passend zu dem, was der Läufer gerade tut. wartet: Stand ändert sich gleich
 * von selbst (die Werkbank fragt dann nach).
 */
export function laeuferZustandText(
  x: { zustand: LaeuferZustand; absturz: string | null; paket: { geladen: boolean; fehler: string | null; aufrufe: number } | null },
  zeit: (iso: string) => string,
): { text: string; fehler: boolean; wartet: boolean } {
  if (x.paket?.fehler) return { text: x.paket.fehler, fehler: true, wartet: false };
  if (x.zustand === 'pausiert') return { text: 'pausiert (Wartungsmodus)', fehler: false, wartet: false };
  if (x.zustand === 'neustart') return { text: `abgestürzt${x.absturz ? ` um ${zeit(x.absturz)}` : ''} – startet neu …`, fehler: true, wartet: true };
  if (x.zustand !== 'bereit' || !x.paket?.geladen) return { text: 'startet …', fehler: false, wartet: true };
  if (x.absturz) return { text: `neu gestartet nach Absturz um ${zeit(x.absturz)}`, fehler: false, wartet: false };
  return { text: x.paket.aufrufe ? 'bereit' : 'bereit – wartet auf das erste Ereignis', fehler: false, wartet: false };
}

/** Netzwerkzugriff eines Pakets mit Code (#449) – so in der Vorschau, im Handbuch und auf der Katalog-Webseite. */
export function netzText(netz: string[]): string {
  return netz.length ? `Zugriff auf Netzwerk/Internet nur zu: ${netz.join(', ')}` : 'kein Zugriff auf Netzwerk und Internet';
}

/** Hilfe-Ort im Administratorhandbuch (Pakete mit Code) je Ereignis (#449); Schlüssel wie in shared/src/hilfe.ts. */
export const EREIGNIS_HILFE: Record<EreignisArt, Hilfeort> = {
  'post.angelegt': 'pakete.ereignis.post_angelegt',
  'dokument.hochgeladen': 'pakete.ereignis.dokument_hochgeladen',
  'texterkennung.fertig': 'pakete.ereignis.texterkennung_fertig',
  'paket.einstellungen_geaendert': 'pakete.ereignis.einstellungen_geaendert',
};

/** Ein Punkt der Rechte-Liste in der Vorschau (#449): Text, Handbuch-Stelle, ggf. Unterliste (Ereignisse). */
export interface RechtePunkt { text: string; hilfe: Hilfeort; unter?: Array<{ text: string; hilfe: Hilfeort }> }

/** Rechte und Netzwerkzugriff für die Rückfrage bei der Installation (#338, #449): je Recht ein Punkt, Ereignisse als Unterliste. */
export function rechtePunkte(c: PaketCode, typName: (verweis: string) => string): RechtePunkt[] {
  const t = (l: string[]) => l.map((v) => (v === ALLE_TYPEN ? 'alle Mappentypen' : typName(v))).join(', ');
  const z: RechtePunkt[] = [];
  if (c.rechte.lesen.length) z.push({ text: `Mappen lesen: ${t(c.rechte.lesen)}`, hilfe: 'pakete.recht.lesen' });
  if (c.rechte.schreiben.length) z.push({ text: `Mappen anlegen und ändern: ${t(c.rechte.schreiben)}`, hilfe: 'pakete.recht.schreiben' });
  if (c.rechte.dokumente !== 'keine') z.push({ text: DOKUMENT_RECHTE[c.rechte.dokumente], hilfe: 'pakete.recht.dokumente' });
  z.push({ text: netzText(c.netz), hilfe: 'pakete.recht.netz' });
  if (c.ereignisse.length) z.push({ text: 'Reagiert auf diese Ereignisse:', hilfe: 'pakete.ereignisse', unter: c.ereignisse.map((e) => ({ text: EREIGNISSE[e], hilfe: EREIGNIS_HILFE[e] })) });
  return z;
}

/** Rechte-Punkte als einfache Zeilen (z. B. in der Fehlermeldung, wenn die Bestätigung fehlt). */
export const rechteZeilen = (punkte: RechtePunkt[]): string[] =>
  punkte.map((p) => (p.unter ? `${p.text} ${p.unter.map((u) => u.text).join('; ')}` : p.text));
export const rechteText = (c: PaketCode, typName: (verweis: string) => string): string[] => rechteZeilen(rechtePunkte(c, typName));

/** Gleiche Rechte und gleicher Netzwerkzugriff? (Sonst muss ein Update neu bestätigt werden.) */
export const gleicheRechte = (a: PaketCode | undefined, b: PaketCode | undefined) =>
  JSON.stringify(rechteSchluessel(a)) === JSON.stringify(rechteSchluessel(b));
const rechteSchluessel = (c: PaketCode | undefined) => c ? [[...c.rechte.lesen].sort(), [...c.rechte.schreiben].sort(), c.rechte.dokumente, [...c.netz].sort()] : null;

