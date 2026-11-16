/** Schnittstelle des Repos (#1278 aus repo/index.ts): Notfallkontakte, Aufgaben, Notizen und Änderungshistorie. */
import type { Notfallkontakt } from '../../../../shared/src/notfallkontakte';
import type { Aufgabe, FallOhneLeserecht, FallEnde, Notiz, Historienart, Historieneintrag } from '../../../../shared/src/model';
import type { HistorieAbfrage } from './typen';

/** Notfallkontakte (#812), Aufgaben (#54) auch bei Personen ohne Leserecht (#798), Notizen (#55), Änderungshistorie (#57). */
export interface RepoAufgaben {
  /* ---------- Notfallkontakte (#812) ---------- */
  /** Alle Notfallkontakte der Ablage, ältester zuerst. */
  notfallkontakte(): Promise<Notfallkontakt[]>;
  holeNotfallkontakt(id: string): Promise<Notfallkontakt | null>;
  /**
   * Neuen Kontakt anlegen – nur, solange es weniger als `max` gibt; auch zwei gleichzeitige Anfragen kommen nicht
   * darüber (PostgreSQL: Sperre je Haushalt in der Transaktion). false = Grenze erreicht.
   */
  legeNotfallkontaktAn(k: Notfallkontakt, max: number): Promise<boolean>;
  /** Angaben ändern (nicht Id, Eingetragen-von, Erstellt); false, wenn es ihn nicht gibt. */
  aendereNotfallkontakt(
    id: string,
    w: Pick<Notfallkontakt, 'name' | 'email' | 'telefon' | 'notiz' | 'antwortAn' | 'mailStand' | 'mailAm' | 'mailFehler'>,
  ): Promise<boolean>;
  /** Stand der Info-Mail setzen (ohne `geaendert` zu berühren); false, wenn es ihn nicht (mehr) gibt. */
  setzeNotfallkontaktMail(id: string, m: Pick<Notfallkontakt, 'mailStand' | 'mailAm' | 'mailFehler'>): Promise<boolean>;
  /** Löschen; liefert den gelöschten Kontakt (für die Mail) oder null. */
  loescheNotfallkontakt(id: string): Promise<Notfallkontakt | null>;

  /* ---------- Aufgaben (#54) ---------- */
  /** Passung → Aufgaben: offene „passt nicht“-Aufgabe anlegen oder Text nachziehen; passt sie, erledigt. */
  aufgabenZurPassung(liste: Array<{ id: string; problem: string | null }>): Promise<void>;
  legeAufgabeAn(a: Aufgabe): Promise<Aufgabe>;
  holeAufgabe(id: string): Promise<Aufgabe | undefined>;
  /** Aufgaben einer Mappe (offen und erledigt), neueste zuerst. */
  aufgabenVon(mappeId: string): Promise<Aufgabe[]>;
  /** Aufgaben mehrerer Mappen (#367), je Mappe wie `aufgabenVon`. */
  aufgabenVonMappen(mappeIds: string[]): Promise<Aufgabe[]>;
  /** Offene Aufgaben: alle, oder die eines Benutzers (mit admin auch die der Administratoren). */
  offeneAufgaben(f?: { benutzerId?: string; admin?: boolean; mappeIds?: string[] }): Promise<Aufgabe[]>;
  /** Erledigte Aufgaben (Werkbank), neueste zuerst. */
  erledigteAufgaben(max: number): Promise<Aufgabe[]>;
  erledigeAufgabe(id: string, von: string | null): Promise<void>;
  delegiereAufgabe(id: string, an: string | null): Promise<void>;
  /** Text einer offenen Aufgabe ersetzen – für gebündelte Benachrichtigungen, die hochzählen (#415, #422). */
  aendereAufgabeText(id: string, text: string): Promise<void>;
  /** Fristen (#129): alle Aufgaben der Art „frist“ (offen und erledigt), ggf. nur dieser Mappen. */
  fristAufgaben(mappeIds?: string[]): Promise<Aufgabe[]>;

  /* ---------- Aufgaben bei Personen ohne Leserecht (#798) ---------- */
  /** Fälle, neueste zuerst: nur offene oder alle; ggf. nur dieser Mappen. Mit Titel und Typ der Mappe, wenn es sie gibt. */
  faelleOhneLeserecht(f?: { offen?: boolean; mappeIds?: string[]; max?: number }): Promise<FallOhneLeserecht[]>;
  /** Neuen offenen Fall anlegen; gibt es für Aufgabe und Person schon einen offenen, passiert nichts (false). */
  legeFallAn(f: { id: string; aufgabeId: string; mappeId: string; benutzerId: string; aufgabentext: string }): Promise<boolean>;
  /** Offenen Fall beenden; false, wenn er schon beendet war (dann schreibt niemand ein zweites Mal in die Historie). */
  beendeFall(id: string, grund: FallEnde, zeit?: string | null): Promise<boolean>;
  /** Leserecht auf Zeit an einem offenen Fall vermerken; false, wenn er beendet ist oder schon eines hat. */
  gibLeserechtAufZeit(id: string, von: string | null): Promise<boolean>;
  /**
   * Wirksame Leserechte auf Zeit eines Benutzers: offener Fall mit Leserecht, dessen Aufgabe noch offen bei ihm liegt.
   * Mit Typ der Mappe für den Lesefilter.
   */
  leserechteAufZeit(
    benutzerId: string,
  ): Promise<
    Array<{ fallId: string; mappeId: string; typId: string; aufgabeId: string; aufgabentext: string; seit: string; von: string | null }>
  >;

