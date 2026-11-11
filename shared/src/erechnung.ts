/**
 * E-Rechnung (#1043): XRechnung (UBL oder CII) und ZUGFeRD/Factur-X (CII im PDF-Anhang) als Vorschläge für die Felder
 * eines Mappentyps – Angaben und Positionen „exakt aus den Daten“ statt aus dem gelesenen Text.
 *
 * Das XML liest der Server (server/src/erechnung.ts, sicher und mit Grenzen); hier stehen nur die gelesenen Angaben und
 * reine Funktionen, die sie auf Felder legen. Die Daten sind **nicht vertrauenswürdig** (Ergänzung Sicherheit): Jeder
 * Wert ist ein Vorschlag wie aus jeder anderen Erkennung und läuft danach durch `pruefeVorschlaege` – dieselbe Prüfung
 * wie Eingaben (Feldart, Format, Grenzen, berechnete Felder nie).
 *
 * Welches Feld welche Angabe bekommt, ergibt sich wie bei der eingebauten Erkennung aus Feldart, Kennung und
 * Bezeichnung (`artVon`) – etwa Betrag → Gesamtbetrag, „Netto“ → Nettobetrag, „Fällig am“ → Fälligkeit,
 * „Rechnungsnummer“/„Bestellnummer“/„Lieferscheinnummer“ → die passende Nummer. Das Original bleibt unverändert.
 */
import { artVon, type Vorschlaege } from './erkennung';
import { vonAussenFuellbar } from './berechnet';
import type { Betrag, Feld, Mappentyp, Wert } from './model';
import { t } from './texte';

/** Dateinamen eingebetteter E-Rechnungen im PDF (ZUGFeRD, Factur-X, XRechnung im PDF, Order-X). */
export const ERECHNUNG_DATEINAME = /^(factur-x|zugferd-invoice|zugferd|xrechnung|order-x)\.xml$/i;

export interface ERechnungPartei {
  name?: string;
  /** Umsatzsteuer-Id (BT-31/BT-48). */
  ustid?: string;
  /** Kennung beim Rechnungssteller, z. B. Kundennummer (BT-46). */
  kennung?: string;
  strasse?: string; plz?: string; ort?: string; land?: string;
  email?: string; telefon?: string;
}
export interface ERechnungPosition {
  nr?: string;
  beschreibung?: string;
  menge?: number;
  /** Einheit als UN/ECE-Code (Rec. 20), z. B. C62 = Stück, HUR = Stunde. */
  einheit?: string;
  /** Netto je Einheit. */
  einzelpreis?: number;
  /** Netto der Position. */
  gesamt?: number;
  ustSatz?: number;
  artikelnummer?: string;
}
export interface ERechnung {
  /** ubl = XRechnung in UBL, cii = XRechnung in CII oder ZUGFeRD/Factur-X. */
  syntax: 'ubl' | 'cii';
  /** Gutschrift (UBL CreditNote, Rechnungsart 381 u. a.) – Beträge werden negativ übernommen, wo das Feld es erlaubt. */
  gutschrift: boolean;
  /** Rechnungsart (BT-3), z. B. 380 Rechnung, 381 Gutschrift. */
  art?: string;
  /** Profil (BT-24), gekürzt. */
  profil?: string;
  nummer?: string;
  datum?: string;
  faellig?: string;
  waehrung: string;
  netto?: number;
  ust?: number;
  brutto?: number;
  zahlbetrag?: number;
  /** Umsatzsteuersatz, wenn die Rechnung genau einen hat. */
  ustSatz?: number;
  verkaeufer: ERechnungPartei;
  kaeufer: ERechnungPartei;
  iban?: string;
  /** Bestellnummer (BT-13), Lieferscheinnummer (BT-16), Vertragsnummer (BT-12), Käuferreferenz/Leitweg-ID (BT-10). */
  bestellnummer?: string;
  lieferschein?: string;
  vertrag?: string;
  referenz?: string;
  leistungVon?: string;
  leistungBis?: string;
  positionen: ERechnungPosition[];
  /** Mehr Positionen, als übernommen werden (ERECHNUNG_POSITIONEN_MAX). */
  weiterePositionen?: number;
}

