/** Hilfen des Repos im Arbeitsspeicher ohne eigenen Zustand: Kopien, Zeitstempel, Suche wie in PostgreSQL, Einträge. */
import { teileKennung } from '../../../../shared/src/kennungen';
import type { LoeschDokument } from '../../../../shared/src/loeschprotokoll';
import {
  type Dokument,
  type Mappe,
  type Mappentyp,
  type MappentypDaten,
  normalisiereZiele,
  standardliste,
  trefferlistenVon,
} from '../../../../shared/src/model';
import { falte, normal, suchbegriffe, teilwoerter, type Varianten, woerterIn } from '../../../../shared/src/suche';
import type { PapierkorbEintrag } from '..';
import type { V } from './zustand';

/** Trefferlisten (#75) immer in beiden Formen: Liste der Trefferlisten und Spalten der Standardliste. */
export const listen = (d: MappentypDaten) => ({
  trefferlisten: structuredClone(trefferlistenVon(d)),
  trefferliste: [...standardliste(d).spalten],
});

/** Grob wie die deutsche Volltextsuche: alle Wörter kommen vor (ohne Groß-/Kleinschreibung). */
export const woerter = (q: string) =>
  q
    .toLowerCase()
    .replace(/["„“”]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
// Teilwörter (#161): „Ofen“ findet „Backofen“; in Anführungszeichen nur ganze Wörter.
// Unscharfe Suche (#356): gefaltet (Umlaute, ß), Bindestriche egal, je Begriff auch seine Varianten.
export const findet = (text: string | null | undefined, q: string, v: Varianten = {}) => {
  if (!text) return false;
  const teil = teilwoerter(q);
  const b = suchbegriffe(q);
  if (b) {
    const flach = normal(text);
    const im = new Set([...woerterIn(falte(text))].concat([...woerterIn(flach)]));
    return b.every((w) =>
      [w, ...(v[falte(w)] ?? [])].some((x) =>
        teil
          ? flach.includes(normal(x))
          : normal(x)
              .split(/[^\p{L}\p{N}]+/u)
              .filter(Boolean)
              .every((y) => im.has(y)),
      ),
    );
  }
  if (teil) return teil.every((w) => text.toLowerCase().includes(w));
  const im = woerterIn(text);
  return woerter(q).every((w) => im.has(w));
};
/** Kommt der Text (bzw. bei einem Begriff eine seiner Varianten) vor – ohne Umlaute, Groß-/Kleinschreibung, Bindestriche? */
export const enthaelt = (wert: string, q: string, v: Varianten = {}) => {
  const b = suchbegriffe(q);
  return (b?.length === 1 ? [q, ...(v[falte(b[0])] ?? [])] : [q]).some((x) => normal(wert).includes(normal(x)));
};
export const loeschDok = (d: Dokument): LoeschDokument => ({
  dokumentId: d.id,
  version: d.version ?? 1,
  sha256: d.sha256,
  groesse: d.groesse,
  mime: d.mime,
  seiten: d.ocr?.seiten ?? null,
  archivnummer: d.archivnummer ?? null,
});
export const loeschVersion = (v: V): LoeschDokument => ({
  dokumentId: v.dokumentId,
  version: v.nummer,
  sha256: v.sha256,
  groesse: v.groesse,
  mime: v.mime,
  seiten: null,
  archivnummer: null,
});
export const alsDokEintrag = (k: { dokument: Dokument; versionen: V[]; geloescht: string; geloeschtVon: string | null }) => ({
  id: k.dokument.id,
  mappeId: k.dokument.mappeId,
  registerKey: k.dokument.registerKey,
  name: k.dokument.name,
  mime: k.dokument.mime,
  groesse: k.dokument.groesse,
  sha256: k.dokument.sha256,
  erstellt: k.dokument.erstellt,
  erstelltVon: k.dokument.erstelltVon,
  ...(k.dokument.anlageZu ? { anlageZu: k.dokument.anlageZu } : {}),
  versionen: k.versionen.length,
  geloescht: k.geloescht,
  geloeschtVon: k.geloeschtVon,
});
export const alsEintrag = (k: {
  mappe: Mappe;
  dokumente: Dokument[];
  geloescht: string;
  geloeschtVon: string | null;
  vorgang?: string | null;
  entkoppelt?: Array<{ quelleId: string; feldKey: string }>;
}): PapierkorbEintrag => ({
  id: k.mappe.id,
  typId: k.mappe.typId,
  titel: k.mappe.titel ?? '',
  werte: kopie(k.mappe.werte),
  demo: !!k.mappe.demo,
  erstellt: k.mappe.erstellt,
  erstelltVon: k.mappe.erstelltVon,
  geaendert: k.mappe.geaendert,
  geaendertVon: k.mappe.geaendertVon,
  geloescht: k.geloescht,
  geloeschtVon: k.geloeschtVon,
  dokumente: k.dokumente.length,
  vorgang: k.vorgang ?? null,
  entkoppelt: kopie(k.entkoppelt ?? []),
});
export const jetzt = () => new Date().toISOString();
/** Ziele (#1036) wie in PostgreSQL nach Migration 095: immer `zielTypen`. */
export const zieleNeu = <T extends Pick<MappentypDaten, 'felder'>>(d: T): T => ({ ...d, felder: (d.felder ?? []).map(normalisiereZiele) });
/** „Zuletzt geändert“ (#609): bei jedem Schreiben mindestens eine Millisekunde später als vorher. */
export const standWeiter = (vorher: string) => new Date(Math.max(Date.now(), Date.parse(vorher) + 1)).toISOString();
export const kopie = <T>(x: T): T => structuredClone(x);
// Paket der Kennung (#1084): wie in PostgreSQL getrennt – abgeleitet aus `paket:schluessel`, nie aus der Eingabe.
export const ohnePaket = <T extends object>(d: T): T => {
  const rest = { ...d } as T & { paket?: string };
  delete rest.paket;
  return rest;
};
export const mitPaket = (t: Mappentyp): Mappentyp => {
  const p = t.schluessel ? teileKennung(t.schluessel).paket : null;
  if (p) t.paket = p;
  else delete t.paket;
  // Ist Teil einer anderen Mappe (#1031): wie in PostgreSQL nur, wenn eingestellt.
  if (!t.teilVon) delete t.teilVon;
  // In der allgemeinen Suche zeigen (#1220): ebenso nur, wenn eingestellt.
  if (typeof t.inSuche !== 'boolean') delete t.inSuche;
  return t;
};
