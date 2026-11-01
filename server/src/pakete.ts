/**
 * Paketverwaltung, Stufe 1 (#188): Konfigurationspakete aus dem offiziellen Katalog ansehen,
 * installieren, aktualisieren und entfernen. Paketformat: motom001/dms-registry.
 *
 * - Angelegt wird über dieselben Funktionen wie in der Werkbank (mit allen Prüfregeln).
 * - Schlüssel bekommen das Paket-Präfix (<paket>_<schluessel>), Verweise <paket>:<schluessel> werden aufgelöst.
 * - dms:<kennung> verweist auf einen Mappentyp, den das DMS selbst mitbringt (#310), z. B. dms:ablageort.
 * - Scheitert etwas, wird zurückgerollt: Es bleibt nichts halb angelegt.
 * - Ein Update ergänzt nur (neue Typen, Felder, Register, Sichten); es löscht und überschreibt nichts.
 */
import { liesFeldErkennung, type FeldErkennung } from '../../shared/src/erkennung';
import { createHash, randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { parse as yamlLesen } from 'yaml';
import type { Feld, Mappentyp, Register } from '../../shared/src/model';
import { BEREICH, CODE_MAX, DMS_RECHTE_TYPEN, gleicheRechte, liesCode, rechtePunkte, rechteZeilen, type PaketCode, type RechtePunkt, dmsPasst, liesKatalog, nachAbhaengigkeiten, neuestePassende, OFFIZIELLER_KATALOG, PAKET_ID, passt, vergleicheVersion, VERSION, type InstalliertesPaket, type Katalog, type KatalogPaket, type KatalogVersion } from '../../shared/src/pakete';
import { kinderVon, OPERATOREN, type Bedingung, type Operator, type Sicht } from '../../shared/src/sichten';
import { EINTRAG_ID, einstellungsAenderung, fehlendePflicht, liesBeschreibung, listen, pruefeWerte, ueberfuehre, abschnittsfelder, type EinstellungFeld, type Einstellungsbeschreibung, type GeheimStand } from '../../shared/src/paketeinstellungen';
import type { Dienst } from './dienst';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { crc32 } from './zip';

const log = protokoll.modul('werkbank');

/* ---------- ZIP lesen ---------- */

export const ARCHIV_MAX = 10 * 1024 * 1024;
/** Entpackt höchstens – ohne code/; dafür gilt CODE_MAX (#403, geprüft in liesCode). */
const ENTPACKT_MAX = 20 * 1024 * 1024;
const DATEIEN_MAX = 500;

/** Obergrenzen beim Entpacken; budget wird über mehrere Archive geteilt (Sammeldatei, #461). */
export interface ZipGrenzen { dateien: number; entpackt: number; budget?: { rest: number } }
const PAKET_GRENZEN: ZipGrenzen = { dateien: DATEIEN_MAX, entpackt: ENTPACKT_MAX };

/** Einträge des Inhaltsverzeichnisses (Central Directory), ohne etwas zu entpacken. */
function zipEintraege(buf: Buffer, max: number) {
  const kaputt = () => new Fachfehler(422, 'Das Archiv ist kein gültiges ZIP.');
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw kaputt();
  const anzahl = buf.readUInt16LE(e + 10);
  if (anzahl > max) throw new Fachfehler(422, `Das Archiv enthält mehr als ${max} Dateien.`);
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

/** Liest ein ZIP-Archiv (gespeichert oder Deflate) mit Obergrenzen gegen ZIP-Bomben. */
export function liesZip(buf: Buffer, grenzen: ZipGrenzen = PAKET_GRENZEN): Map<string, Buffer> {
  const kaputt = () => new Fachfehler(422, 'Das Archiv ist kein gültiges ZIP.');
  const dateien = new Map<string, Buffer>();
  let gesamt = 0, code = 0;
  for (const { name, flags, methode, crc, csize, usize, lokal } of zipEintraege(buf, grenzen.dateien)) {
    if (name.endsWith('/')) continue;
    if (flags & 1) throw new Fachfehler(422, 'Verschlüsselte Archive gehen nicht.');
    if (name.startsWith('/') || name.split('/').includes('..')) throw new Fachfehler(422, `Ungültiger Dateiname im Archiv: ${name}`);
    if (dateien.has(name)) throw new Fachfehler(422, `Die Datei ${name} steht zweimal im Archiv.`);
    if (name.startsWith('code/')) code += usize; else gesamt += usize;
    if (gesamt > grenzen.entpackt) throw new Fachfehler(422, 'Das Archiv ist entpackt zu groß.');
    // Grobe Obergrenze gegen ZIP-Bomben; die genaue Meldung zu code/ kommt aus liesCode.
    if (code > 2 * CODE_MAX) throw new Fachfehler(422, `Die Dateien unter code/ sind zu groß (höchstens ${CODE_MAX / 1048576} MB je Paket).`);
    if (grenzen.budget && (grenzen.budget.rest -= usize) < 0) throw new Fachfehler(422, 'Die Pakete der Sammeldatei sind entpackt zusammen zu groß.');
    if (lokal + 30 > buf.length || buf.readUInt32LE(lokal) !== 0x04034b50) throw kaputt();
    const start = lokal + 30 + buf.readUInt16LE(lokal + 26) + buf.readUInt16LE(lokal + 28);
    const roh = buf.subarray(start, start + csize);
    let daten: Buffer;
    try {
      daten = methode === 0 ? Buffer.from(roh) : methode === 8 ? inflateRawSync(roh, { maxOutputLength: Math.max(1, usize) }) : (() => { throw new Fachfehler(422, `Kompression ${methode} wird nicht unterstützt.`); })();
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
}
export interface PaketFeld extends Partial<Feld> { key: string; label: string; typ: Feld['typ']; ziel?: string }
export interface PaketRegister { key: string; name: string; art: Register['art']; felder?: string[]; quellen?: Array<{ typ: string; feld: string }>; volltext?: boolean }
export interface PaketTyp { schluessel: string; name: string; beschreibung: string; titelVorlage?: string; felder: PaketFeld[]; register: PaketRegister[]; trefferliste?: string[] }
export interface PaketSicht { schluessel: string; name: string; beschreibung?: string; eltern?: string; typen?: string[]; bedingungen?: Array<{ feld: string; operator: string; wert?: unknown }>; trefferliste?: string }
/** Beispiel-Mappe (#347): optional mit Schlüssel; Verweisfelder dürfen { beispiel: schluessel } bzw. { beispiel: paket:schluessel } sein. */
export interface PaketBeispiel { typ: string; werte: Record<string, unknown>; schluessel?: string }

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
export interface Paket { manifest: Manifest; typen: PaketTyp[]; sichten: PaketSicht[]; beispiele: PaketBeispiel[]; readme: string; einstellungen: Einstellungsbeschreibung | null; code: PaketCodeTeil | null }
/** WebAssembly-Magie und Version 1. */
const WASM_KOPF = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const CODE_DATEI = /^code\/(modul\.wasm|daten\/[A-Za-z0-9._-]{1,80})$/;

const SCHLUESSEL = /^[a-z][a-z0-9_]{0,39}$/;
const TYPVERWEIS = /^([a-z][a-z0-9_]{1,19}:)?[a-z][a-z0-9_]{0,39}$/;

/**
 * Mappentypen des DMS, auf die Pakete mit `dms:<kennung>` verweisen dürfen (#310): nur, was jede
 * Installation hat und was sich nicht löschen lässt. Post nicht – Post zeigt über „Zugeordnet zu“
 * selbst auf jede Mappe, ein Paket braucht keinen eigenen Verweis darauf.
 */
export const DMS_TYPEN: Record<string, string> = { ablageort: 'Ablageort', benutzer: 'Benutzer', rolle: 'Rolle' };
/** Ab dieser Version versteht das DMS Verweise `dms:…`; Pakete damit sollten `dms: ">=0.75.0"` angeben. */
export const DMS_VERWEISE_AB = '0.75.0';
const DMS_PRAEFIX = 'dms:';
const istDmsVerweis = (vw: string) => vw.startsWith(DMS_PRAEFIX);
/** Alle Typverweise eines Pakets: Felder, Quellen der Verknüpfungsregister, Typen der Ansichten. */
const typverweise = (typen: PaketTyp[], sichten: PaketSicht[]) => [
  ...typen.flatMap((t) => [...t.felder.flatMap((f) => (f.ziel ? [f.ziel] : [])), ...t.register.flatMap((r) => (r.quellen ?? []).map((q) => q.typ))]),
  ...sichten.flatMap((s) => s.typen ?? []),
];
const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

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
    if (!d) { fehler.push(`${name} fehlt im Paket.`); return undefined; }
    try { return yamlLesen(d.toString('utf8'), { maxAliasCount: 50 }); } catch (e) { fehler.push(`${name}: kein gültiges YAML (${(e as Error).message.split('\n')[0]}).`); return undefined; }
  };
  const m = yaml('manifest.yaml');
  if (!istObjekt(m)) throw new Fachfehler(422, 'Das Paket ist ungültig.', { gruende: fehler.length ? fehler : ['manifest.yaml ist leer.'] });
  if (m.schema !== 1) fehler.push(`manifest.yaml: Format ${str(m.schema) || '–'} kennt dieses DMS nicht.`);
  if (!PAKET_ID.test(str(m.id))) fehler.push('manifest.yaml: ungültige Id.');
  if (str(m.id) === 'dms') fehler.push('manifest.yaml: Die Id „dms“ ist für Verweise auf Mappentypen des DMS reserviert.');
  if (!VERSION.test(str(m.version))) fehler.push('manifest.yaml: ungültige Version (z. B. 1.0.0).');
  if (!str(m.name).trim()) fehler.push('manifest.yaml: Name fehlt.');
  if (!BEREICH.test(str(m.dms))) fehler.push('manifest.yaml: ungültige DMS-Version (z. B. >=0.63.0).');
  const abh = istObjekt(m.abhaengigkeiten) ? m.abhaengigkeiten : {};
  for (const [k, v] of Object.entries(abh)) if (!PAKET_ID.test(k) || !BEREICH.test(str(v))) fehler.push(`manifest.yaml: Abhängigkeit „${k}: ${str(v)}“ ist ungültig.`);
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
    }
    if (!register.length) fehler.push(`${wo}: mindestens ein Register nötig.`);
    return { schluessel: str(t.schluessel), name: str(t.name).trim(), beschreibung: str(t.beschreibung), titelVorlage: t.titelVorlage ? str(t.titelVorlage) : undefined, felder, register, trefferliste: Array.isArray(t.trefferliste) ? t.trefferliste.map(str) : undefined };
  });
  const sichten = liste('sichten').map((s, i): PaketSicht => {
    if (!SCHLUESSEL.test(str(s.schluessel))) fehler.push(`sichten[${i + 1}]: ungültige Kennung.`);
    if (!str(s.name).trim()) fehler.push(`sichten[${i + 1}]: Name fehlt.`);
    return {
      schluessel: str(s.schluessel), name: str(s.name).trim(), beschreibung: s.beschreibung ? str(s.beschreibung) : undefined, eltern: s.eltern ? str(s.eltern) : undefined,
      typen: Array.isArray(s.typen) ? s.typen.map(str) : [], trefferliste: s.trefferliste ? str(s.trefferliste) : undefined,
      bedingungen: Array.isArray(s.bedingungen) ? s.bedingungen.filter(istObjekt).map((b) => ({ feld: str(b.feld), operator: str(b.operator), wert: b.wert })) : [],
    };
  });
  const beispiele = liste('beispiele').map((b, i): PaketBeispiel => {
    if (b.schluessel !== undefined && !SCHLUESSEL.test(str(b.schluessel))) fehler.push(`beispiele[${i + 1}]: ungültiger Schlüssel „${str(b.schluessel)}“.`);
    return { typ: str(b.typ), werte: istObjekt(b.werte) ? b.werte : {}, ...(b.schluessel !== undefined ? { schluessel: str(b.schluessel) } : {}) };
  });
  // Verweise zwischen Beispielen (#347): Schlüssel eindeutig, Ziele vorhanden bzw. aus einer Abhängigkeit, keine Kreise.
  {
    const eigene = new Set(beispiele.map((b) => b.schluessel).filter((s): s is string => !!s));
    const schl = beispiele.map((b) => b.schluessel).filter((s): s is string => !!s);
    for (const s of new Set(schl.filter((x, j) => schl.indexOf(x) !== j))) fehler.push(`beispiele: Schlüssel „${s}“ doppelt.`);
    for (const [i, b] of beispiele.entries()) {
      for (const z of beispielVerweise(b.werte)) {
        if (!TYPVERWEIS.test(z)) { fehler.push(`beispiele[${i + 1}]: Verweis „${z}“ ist kein gültiger Schlüssel.`); continue; }
        const [p, s] = z.includes(':') ? z.split(':') : [str(m.id), z];
        if (p === str(m.id)) { if (!eigene.has(s)) fehler.push(`beispiele[${i + 1}]: Verweis auf das Beispiel „${s}“, das es im Paket nicht gibt.`); }
        else if (p === 'dms' || !(p in abh)) fehler.push(`beispiele[${i + 1}]: Verweis „${z}“ – das Paket „${p}“ steht nicht unter abhaengigkeiten.`);
      }
    }
    if (!ordneBeispiele(beispiele.map((b) => ({ ...b, werte: eigeneVerweise(b.werte, str(m.id)) })))) {
      fehler.push('beispiele: Die Verweise zwischen den Beispielen bilden einen Kreis (A zeigt auf B, B auf A). Ein Verweis muss weg.');
    }
  }
  const doppelt = (l: string[]) => l.filter((x, i) => l.indexOf(x) !== i);
  for (const s of doppelt(typen.map((t) => t.schluessel))) fehler.push(`mappentypen: Kennung „${s}“ doppelt.`);
  for (const s of doppelt(sichten.map((t) => t.schluessel))) fehler.push(`sichten: Kennung „${s}“ doppelt.`);
  for (const vw of new Set(typverweise(typen, sichten).filter(istDmsVerweis))) {
    if (!DMS_TYPEN[vw.slice(DMS_PRAEFIX.length)]) fehler.push(`Verweis „${vw}“: Diesen Mappentyp bringt das DMS nicht mit. Erlaubt sind ${Object.keys(DMS_TYPEN).map((k) => DMS_PRAEFIX + k).join(', ')}.`);
  }
  // Einstellungen (#197): code.einstellungen und code.aktionen.
  const einst = liesBeschreibung(m.code);
  fehler.push(...einst.fehler.map((f) => `manifest.yaml: code.${f}`));
  // Code (#338): Manifest-Angaben, gebautes Modul und Daten.
  const cl = liesCode(m.code, [...dateien].map(([name, inhalt]) => ({ name, groesse: inhalt.length })));
  fehler.push(...cl.fehler.map((f) => (f.startsWith('code/:') ? f.slice('code/: '.length) : `manifest.yaml: ${f}`)));
  let code: PaketCodeTeil | null = null;
  if (cl.code) {
    const modul = dateien.get('code/modul.wasm');
    // Ohne gebautes Modul (z. B. nur Einstellungen) lässt sich das Paket installieren; es läuft dann kein Code.
    if (!modul) { /* Hinweis in der Vorschau */ }
    else if (modul.length < 8 || !modul.subarray(0, 8).equals(WASM_KOPF)) fehler.push('code/modul.wasm ist kein WebAssembly-Modul.');
    // Andere Dateien unter code/ (Quellcode) stören nicht; geladen werden nur modul.wasm und daten/….
    if (modul) code = { info: cl.code, dateien: [...dateien].filter(([n]) => CODE_DATEI.test(n)).map(([n, inhalt]) => ({ name: n.slice('code/'.length), inhalt })) };
  }
  if (fehler.length) throw new Fachfehler(422, 'Das Paket ist ungültig.', { gruende: fehler });
  return {
    manifest: {
      id: str(m.id), name: str(m.name).trim(), version: str(m.version), beschreibung: str(m.beschreibung),
      autor: { name: str((m.autor as Record<string, unknown>)?.name), github: str((m.autor as Record<string, unknown>)?.github) },
      lizenz: str(m.lizenz), dms: str(m.dms), abhaengigkeiten: Object.fromEntries(Object.entries(abh).map(([k, v]) => [k, str(v)])),
      ...(m.code !== undefined ? { code: m.code } : {}),
    },
    typen, sichten, beispiele, readme: dateien.get('README.md')?.toString('utf8') ?? '', einstellungen: einst.beschreibung, code,
  };
}

