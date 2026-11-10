/**
 * Hinweise von Paketen an Mappen (#1034): setzen, entfernen und mit der Mappe lesen. Ein Hinweis ändert die Mappe nicht
 * – kein „zuletzt geändert“, kein Eintrag in der Historie, kein Ereignis – und hält das Speichern nie auf („Bearbeiten
 * geht vor Automatisierung“). Regeln (Ergänzung Sicherheit): nur Pakete mit `dms:hinweise`, nur an Mappen, die das Paket
 * schreiben darf; nur Text (kein HTML, kein Markdown, keine Links), höchstens 300 Zeichen, höchstens 3 je Paket und
 * Mappe; immer mit dem Namen des Pakets. Das Paket ergibt sich aus dem Dienstkonto, nie aus der Anfrage. Schicht 2.
 */
import { HINWEISE_JE_PAKET, HINWEIS_MAX, pruefeHinweistext, type PaketHinweis } from '../../../shared/src/berechnet';
import { SCHLUESSEL } from '../../../shared/src/kennungen';
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff';

const log = protokoll.modul('werkbank');

export class MappenHinweise {
  constructor(private readonly kern: Kern, private readonly rechtepruefung: ZugriffDienst) {}

  private get repo(): Repo { return this.kern.repo; }

  /** Hinweise an der Mappe mit dem Namen des Pakets; Hinweise nicht (mehr) installierter Pakete fallen weg. */
  async von(mappeId: string): Promise<PaketHinweis[]> {
    const roh = await this.repo.hinweise(mappeId);
    if (!roh.length) return [];
    const pakete = await this.repo.listePakete();
    return roh.flatMap((h) => { const p = pakete.find((x) => x.id === h.paket); return p ? [{ ...h, paketName: p.name }] : []; });
  }

  /** Nur das Dienstkonto eines Pakets mit `dms:hinweise`, nur an Mappen, die es schreiben darf. */
  private async pruefe(z: Zugriff | undefined, mappeId: string, schluessel: string): Promise<string> {
    if (!z?.paket?.id) throw new Fachfehler(403, t('meldungen.berechnet.hinweis-nur-pakete'));
    if (!z.paket.schnittstellen?.includes('dms:hinweise')) throw new Fachfehler(403, t('meldungen.berechnet.hinweis-ohne-recht'));
    if (!SCHLUESSEL.test(schluessel)) throw new Fachfehler(400, t('meldungen.berechnet.hinweis-schluessel'));
    await this.rechtepruefung.pruefeRecht(z, mappeId, 'U');
    return z.paket.id;
  }

  /** Setzen oder ersetzen (PUT /mappen/{id}/hinweise/{schluessel}). */
  async setze(z: Zugriff | undefined, mappeId: string, schluessel: string, eingabe: unknown): Promise<PaketHinweis> {
    const paket = await this.pruefe(z, mappeId, schluessel);
    const p = pruefeHinweistext((eingabe as { text?: unknown } | null)?.text);
    if ('fehler' in p) throw new Fachfehler(400, t.frei(`meldungen.berechnet.hinweis.${p.fehler}`, { max: HINWEIS_MAX }), { grund: p.fehler });
    const vorhanden = (await this.repo.hinweise(mappeId)).filter((h) => h.paket === paket);
    if (!vorhanden.some((h) => h.schluessel === schluessel) && vorhanden.length >= HINWEISE_JE_PAKET) {
      throw new Fachfehler(400, t('meldungen.berechnet.hinweis-zu-viele', { max: HINWEISE_JE_PAKET }));
    }
    if (vorhanden.find((h) => h.schluessel === schluessel)?.text !== p.text) {
      await this.repo.setzeHinweis({ mappeId, paket, schluessel, text: p.text });
      log.debug('Hinweis an einer Mappe gesetzt', { paket, mappe: mappeId, schluessel });
    }
    return (await this.von(mappeId)).find((h) => h.paket === paket && h.schluessel === schluessel)!;
  }

  /** Entfernen (DELETE …); auch, wenn es ihn nicht (mehr) gibt. */
  async entferne(z: Zugriff | undefined, mappeId: string, schluessel: string): Promise<void> {
    const paket = await this.pruefe(z, mappeId, schluessel);
    if (await this.repo.loescheHinweis(mappeId, paket, schluessel)) log.debug('Hinweis an einer Mappe entfernt', { paket, mappe: mappeId, schluessel });
  }
}
