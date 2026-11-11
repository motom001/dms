/**
 * Text setzen (#1040): aus einer Text-Vorlage (Markdown, #1038) und den Werten einer Mappe einen Brief als PDF – mit
 * Briefkopf (eigene Organisation bzw. die Person im Feld „an“), Anschrift (Feld „von“), Datum und Betreff. Ergebnis
 * ist ein neues Dokument (PDF und ausgefüllter Text) im gewünschten Register oder ein PDF zum Herunterladen.
 *
 * Regeln (Ergänzung Sicherheit):
 * - Platzhalter nur mit Werten, die die Person sehen darf: die Mappe braucht Lesen, jede verwiesene Mappe ebenso
 *   (beim Herunterladen zusätzlich das Exportrecht E – Prüfstelle der Wege nach draußen). Sonst bleibt die Lücke.
 * - Passwortfelder nie, auch nicht über einen Verweis; die Vorlage wird vor jedem Satz noch einmal geprüft
 *   (`pruefeVorlage` aus pakete/, mit den Passwortfeldern aller Mappentypen).
 * - Werte sind Text, kein Markdown (shared/src/textsatz.ts); nur eine feste Liste von Formaten (die der Feldarten).
 * - Briefkopf aus der eigenen Organisation nur über die feste Liste aus #995 (Anschluss `organisation`).
 * - Ablegen braucht das Recht Bearbeiten an der Mappe, Herunterladen die Prüfstelle (beides prüft die Route vorher:
 *   `darf(…, 'U')` bzw. `mitnehmen`, das ist `dienst.pruefeAusgang` samt Spur im Verwaltungsmodus).
 *
 * Schicht 3 – bekommt Kern und Rechteprüfung; Organisation, Prüfstelle und Hochladen über den Anschluss.
 */
import { anschriftZeilen, anzeigename, liesAngaben, type Angaben, type EigeneOrganisation } from '../../../shared/src/organisation';
import { formatiere, istLeer, titelAus, type Dokument, type Feld, type Mappe, type Mappentyp, type Wert } from '../../../shared/src/model';
import { gebietsschemaVon, grundsprache, inSprache } from '../../../shared/src/sprache';
import {
  ergebnisName, laufText, lueckenText, setzeVorlage, type Brief, type Lauf, type Platzhalterwert, type PlatzhalterStand, type TextGesetzt, type VorlageEintrag, type VorlagenListe,
} from '../../../shared/src/textsatz';
import { VORLAGE_MIME } from '../../../shared/src/vorgaben';
import { Fachfehler } from '../fehler';
import { TEXTSATZ_PDF_MAX, TEXTSATZ_SEITEN, TEXTSATZ_TEXT_MAX, VORLAGE_MAX } from '../grenzen';
import type { Kern, Zugriff } from '../kern';
import { passwortFelder, pruefeVorlage, vorlagenFehlerText } from '../pakete/index';
import { briefPdf, groesseText } from '../pdf';
import { protokoll } from '../protokoll';
import { istUuid } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff';

const log = protokoll.modul('dokumente');

/**
 * Wer setzt: Person (bzw. Dienstkonto eines Pakets) mit Zugriff. `paket`: Dienstkonto – liest Werte zur Verarbeitung in
 * Ablago und braucht wie beim Lesen von Dokumenten kein Exportrecht E.
 */
export interface Setzender { ich: { id: string; rolle: string }; z: Zugriff; paket?: boolean }

/** Was der Satz außer Kern und Rechten braucht – vom Dienst hereingereicht. */
export interface TextsatzAnschluss {
  /** Die eigene Organisation für Unterlagen (#995, nur die feste Liste) – null ohne. */
  organisation(): Promise<EigeneOrganisation | null>;
  /** Prüfstelle (#723): Welche Mappen dürfen hinaus? */
  mitnehmbar(ich: Setzender['ich'], z: Zugriff, ids: string[]): Promise<Set<string>>;
  /** Dokument ablegen (Hochladen mit Historie, Ereignis, Volltext). */
  ladeHoch(mappeId: string, e: { register: string; name: string; typ: string }, inhalt: Buffer, von: string): Promise<{ dokument: Dokument }>;
  /** Darf die Person an der Mappe Dokumente hinzufügen (Bearbeiten)? */
  darfAblegen(z: Zugriff, mappeId: string): Promise<boolean>;
}