/* ---------- Plan: was angelegt bzw. ergänzt wird ---------- */

/** Felder, die das Paket für die Erkennung markiert und die im DMS (gleiche Kennung, gleiche Feldart) noch ohne Einstellung sind (#336). */
function erkennungNeu(t: PaketTyp, vorhanden: Pick<Mappentyp, 'felder'>): Array<{ key: string; label: string; erkennung: FeldErkennung }> {
  return t.felder.flatMap((f) => {
    const g = vorhanden.felder.find((x) => x.key === f.key && x.typ === f.typ);
    const e = liesFeldErkennung(f.erkennung, f.typ);
    return g && e && !g.erkennung ? [{ key: g.key, label: g.label, erkennung: e }] : [];
  });
}

export interface TypPlan {
  schluessel: string; dmsSchluessel: string; name: string; felder: number;
  /** Bei Update: Typ gibt es schon; nur neue Felder und Register. */
  vorhanden: boolean; neueFelder: string[]; neueRegister: string[];
  /** Bei Update (#336): vorhandene Felder, die das Paket jetzt „für die Erkennung“ markiert (nur wo noch nichts eingestellt ist). */
  erkennung?: string[];
  /** Name schon vergeben (von einem anderen Typ) – mit Vorschlag. */
  konflikt: string | null; vorschlag: string | null;
  /** Fehlt im DMS, obwohl das Paket ihn installiert hatte (gelöscht) – wird nicht neu angelegt. */
  geloescht?: boolean;
}
export interface SichtPlan { schluessel: string; name: string; eltern: string | null; vorhanden: boolean; konflikt: string | null; vorschlag: string | null }
export interface AbhaengigkeitPlan { id: string; bereich: string; installiert: string | null; ok: boolean; verfuegbar: string | null }
export interface Vorschau {
  paket: { id: string; name: string; version: string; beschreibung: string; lizenz: string; autor: { name: string; github: string }; dms: string; abhaengigkeiten: Record<string, string>; readme: string | null; changelog: string | null; quelle: string | null };
  dmsVersion: string; dmsOk: boolean;
  installiert: string | null; update: boolean;
  /** Herkunft des installierten Pakets (bei einem Update). */
  herkunft: InstalliertesPaket['herkunft'] | null;
  abhaengigkeiten: AbhaengigkeitPlan[];
  typen: TypPlan[]; sichten: SichtPlan[]; beispiele: number;
  /** Was die Installation verhindert. */
  probleme: string[];
  /** Hinweise, die nicht verhindern (z. B. Code läuft noch nicht). */
  hinweise: string[];
  /** Einstellungen des Pakets (#197): bei einem Update neue und wegfallende Felder. */
  einstellungen: { neu: string[]; weg: string[] } | null;
  /** Code (#338): Rechte, Netzwerkzugriff, Ereignisse (#449) – muss bestätigt werden (bei einem Update nur, wenn sie sich ändern). */
  laeufer: { rechte: RechtePunkt[]; bestaetigen: boolean } | null;
}
export interface InstallierenEingabe {
  id?: string; version?: string; namen?: Record<string, string>; sichtNamen?: Record<string, string>; beispiele?: boolean; mitAbhaengigkeiten?: boolean;
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
  if (!(b.operator in OPERATOREN)) throw new Fachfehler(422, `Unbekannter Operator „${b.operator}“ in einer Ansicht.`);
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
  /** Benutzer zur Auswahl in Paket-Einstellungen (#197). */
  benutzer?: () => Promise<Array<{ id: string; name: string }>>;
  /** Paket-Läufer (Pakete mit Code): Aktionen ausführen, Ereignisse zustellen. Fehlt noch im Betrieb. */
  laeufer?: PaketLaeufer;
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

/** Holt eine Adresse mit Zeitlimit und Größengrenze; nur HTTPS (bzw. HTTP für localhost). */
export async function holeDaten(url: string, max = ARCHIV_MAX): Promise<Buffer> {
  const u = new URL(url);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) throw new Fachfehler(422, 'Pakete gibt es nur über HTTPS.');
  const r = await fetch(u, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'dms-paketverwaltung (https://github.com/motom001/dms)' } });
  if (!r.ok) throw new Fachfehler(502, `${url}: ${r.status} ${r.statusText}`.trim());
  const b = Buffer.from(await r.arrayBuffer());
  if (b.length > max) throw new Fachfehler(422, 'Die Datei ist zu groß.');
  return b;
}

