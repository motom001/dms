/**
 * Erkennung im Kern (#336): Vorschläge beim Zuordnen von Post – Absender, Angaben und Zielmappe.
 *
 * Läuft auf das interne Ereignis „Volltext fertig“ (nicht auf das Ende der eingebauten Texterkennung),
 * damit es auch mit einer Texterkennung als Paket (#458) läuft. Gerechnet wird einmal je Post, das
 * Ergebnis liegt an der Post (Tabelle erkennungen). Gespeichert sind nur Ids und Begründungen; beim
 * Lesen sieht jeder nur die Mappen, die er lesen darf. Die Muster stehen in shared/src/erkennung.ts.
 */

import type { Fund, Nummernfund, Briefkopf, Treffer } from '../../shared/src/erkennung';
import { eindeutigerTreffer, ENGINE_EINGEBAUT, typAusText, type TypFund, ERKENNEN_HINWEIS, findeAngaben, findeMappen, fuellfelder, gleicheAb, istAbsenderTyp, merkmalsfelder, type Abgleich, pruefeVorschlaege, schemaFuer, vorschlaegeAus, type Angaben, type AusDokument, type Vergleichsmappe, type Vorschlaege, eigeneAngaben, eigenerAussteller, wendeGutschriftAn, artVon, type Aussteller, type EigeneAngaben, type Vorschlag } from '../../shared/src/erkennung';
import { erechnungText, positionAusERechnung, vorschlaegeAusERechnung, type ERechnung } from '../../shared/src/erechnung';
import { jedeMappe } from '../../shared/src/verweisziele';
import { eingebetteteERechnung } from './pdf';
import { istXmlDatei, liesERechnung } from './erechnung';
import { ERECHNUNG_XML_MAX } from './grenzen';
import { hatNetz, hatSchnittstelle } from '../../shared/src/pakete';
import type { Einstellungen } from './einstellungen';
import { auswahlText, geschuetzteFelder, zieleVon, type Betrag, type Feld, type Mappe, type Mappentyp, type MappenBezug, type Werte, type Wert } from '../../shared/src/model';
import { istEigeneOrganisation, merkmalFeld } from '../../shared/src/organisation';
import type { Dienst, Zugriff } from './dienst';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import type { Repo } from './repo';
import { t } from './sprache';
import { Klassifizierung } from './klassifizierung';
import { stehtImText } from '../../shared/src/klassifizierung';
import { stelleVon, textformen } from '../../shared/src/uebernehmen';
import type { SchwaerzSeite } from '../../shared/src/schwaerzen';

const log = protokoll.modul('ablage');

/** Ein Vorschlag für die Zielmappe; die Gründe stehen ohne Titel da (die setzt erst das Lesen ein). */
export interface Zielvorschlag { mappeId: string; typId: string; punkte: number; gruende: string[]; /** Direkt im Text gefunden (z. B. Vertragsnummer). */ direkt?: boolean }

/** Automatische Zuordnung (#337), festgehalten an der Erkennung der Post – für „Rückgängig“. */
export interface AutoZuordnung {
  ziel: string; zeit: string; grund: string;
  /** Dokumente, die zur Zielmappe gewandert sind, mit ihrem Register in der Post. */
  dokumente: Array<{ id: string; register: string }>;
  aufgabe: string | null;
  /** Rückgängig gemacht: dann nie wieder automatisch. */
  rueckgaengig?: { zeit: string; von: string | null };
}

/**
 * Ist die Erkennung „sicher“ (#337)? Absender eindeutig an einem starken Merkmal (Kundennummer, IBAN …) und genau
 * eine passende Zielmappe unter den Mappentypen mit „automatisch zuordnen“ – bei mehreren gewinnt die eine,
 * die direkt im Text steht (z. B. über ihre Vertragsnummer). Liefert Ziel und Begründung oder den Grund dagegen.
 */
export function sichereZuordnung(e: Pick<PostErkennung, 'absender' | 'eindeutig' | 'ziele' | 'ausgehend'>, autoTypen: Set<string>): { ziel: Zielvorschlag; grund: string } | { ziel: null; grund: string } {
  // Eigene Post (#1043): nie still zuordnen – „ausgehend“ ist nur ein Vorschlag (Ergänzung Sicherheit).
  if (e.ausgehend) return { ziel: null, grund: t('meldungen.erkennung.ausgehend-nicht-automatisch') };
  const abs = e.absender.find((x) => x.mappeId === e.eindeutig);
  if (!abs || !abs.stark) return { ziel: null, grund: t('meldungen.erkennung.absender-nicht-eindeutig-erkannt') };
  const kandidaten = e.ziele.filter((z) => autoTypen.has(z.typId));
  const direkt = kandidaten.filter((z) => z.direkt);
  const ziel = direkt.length === 1 ? direkt[0] : !direkt.length && kandidaten.length === 1 ? kandidaten[0] : null;
  if (!ziel) return { ziel: null, grund: kandidaten.length ? t('meldungen.erkennung.passende-mappen-nicht-eindeutig', { kandidaten: kandidaten.length }) : t('meldungen.erkennung.keine-passende-mappe-eines') };
  return { ziel, grund: t('meldungen.erkennung.absender-eindeutig-erkannt-einzige', { gruende: abs.gruende.join(', '), gruende2: ziel.gruende.join(', ') }) };
}

/** Was an einer Post gespeichert ist. */
export interface PostErkennung {
  zeit: string;
  /** Dokumente der Post mit Volltext. */
  dokumente: number;
  /** Mögliche Absender (Organisation, Niederlassung, Person …), beste zuerst. */
  absender: Treffer[];
  /** Eindeutig erkannter Absender (genau einer mit starkem Merkmal). */
  eindeutig: string | null;
  /** gutschrift (#1043): „Gutschrift“, „Erstattung“ … auf dem Beleg – der Betrag gehört dann negativ in Felder, die das erlauben. */
  angaben: { datum: Fund | null; betrag: Fund<Betrag> | null; nummern: Nummernfund[]; gutschrift?: Fund };
  /** Absender aus dem Briefkopf, wenn keiner der vorhandenen passt. */
  briefkopf: Briefkopf | null;
  ziele: Zielvorschlag[];
  /** Automatisch zugeordnet (#337). */
  auto?: AutoZuordnung;
  /**
   * Ausgehend? (#1043): Eine eigene Organisation oder eine Person des Haushalts steht als Aussteller in der
   * Absenderzeile. Nur ein Hinweis – die Richtung der Post ändert die Erkennung nie selbst.
   */
  ausgehend?: { mappeId: string; fundstelle: string };
}

/** Was ein Benutzer davon sieht: nur lesbare Mappen, mit Titeln. */
export interface ErkennungAntwort {
  zeit: string;
  dokumente: number;
  absender: Array<Treffer & { titel: string }>;
  eindeutig: string | null;
  angaben: PostErkennung['angaben'];
  /** Unbekannter Absender: Vorschlag „neue Organisation anlegen“ mit vorbelegten Feldern. */
  neuerAbsender: { typId: string; werte: Record<string, string>; fundstelle: string } | null;
  ziele: Array<Zielvorschlag & { titel: string }>;
  bezuege: Record<string, MappenBezug>;
  /** Automatisch zugeordnet (#337) – nur, wenn der Benutzer Ziel und Absender lesen darf. */
  auto: { ziel: string; zeit: string; grund: string; rueckgaengig: boolean } | null;
  /** Ausgehend? (#1043): Aussteller ist eine eigene Organisation bzw. Person des Haushalts (Titel nur, wenn lesbar). */
  ausgehend: { titel: string; fundstelle: string } | null;
}

