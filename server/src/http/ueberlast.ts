/**
 * Überlastschutz (#544): Kommen mehr Anfragen gleichzeitig, als das DMS sinnvoll abarbeiten kann (etwa ein
 * falsch eingestelltes WebDAV-Programm), antwortet es sofort mit 503 und `Retry-After` statt jede Anfrage
 * in eine immer längere Warteschlange zu stellen, bis Programme und Browser aufgeben. So bleiben Antwortzeit
 * und Arbeitsspeicher begrenzt, und das DMS erholt sich von selbst, sobald die Last nachlässt.
 *
 * Gezählt werden Anfragen an `/api/` und `/webdav`, vom Eingang bis die Antwort fertig oder die Verbindung
 * zu ist. Nie abgewiesen werden die Gesundheitsprüfung des Containers und die Messwerte für den Lasttest.
 * Grenze: `DMS_MAX_ANFRAGEN` (Vorgabe 250 – das Zweieinhalbfache der realistischen Obergrenze von 100).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { kontext, protokoll } from '../protokoll/protokoll';
import { t } from '../sprache/sprache';

export const MAX_ANFRAGEN_VORGABE = 250;
export const MAX_ANFRAGEN_MIN = 20;
export const MAX_ANFRAGEN_MAX = 10_000;
/** Sekunden bis zum nächsten Versuch (Kopfzeile Retry-After). */
export const WIEDER_IN_S = 5;

const AUSGENOMMEN = new Set(['/api/gesundheit', '/api/werkbank/last']);
/** Zusammenfassung der Abweisungen im Protokoll (#920): höchstens eine Zeile je Minute. */
export const MELDUNG_MS = 60_000;
/** Anfragen, die der Überlastschutz abgewiesen hat (#920): ohne eigene Zeile „… 503“ als Fehler im Protokoll. */
const abgewiesene = new WeakSet<object>();
export const vomUeberlastschutzAbgewiesen = (req: FastifyRequest) => abgewiesene.has(req);
const log = protokoll.modul('system');

export interface UeberlastEinstellung {
  max: number;
  quelle: 'vorgabe' | 'umgebung';
  fehler?: string;
}

export function maxAnfragenAus(env: Record<string, string | undefined>): UeberlastEinstellung {
  const roh = env.DMS_MAX_ANFRAGEN?.trim();
  if (!roh) return { max: MAX_ANFRAGEN_VORGABE, quelle: 'vorgabe' };
  const n = Number(roh);
  if (!Number.isInteger(n) || n < MAX_ANFRAGEN_MIN || n > MAX_ANFRAGEN_MAX) {
    return {
      max: MAX_ANFRAGEN_VORGABE,
      quelle: 'vorgabe',
      fehler: t('meldungen.ueberlast.dms-max-anfragen-ist', { roh, MAX_ANFRAGEN_MIN, MAX_ANFRAGEN_MAX }),
    };
  }
  return { max: n, quelle: 'umgebung' };
}

/** Zählt diese Anfrage mit? */
export function zaehlt(url: string): boolean {
  const pfad = url.split('?')[0];
  return (pfad.startsWith('/api/') || pfad === '/webdav' || pfad.startsWith('/webdav/')) && !AUSGENOMMEN.has(pfad);
}

export class Ueberlastschutz {
  laufend = 0;
  abgewiesen = 0;
  hoechstens = 0;
  private gemeldet = 0;
  /** Wann zuletzt abgewiesen wurde (für den Engpass-Hinweis im Systemzustand). */
  zuletztAbgewiesen: number | null = null;
  private seitMeldung = 0;

  constructor(
    readonly max: number,
    readonly quelle: UeberlastEinstellung['quelle'] = 'vorgabe',
    private uhr: () => number = Date.now,
  ) {}

  /** Darf die Anfrage hinein? Wenn ja, zählt sie bis `fertig()`. */
  herein(): boolean {
    if (this.laufend >= this.max) {
      this.abgewiesen++;
      this.zuletztAbgewiesen = this.uhr();
      this.melde();
      return false;
    }
    this.laufend++;
    if (this.laufend > this.hoechstens) this.hoechstens = this.laufend;
    return true;
  }

  fertig() {
    if (this.laufend > 0) this.laufend--;
  }

  /**
   * Höchstens eine Zeile je Minute im Protokoll – als Hinweis, nicht als Warnung oder Fehler (#920): Abweisen ist
   * gewollt (503 mit Retry-After). Die erste Abweisung nach einer ruhigen Minute steht sofort da; was danach in der
   * Minute dazukommt, fasst eine Zeile am Ende der Minute zusammen (nichts geht verloren, es hinkt nur nach).
   */
  private zeitgeber: ReturnType<typeof setTimeout> | null = null;
  private melde() {
    const jetzt = this.uhr();
    if (!this.zeitgeber && jetzt - this.gemeldet >= MELDUNG_MS) {
      this.schreibe(1, true);
      this.gemeldet = jetzt;
      return;
    }
    this.seitMeldung++;
    if (!this.zeitgeber) {
      // Ohne den Kontext der gerade abgewiesenen Anfrage (die Zeile gehört zu keiner Anfrage).
      this.zeitgeber = kontext.exit(() => setTimeout(() => this.leeren(), Math.max(0, this.gemeldet + MELDUNG_MS - jetzt)));
      this.zeitgeber.unref?.();
    }
  }

  /** Offene Zusammenfassung jetzt schreiben (Ende der Minute, Herunterfahren, Tests). */
  leeren() {
    if (this.zeitgeber) {
      clearTimeout(this.zeitgeber);
      this.zeitgeber = null;
    }
    if (!this.seitMeldung) return;
    this.schreibe(this.seitMeldung, false);
    this.seitMeldung = 0;
    this.gemeldet = this.uhr();
  }

  private schreibe(n: number, erste: boolean) {
    log.info(
      erste
        ? `Überlast: ${this.max} Anfragen gleichzeitig – weitere werden mit 503 abgewiesen (gewollt, mit Retry-After)`
        : `Überlast: in der letzten Minute weitere ${n} Anfragen mit 503 abgewiesen (Grenze ${this.max} gleichzeitig)`,
      { abgewiesen: this.abgewiesen, seitLetzterMeldung: n },
    );
  }

  stand() {
    return {
      max: this.max,
      quelle: this.quelle,
      laufend: this.laufend,
      hoechstens: this.hoechstens,
      abgewiesen: this.abgewiesen,
      zuletztAbgewiesen: this.zuletztAbgewiesen === null ? null : new Date(this.zuletztAbgewiesen).toISOString(),
    };
  }

  /** Als erster Hook in Fastify einhängen. */
  haengeEin(app: FastifyInstance) {
    app.addHook('onRequest', async (req, reply) => {
      if (!zaehlt(req.url)) return;
      if (!this.herein()) {
        abgewiesene.add(req);
        return reply
          .code(503)
          .header('retry-after', String(WIEDER_IN_S))
          .header('cache-control', 'no-store')
          .send({ fehler: t('systemzustand.ueberlast.meldung') });
      }
      let zu = false;
      reply.raw.once('close', () => {
        if (!zu) {
          zu = true;
          this.fertig();
        }
      });
    });
  }
}
