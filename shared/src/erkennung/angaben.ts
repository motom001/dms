/** Erkennung (#1278 aus erkennung.ts): Angaben aus dem Volltext lesen – Datum, Betrag, Nummern, Briefkopf, Person. */
import type { Betrag } from '../model/basis';

import { klein } from './arten';

/* ---------- Angaben aus dem Text ---------- */

export type Sicherheit = 'hoch' | 'mittel' | 'niedrig';
export interface Fund<T = string> {
  wert: T;
  sicherheit: Sicherheit;
  fundstelle: string;
}
export interface Nummernfund extends Fund {
  label: string;
}
export interface Briefkopf {
  name?: string;
  strasse?: string;
  hausnummer?: string;
  plz?: string;
  ort?: string;
  fundstelle: string;
  /** Aus der Absenderzeile über dem Anschriftfeld (#1043): Hier steht sicher der Aussteller, nicht der Empfänger. */
  zeile?: true;
}
export interface Personfund {
  vorname?: string;
  nachname?: string;
  funktion?: string;
  organisation?: string;
  fundstelle: string;
}

/** Was die Muster im Text finden. */
export interface Angaben {
  emails: Fund[];
  internet: Fund[];
  ibans: Fund[];
  ustids: Fund[];
  telefon: Fund[];
  mobil: Fund[];
  fax: Fund[];
  datum: Fund | null;
  betrag: Fund<Betrag> | null;
  nummern: Nummernfund[];
  briefkopf: Briefkopf | null;
  person: Personfund | null;
  /** „Gutschrift“, „Erstattung“ oder „Rückzahlung“ im Kopf oder neben dem Betrag (#1043); fehlt = nicht gesucht. */
  gutschrift?: Fund | null;
}

