import { randomUUID } from 'node:crypto';
import { Fachfehler } from '../grundlagen/fehler';
import type { Kurzzustand } from '../zwischenspeicher/kurzzustand';
import { t } from '../sprache/sprache';
import {
  meldeFortschritt,
  neuerStand,
  schliessePhasen,
  type Auftrag,
  type Fortschritt,
  type PhasenPlan,
} from '../../../shared/src/auftrag';

export type { Auftrag, AuftragPhase, Fortschritt, PhasenPlan } from '../../../shared/src/auftrag';

/** Mehrere Prozesse (#745): Stand alle so viele ms in den Kurzzustand, Belegung mit dieser Frist (verlängert je Takt). */
export const AUFTRAG_TAKT_MS = 1000;
export const AUFTRAG_FRIST_MS = 60_000;
const ART = 'auftrag';

/**
 * Lange Arbeiten (z. B. tausende Demo-Mappen) laufen im Hintergrund, damit ein
 * Reverse-Proxy die Anfrage nicht nach seiner Wartezeit abbricht (Fehler 504).
 * Die Oberfläche fragt den Stand regelmäßig ab. Es läuft immer nur ein Auftrag.
 * Seit #364 mit Phasen und Einheit (`phasen`), `fertig`/`gesamt` sind die Summe.
 *
 * Mehrere Prozesse (#745, {@link teile}): Der Auftrag läuft in dem Prozess, der ihn angenommen hat. „Nur einer“ gilt
 * über eine Belegung im Kurzzustand (mit Frist, die der laufende Prozess jede Sekunde verlängert – stirbt er, wird sie
 * frei); den Stand schreibt er jede Sekunde dorthin, `stand()` liest ihn in jedem Prozess. Abbrechen aus einem anderen
 * Prozess setzt einen Merker, den der laufende beim nächsten Takt sieht.
 */
export class Auftraege {
  private letzter?: Auftrag;
  private abbruch?: AbortController;
  private geteilt: Kurzzustand | null = null;
  /** Bis der Stand eines neuen Auftrags im Kurzzustand steht (#745). */
  private anmeldungen = new Map<string, Promise<void>>();

  constructor(private log: (m: string) => void = () => {}) {}

  /** Stand und Belegung über alle Prozesse im Kurzzustand (#745). */
  teile(z: Kurzzustand) {
    this.geteilt = z;
  }

  /** Der Auftrag dieses Prozesses (Tests, ein Prozess). */
  aktuell(): Auftrag | null {
    return this.letzter ?? null;
  }

  /**
   * Der aktuelle Auftrag – bei mehreren Prozessen der zuletzt gestartete aus irgendeinem. Läuft er laut Stand noch,
   * ist seine Belegung aber abgelaufen, starb der Prozess: dann als Fehler „unterbrochen“.
   */
  async stand(): Promise<Auftrag | null> {
    const z = this.geteilt;
    if (!z) return this.aktuell();
    if (this.letzter?.status === 'laeuft') return this.letzter;
    const e = (await z.lies(ART, 'stand'))?.wert as Auftrag | null | undefined;
    if (!e) return this.aktuell();
    if (this.letzter && e.id === this.letzter.id) return this.letzter;
    if (e.status === 'laeuft' && !(await z.lies(ART, 'lauf'))) {
      return { ...e, status: 'fehler', fehler: t('meldungen.auftrag.unterbrochen'), beendet: e.beendet ?? new Date().toISOString() };
    }
    return e;
  }

