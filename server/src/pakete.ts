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
export interface Paket { manifest: Manifest; typen: PaketTyp[]; sichten: PaketSicht[]; beispiele: PaketBeispiel[]; readme: string }

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
    if (!SCHLUESSEL.test(str(t.schluessel))) fehler.push(`${wo}: ungültiger Schlüssel.`);
    if (!str(t.name).trim()) fehler.push(`${wo}: Name fehlt.`);
    const felder = Array.isArray(t.felder) ? t.felder.filter(istObjekt) as unknown as PaketFeld[] : [];
    const register = Array.isArray(t.register) ? t.register.filter(istObjekt) as unknown as PaketRegister[] : [];
    for (const f of felder) {
      if (!SCHLUESSEL.test(str(f.key))) fehler.push(`${wo}: Feld mit ungültigem Schlüssel „${str(f.key)}“.`);
      if (f.ziel !== undefined && !TYPVERWEIS.test(str(f.ziel))) fehler.push(`${wo}: Feld „${f.key}“ verweist ungültig auf „${str(f.ziel)}“.`);
    }
    if (!register.length) fehler.push(`${wo}: mindestens ein Register nötig.`);
    return { schluessel: str(t.schluessel), name: str(t.name).trim(), beschreibung: str(t.beschreibung), titelVorlage: t.titelVorlage ? str(t.titelVorlage) : undefined, felder, register, trefferliste: Array.isArray(t.trefferliste) ? t.trefferliste.map(str) : undefined };
  });
  const sichten = liste('sichten').map((s, i): PaketSicht => {
    if (!SCHLUESSEL.test(str(s.schluessel))) fehler.push(`sichten[${i + 1}]: ungültiger Schlüssel.`);
    if (!str(s.name).trim()) fehler.push(`sichten[${i + 1}]: Name fehlt.`);
    return {
      schluessel: str(s.schluessel), name: str(s.name).trim(), beschreibung: s.beschreibung ? str(s.beschreibung) : undefined, eltern: s.eltern ? str(s.eltern) : undefined,
      typen: Array.isArray(s.typen) ? s.typen.map(str) : [], trefferliste: s.trefferliste ? str(s.trefferliste) : undefined,
      bedingungen: Array.isArray(s.bedingungen) ? s.bedingungen.filter(istObjekt).map((b) => ({ feld: str(b.feld), operator: str(b.operator), wert: b.wert })) : [],
    };
  });
  const beispiele = liste('beispiele').map((b): PaketBeispiel => ({ typ: str(b.typ), werte: istObjekt(b.werte) ? b.werte : {} }));
  const doppelt = (l: string[]) => l.filter((x, i) => l.indexOf(x) !== i);
  for (const s of doppelt(typen.map((t) => t.schluessel))) fehler.push(`mappentypen: Schlüssel „${s}“ doppelt.`);
  for (const s of doppelt(sichten.map((t) => t.schluessel))) fehler.push(`sichten: Schlüssel „${s}“ doppelt.`);
  if (fehler.length) throw new Fachfehler(422, 'Das Paket ist ungültig.', { gruende: fehler });
  return {
    manifest: {
      id: str(m.id), name: str(m.name).trim(), version: str(m.version), beschreibung: str(m.beschreibung),
      autor: { name: str((m.autor as Record<string, unknown>)?.name), github: str((m.autor as Record<string, unknown>)?.github) },
      lizenz: str(m.lizenz), dms: str(m.dms), abhaengigkeiten: Object.fromEntries(Object.entries(abh).map(([k, v]) => [k, str(v)])),
      ...(m.code !== undefined ? { code: m.code } : {}),
    },
    typen, sichten, beispiele, readme: dateien.get('README.md')?.toString('utf8') ?? '',
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
  abhaengigkeiten: AbhaengigkeitPlan[];
  typen: TypPlan[]; sichten: SichtPlan[]; beispiele: number;
  /** Was die Installation verhindert. */
  probleme: string[];
}
export interface InstallierenEingabe { id: string; version?: string; namen?: Record<string, string>; sichtNamen?: Record<string, string>; beispiele?: boolean; mitAbhaengigkeiten?: boolean }

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
  if (!(b.operator in OPERATOREN)) throw new Fachfehler(422, `Unbekannter Operator „${b.operator}“ in einer Sicht.`);
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
  katalogUrl?: string;
}

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

