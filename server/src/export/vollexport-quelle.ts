/** Vollexport (#1278 aus vollexport.ts): Formatversion, Tabellen, Optionen und die Quelle der Daten. */
import { Readable } from 'node:stream';
import { t } from '../sprache/sprache';
import type { Mappentyp, Mappe, Dokument, DokumentVersion, Notiz, Aufgabe, Vertretung } from '../../../shared/src/model';
import type { Sicht } from '../../../shared/src/sichten';
import type { Nummernkreis } from '../../../shared/src/nummernkreis';
import type { PapierkorbEintrag } from '../repo';
import type { LoeschEintrag } from '../../../shared/src/loeschprotokoll';
import type { MappenAblauf } from '../../../shared/src/ablaufvorlagen';

export const FORMATVERSION = 1;

/**
 * Wo jede Tabelle der Datenbank im Export steht – oder warum nicht. Ein Test vergleicht das mit den
 * Tabellen der Datenbank: Eine neue Tabelle ohne Eintrag hier lässt ihn fehlschlagen.
 */
export const EXPORT_TABELLEN: Record<string, string> = {
  haushalte: t('meldungen.vollexport.manifest-json-haushalt'),
  mappentypen: 'struktur/mappentypen.json',
  sichten: 'struktur/sichten.json',
  nummernkreise: 'struktur/nummernkreise.json',
  pakete: 'struktur/pakete.json',
  designs: 'struktur/designs.json',
  synonyme: t('meldungen.vollexport.struktur-synonyme-json-356'),
  notfallkontakte: t('meldungen.vollexport.struktur-notfallkontakte-json'),
  automatisierungen: t('meldungen.vollexport.struktur-automatisierungen-json-674'),
  fassungen: t('meldungen.vollexport.struktur-fassungen-json'),
  automatisierung_laeufe: t('meldungen.vollexport.nicht-enthalten-laeufe-der'),
  automatisierung_aufrufe: t('meldungen.vollexport.nicht-enthalten-aufrufe'),
  automatisierung_ausgang: t('meldungen.vollexport.nicht-enthalten-ausgang'),
  automatisierung_geheimnisse: t('meldungen.vollexport.nicht-enthalten-aussen-geheimnisse'),
  benutzer: t('meldungen.vollexport.struktur-benutzer-json-ohne'),
  benutzer_einstellungen: t('meldungen.vollexport.struktur-benutzer-json-einstellungen'),
  mappen: t('meldungen.vollexport.daten-typ-csv-jsonl'),
  verweise: 'daten/verweise.csv',
  dokumente: t('meldungen.vollexport.daten-dokumente-csv-und'),
  dokument_versionen: t('meldungen.vollexport.daten-dokumente-csv-und-2'),
  notizen: 'daten/notizen.jsonl',
  aufgaben: t('meldungen.vollexport.daten-aufgaben-jsonl-und'),
  mappen_ablaeufe: t('meldungen.vollexport.daten-ablaeufe-jsonl-und'),
  ablaufvorlagen: t('meldungen.vollexport.struktur-ablaufvorlagen-json'),
  ablauf_verlauf: t('meldungen.vollexport.nicht-enthalten-ablauf-verlauf'),
  historie: 'daten/historie.jsonl',
  favoriten: 'daten/favoriten.csv',
  papierkorb: 'daten/papierkorb.jsonl',
  papierkorb_dokumente: t('meldungen.vollexport.daten-papierkorb-dokumente-jsonl'),
  loeschprotokoll: t('meldungen.vollexport.daten-loeschprotokoll-csv-470'),
  vertretungen: 'daten/vertretungen.jsonl',
  aufgaben_ohne_leserecht: t('meldungen.vollexport.nicht-enthalten-aufgaben-bei'),
  fehlermeldungen: t('meldungen.vollexport.nicht-enthalten-gemeldete-fehler'),
  langlaeufer: t('meldungen.vollexport.nicht-enthalten-messwerte-langsamer'),
  extern_aufrufe: t('meldungen.vollexport.nicht-enthalten-messwerte-extern'),
  extern_monate: t('meldungen.vollexport.nicht-enthalten-messwerte-extern'),
  einstellungen: t('meldungen.vollexport.nicht-enthalten'),
  api_schluessel: t('meldungen.vollexport.nicht-enthalten-geheimnisse'),
  paket_code: t('meldungen.vollexport.nicht-enthalten-code-installierter'),
  paket_sprachen: t('meldungen.vollexport.nicht-enthalten-sprachpakete'),
  paket_ereignisse: t('meldungen.vollexport.nicht-enthalten-ereignisse-fuer'),
  paket_verlauf: t('meldungen.vollexport.nicht-enthalten-verlauf-pakete'),
  nachweis_journal: t('meldungen.vollexport.nicht-enthalten-nachweis-journal'),
  nachweis_zaehler: t('meldungen.vollexport.nicht-enthalten-nachweis-journal'),
  passwort_links: t('meldungen.vollexport.nicht-enthalten-geheimnisse'),
  notfallcode: t('meldungen.vollexport.nicht-enthalten-notfallcode-vom'),
  auskunft_links: t('meldungen.vollexport.nicht-enthalten-abruf-links'),
  sitzungen: t('meldungen.vollexport.nicht-enthalten-anmeldungen'),
  kurzzustand: t('meldungen.vollexport.nicht-enthalten-zustand-zwischen'),
  erkennungen: t('meldungen.vollexport.nicht-enthalten-ergebnis-der'),
  suchwoerter: t('meldungen.vollexport.nicht-enthalten-woerterverzeichnis'),
  suchwoerter_eingang: t('meldungen.vollexport.nicht-enthalten-neue-woerter'),
  fristtermine: t('meldungen.vollexport.nicht-enthalten-fristtermine'),
  mappen_hinweise: t('meldungen.vollexport.nicht-enthalten-hinweise'),
  vektoren: t('meldungen.vollexport.nicht-enthalten-vektoren-zu'),
  gesehen: t('meldungen.vollexport.nicht-enthalten-wann-ein'),
  zaehlerstaende: t('meldungen.vollexport.nicht-enthalten-stand-der'),
  haushaltsstand: t('meldungen.vollexport.nicht-enthalten-stand-der-2'),
  ereignisse: t('meldungen.vollexport.nicht-enthalten-ausgangskorb-des'),
  frist_meldungen: t('meldungen.vollexport.nicht-enthalten-welche-fristen'),
  schema_migrationen: t('meldungen.vollexport.nicht-enthalten-stand-der-3'),
};

