/**
 * Schalter und „Wer macht das?“ (#1570): Welche Anbieter ausgeschaltet sind und wer je Leistung gewählt ist – als
 * Einstellung `leistungen_anbieter`, gelesen über den Lesespeicher (gemerkt, bis sich etwas ändert; gilt so auch für
 * andere Prozesse). Ohne Einstellung ist alles an und die Vorgabe gilt – für bestehende Installationen ändert sich nichts.
 *
 * Die Liste fragt `an` und `gewaehlt` ohne Warten; vor jeder Wahl lädt die Vermittlung den Stand (`laden`).
 */
import {
  ANBIETERWAHL_LEER,
  EINGEBAUTE_ANBIETER,
  LEISTUNGEN,
  anbieterSchluessel,
  einschraenkungSchluessel,
  istLeistung,
  katalogAdresse,
  leistung,
  liesAnbieterwahl,
  type Anbieterwahl,
  type EingebauterAnbieter,
  type Leistungsname,
  type Macher,
  type Meldung,
  type MitgeliefertStand,
} from '../../../shared/src/leistungen';
import type { Einstellungen } from '../einstellungen/einstellungen';
import { Fachfehler } from '../grundlagen/fehler';
import { protokoll } from '../protokoll/protokoll';
import { t } from '../sprache/sprache';
import type { Anbieter, Anbieterliste } from './anbieter';
import { anzeigename } from './pruefen';

const log = protokoll.modul('auftraege');
const WAHL_EINSTELLUNG = 'leistungen_anbieter';

export class Anbieterschalter {
  private wahl: Anbieterwahl = ANBIETERWAHL_LEER;

  constructor(
    private readonly liste: Anbieterliste,
    private readonly einstellungen: () => Einstellungen | undefined,
  ) {
    liste.an = (id) => !this.wahl.aus.includes(id);
    liste.gewaehlt = (l) => this.wahl.wahl[l] ?? null;
  }

  /** Stand aus der Einstellung; kann sie nicht gelesen werden, gilt der letzte (am Anfang: alles an). */
  async laden(): Promise<void> {
    const e = this.einstellungen();
    if (!e) return;
    try {
      this.wahl = liesAnbieterwahl(await e.lies(WAHL_EINSTELLUNG), istLeistung);
    } catch (x) {
      log.warn('Wahl der Anbieter nicht gelesen', { fehler: (x as Error).message });
    }
  }

  private macher(a: Anbieter): Macher {
    return { id: a.id, art: a.art, name: a.art === 'eingebaut' ? t.frei(anbieterSchluessel(a.id)) : a.id, an: this.liste.an(a.id) };
  }

  /** Für Werkbank → Pakete: die mitgelieferten mit Tätigkeiten und Ersatz, dazu „Wer macht das?“. */
  async stand(): Promise<MitgeliefertStand> {
    await this.laden();
    const ids = Object.keys(EINGEBAUTE_ANBIETER) as EingebauterAnbieter[];
    const mitgeliefert = ids.map((id) => ({
      id,
      name: t.frei(anbieterSchluessel(id)),
      an: this.liste.an(id),
      taetigkeiten: (Object.keys(EINGEBAUTE_ANBIETER[id]) as Leistungsname[]).map((l) => {
        const m = (EINGEBAUTE_ANBIETER[id] as Partial<Record<Leistungsname, Meldung>>)[l] ?? {};
        return {
          leistung: l,
          name: anzeigename(l),
          dateitypen: m.dateitypen ?? leistung(l).dateitypen,
          nur: (m.einschraenkungen ?? []).map((e) => t.frei(einschraenkungSchluessel(e))),
          katalog: katalogAdresse(l),
          ersatz: this.liste
            .fuer(l)
            .filter((a) => a.id !== id && this.liste.an(a.id))
            .map((a) => this.macher(a)),
        };
      }),
    }));
    const taetigkeiten = LEISTUNGEN.filter((l) => this.liste.fuer(l).length).map((l) => ({
      leistung: l,
      name: anzeigename(l),
      dateitypen: leistung(l).dateitypen,
      macher: this.liste.fuer(l).map((a) => this.macher(a)),
      gewaehlt: this.wahl.wahl[l] ?? null,
    }));
    return { mitgeliefert, taetigkeiten };
  }

  private async schreibe(neu: Anbieterwahl): Promise<MitgeliefertStand> {
    const e = this.einstellungen();
    if (!e) throw new Fachfehler(503, t('meldungen.leistungen.wahl-nicht-gespeichert'));
    await e.schreibe(WAHL_EINSTELLUNG, neu);
    this.wahl = neu;
    return this.stand();
  }

  /** Mitgelieferten Anbieter ein- oder ausschalten (Schalter; entfernen lässt er sich nicht). */
  async schalte(id: string, an: unknown): Promise<MitgeliefertStand> {
    if (!Object.hasOwn(EINGEBAUTE_ANBIETER, id)) throw new Fachfehler(404, t('meldungen.leistungen.anbieter-unbekannt'));
    if (typeof an !== 'boolean') throw new Fachfehler(422, t('meldungen.leistungen.an-ungueltig'));
    await this.laden();
    const aus = an ? this.wahl.aus.filter((x) => x !== id) : [...new Set([...this.wahl.aus, id])];
    log.info(an ? 'Mitgelieferten Anbieter eingeschaltet' : 'Mitgelieferten Anbieter ausgeschaltet', { anbieter: id });
    return this.schreibe({ ...this.wahl, aus });
  }

  /** „Wer macht das?“: einer, der die Leistung kann, oder `null` für die Vorgabe. */
  async waehle(l: unknown, id: unknown): Promise<MitgeliefertStand> {
    if (!istLeistung(l)) throw new Fachfehler(422, t('meldungen.leistungen.unbekannt', { name: String(l).slice(0, 80) }));
    if (id !== null && (typeof id !== 'string' || !this.liste.fuer(l).some((a) => a.id === id)))
      throw new Fachfehler(422, t('meldungen.leistungen.wahl-ungueltig', { name: anzeigename(l) }));
    await this.laden();
    const wahl = { ...this.wahl.wahl };
    if (id === null) delete wahl[l];
    else wahl[l] = id;
    log.info('Wer macht das? geändert', { leistung: l, anbieter: id });
    return this.schreibe({ ...this.wahl, wahl });
  }
}
