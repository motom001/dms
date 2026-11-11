/**
 * Anzeige-Bedingungen an Feldern und Abschnitten (#1033): „Anzeigen, wenn …“ – z. B. Abschnitt „Miete“ nur bei
 * Vertragsart Miete, Abschnitt „Abschluss“ nur, wenn die Ablage beruflich genutzt wird (#1032).
 *
 * Bedingungen kommen aus dem Baukasten der Ansichten (`sichten.ts`): Feldwert der Mappe (gleich, einer von, leer,
 * nicht leer, „Verweis zeigt auf eine bestimmte Mappe“ …), dazu das Merkmal der Ablage und „Verweis zeigt auf eine
 * Mappe vom Typ …“. Jede Bedingung ist umkehrbar, die Regel gilt bei „alle“ oder „eine davon“.
 *
 * - **Ausblenden ist Ordnung, kein Schutz.** Bedingungen gelten nur für die Anzeige im Formular (Mappe, „Dokument
 *   übernehmen“, Mappe anlegen). Rechte, KI-Freigabe, Erkennung und Automatisierungen hängen nie davon ab;
 *   Schnittstelle, Export, Auskunft, Spalten in Ansichten und Trefferlisten und die Titel-Vorlage zeigen alle Werte.
 * - **Werte bleiben gespeichert.** Ein ausgeblendetes Feld behält seinen Wert; Pflicht ist es nur, solange es zu
 *   sehen ist. Server und Oberfläche werten mit diesem Code aus (`anzeigestand`) – Pflicht gilt überall gleich.
 * - **Abschnitt ausgeblendet** → alle Felder bis zum nächsten Abschnitt; der nächste erscheint wieder normal.
 * - Bedingungen schauen auf die Werte der Mappe, auch auf Werte ausgeblendeter Felder. Eine Bedingung mit Problem
 *   (Feld entfernt …) zählt nicht; ohne gültige Bedingung ist das Feld zu sehen.
 *
 * Eine bestimmte Mappe steht als Id in der Bedingung (`zeigtAuf`). Pakete nennen eine mitgelieferte Mappe über ihre
 * feste Kennung (#1038): `{ art: vorgabe, feld: art, vorgabe: [miete] }` – beim Installieren wird daraus „zeigt auf“ mit
 * der Id der Vorgabe (server/src/pakete/vorgaben.ts, anzeigeMitVorgaben); „Paket erstellen“ schreibt es umgekehrt.
 */
import { feldLabel, abschnittTitel, typName } from './beschriftung';
import { istMerkmal, merkmalText, type Merkmale } from './merkmale';
import { einzigesZiel, istLeer, jedeMappe, zielErlaubt, pruefeMappe, standardRegister, type Abschnitt, type Anzeigebedingung, type Anzeigeregel, type Feld, type Mappe, type MappenKontext, type Mappentyp, type MappentypDaten, type Pruefergebnis, type Register, type Werte } from './model';
import { bedingungsProblem, bereinigeBedingungen, beschreibeBedingung, erfuellt, filterFuer, heuteIn, merkmalTrifft } from './sichten';
import { t } from './texte';

/** Die Typen stehen im Modell (model.ts), die Auswertung hier. */
export type { Anzeigebedingung, Anzeigeregel };
type Feldbedingung = Extract<Anzeigebedingung, { art: 'feld' }>['bedingung'];

/** Höchstens so viele Bedingungen je Feld oder Abschnitt. */
export const ANZEIGE_BEDINGUNGEN_MAX = 10;

/** Was die Auswertung außer den Werten braucht. */
export interface Anzeigekontext {
  /** Merkmale der Ablage; fehlt = privat. */
  merkmale?: Merkmale;
  /** Typ der Mappe mit dieser Id (für „Verweis zeigt auf eine Mappe vom Typ …“ bei Feldern auf jede Mappe). */
  typVon?: (mappeId: string) => string | undefined;
  /** Datum heute (JJJJ-MM-TT) für Datumsvergleiche; fehlt = heute in der Zeitzone der Ablage. */
  heute?: string;
  /** Ist die Mappe mit dieser Id eine eigene Organisation (#995)? Fehlt = keine. */
  eigeneOrganisation?: (mappeId: string) => boolean;
}

type TypTeil = Pick<MappentypDaten, 'felder'> & { register?: Register[] };

