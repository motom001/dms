import { feiertage, istBundesland } from '../../shared/src/feiertage';
import { istLand, istZeitzone, liesRegion, setzeZeitzone, tagIn, type Region } from '../../shared/src/region';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { t } from './sprache';

/**
 * Region der Ablage (#726): Land, Bundesland, Zeitzone – Einstellung „region“ in der Datenbank.
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

  async speichere(e: unknown): Promise<Region> {
    const x = (e ?? {}) as Record<string, unknown>;
    const alt = await this.lies();
    if (x.land !== undefined && !istLand(x.land)) throw new Fachfehler(422, t('meldungen.region.unbekanntes-land'));
    if (x.bundesland !== undefined && x.bundesland !== null && x.bundesland !== '' && !istBundesland(x.bundesland))
      throw new Fachfehler(422, t('meldungen.region.unbekanntes-bundesland'));
    if (x.zeitzone !== undefined && !istZeitzone(x.zeitzone))
      throw new Fachfehler(422, t('meldungen.region.unbekannte-zeitzone-bitte-eine'));
    const neu: Region = {
      land: x.land === undefined ? alt.land : (x.land as Region['land']),
      bundesland: x.bundesland === undefined ? alt.bundesland : istBundesland(x.bundesland) ? x.bundesland : null,
      zeitzone: x.zeitzone === undefined ? alt.zeitzone : (x.zeitzone as string),
    };
    await this.einstellungen.schreibe('region', neu);
    setzeZeitzone(neu.zeitzone);
    protokoll.modul('werkbank').info('Region eingestellt', { ...neu });
    return neu;
  }

  /** Feiertage eines Jahres (Vorschau in der Werkbank), aus Land und Bundesland. */
  static feiertageIm(r: Region, jahr = Number(tagIn().slice(0, 4))): Array<{ datum: string; name: string }> {
    if (!r.bundesland) return [];
    return [...feiertage(jahr, r.bundesland)].map(([datum, name]) => ({ datum, name })).sort((a, b) => a.datum.localeCompare(b.datum));
  }
}
