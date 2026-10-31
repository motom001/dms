import type { Einstellungen } from './einstellungen';
import type { Einrichtungscode } from './einrichtungscode';
import { Fachfehler } from './fehler';
import type { Konten } from './konten';
import { protokoll } from './protokoll';

/**
 * Einrichtungsassistent (#119), sobald die Datenbank steht:
 *   Mandant + Administrator (mit Einrichtungscode) → danach angemeldet als Administrator:
 *   erster normaler Benutzer, Schlüssel und Notfallblatt, Optionales, Fertig.
 * Der Stand der Schritte nach dem Anlegen liegt in den Einstellungen („einrichtung“).
 */

const log = protokoll.modul('system');
export const SCHRITTE = ['benutzer', 'schluessel', 'optional', 'fertig'] as const;
export type Schritt = (typeof SCHRITTE)[number];
export interface EinrichtungStand { offen: boolean; erledigt: Schritt[]; uebersprungen: Schritt[]; mandant: string | null }

export interface EinrichtungDeps {
  konten: Pick<Konten, 'einrichten' | 'einrichtungNoetig'>;
  code: Einrichtungscode | null;
  einstellungen: Einstellungen;
  /** Name des Mandanten setzen (Tabelle haushalte) und lesen. */
  mandant: { name(): Promise<string | null>; umbenennen(name: string): Promise<void> };
  /** Schriftzug des Standard-Designs (#72). */
  schriftzug?: (text: string) => Promise<void>;
}

export const MANDANT_MAX = 30;

export class Einrichtung {
  constructor(private d: EinrichtungDeps) {}

  /** Solange niemand eingerichtet ist: Code nötig (falls ein Code bereitsteht). */
  async pruefeCode(code: unknown) {
    if (!(await this.d.konten.einrichtungNoetig())) throw new Fachfehler(409, 'Die Einrichtung ist bereits abgeschlossen.');
    this.d.code?.pruefe(code);
  }
  get codeNoetig() { return !!this.d.code?.aktiv; }

  /** Schritte 4 und 5: Mandant und Administrator; meldet den Administrator an. */
  async einrichten(e: Record<string, unknown>, code: unknown, info: { ip: string; geraet: string }) {
    await this.pruefeCode(code);
    const mandant = typeof e.mandant === 'string' ? e.mandant.replace(/\s+/g, ' ').trim() : '';
    if (!mandant) throw new Fachfehler(422, 'Bitte einen Namen angeben, z. B. „Familie Mustermann“.');
    if (mandant.length > MANDANT_MAX) throw new Fachfehler(422, `Der Name darf höchstens ${MANDANT_MAX} Zeichen haben.`);
    const r = await this.d.konten.einrichten(e, info);
    await this.d.mandant.umbenennen(mandant);
    try { await this.d.schriftzug?.(mandant); } catch (x) { log.warn('Schriftzug nicht gesetzt', { fehler: (x as Error).message }); }
    await this.d.einstellungen.schreibe('einrichtung', { offen: true, erledigt: [], uebersprungen: [] });
    // Neue Installationen bekommen die schlanke Werkbank (#281); bestehende behalten alles.
    await this.d.einstellungen.schreibe('werkbank_ansicht', { vorlage: 'haushalt', ein: [], aus: [] });
    await this.d.code?.entfernen();
    log.info('Einrichtung: Mandant und Administrator angelegt', { mandant, email: r.benutzer.email });
    return r;
  }

  async stand(): Promise<EinrichtungStand> {
    const g = (await this.d.einstellungen.lies('einrichtung')) as Partial<EinrichtungStand> | null;
    return { offen: !!g?.offen, erledigt: g?.erledigt ?? [], uebersprungen: g?.uebersprungen ?? [], mandant: await this.d.mandant.name() };
  }

  /** Einen Schritt als erledigt oder übersprungen merken; „fertig“ schließt den Assistenten. */
  async merke(schritt: unknown, uebersprungen: boolean, von: string): Promise<EinrichtungStand> {
    if (!SCHRITTE.includes(schritt as Schritt)) throw new Fachfehler(422, 'Unbekannter Schritt.');
    const s = await this.stand();
    const x = schritt as Schritt;
    const erledigt = uebersprungen ? s.erledigt.filter((y) => y !== x) : [...new Set([...s.erledigt, x])];
    const ueber = uebersprungen ? [...new Set([...s.uebersprungen, x])] : s.uebersprungen.filter((y) => y !== x);
    const offen = x !== 'fertig';
    await this.d.einstellungen.schreibe('einrichtung', { offen, erledigt, uebersprungen: ueber });
    log.info(offen ? `Einrichtung: Schritt „${x}“ ${uebersprungen ? 'übersprungen' : 'erledigt'}` : 'Einrichtungsassistent abgeschlossen', { von });
    return { ...s, offen, erledigt, uebersprungen: ueber };
  }
}
