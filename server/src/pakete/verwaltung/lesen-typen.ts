/**
 * Mappentypen und Ansichten eines Pakets lesen (#1278, Schritt 6a-2; vorher Teil von `liesPaket`): je Typ seine Felder
 * und Register mit allen Prüfungen, danach die Ansichten. Fehler sammelt der Lauf.
 */
import { ansichtSymbol } from '../../../../shared/src/ansichtsymbole';
import { FELDTYPEN, type Feld } from '../../../../shared/src/model';
import { FELDMERKMALE, istFeldmerkmal, istSchreibschutz, SCHREIBSCHUTZ } from '../../../../shared/src/organisation';
import { type Beschriftungen, type TypTeile } from '../../../../shared/src/beschriftung';
import { paketArchivFehler, type PaketArchiv } from '../../../../shared/src/archiv';
import { SCHLUESSEL, TYP_KENNUNG } from '../../../../shared/src/kennungen';
import { t } from '../../sprache/sprache';
import { type FremderTyp, istObjekt, type PaketFeld, type PaketRegister, type PaketSicht, type PaketTyp, paketZiele, str } from './format';
import {
  anzeigenFehler,
  sichtBedingungenFehler,
  tabellenFehler,
  teilFehler,
  vorbelegenFehler,
  zielFehler,
  zusammengesetztFehler,
} from './inhalt-pruefen';
import { liste, type LeseLauf } from './lesen-lauf';

/** Alle Mappentypen; danach „Beim Auswählen übernehmen“ und „Ist Teil einer anderen Mappe“, die alle Typen brauchen. */
export function liesTypen(l: LeseLauf): PaketTyp[] {
  const typen = liste(l, 'mappentypen').map((t, i): PaketTyp => liesTyp(l, t, i));
  // Beim Auswählen übernehmen (#1037): braucht alle Typen des Pakets.
  l.fehler.push(...vorbelegenFehler(typen, l.id));
  // Ist Teil einer anderen Mappe (#1031): gehoertZu nennt ein passendes Verweisfeld; keine Ketten im Paket.
  for (const [i, x] of typen.entries()) l.fehler.push(...teilFehler(x, typen, `mappentypen[${i + 1}]`, l.id));
  return typen;
}

/** Ein Mappentyp: Kennung, Name, Felder, Register, Archivmodus, Beschriftungen und die übrigen Angaben. */
function liesTyp(l: LeseLauf, t: Record<string, unknown>, i: number): PaketTyp {
  const { fehler } = l;
  const wo = `mappentypen[${i + 1}]`;
  if (!SCHLUESSEL.test(str(t.schluessel))) fehler.push(`${wo}: ungültige Kennung.`);
  if (!str(t.name).trim()) fehler.push(`${wo}: Name fehlt.`);
  const felder = Array.isArray(t.felder) ? (t.felder.filter(istObjekt) as unknown as PaketFeld[]) : [];
  const register = Array.isArray(t.register) ? (t.register.filter(istObjekt) as unknown as PaketRegister[]) : [];
  for (const f of felder) pruefeFeld(l, f, felder, wo);
  if (felder.filter((f) => f.merkmal !== undefined).length > 1) fehler.push(`${wo}: höchstens ein Feld mit merkmal je Mappentyp.`);
  // Anzeigen, wenn … (#1033) an Feldern und Abschnitten; was im Einzelnen nicht passt, meldet der Mappentyp beim Anlegen.
  fehler.push(...anzeigenFehler(felder, register, `${wo} „${str(t.schluessel)}“`));
  if (!register.length) fehler.push(`${wo}: mindestens ein Register nötig.`);
  // Archivmodus (#1051): Schreibweise wie in der Registry; was nicht passt, verhindert die Installation.
  const archivFehler = paketArchivFehler(t.archiv, felder, wo);
  fehler.push(...archivFehler);
  const archiv = istObjekt(t.archiv) && !archivFehler.length ? (t.archiv as unknown as PaketArchiv) : undefined;
  // Beschriftungen (#728): ein Objekt Sprache → Texte; was nicht passt, bereinigt das DMS beim Anlegen.
  if (t.beschriftungen !== undefined && !istObjekt(t.beschriftungen))
    fehler.push(`${wo}: beschriftungen muss ein Objekt „Sprache → Texte“ sein.`);
  for (const x of [...felder, ...register] as unknown as Array<Record<string, unknown>>)
    if (x.beschriftungen !== undefined && !istObjekt(x.beschriftungen))
      fehler.push(`${wo}: „${str(x.key)}“: beschriftungen muss ein Objekt „Sprache → Texte“ sein.`);
  // Dokument übernehmen (#937): Angaben mit falschem Typ übergeht Ablago (wie unbekannte Felder), statt abzulehnen.
  return typAus(t, felder, register, archiv);
}

