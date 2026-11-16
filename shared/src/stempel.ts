import { zeitzone } from './region';
import { t } from './texte';
/**
 * Stempel und Wasserzeichen beim Weitergeben (#394, #799).
 *
 * Das gespeicherte Original (und die Archivfassung) bleibt unverändert; der Stempel entsteht nur in der
 * ausgegebenen Kopie (Herunterladen, Export als PDF/ZIP, E-Mail, Abruf mit API-Schlüssel). Hier stehen die
 * reinen Teile: Vorlagen, Platzhalter, Prüfen der Eingaben, welcher Stempel am Ende gilt (Pflicht je
 * Mappentyp) und die Lage auf der Seite – dieselbe Rechnung für das PDF und die Vorschau in der Werkbank.
 */

export const STEMPEL_LAGEN = {
  diagonal: t('gemeinsam.stempel.diagonal-wasserzeichen'),
  kopf: 'Kopfzeile',
  fuss: 'Fußzeile',
  ecke: t('gemeinsam.stempel.ecke-oben-rechts'),
  stempel: t('gemeinsam.stempel.stempel-frei-platzierbar'),
} as const;
export type StempelLage = keyof typeof STEMPEL_LAGEN;

export const STEMPEL_SEITEN = { alle: t('gemeinsam.stempel.alle-seiten'), erste: t('gemeinsam.stempel.nur-die-erste-seite') } as const;
export type StempelSeiten = keyof typeof STEMPEL_SEITEN;

/** Farben des Stempels (#799); Rot ist die bisherige. Werte als RGB 0…1. */
export const STEMPEL_FARBEN = {
  rot: [0.75, 0.08, 0.08],
  blau: [0.1, 0.25, 0.68],
  gruen: [0.1, 0.45, 0.2],
  schwarz: [0.15, 0.15, 0.18],
} as const satisfies Record<string, readonly [number, number, number]>;
export type StempelFarbe = keyof typeof STEMPEL_FARBEN;
export const farbeCss = (f: StempelFarbe) => `rgb(${STEMPEL_FARBEN[f].map((x) => Math.round(x * 255)).join(' ')})`;

/** Je Mappentyp: Stempel beim Weitergeben nicht, als Vorschlag oder als Pflicht. */
export const STEMPEL_MODI = { aus: t('gemeinsam.stempel.kein-stempel'), vorschlag: 'Vorschlagen', pflicht: 'Pflicht' } as const;
export type StempelModus = keyof typeof STEMPEL_MODI;

export interface Stempel {
  /** Text mit Platzhaltern, auch mehrzeilig, z. B. „Kopie für {empfänger} – {datum}“. */
  text: string;
  lage: StempelLage;
  /** 0,1 (kaum sichtbar) bis 1 (volle Farbe). */
  deckkraft: number;
  seiten: StempelSeiten;
  /** „Wie Tinte“ (#799): Mischmodus „Multiplizieren“ – der Stempel färbt nur ein, Schwarzes bleibt schwarz. */
  tinte: boolean;
  /** Drehung in Grad im Uhrzeigersinn, 0–359 (#799); gilt nicht für die feste Diagonale. */
  drehung: number;
  /** Mitte des Stempels bei der Lage „Stempel“, als Anteil von Breite und Höhe der Seite (0…1, von oben links). */
  x: number;
  y: number;
  farbe: StempelFarbe;
  /** Größe in Prozent der üblichen Größe (50–200). */
  groesse: number;
}

export interface StempelVorlage extends Stempel {
  id: string;
  name: string;
  /**
   * Umgestellt (#799): Die Vorlage hatte die entfallenen Haken „Seitenzahlen“ bzw. „Archivnummer in der Fußzeile“;
   * ihr Text hat dafür eine Zeile mit Platzhaltern bekommen. Die Werkbank weist darauf hin, bis die Vorlage
   * gespeichert wird.
   */
  umgestellt?: true;
}

export interface StempelTyp {
  modus: StempelModus;
  vorlage: string | null;
}

