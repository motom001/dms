import { randomUUID } from 'node:crypto';
import type { Feld } from '../../../shared/src/model';
import type { Dienst } from '../dienst/dienst';
import { Fachfehler } from '../grundlagen/fehler';

const feld = (key: string, label: string, typ: Feld['typ'], extra: Partial<Feld> = {}): Feld => ({ key, label, typ, ...extra });

/** Kennungen der vier Beispiel-Mappentypen. */
interface BeispielIds {
  partner: string;
  vertrag: string;
  rechnung: string;
  zahlung: string;
}
/** Ablageorte der Beispiele (#168); undefined ohne Ablageort. */
interface BeispielOrte {
  roterOrdner?: string;
  vernichtet?: string;
}
type Benutzer = string | null;

/**
 * Legt Beispiel-Mappentypen und ein paar Mappen an, damit eine frische
 * Installation nicht leer ist. Nur möglich, solange es außer den Systemtypen (und einem früheren Ablageort) noch keine
 * Typen gibt. Der Kern legt keinen Ablageort an (#883): Nur wenn es einen gibt (z. B. den früheren des Kerns), bekommen Verträge
 * und Rechnungen das Feld „Verbleib Originaldokumente“ (#168) und es entstehen ein paar Ablageorte; sonst ohne.
 */
export async function ladeBeispiele(dienst: Dienst, benutzerId: Benutzer = null) {
  const ablageort = await dienst.systemtypen.ablageortTyp();
  if ((await dienst.mappentypen.listeTypen()).some((t) => !t.system && t.id !== ablageort?.id))
    throw new Fachfehler(409, 'Beispiele lassen sich nur laden, solange es noch keine Mappentypen gibt.');
  // Verbleib Originaldokumente (#168): gleiche Kennung in allen Mappentypen mit Papier – für gemeinsame Listen und Bedingungen.
  const verbleib: Feld[] = ablageort
    ? [
        feld('verbleib_original', 'Verbleib Originaldokumente', 'referenz', {
          zielTypen: [ablageort.id],
          verweisart: 'bezug',
          hilfe: 'Wo das Papier liegt – oder „vernichtet“',
        }),
      ]
    : [];
  const id: BeispielIds = { partner: randomUUID(), vertrag: randomUUID(), rechnung: randomUUID(), zahlung: randomUUID() };

  const typen = {
    partner: partnerTyp(id),
    vertrag: vertragTyp(id, verbleib),
    rechnung: rechnungTyp(id, verbleib),
    zahlung: zahlungTyp(id),
  };
  // Erst alle Typen anlegen (Register mit Verweisen brauchen die anderen Typen), dann die Register setzen.
  for (const t of Object.values(typen)) await dienst.mappentypen.legeTypAn({ ...t, register: undefined });
  for (const t of Object.values(typen)) if (t.register) await dienst.mappentypen.aendereTyp(t.id, t);

  const orte = await legeAblageorteAn(dienst, ablageort?.id, benutzerId);
  const vertraege = await legeVertraegeAn(dienst, id, orte, benutzerId);
  await legeRechnungenAn(dienst, id, orte, vertraege, benutzerId);
  if (ablageort) {
    await dienst.sichtenVerwaltung.legeSichtAn({
      name: 'Originale nach Ort',
      beschreibung: 'Verträge und Rechnungen, bei denen eingetragen ist, wo das Papier liegt',
      typen: [id.vertrag, id.rechnung],
      bedingungen: [{ art: 'feld', feld: 'verbleib_original', op: 'nichtLeer' }],
    });
  }
}

/** Vertragspartner: Firma, Behörde oder Person. */
const partnerTyp = (id: BeispielIds) => ({
  id: id.partner,
  name: 'Vertragspartner',
  beschreibung: 'Firma, Behörde oder Person, mit der es Verträge oder Rechnungen gibt',
  titelVorlage: '{name}',
  trefferliste: ['name', 'art', 'kundennummer', '_geaendert'],
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
});