/** Wer handelt: Id für „angelegt von“, E-Mail fürs Protokoll. */
export interface Handelnder { id: string | null; email: string | null }

/** Eine Katalogquelle: der offizielle Katalog oder eine weitere Adresse (erweiterte Ansicht, #189). */
export interface Quelle { url: string; offiziell: boolean; aktiv: boolean; von?: string | null; am?: string }
/** Ergebnis je Quelle beim Abrufen. */
export interface Abruf { url: string; offiziell: boolean; katalog: Katalog | null; fehler: string | null }

/** Ein hochgeladenes, geprüftes Paket, bis es installiert wird (höchstens 30 Minuten). */
interface Hochgeladen { paket: Paket; von: Handelnder; am: string; zeit: number }
const UPLOAD_GUELTIG = 30 * 60_000;

/* ---------- Sammeldatei (#461) ---------- */

/**
 * Sammeldatei: ein ZIP mit dem Verzeichnis sammeldatei.json und den Paket-Archiven unter pakete/<id>-<version>.zip
 * (unverändert aus dem Katalog), optional LIESMICH.txt. Format: dms-registry, schema/sammeldatei.schema.json.
 */
export const SAMMEL_VERZEICHNIS = 'sammeldatei.json';
const SAMMEL_LIESMICH = 'LIESMICH.txt';
/** Höchstens so groß ist eine Sammeldatei; so viele Pakete; entpackt alle Pakete zusammen höchstens. */
export const SAMMEL_MAX = 64 * 1024 * 1024;
export const SAMMEL_PAKETE_MAX = 50;
const SAMMEL_ENTPACKT_MAX = 256 * 1024 * 1024;
const VERZEICHNIS_MAX = 1024 * 1024;

export interface SammelEintrag { id: string; version: string; name: string; archiv: string; sha256: string; groesse: number; gewaehlt: boolean }
export interface SammelVerzeichnis { format: 1; erstellt: string; quelle: string; katalog: string; dms: string | null; pakete: SammelEintrag[] }

/** Prüft sammeldatei.json; wirft mit allen Fehlern auf einmal. */
export function liesSammelVerzeichnis(roh: Buffer | undefined): SammelVerzeichnis {
  const ungueltig = (gruende: string[]) => new Fachfehler(422, 'Das ist keine gültige Sammeldatei.', { gruende });
  if (!roh) throw ungueltig([`${SAMMEL_VERZEICHNIS} fehlt.`]);
  if (roh.length > VERZEICHNIS_MAX) throw ungueltig([`${SAMMEL_VERZEICHNIS} ist zu groß.`]);
  let j: unknown;
  try { j = JSON.parse(roh.toString('utf8')); } catch { throw ungueltig([`${SAMMEL_VERZEICHNIS} ist kein gültiges JSON.`]); }
  if (!istObjekt(j)) throw ungueltig([`${SAMMEL_VERZEICHNIS} ist leer.`]);
  const fehler: string[] = [];
  if (j.art !== 'dms-sammeldatei') fehler.push(`${SAMMEL_VERZEICHNIS}: „art“ muss „dms-sammeldatei“ sein.`);
  if (j.format !== 1) fehler.push(`Sammeldatei-Format ${str(j.format) || '–'} kennt dieses DMS nicht – bitte das DMS aktualisieren.`);
  const liste = Array.isArray(j.pakete) ? j.pakete : [];
  if (!liste.length) fehler.push('Die Sammeldatei enthält keine Pakete.');
  if (liste.length > SAMMEL_PAKETE_MAX) fehler.push(`Die Sammeldatei enthält mehr als ${SAMMEL_PAKETE_MAX} Pakete.`);
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
  /** Prüfsumme gegen den offiziellen Katalog: gleich, oder unbekannt (Katalog nicht abgerufen bzw. Version nicht darin). */
  katalog: 'gleich' | 'unbekannt';
  /** Gegenüber dem installierten Paket. */
  stand: 'neu' | 'neuer' | 'gleich' | 'aelter';
  installiert: string | null;
  vorschau: Vorschau;
}
export interface Sammeldatei {
  datei: { sha256: string; groesse: number; erstellt: string; quelle: string; katalog: string; dms: string | null };
  /** In der Reihenfolge zum Installieren: Abhängigkeiten zuerst. */
  pakete: SammelPaket[];
}

export class Paketverwaltung {
  private kataloge = new Map<string, { katalog: Katalog; zeit: number }>();
  private uploads = new Map<string, Hochgeladen>();

  constructor(private d: Dienst, private o: PaketOptionen) {}

  /** Mappentypen des DMS, auf die Pakete verweisen dürfen (#310): Kennung → Typ. */
  private async dmsTypen(): Promise<Map<string, Mappentyp>> {
    const s = await this.d.sichereSystem();
    const a = await this.d.ablageortTyp();
    return new Map<string, Mappentyp>([['benutzer', s.benutzer], ['rolle', s.rolle], ...(a ? [['ablageort', a] as [string, Mappentyp]] : [])]);
  }

  get katalogUrl() { return this.o.katalogUrl ?? OFFIZIELLER_KATALOG; }
  private abruf(url: string) { return this.o.abruf ? this.o.abruf(url) : holeDaten(url); }

  /* ---------- Quellen (#189) ---------- */

  /** Offizieller Katalog und weitere Adressen aus den Einstellungen. */
  async quellen(): Promise<Quelle[]> {
    const weitere = (await this.d.paketQuellen()).filter((q) => q.url !== this.katalogUrl);
    return [{ url: this.katalogUrl, offiziell: true, aktiv: true }, ...weitere.map((q) => ({ ...q, offiziell: false }))];
  }

  async quelleHinzufuegen(e: { url?: unknown }, von: Handelnder): Promise<Quelle[]> {
    let u: URL;
    try { u = new URL(String(e.url ?? '').trim()); } catch { throw new Fachfehler(422, 'Bitte eine vollständige Adresse eingeben, z. B. https://beispiel.de/katalog.json.'); }
    if (u.protocol !== 'https:') throw new Fachfehler(422, 'Kataloge gehen nur über HTTPS.');
    const url = u.toString();
    const liste = await this.d.paketQuellen();
    if (url === this.katalogUrl || liste.some((q) => q.url === url)) throw new Fachfehler(409, 'Diese Adresse ist schon eingetragen.');
    if (liste.length >= 20) throw new Fachfehler(422, 'Höchstens 20 weitere Kataloge.');
    await this.d.setzePaketQuellen([...liste, { url, aktiv: true, von: von.email, am: new Date().toISOString() }]);
    log.warn('Paketquelle hinzugefügt', { von: von.email, url });
    return this.quellen();
  }

  async quelleSchalten(e: { url?: unknown; aktiv?: unknown }, von: Handelnder): Promise<Quelle[]> {
    const url = String(e.url ?? '');
    const liste = await this.d.paketQuellen();
    if (!liste.some((q) => q.url === url)) throw new Fachfehler(404, 'Diese Quelle gibt es nicht.');
    const aktiv = e.aktiv === true;
    await this.d.setzePaketQuellen(liste.map((q) => (q.url === url ? { ...q, aktiv } : q)));
    this.kataloge.delete(url);
    log.warn(aktiv ? 'Paketquelle eingeschaltet' : 'Paketquelle abgeschaltet', { von: von.email, url });
    return this.quellen();
  }