/** Was Benutzer beim Weitergeben angeben: eine Vorlage und/oder eigene Werte, dazu der Empfänger. */
export interface StempelWunsch extends Partial<Stempel> {
  vorlage?: string;
  empfaenger?: string;
  seitenzahlen?: unknown;
  archivnummer?: unknown;
}

/** Was sich stempeln lässt: PDFs und Bilder (die werden dabei zum PDF). */
export const STEMPELBAR = ['application/pdf', 'image/jpeg', 'image/png'];
export const kannStempeln = (mime: string) => STEMPELBAR.includes(mime);

export const STEMPEL_TEXT_MAX = 300;
export const STEMPEL_ZEILEN_MAX = 6;
export const STEMPEL_NAME_MAX = 80;
export const STEMPEL_VORLAGEN_MAX = 50;
/** Ab dieser Deckkraft weist die Werkbank darauf hin, dass der Stempel Inhalt verdecken kann (#799). */
export const DECKKRAFT_HINWEIS_AB = 0.8;

/** Bekannte Platzhalter (normiert: „empfaenger“ statt „empfänger“), in der Reihenfolge der Auswahl. */
export const PLATZHALTER = ['datum', 'empfaenger', 'benutzer', 'mappe', 'seite', 'seiten', 'archivnummer'] as const;
export type Platzhalter = (typeof PLATZHALTER)[number];
/** So schreibt man ihn in den Text. */
export const platzhalterText = (p: Platzhalter) => `{${p === 'empfaenger' ? 'empfänger' : p}}`;

/** Wie bisher: Felder, die eine gespeicherte Vorlage nicht kennt, behalten ihr heutiges Aussehen. */
const GRUND: Omit<Stempel, 'text'> = {
  lage: 'diagonal',
  deckkraft: 0.25,
  seiten: 'alle',
  tinte: false,
  drehung: 0,
  x: 0.72,
  y: 0.16,
  farbe: 'rot',
  groesse: 100,
};
/** Vorgaben für eine neue Vorlage (#799): 70 % und „wie Tinte“. */
export const NEUER_STEMPEL: Stempel = { text: '', ...GRUND, deckkraft: 0.7, tinte: true };

export const STANDARD_VORLAGEN: StempelVorlage[] = [
  { id: 'kopie', name: t('gemeinsam.stempel.kopie-fuer'), text: 'Kopie für {empfänger} – {datum}', ...GRUND },
  {
    id: 'vorlage',
    name: t('gemeinsam.stempel.nur-zur-vorlage-bei'),
    text: t('gemeinsam.stempel.nur-zur-vorlage-bei-2'),
    ...GRUND,
    lage: 'kopf',
    deckkraft: 0.8,
  },
  { id: 'entwurf', name: 'Entwurf', text: 'ENTWURF', ...GRUND, deckkraft: 0.2 },
  { id: 'vertraulich', name: 'Vertraulich', text: 'VERTRAULICH', ...GRUND, lage: 'ecke', deckkraft: 0.9, seiten: 'erste' },
  // WebDAV-Laufwerk (#722): leise Fußzeile auf jeder Seite; bestehende Installationen bekommen sie per Migration 067.
  { id: 'webdav', name: t('gemeinsam.stempel.aus-ablago-laufwerk'), text: 'Aus Ablago · {datum}', ...GRUND, lage: 'fuss', deckkraft: 0.6 },
];

/** Id der mitgelieferten Vorlage für das WebDAV-Laufwerk (#722) – Vorgabe für „Stempel beim Lesen“. */
export const WEBDAV_VORLAGE = 'webdav';

/** Ohne Vorlage: ein schlichter Stempel, falls ein Mappentyp Pflicht verlangt und keine Vorlage nennt. */
export const ERSATZ_STEMPEL: Stempel = { text: 'Kopie – {datum}', ...GRUND };

export interface StempelWerte {
  datum?: string;
  empfaenger?: string;
  benutzer?: string;
  mappe?: string;
  archivnummer?: string | null;
  /** Ohne Angabe bleiben {seite} und {seiten} stehen – sie werden erst je Seite ersetzt. */
  seite?: number;
  seiten?: number;
}

/** Datum wie in Deutschland üblich, in der Zeitzone der Region (#726). */
export const stempelDatum = (d = new Date()) =>
  d.toLocaleDateString('de-DE', { timeZone: zeitzone(), day: '2-digit', month: '2-digit', year: 'numeric' });