const MONATE = ['januar', 'februar', 'maerz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
export const FREIE_MAILDIENSTE = new Set([
  'gmail.com',
  'googlemail.com',
  'gmx.de',
  'gmx.net',
  'web.de',
  't-online.de',
  'outlook.com',
  'outlook.de',
  'hotmail.com',
  'hotmail.de',
  'yahoo.com',
  'yahoo.de',
  'icloud.com',
  'me.com',
  'posteo.de',
  'mailbox.org',
  'freenet.de',
  'aol.com',
  'live.de',
  'live.com',
  'protonmail.com',
  'proton.me',
  'example.org',
  'example.com',
  'example.net',
]);
const FIRMA =
  /\b(GmbH|AG|KG|OHG|e\.\s?V\.|eV|UG|GbR|mbH|SE|eG|KGaA|PartG|Ltd\.?|Inc\.?|Stadtwerke|Sparkasse|Volksbank|Raiffeisenbank|Bank|Versicherung\w*|Finanzamt|Amt|Landratsamt|Rathaus|Stadtverwaltung|Gemeinde|Praxis|Kanzlei|Krankenkasse|AOK|Klinik\w*|Verwaltung|Hausverwaltung|Genossenschaft|Verein|Werke)\b/;
const FUNKTION =
  /(?:^|[\s(])[\wäöüÄÖÜß-]*(gesch[äa]ftsf[üu]hrer|inhaber|leiter|berater|manager|meister|sachbearbeiter|assisten[tz]|direktor|ingenieur|referent|vorstand|rechtsanw[äa]lt|steuerberater|architekt|techniker|elektriker|installateur|prokurist|verwalter|[äa]rzt|vertrieb|partner|ceo|cto|cfo|head of|sales|account)[\wäöüß]*/i;
const STRASSE =
  /^(.{2,50}?(?:stra(?:ß|ss)e|str\.|weg|allee|platz|gasse|ring|damm|ufer|chaussee|steig|pfad|markt|berg|hof|park|wall|graben|zeile|anger|garten|tor|kamp|feld))\s+(\d{1,4}\s?[a-zA-Z]?(?:\s?[-–/]\s?\d{1,4}\s?[a-zA-Z]?)?)$/i;
const STRASSE_LOCKER = /^([A-Za-zÄÖÜäöüß][\wÄÖÜäöüß.\- ]{2,50}?)\s+(\d{1,4}\s?[a-zA-Z]?(?:\s?[-–/]\s?\d{1,4}\s?[a-zA-Z]?)?)$/;
const PLZ_ORT = /^(?:D-)?(\d{5})\s+([A-ZÄÖÜ][\wäöüßÄÖÜ.\-]*(?:[ /][A-ZÄÖÜa-zäöüß(][\wäöüßÄÖÜ.\-()]*){0,3})$/;

/** Länge einer IBAN je Land (SWIFT IBAN Registry); auch für das Feldformat IBAN (#535). */
export const IBAN_LAENGEN: Readonly<Record<string, number>> = {
  AD: 24,
  AE: 23,
  AL: 28,
  AT: 20,
  AZ: 28,
  BA: 20,
  BE: 16,
  BG: 22,
  BH: 22,
  BI: 27,
  BR: 29,
  BY: 28,
  CH: 21,
  CR: 22,
  CY: 28,
  CZ: 24,
  DE: 22,
  DJ: 27,
  DK: 18,
  DO: 28,
  EE: 20,
  EG: 29,
  ES: 24,
  FI: 18,
  FK: 18,
  FO: 18,
  FR: 27,
  GB: 22,
  GE: 22,
  GI: 23,
  GL: 18,
  GR: 27,
  GT: 28,
  HR: 21,
  HU: 28,
  IE: 22,
  IL: 23,
  IQ: 23,
  IS: 26,
  IT: 27,
  JO: 30,
  KW: 30,
  KZ: 20,
  LB: 28,
  LC: 32,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  LY: 25,
  MC: 27,
  MD: 24,
  ME: 22,
  MK: 19,
  MN: 20,
  MR: 27,
  MT: 31,
  MU: 30,
  NI: 28,
  NL: 18,
  NO: 15,
  OM: 23,
  PK: 24,
  PL: 28,
  PS: 29,
  PT: 25,
  QA: 29,
  RO: 24,
  RS: 22,
  RU: 33,
  SA: 24,
  SC: 31,
  SD: 18,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
  SO: 23,
  ST: 25,
  SV: 28,
  TL: 23,
  TN: 24,
  TR: 26,
  UA: 29,
  VA: 22,
  VG: 24,
  XK: 20,
  YE: 30,
};

/** IBAN prüfen (Länge je Land und Prüfziffer nach ISO 13616). */
export function istIban(s: string): boolean {
  const i = s.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(i)) return false;
  const laenge = IBAN_LAENGEN[i.slice(0, 2)];
  if (laenge && i.length !== laenge) return false;
  const umgestellt = (i.slice(4) + i.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const z of umgestellt) rest = (rest * 10 + Number(z)) % 97;
  return rest === 1;
}

/** Textstelle um einen Fund: seine Zeile, höchstens 40 Zeichen davor und danach, an Wortgrenzen mit „…“ gekürzt. */
export const ausschnitt = (text: string, i: number, laenge: number) => {
  const zeile = text.lastIndexOf('\n', i) + 1;
  const ende = (() => {
    const n = text.indexOf('\n', i + laenge);
    return n < 0 ? text.length : n;
  })();
  let a = Math.max(zeile, i - 40);
  let e = Math.min(ende, i + laenge + 40);
  if (a > zeile) {
    const l = text.indexOf(' ', a);
    a = l >= 0 && l < i ? l + 1 : a;
  }
  if (e < ende) {
    const l = text.lastIndexOf(' ', e);
    e = l > i + laenge ? l : e;
  }
  return `${a > zeile ? '… ' : ''}${text.slice(a, e).replace(/\s+/g, ' ').trim()}${e < ende ? ' …' : ''}`;
};
export const datumIso = (t: number, m: number, j: number) => {
  if (j < 100) j += j < 70 ? 2000 : 1900;
  const d = new Date(Date.UTC(j, m - 1, t));
  if (d.getUTCFullYear() !== j || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== t || j < 1900 || j > 2100) return null;
  return `${String(j).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(t).padStart(2, '0')}`;
};
/** Deutsche Zahl mit Komma (1.234,56) oder Punkt (1234.56) lesen. */
const zahlAus = (s: string): number | null => {
  const t = s.replace(/\s/g, '');
  const n = /,\d{1,2}$/.test(t)
    ? Number(t.replace(/\./g, '').replace(',', '.'))
    : /\.\d{2}$/.test(t)
      ? Number(t.replace(/,/g, ''))
      : Number(t.replace(/\./g, ''));
  return Number.isFinite(n) ? n : null;
};

/** vCard (z. B. eine .vcf-Datei als „Dokument“) direkt lesen. */
function ausVcard(text: string, a: Angaben): boolean {
  if (!/BEGIN:VCARD/i.test(text)) return false;
  const zeilen = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const wert = (z: string) => z.slice(z.indexOf(':') + 1).trim();
  const p: Personfund = { fundstelle: 'vCard' };
  for (const z of zeilen) {
    const k = z.slice(0, z.indexOf(':')).toUpperCase();
    const fund = (w: string): Fund => ({ wert: w, sicherheit: 'hoch', fundstelle: `vCard: ${w}` });
    if (k === 'N' || k.startsWith('N;')) {
      const [nach, vor] = wert(z).split(';');
      if (nach) p.nachname = nach;
      if (vor) p.vorname = vor;
    } else if (k === 'ORG' || k.startsWith('ORG;')) p.organisation = wert(z).split(';')[0];
    else if (k === 'TITLE' || k.startsWith('TITLE;')) p.funktion = wert(z);
    else if (k.startsWith('EMAIL')) a.emails.push(fund(wert(z)));
    else if (k.startsWith('URL')) a.internet.push(fund(wert(z)));
    else if (k.startsWith('TEL')) (/CELL/.test(k) ? a.mobil : /FAX/.test(k) ? a.fax : a.telefon).push(fund(wert(z)));
    else if (k.startsWith('ADR')) {
      const [, , strasse, ort, , plz] = wert(z).split(';');
      const s = STRASSE.exec((strasse ?? '').trim());
      a.briefkopf = {
        ...(a.briefkopf ?? {}),
        ...(s ? { strasse: s[1].trim(), hausnummer: s[2].replace(/\s/g, '') } : strasse ? { strasse } : {}),
        ...(plz ? { plz } : {}),
        ...(ort ? { ort } : {}),
        fundstelle: 'vCard',
      };
    }
  }
  if (p.organisation) a.briefkopf = { ...(a.briefkopf ?? { fundstelle: 'vCard' }), name: p.organisation };
  if (p.vorname || p.nachname) a.person = p;
  return true;
}

/** Alle Angaben, die die Muster in einem Text finden. Reine Funktion, keine Rechenzeit der Rede wert. */
export function findeAngaben(roh: string): Angaben {
  const text = (roh ?? '').replace(/\r/g, '').replace(/ /g, ' ').slice(0, 200_000);
  const a: Angaben = {
    emails: [],
    internet: [],
    ibans: [],
    ustids: [],
    telefon: [],
    mobil: [],
    fax: [],
    datum: null,
    betrag: null,
    nummern: [],
    briefkopf: null,
    person: null,
  };
  if (ausVcard(text, a)) return a;
  const doppelt = (l: Fund[], w: string) => l.some((x) => x.wert.toLowerCase() === w.toLowerCase());

  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    const w = m[0].replace(/\.$/, '');
    if (!doppelt(a.emails, w)) a.emails.push({ wert: w, sicherheit: 'hoch', fundstelle: ausschnitt(text, m.index!, w.length) });
  }
  for (const m of text.matchAll(/\b(?:https?:\/\/)?(www\.[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?:\/[^\s]*)?/gi)) {
    const w = m[1].toLowerCase();
    if (!doppelt(a.internet, w)) a.internet.push({ wert: w, sicherheit: 'hoch', fundstelle: ausschnitt(text, m.index!, m[0].length) });
  }
  for (const m of text.matchAll(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,4})?\b/g)) {
    if (!istIban(m[0])) continue;
    const w = m[0].replace(/\s/g, '').replace(/(.{4})(?!$)/g, '$1 ');
    if (!doppelt(a.ibans, w)) a.ibans.push({ wert: w, sicherheit: 'hoch', fundstelle: ausschnitt(text, m.index!, m[0].length) });
  }
  for (const m of text.matchAll(
    /\b(?:USt\.?[- ]?(?:Id\.?|IdNr\.?|Ident\w*)[- ]?(?:Nr\.?)?|Umsatzsteuer[- ]?(?:Id\w*|Identifikationsnummer)|VAT(?: ID| No\.?)?)\s*[:.]?\s*([A-Z]{2}\s?[0-9A-Z]{8,12})\b|\b(DE\s?\d{9})\b/gi,
  )) {
    const w = (m[1] ?? m[2]).replace(/\s/g, '').toUpperCase();
    if (!doppelt(a.ustids, w))
      a.ustids.push({ wert: w, sicherheit: m[1] ? 'hoch' : 'mittel', fundstelle: ausschnitt(text, m.index!, m[0].length) });
  }
  // Telefon, Mobil, Fax: an der Beschriftung erkannt.
  for (const m of text.matchAll(
    /(?:^|[\s|·,;])(Tel(?:efon)?\.?|Fon|Phone|T|Mobil(?:telefon)?|Handy|Mobile|M|Fax|Telefax|F)\s*[.:]?\s*(\+?\(?\d[\d ()/\-–.]{5,22}\d)/gim,
  )) {
    if (m[1].length === 1 && !/^[TMF]$/.test(m[1])) continue;
    const art = /^(Mobil|Handy|Mobile|M$)/i.test(m[1]) ? 'mobil' : /^(Fax|Telefax|F)$/i.test(m[1]) ? 'fax' : 'telefon';
    const w = m[2].replace(/\s+/g, ' ').trim();
    if ((w.match(/\d/g) ?? []).length < 6) continue;
    const ziel = art === 'mobil' ? a.mobil : art === 'fax' ? a.fax : a.telefon;
    if (!doppelt(ziel, w)) ziel.push({ wert: w, sicherheit: 'hoch', fundstelle: ausschnitt(text, m.index!, m[0].length) });
  }
  // Nummern mit Beschriftung: „Kundennummer: 100-4711“, „Rechnungs-Nr. R-2026-0042“, „Vertragsnr 55 12 34“.
  const NUMMERN =
    /\b((?:Kunden|Vertrags|Rechnungs|Versicherungs|Mitglieds|Policen|Konto|Bestell|Auftrags|Z[äa]hler|Steuer|Akten|Versicherten|Patienten|Beitrags|Mandats|Referenz|Buchungs|Belegs?|Objekt|Mieter|Darlehens|Vorgangs|Schadens?|Lieferschein)[- ]?(?:nummer|nr\.?)|Kd\.?[- ]?Nr\.?|Rg\.?[- ]?Nr\.?|Re\.?[- ]?Nr\.?|Kassenzeichen|Aktenzeichen|Az\.|Unser Zeichen|Ihr Zeichen)\s*[:.]?\s*([A-Z0-9][A-Z0-9\-/.]*(?: [0-9][0-9\-/.]*){0,3})/gi;
  for (const m of text.matchAll(NUMMERN)) {
    const w = m[2].replace(/[.\-/]+$/, '').trim();
    if (!/\d/.test(w) || w.length < 3 || w.length > 40) continue;
    const label = beschriftung(m[1]);
    if (!a.nummern.some((x) => x.label === label && x.wert === w))
      a.nummern.push({ label, wert: w, sicherheit: 'hoch', fundstelle: ausschnitt(text, m.index!, m[0].length) });
  }
  a.datum = findeDatum(text);
  a.betrag = findeBetrag(text);
  const zeilen = text
    .split('\n')
    .map((z) => z.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  a.briefkopf = findeBriefkopf(zeilen);
  a.person = findePerson(zeilen, a);
  a.gutschrift = findeGutschrift(text, a.betrag);
  return a;
}

/** Einheitliche Beschriftung einer Nummer, z. B. „Kd.-Nr.“ → „Kundennummer“, „Rechnungs-Nr.“ → „Rechnungsnummer“. */
function beschriftung(roh: string): string {
  const r = roh.trim().replace(/\s+/g, ' ');
  const k = klein(r).replace(/[^a-z]/g, '');
  if (/^kd/.test(k)) return 'Kundennummer';
  if (/^(rg|re)nr/.test(k)) return 'Rechnungsnummer';
  if (k === 'az' || k.startsWith('aktenzeichen')) return 'Aktenzeichen';
  if (k.startsWith('kassenzeichen')) return 'Kassenzeichen';
  if (k.startsWith('unserzeichen') || k.startsWith('ihrzeichen')) return r;
  const stamm = r.replace(/[- ]?(nummer|nr\.?)$/i, '').replace(/[-\s.]+$/, '');
  return `${stamm.charAt(0).toUpperCase()}${stamm.slice(1).toLowerCase()}nummer`;
}

/** Datum des Schreibens: beschriftet („Datum:“), in der Ortszeile („Dresden, 12.03.2026“) oder das erste im Kopf. */
function findeDatum(text: string): Fund | null {
  const kandidaten: Array<{ wert: string; punkte: number; i: number; laenge: number }> = [];
  const RE =
    /(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})\b|(\d{1,2})\.\s?(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Jan|Feb|Mär|Apr|Jun|Jul|Aug|Sep|Sept|Okt|Nov|Dez)\.?\s+(\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/gi;
  for (const m of text.matchAll(RE)) {
    let iso: string | null = null;
    if (m[1]) iso = datumIso(Number(m[1]), Number(m[2]), Number(m[3]));
    else if (m[4]) {
      const mon = MONATE.findIndex((x) => x.startsWith(klein(m[5]).slice(0, 3)));
      iso = mon >= 0 ? datumIso(Number(m[4]), mon + 1, Number(m[6])) : null;
    } else iso = datumIso(Number(m[9]), Number(m[8]), Number(m[7]));
    if (!iso) continue;
    const vorher = text.slice(Math.max(0, m.index! - 40), m.index!);
    const zeile = text.slice(text.lastIndexOf('\n', m.index!) + 1, m.index!);
    let punkte = 1 - m.index! / Math.max(1, text.length);
    if (/(Datum|Date|Rechnungsdatum|Briefdatum)\s*[:.]?\s*$/i.test(vorher)) punkte += 3;
    else if (/^[A-ZÄÖÜ][\wäöüß. \-()]{1,40},\s*(den)?$/.test(zeile.trim())) punkte += 3;
    else if (/\bden\s*$/i.test(vorher)) punkte += 1.5;
    if (
      /(geb(oren|\.)|f[äa]llig|zahlbar|bis( zum)?|ab( dem)?|vom|zum|per|seit|Zeitraum|Leistungszeitraum|Lieferdatum|g[üu]ltig)\s*[:.]?\s*$/i.test(
        vorher,
      )
    )
      punkte -= 2;
    kandidaten.push({ wert: iso, punkte, i: m.index!, laenge: m[0].length });
  }
  // Nur Daten, die nicht offensichtlich etwas anderes meinen („zum 1. Januar“, „fällig am“, „gültig bis“).
  const best = kandidaten.filter((k) => k.punkte >= 0).sort((x, y) => y.punkte - x.punkte)[0];
  if (!best) return null;
  return {
    wert: best.wert,
    sicherheit: best.punkte >= 3 ? 'hoch' : best.punkte >= 0.5 ? 'mittel' : 'niedrig',
    fundstelle: ausschnitt(text, best.i, best.laenge),
  };
}

/** Gesamtbetrag: beschriftet („Gesamtbetrag“, „zu zahlen“ …), sonst der größte Betrag mit Währung. */
function findeBetrag(text: string): Fund<Betrag> | null {
  const RE =
    /(?:(EUR|€|CHF|USD|\$)\s*)?(?<![\d.,])(-?\d{1,3}(?:[.\s]\d{3})*,\d{2}|-?\d+,\d{2}|-?\d{1,3}(?:,\d{3})*\.\d{2})(?![\d.,]?\d)(?:\s*(EUR|€|CHF|USD|\$|Euro))?/g;
  const STUFEN: Array<[RegExp, number]> = [
    [
      /(Gesamtbetrag|Rechnungsbetrag|Endbetrag|Zahlbetrag|zu zahlen|Gesamtsumme|Summe brutto|Bruttobetrag|Brutto gesamt|Gesamt brutto|Total|Rechnungssumme|Zahlungsbetrag|offener Betrag|Forderung)/i,
      4,
    ],
    [/(Gesamt|Summe|Betrag|Brutto|Saldo|Abbuchung|abgebucht|Lastschrift)/i, 2],
  ];
  let best: { betrag: number; waehrung: string; punkte: number; i: number; laenge: number } | null = null;
  for (const m of text.matchAll(RE)) {
    const zahl = zahlAus(m[2]);
    if (zahl == null || Math.abs(zahl) < 0.01 || Math.abs(zahl) > 10_000_000) continue;
    const zeichen = m[1] ?? m[3];
    const waehrung = !zeichen || /€|EUR|Euro/i.test(zeichen) ? 'EUR' : zeichen === '$' ? 'USD' : zeichen.toUpperCase();
    const zeile = text.slice(text.lastIndexOf('\n', m.index!) + 1, m.index!);
    let punkte = zeichen ? 1 : 0;
    for (const [re, p] of STUFEN)
      if (re.test(zeile)) {
        punkte += p;
        break;
      }
    if (/(MwSt|USt|Mehrwertsteuer|Umsatzsteuer|netto|Rabatt|Skonto|davon)/i.test(zeile)) punkte -= 2;
    // Gleich gut: der größere Betrag (Summen sind größer als Positionen).
    if (!best || punkte > best.punkte || (punkte === best.punkte && Math.abs(zahl) > Math.abs(best.betrag)))
      best = { betrag: zahl, waehrung, punkte, i: m.index!, laenge: m[0].length };
  }
  if (!best || best.punkte < 1) return null;
  return {
    wert: { betrag: best.betrag, waehrung: best.waehrung },
    sicherheit: best.punkte >= 4 ? 'hoch' : best.punkte >= 2 ? 'mittel' : 'niedrig',
    fundstelle: ausschnitt(text, best.i, best.laenge),
  };
}

/** Wörter, an denen eine Gutschrift zu erkennen ist (#1043). */
const GUTSCHRIFT =
  /(?<![\p{L}])(Gutschrift|Erstattung|Rückerstattung|Rückzahlung|Rueckzahlung|Rueckerstattung|Credit note|Refund)(?:en|s)?(?![\p{L}])/iu;
/** So weit vorn steht eine Überschrift wie „Gutschrift“ (wie bei „Wohin gehört das?“). */
const GUTSCHRIFT_KOPF = 1500;

/**
 * Gutschrift (#1043): „Gutschrift“, „Erstattung“ oder „Rückzahlung“ als eigenes Wort im Kopf des Belegs oder in der
 * Zeile des Betrags – nicht irgendwo im Kleingedruckten („Eine Erstattung der Versandkosten ist ausgeschlossen“).
 */
function findeGutschrift(text: string, betrag: Fund<Betrag> | null): Fund | null {
  const kopf = text.slice(0, GUTSCHRIFT_KOPF);
  const m = GUTSCHRIFT.exec(kopf);
  if (m) return { wert: m[1], sicherheit: 'mittel', fundstelle: ausschnitt(kopf, m.index, m[0].length) };
  const b = betrag ? GUTSCHRIFT.exec(betrag.fundstelle) : null;
  return b ? { wert: b[1], sicherheit: 'mittel', fundstelle: betrag!.fundstelle } : null;
}

/**
 * Absender aus dem Briefkopf, nur wenn sicher erkennbar: die kleine Absenderzeile über dem Anschriftfeld
 * („Stadtwerke Muster GmbH · Hauptstraße 1 · 01067 Dresden“) oder eine Firmenzeile mit Straße und PLZ/Ort darunter.
 */
/** Zeilen mit der Anschrift der Empfängerin bzw. des Empfängers (Liefer- und Rechnungsadresse u. Ä.). */
const EMPFAENGER_ZEILE =
  /^\s*(liefer(ungs)?adresse|liefer(ungs)?anschrift|rechnungsadresse|rechnungsanschrift|versandadresse|versandanschrift|lieferung an|versand an|empfänger(in)?|kunde|kundin|shipping address|billing address|ship to|bill to|deliver to)\b\s*:?/i;

function findeBriefkopf(zeilen: string[]): Briefkopf | null {
  // Anschrift der Empfängerin in einer Zeile (#1485), z. B. „Lieferadresse: Lena Muster · Lindenweg 4 · …“ auf der
  // Rechnung eines Shops: Das ist nicht die Absenderzeile – sonst gälte der Beleg als ausgehend.
  for (const z of zeilen.slice(0, 40).filter((x) => !EMPFAENGER_ZEILE.test(x))) {
    const teile = z
      .split(/\s+[·•|–]\s+|\s+-\s+|\s*·\s*|\s*\|\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (teile.length < 3) continue;
    const plz = teile.findIndex((s) => PLZ_ORT.test(s));
    // In der Absenderzeile ist der Teil vor PLZ/Ort mit Hausnummer die Straße – auch ohne typische Endung („Am Wasserturm 3“).
    const str = plz > 1 && (STRASSE_LOCKER.test(teile[plz - 1]) || /postfach/i.test(teile[plz - 1])) ? plz - 1 : -1;
    if (plz < 1 || str < 1) continue;
    const name = teile.slice(0, str).join(' ');
    if (!/[A-Za-zÄÖÜäöü]{3}/.test(name) || /\d{5}/.test(name)) continue;
    const s = /postfach/i.test(teile[str]) ? null : STRASSE_LOCKER.exec(teile[str]);
    const p = PLZ_ORT.exec(teile[plz])!;
    return {
      name,
      ...(s ? { strasse: s[1].trim(), hausnummer: s[2].replace(/\s/g, '') } : { strasse: teile[str] }),
      plz: p[1],
      ort: p[2],
      fundstelle: z,
      zeile: true,
    };
  }
  for (let i = 0; i < Math.min(zeilen.length, 25); i++) {
    if (!FIRMA.test(zeilen[i]) || zeilen[i].length > 70 || /\d{5}/.test(zeilen[i])) continue;
    for (let j = i + 1; j <= i + 3 && j + 1 < zeilen.length; j++) {
      const s = STRASSE.exec(zeilen[j]);
      const p = PLZ_ORT.exec(zeilen[j + 1]);
      if (s && p)
        return {
          name: zeilen[i],
          strasse: s[1].trim(),
          hausnummer: s[2].replace(/\s/g, ''),
          plz: p[1],
          ort: p[2],
          fundstelle: [zeilen[i], zeilen[j], zeilen[j + 1]].join(' · '),
        };
    }
  }
  return null;
}

/** Person auf einer Visitenkarte oder in einer Signatur: Name (2–3 Wörter), darunter oft die Funktion. */
function findePerson(zeilen: string[], a: Angaben): Personfund | null {
  const kopf = zeilen.slice(0, 15);
  const anschrift = (z: string) => STRASSE.test(z) || PLZ_ORT.test(z);
  for (let i = 0; i < kopf.length; i++) {
    const z = kopf[i].replace(/^(Herr|Frau)\s+/, '');
    const titel = /^((?:Prof\.|Dr\.|Dipl\.-\w+\.?|Ing\.)\s*)+/.exec(z)?.[0] ?? '';
    const rest = z.slice(titel.length).trim();
    const woerter = rest.split(' ');
    if (woerter.length < 2 || woerter.length > 3 || FIRMA.test(rest) || FUNKTION.test(rest) || anschrift(rest) || /[\d@]/.test(rest))
      continue;
    if (!woerter.every((w) => /^[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?$/.test(w))) continue;
    const umgebung = [kopf[i - 1], kopf[i + 1], kopf[i + 2]].filter(Boolean) as string[];
    const funktion = umgebung.find((x) => FUNKTION.test(x) && x.length <= 60 && !/@/.test(x));
    const organisation = kopf.find((x) => FIRMA.test(x) && x.length <= 70 && !anschrift(x) && !/[@·|]/.test(x));
    // Nur mit einem weiteren Anzeichen (Funktion, Firma oder Kontaktangaben) – sonst ist es vielleicht nur ein Satzanfang.
    if (!funktion && !organisation && !a.emails.length && !a.telefon.length && !a.mobil.length) continue;
    return {
      vorname: woerter.slice(0, -1).join(' '),
      nachname: woerter[woerter.length - 1],
      ...(funktion ? { funktion } : {}),
      ...(organisation ? { organisation } : {}),
      fundstelle: [kopf[i], funktion].filter(Boolean).join(' · '),
    };
  }
  return null;
}