/** „Aus Dokument ausfüllen“ (#391): Vorschläge für die Felder eines Mappentyps. */
export interface TypVorschlaege {
  /** Je Feld Wert, Sicherheit und Fundstelle – geprüft gegen die Feldtypen; Verweise als Mappen-Id. */
  vorschlaege: Vorschlaege;
  /** Titel der vorgeschlagenen Mappen in Verweisfeldern. */
  bezuege: Record<string, MappenBezug>;
  /** Verweisfeld ohne passende Mappe: „neue Organisation mit diesen Angaben anlegen“. */
  neu: Record<string, { typId: string; werte: Record<string, string>; fundstelle: string }>;
  /** Wie viele Werte die Prüfung verworfen hat. */
  verworfen: number;
  /** Länge des gelesenen Texts (0 = nichts gelesen). */
  zeichen: number;
  /** Womit erkannt wurde (#511): eingebaut oder ein Paket. */
  engine: { art: 'eingebaut' } | { art: 'paket'; id: string; name: string };
  /** Hinweis, z. B. wenn das gewählte Paket nicht antwortete und die eingebaute Erkennung übernahm. */
  hinweis?: string;
  /** Das Paket hat nur einen Teil des Dokumenttexts gelesen (#564) – gekürzt vom Kern oder vom Paket. */
  gekuerzt?: true;
  /** Aus einer E-Rechnung gelesen (#1043): Format und Profil; die Werte daraus haben Vorrang. */
  erechnung?: { syntax: 'ubl' | 'cii'; gutschrift: boolean; profil?: string; nummer?: string };
  /**
   * Positionen aus der E-Rechnung (#1043) für eine Tabelle des Typs (#1030): Mappen des Teiltyps, die beim Speichern
   * angelegt werden – geprüft wie jede Eingabe; nur, wenn die Person sie anlegen darf.
   */
  positionen?: {
    feld: string; typId: string; feldKey: string; zeilen: Array<Record<string, Wert>>; weitere?: number;
    /** So viele (lesbare) Positionen hat die Mappe schon – dann bietet die Oberfläche das Anlegen nur ohne Haken an. */
    vorhanden?: number;
    /** Hat die Mappe schon Positionen und fehlt `positionen: true` in der Anfrage: so viele wurden nicht mitgeschickt (zeilen leer). */
    zurueckgehalten?: number;
  };
  /**
   * Gehört dazu (#1043): vorhandene Mappen anderer Typen, die im Dokument stehen und über ein leeres Verweisfeld zu
   * dieser Mappe gehören (z. B. der Lieferschein zur Rechnung). Verknüpft wird erst beim Speichern, wenn die Person es
   * so lässt; nur lesbare Mappen.
   */
  dazu?: Array<{ mappeId: string; typId: string; titel: string; feldKey: string; feld: string; gruende: string[] }>;
}
export const TEXT_MAX = 200_000;

/** Wer Felder per Paket erkennt (#511): der Paket-Läufer mit den Paketen, die dms:erkennen haben und geladen sind. */
export interface ErkennAnbieter {
  pakete(): Array<{ id: string; name: string; netz: boolean }>;
  erkenne(paket: string, eingang: Record<string, unknown>, ms: number): Promise<{ text: string; ms: number }>;
}
/** Wahl in der Werkbank: Standard für alle Mappentypen (null = eingebaut); abfluss: Hinweis bei Netzzugriff bestätigt. */
export interface EngineWahl { paket: string | null; abfluss?: boolean }
/** Zeitlimit für die Antwort eines Pakets (ms); danach übernimmt die eingebaute Erkennung. */
export const ERKENNEN_MS = 60_000;
/** Höchstens so viel Text (Zeichen) geht an ein Paket. */
export const PAKET_TEXT_MAX = 50_000;

/** Eigene Mappen (#995, #1043): eigene Organisationen und Personen des Haushalts – nie Absender bzw. „von“. */
export interface EigeneLage {
  ids: Set<string>;
  /** Je eigene Mappe (und je Benutzer) Namen, USt-Id und IBAN – woran sie als Aussteller zu erkennen ist. */
  angaben: EigeneAngaben[];
}
/** Aussteller eines Belegs: die Absenderzeile, bei einer E-Rechnung der Verkäufer. */
export function ausstellerAus(a: Angaben, er?: ERechnung | null): Aussteller | null {
  if (er?.verkaeufer.name || er?.verkaeufer.ustid) return { name: er.verkaeufer.name, ustid: er.verkaeufer.ustid, iban: er.iban, fundstelle: `${t('meldungen.erkennung.erechnung-verkaeufer')}: ${er.verkaeufer.name ?? er.verkaeufer.ustid}` };
  return a.briefkopf?.zeile && a.briefkopf.name ? { name: a.briefkopf.name, fundstelle: a.briefkopf.fundstelle } : null;
}
/** Höchstens so viele Mappen je Typ beim Suchen eigener Mappen. */
const MAX_EIGENE = 2000;

const MAX_ABSENDER = 5;
const MAX_ZIELE = 8;
const MAX_MAPPEN = 20_000;

export class Erkennung {
  constructor(private d: Dienst, private repo: () => Repo, private einst: () => Einstellungen | undefined = () => undefined) {
    this.klassifizierung = new Klassifizierung(d, this, repo);
  }

  /** „Wohin gehört das?“ mehrstufig (#939): Pakete mit dms:klassifizieren, Kern-Erkennung und Abgleich. */
  readonly klassifizierung: Klassifizierung;

  /** Wird gesetzt, sobald der Paket-Läufer läuft (index.ts). */
  anbieter?: ErkennAnbieter;

  /* ---------- Erkennung per Paket (#511) ---------- */

  /** Installierte Pakete mit dms:erkennen (auch, wenn der Läufer sie gerade nicht geladen hat). */
  private async erkennPakete(): Promise<Array<{ id: string; name: string; netz: boolean; laeuft: boolean }>> {
    const geladen = new Set((this.anbieter?.pakete() ?? []).map((p) => p.id));
    return (await this.repo().listePakete()).filter((p) => hatSchnittstelle(p.laeufer, 'dms:erkennen'))
      .map((p) => ({ id: p.id, name: p.name, netz: hatNetz(p.laeufer), laeuft: geladen.has(p.id) }));
  }

  async standard(): Promise<EngineWahl> {
    const v = (await this.einst()?.lies('erkennung_engine')) as EngineWahl | null;
    return v && typeof v.paket === 'string' ? { paket: v.paket, ...(v.abfluss ? { abfluss: true } : {}) } : { paket: null };
  }

  /** Für die Werkbank: Standard und die Pakete, die es gibt. */
  async engineStand() {
    return { standard: await this.standard(), pakete: await this.erkennPakete() };
  }

  /**
   * Wahl prüfen: Das Paket muss dms:erkennen haben; darf es ins Netz, braucht es die ausdrückliche Bestätigung
   * des Datenabflusses (409 mit details.abfluss, damit die Oberfläche nachfragt).
   */
  private async pruefeWahl(paket: string, abfluss: boolean | undefined) {
    const p = (await this.erkennPakete()).find((x) => x.id === paket);
    if (!p) throw new Fachfehler(422, t('meldungen.erkennung.ist-kein-installiertes-paket', { paket }));
    if (p.netz && abfluss !== true) {
      throw new Fachfehler(409, t('meldungen.erkennung.schickt-den-text-der', { name: p.name }), { abfluss: true, paket: p.name });
    }
  }

  async setzeStandard(e: unknown): Promise<ReturnType<Erkennung['engineStand']>> {
    const s = this.einst();
    if (!s) throw new Fachfehler(404, t('meldungen.erkennung.einstellungen-sind-nicht'));
    const x = (e ?? {}) as { paket?: unknown; abfluss?: unknown };
    const paket = typeof x.paket === 'string' && x.paket && x.paket !== ENGINE_EINGEBAUT ? x.paket : null;
    if (paket) await this.pruefeWahl(paket, x.abfluss === true);
    await s.schreibe('erkennung_engine', paket ? { paket, ...(x.abfluss === true ? { abfluss: true } : {}) } : null);
    log.info('Erkennung für „Aus Dokument ausfüllen“ gewählt', { paket: paket ?? ENGINE_EINGEBAUT, abfluss: x.abfluss === true });
    return this.engineStand();
  }

  /** Wahl am Mappentyp prüfen (beim Speichern des Typs). */
  async pruefeTypWahl(ad: AusDokument | null) {
    if (ad?.engine && ad.engine !== ENGINE_EINGEBAUT) await this.pruefeWahl(ad.engine, ad.abfluss);
  }

  /** Welche Erkennung für diesen Typ gilt: am Typ eingestellt, sonst der Standard aus der Werkbank. */
  private async wahlFuer(typId: string): Promise<{ engine: string; abfluss: boolean }> {
    const ad = await this.d.mappentypen.ausDokumentVon(typId);
    if (ad?.engine) return { engine: ad.engine, abfluss: !!ad.abfluss };
    const s = await this.standard();
    return { engine: s.paket ?? ENGINE_EINGEBAUT, abfluss: !!s.abfluss };
  }

