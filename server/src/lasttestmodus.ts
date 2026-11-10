import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { fork, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bereinigeGeraet, EXTREM_MAPPEN, fuelleErgebnis, LASTTEST_WAHL, LIVE_VERLAUF, stufenVon, type LasttestLive, type LasttestStand, type LasttestStufe, type LasttestWahl, type LiveGruppenArt, type Speicherwahl } from '../../shared/src/lasttest';
import { Fachfehler } from './fehler';
import { oberflaecheSenden } from './oberflaeche';
import { einbettenAus, sicherheitsKoepfe, type Einbetten } from './koepfe';
import { protokoll } from './protokoll';
import type { ProxyVertrauen } from './proxy';
import type { Speicherart } from './speicherart';
import { standKennung } from './system';
import { MODUS_KOERPER_MAX } from './grenzen';

/**
 * Lasttest-Modus (#612): Mit DMS_LASTTEST=klein|mittel|gross|extrem|alle startet das DMS wie immer, aber nur intern
 * (127.0.0.1, zufälliger Port). Unter dem Port des Containers gibt es dann nur diese Seite: Fortschritt, Restdauer,
 * Feld für das Gerät, Speicherart, am Ende Bericht und Ergebnisblock zum Kopieren und der Knopf zum Herunterfahren.
 * Gemessen wird mit dem vorhandenen Skript (server/test/lasttest.mjs, im Image `dms-lasttest`) als Kindprozess –
 * keine zweite Messlogik.
 *
 * Schutz der echten Ablage: Vor dem Start prüft das Skript mit `--pruefen` (ohne etwas anzulegen), ob das DMS frisch
 * oder eine Test-Installation des Lasttests ist. Sonst gibt es den Modus nicht: Das DMS läuft normal weiter, und die
 * Werkbank-Übersicht meldet den Abbruch (siehe index.ts).
 */

const log = protokoll.modul('system');

export interface LasttestEinstellung {
  wahl: LasttestWahl | null;
  /** Sekunden je Durchgang (DMS_LASTTEST_DAUER), sonst die Vorgabe des Skripts. */
  dauer: number | null;
  /** Nur extrem (#739): 500.000 oder 1.000.000 Mappen (DMS_LASTTEST_MAPPEN), sonst null. */
  mappen: number | null;
  /** Durchgang „mit Speichern“ je Stufe (#739); DMS_LASTTEST_SPEICHERN=nein schaltet ihn ab. */
  speichern: boolean;
  fehler: string | null;
}

const AUS = ['aus', '0', 'nein', 'false', 'off'];

/**
 * DMS_LASTTEST lesen (und für Fortgeschrittene DMS_LASTTEST_DAUER, DMS_LASTTEST_MAPPEN für extrem,
 * DMS_LASTTEST_SPEICHERN=nein ohne den Durchgang „mit Speichern“). Leer, „aus“, „0“, „nein“: aus.
 */
export function lasttestAus(env: Record<string, string | undefined>): LasttestEinstellung {
  const roh = (env.DMS_LASTTEST ?? '').trim().toLowerCase().replace('groß', 'gross');
  const d = env.DMS_LASTTEST_DAUER?.trim();
  const dauer = d && /^\d+$/.test(d) && Number(d) >= 1 ? Number(d) : null;
  const fehler: string[] = [];
  if (d && dauer === null) fehler.push(`DMS_LASTTEST_DAUER „${d}“ ist keine Zahl von Sekunden und wird ignoriert.`);
  const speichern = !AUS.includes((env.DMS_LASTTEST_SPEICHERN ?? '').trim().toLowerCase());
  if (!roh || AUS.includes(roh)) return { wahl: null, dauer: null, mappen: null, speichern: true, fehler: null };
  if (!(LASTTEST_WAHL as readonly string[]).includes(roh)) return { wahl: null, dauer: null, mappen: null, speichern: true, fehler: `DMS_LASTTEST „${env.DMS_LASTTEST}“ ist keine Stufe (klein, mittel, gross, extrem oder alle) – Ablago startet normal.` };
  // extrem: 500.000 (Vorgabe) oder 1.000.000 Mappen; Punkte und Unterstriche als Tausendertrennzeichen erlaubt.
  const m = env.DMS_LASTTEST_MAPPEN?.trim();
  let mappen: number | null = roh === 'extrem' ? EXTREM_MAPPEN[0] : null;
  if (m && roh === 'extrem') {
    const n = Number(m.replace(/[._]/g, ''));
    if (EXTREM_MAPPEN.includes(n)) mappen = n;
    else fehler.push(`DMS_LASTTEST_MAPPEN „${m}“ ist weder 500000 noch 1000000 – extrem misst mit ${EXTREM_MAPPEN[0]}.`);
  }
  return { wahl: roh as LasttestWahl, dauer, mappen, speichern, fehler: fehler.length ? fehler.join(' ') : null };
}

