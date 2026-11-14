/**
 * Startbild (#1198): Bis 0.266 lieferte `index.html` nur ein leeres `<div id="root">`. Hing danach `/api/sprache` (etwa
 * weil kein Datenbank-Zugang frei war), blieb die Seite minutenlang schwarz – ohne Hinweis, dass überhaupt gewartet wird.
 *
 * Jetzt steht schon in `index.html` ein Startbild aus HTML und CSS (ohne Skript – die Content-Security-Policy erlaubt nur
 * eigene Skriptdateien): Logo und „Verbindung zu Ablago wird aufgebaut …“, nach einigen Sekunden (CSS-Verzögerung)
 * zusätzlich „Ablago antwortet noch nicht – wir versuchen es weiter“. React ersetzt es mit dem ersten Bild. Die Texte
 * kommen beim Bauen aus den Sprachdateien (web/vite.config.ts), Deutsch und Englisch; welche sichtbar ist, setzt
 * main.tsx sofort beim Laden (gemerkte Sprache bzw. die des Browsers).
 *
 * Hier nur, was ohne Browser geht (auch für Tests): HTML erzeugen, Sprache wählen, „schon neu geladen?“.
 */

import { HILFE, hilfeOnlineUrl } from './hilfe';

export type StartbildSprache = 'de' | 'en';
export const STARTBILD_SPRACHEN: readonly StartbildSprache[] = ['de', 'en'];

/** Schlüssel der Texte im Startbild (oberflaeche.json). */
export const STARTBILD_TEXTE = { verbinden: 'oberflaeche.startbild.verbinden', wartet: 'oberflaeche.startbild.wartet', wasTun: 'oberflaeche.startbild.was-tun' } as const;

/** Was tun, wenn Ablago nicht lädt (Notfallseite im Handbuch, immer online – Ablago selbst antwortet ja gerade nicht). */
export const laedtNichtUrl = (sprache?: string | null) => hilfeOnlineUrl(HILFE['notfall.laedt-nicht'], sprache);

/** Platzhalter in web/index.html, an dessen Stelle das Startbild kommt. */
export const STARTBILD_PLATZHALTER = '<!--startbild-->';

/** Nach so vielen Sekunden zeigt das Startbild „antwortet noch nicht“ (CSS, startbild.css). */
export const STARTBILD_WARTET_S = 4;

/** Sprache des Startbilds: Deutsch, wenn nichts bekannt ist oder Deutsch gewählt ist, sonst Englisch. */
export function startbildSprache(vorschlag: string | null | undefined): StartbildSprache {
  const v = (vorschlag ?? '').trim().toLowerCase();
  return !v || v === 'de' || v.startsWith('de-') ? 'de' : 'en';
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** HTML des Startbilds; `text(sprache, schluessel)` liefert den Text aus der Sprachdatei. */
export function startbildHtml(text: (sprache: StartbildSprache, schluessel: string) => string): string {
  const zeilen = (schluessel: string, klasse: string) => STARTBILD_SPRACHEN
    .map((s) => `<p class="${klasse}" data-sprache="${s}" lang="${s}">${esc(text(s, schluessel))}</p>`).join('');
  return [
    '<div class="startbild" id="startbild" role="status">',
    '<img class="startbild-logo hell" src="/ablago-logo-mit-schriftzug.svg" alt="Ablago" width="220" height="64">',
    '<img class="startbild-logo dunkel" src="/ablago-logo-mit-schriftzug-dunkel.svg" alt="Ablago" width="220" height="64">',
    zeilen(STARTBILD_TEXTE.verbinden, 'startbild-text'),
    zeilen(STARTBILD_TEXTE.wartet, 'startbild-text startbild-spaeter'),
    STARTBILD_SPRACHEN.map((s) => `<p class="startbild-text startbild-spaeter" data-sprache="${s}" lang="${s}"><a href="${esc(laedtNichtUrl(s))}" target="_blank" rel="noreferrer">${esc(text(s, STARTBILD_TEXTE.wasTun))}</a></p>`).join(''),
    '</div>',
  ].join('');
}

/** Startbild mit den Texten aus oberflaeche.json je Sprache (Schlüssel ohne „oberflaeche.“); fehlt einer, gilt Deutsch. */
export function startbildAusTexten(texte: Record<StartbildSprache, Record<string, string>>): string {
  const ohne = (k: string) => k.replace(/^oberflaeche\./, '');
  return startbildHtml((s, k) => texte[s][ohne(k)] ?? texte.de[ohne(k)] ?? k);
}

/** So lange gilt „schon neu geladen“ (danach ist es ein neuer Versuch, kein erfolgloses Neuladen mehr). */
export const NEU_GELADEN_MS = 10 * 60_000;

/** Wurde die Seite kürzlich neu geladen, weil Ablago nicht antwortete – und antwortet es immer noch nicht? */
export function schonNeuGeladen(merker: number | null, jetzt: number): boolean {
  return merker !== null && Number.isFinite(merker) && jetzt - merker >= 0 && jetzt - merker < NEU_GELADEN_MS;
}

/**
 * Was ist los? (#1199) Aus der Gesundheitsprüfung: Ablago hängt (`antwortet-nicht`), die Datenbank lehnt ab
 * (`abgewiesen`) oder Ablago antwortet gar nicht (`unbekannt`) – danach richten sich Lage und Schritt 2 der Meldung.
 */
export type StartbildLage = 'antwortet-nicht' | 'abgewiesen' | 'unbekannt';
export function startbildLage(g: { zustand?: string; datenbank?: string } | null | undefined): StartbildLage {
  if (g?.zustand !== 'datenbank') return 'unbekannt';
  return g.datenbank === 'abgewiesen' ? 'abgewiesen' : 'antwortet-nicht';
}

/** „seit …“ in groben Stufen: unter einer Minute, Minuten, ab einer Stunde Stunden (Texte `startbild.dauer.*`). */
export function startbildDauer(sekunden: number | null | undefined): { art: 'kurz' | 'minuten' | 'stunden'; anzahl: number } {
  const s = typeof sekunden === 'number' && Number.isFinite(sekunden) ? Math.max(0, sekunden) : 0;
  if (s < 60) return { art: 'kurz', anzahl: 0 };
  if (s < 3600) return { art: 'minuten', anzahl: Math.floor(s / 60) };
  return { art: 'stunden', anzahl: Math.floor(s / 3600) };
}
