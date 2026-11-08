/**
 * Seite „Dokument übernehmen“ (#934) – reine Funktionen für Oberfläche und Tests:
 *
 * - `textformen`: wie ein erkannter Wert im Dokument stehen kann (Datum „03.11.2026“ statt „2026-11-03“, Betrag
 *   „84,20“ …) – damit findet `stelleVon` die Fundstelle in den Wörtern mit Lage und zeichnet dort den Rahmen.
 * - `wertAusText`: Text vom Dokument (gezogen, markiert oder ein Rahmen) als Wert für ein Feld – Datum, Zahl, Betrag
 *   und Auswahl werden gelesen, Text bleibt Text. null: passt nicht in dieses Feld.
 *
 * Wörter mit Lage kommen aus der Textebene des PDFs bzw. der Texterkennung (`GET /dokumente/{id}/wortpositionen`).
 */
import { optionTexte } from './beschriftung';
import { artVon, type Erkennungsart } from './erkennung';
import { vorlageFelder, wirksameVorlage, type Betrag, type Feld, type Mappentyp, type Wert } from './model';
import { kreisVon } from './nummernkreis';
import { bereicheVon, findeBegriff, type Bereich, type SchwaerzSeite } from './schwaerzen';

const MONATE: Record<string, number> = {
  januar: 1, jan: 1, january: 1, februar: 2, feb: 2, february: 2, maerz: 3, märz: 3, mrz: 3, march: 3, mar: 3, april: 4, apr: 4,
  mai: 5, may: 5, juni: 6, jun: 6, june: 6, juli: 7, jul: 7, july: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10, october: 10, oct: 10, november: 11, nov: 11, dezember: 12, dez: 12, december: 12, dec: 12,
};
const MONATSNAMEN = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const zwei = (n: number) => String(n).padStart(2, '0');

/** Betrag deutsch und englisch geschrieben: „1.234,56“, „1234,56“, „1,234.56“, „1234.56“. */
function betragTexte(n: number): string[] {
  const fest = Math.abs(n).toFixed(2);
  const [ganz, nach] = fest.split('.');
  const tausend = (s: string, t: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, t);
  return [...new Set([`${tausend(ganz, '.')},${nach}`, `${ganz},${nach}`, `${tausend(ganz, ',')}.${nach}`, `${ganz}.${nach}`])];
}

/**
 * Wie ein Wert im Dokument stehen kann, längste Form zuerst. Verweise haben keine Textform (dafür gibt es die Belege
 * aus dem Abgleich), Ja/Nein und Passwörter auch nicht.
 */
export function textformen(f: Pick<Feld, 'typ' | 'beschriftungen'>, w: Wert): string[] {
  if (w == null || w === '') return [];
  if (f.typ === 'referenz' || f.typ === 'janein' || f.typ === 'passwort') return [];
  if (Array.isArray(w)) return w.flatMap((x) => textformen(f, x as Wert));
  if (f.typ === 'datum' && typeof w === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w);
    if (!m) return [w];
    const [j, mo, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return [`${t}. ${MONATSNAMEN[mo - 1]} ${j}`, `${zwei(t)}.${zwei(mo)}.${j}`, `${t}.${mo}.${j}`, w, `${zwei(t)}.${zwei(mo)}.${String(j).slice(2)}`];
  }
  if (f.typ === 'betrag' && typeof w === 'object' && typeof (w as Betrag).betrag === 'number') return betragTexte((w as Betrag).betrag);
  if (f.typ === 'zahl' && typeof w === 'number') return [...new Set([String(w), String(w).replace('.', ','), ...(Number.isInteger(w) ? [] : betragTexte(w))])];
  if (f.typ === 'auswahl' && typeof w === 'string') return [...new Set([w, ...optionTexte(f, w)])].sort((a, b) => b.length - a.length);
  return [String(w)];
}

/** Kern einer Fundstelle aus der Erkennung: ohne „… “ am Anfang und „ …“ am Ende. */
const kern = (fundstelle: string) => fundstelle.replace(/^…\s*/, '').replace(/\s*…$/, '').trim();

/**
 * Wo steht der Wert im Dokument? Die erste Textform, die sich in den Wörtern findet – liegt die Fundstelle der
 * Erkennung (ein Textausschnitt) dort auch, die Stelle darin. Ohne Treffer zur Not die Fundstelle selbst, wenn sie
 * kurz ist. null: nicht zu finden (oder keine Wörter mit Lage). Die Bereiche sind relativ zur Seite (0…1).
 */
export function stelleVon(seiten: SchwaerzSeite[], formen: string[], fundstelle = ''): Bereich[] | null {
  if (!seiten.some((s) => s.woerter.length)) return null;
  const k = kern(fundstelle);
  const umgebung = k.length >= 6 && k.length <= 200 ? findeBegriff(seiten, k) : [];
  for (const form of formen) {
    if (form.trim().length < 2) continue;
    const funde = findeBegriff(seiten, form);
    if (!funde.length) continue;
    const drin = funde.find((f) => umgebung.some((u) => u.seite === f.seite && f.woerter.every((w) => u.woerter.includes(w))));
    return bereicheVon(seiten, [drin ?? funde[0]]);
  }
  if (umgebung.length && k.length <= 60) return bereicheVon(seiten, [umgebung[0]]);
  return null;
}

