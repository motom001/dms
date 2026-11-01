/**
 * Stempel und Wasserzeichen beim Weitergeben (#394).
 *
 * Das gespeicherte Original bleibt unverändert; der Stempel entsteht nur in der ausgegebenen Kopie
 * (Herunterladen, Export als PDF/ZIP, E-Mail). Hier stehen die reinen Teile: Vorlagen, Platzhalter,
 * Prüfen der Eingaben und welcher Stempel am Ende gilt (Pflicht je Mappentyp).
 */

export const STEMPEL_LAGEN = {
  diagonal: 'Diagonal (Wasserzeichen)',
  kopf: 'Kopfzeile',
  fuss: 'Fußzeile',
  ecke: 'Ecke oben rechts',
} as const;
export type StempelLage = keyof typeof STEMPEL_LAGEN;

export const STEMPEL_SEITEN = { alle: 'Alle Seiten', erste: 'Nur die erste Seite' } as const;
export type StempelSeiten = keyof typeof STEMPEL_SEITEN;

/** Je Mappentyp: Stempel beim Weitergeben nicht, als Vorschlag oder als Pflicht. */
export const STEMPEL_MODI = { aus: 'Kein Stempel', vorschlag: 'Vorschlagen', pflicht: 'Pflicht' } as const;
export type StempelModus = keyof typeof STEMPEL_MODI;

export interface Stempel {
  /** Text mit Platzhaltern, z. B. „Kopie für {empfänger} – {datum}“. */
  text: string;
  lage: StempelLage;
  /** 0,1 (kaum sichtbar) bis 1 (deckend). */
  deckkraft: number;
  seiten: StempelSeiten;
  /** Fußzeile „Seite x von y“ auf jeder Seite. */
  seitenzahlen: boolean;
  /** Archivnummer des Dokuments in der Fußzeile (wenn es eine hat). */
  archivnummer: boolean;
}

export interface StempelVorlage extends Stempel { id: string; name: string }

export interface StempelTyp { modus: StempelModus; vorlage: string | null }

/** Was Benutzer beim Weitergeben angeben: eine Vorlage und/oder eigene Werte, dazu der Empfänger. */
export interface StempelWunsch extends Partial<Stempel> { vorlage?: string; empfaenger?: string }

/** Was sich stempeln lässt: PDFs und Bilder (die werden dabei zum PDF). */
export const STEMPELBAR = ['application/pdf', 'image/jpeg', 'image/png'];
export const kannStempeln = (mime: string) => STEMPELBAR.includes(mime);

export const STEMPEL_TEXT_MAX = 200;
export const STEMPEL_NAME_MAX = 80;
export const STEMPEL_VORLAGEN_MAX = 50;

export const PLATZHALTER = {
  datum: 'heutiges Datum',
  'empfänger': 'Empfänger, den du beim Weitergeben angibst',
  benutzer: 'dein Name',
  mappe: 'Titel der Mappe',
} as const;

const GRUND: Omit<Stempel, 'text'> = { lage: 'diagonal', deckkraft: 0.25, seiten: 'alle', seitenzahlen: false, archivnummer: false };

export const STANDARD_VORLAGEN: StempelVorlage[] = [
  { id: 'kopie', name: 'Kopie für …', text: 'Kopie für {empfänger} – {datum}', ...GRUND },
  { id: 'vorlage', name: 'Nur zur Vorlage bei …', text: 'Nur zur Vorlage bei {empfänger}', ...GRUND, lage: 'kopf', deckkraft: 0.8 },
  { id: 'entwurf', name: 'Entwurf', text: 'ENTWURF', ...GRUND, deckkraft: 0.2 },
  { id: 'vertraulich', name: 'Vertraulich', text: 'VERTRAULICH', ...GRUND, lage: 'ecke', deckkraft: 0.9, seiten: 'erste' },
];

/** Ohne Vorlage: ein schlichter Stempel, falls ein Mappentyp Pflicht verlangt und keine Vorlage nennt. */
export const ERSATZ_STEMPEL: Stempel = { text: 'Kopie – {datum}', ...GRUND };

export interface StempelWerte { datum?: string; empfaenger?: string; benutzer?: string; mappe?: string }

/** Datum wie in Deutschland üblich, in Europe/Berlin. */
export const stempelDatum = (d = new Date()) => d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });

