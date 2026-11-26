import type { InstalliertesPaket } from '../../../shared/src/pakete';
import {
  DATUMSFORMATE,
  istLand,
  istVorwahl,
  istWaehrung,
  istZeitzone,
  liesFormate,
  liesRegion,
  setzeFormate,
  setzeZeitzone,
  tagIn,
  TELEFONFORMATE,
  UHRZEITFORMATE,
  WAEHRUNG_STELLUNGEN,
  WOCHENBEGINNE,
  ZAHLENFORMATE,
  type Formate,
  type Region,
} from '../../../shared/src/region';
import type { Einstellungen } from './einstellungen';
import { feiertagsquelle, type Feiertagsquelle } from '../../../shared/src/feiertagsquelle';
// Telefonnummern (#1609): meldet die Anzeige an (formatiere, tel:-Link) – im Server, nicht im Paket-Läufer.
import '../../../shared/src/telefon';
import { Fachfehler } from '../grundlagen/fehler';
import { protokoll } from '../protokoll/protokoll';
import { t } from '../sprache/sprache';

/**
 * Region der Ablage (#726): Land, Bundesland, Zeitzone und Formate (#1610) – Einstellung „region“ in der Datenbank.
 *
 * Mehrere Server: Jeder Prozess liest die Einstellung beim Start und danach jede Minute neu, damit eine Änderung
 * an einem Server spätestens nach einer Minute überall gilt; der speichernde Server übernimmt sie sofort.
 * Ohne eigene Einstellung gilt das Bundesland, das bis #726 bei der Täglichen Zusammenfassung stand.
 */
export const REGION_NEU_LESEN_MS = 60_000;

export class RegionDienst {
  private uhr: ReturnType<typeof setInterval> | null = null;
  constructor(private einstellungen: Einstellungen) {}

  async lies(): Promise<Region> {
    const v = await this.einstellungen.lies('region');
    const alt = v ? null : ((await this.einstellungen.lies('aufgaben_mail')) as { bundesland?: unknown } | null)?.bundesland;
    return liesRegion(v, alt);
  }

  /** Liest die Einstellung und setzt die Zeitzone dieses Prozesses. */
  async lade(): Promise<Region> {
    const r = await this.lies();
    setzeZeitzone(r.zeitzone);
    setzeFormate(r.formate);
    return r;
  }

  starte() {
    this.uhr ??= setInterval(() => {
      void this.lade().catch(() => {});
    }, REGION_NEU_LESEN_MS);
    this.uhr.unref?.();
  }
  stoppe() {
    if (this.uhr) clearInterval(this.uhr);
    this.uhr = null;
  }

  /**
   * Speichert die Region. `pakete`: die installierten Pakete – die wählbaren Regionen kommen seit #1696 aus einem
   * Regionspaket für das Land, sonst sind es die Bundesländer des Kerns wie bisher.
   */
  async speichere(e: unknown, pakete: readonly InstalliertesPaket[] = []): Promise<Region> {
    const x = (e ?? {}) as Record<string, unknown>;
    const alt = await this.lies();
    if (x.land !== undefined && !istLand(x.land)) throw new Fachfehler(422, t('meldungen.region.unbekanntes-land'));
    const regionen = feiertagsquelle(pakete, { land: (x.land as string | undefined) ?? alt.land, bundesland: null }).regionen;
    const istRegion = (v: unknown): v is string => typeof v === 'string' && Object.hasOwn(regionen, v);
    if (x.bundesland !== undefined && x.bundesland !== null && x.bundesland !== '' && !istRegion(x.bundesland))
      throw new Fachfehler(422, t('meldungen.region.unbekanntes-bundesland'));
    if (x.zeitzone !== undefined && !istZeitzone(x.zeitzone))
      throw new Fachfehler(422, t('meldungen.region.unbekannte-zeitzone-bitte-eine'));
    const neu: Region = {
      land: x.land === undefined ? alt.land : (x.land as Region['land']),
      bundesland: x.bundesland === undefined ? alt.bundesland : istRegion(x.bundesland) ? x.bundesland : null,
      zeitzone: x.zeitzone === undefined ? alt.zeitzone : (x.zeitzone as string),
      formate: x.formate === undefined ? alt.formate : pruefeFormate(x.formate, alt.formate),
    };
    await this.einstellungen.schreibe('region', neu);
    setzeZeitzone(neu.zeitzone);
    setzeFormate(neu.formate);
    protokoll.modul('werkbank').info('Region eingestellt', { ...neu });
    return neu;
  }

  /** Feiertage eines Jahres (Vorschau in der Werkbank), aus Land und Bundesland – über die Feiertagsquelle (#1696). */
  static feiertageIm(
    r: Region,
    jahr = Number(tagIn().slice(0, 4)),
    quelle: Feiertagsquelle = feiertagsquelle([], r),
  ): Array<{ datum: string; name: string }> {
    if (!r.bundesland) return [];
    return [...quelle.jahr(jahr)].map(([datum, name]) => ({ datum, name })).sort((a, b) => a.datum.localeCompare(b.datum));
  }
}

/** Was die Eingabe an Formaten ändert (#1610); Unbekanntes lehnt der Server ab, statt es still zu übergehen. */
function pruefeFormate(e: unknown, alt: Formate): Formate {
  const x = { ...alt, ...((e ?? {}) as Record<string, unknown>) } as Record<string, unknown>;
  const wahl = (liste: readonly unknown[], k: string) => x[k] === null || liste.includes(x[k]);
  const tage = x.arbeitstage;
  if (
    !wahl(DATUMSFORMATE, 'datum') ||
    !wahl(UHRZEITFORMATE, 'uhrzeit') ||
    !wahl(ZAHLENFORMATE, 'zahlen') ||
    !wahl(WAEHRUNG_STELLUNGEN, 'waehrungStellung') ||
    !wahl(WOCHENBEGINNE, 'wochenbeginn') ||
    !TELEFONFORMATE.includes(x.telefon as Formate['telefon']) ||
    !istWaehrung(x.waehrung) ||
    !istVorwahl(x.vorwahl) ||
    !Array.isArray(tage) ||
    tage.some((t) => ![1, 2, 3, 4, 5, 6, 7].includes(t as number))
  )
    throw new Fachfehler(422, t('meldungen.region.formate-ungueltig'));
  return liesFormate(x);
}
