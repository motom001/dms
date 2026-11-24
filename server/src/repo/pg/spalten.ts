/** Spalten, die das PostgreSQL-Repo ausdrücklich liest (#367, #615): nie `d.*`, nie Volltext oder Suchtext in Listen. */

/**
 * Spalten eines Dokuments ohne `volltext` (#367): Der Volltext kann je Dokument viele KB bis MB groß
 * sein und wird nur über `volltext()`/`volltexte()` gelesen, nie in Listen.
 */
export const DOKUMENT_SPALTEN = [
  'id',
  'haushalt_id',
  'mappe_id',
  'register_key',
  'name',
  'mime',
  'groesse',
  'sha256',
  'anzeigbar',
  'erstellt',
  'erstellt_von',
  'ocr_stand',
  'ocr_info',
  'ocr_seiten',
  'ocr_zeit',
  'version',
  'herkunft',
  'archivnummer',
  'sprache',
  'weitere_sprachen',
  'seitensprachen',
  'teilen_hinweis_aus',
  'leerseiten',
  'anlage_zu',
  'anlage_nr',
  'eingang_nr',
  'original_email',
  'eingang_fuer',
  'name_original',
  'verkleinert',
] as const;
/**
 * Spalten einer Mappe ohne `suchtext` (#615): Der gefaltete Suchtext (Migration 055) ist nur für die Suche da und
 * etwa so groß wie Titel und Werte zusammen – Listen und „Mappe öffnen“ lesen ihn nie.
 */
export const MAPPEN_SPALTEN = [
  'id',
  'haushalt_id',
  'typ_id',
  'werte',
  'erstellt',
  'geaendert',
  'erstellt_von',
  'geaendert_von',
  'demo',
  'titel',
  'passt',
  'problem',
  'system_kennung',
  'vorgabe',
] as const;
/**
 * ANALYZE (#367) für Tabellen mit Volltext nur über diese Spalten: Ohne Spaltenliste rechnet PostgreSQL
 * auch die Statistik des Index `to_tsvector('german', volltext)` – über eine Minute bei 20.000 Dokumenten.
 */
export const STATISTIK_SPALTEN: Record<string, string> = {
  dokumente: 'id, haushalt_id, mappe_id, register_key, sha256, erstellt, erstellt_von, ocr_stand, archivnummer, weitere_sprachen',
  dokument_versionen: 'dokument_id, haushalt_id, sha256',
};
/** Spalten einer älteren Version ohne `volltext`. SQL steht im Code, nie in den Sprachdateien (#1264). */
export const VERSION_SPALTEN = 'dokument_id, haushalt_id, nummer, name, mime, groesse, sha256, anzeigbar, erstellt, erstellt_von, herkunft';
/**
 * Suchindex der Dokumente (#356, #400, Migration 048): gespeicherter tsvector mit Wortstämmen in der Sprache des
 * Dokuments, Umlauten gefaltet und Wörtern mit Bindestrich auch zusammengeschrieben; ein Trigger hält ihn aktuell.
 */
export const SUCHINDEX_TEXT = 'd.suchindex';
