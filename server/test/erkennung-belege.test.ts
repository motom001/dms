/**
 * Erkennung, Etappe 15 (#1043): eigene Organisation und Haushalt nie „von“ (ausgehend nur als Vorschlag), Gutschrift
 * negativ, Lieferschein und Rechnung einander zuordnen, E-Rechnung (XRechnung UBL/CII, ZUGFeRD im PDF) sicher lesen.
 * Alle Belege, Namen, Nummern und Adressen sind erfunden.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PDFDocument, PDFName } from 'pdf-lib';
import { eigenerAussteller, findeAngaben, vorschlaegeAus, wendeGutschriftAn, type EigeneAngaben } from '../../shared/src/erkennung';
import { erechnungText, vorschlaegeAusERechnung } from '../../shared/src/erechnung';
import type { Feld, Mappentyp } from '../../shared/src/model';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst, type Zugriff } from '../src/dienst';
import { liesERechnung } from '../src/erechnung';
import { speicherEinstellungen } from '../src/einstellungen';
import { ERECHNUNG_XML_MAX } from '../src/grenzen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { eingebetteteERechnung } from '../src/pdf/erechnung';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { liesXml, XmlFehler } from '../src/xml';
import { wieImModus } from './hilfen';

const G = { zeichen: 100_000, tiefe: 16, elemente: 1000 };

/* ---------- Beispielbelege ---------- */

