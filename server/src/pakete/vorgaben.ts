/**
 * Vorgaben aus Paketen (#1038): Paketformat lesen und prüfen, Vorschau planen, beim Installieren und Aktualisieren
 * anlegen bzw. ergänzen. Begriffe und feste Kennung: shared/src/vorgaben.ts. Was eine Vorlage sein darf: vorlagen.ts.
 *
 * Paketformat (`inhalt.vorgaben` im Manifest, Schreibweise wie dms-registry, Paket Verträge):
 *
 * ```yaml
 * - kennung: miete                 # fest, eindeutig im Paket – Kennung in Ablago: paket:vertraege:miete
 *   typ: vertragsart               # eigener Typ oder paket:schluessel eines Pakets, von dem es abhängt
 *   werte: { name: Miete, kuendigungsfrist: { anzahl: 3, einheit: monate } }
 *   beschriftungen: { en: { name: Rent } }   # Werte in der Sprache der Installation (#728)
 *   vorlagen:                      # Text-Vorlagen (Markdown) unter inhalt/vorlagen/
 *     - { datei: vorlagen/kuendigung-miete.md, titel: Kündigung Mietvertrag, register: vorlagen }
 * - ergaenzt: vertraege:miete      # Vorgabe eines anderen Pakets: nur Vorlagen anhängen, sonst nichts
 *   vorlagen: [{ datei: vorlagen/garage.md }]
 * ```
 *
 * Diese Datei liegt im Fachordner pakete/ und kennt den Dienst nicht (lint:abh): Was sie in Ablago anlegt, geht über
 * `VorgabenDienst`, den die Paketverwaltung (pakete.ts) mit dem Dienst erfüllt.
 */
import { createHash, randomUUID } from 'node:crypto';
import { SCHLUESSEL, TYPVERWEIS } from '../../../shared/src/kennungen';
import { istLeer, titelAus, type Dokument, type Mappe, type Mappentyp, type Register } from '../../../shared/src/model';
import type { InstalliertesPaket } from '../../../shared/src/pakete';
import {
  istVorgabeWert, teileVorgabe, VORGABEN_MAX, vorgabeKennung, vorgabePraefix, vorgabeVerweis, vorgabeWerte, VORLAGE_DATEI, VORLAGE_MIME, VORLAGEN_JE_VORGABE_MAX,
  type ErgaenzungPlan, type ErgaenzungStand, type VorgabePlan, type VorgabeStand, type VorgabeZustand, type VorlageStand,
} from '../../../shared/src/vorgaben';
import { Fachfehler } from '../fehler';
import { t } from '../sprache';
import { pruefeVorlage, type Vorlagenpruefung } from './vorlagen';

/* ---------- Paketformat ---------- */

/** Text-Vorlage an einer Vorgabe: `datei` relativ zu inhalt/ (vorlagen/…md), Titel = Dokumentname, Register (Dokumente). */
export interface PaketVorlage { datei: string; titel?: string; register?: string }
export interface PaketVorgabe {
  schluessel: string; typ: string; werte: Record<string, unknown>;
  /** Werte je Sprache (#728): Sprache → Feld → Text, z. B. { en: { name: Electricity } }. */
  beschriftungen?: Record<string, Record<string, string>>;
  vorlagen?: PaketVorlage[];
}
/** Vorlagen an der Vorgabe eines anderen Pakets (`ergaenzt: paket:schluessel`). */
export interface PaketErgaenzung { ziel: string; vorlagen: PaketVorlage[] }
export interface PaketVorgabenTeil { vorgaben: PaketVorgabe[]; ergaenzungen: PaketErgaenzung[]; vorlagenDateien: Map<string, Buffer> }

/** Was das Lesen vom Paket braucht: Id, Abhängigkeiten, eigene Typen (Felder, Register) und die Dateien. */
interface LeseKontext {
  id: string;
  abh: Record<string, unknown>;
  typen: Array<{ schluessel: string; felder: Array<{ key: string; typ?: string }>; register: Array<{ key: string; art?: string }> }>;
  dateien: Map<string, Buffer>;
}

const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const SPRACHE = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/;
/** Erlaubte Angaben je Eintrag – eine Ergänzung kann nur Vorlagen anhängen (Ergänzung Sicherheit). */
const VORGABE_TEILE = new Set(['kennung', 'typ', 'werte', 'beschriftungen', 'vorlagen']);
const ERGAENZUNG_TEILE = new Set(['ergaenzt', 'vorlagen']);

/** Passwortfelder (Kennungen) – kein Platzhalter einer Vorlage darf sie nennen. */
export const passwortFelder = (typen: Array<{ felder: Array<{ key: string; typ?: string }> }>): Set<string> =>
  new Set(typen.flatMap((x) => x.felder.filter((f) => f.typ === 'passwort').map((f) => f.key)));

/** Ein Typ- oder Vorgabe-Verweis zeigt auf ein Paket, von dem dieses abhängt (nicht dms:, nicht es selbst)? */
const vonAbhaengigkeit = (p: string, k: LeseKontext) => p !== 'dms' && p !== k.id && Object.hasOwn(k.abh, p);

