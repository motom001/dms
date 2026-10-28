import { randomUUID } from 'node:crypto';
import type { Feld } from '../../shared/src/model';
import type { Dienst } from './dienst';
import { Fachfehler } from './fehler';

const feld = (key: string, label: string, typ: Feld['typ'], extra: Partial<Feld> = {}): Feld => ({ key, label, typ, ...extra });

/**
 * Legt Beispiel-Mappentypen und ein paar Mappen an, damit eine frische
 * Installation nicht leer ist. Nur möglich, solange es außer Benutzer und Rolle noch keine Typen gibt.
 */
export async function ladeBeispiele(dienst: Dienst, benutzerId: string | null = null) {
  if ((await dienst.listeTypen()).some((t) => !t.system)) throw new Fachfehler(409, 'Beispiele lassen sich nur laden, solange es noch keine Mappentypen gibt.');
  const id = { partner: randomUUID(), vertrag: randomUUID(), rechnung: randomUUID(), zahlung: randomUUID() };

  const typen = {
    partner: {
      id: id.partner, name: 'Vertragspartner', beschreibung: 'Firma, Behörde oder Person, mit der es Verträge oder Rechnungen gibt', titelVorlage: '{name}', trefferliste: ['name', 'art', 'kundennummer', '_geaendert'],
      register: [
        { key: 'stammdaten', name: 'Stammdaten', art: 'felder' },
        { key: 'vertraege', name: 'Verträge', art: 'verknuepfungen', quellen: [{ typId: id.vertrag, feldKey: 'vertragspartner' }] },
        { key: 'rechnungen', name: 'Rechnungen', art: 'verknuepfungen', quellen: [{ typId: id.rechnung, feldKey: 'aussteller' }] },
        { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
      ],
      felder: [
        feld('name', 'Name', 'text', { pflicht: true, eindeutig: true, maxLen: 120 }),
        feld('art', 'Art', 'auswahl', { optionen: ['Unternehmen', 'Behörde', 'Privatperson'], standard: 'Unternehmen' }),
        feld('kundennummer', 'Kundennummer', 'text', { hilfe: 'Deine Nummer beim Vertragspartner', maxLen: 40 }),
      ],
    },
    vertrag: {
      id: id.vertrag, name: 'Vertrag', beschreibung: 'Laufender Vertrag mit Fristen und Kosten', titelVorlage: '{bezeichnung}', trefferliste: ['bezeichnung', 'vertragspartner', 'zahlungszyklus', 'betrag', 'kuendigung_bis', 'vertragsnummer'],
      register: [
        { key: 'vertrag', name: 'Vertrag', art: 'felder' },
        { key: 'rechnungen', name: 'Rechnungen', art: 'verknuepfungen', quellen: [{ typId: id.rechnung, feldKey: 'vertrag' }] },
        { key: 'dokumente', name: 'Vertragsunterlagen', art: 'dokumente' },
      ],
      felder: [
        feld('bezeichnung', 'Bezeichnung', 'text', { pflicht: true, hilfe: 'z. B. Stromvertrag Haus', maxLen: 120 }),
        feld('vertragspartner', 'Vertragspartner', 'referenz', { pflicht: true, zielTyp: id.partner, verweisart: 'bezug' }),
        feld('vertragsnummer', 'Vertragsnummer', 'text', { eindeutig: true, maxLen: 60 }),
        feld('beginn', 'Vertragsbeginn', 'datum'),
        feld('kuendigung_bis', 'Kündigung bis', 'datum', { hilfe: 'Letzter Tag, an dem die Kündigung eingehen muss' }),
        feld('zahlungszyklus', 'Zahlungszyklus', 'auswahl', { optionen: ['monatlich', 'vierteljährlich', 'halbjährlich', 'jährlich'], standard: 'monatlich' }),
        feld('betrag', 'Betrag je Zahlung', 'betrag', { min: 0, waehrung: 'EUR' }),
      ],
    },
    rechnung: {
      id: id.rechnung, name: 'Rechnung', beschreibung: 'Eingegangene Rechnung, gehört zu einem Vertrag oder steht für sich', titelVorlage: '{rechnungsnummer} vom {rechnungsdatum}', trefferliste: ['_titel', 'aussteller', 'vertrag', 'betrag', 'rechnungsdatum', 'bezahlt'],
      register: [
        { key: 'rechnung', name: 'Rechnung', art: 'felder' },
        { key: 'dokumente', name: 'Rechnungsdokumente', art: 'dokumente' },
        { key: 'zahlungen', name: 'Zahlungen', art: 'verknuepfungen', quellen: [{ typId: id.zahlung, feldKey: 'rechnungen' }] },
      ],
      felder: [
        feld('rechnungsnummer', 'Rechnungsnummer', 'text', { pflicht: true, maxLen: 60 }),
        feld('aussteller', 'Aussteller', 'referenz', { zielTyp: id.partner, verweisart: 'bezug' }),
        feld('vertrag', 'Vertrag', 'referenz', { zielTyp: id.vertrag, verweisart: 'zugehoerigkeit', hilfe: 'Leer lassen bei einer einmaligen Rechnung' }),
        feld('vertragsnummer_gedruckt', 'Vertragsnummer laut Rechnung', 'text', { hilfe: 'So wie sie auf der Rechnung steht', maxLen: 60 }),
        feld('rechnungsdatum', 'Rechnungsdatum', 'datum', { pflicht: true }),
        feld('betrag', 'Rechnungsbetrag', 'betrag', { pflicht: true, waehrung: 'EUR' }),
        feld('bezahlt', 'Bezahlt', 'janein', { standard: false }),
      ],
    },
    zahlung: {
      id: id.zahlung, name: 'Zahlung', beschreibung: 'Überweisung oder Lastschrift, kann mehrere Rechnungen begleichen', titelVorlage: '{verwendungszweck} vom {zahlungsdatum}', trefferliste: ['verwendungszweck', 'betrag', 'zahlungsdatum', 'rechnungen'],
      register: [
        { key: 'zahlung', name: 'Zahlung', art: 'felder' },
        { key: 'belege', name: 'Belege', art: 'dokumente' },
      ],
      felder: [
        feld('verwendungszweck', 'Verwendungszweck', 'text', { pflicht: true, maxLen: 140 }),
        feld('zahlungsdatum', 'Zahlungsdatum', 'datum', { pflicht: true }),
        feld('betrag', 'Betrag', 'betrag', { pflicht: true, waehrung: 'EUR' }),
        feld('rechnungen', 'Für Rechnungen', 'referenz', { zielTyp: id.rechnung, verweisart: 'zugehoerigkeit', mehrfach: true }),
      ],
    },
  };
  // Erst alle Typen anlegen (Register mit Verweisen brauchen die anderen Typen), dann die Register setzen.
  for (const t of Object.values(typen)) await dienst.legeTypAn({ ...t, register: undefined });
  for (const t of Object.values(typen)) if (t.register) await dienst.aendereTyp(t.id, t);

  const sw = await dienst.legeMappeAn({ typId: id.partner, werte: { name: 'Stadtwerke Musterstadt', art: 'Unternehmen', kundennummer: '100234' } }, benutzerId);
  const hb = await dienst.legeMappeAn({ typId: id.partner, werte: { name: 'Heizungsbau Beispiel GmbH', art: 'Unternehmen', kundennummer: 'K-5521' } }, benutzerId);
  const sv = await dienst.legeMappeAn({ typId: id.vertrag, werte: { bezeichnung: 'Stromvertrag Haus', vertragspartner: sw.id, vertragsnummer: 'SV-4711', beginn: '2022-01-01', kuendigung_bis: '2027-09-30', zahlungszyklus: 'monatlich', betrag: { betrag: 98, waehrung: 'EUR' } } }, benutzerId);
  const wv = await dienst.legeMappeAn({ typId: id.vertrag, werte: { bezeichnung: 'Wartungsvertrag Heizung', vertragspartner: hb.id, vertragsnummer: 'WV-2023-17', beginn: '2023-04-01', kuendigung_bis: '2027-01-31', zahlungszyklus: 'jährlich', betrag: { betrag: 189, waehrung: 'EUR' } } }, benutzerId);
  const r1 = await dienst.legeMappeAn({ typId: id.rechnung, werte: { rechnungsnummer: 'JA-2025-0815', aussteller: sw.id, vertrag: sv.id, vertragsnummer_gedruckt: 'SV-4711', rechnungsdatum: '2026-01-15', betrag: { betrag: 214.37, waehrung: 'EUR' }, bezahlt: true } }, benutzerId);
  await dienst.legeMappeAn({ typId: id.rechnung, werte: { rechnungsnummer: 'R-2026-117', aussteller: hb.id, vertrag: wv.id, vertragsnummer_gedruckt: 'WV-2023-17', rechnungsdatum: '2026-03-02', betrag: { betrag: 189, waehrung: 'EUR' }, bezahlt: false } }, benutzerId);
  await dienst.legeMappeAn({ typId: id.zahlung, werte: { verwendungszweck: 'Nachzahlung Jahresabrechnung 2025', zahlungsdatum: '2026-01-29', betrag: { betrag: 214.37, waehrung: 'EUR' }, rechnungen: [r1.id] } }, benutzerId);
}