  /**
   * Mit `abbrechbar` (#458) bekommt die Arbeit ein Signal; abbrechen() setzt es, die Arbeit hört dann von selbst auf
   * und gibt ihr Ergebnis bis dahin zurück.
   */
  starte(
    art: string,
    titel: string,
    arbeit: (fortschritt: Fortschritt, signal?: AbortSignal) => Promise<unknown>,
    phasen: PhasenPlan[] = [],
    opt: { abbrechbar?: boolean } = {},
  ): Auftrag {
    if (this.letzter?.status === 'laeuft')
      throw new Fachfehler(409, t('meldungen.auftrag.es-laeuft-bereits-bitte', { titel: this.letzter.titel }));
    const a: Auftrag = {
      id: randomUUID(),
      art,
      titel,
      status: 'laeuft',
      ...neuerStand(phasen),
      gestartet: new Date().toISOString(),
      ...(opt.abbrechbar ? { abbrechbar: true } : {}),
    };
    this.letzter = a;
    const abbruch = opt.abbrechbar ? new AbortController() : undefined;
    this.abbruch = abbruch;
    const beginn = Date.now();
    const z = this.geteilt;
    let angemeldet = () => {};
    if (z)
      this.anmeldungen.set(
        a.id,
        new Promise<void>((r) => {
          angemeldet = r;
        }),
      );
    void (async () => {
      let takt: NodeJS.Timeout | null = null;
      try {
        if (z) {
          // Nur einer über alle Prozesse: Wer die Belegung nicht bekommt, meldet den laufenden als Grund.
          if (!(await z.belege(ART, 'lauf', AUFTRAG_FRIST_MS, { id: a.id }))) {
            const anderer = (await z.lies(ART, 'stand'))?.wert as Auftrag | null;
            throw new Fachfehler(
              409,
              t('meldungen.auftrag.es-laeuft-bereits-bitte', { titel: anderer?.titel ?? t('meldungen.auftrag.anderer') }),
            );
          }
          await z.setze(ART, 'stand', a, null);
          angemeldet();
          let zuletzt = JSON.stringify(a);
          takt = setInterval(
            () =>
              void (async () => {
                await z.setze(ART, 'lauf', { id: a.id }, Date.now() + AUFTRAG_FRIST_MS);
                const j = JSON.stringify(a);
                if (j !== zuletzt && a.status === 'laeuft') {
                  zuletzt = j;
                  await z.setze(ART, 'stand', a, null);
                }
                if (abbruch && !abbruch.signal.aborted && (await z.lies(ART, `abbruch:${a.id}`))) {
                  a.abgebrochen = true;
                  abbruch.abort();
                  this.log(`${titel}: abgebrochen`);
                }
              })().catch(() => {}),
            AUFTRAG_TAKT_MS,
          );
          takt.unref?.();
        }
        a.ergebnis = await arbeit((fertig, gesamt, phase, extra) => meldeFortschritt(a, fertig, gesamt, phase, extra), abbruch?.signal);
        a.status = 'fertig';
        schliessePhasen(a);
        this.log(`${titel}: fertig nach ${Date.now() - beginn} ms`);
      } catch (e) {
        a.status = 'fehler';
        a.fehler = e instanceof Error ? e.message : String(e);
        this.log(`${titel}: Fehler – ${a.fehler}`);
      } finally {
        angemeldet();
        a.beendet = new Date().toISOString();
        if (takt) clearInterval(takt);
        const lauf = z ? ((await z.lies(ART, 'lauf').catch(() => null))?.wert as { id?: string } | null | undefined) : null;
        if (z && lauf?.id === a.id) {
          await z.setze(ART, 'stand', a, null).catch(() => {});
          await z.loesche(ART, `abbruch:${a.id}`).catch(() => 0);
          await z.loesche(ART, 'lauf').catch(() => 0);
        }
      }
    })();
    return a;
  }

  /**
   * Wartet, bis ein eben gestarteter Auftrag für alle Prozesse sichtbar ist (#745) – sonst fragte die Oberfläche den
   * Stand vielleicht bei einem anderen Prozess, bevor er dort steht. Für die Routen, die mit 202 antworten.
   */
  async angemeldet(x: Auftrag | Promise<Auftrag>): Promise<Auftrag> {
    const a = await x;
    const p = this.anmeldungen.get(a.id);
    if (p) {
      await p;
      this.anmeldungen.delete(a.id);
    }
    return a;
  }

  /** Den laufenden Auftrag abbrechen (#458) – nur, wenn er sich abbrechen lässt (und es dieser ist). */
  async abbrechen(id?: unknown): Promise<Auftrag> {
    const lokal = this.letzter;
    if (lokal?.status === 'laeuft' && (id === undefined || id === lokal.id)) {
      if (!lokal.abbrechbar || !this.abbruch)
        throw new Fachfehler(409, t('meldungen.auftrag.laesst-sich-nicht-abbrechen', { titel: lokal.titel }));
      lokal.abgebrochen = true;
      this.abbruch.abort();
      this.log(`${lokal.titel}: abgebrochen`);
      return lokal;
    }
    const a = this.geteilt ? await this.stand() : null;
    if (!a || a.status !== 'laeuft' || (id !== undefined && id !== a.id))
      throw new Fachfehler(409, t('meldungen.auftrag.es-laeuft-gerade-kein'));
    if (!a.abbrechbar) throw new Fachfehler(409, t('meldungen.auftrag.laesst-sich-nicht-abbrechen', { titel: a.titel }));
    // Läuft in einem anderen Prozess (#745): Merker setzen, der laufende bricht beim nächsten Takt ab.
    await this.geteilt!.setze(ART, `abbruch:${a.id}`, true, Date.now() + 10 * 60_000);
    return { ...a, abgebrochen: true };
  }

  /** Wartet, bis der aktuelle Auftrag beendet ist (für Tests). */
  async warte(): Promise<Auftrag | null> {
    while (this.letzter?.status === 'laeuft') await new Promise((r) => setTimeout(r, 10));
    return this.aktuell();
  }
}