/** Welche Platzhalter ein Text nutzt (bekannte, normiert). */
export function platzhalterIn(text: string): string[] {
  const r = new Set<string>();
  for (const m of text.matchAll(/\{([^{}]+)\}/g)) {
    const k = norm(m[1]);
    if (k) r.add(k);
  }
  return [...r];
}
function norm(k: string): Platzhalter | null {
  const x = k.trim().toLowerCase().replace(/ä/g, 'ae');
  return (PLATZHALTER as readonly string[]).includes(x) ? (x as Platzhalter) : null;
}

/** Text in Zeilen ordnen: Zeilenenden vereinheitlichen, Zeilen trimmen, leere am Anfang und Ende weg, höchstens 6. */
export function stempelText(v: string): string {
  const zeilen = v
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .split('\n')
    .map((z) => z.replace(/ {2,}/g, ' ').trim());
  while (zeilen.length && !zeilen[0]) zeilen.shift();
  while (zeilen.length && !zeilen[zeilen.length - 1]) zeilen.pop();
  return zeilen.slice(0, STEMPEL_ZEILEN_MAX).join('\n').slice(0, STEMPEL_TEXT_MAX);
}

/**
 * Ersetzt die Platzhalter. {empfänger} geht auch als {empfaenger}. Unbekannte Platzhalter bleiben stehen; fehlende
 * Werte werden leer. Zeilen bleiben erhalten (#799); doppelte Leerzeichen und ein übrig gebliebenes „·“ am Rand
 * einer Zeile fallen weg, leere Zeilen auch.
 */
export function ersetzePlatzhalter(text: string, w: StempelWerte): string {
  const werte: Record<Platzhalter, string | undefined> = {
    datum: w.datum ?? stempelDatum(),
    empfaenger: w.empfaenger ?? '',
    benutzer: w.benutzer ?? '',
    mappe: w.mappe ?? '',
    archivnummer: w.archivnummer ?? '',
    seite: w.seite === undefined ? undefined : String(w.seite),
    seiten: w.seiten === undefined ? undefined : String(w.seiten),
  };
  return text
    .replace(/\{([^{}]+)\}/g, (ganz, k: string) => {
      const n = norm(k);
      return n ? (werte[n] ?? `{${n}}`) : ganz;
    })
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((z) =>
      z
        .replace(/[\t ]+/g, ' ')
        .trim()
        .replace(/^[·|]\s*/, '')
        .replace(/\s*[·|]$/, '')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}

/** Für Historie und Meldungen: ein mehrzeiliger Stempeltext in einer Zeile. */
export const einzeilig = (text: string) => text.split('\n').filter(Boolean).join(' / ');

/** Die Zeile, die eine Vorlage für die entfallenen Haken bekommt (#799). */
export function fusszeileAlsText(seitenzahlen: boolean, archivnummer: boolean): string {
  return [archivnummer ? '{archivnummer}' : '', seitenzahlen ? 'Seite {seite} von {seiten}' : ''].filter(Boolean).join(' · ');
}
const mitFusszeile = (text: string, seitenzahlen: boolean, archivnummer: boolean) => {
  const z = fusszeileAlsText(seitenzahlen, archivnummer);
  return z ? stempelText(text ? `${text}\n${z}` : z) : text;
};

const istLage = (v: unknown): v is StempelLage => typeof v === 'string' && v in STEMPEL_LAGEN;
const istSeiten = (v: unknown): v is StempelSeiten => typeof v === 'string' && v in STEMPEL_SEITEN;
const istFarbe = (v: unknown): v is StempelFarbe => typeof v === 'string' && v in STEMPEL_FARBEN;
const zahl = (v: unknown) => (typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN);
const deckkraft = (v: unknown, std: number) => {
  const n = zahl(v);
  return Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0.1, n)) * 100) / 100 : std;
};
const drehung = (v: unknown, std: number) => {
  const n = zahl(v);
  return Number.isFinite(n) ? ((Math.round(n) % 360) + 360) % 360 : std;
};
const anteil = (v: unknown, std: number) => {
  const n = zahl(v);
  return Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000 : std;
};
const groesse = (v: unknown, std: number) => {
  const n = zahl(v);
  return Number.isFinite(n) ? Math.round(Math.min(200, Math.max(50, n))) : std;
};
const janein = (v: unknown, std: boolean) =>
  v === true || v === 'true' || v === '1' || v === 'ja' ? true : v === false || v === 'false' || v === '0' || v === 'nein' ? false : std;

