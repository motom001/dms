/**
 * Weg zurück zur Ablage aus „Mein Konto“ (#1302): die zuletzt besuchte Seite der Ablage, sonst ihre Startseite.
 *
 * App.tsx merkt sich jede Seite der Ablage; „‹ Zurück zur Ablage“ oben in „Mein Konto“ führt dorthin. Gemerkt wird für
 * diesen Tab (sessionStorage), damit der Weg auch nach dem Neuladen einer Konto-Seite stimmt.
 */
const SCHLUESSEL = 'dms.letzte-ablage';
let letzte: string | null = null;

export function merkeAblage(adresse: string) {
  letzte = adresse;
  try {
    sessionStorage.setItem(SCHLUESSEL, adresse);
  } catch {
    /* ohne Speicher: nur bis zum Neuladen */
  }
}

export function letzteAblage(): string {
  if (!letzte) {
    try {
      letzte = sessionStorage.getItem(SCHLUESSEL);
    } catch {
      /* ohne Speicher */
    }
  }
  return letzte?.startsWith('/ablage') ? letzte : '/ablage';
}
