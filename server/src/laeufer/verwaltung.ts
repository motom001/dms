/**
 * Paket-Läufer (#338), Seite des DMS: startet und überwacht den Läufer-Prozess, gibt ihm die Pakete mit Code,
 * stellt Ereignisse zu (mit Wiederholung) und führt Anfragen der Pakete an die API aus – jeweils mit dem
 * Schlüssel des Dienstkontos des Pakets. Der Schlüssel verlässt diesen Prozess nie.
 */
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Benutzer } from '../../../shared/src/model';
import type { InstalliertesPaket, LaeuferZustand } from '../../../shared/src/pakete';
import type { ApiSchluesselDienst } from '../apischluessel';
import type { Dienst } from '../dienst';
import type { PaketEreignis } from '../repo';
import type { Konten } from '../konten';
import type { PaketLaeufer } from '../pakete';
import { ladeArgumente } from './modul';
import { protokoll } from '../protokoll';
import type { AnLaeufer, Grenzen, VomLaeufer } from './prozess';
import type { Hostantwort } from './arbeiter';

const log = protokoll.modul('werkbank');

export const STANDARD_GRENZEN: Grenzen = { speicherMB: 256, sekunden: 120, parallel: 2 };
/** Wiederholungen nach Fehlschlag: 1, 5, 30 Minuten, 2, 6 Stunden – danach aufgegeben. */
const WARTEN_MIN = [1, 5, 30, 120, 360];

const SPEICHER_MAX = 64 * 1024;
const LETZTE = 20;

/** Anfrage an die eigene API (im Betrieb über fastify.inject, ohne Netz). */
export type ApiAufruf = (a: { methode: string; pfad: string; kopf: Record<string, string>; body?: Buffer }) => Promise<{ status: number; kopf: Record<string, string>; body: Buffer }>;

export interface LaeuferOptionen {
  dienst: Dienst;
  konten: Konten;
  schluessel: ApiSchluesselDienst;
  api: ApiAufruf;
  /** Einstellungen eines Pakets im Klartext (nur für das Paket selbst). */
  einstellungen: (paket: string) => Promise<Record<string, unknown>>;
  /** Kleiner eigener Speicher je Paket (Schlüssel → Wert). */
  speicher: { lies(paket: string): Promise<Record<string, string>>; schreibe(paket: string, werte: Record<string, string>): Promise<void> };
  /** Im Wartungsmodus keine Aufrufe. */
  pausiert?: () => boolean;
  grenzen?: Partial<Grenzen>;
  /** Tests: kürzere Abstände. */
  abrufMs?: number;
}

export interface PaketStand {
  id: string; name: string; version: string; dienstkonto: string | null;
  geladen: boolean; fehler: string | null;
  aufrufe: number; fehlgeschlagen: number; letzterAufruf: string | null; dauerMs: number | null; speicherMB: number | null;
  ereignisse: { offen: number; aufgegeben: number; zugestellt: number };
  letzte: Array<{ zeit: string; art: string; ok: boolean; text: string }>;
  protokoll: Array<{ zeit: string; stufe: number; text: string }>;
}

interface Aufruf { ok: (r: Extract<VomLaeufer, { art: 'ergebnis' }>) => void }
type Ergebnis = Extract<VomLaeufer, { art: 'ergebnis' }> & { ohneVersuch?: boolean };
/** Ergebnis ohne Aufruf (Läufer beendet, abgestürzt, Zeit abgelaufen). ohneVersuch: zählt nicht als Versuch des Ereignisses. */
const abbruch = (fehler: string, ohneVersuch = false): Ergebnis => ({ art: 'ergebnis', nr: 0, paket: '', ok: false, rc: null, text: '', ms: 0, speicherMB: 0, fehler, ohneVersuch });