/** Text einer Vorlagen-Prüfung für Meldungen. */
export function vorlagenFehlerText(p: Vorlagenpruefung, datei: string, max: string): string {
  return t.frei(`meldungen.pakete.vorlage.${p.fehler}`, { datei, wert: p.wert ?? '', max });
}

/** Was das Lesen eines Eintrags braucht: Paket, Passwortfelder, gesammelte Vorlagen und Fehler. */
interface Lesen { k: LeseKontext; geheim: Set<string>; vorlagenDateien: Map<string, Buffer>; fehler: string[]; maxText: string }

/** Liest `inhalt/vorgaben.yaml` (schon als Liste); Fehler landen in `fehler`. */
export function liesVorgaben(liste: Array<Record<string, unknown>>, k: LeseKontext, fehler: string[], maxText: string): PaketVorgabenTeil {
  const l: Lesen = { k, geheim: passwortFelder(k.typen), vorlagenDateien: new Map(), fehler, maxText };
  const vorgaben: PaketVorgabe[] = [];
  const ergaenzungen: PaketErgaenzung[] = [];
  if (liste.length > VORGABEN_MAX) fehler.push(t('meldungen.pakete.vorgaben.zu-viele', { max: VORGABEN_MAX }));
  for (const [i, e] of liste.slice(0, VORGABEN_MAX).entries()) {
    const wo = `vorgaben[${i + 1}]`;
    const ergaenzung = e.ergaenzt !== undefined;
    const fremdeTeile = Object.keys(e).filter((x) => !(ergaenzung ? ERGAENZUNG_TEILE : VORGABE_TEILE).has(x));
    if (ergaenzung && fremdeTeile.length) { fehler.push(t('meldungen.pakete.vorgaben.ergaenzung-nur-vorlagen', { wo, teile: fremdeTeile.join(', ') })); continue; }
    if (fremdeTeile.length) fehler.push(t('meldungen.pakete.vorgaben.unbekannt', { wo, teile: fremdeTeile.join(', ') }));
    if (ergaenzung) ergaenzungen.push(liesErgaenzung(e, wo, l, ergaenzungen));
    else vorgaben.push(liesEineVorgabe(e, wo, l, vorgaben));
  }
  // Verweise zwischen Vorgaben: eigene müssen es geben, fremde aus einer Abhängigkeit; keine Kreise.
  for (const [i, v] of vorgaben.entries()) fehler.push(...vorgabeVerweisFehler(vorgabeWerte(v.werte), `vorgaben[${i + 1}]`, vorgaben, k));
  if (!ordneVorgaben(vorgaben, k.id)) fehler.push(t('meldungen.pakete.vorgaben.kreis'));
  return { vorgaben, ergaenzungen, vorlagenDateien: l.vorlagenDateien };
}

/** `ergaenzt: paket:kennung` – Vorgabe eines Pakets, von dem dieses abhängt; nur mit Vorlagen. */
function liesErgaenzung(e: Record<string, unknown>, wo: string, l: Lesen, bisher: PaketErgaenzung[]): PaketErgaenzung {
  const vorlagen = liesVorlagen(e.vorlagen, wo, l);
  const ziel = str(e.ergaenzt);
  const { paket } = vorgabeVerweis(ziel, l.k.id);
  if (!ziel.includes(':') || !TYPVERWEIS.test(ziel) || !vonAbhaengigkeit(paket, l.k)) l.fehler.push(t('meldungen.pakete.vorgaben.ergaenzt-fremd', { wo, ziel }));
  else if (!vorlagen.length) l.fehler.push(t('meldungen.pakete.vorgaben.ergaenzt-ohne-vorlagen', { wo }));
  else if (bisher.some((x) => x.ziel === ziel)) l.fehler.push(t('meldungen.pakete.vorgaben.ergaenzt-doppelt', { wo, ziel }));
  return { ziel, vorlagen };
}