/** Häufige Einheiten (UN/ECE Rec. 20) lesbar; andere bleiben als Code. */
const EINHEITEN: Record<string, string> = {
  C62: 'Stk', H87: 'Stk', XPP: 'Stk', EA: 'Stk', HUR: 'Std.', MIN: 'Min.', DAY: 'Tag', WEE: 'Woche', MON: 'Monat', ANN: 'Jahr',
  KGM: 'kg', GRM: 'g', TNE: 't', MTR: 'm', KMT: 'km', MTK: 'm²', MTQ: 'm³', LTR: 'l', KWH: 'kWh', SET: 'Set', PR: 'Paar', LS: 'pauschal',
};
export const einheitText = (code: string | undefined): string | undefined => (code ? EINHEITEN[code.toUpperCase()] ?? code : undefined);

const zahl = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const datum = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/**
 * Lesbarer Text der E-Rechnung – für Abgleich, Briefkopf und Fundstellen, wenn es (etwa bei einer XML-Datei) keinen
 * Volltext gibt. Die Zeilen folgen den Mustern der eingebauten Erkennung: Absenderzeile „Name · Straße · PLZ Ort“,
 * „Rechnungsnummer: …“, „Lieferscheinnummer: …“, „Gesamtbetrag …“.
 */
export function erechnungText(er: ERechnung): string {
  const v = er.verkaeufer; const k = er.kaeufer;
  const ort = (p: ERechnungPartei) => [p.plz, p.ort].filter(Boolean).join(' ');
  const mit = (label: string, w: string | undefined) => (w ? `${label}${w}` : '');
  const geld = (label: string, n: number | undefined) => (n != null ? `${label} ${zahl(n)} ${er.waehrung}` : '');
  const satz = er.ustSatz != null ? ` ${String(er.ustSatz).replace('.', ',')} %` : '';
  const z = [
    [v.name, v.strasse, ort(v)].filter(Boolean).join(' · '),
    k.name, k.strasse, ort(k),
    er.gutschrift ? 'Gutschrift' : 'Rechnung',
    mit('Rechnungsdatum: ', er.datum && datum(er.datum)),
    mit('Rechnungsnummer: ', er.nummer), mit('Kundennummer: ', k.kennung), mit('Bestellnummer: ', er.bestellnummer),
    mit('Lieferscheinnummer: ', er.lieferschein), mit('Vertragsnummer: ', er.vertrag),
    ...er.positionen.map((p) => positionsZeile(p, er)),
    geld('Summe netto', er.netto), geld(`Umsatzsteuer${satz}`, er.ust), geld('Gesamtbetrag', er.brutto),
    mit('Fällig am ', er.faellig && datum(er.faellig)), mit('IBAN ', er.iban), mit('USt-IdNr. ', v.ustid),
    [mit('Tel. ', v.telefon), v.email ?? ''].filter(Boolean).join(' · '),
  ];
  return z.filter((x): x is string => !!x).join('\n');
}
const positionsZeile = (p: ERechnungPosition, er: ERechnung) =>
  [p.nr, p.beschreibung, p.menge != null ? `${p.menge} ${einheitText(p.einheit) ?? ''}`.trim() : '', p.gesamt != null ? `${zahl(p.gesamt)} ${er.waehrung}` : ''].filter(Boolean).join(' ');

/** Wörter aus Kennung und Bezeichnung eines Felds (klein, ohne Umlaute). */
const woerter = (f: Pick<Feld, 'key' | 'label'>) => ` ${`${f.key} ${f.label}`.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ')} `;
const hat = (f: Pick<Feld, 'key' | 'label'>, re: RegExp) => re.test(woerter(f));

/** Betrag mit Vorzeichen der Gutschrift – negativ nur, wenn das Feld es erlaubt (sonst bleibt er positiv). */
const betragFuer = (f: Feld, n: number, er: ERechnung): Betrag => ({ betrag: er.gutschrift && f.negativ && n > 0 ? -n : n, waehrung: er.waehrung });

/** Fundstelle eines Werts aus der E-Rechnung, z. B. „E-Rechnung: Rechnungsnummer R-2026-0042“. */
const quelle = (was: string, wert: string) => `${t('gemeinsam.erechnung.quelle')}: ${was} ${wert}`.slice(0, 500);