/** Der gelesene Typ aus den Angaben; was nicht passt, fällt still weg. */
function typAus(t: Record<string, unknown>, felder: PaketFeld[], register: PaketRegister[], archiv: PaketArchiv | undefined): PaketTyp {
  return {
    schluessel: str(t.schluessel),
    name: str(t.name).trim(),
    beschreibung: str(t.beschreibung),
    titelVorlage: t.titelVorlage ? str(t.titelVorlage) : undefined,
    felder,
    register,
    trefferliste: Array.isArray(t.trefferliste) ? t.trefferliste.map(str) : undefined,
    ...(istObjekt(t.beschriftungen) ? { beschriftungen: t.beschriftungen as Beschriftungen<TypTeile> } : {}),
    ...(typeof t.ausPost === 'boolean' ? { ausPost: t.ausPost } : {}),
    ...(typeof t.erkennbarAn === 'string' && t.erkennbarAn.trim() ? { erkennbarAn: t.erkennbarAn.trim() } : {}),
    ...(t.gehoertZu !== undefined && t.gehoertZu !== null ? { gehoertZu: str(t.gehoertZu) } : {}),
    ...(typeof t.inSuche === 'boolean' ? { inSuche: t.inSuche } : {}),
    ...(archiv ? { archiv } : {}),
  };
}

/** Ein Feld: Kennung, Ziel, Feldart, negativ, berechnet, merkmal, schreibschutz, Tabelle, zusammengesetzt, aus_text. */
function pruefeFeld(l: LeseLauf, f: PaketFeld, felder: PaketFeld[], wo: string) {
  const { fehler } = l;
  if (!SCHLUESSEL.test(str(f.key))) fehler.push(`${wo}: Feld mit ungültiger Kennung „${str(f.key)}“.`);
  fehler.push(...zielFehler(f, `${wo}: Feld „${f.key}“`, l.id));
  // Feldart (#1035): Unbekanntes nicht still zu Text machen – meist braucht das Paket eine neuere Ablago-Version.
  if (f.typ !== undefined && !Object.hasOwn(FELDTYPEN, str(f.typ)))
    fehler.push(`${wo}: Feld „${f.key}“ hat die unbekannte Feldart „${str(f.typ)}“ (möglich: ${Object.keys(FELDTYPEN).join(', ')}).`);
  if (f.negativ !== undefined && (f.typ !== 'betrag' || typeof f.negativ !== 'boolean'))
    fehler.push(`${wo}: Feld „${f.key}“: negativ gibt es nur bei Beträgen (typ: betrag), als true oder false.`);
  // Berechnet (#1034): true oder false; nie Pflicht, nie Passwort. Das Schreibrecht prüft der Abschnitt zum Code.
  if (f.berechnet !== undefined && typeof f.berechnet !== 'boolean') fehler.push(`${wo}: Feld „${f.key}“: berechnet ist true oder false.`);
  else if (f.berechnet === true && f.pflicht)
    fehler.push(`${wo}: Feld „${f.key}“: Ein berechnetes Feld ist nie Pflicht – den Wert schreibt das Paket, nicht wer die Mappe anlegt.`);
  else if (f.berechnet === true && f.typ === 'passwort') fehler.push(`${wo}: Feld „${f.key}“: Passwortfelder lassen sich nicht berechnen.`);
  // Ältere Pakete hätten berechnetVon selbst setzen können – das vergibt nur Ablago.
  delete (f as Partial<Feld>).berechnetVon;
  // Eigene Organisation (#995): `merkmal: eigeneOrganisation` nur am Ja/Nein-Feld, `schreibschutz: verwaltung`.
  if (f.merkmal !== undefined && (!istFeldmerkmal(f.merkmal) || f.typ !== 'janein'))
    fehler.push(`${wo}: Feld „${f.key}“: merkmal gibt es nur am Ja/Nein-Feld (typ: janein), möglich: ${FELDMERKMALE.join(', ')}.`);
  if (f.schreibschutz !== undefined && (!istSchreibschutz(f.schreibschutz) || f.typ === 'passwort' || f.typ === 'tabelle'))
    fehler.push(`${wo}: Feld „${f.key}“: schreibschutz ist ${SCHREIBSCHUTZ.join(', ')} – nicht an Passwort und Tabelle.`);
  fehler.push(...tabellenFehler(f, `${wo}: Feld „${f.key}“`));
  fehler.push(...zusammengesetztFehler(f, felder, `${wo}: Feld „${f.key}“`));
  pruefeAusText(l, f, felder, wo);
}