  async quelleEntfernen(url: string, von: Handelnder): Promise<Quelle[]> {
    const liste = await this.d.paketQuellen();
    if (!liste.some((q) => q.url === url)) throw new Fachfehler(404, 'Diese Quelle gibt es nicht.');
    await this.d.setzePaketQuellen(liste.filter((q) => q.url !== url));
    this.kataloge.delete(url);
    log.warn('Paketquelle entfernt', { von: von.email, url });
    return this.quellen();
  }

  /** Nur der offizielle Katalog und eingeschaltete weitere Quellen; alles andere wird nicht abgefragt. */
  private async erlaubt(url: string | undefined): Promise<string> {
    if (!url || url === this.katalogUrl) return this.katalogUrl;
    if ((await this.quellen()).some((q) => q.url === url && q.aktiv)) return url;
    throw new Fachfehler(422, 'Diese Katalogquelle ist nicht (mehr) eingerichtet oder abgeschaltet.');
  }

  /* ---------- Katalog ---------- */

  /** Einen Katalog abrufen – nur auf Knopfdruck (bzw. für Vorschau und Installation). */
  async katalog(url?: string): Promise<{ url: string; katalog: Katalog; abgerufen: string }> {
    const u = await this.erlaubt(url);
    let katalog: Katalog;
    try { katalog = liesKatalog(JSON.parse((await this.abruf(u)).toString('utf8'))); }
    catch (e) { throw new Fachfehler(502, `Der Katalog lässt sich nicht abrufen: ${(e as Error).message}`); }
    this.kataloge.set(u, { katalog, zeit: Date.now() });
    return { url: u, katalog, abgerufen: new Date().toISOString() };
  }

  /** Normale Ansicht: nur der offizielle Katalog; erweiterte Ansicht: auch die eingeschalteten weiteren. */
  async abrufen(alle: boolean): Promise<{ kataloge: Abruf[]; abgerufen: string }> {
    const quellen = (await this.quellen()).filter((q) => q.offiziell || (alle && q.aktiv));
    const kataloge = await Promise.all(quellen.map(async (q): Promise<Abruf> => {
      try { return { url: q.url, offiziell: q.offiziell, katalog: (await this.katalog(q.url)).katalog, fehler: null }; }
      catch (e) { return { url: q.url, offiziell: q.offiziell, katalog: null, fehler: (e as Error).message }; }
    }));
    return { kataloge, abgerufen: new Date().toISOString() };
  }

  /** Zuletzt abgerufener Katalog einer Quelle, wenn er höchstens 15 Minuten alt ist; sonst neu. */
  private async aktuellerKatalog(url?: string) {
    const u = await this.erlaubt(url);
    const k = this.kataloge.get(u);
    if (k && Date.now() - k.zeit < 15 * 60_000) return { url: u, katalog: k.katalog };
    const neu = await this.katalog(u);
    return { url: neu.url, katalog: neu.katalog };
  }

  /** Installierte Pakete; mit „Einstellungen nötig“, wenn Pflichtfelder fehlen (#197). */
  async installierte(): Promise<Array<InstalliertesPaket & { einstellungenNoetig?: boolean }>> {
    return Promise.all((await this.d.listePakete()).map(async (p) => (p.einstellungen
      ? { ...p, einstellungenNoetig: fehlendePflicht(p.einstellungen, (await this.d.paketEinstellungen(p.id))?.werte ?? {}).length > 0 }
      : p)));
  }

  /** Paket einer Version aus einem Katalog holen und gegen die Prüfsumme prüfen. */
  async lade(id: string, version?: string, quelle?: string): Promise<{ paket: Paket; kp: KatalogPaket; v: KatalogVersion; url: string; katalog: Katalog }> {
    const { katalog, url } = await this.aktuellerKatalog(quelle);
    const kp = katalog.pakete.find((p) => p.id === id);
    if (!kp) throw new Fachfehler(404, `Das Paket „${id}“ gibt es im Katalog nicht.`);
    const v = version ? kp.versionen.find((x) => x.version === version) : kp.versionen.find((x) => x.version === kp.aktuell) ?? kp.versionen[0];
    if (!v) throw new Fachfehler(404, `Version ${version} von „${kp.name}“ gibt es im Katalog nicht.`);
    let daten: Buffer;
    try { daten = await this.abruf(new URL(v.archiv, url).toString()); }
    catch (e) { throw new Fachfehler(502, `Das Paket lässt sich nicht herunterladen: ${(e as Error).message}`); }
    if (createHash('sha256').update(daten).digest('hex') !== v.sha256) throw new Fachfehler(422, `Die Prüfsumme von „${kp.name}“ ${v.version} passt nicht zum Katalog. Das Paket wird nicht installiert.`);
    const paket = liesPaket(liesZip(daten));
    if (paket.manifest.id !== id || paket.manifest.version !== v.version) throw new Fachfehler(422, `Das Archiv enthält ${paket.manifest.id} ${paket.manifest.version} statt ${id} ${v.version}.`);
    return { paket, kp, v, url, katalog };
  }

  /* ---------- Hochladen (#189) ---------- */

  /** Paket als Datei: dieselbe Prüfung wie bei Katalogpaketen, nur ohne Prüfsumme aus dem Katalog. */
  async hochladen(daten: unknown, von: Handelnder): Promise<{ upload: string; vorschau: Vorschau }> {
    if (!Buffer.isBuffer(daten) || !daten.length) throw new Fachfehler(422, 'Bitte eine .zip-Datei hochladen.');
    if (daten.length > ARCHIV_MAX) throw new Fachfehler(422, 'Die Datei ist zu groß (höchstens 10 MB).');
    const paket = liesPaket(liesZip(daten));
    for (const [k, u] of this.uploads) if (Date.now() - u.zeit > UPLOAD_GUELTIG) this.uploads.delete(k);
    const upload = randomUUID();
    this.uploads.set(upload, { paket, von, am: new Date().toISOString(), zeit: Date.now() });
    log.warn('Paket hochgeladen', { von: von.email, paket: paket.manifest.id, version: paket.manifest.version, bytes: daten.length });
    return { upload, vorschau: await this.plane(paket, undefined, await this.offiziell().catch(() => undefined)) };
  }

  /** Hochgeladene Datei (#461): eine Sammeldatei erkennt das DMS an sammeldatei.json, sonst ein einzelnes Paket. */
  async hochladenDatei(daten: unknown, von: Handelnder): Promise<{ upload: string; vorschau: Vorschau } | { sammeldatei: Sammeldatei }> {
    if (!Buffer.isBuffer(daten) || !daten.length) throw new Fachfehler(422, 'Bitte eine .zip-Datei hochladen.');
    if (daten.length > SAMMEL_MAX) throw new Fachfehler(422, `Die Datei ist zu groß (höchstens ${SAMMEL_MAX / 1048576} MB).`);
    if (zipNamen(daten).includes(SAMMEL_VERZEICHNIS)) return { sammeldatei: await this.sammeldatei(daten, von) };
    return this.hochladen(daten, von);
  }

  /**
   * Sammeldatei prüfen (#461) – alles oder nichts: Verzeichnis, nur erwartete Dateien, je Archiv Größe und
   * SHA-256 wie im Verzeichnis, und gegen den offiziellen Katalog, falls er schon abgerufen ist (keine neue
   * Verbindung). Danach jedes Paket mit denselben Prüfungen wie ein einzeln hochgeladenes (liesPaket).
   * Installiert wird nichts; jedes Paket bekommt eine Upload-Kennung und wird einzeln installiert.
   */
  async sammeldatei(daten: Buffer, von: Handelnder): Promise<Sammeldatei> {
    const dateien = liesZip(daten, { dateien: SAMMEL_PAKETE_MAX + 2, entpackt: SAMMEL_MAX });
    const vz = liesSammelVerzeichnis(dateien.get(SAMMEL_VERZEICHNIS));
    const gruende: string[] = [];
    const erwartet = new Set([SAMMEL_VERZEICHNIS, SAMMEL_LIESMICH, ...vz.pakete.map((p) => p.archiv)]);
    for (const n of dateien.keys()) if (!erwartet.has(n)) gruende.push(`${n}: steht nicht im Verzeichnis der Sammeldatei.`);
    const katalog = await this.offiziell();
    const imKatalog = (e: SammelEintrag) => katalog?.pakete.find((p) => p.id === e.id)?.versionen.find((v) => v.version === e.version);
    for (const e of vz.pakete) {
      const a = dateien.get(e.archiv);
      if (!a) { gruende.push(`${e.archiv} fehlt.`); continue; }
      if (a.length !== e.groesse) gruende.push(`${e.name} ${e.version}: Die Größe passt nicht zum Verzeichnis.`);
      else if (createHash('sha256').update(a).digest('hex') !== e.sha256) gruende.push(`${e.name} ${e.version}: Die Prüfsumme passt nicht zum Verzeichnis.`);
      const kv = imKatalog(e);
      if (kv && kv.sha256 !== e.sha256) gruende.push(`${e.name} ${e.version}: Die Prüfsumme passt nicht zum offiziellen Katalog.`);
    }
    if (gruende.length) throw new Fachfehler(422, 'Die Sammeldatei ist beschädigt oder verändert. Es wird nichts installiert.', { gruende });
    const budget = { rest: SAMMEL_ENTPACKT_MAX };
    const gelesen = vz.pakete.map((e) => {
      let paket: Paket;
      try { paket = liesPaket(liesZip(dateien.get(e.archiv)!, { ...PAKET_GRENZEN, budget })); }
      catch (x) {
        if (!(x instanceof Fachfehler)) throw x;
        throw new Fachfehler(422, `${e.name} ${e.version} in der Sammeldatei: ${x.message} Es wird nichts installiert.`, x.details);
      }
      if (paket.manifest.id !== e.id || paket.manifest.version !== e.version) throw new Fachfehler(422, `Das Archiv ${e.archiv} enthält ${paket.manifest.id} ${paket.manifest.version}. Es wird nichts installiert.`);
      return { e, paket, id: e.id, abhaengigkeiten: paket.manifest.abhaengigkeiten };
    });
    const reihenfolge = nachAbhaengigkeiten(gelesen);
    if (!reihenfolge) throw new Fachfehler(422, 'Die Abhängigkeiten der Pakete in der Sammeldatei bilden einen Kreis. Es wird nichts installiert.');
    for (const [k, u] of this.uploads) if (Date.now() - u.zeit > UPLOAD_GUELTIG) this.uploads.delete(k);
    const am = new Date().toISOString();
    const installierte = await this.d.listePakete();
    const pakete: SammelPaket[] = [];
    for (const { e, paket } of reihenfolge) {
      const upload = randomUUID();
      this.uploads.set(upload, { paket, von, am, zeit: Date.now() });
      const da = installierte.find((p) => p.id === e.id)?.version ?? null;
      const c = da ? vergleicheVersion(e.version, da) : 1;
      pakete.push({
        upload, id: e.id, name: paket.manifest.name, version: e.version, gewaehlt: e.gewaehlt, abhaengigkeiten: paket.manifest.abhaengigkeiten,
        katalog: imKatalog(e) ? 'gleich' : 'unbekannt', installiert: da, stand: !da ? 'neu' : c > 0 ? 'neuer' : c === 0 ? 'gleich' : 'aelter',
        vorschau: await this.plane(paket, undefined, katalog),
      });
    }
    const sha256 = createHash('sha256').update(daten).digest('hex');
    log.warn('Sammeldatei hochgeladen', { von: von.email, sha256, bytes: daten.length, pakete: pakete.map((p) => `${p.id}@${p.version}`).join(', '), katalog: pakete.every((p) => p.katalog === 'gleich') ? 'abgeglichen' : 'nicht abgeglichen' });
    return { datei: { sha256, groesse: daten.length, erstellt: vz.erstellt, quelle: vz.quelle, katalog: vz.katalog, dms: vz.dms }, pakete };
  }

