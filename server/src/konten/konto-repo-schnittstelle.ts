/**
 * Schnittstelle der Konten-Ablage (#1278, vorher in `konten/konto-repo.ts`): `KontoRepo`, Sitzungen, Links und die
 * Hilfen für „Zuletzt geöffnet“ und die Adressen von Dienst- und Systemkonten. Von außen über `konto-repo.ts`.
 */
import type { Benutzer, Abwesenheit, Sitzung, Vertretung } from '../../../shared/src/model';
import { dienstEmail } from '../repo';

/** Adresse eines Dienstkontos: nie zustellbar (.invalid, RFC 2606). */
/** Adresse eines Dienstkontos – mit Haushalt, weil die Adresse über alle Haushalte eindeutig ist (benutzer_email_uq). */
/** „Zuletzt geöffnet“ (#940): Einträge `{ id, am }`; frühere Listen hatten nur die Id. */
export interface ZuletztEintrag {
  id: string;
  am: string | null;
}
export function zuletztListe(roh: unknown): ZuletztEintrag[] {
  if (!Array.isArray(roh)) return [];
  const aus: ZuletztEintrag[] = [];
  for (const x of roh) {
    if (typeof x === 'string') aus.push({ id: x, am: null });
    else if (x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string') {
      const am = (x as { am?: unknown }).am;
      aus.push({ id: (x as { id: string }).id, am: typeof am === 'string' ? am : null });
    }
  }
  return aus;
}
/** Wer dieselbe Mappe gleich wieder öffnet oder ändert, schreibt höchstens einmal je Minute (#615). */
export const ZULETZT_RUHE_MS = 60_000;

/** Adresse eines Dienstkontos; steht in repo.ts, weil auch der Umzug einer Paket-Id (#1084) sie braucht. */
export { dienstEmail };
/** Adresse eines Systemkontos (#673), ebenso nie zustellbar. */
export const systemEmail = (kennung: string, haushaltId: string) => `${kennung}.${haushaltId}@system.invalid`;

export type Zweck = 'einladung' | 'zuruecksetzen';
/** Neue Person; `verwaltung` = Verwaltungsrecht (#818), sonst keines. Eine Rolle wird nicht mehr gespeichert. */
export interface NeuerBenutzer {
  id: string;
  email: string;
  name: string;
  passwortHash: string | null;
  verwaltung?: string[];
}
export interface Link {
  benutzerId: string;
  zweck: Zweck;
  ablauf: Date;
  benutzt: Date | null;
}
export interface SitzungsInfo {
  geraet: string;
  ip: string;
  vertretungId?: string | null;
  /** Anmeldung mit allen eingerichteten Faktoren (#819): zählt für „Anmeldung höchstens 10 Minuten her“. */
  voll?: boolean;
}
/** Verwaltungsmodus einer Sitzung (#819), auf dem Server gehalten – nie ein Merkmal, das der Browser setzt. */
export interface SitzungsVerwaltung {
  /** Beginn des laufenden Modus; null = kein Modus. */
  verwaltungSeit: Date | null;
  /** Letzte Aktivität im Modus. */
  verwaltungAktiv: Date | null;
  /** Tagesmerker: zuletzt erneut angemeldet (gilt bis Mitternacht). */
  verwaltungBestaetigt: Date | null;
  /** Letzte frische Anmeldung für heikle Handlungen. */
  frisch: Date | null;
}
export interface SitzungIntern extends Partial<SitzungsVerwaltung> {
  id: string;
  benutzerId: string;
  ablauf: Date;
  zuletztAktiv: Date;
  vertretungId: string | null;
  /** Beginn der Sitzung (#416: Zwei-Faktor-Pflicht erst für neue Sitzungen). */ erstellt?: Date;
  /** Zeitpunkt der Anmeldung mit allen Faktoren (#819); null bei vertretenen oder übernommenen Sitzungen. */
  anmeldungVoll?: Date | null;
}
/** Änderung, die nur gilt, wenn die Prüfung über alle Personen (in einer Sperre) nichts einzuwenden hat (#818). */
export type Schutzpruefung = (nachher: Benutzer[], vorher: Benutzer[]) => string | null;

/** Datenzugriff für Benutzer, Sitzungen und Passwort-Links. */
export interface KontoRepo {
  anzahlBenutzer(): Promise<number>;
  listeBenutzer(): Promise<Benutzer[]>;
  holeBenutzer(id: string): Promise<Benutzer | undefined>;
  holeHash(email: string): Promise<{ benutzer: Benutzer; hash: string | null } | undefined>;
  legeBenutzerAn(b: NeuerBenutzer): Promise<Benutzer>;
  aendereBenutzer(
    id: string,
    d: Partial<Pick<Benutzer, 'name' | 'aktiv' | 'email' | 'entwicklermodus' | 'sprache' | 'uebersetzen'>>,
  ): Promise<Benutzer>;
  /**
   * Verwaltungsrecht setzen oder (de)aktivieren mit Schutzregel (#818): in einer Transaktion mit Sperre über alle
   * Personen; liefert die Prüfung einen Grund, ändert sich nichts und er kommt als Fehler zurück.
   */
  aendereGeschuetzt(
    id: string,
    d: { verwaltung?: string[]; aktiv?: boolean },
    pruefe: Schutzpruefung,
  ): Promise<{ benutzer: Benutzer } | { grund: string }>;
  /** Abwesenheit mit Vertreter setzen (#78). */
  setzeAbwesenheit(id: string, a: Abwesenheit): Promise<Benutzer>;
  setzeHash(id: string, hash: string): Promise<void>;
  /** Hash neu speichern (#1358, neue scrypt-Parameter) – nur, wenn noch `alt` gespeichert ist; true = ersetzt. */
  ersetzeHash(id: string, alt: string, neu: string): Promise<boolean>;
  notiereAnmeldung(id: string): Promise<void>;
  loescheBenutzer(id: string): Promise<void>;
  /** Dienstkonto eines Pakets (#338); nicht in listeBenutzer, anzahlBenutzer, holeHash. */
  dienstkonto(paketId: string): Promise<Benutzer | undefined>;
  legeDienstkontoAn(d: { id: string; paketId: string; name: string }): Promise<Benutzer>;
  listeDienstkonten(): Promise<Benutzer[]>;
  /** Systemkonten des DMS (#673), z. B. „Automatisierung“; wie Dienstkonten nicht in listeBenutzer, anzahlBenutzer, holeHash. */
  systemkonto(kennung: string): Promise<Benutzer | undefined>;
  legeSystemkontoAn(d: { id: string; kennung: string; name: string }): Promise<Benutzer>;
  listeSystemkonten(): Promise<Benutzer[]>;

