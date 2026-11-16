import type { Datei } from './routen-typen';

/*
 * Kopfzeilen für ausgelieferte Dateien (#1278, Schritt 5b; vorher in http/routen.ts): für http.ts und das WebDAV-Laufwerk,
 * ohne dass diese http/routen.ts und darüber alle Fachrouten einbinden.
 */

/** Richtlinie für ausgelieferte Dateien außer PDFs: nichts nachladen, nichts ausführen (Sandbox). */
export const DATEI_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";
/** Kopfzeilen für eine ausgelieferte Datei – so, dass sie nie als Teil der Anwendung ausgeführt wird. */
export function dateiKoepfe(d: Datei): Record<string, string> {
  const ascii = d.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const k: Record<string, string> = {
    'content-type': d.mime,
    'content-length': String(d.groesse),
    'content-disposition': `${d.anzeigen ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.name)}`,
    'x-content-type-options': 'nosniff',
    'cache-control': 'private, max-age=0, must-revalidate',
  };
  // PDFs brauchen den eingebauten Betrachter des Browsers; alles andere läuft in einer Sandbox. Technische Werte stehen
  // im Code, nie in den Sprachdateien (#1264) – eine Übersetzung darf die Sandbox nicht verlieren.
  if (d.mime !== 'application/pdf') k['content-security-policy'] = DATEI_CSP;
  return k;
}
