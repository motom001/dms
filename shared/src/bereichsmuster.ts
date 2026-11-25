/**
 * Bereich im Dokument markieren (#1597), Stufe 1 ohne KI: Aus den Zeilen in einem gezogenen Rechteck liest Ablago einen
 * Block – Anschrift, Bankverbindung, Kontakt oder Rechnungskopf – und ordnet die Teile den Feldern eines Mappentyps zu.
 * Nur reguläre Ausdrücke, im Browser über Wörter, die schon da sind: Keine Daten verlassen den Server.
 *
 * Bewusst ein eigenes Modul neben der Erkennung (`erkennung/`): Die liest den ganzen Text eines Dokuments, dieses nur
 * den markierten Ausschnitt. Von dort kommen nur die Art eines Felds (`artVon`) und die IBAN-Prüfung; das Säubern der
 * Werte (Satzzeichen am Rand, #1606) übernimmt `wertAusText`.
 *
 * Die Muster für deutsche Anschriften stehen in `ANSCHRIFT_DE`. Sobald das Regionspaket (motom001/dms-registry#244)
 * eigene Muster mitbringt, kommen sie von dort; bis dahin gelten diese.
 */
import { artVon, istIban, klein } from './erkennung';
import type { Feld, Wert } from './model';
import type { Bereich, SchwaerzSeite } from './schwaerzen';
import { wertAusText } from './uebernehmen';

