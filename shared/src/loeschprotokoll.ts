/**
 * Löschprotokoll (#470): Nachweis, dass und wann Mappen und Dokumente gelöscht wurden – ohne den Inhalt
 * zu behalten. Je Mappe Mappentyp, Id und Nummer (Nummernkreis), je Dokument Prüfsumme (SHA-256), Größe,
 * Dateityp und Seitenzahl; nie Titel, Feldwerte oder Dateinamen. Jeder Schritt ist ein eigener Eintrag:
 * in den Papierkorb, endgültig gelöscht, wiederhergestellt – verbunden über die Id.
 */
import { kreisVon } from './nummernkreis';
import type { Mappentyp, Werte } from './model';

export const LOESCHGRUENDE = {
  frist: 'Frist abgelaufen („Darf weg“)',
  verlangen: 'Auf Verlangen der betroffenen Person',
  nicht_noetig: 'Nicht mehr nötig',
  sonstiges: 'Sonstiges',
} as const;
export type Loeschgrund = keyof typeof LOESCHGRUENDE;
export const GRUND_TEXT_MAX = 200;

export const LOESCHSCHRITTE = { papierkorb: 'in den Papierkorb', endgueltig: 'endgültig gelöscht', wiederhergestellt: 'wiederhergestellt' } as const;
export type Loeschschritt = keyof typeof LOESCHSCHRITTE;

/** Wie gelöscht wurde. */
export const LOESCHWEGE = {
  einzeln: 'einzeln',
  mehrere: 'mehrere ausgewählt',
  verknuepft: 'mit verknüpften Mappen',
  dokument: 'Dokument einzeln',
  ersetzt: 'Dokument ersetzt',
  version: 'ältere Version entfernt',
  papierkorb: 'aus dem Papierkorb',
  leeren: 'Papierkorb geleert',
  abmelden: 'Papierkorb beim Abmelden geleert',
  ablauf: 'Aufbewahrung im Papierkorb abgelaufen',
  ausgeschaltet: 'Papierkorb ausgeschaltet',
  zurueckgerollt: 'Paketinstallation zurückgenommen',
} as const;
export type Loeschweg = keyof typeof LOESCHWEGE;

/** Wer: ein Benutzer in der Oberfläche, über die Schnittstelle (API-Schlüssel), ein Paket (Dienstkonto) oder das DMS selbst. */
export const AUSLOESER = { benutzer: 'Benutzer', api: 'Schnittstelle', paket: 'Paket', automatisch: 'automatisch' } as const;
export type Ausloeser = keyof typeof AUSLOESER;

export interface LoeschEintrag {
  id: string;
  zeit: string;
  art: 'mappe' | 'dokument';
  schritt: Loeschschritt;
  weg: Loeschweg;
  mappeId: string;
  typId: string | null;
  /** Name des Mappentyps beim Löschen (der Typ kann später umbenannt oder gelöscht werden). */
  typ: string;
  /** Nummer der Mappe aus ihrem Nummernkreis (z. B. „R-2026-0042“), auch bei ihren Dokumenten. */
  nummer: string | null;
  /** Nur Dokumente: Archivnummer des Papieroriginals (#345). */
  archivnummer: string | null;
  /** Nur Dokumente. */
  dokumentId: string | null;
  version: number | null;
  sha256: string | null;
  groesse: number | null;
  mime: string | null;
  seiten: number | null;
  /** Nur Mappen: was mit ihr ging. */
  anzahl: { dokumente: number; versionen: number; notizen: number; verweise: number } | null;
  vonId: string | null;
  von: string;
  ausloeser: Ausloeser;
  grund: Loeschgrund | null;
  grundText: string;
  /** Mit verknüpften Mappen (#424): gemeinsame Id; startId = Start-Mappe. */
  vorgang: string | null;
  startId: string | null;
}

/** Ein Dokument (oder eine ältere Version) für das Protokoll – ohne Namen. */
export interface LoeschDokument { dokumentId: string; version: number; sha256: string; groesse: number; mime: string; seiten: number | null; archivnummer: string | null }

/** Grund, wie ihn die Oberfläche bzw. die Schnittstelle schickt. */
export interface LoeschAnlass { grund?: Loeschgrund | null; text?: string }

/** Wer und warum, gesammelt vom Server für einen Löschvorgang. */
export interface LoeschKontext { vonId: string | null; von: string; ausloeser: Ausloeser; grund: Loeschgrund | null; grundText: string }

export function liesAnlass(v: unknown): LoeschAnlass {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const g = typeof o.grund === 'string' && o.grund in LOESCHGRUENDE ? o.grund as Loeschgrund : null;
  const t = typeof o.grundText === 'string' ? o.grundText : typeof o.text === 'string' ? o.text : '';
  return { grund: g, text: t.replace(/\s+/g, ' ').trim().slice(0, GRUND_TEXT_MAX) };
}

