import type { Aufgabe, Ausschnitt, Dokument, Historienart, Historieneintrag, Mappe, Notiz, MappenBezug, Mappentyp, MappentypDaten, OcrStandArt, Systemtyp, Werte } from '../../shared/src/model';
import type { Klausel, Sicht, SichtDaten } from '../../shared/src/sichten';

export interface Verweis { feldKey: string; zielId: string }
/** Sortierung, wie sie das Repo braucht: Art der Spalte (für den richtigen Vergleich) und ggf. Feldschlüssel. */
export interface SortierungIntern {
  art: 'titel' | 'typ' | 'erstellt' | 'geaendert' | 'erstelltVon' | 'geaendertVon' | 'text' | 'zahl' | 'betrag' | 'datum' | 'janein';
  key?: string;
  absteigend: boolean;
}
export interface SeitenAnfrage {
  /** Mappen dieses Typs … */
  typId?: string;
  /** … oder der Eingang dieses Benutzers (nicht passende eigene Mappen; ohne Ersteller beim Admin). */
  eingang?: { benutzerId: string; admin: boolean };
  /** … oder die Mappen einer Sicht (#38): ODER der Klauseln, Bedingungen aufgelöst. */
  klauseln?: Klausel[];
  /** Suche in Titel und Werten. */
  suche?: string;
  /** Suche auch im Volltext der Dokumente (deutsche Volltextsuche, #45). */
  volltext?: boolean;
  /** Suche auch in Notizen (#55). */
  notizen?: boolean;
  /** Reihenfolge; ohne: nach Titel. */
  sortierung?: SortierungIntern;
  von: number;
  anzahl: number;
}
export interface NeueMappe {
  id: string; typId: string; werte: Werte; verweise: Verweis[]; titel: string; benutzerId: string | null; demo: boolean;
}

/** Ergebnis der Texterkennung für ein Dokument. */
export interface OcrErgebnis { stand: OcrStandArt; text?: string | null; info?: string | null; seiten?: number | null }
export type OcrZaehler = Record<OcrStandArt, number>;

export interface Rueckverweis { quelleId: string; quelleTypId: string; feldKey: string; titel: string }

/** Eine Mappe im Papierkorb (#43), mit ihren Werten, wie sie beim Löschen waren. */
export interface PapierkorbEintrag {
  id: string; typId: string; titel: string; werte: Werte; demo: boolean;
  erstellt: string; erstelltVon: string | null; geaendert: string; geaendertVon: string | null;
  geloescht: string; geloeschtVon: string | null;
  /** Anzahl Dokumente, die mit ihr im Papierkorb liegen. */
  dokumente: number;
}
export interface PapierkorbFilter {
  /** Nur, was dieser Benutzer gelöscht hat. */
  von?: string;
  /** Nur, was vor diesem Zeitpunkt gelöscht wurde. */
  vor?: string;
  typId?: string;
}

/**
 * Datenzugriff für einen Haushalt. Die Fachlogik (Dienst) kennt nur diese
 * Schnittstelle; PostgreSQL und der Arbeitsspeicher (für Tests) setzen sie um.
 */
export interface Repo {
  listeTypen(): Promise<Mappentyp[]>;
  holeTyp(id: string): Promise<Mappentyp | undefined>;
  /** `system` nur für die Systemtypen, die der Server selbst anlegt. */
  legeTypAn(id: string, d: MappentypDaten, system?: Systemtyp): Promise<Mappentyp>;
  /** Aktualisiert den Typ und entfernt Verweise aus Feldern, die keine Referenzfelder mehr sind. */
  aendereTyp(id: string, d: MappentypDaten): Promise<Mappentyp>;
  loescheTyp(id: string): Promise<void>;
  zaehleMappen(typId: string): Promise<number>;