/** Eine eigene Vorgabe: Kennung, Typ (eigener oder aus einer Abhängigkeit), Werte, Beschriftungen, Vorlagen. */
function liesEineVorgabe(e: Record<string, unknown>, wo: string, l: Lesen, bisher: PaketVorgabe[]): PaketVorgabe {
  const { k, fehler } = l;
  const vorlagen = liesVorlagen(e.vorlagen, wo, l);
  const schluessel = str(e.kennung);
  if (!SCHLUESSEL.test(schluessel)) fehler.push(t('meldungen.pakete.vorgaben.kennung', { wo, wert: schluessel }));
  else if (bisher.some((x) => x.schluessel === schluessel)) fehler.push(t('meldungen.pakete.vorgaben.kennung-doppelt', { wo, wert: schluessel }));
  const typ = str(e.typ);
  const tv = vorgabeVerweis(typ, k.id);
  const eigenerTyp = tv.paket === k.id ? k.typen.find((x) => x.schluessel === tv.schluessel) : undefined;
  if (!TYPVERWEIS.test(typ)) fehler.push(t('meldungen.pakete.vorgaben.typ', { wo, typ }));
  else if (tv.paket === k.id ? !eigenerTyp : !vonAbhaengigkeit(tv.paket, k)) fehler.push(t('meldungen.pakete.vorgaben.typ-fremd', { wo, typ }));
  if (!istObjekt(e.werte) || !Object.keys(e.werte).length) fehler.push(t('meldungen.pakete.vorgaben.werte', { wo }));
  const werte = istObjekt(e.werte) ? e.werte : {};
  // Verweise auf Beispiele gehen nicht: Vorgaben bleiben, Beispiele lassen sich entfernen.
  if (JSON.stringify(werte).includes('"beispiel"')) fehler.push(t('meldungen.pakete.vorgaben.beispiel-verweis', { wo }));
  const passwort = eigenerTyp?.felder.filter((f) => f.typ === 'passwort' && werte[f.key] !== undefined).map((f) => f.key) ?? [];
  if (passwort.length) fehler.push(t('meldungen.pakete.vorgaben.passwort', { wo, felder: passwort.join(', ') }));
  const beschriftungen = liesBeschriftungen(e.beschriftungen, wo, fehler);
  // Register der Vorlagen am eigenen Typ: muss es geben und ein Dokumentenregister sein (fremde prüft das Installieren).
  for (const v of eigenerTyp ? vorlagen : []) if (!vorlagenRegister(eigenerTyp!.register, v.register)) fehler.push(t('meldungen.pakete.vorgaben.register', { wo, datei: v.datei, register: v.register ?? '–' }));
  return { schluessel, typ, werte, ...(beschriftungen ? { beschriftungen } : {}), ...(vorlagen.length ? { vorlagen } : {}) };
}

/** Fehler zu Verweisen `{ vorgabe: … }` (in Vorgaben, Beispielen) bzw. Anzeige-Bedingungen `art: vorgabe`. */
export function vorgabeVerweisFehler(verweise: string[], wo: string, vorgaben: Array<Pick<PaketVorgabe, 'schluessel'>>, k: Pick<LeseKontext, 'id' | 'abh'>): string[] {
  const fehler: string[] = [];
  for (const z of verweise) {
    const v = vorgabeVerweis(z, k.id);
    if (!TYPVERWEIS.test(z)) fehler.push(t('meldungen.pakete.vorgaben.verweis-ungueltig', { wo, wert: z }));
    else if (v.paket === k.id) { if (!vorgaben.some((x) => x.schluessel === v.schluessel)) fehler.push(t('meldungen.pakete.vorgaben.verweis-fehlt', { wo, wert: z })); }
    else if (!vonAbhaengigkeit(v.paket, { ...k, typen: [], dateien: new Map() })) fehler.push(t('meldungen.pakete.vorgaben.verweis-fremd', { wo, wert: z, paket: v.paket }));
  }
  return fehler;
}

/** Register einer Vorlage: das genannte Dokumentenregister, sonst „vorlagen“, sonst das erste Dokumentenregister. */
export function vorlagenRegister<R extends { key: string; art?: string }>(register: R[], name?: string): R | undefined {
  const dok = register.filter((r) => r.art === 'dokumente');
  return name ? dok.find((r) => r.key === name) : dok.find((r) => r.key === 'vorlagen') ?? dok[0];
}

function liesVorlagen(roh: unknown, wo: string, l: Lesen): PaketVorlage[] {
  const { fehler } = l;
  if (roh === undefined) return [];
  if (!Array.isArray(roh)) { fehler.push(t('meldungen.pakete.vorgaben.vorlagen-liste', { wo })); return []; }
  if (roh.length > VORLAGEN_JE_VORGABE_MAX) fehler.push(t('meldungen.pakete.vorgaben.vorlagen-zu-viele', { wo, max: VORLAGEN_JE_VORGABE_MAX }));
  return roh.slice(0, VORLAGEN_JE_VORGABE_MAX).flatMap((d) => liesVorlage(d, wo, l));
}