/** Vertrag mit Fristen und Kosten. */
const vertragTyp = (id: BeispielIds, verbleib: Feld[]) => ({
  id: id.vertrag,
  name: 'Vertrag',
  beschreibung: 'Laufender Vertrag mit Fristen und Kosten',
  titelVorlage: '{bezeichnung}',
  trefferliste: [
    'bezeichnung',
    'vertragspartner',
    'zahlungszyklus',
    'betrag',
    'kuendigung_bis',
    'vertragsnummer',
    ...verbleib.map((f) => f.key),
  ],
  register: [
    { key: 'vertrag', name: 'Vertrag', art: 'felder' },
    { key: 'rechnungen', name: 'Rechnungen', art: 'verknuepfungen', quellen: [{ typId: id.rechnung, feldKey: 'vertrag' }] },
    { key: 'dokumente', name: 'Vertragsunterlagen', art: 'dokumente' },
  ],
  felder: [
    feld('bezeichnung', 'Bezeichnung', 'text', { pflicht: true, hilfe: 'z. B. Stromvertrag Haus', maxLen: 120 }),
    feld('vertragspartner', 'Vertragspartner', 'referenz', { pflicht: true, zielTypen: [id.partner], verweisart: 'zugehoerigkeit' }),
    feld('vertragsnummer', 'Vertragsnummer', 'text', { eindeutig: true, maxLen: 60 }),
    feld('beginn', 'Vertragsbeginn', 'datum'),
    feld('kuendigung_bis', 'Kündigung bis', 'datum', {
      hilfe: 'Letzter Tag, an dem die Kündigung eingehen muss',
      // Fristen (#129, #130): drei Monate vorher erinnern; verlängert sich der Vertrag, jährlich.
      frist: { vorlauf: 3, einheit: 'monate', empfaengerFeld: null, text: '{feld} {datum}', wiederholung: 12 },
    }),
    feld('zahlungszyklus', 'Zahlungszyklus', 'auswahl', {
      optionen: ['monatlich', 'vierteljährlich', 'halbjährlich', 'jährlich'],
      standard: 'monatlich',
    }),
    feld('betrag', 'Betrag je Zahlung', 'betrag', { min: 0, waehrung: 'EUR' }),
    ...verbleib,
  ],
});

/** Eingegangene Rechnung. */
const rechnungTyp = (id: BeispielIds, verbleib: Feld[]) => ({
  id: id.rechnung,
  name: 'Rechnung',
  beschreibung: 'Eingegangene Rechnung, gehört zu einem Vertrag oder steht für sich',
  titelVorlage: '{rechnungsnummer} vom {rechnungsdatum}',
  trefferliste: ['_titel', 'aussteller', 'vertrag', 'betrag', 'rechnungsdatum', 'bezahlt', ...verbleib.map((f) => f.key)],
  register: [
    { key: 'rechnung', name: 'Rechnung', art: 'felder' },
    { key: 'dokumente', name: 'Rechnungsdokumente', art: 'dokumente' },
    { key: 'zahlungen', name: 'Zahlungen', art: 'verknuepfungen', quellen: [{ typId: id.zahlung, feldKey: 'rechnungen' }] },
  ],
  felder: [
    feld('rechnungsnummer', 'Rechnungsnummer', 'text', { pflicht: true, maxLen: 60 }),
    feld('aussteller', 'Aussteller', 'referenz', { zielTypen: [id.partner], verweisart: 'bezug' }),
    feld('vertrag', 'Vertrag', 'referenz', {
      zielTypen: [id.vertrag],
      verweisart: 'zugehoerigkeit',
      hilfe: 'Leer lassen bei einer einmaligen Rechnung',
    }),
    feld('vertragsnummer_gedruckt', 'Vertragsnummer laut Rechnung', 'text', { hilfe: 'So wie sie auf der Rechnung steht', maxLen: 60 }),
    feld('rechnungsdatum', 'Rechnungsdatum', 'datum', { pflicht: true }),
    feld('betrag', 'Rechnungsbetrag', 'betrag', { pflicht: true, waehrung: 'EUR' }),
    feld('bezahlt', 'Bezahlt', 'janein', { standard: false }),
    ...verbleib,
  ],
});

/** Zahlung für eine oder mehrere Rechnungen. */
const zahlungTyp = (id: BeispielIds) => ({
  id: id.zahlung,
  name: 'Zahlung',
  beschreibung: 'Überweisung oder Lastschrift, kann mehrere Rechnungen begleichen',
  titelVorlage: '{verwendungszweck} vom {zahlungsdatum}',
  trefferliste: ['verwendungszweck', 'betrag', 'zahlungsdatum', 'rechnungen'],
  register: [
    { key: 'zahlung', name: 'Zahlung', art: 'felder' },
    { key: 'belege', name: 'Belege', art: 'dokumente' },
  ],
  felder: [
    feld('verwendungszweck', 'Verwendungszweck', 'text', { pflicht: true, maxLen: 140 }),
    feld('zahlungsdatum', 'Zahlungsdatum', 'datum', { pflicht: true }),
    feld('betrag', 'Betrag', 'betrag', { pflicht: true, waehrung: 'EUR' }),
    feld('rechnungen', 'Für Rechnungen', 'referenz', { zielTypen: [id.rechnung], verweisart: 'zugehoerigkeit', mehrfach: true }),
  ],
});

