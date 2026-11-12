/**
 * Texte der Weboberfläche aus den Sprachdateien (#473). Neue oder geänderte Texte kommen in
 * `shared/src/sprachen/de/<bereich>.json` und werden mit `t('<bereich>.<schluessel>', { platzhalter })`
 * abgerufen; ein neuer Bereich wird unten ergänzt. Anleitung: Entwicklerhandbuch → Aufbau → Texte.
 */
import { createElement, Fragment, type ReactNode } from 'react';
import { AUSGANGSSPRACHE, registriereSprache, RUECKFALLSPRACHE, setzeSprache, sprache, uebersetzer, type Schluessel } from '../../shared/src/sprache';
import ablage from '../../shared/src/sprachen/de/ablage.json';
import mappentypen from '../../shared/src/sprachen/de/mappentypen.json';
import notfall from '../../shared/src/sprachen/de/notfall.json';
import oberflaeche from '../../shared/src/sprachen/de/oberflaeche.json';
import aehnlich from '../../shared/src/sprachen/de/aehnlich.json';
import api from '../../shared/src/sprachen/de/api.json';
import einrichtung from '../../shared/src/sprachen/de/einrichtung.json';
import entdecken from '../../shared/src/sprachen/de/entdecken.json';
import anmeldung from '../../shared/src/sprachen/de/anmeldung.json';
import termine from '../../shared/src/sprachen/de/termine.json';
import automatisierung from '../../shared/src/sprachen/de/automatisierung.json';
import pakete from '../../shared/src/sprachen/de/pakete.json';
import erkennung from '../../shared/src/sprachen/de/erkennung.json';
import felder from '../../shared/src/sprachen/de/felder.json';
import fragen from '../../shared/src/sprachen/de/fragen.json';
import ereignisse from '../../shared/src/sprachen/de/ereignisse.json';
import konten from '../../shared/src/sprachen/de/konten.json';
import lasttest from '../../shared/src/sprachen/de/lasttest.json';
import mappen from '../../shared/src/sprachen/de/mappen.json';
import profil from '../../shared/src/sprachen/de/profil.json';
import spalten from '../../shared/src/sprachen/de/spalten.json';
import suche from '../../shared/src/sprachen/de/suche.json';
import systemzustand from '../../shared/src/sprachen/de/systemzustand.json';
import volltext from '../../shared/src/sprachen/de/volltext.json';
import werkbank from '../../shared/src/sprachen/de/werkbank.json';

const bereiche = { ablage, aehnlich, api, anmeldung, automatisierung, einrichtung, entdecken, erkennung, ereignisse, felder, fragen, konten, lasttest, mappen, mappentypen, notfall, oberflaeche, pakete, profil, spalten, suche, systemzustand, termine, volltext, werkbank };
export const t = uebersetzer(bereiche);

/**
 * Text mit Bausteinen der Oberfläche (#727): wie `t`, aber Platzhalter dürfen Elemente sein, z. B. ein fett
 * gesetzter Knopfname als Wert für `{knopf}` in „Klicke auf {knopf}“. So bleibt der
 * ganze Satz in der Sprachdatei, und eine Übersetzung kann die Reihenfolge ändern. `anzahl` wählt wie bei `t`
 * die Mehrzahlform; leere Werte (`null`, `undefined`, `false`) erscheinen wie in JSX gar nicht.
 */
export function tn(schluessel: Schluessel<typeof bereiche>, werte: Readonly<Record<string, ReactNode>> = {}): ReactNode {
  const text = t.frei(schluessel, typeof werte.anzahl === 'number' ? { anzahl: werte.anzahl } : {});
  const teile: ReactNode[] = [];
  let rest = 0;
  for (const m of text.matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
    if (!Object.hasOwn(werte, m[1])) continue;
    if (m.index > rest) teile.push(text.slice(rest, m.index));
    teile.push(werte[m[1]]);
    rest = m.index + m[0].length;
  }
  if (rest < text.length) teile.push(text.slice(rest));
  return createElement(Fragment, null, ...teile);
}

/* ---------- Sprache wählen (#729) ---------- */

const GEMERKT = 'ablago:sprache';
/** Zuletzt benutzte Sprache in diesem Browser (nur Bequemlichkeit: der Server entscheidet). */
export function gemerkteSprache(): string | null {
  try { return localStorage.getItem(GEMERKT); } catch { return null; }
}
export function merkeSprache(spr: string) {
  try { localStorage.setItem(GEMERKT, spr); } catch { /* privates Fenster */ }
}
/** Sprache des Browsers als Vorschlag, z. B. „en“ aus „en-GB“. */
export const browserSprache = () => (typeof navigator === 'undefined' ? '' : (navigator.language || '').split('-')[0].toLowerCase());

/**
 * Lädt die Texte einer Sprache und stellt die Oberfläche darauf um. Englisch ist ein eigener Teil des Bundles und kommt
 * erst, wenn jemand es braucht. Texte, die Module beim Laden bilden, entstehen erst danach (main.tsx lädt App später).
 *
 * Sprachpakete (#731): Ihre Texte holt die Oberfläche vom Server (nur Texte, nie HTML – React setzt sie als Text). Dazu
 * kommt immer Englisch, denn was im Sprachpaket fehlt, erscheint auf Englisch, sonst auf Deutsch. Geht das Laden schief,
 * bleibt es bei Englisch bzw. Deutsch – Ablago zeigt nie eine leere Stelle.
 */
export async function ladeSprache(spr: string) {
  if (spr !== AUSGANGSSPRACHE) { const { registriereEnglisch } = await import('../../shared/src/englisch'); registriereEnglisch(); }
  if (spr !== AUSGANGSSPRACHE && spr !== RUECKFALLSPRACHE) await ladeSprachpaket(spr);
  setzeSprache(spr);
  merkeSprache(spr);
  if (typeof document !== 'undefined') document.documentElement.lang = spr;
}

/** Texte eines Sprachpakets vom Server eintragen (#731); ohne Antwort bleibt der Rückfall. */
async function ladeSprachpaket(spr: string) {
  try {
    const r = await fetch(`/api/sprache/texte/${encodeURIComponent(spr)}`, { credentials: 'same-origin', headers: { 'x-dms': '1' } });
    if (!r.ok) return;
    const d = await r.json() as { kennung: string; gebietsschema: string; maschinell: boolean; texte: Record<string, Record<string, string>> };
    registriereSprache(spr, d.texte, { maschinell: d.maschinell, gebietsschema: d.gebietsschema });
  } catch { /* nicht erreichbar: Rückfall Englisch, sonst Deutsch */ }
}

/** Andere Sprache gewählt (Mein Konto, Anmeldung, Assistent): merken und neu laden – alle Texte entstehen neu. */
export function wechsleSprache(spr: string) {
  if (spr === sprache()) return;
  merkeSprache(spr);
  location.reload();
}
