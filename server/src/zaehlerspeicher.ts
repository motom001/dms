import { createHash } from 'node:crypto';
import { heuteIn } from '../../shared/src/sichten';

/**
 * Zahlen der Ansichten zwischenspeichern (#512).
 *
 * Bei 50.000 Mappen kostet das Zählen aller Ansichten 150–230 ms (eine Abfrage mit einem
 * `count(*) FILTER (…)` je Ansicht über alle Mappen). Es wiederholte sich bei jedem Laden der
 * Ablage, auch wenn sich nichts geändert hatte. Jetzt:
 *
 * - **Stand des Haushalts:** zählt hoch, sobald eine ändernde Methode des Repos fertig ist
 *   (Mappen, Aufgaben, Ansichten, Typen und ihre Rechte, Favoriten, Papierkorb …). Was nur liest oder
 *   die Zahlen nicht berührt (Historie, Ereignisse, Texterkennung, „gesehen“), zählt nicht. Neue
 *   Methoden zählen, bis sie in `OHNE_FOLGEN` stehen – lieber einmal zu viel neu zählen als falsch.
 * - **Zwischenspeicher je Benutzer:** Schlüssel aus Benutzer, Rolle und einem Fingerabdruck seiner
 *   Rechte (Lesefilter, verborgene Ansichten); gültig, solange Stand und Datum (`heute`) gleich sind.
 * - **Ablauf:** Zeitabhängige Ansichten (heute, Monat, Jahr, Fristen) gelten höchstens
 *   `ZEITABHAENGIG_MS`, alle anderen höchstens `HOECHSTENS_MS` – das fängt auch Änderungen ab, die
 *   nicht über das Repo laufen. Um Mitternacht wechselt `heute`, damit ist jeder Eintrag alt.
 */

/** Zeitabhängige Ansichten: höchstens 5 Minuten. */
export const ZEITABHAENGIG_MS = 5 * 60_000;
/** Alle anderen: höchstens 30 Minuten (Sicherheitsnetz für Änderungen an der Datenbank vorbei). */
export const HOECHSTENS_MS = 30 * 60_000;
/** Höchstens so viele Einträge (je Benutzer und Rechte einer); danach fliegt der älteste. */
const MAX_EINTRAEGE = 500;

/**
 * Methoden des Repos, die nichts an den Zahlen ändern: alle lesenden und die schreibenden ohne
 * Folgen für Ansichten, Typen, Eingang, Favoriten und Papierkorb.
 */
export const OHNE_FOLGEN = new Set<string>([
  // lesen
  'listeTypen', 'holeTyp', 'zaehleMappen', 'listeMappen', 'mappenMitDatum', 'mappenKurz', 'feldwerte', 'holeMappe',
  'listePakete', 'paketCode', 'faelligeEreignisse', 'ereignisStand', 'listeNummernkreise', 'findeArchivnummer', 'holeSystemMappe',
  'holeMappen', 'titelVon', 'quellenVon', 'bezuege', 'seite', 'zaehler', 'alleFavoriten', 'auskunftLinkPerSchluessel', 'auskunftLinks',
  'favoritenVon', 'favoritenDerMappe', 'stummeFavoriten', 'geaendertVonAnderen', 'zaehleKlauseln', 'lesbare', 'inKlauseln',
  'zaehleAusdruck', 'listeSichten', 'unpassende', 'typenOhnePassung', 'belegung', 'ohneTitel', 'typenVon', 'findeDoppelt',
  'rueckverweise', 'kantenVon', 'listeDokumente', 'dokumenteVon', 'zaehleDokumente', 'holeDokument', 'versionenVon',
  'versionenVonDokumenten', 'holeVersion', 'alleDateien', 'dokumenteMitSha', 'grossePdfs', 'dokumenteJeRegister', 'zaehleDemo',
  'echteVerweiseAufDemo', 'papierkorb', 'zaehlePapierkorb', 'dateiBenutzt', 'papierkorbDokumente', 'holeAusPapierkorb', 'holeDokumentAusPapierkorb',
  'ocrNaechster', 'ocrVonSha', 'ocrZaehler', 'ocrAuftraege', 'ocrOhneVolltext', 'ocrSprachen', 'volltext', 'volltexte',
  'aufgabenZurPassung', 'holeAufgabe', 'aufgabenVon', 'aufgabenVonMappen', 'offeneAufgaben', 'erledigteAufgaben', 'fristAufgaben',
  'verschluesselteFundstellen', 'erinnerungen', 'holeErinnerung', 'notizen', 'notizenVon', 'holeNotiz', 'historie', 'historieVon',
  // schreiben, ohne Folgen für die Zahlen
  'legeEreignisseAn', 'ereignisZugestellt', 'ereignisFehlgeschlagen', 'loescheEreignisse', 'speicherePaketCode', 'loeschePaketCode',
  'speichereNummernkreis', 'loescheNummernkreis', 'setzeZaehler', 'zieheNummern', 'aktualisiereStatistik',
  'legeAuskunftLinkAn', 'auskunftLinkFehlversuch', 'auskunftLinkAbruf', 'widerrufeAuskunftLink', 'setzeFavoritBenachrichtigen',
  'merkeGesehen', 'ocrEinreihen', 'ocrSetze', 'ocrZurueckstellen', 'legeErinnerungAn', 'aendereErinnerung', 'loescheErinnerung',
  'legeNotizAn', 'aendereNotiz', 'loescheNotiz', 'historieSchreibe', 'historieAufraeumen', 'kuerzeVersionen',
]);