/** Eine Vorlage: Pfad unter vorlagen/, Datei im Paket, Inhalt (vorlagen.ts), Titel und Register. */
function liesVorlage(d: unknown, wo: string, l: Lesen): PaketVorlage[] {
  const { fehler } = l;
  const x = istObjekt(d) ? d : typeof d === 'string' ? { datei: d } : null;
  if (!x) { fehler.push(t('meldungen.pakete.vorgaben.vorlagen-liste', { wo })); return []; }
  const datei = str(x.datei).replace(/^\.\//, '');
  if (!VORLAGE_DATEI.test(datei)) { fehler.push(t('meldungen.pakete.vorgaben.vorlage-pfad', { wo, datei })); return []; }
  const daten = l.k.dateien.get(`inhalt/${datei}`);
  if (!daten) { fehler.push(t('meldungen.pakete.vorgaben.vorlage-fehlt', { wo, datei })); return []; }
  const p = pruefeVorlage(daten, l.geheim);
  if (p.fehler) { fehler.push(`${wo}: ${vorlagenFehlerText(p, datei, l.maxText)}`); return []; }
  const titel = x.titel === undefined ? undefined : str(x.titel).replace(/\p{Cc}/gu, '').trim();
  if (titel !== undefined && (!titel || titel.length > 200 || /[\\/]/.test(titel))) { fehler.push(t('meldungen.pakete.vorgaben.vorlage-titel', { wo, datei })); return []; }
  const register = x.register === undefined ? undefined : str(x.register);
  if (register !== undefined && !SCHLUESSEL.test(register)) { fehler.push(t('meldungen.pakete.vorgaben.register', { wo, datei, register })); return []; }
  l.vorlagenDateien.set(datei, daten);
  return [{ datei, ...(titel ? { titel } : {}), ...(register ? { register } : {}) }];
}

function liesBeschriftungen(roh: unknown, wo: string, fehler: string[]): Record<string, Record<string, string>> | undefined {
  if (roh === undefined) return undefined;
  const ok = istObjekt(roh) && Object.entries(roh).every(([s, x]) => SPRACHE.test(s) && istObjekt(x) && Object.values(x).every((w) => typeof w === 'string'));
  if (!ok) { fehler.push(t('meldungen.pakete.vorgaben.beschriftungen', { wo })); return undefined; }
  return roh as Record<string, Record<string, string>>;
}

/** Reihenfolge zum Anlegen: erst die Vorgaben, auf die andere zeigen. null = Kreis. */
export function ordneVorgaben<V extends Pick<PaketVorgabe, 'schluessel' | 'werte'>>(vorgaben: V[], id: string): V[] | null {
  const nach = new Map(vorgaben.map((v) => [v.schluessel, v]));
  const fertig = new Set<V>(), unterwegs = new Set<V>(), erg: V[] = [];
  const besuche = (v: V): boolean => {
    if (fertig.has(v)) return true;
    if (unterwegs.has(v)) return false;
    unterwegs.add(v);
    for (const z of vorgabeWerte(v.werte)) {
      const ziel = vorgabeVerweis(z, id);
      const x = ziel.paket === id ? nach.get(ziel.schluessel) : undefined;
      if (x && !besuche(x)) return false;
    }
    unterwegs.delete(v); fertig.add(v); erg.push(v);
    return true;
  };
  for (const v of vorgaben) if (!besuche(v)) return null;
  return erg;
}

/**
 * Anzeige-Bedingung „Verweis zeigt auf eine bestimmte Mappe“ über die feste Kennung (#1033 → #1038). Im Paket:
 * `{ art: vorgabe, feld: art, vorgabe: [miete], nicht?: true }` (Schreibweise der Registry). Beim Installieren wird
 * daraus die Feldbedingung „zeigt auf“ mit den Ids der Vorgaben; fehlt eine (gelöscht), zählt sie nicht – fehlen
 * alle, fällt die Bedingung weg.
 */
export const istVorgabeBedingung = (b: unknown): b is { art: 'vorgabe'; feld: string; vorgabe: unknown; nicht?: boolean } => istObjekt(b) && b.art === 'vorgabe';
export const bedingungsVorgaben = (b: { vorgabe: unknown }): string[] => (Array.isArray(b.vorgabe) ? b.vorgabe.map(str) : typeof b.vorgabe === 'string' ? [b.vorgabe] : []);

export function anzeigeMitVorgaben(a: unknown, id: (verweis: string) => string | null): unknown {
  if (!istObjekt(a) || !Array.isArray(a.bedingungen)) return a;
  const bedingungen = a.bedingungen.flatMap((b) => {
    if (!istVorgabeBedingung(b)) return [b];
    const ids = [...new Set(bedingungsVorgaben(b).map(id).filter((x): x is string => !!x))];
    return ids.length ? [{ ...(b.nicht === true ? { nicht: true } : {}), art: 'feld', bedingung: { art: 'feld', feld: str(b.feld), op: 'zeigtAuf', wert: { art: 'fest', wert: ids } } }] : [];
  });
  return { ...a, bedingungen };
}

/** Alle Vorgabe-Verweise in den Anzeige-Bedingungen eines Typs (Felder und Abschnitte). */
export function anzeigeVorgaben(typ: { felder: Array<Record<string, unknown> | object>; register: Array<{ abschnitte?: unknown }> }): Array<{ feld: string; verweise: string[] }> {
  const regeln = [...typ.felder.map((f) => (f as Record<string, unknown>).anzeigen), ...typ.register.flatMap((r) => (Array.isArray(r.abschnitte) ? r.abschnitte : []).map((x) => (istObjekt(x) ? x.anzeigen : undefined)))];
  return regeln.flatMap((r) => (istObjekt(r) && Array.isArray(r.bedingungen) ? r.bedingungen.filter(istVorgabeBedingung).map((b) => ({ feld: str(b.feld), verweise: bedingungsVorgaben(b) })) : []));
}

/* ---------- Werte ---------- */

/** Prüfwert von Feldwerten: JSON mit sortierten Schlüsseln (Reihenfolge aus der Datenbank zählt nicht). */
export function pruefwert(werte: unknown): string {
  const sortiert = (v: unknown): unknown => (Array.isArray(v) ? v.map(sortiert) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, sortiert(x)])) : v);
  return createHash('sha256').update(JSON.stringify(sortiert(werte ?? {}))).digest('hex');
}

