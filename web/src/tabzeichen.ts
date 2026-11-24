import { useEffect, useRef } from 'react';
import { mappenApi } from './api/mappen';
import type { Zaehler } from './api/werkbank';

/**
 * Neues im Tab (#922, freigegebene Stufe 1): Liegt Ablago im Hintergrund-Tab, sieht man trotzdem, dass etwas Neues da
 * ist – die Zahl steht vorn im Titel des Tabs („(3) Ablago – Ablage“), das Symbol des Tabs trägt einen Punkt.
 *
 * - **Nur Zahlen, nie Inhalte:** gezählt werden „Zu erledigen“ und „Neue Post“ der angemeldeten Person – dieselben
 *   Zahlen wie in der Seitenleiste. Kein Titel einer Mappe, kein Absender verlässt die Seite (Mission 1).
 * - **Nur solange der Tab offen ist,** ohne Push-Dienst Dritter. Im Hintergrund fragt Ablago einmal je Minute den Stand
 *   der Ablage nach (wie das Nachladen #919, das nur im sichtbaren Tab läuft) und frischt die Zahlen bei einer Änderung auf.
 * - Nicht in Vertretung (die Zahlen gehörten der vertretenen Person).
 * - Abschaltbar je Konto (#1625, Mein Konto → Darstellung, Vorgabe an): aus heißt keine Zahl, kein Punkt und keine
 *   Abfrage im Hintergrund dafür.
 * - Die echte Benachrichtigung des Browsers (Stufe 2) ist noch nicht freigegeben und fehlt hier bewusst.
 */

/** Was im Tab als neu zählt: Zu erledigen und Neue Post. */
export function tabZahl(z: Pick<Zaehler, 'eingang' | 'sichten' | 'neuePost'>): number {
  return (z.eingang ?? 0) + (z.neuePost ? (z.sichten?.[z.neuePost] ?? 0) : 0);
}

/** Persönliche Einstellung (#1625): Schlüssel und ob Neues im Tab erscheint – fehlt sie, ist es an. */
export const TAB_NEUES = 'tab_neues';
export const tabNeuesAn = (einstellungen: Record<string, unknown>) => einstellungen[TAB_NEUES] !== false;

/** Titel des Tabs mit der Zahl davor („(3) Ablago – Ablage“), ab 100 „(99+)“; ohne Neues unverändert. */
export const tabTitel = (titel: string, zahl: number) => (zahl > 0 ? `(${zahl > 99 ? '99+' : zahl}) ${titel}` : titel);

/** Takt im Hintergrund: einmal je Minute (im sichtbaren Tab fragt das Nachladen alle 10–15 s). */
export const HINTERGRUND_MS = 60_000;

/** Im Hintergrund-Tab den Stand der Ablage nachfragen und bei einer Änderung `auffrischen` (leise, zählt nicht als Aktivität). */
export function useHintergrundStand(an: boolean, auffrischen: () => void) {
  const r = useRef(auffrischen);
  r.current = auffrischen;
  useEffect(() => {
    if (!an || typeof document === 'undefined') return;
    let letzter: string | null = null;
    let uhr: ReturnType<typeof setInterval> | undefined;
    const frage = async () => {
      try {
        const s = await mappenApi.ablageStand();
        if (letzter !== null && s !== letzter) r.current();
        letzter = s;
      } catch {
        // Nicht erreichbar oder abgemeldet: nichts tun, im nächsten Takt wieder.
      }
    };
    const wechsel = () => {
      clearInterval(uhr);
      uhr = undefined;
      letzter = null;
      if (document.visibilityState !== 'hidden') return;
      void frage();
      uhr = setInterval(() => void frage(), HINTERGRUND_MS);
    };
    document.addEventListener('visibilitychange', wechsel);
    wechsel();
    return () => {
      clearInterval(uhr);
      document.removeEventListener('visibilitychange', wechsel);
    };
  }, [an]);
}

/** Ursprüngliche Adressen der Symbole im Tab (index.html: ICO, SVG hell, SVG dunkel). */
const urspruenge = new Map<HTMLLinkElement, string>();

/**
 * Symbol im Tab (#72, #922): eigenes Logo oder das ursprüngliche; mit `punkt` darüber ein Punkt in der Akzentfarbe. Mit
 * Punkt tragen alle Symbol-Verweise dasselbe Bild – sonst wählte der Browser je nach Farbschema das ohne Punkt.
 */
export async function setzeTabSymbol(eigenes: string | null, punkt: boolean): Promise<void> {
  const verweise = [...document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')];
  if (!verweise.length) return;
  for (const el of verweise) if (!urspruenge.has(el)) urspruenge.set(el, el.getAttribute('href') ?? '');
  const zurueck = () => verweise.forEach((el, i) => el.setAttribute('href', (i === 0 && eigenes) || urspruenge.get(el)!));
  if (!punkt) return zurueck();
  const bild = await mitPunkt(eigenes ?? urspruenge.get(verweise[0])!).catch(() => null);
  if (!bild) return zurueck();
  for (const el of verweise) el.setAttribute('href', bild);
}

/** Das Symbol als PNG (64 × 64 px) mit einem Punkt oben rechts; Farben aus den Tokens (Akzent, Fläche als Rand). */
async function mitPunkt(quelle: string): Promise<string | null> {
  const img = new Image();
  img.src = quelle;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  const token = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  g.drawImage(img, 0, 0, 64, 64);
  g.beginPath();
  g.arc(48, 16, 14, 0, 2 * Math.PI);
  g.fillStyle = token('--akzent');
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = token('--flaeche');
  g.stroke();
  return c.toDataURL('image/png');
}
