import { SCHLUESSEL } from './kennungen';

/**
 * Was ein Paket außer seinen Einstellungen im Manifest beschreibt, damit Ablago es einheitlich darstellt – das Paket
 * liefert nur Werte, nie Oberfläche (#996, #1004). Server und Oberfläche teilen diese Datei.
 *
 * - `code.anzeigen` (#996): Kennzahlen und Zustände, die das Paket meldet. Werte schreibt es in seinen eigenen
 *   Speicher unter `anzeige.<schluessel>`; Ablago zeigt sie in der Übersicht.
 * - `code.einstellungen_pruefen` (#996): Ablago ruft vor dem Speichern die Prüffunktion des Pakets auf (Aktion
 *   `einstellungen_pruefen`, ohne Schreibrechte); sie meldet Fehler je Feld.
 * - `code.ausprobieren` (#1004): Das Paket bietet „Ausprobieren“ an – für welches Ereignis und welche Dateiarten.
 */

export type AnzeigeArt = 'zahl' | 'anteil' | 'text' | 'zustand';
export const ANZEIGE_ARTEN: readonly AnzeigeArt[] = ['zahl', 'anteil', 'text', 'zustand'];
export interface PaketAnzeige { schluessel: string; name: string; art: AnzeigeArt; hilfe?: string }
export interface PaketAusprobieren { ereignis: string; dateiarten: string[]; hilfe?: string }
export interface PaketReiterAngaben { anzeigen?: PaketAnzeige[]; ausprobieren?: PaketAusprobieren; einstellungenPruefen?: true }

/** Höchstens so viele Anzeigen je Paket; Schlüssel im Speicher des Pakets. */
export const ANZEIGEN_MAX = 12;
export const ANZEIGE_SPEICHER = 'anzeige.';
/** Aktion, mit der Ablago die Prüffunktion des Pakets aufruft (#996). */
export const PRUEF_AKTION = 'einstellungen_pruefen';
/** Dateiart: „application/pdf“, „image/png“ oder „image/*“. */
const DATEIART = /^[a-z]+\/(\*|[a-z0-9][a-z0-9.+-]*)$/;

const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** code.anzeigen: höchstens ANZEIGEN_MAX, Schlüssel eindeutig, bekannte Art. */
function liesAnzeigen(roh: unknown, fehler: string[]): PaketAnzeige[] {
  if (!Array.isArray(roh)) { fehler.push('code.anzeigen: Liste erwartet.'); return []; }
  if (roh.length > ANZEIGEN_MAX) fehler.push(`code.anzeigen: höchstens ${ANZEIGEN_MAX} Einträge.`);
  const l: PaketAnzeige[] = [];
  for (const [i, a] of roh.slice(0, ANZEIGEN_MAX).entries()) {
    const wo = `code.anzeigen[${i + 1}]`;
    if (!istObjekt(a) || !SCHLUESSEL.test(str(a.schluessel))) { fehler.push(`${wo}: ungültiger Schlüssel.`); continue; }
    if (!ANZEIGE_ARTEN.includes(str(a.art) as AnzeigeArt)) { fehler.push(`${wo}/${str(a.schluessel)}: art ist eine von ${ANZEIGE_ARTEN.join(', ')}.`); continue; }
    if (l.some((x) => x.schluessel === a.schluessel)) { fehler.push(`${wo}: Schlüssel „${str(a.schluessel)}“ doppelt.`); continue; }
    l.push({ schluessel: str(a.schluessel), name: str(a.name).trim().slice(0, 100) || str(a.schluessel), art: str(a.art) as AnzeigeArt, ...(a.hilfe ? { hilfe: str(a.hilfe).slice(0, 300) } : {}) });
  }
  return l;
}