  private hochgeladen(token: unknown): Hochgeladen {
    const u = this.uploads.get(String(token ?? ''));
    if (!u || Date.now() - u.zeit > UPLOAD_GUELTIG) throw new Fachfehler(410, 'Das hochgeladene Paket ist abgelaufen. Bitte noch einmal hochladen.');
    return u;
  }

  /** Abhängigkeiten eines hochgeladenen Pakets kommen aus dem offiziellen Katalog (wenn schon abgerufen). */
  private async offiziell(): Promise<Katalog | undefined> { return this.kataloge.get(this.katalogUrl)?.katalog; }

  /* ---------- Vorschau und Installation ---------- */

  /** Vorschau: was angelegt bzw. ergänzt wird, Namenskonflikte, Version und Abhängigkeiten. */
  async vorschau(e: { id?: string; version?: string; quelle?: string; upload?: string }): Promise<Vorschau> {
    if (e.upload) return this.plane(this.hochgeladen(e.upload).paket, undefined, await this.offiziell());
    const { paket, v, katalog } = await this.lade(String(e.id), e.version ? String(e.version) : undefined, e.quelle ? String(e.quelle) : undefined);
    return this.plane(paket, v, katalog);
  }

  private async plane(paket: Paket, v?: KatalogVersion, katalog?: Katalog, namen: Record<string, string> = {}, sichtNamen: Record<string, string> = {}): Promise<Vorschau> {
    const m = paket.manifest;
    const installierte = await this.d.listePakete();
    const ich = installierte.find((p) => p.id === m.id) ?? null;
    const typen = await this.d.listeTypen();
    const sichten = await this.d.listeSichten();
    const probleme: string[] = [];
    const dmsVersion = this.o.version();
    const dmsOk = dmsPasst(dmsVersion, m.dms);
    if (!dmsOk) probleme.push(`Das Paket braucht DMS ${m.dms}; dieses DMS hat Version ${dmsVersion}. Bitte zuerst das DMS aktualisieren.`);
    const hinweise: string[] = [];
    // Code läuft erst mit dem Paket-Läufer; Einstellungen lassen sich schon pflegen (#197).
    if (m.code !== undefined && !paket.code) hinweise.push('Das Paket enthält Code, aber kein gebautes Modul (code/modul.wasm) – im Paket-Läufer läuft deshalb nichts; Einstellungen lassen sich schon pflegen.');
    if (ich && vergleicheVersion(m.version, ich.version) <= 0) probleme.push(`Version ${ich.version} ist schon installiert.`);
    // Verweise auf Mappentypen des DMS (#310), z. B. dms:ablageort.
    const dmsTypen = await this.dmsTypen();
    const genutzt = [...new Set(typverweise(paket.typen, paket.sichten).filter(istDmsVerweis).map((vw) => vw.slice(DMS_PRAEFIX.length)))];
    for (const k of genutzt.filter((k) => !dmsTypen.has(k))) probleme.push(`Das Paket verweist auf den Mappentyp „${DMS_TYPEN[k] ?? k}“ des DMS, den es hier nicht gibt. Bitte das DMS aktualisieren (ab ${DMS_VERWEISE_AB}).`);
    const da = genutzt.filter((k) => dmsTypen.has(k));
    if (da.length) hinweise.push(`Nutzt Mappentypen aus dem DMS: ${da.map((k) => `${dmsTypen.get(k)!.name} (aus dem DMS)`).join(', ')}.`);
    // Beispiele, die auf Beispiele einer Abhängigkeit zeigen (#347): ohne diese bleiben die Verweise leer.
    for (const p of new Set(paket.beispiele.flatMap((b) => beispielVerweise(b.werte)).filter((z) => z.includes(':') && !z.startsWith(`${m.id}:`)).map((z) => z.split(':')[0]))) {
      const da = installierte.find((x) => x.id === p);
      if (da && !Object.keys(da.beispiele ?? {}).length) hinweise.push(`Einige Beispiele zeigen auf Beispiele von „${da.name}“. Die sind hier nicht installiert – diese Verweise bleiben leer.`);
    }
    const abhaengigkeiten = Object.entries(m.abhaengigkeiten).map(([id, bereich]): AbhaengigkeitPlan => {
      const da = installierte.find((p) => p.id === id);
      const kp = katalog?.pakete.find((p) => p.id === id);
      return { id, bereich, installiert: da?.version ?? null, ok: !!da && passt(da.version, bereich), verfuegbar: kp ? neuestePassende(kp, bereich)?.version ?? null : null };
    });
    for (const a of abhaengigkeiten) {
      if (a.installiert && !a.ok) probleme.push(`„${a.id}“ ist in Version ${a.installiert} installiert, das Paket braucht ${a.bereich}. Bitte „${a.id}“ zuerst aktualisieren.`);
    }
    const belegt = new Set(typen.map((t) => t.name.trim().toLowerCase()));
    const typPlaene = paket.typen.map((t): TypPlan => {
      const dmsSchluessel = `${m.id}_${t.schluessel}`;
      const vorhandenId = ich?.typen[t.schluessel];
      const vorhanden = vorhandenId ? typen.find((x) => x.id === vorhandenId) : undefined;
      if (vorhanden) {
        return {
          schluessel: t.schluessel, dmsSchluessel, name: vorhanden.name, felder: t.felder.length, vorhanden: true,
          neueFelder: t.felder.filter((f) => !vorhanden.felder.some((g) => g.key === f.key)).map((f) => f.label),
          neueRegister: t.register.filter((r) => !vorhanden.register.some((g) => g.key === r.key)).map((r) => r.name),
          erkennung: erkennungNeu(t, vorhanden).map((f) => f.label),
          konflikt: null, vorschlag: null,
        };
      }
      if (vorhandenId) return { schluessel: t.schluessel, dmsSchluessel, name: t.name, felder: t.felder.length, vorhanden: false, neueFelder: [], neueRegister: [], konflikt: null, vorschlag: null, geloescht: true };
      if (typen.some((x) => x.schluessel === dmsSchluessel)) probleme.push(`Die Kennung „${dmsSchluessel}“ hat schon ein Mappentyp. Dieses Paket war wohl schon einmal installiert; benenne den Typ in der Werkbank um oder lösche ihn.`);
      const name = (namen[t.schluessel] ?? t.name).trim();
      const konflikt = belegt.has(name.toLowerCase()) ? `Einen Mappentyp „${name}“ gibt es schon.` : null;
      const vorschlag = konflikt ? freierName(name, m.name, belegt) : null;
      belegt.add(name.toLowerCase());
      return { schluessel: t.schluessel, dmsSchluessel, name, felder: t.felder.length, vorhanden: false, neueFelder: [], neueRegister: [], konflikt, vorschlag };
    });
    const sichtPlaene = paket.sichten.map((s): SichtPlan => {
      const vorhandenId = ich?.sichten[s.schluessel];
      const vorhanden = vorhandenId ? sichten.find((x) => x.id === vorhandenId) : undefined;
      if (vorhanden || vorhandenId) return { schluessel: s.schluessel, name: vorhanden?.name ?? s.name, eltern: s.eltern ?? null, vorhanden: true, konflikt: null, vorschlag: null };
      const name = (sichtNamen[s.schluessel] ?? s.name).trim();
      // Konflikt nur auf oberster Ebene: Untersichten stehen unter der neuen Elternsicht.
      const geschwister = s.eltern ? [] : sichten.filter((x) => !x.elternId).map((x) => x.name.trim().toLowerCase());
      const konflikt = geschwister.includes(name.toLowerCase()) ? `Eine Ansicht „${name}“ gibt es schon.` : null;
      return { schluessel: s.schluessel, name, eltern: s.eltern ?? null, vorhanden: false, konflikt, vorschlag: konflikt ? freierName(name, m.name, new Set(geschwister)) : null };
    });
    return {
      paket: { id: m.id, name: m.name, version: m.version, beschreibung: m.beschreibung, lizenz: m.lizenz, autor: m.autor, dms: m.dms, abhaengigkeiten: m.abhaengigkeiten, readme: v?.readme ?? null, changelog: v?.changelog ?? null, quelle: v?.quelle ?? null },
      dmsVersion, dmsOk, installiert: ich?.version ?? null, update: !!ich,
      herkunft: ich?.herkunft ?? null,
      abhaengigkeiten, typen: typPlaene, sichten: sichtPlaene, beispiele: paket.beispiele.length, probleme, hinweise,
      einstellungen: paket.einstellungen || ich?.einstellungen ? einstellungsAenderung(ich?.einstellungen ?? null, paket.einstellungen) : null,
      laeufer: paket.code ? { rechte: rechtePunkte(paket.code.info, (vw) => this.typName(vw, paket, installierte, typen)), bestaetigen: !ich || !gleicheRechte(ich.laeufer, paket.code.info) } : null,
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
      throw new Fachfehler(409, `„${plan.paket.name}“ enthält Code, der im DMS laufen soll. Bitte die Rechte bestätigen.`, { rechte: rechteZeilen(plan.laeufer.rechte) });
    }
  }

