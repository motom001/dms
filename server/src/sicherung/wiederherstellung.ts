/**
 * Wiederherstellen einer Sicherung (#107) und Probe-Wiederherstellung (#109).
 *
 * Sicher umschalten: Die Datenbank entsteht in einem eigenen, leeren Schema (aus den Migrationen,
 * die die Sicherung kannte), die Dateien in einem Ordner daneben. Erst wenn alles gelesen, geprüft
 * (GCM-Tag, Prüfwort, Anzahl) und auf den heutigen Stand migriert ist, tauscht eine einzige
 * Transaktion die Schemas; danach startet das DMS neu. Bricht etwas vorher ab, bleibt der alte
 * Stand unverändert. Die Probe spielt genauso ein, schaltet aber nie um und räumt danach auf.
 *
 * #1278: aufgeteilt, die Tür bleibt hier – die Klasse ist eine Kette WiederherstellungBasis
 * (wiederherstellung-basis.ts) → WiederherstellungAusfuehren (wiederherstellung-ausfuehren.ts) → Wiederherstellung;
 * Typen und Hilfen in wiederherstellung-hilfen.ts.
 */
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { WiederherstellungAusfuehren } from './wiederherstellung-ausfuehren';
import {
  type Wiederherstellungslauf,
  type WiederherstellungsQuellen,
  ERWEITERUNGEN_SCHRITT,
  log,
  type Abgleich,
  STAGING,
  ALT,
  BEHALTEN,
  BEHALTEN_TAGE,
} from './wiederherstellung-hilfen';
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import { schluesselAusText } from '../geheimnisse/tresor';
import { laufeFaellige, einstellungsMerker, wochentagVon } from '../zeitplan/zeitplan';
import { ortszeit } from './sicherung';
import { bezeichner } from './datenbankabzug';

export type { Wiederherstellungslauf } from './wiederherstellung-hilfen';

export class Wiederherstellung extends WiederherstellungAusfuehren {
  protected lauf: Wiederherstellungslauf | null = null;
  /** Belegt ab dem ersten Prüfen eines Starts – verhindert zwei gleichzeitige Läufe. */
  protected belegt = false;
  protected jetzt: () => Date;

  constructor(protected q: WiederherstellungsQuellen) {
    super();
    this.jetzt = q.jetzt ?? (() => new Date());
  }
  /** Stand für die Routen (#1341), in weiteren Prozessen vom Leiter – wie `Sicherung.laufStand`. */
  laufStand: () => Promise<Wiederherstellungslauf | null> = async () => this.aktuellerLauf();

  /* ---------- Starten ---------- */

  async starte(
    e: { name?: unknown; schluessel?: unknown; bestaetigt?: unknown },
    admin: { email: string } | null,
    einrichtungscode?: unknown,
  ): Promise<Wiederherstellungslauf> {
    const art = await this.pruefeZugang(!!admin, einrichtungscode);
    this.belege();
    try {
      return await this.starteBelegt(e, admin, art);
    } catch (x) {
      this.belegt = false;
      throw x;
    }
  }

  private async starteBelegt(
    e: { name?: unknown; schluessel?: unknown; bestaetigt?: unknown },
    admin: { email: string } | null,
    art: 'frisch' | 'laufend',
  ): Promise<Wiederherstellungslauf> {
    const name = String(e.name ?? '');
    const text = typeof e.schluessel === 'string' ? e.schluessel : undefined;
    const a = await this.abgleich(name, text);
    if (a.probleme.length) throw new Fachfehler(422, a.probleme.join(' '));
    if (art === 'laufend' && e.bestaetigt !== true) throw new Fachfehler(422, t('meldungen.wiederherstellung.bitte-bestaetigen-dass-der'));
    const k = this.schluessel(a.meta, text);
    await this.pruefePlatz(a.meta);
    const von = admin?.email ?? t('meldungen.wiederherstellung.einrichtung-frisches-system');
    const lauf = this.neuerLauf('wiederherstellung', name, von, [
      ...(art === 'laufend' ? [t('meldungen.wiederherstellung.sicherung-des-jetzigen-stands')] : []),
      t('meldungen.wiederherstellung.pruefsumme-der-datei'),
      t('meldungen.wiederherstellung.entschluesseln-und-einspielen'),
      'Prüfwort',
      t('meldungen.wiederherstellung.anzahl-mappen-dokumente-benutzer'),
      t('meldungen.wiederherstellung.auf-den-heutigen-stand'),
      ERWEITERUNGEN_SCHRITT,
      t('meldungen.wiederherstellung.dateien-uebernehmen'),
      'Schlüsseldatei',
      'Umschalten',
      'Neustart',
    ]);
    log.warn('Wiederherstellung begonnen', { sicherung: name, von, art });
    void this.fuehreAus(lauf, a, k, art)
      .catch(() => {})
      .finally(() => {
        this.belegt = false;
      });
    return this.aktuellerLauf()!;
  }

  /** Probe (#109): wie eine Wiederherstellung, aber ohne Umschalten; danach aufräumen. */
  async starteProbe(name: string | null, von: string): Promise<{ lauf: Wiederherstellungslauf; fertig: Promise<boolean> }> {
    this.belege();
    try {
      return await this.starteProbeBelegt(name, von);
    } catch (x) {
      this.belegt = false;
      throw x;
    }
  }