/** Nummer einer Mappe: Werte der Felder mit Nummernkreis (z. B. „R-2026-0042“), sonst null. */
export function nummerVon(typ: Pick<Mappentyp, 'felder'> | undefined, werte: Werte | undefined): string | null {
  if (!typ || !werte) return null;
  const n = typ.felder.filter((f) => kreisVon(f)).map((f) => werte[f.key]).filter((v): v is string => typeof v === 'string' && !!v.trim());
  return n.length ? n.join(', ') : null;
}

/* ---------- Ansicht: Filter ---------- */

export interface LoeschFilter {
  von?: string; bis?: string; typId?: string; grund?: Loeschgrund | 'ohne'; schritt?: Loeschschritt; art?: 'mappe' | 'dokument';
  /** Vorgang (#424) oder Mappen-Id. */
  vorgang?: string;
  /** Nummer (Teil, ohne Groß/klein) oder Prüfsumme (64 Hex-Zeichen, genau). */
  suche?: string;
  max?: number;
  /** Intern: nur diese Mappen- oder Dokument-Ids. */
  ids?: string[];
}
export const LOESCH_MAX = 2000;
export const istSha = (s: string) => /^[0-9a-f]{64}$/i.test(s.trim());

export function liesFilter(q: Record<string, unknown>): LoeschFilter {
  const t = (k: string) => (typeof q[k] === 'string' && (q[k] as string).trim() ? (q[k] as string).trim() : undefined);
  const tag = (k: string) => { const v = t(k); return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined; };
  const grund = t('grund');
  const schritt = t('schritt');
  const art = t('art');
  const max = Number(q.max);
  return {
    von: tag('von'), bis: tag('bis'), typId: t('typId'),
    grund: grund === 'ohne' || (grund && grund in LOESCHGRUENDE) ? grund as LoeschFilter['grund'] : undefined,
    schritt: schritt && schritt in LOESCHSCHRITTE ? schritt as Loeschschritt : undefined,
    art: art === 'mappe' || art === 'dokument' ? art : undefined,
    vorgang: t('vorgang'), suche: t('suche')?.slice(0, 100),
    max: Number.isInteger(max) && max > 0 ? Math.min(max, LOESCH_MAX) : 500,
  };
}

/** Filter auf eine Liste (Arbeitsspeicher; PostgreSQL filtert selbst gleich). Tage in Europe/Berlin. */
export function passt(e: LoeschEintrag, f: LoeschFilter): boolean {
  const tag = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(e.zeit));
  if (f.von && tag < f.von) return false;
  if (f.bis && tag > f.bis) return false;
  if (f.typId && e.typId !== f.typId) return false;
  if (f.grund && (f.grund === 'ohne' ? e.grund !== null : e.grund !== f.grund)) return false;
  if (f.schritt && e.schritt !== f.schritt) return false;
  if (f.art && e.art !== f.art) return false;
  if (f.vorgang && e.vorgang !== f.vorgang && e.mappeId !== f.vorgang) return false;
  if (f.ids && !f.ids.includes(e.mappeId) && !(e.dokumentId && f.ids.includes(e.dokumentId))) return false;
  if (f.suche) {
    const s = f.suche.trim().toLowerCase();
    if (istSha(s)) return e.sha256 === s;
    if (!(e.nummer ?? '').toLowerCase().includes(s) && !(e.archivnummer ?? '').toLowerCase().includes(s) && e.mappeId !== s && e.dokumentId !== s) return false;
  }
  return true;
}

/* ---------- Ausgabe ---------- */

export const LOESCH_SPALTEN = ['Zeit', 'Schritt', 'Art', 'Mappentyp', 'Nummer', 'Mappen-Id', 'Dokument-Id', 'Archivnummer', 'Version', 'SHA-256', 'Größe (Bytes)', 'Dateityp', 'Seiten', 'Dokumente', 'Versionen', 'Notizen', 'Verweise entfernt', 'Wie', 'Von', 'Auslöser', 'Grund', 'Grund (Text)', 'Vorgang', 'Start-Mappe'];

export function alsZeile(e: LoeschEintrag): string[] {
  const z = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  return [
    e.zeit, LOESCHSCHRITTE[e.schritt], e.art === 'mappe' ? 'Mappe' : 'Dokument', e.typ, e.nummer ?? '', e.mappeId, e.dokumentId ?? '', e.archivnummer ?? '', z(e.version),
    e.sha256 ?? '', z(e.groesse), e.mime ?? '', z(e.seiten), z(e.anzahl?.dokumente), z(e.anzahl?.versionen), z(e.anzahl?.notizen), z(e.anzahl?.verweise),
    LOESCHWEGE[e.weg] ?? e.weg, e.von, AUSLOESER[e.ausloeser] ?? e.ausloeser, e.grund ? LOESCHGRUENDE[e.grund] : '', e.grundText, e.vorgang ?? '', e.startId ?? '',
  ];
}

/** Aufbewahrung des Löschprotokolls in Jahren (Vorschlag 10). */
export const LOESCHPROTOKOLL_STANDARD_JAHRE = 10;
export const LOESCHPROTOKOLL_JAHRE_MAX = 30;
