/**
 * Antwort eines Pakets auf einen Schritt einer Paket-Aktion (#1039) lesen und prüfen: Dialog-Beschreibung oder
 * Ergebnis – nur Daten, nie HTML oder JavaScript. Was nicht passt, ist ein Fehler des Pakets (die Person sieht „Das
 * Paket hat keine gültige Antwort gegeben“, die Werkbank den Grund).
 *
 * Regeln (Ergänzung Sicherheit):
 * - Nur die Feldarten Text (Absatz), Auswahl, Haken, Textfeld, Datum. Keine Passwort-Eingabe, kein Datei-Upload, keine
 *   Links: Texte bleiben Text (die Oberfläche setzt sie nie als HTML oder Markdown), Steuerzeichen fallen weg.
 * - Länge der Texte, Zahl der Felder und Optionen begrenzt (`grenzen.ts`).
 * - Mappe und Person kommen nie aus der Antwort: Das Ergebnis nennt nur Felder, Dateien und anzulegende Mappen – auf
 *   welche Mappe es wirkt, weiß nur Ablago.
 */
import { DIALOG_ARTEN, type AktionsDialog, type DialogArt, type DialogFeld } from '../../../shared/src/paketaktionen';
import { SCHLUESSEL, TYPVERWEIS } from '../../../shared/src/kennungen';
import { AKTION_ANTWORT_MAX, AKTION_FELDER_MAX, AKTION_KURZ_MAX, AKTION_OPTIONEN_MAX, AKTION_STAND_MAX, AKTION_TEXT_MAX } from '../grenzen';