export class Paketlaeufer implements PaketLaeufer {
  private kind: ChildProcess | null = null;
  private bereit = false;
  private schluessel = new Map<string, string>();
  private konto = new Map<string, Benutzer>();
  private pakete: InstalliertesPaket[] = [];
  private ladefehler = new Map<string, string | null>();
  private stand = new Map<string, Omit<PaketStand, 'id' | 'name' | 'version' | 'dienstkonto' | 'geladen' | 'fehler' | 'ereignisse'>>();
  private aufrufe = new Map<number, Aufruf>();
  private nr = 1;
  private uhr: ReturnType<typeof setInterval> | null = null;
  /** Pakete, deren Ereignisse gerade zugestellt werden (je Paket eine Kette, damit ein langsames Paket die anderen nicht bremst). */
  private zustellend = new Set<string>();
  private holend = false;
  /** Abgleich der Pakete nacheinander (mehrere Installationen kurz hintereinander, #338-Review). */
  private abgleich: Promise<void> = Promise.resolve();
  private schluesselRecht = new Map<string, string>();
  private neustarts = 0;
  private aus = false;
  /** Zeitpunkt des letzten Absturzes (für die Werkbank, #403). */
  private absturz: string | null = null;
  /** Was der laufende Läufer-Prozess schon hat: Paket → Stand (Version, Modul, Zeitpunkt). Nur Geändertes wird neu geschickt (#403). */
  private gesendet = new Map<string, string>();
  readonly grenzen: Grenzen;

  constructor(private o: LaeuferOptionen) {
    this.grenzen = { ...STANDARD_GRENZEN, ...o.grenzen };
    o.dienst.ereignisWecker = () => void this.stelleZu();
  }

  /** Startet den Läufer, wenn es Pakete mit Code gibt; sonst erst, wenn eins installiert wird. */
  async start() {
    this.aus = false;
    await this.synchronisiere();
    this.uhr ??= setInterval(() => void this.stelleZu(), this.o.abrufMs ?? 5000);
    this.uhr.unref?.();
  }

  async stop() {
    this.aus = true;
    if (this.uhr) clearInterval(this.uhr);
    this.uhr = null;
    const k = this.kind; this.kind = null; this.bereit = false;
    this.beendeAufrufe(abbruch('Der Paket-Läufer wurde beendet.', true));
    if (k && k.exitCode === null) { k.kill(); await new Promise((ok) => { k.once('exit', ok); setTimeout(ok, 2000); }); }
  }

  /** Offene Aufrufe beenden – sonst warten Zustellung oder Aktion für immer. */
  private beendeAufrufe(r: Ergebnis) {
    const offen = [...this.aufrufe.values()];
    this.aufrufe.clear();
    for (const a of offen) a.ok(r);
  }

  /* ---------- PaketLaeufer (für die Paketverwaltung) ---------- */

  codeGeaendert(): Promise<void> { return this.synchronisiere().catch((e) => log.error('Paket-Läufer: Pakete nicht neu geladen', { fehler: (e as Error).message })); }


  ereignis(paket: string, name: 'paket.einstellungen_geaendert', felder: string[]) { void this.o.dienst.melde(name, { felder }, paket); }

  async aktion(paket: string, aktion: string, einstellungen: Record<string, unknown>): Promise<string> {
    if (this.o.pausiert?.()) throw new Error('Während der Wartung laufen keine Pakete. Bitte danach noch einmal.');
    const r = await this.rufe(paket, 'aktion', { aktion, einstellungen });
    if (!r.ok) throw new Error(r.fehler ?? 'Die Aktion ist fehlgeschlagen.');
    return r.text || 'Erledigt.';
  }

  /* ---------- Pakete und Dienstkonten ---------- */

  private synchronisiere(): Promise<void> {
    const weiter = this.abgleich.then(() => this.synchronisiereJetzt());
    this.abgleich = weiter.catch(() => {});
    return weiter;
  }