/**
 * Werte einer Vorgabe in der Sprache der Installation (#728): Texte aus `beschriftungen` der Sprache (auch nur der
 * Hauptsprache, „en“ für „en-GB“) ersetzen die deutschen. Felder ohne Übersetzung bleiben Deutsch.
 */
export function werteIn(v: Pick<PaketVorgabe, 'werte' | 'beschriftungen'>, sprache: string): Record<string, unknown> {
  const b = v.beschriftungen?.[sprache] ?? v.beschriftungen?.[sprache.split('-')[0]];
  return b ? { ...v.werte, ...b } : { ...v.werte };
}

/* ---------- Vorschau ---------- */

/** Was die Vorschau und das Anlegen über die Vorgaben eines Pakets wissen müssen. */
export interface VorgabenLage {
  /** Je Schlüssel: die Mappe (falls es sie gibt) und was mit ihr geschieht; neue haben schon ihre Id. */
  je: Map<string, { id: string; mappe?: Mappe; zustand: VorgabeZustand; neueFassung?: boolean }>;
}

/** Zustand jeder eigenen Vorgabe aus Eintrag des Pakets und den Mappen mit seiner Kennung. */
export function vorgabenLage(vorgaben: PaketVorgabe[], ich: Pick<InstalliertesPaket, 'id' | 'vorgaben'> | null, paketId: string, mappen: Mappe[], sprache: string): VorgabenLage {
  const je: VorgabenLage['je'] = new Map();
  for (const v of vorgaben) {
    const kennung = vorgabeKennung(paketId, v.schluessel);
    const mappe = mappen.find((m) => m.vorgabe === kennung);
    const stand = ich?.vorgaben?.[v.schluessel];
    const fassung = pruefwert(werteIn(v, sprache));
    if (!mappe) {
      // Kennt das Paket sie und ist sie weg, hat der Administrator sie gelöscht (Hinweis Qualität E2): bleibt weg.
      je.set(v.schluessel, stand ? { id: stand.mappe, zustand: 'geloescht' } : { id: randomUUID(), zustand: 'neu' });
      continue;
    }
    if (!stand) { je.set(v.schluessel, { id: mappe.id, mappe, zustand: 'uebernommen' }); continue; }
    const unveraendert = pruefwert(mappe.werte) === stand.stand;
    const neu = fassung !== stand.fassung;
    je.set(v.schluessel, { id: mappe.id, mappe, zustand: !neu ? (unveraendert ? 'gleich' : 'geaendert') : unveraendert ? 'aktualisiert' : 'geaendert', ...(neu && !unveraendert ? { neueFassung: true } : {}) });
  }
  return { je };
}

/** Neue Vorlagen (noch nicht angelegt) einer Vorgabe bzw. Ergänzung. */
const neueVorlagen = (vorlagen: PaketVorlage[] | undefined, staende: VorlageStand[] | undefined) => (vorlagen ?? []).filter((v) => !(staende ?? []).some((s) => s.datei === v.datei)).length;

/** Vorschau der Vorgaben: Name, Typ (fremd: Paket), Zustand und neue Vorlagen. */
export function planeVorgaben(e: {
  vorgaben: PaketVorgabe[]; lage: VorgabenLage; ich: Pick<InstalliertesPaket, 'vorgaben'> | null; sprache: string;
  /** Typ zu einem Typverweis: Daten (Felder, Titel) und Name; fremd: Name des Pakets. */
  typ: (verweis: string) => { daten?: Pick<Mappentyp, 'felder' | 'titelVorlage'>; name: string; fremd: string | null };
}): VorgabePlan[] {
  return e.vorgaben.map((v): VorgabePlan => {
    const l = e.lage.je.get(v.schluessel)!;
    const ty = e.typ(v.typ);
    const werte = werteIn(v, e.sprache);
    const titel = l.mappe?.titel || (ty.daten ? titelAus(ty.daten, werte as never) : '') || str(werte.name ?? werte.bezeichnung ?? v.schluessel);
    const vorlagen = l.zustand === 'geloescht' ? 0 : neueVorlagen(v.vorlagen, e.ich?.vorgaben?.[v.schluessel]?.vorlagen);
    return { schluessel: v.schluessel, name: titel, typ: ty.name, fremd: ty.fremd, zustand: l.zustand, ...(l.neueFassung ? { neueFassung: true } : {}), vorlagen };
  });
}

