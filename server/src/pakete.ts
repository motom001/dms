/**
 * Paketverwaltung, Stufe 1 (#188): Konfigurationspakete aus dem offiziellen Katalog ansehen,
 * installieren, aktualisieren und entfernen. Paketformat: motom001/dms-registry.
 *
 * - Angelegt wird über dieselben Funktionen wie in der Werkbank (mit allen Prüfregeln).
 * - Schlüssel bekommen das Paket-Präfix (<paket>_<schluessel>), Verweise <paket>:<schluessel> werden aufgelöst.
 * - Scheitert etwas, wird zurückgerollt: Es bleibt nichts halb angelegt.
 * - Ein Update ergänzt nur (neue Typen, Felder, Register, Sichten); es löscht und überschreibt nichts.
 */
import { createHash, randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { parse as yamlLesen } from 'yaml';
import type { Feld, Mappentyp, Register } from '../../shared/src/model';
import { BEREICH, dmsPasst, liesKatalog, neuestePassende, OFFIZIELLER_KATALOG, PAKET_ID, passt, vergleicheVersion, VERSION, type InstalliertesPaket, type Katalog, type KatalogPaket, type KatalogVersion } from '../../shared/src/pakete';
import { kinderVon, OPERATOREN, type Bedingung, type Operator, type Sicht } from '../../shared/src/sichten';
import { EINTRAG_ID, einstellungsAenderung, fehlendePflicht, liesBeschreibung, listen, pruefeWerte, ueberfuehre, abschnittsfelder, type EinstellungFeld, type Einstellungsbeschreibung, type GeheimStand } from '../../shared/src/paketeinstellungen';
import type { Dienst } from './dienst';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { crc32 } from './zip';

const log = protokoll.modul('werkbank');

/* ---------- ZIP lesen ---------- */

export const ARCHIV_MAX = 10 * 1024 * 1024;
const ENTPACKT_MAX = 20 * 1024 * 1024;
const DATEIEN_MAX = 500;

/** Liest ein ZIP-Archiv (gespeichert oder Deflate) mit Obergrenzen gegen ZIP-Bomben. */
export function liesZip(buf: Buffer): Map<string, Buffer> {
  const kaputt = () => new Fachfehler(422, 'Das Archiv ist kein gültiges ZIP.');
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw kaputt();
  const anzahl = buf.readUInt16LE(e + 10);
  if (anzahl > DATEIEN_MAX) throw new Fachfehler(422, `Das Archiv enthält mehr als ${DATEIEN_MAX} Dateien.`);
  let p = buf.readUInt32LE(e + 16);
  const dateien = new Map<string, Buffer>();
  let gesamt = 0;
  for (let n = 0; n < anzahl; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw kaputt();
    const flags = buf.readUInt16LE(p + 8), methode = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), klen = buf.readUInt16LE(p + 32);
    const lokal = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen).replace(/\\/g, '/');
    p += 46 + nlen + elen + klen;
    if (name.endsWith('/')) continue;
    if (flags & 1) throw new Fachfehler(422, 'Verschlüsselte Archive gehen nicht.');
    if (name.startsWith('/') || name.split('/').includes('..')) throw new Fachfehler(422, `Ungültiger Dateiname im Archiv: ${name}`);
    gesamt += usize;
    if (gesamt > ENTPACKT_MAX) throw new Fachfehler(422, 'Das Archiv ist entpackt zu groß.');
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
export interface PaketBeispiel { typ: string; werte: Record<string, unknown> }
export interface Paket { manifest: Manifest; typen: PaketTyp[]; sichten: PaketSicht[]; beispiele: PaketBeispiel[]; readme: string; einstellungen: Einstellungsbeschreibung | null }

const SCHLUESSEL = /^[a-z][a-z0-9_]{0,39}$/;
const TYPVERWEIS = /^([a-z][a-z0-9_]{1,19}:)?[a-z][a-z0-9_]{0,39}$/;
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
  const beispiele = liste('beispiele').map((b): PaketBeispiel => ({ typ: str(b.typ), werte: istObjekt(b.werte) ? b.werte : {} }));
  const doppelt = (l: string[]) => l.filter((x, i) => l.indexOf(x) !== i);
  for (const s of doppelt(typen.map((t) => t.schluessel))) fehler.push(`mappentypen: Kennung „${s}“ doppelt.`);
  for (const s of doppelt(sichten.map((t) => t.schluessel))) fehler.push(`sichten: Kennung „${s}“ doppelt.`);
  // Einstellungen (#197): code.einstellungen und code.aktionen.
  const einst = liesBeschreibung(m.code);
  fehler.push(...einst.fehler.map((f) => `manifest.yaml: code.${f}`));
  if (fehler.length) throw new Fachfehler(422, 'Das Paket ist ungültig.', { gruende: fehler });
  return {
    manifest: {
      id: str(m.id), name: str(m.name).trim(), version: str(m.version), beschreibung: str(m.beschreibung),
      autor: { name: str((m.autor as Record<string, unknown>)?.name), github: str((m.autor as Record<string, unknown>)?.github) },
      lizenz: str(m.lizenz), dms: str(m.dms), abhaengigkeiten: Object.fromEntries(Object.entries(abh).map(([k, v]) => [k, str(v)])),
      ...(m.code !== undefined ? { code: m.code } : {}),
    },
    typen, sichten, beispiele, readme: dateien.get('README.md')?.toString('utf8') ?? '', einstellungen: einst.beschreibung,
  };
}

