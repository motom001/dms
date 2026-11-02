/**
 * Erkennung im Kern (#336): Vorschläge beim Zuordnen von Post – Absender, Angaben und Zielmappe.
 *
 * Läuft auf das interne Ereignis „Volltext fertig“ (nicht auf das Ende der eingebauten Texterkennung),
 * damit es auch mit einer Texterkennung als Paket (#458) läuft. Gerechnet wird einmal je Post, das
 * Ergebnis liegt an der Post (Tabelle erkennungen). Gespeichert sind nur Ids und Begründungen; beim
 * Lesen sieht jeder nur die Mappen, die er lesen darf. Die Muster stehen in shared/src/erkennung.ts.
 */

import type { Fund, Nummernfund, Briefkopf, Treffer } from '../../shared/src/erkennung';
import { eindeutigerTreffer, ENGINE_EINGEBAUT, ERKENNEN_HINWEIS, findeAngaben, findeMappen, fuellfelder, istAbsenderTyp, merkmalsfelder, pruefeVorschlaege, schemaFuer, vorschlaegeAus, type Angaben, type AusDokument, type Vergleichsmappe, type Vorschlaege } from '../../shared/src/erkennung';
import { hatNetz, hatSchnittstelle } from '../../shared/src/pakete';
import type { Einstellungen } from './einstellungen';
import { auswahlText, geschuetzteFelder, type Betrag, type Feld, type Mappe, type Mappentyp, type MappenBezug } from '../../shared/src/model';
import type { Dienst, Zugriff } from './dienst';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import type { Repo } from './repo';

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
  if (!abs || !abs.stark) return { ziel: null, grund: 'Absender nicht eindeutig erkannt' };
  const kandidaten = e.ziele.filter((z) => autoTypen.has(z.typId));
  const direkt = kandidaten.filter((z) => z.direkt);
  const ziel = direkt.length === 1 ? direkt[0] : !direkt.length && kandidaten.length === 1 ? kandidaten[0] : null;
  if (!ziel) return { ziel: null, grund: kandidaten.length ? `${kandidaten.length} passende Mappen – nicht eindeutig` : 'keine passende Mappe eines Typs mit automatischer Zuordnung' };
  return { ziel, grund: `Absender eindeutig erkannt (${abs.gruende.join(', ')}), einzige passende Mappe (${ziel.gruende.join(', ')})` };
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
  constructor(private d: Dienst, private repo: () => Repo, private einst: () => Einstellungen | undefined = () => undefined) {}

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
    if (!p) throw new Fachfehler(422, `„${paket}“ ist kein installiertes Paket mit dem Recht „Felder aus Dokumenten vorschlagen“.`);
    if (p.netz && abfluss !== true) {
      throw new Fachfehler(409, `„${p.name}“ schickt den Text der Dokumente über das Netz an einen Dienst außerhalb des DMS. Bitte den Datenabfluss bestätigen.`, { abfluss: true, paket: p.name });
    }
  }

  async setzeStandard(e: unknown): Promise<ReturnType<Erkennung['engineStand']>> {
    const s = this.einst();
    if (!s) throw new Fachfehler(404, 'Einstellungen sind nicht eingerichtet.');
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
   * Text und Dokument-Ids; Antwort ein Objekt { feld: { wert, sicherheit, fundstelle } } (auch unter „vorschlaege“).
   */
  private async perPaket(p: { id: string; name: string }, typ: Mappentyp, text: string, dokumente: string[], erlaubt: (f: Feld) => boolean): Promise<Record<string, unknown>> {
    const schema = schemaFuer(typ, (f) => erlaubt(f) && f.typ !== 'referenz');
    if (!Object.keys(schema.properties as object).length) return {};
    const r = await this.anbieter!.erkenne(p.id, { typ: typ.name, schema, text: text.slice(0, PAKET_TEXT_MAX), dokumente, hinweis: ERKENNEN_HINWEIS, sprache: 'de' }, ERKENNEN_MS);
    const roh = r.text.trim();
    const a = roh.indexOf('{'), b = roh.lastIndexOf('}');
    let j: unknown;
    try { j = a >= 0 && b > a ? JSON.parse(roh.slice(a, b + 1)) : null; } catch { j = null; }
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('Die Antwort ist kein JSON-Objekt.');
    const o = j as Record<string, unknown>;
    const v = o.vorschlaege && typeof o.vorschlaege === 'object' && !Array.isArray(o.vorschlaege) ? o.vorschlaege as Record<string, unknown> : o;
    // Verweise nie vom Paket: Es kennt keine Mappen; eine Id daraus wäre ungeprüft.
    return Object.fromEntries(Object.entries(v).filter(([k]) => typ.felder.find((f) => f.key === k)?.typ !== 'referenz'));
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
        dazu(r.quelleId, r.quelleTypId, 2, `verweist über „${qt.felder.find((f) => f.key === r.feldKey)?.label ?? r.feldKey}“ auf den Absender`);
      }
      const frueher = (await repo.erkennungenMitAbsender(haupt.mappeId, 50)).filter((id) => id !== post.id);
      const zaehler = new Map<string, number>();
      for (const p of await repo.holeMappen(frueher)) for (const z of Array.isArray(p.werte.bezug) ? p.werte.bezug.map(String) : []) zaehler.set(z, (zaehler.get(z) ?? 0) + 1);
      const ziel = await repo.holeMappen([...zaehler.keys()]);
      for (const m of ziel) {
        const n = zaehler.get(m.id)!;
        if (alleTypen.get(m.typId)?.system) continue;
        dazu(m.id, m.typId, 2 + Math.min(n, 5), `frühere Post dieses Absenders ging hierher${n > 1 ? ` (${n}-mal)` : ''}`);
      }
      const at = alleTypen.get(haupt.typId);
      if (at?.register.some((r) => r.art === 'dokumente')) dazu(haupt.mappeId, haupt.typId, 1, 'der Absender selbst');
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
    if (typ?.system !== 'post') throw new Fachfehler(422, 'Vorschläge beim Zuordnen gibt es nur für Post.');
    const e = await this.ergebnis(postId);
    if (!e) throw new Fachfehler(404, 'Diese Post gibt es nicht.');
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
    if (!typ) throw new Fachfehler(404, 'Diesen Mappentyp gibt es nicht.');
    if (typ.system) throw new Fachfehler(422, `„${typ.name}“ ist ein Systemmappentyp – dort gibt es „Aus Dokument ausfüllen“ nicht.`);
    if (mappeId) {
      const mappe = await this.d.pruefeRecht(z, mappeId, 'U');
      if (mappe.typId !== typ.id) throw new Fachfehler(422, 'Die Mappe hat einen anderen Mappentyp.');
      return { typ, mappe };
    }
    if (z && !(await this.d.rechteAn(z, { id: '', typId: typ.id, werte: {}, titel: '', erstellt: '', geaendert: '' } as Mappe, true)).C) throw new Fachfehler(403, 'Mappen dieses Typs darfst du nicht anlegen.');
    return { typ };
  }

  /** JSON Schema der Felder, die die Erkennung füllen darf (#391; für Clients und künftige Engines aus Paketen). */
  async schema(typId: string, z?: Zugriff): Promise<Record<string, unknown>> {
    const typ = z ? z.typen.get(typId) : await this.repo().holeTyp(typId);
    if (!typ) throw new Fachfehler(404, 'Diesen Mappentyp gibt es nicht.');
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
    for (const id of (Array.isArray(e.dokumente) ? e.dokumente : []).filter((x): x is string => typeof x === 'string').slice(0, 10)) {
      const d = await this.repo().holeDokument(id);
      if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
      await this.d.pruefeRecht(z, d.mappeId, 'R');
      const t = await this.repo().volltext(id);
      if (!t?.trim()) throw new Fachfehler(409, `„${d.name}“ hat noch keinen Volltext. Warte, bis die Texterkennung fertig ist, oder wähle ein Foto.`);
      teile.push(t);
    }
    const text = teile.join('\n\n').slice(0, TEXT_MAX);
    const erlaubt = this.erlaubteFelder(typ, mappe);
    const angaben = findeAngaben(text);
    // Erkennung per Paket (#511), wenn gewählt; sonst bzw. wenn das Paket nicht antwortet: eingebaut.
    const dokIds = (Array.isArray(e.dokumente) ? e.dokumente : []).filter((x): x is string => typeof x === 'string').slice(0, 10);
    let engine: TypVorschlaege['engine'] = { art: 'eingebaut' };
    let hinweis: string | undefined;
    let ausPaket: Record<string, unknown> | null = null;
    const wahl = text.trim() ? await this.wahlFuer(typ.id) : { engine: ENGINE_EINGEBAUT, abfluss: false };
    if (wahl.engine !== ENGINE_EINGEBAUT) {
      const p = this.anbieter?.pakete().find((x) => x.id === wahl.engine);
      if (!p) hinweis = `Das Paket „${wahl.engine}“ für die Erkennung läuft gerade nicht – die eingebaute Erkennung hat übernommen.`;
      else if (p.netz && !wahl.abfluss) hinweis = `Für „${p.name}“ ist der Datenabfluss nicht bestätigt – die eingebaute Erkennung hat übernommen.`;
      else {
        try { ausPaket = await this.perPaket(p, typ, text, dokIds, erlaubt); engine = { art: 'paket', id: p.id, name: p.name }; }
        catch (x) {
          hinweis = `„${p.name}“ hat nicht geantwortet (${(x as Error).message}) – die eingebaute Erkennung hat übernommen.`;
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
    if (verworfen.length) log.warn('Vorschläge der Erkennung verworfen', { typ: typ.name, engine: engine.art === 'paket' ? engine.id : ENGINE_EINGEBAUT, felder: verworfen.map((x) => `${x.feld}: ${x.grund}`).join('; ') });
    log.info('Aus Dokument ausfüllen', { typ: typ.name, engine: engine.art === 'paket' ? engine.id : ENGINE_EINGEBAUT, zeichen: text.length, vorschlaege: Object.keys(vorschlaege).length, neu: Object.keys(neu).length });
    return { vorschlaege, bezuege, neu, verworfen: verworfen.length, zeichen: text.length, engine, ...(hinweis ? { hinweis } : {}) };
  }

  /** Verweisfeld: Mappe des Zieltyps, die im Text steht (markierte Felder, sonst der Titel); sonst „neu anlegen“. */
  private async verweisFuer(f: Feld, text: string, a: Angaben, z?: Zugriff): Promise<{ mappe?: Mappe; sicherheit: 'hoch' | 'mittel' | 'niedrig'; fundstelle: string; neu?: TypVorschlaege['neu'][string] } | null> {
    const ziel = await this.repo().holeTyp(f.zielTyp!);
    if (!ziel || (z && !z.typen.has(ziel.id))) return null;
    const alle = await this.repo().listeMappen(ziel.id);
    const lesbar = await this.d.lesbare(z, alle.map((m) => m.id));
    const mappen = alle.filter((m) => lesbar.has(m.id));
    // Ohne markierte Felder zählt der Titel als Name.
    const markiert = merkmalsfelder(ziel).length > 0;
    const vergleich = markiert ? ziel : { id: ziel.id, felder: [{ key: '_titel', label: 'Name', typ: 'text' as const, erkennung: { art: 'name' as const } }] };
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