/** Vorschau der Ergänzungen: Ziel, Name der Mappe, Paket, neue Vorlagen; fehlt die Vorgabe, kommen sie nicht. */
export function planeErgaenzungen(ergaenzungen: PaketErgaenzung[], ich: Pick<InstalliertesPaket, 'ergaenzungen'> | null, ziel: (verweis: string) => { mappe?: Mappe; paket: string }): ErgaenzungPlan[] {
  return ergaenzungen.map((e) => {
    const z = ziel(e.ziel);
    const alt = ich?.ergaenzungen?.find((x) => x.ziel === e.ziel);
    return { ziel: e.ziel, name: z.mappe?.titel || vorgabeVerweis(e.ziel, '').schluessel, paket: z.paket, vorlagen: z.mappe ? neueVorlagen(e.vorlagen, alt?.vorlagen) : 0, ...(z.mappe ? {} : { fehlt: true }) };
  });
}

/* ---------- Anlegen ---------- */

/** Was das Anlegen vom Dienst braucht – die Paketverwaltung gibt ihren Dienst hinein. */
export interface VorgabenDienst {
  mappentypen: { listeTypen(): Promise<Mappentyp[]> };
  legeMappeAn(eingabe: unknown, benutzerId: string | null): Promise<Mappe>;
  aendereMappe(id: string, eingabe: unknown, benutzerId: string | null): Promise<Mappe>;
  ladeHoch(mappeId: string, e: { register?: string; name?: string; typ?: string; herkunft?: 'paket' }, inhalt: unknown, benutzerId: string | null): Promise<{ dokument: Dokument }>;
  listeDokumente(mappeId: string): Promise<Dokument[]>;
  loescheDokument(id: string, benutzerId: string | null, anlass?: { weg?: 'dokument' }): Promise<unknown>;
  kern: { repo: { holeMappe(id: string): Promise<Mappe | undefined>; setzeVorgabe(id: string, kennung: string | null): Promise<void>; mappenMitVorgabe(praefix: string): Promise<Mappe[]> }; ohneEreignisse<T>(f: () => Promise<T>): Promise<T> };
}

export interface VorgabenAuftrag {
  paketId: string;
  teil: PaketVorgabenTeil;
  lage: VorgabenLage;
  alt: Pick<InstalliertesPaket, 'vorgaben' | 'ergaenzungen'> | null;
  sprache: string;
  /** Ersteller: Dienstkonto des Pakets (Herkunft in der Historie), sonst wer installiert. */
  von: string | null;
  /** Typverweis → Id. */
  typId: (verweis: string) => string | null;
  /** Vorgabe-Verweis → Mappen-Id (eigene aus `lage`, fremde über die feste Kennung). */
  vorgabeId: (verweis: string) => Promise<string | null>;
  /** Passwortfelder aller Mappentypen – Vorlagen werden beim Installieren noch einmal geprüft. */
  geheim: Set<string>;
  maxText: string;
}

export interface VorgabenErgebnis {
  vorgaben: Record<string, VorgabeStand>;
  ergaenzungen: ErgaenzungStand[];
  /** Neu angelegte Mappen (zum Zurückrollen). */
  angelegt: string[];
  /** Was beim Zurückrollen sonst rückgängig zu machen ist (Dokumente, geänderte Werte), neueste zuerst. */
  rueck: Array<() => Promise<unknown>>;
  /** Hinweise fürs Protokoll (z. B. Ergänzung ohne Ziel). */
  ausgelassen: string[];
}

/** Name des Dokuments: Titel mit .md bzw. der Dateiname. */
export function vorlagenName(v: PaketVorlage): string {
  const datei = v.datei.slice(v.datei.lastIndexOf('/') + 1);
  return v.titel ? (v.titel.toLowerCase().endsWith('.md') ? v.titel : `${v.titel}.md`) : datei;
}

/**
 * Vorgaben anlegen bzw. ergänzen (Installieren und Update). Ohne Ereignisse; Ersteller ist das Dienstkonto des Pakets.
 * Ändert nie eine Vorgabe, die der Administrator geändert hat, legt gelöschte nicht wieder an und hängt an Vorgaben
 * anderer Pakete nur Vorlagen an. Scheitert etwas, rollt die Paketverwaltung mit `angelegt` und `rueck` zurück.
 */
export async function legeVorgaben(d: VorgabenDienst, a: VorgabenAuftrag, erg: VorgabenErgebnis): Promise<void> {
  const typen = new Map((await d.mappentypen.listeTypen()).map((x) => [x.id, x] as const));
  for (const v of ordneVorgaben(a.teil.vorgaben, a.paketId) ?? a.teil.vorgaben) await legeEineVorgabe(d, a, erg, v, typen);
  await legeErgaenzungen(d, a, erg, typen);
}

