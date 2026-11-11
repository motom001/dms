import { useEffect, useSyncExternalStore } from 'react';
import type { EntdeckenStand, Rundgang, TippAnzeige } from '../../../shared/src/entdecken';
import { api } from '../api';
import { geheZu } from '../ort';

/**
 * Ablago entdecken (#831, #832) in der Oberfläche: ein gemeinsamer Stand für Startseite, Seite „Ablago entdecken“ und
 * den Rundgang. Der Server filtert nach der Person; hier wird nur angezeigt und gemerkt, was sie tut.
 */
let stand: EntdeckenStand | null = null;
let laden: Promise<void> | null = null;
let fehler = false;
const hoerer = new Set<() => void>();
const melde = () => { for (const h of hoerer) h(); };

export function ladeEntdecken(): Promise<void> {
  laden ??= api.entdecken().then((s) => { stand = s; fehler = false; }, () => { fehler = true; }).finally(() => { laden = null; melde(); });
  return laden;
}

/**
 * Stand für Komponenten; lädt beim ersten Mal. `null`, solange nichts da ist. `frisch`: beim Erscheinen neu holen
 * (Startseite, „Ablago entdecken“) – z. B. nach dem Ein- oder Ausschalten der Tipps in Mein Konto.
 */
export function useEntdecken(frisch = false): { stand: EntdeckenStand | null; fehler: boolean } {
  const s = useSyncExternalStore((h) => { hoerer.add(h); return () => { hoerer.delete(h); }; }, () => stand);
  useEffect(() => { if ((frisch || !stand) && !laden) void ladeEntdecken(); }, [frisch]);
  return { stand: s, fehler };
}

/** Handlung an einem Tipp; danach den Stand neu holen. */
export async function tippHandlung(schluessel: string, aktion: 'gezeigt' | 'erledigt' | 'ausblenden' | 'einblenden') {
  try { await api.tippHandlung(schluessel, aktion); } catch { /* nur ein Merker – die Seite geht weiter */ }
  if (aktion !== 'gezeigt') await ladeEntdecken();
}

/* ---------- Rundgang starten (von selbst, aus einem Tipp, von „Ablago entdecken“) ---------- */

let aktiv: { rundgang: Rundgang; vonSelbst: boolean } | null = null;
const rundgangHoerer = new Set<() => void>();

export function starteRundgang(schluessel: string, vonSelbst = false) {
  const r = stand?.rundgaenge.find((x) => x.schluessel === schluessel);
  if (!r) { console.debug(`Rundgang „${schluessel}“ gibt es für diese Person nicht.`); return; }
  aktiv = { rundgang: r, vonSelbst };
  for (const h of rundgangHoerer) h();
}

export function beendeRundgang(stand2: 'gesehen' | 'spaeter' | null) {
  const a = aktiv;
  aktiv = null;
  for (const h of rundgangHoerer) h();
  if (a && stand2) void api.rundgangMerken(a.rundgang.schluessel, stand2).catch(() => {}).then(() => ladeEntdecken());
}

export const useAktiverRundgang = () => useSyncExternalStore((h) => { rundgangHoerer.add(h); return () => { rundgangHoerer.delete(h); }; }, () => aktiv);

/* ---------- Anker finden und hervorheben ---------- */

/** Sichtbares Element mit diesem Anker (`data-anker`), sonst null. */
export function findeAnker(anker: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-anker="${CSS.escape(anker)}"]`)) {
    if (el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
  }
  return null;
}

/**
 * Ein Tipp oder Rundgang sucht diese Anker (#1002). Seiten, die eine Stelle erst zeigen, wenn man umschaltet, hören
 * darauf und schalten um – z. B. die Startseite mit „Fragen · Suchen“: `startseite.suche` zeigt die Suche. Nur für den
 * Moment; gemerkt wird nichts.
 */
const ANKER_GESUCHT = 'ablago:anker-gesucht';
export function ankerGesucht(anker: readonly string[]) {
  window.dispatchEvent(new CustomEvent<readonly string[]>(ANKER_GESUCHT, { detail: anker }));
}
/** Hört auf gesuchte Anker (siehe `ankerGesucht`); liefert die Funktion zum Abmelden (für useEffect). */
export function beiAnkerGesucht(f: (anker: readonly string[]) => void): () => void {
  const h = (e: Event) => f((e as CustomEvent<readonly string[]>).detail);
  window.addEventListener(ANKER_GESUCHT, h);
  return () => window.removeEventListener(ANKER_GESUCHT, h);
}

/** Wartet bis zu `ms`, bis einer der Anker sichtbar ist; liefert den ersten sichtbaren (in der Reihenfolge der Liste). */
export async function warteAufAnker(anker: readonly string[], ms = 2500): Promise<{ anker: string; el: HTMLElement } | null> {
  const ende = Date.now() + ms;
  for (;;) {
    for (const a of anker) { const el = findeAnker(a); if (el) return { anker: a, el }; }
    // Noch nicht sichtbar: Bescheid sagen – vielleicht steht die Stelle hinter einem Umschalter (oder die Seite lädt noch).
    ankerGesucht(anker);
    if (Date.now() > ende) return null;
    await new Promise((r) => setTimeout(r, 100));
  }
}

export const wenigBewegung = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Handyfassung: dieselbe Grenze wie die Dreiteilung (bereiche.tsx). */
export const istSchmal = () => typeof innerWidth === 'number' && innerWidth <= 820;

/**
 * Ziel eines Tipps: Seite öffnen, Stelle in den Blick holen und kurz hervorheben (ruhig: ein Rahmen, keine Bewegung).
 * Fehlt die Stelle (z. B. am Handy ausgeblendet), bleibt es bei der Seite – ohne Fehlermeldung.
 */
export async function zeigeZiel(x: TippAnzeige) {
  if (x.rundgang) { starteRundgang(x.rundgang); return; }
  if (!x.ziel) return;
  if (location.pathname !== x.ziel.seite) geheZu(x.ziel.seite);
  const z = await warteAufAnker([x.ziel.anker]);
  if (!z) { console.debug(`Tipp „${x.schluessel}“: Anker „${x.ziel.anker}“ ist hier nicht sichtbar.`); return; }
  z.el.scrollIntoView({ block: 'center', behavior: wenigBewegung() ? 'auto' : 'smooth' });
  z.el.classList.add('anker-hervor');
  setTimeout(() => z.el.classList.remove('anker-hervor'), 4000);
}