/** Ablageorte (#168): verschachtelt; der Titel zeigt den ganzen Pfad. Ohne Ablageort entsteht keiner. */
async function legeAblageorteAn(dienst: Dienst, ablageortId: string | undefined, benutzerId: Benutzer): Promise<BeispielOrte> {
  const ort = async (name: string, liegtIn?: string, beschreibung?: string) =>
    ablageortId
      ? (
          await dienst.mappen.legeMappeAn(
            { typId: ablageortId, werte: { name, ...(liegtIn ? { liegt_in: liegtIn } : {}), ...(beschreibung ? { beschreibung } : {}) } },
            benutzerId,
          )
        ).id
      : undefined;
  const zuHause = await ort('zu Hause');
  const schrank = zuHause && (await ort('Arbeitszimmer Schrank', zuHause));
  const roterOrdner = schrank && (await ort('roter Ordner', schrank, 'Verträge und Rechnungen rund ums Haus'));
  if (zuHause) await ort('Safe im Flur', zuHause, 'Urkunden und Ausweise');
  await ort('beim Notar', undefined, 'Originale, die der Notar verwahrt');
  const vernichtet = await ort(
    'vernichtet',
    undefined,
    'Papier ist nach dem Scannen vernichtet; das Dokument in Ablago ist die einzige Fassung',
  );
  return { roterOrdner, vernichtet };
}

const im = (o?: string) => (o ? { verbleib_original: o } : {});

/** Zwei Vertragspartner und je ein Vertrag. */
async function legeVertraegeAn(dienst: Dienst, id: BeispielIds, { roterOrdner }: BeispielOrte, benutzerId: Benutzer) {
  const sw = await dienst.mappen.legeMappeAn(
    { typId: id.partner, werte: { name: 'Stadtwerke Musterstadt', art: 'Unternehmen', kundennummer: '100234' } },
    benutzerId,
  );
  const hb = await dienst.mappen.legeMappeAn(
    { typId: id.partner, werte: { name: 'Heizungsbau Beispiel GmbH', art: 'Unternehmen', kundennummer: 'K-5521' } },
    benutzerId,
  );
  const sv = await dienst.mappen.legeMappeAn(
    {
      typId: id.vertrag,
      werte: {
        bezeichnung: 'Stromvertrag Haus',
        vertragspartner: sw.id,
        vertragsnummer: 'SV-4711',
        ...im(roterOrdner),
        beginn: '2022-01-01',
        kuendigung_bis: '2027-09-30',
        zahlungszyklus: 'monatlich',
        betrag: { betrag: 98, waehrung: 'EUR' },
      },
    },
    benutzerId,
  );
  const wv = await dienst.mappen.legeMappeAn(
    {
      typId: id.vertrag,
      werte: {
        bezeichnung: 'Wartungsvertrag Heizung',
        vertragspartner: hb.id,
        vertragsnummer: 'WV-2023-17',
        ...im(roterOrdner),
        beginn: '2023-04-01',
        kuendigung_bis: '2027-01-31',
        zahlungszyklus: 'jährlich',
        betrag: { betrag: 189, waehrung: 'EUR' },
      },
    },
    benutzerId,
  );
  return { sw, hb, sv, wv };
}

/** Zwei Rechnungen und eine Zahlung. */
async function legeRechnungenAn(
  dienst: Dienst,
  id: BeispielIds,
  { vernichtet }: BeispielOrte,
  { sw, hb, sv, wv }: Awaited<ReturnType<typeof legeVertraegeAn>>,
  benutzerId: Benutzer,
) {
  const r1 = await dienst.mappen.legeMappeAn(
    {
      typId: id.rechnung,
      werte: {
        rechnungsnummer: 'JA-2025-0815',
        ...im(vernichtet),
        aussteller: sw.id,
        vertrag: sv.id,
        vertragsnummer_gedruckt: 'SV-4711',
        rechnungsdatum: '2026-01-15',
        betrag: { betrag: 214.37, waehrung: 'EUR' },
        bezahlt: true,
      },
    },
    benutzerId,
  );
  await dienst.mappen.legeMappeAn(
    {
      typId: id.rechnung,
      werte: {
        rechnungsnummer: 'R-2026-117',
        aussteller: hb.id,
        vertrag: wv.id,
        vertragsnummer_gedruckt: 'WV-2023-17',
        rechnungsdatum: '2026-03-02',
        betrag: { betrag: 189, waehrung: 'EUR' },
        bezahlt: false,
      },
    },
    benutzerId,
  );
  await dienst.mappen.legeMappeAn(
    {
      typId: id.zahlung,
      werte: {
        verwendungszweck: 'Nachzahlung Jahresabrechnung 2025',
        zahlungsdatum: '2026-01-29',
        betrag: { betrag: 214.37, waehrung: 'EUR' },
        rechnungen: [r1.id],
      },
    },
    benutzerId,
  );
}