/** ZUGFeRD/Factur-X bzw. XRechnung in CII (gekürzt auf das, was Ablago liest). */
const CII = (art = '380') => `<?xml version="1.0" encoding="UTF-8"?>
<!-- Beispiel, erfunden -->
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument><ram:ID>R-2026-0815</ram:ID><ram:TypeCode>${art}</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">20261105</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>1</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:SellerAssignedID>HB-200</ram:SellerAssignedID><ram:Name>Hochbeet Lärche &amp; Zubehör</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>100.00</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">2</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax><ram:RateApplicablePercent>19</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>200.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>2</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name><![CDATA[Lieferung <Pauschale>]]></ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>20.00</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="LS">1</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax><ram:RateApplicablePercent>19</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>20.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>04011000-12345-34</ram:BuyerReference>
      <ram:SellerTradeParty><ram:Name>Gartenbau Beispiel GmbH</ram:Name>
        <ram:PostalTradeAddress><ram:PostcodeCode>01067</ram:PostcodeCode><ram:LineOne>Am Wasserturm 3</ram:LineOne><ram:CityName>Musterstadt</ram:CityName><ram:CountryID>DE</ram:CountryID></ram:PostalTradeAddress>
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">DE123456789</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:ID>K-4711</ram:ID><ram:Name>Lena Muster</ram:Name></ram:BuyerTradeParty>
      <ram:BuyerOrderReferencedDocument><ram:IssuerAssignedID>B-77</ram:IssuerAssignedID></ram:BuyerOrderReferencedDocument>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery><ram:DespatchAdviceReferencedDocument><ram:IssuerAssignedID>LS-2026-0042</ram:IssuerAssignedID></ram:DespatchAdviceReferencedDocument></ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>DE89370400440532013000</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:ApplicableTradeTax><ram:CalculatedAmount>41.80</ram:CalculatedAmount><ram:RateApplicablePercent>19</ram:RateApplicablePercent></ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">20261119</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>220.00</ram:LineTotalAmount><ram:TaxBasisTotalAmount>220.00</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">41.80</ram:TaxTotalAmount><ram:GrandTotalAmount>261.80</ram:GrandTotalAmount><ram:DuePayableAmount>261.80</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

/** XRechnung in UBL als Gutschrift. */
const UBL_GUTSCHRIFT = `<?xml version="1.0" encoding="UTF-8"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ID>G-2026-0007</cbc:ID><cbc:IssueDate>2026-11-02</cbc:IssueDate><cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>Gartenbau Beispiel GmbH</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Am Wasserturm 3</cbc:StreetName><cbc:CityName>Musterstadt</cbc:CityName><cbc:PostalZone>01067</cbc:PostalZone><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>DE123456789</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyName><cbc:Name>Lena Muster</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">3.80</cbc:TaxAmount><cac:TaxSubtotal><cac:TaxCategory><cbc:Percent>19</cbc:Percent></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount currencyID="EUR">20.00</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">23.80</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">23.80</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:CreditNoteLine><cbc:ID>1</cbc:ID><cbc:CreditedQuantity unitCode="LS">1</cbc:CreditedQuantity><cbc:LineExtensionAmount currencyID="EUR">20.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Erstattung Lieferpauschale</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">20.00</cbc:PriceAmount></cac:Price></cac:CreditNoteLine>
</CreditNote>`;

const feld = (key: string, label: string, typ: Feld['typ'], x: Partial<Feld> = {}): Feld => ({ key, label, typ, ...x });

/* ---------- XML sicher lesen ---------- */

describe('XML sicher lesen (#1043, Ergänzung Sicherheit)', () => {
  it('liest Elemente, Attribute, Text, CDATA und die festen Entitäten; Präfixe fallen weg', () => {
    const w = liesXml('<?xml version="1.0"?><a:x b:c="1 &amp; 2"><a:y>A &lt;B&gt; &#x41;&#66;</a:y><z><![CDATA[<roh>]]></z><leer/></a:x>', G);
    assert.equal(w.name, 'x');
    assert.equal(w.attr.c, '1 & 2');
    assert.deepEqual(w.kinder.map((k) => [k.name, k.text]), [['y', 'A <B> AB'], ['z', '<roh>'], ['leer', '']]);
  });

  it('keine DTD, keine Entitäten: XXE und „Billion Laughs“ werden abgelehnt, nichts wird nachgeladen', () => {
    const xxe = '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><r>&x;</r>';
    const lol = '<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><l>&b;</l>';
    const extern = '<!DOCTYPE r SYSTEM "http://example.org/r.dtd"><r/>';
    for (const x of [xxe, lol, extern]) assert.throws(() => liesXml(x, G), (e) => e instanceof XmlFehler && /DTD/.test(e.message));
    assert.throws(() => liesXml('<r>&nbsp;</r>', G), XmlFehler, 'unbekannte Entität');
    assert.throws(() => liesXml('<r>&#0;</r>', G), XmlFehler);
    // Stylesheet-Anweisung wird nur übersprungen, nie ausgeführt.
    assert.equal(liesXml('<?xml-stylesheet href="http://example.org/x.xsl"?><r>ok</r>', G).text, 'ok');
  });

  it('Grenzen für Größe, Tiefe und Zahl der Elemente; kaputter Aufbau ist ein Fehler', () => {
    assert.throws(() => liesXml(`<r>${'x'.repeat(200)}</r>`, { ...G, zeichen: 100 }), /zu groß/);
    assert.throws(() => liesXml(`${'<a>'.repeat(20)}${'</a>'.repeat(20)}`, G), /zu tief/);
    assert.throws(() => liesXml(`<r>${'<a/>'.repeat(1001)}</r>`, G), /zu viele/);
    for (const x of ['<r><a></r>', '<r>', '<r/><s/>', '<r a=1/>', 'text<r/>']) assert.throws(() => liesXml(x, G), XmlFehler, x);
  });
});

/* ---------- E-Rechnung lesen ---------- */

describe('E-Rechnung lesen (#1043)', () => {
  it('CII (ZUGFeRD/Factur-X, XRechnung): Kopf, Parteien, Summen, Positionen', () => {
    const { er } = liesERechnung(CII());
    assert.ok(er);
    assert.deepEqual([er.syntax, er.gutschrift, er.nummer, er.datum, er.faellig, er.waehrung, er.netto, er.ust, er.brutto, er.ustSatz, er.iban, er.lieferschein, er.bestellnummer, er.referenz],
      ['cii', false, 'R-2026-0815', '2026-11-05', '2026-11-19', 'EUR', 220, 41.8, 261.8, 19, 'DE89370400440532013000', 'LS-2026-0042', 'B-77', '04011000-12345-34']);
    assert.deepEqual(er.verkaeufer, { name: 'Gartenbau Beispiel GmbH', ustid: 'DE123456789', strasse: 'Am Wasserturm 3', plz: '01067', ort: 'Musterstadt', land: 'DE' });
    assert.equal(er.kaeufer.kennung, 'K-4711');
    assert.deepEqual(er.positionen, [
      { nr: '1', beschreibung: 'Hochbeet Lärche & Zubehör', artikelnummer: 'HB-200', menge: 2, einheit: 'C62', einzelpreis: 100, gesamt: 200, ustSatz: 19 },
      { nr: '2', beschreibung: 'Lieferung <Pauschale>', menge: 1, einheit: 'LS', einzelpreis: 20, gesamt: 20, ustSatz: 19 },
    ]);
    assert.equal(liesERechnung(CII('381')).er?.gutschrift, true);
  });

  it('UBL-Gutschrift; anderes XML ist keine E-Rechnung, unsicheres wird nicht gelesen', () => {
    const { er } = liesERechnung(UBL_GUTSCHRIFT);
    assert.deepEqual([er?.syntax, er?.gutschrift, er?.nummer, er?.brutto, er?.netto, er?.ust, er?.positionen.length], ['ubl', true, 'G-2026-0007', 23.8, 20, 3.8, 1]);
    assert.deepEqual(liesERechnung('<html><body/></html>'), { er: null });
    const r = liesERechnung(`<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>${CII()}`);
    assert.equal(r.er, null);
    assert.match(r.fehler!, /DTD/);
    // Werte sind Text: Zahlen und Daten werden streng gelesen, sonst weggelassen.
    const kaputt = liesERechnung(CII().replace('261.80</ram:GrandTotalAmount>', '1e9</ram:GrandTotalAmount>').replace('20261105', '20261332')).er!;
    assert.deepEqual([kaputt.brutto, kaputt.datum], [undefined, undefined]);
  });

  it('ZUGFeRD: XML aus dem PDF-Anhang (Namensbaum), nur bis zur Grenze', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    await pdf.attach(Buffer.from(CII()), 'factur-x.xml', { mimeType: 'text/xml', description: 'Factur-X' });
    const xml = await eingebetteteERechnung(await pdf.save());
    assert.equal(liesERechnung(xml!).er?.nummer, 'R-2026-0815');
    // Andere Anhänge zählen nicht.
    const anders = await PDFDocument.create();
    anders.addPage();
    await anders.attach(Buffer.from(CII()), 'notiz.xml', { mimeType: 'text/xml' });
    assert.equal(await eingebetteteERechnung(await anders.save()), null);
    // Ein gepackter Anhang, der sich größer als die Grenze entpackt: nicht gelesen.
    const bombe = await PDFDocument.create();
    bombe.addPage();
    const strom = bombe.context.flateStream(Buffer.alloc(ERECHNUNG_XML_MAX + 1024, 0x20));
    const ref = bombe.context.register(strom);
    const fs = bombe.context.obj({ Type: 'Filespec', F: 'factur-x.xml', UF: 'factur-x.xml', EF: { F: ref } });
    bombe.catalog.set(PDFName.of('AF'), bombe.context.obj([bombe.context.register(fs)]));
    assert.equal(await eingebetteteERechnung(await bombe.save()), null);
    assert.equal(await eingebetteteERechnung(Buffer.from('%PDF-1.4 kaputt')), null);
  });

  it('Vorschläge aus der E-Rechnung: nach Feldart und Bezeichnung; Gutschrift negativ, wo erlaubt; berechnete Felder nie', () => {
    const typ: Pick<Mappentyp, 'felder'> = { felder: [
      feld('betrag', 'Betrag', 'betrag', { negativ: true, erkennung: { art: 'betrag' } }), feld('netto', 'Netto', 'betrag', { negativ: true }), feld('ust', 'Umsatzsteuer', 'betrag', { negativ: true }),
      feld('skonto', 'Skonto', 'betrag'), feld('ust_satz', 'Umsatzsteuersatz', 'prozent'), feld('datum', 'Rechnungsdatum', 'datum', { erkennung: { art: 'datum' } }),
      feld('faellig_am', 'Fällig am', 'datum'), feld('bezahlt_am', 'Bezahlt am', 'datum'), feld('rechnungsnummer', 'Rechnungsnummer', 'text', { erkennung: { art: 'nummer' } }),
      feld('kundennummer', 'Kunden- oder Vertragsnummer', 'text', { erkennung: { art: 'nummer' } }), feld('status', 'Status', 'text', { berechnetVon: 'rechnungen' }),
    ] };
    const v = vorschlaegeAusERechnung(typ, liesERechnung(CII()).er!);
    const werte = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.wert]));
    assert.deepEqual(werte, { betrag: { betrag: 261.8, waehrung: 'EUR' }, netto: { betrag: 220, waehrung: 'EUR' }, ust: { betrag: 41.8, waehrung: 'EUR' }, ust_satz: 19, datum: '2026-11-05', faellig_am: '2026-11-19', rechnungsnummer: 'R-2026-0815', kundennummer: 'K-4711' });
    assert.equal(v.betrag.sicherheit, 'hoch');
    assert.match(v.betrag.fundstelle, /^E-Rechnung: /);
    const g = vorschlaegeAusERechnung(typ, liesERechnung(UBL_GUTSCHRIFT).er!);
    assert.deepEqual(g.betrag.wert, { betrag: -23.8, waehrung: 'EUR' });
    assert.match(g.betrag.hinweis!, /Gutschrift/);
    // Text der E-Rechnung für Abgleich und Briefkopf.
    const a = findeAngaben(erechnungText(liesERechnung(CII()).er!));
    assert.equal(a.briefkopf?.name, 'Gartenbau Beispiel GmbH');
    assert.ok(a.nummern.some((n) => n.label === 'Lieferscheinnummer' && n.wert === 'LS-2026-0042'));
  });
});

/* ---------- Gutschrift ---------- */

describe('Gutschrift negativ (#1043)', () => {
  const typ: Pick<Mappentyp, 'felder'> = { felder: [feld('betrag', 'Betrag', 'betrag', { negativ: true, erkennung: { art: 'betrag' } }), feld('summe', 'Summe', 'betrag', { erkennung: { art: 'betrag' } })] };
  const BELEG = (kopf: string) => `Versandhaus Beispiel GmbH · Postfach 12 · 01067 Musterstadt\n${kopf}\nArtikel zurückgeschickt\nGesamtbetrag 49,90 €\n\nEine Erstattung von Versandkosten ist ausgeschlossen.`;

  it('„Gutschrift“, „Erstattung“, „Rückzahlung“ im Kopf → negativ mit Hinweis, nur in Feldern mit negativ', () => {
    for (const wort of ['Gutschrift', 'Erstattung', 'Rückzahlung']) {
      const v = vorschlaegeAus(typ, BELEG(`${wort} Nr. 12`));
      assert.deepEqual(v.betrag.wert, { betrag: -49.9, waehrung: 'EUR' }, wort);
      assert.match(v.betrag.hinweis!, new RegExp(wort));
      assert.deepEqual(v.summe.wert, { betrag: 49.9, waehrung: 'EUR' }, 'ohne negativ bleibt er positiv');
    }
  });

  it('nur im Kleingedruckten weiter unten zählt es nicht; ein schon negativer Betrag bleibt', () => {
    const lang = `Rechnung\nGesamtbetrag 49,90 €\n${'Text '.repeat(400)}\nEine Erstattung ist ausgeschlossen.`;
    assert.deepEqual(vorschlaegeAus(typ, lang).betrag.wert, { betrag: 49.9, waehrung: 'EUR' });
    assert.equal(findeAngaben(lang).gutschrift, null);
    const v = { betrag: { wert: { betrag: -5, waehrung: 'EUR' }, sicherheit: 'hoch' as const, fundstelle: '' } };
    assert.deepEqual(wendeGutschriftAn(typ, v, { wert: 'Gutschrift', sicherheit: 'mittel', fundstelle: '' }).betrag.wert, { betrag: -5, waehrung: 'EUR' });
  });
});

/* ---------- Aussteller ---------- */

describe('Eigene Organisation und Haushalt als Aussteller (#1043)', () => {
  const eigene: EigeneAngaben[] = [{ mappeId: 'o', typId: 't', namen: ['Tischlerei Brandt'], ustids: ['DE999999999'], ibans: [] }, { mappeId: 'p', typId: 'b', namen: ['Lena Muster'], ustids: [], ibans: [] }];
  it('nur Absenderzeile bzw. Verkäufer der E-Rechnung; das Anschriftfeld zählt nicht', () => {
    const ausgehend = findeAngaben('Tischlerei Brandt · Hauptstraße 5 · 12345 Musterstadt\nGartenbau Beispiel GmbH\nAm Wasserturm 3\n01067 Musterstadt\nRechnung');
    assert.equal(ausgehend.briefkopf?.zeile, true);
    assert.equal(eigenerAussteller({ name: ausgehend.briefkopf!.name, fundstelle: '' }, eigene)?.mappeId, 'o');
    assert.equal(eigenerAussteller({ name: 'Gartenbau Beispiel GmbH', fundstelle: '' }, eigene), null);
    assert.equal(eigenerAussteller({ ustid: 'de 999999999', fundstelle: '' }, eigene)?.mappeId, 'o');
    assert.equal(eigenerAussteller({ name: 'Lena Muster', fundstelle: '' }, eigene)?.mappeId, 'p');
    assert.equal(eigenerAussteller(null, eigene), null);
  });
});

/* ---------- Im Dienst ---------- */

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena Muster', passwort: 'ein-langes-passwort' });
  const { benutzer: jonas } = await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas Muster' }, lena.id);
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const R = (key: string, name: string) => ({ key, name, art: 'felder' as const });
  const DOK = { key: 'dokumente', name: 'Dokumente', art: 'dokumente' as const };
  let org = await d.mappentypen.legeTypAn({ name: 'Organisation', schluessel: 'organisation', felder: [
    feld('name', 'Name', 'text', { pflicht: true, erkennung: { art: 'name' }, wiederfinden: true }),
    feld('eigene_organisation', 'Eigene Organisation', 'janein'),
    feld('kundennummer', 'Kundennummer', 'text', { erkennung: { art: 'nummer' }, wiederfinden: true }),
    feld('ustid', 'USt-Id', 'text', { erkennung: { art: 'ustid' }, wiederfinden: true }),
    feld('strasse', 'Straße', 'text', { erkennung: {} }), feld('plz', 'PLZ', 'text', { erkennung: {} }), feld('ort', 'Ort', 'text', { erkennung: {} }),
  ], register: [R('allgemein', 'Allgemein'), DOK] });
  // Merkmal „eigene Organisation“ kommt nur aus einem Paket (#995) – hier direkt am Typ.
  org = await d.mappentypen.aendereTyp(org.id, { ...org, felder: org.felder.map((f) => (f.key === 'eigene_organisation' ? { ...f, merkmal: 'eigeneOrganisation' } : f)) }, 'basis');
  const person = await d.mappentypen.legeTypAn({ name: 'Person', schluessel: 'person', titelVorlage: '{vorname} {nachname}', felder: [
    feld('vorname', 'Vorname', 'text', { erkennung: {} }), feld('nachname', 'Nachname', 'text', { pflicht: true, erkennung: {}, wiederfinden: true }),
    feld('email', 'E-Mail', 'text', { erkennung: {}, wiederfinden: true }),
  ], register: [R('allgemein', 'Allgemein'), DOK] });
  const rechnung0 = await d.mappentypen.legeTypAn({ name: 'Rechnung', felder: [
    feld('von', 'Rechnungssteller', 'referenz', { zielTypen: [org.id, person.id], erkennung: { art: 'verweis' } }),
    feld('betrag', 'Betrag', 'betrag', { negativ: true, erkennung: { art: 'betrag' } }),
    feld('datum', 'Rechnungsdatum', 'datum', { erkennung: { art: 'datum' } }),
    feld('faellig_am', 'Fällig am', 'datum'),
    feld('rechnungsnummer', 'Rechnungsnummer', 'text', { erkennung: { art: 'nummer' }, wiederfinden: true }),
    feld('an', 'Rechnungsempfänger', 'referenz', { zielTypen: [org.id, person.id] }),
    feld('netto', 'Netto', 'betrag', { negativ: true }),
  ], register: [R('rechnung', 'Rechnung'), { key: 'anlagen', name: 'Anlagen', art: 'dokumente' }] });
  const position = await d.mappentypen.legeTypAn({ name: 'Rechnungsposition', teilVon: 'rechnung', felder: [
    feld('rechnung', 'Rechnung', 'referenz', { zielTypen: [rechnung0.id], pflicht: true, verweisart: 'zugehoerigkeit' }),
    feld('nr', 'Nr.', 'zahl'), feld('beschreibung', 'Beschreibung', 'text', { pflicht: true }), feld('menge', 'Menge', 'zahl'), feld('einheit', 'Einheit', 'text'),
    feld('einzelpreis', 'Einzelpreis', 'betrag', { negativ: true }), feld('gesamtpreis', 'Gesamtpreis', 'betrag', { negativ: true }), feld('ust_satz', 'Umsatzsteuersatz', 'prozent'),
    feld('ust_betrag', 'Umsatzsteuer', 'betrag', { negativ: true, berechnetVon: 'rechnungen' }), feld('artikelnummer', 'Artikelnummer', 'text'),
  ], register: [R('position', 'Position')] });
  const rechnung = await d.mappentypen.aendereTyp(rechnung0.id, { ...rechnung0, felder: [...rechnung0.felder, feld('positionen', 'Positionen', 'tabelle', { quelle: { typId: position.id, feldKey: 'rechnung' } })], register: rechnung0.register.map((r) => (r.key === 'rechnung' ? { ...r, felder: [...(r.felder ?? []), 'positionen'] } : r)) });
  const lieferschein = await d.mappentypen.legeTypAn({ name: 'Lieferschein', felder: [
    feld('von', 'Lieferant', 'referenz', { zielTypen: [org.id, person.id], erkennung: { art: 'verweis' } }),
    feld('lieferscheinnummer', 'Lieferscheinnummer', 'text', { erkennung: { art: 'nummer' }, wiederfinden: true }),
    feld('rechnung', 'Gehört zu Rechnung', 'referenz', { zielTypen: [rechnung.id], verweisart: 'zugehoerigkeit' }),
  ], register: [R('lieferschein', 'Lieferschein'), DOK] });
  const eigen = await d.mappen.legeMappeAn({ typId: org.id, werte: { name: 'Tischlerei Brandt', eigene_organisation: true, ustid: 'DE999999999' } }, lena.id);
  const garten = await d.mappen.legeMappeAn({ typId: org.id, werte: { name: 'Gartenbau Beispiel GmbH', ustid: 'DE123456789' } }, lena.id);
  const kunde = await d.mappen.legeMappeAn({ typId: org.id, werte: { name: 'Autohaus Özdemir', kundennummer: 'KD-5544' } }, lena.id);
  const lenaP = await d.mappen.legeMappeAn({ typId: person.id, werte: { vorname: 'Lena', nachname: 'Muster', email: 'lena@example.org' } }, lena.id);
  const A = { id: lena.id, rolle: 'admin' };
  const z = async (): Promise<Zugriff> => d.rechtepruefung.zugriff(A);
  const tabelle = routen(d, konten, {});
  const rufe = async (m: string, p: string, x: Partial<Anfrage> = {}) =>
    tabelle.find((r) => r.methode === m && r.pfad === p)!.handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: wieImModus((await konten.listeBenutzer()).find((u) => u.id === lena.id)!) });
  return { d, lena, jonas, org, person, rechnung, position, lieferschein, eigen, garten, kunde, lenaP, A, z, rufe };
}

describe('Erkennung im Dienst (#1043)', () => {
  const EINGEHEND = `Gartenbau Beispiel GmbH · Am Wasserturm 3 · 01067 Musterstadt
