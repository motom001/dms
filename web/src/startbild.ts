import { wartezeit } from '../../shared/src/erreichbarkeit';
import { laedtNichtUrl, schonNeuGeladen, startbildSprache } from '../../shared/src/startbild';
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

/** Antwortet Ablago samt Datenbank (Gesundheitsprüfung, #1198)? */
export async function antwortet(): Promise<boolean> {
  try { return (await holeMitGrenze('/api/gesundheit', { cache: 'no-store', headers: { 'x-dms': '1' } })).ok; } catch { return false; }
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

/**
 * „Ablago antwortet gerade nicht“ ohne React: ersetzt das Startbild. Die Seite fragt weiter nach (wachsender Abstand wie
 * die Leiste der Oberfläche) und lädt neu, sobald Ablago samt Datenbank antwortet. Nach einem erfolglosen Neuladen der
 * Hinweis, den Container neu zu starten bzw. sich an die Verwaltung zu wenden.
 */
export function zeigeKeineAntwort(wurzel: HTMLElement) {
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
  bild.append(absatz('startbild-titel', t('oberflaeche.startbild.keine-antwort')), absatz('startbild-text', t('oberflaeche.startbild.keine-antwort-text')));
  if (schonOhneAntwortNeuGeladen()) bild.append(absatz('startbild-hinweis', t('oberflaeche.erreichbar.schon-neu-geladen')));
  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = 'knopf primaer';
  knopf.textContent = t('oberflaeche.startbild.erneut');
  knopf.addEventListener('click', () => neuLadenOhneAntwort());
  bild.append(knopf);
  // Was tun? (#1198): Notfallseite im Handbuch – Seite neu laden, Container neu starten, Protokoll ansehen.
  const hilfe = document.createElement('a');
  hilfe.href = laedtNichtUrl(sprache());
  hilfe.target = '_blank';
  hilfe.rel = 'noreferrer';
  hilfe.textContent = t('oberflaeche.startbild.was-tun');
  const wasTun = absatz('startbild-text', '');
  wasTun.append(hilfe);
  bild.append(wasTun);
  wurzel.replaceChildren(bild);
  let versuch = 0;
  const nochmal = () => setTimeout(() => {
    void antwortet().then((ok) => { if (ok) location.reload(); else { versuch++; nochmal(); } });
  }, wartezeit(versuch));
  nochmal();
}
