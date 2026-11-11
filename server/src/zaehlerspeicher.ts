import { createHash } from 'node:crypto';
import { heuteIn } from '../../shared/src/sichten';
import { merkeAenderung } from './lesespeicher';
import type { Kurzzustand } from './kurzzustand';
import { kontext, protokoll } from './protokoll';

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
 *
 * Seit #742:
 *
 * - **Stand in der Datenbank** (Sequenz `haushaltsstand_zahlen`, Migration 077): Das Repo liefert ihn
 *   (`haushaltsstand`, `erhoeheHaushaltsstand`); jede ändernde Methode zählt ihn nach dem Abschluss hoch, jede Anfrage
 *   liest ihn mit der Sitzung. So wirkt eine Änderung in allen Prozessen. Ohne Datenbank (Tests mit `speicherRepo`)
 *   zählt nur dieser.
 * - **Mindestgültigkeit** (`MINDESTENS_MS`): Bei Anfragen gilt ein Eintrag nach einer Änderung **anderer** noch kurz
 *   weiter – speichert einer von 20, zählen nicht alle sofort neu. Eigene Änderungen (`Kontext.benutzerId`) zeigen
 *   die Zahlen sofort; Arbeit im Hintergrund (Zusammenfassung) zählt immer frisch.
 * - Der Schlüssel bestimmt, wer einen Eintrag teilt: für die Zahlen der Ablage ein Fingerabdruck der Rechte
 *   (dienst.ts, `zaehler`) – nie ein Wert über Mappen, die jemand nicht lesen darf.
 *
 * Seit #918 („Nachhinken ja, falsch nie“):
 *
 * - **Mappenstand** (Sequenz `haushaltsstand_mappen`, Migration 086): ein zweiter, feinerer Stand neben dem
 *   Haushaltsstand. Er zählt bei denselben Methoden, nur nicht bei denen in `NUR_FAVORITEN` (Stern). Die teuren Zahlen
 *   je Mappentyp und Ansicht, die Zahl der Treffer einer Liste und die Termine ohne „nur Favoriten“ hängen an ihm; was
 *   Favoriten zählt oder nach ihnen filtert, bleibt am Haushaltsstand. Ein Stern rechnet so nur noch die Zahlen der
 *   Person neu, nicht die aller anderen.
 * - **Eigene Änderung im selben Prozess:** Ein Eintrag gilt nur, solange auch dieser Prozess seitdem nichts geändert
 *   hat (`lokal`) – sonst sähe man die eigene Änderung erst, wenn die Datenbank kurz danach hochgezählt hat.
 * - **Schalter** `DMS_ZWISCHENSPEICHER=aus` (`zwischenspeicherAus`): kein Eintrag gilt, alles wird bei jeder Anfrage
 *   frisch gerechnet – zur Fehlersuche („liegt es am Zwischenspeicher?“).
 */

/** Zeitabhängige Ansichten: höchstens 5 Minuten. */
export const ZEITABHAENGIG_MS = 5 * 60_000;
/** Alle anderen: höchstens 30 Minuten (Sicherheitsnetz für Änderungen an der Datenbank vorbei). */
export const HOECHSTENS_MS = 30 * 60_000;
/** Mindestgültigkeit nach Änderungen anderer (#742, Vorschlag im Issue 2–5 s). */
export const MINDESTENS_MS = 3_000;
/** Kurzzustand der eigenen Änderungen (#745): Art und Gültigkeit (länger als die Mindestgültigkeit). */
const EIGENE = 'eigene-aenderung';
/** Dasselbe für den Mappenstand (#918). */
export const EIGENE_MAPPEN = 'eigene-aenderung-mappen';
const EIGENE_MS = 10 * MINDESTENS_MS;
/** Höchstens so viele Einträge (je Benutzer und Rechte einer); danach fliegt der älteste. */
const MAX_EINTRAEGE = 500;
/** Letzte eigene Änderung je Person (#742) für so viele Personen; danach fliegt die älteste. */
const MAX_PERSONEN = 1_000;

const log = protokoll.modul('datenbank');

/**
 * Methoden des Repos, die nichts an den Zahlen ändern: alle lesenden und die schreibenden ohne
 * Folgen für Ansichten, Typen, Eingang, Favoriten und Papierkorb.
 */
