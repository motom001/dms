/**
 * Erkennung im Kern (#336): Vorschläge beim Zuordnen von Post – Absender, Angaben und Zielmappe.
 *
 * Läuft auf das interne Ereignis „Volltext fertig“ (nicht auf das Ende der eingebauten Texterkennung),
 * damit es auch mit einer Texterkennung als Paket (#458) läuft. Gerechnet wird einmal je Post, das
 * Ergebnis liegt an der Post (Tabelle erkennungen). Gespeichert sind nur Ids und Begründungen; beim
 * Lesen sieht jeder nur die Mappen, die er lesen darf. Die Muster stehen in shared/src/erkennung.ts.
 */

import type { Fund, Nummernfund, Briefkopf, Treffer } from '../../shared/src/erkennung';
import { eindeutigerTreffer, ENGINE_EINGEBAUT, typAusText, type TypFund, ERKENNEN_HINWEIS, findeAngaben, findeMappen, fuellfelder, gleicheAb, istAbsenderTyp, merkmalsfelder, type Abgleich, pruefeVorschlaege, schemaFuer, vorschlaegeAus, type Angaben, type AusDokument, type Vergleichsmappe, type Vorschlaege } from '../../shared/src/erkennung';
import { hatNetz, hatSchnittstelle } from '../../shared/src/pakete';
import type { Einstellungen } from './einstellungen';
import { auswahlText, geschuetzteFelder, type Betrag, type Feld, type Mappe, type Mappentyp, type MappenBezug } from '../../shared/src/model';
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
export function sichereZuordnung(e: Pick<PostErkennung, 'absender' | 'eindeutig' | 'ziele'>, autoTypen: Set<string>): { ziel: Zielvorschlag; grund: string } | { ziel: null; grund: string } {
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
  angaben: { datum: Fund | null; betrag: Fund<Betrag> | null; nummern: Nummernfund[] };
  /** Absender aus dem Briefkopf, wenn keiner der vorhandenen passt. */
  briefkopf: Briefkopf | null;
  ziele: Zielvorschlag[];
  /** Automatisch zugeordnet (#337). */
  auto?: AutoZuordnung;
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
    return (await this.d.listePakete()).filter((p) => hatSchnittstelle(p.laeufer, 'dms:erkennen'))
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
    const ad = await this.d.ausDokumentVon(typId);
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
    if (ergebnis) await this.d.ereignis('erkennung.fertig', { mappe: m.id, typ: m.typId, dokument: e.dokument });
    return ergebnis;
  }

  /** Text, an dem die Erkennung einer Post arbeitet: Absender, Betreff und Nachricht, dann die Volltexte. */
  private async postText(post: Mappe): Promise<{ text: string; dokumente: number }> {
    const teile = [auswahlText(post.werte.absender), auswahlText(post.werte.betreff), auswahlText(post.werte.nachricht)].filter(Boolean);
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
    const treffer = findeMappen(text, typen, mappen);
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
    const ergebnis: PostErkennung = {
      ...(auto ? { auto } : {}),
      zeit: new Date().toISOString(),
      dokumente,
      absender,
      eindeutig: eindeutig?.mappeId ?? null,
      angaben: { datum: angaben.datum, betrag: angaben.betrag, nummern: angaben.nummern.slice(0, 10) },
      briefkopf: absender.length ? null : angaben.briefkopf,
      ziele: [...ziele.values()].sort((a, b) => b.punkte - a.punkte).slice(0, MAX_ZIELE),
    };
    await repo.erkennungSchreibe(post.id, ergebnis, ergebnis.eindeutig);
    log.info('Erkennung für Post', { post: post.id, dokumente, absender: absender.length, eindeutig: !!eindeutig, ziele: ergebnis.ziele.length, ms: Date.now() - start });
    return ergebnis;
  }

  /** Gespeichertes Ergebnis; fehlt es (ältere Post, E-Mail ohne Anhang), wird es jetzt einmal gerechnet. */
  async ergebnis(postId: string): Promise<PostErkennung | null> {
    const da = await this.repo().erkennungLies(postId);
    return da ? da.ergebnis as PostErkennung : this.fuerPost(postId);
  }

  /** Für die Oberfläche bzw. die API: nur, was der Benutzer lesen darf. */
  async fuerBenutzer(postId: string, z?: Zugriff): Promise<ErkennungAntwort> {
    const post = await this.d.pruefeRecht(z, postId, 'R');
    const typ = await this.repo().holeTyp(post.typId);
    if (typ?.system !== 'post') throw new Fachfehler(422, t('meldungen.erkennung.vorschlaege-beim-zuordnen-gibt'));
    const e = await this.ergebnis(postId);
    if (!e) throw new Fachfehler(404, t('meldungen.erkennung.diese-post-gibt-es'));
    const ids = [...e.absender.map((x) => x.mappeId), ...e.ziele.map((x) => x.mappeId), ...(e.auto ? [e.auto.ziel] : [])];
    const lesbar = await this.d.lesbare(z, ids);
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
    };
  }

  /** Felder, die „Aus Dokument ausfüllen“ für diesen Benutzer füllen darf (#391): keine Passwörter, keine festen Felder. */
  private erlaubteFelder(typ: Mappentyp, mappe?: Mappe): (f: Feld) => boolean {
    const fest = geschuetzteFelder(typ, mappe);
    return (f) => f.typ !== 'passwort' && !fest[f.key];
  }

  /** Typ und Zugriff prüfen: bestehende Mappe braucht Bearbeiten, eine neue das Anlegen. */
  private async typFuer(typId: string, mappeId: string | undefined, z?: Zugriff): Promise<{ typ: Mappentyp; mappe?: Mappe }> {
    const typ = z ? z.typen.get(typId) : await this.repo().holeTyp(typId);
    if (!typ) throw new Fachfehler(404, t('meldungen.erkennung.diesen-mappentyp-gibt-es'));
    if (typ.system) throw new Fachfehler(422, t('meldungen.erkennung.ist-ein-systemmappentyp-dort', { name: typ.name }));
    if (mappeId) {
      const mappe = await this.d.pruefeRecht(z, mappeId, 'U');
      if (mappe.typId !== typ.id) throw new Fachfehler(422, t('meldungen.erkennung.die-mappe-hat-einen'));
      return { typ, mappe };
    }
    if (z && !(await this.d.rechteAn(z, { id: '', typId: typ.id, werte: {}, titel: '', erstellt: '', geaendert: '' } as Mappe, true)).C) throw new Fachfehler(403, t('meldungen.erkennung.mappen-dieses-typs-darfst'));
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
  async fuerTyp(typId: string, eingabe: unknown, z?: Zugriff): Promise<TypVorschlaege> {
    const e = (eingabe ?? {}) as { text?: unknown; dokumente?: unknown; mappe?: unknown };
    const { typ, mappe } = await this.typFuer(typId, typeof e.mappe === 'string' && e.mappe ? e.mappe : undefined, z);
    const teile: string[] = [];
    if (typeof e.text === 'string' && e.text.trim()) teile.push(e.text.slice(0, TEXT_MAX));
    // Mappentypen, aus denen der Text stammt (#796): Gesperrte gehen an kein KI-Paket.
    const quellTypen = new Set<string>([typ.id]);
    for (const id of (Array.isArray(e.dokumente) ? e.dokumente : []).filter((x): x is string => typeof x === 'string').slice(0, 10)) {
      const d = await this.repo().holeDokument(id);
      if (!d) throw new Fachfehler(404, t('meldungen.erkennung.dieses-dokument-gibt-es'));
      quellTypen.add((await this.d.pruefeRecht(z, d.mappeId, 'R')).typId);
      const eintrag = await this.repo().volltext(id);
      if (!eintrag?.trim()) throw new Fachfehler(409, t('meldungen.erkennung.hat-noch-keinen-volltext', { name: d.name }));
      teile.push(eintrag);
    }
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
      const gesperrt = p ? await this.d.kiSperreFuer(p.id) : () => false;
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
    const bezuege: Record<string, MappenBezug> = {};
    const neu: TypVorschlaege['neu'] = {};
    for (const { feld: f } of fuellfelder(typ)) {
      if (f.typ !== 'referenz' || !f.zielTyp || f.zielTyp === '*' || !erlaubt(f)) continue;
      const v = await this.verweisFuer(f, text, angaben, z);
      if (v?.mappe) { roh[f.key] = { wert: f.mehrfach ? [v.mappe.id] : v.mappe.id, sicherheit: v.sicherheit, fundstelle: v.fundstelle }; bezuege[v.mappe.id] = { titel: v.mappe.titel ?? '', typId: v.mappe.typId }; }
      else if (v?.neu) neu[f.key] = v.neu;
    }
    // Jede Antwort – eingebaut oder vom Paket – geht durch die Prüfung gegen die Feldtypen; verworfen wird mit Grund protokolliert (ohne Werte).
    const { vorschlaege, verworfen } = pruefeVorschlaege(typ, roh, erlaubt);
    // Folgt aus (#886): Felder, die aus einem vorgeschlagenen Verweis folgen, bekommen ihren Vorschlag dazu.
    await this.d.folgeVorschlaege(typ, { vorschlaege, bezuege, neu }, z);
    if (verworfen.length) log.warn('Vorschläge der Erkennung verworfen', { typ: typ.name, engine: engine.art === 'paket' ? engine.id : ENGINE_EINGEBAUT, felder: verworfen.map((x) => `${x.feld}: ${x.grund}`).join('; ') });
    // Fundstellen (#939): Seite und Rahmen aus der Textebene bzw. Texterkennung; nicht gefunden = Wert ohne Rahmen.
    if (dokIds.length && Object.keys(vorschlaege).length) await this.stellen(typ, vorschlaege, dokIds);
    log.info('Aus Dokument ausfüllen', { typ: typ.name, engine: engine.art === 'paket' ? engine.id : ENGINE_EINGEBAUT, zeichen: text.length, vorschlaege: Object.keys(vorschlaege).length, neu: Object.keys(neu).length });
    return { vorschlaege, bezuege, neu, verworfen: verworfen.length, zeichen: text.length, engine, ...(hinweis ? { hinweis } : {}), ...(gekuerzt ? { gekuerzt: true as const } : {}) };
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

  /** Verweisfeld: Mappe des Zieltyps, die im Text steht (markierte Felder, sonst der Titel); sonst „neu anlegen“. */
  private async verweisFuer(f: Feld, text: string, a: Angaben, z?: Zugriff): Promise<{ mappe?: Mappe; sicherheit: 'hoch' | 'mittel' | 'niedrig'; fundstelle: string; neu?: TypVorschlaege['neu'][string] } | null> {
    const ziel = await this.repo().holeTyp(f.zielTyp!);
    if (!ziel || (z && !z.typen.has(ziel.id))) return null;
    const alle = await this.repo().listeMappen(ziel.id);
    const lesbar = await this.d.lesbare(z, alle.map((m) => m.id));
    const mappen = alle.filter((m) => lesbar.has(m.id));
    // Ohne Felder zum Wiederfinden (#938) zählt der Titel als Name.
    const markiert = merkmalsfelder(ziel).length > 0;
    const vergleich = markiert ? ziel : { id: ziel.id, felder: [{ key: '_titel', label: t('meldungen.erkennung.name'), typ: 'text' as const, erkennung: { art: 'name' as const }, wiederfinden: true }] };
    const treffer = findeMappen(text, [vergleich], mappen.map((m) => ({ id: m.id, typId: m.typId, werte: markiert ? m.werte : { _titel: m.titel ?? '' } })));
    const best = eindeutigerTreffer(treffer) ?? (treffer.length === 1 ? treffer[0] : null);
    if (best) return { mappe: mappen.find((m) => m.id === best.mappeId), sicherheit: best.stark ? 'hoch' : 'mittel', fundstelle: `gefunden: ${best.gruende.join(', ')}` };
    if (!istAbsenderTyp(ziel) && markiert) return null;
    const firma = a.briefkopf?.name ?? a.person?.organisation;
    if (!firma) return null;
    if (z && !(await this.d.rechteAn(z, { id: '', typId: ziel.id, werte: {}, titel: '', erstellt: '', geaendert: '' } as Mappe, true)).C) return null;
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
    const lesbar = await this.d.lesbare(z, alle.map((m) => m.id));
    const mappen = alle.filter((m) => lesbar.has(m.id));
    const erg = gleicheAb(text.slice(0, TEXT_MAX), typen, mappen, ziel);
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
      await this.d.pruefeRecht(z, d.mappeId, 'R');
      const text = await this.repo().volltext(id);
      if (text?.trim()) teile.push(text); else ohneText.push(id);
    }
    const text = teile.join('\n\n').slice(0, TEXT_MAX);
    const erg = await this.abgleich(text, typ, z);
    if (typ) return { ...erg, ohneText };
    return { ...erg, ohneText, typ: text.trim() ? typAusText(text, await this.d.ausPostZiele(z)) : null };
  }

  /** „Neue Organisation anlegen“: der erste Absender-Typ mit Namensfeld, den der Benutzer sieht und anlegen darf. */
  private async neuerAbsender(b: Briefkopf, z?: Zugriff): Promise<ErkennungAntwort['neuerAbsender']> {
    if (!b.name) return null;
    const typen = (await this.repo().listeTypen()).filter((t) => istAbsenderTyp(t) && (!z || z.typen.has(t.id)));
    // Organisation vor Person: kein Vorname/Nachname; ein Typ mit Kennung „…organisation“ zuerst.
    const kandidaten = typen.filter((t) => !t.felder.some((f) => /vorname|nachname/.test(f.key)))
      .sort((a, c) => Number(/organisation/.test(c.schluessel ?? '')) - Number(/organisation/.test(a.schluessel ?? '')));
    for (const t of kandidaten) {
      if (z && !(await this.d.rechteAn(z, { id: '', typId: t.id, werte: {}, titel: '', erstellt: '', geaendert: '' } as Mappe, true)).C) continue;
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
