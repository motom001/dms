/**
 * Sicherung (#103–#105, #585, #976). #1278: aufgeteilt, die Tür bleibt hier – die Klasse ist eine Kette
 * SicherungBasis (sicherung-basis.ts) → SicherungAnlegen (sicherung-anlegen.ts) → SicherungExtern (sicherung-extern.ts)
 * → Sicherung; Typen und Hilfen in sicherung-hilfen.ts.
 */
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { SicherungExtern } from './sicherung-extern';
import { type Lauf, type ExternAnbindung, type SicherungsQuellen, ortszeit, log } from './sicherung-hilfen';
import { EntfernteSicherungen } from './sicherung-entfernt';
import { wochentagVon, laufeFaellige, einstellungsMerker } from '../zeitplan/zeitplan';

export {
  behalten,
  bereinigePlan,
  isoWoche,
  ohneZugangsdaten,
  ortszeit,
  PLAN_STANDARD,
  schlankeMetadaten,
  type Eintragsliste,
  type ExternAnbindung,
  type ExternStand,
  type Lauf,
  type Metadaten,
  type SchlankeMetadaten,
} from './sicherung-hilfen';
export { STUECK_MAX } from '../grundlagen/grenzen';

export class Sicherung extends SicherungExtern {
  protected lauf: Lauf | null = null;
  private zeitgeber?: NodeJS.Timeout;
  protected jetzt: () => Date;
  /** Läuft gerade eine Wiederherstellung (#107)? Dann keine Sicherung (außer der davor). */
  sperre: () => boolean = () => false;
  /** Pakete, die jede Sicherung außer Haus kopieren (#585); null = keine Pakete eingerichtet (Tests, frühe Startphase). */
  extern: ExternAnbindung | null = null;
  /** Entfernte Sicherungen (#976): auflisten und zurückholen. */
  readonly entfernt = new EntfernteSicherungen(this);

  constructor(
    /** Ordner der Sicherungen (eigenes Volume). */
    readonly ordner: string,
    /** Wurzel der Dateien (/data/files) und Haushalt: gesichert wird <wurzel>/<haushalt>. */
    readonly dateiWurzel: string,
    readonly haushaltId: string,
    protected q: SicherungsQuellen,
  ) {
    super();
    this.jetzt = q.jetzt ?? (() => new Date());
  }

  /** Änderungen am Stand außer Haus nacheinander – Rückmeldung, neue Sicherung und Aufbewahrung können sich überschneiden. */
  protected externKette: Promise<unknown> = Promise.resolve();

  /* ---------- Zeitplan (#104) ---------- */

  /** Jede Minute: fällige automatische Sicherung starten, Probleme melden. */
  async tick(): Promise<'gestartet' | 'nichts'> {
    let gestartet: 'gestartet' | 'nichts' = 'nichts';
    const plan = await this.plan();
    // Läuft gerade eine Probe oder Wiederherstellung, in der nächsten Minute noch einmal versuchen.
    if (plan.aktiv && !this.q.wartungAktiv?.() && !this.laeuft() && !this.sperre()) {
      // Zeitplan-Baustein (#724): heute zur Uhrzeit, verpasste Läufe noch am selben Tag (auch nach einem Neustart).
      const takt = { uhrzeit: plan.uhrzeit, an: (tag: string) => plan.haeufigkeit === 'taeglich' || wochentagVon(tag) === plan.wochentag };
      await laufeFaellige(einstellungsMerker(this.q.einstellungen, 'sicherung_zuletzt_auto'), ortszeit(this.jetzt()), takt, async () => {
        try {
          const { fertig } = await this.starte('automatisch', 'Zeitplan');
          gestartet = 'gestartet';
          void fertig.then(() => this.melde()).catch(() => {});
        } catch (e) {
          log.warn('Automatische Sicherung nicht begonnen', { grund: (e as Error).message });
        }
      });
    }
    if (gestartet === 'nichts') await this.melde();
    return gestartet;
  }

  /** Nach einem Neustart: halb geschriebene Sicherungen entfernen. */
  async raeumeTeileAuf() {
    let namen: string[] = [];
    try {
      namen = await readdir(this.ordner);
    } catch {
      return;
    }
    // Auch angefangenes Zurückholen (#976): Teildatei und Stand.
    for (const n of namen.filter((x) => (x.startsWith('.') && x.endsWith('.teil')) || x.startsWith('.holen-')))
      await rm(join(this.ordner, n), { force: true });
  }

  start(ms = 60_000) {
    void this.raeumeTeileAuf();
    const lauf = () => void this.tick().catch((e) => log.error('Zeitplan der Sicherung gestört', { fehler: (e as Error).message }));
    this.zeitgeber = setInterval(lauf, ms);
    this.zeitgeber.unref?.();
  }
  stop() {
    if (this.zeitgeber) clearInterval(this.zeitgeber);
  }
}