/**
 * Ein Stempel aus beliebiger Eingabe; was fehlt, kommt aus `basis`. Die entfallenen Angaben `seitenzahlen` und
 * `archivnummer` (bis #799) werden zu einer Zeile im Text – so bleiben ältere Skripte und Vorlagen wirksam.
 */
export function stempelAus(v: unknown, basis: Stempel = { text: '', ...GRUND }): Stempel {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const text = typeof o.text === 'string' ? stempelText(o.text) : basis.text;
  return {
    text: mitFusszeile(text, janein(o.seitenzahlen, false), janein(o.archivnummer, false)),
    lage: istLage(o.lage) ? o.lage : basis.lage,
    deckkraft: deckkraft(o.deckkraft, basis.deckkraft),
    seiten: istSeiten(o.seiten) ? o.seiten : basis.seiten,
    tinte: janein(o.tinte, basis.tinte),
    drehung: drehung(o.drehung, basis.drehung),
    x: anteil(o.x, basis.x),
    y: anteil(o.y, basis.y),
    farbe: istFarbe(o.farbe) ? o.farbe : basis.farbe,
    groesse: groesse(o.groesse, basis.groesse),
  };
}

/**
 * Gespeicherte Vorlagen lesen; ohne Einstellung gelten die Standardvorlagen. Vorlagen von vor #799 behalten ihr
 * Aussehen (Deckkraft wie gespeichert, „wie Tinte“ aus); gesetzte Haken für Seitenzahlen oder Archivnummer werden
 * zu einer Zeile im Text, und die Vorlage trägt `umgestellt`, bis sie gespeichert wird.
 */
export function liesVorlagen(v: unknown): StempelVorlage[] {
  if (!Array.isArray(v)) return structuredClone(STANDARD_VORLAGEN);
  return v
    .filter((x) => x && typeof x === 'object' && typeof (x as StempelVorlage).id === 'string')
    .map((x) => {
      const o = x as Record<string, unknown>;
      const umgestellt = o.umgestellt === true || janein(o.seitenzahlen, false) || janein(o.archivnummer, false);
      return {
        id: String(o.id),
        name: String(o.name ?? '').slice(0, STEMPEL_NAME_MAX),
        ...stempelAus(o),
        ...(umgestellt ? { umgestellt: true as const } : {}),
      };
    });
}

export function liesStempelTyp(v: unknown): StempelTyp | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const modus = typeof o.modus === 'string' && o.modus in STEMPEL_MODI ? (o.modus as StempelModus) : 'aus';
  if (modus === 'aus') return null;
  return { modus, vorlage: typeof o.vorlage === 'string' && o.vorlage ? o.vorlage : null };
}

/** Prüft eine Vorlage; gibt Fehlertexte je Feld zurück (leer = in Ordnung). */
export function pruefeVorlage(v: { name: string; text: string }, andereNamen: string[]): Record<string, string> {
  const f: Record<string, string> = {};
  if (!v.name.trim()) f.name = t('gemeinsam.stempel.der-name-fehlt');
  else if (andereNamen.some((n) => n.trim().toLowerCase() === v.name.trim().toLowerCase()))
    f.name = t('gemeinsam.stempel.diesen-namen-hat-schon');
  if (!v.text.trim()) f.text = t('gemeinsam.stempel.der-text-fehlt');
  const unbekannt = [...v.text.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]).filter((k) => !norm(k));
  if (unbekannt.length)
    f.text = t('gemeinsam.stempel.unbekannter-platzhalter-moeglich', {
      unbekannt: unbekannt[0],
      map: PLATZHALTER.map(platzhalterText).join(', '),
    });
  else if (
    v.text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .filter((z) => z.trim()).length > STEMPEL_ZEILEN_MAX
  )
    f.text = t('gemeinsam.stempel.hoechstens-zeilen', { STEMPEL_ZEILEN_MAX });
  return f;
}

