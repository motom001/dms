/**
 * Löschkonzept aus dem DMS erzeugen (#469): Gliederung wie die Vorlage im Admin-Handbuch
 * (docs/handbuch/vorlagen/loeschkonzept.md, #389), Abschnitt 2 „Datenarten und Fristen“ aus den
 * Mappentypen, den Datenschutz-Einstellungen (#396) und dem Archivmodus (#212). Was das DMS nicht
 * wissen kann, bleibt als [eckige Klammer]. Nur Typen, Einstellungen und Fristen – nie Inhalte aus Mappen.
 * Reine Funktionen: der Server rendert daraus PDF und .docx, die Werkbank zeigt die Lücken.
 */
import { FRISTEN, type Archiv } from './archiv';
import type { Datenschutz } from './auskunft';
import { type Feld, type Systemtyp } from './model';
import { jedeMappe, zieleVon } from './verweisziele';
import { t } from './texte';

export interface LoeschkonzeptTyp { id: string; name: string; felder: Feld[]; archiv?: Archiv | null; system?: Systemtyp | null }

export interface LoeschkonzeptQuelle {
  typen: LoeschkonzeptTyp[];
  datenschutz: Datenschutz;
  /** Aufbewahrung im Papierkorb in Tagen; 0 = kein Papierkorb. */
  papierkorbTage: number;
  /** Historie endgültig gelöschter Mappen in Tagen. */
  historieTage: number;
  /** Zeitplan der Sicherung; null = Sicherungen nicht eingerichtet. */
  sicherung: { aktiv: boolean; haeufigkeit: 'taeglich' | 'woechentlich'; aufbewahrung: { taeglich: number; woechentlich: number; monatlich: number } } | null;
  /** So lange liegen erzeugte Auskünfte bereit. */
  auskunftTage: number;
  /** Löschprotokoll (#470): Aufbewahrung in Jahren; fehlt = (noch) keins. */
  loeschprotokoll?: { jahre: number } | null;
  version: string;
  /** Stand als JJJJ-MM-TT. */
  stand: string;
  mandant: string;
}

/** Eine Zeile in Abschnitt 2. */
export interface Datenart {
  typId: string; typ: string;
  /** Warum die Zeile da ist: betrifft selbst eine Person, verweist auf eine, oder hat einen Zweck. */
  bezug: 'person' | 'verweis' | 'zweck';
  betroffene: string; zweck: string; frist: string; grund: string; stichtag: string; sperre: string; loeschweg: string;
}

/** Was fehlt und im DMS ergänzt werden kann (Werkbank → Datenschutz-Auskünfte bzw. Mappentypen). */
/** Ein Verweisfeld, über das ein Mappentyp Personendaten enthält (z. B. Konto → „Inhaber“ → Person, #664). */
export interface Personenverweis { feld: string; ziel: string }
/** Warum ein Mappentyp im Löschkonzept steht (#664). */
export interface Personenbezug { bezug: 'person' | 'verweis' | 'zweck'; verweise: Personenverweis[] }

/**
 * Was fehlt und im DMS ergänzt werden kann (Werkbank → Datenschutz-Auskünfte bzw. Mappentypen). Je Mappentyp
 * genau eine Lücke (#664) mit Grund und den fehlenden Angaben.
 */
export type Luecke =
  | { art: 'typ'; typId: string; typ: string; bezug: Personenbezug['bezug']; verweise: Personenverweis[]; fehlt: ('zweck' | 'frist')[]; text: string }
  | { art: 'verantwortlicher' | 'keine'; typId?: undefined; typ?: undefined; text: string }

export type Block =
  | { art: 'absatz'; text: string }
  | { art: 'punkte'; punkte: string[] }
  | { art: 'tabelle'; kopf: string[]; zeilen: string[][]; /** relative Spaltenbreiten */ breiten: number[] }
  | { art: 'hinweis'; titel: string; punkte: string[] };
export interface Abschnitt { titel: string; bloecke: Block[] }
export interface Loeschkonzept { titel: string; untertitel: string; stand: string; vorbemerkung: string; abschnitte: Abschnitt[]; luecken: Luecke[]; datenarten: Datenart[] }