  private async synchronisiereJetzt() {
    const alle = await this.o.dienst.listePakete();
    this.pakete = alle.filter((p) => p.laeufer?.modul);
    // Dienstkonten: je Paket mit Code eins; für entfernte ausschalten.
    for (const p of this.pakete) {
      const b = await this.o.konten.dienstkonto(p.id, p.name);
      this.konto.set(p.id, b);
      const recht = p.laeufer!.rechte.schreiben.length || p.laeufer!.rechte.dokumente === 'schreiben' ? 'schreiben' : 'lesen';
      // Neuen Schlüssel nur für neue Pakete oder geänderte Rechte – laufende Aufrufe der anderen behalten ihren.
      if (!this.schluessel.has(p.id) || this.schluesselRecht.get(p.id) !== `${b.id}:${recht}`) {
        this.schluessel.set(p.id, await this.o.schluessel.fuerDienstkonto(b, recht));
        this.schluesselRecht.set(p.id, `${b.id}:${recht}`);
      }
    }
    for (const b of await this.o.konten.listeDienstkonten()) {
      if (b.aktiv && b.paketId && !this.pakete.some((p) => p.id === b.paketId)) { await this.o.konten.dienstkontoAus(b.paketId); this.schluessel.delete(b.paketId); this.schluesselRecht.delete(b.paketId); this.konto.delete(b.paketId); }
    }
    // Auch entfernte Pakete: ihre Konten bleiben als Paket-Konten bekannt (Historie), lösen aber nichts mehr aus.
    this.o.dienst.paketKonten = new Map((await this.o.konten.listeDienstkonten()).filter((b) => b.paketId).map((b) => [b.id, b.paketId!]));
    if (!this.pakete.length) { if (this.kind) await this.beendeKind(); return; }
    if (!this.kind) this.starteKind();
    else if (this.bereit) await this.sendePakete();
  }

  /** Schickt dem Läufer die Pakete – Code aus der Datenbank nur für neue und geänderte; unveränderte behält er (#403). */
  private async sendePakete() {
    const liste: Extract<AnLaeufer, { art: 'pakete' }>['pakete'] = [];
    const behalten: string[] = [];
    const gesendet = new Map<string, string>();
    for (const p of this.pakete) {
      const stand = JSON.stringify([p.version, p.laeufer!.modul, p.laeufer!.daten ?? [], p.laeufer!.netz, p.aktualisiert ?? p.installiert]);
      if (this.gesendet.get(p.id) === stand) { behalten.push(p.id); gesendet.set(p.id, stand); continue; }
      const code = await this.o.dienst.paketCode(p.id);
      const modul = code.find((d) => d.name === 'modul.wasm');
      if (!modul) { this.ladefehler.set(p.id, 'Der Code fehlt (nach einer Wiederherstellung bitte das Paket neu installieren).'); continue; }
      liste.push({ id: p.id, version: p.version, modul: new Uint8Array(modul.inhalt), daten: code.filter((d) => d.name.startsWith('daten/')).map((d) => ({ name: d.name.slice('daten/'.length), inhalt: new Uint8Array(d.inhalt) })), netz: p.laeufer!.netz });
      gesendet.set(p.id, stand);
    }
    this.gesendet = gesendet;
    this.sende({ art: 'pakete', pakete: liste, behalten, grenzen: this.grenzen });
  }