  listeMappen(typId?: string): Promise<Mappe[]>;
  holeMappe(id: string): Promise<Mappe | undefined>;
  legeMappeAn(id: string, typId: string, werte: Werte, verweise: Verweis[], benutzerId: string | null, demo?: boolean, systemKennung?: string | null): Promise<Mappe>;
  /** Die Mappe mit dieser Systemkennung (z. B. rolle:admin). */
  holeSystemMappe(kennung: string): Promise<Mappe | undefined>;
  aendereMappe(id: string, werte: Werte, verweise: Verweis[], benutzerId: string | null): Promise<Mappe>;
  /** Viele neue Mappen auf einmal (Demo-Daten): eine Transaktion, Titel schon berechnet. */
  legeMappenAn(liste: NeueMappe[]): Promise<void>;
  loescheMappe(id: string): Promise<void>;

  /** Mehrere Mappen auf einmal (unbekannte Ids fehlen im Ergebnis). */
  holeMappen(ids: string[]): Promise<Mappe[]>;
  /** Gespeicherte Titel (leer, wenn noch nicht berechnet). */
  titelVon(ids: string[]): Promise<Map<string, string>>;
  setzeTitel(liste: Array<{ id: string; titel: string }>): Promise<void>;
  /** Ids der Mappen, die auf eine der angegebenen verweisen. */
  quellenVon(zielIds: string[]): Promise<string[]>;
  /** Titel und Typ je Mappe (unbekannte Ids fehlen). */
  bezuege(ids: string[]): Promise<Map<string, MappenBezug>>;
  /** Eine Seite einer Sicht, sortiert nach Titel. */
  seite(o: SeitenAnfrage): Promise<{ gesamt: number; mappen: Mappe[]; ausschnitte?: Record<string, Ausschnitt> }>;
  /** Zähler für die Sichten. */
  zaehler(benutzerId: string, admin: boolean): Promise<{ typen: Map<string, { anzahl: number; unpassend: number; demo: number }>; eingang: number }>;
  /** Anzahl Mappen je Klauselliste (eine je Sicht), in derselben Reihenfolge. */
  zaehleKlauseln(liste: Klausel[][]): Promise<number[]>;

  listeSichten(): Promise<Sicht[]>;
  legeSichtAn(id: string, d: SichtDaten): Promise<Sicht>;
  aendereSicht(id: string, d: SichtDaten): Promise<Sicht>;
  loescheSicht(id: string): Promise<void>;
  /** problem null = passt. */
  setzePassung(liste: Array<{ id: string; problem: string | null }>): Promise<void>;
  /** Ids der Mappen dieses Typs, die nicht passen. */
  unpassende(typId: string): Promise<string[]>;
  /** Typen mit noch nicht geprüften Mappen. */
  typenOhnePassung(): Promise<string[]>;
  /** Anzahl Mappen mit Wert je Feldschlüssel. */
  belegung(typId: string): Promise<Record<string, number>>;
  /** Ids der Mappen, deren Titel noch nie berechnet wurde. */
  ohneTitel(): Promise<string[]>;

  /** Typ-Id je existierender Mappe dieses Haushalts. */
  typenVon(ids: string[]): Promise<Map<string, string>>;
  /** Eine andere Mappe desselben Typs mit gleichem Wert (Groß-/Kleinschreibung egal). */
  findeDoppelt(typId: string, feldKey: string, wert: string, ausser?: string): Promise<Mappe | undefined>;
  rueckverweise(zielId: string): Promise<Rueckverweis[]>;

  listeDokumente(mappeId: string): Promise<Dokument[]>;
  holeDokument(id: string): Promise<Dokument | undefined>;
  legeDokumentAn(d: Dokument): Promise<Dokument>;
  loescheDokument(id: string): Promise<void>;
  /** Andere Dokumente mit derselben Datei (gleicher Inhalt). */
  dokumenteMitSha(sha256: string): Promise<Dokument[]>;
  /** Anzahl Dokumente je Register-Schlüssel in Mappen dieses Typs. */
  dokumenteJeRegister(typId: string): Promise<Map<string, number>>;

  /** Demo-Mappen je Typ. */
  zaehleDemo(): Promise<Map<string, number>>;
  /** Anzahl echter Mappen, die auf Demo-Mappen verweisen. */
  echteVerweiseAufDemo(): Promise<number>;
  /** Löscht alle Demo-Mappen (auch im Papierkorb); liefert ihre Anzahl und die Prüfwerte ihrer Dateien. */
  loescheDemo(): Promise<{ anzahl: number; dateien: string[] }>;