/** Stand des Haushalts: zählt nach jeder Änderung hoch, die Zahlen der Ansichten ändern kann. */
export class Haushaltsstand {
  private n = 0;
  get stand() { return this.n; }
  erhoehe() { this.n++; }

  /**
   * Umhüllt ein Repo: Ist eine ändernde Methode fertig (auch mit Fehler – sie kann halb gewirkt
   * haben), zählt der Stand hoch. Erst danach, damit eine gleichzeitige Zählung den neuen Stand
   * nicht mit alten Zahlen speichert. `transaktion` zählt als Ganzes (das Repo darin ist nicht umhüllt).
   */
  umhuelle<T extends object>(repo: T): T {
    const self = this;
    return new Proxy(repo, {
      get(ziel, prop, empfaenger) {
        const wert = Reflect.get(ziel, prop, empfaenger);
        if (typeof wert !== 'function' || typeof prop !== 'string' || OHNE_FOLGEN.has(prop)) return wert;
        return function (this: unknown, ...args: unknown[]) {
          let ergebnis: unknown;
          try { ergebnis = wert.apply(ziel, args); } catch (e) { self.erhoehe(); throw e; }
          if (!(ergebnis instanceof Promise)) { self.erhoehe(); return ergebnis; }
          return ergebnis.then((r) => { self.erhoehe(); return r; }, (e) => { self.erhoehe(); throw e; });
        };
      },
    });
  }
}

/** Kommt eine Bedingung vor, die vom Datum abhängt? (heute, Monat, Jahr oder eine Frist) */
export function zeitabhaengig(bedingungen: unknown): boolean {
  return /"art":"(heute|monat|jahr|frist)"/.test(JSON.stringify(bedingungen ?? null));
}

/** Fingerabdruck der Rechte, die das Zählen beeinflussen (Lesefilter, verborgene Ansichten, eigene Rollen). */
export function fingerabdruck(x: unknown): string {
  return createHash('sha256').update(JSON.stringify(x ?? null)).digest('base64url').slice(0, 22);
}

interface Eintrag<T> { stand: number; heute: string; bis: number; wert: Promise<T> }

export type Treffer = 'treffer' | 'neu';

/** Zwischenspeicher der Zahlen je Benutzer und Rechte. */
export class Zaehlerspeicher<T> {
  private eintraege = new Map<string, Eintrag<T>>();
  constructor(private readonly stand: Haushaltsstand, private readonly jetzt: () => number = Date.now) {}

  /**
   * Gültiger Eintrag zum Schlüssel, sonst `zaehle()` und merken. Gleichzeitige Aufrufe mit gleichem
   * Schlüssel warten auf dieselbe Zählung. Der Stand gilt ab Beginn der Zählung.
   */
  async hole(schluessel: string, zaehle: () => Promise<{ wert: T; zeitabhaengig: boolean }>): Promise<{ wert: T; art: Treffer }> {
    const t = this.jetzt();
    const heute = heuteIn(new Date(t));
    const da = this.eintraege.get(schluessel);
    if (da && da.stand === this.stand.stand && da.heute === heute && t < da.bis) return { wert: await da.wert, art: 'treffer' };
    const stand = this.stand.stand;
    const e: Eintrag<T> = { stand, heute, bis: t + HOECHSTENS_MS, wert: Promise.resolve(null as T) };
    e.wert = zaehle().then((z) => { if (z.zeitabhaengig) e.bis = Math.min(e.bis, t + ZEITABHAENGIG_MS); return z.wert; });
    this.eintraege.delete(schluessel);
    this.eintraege.set(schluessel, e);
    if (this.eintraege.size > MAX_EINTRAEGE) this.eintraege.delete(this.eintraege.keys().next().value!);
    try {
      return { wert: await e.wert, art: 'neu' };
    } catch (f) {
      if (this.eintraege.get(schluessel) === e) this.eintraege.delete(schluessel);
      throw f;
    }
  }

  /** Alles vergessen (z. B. nach einer Wiederherstellung). */
  leere() { this.eintraege.clear(); }
}
