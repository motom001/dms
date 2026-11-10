/**
 * Ansicht der Werkbank (#281, #1078 aus dienst.ts): Vorlage der Installation und die eigene Auswahl je Person – nur
 * Navigation, keine Funktion wird abgeschaltet. Schicht 3 – bekommt nur den Kern (Einstellungen).
 */
import { Fachfehler } from '../fehler';
import type { Kern } from '../kern';
import { protokoll } from '../protokoll';
import { t } from '../sprache';
import { liesAnsicht, liesEigene, OHNE_EINSTELLUNG } from '../../../shared/src/werkbankansicht';

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
}
