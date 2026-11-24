/**
 * Mappentypen als Datei (#1315): einzelne Typen exportieren und in einer anderen Ablago-Installation einspielen – ohne
 * ein ganzes Paket. Die Typen stehen im Format von „Paket erstellen“ (Kennungen statt Ids); dazu Kopf und Abhängigkeiten.
 * Keine Mappen, keine Dokumente, keine Personen, keine Rechte.
 *
 * Eine Datei von außen ist nicht vertrauenswürdig (Ergänzung Sicherheit): Ablago prüft sie streng (nur bekannte Angaben,
 * Grenzen, Prüfmuster) und schwächt vorhandene Typen nie ab.
 */

export const TYPEN_DATEI_FORMAT = 'ablago-mappentypen';
export const TYPEN_DATEI_VERSION = 1;
/** Größe der Datei in Bytes. */
export const TYPEN_DATEI_MAX = 512 * 1024;
/** Mappentypen je Datei, Felder und Register je Typ. */
export const TYPEN_DATEI_TYPEN_MAX = 50;
export const TYPEN_DATEI_FELDER_MAX = 300;
export const TYPEN_DATEI_REGISTER_MAX = 50;
/** Jeder Text höchstens so viele Zeichen, jede Liste höchstens so viele Einträge, so tief verschachtelt. */
export const TYPEN_DATEI_TEXT_MAX = 4000;
export const TYPEN_DATEI_LISTE_MAX = 1000;
export const TYPEN_DATEI_TIEFE_MAX = 12;

/** Was in der Datei steht und die Export-Vorschau zeigt, damit man sieht, was hinausgeht (Ergänzung Sicherheit, Punkt 7). */
export interface TypenDateiInhalt {
  feld: string;
  art: 'werte' | 'vorgabe' | 'vorlage';
  text: string;
}

export interface TypenExportVorschau {
  typen: Array<{ id: string; name: string; kennung: string; felder: number; register: number; inhalte: TypenDateiInhalt[] }>;
  /** Eigene Typen, auf die die gewählten verweisen, die aber nicht dabei sind – sie müssen beim Empfänger schon da sein. */
  abhaengigkeiten: Array<{ id: string; name: string; kennung: string }>;
  /** Pakete, deren Typen die gewählten nutzen (Paket-Id → nötige Version). */
  pakete: Record<string, string>;
  hinweise: string[];
  probleme: string[];
}

export interface TypenExport {
  vorschau: TypenExportVorschau;
  /** Nur ohne Probleme: Dateiname und Inhalt (JSON). */
  datei: { name: string; inhalt: string } | null;
}

/** Eine Änderung an einem vorhandenen Typ; `abgelehnt`: schwächt ihn ab und wird nicht übernommen (rot in der Vorschau). */
export interface TypenAenderung {
  text: string;
  abgelehnt?: boolean;
}

interface TypenImportTyp {
  kennung: string;
  name: string;
  /** neu = gibt es hier noch nicht; vorhanden = gleiche Kennung, wird geändert; gleich = nichts zu tun. */
  stand: 'neu' | 'vorhanden' | 'gleich';
  aenderungen: TypenAenderung[];
}

export interface TypenImportVorschau {
  /** SHA-256 der Datei: Bestätigen gilt nur für genau diese Datei. */
  sha256: string;
  ablago: string;
  erstellt: string;
  typen: TypenImportTyp[];
  /** Was die Datei braucht und hier gefunden wurde (Kennung → Name). */
  abhaengigkeiten: Array<{ kennung: string; name: string }>;
  hinweise: string[];
  /** Mit Problemen lässt sich nichts einspielen. */
  probleme: string[];
}

export interface TypenImportErgebnis {
  neu: string[];
  geaendert: string[];
  abgelehnt: number;
}