export const LOESCHKONZEPT_TITEL = t('gemeinsam.loeschkonzept.loeschkonzept-aufbewahren-sperren');
export const FEHLT = (was: string) => `[${was}]`;

const jahre = (n: number) => `${n} ${t('gemeinsam.loeschkonzept.jahre', { anzahl: n })}`;
const tage = (n: number) => `${n} ${t('gemeinsam.loeschkonzept.tagen', { anzahl: n })}`;
const datum = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.');
const ohneSystem = (t: LoeschkonzeptTyp) => t.system !== 'benutzer' && t.system !== 'rolle';

/** Löschweg nach dem Löschen: Papierkorb mit Frist oder sofort endgültig. */
export function korbText(papierkorbTage: number) {
  return papierkorbTage > 0 ? t('gemeinsam.loeschkonzept.papierkorb-endgueltig-nach', { tage: tage(papierkorbTage) }) : t('gemeinsam.loeschkonzept.sofort-endgueltig-kein-papierkorb');
}

/**
 * Personenbezug je Mappentyp (#664): angekreuzt („betrifft eine Person“), über ein Verweisfeld auf einen
 * angekreuzten Typ, oder nur mit Zweck. Typen ohne Bezug fehlen in der Karte. Benutzer und Rollen zählen nicht.
 */
export function personenbezug(typen: LoeschkonzeptTyp[], datenschutz: Pick<Datenschutz, 'typen'>): Map<string, Personenbezug> {
  const eigene = typen.filter(ohneSystem);
  const name = new Map(typen.map((t) => [t.id, t.name] as const));
  const ds = (id: string) => datenschutz.typen[id] ?? { person: false, zweck: '' };
  const personen = new Set(eigene.filter((t) => ds(t.id).person).map((t) => t.id));
  const karte = new Map<string, Personenbezug>();
  for (const loeschkonzeptTyp of eigene) {
    const verweise = loeschkonzeptTyp.felder
      // Mehrere Zieltypen (#1036): die Personentypen darunter, außer dem eigenen.
      .filter((f) => f.typ === 'referenz' && ((jedeMappe(f) && personen.size > 0) || zieleVon(f).some((z) => personen.has(z) && z !== loeschkonzeptTyp.id)))
      .map((f) => ({ feld: f.label, ziel: jedeMappe(f) ? t('gemeinsam.loeschkonzept.zugeordnete-personen') : zieleVon(f).filter((z) => personen.has(z) && z !== loeschkonzeptTyp.id).map((z) => name.get(z) ?? z).join(', ') }));
    const bezug: Personenbezug['bezug'] | null = personen.has(loeschkonzeptTyp.id) ? 'person' : verweise.length ? 'verweis' : ds(loeschkonzeptTyp.id).zweck.trim() ? 'zweck' : null;
    if (bezug) karte.set(loeschkonzeptTyp.id, { bezug, verweise });
  }
  return karte;
}

/** „über „Inhaber“ auf Person“, mehrere mit „und“ (#664). */
export function verweisText(v: Personenverweis[]) {
  const teile = v.map((x) => t('gemeinsam.loeschkonzept.ueber-auf', { feld: x.feld, ziel: x.ziel }));
  return teile.length <= 1 ? teile.join('') : `${teile.slice(0, -1).join(', ')} und ${teile[teile.length - 1]}`;
}

/** Grund, warum ein Mappentyp Personendaten enthält – als Satzteil nach „weil …“. */
export function grundText(b: Personenbezug) {
  return b.bezug === 'person' ? t('gemeinsam.loeschkonzept.du-ihn-als-betrifft')
    : b.bezug === 'verweis' ? `er ${verweisText(b.verweise)} verweist`
    : t('gemeinsam.loeschkonzept.du-einen-zweck-fuer');
}

/**
 * Datenarten mit Personenbezug: Mappentypen, die eine Person betreffen, die auf einen solchen
 * Mappentyp verweisen (z. B. Rechnung → Kunde) oder für die ein Zweck hinterlegt ist. Benutzer
 * und Rollen stehen in Abschnitt 7. Reihenfolge: Personen zuerst, dann nach Name.
 */
