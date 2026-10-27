import type { Dokument, Mappe, Mappentyp, MappentypDaten, Werte } from '../../shared/src/model';

export interface Verweis { feldKey: string; zielId: string }
export interface Rueckverweis { quelleId: string; quelleTypId: string; feldKey: string }

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
  legeMappeAn(id: string, typId: string, werte: Werte, verweise: Verweis[], benutzerId: string | null): Promise<Mappe>;
  aendereMappe(id: string, werte: Werte, verweise: Verweis[], benutzerId: string | null): Promise<Mappe>;
  loescheMappe(id: string): Promise<void>;

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
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const istUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);
