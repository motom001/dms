/**
 * Herkunft und Herausgeber eines Pakets (Sicherheit B, #1084): Standard-Herausgeber, Vertrauen, anderer Herausgeber.
 */
import { type HerkunftPruefung, type InstalliertesPaket } from '../../../../shared/src/pakete';
import { istOffiziellerHerausgeber, OFFIZIELLER_HERAUSGEBER } from '../../../../shared/src/kennungen';
import { t } from '../../sprache/sprache';
import { type Manifest } from './format';
import { type Handelnder, log } from './optionen';
import { type PlanQuelle } from './plan';
import { PaketBasis } from './basis';

/** Herkunft und Herausgeber. */
export abstract class PaketHerkunft extends PaketBasis {
  /**
   * Herausgeber eines Pakets ohne Angabe im Manifest (#1084, Bestand): Was aus dem offiziellen Katalog kommt – direkt
   * oder als Datei, deren Prüfsumme dort steht –, stammt vom Projekt (`app.ablago`); alle offiziellen Pakete gibt das
   * Projekt heraus, und nur seine Signatur belegt das. Mit Prüfung zählt deshalb nur eine gültige Signatur (#1351);
   * ohne (installierte Pakete aus der Zeit vor #1084) die Quelle. Bei anderen Quellen ist er unbekannt (null): Dann
   * schützt wie bisher, dass Updates nur aus derselben Quelle kommen (Katalog bzw. erneutes Hochladen), und der erste
   * angegebene Herausgeber gilt von da an.
   */
  protected standardHerausgeber(herkunft?: InstalliertesPaket['herkunft'], pruefung?: HerkunftPruefung): string | null {
    if (pruefung) return pruefung.art === 'projekt' || pruefung.katalogversion ? OFFIZIELLER_HERAUSGEBER : null;
    return herkunft?.art === 'katalog' && herkunft.url === this.katalogUrl ? OFFIZIELLER_HERAUSGEBER : null;
  }

  /** Wie vertrauenswürdig die Herkunft eines installierten Pakets war (für den Umzug, Sicherheit B). */
  protected vertrauenVon(p: InstalliertesPaket): number {
    if (p.herkunft.art === 'katalog' && p.herkunft.url === this.katalogUrl) return 3;
    return p.herausgeberSchluessel ? 2 : 1;
  }

  /** Erfüllt ein installiertes Paket eine Abhängigkeit eines Pakets dieses Herausgebers? Gleicher oder offizieller Herausgeber. */
  protected herausgeberPasst(da: InstalliertesPaket, herausgeber: string | null): boolean {
    const h = this.herausgeberVon(da);
    return !herausgeber || h === herausgeber || istOffiziellerHerausgeber(h);
  }

  /**
   * Herausgeber eines installierten Pakets (#1084): gespeichert oder – bei älteren Installationen – aus der Herkunft.
   * `herausgeberGeprueft: false` (ohne gültige Signatur installiert, #1351): unbekannt.
   */
  protected herausgeberVon(p: InstalliertesPaket): string | null {
    return p.herausgeber ?? (p.herausgeberGeprueft === false ? null : this.standardHerausgeber(p.herkunft));
  }

  /**
   * Stammt ein Paket mit derselben Id wie ein installiertes von einem anderen Herausgeber (#1084)? Dann der Text, warum
   * Ablago es nicht installiert bzw. nicht als Update nimmt – sonst null. Ist der Herausgeber des installierten
   * unbekannt, entscheidet wie bisher die Quelle (Updates nur aus dem eigenen Katalog bzw. erneut hochgeladen).
   */
  protected andererHerausgeber(m: Manifest, ich: InstalliertesPaket, quelle?: PlanQuelle): string | null {
    const vorher = this.herausgeberVon(ich);
    const neu = m.herausgeber ?? this.standardHerausgeber(quelle?.herkunft, quelle?.pruefung);
    return vorher && vorher !== neu
      ? t('meldungen.pakete.anderer-herausgeber', {
          id: ich.id,
          name: ich.name,
          alt: vorher,
          neu: neu ?? t('meldungen.pakete.herausgeber-unbekannt'),
        })
      : null;
  }

  /** Ersteller der Vorgaben (#1038): das Dienstkonto des Pakets – ohne (Tests, Fehler) wer installiert. */
  protected async ersteller(m: Manifest, code: boolean, von: Handelnder): Promise<string | null> {
    if (!this.o.dienstkonto) return von.id;
    try {
      return (await this.o.dienstkonto(m.id, m.name, code)) ?? von.id;
    } catch (e) {
      log.warn('Dienstkonto für Vorgaben nicht angelegt', { paket: m.id, fehler: (e as Error).message });
      return von.id;
    }
  }
}