/** Sprachkennung der Volltexte (#400) → Sprache der Texte. */
const SPRACHE: Record<string, string> = { deu: 'de', eng: 'en', fra: 'fr', spa: 'es', ita: 'it', nld: 'nl', tur: 'tr', pol: 'pl', por: 'pt', rus: 'ru', ukr: 'uk', ara: 'ar' };
/** Register, in dem eigene Vorlagen liegen dürfen (ohne Paket). */
const VORLAGEN_REGISTER = 'vorlagen';
/** Verweise der gemeinsamen Kennungen (dms-registry, „Gleiche Kennungen“): von = Gegenseite, an = wer es bekommt. */
const VON = 'von';
const AN = 'an';
/** Verweise über so viele Stufen ({von.name} ist eine). */
const TIEFE_MAX = 3;

const istVorlage = (d: Dokument) => d.mime === VORLAGE_MIME || d.name.toLowerCase().endsWith('.md');
const vorlagenName = (d: Dokument) => d.name.replace(/\.md$/i, '');
const heuteIso = () => new Date().toISOString().slice(0, 10);

/** Eine gefundene Vorlage mit Quelle und Paket. */
interface Fund { dok: Dokument; quelle: Mappe; paket: { id: string; name: string } | null }

export class TextsatzDienst {
  constructor(private readonly kern: Kern, private readonly rechte: ZugriffDienst, private readonly anschluss: TextsatzAnschluss) {}

  private get repo() { return this.kern.repo; }

  /** Lesbar für diese Person – Mappe und ihr Typ (ein Dienstkonto kennt nur seine Typen). */
  private async lesbar(s: Setzender, ids: string[], hinaus: boolean): Promise<Set<string>> {
    const ok = await this.rechte.lesbare(s.z, ids.filter(istUuid));
    return hinaus ? this.anschluss.mitnehmbar(s.ich, s.z, [...ok]) : ok;
  }

  private async typ(id: string, s: Setzender): Promise<Mappentyp | undefined> {
    if (!s.z.admin && s.z.typen && !s.z.typen.has(id)) return undefined;
    return s.z.typen?.get(id) ?? this.repo.holeTyp(id);
  }

  /** Haupt-Mappe mit Leserecht (404 sonst) und ihr Typ. */
  private async haupt(s: Setzender, mappeId: string): Promise<{ mappe: Mappe; typ: Mappentyp }> {
    const mappe = await this.rechte.pruefeRecht(s.z, mappeId, 'R');
    const typ = await this.typ(mappe.typId, s);
    if (!typ) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    return { mappe, typ };
  }

  /**
   * Vorlagen zu einer Mappe: an ihr selbst und an Mappen, auf die sie verweist (z. B. die Vertragsart) – nur lesbare.
   * Vorlage ist, was ein Paket als Vorlage mitgebracht hat (#1038), oder ein Markdown-Dokument im Register „Vorlagen“.
   */
  private async funde(s: Setzender, mappe: Mappe, typ: Mappentyp): Promise<Fund[]> {
    const ziele = typ.felder.filter((f) => f.typ === 'referenz').flatMap((f) => ids(mappe.werte[f.key]));
    const lesbar = await this.lesbar(s, ziele, false);
    const quellen = [mappe, ...(await this.repo.holeMappen([...new Set(ziele)].filter((x) => lesbar.has(x) && x !== mappe.id)))];
    const vonPaket = new Map<string, { id: string; name: string }>();
    for (const p of await this.repo.listePakete()) {
      const staende = [...Object.values(p.vorgaben ?? {}).flatMap((v) => v.vorlagen ?? []), ...(p.ergaenzungen ?? []).flatMap((e) => e.vorlagen)];
      for (const v of staende) vonPaket.set(v.dokument, { id: p.id, name: p.name });
    }
    const funde: Fund[] = [];
    for (const q of quellen) {
      if (q.id !== mappe.id && !(await this.typ(q.typId, s))) continue;
      for (const dok of await this.repo.listeDokumente(q.id)) {
        if (!istVorlage(dok)) continue;
        const paket = vonPaket.get(dok.id) ?? null;
        if (paket || dok.registerKey === VORLAGEN_REGISTER) funde.push({ dok, quelle: q, paket });
      }
    }
    return funde.sort((a, b) => vorlagenName(a.dok).localeCompare(vorlagenName(b.dok), 'de'));
  }

