/**
 * Aufruf von außen (#679) und Karten nach außen (#671) – #1278, Teil von `Automatisierungen`: Adressen, Ziele,
 * Geheimnisse und Zustellungen.
 */
import { AutomatisierungBearbeiten } from './bearbeiten';
import { type AufrufStand, Aufrufe } from '../aufruf';
import { oeffentlichErreichbar } from '../../../../shared/src/auskunft';
import { Fachfehler } from '../../grundlagen/fehler';
import { t, log } from './gemeinsam';
import { istAufruf, type Automatisierung, aussenKarten, zielFuer } from '../../../../shared/src/automatisierung';
import type { AusgangVerlauf } from '../ausleitung';

/** Aufruf von außen und Karten nach außen. */
export abstract class AutomatisierungAussen extends AutomatisierungBearbeiten {
  /**
   * Adresse anlegen oder erneuern bzw. neues Geheimnis (#679) – nur ausdrücklich über die Werkbank, nie für eine
   * mitgelieferte Automatisierung. Das Geheimnis steht nur in dieser Antwort.
   */
  async aufrufAnlegen(id: string, was: unknown, von: string | null): Promise<AufrufStand & { geheimnis: string; oeffentlich: boolean }> {
    const a = await this.gibt(id);
    const r = await this.aufrufe.lege(a, was === 'geheimnis' ? 'geheimnis' : 'adresse', von);
    return { ...r, oeffentlich: /^https?:\/\//i.test(r.adresse) && oeffentlichErreichbar(r.adresse) };
  }

  /**
   * Ein Aufruf von außen (#679) – Prüfungen in {@link Aufrufe.annehmen}. In Wartung und Wiederherstellung ruht er wie
   * der Zeitplan (503, nichts gezählt, nichts ausgelöst).
   */
  async aufrufAnnehmen(o: Parameters<Aufrufe['annehmen']>[0]) {
    if (this.d.pause?.()) throw new Fachfehler(503, t('automatisierung.aufruf.pause'));
    return this.aufrufe.annehmen(o);
  }

  /** Adresse entfernen (#679): Danach nimmt die Automatisierung keine Aufrufe mehr an, bis eine neue angelegt ist. */
  async aufrufEntfernen(id: string): Promise<void> {
    await this.gibt(id);
    await this.aufrufe.entferne(id, 'von Hand');
  }

  /**
   * Adressen, die Aufrufe von außen annehmen (#679): eingeschaltet, nicht angehalten, mit Wenn-Karte „Aufruf von außen“
   * und angelegter Adresse – für Werkbank-Übersicht und Notfallblatt.
   */
  async aufrufListe(): Promise<Array<{ id: string; name: string; adresse: string }>> {
    const [liste, autos] = await Promise.all([this.aufrufe.liste(), this.d.repo.liste()]);
    return liste.flatMap((e) => {
      const a = autos.find((x) => x.id === e.automatisierungId);
      return a && a.aktiv && !a.angehalten && istAufruf(a.wenn) ? [{ id: a.id, name: a.name, adresse: e.adresse }] : [];
    });
  }

  /**
   * „Alle abschalten“ in der Werkbank-Übersicht (#679): die genannten Automatisierungen, die gerade Aufrufe von außen
   * annehmen, ausschalten – ein Klick. Andere Ids übergeht es. Liefert die Zahl.
   */
  async aufrufeAbschalten(ids: string[], von: string | null): Promise<number> {
    let n = 0;
    for (const x of (await this.aufrufListe()).filter((y) => ids.includes(y.id))) {
      await this.schalte(x.id, false, von);
      n++;
    }
    if (n) log.info('Aufrufe von außen abgeschaltet', { anzahl: n });
    return n;
  }

  /* ---------- Nach außen (#671) ---------- */

  /** Freigegebene Ziele (Werkbank → Automatisierungen → Ziele nach außen). */
  ziele() {
    return this.ausleitung.ziele();
  }

  /**
   * Ziele setzen (ganze Liste, frische Anmeldung). Fällt ein Ziel weg, halten Automatisierungen mit Karten dorthin beim
   * nächsten Lauf an (Problem „Ziel nicht freigegeben“); offene Zustellungen gibt der Ausgangskorb auf.
   */
  async setzeZiele(roh: unknown, von: string | null) {
    const ziele = await this.ausleitung.setzeZiele(roh, von);
    const ohneZiel = (a: Automatisierung) => aussenKarten(a).some((k) => k.art === 'url' && !zielFuer(k.adresse, ziele));
    return {
      ziele,
      betroffen: (await this.d.repo.liste())
        .filter((a) => a.aktiv && !a.angehalten && ohneZiel(a))
        .map((a) => ({ id: a.id, name: a.name })),
    };
  }

  /** Geheimnis für die Signatur einer Karte „URL aufrufen“ anlegen bzw. erneuern – nur in dieser Antwort. */
  async aussenGeheimnis(id: string, karte: string, von: string | null) {
    return this.ausleitung.geheimnisAnlegen(await this.gibt(id), karte, von);
  }

  /** Geheimnis einer Karte entfernen: Danach gehen ihre Aufrufe ohne Signatur hinaus. */
  async aussenGeheimnisEntfernen(id: string, karte: string) {
    await this.gibt(id);
    await this.ausleitung.geheimnisEntfernen(id, karte);
  }

  /** Zustellungen nach außen einer Automatisierung (ohne Inhalte): Ziel, Zustand, Status, Fehler, Versuche, Zeiten. */
  async zustellungen(id: string): Promise<AusgangVerlauf[]> {
    await this.gibt(id);
    return this.ausleitung.verlauf(id);
  }
}
