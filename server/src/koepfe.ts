/**
 * Sicherheits-Header für alle Antworten (#239): Schutz gegen Einbetten (Clickjacking),
 * MIME-Raten, verräterische Referrer; HSTS bei HTTPS; für die Oberfläche eine
 * Content-Security-Policy. Ein Reverse-Proxy muss dieselben Header nicht noch einmal setzen.
 *
 * Einbetten in fremde Seiten (z. B. ein Dashboard): DMS_EINBETTEN mit erlaubten Ursprüngen,
 * durch Leerzeichen oder Komma getrennt, z. B. „https://ha.example.org https://nas:8123“.
 */

export interface Einbetten { urspruenge: string[]; fehler: string | null }

const URSPRUNG = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i;

export function einbettenAus(wert: string | undefined): Einbetten {
  const teile = (wert ?? '').split(/[\s,]+/).map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  const gut = teile.filter((t) => URSPRUNG.test(t));
  const schlecht = teile.filter((t) => !URSPRUNG.test(t));
  return { urspruenge: gut, fehler: schlecht.length ? `DMS_EINBETTEN: ${schlecht.join(', ')} ist kein Ursprung wie https://beispiel.de oder http://nas:8123 – ignoriert.` : null };
}

/** Strenge Richtlinie für die Oberfläche: nur eigene Skripte; Inline-Styles erlaubt (Designs, React). */
const OBERFLAECHE = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self' data:", "connect-src 'self'", "frame-src 'self' blob:", "worker-src 'self' blob:",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'",
];

export interface Antwort { pfad: string; https: boolean; html: boolean; csp: boolean }

export function sicherheitsKoepfe(a: Antwort, e: Einbetten): Record<string, string> {
  const vorfahren = `frame-ancestors 'self'${e.urspruenge.map((u) => ` ${u}`).join('')}`;
  const k: Record<string, string> = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
    'permissions-policy': 'geolocation=(), microphone=(), payment=(), usb=()',
  };
  // X-Frame-Options kennt keine Liste – mit erlaubten Ursprüngen gilt nur frame-ancestors.
  if (!e.urspruenge.length) k['x-frame-options'] = 'SAMEORIGIN';
  if (a.https) k['strict-transport-security'] = 'max-age=31536000';
  if (!a.csp) {
    // Die Handbücher (/hilfe, mkdocs) brauchen eigene Inline-Skripte: dort nur frame-ancestors.
    if (a.html && !a.pfad.startsWith('/hilfe')) k['content-security-policy'] = [...OBERFLAECHE, vorfahren].join('; ');
    else k['content-security-policy'] = vorfahren;
  }
  return k;
}