  /** Vorlagen zu einer Mappe mit dem Stand ihrer Platzhalter (für den Dialog „Brief aus Vorlage“). */
  async vorlagen(s: Setzender, mappeId: string): Promise<VorlagenListe> {
    const { mappe, typ } = await this.haupt(s, mappeId);
    const funde = await this.funde(s, mappe, typ);
    const vorlagen: VorlageEintrag[] = [];
    for (const f of funde) {
      const text = await this.text(f.dok);
      const k = await this.kontext(s, mappe, typ, f.dok, false);
      const platzhalter = new Map<string, PlatzhalterStand>();
      if (text !== null) setzeVorlage(text, (name) => { const w = k.wert(name); platzhalter.set(name, { name, beschriftung: k.beschriftung(name), fehlt: 'luecke' in w, ...feldVon(typ, name) }); return w; });
      vorlagen.push({
        dokumentId: f.dok.id, name: vorlagenName(f.dok), quelle: { mappeId: f.quelle.id, titel: f.quelle.titel ?? '' }, paket: f.paket,
        platzhalter: [...platzhalter.values()], absender: k.absender.length ? k.absender[0] : null, empfaenger: k.empfaengerName,
      });
    }
    const [ablegen, hinaus] = await Promise.all([this.anschluss.darfAblegen(s.z, mappe.id), s.paket ? new Set([mappe.id]) : this.anschluss.mitnehmbar(s.ich, s.z, [mappe.id])]);
    const register = (typ.register ?? []).filter((r) => r.art === 'dokumente').map((r) => ({ key: r.key, name: r.name }));
    return { vorlagen, register, ablegen: ablegen && register.length > 0, herunterladen: hinaus.has(mappe.id) };
  }

  /** Inhalt einer Vorlage als Text – null, wenn er nicht als Vorlage taugt (zu groß, kein UTF-8). */
  private async text(dok: Dokument): Promise<string | null> {
    if (dok.groesse > VORLAGE_MAX) return null;
    const p = pruefeVorlage(await this.kern.liesGanz(dok.sha256), passwortFelder([...(await this.kern.typen()).values()]));
    return p.text ?? null;
  }

  /**
   * Brief setzen. `ziel: 'ablegen'` legt PDF und ausgefüllten Text als neue Dokumente ins Register; `herunterladen`
   * gibt nur das PDF zurück – Werte verwiesener Mappen dann nur mit Exportrecht E. Die Rechte an der Mappe selbst
   * (Bearbeiten bzw. Prüfstelle) prüft die Route vorher.
   */
  async setze(s: Setzender, mappeId: string, dokumentId: string, e: unknown): Promise<{ art: 'abgelegt'; ergebnis: TextGesetzt } | { art: 'pdf'; pdf: Buffer; name: string }> {
    const x = (e && typeof e === 'object' && !Array.isArray(e) ? e : {}) as { ziel?: unknown; register?: unknown };
    const ziel = x.ziel === 'herunterladen' ? 'herunterladen' : 'ablegen';
    const { mappe, typ } = await this.haupt(s, mappeId);
    const fund = (await this.funde(s, mappe, typ)).find((f) => f.dok.id === dokumentId);
    if (!fund) throw new Fachfehler(404, t('meldungen.textsatz.keine-vorlage'));
    const vorlage = await this.gepruefterText(fund.dok);
    const register = ziel === 'ablegen' ? zielRegister(typ, x.register) : undefined;
    const k = await this.kontext(s, mappe, typ, fund.dok, ziel === 'herunterladen' && !s.paket);
    const gesetzt = setzeVorlage(vorlage, k.wert);
    if (Buffer.byteLength(gesetzt.text) > TEXTSATZ_TEXT_MAX) throw new Fachfehler(413, t('meldungen.textsatz.zu-gross', { max: groesseText(TEXTSATZ_TEXT_MAX) }));
    const { pdf, seiten } = await zeichne(inSprache(k.sprache, () => briefAus(fund, k, gesetzt)));
    const name = ergebnisName(vorlagenName(fund.dok), heuteIso());
    const luecken = [...new Set(k.luecken)];
    log.info('Brief aus Vorlage gesetzt', { mappe: mappe.id, vorlage: fund.dok.id, paket: fund.paket?.id, ziel, seiten, luecken: luecken.length || undefined });
    if (!register) return { art: 'pdf', pdf, name: `${name}.pdf` };
    const pdfDok = await this.anschluss.ladeHoch(mappe.id, { register, name: `${name}.pdf`, typ: 'application/pdf' }, pdf, s.ich.id);
    const textDok = await this.anschluss.ladeHoch(mappe.id, { register, name: `${name}.md`, typ: VORLAGE_MIME }, Buffer.from(gesetzt.text), s.ich.id);
    return { art: 'abgelegt', ergebnis: { pdf: pdfDok.dokument, text: textDok.dokument, luecken } };
  }