  legeSitzungAn(hash: string, benutzerId: string, ablauf: Date, info: SitzungsInfo): Promise<void>;
  holeSitzung(hash: string): Promise<SitzungIntern | undefined>;
  /**
   * Sitzung und Person in **einer** Abfrage (#741): nur eine noch gültige Sitzung einer aktiven Person (kein
   * Systemkonto), sonst undefined. Nie aus einem Zwischenspeicher. Liest den Haushaltsstand für die Anfrage mit.
   */
  holeAnmeldung?(hash: string): Promise<{ sitzung: SitzungIntern; benutzer: Benutzer } | undefined>;
  /** Letzte Aktivität auf jetzt setzen. */
  beruehreSitzung(hash: string): Promise<void>;
  /** Verwaltungsmodus der Sitzung ändern (#819); nur die angegebenen Felder. */
  setzeSitzungsVerwaltung(hash: string, d: Partial<SitzungsVerwaltung>): Promise<void>;
  /** Modus, Tagesmerker und frische Anmeldung in allen Sitzungen des Benutzers aufheben (#819: Rechteentzug, Zwei-Faktor). */
  vergissVerwaltungVon(benutzerId: string): Promise<void>;
  /**
   * Werkbank (#921): gültige Sitzungen mit begonnenem Verwaltungsmodus, nur von aktiven Personen dieses Haushalts (keine
   * Dienst- oder Systemkonten) und nicht in einer Vertretung. Ob der Modus noch läuft, prüft `Konten.modusAktiv`.
   */
  sitzungenImVerwaltungsmodus(): Promise<Array<{ benutzer: Benutzer; sitzung: SitzungIntern }>>;
  /** Gültige Sitzungen eines Benutzers, neueste Aktivität zuerst. */
  listeSitzungen(benutzerId: string): Promise<Array<Sitzung & { hash: string }>>;
  loescheSitzung(hash: string): Promise<void>;
  loescheSitzungMitId(benutzerId: string, id: string): Promise<boolean>;
  loescheSitzungenVon(benutzerId: string): Promise<void>;

  legeVertretungAn(v: { id: string; benutzerId: string; adminId: string; adminName: string }): Promise<void>;
  beendeVertretung(id: string): Promise<void>;
  holeVertretung(id: string): Promise<Vertretung | undefined>;
  /** Vertretungen, die der Benutzer noch nicht gesehen hat. */
  ungeseheneVertretungen(benutzerId: string): Promise<Vertretung[]>;
  /** Vollexport (#254): alle Vertretungen. */
  alleVertretungen(): Promise<Vertretung[]>;
  markiereGesehen(benutzerId: string): Promise<void>;

  /** Persönliche Einstellungen (Sortierung, Design …). */
  einstellungen(benutzerId: string): Promise<Record<string, unknown>>;
  /** wert null löscht die Einstellung. */
  setzeEinstellung(benutzerId: string, schluessel: string, wert: unknown): Promise<void>;
  /**
   * „Zuletzt geöffnet“ (#334): die Mappe vorn in die Liste unter `schluessel` (höchstens `max`, ohne Doppelte).
   * Seit #940 je Eintrag `{ id, am }` (Zeitpunkt für die Liste der letzten 25); ältere Einträge sind nur die Id.
   * Steht sie schon vorn und ist der Zeitpunkt jünger als eine Minute, bleibt alles. In einem Zugriff (#615) und ohne
   * auf die Platte zu warten.
   */
  merkeVorn(benutzerId: string, schluessel: string, mappeId: string, max: number): Promise<void>;

  legeLinkAn(hash: string, benutzerId: string, zweck: Zweck, ablauf: Date): Promise<void>;
  holeLink(hash: string): Promise<Link | undefined>;
  /** Markiert den Link als benutzt; false, wenn er schon benutzt war. */
  verbraucheLink(hash: string): Promise<boolean>;
  loescheLinksVon(benutzerId: string): Promise<void>;

  /** Notfallcode vom Notfallblatt (#815): nur der Hash; null = keiner (noch kein Blatt oder schon benutzt). */
  notfallcode(): Promise<{ hash: string; erstellt: Date } | null>;
  setzeNotfallcode(hash: string | null): Promise<void>;
  /**
   * Notfallcode einlösen (#815), alles in einer Transaktion: nur wenn noch genau dieser Hash gilt, Code ungültig machen,
   * Passwort setzen, alle Sitzungen und Passwort-Links der Person löschen. false = inzwischen benutzt oder ersetzt –
   * bei zwei gleichzeitigen Anfragen mit demselben Code gewinnt nur eine.
   */
  loeseNotfallcodeEin(erwartet: string, benutzerId: string, passwortHash: string): Promise<boolean>;
}