/** Ein Stempel ist gewünscht, wenn Text oder Vorlage angegeben ist (oder eine der entfallenen Fußzeilen). */
export function istGewuenscht(w: StempelWunsch | null | undefined): boolean {
  return (
    !!w &&
    (!!w.vorlage || (typeof w.text === 'string' && !!w.text.trim()) || janein(w.seitenzahlen, false) || janein(w.archivnummer, false))
  );
}

const WUNSCH_FELDER = [
  'lage',
  'deckkraft',
  'seiten',
  'tinte',
  'drehung',
  'x',
  'y',
  'farbe',
  'groesse',
  'seitenzahlen',
  'archivnummer',
] as const;

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
  if (empf !== undefined)
    w.empfaenger = empf
      .replace(/[\r\n\t]+/g, ' ')
      .trim()
      .slice(0, 120);
  for (const k of WUNSCH_FELDER)
    if (o[k] !== undefined) (w as Record<string, unknown>)[k] = Array.isArray(o[k]) ? (o[k] as unknown[])[0] : o[k];
  return istGewuenscht(w) ? w : null;
}

export class StempelFehler extends Error {}

export interface GeltenderStempel {
  stempel: Stempel;
  empfaenger: string;
  pflicht: boolean;
  vorlage: string | null;
}

/**
 * Welcher Stempel gilt (#394): Ohne Wunsch keiner – außer der Mappentyp verlangt ihn (Pflicht), dann
 * dessen Vorlage. Mit Wunsch: die genannte Vorlage, darüber die eigenen Angaben. Nutzt der Text
 * {empfänger}, muss ein Empfänger angegeben sein (`empfaengerErsatz` z. B. die E-Mail-Adressen).
 */
export function geltenderStempel(
  wunsch: StempelWunsch | null | undefined,
  typ: StempelTyp | null | undefined,
  vorlagen: StempelVorlage[],
  empfaengerErsatz = '',
): GeltenderStempel | null {
  const pflicht = typ?.modus === 'pflicht';
  const gewuenscht = istGewuenscht(wunsch);
  if (!gewuenscht && !pflicht) return null;
  let basis: Stempel = ERSATZ_STEMPEL;
  let vorlage: string | null = null;
  const id = gewuenscht ? wunsch!.vorlage : pflicht ? typ!.vorlage : undefined;
  if (id) {
    const v = vorlagen.find((x) => x.id === id);
    if (!v && gewuenscht) throw new StempelFehler(t('gemeinsam.stempel.die-stempel-vorlage-gibt', { id }));
    if (v) {
      basis = v;
      vorlage = v.id;
    }
  }
  // Nur die entfallenen Fußzeilen ohne Text und Vorlage (ältere Skripte): eine Fußzeile wie bisher.
  const nurFuss = gewuenscht && !wunsch!.vorlage && !(typeof wunsch!.text === 'string' && wunsch!.text.trim());
  const s = stempelAus(gewuenscht ? wunsch : {}, nurFuss ? { ...basis, text: '', lage: 'fuss', farbe: 'schwarz', deckkraft: 1 } : basis);
  if (!s.text && pflicht) throw new StempelFehler(t('gemeinsam.stempel.dieser-mappentyp-verlangt-beim'));
  if (!s.text) throw new StempelFehler(t('gemeinsam.stempel.der-text-des-stempels'));
  const empfaenger = (wunsch?.empfaenger ?? '').trim() || empfaengerErsatz.trim();
  if (platzhalterIn(s.text).includes('empfaenger') && !empfaenger) {
    throw new StempelFehler(
      pflicht ? t('gemeinsam.stempel.dieser-mappentyp-verlangt-beim-2') : t('gemeinsam.stempel.gib-den-empfaenger-an'),
    );
  }
  return { stempel: s, empfaenger, pflicht, vorlage };
}

/* ---------- Lage auf der Seite (#799): eine Rechnung für PDF und Vorschau ---------- */