/* ---------- Eingaben bereinigen ---------- */

/** Regel aus einer Eingabe (API, Paket, Oberfläche); ohne Bedingung → undefined (immer zu sehen). */
export function bereinigeAnzeige(roh: unknown): Anzeigeregel | undefined {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return undefined;
  const o = roh as Record<string, unknown>;
  const bedingungen = (Array.isArray(o.bedingungen) ? o.bedingungen : []).slice(0, ANZEIGE_BEDINGUNGEN_MAX).map(bereinigeEine).filter((b): b is Anzeigebedingung => !!b);
  return bedingungen.length ? { modus: o.modus === 'eine' ? 'eine' : 'alle', bedingungen } : undefined;
}

function bereinigeEine(e: unknown): Anzeigebedingung | null {
  if (!e || typeof e !== 'object') return null;
  const x = e as Record<string, unknown>;
  const n = x.nicht === true ? { nicht: true } : {};
  if (x.art === 'merkmal') return istMerkmal(x.merkmal) ? { ...n, art: 'merkmal', merkmal: x.merkmal } : null;
  if (x.art === 'verweistyp') {
    return typeof x.feld === 'string' && x.feld && typeof x.typ === 'string' && x.typ ? { ...n, art: 'verweistyp', feld: x.feld.slice(0, 60), typ: x.typ.slice(0, 80) } : null;
  }
  // Eigene Organisation (#995): ein Verweisfeld zeigt auf eine Mappe mit dem Merkmal.
  if (x.art === 'eigeneOrganisation') return typeof x.feld === 'string' && x.feld ? { ...n, art: 'eigeneOrganisation', feld: x.feld.slice(0, 60) } : null;
  if (x.art === 'feld') {
    const [b] = bereinigeBedingungen([x.bedingung]);
    return b?.art === 'feld' ? { ...n, art: 'feld', bedingung: b } : null;
  }
  return null;
}

/* ---------- Prüfen ---------- */

const alsTyp = (typ: TypTeil) => ({ felder: typ.felder, register: typ.register ?? [] }) as unknown as Mappentyp;

/**
 * Warum eine Bedingung nicht (mehr) passt – z. B. weil ihr Feld entfernt wurde. null = in Ordnung. `eigene`: Felder,
 * auf die sie nicht schauen darf (das Feld selbst bzw. die Felder des eigenen Abschnitts – sonst ließe es sich nicht
 * mehr einblenden).
 */
export function anzeigeBedingungProblem(b: Anzeigebedingung, typ: TypTeil, eigene: string[] = [], existiertTyp?: (id: string) => boolean): string | null {
  if (b.art === 'merkmal') return istMerkmal(b.merkmal) ? null : t('gemeinsam.merkmale.unbekannt', { merkmal: String(b.merkmal) });
  const key = b.art === 'feld' ? b.bedingung.feld : b.feld;
  const f = typ.felder.find((x) => x.key === key);
  if (!f || key.startsWith('_')) return t('gemeinsam.anzeige.feld-fehlt', { feld: key });
  if (eigene.includes(key)) return t('gemeinsam.anzeige.eigenes-feld', { feld: feldLabel(f) });
  if (b.art === 'verweistyp') return verweistypProblem(b, f, existiertTyp);
  if (b.art === 'eigeneOrganisation') return f.typ === 'referenz' ? null : t('gemeinsam.anzeige.kein-verweis', { feld: feldLabel(f) });
  const w = [b.bedingung.wert, b.bedingung.bis];
  // Nur feste Werte und „heute“: Wer die Mappe ansieht, ändert nichts daran, was zu sehen ist.
  if (w.some((x) => x && x.art !== 'fest' && x.art !== 'heute')) return t('gemeinsam.anzeige.nur-feste-werte');
  const op = b.bedingung.op;
  if ((op === 'einerVon' || op === 'zeigtAuf') && b.bedingung.wert?.art === 'fest' && Array.isArray(b.bedingung.wert.wert) && !b.bedingung.wert.wert.length) return t('gemeinsam.anzeige.wert-waehlen', { feld: feldLabel(f) });
  return bedingungsProblem(b.bedingung, [alsTyp(typ)]);
}