export const OHNE_FOLGEN = new Set<string>([
  // lesen
  'listeTypen', 'holeTyp', 'zaehleMappen', 'listeMappen', 'mappenMitDatum', 'mappenKurz', 'feldwerte', 'holeMappe',
  'listePakete', 'paketCode', 'faelligeEreignisse', 'ereignisStand', 'listeNummernkreise', 'findeArchivnummer', 'holeSystemMappe', 'mappenMitVorgabe',
  'holeMappen', 'titelVon', 'quellenVon', 'bezuege', 'seite', 'gibtTreffer', 'zaehler', 'alleFavoriten', 'auskunftLinkPerSchluessel', 'auskunftLinks',
  'favoritenVon', 'favoritenDerMappe', 'gibtMappen', 'stummeFavoriten', 'geaendertVonAnderen', 'zaehleKlauseln', 'lesbare', 'inKlauseln',
  'zaehleAusdruck', 'listeSichten', 'unpassende', 'typenOhnePassung', 'belegung', 'ohneTitel', 'typenVon', 'findeDoppelt', 'findeDoppelte',
  'rueckverweise', 'kantenVon', 'listeDokumente', 'dokumenteVon', 'zaehleDokumente', 'holeDokument', 'versionenVon',
  'versionenVonDokumenten', 'holeVersion', 'alleDateien', 'dokumenteMitSha', 'dokumenteMitTyp', 'dokumentTypen', 'grossePdfs', 'dokumenteJeRegister', 'zaehleDemo',
  'echteVerweiseAufDemo', 'papierkorb', 'zaehlePapierkorb', 'dateiBenutzt', 'papierkorbDokumente', 'holeAusPapierkorb', 'holeDokumentAusPapierkorb',
  'ocrNaechster', 'ocrVonSha', 'ocrZaehler', 'ocrAuftraege', 'ocrOhneVolltext', 'volltextKandidaten', 'volltextHerkunft', 'ocrSprachen', 'volltext', 'volltexte',
  'aufgabenZurPassung', 'holeAufgabe', 'aufgabenVon', 'aufgabenVonMappen', 'offeneAufgaben', 'erledigteAufgaben', 'fristAufgaben',
  // Aufgaben bei Personen ohne Leserecht (#798): Lesen und neue Fälle ändern keine Zahl; Leserecht auf Zeit und Ende schon.
  'faelleOhneLeserecht', 'leserechteAufZeit', 'legeFallAn',
  'verschluesselteFundstellen', 'ablaeufe', 'holeAblauf', 'notizen', 'notizenVon', 'holeNotiz', 'historie', 'historieVon', 'letzterAbruf',
  // schreiben, ohne Folgen für die Zahlen
  'legeEreignisseAn', 'ereignisZugestellt', 'ereignisDaten', 'ereignisFehlgeschlagen', 'loescheEreignisse', 'loescheOffeneEreignisse', 'speicherePaketCode', 'loeschePaketCode',
  // Sprachpakete (#731): nur Texte.
  'sprachpakete', 'speichereSprachpaket', 'loescheSprachpaket',
  'speichereNummernkreis', 'loescheNummernkreis', 'setzeZaehler', 'zieheNummern', 'aktualisiereStatistik',
  'legeAuskunftLinkAn', 'auskunftLinkFehlversuch', 'auskunftLinkAbruf', 'widerrufeAuskunftLink', 'setzeFavoritBenachrichtigen',
  'merkeGesehen', 'ocrEinreihen', 'ocrSetze', 'ocrZurueckstellen', 'legeAblaufAn', 'aendereAblauf', 'loescheAblauf', 'setzeAblaufAngehalten',
  // Automatisierungsvorlagen (#1044): Vorlagen, Änderungs- und Ablaufverlauf ändern keine Zahl.
  'ablaufvorlagen', 'speichereAblaufvorlage', 'loescheAblaufvorlage', 'ablaufvorlageFassungen', 'vermerkeAblauf', 'ablaufVerlauf', 'zaehleAblaufVerlauf', 'raeumeAblaufVerlaufAuf',
  'legeNotizAn', 'aendereNotiz', 'loescheNotiz', 'historieSchreibe', 'historieAufraeumen', 'kuerzeVersionen',
  // Unscharfe Suche (#356): Wörterverzeichnis und gleichbedeutende Wörter ändern keine Zahlen.
  'aehnlicheWoerter', 'woerterAnzahl', 'woerterNeu', 'woerterEinarbeiten', 'synonyme', 'legeSynonymAn', 'aendereSynonym', 'loescheSynonym', 'setzeSynonyme',
  // Sprache eines Dokuments (#400): nur für die Volltextsuche.
  'setzeDokumentSprache',
  // Zähler-Endpunkt (#625): merkt sich nur den Stand der Zahlen.
  'zaehlerstand', 'setzeZaehlerstand',
  // Zahlen in einem Lauf und der Haushaltsstand selbst (#742).
  'zaehleBestand', 'zaehlePersoenlich', 'haushaltsstand', 'erhoeheHaushaltsstand',
  // Mappenstand und Vorfilter der Termine (#918).
  'mappenstand', 'erhoeheMappenstand', 'fristKandidaten',
  // Ausgangskorb des Ereigniskatalogs (#670) und „Frist erreicht“ schon gemeldet: nur Buchführung des Verteilers.
  // Der Verteiler fragt alle 2 Sekunden nach (`holeKatalogEreignisse`) – zählte das, wären Zahlen und Termine
  // nie länger als 2 Sekunden gültig (Lasttest: Speicher und Ereignisschleife, seit #725 die Termine eines ganzen
  // Jahres für die Startseite rechnen).
  'legeKatalogEreignisAn', 'holeKatalogEreignisse', 'katalogEreignisseVerteilt', 'katalogEreignisFehlgeschlagen',
  'raeumeKatalogEreignisseAuf', 'katalogEreignisStand', 'merkeFristMeldung',
  // #918: nur lesend bzw. ohne Folgen für Zahlen, Listen und Termine (Löschprotokoll, Erkennung, Vektoren, Sprachen
  // der Seiten, Hinweis „Post teilen?“, Fragen an die Ablage, Verzeichnis der Auskünfte).
  'papierkorbInhalt', 'papierkorbDokumentInhalt', 'loeschprotokoll', 'loeschprotokollSchreibe', 'loeschprotokollAufraeumen',
  'erkennungLies', 'erkennungSchreibe', 'erkennungenMitAbsender', 'vektorSetze', 'vektorLoesche', 'vektorenLoeschePaket',
  'vektorenLaden', 'vektorVon', 'vektorStand', 'ohneVektor', 'mitVolltext', 'seitensprachen', 'teilenHinweisAus', 'setzeLeerseiten',
  'fragenFundstellen', 'historieArt',
  // #936: Wohin eine Post aufgelöst wurde (nur lesend).
  'aufgeloesteIn',
  // Hinweise von Paketen (#1034) stehen nur an der Mappe, gebündelte berechnete Werte nur in ihrer Historie.
  'hinweise', 'setzeHinweis', 'loescheHinweis', 'loescheHinweiseVon', 'letzteBerechnung', 'historieDatenErsetzen',
]);