/** Ein Wert für ein Feld: der Wert, was er ist (für die Fundstelle) und wie er dort steht. */
interface Kandidat { wert: Wert; was: string; text: string }

const USt = / (ust|umsatzsteuer|mwst|mehrwertsteuer|vat|steuer|steuerbetrag|steuersatz|umsatzsteuersatz) /;

function betragKandidat(f: Feld, er: ERechnung): Kandidat | undefined {
  if (hat(f, / (skonto|rabatt|nachlass|anzahlung|teilzahlung|kaution) /)) return undefined;
  const [n, was] = hat(f, / (netto|net|nettobetrag) /) ? [er.netto, t('gemeinsam.erechnung.netto')]
    : hat(f, USt) ? [er.ust, t('gemeinsam.erechnung.ust')]
      : f.erkennung || hat(f, / (betrag|brutto|gesamt|gesamtbetrag|summe|rechnungsbetrag|amount|total) /) ? [er.brutto ?? er.zahlbetrag, t('gemeinsam.erechnung.brutto')] : [undefined, ''];
  if (n == null) return undefined;
  const b = betragFuer(f, n, er);
  return { wert: f.typ === 'zahl' ? b.betrag : b, was, text: `${zahl(n)} ${er.waehrung}` };
}

function datumKandidat(f: Feld, er: ERechnung): Kandidat | undefined {
  const k = (w: string | undefined, was: string) => (w ? { wert: w, was, text: datum(w) } : undefined);
  if (hat(f, / (faellig\w*|due|zahlbar|zahlungsziel) /)) return k(er.faellig, t('gemeinsam.erechnung.faellig'));
  if (hat(f, / (leistung\w*|lieferdatum|zeitraum) /) && hat(f, / (von|beginn|start|ab) /)) return k(er.leistungVon, t('gemeinsam.erechnung.leistung'));
  if (hat(f, / (bezahlt|zahlungseingang|skonto|bis|ende|geburt\w*|gueltig) /)) return undefined;
  return f.erkennung || hat(f, / (rechnungsdatum|belegdatum|datum|date) /) ? k(er.datum, t('gemeinsam.erechnung.datum')) : undefined;
}

/** Nummern nach der Bezeichnung: Lieferschein-, Bestell-, Rechnungs-, Kunden- und Vertragsnummer. */
function nummerKandidat(f: Feld, er: ERechnung): Kandidat | undefined {
  const [w, was] = hat(f, / (lieferschein\w*|despatch|delivery) /) ? [er.lieferschein, t('gemeinsam.erechnung.lieferschein')]
    : hat(f, / (bestell\w*|auftrag\w*|order) /) ? [er.bestellnummer, t('gemeinsam.erechnung.bestellung')]
      : hat(f, / (rechnung\w*|beleg\w*|invoice) /) && !hat(f, / (kunde\w*|vertrag\w*) /) ? [er.nummer, t('gemeinsam.erechnung.nummer')]
        : hat(f, / (kunde\w*|kd|customer) /) ? [er.kaeufer.kennung ?? er.vertrag ?? er.referenz, t('gemeinsam.erechnung.kunde')]
          : hat(f, / (vertrag\w*|contract) /) ? [er.vertrag, t('gemeinsam.erechnung.vertrag')] : [undefined, ''];
  if (!w) return undefined;
  const wert = f.typ === 'zahl' ? Number(w.replace(/\D/g, '')) || undefined : w;
  return wert === undefined ? undefined : { wert, was, text: w };
}

function kandidat(f: Feld, er: ERechnung): Kandidat | undefined {
  const art = artVon(f);
  if (art === 'nummer') return nummerKandidat(f, er);
  if (f.typ === 'betrag' || (f.typ === 'zahl' && art === 'betrag')) return betragKandidat(f, er);
  if (f.typ === 'datum') return datumKandidat(f, er);
  if (f.typ === 'prozent') return er.ustSatz != null && hat(f, USt) ? { wert: er.ustSatz, was: t('gemeinsam.erechnung.ust-satz'), text: `${er.ustSatz} %` } : undefined;
  if (art === 'iban' && er.iban) return { wert: er.iban.replace(/(.{4})(?!$)/g, '$1 '), was: 'IBAN', text: er.iban };
  if (art === 'ustid' && er.verkaeufer.ustid) return { wert: er.verkaeufer.ustid, was: t('gemeinsam.erkennung.umsatzsteuer-id'), text: er.verkaeufer.ustid };
  return undefined;
}

