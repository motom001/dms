import { useEffect, useState } from 'react';
import type { Rundgang } from '../../../shared/src/entdecken';
import { Knopf } from '../bausteine';
import { t } from '../sprache';
import { ladeEntdecken, probiereRundgang, starteRundgang, zeigeZiel } from './stand';

/**
 * Werkzeuge der Werkbank für Rundgänge (#941) und Tipps (#942), die in einem **eigenen Fenster** laufen – so bleibt
 * die ungespeicherte Datei im Editor stehen:
 *
 * - **Ausprobieren:** Der Editor legt den geprüften Rundgang kurz im Browser ab und öffnet Ablago mit
 *   `?rundgang-probe=1`; das neue Fenster startet ihn sofort, nur für diese Person. Gemerkt wird nichts.
 * - **Ziel zeigen:** Ablago öffnet sich mit `?ziel-zeigen=1` in einem Auswahlmodus (gilt in diesem Fenster, bis er
 *   endet). Stellen mit Ankerpunkt (`data-anker`) werden beim Überfahren hervorgehoben; ein Klick wählt sie, Esc bricht
 *   ab. Stellen ohne Anker sind nicht wählbar – ein Klick dort bedient die Seite wie sonst (z. B. eine Mappe öffnen).
 *   Der gewählte Anker geht über einen BroadcastChannel an den Editor zurück, dann schließt sich das Fenster.
 * - **Tipp ausprobieren** (#942): Ablago öffnet das Ziel mit `?tipp-probe=<anker>` (hebt die Stelle hervor wie „Zeig es
 *   mir“) bzw. mit `?rundgang-start=<rundgang>` (startet den Rundgang).
 */

const PROBE = 'ablago:rundgang-probe';
const KANAL = 'ablago:ziel-zeigen';
const MODUS = 'ablago:ziel-zeigen';

const speicher = {
  setze(s: Storage | undefined, k: string, v: string) { try { s?.setItem(k, v); return true; } catch { return false; } },
  hole(s: Storage | undefined, k: string) { try { return s?.getItem(k) ?? null; } catch { return null; } },
  weg(s: Storage | undefined, k: string) { try { s?.removeItem(k); } catch { /* nichts gemerkt */ } },
};
const lokal = () => (typeof localStorage === 'undefined' ? undefined : localStorage);
const sitzung = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);

/** „Ausprobieren“: Rundgang im neuen Fenster starten. false, wenn das Fenster blockiert wurde. */
export function starteProbe(rundgang: Rundgang, pfad: string | null): boolean {
  speicher.setze(lokal(), PROBE, JSON.stringify({ rundgang, pfad }));
  const w = window.open('/ablage/start?rundgang-probe=1', '_blank');
  if (!w) speicher.weg(lokal(), PROBE);
  return !!w;
}

/** „Ziel zeigen“: Ablago im Auswahlmodus öffnen. false, wenn das Fenster blockiert wurde. */
export function zielZeigen(start = '/ablage/start'): boolean {
  return !!window.open(`${start}?ziel-zeigen=1`, '_blank');
}

/** Tipp ausprobieren: Seite mit hervorgehobener Stelle bzw. Rundgang im neuen Fenster. false, wenn blockiert. */
export function tippProbe(ziel: { pfad: string; anker: string } | { rundgang: string }): boolean {
  const url = 'rundgang' in ziel ? `/ablage/start?rundgang-start=${encodeURIComponent(ziel.rundgang)}` : `${ziel.pfad}${ziel.pfad.includes('?') ? '&' : '?'}tipp-probe=${encodeURIComponent(ziel.anker)}`;
  return !!window.open(url, '_blank');
}

/** Auf die Wahl im anderen Fenster warten: der Anker oder null (abgebrochen). */
export function holeAnker(): Promise<string | null> {
  if (typeof BroadcastChannel === 'undefined') return Promise.resolve(null);
  const k = new BroadcastChannel(KANAL);
  return new Promise((fertig) => {
    k.onmessage = (e: MessageEvent<{ anker?: string }>) => { k.close(); fertig(typeof e.data?.anker === 'string' ? e.data.anker : null); };
  });
}

/** Parameter aus der Adresse nehmen, ohne neu zu laden. */
function ohneParameter(name: string) {
  const u = new URL(location.href);
  u.searchParams.delete(name);
  history.replaceState(history.state, '', u.pathname + u.search + u.hash);
}