export class Paketverwaltung {
  private letzter: { url: string; katalog: Katalog; zeit: number } | null = null;

  constructor(private d: Dienst, private o: PaketOptionen) {}

  get katalogUrl() { return this.o.katalogUrl ?? OFFIZIELLER_KATALOG; }
  private abruf(url: string) { return this.o.abruf ? this.o.abruf(url) : holeDaten(url); }

  /** Katalog abrufen – nur auf Knopfdruck (bzw. für Vorschau und Installation). */
  async katalog(): Promise<{ url: string; katalog: Katalog; abgerufen: string }> {
    const url = this.katalogUrl;
    let katalog: Katalog;
    try { katalog = liesKatalog(JSON.parse((await this.abruf(url)).toString('utf8'))); }
    catch (e) { throw new Fachfehler(502, `Der Katalog lässt sich nicht abrufen: ${(e as Error).message}`); }
    this.letzter = { url, katalog, zeit: Date.now() };
    return { url, katalog, abgerufen: new Date().toISOString() };
  }

  /** Zuletzt abgerufener Katalog, wenn er höchstens 15 Minuten alt ist; sonst neu. */
  private async aktuellerKatalog() {
    if (this.letzter && this.letzter.url === this.katalogUrl && Date.now() - this.letzter.zeit < 15 * 60_000) return this.letzter;
    const k = await this.katalog();
    return { url: k.url, katalog: k.katalog, zeit: Date.now() };
  }

  async installierte(): Promise<InstalliertesPaket[]> { return this.d.listePakete(); }

  /** Paket einer Version aus dem Katalog holen und gegen die Prüfsumme prüfen. */
  async lade(id: string, version?: string): Promise<{ paket: Paket; kp: KatalogPaket; v: KatalogVersion; url: string }> {
    const { katalog, url } = await this.aktuellerKatalog();
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
    return { paket, kp, v, url };
  }

  /** Vorschau: was angelegt bzw. ergänzt wird, Namenskonflikte, Version und Abhängigkeiten. */
  async vorschau(e: { id: string; version?: string }): Promise<Vorschau> {
    const { paket, v } = await this.lade(String(e.id), e.version ? String(e.version) : undefined);
    return this.plane(paket, v);
  }