  /* ---------- Notizen (#55) ---------- */
  notizen(mappeId: string): Promise<Notiz[]>;
  /**
   * Wo ist diese Mappe erwähnt (#889)? Notizen und Felder anderer Mappen mit `@[…](mappe:<id>)` bzw. `benutzer:<id>` –
   * je Stelle die Mappe, `stelle` (`notiz:<id>` oder Feldschlüssel) und wann sie zuletzt geändert wurde. Höchstens 200.
   */
  erwaehntIn(mappeId: string): Promise<Array<{ mappeId: string; stelle: string; am: string }>>;
  /** Notizen mehrerer Mappen (#367), je Mappe älteste zuerst. */
  notizenVon(mappeIds: string[]): Promise<Notiz[]>;
  holeNotiz(id: string): Promise<Notiz | undefined>;
  legeNotizAn(n: Notiz): Promise<Notiz>;
  aendereNotiz(id: string, text: string, von: string | null): Promise<Notiz>;
  loescheNotiz(id: string): Promise<void>;

  /* ---------- Änderungshistorie (#57) ---------- */
  historieSchreibe(
    e: Array<{ mappeId: string; benutzerId: string | null; art: Historienart; daten?: Historieneintrag['daten'] }>,
  ): Promise<void>;
  /**
   * Historie einer Mappe, neueste zuerst. Mit `arten` nur diese Arten (#800: was ein Register zeigt), mit `max`
   * höchstens so viele, mit `vor` (Id eines Eintrags) nur die Einträge danach in dieser Reihenfolge – zum seitenweisen Laden.
   */
  historie(mappeId: string, o?: HistorieAbfrage): Promise<Historieneintrag[]>;
  /**
   * Letzter Abruf derselben Datei durch dieselbe Person auf demselben Weg seit `seit` (#800, Rauschen unterdrücken):
   * Zeitpunkt oder null. `fassung`/`version` wie in den Daten des Eintrags.
   */
  letzterAbruf(
    mappeId: string,
    art: Historienart,
    benutzerId: string | null,
    dokumentId: string,
    fassung: string,
    version: number | null,
    seit: string,
  ): Promise<string | null>;
  /** Historie mehrerer Mappen (#367), je Mappe neueste zuerst. */
  historieVon(mappeIds: string[]): Promise<Historieneintrag[]>;
  /**
   * Berechnete Werte (#1034, kein Rauschen): der neueste Eintrag „geändert“ dieser Person (Dienstkonto eines Pakets) an
   * der Mappe seit `seit`, der nur berechnete Werte enthält (`daten.berechnet`) – zum Bündeln je Mappe und Tag.
   */
  letzteBerechnung(mappeId: string, benutzerId: string | null, seit: string): Promise<Historieneintrag | null>;
  /** Daten eines Eintrags ersetzen (#1034: gebündelte berechnete Werte); Zeitpunkt und Art bleiben. null = Eintrag entfernen. */
  historieDatenErsetzen(id: number, daten: Historieneintrag['daten'] | null): Promise<void>;
  /**
   * Post auflösen (#936): Historie, Notizen, Aufgaben (ohne „Post für dich“) und Erinnerungen der Mappe `von` gehören
   * danach der Mappe `nach`. Jeder Historieneintrag bekommt `ausPost: von` dazu, damit man sieht, woher er stammt.
   */
  uebertrageAnMappe(von: string, nach: string): Promise<{ historie: number; notizen: number; aufgaben: number; ablaeufe: number }>;
  /** Aufgelöste Post (#936): Id → Zielmappe aus dem Eintrag „Aufgelöst in …“ in ihrer Historie. */
  aufgeloesteIn(ids: string[]): Promise<Map<string, { ziel: string; zielTyp: string }>>;
  /** Alle Einträge einer Art, neueste zuerst (#668: Verzeichnis der Auskünfte). */
  historieArt(art: Historienart, max: number): Promise<Historieneintrag[]>;
  /** Löscht die Historie von Mappen, die vor diesem Zeitpunkt endgültig gelöscht wurden. */
  historieAufraeumen(vor: string): Promise<number>;
}
