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

/** Aus api.ts: eine Anfrage ist fehlgeschlagen (Methode, Pfad ohne Abfrage, Status, Meldung). */
export function merkeAnfrage(methode: string, url: string, status: number, meldung: string) {
  merke(anfragen, { art: 'anfrage', text: `${methode} ${url.split('?')[0]} → ${status || 'nicht erreichbar'}: ${meldung}`.slice(0, 300) });
}

/** Alles, was der Browser ohne Rückfrage über Gerät und Darstellung verrät. */
export function geraeteAngaben(skala: string): Record<string, unknown> {
  const n = navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number }; userAgentData?: { brands?: Array<{ brand: string; version: string }>; platform?: string; mobile?: boolean } };
  const mq = (q: string) => matchMedia(q).matches;
  let speicher = false;
  try { localStorage.setItem('dms:probe', '1'); localStorage.removeItem('dms:probe'); speicher = true; } catch { /* privates Fenster o. Ä. */ }
  return {
    Browser: {
      'User-Agent': navigator.userAgent,
      ...(n.userAgentData ? { Marken: n.userAgentData.brands?.map((b) => `${b.brand} ${b.version}`).join(', '), Plattform: n.userAgentData.platform, Mobil: n.userAgentData.mobile } : {}),
      Sprachen: navigator.languages?.join(', ') || navigator.language,
      Cookies: navigator.cookieEnabled, localStorage: speicher,
      'Als App installiert': mq('(display-mode: standalone)'),
    },
    Bildschirm: {
      Bildschirm: `${screen.width} × ${screen.height}`, Fenster: `${innerWidth} × ${innerHeight}`,
      Pixeldichte: devicePixelRatio, Ausrichtung: screen.orientation?.type ?? (innerWidth > innerHeight ? 'quer' : 'hoch'),
      Touch: navigator.maxTouchPoints > 0, Zoom: typeof visualViewport !== 'undefined' && visualViewport ? Math.round(visualViewport.scale * 100) / 100 : null,
      'Seite breiter als Fenster': document.documentElement.scrollWidth > document.documentElement.clientWidth,
    },
    Darstellung: {
      Schriftgröße: skala, 'System dunkel': mq('(prefers-color-scheme: dark)'), 'Weniger Bewegung': mq('(prefers-reduced-motion: reduce)'),
    },
    Zeit: { 'Lokale Zeit': new Date().toString(), Zeitzone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    Verbindung: {
      Online: navigator.onLine, HTTPS: location.protocol === 'https:', Adresse: location.origin,
      ...(n.connection ? { Typ: n.connection.effectiveType, 'Mbit/s': n.connection.downlink } : {}),
    },
    'Aktuelle Seite': location.pathname,
    'Zuletzt besucht': seiten.map((s) => `${new Date(s.zeit).toLocaleTimeString('de-DE')} ${s.text}`),
    'Fehler im Browser': fehler.map((s) => `${new Date(s.zeit).toLocaleTimeString('de-DE')} ${s.text}`),
    'Fehlgeschlagene Anfragen': anfragen.map((s) => `${new Date(s.zeit).toLocaleTimeString('de-DE')} ${s.text}`),
  };
}
