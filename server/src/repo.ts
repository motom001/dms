import type { Dokument, Mappe, MappenBezug, Mappentyp, MappentypDaten, Werte } from '../../shared/src/model';

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
  /** Suche in Titel und Werten. */
  suche?: string;
  /** Reihenfolge; ohne: nach Titel. */
  sortierung?: SortierungIntern;
  von: number;
  anzahl: number;
}
export interface NeueMappe {
  id: string; typId: string; werte: Werte; verweise: Verweis[]; titel: string; benutzerId: string | null; demo: boolean;
}
export interface Rueckverweis { quelleId: string; quelleTypId: string; feldKey: string; titel: string }

/**
 * Datenzugriff für einen Haushalt. Die Fachlogik (Dienst) kennt nur diese
 * Schnittstelle; PostgreSQL und der Arbeitsspeicher (für Tests) setzen sie um.
 */
export interface Repo {
  listeTypen(): Promise<Mappentyp[]>;
  holeTyp(id: string): Promise<Mappentyp | undefined>;
  legeTypAn(id: string, d: MappentypDaten): Promise<Mappentyp>;
  /** Aktualisiert den Typ und entfernt Verweise aus Feldern, die keine Referenzfelder mehr sind. */
  aendereTyp(id: string, d: MappentypDaten): Promise<Mappentyp>;
  loescheTyp(id: string): Promise<void>;
  zaehleMappen(typId: string): Promise<number>;

  listeMappen(typId?: string): Promise<Mappe[]>;
  holeMappe(id: string): Promise<Mappe | undefined>;
  legeMappeAn(id: string, typId: string, werte: Werte, verweise: Verweis[], benutzerId: string | null, demo?: boolean): Promise<Mappe>;
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
  seite(o: SeitenAnfrage): Promise<{ gesamt: number; mappen: Mappe[] }>;
  /** Zähler für die Sichten. */
  zaehler(benutzerId: string, admin: boolean): Promise<{ typen: Map<string, { anzahl: number; unpassend: number; demo: number }>; eingang: number }>;
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
  /** Löscht alle Demo-Mappen; liefert ihre Anzahl und die Prüfwerte ihrer Dateien. */
  loescheDemo(): Promise<{ anzahl: number; dateien: string[] }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const istUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);