  /**
   * Das Paket fragen: Typname, JSON Schema der erlaubten Felder (ohne Verweise – die gleicht der Kern selbst ab),
   * Text und Dokument-Ids; Antwort ein Objekt { feld: { wert, sicherheit, fundstelle } } (auch unter „vorschlaege“,
   * dann daneben optional `gekuerzt: true`, wenn das Paket den Text für den Dienst gekürzt hat, #564).
   */
  private async perPaket(p: { id: string; name: string }, typ: Mappentyp, text: string, dokumente: string[], erlaubt: (f: Feld) => boolean): Promise<{ vorschlaege: Record<string, unknown>; gekuerzt: boolean; ohneFelder?: true }> {
    const schema = schemaFuer(typ, (f) => erlaubt(f) && f.typ !== 'referenz');
    if (!Object.keys(schema.properties as object).length) return { vorschlaege: {}, gekuerzt: false, ohneFelder: true };
    const r = await this.anbieter!.erkenne(p.id, { typ: typ.name, schema, text: text.slice(0, PAKET_TEXT_MAX), dokumente, hinweis: ERKENNEN_HINWEIS, sprache: 'de' }, ERKENNEN_MS);
    const roh = r.text.trim();
    const a = roh.indexOf('{'), b = roh.lastIndexOf('}');
    let j: unknown;
    try { j = a >= 0 && b > a ? JSON.parse(roh.slice(a, b + 1)) : null; } catch { j = null; }
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('Die Antwort ist kein JSON-Objekt.');
    const o = j as Record<string, unknown>;
    const huelle = !!o.vorschlaege && typeof o.vorschlaege === 'object' && !Array.isArray(o.vorschlaege);
    const v = huelle ? o.vorschlaege as Record<string, unknown> : o;
    // Verweise nie vom Paket: Es kennt keine Mappen; eine Id daraus wäre ungeprüft.
    const vorschlaege = Object.fromEntries(Object.entries(v).filter(([k]) => typ.felder.find((f) => f.key === k)?.typ !== 'referenz'));
    return { vorschlaege, gekuerzt: text.length > PAKET_TEXT_MAX || (huelle && o.gekuerzt === true) };
  }

  /**
   * Eigene Mappen (#995, #1043) mit Systemrechten: Mappen mit dem Merkmal „eigene Organisation“ und Personen des Haushalts.
   * Zum Haushalt gehört, wer ein Konto in dieser Ablage hat; eine Person (Mappe mit Vor- und Nachname bzw. E-Mail) zählt
   * dazu, wenn ihr Name oder ihre E-Mail-Adresse die eines Kontos ist. Liefert nur Ids und Merkmale zum Vergleich – was
   * die Person sieht, entscheidet der Aufrufer über ihre Leserechte.
   */
  async eigeneLage(): Promise<EigeneLage> {
    const typen = await this.repo().listeTypen();
    const ids = new Set<string>();
    const angaben: EigeneAngaben[] = [];
    const btyp = typen.find((x) => x.system === 'benutzer');
    const konten = btyp ? (await this.repo().listeMappen(btyp.id)).slice(0, MAX_EIGENE) : [];
    const kontoNamen = new Set(konten.map((k) => auswahlText(k.werte.name).trim().toLowerCase()).filter((n) => n.includes(' ')));
    const kontoMails = new Set(konten.map((k) => auswahlText(k.werte.email).trim().toLowerCase()).filter(Boolean));
    for (const typ of typen) {
      if (typ.system) continue;
      const org = !!merkmalFeld(typ);
      const person = typ.felder.some((f) => artVon(f) === 'nachname') || typ.felder.some((f) => artVon(f) === 'email' && f.typ === 'text');
      if (!org && !person) continue;
      for (const m of (await this.repo().listeMappen(typ.id)).slice(0, MAX_EIGENE)) {
        const e = eigeneAngaben(typ, m);
        const mails = typ.felder.filter((f) => artVon(f) === 'email').map((f) => auswahlText(m.werte[f.key]).trim().toLowerCase()).filter(Boolean);
        const istPerson = typ.felder.some((f) => artVon(f) === 'nachname') && e.namen.some((n) => kontoNamen.has(n.toLowerCase()));
        if ((org && istEigeneOrganisation(typ, m.werte as Werte)) || istPerson || (!org && mails.some((x) => kontoMails.has(x)))) { ids.add(m.id); angaben.push(e); }
      }
    }
    // Konten selbst zuletzt (eine Person-Mappe geht vor): Name mit Vor- und Nachname als Aussteller, z. B.
    // „Lena Muster · Lindenweg 4 · 01234 Beispielort“ – auch, wenn es keine Mappe zu ihr gibt.
    for (const k of konten) {
      const n = auswahlText(k.werte.name).trim();
      if (btyp && n.includes(' ')) angaben.push({ mappeId: k.id, typId: btyp.id, namen: [n], ustids: [], ibans: [] });
    }
    return { ids, angaben };
  }

  /** Hörer auf „Volltext fertig“: Gehört das Dokument zu Post, die Erkennung dieser Post neu rechnen. */
  async nachVolltext(e: { dokument: string; mappe: string }): Promise<PostErkennung | null> {
    const m = await this.repo().holeMappe(e.mappe);
    if (!m) return null;
    const t = await this.repo().holeTyp(m.typId);
    if (t?.system !== 'post') return null;
    const ergebnis = await this.fuerPost(m.id);
    // Automatisch zuordnen (#337): nur nach neuem Volltext, nie beim bloßen Lesen.
    if (ergebnis) await this.d.automatischZuordnen(m.id, ergebnis);
    // Ereigniskatalog (#670): eigene Schritte lassen sich hinten an die Erkennung hängen.
    if (ergebnis) await this.d.kern.ereignis('erkennung.fertig', { mappe: m.id, typ: m.typId, dokument: e.dokument });
    return ergebnis;
  }

  /** Text, an dem die Erkennung einer Post arbeitet: „von“, Betreff und Nachricht, dann die Volltexte. */
  private async postText(post: Mappe): Promise<{ text: string; dokumente: number }> {
    const teile = [auswahlText(post.werte.von), auswahlText(post.werte.betreff), auswahlText(post.werte.nachricht)].filter(Boolean);
    let dokumente = 0;
    for (const d of await this.repo().listeDokumente(post.id)) {
      const t = d.ocr?.stand === 'fertig' ? await this.repo().volltext(d.id) : null;
      if (t?.trim()) { teile.push(t); dokumente++; }
    }
    return { text: teile.join('\n\n'), dokumente };
  }

  /** Mappentypen mit Merkmalen und ihre Mappen (für den Abgleich). */
  private async vergleich(): Promise<{ typen: Mappentyp[]; mappen: Vergleichsmappe[] }> {
    const typen = (await this.repo().listeTypen()).filter((t) => t.system !== 'post' && t.system !== 'benutzer' && merkmalsfelder(t).length);
    const mappen: Vergleichsmappe[] = [];
    for (const t of typen) {
      for (const m of await this.repo().listeMappen(t.id)) {
        mappen.push({ id: m.id, typId: m.typId, werte: m.werte, geaendert: m.geaendert });
        if (mappen.length >= MAX_MAPPEN) return { typen, mappen };
      }
    }
    return { typen, mappen };
  }

  /** Erkennung einer Post rechnen und speichern. */
  async fuerPost(postId: string): Promise<PostErkennung | null> {
    const repo = this.repo();
    const post = await repo.holeMappe(postId);
    if (!post) return null;
    const start = Date.now();
    const { text, dokumente } = await this.postText(post);
    const angaben = findeAngaben(text);
    const { typen, mappen } = await this.vergleich();
    const typVon = new Map(typen.map((t) => [t.id, t]));
    // Eigene Organisation (#995) und Haushalt (#1043): nie Absender, auch nicht über „gefunden“ (auch wenn sie im
    // Anschriftfeld stehen). Stehen sie in der Absenderzeile, ist die Post wohl ausgehend – nur als Hinweis.
    const eigen = await this.eigeneLage();
    const treffer = findeMappen(text, typen, mappen).filter((x) => !eigen.ids.has(x.mappeId));
    const aus = eigenerAussteller(ausstellerAus(angaben), eigen.angaben);
    const absender = treffer.filter((x) => istAbsenderTyp(typVon.get(x.typId)!)).slice(0, MAX_ABSENDER);
    const eindeutig = eindeutigerTreffer(absender);
    const haupt = eindeutig ?? (absender[0]?.stark ? absender[0] : null);

    // Ziele: direkte Treffer (z. B. Vertrag über die Vertragsnummer), Mappen, die auf den Absender verweisen,
    // frühere Post dieses Absenders und der Absender selbst.
    const ziele = new Map<string, Zielvorschlag>();
    const dazu = (mappeId: string, typId: string, punkte: number, grund: string, direkt = false) => {
      if (mappeId === post.id) return;
      const z = ziele.get(mappeId) ?? { mappeId, typId, punkte: 0, gruende: [] };
      z.punkte += punkte;
      if (direkt) z.direkt = true;
      if (!z.gruende.includes(grund)) z.gruende.push(grund);
      ziele.set(mappeId, z);
    };
    for (const x of treffer) if (!istAbsenderTyp(typVon.get(x.typId)!)) dazu(x.mappeId, x.typId, x.punkte + 1, `gefunden: ${x.gruende.join(', ')}`, true);
    if (haupt) {
      const alleTypen = new Map((await repo.listeTypen()).map((t) => [t.id, t]));
      for (const r of (await repo.rueckverweise(haupt.mappeId)).slice(0, 200)) {
        const qt = alleTypen.get(r.quelleTypId);
        if (!qt || qt.system || istAbsenderTyp(qt)) continue;
        dazu(r.quelleId, r.quelleTypId, 2, t('meldungen.erkennung.verweist-ueber-auf-den', { wert: qt.felder.find((f) => f.key === r.feldKey)?.label ?? r.feldKey }));
      }
      const frueher = (await repo.erkennungenMitAbsender(haupt.mappeId, 50)).filter((id) => id !== post.id);
      const zaehler = new Map<string, number>();
      for (const p of await repo.holeMappen(frueher)) for (const z of Array.isArray(p.werte.bezug) ? p.werte.bezug.map(String) : []) zaehler.set(z, (zaehler.get(z) ?? 0) + 1);
      const ziel = await repo.holeMappen([...zaehler.keys()]);
      for (const m of ziel) {
        const n = zaehler.get(m.id)!;
        if (alleTypen.get(m.typId)?.system) continue;
        dazu(m.id, m.typId, 2 + Math.min(n, 5), t('meldungen.erkennung.fruehere-post-dieses-absenders', { wert: n > 1 ? ` (${n}-mal)` : '' }));
      }
      const at = alleTypen.get(haupt.typId);
      if (at?.register.some((r) => r.art === 'dokumente')) dazu(haupt.mappeId, haupt.typId, 1, t('meldungen.erkennung.der-absender-selbst'));
    }
    const vorher = await repo.erkennungLies(post.id);
    const auto = (vorher?.ergebnis as PostErkennung | undefined)?.auto;
    const ergebnis: PostErkennung = { ...(auto ? { auto } : {}),
      zeit: new Date().toISOString(),
      dokumente,
      absender,
      eindeutig: eindeutig?.mappeId ?? null,
      angaben: { datum: angaben.datum, betrag: angaben.betrag, nummern: angaben.nummern.slice(0, 10), ...(angaben.gutschrift ? { gutschrift: angaben.gutschrift } : {}) },
      // Eigene Post: kein „neuen Absender anlegen“ mit den eigenen Angaben.
      briefkopf: absender.length || aus ? null : angaben.briefkopf,
      ziele: [...ziele.values()].sort((a, b) => b.punkte - a.punkte).slice(0, MAX_ZIELE),
      ...(aus ? { ausgehend: { mappeId: aus.mappeId, fundstelle: angaben.briefkopf?.fundstelle ?? '' } } : {}),
    };
    await repo.erkennungSchreibe(post.id, ergebnis, ergebnis.eindeutig);
    log.info('Erkennung für Post', { post: post.id, dokumente, absender: absender.length, eindeutig: !!eindeutig, ziele: ergebnis.ziele.length, ausgehend: !!aus, ms: Date.now() - start });
    return ergebnis;
  }