/** Kontaktfelder für vCard (#254): Feldschlüssel je Angabe; vom Administrator bestätigt. */
export interface KontaktZuordnung {
  name: string;
  email?: string;
  telefon?: string;
  adresse?: string;
  firma?: string;
  notiz?: string;
}
export interface ExportOptionen {
  /** Passwortfelder im Klartext als passwoerter.csv (Bitwarden-Format) – nur mit ausdrücklicher Bestätigung. */
  passwoerter?: boolean;
  /** Technische Protokolle (Arbeitsspeicher) mitnehmen. */
  protokolle?: boolean;
  /** vCard je Mappentyp: Typ-Id → Zuordnung. */
  kontakte?: Record<string, KontaktZuordnung>;
  /** Eigener Text für LIESMICH.md (Auskunft, #396); Standard: der des Vollexports. */
  liesmich?: string;
  /** Zweck im Manifest (Auskunft, #396); das Format bleibt dms-vollexport. */
  zweck?: string;
}

export interface ExportQuelle {
  mandant: string;
  version: string;
  typen(): Promise<Mappentyp[]>;
  sichten(): Promise<Sicht[]>;
  nummernkreise(): Promise<Nummernkreis[]>;
  /** Installierte Pakete (#188). */
  pakete(): Promise<unknown[]>;
  designs(): Promise<unknown[]>;
  /** Gleichbedeutende Wörter der Suche (#356); fehlt bei Auskunft und persönlichem Export. */
  synonyme?(): Promise<unknown[]>;
  /** Region der Ablage (#726); fehlt bei Auskunft und persönlichem Export. */
  region?(): Promise<unknown>;
  /** Merkmale der Ablage (#1032), z. B. „beruflich genutzt“; fehlt bei Auskunft und persönlichem Export. */
  merkmale?(): Promise<unknown>;
  /** Eigene Organisation (#995): Wahl für Auskünfte, freigegebene Rollen, Notizen; fehlt bei Auskunft und persönlichem Export. */
  organisation?(): Promise<unknown>;
  /** Automatisierungen mit Änderungsverlauf (#674); fehlt bei Auskunft und persönlichem Export. */
  automatisierungen?(): Promise<unknown[]>;
  /**
   * Notfallkontakte (#812): im Vollexport alle; im persönlichen Export die selbst eingetragenen; in einer Auskunft die,
   * deren Adresse in den aufgenommenen Mappen steht. Fehlt, wenn es keine gibt.
   */
  notfallkontakte?(): Promise<unknown[]>;
  /** Eigene Rundgänge und Tipps, Anpassungen und An/aus aus der Werkbank (#941, #942); fehlt bei Auskunft und persönlichem Export. */
  entdecken?(): Promise<unknown>;
  /** Fassungen der Werkbank (#1006) samt Löschvermerken; fehlt bei Auskunft und persönlichem Export. */
  fassungen?(): Promise<unknown[]>;
  mappen(typId: string): Promise<Mappe[]>;
  papierkorb(): Promise<PapierkorbEintrag[]>;
  /** Einzeln gelöschte Dokumente (#344); fehlt bei älteren Quellen. */
  papierkorbDokumente?(): Promise<unknown[]>;
  /** Löschprotokoll (#470), älteste zuerst; fehlt bei Auskunft und persönlichem Export. */
  loeschprotokoll?(): Promise<LoeschEintrag[]>;
  /*
   * Gebündelt je Paket von Mappen bzw. Dokumenten (#367): ein Zugriff je Paket statt je Mappe
   * oder Dokument. Die Reihenfolge innerhalb einer Mappe bzw. eines Dokuments zählt, die zwischen
   * ihnen nicht.
   */
  dokumente(mappeIds: string[]): Promise<Dokument[]>;
  versionen(dokumentIds: string[]): Promise<DokumentVersion[]>;
  /** Volltexte; Dokumente ohne fehlen. */
  volltexte(dokumentIds: string[]): Promise<Map<string, string>>;
  datei(sha256: string): Promise<Readable | Buffer>;
  /** Umgewandelte Fassung eines Pakets (#577) für Dateitypen, die das DMS nicht selbst liest; fehlt bei älteren Quellen. */
  fassung?(sha256: string): Promise<{ mime: string; inhalt: Buffer } | null>;
  /** Archivfassung (PDF/A) eines Pakets (#631); `imOriginal`: das Original ist schon PDF/A. Fehlt bei der Auskunft. */
  archivfassung?(sha256: string): Promise<{ inhalt: Buffer | null } | { imOriginal: true } | null>;
  notizen(mappeIds: string[]): Promise<Notiz[]>;
  aufgaben(mappeIds: string[]): Promise<Aufgabe[]>;
  /** Geplante Mappen-Abläufe (#1044; früher freie Erinnerungen). */
  ablaeufe(): Promise<MappenAblauf[]>;
  /** Automatisierungsvorlagen mit Änderungsverlauf (#1044); fehlt beim persönlichen Export. */
  ablaufvorlagen?(): Promise<unknown[]>;
  historie(mappeIds: string[]): Promise<Array<{ mappeId: string }>>;
  favoriten(): Promise<Array<{ benutzerId: string; mappeId: string }>>;
  benutzer(): Promise<{ benutzer: Array<Record<string, unknown>>; vertretungen: Vertretung[] }>;
  passwort(wert: unknown): string | null;
  protokoll(): unknown[];
  pdf(titel: string, mappen: Mappe[], typ: Mappentyp, uebersicht: boolean): Promise<Buffer>;
}