export interface StempelZeile {
  text: string;
  x: number;
  y: number;
  breite: number;
}
export interface StempelLayout {
  /** Mitte des Stempels auf der sichtbaren Seite (Ursprung oben links, y nach unten), in pt. */
  cx: number;
  cy: number;
  /** Drehung um die Mitte, Grad im Uhrzeigersinn. */
  winkel: number;
  /** Schriftgröße in pt. */
  groesse: number;
  /** Zeilen relativ zur Mitte: x links, y Grundlinie (nach unten). */
  zeilen: StempelZeile[];
  /** Rahmen (Ecke, Stempel): Breite und Höhe um die Mitte; `doppelt` bei der Lage „Stempel“. */
  rahmen: { b: number; h: number; doppelt: boolean } | null;
}

/**
 * Wo und wie groß der Stempel auf einer sichtbaren Seite von `w`×`h` pt sitzt. `breite` misst eine Zeile in
 * fetter Helvetica bei einer Schriftgröße (im PDF die echte Schrift, in der Vorschau eine Näherung im Browser).
 */
export function stempelLayout(
  s: Stempel,
  text: string,
  w: number,
  h: number,
  breite: (zeile: string, groesse: number) => number,
): StempelLayout {
  const zeilen = text.split('\n').filter((z) => z.trim());
  const f = s.groesse / 100;
  const breiteste = (g: number) => Math.max(1, ...zeilen.map((z) => breite(z, g)));
  const passend = (max: number, platz: number, min = 6) => Math.max(min, Math.min(max, (max * platz) / breiteste(max)));
  const rand = Math.max(18, Math.min(w, h) * 0.04);
  const n = Math.max(1, zeilen.length);
  const hoeheBei = (g: number) => g + (n - 1) * g * 1.2;
  const mitHoehe = (g: number, platz: number) => Math.min(g, (g * platz) / hoeheBei(g));
  let g: number,
    cx: number,
    cy: number,
    winkel = s.drehung,
    rahmen: StempelLayout['rahmen'] = null;
  if (s.lage === 'diagonal') {
    const laenge = Math.hypot(w, h);
    // Mehrere Zeilen liegen quer zur Diagonale: Block nicht höher als ein gutes Drittel der Seite, sonst ragen die Enden hinaus.
    g = mitHoehe(passend(110 * f, laenge * Math.min(0.95, 0.75 * f), 10), Math.min(w, h) * (n > 1 ? 0.35 : 0.6));
    cx = w / 2;
    cy = h / 2;
    winkel = -(Math.atan2(h, w) * 180) / Math.PI;
  } else if (s.lage === 'kopf' || s.lage === 'fuss') {
    g = mitHoehe(passend(14 * f, w - 2 * rand), h * 0.3);
    cx = w / 2;
    cy = s.lage === 'kopf' ? rand + hoeheBei(g) / 2 : h - rand - hoeheBei(g) / 2;
  } else {
    const stempel = s.lage === 'stempel';
    g = mitHoehe(passend((stempel ? 14 : 13) * f, w * (stempel ? 0.6 : 0.45)), h * 0.4);
    const pad = g * (stempel ? 0.7 : 0.5);
    const b = breiteste(g) + 2 * pad,
      hh = hoeheBei(g) + 2 * pad;
    rahmen = { b, h: hh, doppelt: stempel };
    if (stempel) {
      // Frei platziert, aber nicht über den Rand hinaus (ungedreht gerechnet).
      cx = Math.min(w - b / 2, Math.max(b / 2, s.x * w));
      cy = Math.min(h - hh / 2, Math.max(hh / 2, s.y * h));
    } else {
      cx = w - rand - b / 2;
      cy = rand + hh / 2;
    }
  }
  // Grundlinie: Zeilen um die Mitte verteilt, Versalhöhe (≈ 0,72 g) mittig.
  const hoehe = hoeheBei(g);
  const z = zeilen.map((t, i) => {
    const b = breite(t, g);
    return { text: t, x: -b / 2, y: -hoehe / 2 + g * 0.86 + i * g * 1.2, breite: b };
  });
  return { cx, cy, winkel, groesse: g, zeilen: z, rahmen };
}
