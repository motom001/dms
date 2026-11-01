/**
 * Auskunft nach Art. 15 DSGVO (#396): Einstellungen, Auswahl und Prüfregeln – gemeinsam für Server
 * und Werkbank. Gesammelt wird mit der Baum-Sammlung (baum.ts); erzeugt wird eine ZIP-Datei mit
 * Deckblatt, Übersicht, Dokumenten und JSON im Format des Vollexports.
 */
import type { Baum } from './baum';

/** Je Mappentyp: betrifft eine Person? Zweck der Verarbeitung (für das Deckblatt). */
export interface DatenschutzTyp { person: boolean; zweck: string }

export interface Datenschutz {
  /** Absender des Deckblatts: Name und Anschrift des Verantwortlichen, mehrzeilig. */
  verantwortlicher: string;
  /** Empfänger der Daten (Art. 15 Abs. 1 lit. c), Vorschlag für jede Auskunft. */
  empfaenger: string;
  /** Rechte der betroffenen Person – Text auf dem Deckblatt. */
  rechte: string;
  typen: Record<string, DatenschutzTyp>;
}

/** Das Deckblatt geht an Kunden, Mieter und Kontakte – wie überall im DMS mit „du“ (Thomas, 01.11.2026; förmlich ggf. später mit #357). */
export const RECHTE_STANDARD = 'Du hast das Recht auf Berichtigung (Art. 16 DSGVO), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77). Die Daten im Ordner „daten“ sind maschinenlesbar (CSV und JSON) und lassen sich in andere Systeme übernehmen.';
export const DATENSCHUTZ_STANDARD: Datenschutz = { verantwortlicher: '', empfaenger: '', rechte: RECHTE_STANDARD, typen: {} };

export const TEXT_MAX = 2000;
export const ZWECK_MAX = 500;
/** So lange liegt eine erzeugte Auskunft zum Herunterladen bereit (danach gelöscht, ebenso nach dem Herunterladen). */
export const AUSKUNFT_TAGE = 7;
/** Frist zur Beantwortung (Art. 12 Abs. 3 DSGVO): ein Monat ab Eingang. */
export const AUSKUNFT_FRIST_MONATE = 1;
/** Begründung, warum eine Notiz nicht herausgegeben wird (Pflicht). */
export const GRUND_MIN = 5;
export const GRUND_MAX = 500;
export const AUSKUNFT_PASSWORT_MIN = 10;

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '');

/** Gespeicherte Einstellung lesen; fehlt etwas, gilt der Standard. */
export function liesDatenschutz(v: unknown): Datenschutz {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const typen: Record<string, DatenschutzTyp> = {};
  if (o.typen && typeof o.typen === 'object') {
    for (const [id, t] of Object.entries(o.typen as Record<string, unknown>)) {
      const x = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
      const person = x.person === true; const zweck = text(x.zweck, ZWECK_MAX);
      if (person || zweck) typen[id] = { person, zweck };
    }
  }
  return {
    verantwortlicher: text(o.verantwortlicher, TEXT_MAX),
    empfaenger: text(o.empfaenger, TEXT_MAX),
    rechte: typeof o.rechte === 'string' && o.rechte.trim() ? text(o.rechte, TEXT_MAX) : RECHTE_STANDARD,
    typen,
  };
}

/** Mappentypen, die „eine Person betreffen“ (Betroffene einer Auskunft). */
export const personenTypen = (d: Datenschutz) => Object.entries(d.typen).filter(([, t]) => t.person).map(([id]) => id);

/** Ende der Antwortfrist: Eingang + 1 Monat (31.01. → 28./29.02.), JJJJ-MM-TT. */
export function fristBis(eingang: string): string {
  const [j, m, t] = eingang.slice(0, 10).split('-').map(Number);
  const ziel = new Date(Date.UTC(j, m - 1 + AUSKUNFT_FRIST_MONATE, 1));
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  ziel.setUTCDate(Math.min(t, letzter));
  return ziel.toISOString().slice(0, 10);
}

/* ---------- Vorschau (Prüfliste) ---------- */

export interface AuskunftDokument {
  id: string; name: string; register: string; mime: string; groesse: number;
  /** Selbst eine geschwärzte Fassung (#392). */
  geschwaerzt: boolean;
  /** Es gibt eine geschwärzte Fassung davon in derselben Mappe (Id) – dann diese statt des Originals vorschlagen. */
  geschwaerzteFassung: string | null;
  /** Ältere Versionen werden nie mitgegeben (sie könnten ungeschwärzt sein). */
  aeltere: number;
  /** Lässt sich schwärzen (PDF, JPEG, PNG). */
  schwaerzbar: boolean;
}
export interface AuskunftNotiz { id: string; erstellt: string; text: string }
export interface AuskunftMappe {
  dokumente: AuskunftDokument[];
  notizen: AuskunftNotiz[];
  /** Einträge der Historie. */
  historie: number;
  /** Hinweis „Daten Dritter?“: Personen (Mappentyp „betrifft eine Person“) außerhalb der Sammlung, mit denen die Mappe verbunden ist (Titel). */
  dritte: string[];
  /** Passwortfelder werden nie mitgegeben (Bezeichnungen). */
  ohneFelder: string[];
}
/** Volltext-Treffer außerhalb des Baums – nur als Vorschlag, standardmäßig nicht ausgewählt. */
export interface AuskunftVorschlag { mappeId: string; typId: string; typ: string; titel: string; begriff: string }

