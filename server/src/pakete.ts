/**
 * Paketverwaltung, Stufe 1 (#188): Konfigurationspakete aus dem offiziellen Katalog ansehen,
 * installieren, aktualisieren und entfernen. Paketformat: motom001/dms-registry.
 *
 * - Angelegt wird über dieselben Funktionen wie in der Werkbank (mit allen Prüfregeln).
 * - Schlüssel bekommen das Paket-Präfix (<paket>_<schluessel>), Verweise <paket>:<schluessel> werden aufgelöst.
 * - dms:<kennung> verweist auf einen Mappentyp, den das DMS selbst mitbringt (#310), z. B. dms:rolle; dms:ablageort ist
 *   seit #883 ein Alias für basis:ablageort (DMS_ALIAS).
 * - Scheitert etwas, wird zurückgerollt: Es bleibt nichts halb angelegt.
 * - Ein Update ergänzt nur (neue Typen, Felder, Register, Sichten); es löscht und überschreibt nichts.
 */
import { ansichtSymbol } from '../../shared/src/ansichtsymbole';
import { liesFeldErkennung, liesWiederfinden, wiederfindenVorgabe, type FeldErkennung } from '../../shared/src/erkennung';
import { istDatumsgrenze, istFeldformat } from '../../shared/src/feldformate';
import { createHash, randomUUID } from 'node:crypto';
import { liesWortgruppe } from '../../shared/src/suche';
import { inflateRawSync } from 'node:zlib';
import { parse as yamlLesen } from 'yaml';
import { FELDTYPEN, istLeer, MAX_DATEIGROESSE, type Abschnitt, type Feld, type Mappentyp, type Register } from '../../shared/src/model';
import { bereinigeAbschnitte } from '../../shared/src/darstellung';
import type { Anzeigeregel } from '../../shared/src/anzeige';
import { typBild, type TypBild } from '../../shared/src/typvergleich';
import { ergaenzeBeschriftungen, type AbschnittTeile, type Beschriftungen, type NamensTeile, type TypTeile } from '../../shared/src/beschriftung';
import { ALLE_TYPEN, BEISPIEL_ENDUNGEN, BEISPIEL_ORDNER, BEREICH, CODE_MAX, PAKET_MAX, type BeispielStand, inMB, KATALOG_ALT_TAGE, type HerkunftPruefung, hatSchnittstelle, DMS_RECHTE_TYPEN, DMS_ALIAS, veralteteVerweise, WORTLISTEN_MAX, gleicheRechte, liesCode, rechtePunkte, rechteZeilen, type PaketCode, type RechtePunkt, dmsPasst, liesKatalog, nachAbhaengigkeiten, neuestePassende, OFFIZIELLER_KATALOG, PAKET_ID, passt, vergleicheVersion, VERSION, type InstalliertesPaket, type Katalog, type KatalogPaket, type KatalogVersion, auswahlMitAbhaengigkeiten, liesErgaenzt, liesErsetzt, punktIdFehler, type Ergaenzung, type AblaufPlan, type AblaufErgebnis, type AblaufAusgelassen, haengenAn, type AblaufEingabe, type AblaufInstallation } from '../../shared/src/pakete';
import { hauptpaket, istHerausgeber, istOffiziellerHerausgeber, OFFIZIELLER_HERAUSGEBER, PAKET_ID_TEIL, SCHLUESSEL, TYP_KENNUNG, TYPVERWEIS, typKennung } from '../../shared/src/kennungen';
import { kinderVon, OPERATOREN, type Bedingung, type Operator, type Sicht } from '../../shared/src/sichten';
import { adressfelder, EINTRAG_ID, einstellungsAenderung, fehlendePflicht, liesBeschreibung, listen, pruefeWerte, ueberfuehre, abschnittsfelder, type EinstellungFeld, type Einstellungsbeschreibung, type GeheimStand, type Verweisquelle } from '../../shared/src/paketeinstellungen';
import type { Dienst, PaketQuelleEintrag } from './dienst';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { liesSchluessel, nurTestschluessel, projektSchluessel, pruefeSignatur, SCHLUESSEL_DATEI, SIGNATUR_DATEI, SIGNATUR_MAX, WECHSEL_DATEI, zeitVon, type Schluessel } from './katalogsignatur';
import type { Projektschluessel } from './projektschluessel';
import { t } from './sprache';
import { crc32 } from './zip';
import { DEUTSCH } from '../../shared/src/deutsch';
import { abdeckung, anzahlTexte, BESCHRIFTUNGEN_ORDNER, liesSprachangabe, liesSprachBeschriftung, pruefeSprachtexte, TEXTE_ORDNER, type Abdeckung, type Sprachangabe, type SprachBeschriftung, type Sprachtexte } from '../../shared/src/sprachpaket';
import { gebietsschema } from '../../shared/src/sprache';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ARCHIV_MAX, ENTPACKT_MAX, KLEIN_MAX, MB, SAMMEL_ENTPACKT_MAX, SAMMEL_MAX, SAMMEL_VERZEICHNIS_MAX as VERZEICHNIS_MAX, UPLOADS_SPEICHER_MAX } from './grenzen';
import { paketEinstellungen, paketKatalogStaende, paketQuellen, setzePaketEinstellungen, setzePaketKatalogStand, setzePaketQuellen, setzePaketSpeicher } from './pakete/index';

const log = protokoll.modul('werkbank');

/* ---------- ZIP lesen ---------- */

export { ARCHIV_MAX };
const DATEIEN_MAX = 500;

/** Obergrenzen beim Entpacken; budget wird über mehrere Archive geteilt (Sammeldatei, #461). */
export interface ZipGrenzen { dateien: number; entpackt: number; budget?: { rest: number } }
const PAKET_GRENZEN: ZipGrenzen = { dateien: DATEIEN_MAX, entpackt: ENTPACKT_MAX };

/** Einträge des Inhaltsverzeichnisses (Central Directory), ohne etwas zu entpacken. */
function zipEintraege(buf: Buffer, max: number) {
  const kaputt = () => new Fachfehler(422, t('meldungen.pakete.das-archiv-ist-kein'));
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw kaputt();
  const anzahl = buf.readUInt16LE(e + 10);
  if (anzahl > max) throw new Fachfehler(422, t('meldungen.pakete.das-archiv-enthaelt-mehr', { max }));
  let p = buf.readUInt32LE(e + 16);
  const liste: Array<{ name: string; flags: number; methode: number; crc: number; csize: number; usize: number; lokal: number }> = [];
  for (let n = 0; n < anzahl; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw kaputt();
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), klen = buf.readUInt16LE(p + 32);
    liste.push({
      name: buf.toString('utf8', p + 46, p + 46 + nlen).replace(/\\/g, '/'), flags: buf.readUInt16LE(p + 8), methode: buf.readUInt16LE(p + 10), crc: buf.readUInt32LE(p + 16),
      csize: buf.readUInt32LE(p + 20), usize: buf.readUInt32LE(p + 24), lokal: buf.readUInt32LE(p + 42),
    });
    p += 46 + nlen + elen + klen;
  }
  return liste;
}

/** Dateinamen eines ZIP-Archivs, ohne zu entpacken (z. B. um eine Sammeldatei zu erkennen, #461). */
export const zipNamen = (buf: Buffer, max = DATEIEN_MAX): string[] => zipEintraege(buf, max).map((x) => x.name);

/** Dateien der Beispiel-Dokumente (#878), auch mit einem Ordner davor (selbst gepacktes ZIP, Paket erstellen). */
const BEISPIEL_PFAD = /^(?:[^/]+\/)?inhalt\/beispiele\//;

/** Liest ein ZIP-Archiv (gespeichert oder Deflate) mit Obergrenzen gegen ZIP-Bomben. */
export function liesZip(buf: Buffer, grenzen: ZipGrenzen = PAKET_GRENZEN): Map<string, Buffer> {
  const kaputt = () => new Fachfehler(422, t('meldungen.pakete.das-archiv-ist-kein'));
  const dateien = new Map<string, Buffer>();
  let gesamt = 0, code = 0, beispiele = 0;
  for (const { name, flags, methode, crc, csize, usize, lokal } of zipEintraege(buf, grenzen.dateien)) {
    if (name.endsWith('/')) continue;
    if (flags & 1) throw new Fachfehler(422, t('meldungen.pakete.verschluesselte-archive-gehen-nicht'));
    if (name.startsWith('/') || name.split('/').includes('..')) throw new Fachfehler(422, t('meldungen.pakete.ungueltiger-dateiname-im-archiv', { name }));
    if (dateien.has(name)) throw new Fachfehler(422, t('meldungen.pakete.die-datei-steht-zweimal', { name }));
    // Beispiel-Dokumente (#878) zählen zur Paketgrenze, nicht zur Grenze für die Inhalte (YAML, README).
    if (name.startsWith('code/')) code += usize; else if (BEISPIEL_PFAD.test(name)) beispiele += usize; else gesamt += usize;
    if (gesamt > grenzen.entpackt) throw new Fachfehler(422, t('meldungen.pakete.das-archiv-ist-entpackt'));
    if (beispiele > PAKET_MAX) throw new Fachfehler(422, t('meldungen.pakete.beispiel-dokumente-zu-gross', { max: inMB(PAKET_MAX) }));
    // Grobe Obergrenze gegen ZIP-Bomben; die genaue Meldung zu code/ kommt aus liesCode.
    if (code > 2 * CODE_MAX) throw new Fachfehler(422, t('meldungen.pakete.die-dateien-unter-code', { wert: CODE_MAX / MB }));
    if (grenzen.budget && (grenzen.budget.rest -= usize) < 0) throw new Fachfehler(422, t('meldungen.pakete.die-pakete-der-sammeldatei'));
    if (lokal + 30 > buf.length || buf.readUInt32LE(lokal) !== 0x04034b50) throw kaputt();
    const start = lokal + 30 + buf.readUInt16LE(lokal + 26) + buf.readUInt16LE(lokal + 28);
    const roh = buf.subarray(start, start + csize);
    let daten: Buffer;
    try {
      daten = methode === 0 ? Buffer.from(roh) : methode === 8 ? inflateRawSync(roh, { maxOutputLength: Math.max(1, usize) }) : (() => { throw new Fachfehler(422, t('meldungen.pakete.kompression-wird-nicht-unterstuetzt', { methode })); })();
    } catch (x) { if (x instanceof Fachfehler) throw x; throw kaputt(); }
    if (daten.length !== usize || ((crc32(daten) ^ 0xffffffff) >>> 0) !== crc) throw kaputt();
    dateien.set(name, daten);
  }
  return dateien;
}

/* ---------- Paket lesen ---------- */

export interface Manifest {
  id: string; name: string; version: string; beschreibung: string;
  autor: { name: string; github: string }; lizenz: string; dms: string;
  abhaengigkeiten: Record<string, string>;
  code?: unknown;
  /** Ergänzt ein anderes Paket (#405), z. B. eine Zusatzsprache die Texterkennung. */
  ergaenzt?: Ergaenzung;
  /** Herausgeber (#1084) als umgedrehte Domain, z. B. `app.ablago`; fehlt bei älteren Paketen (dann gilt standardHerausgeber). */
  herausgeber?: string;
  /** Ersetzte Ids (#1084): Ein Update zieht die Installation unter einer davon auf diese Id um (z. B. texterkennung_fra). */
  ersetzt?: string[];
}
export interface PaketFeld extends Partial<Feld> { key: string; label: string; typ: Feld['typ']; ziel?: string }
export interface PaketRegister {
  key: string; name: string; art: Register['art']; felder?: string[]; quellen?: Array<{ typ: string; feld: string }>; volltext?: boolean; beschriftungen?: Beschriftungen<NamensTeile>;
  /** Abschnitte im Feldregister (#890): `{ vor, titel?, eingeklappt?, beschriftungen? }`; ältere Ablago ignorieren sie. */
  abschnitte?: unknown;
  /** Ausgeblendet (#655), nur beim ersten Installieren; ältere Ablago ignorieren es. */
  ausgeblendet?: boolean;
}
/**
 * Mappentyp im Paket. Beschriftungen je Sprache (#728) stehen unter `beschriftungen` – am Typ (name, beschreibung), an
 * Feldern (label, hilfe, optionen: fester Wert → Text) und an Registern (name). Ältere Pakete ohne sie gelten unverändert:
 * Ihre Optionen sind ihr eigener fester Wert.
 */
export interface PaketTyp {
  schluessel: string; name: string; beschreibung: string; titelVorlage?: string; felder: PaketFeld[]; register: PaketRegister[]; trefferliste?: string[]; beschriftungen?: Beschriftungen<TypTeile>;
  /** „Kann aus Post angelegt werden“ (#937); fehlt = Vorgabe (an mit Dokumentenregister). Ältere Ablago ignorieren es. */
  ausPost?: boolean;
  /** „Woran man ihn erkennt“ (#937), Übersetzungen unter beschriftungen.<sprache>.erkennbarAn. */
  erkennbarAn?: string;
}
/**
 * Mappentyp, den das Paket nicht mitbringt (#656): Das Zielsystem ordnet ihn über seine Kennung zu, wenn es ihn dort gibt –
 * sonst wird die Ansicht ohne ihn angelegt bzw. ganz übersprungen.
 */
export interface FremderTyp { kennung: string; name: string }
export interface PaketSicht { schluessel: string; name: string; beschreibung?: string; beschriftungen?: Beschriftungen<TypTeile>; eltern?: string; typen?: string[]; fremdeTypen?: FremderTyp[]; bedingungen?: Array<{ feld: string; operator: string; wert?: unknown }>; trefferliste?: string; symbol?: string }
/** Ab dieser Version verstehen DMS Ansichten mit `fremde_typen` (#656). */
export const FREMDE_TYPEN_AB = '0.178.0';
/** Beispiel-Mappe (#347): optional mit Schlüssel; Verweisfelder dürfen { beispiel: schluessel } bzw. { beispiel: paket:schluessel } sein. */
export interface PaketBeispiel { typ: string; werte: Record<string, unknown>; schluessel?: string; /** Beispiel-Dokumente (#878). */ dokumente?: PaketBeispielDokument[] }
/**
 * Beispiel-Dokument (#878): `datei` relativ zu inhalt/ (beispiele/…), Titel = Dateiname in Ablago, Datum = „hochgeladen
 * am“, Register = Dokumentenregister des Mappentyps (ohne: das erste).
 */