export function datenarten(q: Pick<LoeschkonzeptQuelle, 'typen' | 'datenschutz' | 'papierkorbTage'>): Datenart[] {
  const typen = q.typen.filter(ohneSystem);
  const ds = (id: string) => q.datenschutz.typen[id] ?? { person: false, zweck: '' };
  const karte = personenbezug(q.typen, q.datenschutz);
  const zeilen: Datenart[] = [];
  for (const loeschkonzeptTyp of typen) {
    const zweck = ds(loeschkonzeptTyp.id).zweck.trim();
    const pb = karte.get(loeschkonzeptTyp.id);
    if (!pb) continue;
    const bezug = pb.bezug;
    const betroffene = bezug === 'person' ? t('gemeinsam.loeschkonzept.die-person-selbst', { name: loeschkonzeptTyp.name })
      : bezug === 'verweis' ? pb.verweise.map((v) => `${v.ziel} (über „${v.feld}“)`).join(', ')
      : FEHLT('Betroffene');
    const a = loeschkonzeptTyp.archiv ?? null;
    const vorschlag = a ? FRISTEN.find((x) => x.jahre === a.jahre)?.text : undefined;
    const stichtag = a ? t('gemeinsam.loeschkonzept.ab-ende-des-kalenderjahres', { wert: a.stichtag ? `„${loeschkonzeptTyp.felder.find((f) => f.key === a.stichtag)?.label ?? a.stichtag}“` : t('gemeinsam.loeschkonzept.anlagedatum-der-mappe') }) : FEHLT(t('gemeinsam.loeschkonzept.beginn-der-frist'));
    zeilen.push({
      typId: loeschkonzeptTyp.id, typ: loeschkonzeptTyp.name, bezug, betroffene,
      zweck: zweck || FEHLT('Zweck'),
      frist: a ? jahre(a.jahre) : FEHLT('Frist'),
      grund: FEHLT(vorschlag ? `Grund, z. B. ${vorschlag}` : t('gemeinsam.loeschkonzept.grund-der-frist')),
      stichtag,
      sperre: a ? 'Archivmodus' : 'keine',
      loeschweg: a ? t('gemeinsam.loeschkonzept.aufbewahrung-abgelaufen', { korbText: korbText(q.papierkorbTage) }) : t('gemeinsam.loeschkonzept.loeschen-von-hand', { FEHLT: FEHLT('Ansicht „…“'), korbText: korbText(q.papierkorbTage) }),
    });
  }
  const rang = { person: 0, verweis: 1, zweck: 2 } as const;
  return zeilen.sort((x, y) => rang[x.bezug] - rang[y.bezug] || x.typ.localeCompare(y.typ, 'de'));
}

/** Lücken, die das DMS kennt: Datenart ohne Zweck oder Frist, kein Verantwortlicher, gar keine Datenart. */
export function luecken(q: Pick<LoeschkonzeptQuelle, 'typen' | 'datenschutz' | 'papierkorbTage'>, arten = datenarten(q)): Luecke[] {
  const l: Luecke[] = [];
  if (!q.datenschutz.verantwortlicher.trim()) l.push({ art: 'verantwortlicher', text: t('gemeinsam.loeschkonzept.kein-verantwortlicher-hinterlegt') });
  if (!arten.length) l.push({ art: 'keine', text: t('gemeinsam.loeschkonzept.kein-mappentyp-betrifft-eine') });
  const bezug = personenbezug(q.typen, q.datenschutz);
  for (const a of arten) {
    const fehlt: ('zweck' | 'frist')[] = [];
    if (a.zweck === FEHLT('Zweck')) fehlt.push('zweck');
    if (a.frist === FEHLT('Frist')) fehlt.push('frist');
    if (!fehlt.length) continue;
    const b = bezug.get(a.typId) ?? { bezug: a.bezug, verweise: [] };
    const was = fehlt.map((f) => (f === 'zweck' ? 'Zweck' : 'Aufbewahrungsfrist')).join(' · ');
    l.push({ art: 'typ', typId: a.typId, typ: a.typ, bezug: b.bezug, verweise: b.verweise, fehlt,
      text: t('gemeinsam.loeschkonzept.enthaelt-personendaten-weil-es', { typ: a.typ, grundText: grundText(b), was }) });
  }
  return l;
}