Tischlerei Brandt
Hauptstraße 5
12345 Musterstadt
Musterstadt, 05.11.2026
Rechnungs-Nr. R-2026-0815
Lieferschein-Nr. LS-2026-0042
Gesamtbetrag 261,80 €
USt-IdNr. DE123456789`;
  const AUSGEHEND = `Tischlerei Brandt · Hauptstraße 5 · 12345 Musterstadt
Autohaus Özdemir
Ringstraße 9
01069 Musterstadt
Musterstadt, 06.11.2026
Rechnung
Kundennummer KD-5544
Rechnungs-Nr. A-2026-0100
Gesamtbetrag 1.190,00 €`;

  it('eigene Organisation im Anschriftfeld ist nie „von“; der Aussteller wird es', async () => {
    const x = await aufbau();
    const r = await x.d.erkennung.fuerTyp(x.rechnung.id, { text: EINGEHEND }, await x.z());
    assert.equal(r.vorschlaege.von.wert, x.garten.id);
    assert.equal(r.vorschlaege.von.hinweis, undefined);
    assert.equal(r.vorschlaege.an, undefined, '„an“ eines eingehenden Belegs bleibt leer');
    // Auch ohne den Lieferanten in der Ablage: keine „neue Organisation“ mit den eigenen Angaben.
    const ohne = await x.d.erkennung.fuerTyp(x.rechnung.id, { text: EINGEHEND.replace(/Gartenbau Beispiel GmbH · Am Wasserturm 3 · 01067 Musterstadt\n/, '').replace('USt-IdNr. DE123456789', '') }, await x.z());
    assert.equal(ohne.vorschlaege.von, undefined);
    assert.equal(ohne.neu.von, undefined);
  });

  it('eigene Organisation als Aussteller: „ausgehend“ nur als Vorschlag mit Hinweis, „an“ die Gegenseite', async () => {
    const x = await aufbau();
    const r = await x.d.erkennung.fuerTyp(x.rechnung.id, { text: AUSGEHEND }, await x.z());
    assert.equal(r.vorschlaege.von.wert, x.eigen.id);
    assert.equal(r.vorschlaege.von.sicherheit, 'niedrig');
    assert.match(r.vorschlaege.von.hinweis!, /ausgehend/);
    assert.equal(r.vorschlaege.an.wert, x.kunde.id);
    // Abgleich (Dokument übernehmen): die eigene Organisation nie als „von“, und sie ist als eigene genannt.
    const a = await x.d.erkennung.abgleich(AUSGEHEND, x.rechnung.id, await x.z());
    assert.ok(!(a.verweise.von ?? []).some((t) => t.mappeId === x.eigen.id));
  });

  it('Person des Haushalts (Konto) als Aussteller bzw. im Anschriftfeld', async () => {
    const x = await aufbau();
    const privat = `Lena Muster · Lindenweg 4 · 01234 Beispielort\nGartenbau Beispiel GmbH\nAm Wasserturm 3\n01067 Musterstadt\nRechnung\nGesamtbetrag 80,00 €`;
    const r = await x.d.erkennung.fuerTyp(x.rechnung.id, { text: privat }, await x.z());
    assert.equal(r.vorschlaege.von.wert, x.lenaP.id);
    assert.match(r.vorschlaege.von.hinweis!, /ausgehend/);
    const eingehend = `Gartenbau Beispiel GmbH · Am Wasserturm 3 · 01067 Musterstadt\nLena Muster\nLindenweg 4\n01234 Beispielort\nlena@example.org\nRechnung\nGesamtbetrag 80,00 €`;
    const e = await x.d.erkennung.fuerTyp(x.rechnung.id, { text: eingehend }, await x.z());
    assert.equal(e.vorschlaege.von.wert, x.garten.id);
  });

  it('Post: eigene Organisation nie Absender; ausgehend nur als Hinweis, nie automatisch zugeordnet', async () => {
    const x = await aufbau();
    await x.d.postTyp();
    const p = await x.d.legePostAn({ betreff: 'Rechnung' }, { id: x.lena.id, name: 'Lena' });
    const dok = (await x.d.ladeHoch(p.id, { register: 'dokumente', name: 'r.pdf', typ: 'application/pdf' }, Buffer.from('%PDF-1.4 r'), x.lena.id)).dokument;
    await x.d.schreibeVolltext(dok.id, { text: AUSGEHEND }, { id: x.lena.id, herkunft: 'Test', paket: false });
    const e = (await x.d.erkennung.fuerPost(p.id))!;
    assert.ok(!e.absender.some((t) => t.mappeId === x.eigen.id));
    assert.equal(e.ausgehend?.mappeId, x.eigen.id);
    assert.equal(e.briefkopf, null);
    const { sichereZuordnung } = await import('../src/erkennung');
    assert.equal(sichereZuordnung({ ...e, eindeutig: x.kunde.id, absender: [{ mappeId: x.kunde.id, typId: x.org.id, stark: true, punkte: 3, gruende: [] }], ziele: [{ mappeId: 'z', typId: 't', punkte: 3, gruende: [], direkt: true }] }, new Set(['t'])).ziel, null);
    const b = await x.d.erkennung.fuerBenutzer(p.id, await x.z());
    assert.equal(b.ausgehend?.titel, 'Tischlerei Brandt');
  });

  it('Gutschrift im Text: negativ in „Betrag“ (negativ erlaubt) mit Hinweis', async () => {
    const x = await aufbau();
    const r = await x.d.erkennung.fuerTyp(x.rechnung.id, { text: EINGEHEND.replace('Rechnungs-Nr.', 'Gutschrift\nRechnungs-Nr.') }, await x.z());
    assert.deepEqual(r.vorschlaege.betrag.wert, { betrag: -261.8, waehrung: 'EUR' });
    assert.match(r.vorschlaege.betrag.hinweis!, /Gutschrift/);
  });

  it('Lieferschein ↔ Rechnung: Lieferschein auf der Rechnung „gehört dazu“; am Lieferschein die Rechnung, die seine Nummer nennt', async () => {
    const x = await aufbau();
    const ls = await x.d.mappen.legeMappeAn({ typId: x.lieferschein.id, werte: { von: x.garten.id, lieferscheinnummer: 'LS-2026-0042' } }, x.lena.id);
    const r = await x.d.erkennung.fuerTyp(x.rechnung.id, { text: EINGEHEND }, await x.z());
    assert.deepEqual(r.dazu?.map((d) => [d.mappeId, d.feldKey]), [[ls.id, 'rechnung']]);
    assert.match(r.dazu![0].gruende[0], /LS-2026-0042/);
    // Schon verknüpft: nicht noch einmal.
    const re = await x.d.mappen.legeMappeAn({ typId: x.rechnung.id, werte: { rechnungsnummer: 'R-2026-0815', von: x.garten.id } }, x.lena.id);
    const dok = (await x.d.ladeHoch(re.id, { register: 'anlagen', name: 'rechnung.pdf', typ: 'application/pdf' }, Buffer.from('%PDF-1.4 re'), x.lena.id)).dokument;
    await x.d.schreibeVolltext(dok.id, { text: EINGEHEND }, { id: x.lena.id, herkunft: 'Test', paket: false });
    // Umgekehrt: neuer Lieferschein mit der Nummer, die die Rechnung nennt.
    const l = await x.d.erkennung.fuerTyp(x.lieferschein.id, { text: 'Gartenbau Beispiel GmbH · Am Wasserturm 3 · 01067 Musterstadt\nLieferschein\nLieferschein-Nr. LS-2026-0042' }, await x.z());
    assert.equal(l.vorschlaege.lieferscheinnummer.wert, 'LS-2026-0042');
    assert.equal(l.vorschlaege.rechnung?.wert, re.id);
    assert.match(l.vorschlaege.rechnung.fundstelle, /LS-2026-0042/);
    await x.d.mappen.aendereMappe(ls.id, { werte: { rechnung: re.id } }, x.lena.id);
    const r2 = await x.d.erkennung.fuerTyp(x.rechnung.id, { text: EINGEHEND }, await x.z());
    assert.equal(r2.dazu, undefined);
  });

  it('E-Rechnung als XML-Dokument und als Datei: Felder, Positionen (Teile), Original unverändert', async () => {
    const x = await aufbau();
    const re = await x.d.mappen.legeMappeAn({ typId: x.rechnung.id, werte: {} }, x.lena.id);
    const roh = Buffer.from(CII());
    const dok = (await x.d.ladeHoch(re.id, { register: 'anlagen', name: 'xrechnung.xml', typ: 'application/xml' }, roh, x.lena.id)).dokument;
    const r = await x.d.erkennung.fuerTyp(x.rechnung.id, { dokumente: [dok.id], mappe: re.id }, await x.z());
    assert.deepEqual([r.vorschlaege.rechnungsnummer.wert, r.vorschlaege.datum.wert, r.vorschlaege.faellig_am.wert, r.vorschlaege.von.wert], ['R-2026-0815', '2026-11-05', '2026-11-19', x.garten.id]);
    assert.deepEqual(r.vorschlaege.betrag.wert, { betrag: 261.8, waehrung: 'EUR' });
    assert.deepEqual(r.erechnung, { syntax: 'cii', gutschrift: false, profil: 'urn:cen.eu:en16931:2017', nummer: 'R-2026-0815' });
    assert.equal(r.positionen?.typId, x.position.id);
    assert.equal(r.positionen?.feldKey, 'rechnung');
    assert.deepEqual(r.positionen?.zeilen[0], { nr: 1, beschreibung: 'Hochbeet Lärche & Zubehör', menge: 2, einheit: 'Stk', einzelpreis: { betrag: 100, waehrung: 'EUR' }, gesamtpreis: { betrag: 200, waehrung: 'EUR' }, ust_satz: 19, artikelnummer: 'HB-200' });
    assert.ok(!('ust_betrag' in r.positionen!.zeilen[0]), 'berechnete Felder nie');
    // Das Original liegt unverändert.
    const d2 = (await x.d.listeDokumente(re.id)).find((y) => y.id === dok.id)!;
    assert.equal(d2.groesse, roh.length);
    // Als Datei (Aus Dokument ausfüllen): XML ohne Texterkennung; Gutschrift negativ.
    const g = await x.rufe('POST', '/api/typen/:id/vorschlaege/datei', { params: { id: x.rechnung.id }, query: { name: 'gutschrift.xml', typ: 'application/xml' }, body: Buffer.from(UBL_GUTSCHRIFT) }) as { body: { vorschlaege: Record<string, { wert: unknown; hinweis?: string }>; positionen?: { zeilen: Array<Record<string, unknown>> }; text: string } };
    assert.deepEqual(g.body.vorschlaege.betrag.wert, { betrag: -23.8, waehrung: 'EUR' });
    assert.match(g.body.vorschlaege.betrag.hinweis!, /Gutschrift/);
    assert.deepEqual(g.body.positionen?.zeilen[0].gesamtpreis, { betrag: -20, waehrung: 'EUR' });
    assert.match(g.body.text, /Gartenbau Beispiel GmbH/);
    // XML, das keine E-Rechnung ist: 415; unsicheres XML (DTD) ebenso – gelesen wird nichts.
    await assert.rejects(x.rufe('POST', '/api/typen/:id/vorschlaege/datei', { params: { id: x.rechnung.id }, query: { name: 'x.xml', typ: 'application/xml' }, body: Buffer.from('<?xml version="1.0"?><!DOCTYPE r [<!ENTITY e SYSTEM "file:///etc/passwd">]><r>&e;</r>') }), (e: Error & { status?: number }) => e.status === 415);
  });

  it('Mappe hat schon Positionen: ohne ausdrückliches positionen keine Zeilen, mit nur „vorhanden“ (Haken in der Oberfläche aus)', async () => {
    const x = await aufbau();
    const re = await x.d.mappen.legeMappeAn({ typId: x.rechnung.id, werte: {} }, x.lena.id);
    const er = liesERechnung(CII()).er;
    const leer = await x.d.erkennung.fuerTyp(x.rechnung.id, { text: 'x', mappe: re.id }, await x.z(), { erechnung: er });
    assert.equal(leer.positionen?.zeilen.length, 2, 'leere Tabelle: Positionen angeboten');
    assert.equal(leer.positionen?.vorhanden, undefined);
    await x.d.mappen.legeMappeAn({ typId: x.position.id, werte: { rechnung: re.id, beschreibung: 'Schon da' } }, x.lena.id);
    const ohne = await x.d.erkennung.fuerTyp(x.rechnung.id, { text: 'x', mappe: re.id }, await x.z(), { erechnung: er });
    assert.deepEqual([ohne.positionen?.zeilen.length, ohne.positionen?.vorhanden, ohne.positionen?.zurueckgehalten], [0, 1, 2]);
    const mit = await x.d.erkennung.fuerTyp(x.rechnung.id, { text: 'x', mappe: re.id, positionen: true }, await x.z(), { erechnung: er });
    assert.deepEqual([mit.positionen?.zeilen.length, mit.positionen?.vorhanden], [2, 1]);
    // Über die Route mit Datei: positionen=1 ist das ausdrückliche Anlegen.
    const datei = async (q: Record<string, string>) => (await x.rufe('POST', '/api/typen/:id/vorschlaege/datei', { params: { id: x.rechnung.id }, query: { name: 'r.xml', typ: 'application/xml', mappe: re.id, ...q }, body: Buffer.from(CII()) }) as { body: { positionen?: { zeilen: unknown[]; vorhanden?: number } } }).body.positionen;
    assert.deepEqual([(await datei({}))?.zeilen.length, (await datei({ positionen: '1' }))?.zeilen.length], [0, 2]);
  });

  it('ohne Recht zum Anlegen der Positionen: keine Positionen', async () => {
    const x = await aufbau();
    await x.d.setzeBerechtigungen(x.position.id, { grund: { C: false, R: true, U: true, D: true, P: true }, regeln: [] }, true);
    const r = await x.d.erkennung.fuerTyp(x.rechnung.id, { text: 'x' }, await x.d.rechtepruefung.zugriff({ id: x.jonas.id, rolle: 'mitglied' }), { erechnung: liesERechnung(CII()).er });
    assert.equal(r.positionen, undefined);
    assert.equal(r.vorschlaege.rechnungsnummer.wert, 'R-2026-0815');
  });
});