  /** Vorlage lesen und vor jedem Satz noch einmal prüfen – sie kann seit dem Installieren eine neue Version haben. */
  private async gepruefterText(dok: Dokument): Promise<string> {
    const p = pruefeVorlage(await this.kern.liesGanz(dok.sha256), passwortFelder([...(await this.kern.typen()).values()]));
    if (p.fehler || p.text === undefined) throw new Fachfehler(422, vorlagenFehlerText(p, dok.name, groesseText(VORLAGE_MAX)));
    return p.text;
  }

  /** Verwiesene Mappen bis TIEFE_MAX Stufen, je Stufe auf einmal gelesen und geprüft (lesbar, beim Herunterladen auch E). */
  private async verwiesene(s: Setzender, mappe: Mappe, typ: Mappentyp, hinaus: boolean): Promise<Mappen> {
    const mappen: Mappen = new Map([[mappe.id, { mappe, typ }]]);
    let stufe = [mappe.id];
    for (let i = 0; i < TIEFE_MAX && stufe.length; i++) {
      const ziele = [...new Set(stufe.flatMap((id) => verweiseIn(mappen.get(id)!)))].filter((id) => !mappen.has(id));
      const ok = ziele.length ? await this.lesbar(s, ziele, hinaus) : new Set<string>();
      stufe = [];
      for (const m of await this.repo.holeMappen(ziele.filter((id) => ok.has(id)))) {
        const ty = await this.typ(m.typId, s);
        if (ty) { mappen.set(m.id, { mappe: m, typ: ty }); stufe.push(m.id); }
      }
    }
    return mappen;
  }

  /**
   * Werte für eine Mappe: Platzhalter auflösen (nur Lesbares, nie Passwörter), Briefkopf, Anschrift und Datum. `hinaus`:
   * Herunterladen – verwiesene Mappen brauchen dann auch das Exportrecht E.
   */
  private async kontext(s: Setzender, mappe: Mappe, typ: Mappentyp, vorlage: Dokument, hinaus: boolean) {
    const sprache = (vorlage.sprache && SPRACHE[vorlage.sprache]) || grundsprache();
    const mappen = await this.verwiesene(s, mappe, typ, hinaus);
    const titelVon = (id: string) => mappen.get(id)?.mappe.titel ?? '';
    const luecken: string[] = [];
    const fest: Record<string, string> = inSprache(sprache, () => ({
      heute: formatiere({ key: 'heute', label: '', typ: 'datum' } as Feld, heuteIso()), titel: mappe.titel ?? titelAus(typ, mappe.werte, titelVon), mappentyp: typ.name,
    }));
    const wert = (name: string): Platzhalterwert => {
      const r = inSprache(sprache, () => wertVon(name, { mappe, typ }, mappen, fest, titelVon));
      if ('luecke' in r) luecken.push(name);
      return r;
    };
    // Briefkopf: die Person bzw. Organisation im Feld „an“ (Kunde, leer heißt: wir), sonst die eigene Organisation.
    const an = ziel(typ, mappe, AN, mappen);
    const kopf = briefkopf(an ? liesAngaben(an.typ, an.mappe.werte) : (await this.anschluss.organisation())?.angaben ?? null);
    return { sprache, wert, beschriftung: (name: string) => beschriftung(name, typ, mappen), luecken, ...kopf, ...anschrift(typ, mappe, mappen), datum: [kopf.ort, fest.heute].filter(Boolean).join(', ') };
  }
}