/**
 * Methoden, die nur Favoriten ändern (#918): Sie zählen für den Haushaltsstand (Zahl der Favoriten, Ansichten mit „ist
 * mein Favorit“, Termine „nur Favoriten“), nicht für den Mappenstand.
 */
export const NUR_FAVORITEN: ReadonlySet<string> = new Set(['setzeFavorit']);

/** Bezieht sich etwas (Bedingungen, Lesefilter, Anfrage) auf Favoriten? Dann gilt der Haushaltsstand (#918). */
export const mitFavoriten = (x: unknown): boolean => /"(art":"favorit|favoriten)"/.test(JSON.stringify(x ?? null));

const AUS_WERTE = ['aus', '0', 'nein', 'false', 'off'];
let aus: boolean | null = null;

/**
 * Schalter `DMS_ZWISCHENSPEICHER` (#918), nur als Umgebungsvariable: `aus` (auch 0, nein, false, off) schaltet die
 * Zwischenspeicher der Zahlen, Trefferzahlen und Termine ab. Beim Start gelesen; Tests stellen ihn hiermit um.
 */
export function richteZwischenspeicherEin(env: Record<string, string | undefined> = process.env): boolean {
  aus = AUS_WERTE.includes((env.DMS_ZWISCHENSPEICHER ?? '').trim().toLowerCase());
  return !aus;
}
/** Sind die Zwischenspeicher abgeschaltet (`DMS_ZWISCHENSPEICHER=aus`)? */
export const zwischenspeicherAus = (): boolean => aus ?? !richteZwischenspeicherEin();

/**
 * Die Termine (#528, #725) hängen zusätzlich an den Mappen-Abläufen (#1044, früher freie Erinnerungen) und an den Datumsfeldern: Diese Methoden
 * zählen für dessen Stand mit, obwohl sie keine Zahl einer Ansicht ändern.
 */
export const ZAEHLT_FUER_TERMINE: ReadonlySet<string> = new Set(['legeAblaufAn', 'aendereAblauf', 'loescheAblauf']);

/** Stand in der Datenbank (#742): lesen (in einer Anfrage aus der Sitzungsabfrage) und hochzählen. */
export interface Standquelle { lies(): Promise<number>; erhoehe(): Promise<number> }