  /**
   * Installieren aus einem Katalog oder hochgeladen; mit `mitAbhaengigkeiten` vorher fehlende Abhängigkeiten.
   * Nicht aus dem offiziellen Katalog nur mit ausdrücklicher Bestätigung (#189).
   */
  async installiere(e: InstallierenEingabe, von: Handelnder): Promise<InstalliertesPaket> {
    const hoch = e.upload ? this.hochgeladen(e.upload) : null;
    const quelle = hoch ? null : await this.erlaubt(e.quelle ? String(e.quelle) : undefined);
    if ((hoch || quelle !== this.katalogUrl) && e.bestaetigt !== true) {
      throw new Fachfehler(409, 'Dieses Paket kommt nicht aus dem offiziellen Katalog und ist nicht vom DMS-Projekt geprüft. Bitte die Herkunft bestätigen.', { warnung: true });
    }
    const geladen = hoch ? { paket: hoch.paket, v: undefined, katalog: await this.offiziell() } : await this.lade(String(e.id ?? ''), e.version ? String(e.version) : undefined, quelle!);
    const { paket, v } = geladen;
    const id = paket.manifest.id;
    const alt = (await this.d.listePakete()).find((p) => p.id === id) ?? null;
    if (alt) {
      // Ein hochgeladenes Paket aktualisiert man durch erneutes Hochladen einer höheren Version.
      if (!hoch) throw new Fachfehler(409, `„${alt.name}“ ist schon installiert. Aktualisieren geht über „Aktualisieren“.`);
      if (alt.herkunft.art !== 'hochgeladen') throw new Fachfehler(409, `„${alt.name}“ stammt aus einem Katalog; Updates kommen nur von dort.`);
    }
    const herkunft: InstalliertesPaket['herkunft'] = hoch ? { art: 'hochgeladen', von: hoch.von.email, am: hoch.am } : { art: 'katalog', url: quelle! };
    const vorschau = await this.plane(paket, v, geladen.katalog, e.namen ?? {}, e.sichtNamen ?? {});
    const fehlen = vorschau.abhaengigkeiten.filter((a) => !a.installiert);
    if (fehlen.length && (!e.mitAbhaengigkeiten || alt)) {
      throw new Fachfehler(409, `Es fehlen Pakete, die „${paket.manifest.name}“ braucht: ${fehlen.map((a) => `${a.id} ${a.bereich}`).join(', ')}.`, { gruende: fehlen.map((a) => (a.verfuegbar ? `${a.id}: im Katalog gibt es ${a.verfuegbar}` : `${a.id}: nicht im Katalog`)) });
    }
    if (vorschau.probleme.length) throw new Fachfehler(409, vorschau.probleme[0], { gruende: vorschau.probleme });
    Paketverwaltung.rechteBestaetigen(vorschau, e);
    // Abhängigkeiten mit Code installiert das DMS nicht still mit: ihre Rechte bestätigt man an ihnen selbst (#338).
    for (const a of fehlen) {
      if (!a.verfuegbar) continue;
      const dep = await this.lade(a.id, a.verfuegbar, quelle ?? this.katalogUrl);
      if (dep.paket.code) throw new Fachfehler(409, `Die Abhängigkeit „${dep.paket.manifest.name}“ enthält Code. Bitte installiere sie zuerst selbst – dabei bestätigst du ihre Rechte.`, { gruende: [`${a.id}: enthält Code`] });
    }
    for (const a of fehlen) {
      if (!a.verfuegbar) throw new Fachfehler(409, `Die Abhängigkeit „${a.id}“ (${a.bereich}) gibt es im Katalog nicht.`);
      // Abhängigkeiten aus derselben Quelle; bei hochgeladenen Paketen aus dem offiziellen Katalog.
      // Beispiele der Abhängigkeit mit, wenn welche gewünscht sind – die eigenen Beispiele können auf sie zeigen (#347).
      await this.installiere({ id: a.id, version: a.verfuegbar, beispiele: e.beispiele === true, mitAbhaengigkeiten: true, quelle: quelle ?? this.katalogUrl, bestaetigt: e.bestaetigt }, von);
    }
    const konflikte = [...vorschau.typen, ...vorschau.sichten].filter((x) => x.konflikt);
    if (konflikte.length) throw new Fachfehler(409, 'Einige Namen gibt es schon. Bitte andere wählen.', { gruende: konflikte.map((x) => `${x.konflikt} Vorschlag: „${x.vorschlag}“.`), konflikte: true });
    const datensatz = await this.lege(paket, herkunft, v, vorschau, e.beispiele === true && !alt, von, alt);
    if (hoch) this.uploads.delete(String(e.upload));
    log.info(alt ? 'Paket aktualisiert (hochgeladen)' : 'Paket installiert', { von: von.email, paket: id, version: paket.manifest.version, ...(alt ? { vorher: alt.version } : {}), herkunft: hoch ? 'hochgeladen' : quelle, typen: Object.keys(datensatz.typen).length, sichten: Object.keys(datensatz.sichten).length });
    return datensatz;
  }