  /** Gespeichertes Ergebnis; fehlt es (ältere Post, E-Mail ohne Anhang), wird es jetzt einmal gerechnet. */
  async ergebnis(postId: string): Promise<PostErkennung | null> {
    const da = await this.repo().erkennungLies(postId);
    return da ? da.ergebnis as PostErkennung : this.fuerPost(postId);
  }

  /** Für die Oberfläche bzw. die API: nur, was der Benutzer lesen darf. */
  async fuerBenutzer(postId: string, z?: Zugriff): Promise<ErkennungAntwort> {
    const post = await this.d.rechtepruefung.pruefeRecht(z, postId, 'R');
    const typ = await this.repo().holeTyp(post.typId);
    if (typ?.system !== 'post') throw new Fachfehler(422, t('meldungen.erkennung.vorschlaege-beim-zuordnen-gibt'));
    const e = await this.ergebnis(postId);
    if (!e) throw new Fachfehler(404, t('meldungen.erkennung.diese-post-gibt-es'));
    const ids = [...e.absender.map((x) => x.mappeId), ...e.ziele.map((x) => x.mappeId), ...(e.auto ? [e.auto.ziel] : []), ...(e.ausgehend ? [e.ausgehend.mappeId] : [])];
    const lesbar = await this.d.rechtepruefung.lesbare(z, ids);
    const bezuege = await this.repo().bezuege(ids.filter((id) => lesbar.has(id)));
    const titel = (id: string) => bezuege.get(id)?.titel ?? '';
    const absender = e.absender.filter((x) => lesbar.has(x.mappeId) && bezuege.has(x.mappeId)).map((x) => ({ ...x, titel: titel(x.mappeId) }));
    const ziele = e.ziele.filter((x) => lesbar.has(x.mappeId) && bezuege.has(x.mappeId)).map((x) => ({ ...x, titel: titel(x.mappeId) }));
    return {
      zeit: e.zeit, dokumente: e.dokumente, absender,
      eindeutig: e.eindeutig && lesbar.has(e.eindeutig) ? e.eindeutig : null,
      angaben: e.angaben,
      neuerAbsender: e.briefkopf && !absender.length ? await this.neuerAbsender(e.briefkopf, z) : null,
      ziele,
      bezuege: Object.fromEntries(bezuege),
      auto: e.auto && lesbar.has(e.auto.ziel) && (!e.eindeutig || lesbar.has(e.eindeutig)) ? { ziel: e.auto.ziel, zeit: e.auto.zeit, grund: e.auto.grund, rueckgaengig: !!e.auto.rueckgaengig } : null,
      ausgehend: e.ausgehend ? { titel: lesbar.has(e.ausgehend.mappeId) ? titel(e.ausgehend.mappeId) : '', fundstelle: e.ausgehend.fundstelle } : null,
    };
  }

  /** Felder, die „Aus Dokument ausfüllen“ für diesen Benutzer füllen darf (#391): keine Passwörter, keine festen Felder. */
  private erlaubteFelder(typ: Mappentyp, mappe?: Mappe): (f: Feld) => boolean {
    const fest = geschuetzteFelder(typ, mappe);
    // Berechnete Felder (#1034, „nie überschreiben“): kein Vorschlag, egal woher.
    return (f) => f.typ !== 'passwort' && !fest[f.key] && !f.berechnetVon;
  }

  /** Typ und Zugriff prüfen: bestehende Mappe braucht Bearbeiten, eine neue das Anlegen. */
  private async typFuer(typId: string, mappeId: string | undefined, z?: Zugriff): Promise<{ typ: Mappentyp; mappe?: Mappe }> {
    const typ = z ? z.typen.get(typId) : await this.repo().holeTyp(typId);
    if (!typ) throw new Fachfehler(404, t('meldungen.erkennung.diesen-mappentyp-gibt-es'));
    if (typ.system) throw new Fachfehler(422, t('meldungen.erkennung.ist-ein-systemmappentyp-dort', { name: typ.name }));
    if (mappeId) {
      const mappe = await this.d.rechtepruefung.pruefeRecht(z, mappeId, 'U');
      if (mappe.typId !== typ.id) throw new Fachfehler(422, t('meldungen.erkennung.die-mappe-hat-einen'));
      return { typ, mappe };
    }
    if (z && !(await this.d.rechtepruefung.rechteAn(z, { id: '', typId: typ.id, werte: {}, titel: '', erstellt: '', geaendert: '' } as Mappe, true)).C) throw new Fachfehler(403, t('meldungen.erkennung.mappen-dieses-typs-darfst'));
    return { typ };
  }

  /** JSON Schema der Felder, die die Erkennung füllen darf (#391; für Clients und künftige Engines aus Paketen). */
  async schema(typId: string, z?: Zugriff): Promise<Record<string, unknown>> {
    const typ = z ? z.typen.get(typId) : await this.repo().holeTyp(typId);
    if (!typ) throw new Fachfehler(404, t('meldungen.erkennung.diesen-mappentyp-gibt-es'));
    return schemaFuer(typ, this.erlaubteFelder(typ));
  }