  /* ---------- Papierkorb (#43) ---------- */
  /** Zieht die Mappe samt Verweisen und Dokumenten in den Papierkorb. */
  legeInPapierkorb(id: string, benutzerId: string | null): Promise<void>;
  papierkorb(f?: PapierkorbFilter): Promise<PapierkorbEintrag[]>;
  holeAusPapierkorb(id: string): Promise<PapierkorbEintrag | undefined>;
  /** Legt die Mappe wieder an; Verweise auf Mappen, die es nicht mehr gibt, entfallen (Anzahl). */
  stelleWiederHer(id: string): Promise<{ verweiseEntfallen: number }>;
  /** Löscht endgültig; liefert die Prüfwerte der Dateien, die dabei frei werden könnten. */
  leerePapierkorb(ids: string[]): Promise<string[]>;
  zaehlePapierkorb(von?: string): Promise<number>;
  /** Hängt noch ein Dokument (lebend oder im Papierkorb) an dieser Datei? */
  dateiBenutzt(sha256: string): Promise<boolean>;

  /* ---------- Texterkennung (#45) ---------- */
  /** Dokumente in die Warteschlange stellen. */
  ocrEinreihen(ids: string[]): Promise<void>;
  /** Nimmt das älteste wartende Dokument und setzt es auf „läuft“. */
  ocrNaechster(): Promise<Dokument | undefined>;
  ocrSetze(id: string, e: OcrErgebnis): Promise<void>;
  /** Fertiger Volltext eines anderen Dokuments mit derselben Datei. */
  ocrVonSha(sha256: string, ausser: string): Promise<{ text: string; seiten: number | null; info: string | null } | undefined>;
  /** Nach einem Neustart: „läuft“ → „wartet“. */
  ocrZurueckstellen(): Promise<number>;
  ocrZaehler(): Promise<OcrZaehler>;
  /** Dokumente ohne Volltext (noch nie erkannt) mit Typ und Register ihrer Mappe. */
  ocrOhneVolltext(): Promise<Array<{ id: string; typId: string; registerKey: string }>>;
  volltext(id: string): Promise<string | null>;

  /* ---------- Aufgaben (#54) ---------- */
  /** Passung → Aufgaben: offene „passt nicht“-Aufgabe anlegen oder Text nachziehen; passt sie, erledigt. */
  aufgabenZurPassung(liste: Array<{ id: string; problem: string | null }>): Promise<void>;
  legeAufgabeAn(a: Aufgabe): Promise<Aufgabe>;
  holeAufgabe(id: string): Promise<Aufgabe | undefined>;
  /** Aufgaben einer Mappe (offen und erledigt), neueste zuerst. */
  aufgabenVon(mappeId: string): Promise<Aufgabe[]>;
  /** Offene Aufgaben: alle, oder die eines Benutzers (mit admin auch die der Administratoren). */
  offeneAufgaben(f?: { benutzerId?: string; admin?: boolean; mappeIds?: string[] }): Promise<Aufgabe[]>;
  /** Erledigte Aufgaben (Werkbank), neueste zuerst. */
  erledigteAufgaben(max: number): Promise<Aufgabe[]>;
  erledigeAufgabe(id: string, von: string | null): Promise<void>;
  delegiereAufgabe(id: string, an: string | null): Promise<void>;

  /* ---------- Notizen (#55) ---------- */
  notizen(mappeId: string): Promise<Notiz[]>;
  holeNotiz(id: string): Promise<Notiz | undefined>;
  legeNotizAn(n: Notiz): Promise<Notiz>;
  aendereNotiz(id: string, text: string, von: string | null): Promise<Notiz>;
  loescheNotiz(id: string): Promise<void>;

  /* ---------- Änderungshistorie (#57) ---------- */
  historieSchreibe(e: Array<{ mappeId: string; benutzerId: string | null; art: Historienart; daten?: Historieneintrag['daten'] }>): Promise<void>;
  historie(mappeId: string): Promise<Historieneintrag[]>;
  /** Löscht die Historie von Mappen, die vor diesem Zeitpunkt endgültig gelöscht wurden. */
  historieAufraeumen(vor: string): Promise<number>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const istUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);
