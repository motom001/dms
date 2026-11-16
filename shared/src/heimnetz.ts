/**
 * Heimnetz-Erkennung an einer Stelle (#595).
 *
 * Zwei Fragen, eine Liste:
 * - **Ausnahme** (streng): Darf das DMS hier ohne TLS (`http://`) sprechen? Gilt für die Anmeldung über einen
 *   Anbieter (OIDC) und die Endpunkte eigener Postfach-Anbieter. Nur Adressen, die aus dem Internet gar nicht
 *   erreichbar sein können: localhost, private IPv4-Netze, private/lokale IPv6-Adressen, Namen ohne Punkt und
 *   die Endungen in {@link HEIMNETZ_ENDUNGEN}.
 * - **Hinweis** (weit): Sieht die Adresse des DMS nach Heimnetz aus (Vorschlag „E-Mail statt Abruf-Link“)?
 *   Zusätzlich verbreitete Router- und Gewohnheitsnamen ({@link HEIMNETZ_ENDUNGEN_HINWEIS}) und weitere
 *   nicht öffentliche Bereiche (169.254/16, 100.64/10, 0/8). Nie Grundlage einer Sicherheitsausnahme.
 *
 * „Gleicher Rechner“ (nur localhost, z. B. Rückruf-Adresse beim Postfach-Anbieter, Pakete von localhost,
 * Lasttest gegen eine Installation auf demselben Gerät) ist eine andere Frage und bleibt bei seinen Stellen.
 */

/**
 * Namensendungen, die als Heimnetz gelten – auch für `http://` ohne TLS. `home.arpa` ist die offizielle,
 * reservierte Endung für Heimnetze (RFC 8375). Nur echte Endungen zählen: `auth.home.arpa` ja,
 * `home.arpa.example.org` nein.
 */
export const HEIMNETZ_ENDUNGEN: readonly string[] = ['local', 'lan', 'internal', 'home.arpa'];

/** Für Hinweise zusätzlich: verbreitete, aber nicht reservierte Namen (Router, Gewohnheit). */
export const HEIMNETZ_ENDUNGEN_HINWEIS: readonly string[] = [
  ...HEIMNETZ_ENDUNGEN,
  'home',
  'intranet',
  'localdomain',
  'fritz.box',
  'localhost',
];

export type HeimnetzArt = 'ausnahme' | 'hinweis';

/** Rechnername einer Adresse, klein geschrieben, IPv6 ohne eckige Klammern; null, wenn keine gültige Adresse. */
export function rechnername(adresse: string | URL): string | null {
  try {
    const host = (typeof adresse === 'string' ? new URL(adresse) : adresse).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return host || null;
  } catch {
    return null;
  }
}

/** Endet der Name auf eine der Endungen (als ganzes Namensteil, nicht nur als Zeichenfolge)? */
export const endetAuf = (host: string, endungen: readonly string[]) => endungen.some((e) => host.endsWith(`.${e}`));

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Ist der Rechnername (ohne Klammern) eine Adresse oder ein Name im Heimnetz? */
export function heimnetzName(host: string, art: HeimnetzArt = 'ausnahme'): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return false;
  if (h === 'localhost') return true;
  const v4 = IPV4.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return true;
    return art === 'hinweis' && (a === 0 || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127));
  }
  if (h.includes(':')) return h === '::1' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h);
  if (!h.includes('.')) return true;
  return endetAuf(h, art === 'hinweis' ? HEIMNETZ_ENDUNGEN_HINWEIS : HEIMNETZ_ENDUNGEN);
}

/** Liegt die Adresse im Heimnetz? Ungültige Adressen: nein. */
export function imHeimnetz(adresse: string | URL, art: HeimnetzArt = 'ausnahme'): boolean {
  const host = rechnername(adresse);
  return !!host && heimnetzName(host, art);
}