  /**
   * „Aus Dokument ausfüllen“ (#391, Stufe 1): eingebaute Erkennung gegen die Felder des Typs. Text aus `text`
   * (z. B. von Fotos, die gerade gelesen wurden) und den Volltexten der Dokumente `dokumente` (muss man lesen
   * dürfen). Verweisfelder: vorhandene Mappe des Zieltyps, die sich im Text wiederfindet – sonst ein Vorschlag
   * „neu anlegen“. Jede Antwort geht durch die Prüfung gegen die Feldtypen; nichts wird gespeichert.
   */
  async fuerTyp(typId: string, eingabe: unknown, z?: Zugriff, zusatz?: { erechnung?: ERechnung | null }): Promise<TypVorschlaege> {
    const e = (eingabe ?? {}) as { text?: unknown; dokumente?: unknown; mappe?: unknown; positionen?: unknown };
    const { typ, mappe } = await this.typFuer(typId, typeof e.mappe === 'string' && e.mappe ? e.mappe : undefined, z);
    const teile: string[] = [];
    if (typeof e.text === 'string' && e.text.trim()) teile.push(e.text.slice(0, TEXT_MAX));
    // Mappentypen, aus denen der Text stammt (#796): Gesperrte gehen an kein KI-Paket.
    const quellTypen = new Set<string>([typ.id]);
    // E-Rechnung (#1043): aus der Datei (Route) oder aus einem der Dokumente – XML direkt, PDF über den Anhang.
    let er = zusatz?.erechnung ?? null;
    for (const id of (Array.isArray(e.dokumente) ? e.dokumente : []).filter((x): x is string => typeof x === 'string').slice(0, 10)) {
      const d = await this.repo().holeDokument(id);
      if (!d) throw new Fachfehler(404, t('meldungen.erkennung.dieses-dokument-gibt-es'));
      quellTypen.add((await this.d.rechtepruefung.pruefeRecht(z, d.mappeId, 'R')).typId);
      if (!er && (istXmlDatei(d.name, d.mime) || d.mime === 'application/pdf')) er = await this.erechnungAus(() => this.d.kern.liesGanz(d.sha256), d.name, d.mime, d.groesse);
      const eintrag = await this.repo().volltext(id);
      // Eine E-Rechnung als XML hat keinen Volltext – dann ist ihr Text der lesbare Auszug.
      if (!eintrag?.trim() && er && istXmlDatei(d.name, d.mime)) { teile.push(erechnungText(er)); continue; }
      if (!eintrag?.trim()) throw new Fachfehler(409, t('meldungen.erkennung.hat-noch-keinen-volltext', { name: d.name }));
      teile.push(eintrag);
    }
    if (er && !teile.length) teile.push(erechnungText(er));
    const text = teile.join('\n\n').slice(0, TEXT_MAX);
    const erlaubt = this.erlaubteFelder(typ, mappe);
    const angaben = findeAngaben(text);
    // Erkennung per Paket (#511), wenn gewählt; sonst bzw. wenn das Paket nicht antwortet: eingebaut.
    const dokIds = (Array.isArray(e.dokumente) ? e.dokumente : []).filter((x): x is string => typeof x === 'string').slice(0, 10);
    let engine: TypVorschlaege['engine'] = { art: 'eingebaut' };
    let hinweis: string | undefined;
    let ausPaket: Record<string, unknown> | null = null;
    let gekuerzt = false;
    const wahl = text.trim() ? await this.wahlFuer(typ.id) : { engine: ENGINE_EINGEBAUT, abfluss: false };
    if (wahl.engine !== ENGINE_EINGEBAUT) {
      const p = this.anbieter?.pakete().find((x) => x.id === wahl.engine);
      const gesperrt = p ? await this.d.ki.kiSperreFuer(p.id) : () => false;
      const kiTyp = [...quellTypen].find((x) => gesperrt(x));
      if (!p) hinweis = t('meldungen.erkennung.das-paket-fuer-die', { engine: wahl.engine });
      else if (p.netz && !wahl.abfluss) hinweis = t('meldungen.erkennung.fuer-ist-der-datenabfluss', { name: p.name });
      else if (kiTyp) {
        // KI-Dienste (#796): Ziel- oder Quell-Mappentyp nicht zugelassen – nichts an das Paket, die eingebaute Erkennung übernimmt.
        hinweis = t('meldungen.erkennung.ki-nicht-zugelassen', { name: p.name, typ: (await this.repo().holeTyp(kiTyp))?.name ?? '' });
        log.info('Erkennung nicht an Paket gegeben (Mappentyp nicht für KI-Dienste zugelassen)', { typ: typ.name, paket: p.id });
      } else {
        try {
          const r = await this.perPaket(p, typ, text, dokIds, erlaubt);
          // Geantwortet, aber nichts, was die Prüfung übersteht (#564): wie bei einem Fehler die eingebaute Erkennung.
          if (r.ohneFelder || Object.keys(pruefeVorschlaege(typ, r.vorschlaege, erlaubt).vorschlaege).length) { ausPaket = ohneFremdeFundstellen(r.vorschlaege, text, typ.name, p.id); gekuerzt = r.gekuerzt; engine = { art: 'paket', id: p.id, name: p.name }; }
          else {
            hinweis = t('meldungen.erkennung.hat-nichts-brauchbares-geliefert', { name: p.name });
            log.info('Erkennung per Paket ohne brauchbare Vorschläge', { typ: typ.name, paket: p.id, felder: Object.keys(r.vorschlaege).length });
          }
        } catch (x) {
          hinweis = t('meldungen.erkennung.hat-nicht-geantwortet-die', { name: p.name, message: (x as Error).message });
          log.warn('Erkennung per Paket fehlgeschlagen', { typ: typ.name, paket: p.id, fehler: (x as Error).message.slice(0, 300) });
        }
      }
    }
    const roh: Record<string, unknown> = ausPaket ?? vorschlaegeAus(typ, text, angaben);
    // Hinweise am Vorschlag kommen nur aus dem Kern (eingebaute Erkennung, E-Rechnung, Verweise) – nie aus einem Paket.
    const hinweise = new Map<string, string>();
    if (!ausPaket) for (const [k, v] of Object.entries(roh)) if ((v as Vorschlag).hinweis) hinweise.set(k, (v as Vorschlag).hinweis!);
    // E-Rechnung (#1043): Ihre Werte stehen exakt in den Daten und gehen vor – geprüft wird danach wie bei allen.
    const ausER = er ? vorschlaegeAusERechnung(typ, er) : {};
    for (const [k, v] of Object.entries(ausER)) { roh[k] = v; if (v.hinweis) hinweise.set(k, v.hinweis); else hinweise.delete(k); }
    const bezuege: Record<string, MappenBezug> = {};
    const neu: TypVorschlaege['neu'] = {};
    // Eigene Organisation und Haushalt (#995, #1043): nie „von“; stehen sie als Aussteller drin, ist der Beleg wohl ausgehend.
    const eigen = await this.eigeneLage();
    const aussteller = eigenerAussteller(ausstellerAus(angaben, er), eigen.angaben);
    const felder = fuellfelder(typ).map((x) => x.feld);
    // Ausgehend: „an“ bekommt die Gegenseite, auch wenn das Feld nicht für die Erkennung markiert ist.
    const an = aussteller ? typ.felder.find((f) => f.key === 'an' && f.typ === 'referenz' && !felder.includes(f)) : undefined;
    for (const f of an ? [...felder, an] : felder) {
      if (f.typ !== 'referenz' || !zieleVon(f).length || !erlaubt(f)) continue;
      const v = await this.verweisFuer(f, text, angaben, z, { eigen, aussteller });
      if (v?.mappe) {
        roh[f.key] = { wert: f.mehrfach ? [v.mappe.id] : v.mappe.id, sicherheit: v.sicherheit, fundstelle: v.fundstelle };
        if (v.hinweis) hinweise.set(f.key, v.hinweis); else hinweise.delete(f.key);
        bezuege[v.mappe.id] = { titel: v.mappe.titel ?? '', typId: v.mappe.typId };
      } else if (v?.neu) neu[f.key] = v.neu;
    }
    if (aussteller && !roh.von) hinweis = [hinweis, t('meldungen.erkennung.ausgehend-allgemein')].filter(Boolean).join(' ');
    // Jede Antwort – eingebaut oder vom Paket – geht durch die Prüfung gegen die Feldtypen; verworfen wird mit Grund protokolliert (ohne Werte).
    const { vorschlaege, verworfen } = pruefeVorschlaege(typ, roh, erlaubt);
    for (const [k, v] of Object.entries(vorschlaege)) { const h = hinweise.get(k); if (h) v.hinweis = h; }
    // Gutschrift (#1043): positive Beträge negativ, wo das Feld es erlaubt – auch bei Antworten aus Paketen.
    wendeGutschriftAn(typ, vorschlaege, angaben.gutschrift, new Set(Object.keys(ausER)));
    // Lieferschein und Rechnung (#1043): Eine Mappe des Zieltyps, in deren Dokumenten die Nummer dieses Belegs steht.
    await this.nenntNummer(typ, vorschlaege, bezuege, erlaubt, z);
    // Folgt aus (#886): Felder, die aus einem vorgeschlagenen Verweis folgen, bekommen ihren Vorschlag dazu.
    await this.d.mappenEingaben.folgeVorschlaege(typ, { vorschlaege, bezuege, neu }, z);
    // Beim Auswählen übernehmen (#1037): Werte aus vorgeschlagenen Mappen, mit den Rechten der Person – erst hier, nach
    // einer Erkennung per Paket, damit sie nie an ein KI-Paket gehen (#796).
    await this.d.mappenEingaben.vorbelegenVorschlaege(typ, { vorschlaege, bezuege, neu }, erlaubt, mappe, z);
    if (verworfen.length) log.warn('Vorschläge der Erkennung verworfen', { typ: typ.name, engine: engine.art === 'paket' ? engine.id : ENGINE_EINGEBAUT, felder: verworfen.map((x) => `${x.feld}: ${x.grund}`).join('; ') });
    // Fundstellen (#939): Seite und Rahmen aus der Textebene bzw. Texterkennung; nicht gefunden = Wert ohne Rahmen.
    if (dokIds.length && Object.keys(vorschlaege).length) await this.stellen(typ, vorschlaege, dokIds);
    const positionen = er ? await this.positionen(typ, er, z, mappe, e.positionen === true || e.positionen === '1') : undefined;
    const dazu = text.trim() ? await this.dazu(text, typ, mappe, z) : [];
    log.info('Aus Dokument ausfüllen', { typ: typ.name, engine: engine.art === 'paket' ? engine.id : ENGINE_EINGEBAUT, zeichen: text.length, vorschlaege: Object.keys(vorschlaege).length, neu: Object.keys(neu).length, erechnung: er?.syntax ?? null, positionen: positionen?.zeilen.length ?? 0, dazu: dazu.length, ausgehend: !!aussteller });
    return {
      vorschlaege, bezuege, neu, verworfen: verworfen.length, zeichen: text.length, engine, ...(hinweis ? { hinweis } : {}), ...(gekuerzt ? { gekuerzt: true as const } : {}),
      ...(er ? { erechnung: { syntax: er.syntax, gutschrift: er.gutschrift, ...(er.profil ? { profil: er.profil } : {}), ...(er.nummer ? { nummer: er.nummer } : {}) } } : {}),
      ...(positionen?.zeilen.length || positionen?.zurueckgehalten ? { positionen } : {}),
      ...(dazu.length ? { dazu } : {}),
    };
  }