type Mappen = Map<string, { mappe: Mappe; typ: Mappentyp }>;
type Kontext = Awaited<ReturnType<TextsatzDienst['kontext']>>;

/** Ids in allen Verweisfeldern einer Mappe. */
const verweiseIn = (m: { mappe: Mappe; typ: Mappentyp }) => m.typ.felder.filter((f) => f.typ === 'referenz').flatMap((f) => ids(m.mappe.werte[f.key]));

/** Register zum Ablegen: das gewünschte Dokumentenregister, sonst „dokumente“, sonst das erste. */
function zielRegister(typ: Mappentyp, wunsch: unknown): string {
  const dok = (typ.register ?? []).filter((r) => r.art === 'dokumente');
  const r = (typeof wunsch === 'string' ? dok.find((x) => x.key === wunsch) : undefined) ?? dok.find((x) => x.key === 'dokumente') ?? dok[0];
  if (!r) throw new Fachfehler(422, t('meldungen.dienst.dieses-dokumentenregister-gibt-es-2'));
  return r.key;
}

/** Die erste lesbare Mappe im Verweisfeld `key` (gemeinsame Kennungen „von“, „an“). */
function ziel(typ: Mappentyp, mappe: Mappe, key: string, mappen: Mappen) {
  const f = feldMit(typ, key);
  return f ? mappen.get(ids(mappe.werte[f.key])[0] ?? '') : undefined;
}

/** Briefkopf und Rücksendeangabe aus der festen Liste (Name, Anschrift, Telefon, E-Mail); Ort fürs Datum. */
function briefkopf(a: Angaben | null) {
  if (!a) return { absender: [] as string[], ruecksende: '', ort: undefined };
  return { absender: [...anschriftZeilen(a), a.telefon, a.email].filter((z): z is string => !!z), ruecksende: anschriftZeilen(a).join(' · '), ort: a.ort };
}

/** Anschrift: die Gegenseite im Feld „von“ (Anbieter, Rechnungssteller …) – sonst ihr Titel, sonst die Lücke. */
function anschrift(typ: Mappentyp, mappe: Mappe, mappen: Mappen): { anschrift: Lauf[][]; empfaengerName: string | null } {
  const von = feldMit(typ, VON);
  const z = ziel(typ, mappe, VON, mappen);
  if (!z) return { anschrift: von ? [[{ text: lueckenText(von.label), luecke: true }]] : [], empfaengerName: null };
  const a = liesAngaben(z.typ, z.mappe.werte);
  const zeilen = anschriftZeilen(a);
  const name = anzeigename(a) || z.mappe.titel || null;
  return { anschrift: (zeilen.length ? zeilen : name ? [name] : []).map((x) => [{ text: x }]), empfaengerName: name };
}

/** Beschriftung eines Platzhalters (für Lücke und Liste): das letzte bekannte Feld. */
function beschriftung(name: string, typ: Mappentyp, mappen: Mappen): string {
  let ty: Mappentyp | undefined = typ;
  let label = name;
  for (const teil of name.split('.')) {
    const f: Feld | undefined = ty?.felder.find((x) => x.key === teil);
    if (!f) return label === name ? teil : label;
    label = f.label;
    ty = f.typ === 'referenz' ? zielTyp(f, mappen) : undefined;
  }
  return label;
}