/** Werte einer Vorgabe schreiben – nur neu oder unverändert seit dem letzten Schreiben (dann alle Felder vom Paket). */
async function schreibeWerte(d: VorgabenDienst, a: VorgabenAuftrag, erg: VorgabenErgebnis, x: { v: PaketVorgabe; l: VorgabenLage['je'] extends Map<string, infer L> ? L : never; typ: Mappentyp; werte: Record<string, unknown> }) {
  const { v, l, typ, werte } = x;
  const ohne = <T>(f: () => Promise<T>) => d.kern.ohneEreignisse(f);
  const fehler = (f: unknown) => new Fachfehler(422, t('meldungen.pakete.vorgaben.anlegen', { name: v.schluessel, meldungen: (f as Error).message }));
  if (l.zustand === 'neu') {
    try { await ohne(() => d.legeMappeAn({ id: l.id, typId: typ.id, werte }, a.von)); } catch (f) { throw fehler(f); }
    erg.angelegt.push(l.id);
    await d.kern.repo.setzeVorgabe(l.id, vorgabeKennung(a.paketId, v.schluessel));
    return;
  }
  if (l.zustand !== 'aktualisiert' || !l.mappe) return;
  const m = l.mappe;
  const leer = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, null]));
  // Was das Paket jetzt weglässt, wird leer: Alle Werte dieser Mappe kamen vom Paket.
  const neu = { ...leer(Object.keys(m.werte).filter((k) => !(k in werte))), ...werte };
  try { await ohne(() => d.aendereMappe(m.id, { werte: neu }, a.von)); } catch (f) { throw fehler(f); }
  erg.rueck.unshift(() => ohne(() => d.aendereMappe(m.id, { werte: { ...leer(Object.keys(neu)), ...m.werte } }, a.von)));
}

/** Eine eigene Vorgabe anlegen bzw. aktualisieren, samt Vorlagen; gelöschte bleiben gelöscht. */
async function legeEineVorgabe(d: VorgabenDienst, a: VorgabenAuftrag, erg: VorgabenErgebnis, v: PaketVorgabe, typen: Map<string, Mappentyp>) {
  const l = a.lage.je.get(v.schluessel)!;
  const alt = a.alt?.vorgaben?.[v.schluessel];
  const typId = a.typId(v.typ);
  const typ = typId ? typen.get(typId) : undefined;
  if (!typ) throw new Fachfehler(422, t('meldungen.pakete.vorgaben.typ-fehlt', { name: v.schluessel, typ: v.typ }));
  const roh = werteIn(v, a.sprache);
  const fassung = pruefwert(roh);
  if (l.zustand === 'geloescht') { erg.vorgaben[v.schluessel] = { ...(alt ?? { mappe: l.id, stand: '', fassung }), geloescht: true }; return; }
  await schreibeWerte(d, a, erg, { v, l, typ, werte: await feldwerte(typ, roh, a.vorgabeId) });
  const mappeId = l.mappe?.id ?? l.id;
  const s = await neuerStand(d, l.zustand, mappeId, alt, fassung);
  // Vorlagen ersetzen nur an Vorgaben, die das Paket noch so kennt, wie es sie geschrieben hat.
  const vorlagen = await legeVorlagen(d, a, erg, { mappeId, typ, vorlagen: v.vorlagen ?? [], alt: alt?.vorlagen ?? [], ersetzen: !s.fremdGeaendert });
  erg.vorgaben[v.schluessel] = { mappe: mappeId, stand: s.stand, fassung: s.fassung, ...(vorlagen.length ? { vorlagen } : {}) };
}

/**
 * Stand nach dem Schreiben: Prüfwert der Werte, wie sie jetzt sind. Geändert bzw. übernommen (von einer früheren
 * Installation stehen geblieben): Das Paket hat nichts geschrieben – der alte Stand bleibt bzw. gilt als geändert („-“).
 */
async function neuerStand(d: VorgabenDienst, zustand: VorgabeZustand, mappeId: string, alt: VorgabeStand | undefined, fassung: string) {
  if (zustand === 'uebernommen') return { stand: '-', fassung, fremdGeaendert: true };
  if (zustand === 'geaendert') return { stand: alt?.stand ?? '-', fassung: alt?.fassung ?? fassung, fremdGeaendert: true };
  return { stand: pruefwert((await d.kern.repo.holeMappe(mappeId))?.werte ?? {}), fassung, fremdGeaendert: false };
}

/** Vorlagen an Vorgaben anderer Pakete – nur anhängen; die Mappe selbst bleibt, wie sie ist. */
async function legeErgaenzungen(d: VorgabenDienst, a: VorgabenAuftrag, erg: VorgabenErgebnis, typen: Map<string, Mappentyp>) {
  for (const e of a.teil.ergaenzungen) {
    const ziel = vorgabeVerweis(e.ziel, a.paketId);
    const kennung = vorgabeKennung(ziel.paket, ziel.schluessel);
    const mappe = (await d.kern.repo.mappenMitVorgabe(kennung)).find((m) => m.vorgabe === kennung);
    const alt = a.alt?.ergaenzungen?.find((x) => x.ziel === e.ziel);
    const typ = mappe ? typen.get(mappe.typId) : undefined;
    if (!mappe || !typ) { erg.ausgelassen.push(e.ziel); if (alt) erg.ergaenzungen.push(alt); continue; }
    const vorlagen = await legeVorlagen(d, a, erg, { mappeId: mappe.id, typ, vorlagen: e.vorlagen, alt: alt?.mappe === mappe.id ? alt.vorlagen : [], ersetzen: true });
    erg.ergaenzungen.push({ ziel: e.ziel, mappe: mappe.id, vorlagen });
  }
  // Ergänzungen, die das neue Paket nicht mehr nennt: Ihre Vorlagen bleiben (ein Update löscht nichts) und gehören weiter dazu.
  for (const alt of a.alt?.ergaenzungen ?? []) if (!erg.ergaenzungen.some((x) => x.ziel === alt.ziel)) erg.ergaenzungen.push(alt);
}