  /**
   * E-Rechnung aus einer Datei bzw. einem Dokument (#1043): XML direkt, PDF über den Anhang (PDF-Stelle, im Arbeiter).
   * `lies` holt den Inhalt erst, wenn die Art passt; zu große XML-Dateien werden nicht gelesen. Fehler beim Lesen sind
   * kein Fehler der Anfrage – dann gibt es eben keine E-Rechnung (protokolliert ohne Inhalt).
   */
  async erechnungAus(lies: () => Promise<Buffer>, name: string, mime: string, groesse?: number): Promise<ERechnung | null> {
    try {
      if (istXmlDatei(name, mime)) {
        if (groesse != null && groesse > ERECHNUNG_XML_MAX) return null;
        const inhalt = await lies();
        if (inhalt.length > ERECHNUNG_XML_MAX) return null;
        const r = liesERechnung(inhalt.toString('utf8'));
        if (r.fehler) log.info('E-Rechnung nicht gelesen', { grund: r.fehler });
        return r.er;
      }
      if (mime !== 'application/pdf') return null;
      const xml = await eingebetteteERechnung(await lies());
      if (!xml) return null;
      const r = liesERechnung(xml);
      if (r.fehler) log.info('E-Rechnung im PDF nicht gelesen', { grund: r.fehler });
      return r.er;
    } catch (x) {
      log.info('E-Rechnung nicht gelesen', { grund: (x as Error).message.slice(0, 200) });
      return null;
    }
  }

  /**
   * Datei für „Aus Dokument ausfüllen“ (#391, #1043): E-Rechnung lesen und den Text holen. Eine XML-E-Rechnung braucht
   * keine Texterkennung (ihr Text ist der lesbare Auszug); ein PDF mit E-Rechnung geht ohne Texterkennung auch.
   */
  async dateiLesen(inhalt: Buffer, name: string, mime: string): Promise<{ text: string; info: string; erechnung: ERechnung | null }> {
    const pdf = mime === 'application/pdf' || inhalt.subarray(0, 5).toString('latin1') === '%PDF-';
    const er = await this.erechnungAus(async () => inhalt, name, pdf ? 'application/pdf' : mime, inhalt.length);
    if (er && istXmlDatei(name, mime)) return { text: erechnungText(er), info: t('meldungen.erkennung.erechnung-gelesen'), erechnung: er };
    if (istXmlDatei(name, mime)) throw new Fachfehler(415, t('meldungen.erkennung.xml-keine-erechnung'));
    try {
      return { ...(await this.d.textAusDatei(inhalt, name, mime)), erechnung: er };
    } catch (x) {
      if (er && x instanceof Fachfehler && x.status === 503) return { text: erechnungText(er), info: t('meldungen.erkennung.erechnung-gelesen'), erechnung: er };
      throw x;
    }
  }

  /**
   * Positionen der E-Rechnung (#1043) für die erste Tabelle des Typs (#1030), deren Zeilen Teile sind (#1031) – nur,
   * wenn die Person Mappen dieses Typs anlegen darf. Jede Zeile geht durch dieselbe Prüfung wie Eingaben.
   */
  private async positionen(typ: Mappentyp, er: ERechnung, z: Zugriff | undefined, mappe: Mappe | undefined, ausdruecklich: boolean): Promise<TypVorschlaege['positionen']> {
    if (!er.positionen.length) return undefined;
    for (const f of typ.felder.filter((x) => x.typ === 'tabelle' && x.quelle?.typId && x.quelle.feldKey)) {
      const pt = z ? z.typen.get(f.quelle!.typId) : await this.repo().holeTyp(f.quelle!.typId);
      if (!pt || pt.system) continue;
      if (z && !(await this.d.rechtepruefung.rechteAn(z, { id: '', typId: pt.id, werte: {}, titel: '', erstellt: '', geaendert: '' } as Mappe, true)).C) continue;
      const erlaubt = (x: Feld) => x.key !== f.quelle!.feldKey && this.erlaubteFelder(pt)(x);
      const zeilen = er.positionen.map((p) => {
        const roh = Object.fromEntries(Object.entries(positionAusERechnung(pt, p, er, f.quelle!.feldKey)).map(([k, w]) => [k, { wert: w }]));
        return Object.fromEntries(Object.entries(pruefeVorschlaege(pt, roh, erlaubt).vorschlaege).map(([k, v]) => [k, v.wert]));
      }).filter((w) => Object.keys(w).length > 0);
      if (!zeilen.length) continue;
      // Hat die Mappe schon Positionen, gibt es neue nur auf ausdrücklichen Wunsch (`positionen: true`) – sonst doppelt.
      const vorhanden = mappe ? await this.vorhandenePositionen(mappe.id, pt.id, f.quelle!.feldKey, z) : 0;
      const basis = { feld: f.key, typId: pt.id, feldKey: f.quelle!.feldKey, ...(er.weiterePositionen ? { weitere: er.weiterePositionen } : {}), ...(vorhanden ? { vorhanden } : {}) };
      return vorhanden && !ausdruecklich ? { ...basis, zeilen: [], zurueckgehalten: zeilen.length } : { ...basis, zeilen };
    }
    return undefined;
  }

  /** Lesbare Mappen des Teiltyps, die über `feldKey` schon zu dieser Mappe gehören. */
  private async vorhandenePositionen(mappeId: string, typId: string, feldKey: string, z?: Zugriff): Promise<number> {
    const ids = (await this.repo().rueckverweise(mappeId)).filter((r) => r.quelleTypId === typId && r.feldKey === feldKey).map((r) => r.quelleId);
    return ids.length ? (await this.d.rechtepruefung.lesbare(z, [...new Set(ids)])).size : 0;
  }

  /**
   * Gehört dazu (#1043): vorhandene, lesbare Mappen anderer Typen, die im Dokument stehen und über ein leeres Verweisfeld
   * zu einer Mappe dieses Typs gehören könnten – der Lieferschein, dessen Nummer auf der Rechnung steht. Ohne die Mappe
   * selbst und ohne Mappen, die schon auf sie zeigen.
   */
  private async dazu(text: string, typ: Mappentyp, mappe: Mappe | undefined, z?: Zugriff): Promise<NonNullable<TypVorschlaege['dazu']>> {
    const a = await this.abgleich(text, typ.id, z).catch(() => null);
    return (a?.dazu ?? []).filter((x) => x.mappeId !== mappe?.id).map((x) => ({
      mappeId: x.mappeId, typId: x.typId, titel: a!.bezuege[x.mappeId]?.titel ?? '', feldKey: x.feldKey, feld: x.feld,
      gruende: x.belege.filter((b) => b.stark && !b.ueber).map((b) => `${b.feld} ${b.wert}`).slice(0, 3),
    }));
  }

  /**
   * Umgekehrt (#1043): Ein Verweisfeld ohne Vorschlag bekommt die Mappe seines Zieltyps, in deren Dokumenten die Nummer
   * dieses Belegs steht – etwa die Rechnung, die die Lieferscheinnummer nennt, für „Gehört zu Rechnung“ am Lieferschein.
   * Die Nummer ist der Vorschlag für ein Feld mit „Zum Wiederfinden nutzen“ (mindestens 4 Zeichen, mit Ziffer). Nur bei
   * genau einer lesbaren Mappe; die Nummer muss wörtlich im Volltext stehen (nicht nur nach der Volltextsuche).
   */
  /** Steht `wert` wörtlich im Volltext eines der Dokumente der Mappe (höchstens 20)? */
  private async nennt(mappeId: string, wert: string): Promise<boolean> {
    const texte = await this.repo().volltexte((await this.repo().listeDokumente(mappeId)).map((d) => d.id).slice(0, 20));
    return [...texte.values()].some((x) => stehtImText(x, wert));
  }

