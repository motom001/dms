import { wartezeit, type Gesundheit } from '../../shared/src/erreichbarkeit';
import { laedtNichtUrl, schonNeuGeladen, startbildDauer, startbildLage, startbildSprache } from '../../shared/src/startbild';
import { sprache } from '../../shared/src/sprache';
import { t } from './sprache';

/**
 * Startbild im Browser (#1198) – ohne React, damit main.tsx es vor dem ersten Bild nutzen kann. Das Startbild selbst steht
 * in index.html (shared/src/startbild.ts); hier: die sichtbare Sprache setzen und, wenn Ablago beim Start nicht
 * antwortet, die Meldung „Ablago antwortet gerade nicht. [Erneut versuchen]“ statt einer leeren Seite.
 */

/** So lange warten `/api/sprache` und die Gesundheitsprüfung beim Start höchstens. */
export const START_WARTEN_MS = 5000;

const NEU_GELADEN = 'ablago:neu-geladen-ohne-antwort';

/** Sprache des Startbilds sofort setzen (gemerkt bzw. die des Browsers). */
export function startbildSpracheSetzen(vorschlag: string | null) {
  document.documentElement.dataset.startbild = startbildSprache(vorschlag);
}

/** `fetch` mit Zeitgrenze; ältere Browser ohne `AbortSignal.timeout` warten wie bisher. */
export function holeMitGrenze(url: string, init: RequestInit = {}, ms = START_WARTEN_MS): Promise<Response> {
  const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
  return fetch(url, { ...init, ...(signal ? { signal } : {}) });
}

/**
 * Gesundheitsprüfung beim Start (#1198): `ok`, wenn Ablago samt Datenbank antwortet. Sonst mit dem Befund (#1199) –
 * `antwortet-nicht` bzw. `abgewiesen` und seit wann – oder ohne, wenn Ablago gar nicht (rechtzeitig) antwortet.
 */
export async function gesundheitBeimStart(): Promise<{ ok: boolean; befund: Gesundheit | null }> {
  try {
    const r = await holeMitGrenze('/api/gesundheit', { cache: 'no-store', headers: { 'x-dms': '1' } });
    const befund = await r.json().catch(() => null) as Gesundheit | null;
    return { ok: r.ok, befund };
  } catch { return { ok: false, befund: null }; }
}

const VERSION = 'ablago:version';

/** Zuletzt gesehene Version merken (#1199): Ohne Anmeldung nennt der Server sie nicht, die Meldung soll sie zeigen. */
export function merkeVersion(version: string | null | undefined) {
  if (!version) return;
  try { localStorage.setItem(VERSION, version); } catch { /* privates Fenster: ohne Version */ }
}

function gemerkteVersion(): string | null {
  try { return localStorage.getItem(VERSION); } catch { return null; }
}

/** Neu laden, weil Ablago nicht antwortete – gemerkt, damit die nächste Seite „schon neu geladen“ sagen kann. */
export function neuLadenOhneAntwort() {
  try { sessionStorage.setItem(NEU_GELADEN, String(Date.now())); } catch { /* privates Fenster: ohne Hinweis */ }
  location.reload();
}

/** Ist die Seite schon einmal neu geladen worden, ohne dass Ablago antwortete? */
export function schonOhneAntwortNeuGeladen(): boolean {
  try { const v = sessionStorage.getItem(NEU_GELADEN); return schonNeuGeladen(v ? Number(v) : null, Date.now()); } catch { return false; }
}

/** Ablago antwortet wieder: Merker weg. */
export function antwortGekommen() {
  try { sessionStorage.removeItem(NEU_GELADEN); } catch { /* s. o. */ }
}

const absatz = (klasse: string, text: string) => {
  const p = document.createElement('p');
  p.className = klasse;
  p.textContent = text;
  return p;
};

/** Was ist los? (#1199) Ein Satz aus dem Befund der Gesundheitsprüfung – ohne Fehlertext, Adresse oder Namen. */
function lageText(befund: Gesundheit | null): string {
  const lage = startbildLage(befund);
  if (lage === 'unbekannt') return t('oberflaeche.startbild.lage.unbekannt');
  const d = startbildDauer(befund?.dauerS);
  const dauer = d.art === 'kurz' ? t('oberflaeche.startbild.dauer.kurz')
    : d.art === 'minuten' ? t('oberflaeche.startbild.dauer.minuten', { anzahl: d.anzahl }) : t('oberflaeche.startbild.dauer.stunden', { anzahl: d.anzahl });
  return lage === 'abgewiesen' ? t('oberflaeche.startbild.lage.abgewiesen', { dauer }) : t('oberflaeche.startbild.lage.antwortet-nicht', { dauer });
}