/** Muster einer deutschen Anschrift: Straße mit Hausnummer (auch „12a“, „12-14“), PLZ mit Ort, Anrede-Zeilen. */
const ANSCHRIFT_DE = {
  strasse: /^([A-Za-zÄÖÜäöüß][\wÄÖÜäöüß.' -]{1,60}?)\s+(\d{1,4}\s?[a-zA-Z]?(?:\s?[-–/]\s?\d{1,4}\s?[a-zA-Z]?)?)$/,
  plzOrt: /^(?:D-?\s?)?(\d{5})\s+([A-ZÄÖÜ][\wÄÖÜäöüß.() /-]{1,60})$/,
  /** Kleine Rücksendezeile über dem Anschriftfeld: „Firma · Straße · PLZ Ort“ – nie die Anschrift selbst. */
  ruecksendung: /[·•|]|\s[–-]\s.*\d{5}\s/,
  anrede: /^(herrn?|frau|familie|firma|an)$/i,
};

/** Was in einem Block stehen kann; Schlüssel wie die Erkennungsarten, dazu BIC, Bank und die Nummern des Kopfs. */
type Blockteil =
  | 'name'
  | 'strasse'
  | 'hausnummer'
  | 'plz'
  | 'ort'
  | 'iban'
  | 'bic'
  | 'bank'
  | 'telefon'
  | 'fax'
  | 'mobil'
  | 'email'
  | 'rechnungsnummer'
  | 'kundennummer'
  | 'vertragsnummer'
  | 'datum';
export type Blockart = 'anschrift' | 'bank' | 'kontakt' | 'kopf';

export interface Block {
  /** Wichtigste Art im Bereich (Anschrift vor Bank vor Kontakt vor Kopf) – für die Meldung. */
  art: Blockart;
  /** Kurz, was erkannt wurde, z. B. „Musterweg 1, 01234 Musterstadt“. */
  text: string;
  werte: Partial<Record<Blockteil, string>>;
  /** Ganze Anschrift in Zeilen (für ein einzelnes Feld „Anschrift“). */
  zeilen?: string[];
}

/* ---------- Wörter im Rechteck → Zeilen ---------- */

/** Wörter, deren Mitte im Rechteck liegt, als Zeilen von oben nach unten (Wörter je Zeile von links nach rechts). */
export function zeilenImBereich(s: SchwaerzSeite, r: Pick<Bereich, 'x' | 'y' | 'b' | 'h'>): string[] {
  const drin = s.woerter.filter(([, x, y, b, h]) => {
    const mx = x + b / 2,
      my = y + h / 2;
    return mx >= r.x && mx <= r.x + r.b && my >= r.y && my <= r.y + r.h;
  });
  const zeilen: Array<{ y: number; h: number; woerter: Array<[string, number]> }> = [];
  for (const [text, x, y, , h] of [...drin].sort((a, b) => a[2] - b[2])) {
    const z = zeilen.find((k) => Math.abs(k.y + k.h / 2 - (y + h / 2)) < Math.max(k.h, h) / 2);
    if (z) z.woerter.push([text, x]);
    else zeilen.push({ y, h, woerter: [[text, x]] });
  }
  return zeilen.map((z) =>
    z.woerter
      .sort((a, b) => a[1] - b[1])
      .map((w) => w[0])
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

/* ---------- Blöcke ---------- */

const IBAN = /\b([A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?)\b/;
const BIC = /\b(?:BIC|SWIFT)(?:[- ]?Code)?\s*:?\s*([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/i;
const BANK = /^(?:Bank|Kreditinstitut|Geldinstitut)\s*:?\s*(.+)$/i;
const BANKNAME = /\b(Sparkasse|Volksbank|Raiffeisenbank|Postbank|Commerzbank|Deutsche Bank|\w*[Bb]ank)\b/;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const NUMMER = /[+(]?\d[\d /()-]{4,}\d/;
const KONTAKT: Array<[Blockteil, RegExp]> = [
  ['fax', /\b(?:Fax|Telefax)\b/i],
  ['mobil', /\b(?:Mobil|Handy|Mobile)\b/i],
  ['telefon', /\b(?:Tel|Telefon|Fon|Phone)\b/i],
];
const KOPF: Array<[Blockteil, RegExp]> = [
  ['kundennummer', /\bKunden-?\s?(?:nummer|nr\.?)\s*:?\s*([A-Z0-9][\w/.-]*\d[\w/.-]*)/i],
  ['vertragsnummer', /\bVertrags-?\s?(?:nummer|nr\.?|konto)\s*:?\s*([A-Z0-9][\w/.-]*\d[\w/.-]*)/i],
  ['rechnungsnummer', /\bRechnungs-?\s?(?:nummer|nr\.?)\s*:?\s*([A-Z0-9][\w/.-]*\d[\w/.-]*)/i],
  ['rechnungsnummer', /^Rechnung\s+(?:Nr\.?\s*)?([A-Z0-9][\w/.-]*\d[\w/.-]*)$/i],
];
const DATUM = /\b(\d{1,2}\.\s?\d{1,2}\.\s?(?:\d{4}|\d{2}))\b/;

/** Anschrift: Straße mit Nummer, darunter PLZ und Ort; davor optional Name bzw. Firma (ohne Anrede, ohne Rücksendezeile). */
export function liesAnschrift(zeilen: string[]): Block | null {
  const z = zeilen.filter((x) => x && !ANSCHRIFT_DE.ruecksendung.test(x));
  const p = z.findIndex((x) => ANSCHRIFT_DE.plzOrt.test(x));
  if (p < 1) return null;
  const s = ANSCHRIFT_DE.strasse.exec(z[p - 1]);
  const o = ANSCHRIFT_DE.plzOrt.exec(z[p])!;
  if (!s) return null;
  const name = z.slice(0, p - 1).find((x) => !ANSCHRIFT_DE.anrede.test(x) && !NUMMER.test(x) && !EMAIL.test(x));
  const werte: Block['werte'] = { strasse: s[1].trim(), hausnummer: s[2].replace(/\s+/g, ''), plz: o[1], ort: o[2].trim() };
  if (name) werte.name = name;
  return {
    art: 'anschrift',
    text: `${s[1].trim()} ${werte.hausnummer}, ${o[1]} ${werte.ort}`,
    werte,
    zeilen: [...(name ? [name] : []), z[p - 1], z[p]],
  };
}

/** Bankverbindung: IBAN (mit Prüfziffer), BIC und Name der Bank. */
function liesBank(zeilen: string[]): Block | null {
  const text = zeilen.join('\n');
  const iban = zeilen.map((x) => IBAN.exec(x.toUpperCase())?.[1]).find((x) => x && istIban(x.replace(/\s/g, '')));
  if (!iban) return null;
  const werte: Block['werte'] = {
    iban: iban
      .replace(/\s/g, '')
      .replace(/(.{4})/g, '$1 ')
      .trim(),
  };
  const bic = BIC.exec(text)?.[1];
  if (bic) werte.bic = bic.toUpperCase();
  const bank =
    zeilen.map((x) => BANK.exec(x)?.[1]).find(Boolean) ??
    zeilen.map((x) => BANKNAME.exec(x) && x).find((x) => x && !IBAN.test(x.toUpperCase()));
  if (bank) werte.bank = bank.replace(BIC, '').trim();
  return { art: 'bank', text: werte.iban!, werte };
}

/** Kontakt: Telefon, Fax, Mobil (nach ihrer Beschriftung) und E-Mail. */
function liesKontakt(zeilen: string[]): Block | null {
  const werte: Block['werte'] = {};
  for (const z of zeilen) {
    const mail = EMAIL.exec(z)?.[0];
    if (mail && !werte.email) werte.email = mail;
    const art = KONTAKT.find(([, re]) => re.test(z))?.[0];
    const nr = art && NUMMER.exec(z.replace(EMAIL, ''))?.[0];
    if (art && nr && !werte[art]) werte[art] = nr.trim();
  }
  const teile = [werte.telefon, werte.mobil, werte.fax, werte.email].filter(Boolean);
  return teile.length ? { art: 'kontakt', text: teile.join(', '), werte } : null;
}

/** Rechnungskopf: Rechnungs-, Kunden- und Vertragsnummer (nach ihrer Beschriftung) und ein Datum. */
function liesKopf(zeilen: string[]): Block | null {
  const werte: Block['werte'] = {};
  for (const z of zeilen) {
    for (const [teil, re] of KOPF) {
      const m = re.exec(z);
      if (m && !werte[teil]) werte[teil] = m[1];
    }
    const d = DATUM.exec(z)?.[1];
    if (d && !werte.datum) werte.datum = d.replace(/\s/g, '');
  }
  const teile = [werte.rechnungsnummer, werte.kundennummer, werte.vertragsnummer, werte.datum].filter(Boolean);
  return teile.length ? { art: 'kopf', text: teile.join(', '), werte } : null;
}

/** Alle Blöcke im Bereich zusammen; die Art der Meldung ist die wichtigste gefundene. null: nichts erkannt. */
export function liesBlock(zeilen: string[]): Block | null {
  const bloecke = [liesAnschrift(zeilen), liesBank(zeilen), liesKontakt(zeilen), liesKopf(zeilen)].filter((x): x is Block => !!x);
  if (!bloecke.length) return null;
  const [erster] = bloecke;
  return { ...erster, werte: Object.assign({}, ...bloecke.map((b) => b.werte), erster.werte) };
}

/* ---------- Block → Felder ---------- */

const hat = (f: Pick<Feld, 'key' | 'label'>, re: RegExp) => re.test(` ${klein(`${f.key} ${f.label}`).replace(/[^a-z0-9]+/g, ' ')} `);

/** Nummernfeld: Kunden-, Vertrags- oder Rechnungsnummer nach Kennung und Beschriftung; sonst keins. */
function nummerFuer(f: Feld): Blockteil | null {
  if (hat(f, / kunde\w* /) || hat(f, / kundennummer /)) return 'kundennummer';
  if (hat(f, / vertrag\w* /) || hat(f, / vertragsnummer /)) return 'vertragsnummer';
  if (hat(f, / rechnung\w* /) || hat(f, / rechnungsnummer /)) return 'rechnungsnummer';
  return null;
}

/** Welcher Teil eines Blocks in ein Feld gehört – nach der Art des Felds (wie die Erkennung) und seiner Beschriftung. */
function teilFuer(f: Feld): Blockteil | 'anschrift' | null {
  if (hat(f, / (bic|swift) /)) return 'bic';
  if (hat(f, / (bank|kreditinstitut|geldinstitut) /) && !hat(f, / (iban|konto) /)) return 'bank';
  const art = artVon(f);
  if (art === 'strasse' && f.typ === 'langtext') return 'anschrift';
  if (f.typ === 'datum') return hat(f, / (rechnungsdatum|belegdatum|datum) /) ? 'datum' : null;
  if (art === 'nummer') return nummerFuer(f);
  const teile: Blockteil[] = ['name', 'strasse', 'hausnummer', 'plz', 'ort', 'iban', 'telefon', 'fax', 'mobil', 'email'];
  return art && (teile as string[]).includes(art) ? (art as Blockteil) : null;
}

/**
 * Was der Block in die Felder einträgt: je Feld der passende Teil, gesäubert wie beim Markieren (#1606) und in der Art
 * des Felds gelesen. Verweise, Passwörter und ausgeblendete Felder bekommen nichts; jeder Teil höchstens einmal.
 */
export function felderAusBlock(b: Block, felder: Feld[]): Array<{ feld: Feld; wert: Wert }> {
  const genommen = new Set<string>();
  const aus: Array<{ feld: Feld; wert: Wert }> = [];
  for (const f of felder) {
    if (f.ausgeblendet || f.typ === 'referenz' || f.typ === 'passwort') continue;
    const teil = teilFuer(f);
    if (!teil || genommen.has(teil)) continue;
    const roh = teil === 'anschrift' ? b.zeilen?.join('\n') : b.werte[teil];
    if (!roh) continue;
    const wert = wertAusText(f, roh);
    if (wert === null || wert === '') continue;
    genommen.add(teil);
    aus.push({ feld: f, wert });
  }
  return aus;
}