/** Welche Platzhalter ein Text nutzt (bekannte, normiert: „empfaenger“ statt „empfänger“). */
export function platzhalterIn(text: string): string[] {
  const r = new Set<string>();
  for (const m of text.matchAll(/\{([^{}]+)\}/g)) {
    const k = norm(m[1]);
    if (k) r.add(k);
  }
  return [...r];
}
function norm(k: string): string | null {
  const x = k.trim().toLowerCase().replace(/ä/g, 'ae');
  return ['datum', 'empfaenger', 'benutzer', 'mappe'].includes(x) ? x : null;
}

/**
 * Ersetzt {datum}, {empfänger} (auch {empfaenger}), {benutzer} und {mappe}. Unbekannte Platzhalter
 * bleiben stehen; fehlende Werte werden leer. Zeilenumbrüche und doppelte Leerzeichen fallen weg.
 */
export function ersetzePlatzhalter(text: string, w: StempelWerte): string {
  const werte: Record<string, string> = { datum: w.datum ?? stempelDatum(), empfaenger: w.empfaenger ?? '', benutzer: w.benutzer ?? '', mappe: w.mappe ?? '' };
  return text.replace(/\{([^{}]+)\}/g, (ganz, k: string) => { const n = norm(k); return n ? werte[n] : ganz; })
    .replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
}

const istLage = (v: unknown): v is StempelLage => typeof v === 'string' && v in STEMPEL_LAGEN;
const istSeiten = (v: unknown): v is StempelSeiten => typeof v === 'string' && v in STEMPEL_SEITEN;
const deckkraft = (v: unknown, std: number) => { const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN; return Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0.1, n)) * 100) / 100 : std; };
const janein = (v: unknown, std: boolean) => (v === true || v === 'true' || v === '1' || v === 'ja' ? true : v === false || v === 'false' || v === '0' || v === 'nein' ? false : std);

/** Ein Stempel aus beliebiger Eingabe; was fehlt, kommt aus `basis`. */
export function stempelAus(v: unknown, basis: Stempel = { text: '', ...GRUND }): Stempel {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    text: typeof o.text === 'string' ? o.text.replace(/[\r\n\t]+/g, ' ').trim().slice(0, STEMPEL_TEXT_MAX) : basis.text,
    lage: istLage(o.lage) ? o.lage : basis.lage,
    deckkraft: deckkraft(o.deckkraft, basis.deckkraft),
    seiten: istSeiten(o.seiten) ? o.seiten : basis.seiten,
    seitenzahlen: janein(o.seitenzahlen, basis.seitenzahlen),
    archivnummer: janein(o.archivnummer, basis.archivnummer),
  };
}

/** Gespeicherte Vorlagen lesen; ohne Einstellung gelten die Standardvorlagen. */
export function liesVorlagen(v: unknown): StempelVorlage[] {
  if (!Array.isArray(v)) return structuredClone(STANDARD_VORLAGEN);
  return v.filter((x) => x && typeof x === 'object' && typeof (x as StempelVorlage).id === 'string')
    .map((x) => ({ id: String((x as StempelVorlage).id), name: String((x as StempelVorlage).name ?? '').slice(0, STEMPEL_NAME_MAX), ...stempelAus(x) }));
}

export function liesStempelTyp(v: unknown): StempelTyp | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const modus = typeof o.modus === 'string' && o.modus in STEMPEL_MODI ? o.modus as StempelModus : 'aus';
  if (modus === 'aus') return null;
  return { modus, vorlage: typeof o.vorlage === 'string' && o.vorlage ? o.vorlage : null };
}

/** Prüft eine Vorlage; gibt Fehlertexte je Feld zurück (leer = in Ordnung). */
export function pruefeVorlage(v: { name: string; text: string }, andereNamen: string[]): Record<string, string> {
  const f: Record<string, string> = {};
  if (!v.name.trim()) f.name = 'Der Name fehlt.';
  else if (andereNamen.some((n) => n.trim().toLowerCase() === v.name.trim().toLowerCase())) f.name = 'Diesen Namen hat schon eine andere Vorlage.';
  if (!v.text.trim()) f.text = 'Der Text fehlt.';
  const unbekannt = [...v.text.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]).filter((k) => !norm(k));
  if (unbekannt.length) f.text = `Unbekannter Platzhalter: {${unbekannt[0]}}. Möglich sind {datum}, {empfänger}, {benutzer} und {mappe}.`;
  return f;
}