  private async starteProbeBelegt(name: string | null, von: string): Promise<{ lauf: Wiederherstellungslauf; fertig: Promise<boolean> }> {
    const liste = (await this.q.sicherung.liste()).filter((x) => x.meta);
    const ziel = name ? liste.find((x) => x.name === name) : liste[0];
    if (!ziel)
      throw new Fachfehler(
        404,
        name ? t('meldungen.wiederherstellung.diese-sicherung-gibt-es-2') : t('meldungen.wiederherstellung.es-gibt-noch-keine'),
      );
    const m = ziel.meta!;
    const k = this.q.tresor.fingerabdruck === m.verschluesselung.fingerabdruck ? schluesselAusText(this.q.tresor.alsText() ?? '') : null;
    const lauf = this.neuerLauf('probe', ziel.name, von, [
      t('meldungen.wiederherstellung.pruefsumme-der-datei'),
      t('meldungen.wiederherstellung.entschluesseln-und-einspielen'),
      'Prüfwort',
      t('meldungen.wiederherstellung.anzahl-mappen-dokumente-benutzer'),
      t('meldungen.wiederherstellung.auf-den-heutigen-stand'),
      ERWEITERUNGEN_SCHRITT,
      'Aufräumen',
    ]);
    log.info('Probe-Wiederherstellung begonnen', { sicherung: ziel.name, von });
    const fertig = (async () => {
      if (!k) {
        this.fehlschlag(
          lauf,
          t('meldungen.wiederherstellung.pruefsumme-der-datei'),
          t('meldungen.wiederherstellung.die-sicherung-braucht-den', {
            fingerabdruck: m.verschluesselung.fingerabdruck,
            wert: this.q.tresor.fingerabdruck ?? 'keinen',
          }),
        );
        await this.merkeProbe(ziel.name, false, lauf.fehler!);
        return false;
      }
      const a: Abgleich = { name: ziel.name, meta: m, vergleich: [], probleme: [], hinweise: [], schluesselNoetig: false };
      return this.fuehreAus(lauf, a, k, 'probe');
    })().finally(() => {
      this.belegt = false;
    });
    return { lauf: this.aktuellerLauf()!, fertig };
  }

  /** Jede Minute: fällige Probe starten (Standard sonntags 04:00). */
  async tick(): Promise<'gestartet' | 'nichts'> {
    const plan = await this.q.sicherung.probePlan();
    if (!plan.aktiv || this.q.wartungAktiv() || this.laeuft() || this.q.sicherung.laeuft()) return 'nichts';
    // Zeitplan-Baustein (#724): am gewählten Wochentag zur Uhrzeit, verpasst noch am selben Tag.
    const tage = await laufeFaellige(
      einstellungsMerker(this.q.sicherung.einstellungen, 'sicherung_probe_zuletzt'),
      ortszeit(this.jetzt()),
      { uhrzeit: plan.uhrzeit, an: (tag) => wochentagVon(tag) === plan.wochentag },
      async () => {},
    );
    if (!tage.length) return 'nichts';
    if (!(await this.q.sicherung.liste()).some((x) => x.meta)) return 'nichts';
    if (!(await this.q.sicherung.genugPlatz())) {
      log.warn('Probe-Wiederherstellung nicht begonnen: zu wenig freier Speicherplatz');
      return 'nichts';
    }
    try {
      await this.starteProbe(null, 'Zeitplan');
      return 'gestartet';
    } catch (x) {
      log.warn('Probe-Wiederherstellung nicht begonnen', { grund: (x as Error).message });
      return 'nichts';
    }
  }

  /** Nach einem Neustart: Reste abgebrochener Läufe und das alte Schema entfernen. */
  async raeumeAuf() {
    for (const r of await this.q.sql`SELECT nspname FROM pg_namespace WHERE nspname LIKE ${`${STAGING}%`} OR nspname LIKE ${`${ALT}%`}`) {
      const name = r.nspname as string;
      if (name.startsWith(BEHALTEN)) {
        // Ohne vorherige Sicherung: 7 Tage aufheben (Zeitstempel JJJJMMTTHHMMSS im Namen).
        const z = /^(\d{4})(\d{2})(\d{2})/.exec(name.slice(BEHALTEN.length));
        const alter = z ? this.jetzt().getTime() - Date.UTC(Number(z[1]), Number(z[2]) - 1, Number(z[3])) : Infinity;
        if (alter < BEHALTEN_TAGE * 24 * 3600 * 1000) continue;
      }
      await this.q.sql
        .unsafe(`DROP SCHEMA ${bezeichner(r.nspname as string)} CASCADE`)
        .catch((e) => log.warn('Altes Schema nicht entfernt', { schema: r.nspname, fehler: (e as Error).message }));
      log.info('Bereich einer früheren Wiederherstellung entfernt', { schema: r.nspname });
    }
    for (const n of await readdir(this.q.dateiWurzel).catch(() => [] as string[])) {
      if (n.startsWith('.wiederherstellung-')) await rm(join(this.q.dateiWurzel, n), { recursive: true, force: true });
    }
  }
}