/** Das ganze Löschkonzept: Abschnitte 1–9 wie die Vorlage, vorbelegt mit dem, was das DMS weiß. */
export function loeschkonzept(q: LoeschkonzeptQuelle): Loeschkonzept {
  const arten = datenarten(q);
  const fehlt = luecken(q, arten);
  const verantwortlicher = q.datenschutz.verantwortlicher.trim().replace(/\n+/g, ', ');
  const ohne = q.typen.filter(ohneSystem).filter((t) => !arten.some((a) => a.typId === t.id)).map((t) => t.name).sort((a, b) => a.localeCompare(b, 'de'));
  const korb = q.papierkorbTage > 0;
  const s = q.sicherung;
  const sicherungText = !s ? t('gemeinsam.loeschkonzept.keine-automatischen-sicherungen') : !s.aktiv ? t('gemeinsam.loeschkonzept.automatische-sicherung-ausgeschaltet') : [
    s.haeufigkeit === 'taeglich' && s.aufbewahrung.taeglich ? `${s.aufbewahrung.taeglich} tägliche` : '',
    s.aufbewahrung.woechentlich ? `${s.aufbewahrung.woechentlich} wöchentliche` : '',
    s.aufbewahrung.monatlich ? `${s.aufbewahrung.monatlich} monatliche` : '',
  ].filter(Boolean).join(', ') || t('gemeinsam.loeschkonzept.nur-die-jeweils-letzte');

  const abschnitte: Abschnitt[] = [
    { titel: t('gemeinsam.loeschkonzept.1-allgemeines'), bloecke: [{ art: 'tabelle', breiten: [1, 2.4], kopf: ['', ''], zeilen: [
      ['Verantwortlicher', verantwortlicher || FEHLT(t('gemeinsam.loeschkonzept.name-anschrift-wie-unter'))],
      [t('gemeinsam.loeschkonzept.ansprechpartner-fuer-datenschutz'), FEHLT(t('gemeinsam.loeschkonzept.name-e-mail-ggf'))],
      [t('gemeinsam.loeschkonzept.verantwortlich-fuer-loeschungen'), FEHLT('Name')],
      ['Vertretung', FEHLT('Name')],
      [t('gemeinsam.loeschkonzept.eingesetzte-software'), `Ablago (Open Source, https://github.com/motom001/dms), Version ${q.version}, selbst betrieben auf ${FEHLT(t('gemeinsam.loeschkonzept.geraet-anbieter'))}`],
      ['Geltungsbereich', arten.length ? t('gemeinsam.loeschkonzept.datenarten-aus-abschnitt-2', { map: arten.map((a) => a.typ).join(', ') }) : FEHLT(t('gemeinsam.loeschkonzept.welche-daten-z-b'))],
      [t('gemeinsam.loeschkonzept.gueltig-ab'), FEHLT('Datum')],
    ] }] },
    { titel: t('gemeinsam.loeschkonzept.2-datenarten-und-fristen'), bloecke: [
      { art: 'absatz', text: t('gemeinsam.loeschkonzept.jeder-mappentyp-in-ablago', { datum: datum(q.stand) }) },
      { art: 'tabelle', breiten: [1.1, 1.3, 1.3, 0.6, 1.1, 1.2, 0.95, 1.4], kopf: [t('gemeinsam.loeschkonzept.datenart-mappentyp'), 'Betroffene', 'Zweck', 'Frist', t('gemeinsam.loeschkonzept.grund-der-frist'), t('gemeinsam.loeschkonzept.beginn-der-frist-stichtag'), t('gemeinsam.loeschkonzept.sperre-in-ablago'), 'Löschweg'],
        zeilen: arten.length ? arten.map((a) => [a.typ, a.betroffene, a.zweck, a.frist, a.grund, a.stichtag, a.sperre, a.loeschweg])
          : [[FEHLT('Mappentyp'), FEHLT('Betroffene'), FEHLT('Zweck'), FEHLT('Frist'), FEHLT('Grund'), FEHLT('Stichtag'), 'keine', FEHLT('Löschweg')]] },
      ...(fehlt.length ? [{ art: 'hinweis' as const, titel: t('gemeinsam.loeschkonzept.bitte-ergaenzen'), punkte: fehlt.map((x) => x.text) }] : []),
      ...(ohne.length ? [{ art: 'absatz' as const, text: t('gemeinsam.loeschkonzept.ohne-personenbezug-nicht-in', { ohne: ohne.join(', ') }) }] : []),
      { art: 'absatz', text: t('gemeinsam.loeschkonzept.sperre-in-ablago-2') },
      { art: 'punkte', punkte: [
        t('gemeinsam.loeschkonzept.archivmodus-werkbank-mappentypen'),
        t('gemeinsam.loeschkonzept.keine-die-mappen-lassen'),
      ] },
      { art: 'absatz', text: t('gemeinsam.loeschkonzept.loeschweg') },
      { art: 'punkte', punkte: [
        t('gemeinsam.loeschkonzept.aufbewahrung-abgelaufen-nach'),
        t('gemeinsam.loeschkonzept.ansicht-fuer-fristen-ohne', { FEHLT: FEHLT('Name'), FEHLT2: FEHLT('Datumsfeld') }),
      ] },
    ] },
    { titel: t('gemeinsam.loeschkonzept.3-regelmaessiges-loeschen'), bloecke: [{ art: 'punkte', punkte: [
      t('gemeinsam.loeschkonzept.geht-werkbank-aufbewahrung', { FEHLT: FEHLT('Wer'), FEHLT2: FEHLT(t('gemeinsam.loeschkonzept.jaehrlich-z-b-im')), wert: q.loeschprotokoll ? t('gemeinsam.loeschkonzept.ablago-haelt-jede-loeschung') : t('gemeinsam.loeschkonzept.haelt-fest-wann-das', { FEHLT: FEHLT('Wer') }) }),
      korb ? t('gemeinsam.loeschkonzept.geloeschte-mappen-und-dokumente', { tage: tage(q.papierkorbTage) })
        : t('gemeinsam.loeschkonzept.der-papierkorb-ist-ausgeschaltet'),
      t('gemeinsam.loeschkonzept.die-historie-endgueltig-geloeschter', { tage: tage(q.historieTage) }),
    ] }] },
    { titel: t('gemeinsam.loeschkonzept.4-sperren-auf-verlangen'), bloecke: [
      { art: 'absatz', text: t('gemeinsam.loeschkonzept.verlangt-eine-person-die') },
      { art: 'punkte', punkte: [
        t('gemeinsam.loeschkonzept.mappen-im-archivmodus-sind'),
        t('gemeinsam.loeschkonzept.zugriff-der-mappentyp-hat', { FEHLT: FEHLT('Gesperrt'), FEHLT2: FEHLT('Datenschutz') }),
        t('gemeinsam.loeschkonzept.an-der-mappe-steht'),
        t('gemeinsam.loeschkonzept.nach-fristende-wird-geloescht'),
      ] },
    ] },
    { titel: t('gemeinsam.loeschkonzept.5-wer-loeschen-darf'), bloecke: [{ art: 'punkte', punkte: [
      t('gemeinsam.loeschkonzept.loeschen-duerfen-werkbank', { FEHLT: FEHLT(t('gemeinsam.loeschkonzept.z-b-nur-die')) }),
      t('gemeinsam.loeschkonzept.endgueltig-loeschen-und-den'),
      t('gemeinsam.loeschkonzept.administratoren-fuer-sie-gelten', { FEHLT: FEHLT('Namen') }),
    ] }] },
    { titel: t('gemeinsam.loeschkonzept.6-kopien-ausserhalb-der'), bloecke: [
      { art: 'absatz', text: t('gemeinsam.loeschkonzept.geloeschte-daten-koennen-noch') },
      { art: 'tabelle', breiten: [1.4, 1.2, 1.6], kopf: ['Wo', t('gemeinsam.loeschkonzept.wie-lange'), t('gemeinsam.loeschkonzept.wie-geloescht')], zeilen: [
        [t('gemeinsam.loeschkonzept.automatische-sicherungen-werkbank'), sicherungText, t('gemeinsam.loeschkonzept.ablago-entfernt-aeltere-sicherungen')],
        [t('gemeinsam.loeschkonzept.von-hand-angelegte-sicherungen'), t('gemeinsam.loeschkonzept.bis-zum-loeschen'), t('gemeinsam.loeschkonzept.loescht-sie', { FEHLT: FEHLT('Wer'), FEHLT2: FEHLT('wann') })],
        [t('gemeinsam.loeschkonzept.kopie-der-sicherungen-ausser'), FEHLT(t('gemeinsam.loeschkonzept.z-b-die-letzten')), FEHLT(t('gemeinsam.loeschkonzept.wer-wie'))],
        // #797: eigener Export-Ordner, nicht in der Sicherung; dieselbe Frist wie die Auskunft.
        [t('gemeinsam.loeschkonzept.vollexporte-und-persoenliche-exporte'), `höchstens ${tage(q.auskunftTage).replace('Tagen', 'Tage')}`, t('gemeinsam.loeschkonzept.ablago-loescht-sie-nach')],
        [t('gemeinsam.loeschkonzept.bereitliegende-auskuenfte'), t('gemeinsam.loeschkonzept.hoechstens-mit-abruf-link', { replace: tage(q.auskunftTage).replace('Tagen', 'Tage') }), t('gemeinsam.loeschkonzept.ablago-loescht-sie-selbst')],
        [t('gemeinsam.loeschkonzept.protokoll-werkbank-protokoll'), t('gemeinsam.loeschkonzept.24-stunden-in-der', { FEHLT: FEHLT(t('gemeinsam.loeschkonzept.nach-einstellung-von-docker')) }), FEHLT(t('gemeinsam.loeschkonzept.ggf-log-rotation-einstellen'))],
        [t('gemeinsam.loeschkonzept.heruntergeladene-dateien-ausdrucke-e'), FEHLT('Regel'), FEHLT('Regel')],
      ] },
    ] },
    { titel: t('gemeinsam.loeschkonzept.7-benutzerkonten'), bloecke: [{ art: 'punkte', punkte: [
      t('gemeinsam.loeschkonzept.konten-die-schon-benutzt'),
      t('gemeinsam.loeschkonzept.einladungen-die-nie-angenommen'),
      t('gemeinsam.loeschkonzept.deaktiviert-konten-von-personen', { FEHLT: FEHLT('Wer'), FEHLT2: FEHLT(t('gemeinsam.loeschkonzept.am-letzten-arbeitstag')) }),
    ] }] },
    { titel: t('gemeinsam.loeschkonzept.8-nachweis'), bloecke: [{ art: 'punkte', punkte: q.loeschprotokoll ? [
      t('gemeinsam.loeschkonzept.ablago-fuehrt-ein-loeschprotokoll', { anzahl: q.loeschprotokoll.jahre }),
      t('gemeinsam.loeschkonzept.bei-loeschungen-auf-verlangen'),
      t('gemeinsam.loeschkonzept.auskuenfte-nach-art-15'),
    ] : [
      t('gemeinsam.loeschkonzept.loeschungen-auf-verlangen-und', { FEHLT: FEHLT('Wer'), FEHLT2: FEHLT(t('gemeinsam.loeschkonzept.einer-mappe-datenschutzanfragen')) }),
      t('gemeinsam.loeschkonzept.auskuenfte-nach-art-15'),
    ] }] },
    { titel: t('gemeinsam.loeschkonzept.9-aenderungen-dieses-loeschkonzepts'), bloecke: [{ art: 'tabelle', breiten: [1, 2.4, 1.2], kopf: ['Datum', t('gemeinsam.loeschkonzept.was-geaendert'), 'Wer'], zeilen: [
      [datum(q.stand), t('gemeinsam.loeschkonzept.aus-ablago-erzeugt-version', { version: q.version }), FEHLT('Name')],
      [FEHLT('Datum'), FEHLT(t('gemeinsam.loeschkonzept.erste-version')), FEHLT('Name')],
    ] }] },
  ];
  return {
    titel: LOESCHKONZEPT_TITEL,
    untertitel: q.mandant || verantwortlicher || '',
    stand: t('gemeinsam.loeschkonzept.stand-aus-ablago-erzeugt', { datum: datum(q.stand), version: q.version }),
    vorbemerkung: t('gemeinsam.loeschkonzept.erzeugt-aus-den-mappentypen'),
    abschnitte, luecken: fehlt, datenarten: arten,
  };
}
