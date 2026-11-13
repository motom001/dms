import { setzeErlaubteSprachen } from '../../shared/src/beschriftung';
import { setzeSprache } from '../../shared/src/sprache';
import { istVerfuegbar, liesSpracheinstellung, SPRACHEN_STANDARD, verfuegbareSprachen, type Spracheinstellung } from '../../shared/src/sprachwahl';
import { hoechstens } from './db';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { t } from './sprache';
import type { Sprachpakete, SprachpaketStand } from './sprachpakete';

/**
 * Sprachen der Ablage (#729): erlaubte Sprachen und Sprache der Installation – Einstellung „sprachen“ (Werkbank →
 * Sprachen). Wie die Region liest jeder Prozess sie beim Start und danach jede Minute neu; der speichernde Server
 * übernimmt sie sofort. Die Sprache der Installation gilt für Anfragen ohne eigene Wahl, für E-Mails an Personen ohne
 * Wahl und für Texte, die der Server einmal für alle bildet (z. B. Titel und Namen der Systemmappentypen).
 */
export const SPRACHEN_NEU_LESEN_MS = 60_000;
/** Sprache beim Start der Oberfläche (#1198): höchstens so lange auf die Datenbank warten, dann die zuletzt gelesene. */
export const SPRACHE_HOECHSTENS_MS = 2000;

export class SprachDienst {
  private uhr: ReturnType<typeof setInterval> | null = null;
  /** Sprachpakete (#731): kommen dazu, sobald die Datenbank-Dienste stehen; danach lädt `lade` sie mit. */
  pakete: Sprachpakete | null = null;
  constructor(private einstellungen: Einstellungen) {}

  /** Zuletzt gelesene Einstellung (#1198): Rückfall, wenn die Datenbank gerade nicht antwortet. */
  private zuletzt: Spracheinstellung | null = null;

  async lies(): Promise<Spracheinstellung> { const e = liesSpracheinstellung(await this.einstellungen.lies('sprachen')); this.zuletzt = e; return e; }

  /** Wie `lies`, aber höchstens `ms` warten – sonst die zuletzt gelesene Einstellung bzw. die Vorgabe (#1198). */
  liesHoechstens(ms = SPRACHE_HOECHSTENS_MS): Promise<Spracheinstellung> {
    return hoechstens(this.lies(), ms, () => this.zuletzt ?? liesSpracheinstellung(null));
  }

  /** Liest die Sprachpakete und die Einstellung und setzt Sprache und erlaubte Sprachen dieses Prozesses. */
  async lade(): Promise<Spracheinstellung> {
    // Erst die Sprachpakete: Nur eingetragene Sprachen gelten als verfügbar.
    if (this.pakete) await this.pakete.lade().catch((e: Error) => protokoll.modul('werkbank').warn('Sprachpakete nicht lesbar', { fehler: e.message }));
    const e = await this.lies();
    uebernimm(e);
    return e;
  }

  starte() {
    this.uhr ??= setInterval(() => { void this.lade().catch(() => {}); }, SPRACHEN_NEU_LESEN_MS);
    this.uhr.unref?.();
  }
  stoppe() { if (this.uhr) clearInterval(this.uhr); this.uhr = null; }

  /** Stand für die Werkbank: Einstellung, alle Sprachen, die es gibt, und die installierten Sprachpakete (#731). */
  async stand(): Promise<{ einstellung: Spracheinstellung; verfuegbar: string[]; pakete: SprachpaketStand[] }> {
    return { einstellung: await this.lies(), verfuegbar: verfuegbareSprachen(), pakete: (await this.pakete?.stand()) ?? [] };
  }

  /**
   * Sprachpaket entfernt (#731): Sprache aus der Einstellung nehmen – war sie die Sprache der Installation, gilt wieder
   * Deutsch. Personen, die sie gewählt hatten, behalten ihre Wahl (gilt bei einer Neuinstallation wieder).
   */
  async ohne(kennung: string): Promise<Spracheinstellung> {
    if (this.pakete) await this.pakete.lade(true);
    const gespeichert = await this.einstellungen.lies('sprachen');
    const roh = (gespeichert && typeof gespeichert === 'object' ? gespeichert : SPRACHEN_STANDARD) as Partial<Spracheinstellung>;
    const erlaubt = Array.isArray(roh.erlaubt) ? roh.erlaubt : SPRACHEN_STANDARD.erlaubt;
    const neu = liesSpracheinstellung({ standard: roh.standard === kennung ? SPRACHEN_STANDARD.standard : roh.standard, erlaubt: erlaubt.filter((x) => x !== kennung) });
    await this.einstellungen.schreibe('sprachen', neu);
    uebernimm(neu);
    protokoll.modul('werkbank').info('Sprache entfernt', { sprache: kennung, standard: neu.standard, erlaubt: neu.erlaubt.join(', ') });
    return neu;
  }

  async speichere(e: unknown): Promise<Spracheinstellung> {
    const x = (e ?? {}) as Record<string, unknown>;
    const alt = await this.lies();
    if (x.standard !== undefined && !istVerfuegbar(x.standard)) throw new Fachfehler(422, t('meldungen.sprachen.unbekannt'));
    if (x.erlaubt !== undefined && (!Array.isArray(x.erlaubt) || !x.erlaubt.every(istVerfuegbar))) throw new Fachfehler(422, t('meldungen.sprachen.unbekannt'));
    const standard = (x.standard as string | undefined) ?? alt.standard;
    const erlaubt = (x.erlaubt as string[] | undefined) ?? alt.erlaubt;
    if (!erlaubt.includes(standard)) throw new Fachfehler(422, t('meldungen.sprachen.standard-erlaubt'));
    const neu = liesSpracheinstellung({ standard, erlaubt });
    await this.einstellungen.schreibe('sprachen', neu);
    uebernimm(neu);
    protokoll.modul('werkbank').info('Sprachen eingestellt', { standard: neu.standard, erlaubt: neu.erlaubt.join(', ') });
    return neu;
  }
}

/** Einstellung für diesen Prozess übernehmen. */
export function uebernimm(e: Spracheinstellung) {
  setzeSprache(e.standard);
  setzeErlaubteSprachen(e.erlaubt);
}
