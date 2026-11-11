/**
 * E-Rechnung lesen (#1043): XRechnung (UBL 2.1 Invoice/CreditNote oder UN/CEFACT CII) und ZUGFeRD/Factur-X (CII als
 * PDF-Anhang, entpackt über die PDF-Stelle, `eingebetteteERechnung`). Was daraus auf die Felder kommt, steht in
 * shared/src/erechnung.ts.
 *
 * Sicherheit (Ergänzung im Issue): gelesen wird mit dem eigenen Leser in xml.ts – ohne DTD und Entitäten, mit den
 * Grenzen aus grenzen.ts (Größe, Tiefe, Elemente, Positionen). Nichts wird nachgeladen; Schema und Stylesheet, auf die
 * eine Datei verweist, bleiben unbeachtet. Alle Werte sind Text, gekürzt; Zahlen und Daten werden streng gelesen.
 * Ein XML, das kein bekanntes Format hat oder sich nicht lesen lässt, ergibt null – dann arbeitet die Erkennung wie
 * bisher mit dem Text.
 */
import type { ERechnung, ERechnungPartei, ERechnungPosition } from '../../shared/src/erechnung';
import { ERECHNUNG_ELEMENTE_MAX, ERECHNUNG_POSITIONEN_MAX, ERECHNUNG_TIEFE_MAX, ERECHNUNG_XML_MAX } from './grenzen';
import { kind, kinder, liesXml, pfad, textAm, XmlFehler, type XmlKnoten } from './xml';

export { XmlFehler };

/** Rechnungsarten (UNTDID 1001), die eine Gutschrift sind. */
const GUTSCHRIFT_ARTEN = new Set(['81', '83', '261', '262', '296', '308', '381', '396', '420', '458', '532']);
/** Höchstlänge eines Texts aus der E-Rechnung. */
const TEXT_MAX = 300;