function verweistypProblem(b: { typ: string }, f: Feld, existiertTyp?: (id: string) => boolean): string | null {
  if (f.typ !== 'referenz') return t('gemeinsam.anzeige.kein-verweis', { feld: feldLabel(f) });
  // Mehrere Zieltypen (#1036): „zeigt auf Mappe vom Typ …“ für jeden davon; bei genau einem Typ ist die Bedingung fest.
  if (!jedeMappe(f) && !zielErlaubt(f, b.typ)) return t('gemeinsam.anzeige.anderer-typ', { feld: feldLabel(f) });
  if (existiertTyp && !existiertTyp(b.typ)) return t('gemeinsam.anzeige.typ-fehlt');
  return null;
}

/** Probleme einer Regel, je Bedingung ein Text (leer = in Ordnung). */
export function anzeigeProbleme(r: Anzeigeregel | undefined, typ: TypTeil, eigene: string[] = [], existiertTyp?: (id: string) => boolean): string[] {
  return (r?.bedingungen ?? []).map((b) => anzeigeBedingungProblem(b, typ, eigene, existiertTyp)).filter((p): p is string => !!p);
}

/** Felder auf einem Feldregister, in der Reihenfolge des Formulars. */
const felderAuf = (typ: TypTeil, r: Register) => typ.felder.filter((f) => r.felder?.includes(f.key));
const registerVon = (typ: TypTeil): Register[] => (typ.register?.length ? typ.register : standardRegister(typ.felder as Feld[]));

/** Felder eines Abschnitts: ab `vor` bis vor den nächsten Abschnitt desselben Registers. */
export function abschnittFelder(typ: TypTeil, r: Register, a: Pick<Abschnitt, 'vor'>): string[] {
  const vor = new Set((r.abschnitte ?? []).map((x) => x.vor));
  const alle = felderAuf(typ, r);
  const start = alle.findIndex((f) => f.key === a.vor);
  if (start < 0) return [];
  const aus: string[] = [];
  for (let i = start; i < alle.length; i++) {
    if (i > start && vor.has(alle[i].key)) break;
    aus.push(alle[i].key);
  }
  return aus;
}

/**
 * Alle Probleme der Anzeige-Bedingungen eines Mappentyps – für das Speichern (Server) und den Editor. Schlüssel:
 * `feld:<key>` bzw. `abschnitt:<register>.<vor>`.
 */
export function anzeigeProblemeVon(typ: TypTeil, existiertTyp?: (id: string) => boolean): Record<string, string[]> {
  const aus: Record<string, string[]> = {};
  for (const f of typ.felder) {
    const p = anzeigeProbleme(f.anzeigen, typ, [f.key], existiertTyp);
    if (p.length) aus[`feld:${f.key}`] = p;
  }
  for (const r of registerVon(typ)) {
    for (const a of r.abschnitte ?? []) {
      const p = anzeigeProbleme(a.anzeigen, typ, abschnittFelder(typ, r, a), existiertTyp);
      if (p.length) aus[`abschnitt:${r.key}.${a.vor}`] = p;
    }
  }
  return aus;
}

/* ---------- Auswerten ---------- */

const KEINE_ZAEHLUNG = { dokumente: () => 0, verknuepfungen: () => 0 };
const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : istLeer(v) ? [] : [String(v)]);

/** Trifft die Bedingung zu? null = sie hat ein Problem und zählt nicht. */
export function anzeigeBedingungTrifft(b: Anzeigebedingung, typ: TypTeil, werte: Werte, k: Anzeigekontext = {}): boolean | null {
  if (anzeigeBedingungProblem(b, typ)) return null;
  let ja: boolean;
  if (b.art === 'merkmal') ja = merkmalTrifft({ merkmal: b.merkmal }, k.merkmale);
  else if (b.art === 'verweistyp') {
    const f = typ.felder.find((x) => x.key === b.feld)!;
    // Genau ein Zieltyp: jede gewählte Mappe ist davon. Sonst der Typ der Mappe – für nicht sichtbare unbekannt (#1036).
    const fest = einzigesZiel(f) ?? null;
    ja = alsListe(werte[b.feld]).some((id) => (fest ?? k.typVon?.(id)) === b.typ);
  } else if (b.art === 'eigeneOrganisation') {
    ja = alsListe(werte[b.feld]).some((id) => !!k.eigeneOrganisation?.(id));
  } else {
    const filter = filterFuer({ bedingungen: [b.bedingung] }, [alsTyp(typ)], { heute: k.heute ?? heuteIn(), ich: '', meineRollen: [] });
    const m = { id: '', typId: '', titel: '', werte, erstellt: '', geaendert: '' } as unknown as Mappe;
    // „zeigt auf Mappe vom Typ …“ (#1036) über die Typen, die die Oberfläche kennt (nicht sichtbare: keiner).
    ja = erfuellt(m, filter, { ...KEINE_ZAEHLUNG, ...(k.typVon ? { typVon: k.typVon } : {}) });
  }
  return b.nicht ? !ja : ja;
}