/** Stand des Haushalts: zählt nach jeder Änderung hoch, die Zahlen der Ansichten ändern kann. */
export class Haushaltsstand {
  /**
   * `auch`: Methoden aus `OHNE_FOLGEN`, die für diesen Stand trotzdem zählen. `o.ohne` (#918): weitere, die für
   * diesen Stand nicht zählen; `o.art`: Art im Kurzzustand für die eigenen Änderungen (je Stand eine).
   */
  constructor(private readonly auch: ReadonlySet<string> = new Set(), private quelle?: Standquelle, o: { ohne?: ReadonlySet<string>; art?: string } = {}) {
    this.ohne = o.ohne ?? new Set();
    this.art = o.art ?? EIGENE;
  }
  private readonly ohne: ReadonlySet<string>;
  private readonly art: string;
  /** Zählt diese Methode des Repos für diesen Stand? */
  zaehlt(methode: string): boolean { return !(OHNE_FOLGEN.has(methode) && !this.auch.has(methode)) && !this.ohne.has(methode); }
  private n = 0;
  /** Letzte eigene Änderung je Person (Zahl der Änderungen in diesem Prozess danach). */
  private eigene = new Map<string, number>();
  private geplant = false;
  /** Das zuletzt geplante Hochzählen in der Datenbank (für `hochgezaehlt`). */
  private offen: Promise<void> = Promise.resolve();
  /** Mehrere Prozesse (#745): eigene Änderungen auch im Kurzzustand, damit ein anderer Prozess sie kennt. */
  private geteilt: Kurzzustand | null = null;
  private wer = new Set<string>();
  /** Änderungen in diesem Prozess (ohne Datenbank zugleich der Stand). */
  get stand() { return this.n; }
  /** Stand in der Datenbank verwenden (#742). */
  verbinde(q: Standquelle | undefined) { this.quelle = q; }

  /** Gültiger Stand: aus der Datenbank (in einer Anfrage einmal mit der Sitzung gelesen), sonst der dieses Prozesses. */
  async aktuell(): Promise<number> { return this.quelle ? this.quelle.lies() : this.n; }

  /**
   * Mehrere Prozesse (#745): Nach einer eigenen Änderung steht der neue Stand (aus der Datenbank) je Person kurz im
   * Kurzzustand – landet die nächste Anfrage bei einem anderen Prozess, zeigt auch er die Zahlen sofort neu.
   */
  teileEigene(z: Kurzzustand) { this.geteilt = z; }

  /** Hat diese Person nach Stand `stand` selbst etwas geändert – in irgendeinem Prozess (#745)? */
  async eigeneNach(benutzerId: string | undefined, stand: number): Promise<boolean> {
    if (!benutzerId || !this.geteilt) return false;
    const e = await this.geteilt.lies(this.art, benutzerId).catch(() => null);
    return !!e && Number(e.wert) > stand;
  }

  /** `stand` nach der letzten eigenen Änderung dieser Person in diesem Prozess (0 = keine). */
  eigeneAenderung(benutzerId: string | undefined): number { return (benutzerId && this.eigene.get(benutzerId)) || 0; }

  /**
   * Nach einer Änderung. Die Datenbank zählt kurz danach hoch (nach dem Abschluss der Änderung, gleichzeitige
   * Änderungen zusammen) – wer bis dahin noch den alten Stand liest, hat höchstens einmal zu viel gemerkt, nie falsch.
   */
  async erhoehe(): Promise<void> {
    merkeAenderung();
    this.n++;
    const wer = kontext.getStore()?.benutzerId;
    if (wer) {
      if (this.geteilt) this.wer.add(wer);
      this.eigene.delete(wer);
      this.eigene.set(wer, this.n);
      if (this.eigene.size > MAX_PERSONEN) this.eigene.delete(this.eigene.keys().next().value!);
    }
    if (this.quelle && !this.geplant) {
      this.geplant = true;
      const q = this.quelle;
      this.offen = new Promise<void>((fertig) => kontext.exit(() => setImmediate(() => {
        this.geplant = false;
        const wer = [...this.wer];
        this.wer.clear();
        // Fehlt das Hochzählen, merken andere Prozesse die Änderung spätestens nach HOECHSTENS_MS.
        q.erhoehe().then(async (n) => {
          const z = this.geteilt;
          if (z) for (const w of wer) await z.setze(this.art, w, n, Date.now() + EIGENE_MS);
        }).catch((e) => log.warn('Haushaltsstand nicht hochgezählt', { fehler: (e as Error).message })).finally(fertig);
      })));
    }
  }
  /**
   * Wartet, bis das zuletzt geplante Hochzählen in der Datenbank durch ist (#900). Für Tests, die nach einer Änderung
   * denselben Stand in zwei Anfragen brauchen – statt einer festen Wartezeit.
   */
  async hochgezaehlt(): Promise<void> { await this.offen; }