/** code.ausprobieren: ein abonniertes Ereignis und 1 bis 20 Dateiarten. */
function liesAusprobieren(a: unknown, ereignisse: readonly string[], fehler: string[]): PaketAusprobieren | null {
  if (!istObjekt(a)) { fehler.push('code.ausprobieren: Objekt mit ereignis und dateiarten erwartet.'); return null; }
  const arten = Array.isArray(a.dateiarten) ? a.dateiarten.map(str) : [];
  const ereignisOk = ereignisse.includes(str(a.ereignis));
  const artenOk = arten.length > 0 && arten.length <= 20 && arten.every((x) => DATEIART.test(x));
  if (!ereignisOk) fehler.push(`code.ausprobieren: ereignis „${str(a.ereignis)}“ muss in code.ereignisse stehen.`);
  if (!artenOk) fehler.push('code.ausprobieren: dateiarten ist eine Liste mit 1 bis 20 Dateiarten wie „application/pdf“ oder „image/*“.');
  return ereignisOk && artenOk ? { ereignis: str(a.ereignis), dateiarten: [...new Set(arten)], ...(a.hilfe ? { hilfe: str(a.hilfe).slice(0, 300) } : {}) } : null;
}

/** Liest code.anzeigen, code.einstellungen_pruefen und code.ausprobieren; ereignisse: die das Paket abonniert. */
export function liesReiterAngaben(code: unknown, ereignisse: readonly string[] = []): { angaben: PaketReiterAngaben | null; fehler: string[] } {
  const fehler: string[] = [];
  if (!istObjekt(code)) return { angaben: null, fehler };
  const angaben: PaketReiterAngaben = {};
  const anzeigen = code.anzeigen === undefined ? [] : liesAnzeigen(code.anzeigen, fehler);
  if (anzeigen.length) angaben.anzeigen = anzeigen;
  if (code.einstellungen_pruefen === true) angaben.einstellungenPruefen = true;
  else if (code.einstellungen_pruefen !== undefined) fehler.push('code.einstellungen_pruefen: nur true.');
  const probe = code.ausprobieren === undefined ? null : liesAusprobieren(code.ausprobieren, ereignisse, fehler);
  if (probe) angaben.ausprobieren = probe;
  return { angaben: Object.keys(angaben).length ? angaben : null, fehler };
}

/** Passt die Datei zu den Dateiarten des Ausprobierens (`image/*` = alle Bilder)? */
export const dateiartPasst = (arten: readonly string[], typ: string) => arten.some((a) => a === typ || (a.endsWith('/*') && typ.startsWith(a.slice(0, -1))));

/**
 * Wert einer Anzeige, wie das Paket ihn in seinen Speicher schreibt: zahl „1234“, anteil „1234/1300“, text beliebig
 * (höchstens 200 Zeichen), zustand „ok“, „warnung“ oder „fehler“, optional mit Text dahinter („warnung: Modell fehlt“).
 * null: kein oder kein passender Wert.
 */
export type AnzeigeWert =
  | { art: 'zahl'; zahl: number } | { art: 'anteil'; zahl: number; von: number } | { art: 'text'; text: string }
  | { art: 'zustand'; zustand: 'ok' | 'warnung' | 'fehler'; text: string };
export function anzeigeWert(art: AnzeigeArt, roh: string | undefined | null): AnzeigeWert | null {
  const s = (roh ?? '').trim();
  if (!s) return null;
  if (art === 'zahl') return /^-?\d+([.,]\d+)?$/.test(s) ? { art, zahl: Number(s.replace(',', '.')) } : null;
  if (art === 'anteil') { const m = /^(\d+)\s*\/\s*(\d+)$/.exec(s); return m ? { art, zahl: Number(m[1]), von: Number(m[2]) } : null; }
  if (art === 'text') return { art, text: s.slice(0, 200) };
  const m = /^(ok|warnung|fehler)\s*(?::\s*(.*))?$/s.exec(s);
  return m ? { art, zustand: m[1] as 'ok' | 'warnung' | 'fehler', text: (m[2] ?? '').slice(0, 200) } : null;
}