/** Text → Verweis (#534): aus_text nennt das bisherige Textfeld; das DMS speichert es als ausText. */
function pruefeAusText(l: LeseLauf, f: PaketFeld, felder: PaketFeld[], wo: string) {
  const { fehler } = l;
  const roh = f as unknown as Record<string, unknown>;
  if (roh.aus_text === undefined) return;
  const quelle = felder.find((x) => x.key === roh.aus_text);
  if (f.typ !== 'referenz') fehler.push(`${wo}: Feld „${f.key}“: aus_text gibt es nur bei Verweisfeldern (typ: referenz).`);
  else if (!SCHLUESSEL.test(str(roh.aus_text)) || roh.aus_text === f.key)
    fehler.push(`${wo}: Feld „${f.key}“: aus_text muss die Kennung eines anderen Felds sein.`);
  else if (quelle && quelle.typ !== 'text' && quelle.typ !== 'langtext')
    fehler.push(`${wo}: Feld „${f.key}“: aus_text „${str(roh.aus_text)}“ ist kein Textfeld.`);
  else if (f.pflicht)
    fehler.push(
      `${wo}: Feld „${f.key}“: Ein Verweisfeld mit aus_text darf keine Pflicht sein – sonst passen vorhandene Mappen nach dem Update nicht mehr.`,
    );
  else if (paketZiele(f).length !== 1 || f.zielOptional?.length)
    fehler.push(`${wo}: Feld „${f.key}“: aus_text geht nur mit genau einem Zieltyp (ziel) – neue Mappen entstehen in diesem Typ.`);
  else f.ausText = str(roh.aus_text);
  delete roh.aus_text;
}

/** Alle Ansichten: Kennung, Name, Bedingungen, fremde Typen und Symbol. */
export function liesSichten(l: LeseLauf): PaketSicht[] {
  const { fehler } = l;
  return liste(l, 'sichten').map((s, i): PaketSicht => {
    if (!SCHLUESSEL.test(str(s.schluessel))) fehler.push(t('meldungen.pakete.sichten-ungueltige-kennung', { wert: i + 1 }));
    if (!str(s.name).trim()) fehler.push(t('meldungen.pakete.sichten-name-fehlt', { wert: i + 1 }));
    fehler.push(...sichtBedingungenFehler(s.bedingungen, `sichten[${i + 1}] „${str(s.schluessel)}“`));
    return {
      schluessel: str(s.schluessel),
      name: str(s.name).trim(),
      beschreibung: s.beschreibung ? str(s.beschreibung) : undefined,
      eltern: s.eltern ? str(s.eltern) : undefined,
      ...(istObjekt(s.beschriftungen) ? { beschriftungen: s.beschriftungen as Beschriftungen<TypTeile> } : {}),
      typen: Array.isArray(s.typen) ? s.typen.map(str) : [],
      trefferliste: s.trefferliste ? str(s.trefferliste) : undefined,
      ...(s.fremde_typen !== undefined
        ? {
            fremdeTypen: (Array.isArray(s.fremde_typen) ? s.fremde_typen : []).map((f, j): FremderTyp => {
              const k = istObjekt(f) ? str(f.kennung) : '';
              if (!TYP_KENNUNG.test(k))
                fehler.push(t('meldungen.pakete.sichten-fremde-typen-ungueltige', { wert: i + 1, wert2: j + 1, k }));
              return { kennung: k, name: istObjekt(f) ? str(f.name).trim() || k : k };
            }),
          }
        : {}),
      // Symbol (#428): unbekannte Namen (Paket für eine neuere Version) heißen „ohne Symbol“, kein Fehler.
      symbol: ansichtSymbol(s.symbol) ?? undefined,
      bedingungen: Array.isArray(s.bedingungen)
        ? s.bedingungen.filter(istObjekt).map((b) => ({ feld: str(b.feld), operator: str(b.operator), wert: b.wert }))
        : [],
    };
  });
}