  private starteKind() {
    if (this.aus) return;
    const hier = fileURLToPath(import.meta.url);
    const ts = hier.endsWith('.ts');
    // .mjs: Node liest dann keine package.json außerhalb von dist/ (die das Berechtigungsmodell sperrt).
    const pfad = join(dirname(hier), ts ? 'prozess.ts' : 'prozess.mjs');
    // Im Betrieb mit dem Berechtigungsmodell von Node: nur Lesen im Programmordner, Worker erlaubt, sonst nichts
    // (kein Schreiben, keine Kindprozesse, kein Zugriff auf Schlüssel und Daten des DMS).
    // Gebaut liegen prozess.mjs und arbeiter.mjs neben index.js in dist/ (siehe „build“ in package.json); nur diesen Ordner lesen.
    const rechte = ts || process.env.DMS_LAEUFER_OHNE_BERECHTIGUNGEN === '1' ? [] : ['--permission', '--allow-worker', `--allow-fs-read=${dirname(hier)}`, '--disable-warning=SecurityWarning'];
    const kind = fork(pfad, [], { serialization: 'advanced', execArgv: [...ladeArgumente(process.execArgv), ...rechte], stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { NODE_ENV: process.env.NODE_ENV ?? 'production', PATH: process.env.PATH ?? '' } });
    this.kind = kind;
    this.bereit = false;
    this.gesendet = new Map(); // neuer Prozess: alles laden
    let zuletzt = '';
    kind.stdout?.on('data', (d: Buffer) => log.info('Paket-Läufer', { ausgabe: d.toString('utf8').slice(0, 500) }));
    kind.stderr?.on('data', (d: Buffer) => { const t = d.toString('utf8'); zuletzt = (zuletzt + t).slice(-600); log.warn('Paket-Läufer', { ausgabe: t.slice(0, 500) }); });
    kind.on('message', (m: VomLaeufer) => void this.verarbeite(m));
    kind.on('exit', (code, sig) => {
      if (this.kind !== kind) return;
      this.kind = null; this.bereit = false;
      if (!this.aus) this.absturz = new Date().toISOString();
      this.beendeAufrufe(abbruch(`Der Paket-Läufer ist abgestürzt (${sig ?? code})${zuletzt.trim() ? `: ${zuletzt.trim().split('\n').slice(-3).join(' ')}` : ''}.`));
      if (this.aus) return;
      log.error('Paket-Läufer beendet – Neustart', { code, signal: sig, neustarts: this.neustarts, ausgabe: zuletzt.slice(-300) });
      const warte = Math.min(60_000, 1000 * 2 ** Math.min(this.neustarts++, 6));
      setTimeout(() => { if (!this.aus && !this.kind && this.pakete.length) this.starteKind(); }, warte).unref?.();
    });
  }

  private async beendeKind() {
    const k = this.kind; this.kind = null; this.bereit = false;
    this.beendeAufrufe(abbruch('Der Paket-Läufer wurde beendet (keine Pakete mit Code mehr).', true));
    if (k) k.kill();
  }

  private sende(m: AnLaeufer) { this.kind?.send(m); }

  private async verarbeite(m: VomLaeufer) {
    switch (m.art) {
      case 'bereit': this.bereit = true; this.neustarts = 0; await this.sendePakete(); void this.stelleZu(); return;
      case 'geladen':
        for (const p of m.pakete) { this.ladefehler.set(p.id, p.fehler); if (p.fehler) log.warn('Paket-Läufer: Modul abgelehnt', { paket: p.id, fehler: p.fehler }); }
        return;
      case 'log': this.notiere(m.paket, { stufe: m.stufe, text: m.text }); return;
      case 'ergebnis': { const a = this.aufrufe.get(m.nr); this.aufrufe.delete(m.nr); a?.ok(m); return; }
      case 'frage': this.sende({ art: 'antwort', nr: m.nr, antwort: await this.beantworte(m.paket, m.anfrage).catch((e) => ({ status: 500, body: new TextEncoder().encode((e as Error).message) })) }); return;
    }
  }

