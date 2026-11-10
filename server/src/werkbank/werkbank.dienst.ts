/**
 * Ansicht der Werkbank (#281, #1078 aus dienst.ts): Vorlage der Installation und die eigene Auswahl je Person – nur
 * Navigation, keine Funktion wird abgeschaltet. Dazu die Merkmale der Ablage (#1032, Werkbank → Nutzung).
 * Schicht 3 – bekommt nur den Kern (Einstellungen).
 */
import { Fachfehler } from '../fehler';
import type { Kern } from '../kern';
import { protokoll } from '../protokoll';
import { t } from '../sprache';
import { liesAnsicht, liesEigene, OHNE_EINSTELLUNG, vorlageFuer } from '../../../shared/src/werkbankansicht';
import { liesMerkmale, MERKMALE, MERKMALE_EINSTELLUNG, type Merkmale } from '../../../shared/src/merkmale';

export class WerkbankDienst {
  constructor(private readonly kern: Kern) {}

  private get einstellungen() { return this.kern.einstellungen; }

  async werkbankAnsicht(wer: { id: string | null; email: string }) {
    const installation = liesAnsicht(await this.einstellungen?.lies('werkbank_ansicht'));
    return {
      installation: installation ?? OHNE_EINSTELLUNG,
      eingestellt: !!installation,
      eigene: liesEigene(await this.einstellungen?.lies(`werkbank_ansicht:${wer.id ?? wer.email}`)),
    };
  }

  async setzeWerkbankAnsicht(wer: { id: string | null; email: string }, body: Record<string, unknown>) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    if ('installation' in body) {
      const a = liesAnsicht(body.installation);
      if (!a) throw new Fachfehler(422, t('meldungen.dienst.bitte-eine-vorlage-waehlen'));
      await this.einstellungen.schreibe('werkbank_ansicht', a);
      protokoll.modul('werkbank').info('Werkbank angepasst', { vorlage: a.vorlage, ein: a.ein, aus: a.aus, von: wer.email });
    }
    if ('eigene' in body) {
      const e = liesEigene(body.eigene);
      await this.einstellungen.schreibe(`werkbank_ansicht:${wer.id ?? wer.email}`, e.ein.length || e.experte ? e : null);
    }
    return this.werkbankAnsicht(wer);
  }

  /** Merkmale der Ablage (#1032); ohne Einstellung privat. */
  merkmale(): Promise<Merkmale> { return this.kern.merkmale(); }

  /**
   * Merkmale ändern (#1032, nur „Gesamte Verwaltung“ – verwaltungsbereiche.ts). Nur genannte Merkmale ändern sich;
   * gespeichert wird nur, was an ist (alles aus = keine Einstellung).
   */
  async setzeMerkmale(body: unknown, von: string): Promise<Merkmale> {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const roh = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    for (const m of MERKMALE) if (m in roh && typeof roh[m] !== 'boolean') throw new Fachfehler(422, t('meldungen.dienst.merkmal-ja-nein', { merkmal: m }));
    const alt = await this.merkmale();
    const neu = liesMerkmale({ ...alt, ...Object.fromEntries(MERKMALE.filter((m) => m in roh).map((m) => [m, roh[m]])) });
    const an = Object.fromEntries(MERKMALE.filter((m) => neu[m]).map((m) => [m, true]));
    await this.einstellungen.schreibe(MERKMALE_EINSTELLUNG, Object.keys(an).length ? an : null);
    if (JSON.stringify(alt) === JSON.stringify(neu)) return neu;
    protokoll.modul('werkbank').info('Merkmale der Ablage geändert', { vorher: alt, nachher: neu, von });
    // Vorgabe der Werkbank-Vorlage (#987): Steht sie noch unverändert auf der Vorgabe des alten Merkmals, folgt sie.
    const ansicht = liesAnsicht(await this.einstellungen.lies('werkbank_ansicht'));
    if (ansicht && ansicht.vorlage === vorlageFuer(alt) && !ansicht.ein.length && !ansicht.aus.length && vorlageFuer(alt) !== vorlageFuer(neu)) {
      await this.einstellungen.schreibe('werkbank_ansicht', { ...ansicht, vorlage: vorlageFuer(neu) });
    }
    return neu;
  }
}