/** Felder, die eine E-Rechnung füllen darf: von außen füllbar (berechnete nie, #1034), keine Passwörter, Verweise, Tabellen. */
const fuellbar = (f: Feld) => vonAussenFuellbar(f) && !f.ausgeblendet && !['passwort', 'formatiert', 'referenz', 'tabelle', 'janein', 'auswahl'].includes(f.typ);

/**
 * Vorschläge für die Felder eines Typs aus einer E-Rechnung (ohne Verweise – die gleicht der Server ab). Werte kommen im
 * Format der Feldart; geprüft wird danach wie jede Antwort einer Erkennung.
 */
export function vorschlaegeAusERechnung(typ: Pick<Mappentyp, 'felder'>, er: ERechnung): Vorschlaege {
  const v: Vorschlaege = {};
  for (const f of typ.felder.filter(fuellbar)) {
    const k = kandidat(f, er);
    if (!k || k.wert === '' || v[f.key]) continue;
    const negativ = er.gutschrift && f.typ === 'betrag' && f.negativ;
    v[f.key] = { wert: k.wert, sicherheit: 'hoch', fundstelle: quelle(k.was, k.text), ...(negativ ? { hinweis: t('gemeinsam.erechnung.gutschrift') } : {}) };
  }
  return v;
}

/** Wert einer Position für ein Feld des Teiltyps. */
function positionsWert(f: Feld, p: ERechnungPosition, er: ERechnung): Wert | undefined {
  const preis = (n: number | undefined) => (n == null ? undefined : f.typ === 'zahl' ? n : betragFuer(f, n, er));
  if (f.typ === 'betrag' || (f.typ === 'zahl' && hat(f, / (preis|price|betrag) /))) {
    if (hat(f, / (einzel\w*|stueck\w*|unit|je) /)) return preis(p.einzelpreis);
    return hat(f, USt) ? undefined : hat(f, / (gesamt\w*|summe|total|betrag|netto) /) ? preis(p.gesamt) : undefined;
  }
  if (f.typ === 'prozent') return p.ustSatz != null && hat(f, USt) ? p.ustSatz : undefined;
  if (f.typ === 'zahl') return hat(f, / (menge|anzahl|quantity|qty|stueckzahl) /) ? p.menge : hat(f, / (nr|pos|position|zeile|line) /) && p.nr && /^\d{1,6}$/.test(p.nr) ? Number(p.nr) : undefined;
  return f.typ === 'text' || f.typ === 'langtext' ? positionsText(f, p) : undefined;
}
/** Text einer Position: Artikelnummer, Einheit oder Beschreibung. */
function positionsText(f: Feld, p: ERechnungPosition): string | undefined {
  if (hat(f, / (artikel\w*|sku|ean|item|produktnummer|art nr) /) && hat(f, / (\w*nummer|\w*nr|number|id|sku|ean) /)) return p.artikelnummer;
  if (hat(f, / (einheit|unit|me) /)) return einheitText(p.einheit);
  return hat(f, / (beschreibung|bezeichnung|text|leistung|artikel|name|description) /) ? p.beschreibung : undefined;
}

/** Werte einer Position für die Felder des Typs der Positionen (Teiltyp, #1031), ohne das Feld zur Rechnung (`ohne`). */
export function positionAusERechnung(typ: Pick<Mappentyp, 'felder'>, p: ERechnungPosition, er: ERechnung, ohne: string): Record<string, Wert> {
  const w: Record<string, Wert> = {};
  for (const f of typ.felder) {
    if (f.key === ohne || !fuellbar(f)) continue;
    const x = positionsWert(f, p, er);
    if (x !== undefined && x !== '') w[f.key] = x;
  }
  return w;
}
