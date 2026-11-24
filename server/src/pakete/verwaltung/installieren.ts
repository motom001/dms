/**
 * Installieren: anlegen mit Verlauf, Umbau (#1041) und Umzug (#1084); Bestätigung des Umbaus, Sperre.
 */
import { type InstalliertesPaket, type KatalogVersion } from '../../../../shared/src/pakete';
import { Fachfehler } from '../../grundlagen/fehler';
import { t } from '../../sprache/sprache';
import { wendeEntscheidungenAn } from '../index';
import { type Paket } from './format';
import { meldungen } from './hilfen';
import { type Handelnder, log } from './optionen';
import { type LegeAuftrag, type UmbauEingabe, type Vorschau } from './plan';
import { PaketAnlegen } from './anlegen';

/** Installieren mit Umbau und Umzug. */
export abstract class PaketInstallieren extends PaketAnlegen {
  /**
   * Umbau (#1041, Sicherheit): nur „Gesamte Verwaltung“ (die Route setzt `gesamteVerwaltung`; die frische Anmeldung
   * verlangt sie über `umbauBestaetigt`, verwaltungsbereiche.ts), ausdrücklich bestätigt und mit einer Antwort je
   * Rückfrage. Danach steht in der Lage, was mit jedem Feld geschieht.
   */
  protected umbauBestaetigen(plan: Vorschau, e: UmbauEingabe) {
    const lage = this.umbauLagen.get(plan);
    if (!lage?.schritte.length) return;
    if (e.gesamteVerwaltung !== true) throw new Fachfehler(403, t('meldungen.pakete.umbau.nur-gesamt'), { umbau: 'gesamt' });
    if (e.umbauBestaetigt !== true)
      throw new Fachfehler(409, t('meldungen.pakete.umbau.bestaetigen', { name: plan.paket.name }), {
        umbau: 'bestaetigen',
        schritte: plan.umbau,
      });
    wendeEntscheidungenAn(lage, e.umbauEntscheidungen);
  }

  protected async lege(
    paket: Paket,
    herkunft: InstalliertesPaket['herkunft'],
    v: KatalogVersion | undefined,
    plan: Vorschau,
    beispiele: boolean,
    von: Handelnder,
    alt: InstalliertesPaket | null,
    ein: string[] = [],
  ): Promise<InstalliertesPaket> {
    // Umzug (#1084): erst die Installation auf die neue Id ziehen – danach ist es ein gewöhnliches Update. Scheitert es,
    // kommt die alte Id zurück.
    const umzugVon = alt && alt.id !== paket.manifest.id ? alt.id : null;
    const auftrag: LegeAuftrag = { paket, herkunft, v, plan, beispiele, von, alt, ein };
    if (!umzugVon) return this.mitVerlauf(await this.legeMitUmbau(auftrag), auftrag);
    await this.zieheUm(umzugVon, paket.manifest.id);
    try {
      const neu = await this.legeMitUmbau({
        ...auftrag,
        alt: { ...alt!, id: paket.manifest.id, ersetzt: [...new Set([...(alt!.ersetzt ?? []), umzugVon])] },
      });
      log.info('Paket umgezogen', { von: von.email, paket: neu.id, vorher: umzugVon });
      return this.mitVerlauf(neu, auftrag);
    } catch (f) {
      await this.zieheUm(paket.manifest.id, umzugVon).catch((e: Error) =>
        log.error('Umzug nicht zurückgenommen', { paket: paket.manifest.id, vorher: umzugVon, fehler: e.message }),
      );
      throw f;
    }
  }

  /**
   * Umbau (#1041, Sicherheit): Mit Umbau-Schritten läuft das ganze Installieren bzw. Update in einer Transaktion – bricht
   * etwas ab, ist nichts verändert, und die Meldung sagt das.
   */
  /**
   * Fassungen (#1006): Was die Installation bzw. das Update an Mappentypen, Ansichten, Nummernkreisen, Automatisierungen
   * und Einstellungen ändert, erscheint als Fassung „durch Paket <Name> <Version>“ (mit der Person, die es angestoßen hat).
   */
  private async legeMitUmbau(a: LegeAuftrag): Promise<InstalliertesPaket> {
    const urheber = {
      art: 'paket' as const,
      id: a.paket.manifest.id,
      name: a.paket.manifest.name,
      version: a.paket.manifest.version,
      person: a.von.id,
    };
    return this.d.kern.mitFassungsKontext({ urheber }, async () => {
      const neu = await this.legeMitUmbauIntern(a);
      await this.d.kern.fassungen.halte('paketeinstellungen', neu.id);
      return neu;
    });
  }

  private async legeMitUmbauIntern(a: LegeAuftrag): Promise<InstalliertesPaket> {
    // Ganz oder gar nicht (#1385, wie das Entfernen seit #1521): Installieren und Aktualisieren laufen in einer
    // Transaktion – scheitert etwas, ist die Ablage danach genau wie vorher, und ein neuer Versuch gelingt.
    if (!this.umbauLagen.get(a.plan)?.schritte.length) return this.d.kern.inTransaktion(() => this.legeIntern(a));
    try {
      return await this.d.kern.inTransaktion(() => this.legeIntern(a));
    } catch (f) {
      log.warn('Paket-Umbau abgebrochen, nichts verändert', {
        paket: a.paket.manifest.id,
        version: a.paket.manifest.version,
        von: a.von.email,
        fehler: (f as Error).message,
      });
      throw new Fachfehler((f as Fachfehler).status ?? 500, t('meldungen.pakete.umbau.abgebrochen', { meldungen: meldungen(f) }), {
        umbau: 'abgebrochen',
        ...(((f as Fachfehler).details as object) ?? {}),
      });
    }
  }

  /** Installieren, Aktualisieren und Entfernen nacheinander – über alle Instanzen (PaketOptionen.sperre). */
  mitSperre<T>(f: () => Promise<T>): Promise<T> {
    return this.o.sperre ? this.o.sperre(f) : f();
  }
}