const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** Steuerzeichen außer Zeilenende weg (keine unsichtbaren Richtungswechsel und Ähnliches), auf die Länge gekürzt. */
const STEUER = /(?!\n)[\p{Cc}\p{Cf}]/gu;
export function reinerText(v: unknown, max: number): string {
  return (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').replace(/\r\n?/g, '\n').replace(STEUER, '').trim().slice(0, max);
}
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Ergebnis eines Pakets (vor dem Anwenden). `datei`: Kennung einer Datei, die das Paket im Schritt abgelegt hat. */
export interface PaketErgebnis {
  meldung: string;
  felder?: Record<string, unknown>;
  dokument?: { datei: string; register?: string };
  mappen?: Array<{ typ: string; werte: Record<string, unknown> }>;
  herausgeben?: { datei: string };
}
export type PaketAntwort = { art: 'dialog'; dialog: AktionsDialog; stand: unknown } | { art: 'ergebnis'; ergebnis: PaketErgebnis };

/** Fehler in der Antwort eines Pakets (Grund für Werkbank und Protokoll). */
export class AntwortFehler extends Error {}

/** Liest die Antwort (JSON) eines Schritts. */
export function liesAntwort(text: string): PaketAntwort {
  let j: unknown;
  try { j = JSON.parse(text); } catch { throw new AntwortFehler('Antwort ist kein JSON.'); }
  if (!istObjekt(j)) throw new AntwortFehler('Antwort ist kein Objekt.');
  if (istObjekt(j.dialog) && j.ergebnis === undefined) {
    const stand = j.stand ?? null;
    if (Buffer.byteLength(JSON.stringify(stand)) > AKTION_STAND_MAX) throw new AntwortFehler(`stand ist größer als ${AKTION_STAND_MAX} Bytes.`);
    return { art: 'dialog', dialog: liesDialog(j.dialog), stand };
  }
  if (istObjekt(j.ergebnis) && j.dialog === undefined) return { art: 'ergebnis', ergebnis: liesErgebnis(j.ergebnis) };
  throw new AntwortFehler('Antwort braucht genau eins: dialog oder ergebnis.');
}

/** Dialog-Beschreibung prüfen; unbekannte Angaben fallen weg. */
export function liesDialog(d: Record<string, unknown>): AktionsDialog {
  const roh = Array.isArray(d.felder) ? d.felder : [];
  if (!roh.length) throw new AntwortFehler('dialog.felder ist leer.');
  if (roh.length > AKTION_FELDER_MAX) throw new AntwortFehler(`dialog.felder: höchstens ${AKTION_FELDER_MAX}.`);
  const schluessel = new Set<string>();
  const felder = roh.map((f, i) => liesFeld(f, `dialog.felder[${i + 1}]`, schluessel));
  if (!felder.some((f) => f.art !== 'text') && !reinerText(d.knopf, AKTION_KURZ_MAX)) throw new AntwortFehler('dialog: ohne Eingabe braucht es einen knopf.');
  return {
    titel: reinerText(d.titel, AKTION_KURZ_MAX), felder, knopf: reinerText(d.knopf, AKTION_KURZ_MAX),
    ...(d.gefahr === true ? { gefahr: true } : {}),
  };
}

/** Ein Feld eines Dialogs: Art aus der festen Liste, Schlüssel eindeutig, Texte als reiner Text. */
function liesFeld(f: unknown, wo: string, schluessel: Set<string>): DialogFeld {
  if (!istObjekt(f)) throw new AntwortFehler(`${wo}: kein Objekt.`);
  const art = String(f.art ?? '') as DialogArt;
  // Ausdrücklich: Passwort und Datei gibt es nicht (Ergänzung Sicherheit, Entscheidung Thomas 10.11.2026).
  if (!(DIALOG_ARTEN as readonly string[]).includes(art)) throw new AntwortFehler(`${wo}: Feldart „${String(f.art)}“ gibt es nicht (möglich: ${DIALOG_ARTEN.join(', ')}).`);
  if (art === 'text') {
    const text = reinerText(f.text, AKTION_TEXT_MAX);
    if (!text) throw new AntwortFehler(`${wo}: text ist leer.`);
    return { art, text };
  }
  const s = String(f.schluessel ?? '');
  if (!SCHLUESSEL.test(s)) throw new AntwortFehler(`${wo}: ungültiger schluessel.`);
  if (schluessel.has(s)) throw new AntwortFehler(`${wo}: schluessel „${s}“ doppelt.`);
  schluessel.add(s);
  const name = reinerText(f.name, AKTION_KURZ_MAX);
  if (!name) throw new AntwortFehler(`${wo}: name fehlt.`);
  const hilfe = reinerText(f.hilfe, AKTION_TEXT_MAX);
  const feld: DialogFeld = { art, schluessel: s, name, ...(hilfe ? { hilfe } : {}), ...(f.pflicht === true ? { pflicht: true } : {}) };
  if (art === 'auswahl') return { ...feld, ...liesAuswahl(f, wo) };
  if (art === 'haken' && typeof f.standard === 'boolean') feld.standard = f.standard;
  else if (art === 'datum' && typeof f.standard === 'string' && DATUM.test(f.standard)) feld.standard = f.standard;
  else if (art === 'textfeld' && typeof f.standard === 'string') feld.standard = reinerText(f.standard, AKTION_ANTWORT_MAX);
  return feld;
}

/** Optionen, mehrfach und Vorgabe einer Auswahl. */
function liesAuswahl(f: Record<string, unknown>, wo: string): Pick<DialogFeld, 'optionen' | 'mehrfach' | 'standard'> {
  const optionen = (Array.isArray(f.optionen) ? f.optionen : []).map((o) => (istObjekt(o) ? { wert: reinerText(o.wert, AKTION_KURZ_MAX), name: reinerText(o.name ?? o.wert, AKTION_KURZ_MAX) } : { wert: reinerText(o, AKTION_KURZ_MAX), name: reinerText(o, AKTION_KURZ_MAX) }))
    .filter((o) => o.wert && o.name);
  if (!optionen.length) throw new AntwortFehler(`${wo}: auswahl braucht optionen.`);
  if (optionen.length > AKTION_OPTIONEN_MAX) throw new AntwortFehler(`${wo}: höchstens ${AKTION_OPTIONEN_MAX} optionen.`);
  const werte = new Set(optionen.map((o) => o.wert));
  if (werte.size !== optionen.length) throw new AntwortFehler(`${wo}: optionen mit gleichem wert.`);
  const mehrfach = f.mehrfach === true;
  const standard = mehrfach && Array.isArray(f.standard) ? f.standard.map(String).filter((x) => werte.has(x))
    : !mehrfach && typeof f.standard === 'string' && werte.has(f.standard) ? f.standard : undefined;
  return { optionen, ...(mehrfach ? { mehrfach: true } : {}), ...(standard !== undefined ? { standard } : {}) };
}

/** Ergebnis prüfen: Meldung, Felder, Datei als Dokument, anzulegende Mappen, Datei zum Herausgeben. */
export function liesErgebnis(e: Record<string, unknown>): PaketErgebnis {
  const meldung = reinerText(e.meldung, AKTION_TEXT_MAX);
  const r: PaketErgebnis = { meldung };
  if (e.felder !== undefined) {
    if (!istObjekt(e.felder)) throw new AntwortFehler('ergebnis.felder ist kein Objekt.');
    for (const k of Object.keys(e.felder)) if (!SCHLUESSEL.test(k)) throw new AntwortFehler(`ergebnis.felder: ungültiges Feld „${k}“.`);
    r.felder = e.felder;
  }
  const datei = (x: unknown, wo: string) => {
    if (!istObjekt(x) || typeof x.datei !== 'string' || !/^d[0-9]{1,2}$/.test(x.datei)) throw new AntwortFehler(`${wo}: datei nennt eine Datei, die das Paket in diesem Schritt abgelegt hat (POST /dateien).`);
    return x;
  };
  if (e.dokument !== undefined) {
    const d = datei(e.dokument, 'ergebnis.dokument');
    if (d.register !== undefined && !SCHLUESSEL.test(String(d.register))) throw new AntwortFehler('ergebnis.dokument.register ist ungültig.');
    r.dokument = { datei: String(d.datei), ...(d.register !== undefined ? { register: String(d.register) } : {}) };
  }
  if (e.herausgeben !== undefined) r.herausgeben = { datei: String(datei(e.herausgeben, 'ergebnis.herausgeben').datei) };
  if (e.mappen !== undefined) {
    if (!Array.isArray(e.mappen) || e.mappen.length > AKTION_OPTIONEN_MAX) throw new AntwortFehler(`ergebnis.mappen: Liste mit höchstens ${AKTION_OPTIONEN_MAX} Mappen.`);
    r.mappen = e.mappen.map((m, i) => {
      if (!istObjekt(m) || !TYPVERWEIS.test(String(m.typ ?? '')) || !istObjekt(m.werte)) throw new AntwortFehler(`ergebnis.mappen[${i + 1}]: braucht typ und werte.`);
      return { typ: String(m.typ), werte: m.werte };
    });
  }
  if (!r.meldung && !r.felder && !r.dokument && !r.mappen && !r.herausgeben) throw new AntwortFehler('ergebnis ist leer.');
  return r;
}

/**
 * Antworten der Person auf einen Dialog prüfen – nur die Felder des Dialogs, im passenden Format; Pflicht muss gesetzt
 * sein. Liefert die bereinigten Werte oder je Feld einen Fehler.
 */
export function pruefeAntworten(d: AktionsDialog, roh: unknown): { werte: Record<string, unknown>; fehler: Record<string, string> } {
  const e = istObjekt(roh) ? roh : {};
  const werte: Record<string, unknown> = {};
  const fehler: Record<string, string> = {};
  for (const f of d.felder) {
    if (f.art === 'text' || !f.schluessel) continue;
    const r = pruefeEine(f, e[f.schluessel]);
    if ('fehler' in r) fehler[f.schluessel] = r.fehler;
    else werte[f.schluessel] = r.wert;
  }
  return { werte, fehler };
}

/** Eine Antwort: Wert im Format der Feldart oder Fehler (pflicht, ungueltig, lang). */
function pruefeEine(f: DialogFeld, v: unknown): { wert: unknown } | { fehler: string } {
  if (f.art === 'haken') return f.pflicht && v !== true ? { fehler: 'pflicht' } : { wert: v === true };
  if (f.art === 'auswahl' && f.mehrfach) {
    const erlaubt = new Set((f.optionen ?? []).map((o) => o.wert));
    const l = [...new Set((Array.isArray(v) ? v : []).map(String).filter((x) => erlaubt.has(x)))];
    return f.pflicht && !l.length ? { fehler: 'pflicht' } : { wert: l };
  }
  const s = typeof v === 'string' ? v : '';
  if (!s.trim()) return f.pflicht ? { fehler: 'pflicht' } : { wert: null };
  if (f.art === 'auswahl' && !(f.optionen ?? []).some((o) => o.wert === s)) return { fehler: 'ungueltig' };
  if (f.art === 'datum' && !DATUM.test(s)) return { fehler: 'ungueltig' };
  if (s.length > AKTION_ANTWORT_MAX) return { fehler: 'lang' };
  return { wert: f.art === 'textfeld' ? reinerText(s, AKTION_ANTWORT_MAX) : s };
}
