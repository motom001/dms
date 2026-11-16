/**
 * Grundlage des Motors (#1278): Uhr, Systemkonto, Kontext und Ansicht einer Automatisierung. `Automatisierungen` ist
 * eine Kette von Teil-Klassen, je Aufgabe eine Datei: basis → bearbeiten → aussen → pakete → uebernehmen → fuellen →
 * ausfuehren → ausloesen → wiederholen → zeitplan → automatisierungen. Jede Teil-Klasse ruft nur, was unter ihr steht;
 * was der Konstruktor ganz oben setzt (Abhängigkeiten, Aufrufe, Ausleitung), ist hier abstrakt angekündigt. Die Rümpfe
 * sind aus automatisierung.ts unverändert übernommen, `this` ist überall dieselbe Instanz von `Automatisierungen`.
 */
import type { AutomatisierungDeps } from './hilfen';
import { Aufrufe, type AufrufStand } from '../aufruf';
import { Ausleitung } from '../ausleitung';
import { Fachfehler } from '../../fehler';
import { t } from './gemeinsam';
import {
  type Kontextdaten,
  type Automatisierung,
  type Lauf,
  type AutomatisierungAnsicht,
  kontextTyp,
  type DannKarte,
  paketKarteLeer,
  istAufruf,
  kurzform,
  automatisierungsProbleme,
  ausloeserSchluessel,
} from '../../../../shared/src/automatisierung';
import { oeffentlichErreichbar } from '../../../../shared/src/auskunft';

/** Uhr, Systemkonto, Kontext und Ansicht; die Felder aus dem Konstruktor abstrakt angekündigt. */
export abstract class AutomatisierungBasis {
  /** Abhängigkeiten (Repo mit Fassungen) – gesetzt im Konstruktor von `Automatisierungen`. */
  protected abstract d: AutomatisierungDeps;
  /** „Aufruf von außen“ (#679) – gesetzt im Konstruktor von `Automatisierungen`. */
  abstract readonly aufrufe: Aufrufe;
  /** Karten nach außen (#671) – gesetzt im Konstruktor von `Automatisierungen`. */
  abstract readonly ausleitung: Ausleitung;
  protected abstract aussenBasis: () => string;
  protected jetzt() {
    return this.d.uhr?.() ?? Date.now();
  }
  protected iso() {
    return new Date(this.jetzt()).toISOString();
  }
  protected konto() {
    if (!this.d.dienst.systemkonten) throw new Fachfehler(500, t('automatisierung.konto.fehlt'));
    return this.d.dienst.systemkonten('automatisierung');
  }

  /* ---------- Verwalten ---------- */

  async kontext(): Promise<Kontextdaten> {
    const [k, pakete, liste] = await Promise.all([
      this.d.dienst.automatisierungshilfen.automatisierungKontext(),
      this.d.dienst.kern.repo.listePakete(),
      this.d.repo.liste(),
    ]);
    // Pakete für „Paket nach Zeitplan ausführen“ (#1082): ob sie das Ereignis abonnieren und welche Aufgaben ihre
    // mitgelieferten Automatisierungen nennen (zur Auswahl im Editor).
    const aufgaben = (id: string) =>
      [
        ...new Set(
          liste
            .filter((a) => a.herkunft === 'paket' && a.paketId === id)
            .flatMap((a) => a.dann.flatMap((d) => (d.art === 'paket' && d.aufgabe ? [d.aufgabe] : []))),
        ),
      ].sort();
    // Ziele nach außen (#671): Eine Karte „URL aufrufen“ ohne freigegebenes Ziel ist ein Problem (rot, angehalten).
    return {
      ...k,
      pakete: pakete.map((p) => ({
        id: p.id,
        name: p.name,
        zeitplan: !!p.laeufer?.ereignisse.includes('zeitplan.ausgefuehrt'),
        aufgaben: aufgaben(p.id),
        ...(p.laeufer?.karten?.length ? { karten: p.laeufer.karten } : {}),
      })),
      ziele: await this.ausleitung.ziele(),
    };
  }

  protected async ansicht(
    a: Automatisierung,
    k: Kontextdaten,
    letzte: Map<string, Lauf>,
    unlesbar: Set<string>,
    kontoId: string | null,
  ): Promise<AutomatisierungAnsicht> {
    const l = letzte.get(a.id);
    const ohne = { ...a } as Automatisierung & { letzterTag?: unknown };
    delete ohne.letzterTag;
    // Darf das Konto „Automatisierung“ den Mappentyp der Wenn-Karte gar nicht lesen, kann sie nie laufen (#709) – nur Hinweis.
    const typ = kontextTyp(a.wenn, k.typen);
    const rechte =
      typ && unlesbar.has(typ.id)
        ? { typId: typ.id, typ: typ.name, kontoId, text: t('automatisierung.rechte.warnung', { typ: typ.name }) }
        : null;
    // „Paket nach Zeitplan ausführen“ (#1082): Paket entfernt oder ohne das Ereignis – Hinweis, die Automatisierung bleibt an.
    const ziel = (d: DannKarte) => (d.art !== 'paket' ? '' : a.herkunft === 'paket' ? (a.paketId ?? '') : d.paket);
    const leer = [...new Set(a.dann.flatMap((d) => (ziel(d) ? [paketKarteLeer(ziel(d), k.pakete)] : [])).filter((x): x is string => !!x))];
    // Aufruf von außen (#679): Adresse ohne Geheimnis; je Automatisierung ein eigener Auslöser (laufen nie gemeinsam).
    const aufruf = istAufruf(a.wenn) ? await this.aufrufStand(a.id) : undefined;
    // URL aufrufen (#671): welche Karten ein Geheimnis haben (ohne das Geheimnis).
    const geheimnisse = [...a.dann, ...a.sonst].some((x) => x.art === 'url') ? await this.ausleitung.geheimnisStand(a.id) : undefined;
    return {
      ...ohne,
      kurz: kurzform(a, k, (art) =>
        art === 'datum' ? t('automatisierung.wenn.datum') : t.frei(`ereignisse.name.${art.replace(/_/g, '-')}`),
      ),
      probleme: automatisierungsProbleme(a, k),
      ausloeser: istAufruf(a.wenn) ? `aufruf|${a.id}` : ausloeserSchluessel(a.wenn),
      letzterLauf: l ? { id: l.id, zustand: l.zustand, gestartet: l.gestartet, fehler: l.fehler } : null,
      ...(rechte ? { rechte } : {}),
      ...(leer.length ? { leer } : {}),
      ...(aufruf === undefined ? {} : { aufruf }),
      ...(geheimnisse === undefined ? {} : { geheimnisse }),
    };
  }

  /** Adresse eines Aufrufs von außen für die Karte (#679) – ohne Geheimnis; `oeffentlich`: Adresse von Ablago im Internet. */
  private async aufrufStand(id: string): Promise<(AufrufStand & { oeffentlich: boolean }) | null> {
    const s = await this.aufrufe.stand(id);
    return s && { ...s, oeffentlich: /^https?:\/\//i.test(s.adresse) && oeffentlichErreichbar(s.adresse) };
  }
}
