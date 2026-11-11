/**
 * Arbeiter-Pool (#542): schwere Rechenarbeit (PDF mit pdf-lib, große Exporte) läuft in einer kleinen, festen
 * Zahl von Arbeiter-Fäden (`node:worker_threads`) statt im Hauptfaden, der alle Anfragen beantwortet.
 *
 * - Eine Warteschlange für alle Aufträge; ein Arbeiter erledigt einen Auftrag nach dem anderen.
 * - Arbeiter entstehen bei Bedarf und beenden sich nach einer Weile ohne Arbeit (Arbeitsspeicher des NAS).
 * - Zeitgrenze je Auftrag: Danach wird der Arbeiter beendet und der Auftrag scheitert mit verständlicher Meldung.
 * - Grenze für den Arbeitsspeicher je Arbeiter: Ein riesiges PDF bringt nur den Arbeiter zu Fall, nicht das DMS.
 * - Ist die Warteschlange voll, wird ein neuer Auftrag sofort abgewiesen (503) statt endlos zu warten.
 *
 * Der Paket-Läufer (eigener Prozess, `laeufer/`) hat damit nichts zu tun.
 */
import { Worker } from 'node:worker_threads';
import { Fachfehler } from '../fehler';
import { t } from '../sprache';
import { alsBuffer, fehlerAus, type Antwort, type Auftrag } from './nachricht';

export interface PoolOptionen {
  /** Einstiegsdatei des Arbeiters. */
  datei: URL;
  /** Höchstzahl gleichzeitiger Arbeiter (mindestens 1). */
  groesse: number;
  /** Zeitgrenze je Auftrag in ms. */
  zeitMs?: number;
  /** So viele Aufträge dürfen warten; darüber wird abgewiesen. */
  warteschlangeMax?: number;
  /** Nach so langer Zeit ohne Arbeit beendet sich ein Arbeiter. */
  leerlaufMs?: number;
  /** Grenze für den Arbeitsspeicher (Heap) eines Arbeiters in MB. */
  speicherMb?: number;
  execArgv?: string[];
  /** Ein Auftrag hat ein PDF mit Zeichen erzeugt, die die Schrift nicht hat (#826): einmal je Auftrag. */
  zeichenFehlen?: (vorgang: string, zeichen: string[]) => void;
}

export interface PoolStand {
  groesse: number;
  /** Laufende Arbeiter (auch untätige, bis sie sich beenden). */
  arbeiter: number;
  beschaeftigt: number;
  wartend: number;
  erledigt: number;
  fehler: number;
  zeitueberschreitungen: number;
  abgewiesen: number;
  /** Mittlere Dauer und mittleres Warten der erledigten Aufträge (ms); null ohne Aufträge. */
  mittlereDauerMs: number | null;
  mittleresWartenMs: number | null;
  laengstesWartenMs: number;
  zeitMs: number;
  warteschlangeMax: number;
  /** Wann zuletzt ein Auftrag abgewiesen wurde (volle Warteschlange); null = noch nie. */
  zuletztAbgewiesen: string | null;
}

interface Offen {
  id: number; vorgang: string; args: unknown[]; zeitMs: number; eingang: number; beginn?: number;
  ok: (x: unknown) => void; fehler: (e: Error) => void; timer?: NodeJS.Timeout;
}
interface Faden { w: Worker; offen: Offen | null; leer?: NodeJS.Timeout; beendet: boolean; weg?: boolean }

export class Arbeiterpool {
  private faeden: Faden[] = [];
  private schlange: Offen[] = [];
  private nr = 0;
  private z = { erledigt: 0, fehler: 0, zeitueberschreitungen: 0, abgewiesen: 0, dauer: 0, warten: 0, laengstesWarten: 0 };
  readonly groesse: number;
  readonly zeitMs: number;
  readonly warteschlangeMax: number;
  private zu = false;
  private zuletztAbgewiesen: number | null = null;

  constructor(private o: PoolOptionen) {
    this.groesse = Math.max(1, Math.floor(o.groesse));
    this.zeitMs = o.zeitMs ?? 10 * 60_000;
    this.warteschlangeMax = o.warteschlangeMax ?? 50;
  }

  /** Führt einen Vorgang in einem Arbeiter aus. */
  ausfuehren<T>(vorgang: string, args: unknown[], x: { zeitMs?: number } = {}): Promise<T> {
    if (this.zu) return Promise.reject(new Fachfehler(503, t('systemzustand.arbeiter.meldung.herunter')));
    if (this.schlange.length >= this.warteschlangeMax) {
      this.z.abgewiesen++;
      this.zuletztAbgewiesen = Date.now();
      return Promise.reject(new Fachfehler(503, t('systemzustand.arbeiter.meldung.voll'), { retryAfter: 60 }));
    }
    return new Promise<T>((ok, fehler) => {
      this.schlange.push({ id: ++this.nr, vorgang, args, zeitMs: x.zeitMs ?? this.zeitMs, eingang: performance.now(), ok: ok as (x: unknown) => void, fehler });
      this.verteile();
    });
  }

  /** Einen Arbeiter vorab starten (spart beim ersten Auftrag das Laden der Bibliotheken). */
  vorwaermen() { if (!this.faeden.length && !this.zu) this.leerlauf(this.neuerFaden()); }