  /**
   * Legt Typen, Sichten und ggf. Beispiele an bzw. ergänzt sie (Update) und speichert den Eintrag.
   * Bei einem Fehler wird alles zurückgenommen.
   */
  private async lege(paket: Paket, herkunft: InstalliertesPaket['herkunft'], v: KatalogVersion | undefined, plan: Vorschau, beispiele: boolean, von: Handelnder, alt: InstalliertesPaket | null): Promise<InstalliertesPaket> {
    const m = paket.manifest;
    const installierte = await this.d.listePakete();
    const vorher = new Map((await this.d.listeTypen()).map((t) => [t.id, t] as const));
    const ids = new Map<string, string>(Object.entries(alt?.typen ?? {}));
    for (const t of paket.typen) if (!ids.has(t.schluessel)) ids.set(t.schluessel, randomUUID());
    const neueTypen = paket.typen.filter((t) => !plan.typen.find((x) => x.schluessel === t.schluessel)?.vorhanden && !plan.typen.find((x) => x.schluessel === t.schluessel)?.geloescht);
    const angelegt = new Set<string>();
    const beispielIds = new Map<string, string>();
    const dmsTypen = await this.dmsTypen();
    const ziel = (vw: string, nurAngelegt: boolean): string | null => {
      const [p, s] = vw.includes(':') ? vw.split(':') : [m.id, vw];
      if (p === 'dms') {
        const t = dmsTypen.get(s);
        if (!t) throw new Fachfehler(422, `Der Verweis „${vw}“ lässt sich nicht auflösen: Diesen Mappentyp gibt es in diesem DMS nicht (Verweise auf Mappentypen des DMS ab ${DMS_VERWEISE_AB}).`);
        return t.id;
      }
      if (p !== m.id) {
        const fremd = installierte.find((x) => x.id === p)?.typen[s];
        if (!fremd || !vorher.has(fremd)) throw new Fachfehler(422, `Der Verweis „${vw}“ lässt sich nicht auflösen: Paket „${p}“ bzw. sein Typ „${s}“ fehlt.`);
        return fremd;
      }
      const id = ids.get(s);
      if (!id) throw new Fachfehler(422, `Der Verweis „${vw}“ zeigt auf keinen Typ dieses Pakets.`);
      return !nurAngelegt || angelegt.has(s) || vorher.has(id) ? id : null;
    };
    const eingabe = (t: PaketTyp, nurAngelegt: boolean) => {
      const eigen = (vw: string) => !vw.includes(':') || vw.startsWith(`${m.id}:`);
      const offen = new Set(t.felder.filter((f) => f.ziel && !(eigen(f.ziel) && f.ziel.split(':').pop() === t.schluessel) && ziel(f.ziel, nurAngelegt) === null).map((f) => f.key));
      const felder = t.felder.filter((f) => !offen.has(f.key)).map(({ ziel: z, ...f }) => (z ? { ...f, zielTyp: ziel(z, false) } : f));
      const register = t.register.map((r) => ({ ...r, ...(r.quellen ? { quellen: r.quellen.map((q) => ({ typId: ziel(q.typ, nurAngelegt), feldKey: q.feld })).filter((q) => q.typId) } : {}) }));
      const unvollstaendig = offen.size > 0 || t.register.some((r) => (r.quellen ?? []).some((q) => ziel(q.typ, nurAngelegt) === null));
      const name = plan.typen.find((x) => x.schluessel === t.schluessel)!.name;
      return { unvollstaendig, daten: { id: ids.get(t.schluessel), name, schluessel: `${m.id}_${t.schluessel}`, beschreibung: t.beschreibung, titelVorlage: t.titelVorlage ?? '', felder, register, ...(t.trefferliste ? { trefferliste: t.trefferliste.filter((k) => !offen.has(k)) } : {}), sichtAnlegen: false } };
    };
    // Zurückrollen: angelegte Mappen, Sichten, Typen; geänderte Typen auf den alten Stand.
    const mappen: string[] = [];
    const neueSichten: string[] = [];
    const geaendert: Mappentyp[] = [];
    const zurueck = async () => {
      await this.d.entferneMappenEndgueltig(mappen).catch(() => {});
      for (const s of [...neueSichten].reverse()) await this.d.loescheSicht(s).catch(() => {});
      for (let runde = 0; runde < 3; runde++) for (const s of [...angelegt].reverse()) { const id = ids.get(s)!; await this.d.loescheTyp(id).then(() => angelegt.delete(s), () => {}); }
      for (const t of geaendert) await this.d.aendereTyp(t.id, t).catch(() => {});
    };
    const alteEinstellungen = await this.d.paketEinstellungen(m.id);
    let einstellungenGeschrieben = false;
    // Code (#403): Der alte Code kommt bei einem Fehler zurück – sonst liefe das alte Paket mit dem neuen Modul.
    const alterCode = alt?.laeufer ? await this.d.paketCode(m.id) : [];
    let codeGeschrieben = false;
    const typMap: Record<string, string> = { ...(alt?.typen ?? {}) };
    const sichtMap: Record<string, string> = { ...(alt?.sichten ?? {}) };
    try {
      // 1. Neue Typen: Ziele zuerst; Verweise auf noch fehlende Typen dieses Pakets im zweiten Durchgang.
      const rest = [...neueTypen];
      const nachtragen: PaketTyp[] = [];
      while (rest.length) {
        const i = rest.findIndex((t) => !eingabe(t, true).unvollstaendig);
        const t = rest.splice(i < 0 ? 0 : i, 1)[0];
        const x = eingabe(t, true);
        try { await this.d.legeTypAn(x.daten); } catch (f) { throw new Fachfehler((f as Fachfehler).status ?? 422, `Mappentyp „${x.daten.name}“: ${meldungen(f)}`); }
        angelegt.add(t.schluessel);
        typMap[t.schluessel] = ids.get(t.schluessel)!;
        if (x.unvollstaendig) nachtragen.push(t);
      }
      for (const t of nachtragen) {
        try { await this.d.aendereTyp(ids.get(t.schluessel)!, eingabe(t, false).daten); } catch (f) { throw new Fachfehler(422, `Mappentyp „${t.name}“: ${meldungen(f)}`); }
      }
      // 2. Update: vorhandene Typen um neue Felder und Register ergänzen – sonst nichts ändern.
      for (const t of paket.typen) {
        const p = plan.typen.find((x) => x.schluessel === t.schluessel)!;
        if (!p.vorhanden || (!p.neueFelder.length && !p.neueRegister.length && !p.erkennung?.length)) continue;
        const aktuell = vorher.get(ids.get(t.schluessel)!)!;
        const neu = eingabe(t, false).daten;
        // Erkennung (#336): Markierung des Pakets an vorhandene Felder, an denen der Administrator nichts eingestellt hat.
        const markiert = new Map(erkennungNeu(t, aktuell).map((f) => [f.key, f.erkennung]));
        const felder = [...aktuell.felder.map((f) => (markiert.has(f.key) ? { ...f, erkennung: markiert.get(f.key) } : f)), ...neu.felder.filter((f) => !aktuell.felder.some((g) => g.key === f.key))];
        const register = aktuell.register.map((r) => {
          const pr = t.register.find((x) => x.key === r.key);
          const dazu = (pr?.felder ?? []).filter((k) => !aktuell.felder.some((g) => g.key === k) && r.art === 'felder');
          return dazu.length ? { ...r, felder: [...(r.felder ?? []), ...dazu] } : r;
        });
        for (const r of neu.register) if (!register.some((g) => g.key === r.key)) register.push(r as Register);
        geaendert.push(aktuell);
        try { await this.d.aendereTyp(aktuell.id, { ...aktuell, felder, register }); } catch (f) { throw new Fachfehler(422, `Mappentyp „${aktuell.name}“: ${meldungen(f)}`); }
      }
      // 3. Neue Sichten, Elternsichten zuerst, am Ende ihrer Ebene.
      for (const s of nachEltern(paket.sichten)) {
        const sp = plan.sichten.find((x) => x.schluessel === s.schluessel)!;
        if (sp.vorhanden) continue;
        const alle = await this.d.listeSichten();
        const elternId = s.eltern ? sichtMap[s.eltern] ?? null : null;
        if (s.eltern && !elternId) throw new Fachfehler(422, `Ansicht „${s.name}“: Elternsicht „${s.eltern}“ fehlt.`);
        const position = Math.max(0, ...kinderVon(alle, elternId).map((x) => x.position)) + 10;
        const typen = (s.typen ?? []).map((x) => ziel(x, false)!).filter(Boolean);
        try {
          const neu = await this.d.legeSichtAn({ name: sp.name, beschreibung: s.beschreibung ?? '', elternId, position, typen, bedingungen: (s.bedingungen ?? []).map(bedingungAus), ...(s.trefferliste ? { trefferliste: s.trefferliste } : {}) });
          neueSichten.push(neu.id);
          sichtMap[s.schluessel] = neu.id;
        } catch (f) { throw new Fachfehler(422, `Ansicht „${sp.name}“: ${meldungen(f)}`); }
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
            // Beträge dürfen im Paket als Zahl stehen.
            if (f?.typ === 'betrag' && typeof w === 'number') werte[k] = { betrag: w, waehrung: f.waehrung || 'EUR' };
            else if (Array.isArray(w) && w.some(istBeispielVerweis)) { const l = (await Promise.all(w.map(aufloesen))).filter((x): x is string => !!x); if (l.length) werte[k] = l; }
            else if (istBeispielVerweis(w)) { const z = await aufloesen(w); if (z) werte[k] = f?.mehrfach ? [z] : z; }
            else werte[k] = w;
          }
          let mappeId: string;
          try { mappeId = (await this.d.legeMappeAn({ typId, werte }, von.id)).id; } catch (f) { throw new Fachfehler(422, `Beispiel: ${meldungen(f)}`); }
          mappen.push(mappeId);
          if (b.schluessel) beispielIds.set(b.schluessel, mappeId);
        }
        if (ohneZiel.size) log.info('Paket: Verweise in Beispielen ohne Ziel bleiben leer', { paket: m.id, ziele: [...ohneZiel] });
      }
      // Einstellungen (#197): Vorgaben setzen bzw. überführen; nach dem Entfernen behaltene Werte zählen.
      if (paket.einstellungen) {
        const vorher = alteEinstellungen ?? { werte: {} };
        const { werte } = ueberfuehre(paket.einstellungen, alteEinstellungen ? vorher.werte : {});
        await this.d.setzePaketEinstellungen(m.id, { ...vorher, werte });
        einstellungenGeschrieben = true;
      } else if (alteEinstellungen && alt) { await this.d.setzePaketEinstellungen(m.id, null); einstellungenGeschrieben = true; }
      const jetzt = new Date().toISOString();
      const datensatz: InstalliertesPaket = {
        id: m.id, name: m.name, version: m.version, beschreibung: m.beschreibung, lizenz: m.lizenz, autor: m.autor,
        herkunft,
        installiert: alt?.installiert ?? jetzt, installiertVon: alt ? alt.installiertVon : von.email,
        aktualisiert: alt ? jetzt : null, aktualisiertVon: alt ? von.email : null,
        typen: typMap, sichten: sichtMap, abhaengigkeiten: m.abhaengigkeiten,
        // Beispiel-Mappen mit Schlüssel (#347), damit spätere Pakete auf sie verweisen können.
        ...(beispielIds.size ? { beispiele: Object.fromEntries(beispielIds) } : alt?.beispiele ? { beispiele: alt.beispiele } : {}),
        einstellungen: paket.einstellungen, code: m.code !== undefined,
        ...(paket.code ? { laeufer: { ...paket.code.info, modul: modulInfo(paket.code), daten: paket.code.dateien.filter((d) => d.name !== 'modul.wasm').map((d) => d.name) } } : {}),
        ...(v ? { links: { readme: v.readme, changelog: v.changelog, quelle: v.quelle } } : alt?.links ? { links: alt.links } : {}),
      };
      // Code (#338): ersetzt den bisherigen; ohne Code im neuen Paket fällt er weg.
      if (paket.code || alt?.laeufer) codeGeschrieben = true;
      if (paket.code) await this.d.speicherePaketCode(m.id, paket.code.dateien);
      else if (alt?.laeufer) await this.d.loeschePaketCode(m.id);
      await this.d.speicherePaket(datensatz);
      if (paket.code || alt?.laeufer) await Promise.resolve(this.o.laeufer?.codeGeaendert?.()).catch(() => {});
      return datensatz;
    } catch (f) {
      await zurueck();
      if (codeGeschrieben) await (alterCode.length ? this.d.speicherePaketCode(m.id, alterCode) : this.d.loeschePaketCode(m.id)).catch((e) => log.error('Paket: alten Code nicht wiederhergestellt', { paket: m.id, fehler: (e as Error).message }));
      if (einstellungenGeschrieben) await this.d.setzePaketEinstellungen(m.id, alteEinstellungen).catch(() => {});
      throw f;
    }
  }

  /** Neuere Versionen (auf Knopfdruck) – je Paket nur in der Quelle, aus der es stammt. */
  async updates(): Promise<Array<{ id: string; installiert: string; neu: string; changelog: string | null; quelle: string }>> {
    const erg = [];
    const quellen = await this.quellen();
    const geholt = new Map<string, Katalog | null>();
    for (const p of await this.d.listePakete()) {
      if (p.herkunft.art !== 'katalog') continue;
      const url = p.herkunft.url;
      if (!quellen.some((q) => q.url === url && q.aktiv)) continue;
      if (!geholt.has(url)) geholt.set(url, await this.katalog(url).then((k) => k.katalog, (e) => { if (url === this.katalogUrl) throw e; return null; }));
      const kp = geholt.get(url)?.pakete.find((x) => x.id === p.id);
      const v = kp?.versionen.find((x) => x.version === kp.aktuell) ?? kp?.versionen[0];
      if (v && vergleicheVersion(v.version, p.version) > 0) erg.push({ id: p.id, installiert: p.version, neu: v.version, changelog: v.changelog, quelle: url });
    }
    return erg;
  }

  /** Update aus der Quelle des Pakets: ergänzt nur – neue Typen, Felder, Register, Sichten. */
  async aktualisiere(id: string, e: { version?: string; bestaetigt?: boolean; rechteBestaetigt?: boolean }, von: Handelnder): Promise<InstalliertesPaket> {
    const alt = (await this.d.listePakete()).find((p) => p.id === id);
    if (!alt) throw new Fachfehler(404, `„${id}“ ist nicht installiert.`);
    if (alt.herkunft.art !== 'katalog') throw new Fachfehler(409, 'Ein hochgeladenes Paket aktualisierst du durch erneutes Hochladen einer höheren Version.');
    const quelle = await this.erlaubt(alt.herkunft.url);
    if (quelle !== this.katalogUrl && e.bestaetigt !== true) throw new Fachfehler(409, 'Dieses Paket kommt nicht aus dem offiziellen Katalog und ist nicht vom DMS-Projekt geprüft. Bitte die Herkunft bestätigen.', { warnung: true });
    const { paket, v, katalog } = await this.lade(id, e.version ? String(e.version) : undefined, quelle);
    const plan = await this.plane(paket, v, katalog);
    const fehlen = plan.abhaengigkeiten.filter((a) => !a.installiert);
    if (fehlen.length) plan.probleme.push(`Es fehlen Pakete: ${fehlen.map((a) => `${a.id} ${a.bereich}`).join(', ')}.`);
    if (plan.probleme.length) throw new Fachfehler(409, plan.probleme[0], { gruende: plan.probleme });
    Paketverwaltung.rechteBestaetigen(plan, e);
    const neu = await this.lege(paket, alt.herkunft, v, plan, false, von, alt);
    log.info('Paket aktualisiert', { von: von.email, paket: id, vorher: alt.version, version: neu.version, neueTypen: plan.typen.filter((t) => !t.vorhanden && !t.geloescht).length, neueSichten: plan.sichten.filter((s) => !s.vorhanden).length });
    return neu;
  }

  /* ---------- Einstellungen (#197) ---------- */

  private async beschreibungVon(id: string) {
    const p = (await this.d.listePakete()).find((x) => x.id === id);
    if (!p) throw new Fachfehler(404, `„${id}“ ist nicht installiert.`);
    if (!p.einstellungen) throw new Fachfehler(404, `„${p.name}“ hat keine Einstellungen.`);
    return { p, b: p.einstellungen };
  }

  /** Alles, was es zur Auswahl gibt: Mappentypen mit Feldern, Benutzer, Rollen, Sichten. */
  private async auswahl(p: InstalliertesPaket) {
    const typen = await this.d.listeTypen();
    const installierte = await this.d.listePakete();
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
    const gespeichert = (await this.d.paketEinstellungen(id)) ?? { werte: {} };
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
    const alt = (await this.d.paketEinstellungen(id)) ?? { werte: {} };
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
    if (Object.keys(r.fehler).length) throw new Fachfehler(422, 'Bitte die markierten Einstellungen prüfen.', { felderFehler: r.fehler, gruende: Object.values(r.fehler) });
    const geaendert = Object.keys(r.werte).filter((k) => JSON.stringify(r.werte[k]) !== JSON.stringify(alt.werte[k]));
    await this.d.setzePaketEinstellungen(id, { ...alt, werte: r.werte });
    if (geaendert.length) {
      log.info(`Einstellungen von Paket ${p.name} geändert (Felder ${geaendert.join(', ')})`, { von: von.email, paket: id, felder: geaendert });
      try { this.o.laeufer?.ereignis?.(id, 'paket.einstellungen_geaendert', geaendert); } catch { /* das Paket entscheidet selbst */ }
    }
    return this.einstellungen(id);
  }

  /** Einstellungen im Klartext – nur für das eigene Paket über den Paket-Läufer, nie über die API. */
  async einstellungenFuerPaket(id: string): Promise<Record<string, unknown>> {
    const { b } = await this.beschreibungVon(id);
    const w = structuredClone((await this.d.paketEinstellungen(id))?.werte ?? {});
    const klar = (f: EinstellungFeld, v: unknown) => (f.typ === 'geheim' && typeof v === 'string' ? this.d.entschluessele(v) : v);
    for (const f of abschnittsfelder(b)) w[f.schluessel] = klar(f, w[f.schluessel]);
    for (const l of listen(b)) for (const e of (Array.isArray(w[l.schluessel]) ? w[l.schluessel] as Record<string, unknown>[] : [])) for (const f of l.felder) e[f.schluessel] = klar(f, e[f.schluessel]);
    return w;
  }

  /** Statusbereich: schreibt nur das Paket (über den Läufer); in der Oberfläche schreibgeschützt. */
  async setzeStatus(id: string, status: { letzterLauf: string | null; meldungen: string[] }) {
    const alt = (await this.d.paketEinstellungen(id)) ?? { werte: {} };
    await this.d.setzePaketEinstellungen(id, { ...alt, status: { letzterLauf: status.letzterLauf, meldungen: status.meldungen.slice(-20).map((m) => String(m).slice(0, 500)) } });
  }

  /** Aktion aus dem Manifest ausführen; die Antwort des Pakets als Text, mit Zeitgrenze. */
  async aktion(id: string, schluessel: string, von: Handelnder): Promise<{ ok: boolean; text: string }> {
    const { p, b } = await this.beschreibungVon(id);
    const a = b.aktionen.find((x) => x.schluessel === schluessel);
    if (!a) throw new Fachfehler(404, 'Diese Aktion gibt es nicht.');
    const fehlend = fehlendePflicht(b, (await this.d.paketEinstellungen(id))?.werte ?? {});
    if (fehlend.length) return { ok: false, text: `Einstellungen nötig: ${fehlend.join(', ')}.` };
    if (!this.o.laeufer) return { ok: false, text: 'Pakete mit Code laufen in diesem DMS noch nicht (der Paket-Läufer fehlt). Die Aktion lässt sich deshalb noch nicht ausführen.' };
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

  /** Entfernen: nur ohne Mappen der Typen des Pakets und wenn kein anderes Paket davon abhängt. */
  async entferne(id: string, von: Handelnder, behalten = false): Promise<void> {
    const alle = await this.d.listePakete();
    const p = alle.find((x) => x.id === id);
    if (!p) throw new Fachfehler(404, `„${id}“ ist nicht installiert.`);
    const gruende: string[] = alle.filter((x) => x.id !== id && id in x.abhaengigkeiten).map((x) => `Das Paket „${x.name}“ braucht „${p.name}“.`);
    const typIds = Object.values(p.typen);
    gruende.push(...await this.d.belegteTypen(typIds));
    if (gruende.length) throw new Fachfehler(409, `„${p.name}“ lässt sich noch nicht entfernen.`, { gruende });
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
      if (runde > 0 && offen.length === vorher) throw new Fachfehler(409, `„${p.name}“ lässt sich nicht ganz entfernen.`, { gruende: fehler });
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
    await this.d.loeschePaket(id);
    if (p.laeufer) { await this.d.loeschePaketCode(id); await this.d.loescheEreignisse(id); await this.d.setzePaketSpeicher(id, null).catch(() => {}); await this.o.laeufer?.codeGeaendert?.(); }
    // Einstellungen (#197): nur auf ausdrücklichen Wunsch für eine spätere Neuinstallation behalten.
    if (!behalten) await this.d.setzePaketEinstellungen(id, null);
    log.info('Paket entfernt', { von: von.email, paket: id, version: p.version, einstellungenBehalten: behalten });
  }
}