  /** Die eine lesbare Mappe dieser Typen, deren Dokumente `wert` nennen (Volltextsuche, dann wörtlich geprüft); sonst null. */
  private async einzigeMitNummer(typen: string[], wert: string, z?: Zugriff): Promise<Mappe | null> {
    const gefunden: Mappe[] = [];
    for (const typId of typen) {
      const s = await this.repo().seite({ typId, textfilter: { text: wert, dokumente: true, notizen: false }, von: 0, anzahl: 5 }).catch(() => null);
      for (const m of s?.mappen ?? []) if (await this.nennt(m.id, wert)) gefunden.push(m);
    }
    const lesbar = await this.d.rechtepruefung.lesbare(z, gefunden.map((m) => m.id));
    const da = gefunden.filter((m) => lesbar.has(m.id));
    return da.length === 1 ? da[0] : null;
  }

  private async nenntNummer(typ: Mappentyp, vorschlaege: Vorschlaege, bezuege: Record<string, MappenBezug>, erlaubt: (f: Feld) => boolean, z?: Zugriff) {
    const nummern = typ.felder.filter((f) => f.wiederfinden && (f.typ === 'text' || f.typ === 'zahl') && vorschlaege[f.key])
      .map((f) => ({ f, w: String(vorschlaege[f.key].wert).trim() })).filter((x) => x.w.length >= 4 && /\d/.test(x.w));
    if (!nummern.length) return;
    // Nur „gehört zu“-Verweise (Lieferschein → Rechnung, Rechnung → Vertrag), nie „von“ oder „an“.
    for (const f of typ.felder.filter((x) => x.typ === 'referenz' && x.verweisart === 'zugehoerigkeit' && !vorschlaege[x.key] && erlaubt(x) && !jedeMappe(x) && zieleVon(x).length)) {
      for (const { f: nf, w } of nummern) {
        const m = await this.einzigeMitNummer(zieleVon(f).filter((x) => x !== typ.id && (!z || z.typen.has(x))), w, z);
        if (!m) continue;
        vorschlaege[f.key] = { wert: f.mehrfach ? [m.id] : m.id, sicherheit: 'mittel', fundstelle: t('meldungen.erkennung.nennt-nummer', { titel: m.titel ?? '', feld: nf.label || nf.key, wert: w }) };
        bezuege[m.id] = { titel: m.titel ?? '', typId: m.typId };
        break;
      }
    }
  }

  /**
   * Fundstellen in der Textebene suchen (#939): je Vorschlag die erste Stelle, an der der Wert (in einer seiner
   * Schreibweisen) innerhalb der Fundstelle steht – sonst der Wert allein, sonst die kurze Fundstelle selbst
   * (`stelleVon`, wie die Seite „Dokument übernehmen“). Dokumente ohne Wörter mit Lage geben keine Stelle; Verweise
   * bekommen ihre Stellen über die Belege des Abgleichs. Setzt `stelle` an den Vorschlägen.
   */
  private async stellen(typ: Mappentyp, vorschlaege: Vorschlaege, dokIds: string[]) {
    const seiten: Array<{ id: string; seiten: SchwaerzSeite[] }> = [];
    for (const id of dokIds) {
      try {
        const w = await this.d.wortpositionen(id);
        const s = w.seiten.map((x) => ({ breite: x.breite ?? 1, hoehe: x.hoehe ?? 1, woerter: x.woerter }));
        if (s.some((x) => x.woerter.length)) seiten.push({ id, seiten: s });
      } catch { /* ohne Wortpositionen: Werte ohne Rahmen */ }
    }
    if (!seiten.length) return;
    for (const [k, v] of Object.entries(vorschlaege)) {
      const f = typ.felder.find((x) => x.key === k);
      if (!f || f.typ === 'referenz') continue;
      const formen = textformen(f, v.wert);
      for (const d of seiten) {
        const b = stelleVon(d.seiten, formen, v.fundstelle);
        if (b?.length) { v.stelle = { dokument: d.id, bereiche: b }; break; }
      }
    }
  }

  /**
   * Verweisfeld: Mappe eines Zieltyps, die im Text steht (markierte Felder, sonst der Titel); sonst „neu anlegen“ – das
   * nur bei genau einem Zieltyp (#1036: bei mehreren stünde nicht fest, welcher gemeint ist).
   *
   * „von“ und „an“ (#1043, Kennungen nach den Paket-Regeln): Eigene Organisationen und Personen des Haushalts sind nie
   * „von“. Steht eine von ihnen als Aussteller drin (`aussteller`), ist der Beleg wohl ausgehend: „von“ schlägt sie vor –
   * mit niedriger Sicherheit und Hinweis, nie still (Ergänzung Sicherheit) – und „an“ die Gegenseite.
   */
  private async verweisFuer(f: Feld, text: string, a: Angaben, z: Zugriff | undefined, ctx: { eigen: EigeneLage; aussteller: EigeneAngaben | null }): Promise<{ mappe?: Mappe; sicherheit: 'hoch' | 'mittel' | 'niedrig'; fundstelle: string; hinweis?: string; neu?: TypVorschlaege['neu'][string] } | null> {
    const ziele: Mappentyp[] = [];
    for (const id of zieleVon(f)) { const x = await this.repo().holeTyp(id); if (x && (!z || z.typen.has(x.id))) ziele.push(x); }
    if (!ziele.length) return null;
    const von = f.key === 'von';
    const an = f.key === 'an';
    const aus = ctx.aussteller;
    // „an“ eines eingehenden Belegs bleibt leer („leer heißt wir“) – sonst stünde hier der Absender.
    if (an && !aus) return null;
    if (von && aus) {
      // Ausgehend: die eigene Mappe – wenn das Feld auf ihren Typ zeigen darf und die Person sie lesen darf.
      const m = ziele.some((x) => x.id === aus.typId) && (await this.d.rechtepruefung.lesbare(z, [aus.mappeId])).has(aus.mappeId) ? await this.repo().holeMappe(aus.mappeId) : null;
      return m ? { mappe: m, sicherheit: 'niedrig', fundstelle: t('meldungen.erkennung.aussteller-eigen', { titel: m.titel ?? '' }), hinweis: t('meldungen.erkennung.ausgehend-hinweis') } : null;
    }
    const vergleiche: Array<Pick<Mappentyp, 'id' | 'felder'>> = [];
    const mappen: Mappe[] = [];
    for (const ziel of ziele) {
      const alle = await this.repo().listeMappen(ziel.id);
      const lesbar = await this.d.rechtepruefung.lesbare(z, alle.map((m) => m.id));
      // „von“ bzw. „an“ eines ausgehenden Belegs: nie eine eigene Mappe.
      mappen.push(...alle.filter((m) => lesbar.has(m.id) && !((von || (an && aus)) && ctx.eigen.ids.has(m.id))));
      // Ohne Felder zum Wiederfinden (#938) zählt der Titel als Name.
      vergleiche.push(merkmalsfelder(ziel).length > 0 ? ziel : { id: ziel.id, felder: [{ key: '_titel', label: t('meldungen.erkennung.name'), typ: 'text' as const, erkennung: { art: 'name' as const }, wiederfinden: true }] });
    }
    const markiertIn = new Set(ziele.filter((x) => merkmalsfelder(x).length > 0).map((x) => x.id));
    const treffer = findeMappen(text, vergleiche, mappen.map((m) => ({ id: m.id, typId: m.typId, werte: markiertIn.has(m.typId) ? m.werte : { _titel: m.titel ?? '' } })));
    const best = eindeutigerTreffer(treffer) ?? (treffer.length === 1 ? treffer[0] : null);
    if (best) return { mappe: mappen.find((m) => m.id === best.mappeId), sicherheit: best.stark ? 'hoch' : 'mittel', fundstelle: `gefunden: ${best.gruende.join(', ')}`, ...(an ? { hinweis: t('meldungen.erkennung.ausgehend-an') } : {}) };
    if (ziele.length !== 1 || an) return null;
    const [ziel] = ziele;
    const markiert = markiertIn.has(ziel.id);
    if (!istAbsenderTyp(ziel) && markiert) return null;
    const firma = a.briefkopf?.name ?? a.person?.organisation;
    if (!firma) return null;
    // Der Briefkopf ist der eigene (ausgehend): nicht als neue Organisation vorschlagen.
    if (von && eigenerAussteller({ name: firma, fundstelle: '' }, ctx.eigen.angaben)) return null;
    if (z && !(await this.d.rechtepruefung.rechteAn(z, { id: '', typId: ziel.id, werte: {}, titel: '', erstellt: '', geaendert: '' } as Mappe, true)).C) return null;
    const werte = Object.fromEntries(Object.entries(vorschlaegeAus(ziel, text, { ...a, person: null, briefkopf: { ...(a.briefkopf ?? { fundstelle: a.person?.fundstelle ?? '' }), name: firma } }))
      .filter(([k, v]) => typeof v.wert === 'string' && ziel.felder.some((x) => x.key === k && x.typ !== 'referenz')).map(([k, v]) => [k, v.wert as string]));
    if (!Object.keys(werte).length) { const n = ziel.felder.find((x) => x.typ === 'text'); if (n) werte[n.key] = firma; }
    return { sicherheit: 'mittel', fundstelle: a.briefkopf?.fundstelle ?? a.person?.fundstelle ?? '', neu: { typId: ziel.id, werte, fundstelle: a.briefkopf?.fundstelle ?? a.person?.fundstelle ?? firma } };
  }