/** Datum aus Text: „03.11.2026“, „3.11.26“, „2026-11-03“, „3. November 2026“, „November 3, 2026“. */
export function datumAusText(text: string): string | null {
  const s = text.trim().toLowerCase();
  const gueltig = (j: number, m: number, t: number) => {
    if (j < 100) j += j < 70 ? 2000 : 1900;
    const d = new Date(Date.UTC(j, m - 1, t));
    return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t ? `${j}-${zwei(m)}-${zwei(t)}` : null;
  };
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return gueltig(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})(?!\d)/.exec(s);
  if (m) return gueltig(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /(\d{1,2})\.?\s+([a-zäöü]+)\.?\s+(\d{4})/.exec(s);
  if (m && MONATE[m[2]]) return gueltig(Number(m[3]), MONATE[m[2]], Number(m[1]));
  m = /([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  if (m && MONATE[m[1]]) return gueltig(Number(m[3]), MONATE[m[1]], Number(m[2]));
  return null;
}

/** Zahl aus Text, deutsch oder englisch geschrieben: „1.234,56“, „1234,5“, „1,234.56“, „-3“. */
export function zahlAusText(text: string): number | null {
  const m = /-?\d[\d.,' ]*/.exec(text.replace(/ /g, ' '));
  if (!m) return null;
  let s = m[0].replace(/[' ]/g, '').replace(/[.,]$/, '');
  const komma = s.lastIndexOf(','), punkt = s.lastIndexOf('.');
  if (komma > punkt) s = s.replace(/\./g, '').replace(',', '.');
  else if (punkt > komma && komma >= 0) s = s.replace(/,/g, '');
  // „1.234“ ohne Komma: deutscher Tausenderpunkt, wenn genau drei Ziffern folgen.
  else if (punkt >= 0 && /^\-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const WAEHRUNG: Array<[RegExp, string]> = [[/€|\beur\b|\beuro\b/i, 'EUR'], [/\$|\busd\b/i, 'USD'], [/£|\bgbp\b/i, 'GBP'], [/\bchf\b|\bfr\./i, 'CHF']];

/**
 * Text vom Dokument als Wert für ein Feld (#934). Text, Langtext und formatierter Text nehmen ihn, wie er ist (ohne
 * Zeilenumbrüche in einzeiligen Feldern, gekürzt auf die Höchstlänge); Datum, Zahl und Betrag werden gelesen;
 * Auswahl nur, wenn der Text einer Option entspricht. Verweise, Ja/Nein und Passwörter nie – null.
 */
export function wertAusText(f: Pick<Feld, 'typ' | 'optionen' | 'beschriftungen' | 'maxLen' | 'waehrung'>, text: string): Wert | null {
  const roh = text.replace(/ /g, ' ').trim();
  if (!roh) return null;
  switch (f.typ) {
    case 'text': { const s = roh.replace(/\s+/g, ' '); return f.maxLen ? s.slice(0, f.maxLen) : s; }
    case 'langtext': case 'formatiert': return f.maxLen ? roh.slice(0, f.maxLen) : roh;
    case 'datum': return datumAusText(roh);
    case 'zahl': return zahlAusText(roh);
    case 'betrag': {
      const n = zahlAusText(roh);
      if (n === null) return null;
      const w = WAEHRUNG.find(([re]) => re.test(roh))?.[1] ?? f.waehrung ?? 'EUR';
      return { betrag: Math.round(n * 100) / 100, waehrung: w };
    }
    case 'auswahl': {
      const klein = roh.toLocaleLowerCase('de-DE');
      const o = (f.optionen ?? []).find((x) => [x, ...optionTexte(f, x)].some((y) => y.toLocaleLowerCase('de-DE') === klein));
      return o ?? null;
    }
    default: return null;
  }
}

/** Arten mit festem Aufbau (#934): Nummern, Kontodaten, Kontakt, Anschrift in Ziffern – dort hat ein Betreff nichts zu suchen. */
const FESTE_ARTEN: Erkennungsart[] = ['nummer', 'iban', 'ustid', 'email', 'internet', 'telefon', 'mobil', 'fax', 'plz', 'hausnummer', 'datum', 'betrag'];

/**
 * Feld für den Betreff der Post als schwachen Vorschlag (#934, Thomas 08.11.2026): das **erste Feld der Titel-Vorlage**,
 * aber nur, wenn es ein Textfeld ohne festes Format ist – kein Nummernkreis, kein Format, kein Muster, nicht eindeutig,
 * nicht ausgeblendet und keine Nummer (Rechnungsnummer, Kennzeichen …). Sonst keins: Der Betreff einer Rechnung landet
 * so nicht in der Rechnungsnummer. Zahl, Datum, Auswahl und Verweis sind ohnehin keine Textfelder.
 */
export function betreffFeld(typ: Pick<Mappentyp, 'felder' | 'titelVorlage'>): Feld | undefined {
  const erstes = vorlageFelder(wirksameVorlage(typ))[0];
  const f = typ.felder.find((x) => x.key === erstes);
  if (!f || f.typ !== 'text' || f.format || f.muster || kreisVon(f) || f.eindeutig || f.ausgeblendet) return undefined;
  const art = artVon(f);
  return art && FESTE_ARTEN.includes(art) ? undefined : f;
}