  /**
   * Umhüllt ein Repo: Ist eine ändernde Methode fertig (auch mit Fehler – sie kann halb gewirkt
   * haben), zählt der Stand hoch. Erst danach, damit eine gleichzeitige Zählung den neuen Stand
   * nicht mit alten Zahlen speichert. `transaktion` zählt als Ganzes (das Repo darin ist nicht umhüllt).
   * `weitere` (#918): Stände, die in derselben Hülle mitzählen, jeder nach seinen eigenen Methoden.
   */
  umhuelle<T extends object>(repo: T, ...weitere: Haushaltsstand[]): T {
    const alle = [this, ...weitere];
    return new Proxy(repo, {
      get(ziel, prop, empfaenger) {
        const wert = Reflect.get(ziel, prop, empfaenger);
        if (typeof wert !== 'function' || typeof prop !== 'string') return wert;
        const zaehlen = alle.filter((s) => s.zaehlt(prop));
        if (!zaehlen.length) return wert;
        const fertig = () => { for (const s of zaehlen) void s.erhoehe(); };
        return function (this: unknown, ...args: unknown[]) {
          let ergebnis: unknown;
          try { ergebnis = wert.apply(ziel, args); } catch (e) { fertig(); throw e; }
          if (!(ergebnis instanceof Promise)) { fertig(); return ergebnis; }
          return ergebnis.then((r) => { fertig(); return r; }, (e) => { fertig(); throw e; });
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

interface Eintrag<T> { stand: number; lokal: number; heute: string; seit: number; bis: number; wert: Promise<T> }

export type Treffer = 'treffer' | 'neu';

/** Wie `hole` einen Eintrag nach einer Änderung behandelt (#742). */
export interface Gueltigkeit {
  /** So lange nach dem Zählen gilt ein Eintrag auch bei neuerem Stand (0 = nie). */
  mindestensMs?: number;
  /** Wer fragt: Nach seiner eigenen Änderung gilt die Mindestgültigkeit nicht. */
  wer?: string;
}

/** Zwischenspeicher der Zahlen je Benutzer und Rechte. */
export class Zaehlerspeicher<T> {
  private eintraege = new Map<string, Eintrag<T>>();
  constructor(private readonly stand: Haushaltsstand, private readonly jetzt: () => number = Date.now) {}

  /**
   * Gültiger Eintrag zum Schlüssel, sonst `zaehle()` und merken. Gleichzeitige Aufrufe mit gleichem
   * Schlüssel warten auf dieselbe Zählung. Der Stand gilt ab Beginn der Zählung.
   */
  async hole(schluessel: string, zaehle: () => Promise<{ wert: T; zeitabhaengig: boolean }>, g: Gueltigkeit = {}): Promise<{ wert: T; art: Treffer }> {
    // Abgeschaltet (#918): immer frisch, nichts merken.
    if (zwischenspeicherAus()) { this.eintraege.clear(); return { wert: (await zaehle()).wert, art: 'neu' }; }
    const stand = await this.stand.aktuell();
    const t = this.jetzt();
    const heute = heuteIn(new Date(t));
    const da = this.eintraege.get(schluessel);
    if (da && da.heute === heute && t < da.bis) {
      // Gleicher Stand – und in diesem Prozess seitdem nichts geändert (#918; die Datenbank zählt erst kurz danach).
      if (da.stand === stand && da.lokal === this.stand.stand) return { wert: await da.wert, art: 'treffer' };
      // Mindestgültigkeit (#742): Änderungen anderer erst nach kurzer Zeit; eigene sofort.
      const kurz = (g.mindestensMs ?? 0) > 0 && t - da.seit < g.mindestensMs! && this.stand.eigeneAenderung(g.wer) <= da.lokal;
      // Eigene Änderung in einem anderen Prozess (#745)? Nur in diesem seltenen Fall eine kleine Abfrage mehr.
      if (kurz && (da.stand === stand || (da.stand < stand && !(await this.stand.eigeneNach(g.wer, da.stand))))) return { wert: await da.wert, art: 'treffer' };
    }
    const e: Eintrag<T> = { stand, lokal: this.stand.stand, heute, seit: t, bis: t + HOECHSTENS_MS, wert: Promise.resolve(null as T) };
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

  /** Für Tests und den Lasttest: Zahl der Einträge (höchstens MAX_EINTRAEGE). */
  get groesse() { return this.eintraege.size; }

  /** Alles vergessen (z. B. nach einer Wiederherstellung). */
  leere() { this.eintraege.clear(); }
}