/* ---------- Plan: was angelegt bzw. ergänzt wird ---------- */

export interface TypPlan {
  schluessel: string; dmsSchluessel: string; name: string; felder: number;
  /** Bei Update: Typ gibt es schon; nur neue Felder und Register. */
  vorhanden: boolean; neueFelder: string[]; neueRegister: string[];
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
}
export interface InstallierenEingabe {
  id?: string; version?: string; namen?: Record<string, string>; sichtNamen?: Record<string, string>; beispiele?: boolean; mitAbhaengigkeiten?: boolean;
  /** Katalogadresse (#189); ohne: der offizielle Katalog. */
  quelle?: string;
  /** Hochgeladenes Paket (#189). */
  upload?: string;
  /** Herkunft außerhalb des offiziellen Katalogs ausdrücklich bestätigt (#189). */
  bestaetigt?: boolean;
}

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

export class Paketverwaltung {
  private kataloge = new Map<string, { katalog: Katalog; zeit: number }>();
  private uploads = new Map<string, Hochgeladen>();

  constructor(private d: Dienst, private o: PaketOptionen) {}

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
    if (m.code !== undefined) hinweise.push('Das Paket enthält Code. Er läuft erst, wenn es im DMS den Paket-Läufer gibt; Einstellungen lassen sich schon pflegen.');
    if (ich && vergleicheVersion(m.version, ich.version) <= 0) probleme.push(`Version ${ich.version} ist schon installiert.`);
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
    };
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
    for (const a of fehlen) {
      if (!a.verfuegbar) throw new Fachfehler(409, `Die Abhängigkeit „${a.id}“ (${a.bereich}) gibt es im Katalog nicht.`);
      // Abhängigkeiten aus derselben Quelle; bei hochgeladenen Paketen aus dem offiziellen Katalog.
      await this.installiere({ id: a.id, version: a.verfuegbar, beispiele: false, mitAbhaengigkeiten: true, quelle: quelle ?? this.katalogUrl, bestaetigt: e.bestaetigt }, von);
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
    const ziel = (vw: string, nurAngelegt: boolean): string | null => {
      const [p, s] = vw.includes(':') ? vw.split(':') : [m.id, vw];
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
      const offen = new Set(t.felder.filter((f) => f.ziel && f.ziel.split(':').pop() !== t.schluessel && ziel(f.ziel, nurAngelegt) === null).map((f) => f.key));
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
        if (!p.vorhanden || (!p.neueFelder.length && !p.neueRegister.length)) continue;
        const aktuell = vorher.get(ids.get(t.schluessel)!)!;
        const neu = eingabe(t, false).daten;
        const felder = [...aktuell.felder, ...neu.felder.filter((f) => !aktuell.felder.some((g) => g.key === f.key))];
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
        for (const b of paket.beispiele) {
          const typId = ziel(b.typ, false)!;
          // Beträge dürfen im Paket als Zahl stehen.
          const felder = (await this.d.listeTypen()).find((t) => t.id === typId)?.felder ?? [];
          const werte = Object.fromEntries(Object.entries(b.werte).map(([k, w]) => {
            const f = felder.find((x) => x.key === k);
            return [k, f?.typ === 'betrag' && typeof w === 'number' ? { betrag: w, waehrung: f.waehrung || 'EUR' } : w];
          }));
          try { mappen.push((await this.d.legeMappeAn({ typId, werte }, von.id)).id); } catch (f) { throw new Fachfehler(422, `Beispiel: ${meldungen(f)}`); }
        }
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
        einstellungen: paket.einstellungen, code: m.code !== undefined,
        ...(v ? { links: { readme: v.readme, changelog: v.changelog, quelle: v.quelle } } : alt?.links ? { links: alt.links } : {}),
      };
      await this.d.speicherePaket(datensatz);
      return datensatz;
    } catch (f) {
      await zurueck();
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
  async aktualisiere(id: string, e: { version?: string; bestaetigt?: boolean }, von: Handelnder): Promise<InstalliertesPaket> {
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
    return {
      typen: typen.map((t) => ({ id: t.id, name: t.name, felder: t.felder.filter((f) => f.typ !== 'passwort').map((f) => ({ key: f.key, label: f.label })) })),
      benutzer: this.o.benutzer ? await this.o.benutzer() : [],
      rollen: (await this.d.listeRollen()).map((r) => ({ id: r.id, name: r.name })),
      sichten: (await this.d.listeSichten()).map((s) => ({ id: s.id, name: s.name })),
      typVon: (vw: string) => {
        const [paket, s] = vw.includes(':') ? vw.split(':') : [p.id, vw];
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
    // Einstellungen (#197): nur auf ausdrücklichen Wunsch für eine spätere Neuinstallation behalten.
    if (!behalten) await this.d.setzePaketEinstellungen(id, null);
    log.info('Paket entfernt', { von: von.email, paket: id, version: p.version, einstellungenBehalten: behalten });
  }
}