/** In App eingebunden: startet eine Probe und zeigt den Auswahlmodus von „Ziel zeigen“. */
export function EntdeckenWerkzeuge() {
  const [waehlen, setWaehlen] = useState(() => speicher.hole(sitzung(), MODUS) === '1');
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('rundgang-probe') === '1') {
      ohneParameter('rundgang-probe');
      const roh = speicher.hole(lokal(), PROBE);
      speicher.weg(lokal(), PROBE);
      try { if (roh) { const x = JSON.parse(roh) as { rundgang: Rundgang; pfad: string | null }; probiereRundgang(x.rundgang, x.pfad); } } catch { /* nichts auszuprobieren */ }
    }
    const anker = q.get('tipp-probe');
    if (anker) {
      ohneParameter('tipp-probe');
      void zeigeZiel({ schluessel: 'probe', herkunft: 'eigen', bereich: 'mappen', text: '', neu: false, ausgeblendet: false, clients: false, ziel: { anker, seite: location.pathname } });
    }
    const rundgang = q.get('rundgang-start');
    if (rundgang) {
      ohneParameter('rundgang-start');
      void ladeEntdecken().then(() => starteRundgang(rundgang));
    }
    if (q.get('ziel-zeigen') === '1') {
      ohneParameter('ziel-zeigen');
      speicher.setze(sitzung(), MODUS, '1');
      setWaehlen(true);
    }
  }, []);
  if (!waehlen) return null;
  return <ZielWahl ende={() => { speicher.weg(sitzung(), MODUS); setWaehlen(false); }} />;
}

/** Element mit Anker unter dem Zeiger bzw. Fokus (das innerste). */
const mitAnker = (x: EventTarget | null) => (x instanceof Element ? x.closest<HTMLElement>('[data-anker]') : null);

function ZielWahl({ ende }: { ende(): void }) {
  const [ziel, setZiel] = useState<{ anker: string; r: DOMRect } | null>(null);
  useEffect(() => {
    const melde = (anker: string | null) => {
      if (typeof BroadcastChannel !== 'undefined') { const k = new BroadcastChannel(KANAL); k.postMessage(anker ? { anker } : { abbruch: true }); k.close(); }
      ende();
      window.close();
    };
    const zeige = (e: Event) => { const el = mitAnker(e.target); setZiel(el ? { anker: el.dataset.anker!, r: el.getBoundingClientRect() } : null); };
    const klick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('.ziel-wahl-leiste')) return;
      const el = mitAnker(e.target);
      if (!el) return;
      e.preventDefault(); e.stopPropagation();
      melde(el.dataset.anker!);
    };
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); melde(null); return; }
      // Mit der Tastatur: Tab zu einer Stelle, Enter wählt ihren Anker.
      if (e.key === 'Enter') { const el = mitAnker(document.activeElement); if (el && !document.activeElement?.closest('.ziel-wahl-leiste')) { e.preventDefault(); e.stopPropagation(); melde(el.dataset.anker!); } }
    };
    document.addEventListener('mouseover', zeige, true);
    document.addEventListener('focusin', zeige, true);
    document.addEventListener('click', klick, true);
    document.addEventListener('keydown', taste, true);
    return () => {
      document.removeEventListener('mouseover', zeige, true);
      document.removeEventListener('focusin', zeige, true);
      document.removeEventListener('click', klick, true);
      document.removeEventListener('keydown', taste, true);
    };
  }, [ende]);
  return (
    <>
      {ziel && <div className="ziel-wahl-rahmen" aria-hidden="true" style={{ left: ziel.r.left - 4, top: ziel.r.top - 4, width: ziel.r.width + 8, height: ziel.r.height + 8 }} />}
      <div className="ziel-wahl-leiste" role="status">
        <span>{t('entdecken.ziel-zeigen.leiste')}</span>
        {ziel && <code>{ziel.anker}</code>}
        <Knopf onClick={() => { if (typeof BroadcastChannel !== 'undefined') { const k = new BroadcastChannel(KANAL); k.postMessage({ abbruch: true }); k.close(); } ende(); window.close(); }}>{t('entdecken.ziel-zeigen.abbrechen')}</Knopf>
      </div>
    </>
  );
}