export interface PaketBeispielDokument { datei: string; titel?: string; datum?: string; register?: string }
/** Pfad eines Beispiel-Dokuments unter inhalt/: beispiele/, höchstens vier Ordner, einfache Namen mit Endung. */
const BEISPIEL_DATEI = /^beispiele\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]{0,79}\/){0,4}[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
/** Art einer Beispiel-Datei am Inhalt (#878): nur PDF, PNG und JPEG – und nur, wenn die Endung dazu passt. */
export function beispielDateiart(name: string, inhalt: Buffer): string | null {
  const erwartet = BEISPIEL_ENDUNGEN[name.slice(name.lastIndexOf('.') + 1).toLowerCase()];
  const kopf = inhalt.subarray(0, 8).toString('latin1');
  const ist = kopf.startsWith('%PDF-') ? 'application/pdf' : inhalt[0] === 0x89 && kopf.slice(1, 4) === 'PNG' ? 'image/png' : inhalt[0] === 0xff && inhalt[1] === 0xd8 && inhalt[2] === 0xff ? 'image/jpeg' : null;
  return erwartet && ist === erwartet ? ist : null;
}
/** Anzahl und Größe der Beispiel-Dokumente eines Pakets (#878). */
export function beispielDokumenteVon(p: Pick<Paket, 'beispiele' | 'beispielDateien'>): { anzahl: number; bytes: number } {
  const liste = p.beispiele.flatMap((b) => b.dokumente ?? []);
  return { anzahl: liste.length, bytes: liste.reduce((n, d) => n + (p.beispielDateien?.get(d.datei)?.length ?? 0), 0) };
}
/** Name des Dokuments in Ablago: der Titel (mit der Endung der Datei) oder der Dateiname. */
export function beispielName(d: PaketBeispielDokument): string {
  const datei = d.datei.slice(d.datei.lastIndexOf('/') + 1);
  const endung = datei.slice(datei.lastIndexOf('.'));
  const titel = d.titel?.trim();
  if (!titel) return datei;
  return titel.toLowerCase().endsWith(endung.toLowerCase()) ? titel : `${titel}${endung}`;
}

/** Verweis auf eine andere Beispiel-Mappe im Wert eines Felds (#347). */
const istBeispielVerweis = (w: unknown): w is { beispiel: string } => istObjekt(w) && typeof w.beispiel === 'string' && Object.keys(w).length === 1;
/** Alle Beispiel-Verweise in den Werten eines Beispiels (auch in Listen). */
export const beispielVerweise = (werte: Record<string, unknown>): string[] =>
  Object.values(werte).flatMap((w) => (Array.isArray(w) ? w : [w]).filter(istBeispielVerweis).map((x) => x.beispiel));

/** Verweise mit eigener Paket-Id („haushalt:x“) wie lokale („x“) behandeln – für die Reihenfolge. */
const eigeneVerweise = (werte: Record<string, unknown>, id: string): Record<string, unknown> => {
  const eins = (x: unknown) => (istBeispielVerweis(x) && x.beispiel.startsWith(`${id}:`) ? { beispiel: x.beispiel.slice(id.length + 1) } : x);
  return Object.fromEntries(Object.entries(werte).map(([k, w]) => [k, Array.isArray(w) ? w.map(eins) : eins(w)]));
};

/** Reihenfolge, in der Beispiele angelegt werden: erst die, auf die andere zeigen. null = Kreis. */
export function ordneBeispiele(beispiele: PaketBeispiel[]): PaketBeispiel[] | null {
  const nach = new Map(beispiele.filter((b) => b.schluessel).map((b) => [b.schluessel!, b]));
  const fertig = new Set<PaketBeispiel>();
  const unterwegs = new Set<PaketBeispiel>();
  const erg: PaketBeispiel[] = [];
  const besuche = (b: PaketBeispiel): boolean => {
    if (fertig.has(b)) return true;
    if (unterwegs.has(b)) return false;
    unterwegs.add(b);
    for (const z of beispielVerweise(b.werte)) {
      const ziel = z.includes(':') ? undefined : nach.get(z);
      if (ziel && !besuche(ziel)) return false;
    }
    unterwegs.delete(b); fertig.add(b); erg.push(b);
    return true;
  };
  for (const b of beispiele) if (!besuche(b)) return null;
  return erg;
}
/** Code eines Pakets (#338): Angaben aus dem Manifest und die Dateien unter code/ (modul.wasm, daten/…). */
export interface PaketCodeTeil { info: PaketCode; dateien: Array<{ name: string; inhalt: Buffer }> }
export interface Paket { manifest: Manifest; typen: PaketTyp[]; sichten: PaketSicht[]; beispiele: PaketBeispiel[]; /** Gleichbedeutende Wörter für die Suche (#356). */ wortlisten: string[][];
  /** Inhalt der Beispiel-Dokumente (#878) je `datei` (relativ zu inhalt/). */
  beispielDateien?: Map<string, Buffer>;
  /** Mitgelieferte Automatisierungen (#712, dms-registry #108), roh aus inhalt/automatisierungen.yaml; Typen als Paket-Schlüssel. */
  automatisierungen: PaketAutomatisierung[]; readme: string; einstellungen: Einstellungsbeschreibung | null; code: PaketCodeTeil | null;
  /** Sprachpaket (#731): Angaben, Texte und Beschriftungen der Standardpakete; null bei allen anderen Paketen. */
  sprache?: PaketSprache | null }
/** Inhalt eines Sprachpakets (#731), geprüft gegen das Deutsche dieser Version. */
export interface PaketSprache { angabe: Sprachangabe; texte: Sprachtexte; uebergangen: string[]; beschriftungen: Record<string, SprachBeschriftung> }

/**
 * Dateien, die ein Sprachpaket enthalten darf (#731): nur Texte. Alles andere – Code, Programme, Bilder, Inhalte – lehnt
 * Ablago ab, damit ein Sprachpaket nie mehr kann, als Texte zu liefern.
 */
const SPRACHPAKET_DATEI = new RegExp(String.raw`^(manifest\.yaml|README(\.[a-z]{2})?\.md|LICENSE(\.[A-Za-z]{1,10})?|NOTICE|CHANGELOG\.md|tests\/[A-Za-z0-9._-]{1,80}\.(ya?ml|json|md)|texte\/[a-z][a-z0-9-]{0,40}\.json|beschriftungen\/${PAKET_ID_TEIL}\.yaml)$`);

/** Liest den Teil „Sprache“ eines Pakets (#731); Fehler landen in `fehler`. */
function liesSprachteil(m: Record<string, unknown>, dateien: Map<string, Buffer>, fehler: string[]): PaketSprache | null {
  const la = liesSprachangabe(m.sprache);
  fehler.push(...la.fehler.map((f) => `manifest.yaml: ${f}`));
  if (m.code !== undefined) fehler.push(t('meldungen.sprachpakete.kein-code'));
  if (istObjekt(m.inhalt) && Object.keys(m.inhalt).length) fehler.push(t('meldungen.sprachpakete.kein-inhalt'));
  if (m.ergaenzt !== undefined || (istObjekt(m.abhaengigkeiten) && Object.keys(m.abhaengigkeiten).length)) fehler.push(t('meldungen.sprachpakete.keine-abhaengigkeiten'));
  for (const name of dateien.keys()) if (!SPRACHPAKET_DATEI.test(name)) fehler.push(t('meldungen.sprachpakete.fremde-datei', { name }));
  const roh: Record<string, unknown> = {};
  const beschriftungen: Record<string, SprachBeschriftung> = {};
  for (const [name, d] of dateien) {
    if (!SPRACHPAKET_DATEI.test(name)) continue;
    if (name.startsWith(TEXTE_ORDNER)) {
      try { roh[name.slice(TEXTE_ORDNER.length, -'.json'.length)] = JSON.parse(d.toString('utf8')); } catch { fehler.push(t('meldungen.sprachpakete.kein-json', { name })); }
    } else if (name.startsWith(BESCHRIFTUNGEN_ORDNER)) {
      let y: unknown;
      try { y = yamlLesen(d.toString('utf8'), { maxAliasCount: 50 }); } catch (e) { fehler.push(`${name}: kein gültiges YAML (${(e as Error).message.split('\n')[0]}).`); continue; }
      const b = liesSprachBeschriftung(y, name);
      fehler.push(...b.fehler);
      beschriftungen[name.slice(BESCHRIFTUNGEN_ORDNER.length, -'.yaml'.length)] = b.beschriftung;
    }
  }
  const p = pruefeSprachtexte(DEUTSCH, roh);
  fehler.push(...p.fehler);
  if (!Object.keys(p.texte).length && !Object.keys(beschriftungen).length) fehler.push(t('meldungen.sprachpakete.leer'));
  return la.angabe ? { angabe: la.angabe, texte: p.texte, uebergangen: p.uebergangen, beschriftungen } : null;
}
/** WebAssembly-Magie und Version 1. */
const WASM_KOPF = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const CODE_DATEI = /^code\/(modul\.wasm|daten\/[A-Za-z0-9._-]{1,80})$/;


/**
 * Mappentypen des DMS, auf die Pakete mit `dms:<kennung>` verweisen dürfen (#310): nur, was jede
 * Installation hat und was sich nicht löschen lässt. Post nicht – Post zeigt über „Zugeordnet zu“
 * selbst auf jede Mappe, ein Paket braucht keinen eigenen Verweis darauf.
 */
export const DMS_TYPEN: Record<string, string> = { ablageort: 'Ablageort', benutzer: 'Benutzer', rolle: 'Rolle' };
/** Ab dieser Version bringt das Paket Basis den Ablageort mit (#883, dms-registry #138). */
export const BASIS_ABLAGEORT_AB = '1.6.0';
/** Ab dieser Version versteht das DMS Verweise `dms:…`; Pakete damit sollten `dms: ">=0.75.0"` angeben. */
export const DMS_VERWEISE_AB = '0.75.0';
const DMS_PRAEFIX = 'dms:';
const istDmsVerweis = (vw: string) => vw.startsWith(DMS_PRAEFIX);
/** Alle Typverweise eines Pakets: Felder, Quellen der Verknüpfungsregister, Typen der Ansichten. */
const typverweise = (typen: PaketTyp[], sichten: PaketSicht[]) => [
  ...typen.flatMap((t) => [...t.felder.flatMap((f) => (f.ziel ? [f.ziel] : [])), ...t.register.flatMap((r) => (r.quellen ?? []).map((q) => q.typ))]),
  ...sichten.flatMap((s) => (s.typen ?? []).filter((t) => t !== ALLE_TYPEN)),
];
const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/**
 * Kennung der alten Form `<paket>_<schluessel>` (vor #1084) in die neue `paket:schluessel` – für ältere Pakete und
 * Dateien, die so noch auf Typen anderer Pakete zeigen (z. B. `fremde_typen`). Die Zuordnung kommt aus den installierten
 * Paketen (ihren Schlüsseln), nie aus dem Teilen am Unterstrich: `haus_garten_pflanze` kann `haus:garten_pflanze` wie
 * `haus_garten:pflanze` heißen. Passt nichts genau, bleibt die Kennung, wie sie ist.
 */
export function neueKennung(kennung: string, installierte: Array<Pick<InstalliertesPaket, 'id' | 'typen'>>): string {
  if (kennung.includes(':')) return kennung;
  const treffer = installierte.flatMap((p) => Object.keys(p.typen).filter((k) => `${p.id}_${k}` === kennung).map((k) => typKennung(p.id, k)));
  return treffer.length === 1 ? treffer[0] : kennung;
}
/**
 * Katalogeintrag zu einer Paket-Id (#1084): die Id selbst, sonst das eine Paket, das sie unter `ersetzt` nennt – so
 * findet ein Update von texterkennung_fra das umgezogene texterkennung.fra.
 */
export function katalogPaketZu(k: Katalog, id: string): KatalogPaket | undefined {
  const nach = k.pakete.filter((p) => p.ersetzt?.includes(id));
  return k.pakete.find((p) => p.id === id) ?? (nach.length === 1 ? nach[0] : undefined);
}
/** Belegt die Prüfung die Herkunft vom Projekt (offizieller Katalog, Sammeldatei mit seiner Signatur, Prüfsumme dort)? */
const offiziellBelegt = (p: HerkunftPruefung) => (p.offiziell && p.art !== 'ungueltig') || !!p.katalogversion;
/** Vertrauen einer Herkunft (Sicherheit B): 3 offiziell belegt, 2 signierter weiterer Katalog, 1 sonst. */
const vertrauen = (p: HerkunftPruefung) => (offiziellBelegt(p) ? 3 : p.art === 'anbieter' ? 2 : 1);
/** Gleiche Quelle (#1084): derselbe Katalog oder beide hochgeladen – Voraussetzung für einen Umzug auf eine neue Id. */
/** Installiertes Paket unter einer früheren Id des Manifests (#1084, `ersetzt`); das erste, wenn es mehrere gäbe. */
const installierteErsetzt = (installierte: InstalliertesPaket[], m: Manifest) => installierte.find((p) => m.ersetzt?.includes(p.id));
const gleicheQuelle = (a: InstalliertesPaket['herkunft'], b: InstalliertesPaket['herkunft']) => (a.art === 'katalog' ? b.art === 'katalog' && a.url === b.url : b.art === 'hochgeladen');

/** Mappentyp zu einer Kennung aus einem Paket (`fremde_typen`, #656) – auch in der alten Form (neueKennung). */
const fremderTyp = (kennung: string, typen: Mappentyp[], installierte: Array<Pick<InstalliertesPaket, 'id' | 'typen'>>) =>
  typen.find((t) => t.schluessel === kennung) ?? typen.find((t) => t.schluessel === neueKennung(kennung, installierte));

/** Liest Manifest und Inhalte aus den Dateien eines Archivs; wirft mit allen Fehlern auf einmal. */
export function liesPaket(roh: Map<string, Buffer>): Paket {
  // Ein Ordner davor (z. B. beim selbst gepackten ZIP) stört nicht.
  let dateien = roh;
  if (!roh.has('manifest.yaml')) {
    const oben = [...roh.keys()].find((n) => /^[^/]+\/manifest\.yaml$/.test(n));
    if (oben) {
      const vor = oben.slice(0, oben.indexOf('/') + 1);
      dateien = new Map([...roh].filter(([n]) => n.startsWith(vor)).map(([n, d]) => [n.slice(vor.length), d]));
    }
  }
  const fehler: string[] = [];
  const yaml = (name: string): unknown => {
    const d = dateien.get(name);
    if (!d) { fehler.push(t('meldungen.pakete.fehlt-im-paket', { name })); return undefined; }
    try { return yamlLesen(d.toString('utf8'), { maxAliasCount: 50 }); } catch (e) { fehler.push(`${name}: kein gültiges YAML (${(e as Error).message.split('\n')[0]}).`); return undefined; }
  };
  const m = yaml('manifest.yaml');
  if (!istObjekt(m)) throw new Fachfehler(422, t('meldungen.pakete.das-paket-ist-ungueltig'), { gruende: fehler.length ? fehler : [t('meldungen.pakete.manifest-yaml-ist-leer')] });
  if (m.schema !== 1) fehler.push(t('meldungen.pakete.manifest-yaml-format-kennt', { wert: str(m.schema) || '–' }));
  if (!PAKET_ID.test(str(m.id))) fehler.push(t('meldungen.pakete.manifest-yaml-ungueltige-id'));
  if (str(m.id) === 'dms') fehler.push(t('meldungen.pakete.manifest-yaml-die-id'));
  if (!VERSION.test(str(m.version))) fehler.push(t('meldungen.pakete.manifest-yaml-ungueltige-version'));
  if (!str(m.name).trim()) fehler.push(t('meldungen.pakete.manifest-yaml-name-fehlt'));
  if (!BEREICH.test(str(m.dms))) fehler.push(t('meldungen.pakete.manifest-yaml-ungueltige-ablago'));
  const abh = istObjekt(m.abhaengigkeiten) ? m.abhaengigkeiten : {};
  for (const [k, v] of Object.entries(abh)) if (!PAKET_ID.test(k) || !BEREICH.test(str(v))) fehler.push(t('meldungen.pakete.manifest-yaml-abhaengigkeit-ist', { k, str: str(v) }));
  // Ergänzung eines anderen Pakets (#405): steht auch unter abhaengigkeiten.
  const erg = liesErgaenzt(m.ergaenzt, abh);
  fehler.push(...erg.fehler.map((f) => `manifest.yaml: ${f}`));
  // Punkt in der Id (#1084): ergänzt das Hauptpaket – dann muss `ergaenzt` es nennen (die Registry prüft dasselbe).
  const punkt = erg.fehler.length ? null : punktIdFehler(str(m.id), erg.ergaenzt);
  if (punkt) fehler.push(`manifest.yaml: ${punkt}`);
  // Ersetzte Ids (#1084): Umzug statt Neuinstallation.
  const fr = liesErsetzt(m.ersetzt, str(m.id));
  fehler.push(...fr.fehler.map((f) => `manifest.yaml: ${f}`));
  // Herausgeber (#1084): umgedrehte Domain. Fehlt er (ältere Pakete), gilt der Herausgeber des Katalogs (standardHerausgeber).
  if (m.herausgeber !== undefined && !istHerausgeber(m.herausgeber)) fehler.push(t('meldungen.pakete.manifest-yaml-herausgeber', { wert: str(m.herausgeber) }));
  // Sprachpaket (#731): nur Texte – kein Code, keine Mappentypen, keine anderen Dateien.
  const sprache = m.sprache !== undefined ? liesSprachteil(m, dateien, fehler) : null;
  const inhalt = istObjekt(m.inhalt) ? m.inhalt : {};
  const liste = (art: string): Record<string, unknown>[] => {
    if (!inhalt[art]) return [];
    const v = yaml(str(inhalt[art]).replace(/^\.\//, ''));
    if (v == null) return [];
    if (!Array.isArray(v) || !v.every(istObjekt)) { fehler.push(`${str(inhalt[art])}: erwartet eine Liste.`); return []; }
    return v;
  };
  const typen = liste('mappentypen').map((t, i): PaketTyp => {
    const wo = `mappentypen[${i + 1}]`;
    if (!SCHLUESSEL.test(str(t.schluessel))) fehler.push(`${wo}: ungültige Kennung.`);
    if (!str(t.name).trim()) fehler.push(`${wo}: Name fehlt.`);
    const felder = Array.isArray(t.felder) ? t.felder.filter(istObjekt) as unknown as PaketFeld[] : [];
    const register = Array.isArray(t.register) ? t.register.filter(istObjekt) as unknown as PaketRegister[] : [];
    for (const f of felder) {
      if (!SCHLUESSEL.test(str(f.key))) fehler.push(`${wo}: Feld mit ungültiger Kennung „${str(f.key)}“.`);
      if (f.ziel !== undefined && !TYPVERWEIS.test(str(f.ziel))) fehler.push(`${wo}: Feld „${f.key}“ verweist ungültig auf „${str(f.ziel)}“.`);
      // Feldart (#1035): Unbekanntes nicht still zu Text machen – meist braucht das Paket eine neuere Ablago-Version.
      if (f.typ !== undefined && !Object.hasOwn(FELDTYPEN, str(f.typ))) fehler.push(`${wo}: Feld „${f.key}“ hat die unbekannte Feldart „${str(f.typ)}“ (möglich: ${Object.keys(FELDTYPEN).join(', ')}).`);
      if (f.negativ !== undefined && (f.typ !== 'betrag' || typeof f.negativ !== 'boolean')) fehler.push(`${wo}: Feld „${f.key}“: negativ gibt es nur bei Beträgen (typ: betrag), als true oder false.`);
      // Text → Verweis (#534): aus_text nennt das bisherige Textfeld; das DMS speichert es als ausText.
      const roh = f as unknown as Record<string, unknown>;
      if (roh.aus_text !== undefined) {
        const quelle = felder.find((x) => x.key === roh.aus_text);
        if (f.typ !== 'referenz') fehler.push(`${wo}: Feld „${f.key}“: aus_text gibt es nur bei Verweisfeldern (typ: referenz).`);
        else if (!SCHLUESSEL.test(str(roh.aus_text)) || roh.aus_text === f.key) fehler.push(`${wo}: Feld „${f.key}“: aus_text muss die Kennung eines anderen Felds sein.`);
        else if (quelle && quelle.typ !== 'text' && quelle.typ !== 'langtext') fehler.push(`${wo}: Feld „${f.key}“: aus_text „${str(roh.aus_text)}“ ist kein Textfeld.`);
        else if (f.pflicht) fehler.push(`${wo}: Feld „${f.key}“: Ein Verweisfeld mit aus_text darf keine Pflicht sein – sonst passen vorhandene Mappen nach dem Update nicht mehr.`);
        else f.ausText = str(roh.aus_text);
        delete roh.aus_text;
      }
    }
    // Anzeigen, wenn … (#1033) an Feldern und Abschnitten: ein Objekt; Typen als Verweis wie bei ziel. Was im Einzelnen
    // nicht passt, meldet die Prüfung des Mappentyps beim Anlegen.
    const anzeigen = [...felder.map((f) => ({ key: f.key, a: (f as unknown as Record<string, unknown>).anzeigen })),
      ...register.flatMap((r) => (Array.isArray(r.abschnitte) ? r.abschnitte : []).filter(istObjekt).map((x) => ({ key: `${r.key}.${str(x.vor)}`, a: x.anzeigen })))];
    for (const { key, a } of anzeigen) {
      if (a === undefined || a === null) continue;
      if (!istObjekt(a) || !Array.isArray(a.bedingungen)) { fehler.push(`${wo}: „${key}“: anzeigen muss ein Objekt mit modus und bedingungen sein.`); continue; }
      for (const b of a.bedingungen.filter(istObjekt)) if (b.art === 'verweistyp' && !TYPVERWEIS.test(str(b.typ))) fehler.push(`${wo}: „${key}“: anzeigen nennt den Mappentyp „${str(b.typ)}“ ungültig.`);
    }
    if (!register.length) fehler.push(`${wo}: mindestens ein Register nötig.`);
    // Beschriftungen (#728): ein Objekt Sprache → Texte; was nicht passt, bereinigt das DMS beim Anlegen.
    if (t.beschriftungen !== undefined && !istObjekt(t.beschriftungen)) fehler.push(`${wo}: beschriftungen muss ein Objekt „Sprache → Texte“ sein.`);
    for (const x of [...felder, ...register] as unknown as Array<Record<string, unknown>>) if (x.beschriftungen !== undefined && !istObjekt(x.beschriftungen)) fehler.push(`${wo}: „${str(x.key)}“: beschriftungen muss ein Objekt „Sprache → Texte“ sein.`);
    // Dokument übernehmen (#937): Angaben mit falschem Typ übergeht Ablago (wie unbekannte Felder), statt abzulehnen.
    return { schluessel: str(t.schluessel), name: str(t.name).trim(), beschreibung: str(t.beschreibung), titelVorlage: t.titelVorlage ? str(t.titelVorlage) : undefined, felder, register, trefferliste: Array.isArray(t.trefferliste) ? t.trefferliste.map(str) : undefined,
      ...(istObjekt(t.beschriftungen) ? { beschriftungen: t.beschriftungen as Beschriftungen<TypTeile> } : {}),
      ...(typeof t.ausPost === 'boolean' ? { ausPost: t.ausPost } : {}),
      ...(typeof t.erkennbarAn === 'string' && t.erkennbarAn.trim() ? { erkennbarAn: t.erkennbarAn.trim() } : {}) };
  });
  const sichten = liste('sichten').map((s, i): PaketSicht => {
    if (!SCHLUESSEL.test(str(s.schluessel))) fehler.push(t('meldungen.pakete.sichten-ungueltige-kennung', { wert: i + 1 }));
    if (!str(s.name).trim()) fehler.push(t('meldungen.pakete.sichten-name-fehlt', { wert: i + 1 }));
    return {
      schluessel: str(s.schluessel), name: str(s.name).trim(), beschreibung: s.beschreibung ? str(s.beschreibung) : undefined, eltern: s.eltern ? str(s.eltern) : undefined,
      ...(istObjekt(s.beschriftungen) ? { beschriftungen: s.beschriftungen as Beschriftungen<TypTeile> } : {}),
      typen: Array.isArray(s.typen) ? s.typen.map(str) : [], trefferliste: s.trefferliste ? str(s.trefferliste) : undefined,
      ...(s.fremde_typen !== undefined ? { fremdeTypen: (Array.isArray(s.fremde_typen) ? s.fremde_typen : []).map((f, j): FremderTyp => {
        const k = istObjekt(f) ? str(f.kennung) : '';
        if (!TYP_KENNUNG.test(k)) fehler.push(t('meldungen.pakete.sichten-fremde-typen-ungueltige', { wert: i + 1, wert2: j + 1, k }));
        return { kennung: k, name: istObjekt(f) ? str(f.name).trim() || k : k };
      }) } : {}),
      // Symbol (#428): unbekannte Namen (Paket für eine neuere Version) heißen „ohne Symbol“, kein Fehler.
      symbol: ansichtSymbol(s.symbol) ?? undefined,
      bedingungen: Array.isArray(s.bedingungen) ? s.bedingungen.filter(istObjekt).map((b) => ({ feld: str(b.feld), operator: str(b.operator), wert: b.wert })) : [],
    };
  });
  const beispielDateien = new Map<string, Buffer>();
  const beispiele = liste('beispiele').map((b, i): PaketBeispiel => {
    if (b.schluessel !== undefined && !SCHLUESSEL.test(str(b.schluessel))) fehler.push(t('meldungen.pakete.beispiele-ungueltiger-schluessel', { wert: i + 1, str: str(b.schluessel) }));
    const dokumente = b.dokumente === undefined ? undefined : liesBeispielDokumente(b.dokumente, i + 1, dateien, beispielDateien, fehler);
    return { typ: str(b.typ), werte: istObjekt(b.werte) ? b.werte : {}, ...(b.schluessel !== undefined ? { schluessel: str(b.schluessel) } : {}), ...(dokumente?.length ? { dokumente } : {}) };
  });
  // Beispiel-Dokumente (#878) an eigenen Mappentypen: Das Register gibt es und ist ein Dokumentenregister.
  for (const [i, b] of beispiele.entries()) {
    if (!b.dokumente?.length) continue;
    const eigen = !b.typ.includes(':') || b.typ.startsWith(`${str(m.id)}:`);
    const typ = eigen ? typen.find((x) => x.schluessel === b.typ.split(':').pop()) : undefined;
    if (!typ) continue;
    for (const d of b.dokumente) {
      const ok = d.register ? typ.register.some((r) => r.key === d.register && r.art === 'dokumente') : typ.register.some((r) => r.art === 'dokumente');
      if (!ok) fehler.push(t('meldungen.pakete.beispiel-dokument-ohne-register', { wert: i + 1, datei: d.datei, register: d.register ?? '–' }));
    }
  }
  // Verweise zwischen Beispielen (#347): Schlüssel eindeutig, Ziele vorhanden bzw. aus einer Abhängigkeit, keine Kreise.
  {
    const eigene = new Set(beispiele.map((b) => b.schluessel).filter((s): s is string => !!s));
    const schl = beispiele.map((b) => b.schluessel).filter((s): s is string => !!s);
    for (const s of new Set(schl.filter((x, j) => schl.indexOf(x) !== j))) fehler.push(t('meldungen.pakete.beispiele-schluessel-doppelt', { s }));
    for (const [i, b] of beispiele.entries()) {
      for (const z of beispielVerweise(b.werte)) {
        if (!TYPVERWEIS.test(z)) { fehler.push(t('meldungen.pakete.beispiele-verweis-ist-kein', { wert: i + 1, z })); continue; }
        const [p, s] = z.includes(':') ? z.split(':') : [str(m.id), z];
        if (p === str(m.id)) { if (!eigene.has(s)) fehler.push(t('meldungen.pakete.beispiele-verweis-auf-das', { wert: i + 1, s })); }
        else if (p === 'dms' || !(p in abh)) fehler.push(t('meldungen.pakete.beispiele-verweis-das-paket', { wert: i + 1, z, p }));
      }
    }
    if (!ordneBeispiele(beispiele.map((b) => ({ ...b, werte: eigeneVerweise(b.werte, str(m.id)) })))) {
      fehler.push(t('meldungen.pakete.beispiele-die-verweise-zwischen'));
    }
  }
  // Mitgelieferte Automatisierungen (#712): Schlüssel, Name, genau eine Wenn-Karte; Typen als eigener Schlüssel oder paket:typ.
  const automatisierungen = liste('automatisierungen').map((a, i): PaketAutomatisierung => {
    const wo = `automatisierungen[${i + 1}]`;
    if (!SCHLUESSEL.test(str(a.schluessel))) fehler.push(`${wo}: ungültiger Schlüssel „${str(a.schluessel)}“.`);
    if (!str(a.name).trim()) fehler.push(`${wo}: Name fehlt.`);
    if (!istObjekt(a.wenn)) fehler.push(`${wo}: wenn fehlt (genau eine Karte).`);
    if (!Array.isArray(a.dann) || !a.dann.length) fehler.push(`${wo}: dann braucht mindestens eine Karte.`);
    const typ = istObjekt(a.wenn) && a.wenn.typ != null ? str(a.wenn.typ) : '';
    if (typ && !TYPVERWEIS.test(typ)) fehler.push(`${wo}: wenn.typ „${typ}“ ist kein gültiger Mappentyp-Verweis.`);
    const empf = (Array.isArray(a.dann) ? a.dann : []).filter(istObjekt).flatMap((k) => (Array.isArray(k.empfaenger) ? k.empfaenger : [])).filter(istObjekt);
    if (istObjekt(a.wenn) && a.wenn.rolle) fehler.push(`${wo}: wenn.rolle – feste Rollen gibt es in Paketen nicht; „für jeden Benutzer“ gilt für alle aktiven Benutzer.`);
    if (empf.some((e) => e.art === 'person' || e.art === 'rolle')) fehler.push(`${wo}: feste Personen und Rollen gibt es in Paketen nicht – Empfänger aus einem Feld oder der Ersteller der Mappe.`);
    return { schluessel: str(a.schluessel), name: str(a.name).trim(), beschreibung: str(a.beschreibung ?? ''), wenn: istObjekt(a.wenn) ? a.wenn : {}, und: istObjekt(a.und) ? a.und : undefined, dann: Array.isArray(a.dann) ? a.dann : [] };
  });
  for (const k of new Set(automatisierungen.map((a) => a.schluessel).filter((x, j, l) => l.indexOf(x) !== j))) fehler.push(t('meldungen.pakete.automatisierungen-schluessel-doppelt', { k }));
  // Wortlisten (#356): Gruppen gleichbedeutender Wörter für die Suche, z. B. - woerter: [Kfz, Auto, PKW].
  const wortlisten = liste('wortlisten').map((w, i): string[] => {
    const g = liesWortgruppe(Array.isArray(w.woerter) ? w.woerter : null);
    if (!Array.isArray(w.woerter)) fehler.push(t('meldungen.pakete.wortlisten-erwartet-woerter-wort', { wert: i + 1 }));
    else if (g.fehler) fehler.push(`wortlisten[${i + 1}]: ${g.fehler}`);
    return g.woerter;
  }).filter((g) => g.length);
  if (wortlisten.length > WORTLISTEN_MAX) fehler.push(t('meldungen.pakete.wortlisten-hoechstens-gruppen', { WORTLISTEN_MAX }));
  const doppelt = (l: string[]) => l.filter((x, i) => l.indexOf(x) !== i);
  for (const s of doppelt(typen.map((t) => t.schluessel))) fehler.push(t('meldungen.pakete.mappentypen-kennung-doppelt', { s }));
  for (const s of doppelt(sichten.map((t) => t.schluessel))) fehler.push(t('meldungen.pakete.sichten-kennung-doppelt', { s }));
  for (const vw of new Set(typverweise(typen, sichten).filter(istDmsVerweis))) {
    if (!DMS_TYPEN[vw.slice(DMS_PRAEFIX.length)]) fehler.push(t('meldungen.pakete.verweis-diesen-mappentyp-bringt', { vw, map: Object.keys(DMS_TYPEN).map((k) => DMS_PRAEFIX + k).join(', ') }));
  }
  // Einstellungen (#197): code.einstellungen und code.aktionen.
  const einst = liesBeschreibung(m.code);
  fehler.push(...einst.fehler.map((f) => `manifest.yaml: code.${f}`));
  // Code (#338): Manifest-Angaben, gebautes Modul und Daten.
  const cl = liesCode(m.code, [...dateien].map(([name, inhalt]) => ({ name, groesse: inhalt.length })));
  fehler.push(...cl.fehler.map((f) => (f.startsWith('code/:') ? f.slice('code/: '.length) : `manifest.yaml: ${f}`)));
  // Mappen-Ereignisse (#670): Schlüssel ohne Präfix sind eigene Mappentypen; fremde (paket:typ, dms:post) und „*“ seit #686.
  for (const k of cl.code?.mappentypen ?? []) if (k !== '*' && !k.includes(':') && !typen.some((t) => t.schluessel === k)) fehler.push(t('meldungen.pakete.manifest-yaml-code-mappentypen', { k }));
  let code: PaketCodeTeil | null = null;
  if (cl.code) {
    const modul = dateien.get('code/modul.wasm');
    // Ohne gebautes Modul (z. B. nur Einstellungen) lässt sich das Paket installieren; es läuft dann kein Code.
    if (!modul) { /* Hinweis in der Vorschau */ }
    else if (modul.length < 8 || !modul.subarray(0, 8).equals(WASM_KOPF)) fehler.push(t('meldungen.pakete.code-modul-wasm-ist'));
    // Andere Dateien unter code/ (Quellcode) stören nicht; geladen werden nur modul.wasm und daten/….
    if (modul) code = { info: cl.code, dateien: [...dateien].filter(([n]) => CODE_DATEI.test(n)).map(([n, inhalt]) => ({ name: n.slice('code/'.length), inhalt })) };
  }
  if (fehler.length) throw new Fachfehler(422, t('meldungen.pakete.das-paket-ist-ungueltig'), { gruende: fehler });
  return {
    manifest: {
      id: str(m.id), name: str(m.name).trim(), version: str(m.version), beschreibung: str(m.beschreibung),
      autor: { name: str((m.autor as Record<string, unknown>)?.name), github: str((m.autor as Record<string, unknown>)?.github) },
      lizenz: str(m.lizenz), dms: str(m.dms), abhaengigkeiten: Object.fromEntries(Object.entries(abh).map(([k, v]) => [k, str(v)])),
      ...(m.code !== undefined ? { code: m.code } : {}),
      ...(erg.ergaenzt ? { ergaenzt: erg.ergaenzt } : {}),
      ...(istHerausgeber(m.herausgeber) ? { herausgeber: m.herausgeber } : {}),
      ...(fr.ersetzt.length ? { ersetzt: fr.ersetzt } : {}),
    },
    typen, sichten, beispiele, wortlisten, automatisierungen, readme: dateien.get('README.md')?.toString('utf8') ?? '', einstellungen: einst.beschreibung, code,
    sprache, ...(beispielDateien.size ? { beispielDateien } : {}),
  };
}

/**
 * Beispiel-Dokumente eines Beispiels (#878) lesen und prüfen wie beim Hochladen: Datei liegt unter inhalt/beispiele/,
 * ist PDF, PNG oder JPEG (am Inhalt erkannt, passend zur Endung), nicht leer und nicht größer als beim Hochladen.
 * PDFs liest Ablago hier nicht – das tun Vorschau und Texterkennung im Arbeiter (ladePdf), wie bei jedem Dokument.
 */
function liesBeispielDokumente(roh: unknown, nr: number, dateien: Map<string, Buffer>, inhalt: Map<string, Buffer>, fehler: string[]): PaketBeispielDokument[] {
  if (!Array.isArray(roh)) { fehler.push(t('meldungen.pakete.beispiel-dokumente-liste', { wert: nr })); return []; }
  return roh.flatMap((d, j): PaketBeispielDokument[] => {
    const wo = { wert: nr, nr: j + 1 };
    if (!istObjekt(d)) { fehler.push(t('meldungen.pakete.beispiel-dokumente-liste', { wert: nr })); return []; }
    const datei = str(d.datei).replace(/^\.\//, '');
    if (!BEISPIEL_DATEI.test(datei) || datei.split('/').includes('..')) { fehler.push(t('meldungen.pakete.beispiel-dokument-pfad', { ...wo, datei })); return []; }
    const daten = dateien.get(`inhalt/${datei}`);
    if (!daten) { fehler.push(t('meldungen.pakete.beispiel-dokument-fehlt', { ...wo, datei })); return []; }
    if (!daten.length) { fehler.push(t('meldungen.pakete.beispiel-dokument-leer', { ...wo, datei })); return []; }
    if (daten.length > MAX_DATEIGROESSE) { fehler.push(t('meldungen.pakete.beispiel-dokument-gross', { ...wo, datei, max: inMB(MAX_DATEIGROESSE) })); return []; }
    if (!beispielDateiart(datei, daten)) { fehler.push(t('meldungen.pakete.beispiel-dokument-art', { ...wo, datei })); return []; }
    const titel = d.titel === undefined ? undefined : str(d.titel).replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (titel !== undefined && (!titel || titel.length > 200 || /[\\/]/.test(titel))) { fehler.push(t('meldungen.pakete.beispiel-dokument-titel', wo)); return []; }
    const datum = d.datum === undefined ? undefined : d.datum instanceof Date ? d.datum.toISOString().slice(0, 10) : str(d.datum);
    if (datum !== undefined && (!DATUM.test(datum) || new Date(`${datum}T12:00:00Z`).toISOString().slice(0, 10) !== datum)) { fehler.push(t('meldungen.pakete.beispiel-dokument-datum', { ...wo, datum })); return []; }
    const register = d.register === undefined ? undefined : str(d.register);
    if (register !== undefined && !SCHLUESSEL.test(register)) { fehler.push(t('meldungen.pakete.beispiel-dokument-register', { ...wo, register })); return []; }
    inhalt.set(datei, daten);
    return [{ datei, ...(titel ? { titel } : {}), ...(datum ? { datum } : {}), ...(register ? { register } : {}) }];
  });
}

/** Liste von Schlüsseln aus einer Eingabe (#712: anzuschaltende Automatisierungen); alles andere → leer. */
const schluesselListe = (x: unknown): string[] => (Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string').slice(0, 200) : []);

/** Eine mitgelieferte Automatisierung im Paket (#712) – Wenn/Und/Dann wie im Editor, Typen als Paket-Schlüssel. */
export interface PaketAutomatisierung { schluessel: string; name: string; beschreibung: string; wenn: Record<string, unknown>; und?: Record<string, unknown>; dann: unknown[] }

/* ---------- Plan: was angelegt bzw. ergänzt wird ---------- */

/** Felder, die das Paket für die Erkennung markiert und die im DMS (gleiche Kennung, gleiche Feldart) noch ohne Einstellung sind (#336). */
function erkennungNeu(t: PaketTyp, vorhanden: Pick<Mappentyp, 'felder'>): Array<{ key: string; label: string; erkennung: FeldErkennung }> {
  return t.felder.flatMap((f) => {
    const g = vorhanden.felder.find((x) => x.key === f.key && x.typ === f.typ);
    const e = liesFeldErkennung(f.erkennung, f.typ);
    return g && e && !g.erkennung ? [{ key: g.key, label: g.label, erkennung: e }] : [];
  });
}

/**
 * „Zum Wiederfinden nutzen“ (#938) für ein neues Feld: die Angabe des Pakets – fehlt sie (Paket kennt den Haken noch
 * nicht), wie bisher bei Feldern „für die Erkennung“ mit Merkmalsart (wiederfindenVorgabe).
 */
const wiederfindenAus = (f: PaketFeld): boolean => ('wiederfinden' in f ? liesWiederfinden(f.wiederfinden, f.typ) : wiederfindenVorgabe(f));
/** Felder, die das Paket ausdrücklich „zum Wiederfinden“ markiert und die im DMS (gleiche Kennung und Feldart) den Haken noch nicht haben (#938). */
function wiederfindenNeu(t: PaketTyp, vorhanden: Pick<Mappentyp, 'felder'>): Array<{ key: string; label: string }> {
  return t.felder.flatMap((f) => {
    const g = vorhanden.felder.find((x) => x.key === f.key && x.typ === f.typ);
    return g && liesWiederfinden(f.wiederfinden, f.typ) && !g.wiederfinden ? [{ key: g.key, label: g.label }] : [];
  });
}
/** Angaben am Typ (#937), die das Paket vorgibt und die der Administrator noch nicht eingestellt hat. */
function typAngabenNeu(t: PaketTyp, vorhanden: Pick<Mappentyp, 'ausPost' | 'erkennbarAn'>): { ausPost?: boolean; erkennbarAn?: string } {
  return {
    ...(typeof t.ausPost === 'boolean' && (vorhanden.ausPost ?? null) === null ? { ausPost: t.ausPost } : {}),
    ...(t.erkennbarAn && !vorhanden.erkennbarAn ? { erkennbarAn: t.erkennbarAn } : {}),
  };
}

/**
 * Formate und Datumsgrenzen (#535), die das Paket an Feldern vorgibt und die im DMS (gleiche Kennung, gleiche Feldart)
 * noch fehlen – nur, wo der Administrator weder Format noch Grenzen eingestellt hat. Gespeicherte Werte bleiben gültig.
 */
function formatNeu(t: PaketTyp, vorhanden: Pick<Mappentyp, 'felder'>): Array<{ key: string; label: string; vorgaben: Partial<Feld> }> {
  return t.felder.flatMap((f): Array<{ key: string; label: string; vorgaben: Partial<Feld> }> => {
    const g = vorhanden.felder.find((x) => x.key === f.key && x.typ === f.typ);
    if (!g) return [];
    if (f.typ === 'text' && istFeldformat(f.format) && !g.format) {
      // Das Land-Feld gibt es schon – oder das Update bringt es mit (z. B. Haus 1.1.0).
      const land = f.format === 'plz' && f.landFeld && (vorhanden.felder.some((x) => x.key === f.landFeld) || t.felder.some((x) => x.key === f.landFeld)) ? { landFeld: f.landFeld } : {};
      return [{ key: g.key, label: g.label, vorgaben: { format: f.format, ...land } }];
    }
    if (f.typ === 'datum' && (istDatumsgrenze(f.min) || istDatumsgrenze(f.max)) && g.min == null && g.max == null) {
      return [{ key: g.key, label: g.label, vorgaben: { ...(istDatumsgrenze(f.min) ? { min: f.min } : {}), ...(istDatumsgrenze(f.max) ? { max: f.max } : {}) } }];
    }
    // Negative Beträge (#1035): Ein Update darf sie erlauben (lockert nur), nie wieder verbieten.
    if (f.typ === 'betrag' && f.negativ === true && !g.negativ) return [{ key: g.key, label: g.label, vorgaben: { negativ: true } }];
    return [];
  });
}

/**
 * Beschriftungen eines Paket-Updates (#728) für einen vorhandenen Typ: fehlende je Sprache, Teil und Option ergänzen –
 * am Typ, an vorhandenen Feldern und Registern. Was der Administrator schon beschriftet hat, bleibt. Optionen nur für
 * feste Werte, die es im Feld gibt; neue Felder bringen ihre Beschriftungen ohnehin mit.
 */
export function beschriftungenNeu(t: PaketTyp, vorhanden: Pick<Mappentyp, 'beschriftungen' | 'felder' | 'register'>): { typ: Pick<Mappentyp, 'beschriftungen' | 'felder' | 'register'>; anzahl: number } {
  let anzahl = 0;
  const texte = (b: unknown): number => (typeof b === 'string' ? 1 : b && typeof b === 'object' ? Object.values(b).reduce((n: number, x) => n + texte(x), 0) : 0);
  const misch = <T extends object>(alt: Beschriftungen<T> | undefined, neu: unknown, optionen?: string[]): Beschriftungen<T> | undefined => {
    if (!istObjekt(neu)) return alt;
    // Nur gültige Sprachen und Texte; Optionen nur für vorhandene feste Werte.
    const sauber = Object.fromEntries(Object.entries(neu).filter(([spr, x]) => /^[a-z]{2,3}(-[A-Z]{2})?$/.test(spr) && istObjekt(x)).map(([spr, x]) => [spr,
      Object.fromEntries(Object.entries(x as Record<string, unknown>).flatMap(([k, v]): Array<[string, unknown]> => {
        if (k === 'optionen') return istObjekt(v) && optionen ? [[k, Object.fromEntries(Object.entries(v).filter(([w, y]) => optionen.includes(w) && typeof y === 'string' && y.trim()))]] : [];
        return typeof v === 'string' && v.trim() && spr !== 'de' ? [[k, v.trim()]] : [];
      }))]));
    const erg = ergaenzeBeschriftungen<T>(alt, sauber as Beschriftungen<T>);
    anzahl += texte(erg) - texte(alt);
    return erg;
  };
  const beschriftungen = misch(vorhanden.beschriftungen, t.beschriftungen);
  const felder = vorhanden.felder.map((f) => {
    const pf = t.felder.find((x) => x.key === f.key) as (PaketFeld & { beschriftungen?: unknown }) | undefined;
    const b = misch(f.beschriftungen, pf?.beschriftungen, f.typ === 'auswahl' ? f.optionen : undefined);
    return b ? { ...f, beschriftungen: b } : f;
  });
  const register = vorhanden.register.map((r) => {
    const pr = t.register.find((x) => x.key === r.key);
    const b = misch(r.beschriftungen, pr?.beschriftungen);
    // Abschnitte (#890): Überschriften in weiteren Sprachen, solange die deutsche noch die des Pakets ist.
    const pa = Array.isArray(pr?.abschnitte) ? (pr.abschnitte as unknown[]).filter(istObjekt) : [];
    const abschnitte = r.abschnitte?.map((a) => {
      const q = pa.find((x) => x.vor === a.vor && typeof x.titel === 'string' && x.titel.trim() === a.titel);
      const ab = q ? misch<AbschnittTeile>(a.beschriftungen, q.beschriftungen) : a.beschriftungen;
      return ab ? { ...a, beschriftungen: ab } : a;
    });
    return { ...r, ...(b ? { beschriftungen: b } : {}), ...(abschnitte ? { abschnitte } : {}) };
  });
  return { typ: { ...(beschriftungen ? { beschriftungen } : {}), felder, register }, anzahl };
}

/**
 * Abschnitte (#890), die ein Update an vorhandenen Feldregistern ergänzt: nur, wo das Register noch keine hat (wie bei
 * Erkennung und Formaten, „Updates ändern nichts heimlich“). `felder` = die Felder des Registers nach dem Update.
 */
function abschnitteNeu(t: PaketTyp, vorhanden: Pick<Mappentyp, 'register'>, felderNach: (r: Register) => string[] = (r) => r.felder ?? []): Array<{ key: string; name: string; abschnitte: Abschnitt[] }> {
  return vorhanden.register.flatMap((r) => {
    if (r.art !== 'felder' || r.abschnitte?.length) return [];
    const pr = t.register.find((x) => x.key === r.key && x.art === 'felder');
    const a = bereinigeAbschnitte(pr?.abschnitte, felderNach(r));
    return a?.length ? [{ key: r.key, name: r.name, abschnitte: a }] : [];
  });
}

/** Felder, die ein Update einem vorhandenen Feldregister hinzufügt (neu im Typ, laut Paket auf diesem Register). */
function neueFelderAuf(t: PaketTyp, vorhanden: Pick<Mappentyp, 'felder'>, r: Pick<Register, 'key' | 'art'>): string[] {
  if (r.art !== 'felder') return [];
  return (t.register.find((x) => x.key === r.key)?.felder ?? []).filter((k) => !vorhanden.felder.some((g) => g.key === k) && t.felder.some((f) => f.key === k));
}

export interface TypPlan {
  schluessel: string; dmsSchluessel: string; name: string; felder: number;
  /** Bei Update: Typ gibt es schon; nur neue Felder und Register. */
  vorhanden: boolean; neueFelder: string[]; neueRegister: string[];
  /** Bei Update (#336): vorhandene Felder, die das Paket jetzt „für die Erkennung“ markiert (nur wo noch nichts eingestellt ist). */
  erkennung?: string[];
  /** Bei Update (#938): vorhandene Felder, die das Paket jetzt „zum Wiederfinden“ markiert (nur wo der Haken noch fehlt). */
  wiederfinden?: string[];
  /** Bei Update (#937): Das Paket gibt „Kann aus Post angelegt werden“ bzw. „Woran man ihn erkennt“ vor, wo noch nichts eingestellt ist. */
  typAngaben?: boolean;
  /** Bei Update (#534): Verweisfelder mit aus_text und wie viele Angaben im alten Textfeld danach umgewandelt werden können. */
  umwandeln?: Array<{ feld: string; aus: string; anzahl: number }>;
  /** Bei Update (#535): vorhandene Felder, die das Paket jetzt mit Format bzw. Datumsgrenzen prüft (nur wo noch nichts eingestellt ist). */
  formate?: string[];
  /** Bei Update (#728): Wie viele Beschriftungen das Paket ergänzt (nur, wo der Administrator nichts beschriftet hat). */
  beschriftungen?: number;
  /** Bei Update (#890): Feldregister, die Abschnitte bekommen (nur, wo noch keine sind). */
  abschnitte?: string[];
  /** Name schon vergeben (von einem anderen Typ) – mit Vorschlag. */
  konflikt: string | null; vorschlag: string | null;
  /** Fehlt im DMS, obwohl das Paket ihn installiert hatte (gelöscht) – wird nicht neu angelegt. */
  geloescht?: boolean;
}
export interface SichtPlan { schluessel: string; name: string; eltern: string | null; vorhanden: boolean; konflikt: string | null; vorschlag: string | null; /** Wird nicht installiert (#656), mit Grund. */ ausgelassen?: string | null; /** Mappentypen, die hier fehlen – die Ansicht kommt ohne sie (#656). */ ohne?: string[] }
export interface AbhaengigkeitPlan { id: string; bereich: string; installiert: string | null; ok: boolean; verfuegbar: string | null }
export interface Vorschau {
  paket: { id: string; name: string; version: string; beschreibung: string; lizenz: string; autor: { name: string; github: string }; dms: string; abhaengigkeiten: Record<string, string>; readme: string | null; changelog: string | null; quelle: string | null;
    /** Herausgeber (#1084): aus dem Manifest, sonst der des Katalogs (standardHerausgeber); null = unbekannt. */
    herausgeber: string | null;
    /** Belegt (offizieller Katalog bzw. Schlüssel eines weiteren signierten Katalogs) – sonst „laut Paket, nicht geprüft“. */
    herausgeberGeprueft: boolean };
  dmsVersion: string; dmsOk: boolean;
  installiert: string | null; update: boolean;
  /** Umzug (#1084): Das Update zieht die Installation von dieser früheren Id auf die neue um; sonst null. */
  umzug: string | null;
  /** Fingerabdruck des weiteren signierten Katalogs, an den der Herausgeber gebunden wird (Sicherheit C); sonst null. */
  herausgeberSchluessel: string | null;
  /** Herkunft des installierten Pakets (bei einem Update). */
  herkunft: InstalliertesPaket['herkunft'] | null;
  /** Was die Signatur über die Herkunft dieses Pakets sagt (#594); Zeile „Herkunft“ in der Vorschau. */
  pruefung: HerkunftPruefung | null;
  abhaengigkeiten: AbhaengigkeitPlan[];
  typen: TypPlan[]; sichten: SichtPlan[]; beispiele: number;
  /** Beispiel-Dokumente zu den Beispielen (#878): Anzahl und Größe zusammen in Bytes. */
  beispielDokumente: { anzahl: number; bytes: number };
  /** Was die Installation verhindert. */
  probleme: string[];
  /** Feste Kennungen zu `probleme` für die Oberfläche (#729: nicht am Text erkennen), z. B. „schon-installiert“. */
  fehlercodes: string[];
  /** Hinweise, die nicht verhindern (z. B. Code läuft noch nicht). */
  hinweise: string[];
  /** Mitgelieferte Automatisierungen (#712); neu = kommt mit dieser Installation bzw. diesem Update dazu (nur die stehen zur Wahl). */
  automatisierungen: Array<{ schluessel: string; name: string; beschreibung: string; neu: boolean }>;
  /** Einstellungen des Pakets (#197): bei einem Update neue und wegfallende Felder. */
  einstellungen: { neu: string[]; weg: string[] } | null;
  /** Code (#338): Rechte, Netzwerkzugriff, Ereignisse (#449) – muss bestätigt werden (bei einem Update nur, wenn sie sich ändern). */
  laeufer: { rechte: RechtePunkt[]; bestaetigen: boolean } | null;
  /** Sprachpaket (#731): Sprache, Abdeckung gegen diese Version, übergangene Texte, Pakete mit Beschriftungen. */
  sprache?: (Sprachangabe & { abdeckung: Abdeckung; uebergangen: number; pakete: string[] }) | null;
}
/** Was lege anlegt bzw. ergänzt (#1084: als ein Objekt, damit der Umzug es weiterreichen kann). */
interface LegeAuftrag { paket: Paket; herkunft: InstalliertesPaket['herkunft']; v: KatalogVersion | undefined; plan: Vorschau; beispiele: boolean; von: Handelnder; alt: InstalliertesPaket | null; ein: string[] }
/** Woher ein geplantes Paket kommt (#1084): für den Herausgeber und die Prüfung, ob er stimmen kann. */
export interface PlanQuelle { herkunft: InstalliertesPaket['herkunft']; pruefung: HerkunftPruefung }
export interface InstallierenEingabe {
  id?: string; version?: string; namen?: Record<string, string>; sichtNamen?: Record<string, string>; beispiele?: boolean; mitAbhaengigkeiten?: boolean;
  /** Schlüssel mitgelieferter Automatisierungen, die gleich eingeschaltet werden (#712); ohne: alle bleiben aus. */
  automatisierungen?: string[];
  /** Katalogadresse (#189); ohne: der offizielle Katalog. */
  quelle?: string;
  /** Hochgeladenes Paket (#189). */
  upload?: string;
  /** Herkunft außerhalb des offiziellen Katalogs ausdrücklich bestätigt (#189). */
  bestaetigt?: boolean;
  /** Rechte und erlaubte Adressen (Netzwerk/Internet) eines Pakets mit Code bestätigt (#338). */
  rechteBestaetigt?: boolean;
}

const modulInfo = (c: PaketCodeTeil) => {
  const m = c.dateien.find((d) => d.name === 'modul.wasm')!.inhalt;
  return { sha256: createHash('sha256').update(m).digest('hex'), groesse: m.length };
};

const freierName = (name: string, paket: string, belegt: Set<string>) => {
  const k = (n: string) => n.trim().toLowerCase();
  let v = `${name} (${paket})`;
  for (let i = 2; belegt.has(k(v)); i++) v = `${name} (${paket} ${i})`;
  return v;
};

/** Sichten so sortieren, dass Elternsichten zuerst kommen. */
function nachEltern(sichten: PaketSicht[]): PaketSicht[] {
  const erg: PaketSicht[] = [];
  const rest = [...sichten];
  while (rest.length) {
    const i = rest.findIndex((s) => !s.eltern || !rest.some((r) => r.schluessel === s.eltern));
    erg.push(...rest.splice(i < 0 ? 0 : i, 1));
  }
  return erg;
}

/** Bedingung aus dem Paket in die Form der Werkbank. */
function bedingungAus(b: { feld: string; operator: string; wert?: unknown }): Bedingung {
  if (!(b.operator in OPERATOREN)) throw new Fachfehler(422, t('meldungen.pakete.unbekannter-operator-in-einer', { operator: b.operator }));
  const op = b.operator as Operator;
  const fest = (w: unknown) => (istObjekt(w) && typeof w.art === 'string' ? w as never : { art: 'fest' as const, wert: w as string });
  if ((op === 'zwischen' || op === 'ausserhalb') && Array.isArray(b.wert) && b.wert.length === 2) return { art: 'feld', feld: b.feld, op, wert: fest(b.wert[0]), bis: fest(b.wert[1]) };
  return { art: 'feld', feld: b.feld, op, ...(b.wert !== undefined ? { wert: fest(b.wert) } : {}) };
}

const meldungen = (e: unknown): string => {
  if (!(e instanceof Error)) return String(e);
  const d = (e as Fachfehler).details as { allgemein?: string[]; felder?: Record<string, string[]>; gruende?: string[] } | undefined;
  const mehr = [...(d?.allgemein ?? []), ...Object.values(d?.felder ?? {}).flat(), ...(d?.gruende ?? [])];
  return mehr.length ? `${e.message} ${mehr.join(' ')}` : e.message;
};

/* ---------- Paketverwaltung ---------- */

export interface PaketOptionen {
  /** Version dieses DMS. */
  version: () => string;
  /** Daten von einer Adresse holen (Tests: ohne Netz). */
  abruf?: (url: string) => Promise<Buffer>;
  /** Offizieller Katalog (Tests: eine andere Adresse). */
  katalogUrl?: string;
  /** Öffentliche Schlüssel des Projekts (#594); Tests: eigene, sonst server/src/projektschluessel.ts. */
  projektSchluessel?: readonly Projektschluessel[];
  /** Benutzer zur Auswahl in Paket-Einstellungen (#197). */
  benutzer?: () => Promise<Array<{ id: string; name: string }>>;
  /** Paket-Läufer (Pakete mit Code): Aktionen ausführen, Ereignisse zustellen. Fehlt noch im Betrieb. */
  laeufer?: PaketLaeufer;
  /**
   * Sperre über alle Instanzen (#405, PostgreSQL): Installieren, Aktualisieren und Entfernen laufen nacheinander, auch
   * wenn mehrere Server dieselbe Datenbank nutzen. Ohne (Tests): keine.
   */
  sperre?: <T>(f: () => Promise<T>) => Promise<T>;
  /**
   * Mehrere Prozesse (#745): Ordner für hochgeladene Pakete bis zur Installation (30 Minuten) – die Installation landet
   * vielleicht bei einem anderen Prozess als das Hochladen. Je Upload das Archiv und seine Angaben, nur für den
   * Dienstbenutzer lesbar, Name aus dem Hash der Kennung. Ohne: nur im Arbeitsspeicher (ein Prozess, Tests).
   */
  uploadOrdner?: string;
  /**
   * Sprachpakete (#731): nach dem Installieren, Aktualisieren und Entfernen die Sprachen dieses Prozesses neu laden;
   * wie viele Personen eine Sprache gewählt haben und ob sie die Sprache der Installation ist (Entfernen mit Hinweis);
   * nach dem Entfernen die Sprache aus der Einstellung „sprachen“ nehmen. Ohne (Tests): nichts davon.
   */
  sprachen?: SprachpaketHaken;
}

/** Was die Paketverwaltung für Sprachpakete vom Rest braucht (#731). */
export interface SprachpaketHaken {
  geaendert(): Promise<void>;
  nutzung(kennung: string): Promise<{ personen: number; standard: boolean }>;
  entfernt(kennung: string): Promise<void>;
  /** Abdeckung einer geladenen Sprache in Prozent (Werkbank → Pakete). */
  abdeckung?(kennung: string): number | null;
}

/** Schnittstelle zum Paket-Läufer (#197); kommt mit den Paketen mit Code. */
export interface PaketLaeufer {
  aktion(paket: string, aktion: string, einstellungen: Record<string, unknown>): Promise<string>;
  ereignis?(paket: string, name: 'paket.einstellungen_geaendert', felder: string[]): void;
  /** Code eines Pakets installiert, aktualisiert oder entfernt (#338): Läufer lädt neu (fertig, wenn er die Pakete kennt). */
  codeGeaendert?(): void | Promise<void>;
}
/** Zeitgrenze für Aktionen, damit ein Knopf nicht hängt. */
export const AKTION_MS = 30_000;

/** Höchstens so viele Weiterleitungen folgt holeDaten. */
const WEITERLEITUNGEN_MAX = 5;

/**
 * Holt eine Adresse mit Zeitlimit und Größengrenze; nur HTTPS (bzw. HTTP für localhost).
 * Weiterleitungen folgt es selbst und nur auf `https://`-Adressen (#594) – auch von localhost aus.
 */
export async function holeDaten(url: string, max = ARCHIV_MAX): Promise<Buffer> {
  let u = new URL(url);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) throw new Fachfehler(422, t('meldungen.pakete.pakete-gibt-es-nur'));
  // 20 s bis zur Antwort; große Archive (#644) dürfen danach bis zu 5 Minuten laden. Die 20 s gelten nur bis zu
  // den Köpfen (eigene Uhr, nach der Antwort gelöscht) – AbortSignal.timeout bräche sonst auch das Lesen ab.
  const gesamt = new AbortController();
  const uhr = setTimeout(() => gesamt.abort(new Error('Zeitgrenze beim Laden erreicht.')), 300_000);
  try {
  for (let n = 0; ; n++) {
    const kopf = new AbortController();
    const kopfUhr = setTimeout(() => kopf.abort(new Error('Keine Antwort in 20 Sekunden.')), 20_000);
    const r = await fetch(u, { signal: AbortSignal.any([kopf.signal, gesamt.signal]), redirect: 'manual', headers: { 'user-agent': 'dms-paketverwaltung (https://github.com/motom001/dms)' } })
      .finally(() => clearTimeout(kopfUhr));
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      await r.body?.cancel().catch(() => {});
      if (n >= WEITERLEITUNGEN_MAX) throw new Fachfehler(502, t('pakete.herkunft.fehler.weiterleitungen', { url }));
      const ziel = new URL(r.headers.get('location')!, u);
      if (ziel.protocol !== 'https:') throw new Fachfehler(502, t('pakete.herkunft.fehler.weiterleitung', { url, ziel: ziel.href }));
      u = ziel;
      continue;
    }
    if (!r.ok) throw new Fachfehler(502, `${url}: ${r.status} ${r.statusText}`.trim());
    const laenge = Number(r.headers.get('content-length') ?? NaN);
    const zuGross = (bytes: number) => new Fachfehler(422, t('pakete.groesse.zuGross', { groesse: inMB(bytes), max: inMB(max) }));
    if (laenge > max) { await r.body?.cancel().catch(() => {}); throw zuGross(laenge); }
    // Stückweise lesen und früh abbrechen, statt erst alles in den Speicher zu holen.
    const teile: Buffer[] = []; let zusammen = 0;
    if (r.body) for await (const s of r.body as unknown as AsyncIterable<Uint8Array>) {
      zusammen += s.length;
      if (zusammen > max) { gesamt.abort(); throw zuGross(zusammen); }
      teile.push(Buffer.from(s));
    }
    return Buffer.concat(teile, zusammen);
  }
  } finally { clearTimeout(uhr); }
}

/** Wer handelt: Id für „angelegt von“, E-Mail fürs Protokoll. */
export interface Handelnder { id: string | null; email: string | null }

/** Eine Katalogquelle: der offizielle Katalog oder eine weitere Adresse (erweiterte Ansicht, #189). */
export interface Quelle {
  url: string; offiziell: boolean; aktiv: boolean; von?: string | null; am?: string;
  /** Bestätigter Schlüssel des Anbieters (#594); null: Katalog ohne Schlüssel. */
  fingerabdruck?: string | null;
  /** Gesperrt, weil sich der Schlüssel geändert hat – bis ein Admin den neuen bestätigt (#594). */
  gesperrt?: { fingerabdruck: string; seit: string } | null;
}
/** Ergebnis je Quelle beim Abrufen. */
export interface Abruf { url: string; offiziell: boolean; katalog: Katalog | null; fehler: string | null; pruefung?: HerkunftPruefung | null }

/** Ein hochgeladenes, geprüftes Paket, bis es installiert wird (höchstens 30 Minuten). */
/** `bytes`: Größe des Archivs – danach richtet sich die Obergrenze im Arbeitsspeicher (#901). */
interface Hochgeladen { paket: Paket; von: Handelnder; am: string; zeit: number; pruefung: HerkunftPruefung; bytes?: number }
/** Woher ein Upload stammt: einzeln hochgeladen oder aus einer Sammeldatei; das Archiv liest beides gleich (PAKET_GRENZEN). */
type UploadArt = 'einzeln' | 'sammel';

const TAG_MS = 86_400_000;
/** Datei neben einem Katalog, z. B. katalog.sig neben katalog.json. */
const daneben = (url: string, datei: string) => new URL(datei, url).href;
const UPLOAD_GUELTIG = 30 * 60_000;
/** So oft fliegen abgelaufene Uploads heraus, auch wenn niemand mehr hochlädt (#901). */
const UPLOAD_AUFRAEUMEN_MS = 5 * 60_000;
export { KLEIN_MAX };

/* ---------- Sammeldatei (#461) ---------- */

/**
 * Sammeldatei: ein ZIP mit dem Verzeichnis sammeldatei.json und den Paket-Archiven unter pakete/<id>-<version>.zip
 * (unverändert aus dem Katalog), optional LIESMICH.txt. Format: dms-registry, schema/sammeldatei.schema.json.
 */
export const SAMMEL_VERZEICHNIS = 'sammeldatei.json';
const SAMMEL_LIESMICH = 'LIESMICH.txt';
export { SAMMEL_MAX };
export const SAMMEL_PAKETE_MAX = 50;

export interface SammelEintrag { id: string; version: string; name: string; archiv: string; sha256: string; groesse: number; gewaehlt: boolean }
export interface SammelVerzeichnis { format: 1; erstellt: string; quelle: string; katalog: string; dms: string | null; pakete: SammelEintrag[] }

/** Prüft sammeldatei.json; wirft mit allen Fehlern auf einmal. */
export function liesSammelVerzeichnis(roh: Buffer | undefined): SammelVerzeichnis {
  const ungueltig = (gruende: string[]) => new Fachfehler(422, t('meldungen.pakete.das-ist-keine-gueltige'), { gruende });
  if (!roh) throw ungueltig([`${SAMMEL_VERZEICHNIS} fehlt.`]);
  if (roh.length > VERZEICHNIS_MAX) throw ungueltig([t('meldungen.pakete.ist-zu-gross', { SAMMEL_VERZEICHNIS })]);
  let j: unknown;
  try { j = JSON.parse(roh.toString('utf8')); } catch { throw ungueltig([t('meldungen.pakete.ist-kein-gueltiges-json', { SAMMEL_VERZEICHNIS })]); }
  if (!istObjekt(j)) throw ungueltig([t('meldungen.pakete.ist-leer', { SAMMEL_VERZEICHNIS })]);
  const fehler: string[] = [];
  if (j.art !== 'dms-sammeldatei') fehler.push(`${SAMMEL_VERZEICHNIS}: „art“ muss „dms-sammeldatei“ sein.`);
  if (j.format !== 1) fehler.push(t('meldungen.pakete.sammeldatei-format-kennt-diese', { wert: str(j.format) || '–' }));
  const liste = Array.isArray(j.pakete) ? j.pakete : [];
  if (!liste.length) fehler.push(t('meldungen.pakete.die-sammeldatei-enthaelt-keine'));
  if (liste.length > SAMMEL_PAKETE_MAX) fehler.push(t('meldungen.pakete.die-sammeldatei-enthaelt-mehr', { SAMMEL_PAKETE_MAX }));
  const pakete: SammelEintrag[] = [];
  for (const [i, x] of liste.slice(0, SAMMEL_PAKETE_MAX).entries()) {
    const wo = `pakete[${i + 1}]`;
    if (!istObjekt(x)) { fehler.push(`${wo}: kein Eintrag.`); continue; }
    const id = str(x.id), version = str(x.version);
    if (!PAKET_ID.test(id)) { fehler.push(`${wo}: ungültige Id.`); continue; }
    if (!VERSION.test(version)) { fehler.push(`${wo}: ungültige Version.`); continue; }
    if (x.archiv !== `pakete/${id}-${version}.zip`) fehler.push(`${wo}: Archiv muss pakete/${id}-${version}.zip heißen.`);
    if (!/^[0-9a-f]{64}$/.test(str(x.sha256))) fehler.push(`${wo}: ungültige Prüfsumme (sha256).`);
    if (!Number.isInteger(x.groesse) || (x.groesse as number) <= 0 || (x.groesse as number) > ARCHIV_MAX) fehler.push(`${wo}: ungültige Größe.`);
    if (pakete.some((p) => p.id === id)) fehler.push(`${wo}: „${id}“ steht zweimal in der Sammeldatei.`);
    pakete.push({ id, version, name: str(x.name).trim().slice(0, 100) || id, archiv: `pakete/${id}-${version}.zip`, sha256: str(x.sha256), groesse: Number(x.groesse), gewaehlt: x.gewaehlt !== false });
  }
  if (fehler.length) throw ungueltig(fehler);
  return { format: 1, erstellt: str(j.erstellt), quelle: str(j.quelle), katalog: str(j.katalog), dms: j.dms ? str(j.dms) : null, pakete };
}

/** Ein Paket der Sammeldatei, geprüft und zum Installieren bereit (Upload-Kennung wie beim einzelnen Hochladen). */
export interface SammelPaket {
  upload: string; id: string; name: string; version: string; gewaehlt: boolean; abhaengigkeiten: Record<string, string>;
  /** Ergänzt ein anderes Paket (#405), aus dem Manifest. */
  ergaenzt?: Ergaenzung;
  /** Prüfsumme gegen den offiziellen Katalog (abgerufen oder signiert in der Sammeldatei): gleich, oder unbekannt. */
  katalog: 'gleich' | 'unbekannt';
  /** Gegenüber dem installierten Paket. */
  stand: 'neu' | 'neuer' | 'gleich' | 'aelter';
  installiert: string | null;
  vorschau: Vorschau;
}
export interface Sammeldatei {
  datei: {
    sha256: string; groesse: number; erstellt: string; quelle: string; katalog: string; dms: string | null;
    /** Herkunft (#594): mit gültig signiertem offiziellem Katalog in der Datei keine Bestätigung nötig. */
    pruefung: HerkunftPruefung;
    /** Pakete, die nicht im signierten Katalog der Sammeldatei stehen (für sie bleibt die Bestätigung). */
    nichtImKatalog: string[];
  };
  /** In der Reihenfolge zum Installieren: Abhängigkeiten zuerst. */
  pakete: SammelPaket[];
}
/** Der Katalog mit Signatur in einer Sammeldatei (motom001/dms-registry#74). */
const SAMMEL_KATALOG = 'katalog.json';

const mitPruefung = (v: Vorschau, pruefung: HerkunftPruefung): Vorschau => ({ ...v, pruefung });
const zeitText = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' }); };
/** Herkunft nicht bestätigt (#189, #594). */
const herkunftFehler = (p: HerkunftPruefung) => new Fachfehler(409, p.art === 'ungueltig'
  ? t('pakete.herkunft.fehler.ungueltig')
  : t('meldungen.pakete.dieses-paket-kommt-nicht'), { warnung: true });

export class Paketverwaltung {
  private kataloge = new Map<string, { katalog: Katalog; pruefung: HerkunftPruefung; zeit: number }>();
  private uploads = new Map<string, Hochgeladen>();

  constructor(private d: Dienst, private o: PaketOptionen) {
    setInterval(() => { void this.raeumeUploadsAuf(); }, UPLOAD_AUFRAEUMEN_MS).unref();
  }

  /**
   * Herausgeber eines Pakets ohne Angabe im Manifest (#1084, Bestand): Was aus dem offiziellen Katalog kommt – direkt
   * oder als Datei, deren Prüfsumme dort steht –, stammt vom Projekt (`app.ablago`); alle offiziellen Pakete gibt das
   * Projekt heraus, und nur seine Signatur belegt das. Bei anderen Quellen ist er unbekannt (null): Dann schützt wie
   * bisher, dass Updates nur aus derselben Quelle kommen (Katalog bzw. erneutes Hochladen), und der erste angegebene
   * Herausgeber gilt von da an.
   */
  private standardHerausgeber(herkunft?: InstalliertesPaket['herkunft'], pruefung?: HerkunftPruefung): string | null {
    if (herkunft?.art === 'katalog' && herkunft.url === this.katalogUrl) return OFFIZIELLER_HERAUSGEBER;
    return pruefung?.offiziell || pruefung?.katalogversion ? OFFIZIELLER_HERAUSGEBER : null;
  }
  /** Wie vertrauenswürdig die Herkunft eines installierten Pakets war (für den Umzug, Sicherheit B). */
  private vertrauenVon(p: InstalliertesPaket): number {
    if (p.herkunft.art === 'katalog' && p.herkunft.url === this.katalogUrl) return 3;
    return p.herausgeberSchluessel ? 2 : 1;
  }
  /** Erfüllt ein installiertes Paket eine Abhängigkeit eines Pakets dieses Herausgebers? Gleicher oder offizieller Herausgeber. */
  private herausgeberPasst(da: InstalliertesPaket, herausgeber: string | null): boolean {
    const h = this.herausgeberVon(da);
    return !herausgeber || h === herausgeber || istOffiziellerHerausgeber(h);
  }
  /** Herausgeber eines installierten Pakets (#1084): gespeichert oder – bei älteren Installationen – aus der Herkunft. */
  private herausgeberVon(p: InstalliertesPaket): string | null { return p.herausgeber ?? this.standardHerausgeber(p.herkunft); }
  /**
   * Stammt ein Paket mit derselben Id wie ein installiertes von einem anderen Herausgeber (#1084)? Dann der Text, warum
   * Ablago es nicht installiert bzw. nicht als Update nimmt – sonst null. Ist der Herausgeber des installierten
   * unbekannt, entscheidet wie bisher die Quelle (Updates nur aus dem eigenen Katalog bzw. erneut hochgeladen).
   */
  private andererHerausgeber(m: Manifest, ich: InstalliertesPaket, quelle?: PlanQuelle): string | null {
    const vorher = this.herausgeberVon(ich);
    const neu = m.herausgeber ?? this.standardHerausgeber(quelle?.herkunft, quelle?.pruefung);
    return vorher && vorher !== neu ? t('meldungen.pakete.anderer-herausgeber', { id: ich.id, name: ich.name, alt: vorher, neu: neu ?? t('meldungen.pakete.herausgeber-unbekannt') }) : null;
  }

  /** Mappentypen des DMS, auf die Pakete verweisen dürfen (#310): Kennung → Typ. `ablageort` ist der Alias (#883). */
  private async dmsTypen(): Promise<Map<string, Mappentyp>> {
    const s = await this.d.kern.system();
    const a = await this.d.ablageortTyp();
    return new Map<string, Mappentyp>([['benutzer', s.benutzer], ['rolle', s.rolle], ...(a ? [['ablageort', a] as [string, Mappentyp]] : [])]);
  }

  /**
   * Übernahme (#883): Bringt Basis den Ablageort mit und gibt es noch den früheren des Kerns, übernimmt das Paket ihn mit
   * gleicher Id – alle Mappen und Verweise bleiben, Herkunft danach „Basis“, kein zweiter Mappentyp. Eine Ansicht des
   * Pakets nur über den Ablageort (ohne Bedingungen, oberste Ebene) übernimmt die vorhandene Ansicht nur über ihn.
   */
  private async uebernahme(paket: Paket, ich: InstalliertesPaket | null): Promise<{ typen: Record<string, string>; sichten: Record<string, string>; name: string } | null> {
    if (paket.manifest.id !== 'basis' || ich?.typen.ablageort || !paket.typen.some((t) => t.schluessel === 'ablageort')) return null;
    const frueher = await this.d.frueherAblageortTyp();
    if (!frueher) return null;
    const sichten: Record<string, string> = {};
    const vorhanden = (await this.d.listeSichten()).filter((x) => !x.elternId && x.typen.length === 1 && x.typen[0] === frueher.id && !x.bedingungen.length);
    for (const s of paket.sichten) {
      if (s.eltern || ich?.sichten[s.schluessel] || (s.bedingungen ?? []).length || (s.typen ?? []).length !== 1 || s.typen![0] !== 'ablageort') continue;
      const x = vorhanden.find((v) => !Object.values(sichten).includes(v.id));
      if (x) sichten[s.schluessel] = x.id;
    }
    return { typen: { ablageort: frueher.id }, sichten, name: frueher.name };
  }

  get katalogUrl() { return this.o.katalogUrl ?? OFFIZIELLER_KATALOG; }
  /** Archive bis ARCHIV_MAX; Katalog, Signatur und Schlüssel sind klein (KLEIN_MAX) – kein JSON von 128 MB (#683). */
  private abruf(url: string, max = ARCHIV_MAX) { return this.o.abruf ? this.o.abruf(url) : holeDaten(url, max); }

  /* ---------- Quellen (#189) ---------- */

  /** Offizieller Katalog und weitere Adressen aus den Einstellungen. */
  async quellen(): Promise<Quelle[]> {
    const weitere = (await paketQuellen(this.d.kern)).filter((q) => q.url !== this.katalogUrl);
    return [{ url: this.katalogUrl, offiziell: true, aktiv: true }, ...weitere.map(({ schluessel, gesperrt, ...q }) => ({
      ...q, offiziell: false, fingerabdruck: schluessel?.fingerabdruck ?? null, gesperrt: gesperrt ? { fingerabdruck: gesperrt.fingerabdruck, seit: gesperrt.am } : null,
    }))];
  }

  /** Öffentlicher Schlüssel neben einem Katalog (katalog.schluessel, #594); null, wenn keiner abrufbar ist. */
  private async schluesselVon(url: string): Promise<{ s: Schluessel; roh: Buffer } | null> {
    let roh: Buffer;
    try { roh = await this.abruf(daneben(url, SCHLUESSEL_DATEI), KLEIN_MAX); } catch { return null; }
    try {
      if (roh.length > SIGNATUR_MAX) throw new Error(`größer als ${SIGNATUR_MAX} Bytes`);
      return { s: liesSchluessel(roh.toString('utf8')), roh };
    } catch (e) { throw new Fachfehler(422, t('pakete.herkunft.fehler.schluesseldatei', { url, grund: (e as Error).message })); }
  }

  /** Fingerabdruck muss genau der sein, den der Admin gesehen und bestätigt hat (wie beim ersten Kontakt mit SSH). */
  private static fingerabdruckBestaetigt(k: Schluessel, e: { fingerabdruck?: unknown }) {
    if (String(e.fingerabdruck ?? '') === k.fingerabdruck) return;
    throw new Fachfehler(409, t(e.fingerabdruck ? 'pakete.herkunft.fehler.schluessel.anders' : 'pakete.herkunft.fehler.schluessel.bestaetigen'), { schluessel: true, fingerabdruck: k.fingerabdruck });
  }

  async quelleHinzufuegen(e: { url?: unknown; fingerabdruck?: unknown }, von: Handelnder): Promise<Quelle[]> {
    let u: URL;
    try { u = new URL(String(e.url ?? '').trim()); } catch { throw new Fachfehler(422, 'Bitte eine vollständige Adresse eingeben, z. B. https://example.org/katalog.json.'); }
    if (u.protocol !== 'https:') throw new Fachfehler(422, t('meldungen.pakete.kataloge-gehen-nur-ueber'));
    const url = u.toString();
    const liste = await paketQuellen(this.d.kern);
    if (url === this.katalogUrl || liste.some((q) => q.url === url)) throw new Fachfehler(409, t('meldungen.pakete.diese-adresse-ist-schon'));
    if (liste.length >= 20) throw new Fachfehler(422, t('meldungen.pakete.hoechstens-20-weitere-kataloge'));
    // Eigener Schlüssel (#594): nur nach Bestätigung des Fingerabdrucks, nie stillschweigend.
    const k = await this.schluesselVon(url);
    if (k) Paketverwaltung.fingerabdruckBestaetigt(k.s, e);
    const am = new Date().toISOString();
    await setzePaketQuellen(this.d.kern, [...liste, { url, aktiv: true, von: von.email, am, ...(k ? { schluessel: { pem: k.s.pem, fingerabdruck: k.s.fingerabdruck, von: von.email, am } } : {}) }]);
    log.warn('Paketquelle hinzugefügt', { von: von.email, url, schluessel: k ? k.s.fingerabdruck : 'ohne Schlüssel' });
    return this.quellen();
  }

  /**
   * Schlüssel eines eigenen Katalogs bestätigen (#594): nach einer Sperre (Schlüssel geändert) oder wenn der
   * Anbieter erst später einen Schlüssel veröffentlicht. Ohne passenden Fingerabdruck: 409 mit dem Fingerabdruck.
   */
  async quelleSchluessel(e: { url?: unknown; fingerabdruck?: unknown }, von: Handelnder): Promise<Quelle[]> {
    const url = String(e.url ?? '');
    const q = (await paketQuellen(this.d.kern)).find((x) => x.url === url);
    if (!q) throw new Fachfehler(404, t('meldungen.pakete.diese-quelle-gibt-es'));
    const k = await this.schluesselVon(url);
    if (!k) throw new Fachfehler(404, t('pakete.herkunft.fehler.keinschluessel', { url }));
    Paketverwaltung.fingerabdruckBestaetigt(k.s, e);
    await this.aendereQuelle(url, { schluessel: { pem: k.s.pem, fingerabdruck: k.s.fingerabdruck, von: von.email, am: new Date().toISOString() }, gesperrt: null });
    this.kataloge.delete(url);
    log.warn('Katalogschlüssel bestätigt', { von: von.email, url, schluessel: k.s.fingerabdruck, vorher: q.schluessel?.fingerabdruck ?? 'ohne Schlüssel' });
    return this.quellen();
  }

  private async aendereQuelle(url: string, aenderung: Partial<PaketQuelleEintrag>) {
    const liste = await paketQuellen(this.d.kern);
    await setzePaketQuellen(this.d.kern, liste.map((q) => (q.url === url ? { ...q, ...aenderung } : q)));
  }

  async quelleSchalten(e: { url?: unknown; aktiv?: unknown }, von: Handelnder): Promise<Quelle[]> {
    const url = String(e.url ?? '');
    const liste = await paketQuellen(this.d.kern);
    if (!liste.some((q) => q.url === url)) throw new Fachfehler(404, t('meldungen.pakete.diese-quelle-gibt-es'));
    const aktiv = e.aktiv === true;
    await setzePaketQuellen(this.d.kern, liste.map((q) => (q.url === url ? { ...q, aktiv } : q)));
    this.kataloge.delete(url);
    log.warn(aktiv ? 'Paketquelle eingeschaltet' : 'Paketquelle abgeschaltet', { von: von.email, url });
    return this.quellen();
  }

  async quelleEntfernen(url: string, von: Handelnder): Promise<Quelle[]> {
    const liste = await paketQuellen(this.d.kern);
    if (!liste.some((q) => q.url === url)) throw new Fachfehler(404, t('meldungen.pakete.diese-quelle-gibt-es'));
    await setzePaketQuellen(this.d.kern, liste.filter((q) => q.url !== url));
    this.kataloge.delete(url);
    log.warn('Paketquelle entfernt', { von: von.email, url });
    return this.quellen();
  }

  /** Nur der offizielle Katalog und eingeschaltete weitere Quellen; alles andere wird nicht abgefragt. */
  private async erlaubt(url: string | undefined): Promise<string> {
    if (!url || url === this.katalogUrl) return this.katalogUrl;
    if ((await this.quellen()).some((q) => q.url === url && q.aktiv)) return url;
    throw new Fachfehler(422, t('meldungen.pakete.diese-katalogquelle-ist-nicht'));
  }

  /* ---------- Katalog ---------- */

  /** Einen Katalog abrufen – nur auf Knopfdruck (bzw. für Vorschau und Installation). */
  async katalog(url?: string): Promise<{ url: string; katalog: Katalog; pruefung: HerkunftPruefung; abgerufen: string }> {
    const u = await this.erlaubt(url);
    let daten: Buffer, katalog: Katalog;
    try { daten = await this.abruf(u, KLEIN_MAX); katalog = liesKatalog(JSON.parse(daten.toString('utf8'))); }
    catch (e) { throw new Fachfehler(502, t('meldungen.pakete.der-katalog-laesst-sich', { message: (e as Error).message })); }
    const pruefung = await this.pruefeKatalog(u, daten, katalog);
    this.kataloge.set(u, { katalog, pruefung, zeit: Date.now() });
    return { url: u, katalog, pruefung, abgerufen: new Date().toISOString() };
  }

  /**
   * Signatur eines abgerufenen Katalogs (#594). Offizieller Katalog: mit einem der beiden Projektschlüssel;
   * fehlt die Signatur, nur Warnung (Stufe 1), ist sie ungültig, Bestätigung wie bei fremden Quellen.
   * Eigener Katalog mit bestätigtem Schlüssel: gültige Signatur Pflicht; neuer Schlüssel nur, wenn er mit dem
   * alten signiert ist – sonst ist der Katalog gesperrt, bis ein Admin den neuen bestätigt.
   */
  private async pruefeKatalog(url: string, daten: Buffer, katalog: Katalog): Promise<HerkunftPruefung> {
    const sig = await this.abruf(daneben(url, SIGNATUR_DATEI), KLEIN_MAX).catch(() => null);
    if (url === this.katalogUrl) {
      if (!sig) { log.info('Offizieller Katalog ohne Signatur', { url }); return { art: 'unsigniert', offiziell: true, bestaetigen: false }; }
      const r = pruefeSignatur(daten, sig, projektSchluessel(this.o.projektSchluessel));
      const stand = r.ok ? await this.stand(url, katalog, true) : null;
      if (!r.ok || !stand) {
        log.warn('Katalogsignatur ungültig', { url, grund: r.ok ? 'ohne Zeitpunkt (erstellt)' : r.grund });
        return { art: 'ungueltig', offiziell: true, bestaetigen: true };
      }
      return { art: 'projekt', offiziell: true, stand, ...(nurTestschluessel(this.o.projektSchluessel) ? { test: true } : {}), bestaetigen: false };
    }
    const q = (await paketQuellen(this.d.kern)).find((x) => x.url === url);
    if (!q?.schluessel) return { art: 'unsigniert', offiziell: false, bestaetigen: true };
    if (q.gesperrt) throw new Fachfehler(409, t('pakete.herkunft.fehler.gesperrt', { url, fingerabdruck: q.gesperrt.fingerabdruck }), { gesperrt: true });
    let schluessel = liesSchluessel(q.schluessel.pem);
    let wechsel = false;
    let r: ReturnType<typeof pruefeSignatur> = sig ? pruefeSignatur(daten, sig, [schluessel]) : { ok: false, grund: t('meldungen.pakete.fehlt', { SIGNATUR_DATEI }) };
    if (!r.ok) {
      // Passt die Signatur nicht, hat der Anbieter vielleicht den Schlüssel gewechselt.
      const neu = await this.schluesselVon(url).catch(() => null);
      if (neu && neu.s.fingerabdruck !== schluessel.fingerabdruck) {
        const eintrag = { pem: neu.s.pem, fingerabdruck: neu.s.fingerabdruck, von: null, am: new Date().toISOString() };
        const w = await this.abruf(daneben(url, WECHSEL_DATEI), KLEIN_MAX).catch(() => null);
        if (!w || !pruefeSignatur(neu.roh, w, [schluessel]).ok) {
          await this.aendereQuelle(url, { gesperrt: eintrag });
          this.kataloge.delete(url);
          log.warn('Katalogschlüssel geändert – Katalog gesperrt, bis ein Admin den neuen Schlüssel bestätigt', { url, bisher: schluessel.fingerabdruck, neu: neu.s.fingerabdruck });
          throw new Fachfehler(409, t('pakete.herkunft.fehler.gesperrt', { url, fingerabdruck: neu.s.fingerabdruck }), { gesperrt: true });
        }
        // Geordneter Wechsel: Der neue Schlüssel ist mit dem alten signiert.
        await this.aendereQuelle(url, { schluessel: eintrag, gesperrt: null });
        log.warn('Katalogschlüssel geordnet gewechselt (neuer Schlüssel mit dem bisherigen signiert)', { url, bisher: schluessel.fingerabdruck, neu: neu.s.fingerabdruck });
        schluessel = neu.s;
        wechsel = true;
        if (sig) r = pruefeSignatur(daten, sig, [schluessel]);
      }
    }
    const stand = r.ok ? await this.stand(url, katalog, true) : null;
    if (!r.ok || !stand) {
      const grund = r.ok ? t('meldungen.pakete.ohne-zeitpunkt-erstellt') : r.grund;
      log.warn('Katalogsignatur ungültig', { url, grund });
      throw new Fachfehler(502, t('pakete.herkunft.fehler.signatur', { url, grund }));
    }
    return { art: 'anbieter', offiziell: false, stand, fingerabdruck: schluessel.fingerabdruck, ...(wechsel ? { wechsel: true } : {}), bestaetigen: false };
  }

  /**
   * Stand (`erstellt`) eines gültig signierten Katalogs gegen den neuesten bisher gesehenen (#594). Online lehnt
   * das DMS ältere ab – sie könnten untergeschoben sein; offline (Sammeldatei) zeigt es nur den Stand.
   */
  private async stand(url: string, katalog: Katalog, online: boolean): Promise<string | null> {
    const zeit = zeitVon(katalog.erstellt);
    if (Number.isNaN(zeit)) return null;
    const gesehen = (await paketKatalogStaende(this.d.kern))[url];
    if (gesehen && zeit < zeitVon(gesehen)) {
      if (!online) return katalog.erstellt;
      log.warn('Älterer signierter Katalog abgelehnt', { url, stand: katalog.erstellt, gesehen });
      throw new Fachfehler(502, t('pakete.herkunft.fehler.zurueck', { url, stand: zeitText(katalog.erstellt), gesehen: zeitText(gesehen) }));
    }
    if (!gesehen || zeit > zeitVon(gesehen)) await setzePaketKatalogStand(this.d.kern, url, katalog.erstellt);
    return katalog.erstellt;
  }

  /** Normale Ansicht: nur der offizielle Katalog; erweiterte Ansicht: auch die eingeschalteten weiteren. */
  async abrufen(alle: boolean): Promise<{ kataloge: Abruf[]; abgerufen: string }> {
    const quellen = (await this.quellen()).filter((q) => q.offiziell || (alle && q.aktiv));
    const kataloge = await Promise.all(quellen.map(async (q): Promise<Abruf> => {
      try { const k = await this.katalog(q.url); return { url: q.url, offiziell: q.offiziell, katalog: k.katalog, pruefung: k.pruefung, fehler: null }; }
      catch (e) { return { url: q.url, offiziell: q.offiziell, katalog: null, pruefung: null, fehler: (e as Error).message }; }
    }));
    return { kataloge, abgerufen: new Date().toISOString() };
  }

  /** Zuletzt abgerufener Katalog einer Quelle, wenn er höchstens 15 Minuten alt ist; sonst neu. */
  private async aktuellerKatalog(url?: string) {
    const u = await this.erlaubt(url);
    const k = this.kataloge.get(u);
    if (k && Date.now() - k.zeit < 15 * 60_000) return { url: u, katalog: k.katalog, pruefung: k.pruefung };
    const neu = await this.katalog(u);
    return { url: neu.url, katalog: neu.katalog, pruefung: neu.pruefung };
  }

  /** Installierte Pakete; mit „Einstellungen nötig“, wenn Pflichtfelder fehlen (#197). */
  async installierte(): Promise<Array<InstalliertesPaket & { einstellungenNoetig?: boolean }>> {
    const mitSprache = (p: InstalliertesPaket): InstalliertesPaket => {
      const a = p.sprache ? this.o.sprachen?.abdeckung?.(p.sprache.kennung) : null;
      return a == null ? p : { ...p, spracheAbdeckung: a };
    };
    return Promise.all((await this.d.kern.repo.listePakete()).map(async (p) => (p.einstellungen
      ? { ...p, einstellungenNoetig: fehlendePflicht(p.einstellungen, (await paketEinstellungen(this.d.kern, p.id))?.werte ?? {}).length > 0 }
      : mitSprache(p))));
  }

  /** Paket einer Version aus einem Katalog holen und gegen die Prüfsumme prüfen. */
  /** umzug (#1084): Fehlt die Id im Katalog, gilt das Paket, das sie unter `ersetzt` nennt (Update unter neuer Id). */
  async lade(id: string, version?: string, quelle?: string, umzug = false): Promise<{ paket: Paket; kp: KatalogPaket; v: KatalogVersion; url: string; katalog: Katalog; pruefung: HerkunftPruefung }> {
    const { katalog, url, pruefung } = await this.aktuellerKatalog(quelle);
    const kp = umzug ? katalogPaketZu(katalog, id) : katalog.pakete.find((p) => p.id === id);
    if (!kp) throw new Fachfehler(404, t('meldungen.pakete.das-paket-gibt-es', { id }));
    const v = version ? kp.versionen.find((x) => x.version === version) : kp.versionen.find((x) => x.version === kp.aktuell) ?? kp.versionen[0];
    if (!v) throw new Fachfehler(404, t('meldungen.pakete.version-von-gibt-es', { version: String(version), name: kp.name }));
    if (v.groesse > ARCHIV_MAX) throw new Fachfehler(422, t('meldungen.pakete.das-paket-laesst-sich', { wert: t('pakete.groesse.zuGross', { groesse: inMB(v.groesse), max: inMB(ARCHIV_MAX) }) }));
    let daten: Buffer;
    try { daten = await this.abruf(new URL(v.archiv, url).toString()); }
    catch (e) { throw new Fachfehler(502, t('meldungen.pakete.das-paket-laesst-sich-2', { message: (e as Error).message })); }
    if (createHash('sha256').update(daten).digest('hex') !== v.sha256) throw new Fachfehler(422, t('meldungen.pakete.die-pruefsumme-von-passt', { name: kp.name, version: v.version }));
    const paket = liesPaket(liesZip(daten));
    if (paket.manifest.id !== kp.id || paket.manifest.version !== v.version || (kp.id !== id && !paket.manifest.ersetzt?.includes(id))) throw new Fachfehler(422, t('meldungen.pakete.das-archiv-enthaelt-statt', { id: paket.manifest.id, version: paket.manifest.version, id2: kp.id, version2: v.version }));
    return { paket, kp, v, url, katalog, pruefung };
  }

  /* ---------- Hochladen (#189) ---------- */

  /**
   * Paket als Datei: dieselbe Prüfung wie bei Katalogpaketen, nur ohne Prüfsumme aus dem Katalog. Steht die
   * Prüfsumme im (schon abgerufenen) offiziellen Katalog, zeigt die Vorschau die Katalogversion (#594).
   */
  async hochladen(daten: unknown, von: Handelnder): Promise<{ upload: string; vorschau: Vorschau }> {
    if (!Buffer.isBuffer(daten) || !daten.length) throw new Fachfehler(422, t('meldungen.pakete.bitte-eine-zip-datei'));
    if (daten.length > ARCHIV_MAX) throw new Fachfehler(422, t('pakete.groesse.zuGross', { groesse: inMB(daten.length), max: inMB(ARCHIV_MAX) }));
    const paket = liesPaket(liesZip(daten));
    const sha256 = createHash('sha256').update(daten).digest('hex');
    const kv = this.kataloge.get(this.katalogUrl)?.katalog.pakete.find((p) => p.id === paket.manifest.id)?.versionen.find((v) => v.sha256 === sha256);
    const pruefung: HerkunftPruefung = { art: 'datei', offiziell: false, ...(kv ? { katalogversion: kv.version } : {}), bestaetigen: true };
    const upload = randomUUID();
    await this.merkeUpload(upload, { paket, von, am: new Date().toISOString(), zeit: Date.now(), pruefung }, daten, 'einzeln');
    log.warn('Paket hochgeladen', { von: von.email, paket: paket.manifest.id, version: paket.manifest.version, bytes: daten.length, sha256, katalog: kv ? `entspricht ${kv.version}` : 'nicht abgeglichen' });
    return { upload, vorschau: mitPruefung(await this.plane(paket, undefined, await this.offiziell().catch(() => undefined), {}, {}, { quelle: { herkunft: { art: 'hochgeladen', von: von.email, am: new Date().toISOString() }, pruefung } }), pruefung) };
  }

  /** Hochgeladene Datei (#461): eine Sammeldatei erkennt das DMS an sammeldatei.json, sonst ein einzelnes Paket. */
  async hochladenDatei(daten: unknown, von: Handelnder): Promise<{ upload: string; vorschau: Vorschau } | { sammeldatei: Sammeldatei }> {
    if (!Buffer.isBuffer(daten) || !daten.length) throw new Fachfehler(422, t('meldungen.pakete.bitte-eine-zip-datei'));
    if (daten.length > SAMMEL_MAX) throw new Fachfehler(422, t('pakete.groesse.sammelZuGross', { groesse: inMB(daten.length), max: inMB(SAMMEL_MAX) }));
    if (zipNamen(daten).includes(SAMMEL_VERZEICHNIS)) return { sammeldatei: await this.sammeldatei(daten, von) };
    return this.hochladen(daten, von);
  }

  /**
   * Der offizielle Katalog in einer Sammeldatei (#594): katalog.json mit katalog.sig, gültig signiert mit einem
   * Projektschlüssel. Ohne beides: unsigniert; mit ungültiger Signatur: ungültig (steht im Protokoll).
   */
  private eingebettet(dateien: Map<string, Buffer>): { katalog: Katalog | null; pruefung: HerkunftPruefung } {
    const kj = dateien.get(SAMMEL_KATALOG), ks = dateien.get(SIGNATUR_DATEI);
    if (!kj || !ks) return { katalog: null, pruefung: { art: 'unsigniert', offiziell: false, bestaetigen: true } };
    const r = pruefeSignatur(kj, ks, projektSchluessel(this.o.projektSchluessel));
    let katalog: Katalog | null = null;
    if (r.ok) { try { katalog = liesKatalog(JSON.parse(kj.toString('utf8'))); } catch { katalog = null; } }
    const zeit = katalog ? zeitVon(katalog.erstellt) : NaN;
    if (!r.ok || !katalog || Number.isNaN(zeit)) {
      log.warn('Katalogsignatur in einer Sammeldatei ungültig', { grund: r.ok ? 'Katalog nicht lesbar oder ohne Zeitpunkt (erstellt)' : r.grund });
      return { katalog: null, pruefung: { art: 'ungueltig', offiziell: false, bestaetigen: true } };
    }
    const alt = Date.now() - zeit > KATALOG_ALT_TAGE * TAG_MS;
    return { katalog, pruefung: { art: 'projekt', offiziell: true, stand: katalog.erstellt, ...(alt ? { alt: true } : {}), ...(nurTestschluessel(this.o.projektSchluessel) ? { test: true } : {}), bestaetigen: false } };
  }

  /**
   * Sammeldatei prüfen (#461) – alles oder nichts: Verzeichnis, nur erwartete Dateien, je Archiv Größe und
   * SHA-256 wie im Verzeichnis, gegen den signierten Katalog in der Datei (#594) und gegen den offiziellen
   * Katalog, falls er schon abgerufen ist (keine neue Verbindung). Danach jedes Paket mit denselben Prüfungen
   * wie ein einzeln hochgeladenes (liesPaket). Installiert wird nichts; jedes Paket bekommt eine
   * Upload-Kennung und wird einzeln installiert.
   */
  async sammeldatei(daten: Buffer, von: Handelnder): Promise<Sammeldatei> {
    const dateien = liesZip(daten, { dateien: SAMMEL_PAKETE_MAX + 4, entpackt: SAMMEL_MAX });
    const vz = liesSammelVerzeichnis(dateien.get(SAMMEL_VERZEICHNIS));
    const gruende: string[] = [];
    const erwartet = new Set([SAMMEL_VERZEICHNIS, SAMMEL_LIESMICH, SAMMEL_KATALOG, SIGNATUR_DATEI, ...vz.pakete.map((p) => p.archiv)]);
    for (const n of dateien.keys()) if (!erwartet.has(n)) gruende.push(`${n}: steht nicht im Verzeichnis der Sammeldatei.`);
    const katalog = await this.offiziell();
    const signiert = this.eingebettet(dateien);
    const version = (k: Katalog | null | undefined, e: SammelEintrag) => k?.pakete.find((p) => p.id === e.id)?.versionen.find((v) => v.version === e.version);
    const imKatalog = (e: SammelEintrag) => version(katalog, e);
    for (const e of vz.pakete) {
      const a = dateien.get(e.archiv);
      if (!a) { gruende.push(t('meldungen.pakete.fehlt-2', { archiv: e.archiv })); continue; }
      if (a.length !== e.groesse) gruende.push(`${e.name} ${e.version}: Die Größe passt nicht zum Verzeichnis.`);
      else if (createHash('sha256').update(a).digest('hex') !== e.sha256) gruende.push(`${e.name} ${e.version}: Die Prüfsumme passt nicht zum Verzeichnis.`);
      const kv = imKatalog(e);
      if (kv && kv.sha256 !== e.sha256) gruende.push(`${e.name} ${e.version}: Die Prüfsumme passt nicht zum offiziellen Katalog.`);
      const sv = version(signiert.katalog, e);
      if (sv && sv.sha256 !== e.sha256) gruende.push(t('pakete.herkunft.fehler.sammel', { name: e.name, version: e.version }));
    }
    if (gruende.length) throw new Fachfehler(422, t('meldungen.pakete.die-sammeldatei-ist-beschaedigt'), { gruende });
    const budget = { rest: SAMMEL_ENTPACKT_MAX };
    const gelesen = vz.pakete.map((e) => {
      let paket: Paket;
      try { paket = liesPaket(liesZip(dateien.get(e.archiv)!, { ...PAKET_GRENZEN, budget })); }
      catch (x) {
        if (!(x instanceof Fachfehler)) throw x;
        throw new Fachfehler(422, t('meldungen.pakete.in-der-sammeldatei-es', { name: e.name, version: e.version, message: x.message }), x.details);
      }
      if (paket.manifest.id !== e.id || paket.manifest.version !== e.version) throw new Fachfehler(422, t('meldungen.pakete.das-archiv-enthaelt-es', { archiv: e.archiv, id: paket.manifest.id, version: paket.manifest.version }));
      return { e, paket, id: e.id, abhaengigkeiten: paket.manifest.abhaengigkeiten };
    });
    const reihenfolge = nachAbhaengigkeiten(gelesen);
    if (!reihenfolge) throw new Fachfehler(422, t('meldungen.pakete.die-abhaengigkeiten-der-pakete'));
    // Gültig signierter Stand: merken, wenn er neuer ist (ohne Internet wird nichts abgelehnt, nur angezeigt).
    if (signiert.katalog) await this.stand(this.katalogUrl, signiert.katalog, false);
    const am = new Date().toISOString();
    const installierte = await this.d.kern.repo.listePakete();
    const pakete: SammelPaket[] = [];
    const nichtImKatalog: string[] = [];
    for (const { e, paket } of reihenfolge) {
      const upload = randomUUID();
      // Herkunft je Paket: aus dem signierten Katalog nur, wenn es mit genau dieser Prüfsumme darin steht.
      const drin = !!version(signiert.katalog, e);
      if (signiert.katalog && !drin) nichtImKatalog.push(`${paket.manifest.name} ${e.version}`);
      const pruefung: HerkunftPruefung = drin ? signiert.pruefung : signiert.katalog ? { art: 'datei', offiziell: false, bestaetigen: true } : signiert.pruefung;
      await this.merkeUpload(upload, { paket, von, am, zeit: Date.now(), pruefung }, dateien.get(e.archiv)!, 'sammel');
      const da = installierte.find((p) => p.id === e.id)?.version ?? null;
      const c = da ? vergleicheVersion(e.version, da) : 1;
      pakete.push({
        upload, id: e.id, name: paket.manifest.name, version: e.version, gewaehlt: e.gewaehlt, abhaengigkeiten: paket.manifest.abhaengigkeiten,
        ...(paket.manifest.ergaenzt ? { ergaenzt: paket.manifest.ergaenzt } : {}),
        katalog: imKatalog(e) || drin ? 'gleich' : 'unbekannt', installiert: da, stand: !da ? 'neu' : c > 0 ? 'neuer' : c === 0 ? 'gleich' : 'aelter',
        vorschau: mitPruefung(await this.plane(paket, undefined, katalog ?? signiert.katalog ?? undefined, {}, {}, { quelle: { herkunft: { art: 'hochgeladen', von: von.email, am }, pruefung } }), pruefung),
      });
    }
    const sha256 = createHash('sha256').update(daten).digest('hex');
    const pruefung: HerkunftPruefung = { ...signiert.pruefung, bestaetigen: pakete.some((p) => p.vorschau.pruefung?.bestaetigen) };
    log.warn('Sammeldatei hochgeladen', {
      von: von.email, sha256, bytes: daten.length, pakete: pakete.map((p) => `${p.id}@${p.version}`).join(', '),
      katalog: pakete.every((p) => p.katalog === 'gleich') ? 'abgeglichen' : 'nicht abgeglichen',
      signatur: signiert.katalog ? `offizieller Katalog vom ${signiert.katalog.erstellt}${nichtImKatalog.length ? `, nicht darin: ${nichtImKatalog.join(', ')}` : ''}` : signiert.pruefung.art,
    });
    return { datei: { sha256, groesse: daten.length, erstellt: vz.erstellt, quelle: vz.quelle, katalog: vz.katalog, dms: vz.dms, pruefung, nichtImKatalog }, pakete };
  }

  /** Datei eines Uploads (#745): Name aus dem Hash der Kennung – die Kennung selbst steht nirgends. */
  private uploadDatei(token: string, endung: 'zip' | 'json') { return join(this.o.uploadOrdner!, `${createHash('sha256').update(token).digest('hex')}.${endung}`); }

  /** Upload merken: im Arbeitsspeicher und – bei mehreren Prozessen – im Upload-Ordner; Abgelaufenes fliegt dabei raus. */
  private async merkeUpload(token: string, u: Hochgeladen, archiv: Buffer, art: UploadArt) {
    await this.raeumeUploadsAuf();
    this.behalte(token, { ...u, bytes: archiv.length });
    const ordner = this.o.uploadOrdner;
    if (!ordner) return;
    await mkdir(ordner, { recursive: true, mode: 0o700 });
    await writeFile(this.uploadDatei(token, 'zip'), archiv, { mode: 0o600 });
    await writeFile(this.uploadDatei(token, 'json'), JSON.stringify({ von: u.von, am: u.am, zeit: u.zeit, pruefung: u.pruefung, art }), { mode: 0o600 });
  }

  /**
   * Abgelaufene Uploads aus dem Arbeitsspeicher und dem Upload-Ordner entfernen (#901) – beim Hochladen und alle fünf
   * Minuten, damit nicht installierte Pakete nicht liegen bleiben, bis jemand das nächste hochlädt.
   */
  async raeumeUploadsAuf() {
    for (const [k, x] of this.uploads) if (Date.now() - x.zeit > UPLOAD_GUELTIG) this.uploads.delete(k);
    const ordner = this.o.uploadOrdner;
    if (!ordner) return;
    for (const n of await readdir(ordner).catch(() => [] as string[])) {
      const s = await stat(join(ordner, n)).catch(() => null);
      if (s && Date.now() - s.mtimeMs > UPLOAD_GUELTIG) await rm(join(ordner, n), { force: true }).catch(() => {});
    }
  }

  /**
   * Upload im Arbeitsspeicher halten, zusammen höchstens UPLOADS_SPEICHER_MAX (#901): Darüber fallen die ältesten heraus.
   * Mit Upload-Ordner liegen sie dort weiter und werden bei Bedarf neu gelesen, sonst muss man sie neu hochladen.
   */
  private behalte(token: string, u: Hochgeladen) {
    this.uploads.delete(token);
    this.uploads.set(token, u);
    let summe = 0;
    for (const x of this.uploads.values()) summe += x.bytes ?? 0;
    for (const [k, x] of this.uploads) {
      if (summe <= UPLOADS_SPEICHER_MAX || k === token) break;
      this.uploads.delete(k);
      summe -= x.bytes ?? 0;
    }
  }

  /** Belegter Arbeitsspeicher der Uploads (für Tests und Systemzustand). */
  uploadsBytes(): number { let n = 0; for (const x of this.uploads.values()) n += x.bytes ?? 0; return n; }

  /** Upload vergessen (installiert): auch die Dateien. */
  private async vergissUpload(token: string) {
    this.uploads.delete(token);
    if (this.o.uploadOrdner) for (const e of ['zip', 'json'] as const) await rm(this.uploadDatei(token, e), { force: true }).catch(() => {});
  }

  private async hochgeladen(token: unknown): Promise<Hochgeladen> {
    const k = String(token ?? '');
    const abgelaufen = () => new Fachfehler(410, t('meldungen.pakete.das-hochgeladene-paket-ist'));
    const u = this.uploads.get(k);
    if (u) { if (Date.now() - u.zeit > UPLOAD_GUELTIG) throw abgelaufen(); return u; }
    // Bei einem anderen Prozess hochgeladen (#745): Archiv neu lesen – mit denselben Prüfungen wie beim Hochladen.
    if (!this.o.uploadOrdner || !/^[0-9a-f-]{36}$/.test(k)) throw abgelaufen();
    let angaben: { von: Handelnder; am: string; zeit: number; pruefung: HerkunftPruefung; art: UploadArt };
    let archiv: Buffer;
    try {
      angaben = JSON.parse(await readFile(this.uploadDatei(k, 'json'), 'utf8'));
      archiv = await readFile(this.uploadDatei(k, 'zip'));
    } catch { throw abgelaufen(); }
    if (Date.now() - angaben.zeit > UPLOAD_GUELTIG) throw abgelaufen();
    const paket = liesPaket(liesZip(archiv, PAKET_GRENZEN));
    const neu: Hochgeladen = { paket, von: angaben.von, am: angaben.am, zeit: angaben.zeit, pruefung: angaben.pruefung, bytes: archiv.length };
    this.behalte(k, neu);
    return neu;
  }

  /** Abhängigkeiten eines hochgeladenen Pakets kommen aus dem offiziellen Katalog (wenn schon abgerufen). */
  private async offiziell(): Promise<Katalog | undefined> { return this.kataloge.get(this.katalogUrl)?.katalog; }

  /* ---------- Vorschau und Installation ---------- */

  /** Vorschau: was angelegt bzw. ergänzt wird, Namenskonflikte, Version und Abhängigkeiten, Herkunft (#594). */
  async vorschau(e: { id?: string; version?: string; quelle?: string; upload?: string }): Promise<Vorschau> {
    if (e.upload) { const u = await this.hochgeladen(e.upload); return mitPruefung(await this.plane(u.paket, undefined, await this.offiziell(), {}, {}, { quelle: { herkunft: { art: 'hochgeladen', von: u.von.email, am: u.am }, pruefung: u.pruefung } }), u.pruefung); }
    const { paket, v, katalog, pruefung, url } = await this.lade(String(e.id), e.version ? String(e.version) : undefined, e.quelle ? String(e.quelle) : undefined, true);
    return mitPruefung(await this.plane(paket, v, katalog, {}, {}, { quelle: { herkunft: { art: 'katalog', url }, pruefung } }), pruefung);
  }

  /**
   * geplant (#405): Namen von Mappentypen und Ansichten (oberste Ebene), die Pakete davor im selben Ablauf anlegen –
   * sie zählen wie vorhandene; die eigenen kommen dazu.
   */
  private async plane(paket: Paket, v?: KatalogVersion, katalog?: Katalog, namen: Record<string, string> = {}, sichtNamen: Record<string, string> = {}, mehr: { geplant?: { typen: Set<string>; sichten: Set<string> }; quelle?: PlanQuelle } = {}): Promise<Vorschau> {
    const { geplant, quelle } = mehr;
    const m = paket.manifest;
    const installierte = await this.d.kern.repo.listePakete();
    // Umzug (#1084): Unter der neuen Id noch nicht da, aber unter einer früheren – dann ist es ein Update dieser Installation.
    const ich = installierte.find((p) => p.id === m.id) ?? installierteErsetzt(installierte, m) ?? null;
    const umzug = ich && ich.id !== m.id ? ich.id : null;
    const typen = await this.d.listeTypen();
    const sichten = await this.d.listeSichten();
    const probleme: string[] = [];
    const fehlercodes: string[] = [];
    const dmsVersion = this.o.version();
    const dmsOk = dmsPasst(dmsVersion, m.dms);
    if (!dmsOk) probleme.push(t('meldungen.pakete.das-paket-braucht-ablago', { dms: m.dms, dmsVersion }));
    const hinweise: string[] = [];
    // Code läuft erst mit dem Paket-Läufer; Einstellungen lassen sich schon pflegen (#197).
    if (m.code !== undefined && !paket.code) hinweise.push(t('meldungen.pakete.das-paket-enthaelt-code'));
    if (ich && vergleicheVersion(m.version, ich.version) <= 0) { probleme.push(t('meldungen.pakete.version-ist-schon-installiert', { version: ich.version })); fehlercodes.push('schon-installiert'); }
    // Herausgeber (#1084): Dieselbe Id von einem anderen Herausgeber ersetzt das installierte Paket nie.
    const herausgeber = m.herausgeber ?? this.standardHerausgeber(quelle?.herkunft, quelle?.pruefung);
    const problem = (code: string, text: string) => { probleme.push(text); fehlercodes.push(code); };
    // app.ablago (auch app.ablago.*) gehört dem Projekt (Sicherheit C): nur aus dem offiziellen Katalog bzw. mit Prüfsumme dort.
    if (istOffiziellerHerausgeber(m.herausgeber) && quelle?.pruefung && !offiziellBelegt(quelle.pruefung)) problem('herausgeber-nicht-offiziell', t('meldungen.pakete.herausgeber-nicht-offiziell', { herausgeber: m.herausgeber! }));
    const fremd = ich ? this.andererHerausgeber(m, ich, quelle) : null;
    if (fremd) problem('anderer-herausgeber', fremd);
    // Herausgeber eines weiteren signierten Katalogs ist an dessen Schlüssel gebunden (beim ersten Mal gemerkt).
    if (ich?.herausgeberSchluessel && quelle?.pruefung.fingerabdruck && quelle.pruefung.fingerabdruck !== ich.herausgeberSchluessel && !quelle.pruefung.wechsel) {
      problem('herausgeber-schluessel', t('meldungen.pakete.herausgeber-schluessel', { herausgeber: herausgeber ?? '–' }));
    }
    // Umzug (#1084, `ersetzt`): nur ausdrücklich, aus derselben Quelle, mindestens so vertrauenswürdig und vom selben,
    // bekannten Herausgeber – sonst könnte ein beliebiges Paket eine fremde Installation samt Zugangsdaten übernehmen.
    if (umzug) {
      const vorher = this.herausgeberVon(ich!);
      if (!quelle || !gleicheQuelle(ich!.herkunft, quelle.herkunft) || vertrauen(quelle.pruefung) < this.vertrauenVon(ich!)) problem('umzug-quelle', t('meldungen.pakete.umzug-andere-quelle', { alt: umzug, neu: m.id }));
      else if (!vorher || vorher !== herausgeber) problem('umzug-herausgeber', t('meldungen.pakete.umzug-herausgeber', { alt: umzug, neu: m.id }));
      else hinweise.push(t('meldungen.pakete.umzug', { alt: umzug, neu: m.id }));
    }
    // Ergänzung mit Punkt (Sicherheit B): derselbe Herausgeber wie das Hauptpaket – installiert oder im Katalog.
    const haupt = hauptpaket(m.id);
    if (haupt) {
      const hi = installierte.find((p) => p.id === haupt);
      const hk = hi ? null : katalog?.pakete.find((p) => p.id === haupt);
      const vonHaupt = hi ? this.herausgeberVon(hi) : hk ? hk.herausgeber ?? (quelle?.herkunft.art === 'katalog' && quelle.herkunft.url === this.katalogUrl ? OFFIZIELLER_HERAUSGEBER : null) : null;
      if ((hi || hk) && vonHaupt !== herausgeber) problem('ergaenzung-herausgeber', t('meldungen.pakete.ergaenzung-herausgeber', { id: m.id, haupt, herausgeber: vonHaupt ?? t('meldungen.pakete.herausgeber-unbekannt') }));
    }
    // Erstmals ein Herausgeber an einem Paket ohne (Bestand): ab jetzt gilt er – die Vorschau sagt es.
    if (ich && !this.herausgeberVon(ich) && herausgeber) hinweise.push(t('meldungen.pakete.herausgeber-erstmals', { herausgeber }));
    const geprueft = !!herausgeber && (istOffiziellerHerausgeber(herausgeber) ? !!quelle && offiziellBelegt(quelle.pruefung) : quelle?.pruefung.art === 'anbieter');
    // Sprachpaket (#731): je Sprache ein Paket; was zu dieser Version nicht passt, fällt weg (Hinweis).
    const sp = paket.sprache;
    if (sp) {
      const anderes = installierte.find((p) => p.id !== m.id && p.id !== umzug && p.sprache?.kennung === sp.angabe.kennung);
      if (anderes) { probleme.push(t('meldungen.sprachpakete.schon-da', { name: anderes.name, kennung: sp.angabe.kennung })); fehlercodes.push('sprache-schon-da'); }
      if (sp.uebergangen.length) hinweise.push(t('meldungen.sprachpakete.uebergangen', { anzahl: sp.uebergangen.length }));
      if (VERSION.test(dmsVersion) && vergleicheVersion(sp.angabe.ablago, dmsVersion) < 0) hinweise.push(t('meldungen.sprachpakete.aelter', { ablago: sp.angabe.ablago, version: dmsVersion }));
    }
    // Verweise auf Mappentypen des DMS (#310), z. B. dms:rolle; dms:ablageort ist seit #883 ein Alias für basis:ablageort.
    const dmsTypen = await this.dmsTypen();
    const genutzt = [...new Set(typverweise(paket.typen, paket.sichten).filter(istDmsVerweis).map((vw) => vw.slice(DMS_PRAEFIX.length)))];
    for (const k of genutzt.filter((k) => !dmsTypen.has(k))) {
      probleme.push(DMS_ALIAS[k] ? t('meldungen.pakete.alias-ohne-ziel', { vw: DMS_PRAEFIX + k, neu: DMS_ALIAS[k], version: BASIS_ABLAGEORT_AB }) : t('meldungen.pakete.das-paket-verweist-auf', { wert: DMS_TYPEN[k] ?? k, DMS_VERWEISE_AB }));
    }
    const veraltet = veralteteVerweise([...typverweise(paket.typen, paket.sichten), ...(paket.code ? [...paket.code.info.rechte.lesen, ...paket.code.info.rechte.schreiben, ...(paket.code.info.mappentypen ?? [])] : []),
      ...paket.automatisierungen.map((a) => str(a.wenn.typ))]);
    for (const vw of veraltet) hinweise.push(t('meldungen.pakete.alias-veraltet', { vw, neu: DMS_ALIAS[vw.slice(DMS_PRAEFIX.length)] }));
    const da = genutzt.filter((k) => dmsTypen.has(k) && !DMS_ALIAS[k]);
    if (da.length) hinweise.push(t('meldungen.pakete.nutzt-mappentypen-aus-ablago', { map: da.map((k) => t('meldungen.pakete.aus-ablago', { name: dmsTypen.get(k)!.name })).join(', ') }));
    // Wortlisten (#356): Gruppen gleichbedeutender Wörter für die Suche.
    if (paket.wortlisten.length) hinweise.push(t('meldungen.pakete.bringt-gruppen-gleichbedeutender', { anzahl: paket.wortlisten.length }));
    // Beispiele, die auf Beispiele einer Abhängigkeit zeigen (#347): ohne diese bleiben die Verweise leer.
    for (const p of new Set(paket.beispiele.flatMap((b) => beispielVerweise(b.werte)).filter((z) => z.includes(':') && !z.startsWith(`${m.id}:`)).map((z) => z.split(':')[0]))) {
      const da = installierte.find((x) => x.id === p);
      if (da && !Object.keys(da.beispiele ?? {}).length) hinweise.push(t('meldungen.pakete.einige-beispiele-zeigen-auf', { name: da.name }));
    }
    const abhaengigkeiten = Object.entries(m.abhaengigkeiten).map(([id, bereich]): AbhaengigkeitPlan => {
      const da = installierte.find((p) => p.id === id);
      const kp = katalog?.pakete.find((p) => p.id === id);
      return { id, bereich, installiert: da?.version ?? null, ok: !!da && passt(da.version, bereich) && this.herausgeberPasst(da, herausgeber), verfuegbar: kp ? neuestePassende(kp, bereich)?.version ?? null : null };
    });
    // Abhängigkeiten über Id und Herausgeber (Sicherheit C): Ein fremdes „basis“ erfüllt die eines offiziellen Pakets nicht.
    for (const a of abhaengigkeiten) {
      const da = installierte.find((p) => p.id === a.id);
      if (da && !this.herausgeberPasst(da, herausgeber)) problem('abhaengigkeit-herausgeber', t('meldungen.pakete.abhaengigkeit-herausgeber', { id: a.id, herausgeber: this.herausgeberVon(da) ?? t('meldungen.pakete.herausgeber-unbekannt') }));
    }
    for (const a of abhaengigkeiten) {
      if (a.installiert && !a.ok && passt(a.installiert, a.bereich)) continue;
      if (a.installiert && !a.ok) probleme.push(t('meldungen.pakete.ist-in-version-installiert', { id: a.id, installiert: a.installiert, bereich: a.bereich }));
    }
    const belegt = new Set([...typen.map((t) => t.name.trim().toLowerCase()), ...(geplant?.typen ?? [])]);
    // Text → Verweis (#534): Angaben im alten Textfeld, deren Verweis noch leer ist.
    const umwandelbar = async (t: PaketTyp) => {
      const typ = typen.find((x) => x.id === ich?.typen[t.schluessel]);
      const erg: Array<{ feld: string; aus: string; anzahl: number }> = [];
      for (const f of t.felder) {
        const alt = f.ausText ? typ?.felder.find((x) => x.key === f.ausText && (x.typ === 'text' || x.typ === 'langtext')) : undefined;
        if (!typ || !alt) continue;
        const anzahl = (await this.d.listeMappen(typ.id)).filter((m) => !istLeer(m.werte[alt.key]) && istLeer(m.werte[f.key])).length;
        erg.push({ feld: typ.felder.find((x) => x.key === f.key)?.label ?? f.label, aus: alt.label, anzahl });
      }
      return erg;
    };
    const ueb = await this.uebernahme(paket, ich);
    if (ueb) hinweise.push(t('meldungen.pakete.ablageort-uebernommen', { name: ueb.name }));
    const typPlaene = await Promise.all(paket.typen.map(async (paketTyp): Promise<TypPlan> => {
      // Kennung im DMS (#1084): Paket und Schlüssel getrennt, nach außen `paket:schluessel` – eindeutig auch bei „_“ in beiden.
      const dmsSchluessel = typKennung(m.id, paketTyp.schluessel);
      const vorhandenId = ich?.typen[paketTyp.schluessel] ?? ueb?.typen[paketTyp.schluessel];
      const vorhanden = vorhandenId ? typen.find((x) => x.id === vorhandenId) : undefined;
      if (vorhanden) {
        return {
          schluessel: paketTyp.schluessel, dmsSchluessel, name: vorhanden.name, felder: paketTyp.felder.length, vorhanden: true,
          neueFelder: paketTyp.felder.filter((f) => !vorhanden.felder.some((g) => g.key === f.key)).map((f) => f.label),
          neueRegister: paketTyp.register.filter((r) => !vorhanden.register.some((g) => g.key === r.key)).map((r) => r.name),
          erkennung: erkennungNeu(paketTyp, vorhanden).map((f) => f.label),
          wiederfinden: wiederfindenNeu(paketTyp, vorhanden).map((f) => f.label),
          typAngaben: Object.keys(typAngabenNeu(paketTyp, vorhanden)).length > 0,
          umwandeln: await umwandelbar(paketTyp),
          formate: formatNeu(paketTyp, vorhanden).map((f) => f.label),
          beschriftungen: beschriftungenNeu(paketTyp, vorhanden).anzahl,
          abschnitte: abschnitteNeu(paketTyp, vorhanden, (r) => [...(r.felder ?? []), ...neueFelderAuf(paketTyp, vorhanden, r)]).map((r) => r.name),
          konflikt: null, vorschlag: null,
        };
      }
      if (vorhandenId) return { schluessel: paketTyp.schluessel, dmsSchluessel, name: paketTyp.name, felder: paketTyp.felder.length, vorhanden: false, neueFelder: [], neueRegister: [], konflikt: null, vorschlag: null, geloescht: true };
      if (typen.some((x) => x.schluessel === dmsSchluessel)) probleme.push(t('meldungen.pakete.die-kennung-hat-schon', { dmsSchluessel }));
      const name = (namen[paketTyp.schluessel] ?? paketTyp.name).trim();
      const konflikt = belegt.has(name.toLowerCase()) ? t('meldungen.pakete.einen-mappentyp-gibt-es', { name }) : null;
      const vorschlag = konflikt ? freierName(name, m.name, belegt) : null;
      belegt.add(name.toLowerCase());
      return { schluessel: paketTyp.schluessel, dmsSchluessel, name, felder: paketTyp.felder.length, vorhanden: false, neueFelder: [], neueRegister: [], konflikt, vorschlag };
    }));
    for (const n of belegt) geplant?.typen.add(n);
    // Ansichten mit Mappentypen, die das Paket nicht mitbringt (#656): fehlt einer, kommt die Ansicht ohne ihn; fehlen
    // alle, wird sie (mit ihren Unteransichten) übersprungen – das übrige Paket wird trotzdem installiert.
    const ausgelassen = new Map<string, string>();
    for (const s of nachEltern(paket.sichten)) {
      if (s.eltern && ausgelassen.has(s.eltern)) { ausgelassen.set(s.schluessel, `Ansicht „${s.name}“ wird nicht installiert: Sie steht unter „${paket.sichten.find((x) => x.schluessel === s.eltern)?.name ?? s.eltern}“, die nicht installiert wird.`); continue; }
      const fremd = s.fremdeTypen ?? [];
      const fehlt = fremd.filter((f) => !fremderTyp(f.kennung, typen, installierte));
      if (fremd.length && fehlt.length === fremd.length && !(s.typen ?? []).length) ausgelassen.set(s.schluessel, `Ansicht „${s.name}“ wird nicht installiert: Den Mappentyp ${fehlt.map((f) => `„${f.name}“`).join(', ')} gibt es in dieser Installation nicht.`);
    }
    for (const g of ausgelassen.values()) hinweise.push(g);
    const sichtPlaene = paket.sichten.map((s): SichtPlan => {
      if (ausgelassen.has(s.schluessel) && !ich?.sichten[s.schluessel]) return { schluessel: s.schluessel, name: s.name, eltern: s.eltern ?? null, vorhanden: false, konflikt: null, vorschlag: null, ausgelassen: ausgelassen.get(s.schluessel)! };
      const ohne = (s.fremdeTypen ?? []).filter((f) => !fremderTyp(f.kennung, typen, installierte)).map((f) => f.name);
      if (ohne.length && !ich?.sichten[s.schluessel]) hinweise.push(t('meldungen.pakete.ansicht-kommt-ohne-den', { name: s.name, map: ohne.map((n) => `„${n}“`).join(', ') }));
      const vorhandenId = ich?.sichten[s.schluessel] ?? ueb?.sichten[s.schluessel];
      const vorhanden = vorhandenId ? sichten.find((x) => x.id === vorhandenId) : undefined;
      if (vorhanden || vorhandenId) return { schluessel: s.schluessel, name: vorhanden?.name ?? s.name, eltern: s.eltern ?? null, vorhanden: true, konflikt: null, vorschlag: null };
      const name = (sichtNamen[s.schluessel] ?? s.name).trim();
      // Konflikt nur auf oberster Ebene: Untersichten stehen unter der neuen Elternsicht.
      const geschwister = s.eltern ? [] : [...sichten.filter((x) => !x.elternId).map((x) => x.name.trim().toLowerCase()), ...(geplant?.sichten ?? [])];
      const konflikt = geschwister.includes(name.toLowerCase()) ? t('meldungen.pakete.eine-ansicht-gibt-es', { name }) : null;
      if (!s.eltern) geplant?.sichten.add(name.toLowerCase());
      return { schluessel: s.schluessel, name, eltern: s.eltern ?? null, vorhanden: false, konflikt, vorschlag: konflikt ? freierName(name, m.name, new Set(geschwister)) : null, ...(ohne.length ? { ohne } : {}) };
    });
    return {
      paket: { id: m.id, name: m.name, version: m.version, beschreibung: m.beschreibung, lizenz: m.lizenz, autor: m.autor, dms: m.dms, abhaengigkeiten: m.abhaengigkeiten, readme: v?.readme ?? null, changelog: v?.changelog ?? null, quelle: v?.quelle ?? null, herausgeber, herausgeberGeprueft: geprueft },
      dmsVersion, dmsOk, installiert: ich?.version ?? null, update: !!ich, umzug,
      herausgeberSchluessel: quelle?.pruefung.art === 'anbieter' && herausgeber ? quelle.pruefung.fingerabdruck ?? null : null,
      herkunft: ich?.herkunft ?? null,
      pruefung: null,
      abhaengigkeiten, typen: typPlaene, sichten: sichtPlaene, beispiele: paket.beispiele.length, beispielDokumente: beispielDokumenteVon(paket), probleme, fehlercodes, hinweise,
      automatisierungen: paket.automatisierungen.map((a) => ({ schluessel: a.schluessel, name: a.name, beschreibung: a.beschreibung, neu: !ich?.automatisierungen?.includes(a.schluessel) })),
      einstellungen: paket.einstellungen || ich?.einstellungen ? einstellungsAenderung(ich?.einstellungen ?? null, paket.einstellungen) : null,
      laeufer: paket.code ? { rechte: rechtePunkte(paket.code.info, (vw) => this.typName(vw, paket, installierte, typen)), bestaetigen: !ich || !gleicheRechte(ich.laeufer, paket.code.info) } : null,
      sprache: sp ? { ...sp.angabe, abdeckung: abdeckung(DEUTSCH, sp.texte), uebergangen: sp.uebergangen.length, pakete: Object.keys(sp.beschriftungen) } : null,
    };
  }

  /** Lesbarer Name eines Typverweises für die Rechte-Rückfrage. */
  private typName(vw: string, paket: Paket, installierte: InstalliertesPaket[], typen: Mappentyp[]): string {
    const [p, s] = vw.includes(':') ? vw.split(':') : [paket.manifest.id, vw];
    if (p === paket.manifest.id) return paket.typen.find((t) => t.schluessel === s)?.name ?? s;
    if (p === 'dms') return DMS_TYPEN[s] ?? DMS_RECHTE_TYPEN[s] ?? s;
    const id = installierte.find((x) => x.id === p)?.typen[s];
    return `${typen.find((t) => t.id === id)?.name ?? s} (${p})`;
  }

  /** Rechte eines Pakets mit Code verlangen eine ausdrückliche Bestätigung (#338). */
  private static rechteBestaetigen(plan: Vorschau, e: { rechteBestaetigt?: boolean }) {
    if (plan.laeufer?.bestaetigen && e.rechteBestaetigt !== true) {
      throw new Fachfehler(409, t('meldungen.pakete.enthaelt-code-der-in', { name: plan.paket.name }), { rechte: rechteZeilen(plan.laeufer.rechte) });
    }
  }

  /**
   * Installieren aus einem Katalog oder hochgeladen; mit `mitAbhaengigkeiten` vorher fehlende Abhängigkeiten.
   * Nicht aus dem offiziellen Katalog nur mit ausdrücklicher Bestätigung (#189).
   */
  async installiere(e: InstallierenEingabe, von: Handelnder): Promise<InstalliertesPaket> {
    const hoch = e.upload ? await this.hochgeladen(e.upload) : null;
    const quelle = hoch ? null : await this.erlaubt(e.quelle ? String(e.quelle) : undefined);
    const geladen = hoch ? { paket: hoch.paket, v: undefined, katalog: await this.offiziell(), pruefung: hoch.pruefung } : await this.lade(String(e.id ?? ''), e.version ? String(e.version) : undefined, quelle!);
    // Herkunft (#189, #594): bestätigen, wenn keine gültige Signatur sie belegt.
    if (geladen.pruefung.bestaetigen && e.bestaetigt !== true) throw herkunftFehler(geladen.pruefung);
    const { paket, v } = geladen;
    const id = paket.manifest.id;
    const installiertJetzt = await this.d.kern.repo.listePakete();
    const alt = installiertJetzt.find((p) => p.id === id) ?? installierteErsetzt(installiertJetzt, paket.manifest) ?? null;
    const herkunft: InstalliertesPaket['herkunft'] = hoch ? { art: 'hochgeladen', von: hoch.von.email, am: hoch.am } : { art: 'katalog', url: quelle! };
    if (alt) {
      // Herausgeber (#1084) zuerst: Dieselbe Id von jemand anderem ist kein Update, gleich aus welcher Quelle.
      const fremd = this.andererHerausgeber(paket.manifest, alt, { herkunft, pruefung: geladen.pruefung });
      if (fremd) throw new Fachfehler(409, fremd, { gruende: [fremd] });
      // Ein hochgeladenes Paket aktualisiert man durch erneutes Hochladen einer höheren Version.
      if (!hoch) throw new Fachfehler(409, t('meldungen.pakete.ist-schon-installiert-aktualisieren', { name: alt.name }));
      if (alt.herkunft.art !== 'hochgeladen') throw new Fachfehler(409, t('meldungen.pakete.stammt-aus-einem-katalog', { name: alt.name }));
    }
    const vorschau = await this.plane(paket, v, geladen.katalog, e.namen ?? {}, e.sichtNamen ?? {}, { quelle: { herkunft, pruefung: geladen.pruefung } });
    const fehlen = vorschau.abhaengigkeiten.filter((a) => !a.installiert);
    if (fehlen.length && (!e.mitAbhaengigkeiten || alt)) {
      throw new Fachfehler(409, t('meldungen.pakete.es-fehlen-pakete-die', { name: paket.manifest.name, map: fehlen.map((a) => `${a.id} ${a.bereich}`).join(', ') }), { gruende: fehlen.map((a) => (a.verfuegbar ? `${a.id}: im Katalog gibt es ${a.verfuegbar}` : `${a.id}: nicht im Katalog`)) });
    }
    if (vorschau.probleme.length) throw new Fachfehler(409, vorschau.probleme[0], { gruende: vorschau.probleme });
    Paketverwaltung.rechteBestaetigen(vorschau, e);
    // Abhängigkeiten mit Code installiert das DMS nicht still mit: ihre Rechte bestätigt man an ihnen selbst (#338).
    for (const a of fehlen) {
      if (!a.verfuegbar) continue;
      const dep = await this.lade(a.id, a.verfuegbar, quelle ?? this.katalogUrl);
      if (dep.paket.code) throw new Fachfehler(409, t('meldungen.pakete.die-abhaengigkeit-enthaelt-code', { name: dep.paket.manifest.name }), { gruende: [`${a.id}: enthält Code`] });
    }
    for (const a of fehlen) {
      if (!a.verfuegbar) throw new Fachfehler(409, t('meldungen.pakete.die-abhaengigkeit-gibt-es', { id: a.id, bereich: a.bereich }));
      // Abhängigkeiten aus derselben Quelle; bei hochgeladenen Paketen aus dem offiziellen Katalog.
      // Beispiele der Abhängigkeit mit, wenn welche gewünscht sind – die eigenen Beispiele können auf sie zeigen (#347).
      await this.installiere({ id: a.id, version: a.verfuegbar, beispiele: e.beispiele === true, mitAbhaengigkeiten: true, quelle: quelle ?? this.katalogUrl, bestaetigt: e.bestaetigt }, von);
    }
    const konflikte = [...vorschau.typen, ...vorschau.sichten].filter((x) => x.konflikt);
    if (konflikte.length) throw new Fachfehler(409, t('meldungen.pakete.einige-namen-gibt-es'), { gruende: konflikte.map((x) => `${x.konflikt} Vorschlag: „${x.vorschlag}“.`), konflikte: true });
    const datensatz = await this.lege(paket, herkunft, v, vorschau, e.beispiele === true && !alt, von, alt, schluesselListe(e.automatisierungen));
    if (hoch) await this.vergissUpload(String(e.upload));
    log.info(alt ? 'Paket aktualisiert (hochgeladen)' : 'Paket installiert', { von: von.email, paket: id, version: paket.manifest.version, ...(alt ? { vorher: alt.version } : {}), herkunft: hoch ? 'hochgeladen' : quelle, pruefung: geladen.pruefung.art + (geladen.pruefung.stand ? ` (Katalog vom ${geladen.pruefung.stand})` : ''), typen: Object.keys(datensatz.typen).length, sichten: Object.keys(datensatz.sichten).length });
    return datensatz;
  }

  /**
   * Legt Typen, Sichten und ggf. Beispiele an bzw. ergänzt sie (Update) und speichert den Eintrag.
   * Bei einem Fehler wird alles zurückgenommen.
   */
  private async lege(paket: Paket, herkunft: InstalliertesPaket['herkunft'], v: KatalogVersion | undefined, plan: Vorschau, beispiele: boolean, von: Handelnder, alt: InstalliertesPaket | null, ein: string[] = []): Promise<InstalliertesPaket> {
    // Umzug (#1084): erst die Installation auf die neue Id ziehen – danach ist es ein gewöhnliches Update. Scheitert es,
    // kommt die alte Id zurück.
    const umzugVon = alt && alt.id !== paket.manifest.id ? alt.id : null;
    const auftrag: LegeAuftrag = { paket, herkunft, v, plan, beispiele, von, alt, ein };
    if (!umzugVon) return this.legeIntern(auftrag);
    await this.zieheUm(umzugVon, paket.manifest.id);
    try {
      const neu = await this.legeIntern({ ...auftrag, alt: { ...alt!, id: paket.manifest.id, ersetzt: [...new Set([...(alt!.ersetzt ?? []), umzugVon])] } });
      log.info('Paket umgezogen', { von: von.email, paket: neu.id, vorher: umzugVon });
      return neu;
    } catch (f) {
      await this.zieheUm(paket.manifest.id, umzugVon).catch((e: Error) => log.error('Umzug nicht zurückgenommen', { paket: paket.manifest.id, vorher: umzugVon, fehler: e.message }));
      throw f;
    }
  }

  /**
   * Paket-Id umziehen (#1084): Datenbank (Repo.benennePaketUm) und die Einstellungen, die die Id nennen – Einstellungen
   * und Speicher des Pakets, „Pakete verwehrt“ am Mappentyp und die Erkennung per Paket („Aus Dokument ausfüllen“).
   */
  private async zieheUm(alt: string, neu: string) {
    await this.d.kern.repo.benennePaketUm(alt, neu);
    const e = this.d.kern.einstellungen;
    if (!e) return;
    for (const vor of ['paket:', 'paketspeicher:']) {
      const w = await e.lies(`${vor}${alt}`);
      if (w === null || w === undefined) continue;
      await e.schreibe(`${vor}${neu}`, w);
      await e.schreibe(`${vor}${alt}`, null);
    }
    const verwehrt = await e.lies('paket_verwehrt');
    if (verwehrt && typeof verwehrt === 'object' && !Array.isArray(verwehrt) && JSON.stringify(verwehrt).includes(JSON.stringify(alt))) {
      await e.schreibe('paket_verwehrt', Object.fromEntries(Object.entries(verwehrt as Record<string, unknown>).map(([k, l]) => [k, Array.isArray(l) ? l.map((x) => (x === alt ? neu : x)) : l])));
    }
    const erk = await e.lies('erkennung_typen');
    if (erk && typeof erk === 'object' && !Array.isArray(erk) && JSON.stringify(erk).includes(JSON.stringify(alt))) {
      await e.schreibe('erkennung_typen', Object.fromEntries(Object.entries(erk as Record<string, { ausDokument?: { engine?: string } }>).map(([k, x]) => [k, x?.ausDokument?.engine === alt ? { ...x, ausDokument: { ...x.ausDokument, engine: neu } } : x])));
    }
  }

  private async legeIntern({ paket, herkunft, v, plan, beispiele, von, alt, ein }: LegeAuftrag): Promise<InstalliertesPaket> {
    const m = paket.manifest;
    const installierte = await this.d.kern.repo.listePakete();
    const vorher = new Map((await this.d.listeTypen()).map((t) => [t.id, t] as const));
    // Übernahme des früheren Ablageorts (#883): gleiche Id, gilt als vorhanden (die Vorschau zählt ihn genauso).
    const ueb = await this.uebernahme(paket, alt);
    const ids = new Map<string, string>(Object.entries({ ...alt?.typen, ...ueb?.typen }));
    for (const t of paket.typen) if (!ids.has(t.schluessel)) ids.set(t.schluessel, randomUUID());
    const neueTypen = paket.typen.filter((t) => !plan.typen.find((x) => x.schluessel === t.schluessel)?.vorhanden && !plan.typen.find((x) => x.schluessel === t.schluessel)?.geloescht);
    const angelegt = new Set<string>();
    const beispielIds = new Map<string, string>();
    const dmsTypen = await this.dmsTypen();
    const ziel = (vw: string, nurAngelegt: boolean): string | null => {
      const [p, s] = vw.includes(':') ? vw.split(':') : [m.id, vw];
      if (p === 'dms') {
        const eintrag = dmsTypen.get(s);
        if (!eintrag && DMS_ALIAS[s]) throw new Fachfehler(422, t('meldungen.pakete.alias-ohne-ziel', { vw, neu: DMS_ALIAS[s], version: BASIS_ABLAGEORT_AB }));
        if (!eintrag) throw new Fachfehler(422, t('meldungen.pakete.der-verweis-laesst-sich', { vw, DMS_VERWEISE_AB }));
        return eintrag.id;
      }
      if (p !== m.id) {
        const fremd = installierte.find((x) => x.id === p)?.typen[s];
        if (!fremd || !vorher.has(fremd)) throw new Fachfehler(422, t('meldungen.pakete.der-verweis-laesst-sich-2', { vw, p, s }));
        return fremd;
      }
      const id = ids.get(s);
      if (!id) throw new Fachfehler(422, t('meldungen.pakete.der-verweis-zeigt-auf', { vw }));
      return !nurAngelegt || angelegt.has(s) || vorher.has(id) ? id : null;
    };
    // Anzeigen, wenn … (#1033): „zeigt auf eine Mappe vom Typ …“ nennt im Paket einen Typverweis – hier die Id.
    const anzeige = (a: unknown) => {
      if (!istObjekt(a) || !Array.isArray(a.bedingungen)) return a;
      return { ...a, bedingungen: a.bedingungen.map((b) => (istObjekt(b) && b.art === 'verweistyp' ? { ...b, typ: ziel(str(b.typ), false) } : b)) };
    };
    const eingabe = (t: PaketTyp, nurAngelegt: boolean) => {
      const eigen = (vw: string) => !vw.includes(':') || vw.startsWith(`${m.id}:`);
      const offen = new Set(t.felder.filter((f) => f.ziel && !(eigen(f.ziel) && f.ziel.split(':').pop() === t.schluessel) && ziel(f.ziel, nurAngelegt) === null).map((f) => f.key));
      const felder = t.felder.filter((f) => !offen.has(f.key)).map(({ ziel: z, ...f }) => ({ ...f, wiederfinden: wiederfindenAus(f as PaketFeld), ...(z ? { zielTyp: ziel(z, false) } : {}), ...(f.anzeigen ? { anzeigen: anzeige(f.anzeigen) } : {}) }));
      const register = t.register.map((r) => ({ ...r, ...(r.quellen ? { quellen: r.quellen.map((q) => ({ typId: ziel(q.typ, nurAngelegt), feldKey: q.feld })).filter((q) => q.typId) } : {}),
        ...(Array.isArray(r.abschnitte) ? { abschnitte: (r.abschnitte as unknown[]).map((x) => (istObjekt(x) && x.anzeigen ? { ...x, anzeigen: anzeige(x.anzeigen) } : x)) } : {}) }));
      const unvollstaendig = offen.size > 0 || t.register.some((r) => (r.quellen ?? []).some((q) => ziel(q.typ, nurAngelegt) === null));
      const name = plan.typen.find((x) => x.schluessel === t.schluessel)!.name;
      return { unvollstaendig, daten: { id: ids.get(t.schluessel), name, schluessel: typKennung(m.id, t.schluessel), beschreibung: t.beschreibung, titelVorlage: t.titelVorlage ?? '', felder, register, ...(t.trefferliste ? { trefferliste: t.trefferliste.filter((k) => !offen.has(k)) } : {}), ...(t.beschriftungen ? { beschriftungen: t.beschriftungen } : {}), ...(t.ausPost !== undefined ? { ausPost: t.ausPost } : {}), ...(t.erkennbarAn ? { erkennbarAn: t.erkennbarAn } : {}), sichtAnlegen: false } };
    };
    // Zurückrollen: angelegte Mappen, Sichten, Typen; geänderte Typen auf den alten Stand.
    const mappen: string[] = [];
    let beispielStaende: BeispielStand[] = [];
    const neueSichten: string[] = [];
    const geaendert: Mappentyp[] = [];
    // Abschnitte aus dem Update (#890) je Typ: gehören zum Paketstand (#653), nicht zu den eigenen Änderungen.
    const abschnittRegister = new Map<string, Set<string>>();
    const kennungZurueck = new Map<string, string>();
    const zurueck = async () => {
      for (const [id, k] of kennungZurueck) await this.d.kern.repo.setzeTypKennung(id, k).catch(() => {});
      await this.d.entferneMappenEndgueltig(mappen).catch(() => {});
      for (const s of [...neueSichten].reverse()) await this.d.loescheSicht(s).catch(() => {});
      for (let runde = 0; runde < 3; runde++) for (const s of [...angelegt].reverse()) { const id = ids.get(s)!; await this.d.loescheTyp(id).then(() => angelegt.delete(s), () => {}); }
      for (const t of geaendert) await this.d.aendereTyp(t.id, t).catch(() => {});
    };
    const alteEinstellungen = await paketEinstellungen(this.d.kern, m.id);
    let einstellungenGeschrieben = false;
    // Wortlisten (#356): ersetzen die des Pakets; bei einem Fehler kommen die alten zurück.
    const alteWortlisten = alt ? await this.d.paketSynonyme(m.id) : [];
    let wortlistenGeschrieben = false;
    // Code (#403): Der alte Code kommt bei einem Fehler zurück – sonst liefe das alte Paket mit dem neuen Modul.
    const alterCode = alt?.laeufer ? await this.d.kern.repo.paketCode(m.id) : [];
    let codeGeschrieben = false;
    // Sprachpaket (#731): Die alten Texte kommen bei einem Fehler zurück.
    const alteSprache = alt?.sprache ? (await this.d.kern.repo.sprachpakete()).find((x) => x.paketId === m.id) ?? null : null;
    let spracheGeschrieben = false;
    const typMap: Record<string, string> = { ...(alt?.typen ?? {}), ...ueb?.typen };
    const sichtMap: Record<string, string> = { ...(alt?.sichten ?? {}), ...ueb?.sichten };
    try {
      // 1. Neue Typen: Ziele zuerst; Verweise auf noch fehlende Typen dieses Pakets im zweiten Durchgang.
      const rest = [...neueTypen];
      const nachtragen: PaketTyp[] = [];
      while (rest.length) {
        const i = rest.findIndex((t) => !eingabe(t, true).unvollstaendig);
        const paketTyp = rest.splice(i < 0 ? 0 : i, 1)[0];
        const x = eingabe(paketTyp, true);
        try { await this.d.legeTypAn(x.daten, m.id); } catch (f) { throw new Fachfehler((f as Fachfehler).status ?? 422, t('meldungen.pakete.mappentyp', { name: x.daten.name, meldungen: meldungen(f) })); }
        angelegt.add(paketTyp.schluessel);
        typMap[paketTyp.schluessel] = ids.get(paketTyp.schluessel)!;
        if (x.unvollstaendig) nachtragen.push(paketTyp);
      }
      for (const paketTyp of nachtragen) {
        try { await this.d.aendereTyp(ids.get(paketTyp.schluessel)!, eingabe(paketTyp, false).daten); } catch (f) { throw new Fachfehler(422, t('meldungen.pakete.mappentyp', { name: paketTyp.name, meldungen: meldungen(f) })); }
      }
      // 2. Update: vorhandene Typen um neue Felder und Register ergänzen – sonst nichts ändern.
      for (const paketTyp of paket.typen) {
        const p = plan.typen.find((x) => x.schluessel === paketTyp.schluessel)!;
        if (!p.vorhanden || (!p.neueFelder.length && !p.neueRegister.length && !p.erkennung?.length && !p.wiederfinden?.length && !p.typAngaben && !p.formate?.length && !p.beschriftungen && !p.abschnitte?.length)) continue;
        const aktuell = vorher.get(ids.get(paketTyp.schluessel)!)!;
        const neu = eingabe(paketTyp, false).daten;
        // Erkennung (#336): Markierung des Pakets an vorhandene Felder, an denen der Administrator nichts eingestellt hat.
        const markiert = new Map(erkennungNeu(paketTyp, aktuell).map((f) => [f.key, f.erkennung]));
        // Zum Wiederfinden (#938) und die Angaben am Typ (#937) genauso: nur, wo noch nichts eingestellt ist.
        const wiederfinden = new Set(wiederfindenNeu(paketTyp, aktuell).map((f) => f.key));
        // Formate und Datumsgrenzen (#535) genauso: nur an Feldern ohne eigene Einstellung.
        const vorgaben = new Map(formatNeu(paketTyp, aktuell).map((f) => [f.key, f.vorgaben]));
        // Beschriftungen (#728) genauso: ergänzt, was der Administrator noch nicht beschriftet hat.
        const besch = beschriftungenNeu(paketTyp, aktuell);
        // Ausblenden (#655): Was der Administrator ausgeblendet hat, bleibt so; was das Update neu bringt, ist sichtbar.
        const felder = [...besch.typ.felder.map((f) => ({ ...f, ...(markiert.has(f.key) ? { erkennung: markiert.get(f.key) } : {}), ...(wiederfinden.has(f.key) ? { wiederfinden: true } : {}), ...vorgaben.get(f.key) })), ...neu.felder.filter((f) => !aktuell.felder.some((g) => g.key === f.key)).map(({ ausgeblendet: _a, ...f }) => f)];
        // Abschnitte (#890) nur an Feldregistern, die noch keine haben.
        const abschnitte = new Map(abschnitteNeu(paketTyp, aktuell, (r) => [...(r.felder ?? []), ...neueFelderAuf(paketTyp, aktuell, r)]).map((r) => [r.key, r.abschnitte] as const));
        if (abschnitte.size) abschnittRegister.set(aktuell.id, new Set(abschnitte.keys()));
        const register = besch.typ.register.map((r) => {
          const dazu = neueFelderAuf(paketTyp, aktuell, r);
          const mit = dazu.length ? { ...r, felder: [...(r.felder ?? []), ...dazu] } : r;
          return abschnitte.has(r.key) ? { ...mit, abschnitte: abschnitte.get(r.key)!.map((a) => (a.anzeigen ? { ...a, anzeigen: anzeige(a.anzeigen) as Anzeigeregel } : a)) } : mit;
        });
        for (const r of neu.register) if (!register.some((g) => g.key === r.key)) { const { ausgeblendet: _a, ...ohne } = r as Register; register.push(ohne); }
        geaendert.push(aktuell);
        try { await this.d.aendereTyp(aktuell.id, { ...aktuell, ...typAngabenNeu(paketTyp, aktuell), felder, register, beschriftungen: besch.typ.beschriftungen ?? null }); } catch (f) { throw new Fachfehler(422, t('meldungen.pakete.mappentyp', { name: aktuell.name, meldungen: meldungen(f) })); }
      }
      // Übernahme (#883): Der frühere Ablageort gehört jetzt dem Paket und heißt wie dessen Typ (#1084: basis:ablageort).
      for (const [s, id] of Object.entries(ueb?.typen ?? {})) {
        const vorKennung = vorher.get(id)?.schluessel;
        if (vorKennung === typKennung(m.id, s)) continue;
        await this.d.kern.repo.setzeTypKennung(id, typKennung(m.id, s));
        if (vorKennung) kennungZurueck.set(id, vorKennung);
      }
      // 3. Neue Sichten, Elternsichten zuerst, am Ende ihrer Ebene.
      for (const s of nachEltern(paket.sichten)) {
        const sp = plan.sichten.find((x) => x.schluessel === s.schluessel)!;
        if (sp.vorhanden || sp.ausgelassen) continue;
        const alle = await this.d.listeSichten();
        const elternId = s.eltern ? sichtMap[s.eltern] ?? null : null;
        if (s.eltern && !elternId) throw new Fachfehler(422, t('meldungen.pakete.ansicht-elternsicht-fehlt', { name: s.name, eltern: s.eltern }));
        const position = Math.max(0, ...kinderVon(alle, elternId).map((x) => x.position)) + 10;
        // „*“ (#725): Ansicht über alle Mappentypen – bleibt, wie es ist.
        const jetzt = await this.d.listeTypen();
        const fremd = (s.fremdeTypen ?? []).map((f) => fremderTyp(f.kennung, jetzt, installierte)?.id).filter((x): x is string => !!x);
        const typen = [...new Set([...(s.typen ?? []).map((x) => (x === ALLE_TYPEN ? ALLE_TYPEN : ziel(x, false)!)).filter(Boolean), ...fremd])];
        if (!typen.length && (s.fremdeTypen ?? []).length) continue;
        try {
          const neu = await this.d.legeSichtAn({ name: sp.name, beschreibung: s.beschreibung ?? '', ...(s.beschriftungen ? { beschriftungen: s.beschriftungen } : {}), elternId, position, typen, bedingungen: (s.bedingungen ?? []).map(bedingungAus), ...(s.trefferliste ? { trefferliste: s.trefferliste } : {}), ...(s.symbol ? { symbol: s.symbol } : {}) });
          neueSichten.push(neu.id);
          sichtMap[s.schluessel] = neu.id;
        } catch (f) { throw new Fachfehler(422, t('meldungen.pakete.ansicht', { name: sp.name, meldungen: meldungen(f) })); }
      }
      // 4. Beispiele (nur bei der Installation, auf Wunsch).
      if (beispiele && !alt) {
        // Verweise zwischen Beispielen (#347): erst die Ziele anlegen; fremde Beispiele aus dem Eintrag der Abhängigkeit.
        const reihenfolge = ordneBeispiele(paket.beispiele.map((b) => ({ ...b, werte: eigeneVerweise(b.werte, m.id) }))) ?? paket.beispiele;
        const ohneZiel = new Set<string>();
        const aufloesen = async (w: unknown): Promise<string | undefined> => {
          if (!istBeispielVerweis(w)) return undefined;
          const [p, s] = w.beispiel.includes(':') ? w.beispiel.split(':') : [m.id, w.beispiel];
          const zielId = p === m.id ? beispielIds.get(s) : installierte.find((x) => x.id === p)?.beispiele?.[s];
          if (zielId && (p === m.id || (await this.d.gibtMappe(zielId)))) return zielId;
          ohneZiel.add(w.beispiel);
          return undefined;
        };
        for (const b of reihenfolge) {
          const typId = ziel(b.typ, false)!;
          const felder = (await this.d.listeTypen()).find((t) => t.id === typId)?.felder ?? [];
          const werte: Record<string, unknown> = {};
          for (const [k, w] of Object.entries(b.werte)) {
            const f = felder.find((x) => x.key === k);
            // Beträge dürfen im Paket als Zahl stehen; Zeiträume als P3M oder { anzahl, einheit } gleicht bereinigeWerte an (#1035).
            if (f?.typ === 'betrag' && typeof w === 'number') werte[k] = { betrag: w, waehrung: f.waehrung || 'EUR' };
            else if (Array.isArray(w) && w.some(istBeispielVerweis)) { const l = (await Promise.all(w.map(aufloesen))).filter((x): x is string => !!x); if (l.length) werte[k] = l; }
            else if (istBeispielVerweis(w)) { const z = await aufloesen(w); if (z) werte[k] = f?.mehrfach ? [z] : z; }
            else werte[k] = w;
          }
          let mappeId: string;
          try { mappeId = (await this.d.ohneEreignisse(() => this.d.legeMappeAn({ typId, werte }, von.id))).id; } catch (f) { throw new Fachfehler(422, t('meldungen.pakete.beispiel', { meldungen: meldungen(f) })); }
          mappen.push(mappeId);
          if (b.schluessel) beispielIds.set(b.schluessel, mappeId);
          // Beispiel-Dokumente (#878): wie beim Hochladen (Größe, Art, Vorschau, Volltext, Archivfassung), ohne
          // Mappen-Ereignisse (Frage 71) – Pakete, die Dateien verarbeiten, bekommen sie trotzdem.
          if (b.dokumente?.length) {
            const register = (await this.d.listeTypen()).find((t) => t.id === typId)?.register.filter((r) => r.art === 'dokumente') ?? [];
            for (const dok of b.dokumente) {
              const reg = dok.register ? register.find((r) => r.key === dok.register) : register[0];
              const inhalt = paket.beispielDateien?.get(dok.datei);
              if (!reg || !inhalt) throw new Fachfehler(422, t('meldungen.pakete.beispiel', { meldungen: t('meldungen.pakete.beispiel-dokument-ohne-register', { wert: paket.beispiele.indexOf(b) + 1, datei: dok.datei, register: dok.register ?? '–' }) }));
              const name = beispielName(dok);
              try {
                await this.d.ohneEreignisse(() => this.d.ladeHoch(mappeId, { register: reg.key, name, typ: beispielDateiart(dok.datei, inhalt) ?? undefined, herkunft: 'paket', ...(dok.datum ? { erstellt: `${dok.datum}T12:00:00.000Z` } : {}) }, inhalt, von.id));
              } catch (f) { throw new Fachfehler(422, t('meldungen.pakete.beispiel', { meldungen: `${name}: ${meldungen(f)}` })); }
            }
          }
        }
        if (ohneZiel.size) log.info('Paket: Verweise in Beispielen ohne Ziel bleiben leer', { paket: m.id, ziele: [...ohneZiel] });
        // Stand direkt nach dem Anlegen (#878): Unveränderte Beispiele lassen sich später samt Dokumenten entfernen.
        beispielStaende = await this.d.beispielStand(mappen);
      }
      // Einstellungen (#197): Vorgaben setzen bzw. überführen; nach dem Entfernen behaltene Werte zählen.
      if (paket.einstellungen) {
        const vorher = alteEinstellungen ?? { werte: {} };
        const { werte } = ueberfuehre(paket.einstellungen, alteEinstellungen ? vorher.werte : {});
        await setzePaketEinstellungen(this.d.kern, m.id, { ...vorher, werte });
        einstellungenGeschrieben = true;
      } else if (alteEinstellungen && alt) { await setzePaketEinstellungen(this.d.kern, m.id, null); einstellungenGeschrieben = true; }
      if (paket.wortlisten.length || alteWortlisten.length) { wortlistenGeschrieben = true; await this.d.setzePaketSynonyme(m.id, paket.wortlisten); }
      const jetzt = new Date().toISOString();
      // Paketstand der Mappentypen (#653): neue Typen so, wie sie angelegt wurden; beim Update bleibt der alte Stand,
      // nur was das Update hinzufügt (Felder, Register), kommt dazu – eigene Änderungen gehören nicht dazu.
      const nachher = new Map((await this.d.listeTypen()).map((t) => [t.id, t] as const));
      const typStand: Record<string, TypBild> = {};
      for (const tid of Object.values(typMap)) {
        const t = nachher.get(tid);
        if (!t) continue;
        const jetztBild = typBild(t);
        const vorBild = alt?.typStand?.[tid];
        typStand[tid] = !vorBild ? jetztBild : {
          ...vorBild,
          felder: [...vorBild.felder, ...jetztBild.felder.filter((f) => !vorBild.felder.some((g) => g.key === f.key) && !(vorher.get(tid)?.felder.some((g) => g.key === f.key)))],
          register: [...vorBild.register.map((r) => {
            if (!abschnittRegister.get(tid)?.has(r.key)) return r;
            const jetzt = jetztBild.register.find((g) => g.key === r.key);
            return jetzt?.werte.abschnitte ? { ...r, werte: { ...r.werte, abschnitte: jetzt.werte.abschnitte } } : r;
          }), ...jetztBild.register.filter((r) => !vorBild.register.some((g) => g.key === r.key) && !(vorher.get(tid)?.register.some((g) => g.key === r.key)))],
        };
      }
      const datensatz: InstalliertesPaket = {
        id: m.id, name: m.name, version: m.version, beschreibung: m.beschreibung, lizenz: m.lizenz, autor: m.autor,
        herkunft,
        // Herausgeber (#1084): einmal gespeichert, gilt er für alle weiteren Updates.
        ...(plan.paket.herausgeber ? { herausgeber: plan.paket.herausgeber } : alt?.herausgeber ? { herausgeber: alt.herausgeber } : {}),
        ...(plan.paket.herausgeberGeprueft ? { herausgeberGeprueft: true } : {}),
        // Weiterer signierter Katalog: Herausgeber an dessen Schlüssel gebunden (Sicherheit C); bei geordnetem Wechsel der neue.
        ...(plan.herausgeberSchluessel ? { herausgeberSchluessel: plan.herausgeberSchluessel } : alt?.herausgeberSchluessel ? { herausgeberSchluessel: alt.herausgeberSchluessel } : {}),
        // Ersetzte Ids (#1084): für mitgelieferte Automatisierungen und spätere Updates unter dieser Id.
        ...(() => { const f = [...new Set([...(alt?.ersetzt ?? []), ...(m.ersetzt ?? [])])].filter((x) => x !== m.id); return f.length ? { ersetzt: f } : {}; })(),
        // Nötige DMS-Version (#458): bestimmt u. a., ob das Paket „Volltext fertig“ auch ohne Text bekommt.
        ...(m.dms ? { dms: m.dms } : {}),
        installiert: alt?.installiert ?? jetzt, installiertVon: alt ? alt.installiertVon : von.email,
        aktualisiert: alt ? jetzt : null, aktualisiertVon: alt ? von.email : null,
        typen: typMap, sichten: sichtMap, abhaengigkeiten: m.abhaengigkeiten,
        // Beispiel-Mappen mit Schlüssel (#347), damit spätere Pakete auf sie verweisen können.
        ...(beispielIds.size ? { beispiele: Object.fromEntries(beispielIds) } : alt?.beispiele ? { beispiele: alt.beispiele } : {}),
        ...(beispielStaende.length ? { beispielMappen: beispielStaende } : alt?.beispielMappen?.length ? { beispielMappen: alt.beispielMappen } : {}),
        einstellungen: paket.einstellungen, code: m.code !== undefined,
        ...(paket.automatisierungen.length ? { automatisierungen: paket.automatisierungen.map((a) => a.schluessel) } : {}),
        ...(paket.code ? { laeufer: { ...paket.code.info, modul: modulInfo(paket.code), daten: paket.code.dateien.filter((d) => d.name !== 'modul.wasm').map((d) => d.name) } } : {}),
        ...(v ? { links: { readme: v.readme, changelog: v.changelog, quelle: v.quelle } } : alt?.links ? { links: alt.links } : {}),
        ...(paket.sprache ? { sprache: { ...paket.sprache.angabe, texte: anzahlTexte(paket.sprache.texte), uebergangen: paket.sprache.uebergangen.length, beschriftungen: Object.keys(paket.sprache.beschriftungen) } } : {}),
        typStand,
      };
      // Code (#338): ersetzt den bisherigen; ohne Code im neuen Paket fällt er weg.
      if (paket.code || alt?.laeufer) codeGeschrieben = true;
      if (paket.code) await this.d.kern.repo.speicherePaketCode(m.id, paket.code.dateien);
      else if (alt?.laeufer) await this.d.kern.repo.loeschePaketCode(m.id);
      // Sprachpaket (#731): Texte und Beschriftungen neben dem Eintrag; ersetzt die der alten Version.
      if (paket.sprache || alt?.sprache) spracheGeschrieben = true;
      if (paket.sprache) await this.d.kern.repo.speichereSprachpaket(m.id, { kennung: paket.sprache.angabe.kennung, texte: paket.sprache.texte, beschriftungen: paket.sprache.beschriftungen });
      else if (alt?.sprache) await this.d.kern.repo.loescheSprachpaket(m.id);
      await this.d.kern.repo.speicherePaket(datensatz);
      if (ueb) log.info('Ablageort an das Paket übergeben', { paket: m.id, typ: ueb.name, ansichten: Object.keys(ueb.sichten).length });
      // #712: mitgelieferte Automatisierungen – aus, außer denen, die beim Installieren angehakt wurden (nach dem
      // Speichern, damit Typen und Herkunft stimmen).
      await Promise.resolve(this.d.paketAutomatisierungen?.(datensatz, paket.automatisierungen, ein))
        .catch((e: Error) => log.warn('Automatisierungen des Pakets nicht angelegt', { paket: m.id, fehler: e.message }));
      if (paket.code || alt?.laeufer) await Promise.resolve(this.o.laeufer?.codeGeaendert?.()).catch(() => {});
      // Sprachpaket (#731): Sprache sofort in diesem Prozess (die anderen lesen sie binnen einer Minute), dann Beschriftungen
      // der Standardpakete – beim Sprachpaket für alle installierten Pakete, sonst die installierten Sprachen für dieses.
      if (paket.sprache || alt?.sprache) await Promise.resolve(this.o.sprachen?.geaendert()).catch((e: Error) => log.warn('Sprachpaket nicht geladen', { paket: m.id, fehler: e.message }));
      await this.sprachBeschriftungen(paket.sprache ? undefined : [m.id]).catch((e: Error) => log.warn('Beschriftungen aus Sprachpaketen nicht übernommen', { paket: m.id, fehler: e.message }));
      // Texterkennung als Paket (#459): Was ohne Paket wartete, geht jetzt an das neue Paket.
      if (hatSchnittstelle(datensatz.laeufer, 'dms:texterkennung') && !hatSchnittstelle(alt?.laeufer, 'dms:texterkennung')) {
        void this.d.texterkennungPaketDa().catch((e: Error) => log.warn('Wartende Dokumente nicht an die Texterkennung gegeben', { paket: m.id, fehler: e.message }));
      }
      // Dateien umwandeln (#577): Vorhandene Dateien der (neuen) Dateitypen gehen an das Paket.
      const neueDateitypen = (datensatz.laeufer?.umwandeln ?? []).filter((x) => !(hatSchnittstelle(alt?.laeufer, 'dms:umwandeln') && alt?.laeufer?.umwandeln?.includes(x)));
      if (hatSchnittstelle(datensatz.laeufer, 'dms:umwandeln') && neueDateitypen.length) {
        void this.d.umwandelPaketDa(neueDateitypen).catch((e: Error) => log.warn('Vorhandene Dateien nicht zum Umwandeln gemeldet', { paket: m.id, fehler: e.message }));
      }
      // Volltext aus Paketen (#614): Vorhandene Dateien der (neuen) Dateitypen ohne Text gehen an das Paket.
      const neueVolltextTypen = (datensatz.laeufer?.volltext ?? []).filter((x) => !(hatSchnittstelle(alt?.laeufer, 'dms:volltext') && alt?.laeufer?.volltext?.includes(x)));
      if (hatSchnittstelle(datensatz.laeufer, 'dms:volltext') && neueVolltextTypen.length) {
        void this.d.volltextPaketDa(neueVolltextTypen).catch((e: Error) => log.warn('Vorhandene Dateien nicht zum Volltext an das Paket gegeben', { paket: m.id, fehler: e.message }));
      }
      // Archivfassung (#631): Bestand der (neuen) Dateitypen mit fertigem Volltext geht an das Paket.
      const neueArchivTypen = (datensatz.laeufer?.archivfassung?.typen ?? []).filter((x) => !(hatSchnittstelle(alt?.laeufer, 'dms:archivfassung') && alt?.laeufer?.archivfassung?.typen.includes(x)));
      if (hatSchnittstelle(datensatz.laeufer, 'dms:archivfassung') && neueArchivTypen.length) {
        void this.d.archivPaketDa(neueArchivTypen).catch((e: Error) => log.warn('Vorhandene Dokumente nicht zur Archivfassung gemeldet', { paket: m.id, fehler: e.message }));
      }
      return datensatz;
    } catch (f) {
      await zurueck();
      if (codeGeschrieben) await (alterCode.length ? this.d.kern.repo.speicherePaketCode(m.id, alterCode) : this.d.kern.repo.loeschePaketCode(m.id)).catch((e) => log.error('Paket: alten Code nicht wiederhergestellt', { paket: m.id, fehler: (e as Error).message }));
      if (spracheGeschrieben) await (alteSprache ? this.d.kern.repo.speichereSprachpaket(m.id, alteSprache) : this.d.kern.repo.loescheSprachpaket(m.id)).catch((e) => log.error('Sprachpaket: alte Texte nicht wiederhergestellt', { paket: m.id, fehler: (e as Error).message }));
      if (einstellungenGeschrieben) await setzePaketEinstellungen(this.d.kern, m.id, alteEinstellungen).catch(() => {});
      if (wortlistenGeschrieben) await this.d.setzePaketSynonyme(m.id, alteWortlisten).catch(() => {});
      throw f;
    }
  }

  /** Neuere Versionen (auf Knopfdruck) – je Paket nur in der Quelle, aus der es stammt. */
  async updates(): Promise<Array<{ id: string; installiert: string; neu: string; changelog: string | null; quelle: string }>> {
    const erg = [];
    const quellen = await this.quellen();
    const geholt = new Map<string, Katalog | null>();
    for (const p of await this.d.kern.repo.listePakete()) {
      if (p.herkunft.art !== 'katalog') continue;
      const url = p.herkunft.url;
      if (!quellen.some((q) => q.url === url && q.aktiv)) continue;
      if (!geholt.has(url)) geholt.set(url, await this.katalog(url).then((k) => k.katalog, (e) => { if (url === this.katalogUrl) throw e; return null; }));
      // Umgezogen (#1084): Das Update kommt unter der neuen Id, die die alte unter `ersetzt` nennt.
      const k = geholt.get(url);
      const kp = k ? katalogPaketZu(k, p.id) : undefined;
      const v = kp?.versionen.find((x) => x.version === kp.aktuell) ?? kp?.versionen[0];
      if (v && vergleicheVersion(v.version, p.version) > 0) erg.push({ id: p.id, installiert: p.version, neu: v.version, changelog: v.changelog, quelle: url });
    }
    return erg;
  }

  /** Update aus der Quelle des Pakets: ergänzt nur – neue Typen, Felder, Register, Sichten. */
  async aktualisiere(id: string, e: { version?: string; bestaetigt?: boolean; rechteBestaetigt?: boolean; automatisierungen?: string[] }, von: Handelnder): Promise<InstalliertesPaket> {
    const alt = (await this.d.kern.repo.listePakete()).find((p) => p.id === id);
    if (!alt) throw new Fachfehler(404, t('meldungen.pakete.ist-nicht-installiert', { id }));
    if (alt.herkunft.art !== 'katalog') throw new Fachfehler(409, t('meldungen.pakete.ein-hochgeladenes-paket'));
    const quelle = await this.erlaubt(alt.herkunft.url);
    const { paket, v, katalog, pruefung } = await this.lade(id, e.version ? String(e.version) : undefined, quelle, true);
    if (pruefung.bestaetigen && e.bestaetigt !== true) throw herkunftFehler(pruefung);
    const plan = await this.plane(paket, v, katalog, {}, {}, { quelle: { herkunft: alt.herkunft, pruefung } });
    const fehlen = plan.abhaengigkeiten.filter((a) => !a.installiert);
    if (fehlen.length) plan.probleme.push(t('meldungen.pakete.es-fehlen-pakete', { map: fehlen.map((a) => `${a.id} ${a.bereich}`).join(', ') }));
    if (plan.probleme.length) throw new Fachfehler(409, plan.probleme[0], { gruende: plan.probleme });
    Paketverwaltung.rechteBestaetigen(plan, e);
    const neu = await this.lege(paket, alt.herkunft, v, plan, false, von, alt, schluesselListe(e.automatisierungen));
    log.info('Paket aktualisiert', { von: von.email, paket: id, ...(plan.umzug ? { neueId: neu.id } : {}), vorher: alt.version, version: neu.version, pruefung: pruefung.art, neueTypen: plan.typen.filter((t) => !t.vorhanden && !t.geloescht).length, neueSichten: plan.sichten.filter((s) => !s.vorhanden).length });
    return neu;
  }

  /* ---------- Mehrere Pakete in einem Ablauf (#405) ---------- */

  /** Installieren, Aktualisieren und Entfernen nacheinander – über alle Instanzen (PaketOptionen.sperre). */
  mitSperre<T>(f: () => Promise<T>): Promise<T> { return this.o.sperre ? this.o.sperre(f) : f(); }

  /**
   * Plan für einen gemeinsamen Ablauf (#405): alle Pakete samt Abhängigkeiten in der Reihenfolge der Installation, je
   * eine Vorschau (Namenskonflikte auch zwischen den Paketen), die Pflicht-Einstellungen, eine Herkunft und ein Prüfwert
   * aller zu bestätigenden Rechte. Es wird nichts gespeichert – die Installation rechnet den Plan neu.
   */
  async ablaufPlan(e: AblaufEingabe): Promise<AblaufPlan<Vorschau>> { return (await this.ablaufIntern(e)).plan; }

  private async ablaufIntern(e: AblaufEingabe, namen: Record<string, Record<string, string>> = {}, sichtNamen: Record<string, Record<string, string>> = {}) {
    const installierte = await this.d.kern.repo.listePakete();
    const dms = this.o.version();
    const probleme: string[] = [];
    type Teil = { schluessel: string; paket: Paket; v?: KatalogVersion; katalog?: Katalog; herkunft: InstalliertesPaket['herkunft']; gewaehlt: boolean; fuer: string[]; pruefung: HerkunftPruefung; upload?: string };
    const teile: Teil[] = [];
    const ausgelassen: AblaufAusgelassen[] = [];
    let herkunft: HerkunftPruefung | null = null;
    const uploads = Array.isArray(e.uploads) ? [...new Set(e.uploads.map(String))] : [];
    if (uploads.length) {
      // Sammeldatei (#461): die hochgeladenen Pakete; Abhängigkeiten müssen installiert oder in der Datei sein.
      if (uploads.length > SAMMEL_PAKETE_MAX) throw new Fachfehler(422, t('pakete.ablauf.fehler.zuviele', { max: SAMMEL_PAKETE_MAX }));
      const gelesen = await Promise.all(uploads.map(async (token) => { const u = await this.hochgeladen(token); return { token, u, id: u.paket.manifest.id, abhaengigkeiten: u.paket.manifest.abhaengigkeiten }; }));
      for (const g of gelesen) if (gelesen.filter((x) => x.id === g.id).length > 1) throw new Fachfehler(422, t('pakete.ablauf.fehler.doppelt', { name: g.u.paket.manifest.name }));
      const ordnung = nachAbhaengigkeiten(gelesen);
      if (!ordnung) probleme.push(t('pakete.ablauf.fehler.kreis'));
      for (const g of ordnung ?? gelesen) {
        // Ein Paket aus einem Katalog bekommt Updates nur von dort (wie beim einzelnen Hochladen).
        const da = installierte.find((x) => x.id === g.id);
        if (da && da.herkunft.art !== 'hochgeladen') probleme.push(t('pakete.ablauf.fehler.katalogupdate', { name: da.name }));
        for (const [a, bereich] of Object.entries(g.abhaengigkeiten)) {
          const mit = gelesen.find((x) => x.id === a);
          if (mit && !passt(mit.u.paket.manifest.version, bereich)) probleme.push(t('pakete.ablauf.fehler.version', { name: g.u.paket.manifest.name, abh: mit.u.paket.manifest.name, bereich, version: mit.u.paket.manifest.version }));
          else if (!mit && !installierte.some((x) => x.id === a)) probleme.push(t('pakete.ablauf.fehler.sammelfehlt', { name: g.u.paket.manifest.name, abh: a, bereich }));
        }
        const fuer = gelesen.filter((x) => x !== g && g.id in x.abhaengigkeiten).map((x) => x.id);
        teile.push({ schluessel: g.token, paket: g.u.paket, herkunft: { art: 'hochgeladen', von: g.u.von.email, am: g.u.am }, gewaehlt: true, fuer, pruefung: g.u.pruefung, upload: g.token });
      }
      herkunft = teile.find((x) => x.pruefung.bestaetigen)?.pruefung ?? teile[0]?.pruefung ?? null;
    } else {
      // „id“ oder „id@1.2.0“ (bestimmte Version, z. B. aus der Versionsauswahl in der Werkbank).
      const versionen: Record<string, string> = {};
      const ids = [...new Set((Array.isArray(e.pakete) ? e.pakete : []).map((x) => { const [id, ver] = String(x).split('@'); if (ver !== undefined) versionen[id] = ver; return id; }))];
      if (!ids.length) throw new Fachfehler(422, t('pakete.ablauf.fehler.leer'));
      if (ids.length > SAMMEL_PAKETE_MAX) throw new Fachfehler(422, t('pakete.ablauf.fehler.zuviele', { max: SAMMEL_PAKETE_MAX }));
      for (const id of ids) if (!PAKET_ID.test(id) || (versionen[id] !== undefined && !VERSION.test(versionen[id]))) throw new Fachfehler(422, t('pakete.ablauf.fehler.id', { id }));
      const { katalog, url, pruefung } = await this.aktuellerKatalog(e.quelle ? String(e.quelle) : undefined);
      herkunft = pruefung;
      // Ältere Listen (Einrichtungsdatei, gemerkte Auswahl) mit einer umgezogenen Id (#1084): das Paket, das sie ersetzt.
      for (const [i, id] of ids.entries()) {
        const neu = katalog.pakete.some((p) => p.id === id) ? null : katalogPaketZu(katalog, id)?.id;
        if (neu) { ids[i] = neu; if (versionen[id] !== undefined) { versionen[neu] = versionen[id]; delete versionen[id]; } }
      }
      // Neu installiert wird hier nur, was fehlt – Updates gehen über „Aktualisieren“.
      // Umgezogen (#1084): Unter einer früheren Id installiert zählt als schon installiert – das Update zieht es um.
      const schonDa = (id: string) => installierte.find((x) => x.id === id) ?? installierte.find((x) => katalog.pakete.find((p) => p.id === id)?.ersetzt?.includes(x.id));
      for (const id of ids) { const da = schonDa(id); if (da) probleme.push(t('pakete.ablauf.fehler.schon', { name: da.name, version: da.version })); }
      // Herausgeber (#1084): Ist die Id schon von jemand anderem installiert, sagt der Plan das ausdrücklich.
      for (const id of ids) {
        const da = installierte.find((x) => x.id === id);
        const kp = da ? katalog.pakete.find((x) => x.id === id) : undefined;
        const fremd = da && kp ? this.andererHerausgeber({ id, herausgeber: kp.herausgeber } as Manifest, da, { herkunft: { art: 'katalog', url }, pruefung }) : null;
        if (fremd) probleme.push(fremd);
      }
      const aus = auswahlMitAbhaengigkeiten(katalog, ids.filter((id) => !schonDa(id)), dms, installierte, versionen);
      probleme.push(...aus.probleme);
      // Lässt sich ein Paket nicht laden, fällt nur es weg – und was es braucht (#646); die übrigen bleiben im Plan.
      const nichtLadbar: string[] = [];
      for (const a of aus.pakete) {
        try {
          const { paket, v } = await this.lade(a.id, a.version, url);
          teile.push({ schluessel: a.id, paket, v, katalog, herkunft: { art: 'katalog', url }, gewaehlt: a.gewaehlt, fuer: a.fuer, pruefung });
        } catch (f) {
          const kp = katalog.pakete.find((x) => x.id === a.id);
          nichtLadbar.push(a.id);
          ausgelassen.push({ id: a.id, name: kp?.name ?? a.id, version: a.version, grund: (f as Error).message });
          log.warn('Ablauf: Paket lässt sich nicht laden', { paket: a.id, version: a.version, fehler: meldungen(f) });
        }
      }
      if (nichtLadbar.length) {
        const mitAbh = aus.pakete.map((a) => ({ id: a.id, abhaengigkeiten: katalog.pakete.find((x) => x.id === a.id)?.versionen.find((v) => v.version === a.version)?.abhaengigkeiten ?? {} }));
        for (const [id, an] of haengenAn(mitAbh, nichtLadbar)) {
          const i = teile.findIndex((x) => x.schluessel === id);
          if (i < 0) continue;
          const [x] = teile.splice(i, 1);
          ausgelassen.push({ id, name: x.paket.manifest.name, version: x.paket.manifest.version, grund: t('pakete.ablauf.braucht.gescheitert', { name: katalog.pakete.find((k) => k.id === an)?.name ?? an }) });
        }
      }
    }
    const geplant = { typen: new Set<string>(), sichten: new Set<string>() };
    const offizieller = await this.offiziell();
    const pakete: AblaufPlan<Vorschau>['pakete'] = [];
    for (const x of teile) {
      const id = x.paket.manifest.id;
      const vorschau = mitPruefung(await this.plane(x.paket, x.v, x.katalog ?? offizieller, namen[id] ?? {}, sichtNamen[id] ?? {}, { geplant, quelle: { herkunft: x.herkunft, pruefung: x.pruefung } }), x.pruefung);
      // Abhängigkeiten im selben Ablauf fehlen noch nicht – sie kommen vorher dran.
      vorschau.abhaengigkeiten = vorschau.abhaengigkeiten.map((a) => { const mit = teile.find((y) => y.paket.manifest.id === a.id); return mit && !a.installiert ? { ...a, verfuegbar: mit.paket.manifest.version } : a; });
      pakete.push({ schluessel: x.schluessel, id, name: x.paket.manifest.name, version: x.paket.manifest.version, gewaehlt: x.gewaehlt, fuer: x.fuer, ergaenzt: x.paket.manifest.ergaenzt ?? null, vorschau, einstellungen: await this.offenePflicht(x.paket) });
    }
    // Ein Haken für alle Rechte: gilt nur für genau die Rechte, die der Administrator gesehen hat.
    const zuBestaetigen = pakete.filter((p) => p.vorschau.laeufer?.bestaetigen).map((p) => [p.id, p.version, rechteZeilen(p.vorschau.laeufer!.rechte)]);
    const q = await this.verweisquelle(null);
    const plan: AblaufPlan<Vorschau> = {
      pakete, probleme, ...(ausgelassen.length ? { ausgelassen } : {}), herkunft, herkunftBestaetigen: teile.some((x) => x.pruefung.bestaetigen),
      rechte: { bestaetigen: zuBestaetigen.length > 0, stand: createHash('sha256').update(JSON.stringify(zuBestaetigen)).digest('hex') },
      auswahl: { typen: q.anzeige.typen, benutzer: q.anzeige.benutzer, rollen: q.anzeige.rollen, sichten: q.anzeige.sichten },
    };
    return { plan, teile };
  }

  /** Werte, mit denen ein Paket nach der Installation startet: Vorgaben, ggf. behaltene Werte (wie lege). */
  private async startwerte(paket: Paket): Promise<Record<string, unknown>> {
    if (!paket.einstellungen) return {};
    const alt = await paketEinstellungen(this.d.kern, paket.manifest.id);
    return ueberfuehre(paket.einstellungen, alt?.werte ?? {}).werte;
  }

  /** Pflichtfelder in Abschnitten, die nach den Vorgaben leer bleiben (#405); Listen beginnen leer und fehlen nie. */
  private async offenePflicht(paket: Paket): Promise<EinstellungFeld[]> {
    if (!paket.einstellungen) return [];
    const w = await this.startwerte(paket);
    return abschnittsfelder(paket.einstellungen).filter((f) => f.pflicht && (w[f.schluessel] === undefined || w[f.schluessel] === null || w[f.schluessel] === '' || (Array.isArray(w[f.schluessel]) && !(w[f.schluessel] as unknown[]).length)));
  }

  /** Auswahl für Verweise in Einstellungen; paket: für Mappentyp-Verweise ohne Präfix. */
  private async verweisquelle(paket: string | null): Promise<Verweisquelle & { anzeige: AblaufPlan<Vorschau>['auswahl'] }> {
    const typen = await this.d.listeTypen();
    const installierte = await this.d.kern.repo.listePakete();
    const dmsTypen = await this.dmsTypen();
    const anzeige = {
      typen: typen.map((x) => ({ id: x.id, name: x.name, felder: x.felder.filter((f) => f.typ !== 'passwort').map((f) => ({ key: f.key, label: f.label })) })),
      benutzer: this.o.benutzer ? await this.o.benutzer() : [],
      rollen: (await this.d.listeRollen()).map((r) => ({ id: r.id, name: r.name })),
      sichten: (await this.d.listeSichten()).map((x) => ({ id: x.id, name: x.name })),
    };
    return {
      anzeige, typen: anzeige.typen, benutzer: anzeige.benutzer.map((x) => x.id), rollen: anzeige.rollen.map((x) => x.id), sichten: anzeige.sichten.map((x) => x.id),
      typVon: (vw: string) => {
        const [p, s] = vw.includes(':') ? vw.split(':') : [paket ?? '', vw];
        if (p === 'dms') return dmsTypen.get(s)?.id ?? null;
        return installierte.find((x) => x.id === p)?.typen[s] ?? null;
      },
    };
  }

  /**
   * Gespeicherte Werte als Eingabe fürs Speichern: Geheimnisse als „behalten“ (sonst würde der verschlüsselte Wert
   * noch einmal verschlüsselt), alles andere wie gespeichert.
   */
  private static alsEingabe(b: Einstellungsbeschreibung, werte: Record<string, unknown>): Record<string, unknown> {
    const g = (f: EinstellungFeld, v: unknown) => (f.typ === 'geheim' ? (typeof v === 'string' && v ? { behalten: true } : null) : v);
    const erg: Record<string, unknown> = {};
    for (const f of abschnittsfelder(b)) erg[f.schluessel] = g(f, werte[f.schluessel]);
    for (const l of listen(b)) erg[l.schluessel] = (Array.isArray(werte[l.schluessel]) ? werte[l.schluessel] as Record<string, unknown>[] : [])
      .map((x) => Object.fromEntries([[EINTRAG_ID, x[EINTRAG_ID]], ...l.felder.map((f) => [f.schluessel, g(f, x[f.schluessel])])]));
    return erg;
  }

  /**
   * Alles aus einem Ablauf installieren (#405) – erst alles prüfen, dann Paket für Paket (Abhängigkeiten zuerst).
   * Fehlt eine Bestätigung, eine Einstellung oder passt ein Name nicht, wird nichts installiert. Scheitert ein Paket
   * beim Anlegen, ist es vollständig zurückgenommen; die übrigen werden weiter installiert, nur Pakete, die das
   * gescheiterte brauchen, fallen mit Grund weg (#646) – das Ergebnis sagt genau, was installiert ist.
   */
  async ablaufInstallieren(e: AblaufInstallation, von: Handelnder): Promise<AblaufErgebnis> {
    const karte = (x: unknown): Record<string, Record<string, string>> => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([, v]) => v && typeof v === 'object').map(([k, v]) => [k, Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([a, b]) => [a, String(b)]))])) : {});
    const namen = karte(e.namen), sichtNamen = karte(e.sichtNamen);
    const { plan, teile } = await this.ablaufIntern(e, namen, sichtNamen);
    if (plan.probleme.length) throw new Fachfehler(409, plan.probleme[0], { gruende: plan.probleme });
    const pp = plan.pakete.flatMap((p) => p.vorschau.probleme.map((x) => `${p.name}: ${x}`));
    if (pp.length) throw new Fachfehler(409, pp[0], { gruende: pp });
    if (plan.herkunftBestaetigen && e.bestaetigt !== true) throw herkunftFehler(plan.herkunft ?? { art: 'unsigniert', offiziell: false, bestaetigen: true });
    if (plan.rechte.bestaetigen && e.rechteStand !== plan.rechte.stand) {
      const rechte = plan.pakete.filter((p) => p.vorschau.laeufer?.bestaetigen).flatMap((p) => rechteZeilen(p.vorschau.laeufer!.rechte).map((z) => `${p.name}: ${z}`));
      throw new Fachfehler(409, t(e.rechteStand ? 'pakete.ablauf.fehler.rechteneu' : 'pakete.ablauf.fehler.rechte'), { rechte, rechteStand: plan.rechte.stand });
    }
    const konflikte = plan.pakete.flatMap((p) => [...p.vorschau.typen, ...p.vorschau.sichten].filter((x) => x.konflikt).map((x) => `${p.name}: ${x.konflikt} Vorschlag: „${x.vorschlag}“.`));
    if (konflikte.length) throw new Fachfehler(409, t('meldungen.pakete.einige-namen-gibt-es'), { gruende: konflikte, konflikte: true });
    // Pflicht-Einstellungen: ausgefüllt und gültig – oder bewusst später.
    const spaeter = new Set(Array.isArray(e.spaeter) ? e.spaeter.map(String) : []);
    const eingaben = e.einstellungen && typeof e.einstellungen === 'object' ? e.einstellungen as Record<string, Record<string, unknown>> : {};
    const zuSpeichern = new Map<string, Record<string, unknown>>();
    const felderFehler: Record<string, string> = {};
    const adressen: Array<{ paket: string; feld: string; wert: string }> = [];
    for (const [i, p] of plan.pakete.entries()) {
      const b = teile[i].paket.einstellungen;
      if (!b || !p.einstellungen.length || spaeter.has(p.id)) continue;
      const eingabe = eingaben[p.id] && typeof eingaben[p.id] === 'object' ? eingaben[p.id] : {};
      const werte = Paketverwaltung.alsEingabe(b, await this.startwerte(teile[i].paket));
      for (const f of p.einstellungen) werte[f.schluessel] = eingabe[f.schluessel] ?? null;
      const r = pruefeWerte(b, werte, await this.verweisquelle(p.id));
      for (const [k, v] of Object.entries(r.fehler)) felderFehler[`${p.id}.${k}`] = `${p.name}: ${v}`;
      for (const f of p.einstellungen) if (f.typ === 'geheim' && !(typeof werte[f.schluessel] === 'string' && werte[f.schluessel])) felderFehler[`${p.id}.${f.schluessel}`] = `${p.name}: Pflichtfeld.`;
      for (const f of adressfelder(b)) if (typeof r.werte[f.schluessel] === 'string' && r.werte[f.schluessel]) adressen.push({ paket: p.name, feld: f.name, wert: String(r.werte[f.schluessel]) });
      zuSpeichern.set(p.id, werte);
    }
    if (Object.keys(felderFehler).length) throw new Fachfehler(422, t('pakete.ablauf.fehler.einstellungen'), { felderFehler, gruende: Object.values(felderFehler) });
    if (adressen.length && e.adresseBestaetigt !== true) {
      throw new Fachfehler(409, t('pakete.ablauf.fehler.adresse', { adressen: adressen.map((a) => `${a.paket} → ${a.wert}`).join(', ') }), { adresse: adressen.map((a) => ({ feld: `${a.paket}: ${a.feld}`, wert: a.wert })) });
    }
    const beispiele = new Set(Array.isArray(e.beispiele) ? e.beispiele.map(String) : []);
    const ein = e.automatisierungen && typeof e.automatisierungen === 'object' && !Array.isArray(e.automatisierungen) ? e.automatisierungen as Record<string, unknown> : {};
    const erg: AblaufErgebnis = { installiert: [], fehlgeschlagen: [], fehler: null, nichtInstalliert: [...(plan.ausgelassen ?? [])] };
    const abh = plan.pakete.map((p, i) => ({ id: p.id, abhaengigkeiten: teile[i].paket.manifest.abhaengigkeiten }));
    for (const [i, p] of plan.pakete.entries()) {
      // Ein gescheitertes Paket hält nur auf, was es braucht (#646); die übrigen werden weiter installiert.
      const an = haengenAn(abh, erg.fehlgeschlagen.map((x) => x.id)).get(p.id);
      if (an) { erg.nichtInstalliert.push({ id: p.id, name: p.name, version: p.version, grund: t('pakete.ablauf.braucht.gescheitert', { name: plan.pakete.find((y) => y.id === an)?.name ?? an }) }); continue; }
      const x = teile[i];
      try {
        const jetzt = await this.d.kern.repo.listePakete();
        const alt = jetzt.find((y) => y.id === p.id) ?? installierteErsetzt(jetzt, x.paket.manifest) ?? null;
        // Frisch planen: Die Pakete davor sind jetzt installiert (Verweise, Namen).
        const vorschau = await this.plane(x.paket, x.v, x.katalog ?? await this.offiziell(), namen[p.id] ?? {}, sichtNamen[p.id] ?? {}, { quelle: { herkunft: x.herkunft, pruefung: x.pruefung } });
        if (vorschau.probleme.length) throw new Fachfehler(409, vorschau.probleme[0], { gruende: vorschau.probleme });
        const k = [...vorschau.typen, ...vorschau.sichten].filter((y) => y.konflikt);
        if (k.length) throw new Fachfehler(409, t('meldungen.pakete.einige-namen-gibt-es'), { gruende: k.map((y) => `${y.konflikt} Vorschlag: „${y.vorschlag}“.`), konflikte: true });
        const ds = await this.lege(x.paket, x.herkunft, x.v, vorschau, beispiele.has(p.id) && !alt, von, alt, schluesselListe(ein[p.id]));
        if (x.upload) await this.vergissUpload(x.upload);
        log.info(alt ? 'Paket aktualisiert (Ablauf)' : 'Paket installiert (Ablauf)', { von: von.email, paket: p.id, version: ds.version, ...(alt ? { vorher: alt.version } : {}), herkunft: x.herkunft.art === 'katalog' ? x.herkunft.url : 'hochgeladen', pruefung: x.pruefung.art, gebrauchtVon: p.fuer.join(', ') || '–' });
        let einst: AblaufErgebnis['installiert'][number]['einstellungen'] = p.einstellungen.length ? (spaeter.has(p.id) ? 'spaeter' : 'fertig') : 'keine';
        const w = zuSpeichern.get(p.id);
        if (w) {
          try { await this.speichereEinstellungen(p.id, { werte: w, adresseBestaetigt: true }, von); }
          catch (f) { einst = 'fehler'; log.warn('Einstellungen aus dem Ablauf nicht gespeichert', { paket: p.id, fehler: meldungen(f) }); }
        }
        erg.installiert.push({ id: p.id, name: ds.name, version: ds.version, einstellungen: einst });
      } catch (f) {
        erg.fehlgeschlagen.push({ id: p.id, name: p.name, meldung: (f as Error).message, gruende: ((f as Fachfehler).details as { gruende?: string[] } | undefined)?.gruende ?? [] });
        erg.fehler ??= erg.fehlgeschlagen[0];
        log.warn('Ablauf: Paket nicht installiert', { paket: p.id, fehler: meldungen(f) });
      }
    }
    log.info('Pakete in einem Ablauf', { von: von.email, installiert: erg.installiert.map((y) => `${y.id}@${y.version}`).join(', ') || '–', fehler: erg.fehlgeschlagen.map((y) => y.id).join(', ') || '–', ausgelassen: erg.nichtInstalliert.map((y) => y.id).join(', ') || '–', spaeter: [...spaeter].join(', ') || '–' });
    return erg;
  }

  /* ---------- Einstellungen (#197) ---------- */

  private async beschreibungVon(id: string) {
    const p = (await this.d.kern.repo.listePakete()).find((x) => x.id === id);
    if (!p) throw new Fachfehler(404, t('meldungen.pakete.ist-nicht-installiert', { id }));
    if (!p.einstellungen) throw new Fachfehler(404, t('meldungen.pakete.hat-keine-einstellungen', { name: p.name }));
    return { p, b: p.einstellungen };
  }

  /** Alles, was es zur Auswahl gibt: Mappentypen mit Feldern, Benutzer, Rollen, Sichten. */
  private async auswahl(p: InstalliertesPaket) {
    const typen = await this.d.listeTypen();
    const installierte = await this.d.kern.repo.listePakete();
    const dmsTypen = await this.dmsTypen();
    return {
      typen: typen.map((t) => ({ id: t.id, name: t.name, felder: t.felder.filter((f) => f.typ !== 'passwort').map((f) => ({ key: f.key, label: f.label })) })),
      benutzer: this.o.benutzer ? await this.o.benutzer() : [],
      rollen: (await this.d.listeRollen()).map((r) => ({ id: r.id, name: r.name })),
      sichten: (await this.d.listeSichten()).map((s) => ({ id: s.id, name: s.name })),
      typVon: (vw: string) => {
        const [paket, s] = vw.includes(':') ? vw.split(':') : [p.id, vw];
        if (paket === 'dms') return dmsTypen.get(s)?.id ?? null;
        return installierte.find((x) => x.id === paket)?.typen[s] ?? null;
      },
    };
  }

  /** Geheimnisse nie ausgeben – nur, ob einer gesetzt ist. */
  private maskiere(b: Einstellungsbeschreibung, werte: Record<string, unknown>): Record<string, unknown> {
    const m = (f: EinstellungFeld, v: unknown): unknown => (f.typ === 'geheim' ? { gesetzt: typeof v === 'string' && v !== '' } satisfies GeheimStand : v);
    const erg: Record<string, unknown> = {};
    for (const f of abschnittsfelder(b)) erg[f.schluessel] = m(f, werte[f.schluessel]);
    for (const l of listen(b)) erg[l.schluessel] = (Array.isArray(werte[l.schluessel]) ? werte[l.schluessel] as Record<string, unknown>[] : [])
      .map((e) => Object.fromEntries([[EINTRAG_ID, e[EINTRAG_ID]], ...l.felder.map((f) => [f.schluessel, m(f, e[f.schluessel])])]));
    return erg;
  }

  async einstellungen(id: string) {
    const { p, b } = await this.beschreibungVon(id);
    const gespeichert = (await paketEinstellungen(this.d.kern, id)) ?? { werte: {} };
    const q = await this.auswahl(p);
    return {
      beschreibung: b, werte: this.maskiere(b, gespeichert.werte), fehlend: fehlendePflicht(b, gespeichert.werte),
      status: gespeichert.status ?? null, laeufer: !!this.o.laeufer,
      auswahl: { typen: q.typen, benutzer: q.benutzer, rollen: q.rollen, sichten: q.sichten },
    };
  }

  /** Speichern: prüfen (Typ, Pflicht, Auswahl, Verweise), Geheimnisse verschlüsseln, Protokoll ohne Werte von Geheimnissen. */
  async speichereEinstellungen(id: string, eingabe: unknown, von: Handelnder) {
    const { p, b } = await this.beschreibungVon(id);
    const alt = (await paketEinstellungen(this.d.kern, id)) ?? { werte: {} };
    const q = await this.auswahl(p);
    const r = pruefeWerte(b, (eingabe as { werte?: unknown } | null)?.werte ?? eingabe, { ...q, benutzer: q.benutzer.map((x) => x.id), rollen: q.rollen.map((x) => x.id), sichten: q.sichten.map((x) => x.id) });
    // Geheimnisse: neu → verschlüsseln, behalten → alter Wert (bei Listen über die Id des Eintrags), null → weg.
    const geheim = (f: EinstellungFeld, v: unknown, altWert: unknown, pfad: string) => {
      if (f.typ !== 'geheim') return v;
      const w = v && typeof v === 'object' ? (typeof altWert === 'string' && altWert ? altWert : null) : typeof v === 'string' ? this.d.verschluesselePaketGeheimnis(v) : null;
      if (f.pflicht && !w) r.fehler[pfad] = 'Pflichtfeld.';
      return w;
    };
    for (const f of abschnittsfelder(b)) r.werte[f.schluessel] = geheim(f, r.werte[f.schluessel], alt.werte[f.schluessel], f.schluessel);
    for (const l of listen(b)) {
      const alte = Array.isArray(alt.werte[l.schluessel]) ? alt.werte[l.schluessel] as Record<string, unknown>[] : [];
      (r.werte[l.schluessel] as Record<string, unknown>[]).forEach((e, i) => {
        const vorher = alte.find((x) => x[EINTRAG_ID] === e[EINTRAG_ID]);
        for (const f of l.felder) e[f.schluessel] = geheim(f, e[f.schluessel], vorher?.[f.schluessel], `${l.schluessel}.${i + 1}.${f.schluessel}`);
      });
    }
    if (Object.keys(r.fehler).length) throw new Fachfehler(422, t('meldungen.pakete.bitte-die-markierten-einstellungen'), { felderFehler: r.fehler, gruende: Object.values(r.fehler) });
    const geaendert = Object.keys(r.werte).filter((k) => JSON.stringify(r.werte[k]) !== JSON.stringify(alt.werte[k]));
    // Dienst-Adresse (#444): Eine neue oder geänderte Adresse gilt erst, wenn der Administrator den Hinweis bestätigt –
    // dorthin schickt das Paket Daten. Gespeichert wird nur eine bestätigte Adresse; nur zu ihr lässt der Läufer Netz zu.
    const adressen = adressfelder(b).filter((f) => geaendert.includes(f.schluessel) && r.werte[f.schluessel]);
    if (adressen.length && (eingabe as { adresseBestaetigt?: unknown } | null)?.adresseBestaetigt !== true) {
      throw new Fachfehler(409, t('meldungen.pakete.bitte-die-adresse-bestaetigen', { name: p.name, map: adressen.map((f) => String(r.werte[f.schluessel])).join(', ') }), { adresse: adressen.map((f) => ({ feld: f.name, wert: r.werte[f.schluessel] })) });
    }
    await setzePaketEinstellungen(this.d.kern, id, { ...alt, werte: r.werte });
    if (geaendert.length) {
      log.info(`Einstellungen von Paket ${p.name} geändert (Felder ${geaendert.join(', ')})`, { von: von.email, paket: id, felder: geaendert });
      for (const f of adressfelder(b).filter((x) => geaendert.includes(x.schluessel))) {
        log.info(`Dienst-Adresse von Paket ${p.name} ${r.werte[f.schluessel] ? 'bestätigt' : 'entfernt'}`, { von: von.email, paket: id, feld: f.schluessel, adresse: r.werte[f.schluessel] ?? null });
      }
      // Der Läufer bekommt die erlaubten Adressen neu (Netz nur zur bestätigten Adresse).
      if (adressfelder(b).some((x) => geaendert.includes(x.schluessel))) await this.o.laeufer?.codeGeaendert?.();
      try { this.o.laeufer?.ereignis?.(id, 'paket.einstellungen_geaendert', geaendert); } catch { /* das Paket entscheidet selbst */ }
      // Archivfassung (#660): eine Art nachträglich angekreuzt – die passenden Dokumente werden nachgeholt.
      const auswahl = Object.values(p.laeufer?.archivfassung?.auswahl ?? {});
      if (auswahl.some((k) => geaendert.includes(k) && r.werte[k] === true)) void this.d.archivPaketDa(p.laeufer!.archivfassung!.typen).catch(() => 0);
    }
    return this.einstellungen(id);
  }

  /** Einstellungen im Klartext – nur für das eigene Paket über den Paket-Läufer, nie über die API. */
  async einstellungenFuerPaket(id: string): Promise<Record<string, unknown>> {
    const { b } = await this.beschreibungVon(id);
    const w = structuredClone((await paketEinstellungen(this.d.kern, id))?.werte ?? {});
    const klar = (f: EinstellungFeld, v: unknown) => (f.typ === 'geheim' && typeof v === 'string' ? this.d.entschluessele(v) : v);
    for (const f of abschnittsfelder(b)) w[f.schluessel] = klar(f, w[f.schluessel]);
    for (const l of listen(b)) for (const e of (Array.isArray(w[l.schluessel]) ? w[l.schluessel] as Record<string, unknown>[] : [])) for (const f of l.felder) e[f.schluessel] = klar(f, e[f.schluessel]);
    return w;
  }

  /** Statusbereich: schreibt nur das Paket (über den Läufer); in der Oberfläche schreibgeschützt. */
  async setzeStatus(id: string, status: { letzterLauf: string | null; meldungen: string[] }) {
    const alt = (await paketEinstellungen(this.d.kern, id)) ?? { werte: {} };
    await setzePaketEinstellungen(this.d.kern, id, { ...alt, status: { letzterLauf: status.letzterLauf, meldungen: status.meldungen.slice(-20).map((m) => String(m).slice(0, 500)) } });
  }

  /** Aktion aus dem Manifest ausführen; die Antwort des Pakets als Text, mit Zeitgrenze. */
  async aktion(id: string, schluessel: string, von: Handelnder): Promise<{ ok: boolean; text: string }> {
    const { p, b } = await this.beschreibungVon(id);
    const a = b.aktionen.find((x) => x.schluessel === schluessel);
    if (!a) throw new Fachfehler(404, t('meldungen.pakete.diese-aktion-gibt-es'));
    const fehlend = fehlendePflicht(b, (await paketEinstellungen(this.d.kern, id))?.werte ?? {});
    if (fehlend.length) return { ok: false, text: t('meldungen.pakete.einstellungen-noetig', { fehlend: fehlend.join(', ') }) };
    if (!this.o.laeufer) return { ok: false, text: t('meldungen.pakete.pakete-mit-code-laufen') };
    log.info(`Aktion „${a.name}“ von Paket ${p.name}`, { von: von.email, paket: id, aktion: schluessel });
    let uhr: ReturnType<typeof setTimeout> | undefined;
    try {
      const text = await Promise.race([
        this.o.laeufer.aktion(id, schluessel, await this.einstellungenFuerPaket(id)),
        new Promise<never>((_, nein) => { uhr = setTimeout(() => nein(new Error(`Keine Antwort nach ${AKTION_MS / 1000} Sekunden.`)), AKTION_MS); }),
      ]);
      return { ok: true, text: String(text).slice(0, 2000) };
    } catch (e) { return { ok: false, text: (e as Error).message }; }
    finally { clearTimeout(uhr); }
  }

  /**
   * Beschriftungen aus Sprachpaketen (#731) an die Mappentypen und Ansichten installierter Pakete: je Sprache, Teil und
   * Option nur, was noch fehlt – was der Administrator oder das Paket selbst beschriftet hat, bleibt. `nur`: nur diese
   * Pakete (z. B. das gerade installierte); ohne: alle. Liefert die Zahl ergänzter Texte.
   */
  async sprachBeschriftungen(nur?: string[]): Promise<number> {
    const sprachen = (await this.d.kern.repo.sprachpakete()).filter((s) => Object.keys(s.beschriftungen).length);
    if (!sprachen.length) return 0;
    const pakete = (await this.d.kern.repo.listePakete()).filter((p) => !nur || nur.includes(p.id));
    let anzahl = 0;
    for (const s of sprachen) {
      for (const p of pakete) {
        const b = s.beschriftungen[p.id];
        if (!b) continue;
        const typen = await this.d.listeTypen();
        for (const [schluessel, x] of Object.entries(b.mappentypen ?? {})) {
          const typ = typen.find((y) => y.id === p.typen[schluessel]);
          if (!typ) continue;
          // Als Paket-Typ in dieser einen Sprache – dieselbe Regel wie beim Update eines Pakets (#728).
          const pt: PaketTyp = {
            schluessel, name: typ.name, beschreibung: '', felder: Object.entries(x.felder ?? {}).map(([key, f]) => ({ key, label: '', typ: 'text', beschriftungen: { [s.kennung]: f } })),
            register: Object.entries(x.register ?? {}).map(([key, r]) => ({ key, name: '', art: 'felder', beschriftungen: { [s.kennung]: r } })),
            beschriftungen: { [s.kennung]: { ...(x.name ? { name: x.name } : {}), ...(x.beschreibung ? { beschreibung: x.beschreibung } : {}) } },
          };
          const neu = beschriftungenNeu(pt, typ);
          if (!neu.anzahl) continue;
          await this.d.aendereTyp(typ.id, { ...typ, felder: neu.typ.felder, register: neu.typ.register, beschriftungen: neu.typ.beschriftungen ?? null });
          anzahl += neu.anzahl;
        }
        const sichten = await this.d.listeSichten();
        for (const [schluessel, x] of Object.entries(b.sichten ?? {})) {
          const sicht = sichten.find((y) => y.id === p.sichten[schluessel]);
          if (!sicht) continue;
          const vorher = JSON.stringify(sicht.beschriftungen ?? {});
          const erg = ergaenzeBeschriftungen(sicht.beschriftungen ?? undefined, { [s.kennung]: x });
          if (JSON.stringify(erg ?? {}) === vorher) continue;
          await this.d.aendereSicht(sicht.id, { ...sicht, beschriftungen: erg });
          anzahl++;
        }
      }
    }
    if (anzahl) log.info('Beschriftungen aus Sprachpaketen übernommen', { anzahl, pakete: nur?.join(', ') ?? 'alle' });
    return anzahl;
  }

  /**
   * Entfernen: nur ohne Mappen der Typen des Pakets und wenn kein anderes Paket davon abhängt. Ein Sprachpaket (#731)
   * nutzt vielleicht jemand: dann nur mit `spracheBestaetigt` – die Betroffenen sehen danach die Sprache der
   * Installation (Deutsch, wenn es deren Sprache war), ihre Wahl bleibt gespeichert und Mein Konto sagt es ihnen.
   */
  /**
   * „Beispiele entfernen“ (#878): unveränderte Beispiel-Mappen des Pakets samt Dokumenten endgültig weg; geänderte (oder
   * solche, auf die andere Mappen verweisen) bleiben als normale Mappen und werden genannt. Danach merkt sich das Paket
   * keine Beispiele mehr.
   */
  async beispieleEntfernen(id: string, von: Handelnder): Promise<{ entfernt: number; behalten: Array<{ id: string; titel: string; grund: 'geaendert' | 'verwiesen' }> }> {
    const p = (await this.d.kern.repo.listePakete()).find((x) => x.id === id);
    if (!p) throw new Fachfehler(404, t('meldungen.pakete.ist-nicht-installiert', { id }));
    const b = await this.d.pruefeBeispiele(p.beispielMappen ?? []);
    if (b.unveraendert.length) await this.d.entferneBeispielMappen(b.unveraendert, von.id);
    const weg = new Set(b.unveraendert);
    const { beispielMappen: _bm, beispiele: alteSchluessel, ...rest } = p;
    const schluessel = Object.fromEntries(Object.entries(alteSchluessel ?? {}).filter(([, mid]) => !weg.has(mid)));
    await this.d.kern.repo.speicherePaket({ ...rest, ...(Object.keys(schluessel).length ? { beispiele: schluessel } : {}) });
    log.info('Beispiele eines Pakets entfernt', { von: von.email, paket: id, entfernt: b.unveraendert.length, behalten: b.geaendert.length });
    return { entfernt: b.unveraendert.length, behalten: b.geaendert.map(({ typId: _t, ...g }) => g) };
  }

  /**
   * Paket entfernen. Unveränderte Beispiel-Mappen (#878) gehen samt Dokumenten mit; geänderte bleiben – in eigenen
   * Mappentypen verhindern sie das Entfernen und stehen in den Gründen, in fremden bleiben sie und stehen im Ergebnis.
   */
  async entferne(id: string, von: Handelnder, behalten = false, spracheBestaetigt = false): Promise<{ beispieleBehalten: Array<{ id: string; titel: string; grund: 'geaendert' | 'verwiesen' }> }> {
    const alle = await this.d.kern.repo.listePakete();
    const p = alle.find((x) => x.id === id);
    if (!p) throw new Fachfehler(404, t('meldungen.pakete.ist-nicht-installiert', { id }));
    if (p.sprache && !spracheBestaetigt) {
      const n = await this.o.sprachen?.nutzung(p.sprache.kennung) ?? { personen: 0, standard: false };
      if (n.personen || n.standard) {
        const gruende = [
          ...(n.personen ? [t('meldungen.sprachpakete.entfernen.personen', { anzahl: n.personen })] : []),
          ...(n.standard ? [t('meldungen.sprachpakete.entfernen.standard')] : []),
        ];
        throw new Fachfehler(409, t('meldungen.sprachpakete.entfernen.frage', { name: p.name }), { gruende, sprache: { kennung: p.sprache.kennung, ...n } });
      }
    }
    const gruende: string[] = alle.filter((x) => x.id !== id && id in x.abhaengigkeiten).map((x) => t('meldungen.pakete.das-paket-braucht', { name: x.name, name2: p.name }));
    const typIds = Object.values(p.typen);
    // Beispiel-Mappen (#878): unveränderte gehen mit, geänderte in eigenen Mappentypen werden als Grund genannt.
    const bsp = await this.d.pruefeBeispiele(p.beispielMappen ?? []);
    const eigeneTypen = new Set(typIds);
    gruende.push(...bsp.geaendert.filter((g) => eigeneTypen.has(g.typId)).map((g) => (g.grund === 'verwiesen' ? t('meldungen.pakete.beispiel-behalten.verwiesen', { titel: g.titel }) : t('meldungen.pakete.beispiel-behalten.geaendert', { titel: g.titel }))));
    gruende.push(...await this.d.belegteTypen(typIds, bsp.unveraendert));
    if (gruende.length) throw new Fachfehler(409, t('meldungen.pakete.laesst-sich-noch-nicht', { name: p.name }), { gruende });
    if (bsp.unveraendert.length) await this.d.entferneBeispielMappen(bsp.unveraendert, von.id);
    // Untersichten zuerst, dann die Typen (Verweise untereinander: mehrere Runden).
    const sichten: Sicht[] = await this.d.listeSichten();
    const tiefe = (sid: string): number => { const s = sichten.find((x) => x.id === sid); return s?.elternId ? 1 + tiefe(s.elternId) : 0; };
    for (const sid of Object.values(p.sichten).filter((x) => sichten.some((s) => s.id === x)).sort((a, b) => tiefe(b) - tiefe(a))) await this.d.loescheSicht(sid);
    let offen = [...typIds];
    for (let runde = 0; offen.length; runde++) {
      const typen = await this.d.listeTypen();
      offen = offen.filter((t) => typen.some((x) => x.id === t));
      const fehler: string[] = [];
      const vorher = offen.length;
      for (const t of offen) await this.d.loescheTyp(t).catch((x: Error) => fehler.push(meldungen(x)));
      const rest = new Set((await this.d.listeTypen()).map((x) => x.id));
      offen = offen.filter((t) => rest.has(t));
      if (!offen.length) break;
      if (runde > 0 && offen.length === vorher) throw new Fachfehler(409, t('meldungen.pakete.laesst-sich-nicht-ganz', { name: p.name }), { gruende: fehler });
      // Kein Fortschritt: Typen des Pakets verweisen im Kreis aufeinander – diese Verweise zuerst lösen.
      if (offen.length === vorher) {
        const bleibt = new Set(offen);
        for (const t of typen.filter((x) => bleibt.has(x.id))) {
          const felder = t.felder.filter((f) => !(f.typ === 'referenz' && f.zielTyp && bleibt.has(f.zielTyp) && f.zielTyp !== t.id));
          if (felder.length === t.felder.length) continue;
          const register = t.register.map((r) => (r.quellen ? { ...r, quellen: r.quellen.filter((q) => !bleibt.has(q.typId) || q.typId === t.id) } : r));
          await this.d.aendereTyp(t.id, { ...t, felder, register });
        }
      }
    }
    await this.d.kern.repo.loeschePaket(id);
    await this.d.setzePaketSynonyme(id, []);
    // Sprachpaket (#731): Texte weg, Sprache aus der Einstellung, alle Prozesse laden neu. Beschriftungen an Mappentypen
    // bleiben – wie andere Beschriftungen einer nicht erlaubten Sprache stören sie nicht und gelten bei einer Neuinstallation.
    if (p.sprache) {
      await this.d.kern.repo.loescheSprachpaket(id);
      await Promise.resolve(this.o.sprachen?.entfernt(p.sprache.kennung)).catch((e: Error) => log.warn('Sprache nicht aus der Einstellung genommen', { paket: id, fehler: e.message }));
    }
    // #712: mitgelieferte Automatisierungen, die aus und unverändert sind, gehen mit; geänderte bleiben (rot, wenn ihr Typ fehlt).
    await this.d.paketAutomatisierungen?.(p, []).catch((e: Error) => log.warn('Automatisierungen des Pakets nicht entfernt', { paket: id, fehler: e.message }));
    if (p.laeufer) { await this.d.kern.repo.loeschePaketCode(id); await this.d.kern.repo.loescheEreignisse(id); await setzePaketSpeicher(this.d.kern, id, null).catch(() => {}); await this.o.laeufer?.codeGeaendert?.(); }
    // Volltext und Umwandeln (Frage 51): Was noch auf dieses Paket wartete, wartet nicht mehr.
    const wartetAuf = [...(hatSchnittstelle(p.laeufer, 'dms:volltext') ? p.laeufer?.volltext ?? [] : []), ...(hatSchnittstelle(p.laeufer, 'dms:umwandeln') ? p.laeufer?.umwandeln ?? [] : [])];
    if (wartetAuf.length) await this.d.paketWegFuerDateien(p, wartetAuf).catch((e: Error) => log.warn('Wartende Dokumente nach dem Entfernen nicht zurückgesetzt', { paket: id, fehler: e.message }));
    // Einstellungen (#197): nur auf ausdrücklichen Wunsch für eine spätere Neuinstallation behalten.
    if (!behalten) await setzePaketEinstellungen(this.d.kern, id, null);
    log.info('Paket entfernt', { von: von.email, paket: id, version: p.version, einstellungenBehalten: behalten, beispieleEntfernt: bsp.unveraendert.length });
    return { beispieleBehalten: bsp.geaendert.filter((g) => !eigeneTypen.has(g.typId)).map(({ typId: _t, ...g }) => g) };
  }
}
