/**
 * Veraltete Oberfläche (#933): Nach einem Update läuft in einem offenen Fenster noch die alte Oberfläche gegen den
 * neuen Server. Erkannt wird das am Stand aus /api/gesundheit (#122) und daran, dass eine Datei der Oberfläche
 * fehlt – ein nachgeladener Skript-Teil oder ein Stylesheet (seit #932 mit 404 statt der Startseite).
 *
 * Hier nur die Regeln als reine Funktionen (prüfbar ohne Browser); das Anbinden steht in web/src/veraltet.ts.
 */

/** Höchstens so oft lädt die Oberfläche sich selbst neu – Schutz gegen eine Schleife, falls das Neuladen nicht hilft. */
export const NEU_LADEN_ABSTAND_MS = 60_000;

/** Darf die Seite sich jetzt selbst neu laden? `zuletzt`: Zeitpunkt des letzten eigenen Neuladens (oder null). */
export function darfNeuLaden(zuletzt: number | null, jetzt: number): boolean {
  if (zuletzt === null || !Number.isFinite(zuletzt)) return true;
  // Uhr zurückgestellt: lieber einmal neu laden als nie wieder.
  if (zuletzt > jetzt) return true;
  return jetzt - zuletzt >= NEU_LADEN_ABSTAND_MS;
}

/** Was vom Element eines Ladefehlers gebraucht wird (`<link>`, `<script>`). */
export interface Ladeziel {
  tagName?: string;
  rel?: string;
  href?: string;
  src?: string;
}

/**
 * Ein Ladefehler (Ereignis `error` am Element): Gehört er zu einer Datei der Oberfläche? Nur Stylesheets, Skripte und
 * vorgeladene Module vom eigenen Server unter /assets/ – fremde Inhalte, Bilder und Vorschauen zählen nicht.
 */
export function istOberflaechenDatei(el: Ladeziel | null | undefined, ursprung: string): boolean {
  if (!el?.tagName) return false;
  const tag = el.tagName.toUpperCase();
  let adresse: string | undefined;
  if (tag === 'LINK') {
    const rel = (el.rel ?? '').toLowerCase().split(/\s+/);
    if (!rel.includes('stylesheet') && !rel.includes('modulepreload') && !rel.includes('preload')) return false;
    adresse = el.href;
  } else if (tag === 'SCRIPT') adresse = el.src;
  else return false;
  if (!adresse) return false;
  try {
    const u = new URL(adresse, ursprung);
    return u.origin === new URL(ursprung).origin && u.pathname.startsWith('/assets/');
  } catch {
    return false;
  }
}

/**
 * Soll die Seite ohne Rückfrage neu laden? Nur, wo nichts Wichtiges verloren geht (Einrichtungsassistent: der Stand
 * liegt im Browser), nie während „Jetzt einrichten“ läuft – und höchstens einmal je Minute.
 */
export function automatischNeuLaden(o: { neueVersion: boolean; laeuft: boolean; zuletzt: number | null; jetzt: number }): boolean {
  return o.neueVersion && !o.laeuft && darfNeuLaden(o.zuletzt, o.jetzt);
}