/** Wo das Skript liegt: im Image /app/lasttest/lasttest.mjs, in der Entwicklung server/test/lasttest.mjs. */
export function lasttestSkript(env: Record<string, string | undefined>, kandidaten: string[]): string | null {
  if (env.DMS_LASTTEST_SKRIPT) return env.DMS_LASTTEST_SKRIPT;
  return kandidaten.find((k) => existsSync(k)) ?? null;
}

export type ZielPruefung = { ok: true; text: string } | { ok: false; grund: string };

/**
 * Schutz der echten Ablage vor dem Start (`lasttest.mjs --pruefen`): legt nichts an. Exit-Code 0 → frisch oder
 * Test-Installation; 2 → Abbruch mit Grund; alles andere zählt auch als Abbruch (lieber kein Lasttest).
 */
export function pruefeZiel(skript: string, ziel: string, env: NodeJS.ProcessEnv): Promise<ZielPruefung> {
  return new Promise((fertig) => {
    const k = spawn(process.execPath, [skript, '--pruefen', '--ziel', ziel], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let aus = ''; let fehler = '';
    k.stdout.on('data', (d: Buffer) => { aus += d.toString(); });
    k.stderr.on('data', (d: Buffer) => { fehler += d.toString(); });
    const zeit = setTimeout(() => k.kill('SIGKILL'), 120_000);
    k.on('error', (e) => { clearTimeout(zeit); fertig({ ok: false, grund: `Prüfung nicht gestartet: ${e.message}` }); });
    k.on('close', (code) => {
      clearTimeout(zeit);
      if (code === 0) return fertig({ ok: true, text: aus.trim() });
      const abbruch = fehler.split('\n').find((z) => z.startsWith('Abbruch: '));
      fertig({ ok: false, grund: abbruch ? abbruch.slice('Abbruch: '.length) : `Prüfung fehlgeschlagen (Code ${code}): ${fehler.trim().split('\n').slice(-1)[0] ?? ''}` });
    });
  });
}

export interface LasttestOptionen {
  wahl: LasttestWahl;
  dauer: number | null;
  /** extrem (#739): Bestand; sonst nicht gesetzt. */
  mappen?: number | null;
  /** Durchgang „mit Speichern“ (#739); Vorgabe an. */
  speichern?: boolean;
  skript: string;
  /** Adresse des internen DMS (127.0.0.1). */
  ziel: string;
  /** Ergebnis und Stand (/data/ergebnis). */
  ergebnisOrdner: string;
  /** Umgebung des Skripts (DMS_GEHEIM für den Einrichtungscode). */
  env: NodeJS.ProcessEnv;
  speicherart: Speicherart | null;
  port: number;
  host: string;
  webDir?: string;
  proxy?: ProxyVertrauen;
  einbetten?: Einbetten;
  /** Knopf „Test beenden und Container herunterfahren“: das DMS beenden (der Container endet mit ihm). */
  beenden: () => void | Promise<void>;
  /** Für Tests: Kindprozess starten. */
  starte?: (skript: string, args: string[], env: NodeJS.ProcessEnv) => ChildProcess;
  jetzt?: () => number;
}

type Meldung =
  | { art: 'stufe'; stufe: LasttestStufe; nr: number; von: number }
  | { art: 'schritt'; schritt: LasttestStand['schritt'] }
  | { art: 'demo'; fertig: number; gesamt: number }
  | { art: 'durchgang'; name: string; n: number; dauer: number; zeit: number }
  | { art: 'durchgang-fertig'; name: string; n: number; p95: number | null; fehlerquote: number }
  | { art: 'ergebnis'; bericht: string; vorlage: string; verfehlt: boolean }
  | { art: 'abbruch' | 'fehler'; text: string }
  | { art: 'warnung'; ohneDatei: number }
  | ({ art: 'live' } & Record<string, unknown>);

const GRUPPEN_ARTEN: readonly LiveGruppenArt[] = ['ablago', 'lastgenerator', 'postgres', 'texterkennung', 'bilder', 'rest'];
const zahlOderNull = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const kurz = (x: unknown, n: number) => String(x ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, n);

/** Dauer einer Meldung (#909): höchste und mittlere in ms, nur als Zahlen. */
const dauerAus = (d: unknown): { dauer?: { max: number; mittel: number } } => {
  const x = d as { max?: unknown; mittel?: unknown } | null;
  const max = zahlOderNull(x?.max), mittel = zahlOderNull(x?.mittel);
  return max !== null && mittel !== null ? { dauer: { max, mittel } } : {};
};

/**
 * Werte der laufenden Messung aus der Meldung des Skripts (#895) übernehmen – nur die bekannten Felder, Zahlen als
 * Zahlen, Texte gekürzt. Die Texte der Meldungen kommen schon ohne Einzelheiten vom Server (protokollsammlung.ts).
 */
export function liveAus(m: Record<string, unknown>): LasttestLive | null {
  if (typeof m.name !== 'string') return null;
  const gruppen = Array.isArray(m.gruppen)
    ? (m.gruppen as Array<Record<string, unknown>>).filter((g) => GRUPPEN_ARTEN.includes(g?.art as LiveGruppenArt)).slice(0, 40).map((g) => ({
      art: g.art as LiveGruppenArt, ...(typeof g.nr === 'number' ? { nr: g.nr } : {}),
      ...(g.rolle === 'haupt' || g.rolle === 'leiter' || g.rolle === 'anfragen' ? { rolle: g.rolle as 'haupt' | 'leiter' | 'anfragen' } : {}),
      anzahl: zahlOderNull(g.anzahl) ?? 0, cpu: zahlOderNull(g.cpu), mb: zahlOderNull(g.mb) ?? 0,
    }))
    : null;
  const meldungen = Array.isArray(m.meldungen)
    ? (m.meldungen as Array<Record<string, unknown>>).filter((x) => x && ['warn', 'error', 'fatal'].includes(String(x.stufe))).slice(0, 10).map((x) => ({
      stufe: x.stufe as 'warn' | 'error' | 'fatal', modul: kurz(x.modul, 30), text: kurz(x.text, 200), ausnahme: x.ausnahme ? kurz(x.ausnahme, 60) : null,
      anzahl: zahlOderNull(x.anzahl) ?? 0, letzte: kurz(x.letzte, 30), ...dauerAus(x.dauer),
    }))
    : [];
  return {
    name: kurz(m.name, 80), n: zahlOderNull(m.n) ?? 0, p95: zahlOderNull(m.p95), anfragen: zahlOderNull(m.anfragen) ?? 0,
    cpu: zahlOderNull(m.cpu), speicher: zahlOderNull(m.speicher), speicherMb: zahlOderNull(m.speicherMb), grenzeMb: zahlOderNull(m.grenzeMb), ohneGrenze: m.ohneGrenze === true,
    kerne: zahlOderNull(m.kerne), kerneBegrenzt: m.kerneBegrenzt === true,
    warteschlange: zahlOderNull(m.warteschlange), belegt: zahlOderNull(m.belegt), verbindungen: zahlOderNull(m.verbindungen),
    gruppen, postgresExtern: m.postgresExtern === true, meldungen,
  };
}

const SPEICHERWAHL: readonly Speicherwahl[] = ['HDD', 'SSD', 'NVMe', 'unbekannt'];
const STAND_DATEI = 'stand.json';
const BEENDET_DATEI = 'beendet';

export class Lasttestmodus {
  private app?: FastifyInstance;
  private kind?: ChildProcess;
  private stand: LasttestStand;
  private fehlerText = '';
  private jetzt: () => number;

  constructor(private o: LasttestOptionen) {
    this.jetzt = o.jetzt ?? Date.now;
    const t = this.jetzt();
    this.stand = {
      wahl: o.wahl, mappen: o.mappen ?? null, speichern: o.speichern !== false, zustand: 'laeuft', stufe: null, nr: 0, von: stufenVon(o.wahl).length, schritt: 'start', demo: null, durchgang: null,
      durchgaenge: [], begonnen: t, stufeBegonnen: t, jetzt: t, fertigeStufen: [], ergebnis: null, meldung: null,
      angaben: { geraet: '', speicher: o.speicherart }, speicherErkannt: o.speicherart, datei: null,
    };
  }

  /** Stand für die Seite: nie mit Zugangsdaten, Einrichtungscode oder der internen Adresse. */
  ansicht(): LasttestStand { return { ...this.stand, jetzt: this.jetzt() }; }

  private get dateiName() { return join(this.o.ergebnisOrdner, `lasttest-${this.o.wahl}.md`); }

  /** Bericht und Block (mit Gerät und Speicher) als Datei; dazu der Stand für einen Neustart nach „Beenden“. */
  /** Merker im Ergebnisordner: nach einem Neustart misst der Container nicht noch einmal. */
  private async merkeBeendet(): Promise<void> {
    await writeFile(join(this.o.ergebnisOrdner, BEENDET_DATEI), `${new Date(this.jetzt()).toISOString()}\n`).catch(() => {});
  }

  private async speichern(): Promise<void> {
    try {
      await mkdir(this.o.ergebnisOrdner, { recursive: true });
      if (this.stand.ergebnis) {
        await writeFile(this.dateiName, `${this.stand.ergebnis.bericht}\n\n### Ergebnis zum Kopieren\n\nOhne Namen und Adressen – zum Einfügen in das Formular „Messergebnis Lasttest“.\n\n${this.block()}\n`);
      }
      await writeFile(join(this.o.ergebnisOrdner, STAND_DATEI), JSON.stringify(this.stand));
    } catch (e) {
      this.stand.datei = null;
      log.warn('Lasttest: Ergebnis nicht gespeichert', { ordner: this.o.ergebnisOrdner, fehler: (e as Error).message }); }
  }

  block(): string { return this.stand.ergebnis ? fuelleErgebnis(this.stand.ergebnis.vorlage, this.stand.angaben, this.stand.speicherErkannt) : ''; }

  private melde(m: Meldung): void {
    const s = this.stand;
    switch (m.art) {
      case 'stufe':
        if (s.stufe && s.stufe !== m.stufe) s.fertigeStufen.push(s.stufe);
        Object.assign(s, { stufe: m.stufe, nr: m.nr, von: m.von, stufeBegonnen: this.jetzt(), demo: null, durchgang: null });
        break;
      case 'schritt': s.schritt = m.schritt; if (m.schritt !== 'demo') s.demo = null; break;
      case 'demo': s.demo = { fertig: m.fertig, gesamt: m.gesamt }; break;
      case 'durchgang': s.schritt = 'messen'; s.durchgang = { name: m.name, n: m.n, ende: this.jetzt() + m.dauer * 1000 }; break;
      case 'durchgang-fertig': s.durchgang = null; s.durchgaenge.push({ name: m.name, n: m.n, p95: m.p95, fehlerquote: m.fehlerquote }); break;
      case 'ergebnis':
        s.schritt = 'auswerten'; s.ergebnis = { bericht: m.bericht, vorlage: m.vorlage, verfehlt: m.verfehlt }; s.datei = this.dateiName;
        void this.speichern();
        break;
      case 'abbruch': s.zustand = 'abbruch'; s.meldung = m.text; break;
      case 'fehler': s.meldung = m.text; break;
      case 'warnung': s.ohneDatei = Number(m.ohneDatei) || 0; break;
      case 'live': {
        // #895: Werte der ohnehin laufenden Messung – die Seite fragt nichts zusätzlich.
        const l = liveAus(m);
        if (!l) break;
        const zeit = new Date(this.jetzt()).toISOString();
        const verlauf = [...(s.live?.verlauf ?? []), { zeit, cpu: l.cpu, speicher: l.speicher }].slice(-LIVE_VERLAUF);
        s.live = { jetzt: { ...l, zeit }, verlauf };
        break;
      }
    }
  }

  /** Seite unter dem Port des Containers öffnen und – falls noch nicht beendet – das Skript starten. */
  async start(): Promise<void> {
    const vorher = await readFile(join(this.o.ergebnisOrdner, STAND_DATEI), 'utf8').then((t) => JSON.parse(t) as LasttestStand, () => null);
    // Nach „Beenden“ und einem Neustart des Containers (Neustart-Regel der NAS): nicht noch einmal messen.
    if (vorher && existsSync(join(this.o.ergebnisOrdner, BEENDET_DATEI))) this.stand = { ...vorher, zustand: 'beendet' };
    await this.oeffneSeite();
    if (this.stand.zustand === 'beendet') {
      log.warn(`Lasttest-Modus: Der Test ist schon beendet (${this.o.ergebnisOrdner}/${BEENDET_DATEI}). Lösche den Container – Anleitung im Browser (Port ${this.o.port}).`);
      return;
    }
    this.starteSkript();
  }

  private starteSkript(): void {
    const args = [this.o.wahl, '--ziel', this.o.ziel, ...(this.o.dauer ? ['--dauer', String(this.o.dauer)] : []),
      ...(this.o.wahl === 'extrem' && this.o.mappen ? ['--mappen', String(this.o.mappen)] : []), ...(this.o.speichern === false ? ['--ohne-speichern'] : [])];
    const starte = this.o.starte ?? ((skript, a, env) => fork(skript, a, { env, stdio: ['ignore', 'inherit', 'pipe', 'ipc'] }));
    log.warn(`Lasttest-Modus: Stufe ${this.o.wahl} startet. Ablago ist keine Ablage – Fortschritt und Ergebnis im Browser (Port ${this.o.port}).`);
    const k = starte(this.o.skript, args, this.o.env);
    this.kind = k;
    k.on('message', (m: Meldung) => { try { this.melde(m); } catch { /* unbekannte Meldung */ } });
    k.stderr?.on('data', (d: Buffer) => { process.stderr.write(d); this.fehlerText = (this.fehlerText + d.toString()).slice(-4000); });
    k.on('exit', (code) => {
      this.kind = undefined;
      const s = this.stand;
      if (s.zustand === 'beendet') return;
      if (s.stufe && !s.fertigeStufen.includes(s.stufe)) s.fertigeStufen.push(s.stufe);
      s.durchgang = null;
      s.live = null;
      if (s.zustand !== 'abbruch') {
        if (code === 0 && s.ergebnis) s.zustand = 'fertig';
        else { s.zustand = 'fehler'; s.meldung ??= this.fehlerText.trim().split('\n').filter(Boolean).slice(-1)[0] ?? `Code ${code}`; }
      }
      log.warn(`Lasttest-Modus: ${s.zustand === 'fertig' ? 'fertig' : s.zustand === 'abbruch' ? `abgebrochen – ${s.meldung}` : `Fehler – ${s.meldung}`}. Ergebnis im Browser (Port ${this.o.port})${s.datei ? ` und in ${s.datei}` : ''}.`);
      void this.speichern();
    });
  }

  private async oeffneSeite(): Promise<void> {
    const app = Fastify({ trustProxy: this.o.proxy ?? false, bodyLimit: MODUS_KOERPER_MAX });
    this.app = app;
    app.setErrorHandler((e: unknown, _req, reply) => {
      if (e instanceof Fachfehler) return reply.code(e.status).send({ fehler: e.message });
      const err = e as Error & { statusCode?: number };
      if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ fehler: err.message });
      log.error('Fehler im Lasttest-Modus', { fehler: err.stack ?? String(e) });
      return reply.code(500).send({ fehler: 'Interner Fehler. Details stehen im Protokoll des Containers.' });
    });
    app.addHook('onRequest', async (_req, reply) => { reply.header('cache-control', 'no-store'); });
    app.addHook('onSend', async (req, reply, nutzlast) => {
      const typ = String(reply.getHeader('content-type') ?? '');
      for (const [k, v] of Object.entries(sicherheitsKoepfe({ pfad: req.url.split('?')[0], https: req.protocol === 'https', html: typ.startsWith('text/html'), csp: reply.hasHeader('content-security-policy') }, this.o.einbetten ?? einbettenAus(undefined)))) {
        if (!reply.hasHeader(k)) reply.header(k, v);
      }
      return nutzlast;
    });
    /** Änderungen nur von der eigenen Oberfläche (Kennung wie im DMS: fremde Seiten können sie nicht setzen). */
    const schutz = (req: { headers: Record<string, unknown> }) => {
      if (req.headers['x-dms'] !== '1') throw new Fachfehler(403, 'Anfrage ohne Kennung der Oberfläche abgelehnt.');
    };

    app.get('/api/konto/status', async () => ({ einrichtungNoetig: false, mail: false, benutzer: null, marke: null, wartung: null, lasttest: true }));
    const stand = standKennung();
    app.get('/api/gesundheit', async () => ({ ok: true, zustand: 'lasttest', lasttest: true, stand }));
    app.get('/api/lasttest', async () => this.ansicht());
    app.post('/api/lasttest/angaben', async (req) => {
      schutz(req);
      const b = (req.body ?? {}) as { geraet?: unknown; speicher?: unknown };
      if (b.geraet !== undefined) this.stand.angaben.geraet = bereinigeGeraet(b.geraet);
      if (b.speicher !== undefined) {
        if (b.speicher !== null && !SPEICHERWAHL.includes(b.speicher as Speicherwahl)) throw new Fachfehler(400, 'Speicherart: HDD, SSD, NVMe oder unbekannt.');
        this.stand.angaben.speicher = b.speicher as Speicherwahl | null;
      }
      await this.speichern();
      return this.ansicht();
    });
    app.post('/api/lasttest/beenden', async (req) => {
      schutz(req);
      // Nur einmal: weitere Aufrufe ändern nichts mehr (der Container fährt ohnehin gleich herunter).
      if (this.stand.zustand === 'beendet') return { ok: true };
      this.stand.zustand = 'beendet';
      await this.speichern();
      await this.merkeBeendet();
      // In die Logs des Containers, mit Gerät und Speicher – falls die Seite schon zu ist.
      if (this.stand.ergebnis) process.stdout.write(`\nLasttest beendet. Ergebnis zum Kopieren:\n\n${this.block()}\n\n`);
      log.warn('Lasttest-Modus: Test beendet – Ablago fährt herunter.');
      // Erst antworten, dann beenden.
      setTimeout(() => { void this.stop().then(() => this.o.beenden()); }, 300).unref?.();
      return { ok: true };
    });
    app.all('/api/*', async (_req, reply) => reply.code(503).send({ fehler: 'Lasttest-Modus: Diese Installation misst gerade und ist keine Ablage. Fortschritt und Ergebnis stehen auf der Startseite.' }));

    if (this.o.webDir && existsSync(this.o.webDir)) {
      await app.register(fastifyStatic, { root: this.o.webDir, wildcard: false });
      app.setNotFoundHandler((req, reply) => oberflaecheSenden(req.url, reply, this.o.webDir));
    }
    await app.listen({ port: this.o.port, host: this.o.host });
  }

  /** Prozess-Id des Skripts (Lastgenerator, #895), solange es läuft. */
  lastgenerator(): number | null { return this.kind?.pid ?? null; }

  /** Skript beenden (falls es noch läuft) und die Seite schließen. */
  async stop(): Promise<void> {
    if (this.kind) {
      const k = this.kind;
      await new Promise<void>((r) => { k.once('exit', () => r()); k.kill('SIGTERM'); setTimeout(() => { k.kill('SIGKILL'); r(); }, 5000).unref?.(); });
    }
    await this.app?.close();
    this.app = undefined;
  }
}