  /**
   * Abgleich im Kern, ohne KI (#938): vorhandene Mappen, die sich im Text über ihre Felder mit „Zum Wiederfinden
   * nutzen“ wiederfinden – mit Belegen (Feld, Wert, Fundstelle). Mit `zielTyp` dazu Vorschläge für dessen Verweisfelder
   * und die Warnung, wenn es die Mappe schon gibt. Nur Mappen, die die Person lesen darf; nichts wird gespeichert.
   * Grundlage für „Dokument übernehmen“ (#934); die KI-Klassifizierung (#939) sieht die Ablage nie.
   */
  async abgleich(text: string, zielTyp?: string, z?: Zugriff): Promise<Abgleich & { bezuege: Record<string, MappenBezug> }> {
    const ziel = zielTyp ? (z ? z.typen.get(zielTyp) : await this.repo().holeTyp(zielTyp)) : undefined;
    if (zielTyp && !ziel) throw new Fachfehler(404, t('meldungen.erkennung.diesen-mappentyp-gibt-es'));
    const sichtbar = (await this.repo().listeTypen()).filter((x) => x.system !== 'post' && (!z || z.typen.has(x.id)));
    const typen = sichtbar.filter((x) => x.felder.some((f) => f.wiederfinden));
    const alle: Vergleichsmappe[] = [];
    for (const x of typen) {
      for (const m of await this.repo().listeMappen(x.id)) { alle.push({ id: m.id, typId: m.typId, werte: m.werte }); if (alle.length >= MAX_MAPPEN) break; }
      if (alle.length >= MAX_MAPPEN) break;
    }
    const lesbar = await this.d.rechtepruefung.lesbare(z, alle.map((m) => m.id));
    const mappen = alle.filter((m) => lesbar.has(m.id));
    const erg = gleicheAb(text.slice(0, TEXT_MAX), typen, mappen, ziel);
    // Eigene Organisation und Haushalt (#1043): nie als „von“ vorgeschlagen, nie „gehört dazu“; als Beleg für einen
    // Mappentyp zählen sie auch nicht (sie stehen auf fast jedem Dokument) – `eigene` nennt sie für die Klassifizierung.
    const eigen = await this.eigeneLage();
    if (erg.verweise.von) { erg.verweise.von = erg.verweise.von.filter((x) => !eigen.ids.has(x.mappeId)); if (!erg.verweise.von.length) delete erg.verweise.von; }
    if (erg.dazu) erg.dazu = erg.dazu.filter((x) => !eigen.ids.has(x.mappeId));
    const eigene = erg.treffer.filter((x) => eigen.ids.has(x.mappeId)).map((x) => x.mappeId);
    if (eigene.length) erg.eigene = eigene;
    const bezuege = Object.fromEntries(await this.repo().bezuege(erg.treffer.map((x) => x.mappeId)));
    log.info('Abgleich mit vorhandenen Mappen', { zeichen: text.length, mappen: mappen.length, treffer: erg.treffer.length, doppelt: erg.doppelt.length, ...(ziel ? { typ: ziel.name } : {}) });
    return { ...erg, bezuege };
  }

  /**
   * „Dokument übernehmen“ (#934): Abgleich für Dokumente (höchstens 10, Lesen nötig) – Belege, Vorschläge für die
   * Verweisfelder von `typ` und die Warnung vor Doppelten (siehe `abgleich`). Ohne `typ` dazu `typ`: der Mappentyp für
   * „Wohin gehört das?“, dessen Name im Text steht – nur aus `ausPostZiele` (Haken und Recht zum Anlegen). Dokumente
   * ohne Volltext stehen in `ohneText`; das ist kein Fehler, die Seite zeigt dann eben keine Belege.
   */
  async abgleichDokumente(eingabe: unknown, z?: Zugriff): Promise<Abgleich & { bezuege: Record<string, MappenBezug>; ohneText: string[]; typ?: TypFund | null }> {
    const e = (eingabe ?? {}) as { dokumente?: unknown; typ?: unknown };
    const ids = [...new Set((Array.isArray(e.dokumente) ? e.dokumente : []).filter((x): x is string => typeof x === 'string'))].slice(0, 10);
    const typ = typeof e.typ === 'string' && e.typ ? e.typ : undefined;
    const teile: string[] = [];
    const ohneText: string[] = [];
    for (const id of ids) {
      const d = await this.repo().holeDokument(id);
      if (!d) throw new Fachfehler(404, t('meldungen.erkennung.dieses-dokument-gibt-es'));
      await this.d.rechtepruefung.pruefeRecht(z, d.mappeId, 'R');
      const text = await this.repo().volltext(id);
      // E-Rechnung als XML (#1043): ohne Volltext zählt ihr lesbarer Auszug.
      const er = !text?.trim() && istXmlDatei(d.name, d.mime) ? await this.erechnungAus(() => this.d.kern.liesGanz(d.sha256), d.name, d.mime, d.groesse) : null;
      if (text?.trim()) teile.push(text); else if (er) teile.push(erechnungText(er)); else ohneText.push(id);
    }
    const text = teile.join('\n\n').slice(0, TEXT_MAX);
    const erg = await this.abgleich(text, typ, z);
    if (typ) return { ...erg, ohneText };
    return { ...erg, ohneText, typ: text.trim() ? typAusText(text, await this.d.mappentypen.ausPostZiele(z)) : null };
  }

  /** „Neue Organisation anlegen“: der erste Absender-Typ mit Namensfeld, den der Benutzer sieht und anlegen darf. */
  private async neuerAbsender(b: Briefkopf, z?: Zugriff): Promise<ErkennungAntwort['neuerAbsender']> {
    if (!b.name) return null;
    const typen = (await this.repo().listeTypen()).filter((t) => istAbsenderTyp(t) && (!z || z.typen.has(t.id)));
    // Organisation vor Person: kein Vorname/Nachname; ein Typ mit Kennung „…organisation“ zuerst.
    const kandidaten = typen.filter((t) => !t.felder.some((f) => /vorname|nachname/.test(f.key)))
      .sort((a, c) => Number(/organisation/.test(c.schluessel ?? '')) - Number(/organisation/.test(a.schluessel ?? '')));
    for (const t of kandidaten) {
      if (z && !(await this.d.rechtepruefung.rechteAn(z, { id: '', typId: t.id, werte: {}, titel: '', erstellt: '', geaendert: '' } as Mappe, true)).C) continue;
      const leer = { emails: [], internet: [], ibans: [], ustids: [], telefon: [], mobil: [], fax: [], datum: null, betrag: null, nummern: [], person: null, briefkopf: b };
      const werte = Object.fromEntries(Object.entries(vorschlaegeAus(t, '', leer)).filter(([, v]) => typeof v.wert === 'string').map(([k, v]) => [k, v.wert as string]));
      if (Object.keys(werte).length) return { typId: t.id, werte, fundstelle: b.fundstelle };
    }
    return null;
  }
}

/**
 * Fundstellen aus einem Paket (#939) müssen wörtlich im Dokument stehen (bis auf Leerraum und Groß-/Kleinschreibung) –
 * sonst fällt die Fundstelle weg, der Wert bleibt (ohne Rahmen). Alte Pakete ohne Fundstelle laufen unverändert weiter.
 */
export function ohneFremdeFundstellen(vorschlaege: Record<string, unknown>, text: string, typ: string, paket: string): Record<string, unknown> {
  let weg = 0;
  const erg = Object.fromEntries(Object.entries(vorschlaege).map(([k, roh]) => {
    if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return [k, roh];
    const o = roh as Record<string, unknown>;
    if (typeof o.fundstelle !== 'string' || !o.fundstelle.trim() || stehtImText(text, o.fundstelle)) return [k, roh];
    weg++;
    return [k, { ...o, fundstelle: '' }];
  }));
  if (weg) log.info('Fundstellen aus Paket verworfen (stehen nicht im Dokument)', { typ, paket, anzahl: weg });
  return erg;
}