  stand(): PoolStand {
    const n = this.z.erledigt + this.z.fehler;
    return {
      groesse: this.groesse, arbeiter: this.faeden.length, beschaeftigt: this.faeden.filter((f) => f.offen).length, wartend: this.schlange.length,
      erledigt: this.z.erledigt, fehler: this.z.fehler, zeitueberschreitungen: this.z.zeitueberschreitungen, abgewiesen: this.z.abgewiesen,
      mittlereDauerMs: n ? Math.round(this.z.dauer / n) : null, mittleresWartenMs: n ? Math.round(this.z.warten / n) : null,
      laengstesWartenMs: Math.round(this.z.laengstesWarten), zeitMs: this.zeitMs, warteschlangeMax: this.warteschlangeMax,
      zuletztAbgewiesen: this.zuletztAbgewiesen === null ? null : new Date(this.zuletztAbgewiesen).toISOString(),
    };
  }

  async beenden() {
    this.zu = true;
    for (const a of this.schlange.splice(0)) a.fehler(new Fachfehler(503, t('systemzustand.arbeiter.meldung.herunter')));
    await Promise.all(this.faeden.map((f) => this.entferne(f)));
  }

  private verteile() {
    while (this.schlange.length) {
      let f = this.faeden.find((x) => !x.offen && !x.beendet);
      if (!f) {
        if (this.faeden.length >= this.groesse) return;
        f = this.neuerFaden();
      }
      this.starte(f, this.schlange.shift()!);
    }
  }

  private neuerFaden(): Faden {
    const w = new Worker(this.o.datei, {
      execArgv: this.o.execArgv,
      resourceLimits: { maxOldGenerationSizeMb: this.o.speicherMb ?? 1536 },
      stdout: false, stderr: false,
    });
    const f: Faden = { w, offen: null, beendet: false };
    w.on('message', (m: Antwort) => this.antwort(f, m));
    w.on('error', (e) => this.absturz(f, e));
    w.on('exit', (code) => { if (!f.weg) this.absturz(f, new Error(`Arbeiter beendet (Code ${code})`)); });
    this.faeden.push(f);
    return f;
  }

  private starte(f: Faden, a: Offen) {
    if (f.leer) { clearTimeout(f.leer); f.leer = undefined; }
    f.offen = a;
    a.beginn = performance.now();
    const warten = a.beginn - a.eingang;
    this.z.warten += warten;
    this.z.laengstesWarten = Math.max(this.z.laengstesWarten, warten);
    f.w.ref();
    a.timer = setTimeout(() => {
      this.z.zeitueberschreitungen++;
      const min = Math.round(a.zeitMs / 60_000);
      f.beendet = true; // bekommt keinen neuen Auftrag mehr
      this.fertig(f, a, new Fachfehler(504, min > 0 ? t('systemzustand.arbeiter.meldung.zeit.minuten', { anzahl: min }) : t('systemzustand.arbeiter.meldung.zeit.sekunden', { anzahl: Math.round(a.zeitMs / 1000) })));
      void this.entferne(f);
    }, a.zeitMs);
    a.timer.unref();
    const nachricht: Auftrag = { id: a.id, vorgang: a.vorgang, args: a.args };
    try { f.w.postMessage(nachricht); } catch (e) { this.fertig(f, a, new Fachfehler(500, t('systemzustand.arbeiter.meldung.uebergabe', { fehler: (e as Error).message }))); }
  }

  private antwort(f: Faden, m: Antwort) {
    const a = f.offen;
    if (!a || a.id !== m.id) return;
    if (m.ok && m.zeichen?.length) this.o.zeichenFehlen?.(a.vorgang, m.zeichen);
    if (m.ok) this.fertig(f, a, null, alsBuffer(m.ergebnis));
    else this.fertig(f, a, fehlerAus(m.fehler));
  }

  private fertig(f: Faden, a: Offen, fehler: Error | null, ergebnis?: unknown) {
    if (f.offen !== a) return;
    if (a.timer) clearTimeout(a.timer);
    f.offen = null;
    this.z.dauer += performance.now() - (a.beginn ?? a.eingang);
    if (fehler) { this.z.fehler++; a.fehler(fehler); } else { this.z.erledigt++; a.ok(ergebnis); }
    if (!f.beendet) this.leerlauf(f);
    this.verteile();
  }

  /** Untätig: hält den Prozess nicht am Leben und beendet sich nach `leerlaufMs`. */
  private leerlauf(f: Faden) {
    f.w.unref();
    if (f.leer) clearTimeout(f.leer);
    f.leer = setTimeout(() => { if (!f.offen) void this.entferne(f); }, this.o.leerlaufMs ?? 120_000);
    f.leer.unref();
  }

  private absturz(f: Faden, e: Error) {
    const a = f.offen;
    const speicher = (e as NodeJS.ErrnoException).code === 'ERR_WORKER_OUT_OF_MEMORY';
    f.beendet = true;
    if (a) this.fertig(f, a, new Fachfehler(speicher ? 507 : 500, speicher ? t('systemzustand.arbeiter.meldung.speicher') : t('systemzustand.arbeiter.meldung.absturz', { fehler: e.message })));
    void this.entferne(f);
  }

  private async entferne(f: Faden) {
    if (f.leer) clearTimeout(f.leer);
    f.beendet = true;
    if (f.weg) return;
    f.weg = true;
    this.faeden = this.faeden.filter((x) => x !== f);
    this.verteile();
    await f.w.terminate().catch(() => {});
  }
}