/** Ist zu sehen, was diese Regel hat? Ohne Regel oder ohne gültige Bedingung: ja. */
export function zeigtAn(r: Anzeigeregel | undefined, typ: TypTeil, werte: Werte, k: Anzeigekontext = {}): boolean {
  const erg = (r?.bedingungen ?? []).map((b) => anzeigeBedingungTrifft(b, typ, werte, k)).filter((x): x is boolean => x !== null);
  if (!erg.length) return true;
  return r!.modus === 'eine' ? erg.some(Boolean) : erg.every(Boolean);
}

export interface AusgeblendeterAbschnitt {
  register: string;
  abschnitt: Abschnitt;
  /** Alle Felder des Abschnitts (bis zum nächsten). */
  felder: string[];
}

/** Was eine Mappe mit diesen Werten zeigt – gemeinsam für Formular und Server (Pflicht). */
export interface Anzeigestand {
  /** Felder, die gerade nicht zu sehen sind: eigene Bedingung oder Abschnitt ausgeblendet. */
  verborgen: Set<string>;
  /** Felder, deren eigene Bedingung nicht zutrifft. */
  felder: Set<string>;
  /** Abschnitte, deren Bedingung nicht zutrifft, samt ihren Feldern. */
  abschnitte: AusgeblendeterAbschnitt[];
}

export function anzeigestand(typ: TypTeil, werte: Werte, k: Anzeigekontext = {}): Anzeigestand {
  const felder = new Set(typ.felder.filter((f) => f.anzeigen && !zeigtAn(f.anzeigen, typ, werte, k)).map((f) => f.key));
  const abschnitte: AusgeblendeterAbschnitt[] = [];
  for (const r of registerVon(typ)) {
    if (r.art !== 'felder') continue;
    for (const a of r.abschnitte ?? []) {
      if (a.anzeigen && !zeigtAn(a.anzeigen, typ, werte, k)) abschnitte.push({ register: r.key, abschnitt: a, felder: abschnittFelder(typ, r, a) });
    }
  }
  return { verborgen: new Set([...felder, ...abschnitte.flatMap((a) => a.felder)]), felder, abschnitte };
}

/** Kennungen der Felder, die bei diesen Werten nicht zu sehen sind (und darum nicht Pflicht). */
export const verborgeneFelder = (typ: TypTeil, werte: Werte, k: Anzeigekontext = {}) => anzeigestand(typ, werte, k).verborgen;

/** Hat der Typ Anzeige-Bedingungen? */
export function hatAnzeige(typ: TypTeil): boolean {
  return typ.felder.some((f) => f.anzeigen) || registerVon(typ).some((r) => (r.abschnitte ?? []).some((a) => a.anzeigen));
}

/** Schaut eine Bedingung des Typs auf ein Merkmal der Ablage? Dann ändert ein neues Merkmal die Pflicht. */
export function hatMerkmalBedingung(typ: TypTeil): boolean {
  const regeln = [...typ.felder.map((f) => f.anzeigen), ...registerVon(typ).flatMap((r) => (r.abschnitte ?? []).map((a) => a.anzeigen))];
  return regeln.some((r) => r?.bedingungen.some((b) => b.art === 'merkmal'));
}

/** Schaut eine Bedingung des Typs, ob ein Verweis auf eine eigene Organisation zeigt (#995)? */
export function hatEigeneOrganisationBedingung(typ: TypTeil): boolean {
  const regeln = [...typ.felder.map((f) => f.anzeigen), ...registerVon(typ).flatMap((r) => (r.abschnitte ?? []).map((a) => a.anzeigen))];
  return regeln.some((r) => r?.bedingungen.some((b) => b.art === 'eigeneOrganisation'));
}