/** Was der Satz bekommt – in der Sprache der Vorlage gebildet. */
function briefAus(fund: Fund, k: Kontext, g: ReturnType<typeof setzeVorlage>): Brief {
  const vorlage = vorlagenName(fund.dok);
  return {
    sprache: gebietsschemaVon(k.sprache), titel: g.betreff ? laufText(g.betreff) : vorlage,
    herkunft: fund.paket ? t('meldungen.textsatz.herkunft-paket', { paket: fund.paket.name, vorlage }) : t('meldungen.textsatz.herkunft', { vorlage }),
    absender: k.absender, ruecksende: k.ruecksende, anschrift: k.anschrift, datum: k.datum, betreff: g.betreff, bloecke: g.bloecke,
    seitenText: t('meldungen.textsatz.seite'), seitenMax: TEXTSATZ_SEITEN,
  };
}

/** PDF im Arbeiter zeichnen; Seiten und Größe aus grenzen.ts. */
async function zeichne(brief: Brief): Promise<{ pdf: Buffer; seiten: number }> {
  const r = await briefPdf(brief);
  if ('zuLang' in r) throw new Fachfehler(413, t('meldungen.textsatz.zu-lang', { seiten: r.zuLang }));
  const pdf = Buffer.from(r.pdf);
  if (pdf.length > TEXTSATZ_PDF_MAX) throw new Fachfehler(413, t('meldungen.textsatz.zu-gross', { max: groesseText(TEXTSATZ_PDF_MAX) }));
  return { pdf, seiten: r.seiten };
}

/** Ein Platzhalter: fest (heute, titel, mappentyp) oder Feld, auch über Verweise ({von.name}); sonst Lücke. */
function wertVon(name: string, start: { mappe: Mappe; typ: Mappentyp }, mappen: Mappen, fest: Record<string, string>, titelVon: (id: string) => string): Platzhalterwert {
  if (Object.hasOwn(fest, name)) return fest[name] ? { text: fest[name] } : { luecke: name };
  const teile = name.split('.');
  let akt = start;
  for (const [i, teil] of teile.entries()) {
    const f = akt.typ.felder.find((x) => x.key === teil);
    if (!f) return { luecke: teil };
    // Passwortfelder nie – auch nicht über einen Verweis (Ergänzung Sicherheit).
    if (f.typ === 'passwort') return { luecke: f.label };
    if (i === teile.length - 1) return endwert(f, akt.mappe.werte[f.key], mappen, titelVon);
    const naechste = f.typ === 'referenz' ? mappen.get(ids(akt.mappe.werte[f.key])[0] ?? '') : undefined;
    if (!naechste) return { luecke: f.label };
    akt = naechste;
  }
  return { luecke: name };
}

/** Wert eines Felds, formatiert wie in Ablago (nur die Formate der Feldarten); Verweise als Titel lesbarer Mappen. */
function endwert(f: Feld, v: unknown, mappen: Mappen, titelVon: (id: string) => string): Platzhalterwert {
  if (istLeer(v)) return { luecke: f.label };
  if (f.typ === 'referenz') {
    const lesbar = ids(v).filter((id) => mappen.has(id));
    return lesbar.length ? { text: lesbar.map(titelVon).join(', ') } : { luecke: f.label };
  }
  const text = formatiere(f, v as Wert, titelVon);
  return text ? { text } : { luecke: f.label };
}

/** Ids in einem Verweiswert (eine oder mehrere). */
const ids = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).filter((x): x is string => istUuid(x));
/** Verweisfeld mit dieser Kennung. */
const feldMit = (typ: Mappentyp, key: string) => typ.felder.find((f) => f.key === key && f.typ === 'referenz');
/** Feld der Haupt-Mappe zum Hinspringen (erster Teil des Platzhalters), wenn es eins ist. */
const feldVon = (typ: Mappentyp, name: string) => { const f = typ.felder.find((x) => x.key === name.split('.')[0]); return f ? { feld: f.key } : {}; };
/** Typ der Mappe hinter einem Verweisfeld – aus den gelesenen Mappen (eine genügt, die Beschriftung ist dieselbe). */
function zielTyp(f: Feld, mappen: Map<string, { mappe: Mappe; typ: Mappentyp }>): Mappentyp | undefined {
  for (const m of mappen.values()) for (const id of ids(m.mappe.werte[f.key])) { const z = mappen.get(id); if (z) return z.typ; }
  return undefined;
}