  private async plane(paket: Paket, v?: KatalogVersion, namen: Record<string, string> = {}, sichtNamen: Record<string, string> = {}): Promise<Vorschau> {
    const m = paket.manifest;
    const installierte = await this.d.listePakete();
    const ich = installierte.find((p) => p.id === m.id) ?? null;
    const typen = await this.d.listeTypen();
    const sichten = await this.d.listeSichten();
    const probleme: string[] = [];
    const dmsVersion = this.o.version();
    const dmsOk = dmsPasst(dmsVersion, m.dms);
    if (!dmsOk) probleme.push(`Das Paket braucht DMS ${m.dms}; dieses DMS hat Version ${dmsVersion}. Bitte zuerst das DMS aktualisieren.`);
    if (m.code !== undefined) probleme.push('Pakete mit Code lassen sich noch nicht installieren.');
    if (ich && vergleicheVersion(m.version, ich.version) <= 0) probleme.push(`Version ${ich.version} ist schon installiert.`);
    const katalog = this.letzter?.katalog;
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
      if (typen.some((x) => x.schluessel === dmsSchluessel)) probleme.push(`Den Schlüssel „${dmsSchluessel}“ hat schon ein Mappentyp. Dieses Paket war wohl schon einmal installiert; benenne den Typ in der Werkbank um oder lösche ihn.`);
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
      const konflikt = geschwister.includes(name.toLowerCase()) ? `Eine Sicht „${name}“ gibt es schon.` : null;
      return { schluessel: s.schluessel, name, eltern: s.eltern ?? null, vorhanden: false, konflikt, vorschlag: konflikt ? freierName(name, m.name, new Set(geschwister)) : null };
    });
    return {
      paket: { id: m.id, name: m.name, version: m.version, beschreibung: m.beschreibung, lizenz: m.lizenz, autor: m.autor, dms: m.dms, abhaengigkeiten: m.abhaengigkeiten, readme: v?.readme ?? null, changelog: v?.changelog ?? null, quelle: v?.quelle ?? null },
      dmsVersion, dmsOk, installiert: ich?.version ?? null, update: !!ich,
      abhaengigkeiten, typen: typPlaene, sichten: sichtPlaene, beispiele: paket.beispiele.length, probleme,
    };
  }

  /** Installieren aus dem Katalog; mit `mitAbhaengigkeiten` vorher fehlende Abhängigkeiten. */
  async installiere(e: InstallierenEingabe, von: Handelnder): Promise<InstalliertesPaket> {
    const id = String(e.id ?? '');
    if ((await this.d.listePakete()).some((p) => p.id === id)) throw new Fachfehler(409, `„${id}“ ist schon installiert. Aktualisieren geht über „Aktualisieren“.`);
    const { paket, v, url } = await this.lade(id, e.version ? String(e.version) : undefined);
    const vorschau = await this.plane(paket, v, e.namen ?? {}, e.sichtNamen ?? {});
    const fehlen = vorschau.abhaengigkeiten.filter((a) => !a.installiert);
    if (fehlen.length && !e.mitAbhaengigkeiten) {
      throw new Fachfehler(409, `Es fehlen Pakete, die „${paket.manifest.name}“ braucht: ${fehlen.map((a) => `${a.id} ${a.bereich}`).join(', ')}.`, { gruende: fehlen.map((a) => (a.verfuegbar ? `${a.id}: im Katalog gibt es ${a.verfuegbar}` : `${a.id}: nicht im Katalog`)) });
    }
    if (vorschau.probleme.length) throw new Fachfehler(409, vorschau.probleme[0], { gruende: vorschau.probleme });
    for (const a of fehlen) {
      if (!a.verfuegbar) throw new Fachfehler(409, `Die Abhängigkeit „${a.id}“ (${a.bereich}) gibt es im Katalog nicht.`);
      await this.installiere({ id: a.id, version: a.verfuegbar, beispiele: false, mitAbhaengigkeiten: true }, von);
    }
    const konflikte = [...vorschau.typen, ...vorschau.sichten].filter((x) => x.konflikt);
    if (konflikte.length) throw new Fachfehler(409, 'Einige Namen gibt es schon. Bitte andere wählen.', { gruende: konflikte.map((x) => `${x.konflikt} Vorschlag: „${x.vorschlag}“.`), konflikte: true });
    const datensatz = await this.lege(paket, { art: 'katalog', url }, v, vorschau, e.beispiele === true, von, null);
    log.info('Paket installiert', { von: von.email, paket: id, version: paket.manifest.version, herkunft: url, typen: Object.keys(datensatz.typen).length, sichten: Object.keys(datensatz.sichten).length });
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
        if (s.eltern && !elternId) throw new Fachfehler(422, `Sicht „${s.name}“: Elternsicht „${s.eltern}“ fehlt.`);
        const position = Math.max(0, ...kinderVon(alle, elternId).map((x) => x.position)) + 10;
        const typen = (s.typen ?? []).map((x) => ziel(x, false)!).filter(Boolean);
        try {
          const neu = await this.d.legeSichtAn({ name: sp.name, beschreibung: s.beschreibung ?? '', elternId, position, typen, bedingungen: (s.bedingungen ?? []).map(bedingungAus), ...(s.trefferliste ? { trefferliste: s.trefferliste } : {}) });
          neueSichten.push(neu.id);
          sichtMap[s.schluessel] = neu.id;
        } catch (f) { throw new Fachfehler(422, `Sicht „${sp.name}“: ${meldungen(f)}`); }
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
      const jetzt = new Date().toISOString();
      const datensatz: InstalliertesPaket = {
        id: m.id, name: m.name, version: m.version, beschreibung: m.beschreibung, lizenz: m.lizenz, autor: m.autor,
        herkunft: alt?.herkunft ?? herkunft,
        installiert: alt?.installiert ?? jetzt, installiertVon: alt ? alt.installiertVon : von.email,
        aktualisiert: alt ? jetzt : null, aktualisiertVon: alt ? von.email : null,
        typen: typMap, sichten: sichtMap, abhaengigkeiten: m.abhaengigkeiten,
        ...(v ? { links: { readme: v.readme, changelog: v.changelog, quelle: v.quelle } } : alt?.links ? { links: alt.links } : {}),
      };
      await this.d.speicherePaket(datensatz);
      return datensatz;
    } catch (f) {
      await zurueck();
      throw f;
    }
  }

  /** Neuere Versionen im Katalog (auf Knopfdruck). */
  async updates(): Promise<Array<{ id: string; installiert: string; neu: string; changelog: string | null }>> {
    const { katalog } = await this.katalog();
    const erg = [];
    for (const p of await this.d.listePakete()) {
      if (p.herkunft.art !== 'katalog' || p.herkunft.url !== this.katalogUrl) continue;
      const kp = katalog.pakete.find((x) => x.id === p.id);
      const v = kp?.versionen.find((x) => x.version === kp.aktuell) ?? kp?.versionen[0];
      if (v && vergleicheVersion(v.version, p.version) > 0) erg.push({ id: p.id, installiert: p.version, neu: v.version, changelog: v.changelog });
    }
    return erg;
  }

  /** Update: ergänzt nur – neue Typen, Felder, Register, Sichten. */
  async aktualisiere(id: string, e: { version?: string }, von: Handelnder): Promise<InstalliertesPaket> {
    const alt = (await this.d.listePakete()).find((p) => p.id === id);
    if (!alt) throw new Fachfehler(404, `„${id}“ ist nicht installiert.`);
    if (alt.herkunft.art !== 'katalog') throw new Fachfehler(409, 'Ein hochgeladenes Paket aktualisierst du durch erneutes Hochladen einer höheren Version.');
    const { paket, v } = await this.lade(id, e.version ? String(e.version) : undefined);
    const plan = await this.plane(paket, v);
    const fehlen = plan.abhaengigkeiten.filter((a) => !a.installiert);
    if (fehlen.length) plan.probleme.push(`Es fehlen Pakete: ${fehlen.map((a) => `${a.id} ${a.bereich}`).join(', ')}.`);
    if (plan.probleme.length) throw new Fachfehler(409, plan.probleme[0], { gruende: plan.probleme });
    const neu = await this.lege(paket, alt.herkunft, v, plan, false, von, alt);
    log.info('Paket aktualisiert', { von: von.email, paket: id, vorher: alt.version, version: neu.version, neueTypen: plan.typen.filter((t) => !t.vorhanden && !t.geloescht).length, neueSichten: plan.sichten.filter((s) => !s.vorhanden).length });
    return neu;
  }

  /** Entfernen: nur ohne Mappen der Typen des Pakets und wenn kein anderes Paket davon abhängt. */
  async entferne(id: string, von: Handelnder): Promise<void> {
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
    log.info('Paket entfernt', { von: von.email, paket: id, version: p.version });
  }
}