function standText(): string {
  const uhrzeit = new Date().toLocaleTimeString(sprache(), { hour: '2-digit', minute: '2-digit' });
  const version = gemerkteVersion();
  return version ? t('oberflaeche.startbild.stand-version', { uhrzeit, version }) : t('oberflaeche.startbild.stand', { uhrzeit });
}

/**
 * „Ablago antwortet gerade nicht“ ohne React: ersetzt das Startbild. Hilfe zur Selbsthilfe (#1199): was los ist (aus
 * der Gesundheitsprüfung), was man tun kann (warten, Container bzw. Datenbank neu starten, Bescheid sagen), der Link ins
 * Handbuch und Uhrzeit samt zuletzt gesehener Version. Bewusst ohne Knopf zum Neustarten und ohne Protokoll: Die Seite
 * sieht jeder, der die Adresse kennt, und ohne Datenbank gibt es keine Anmeldung. Die Seite fragt weiter nach (wachsender
 * Abstand wie die Leiste der Oberfläche), frischt Lage und Uhrzeit auf und lädt neu, sobald Ablago samt Datenbank
 * antwortet.
 */
export function zeigeKeineAntwort(wurzel: HTMLElement, befund: Gesundheit | null = null) {
  const bild = document.createElement('div');
  bild.className = 'startbild';
  bild.id = 'keine-antwort';
  bild.setAttribute('role', 'alert');
  for (const art of ['hell', 'dunkel'] as const) {
    const img = document.createElement('img');
    img.className = `startbild-logo ${art}`;
    img.src = art === 'hell' ? '/ablago-logo-mit-schriftzug.svg' : '/ablago-logo-mit-schriftzug-dunkel.svg';
    img.alt = 'Ablago';
    bild.append(img);
  }
  const titel = document.createElement('h1');
  titel.className = 'startbild-titel';
  titel.textContent = t('oberflaeche.startbild.keine-antwort');
  const lage = absatz('startbild-text startbild-lage', lageText(befund));
  bild.append(titel, lage);
  if (schonOhneAntwortNeuGeladen()) bild.append(absatz('startbild-hinweis', t('oberflaeche.startbild.schon-neu-geladen')));
  // Was du tun kannst: Schritt 2 hängt davon ab, ob Ablago hängt oder die Datenbank ablehnt.
  const schritte = document.createElement('ol');
  schritte.className = 'startbild-schritte';
  const schritt = (text: string) => { const li = document.createElement('li'); li.textContent = text; return li; };
  const neustart = schritt('');
  const zeigeNeustart = (b: Gesundheit | null) => {
    neustart.textContent = t(startbildLage(b) === 'abgewiesen' ? 'oberflaeche.startbild.schritt.datenbank' : 'oberflaeche.startbild.schritt.neustart');
  };
  zeigeNeustart(befund);
  schritte.append(schritt(t('oberflaeche.startbild.keine-antwort-text')), neustart, schritt(t('oberflaeche.startbild.schritt.verwaltung')));
  bild.append(absatz('startbild-text startbild-zwischentitel', t('oberflaeche.startbild.was-du-tun-kannst')), schritte);
  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = 'knopf primaer';
  knopf.textContent = t('oberflaeche.startbild.erneut');
  knopf.addEventListener('click', () => neuLadenOhneAntwort());
  bild.append(knopf);
  // Notfallseite im Handbuch (immer online, de/en): dieselben Schritte ausführlich, dazu `docker logs`.
  const hilfe = document.createElement('a');
  hilfe.href = laedtNichtUrl(sprache());
  hilfe.target = '_blank';
  hilfe.rel = 'noreferrer';
  hilfe.textContent = t('oberflaeche.startbild.handbuch');
  const wasTun = absatz('startbild-text startbild-link', '');
  wasTun.append(hilfe);
  const stand = absatz('startbild-stand', standText());
  bild.append(wasTun, stand);
  wurzel.replaceChildren(bild);
  let versuch = 0;
  const nochmal = () => setTimeout(() => {
    void gesundheitBeimStart().then((g) => {
      if (g.ok) { location.reload(); return; }
      lage.textContent = lageText(g.befund);
      zeigeNeustart(g.befund);
      stand.textContent = standText();
      versuch++;
      nochmal();
    });
  }, wartezeit(versuch));
  nochmal();
}