const text = (s: string | undefined): string | undefined => {
  // Steuerzeichen werden zu Leerzeichen.
  const x = [...(s ?? '')].map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX);
  return x || undefined;
};
/** Dezimalzahl, wie XML sie schreibt (Punkt, optional Vorzeichen) – sonst undefined. */
const zahl = (s: string | undefined): number | undefined => {
  const x = (s ?? '').trim();
  if (!/^[-+]?\d{1,15}(\.\d{1,10})?$/.test(x)) return undefined;
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n * 10_000) / 10_000 : undefined;
};
/** Datum aus „JJJJ-MM-TT“ (UBL) oder „JJJJMMTT“ (CII, Format 102). */
const datum = (s: string | undefined): string | undefined => {
  const x = (s ?? '').trim();
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(x);
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3]) || Number(m[1]) < 1900 || Number(m[1]) > 2100) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}`;
};
const waehrung = (s: string | undefined) => (/^[A-Z]{3}$/.test((s ?? '').trim()) ? s!.trim() : undefined);
const iban = (s: string | undefined) => { const x = (s ?? '').replace(/\s/g, '').toUpperCase(); return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(x) ? x : undefined; };
const ustid = (s: string | undefined) => { const x = (s ?? '').replace(/\s/g, '').toUpperCase(); return /^[A-Z]{2}[0-9A-Z]{2,13}$/.test(x) ? x : undefined; };
const ohneLeere = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as T;

/**
 * XML einer E-Rechnung lesen. null, wenn es keine E-Rechnung ist (anderes Wurzelelement) oder sich nicht sicher lesen
 * lässt (DTD, Entitäten, zu groß, zu tief, kaputt) – der Grund steht dann in `fehler`.
 */
export function liesERechnung(xml: string): { er: ERechnung | null; fehler?: string } {
  let w: XmlKnoten;
  try {
    w = liesXml(xml, { zeichen: ERECHNUNG_XML_MAX, tiefe: ERECHNUNG_TIEFE_MAX, elemente: ERECHNUNG_ELEMENTE_MAX });
  } catch (e) {
    return { er: null, fehler: e instanceof XmlFehler ? e.message : 'XML nicht lesbar' };
  }
  if (w.name === 'CrossIndustryInvoice') return { er: ausCii(w) };
  if (w.name === 'Invoice' || w.name === 'CreditNote') return { er: ausUbl(w) };
  return { er: null };
}

/** Ist das wohl eine E-Rechnung als Datei (Name oder Art)? */
export const istXmlDatei = (name: string, mime: string) => /\.xml$/i.test(name) || /^(application|text)\/([\w.+-]+\+)?xml$/i.test(mime);

/** Positionen bis zur Grenze; der Rest wird gezählt. */
function begrenzt(liste: XmlKnoten[], lies: (k: XmlKnoten) => ERechnungPosition): { positionen: ERechnungPosition[]; weitere?: number } {
  const positionen = liste.slice(0, ERECHNUNG_POSITIONEN_MAX).map(lies).map(ohneLeere);
  return { positionen, ...(liste.length > ERECHNUNG_POSITIONEN_MAX ? { weitere: liste.length - ERECHNUNG_POSITIONEN_MAX } : {}) };
}
/** Der eine Steuersatz, wenn alle gleich sind. */
const einSatz = (saetze: Array<number | undefined>) => { const s = [...new Set(saetze.filter((x): x is number => x != null))]; return s.length === 1 ? s[0] : undefined; };
/** Betrag in der Rechnungswährung, wenn ein Element mehrfach steht (CII TaxTotalAmount in zwei Währungen). */
const inWaehrung = (liste: XmlKnoten[], w: string) => zahl((liste.find((x) => !x.attr.currencyID || x.attr.currencyID === w) ?? liste[0])?.text);

/* ---------- CII (ZUGFeRD, Factur-X, XRechnung CII) ---------- */

function ciiPartei(p: XmlKnoten | undefined): ERechnungPartei {
  if (!p) return {};
  const steuer = kinder(p, 'SpecifiedTaxRegistration').map((x) => kind(x, 'ID')).find((x) => x?.attr.schemeID === 'VA');
  const a = kind(p, 'PostalTradeAddress');
  return ohneLeere({
    name: text(textAm(p, 'Name')),
    ustid: ustid(steuer?.text),
    kennung: text(textAm(p, 'ID')),
    strasse: text(textAm(a, 'LineOne')), plz: text(textAm(a, 'PostcodeCode')), ort: text(textAm(a, 'CityName')), land: text(textAm(a, 'CountryID')),
    email: text(textAm(p, 'DefinedTradeContact/EmailURIUniversalCommunication/URIID') || textAm(p, 'URIUniversalCommunication/URIID')),
    telefon: text(textAm(p, 'DefinedTradeContact/TelephoneUniversalCommunication/CompleteNumber')),
  });
}

function ausCii(w: XmlKnoten): ERechnung {
  const doc = kind(w, 'ExchangedDocument');
  const tx = kind(w, 'SupplyChainTradeTransaction');
  const ag = kind(tx, 'ApplicableHeaderTradeAgreement');
  const lf = kind(tx, 'ApplicableHeaderTradeDelivery');
  const st = kind(tx, 'ApplicableHeaderTradeSettlement');
  const sum = kind(st, 'SpecifiedTradeSettlementHeaderMonetarySummation');
  const w3 = waehrung(textAm(st, 'InvoiceCurrencyCode')) ?? 'EUR';
  const art = text(textAm(doc, 'TypeCode'));
  const { positionen, weitere } = begrenzt(kinder(tx, 'IncludedSupplyChainTradeLineItem'), (x) => {
    const ls = kind(x, 'SpecifiedLineTradeSettlement');
    const menge = pfad(x, 'SpecifiedLineTradeDelivery/BilledQuantity');
    return {
      nr: text(textAm(x, 'AssociatedDocumentLineDocument/LineID')),
      beschreibung: text(textAm(x, 'SpecifiedTradeProduct/Name')),
      artikelnummer: text(textAm(x, 'SpecifiedTradeProduct/SellerAssignedID')),
      menge: zahl(menge?.text), einheit: text(menge?.attr.unitCode),
      einzelpreis: zahl(textAm(x, 'SpecifiedLineTradeAgreement/NetPriceProductTradePrice/ChargeAmount')),
      gesamt: zahl(textAm(ls, 'SpecifiedTradeSettlementLineMonetarySummation/LineTotalAmount')),
      ustSatz: zahl(textAm(ls, 'ApplicableTradeTax/RateApplicablePercent')),
    };
  });
  return ohneLeere({
    syntax: 'cii' as const,
    gutschrift: !!art && GUTSCHRIFT_ARTEN.has(art),
    art,
    profil: text(textAm(w, 'ExchangedDocumentContext/GuidelineSpecifiedDocumentContextParameter/ID')),
    nummer: text(textAm(doc, 'ID')),
    datum: datum(textAm(doc, 'IssueDateTime/DateTimeString')),
    faellig: datum(textAm(st, 'SpecifiedTradePaymentTerms/DueDateDateTime/DateTimeString')),
    waehrung: w3,
    netto: zahl(textAm(sum, 'TaxBasisTotalAmount')),
    ust: inWaehrung(kinder(sum, 'TaxTotalAmount'), w3),
    brutto: zahl(textAm(sum, 'GrandTotalAmount')),
    zahlbetrag: zahl(textAm(sum, 'DuePayableAmount')),
    ustSatz: einSatz(kinder(st, 'ApplicableTradeTax').map((x) => zahl(textAm(x, 'RateApplicablePercent')))),
    verkaeufer: ciiPartei(kind(ag, 'SellerTradeParty')),
    kaeufer: ciiPartei(kind(ag, 'BuyerTradeParty')),
    iban: iban(kinder(st, 'SpecifiedTradeSettlementPaymentMeans').map((x) => textAm(x, 'PayeePartyCreditorFinancialAccount/IBANID')).find(Boolean)),
    bestellnummer: text(textAm(ag, 'BuyerOrderReferencedDocument/IssuerAssignedID')),
    lieferschein: text(textAm(lf, 'DespatchAdviceReferencedDocument/IssuerAssignedID')),
    vertrag: text(textAm(ag, 'ContractReferencedDocument/IssuerAssignedID')),
    referenz: text(textAm(ag, 'BuyerReference')),
    leistungVon: datum(textAm(st, 'BillingSpecifiedPeriod/StartDateTime/DateTimeString')),
    leistungBis: datum(textAm(st, 'BillingSpecifiedPeriod/EndDateTime/DateTimeString')),
    positionen,
    weiterePositionen: weitere,
  });
}

/* ---------- UBL (XRechnung UBL) ---------- */

function ublPartei(p: XmlKnoten | undefined): ERechnungPartei {
  if (!p) return {};
  const a = kind(p, 'PostalAddress');
  const steuer = kinder(p, 'PartyTaxScheme').find((x) => textAm(x, 'TaxScheme/ID') === 'VAT') ?? kind(p, 'PartyTaxScheme');
  return ohneLeere({
    name: text(textAm(p, 'PartyName/Name') || textAm(p, 'PartyLegalEntity/RegistrationName')),
    ustid: ustid(textAm(steuer, 'CompanyID')),
    kennung: text(textAm(p, 'PartyIdentification/ID')),
    strasse: text(textAm(a, 'StreetName')), plz: text(textAm(a, 'PostalZone')), ort: text(textAm(a, 'CityName')), land: text(textAm(a, 'Country/IdentificationCode')),
    email: text(textAm(p, 'Contact/ElectronicMail')),
    telefon: text(textAm(p, 'Contact/Telephone')),
  });
}

function ausUbl(w: XmlKnoten): ERechnung {
  const gutschriftDoc = w.name === 'CreditNote';
  const art = text(textAm(w, gutschriftDoc ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'));
  const w3 = waehrung(textAm(w, 'DocumentCurrencyCode')) ?? 'EUR';
  const sum = kind(w, 'LegalMonetaryTotal');
  const steuer = kinder(w, 'TaxTotal');
  const { positionen, weitere } = begrenzt(kinder(w, gutschriftDoc ? 'CreditNoteLine' : 'InvoiceLine'), (x) => {
    const menge = kind(x, gutschriftDoc ? 'CreditedQuantity' : 'InvoicedQuantity');
    return {
      nr: text(textAm(x, 'ID')),
      beschreibung: text(textAm(x, 'Item/Name') || textAm(x, 'Item/Description')),
      artikelnummer: text(textAm(x, 'Item/SellersItemIdentification/ID')),
      menge: zahl(menge?.text), einheit: text(menge?.attr.unitCode),
      einzelpreis: zahl(textAm(x, 'Price/PriceAmount')),
      gesamt: zahl(textAm(x, 'LineExtensionAmount')),
      ustSatz: zahl(textAm(x, 'Item/ClassifiedTaxCategory/Percent')),
    };
  });
  const zahlung = kinder(w, 'PaymentMeans');
  return ohneLeere({
    syntax: 'ubl' as const,
    gutschrift: gutschriftDoc || (!!art && GUTSCHRIFT_ARTEN.has(art)),
    art,
    profil: text(textAm(w, 'CustomizationID')),
    nummer: text(textAm(w, 'ID')),
    datum: datum(textAm(w, 'IssueDate')),
    faellig: datum(textAm(w, 'DueDate') || zahlung.map((x) => textAm(x, 'PaymentDueDate')).find(Boolean)),
    waehrung: w3,
    netto: zahl(textAm(sum, 'TaxExclusiveAmount')),
    ust: inWaehrung(steuer.map((x) => kind(x, 'TaxAmount')).filter((x): x is XmlKnoten => !!x), w3),
    brutto: zahl(textAm(sum, 'TaxInclusiveAmount')),
    zahlbetrag: zahl(textAm(sum, 'PayableAmount')),
    ustSatz: einSatz(steuer.flatMap((x) => kinder(x, 'TaxSubtotal')).map((x) => zahl(textAm(x, 'TaxCategory/Percent')))),
    verkaeufer: ublPartei(pfad(w, 'AccountingSupplierParty/Party')),
    kaeufer: ublPartei(pfad(w, 'AccountingCustomerParty/Party')),
    iban: iban(zahlung.map((x) => textAm(x, 'PayeeFinancialAccount/ID')).find(Boolean)),
    bestellnummer: text(textAm(w, 'OrderReference/ID')),
    lieferschein: text(textAm(w, 'DespatchDocumentReference/ID')),
    vertrag: text(textAm(w, 'ContractDocumentReference/ID')),
    referenz: text(textAm(w, 'BuyerReference')),
    leistungVon: datum(textAm(w, 'InvoicePeriod/StartDate')),
    leistungBis: datum(textAm(w, 'InvoicePeriod/EndDate')),
    positionen,
    weiterePositionen: weitere,
  });
}
