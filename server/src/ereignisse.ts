import { WIEDERHOLEN_MIN, type KatalogArt, type KatalogEreignis, type Ausloeser } from '../../shared/src/ereignisse';
import type { GespeichertesKatalogEreignis, Repo } from './repo';
import { protokoll } from './protokoll';
import { t } from './sprache';

/**
 * Verteiler des Ereigniskatalogs (#670, #724): **der eine Ausgangskorb** (`ereignisse`). Der Kern schreibt jedes
 * Geschehen genau einmal hinein; der Verteiler gibt es an die Abnehmer im DMS – Automatisierungen (#674) und Pakete
 * (alle abonnierten Ereignisse; sie landen in der Zustellung des Paket-Läufers).
 *
 * - **Mindestens einmal:** Ein Ereignis gilt erst als verteilt, wenn **alle** Abnehmer es ohne Fehler angenommen haben.
 *   Wirft einer, kommt das Ereignis später noch einmal – an alle. Abnehmer erkennen eine Wiederholung an `e.id`.
 * - **Mehrere Server:** Ein Server holt Ereignisse mit `FOR UPDATE SKIP LOCKED` und sperrt sie für {@link SPERRE_S} s;
 *   stirbt er, holt sie danach ein anderer. Kein Zustand nur im Arbeitsspeicher außer dem Wecker.
 * - **Wiederholen:** nach 1, 5 und 30 Minuten, 2 und 6 Stunden; danach aufgegeben (bleibt mit Fehler stehen).
 * - **Ruhe:** Während einer Wartung oder Wiederherstellung (`ruht()`) verteilt er nichts.
 */
const log = protokoll.modul('ereignisse');

export type Abnehmer = (e: KatalogEreignis) => Promise<void>;
/** Frist, in der ein Server ein geholtes Ereignis verteilen muss. */
export const SPERRE_S = 120;
/** Abstand der Wiederholungen in Minuten; danach aufgegeben (eine Regel für alle Abnehmer, shared/src/ereignisse.ts). */
export { WIEDERHOLEN_MIN };
/** Wie oft der Verteiler ohne Anlass nachsieht (gebündelte Ereignisse, andere Server). */
const PRUEF_MS = 2_000;
/** Verteiltes bleibt so lange stehen (Fehlersuche, Werkbank). */
const AUFBEWAHREN_TAGE = 7;

export class Ereignisverteiler {
  private abnehmer = new Map<string, Abnehmer>();
  private lauf: Promise<number> | null = null;
  private nochmal = false;
  private uhr: ReturnType<typeof setInterval> | null = null;
  private aufgeraeumt = 0;

  constructor(private o: { repo: () => Repo; ruht?: () => boolean | Promise<boolean> }) {}

  /** Einen Abnehmer anmelden (Name je Abnehmer eindeutig; ein zweiter Aufruf ersetzt ihn). */
  abonniere(name: string, fn: Abnehmer) { this.abnehmer.set(name, fn); }
  abbestellen(name: string) { this.abnehmer.delete(name); }
  get namen() { return [...this.abnehmer.keys()]; }

  /** Regelmäßig nachsehen (Start des Servers). */
  starte() { this.uhr ??= setInterval(() => this.wecke(), PRUEF_MS); this.uhr.unref?.(); }
  stoppe() { if (this.uhr) clearInterval(this.uhr); this.uhr = null; }

  /** Nach einer Änderung: gleich verteilen (nicht blockierend). */
  wecke() {
    if (this.lauf) { this.nochmal = true; return; }
    void this.verteile().catch((e) => log.error('Ereignisse nicht verteilt', { fehler: (e as Error).message }));
  }

  /** Verteilt alles, was fällig ist; liefert die Anzahl verteilter Ereignisse. Läuft schon ein Lauf, erst nach ihm. */
  async verteile(): Promise<number> {
    while (this.lauf) await this.lauf.catch(() => 0);
    this.lauf = this.lauf_();
    try { return await this.lauf; } finally { this.lauf = null; }
  }

  private async lauf_(): Promise<number> {
    let n = 0;
    do {
      this.nochmal = false;
      if (await this.o.ruht?.()) return n;
      for (;;) {
        const liste = await this.o.repo().holeKatalogEreignisse(50, SPERRE_S);
        if (!liste.length) break;
        // „Verteilt“ gesammelt setzen (#743): eine Anweisung je Abholung statt je Ereignis. Dauert eine Abholung
        // länger als die halbe Sperre, schon zwischendurch – sonst holte ein anderer Server sie noch einmal.
        let verteilt: string[] = [];
        let seit = Date.now();
        const merke = async () => { if (verteilt.length) await this.o.repo().katalogEreignisseVerteilt(verteilt); verteilt = []; seit = Date.now(); };
        try {
          for (const e of liste) {
            if (await this.eines(e)) { verteilt.push(e.id); n++; }
            if (Date.now() - seit > (SPERRE_S * 1000) / 2) await merke();
          }
        } finally { await merke(); }
      }
    } while (this.nochmal);
    if (Date.now() - this.aufgeraeumt > 600_000) { this.aufgeraeumt = Date.now(); await this.o.repo().raeumeKatalogEreignisseAuf(AUFBEWAHREN_TAGE); }
    return n;
  }

  private async eines(g: GespeichertesKatalogEreignis): Promise<boolean> {
    const e: KatalogEreignis = { id: g.id, art: g.art as KatalogArt, daten: g.daten, ausloeser: g.ausloeser as unknown as Ausloeser, erstellt: g.erstellt };
    const fehler: string[] = [];
    for (const [name, fn] of this.abnehmer) {
      try { await fn(e); } catch (x) { fehler.push(`${name}: ${(x as Error).message}`); }
    }
    if (!fehler.length) return true;
    const warte = WIEDERHOLEN_MIN[g.versuche];
    await this.o.repo().katalogEreignisFehlgeschlagen(g.id, fehler.join('; '), warte === undefined ? null : new Date(Date.now() + warte * 60_000));
    log[warte === undefined ? 'error' : 'warn'](warte === undefined ? t('meldungen.ereignisse.ereignis-aufgegeben') : t('meldungen.ereignisse.ereignis-wird-wiederholt'), { art: g.art, id: g.id, versuch: g.versuche + 1, fehler: fehler.join('; ') });
    return false;
  }
}