  /** API-Anfragen eines Pakets – immer mit seinem eigenen Schlüssel, nur unter /api/v1. */
  private async beantworte(paket: string, q: Extract<VomLaeufer, { art: 'frage' }>['anfrage']): Promise<Hostantwort> {
    const t = (status: number, s: string): Hostantwort => ({ status, body: new TextEncoder().encode(s) });
    if (q.art === 'speicher_lesen' || q.art === 'speicher_schreiben') {
      const werte = await this.o.speicher.lies(paket);
      if (q.art === 'speicher_lesen') return q.schluessel in werte ? { status: 200, body: new TextEncoder().encode(werte[q.schluessel]) } : t(404, '');
      const neu = { ...werte, [q.schluessel.slice(0, 200)]: new TextDecoder().decode(q.wert) };
      if (JSON.stringify(neu).length > SPEICHER_MAX) return t(413, `Der Speicher eines Pakets ist auf ${SPEICHER_MAX / 1024} KB begrenzt.`);
      await this.o.speicher.schreibe(paket, neu);
      return t(200, '');
    }
    if (q.art !== 'api') return t(400, 'Unbekannte Anfrage.');
    const s = this.schluessel.get(paket);
    if (!s) return t(401, 'Kein Dienstkonto.');
    let a: { methode?: string; pfad?: string; typ?: string; body?: unknown };
    try { a = JSON.parse(q.json); } catch { return t(400, 'Ungültige Anfrage (JSON).'); }
    const methode = String(a.methode ?? 'GET').toUpperCase();
    const pfad = String(a.pfad ?? '');
    if (!/^\/[^\s]*$/.test(pfad) || pfad.includes('..') || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(methode)) return t(400, 'Ungültiger Pfad oder ungültige Methode.');
    const body = q.body ? Buffer.from(q.body) : a.body !== undefined ? Buffer.from(JSON.stringify(a.body)) : undefined;
    const kopf: Record<string, string> = { authorization: `Bearer ${s}`, ...(body ? { 'content-type': q.body ? String(a.typ ?? 'application/octet-stream') : 'application/json' } : {}) };
    const r = await this.o.api({ methode, pfad: `/api/v1${pfad}`, kopf, body });
    return { status: r.status, body: new Uint8Array(r.body) };
  }

  private notiere(paket: string, e: { stufe: number; text: string }) {
    const s = this.standVon(paket);
    s.protokoll.push({ zeit: new Date().toISOString(), ...e });
    if (s.protokoll.length > 50) s.protokoll.splice(0, s.protokoll.length - 50);
    (e.stufe >= 2 ? log.warn : log.info).call(log, `Paket ${paket}: ${e.text}`, { paket });
  }

  private standVon(paket: string) {
    let s = this.stand.get(paket);
    if (!s) { s = { aufrufe: 0, fehlgeschlagen: 0, letzterAufruf: null, dauerMs: null, speicherMB: null, letzte: [], protokoll: [] }; this.stand.set(paket, s); }
    return s;
  }

  /** Einen Aufruf ausführen und auf das Ergebnis warten. */
  private async rufe(paket: string, art: 'ereignis' | 'aktion', eingang: Record<string, unknown>): Promise<Ergebnis> {
    if (!this.kind || !this.bereit) return abbruch('Der Paket-Läufer läuft gerade nicht.', true);
    const p = this.pakete.find((x) => x.id === paket);
    if (!p) throw new Error('Dieses Paket hat keinen Code.');
    const nr = this.nr++;
    const json = JSON.stringify({ ...eingang, paket: { id: p.id, version: p.version }, einstellungen: eingang.einstellungen ?? await this.o.einstellungen(paket).catch(() => ({})) });
    // Eigene Zeitgrenze über der des Läufers: Antwortet der Läufer gar nicht mehr, hängt hier nichts.
    const r = await new Promise<Ergebnis>((ok) => {
      const uhr = setTimeout(() => { if (this.aufrufe.delete(nr)) ok(abbruch('Der Paket-Läufer hat nicht geantwortet.')); }, this.grenzen.sekunden * 1000 + 15_000);
      uhr.unref?.();
      this.aufrufe.set(nr, { ok: (x) => { clearTimeout(uhr); ok(x); } });
      this.sende({ art: 'aufruf', nr, paket, eingang: { art, json } });
    });
    const s = this.standVon(paket);
    s.aufrufe++; if (!r.ok) s.fehlgeschlagen++;
    s.letzterAufruf = new Date().toISOString(); s.dauerMs = r.ms; s.speicherMB = r.speicherMB;
    s.letzte.push({ zeit: s.letzterAufruf, art: art === 'aktion' ? `Aktion ${String(eingang.aktion)}` : String(eingang.art), ok: r.ok, text: r.ok ? r.text : (r.fehler ?? '') });
    if (s.letzte.length > LETZTE) s.letzte.splice(0, s.letzte.length - LETZTE);
    if (!r.ok) log.warn(`Paket ${paket}: Aufruf fehlgeschlagen`, { paket, art, fehler: r.fehler, ms: r.ms });
    return r;
  }

