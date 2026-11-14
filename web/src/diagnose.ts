import { t } from './sprache';
import { gebietsschema, sprache } from '../../shared/src/sprache';
/**
 * Sammler für „Fehler melden“ (#70): die letzten Fehler im Browser, fehlgeschlagene Anfragen
 * und besuchte Seiten dieser Sitzung – nur im Speicher, nur Pfade (ohne Suchbegriffe).
 */
export interface Ereignis { zeit: string; art: 'fehler' | 'anfrage' | 'seite'; text: string }

/** Höchstens so viele Fehler und Anfragen; besuchte Seiten mehr, damit der Weg zum Fehler sichtbar bleibt (#93). */
const MAX = 10;
const MAX_SEITEN = 25;
const fehler: Ereignis[] = [];
const anfragen: Ereignis[] = [];
const seiten: Ereignis[] = [];
const merke = (liste: Ereignis[], e: Omit<Ereignis, 'zeit'>, max = MAX) => { liste.push({ zeit: new Date().toISOString(), ...e }); if (liste.length > max) liste.shift(); };

let aktiv = false;
export function starteSammler() {
  if (aktiv) return;
  aktiv = true;
  addEventListener('error', (e) => merke(fehler, { art: 'fehler', text: `${e.message}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}`.slice(0, 500) }));
  addEventListener('unhandledrejection', (e) => merke(fehler, { art: 'fehler', text: String((e.reason as Error)?.message ?? e.reason).slice(0, 500) }));
  const seite = () => { if (seiten[seiten.length - 1]?.text !== location.pathname) merke(seiten, { art: 'seite', text: location.pathname }, MAX_SEITEN); };
  addEventListener('popstate', seite);
  seite();
}

/** Aus api/anfrage.ts: eine Anfrage ist fehlgeschlagen (Methode, Pfad ohne Abfrage, Status, Meldung). */
export function merkeAnfrage(methode: string, url: string, status: number, meldung: string) {
  merke(anfragen, { art: 'anfrage', text: `${methode} ${url.split('?')[0]} → ${status || t('oberflaeche.diagnose.nicht-erreichbar')}: ${meldung}`.slice(0, 300) });
}

/** Alles, was der Browser ohne Rückfrage über Gerät und Darstellung verrät. */
export function geraeteAngaben(skala: string): Record<string, unknown> {
  const n = navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number }; userAgentData?: { brands?: Array<{ brand: string; version: string }>; platform?: string; mobile?: boolean } };
  const mq = (q: string) => matchMedia(q).matches;
  let speicher = false;
  try { localStorage.setItem('dms:probe', '1'); localStorage.removeItem('dms:probe'); speicher = true; } catch { /* privates Fenster o. Ä. */ }
  // Bezeichnungen aus der Sprachdatei (#729): Wer den Bericht liest, sieht sie in der Sprache der meldenden Person.
  const L = (k: string) => t.frei(`oberflaeche.diagnose.${k}`);
  return {
    [L('browser')]: {
      'User-Agent': navigator.userAgent,
      ...(n.userAgentData ? { [L('marken')]: n.userAgentData.brands?.map((b) => `${b.brand} ${b.version}`).join(', '), [L('plattform')]: n.userAgentData.platform, [L('mobil')]: n.userAgentData.mobile } : {}),
      [L('sprachen')]: navigator.languages?.join(', ') || navigator.language,
      [L('oberflaeche')]: sprache(),
      Cookies: navigator.cookieEnabled, localStorage: speicher,
      [L('app')]: mq('(display-mode: standalone)'),
    },
    [L('bildschirm')]: {
      [L('bildschirm')]: `${screen.width} × ${screen.height}`, [L('fenster')]: `${innerWidth} × ${innerHeight}`,
      [L('pixeldichte')]: devicePixelRatio, [L('ausrichtung')]: screen.orientation?.type ?? (innerWidth > innerHeight ? L('quer') : L('hoch')),
      Touch: navigator.maxTouchPoints > 0, Zoom: typeof visualViewport !== 'undefined' && visualViewport ? Math.round(visualViewport.scale * 100) / 100 : null,
      [L('breiter')]: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    },
    [L('darstellung')]: {
      [L('schriftgroesse')]: skala, [L('dunkel')]: mq('(prefers-color-scheme: dark)'), [L('bewegung')]: mq('(prefers-reduced-motion: reduce)'),
    },
    [L('zeit')]: { [L('lokale-zeit')]: new Date().toString(), [L('zeitzone')]: Intl.DateTimeFormat().resolvedOptions().timeZone },
    [L('verbindung')]: {
      Online: navigator.onLine, HTTPS: location.protocol === 'https:', [L('adresse')]: location.origin,
      ...(n.connection ? { [L('typ')]: n.connection.effectiveType, 'Mbit/s': n.connection.downlink } : {}),
    },
    [L('seite')]: location.pathname,
    [L('besucht')]: seiten.map((s) => `${new Date(s.zeit).toLocaleTimeString(gebietsschema())} ${s.text}`),
    [L('fehler')]: fehler.map((s) => `${new Date(s.zeit).toLocaleTimeString(gebietsschema())} ${s.text}`),
    [L('anfragen')]: anfragen.map((s) => `${new Date(s.zeit).toLocaleTimeString(gebietsschema())} ${s.text}`),
  };
}