export interface AuskunftVorschau {
  baum: Baum;
  mappen: Record<string, AuskunftMappe>;
  /** Vorgeschlagene Mappen außerhalb des Baums, mit ihren Inhalten wie oben. */
  vorschlaege: AuskunftVorschlag[];
  vorschlagMappen: Record<string, AuskunftMappe>;
  begriffe: string[];
  /** Ende der Antwortfrist, wenn heute eingegangen. */
  frist: string;
}

/** Was hinausgeht: nur ausdrücklich Ausgewähltes. */
export interface AuskunftAuswahl {
  mappen: string[];
  dokumente: string[];
  notizen: string[];
  /** Mappen, deren Historie mitgeht. */
  historie: string[];
  /** Abgewählte Notizen ausgewählter Mappen – je mit Begründung. */
  ohneNotizen: Array<{ id: string; grund: string }>;
}

const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : []);

/** Eingabe → Auswahl (ohne Prüfung gegen die Daten). */
export function liesAuswahl(v: unknown): AuskunftAuswahl {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const ohne = Array.isArray(o.ohneNotizen) ? o.ohneNotizen : [];
  return {
    mappen: ids(o.mappen), dokumente: ids(o.dokumente), notizen: ids(o.notizen), historie: ids(o.historie),
    ohneNotizen: ohne.map((x) => (x && typeof x === 'object' ? x as Record<string, unknown> : {})).filter((x) => typeof x.id === 'string')
      .map((x) => ({ id: x.id as string, grund: text(x.grund, GRUND_MAX) })),
  };
}

/**
 * Prüft die Auswahl gegen die gesammelten Mappen. Liefert Fehlermeldungen (leer = in Ordnung):
 * nur bekannte Mappen; Dokumente und Notizen nur aus ausgewählten Mappen; jede Notiz einer
 * ausgewählten Mappe ist entweder dabei oder hat eine Begründung.
 */
export function auswahlProbleme(a: AuskunftAuswahl, bekannt: Record<string, AuskunftMappe>): string[] {
  const p: string[] = [];
  if (!a.mappen.length) p.push('Bitte mindestens eine Mappe auswählen.');
  const fremd = a.mappen.filter((id) => !bekannt[id]);
  if (fremd.length) p.push(`${fremd.length} ausgewählte Mappen gehören nicht zur Sammlung – bitte neu sammeln.`);
  const gewaehlt = new Set(a.mappen.filter((id) => bekannt[id]));
  const dok = new Set<string>(); const not = new Set<string>();
  for (const id of gewaehlt) { for (const d of bekannt[id].dokumente) dok.add(d.id); for (const n of bekannt[id].notizen) not.add(n.id); }
  if (a.dokumente.some((id) => !dok.has(id))) p.push('Dokumente nur aus ausgewählten Mappen.');
  if (a.notizen.some((id) => !not.has(id))) p.push('Notizen nur aus ausgewählten Mappen.');
  if (a.historie.some((id) => !gewaehlt.has(id))) p.push('Historie nur von ausgewählten Mappen.');
  const drin = new Set(a.notizen);
  const grund = new Map(a.ohneNotizen.map((x) => [x.id, x.grund] as const));
  const ohneGrund = [...not].filter((id) => !drin.has(id) && (grund.get(id) ?? '').length < GRUND_MIN);
  if (ohneGrund.length) p.push(ohneGrund.length === 1 ? 'Eine abgewählte Notiz hat keine Begründung.' : `${ohneGrund.length} abgewählte Notizen haben keine Begründung.`);
  return p;
}

/** Eine erzeugte Auskunft, solange sie zum Herunterladen bereitliegt. */
export interface AuskunftStand {
  id: string;
  mappeId: string;
  titel: string;
  erstellt: string;
  /** Wird spätestens dann gelöscht. */
  bis: string;
  bytes: number;
  mappen: number;
  dokumente: number;
  verschluesselt: boolean;
  von: string;
}

/** Ein Dateiname ohne Sonderzeichen für die ZIP-Datei: Auskunft-<Titel>-<Datum>.zip */
export function auskunftDateiname(titel: string, datum: string): string {
  const t = titel.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'Person';
  return `Auskunft-${t}-${datum.slice(0, 10)}`;
}