/** Feldwerte für Ablago: Beträge als Zahl, Verweise `{ vorgabe: … }` als Id; Vorgaben ohne Ziel bleiben leer. */
async function feldwerte(typ: Mappentyp, roh: Record<string, unknown>, vorgabeId: (verweis: string) => Promise<string | null>): Promise<Record<string, unknown>> {
  const werte: Record<string, unknown> = {};
  for (const [k, w] of Object.entries(roh)) {
    const f = typ.felder.find((x) => x.key === k);
    if (!f || f.typ === 'passwort') continue;
    if (f.typ === 'betrag' && typeof w === 'number') werte[k] = { betrag: w, waehrung: f.waehrung || 'EUR' };
    else if (Array.isArray(w) && w.some(istVorgabeWert)) { const l = (await Promise.all(w.map((x) => (istVorgabeWert(x) ? vorgabeId(x.vorgabe) : null)))).filter((x): x is string => !!x); if (l.length) werte[k] = l; }
    else if (istVorgabeWert(w)) { const z = await vorgabeId(w.vorgabe); if (z) werte[k] = f.mehrfach ? [z] : z; }
    else if (!istLeer(w)) werte[k] = w;
  }
  return werte;
}

/** Vorlagen an einer Mappe: neue anlegen; unveränderte mit neuem Inhalt ersetzen (wenn `ersetzen`); geänderte bleiben. */
async function legeVorlagen(d: VorgabenDienst, a: VorgabenAuftrag, erg: VorgabenErgebnis, x: { mappeId: string; typ: Mappentyp; vorlagen: PaketVorlage[]; alt: VorlageStand[]; ersetzen: boolean }): Promise<VorlageStand[]> {
  const da = new Map((await d.listeDokumente(x.mappeId)).map((dok) => [dok.id, dok] as const));
  const staende: VorlageStand[] = [];
  for (const v of x.vorlagen) {
    const inhalt = a.teil.vorlagenDateien.get(v.datei);
    if (!inhalt) continue;
    // Beim Installieren noch einmal prüfen – mit den Passwortfeldern aller Mappentypen dieser Installation.
    const p = pruefeVorlage(inhalt, a.geheim);
    if (p.fehler) throw new Fachfehler(422, vorlagenFehlerText(p, v.datei, a.maxText));
    const reg = vorlagenRegister(x.typ.register as Register[], v.register);
    if (!reg) throw new Fachfehler(422, t('meldungen.pakete.vorgaben.register', { wo: x.typ.name, datei: v.datei, register: v.register ?? '–' }));
    const sha = createHash('sha256').update(inhalt).digest('hex');
    const alt = x.alt.find((s) => s.datei === v.datei);
    const dok = alt ? da.get(alt.dokument) : undefined;
    if (alt && !dok) continue; // gelöscht: bleibt weg
    if (alt && dok && (dok.sha256 !== alt.sha256 || !x.ersetzen || sha === alt.sha256)) { staende.push(alt); continue; }
    // Die bisherige Fassung zuerst in den Papierkorb (sonst hieße die neue „… (2).md“).
    if (dok) await d.kern.ohneEreignisse(() => d.loescheDokument(dok.id, a.von, { weg: 'dokument' }));
    const neu = await d.kern.ohneEreignisse(() => d.ladeHoch(x.mappeId, { register: reg.key, name: vorlagenName(v), typ: VORLAGE_MIME, herkunft: 'paket' }, inhalt, a.von));
    erg.rueck.unshift(() => d.loescheDokument(neu.dokument.id, a.von, { weg: 'dokument' }));
    staende.push({ datei: v.datei, dokument: neu.dokument.id, sha256: neu.dokument.sha256 });
  }
  // Vorlagen, die das Paket nicht mehr mitbringt, bleiben stehen und gehören weiter dazu (beim Entfernen gehen sie mit).
  for (const s of x.alt) if (!staende.some((y) => y.datei === s.datei) && da.has(s.dokument)) staende.push(s);
  return staende;
}

/* ---------- Entfernen ---------- */

/** Vorgabe-Mappen eines Pakets (feste Kennung) – auch die, die es nicht mehr im Eintrag führt. */
export async function vorgabeMappen(d: Pick<VorgabenDienst, 'kern'>, paketId: string): Promise<Mappe[]> {
  return d.kern.repo.mappenMitVorgabe(vorgabePraefix(paketId));
}

export { teileVorgabe };