/** Ein Stempel ist gewünscht, wenn Text oder Vorlage angegeben ist. */
export function istGewuenscht(w: StempelWunsch | null | undefined): boolean {
  return !!w && (!!w.vorlage || (typeof w.text === 'string' && !!w.text.trim()));
}

/** Wunsch aus einem Anfragekörper (`stempel: {…}`) oder aus Abfrageparametern (API v1). */
export function wunschAus(v: unknown): StempelWunsch | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const s = (x: unknown) => (typeof x === 'string' ? x : Array.isArray(x) && typeof x[0] === 'string' ? x[0] : undefined);
  const w: StempelWunsch = {};
  const text = s(o.text) ?? s(o.stempel);
  if (text !== undefined) w.text = text;
  if (s(o.vorlage)) w.vorlage = s(o.vorlage);
  const empf = s(o.empfaenger) ?? s(o['empfänger']);
  if (empf !== undefined) w.empfaenger = empf.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 120);
  for (const k of ['lage', 'deckkraft', 'seiten', 'seitenzahlen', 'archivnummer'] as const) if (o[k] !== undefined) (w as Record<string, unknown>)[k] = Array.isArray(o[k]) ? (o[k] as unknown[])[0] : o[k];
  return istGewuenscht(w) || nurFusszeile(w) ? w : null;
}

/** Nur Seitenzahlen bzw. Archivnummer, ohne Stempeltext. */
const nurFusszeile = (w: StempelWunsch | null | undefined) => !!w && !istGewuenscht(w) && (janein(w.seitenzahlen, false) || janein(w.archivnummer, false));

export class StempelFehler extends Error {}

export interface GeltenderStempel { stempel: Stempel; empfaenger: string; pflicht: boolean; vorlage: string | null }

/**
 * Welcher Stempel gilt (#394): Ohne Wunsch keiner – außer der Mappentyp verlangt ihn (Pflicht), dann
 * dessen Vorlage. Mit Wunsch: die genannte Vorlage, darüber die eigenen Angaben. Nutzt der Text
 * {empfänger}, muss ein Empfänger angegeben sein (`empfaengerErsatz` z. B. die E-Mail-Adressen).
 */
export function geltenderStempel(wunsch: StempelWunsch | null | undefined, typ: StempelTyp | null | undefined, vorlagen: StempelVorlage[], empfaengerErsatz = ''): GeltenderStempel | null {
  const pflicht = typ?.modus === 'pflicht';
  const nurZahlen = nurFusszeile(wunsch);
  if (!istGewuenscht(wunsch) && !pflicht && !nurZahlen) return null;
  let basis: Stempel = ERSATZ_STEMPEL;
  let vorlage: string | null = null;
  const id = istGewuenscht(wunsch) ? wunsch!.vorlage : pflicht ? typ!.vorlage : undefined;
  if (id) {
    const v = vorlagen.find((x) => x.id === id);
    if (!v && istGewuenscht(wunsch)) throw new StempelFehler(`Die Stempel-Vorlage „${id}“ gibt es nicht.`);
    if (v) { basis = v; vorlage = v.id; }
  }
  const s = stempelAus(istGewuenscht(wunsch) ? wunsch : nurZahlen ? { ...wunsch, text: '' } : {}, nurZahlen ? { ...basis, text: '' } : basis);
  if (!s.text && !s.seitenzahlen && !s.archivnummer) throw new StempelFehler('Der Text des Stempels fehlt.');
  if (!s.text && pflicht) throw new StempelFehler('Dieser Mappentyp verlangt beim Weitergeben einen Stempel mit Text.');
  const empfaenger = (wunsch?.empfaenger ?? '').trim() || empfaengerErsatz.trim();
  if (platzhalterIn(s.text).includes('empfaenger') && !empfaenger) {
    throw new StempelFehler(pflicht ? 'Dieser Mappentyp verlangt beim Weitergeben einen Stempel. Gib den Empfänger an.' : 'Gib den Empfänger an – der Stempel nennt ihn.');
  }
  return { stempel: s, empfaenger, pflicht, vorlage };
}