  private laeuft() { return !!this.kind && this.bereit && !this.aus && !this.o.pausiert?.(); }

  /**
   * Fällige Ereignisse zustellen: je Paket eine eigene Kette, der Reihe nach. Schlägt ein Ereignis fehl,
   * warten die späteren desselben Pakets, bis es zugestellt oder aufgegeben ist (siehe faelligeEreignisse).
   */
  async stelleZu(): Promise<void> {
    if (this.holend || !this.laeuft()) return;
    this.holend = true;
    try {
      const liste = await this.o.dienst.faelligeEreignisse(50);
      const jePaket = new Map<string, typeof liste>();
      for (const e of liste) jePaket.set(e.paketId, [...(jePaket.get(e.paketId) ?? []), e]);
      for (const [paket, es] of jePaket) {
        if (this.zustellend.has(paket)) continue;
        this.zustellend.add(paket);
        void this.stellePaketZu(paket, es)
          .catch((e) => log.error('Paket-Läufer: Zustellung unterbrochen', { paket, fehler: (e as Error).message }))
          .finally(() => { this.zustellend.delete(paket); if (this.laeuft()) setImmediate(() => void this.stelleZu()); });
      }
    } catch (e) {
      log.error('Paket-Läufer: Zustellung unterbrochen', { fehler: (e as Error).message });
    } finally { this.holend = false; }
  }

  /** Ereignisse eines Pakets der Reihe nach; beim ersten Fehler Schluss (Wiederholung später). */
  private async stellePaketZu(paket: string, es: PaketEreignis[]): Promise<void> {
    for (const e of es) {
      if (!this.laeuft()) return; // Wartung oder Läufer weg: später, ohne Versuch
      if (!this.pakete.some((p) => p.id === paket)) { await this.o.dienst.ereignisFehlgeschlagen(e.id, 'Das Paket hat keinen Code mehr.', null); continue; }
      const r = await this.rufe(paket, 'ereignis', { art: e.art, id: e.id, erstellt: e.erstellt, versuch: e.versuche + 1, daten: e.daten });
      if (r.ok) { await this.o.dienst.ereignisZugestellt(e.id); continue; }
      if (r.ohneVersuch) return;
      const w = WARTEN_MIN[e.versuche];
      await this.o.dienst.ereignisFehlgeschlagen(e.id, r.fehler ?? 'Fehler', w === undefined ? null : new Date(Date.now() + w * 60_000));
      if (w === undefined) { log.error(`Paket ${paket}: Ereignis aufgegeben`, { paket, art: e.art, fehler: r.fehler }); continue; }
      return; // spätere Ereignisse dieses Pakets warten auf die Wiederholung (Reihenfolge)
    }
  }

  /** Für die Werkbank: Stand je Paket mit Code. */
  async uebersicht(): Promise<{ laeuft: boolean; pausiert: boolean; zustand: LaeuferZustand; absturz: string | null; grenzen: Grenzen; pakete: PaketStand[] }> {
    const ereignisse = await this.o.dienst.ereignisStand();
    const laeuft = !!this.kind && this.bereit;
    const zustand: LaeuferZustand = this.o.pausiert?.() ? 'pausiert' : laeuft ? 'bereit' : !this.pakete.length ? 'aus' : !this.kind && this.absturz ? 'neustart' : 'startet';
    return {
      laeuft, pausiert: !!this.o.pausiert?.(), zustand, absturz: this.absturz, grenzen: this.grenzen,
      pakete: this.pakete.map((p) => {
        const s = this.standVon(p.id);
        return {
          id: p.id, name: p.name, version: p.version, dienstkonto: this.konto.get(p.id)?.name ?? null,
          geladen: this.ladefehler.has(p.id) && !this.ladefehler.get(p.id), fehler: this.ladefehler.get(p.id) ?? null,
          ...s, letzte: [...s.letzte].reverse(), protokoll: [...s.protokoll].reverse(),
          ereignisse: ereignisse[p.id] ?? { offen: 0, aufgegeben: 0, zugestellt: 0 },
        };
      }),
    };
  }
}