/**
 * Eine Mappe prüfen wie `pruefeMappe`, mit den Anzeige-Bedingungen: Was gerade nicht zu sehen ist, ist nicht Pflicht.
 * Server (Speichern, Passung) und Oberfläche rufen beide diese Funktion.
 */
export function pruefeMitAnzeige(typ: Pick<Mappentyp, 'felder'> & { register?: Register[] }, werte: Werte, ctx: MappenKontext & Omit<Anzeigekontext, 'typVon'>): Pruefergebnis {
  const verborgen = hatAnzeige(typ) ? verborgeneFelder(typ, werte, { merkmale: ctx.merkmale, heute: ctx.heute, typVon: ctx.typVon, eigeneOrganisation: ctx.eigeneOrganisation }) : undefined;
  return pruefeMappe(typ, werte, { ...ctx, ...(verborgen?.size ? { verborgen } : {}) });
}

/* ---------- Beschreiben ---------- */

/** Bedingung lesbar, z. B. „Vertragsart ist einer von Miete“ oder „Ablage wird beruflich genutzt“. */
export function beschreibeAnzeigeBedingung(b: Anzeigebedingung, typ: TypTeil, namen: { typ?(id: string): string | undefined; mappe?(id: string): string } = {}): string {
  if (b.art === 'merkmal') return merkmalText(b.merkmal, b.nicht);
  if (b.art === 'verweistyp') {
    const f = typ.felder.find((x) => x.key === b.feld);
    const werte = { feld: f ? feldLabel(f) : b.feld, typ: namen.typ?.(b.typ) ?? b.typ };
    return b.nicht ? t('gemeinsam.anzeige.verweistyp-nicht', werte) : t('gemeinsam.anzeige.verweistyp', werte);
  }
  if (b.art === 'eigeneOrganisation') {
    const f = typ.felder.find((x) => x.key === b.feld);
    const werte = { feld: f ? feldLabel(f) : b.feld };
    return b.nicht ? t('gemeinsam.anzeige.eigene-organisation-nicht', werte) : t('gemeinsam.anzeige.eigene-organisation', werte);
  }
  // Umgekehrt lesbar, wo es ein Gegenstück gibt („ist leer“ → „ist nicht leer“), sonst „nicht (…)“.
  const gegen: Partial<Record<string, Feldbedingung['op']>> = { leer: 'nichtLeer', nichtLeer: 'leer', ja: 'nein', nein: 'ja' };
  const op = b.nicht ? gegen[b.bedingung.op] : undefined;
  const text = beschreibeBedingung(op ? { ...b.bedingung, op } : b.bedingung, [alsTyp(typ)], namen.mappe);
  return b.nicht && !op ? t('gemeinsam.anzeige.nicht', { bedingung: text }) : text;
}

/** Ganze Regel als kurzer Satz für Editor und Formular: „nur bei Vertragsart ist einer von Miete“. */
export function beschreibeAnzeige(r: Anzeigeregel | undefined, typ: TypTeil, namen: Parameters<typeof beschreibeAnzeigeBedingung>[2] = {}): string {
  const teile = (r?.bedingungen ?? []).map((b) => beschreibeAnzeigeBedingung(b, typ, namen));
  if (!teile.length) return '';
  const verbunden = teile.join(r!.modus === 'eine' ? t('gemeinsam.anzeige.oder') : t('gemeinsam.anzeige.und'));
  return t('gemeinsam.anzeige.nur-bei', { bedingung: verbunden });
}

/** Name eines Abschnitts für die ruhige Zeile: Überschrift, sonst „Abschnitt ab Feld …“. */
export function abschnittName(a: Abschnitt, typ: TypTeil): string {
  const titel = abschnittTitel(a);
  if (titel) return titel;
  const f = typ.felder.find((x) => x.key === a.vor);
  return t('gemeinsam.anzeige.abschnitt-ab', { feld: f ? feldLabel(f) : a.vor });
}

/** Für Beschreibungen: Name eines Mappentyps aus einer Liste. */
export const typNameAus = (typen: Array<Pick<Mappentyp, 'id' | 'name' | 'beschriftungen'>>) => (id: string) => {
  const x = typen.find((y) => y.id === id);
  return x ? typName(x) : undefined;
};
