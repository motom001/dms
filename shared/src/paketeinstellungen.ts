import { t } from './texte';
import { SCHLUESSEL } from './kennungen';
/**
 * Einstellungen von Paketen (#197): Das Paket beschreibt sie im Manifest (code.einstellungen,
 * code.aktionen; Format: motom001/dms-registry), das DMS baut daraus ein Formular, prüft und speichert.
 * Höchstens zwei Ebenen: Abschnitte mit Feldern und Listen gleich aufgebauter Einträge.
 * Server und Oberfläche teilen diese Datei.
 */

export const EINSTELLUNG_TYPEN = {
  text: t('gemeinsam.paketeinstellungen.text'),
  mehrzeilig: t('gemeinsam.paketeinstellungen.mehrzeiliger-text'),
  zahl: 'Zahl',
  janein: 'Ja/Nein',
  datum: 'Datum',
  auswahl: 'Auswahl',
  mehrfachauswahl: 'Mehrfachauswahl',
  geheim: 'Geheimnis',
  mappentyp: 'Mappentyp',
  feld: 'Feld eines Mappentyps',
  benutzer: 'Benutzer',
  rolle: 'Rolle',
  sicht: 'Ansicht',
  adresse: t('gemeinsam.paketeinstellungen.dienst-adresse'),
  // Feldarten des Kerns (#996): Das Paket nennt sie im Manifest, Ablago kennt Wert, Darstellung und Speicherort.
  ki_mappentypen: 'Mappentypen für KI-Dienste',
  fragen_grenzen: 'Grenzen für „Frag deine Ablage“',
  erkennung_standard: 'Standard für „Aus Dokument ausfüllen“',
  mappenaktionen: 'Aktionen im Menü „Mappe“',
} as const;
export type EinstellungTyp = keyof typeof EINSTELLUNG_TYPEN;
/**
 * Feldarten des Kerns (#996): Einstellungen, die Ablago selbst hält (gelten teils für alle Pakete einer Art). Sie stehen
 * im Reiter „Einstellungen“ wie jedes andere Feld, werden aber nicht in den Paketeinstellungen gespeichert, sondern
 * dort, wo der Kern sie liest. Ohne Angabe im Manifest hängt Ablago sie an (siehe paketreiter.ts).
 */
export const KERN_TYPEN = [
  'ki_mappentypen',
  'fragen_grenzen',
  'erkennung_standard',
  'mappenaktionen',
] as const satisfies readonly EinstellungTyp[];
export type KernTyp = (typeof KERN_TYPEN)[number];
export const istKernFeld = (f: Pick<EinstellungFeld, 'typ'>): f is EinstellungFeld & { typ: KernTyp } =>
  (KERN_TYPEN as readonly string[]).includes(f.typ);
/** Prüfregeln (#996): Länge höchstens so viele Zeichen, Muster höchstens so lang. */
export const MUSTER_MAX = 300;
export const MELDUNG_MAX = 200;
const VERWEISE: EinstellungTyp[] = ['mappentyp', 'feld', 'benutzer', 'rolle', 'sicht'];
/** Verweise, die es auch als Mehrfachauswahl gibt (#658): gespeichert als Liste von Ids. */
export const MEHRFACH_VERWEISE: EinstellungTyp[] = ['mappentyp', 'benutzer', 'rolle', 'sicht'];

export interface EinstellungFeld {
  schluessel: string;
  name: string;
  typ: EinstellungTyp;
  hilfe?: string;
  pflicht?: boolean;
  standard?: unknown;
  optionen?: string[];
  min?: number;
  max?: number;
  /** Beim Typ feld: Mappentyp (lokal oder <paket>:<schluessel>), aus dem ein Feld gewählt wird. */
  mappentyp?: string;
  /** Beim Typ adresse (#444): Beispiel im leeren Feld, z. B. „http://ollama:11434/v1“ – nie ein gespeicherter Wert. */
  beispiel?: string;
  /** Beim Typ zahl (#657): Schrittweite (z. B. 1 = nur ganze Zahlen) und Vorschläge mit Beschriftung als Auswahl. */
  schritt?: number;
  vorschlaege?: ZahlVorschlag[];
  /** Verweis als Mehrfachauswahl wie bei Verweisfeldern (#658): Wert ist eine Liste von Ids. */
  mehrfach?: true;
  /** Gegenseitiger Ausschluss (#658): Was in diesem Feld gewählt ist, steht im genannten Feld nicht zur Wahl (und umgekehrt). */
  schliesstAus?: string;
  /** Prüfregeln (#996) bei text und mehrzeilig: Länge in Zeichen; nur bei text ein Muster (Regex) mit eigener Meldung. */
  laengeMin?: number;
  laengeMax?: number;
  muster?: string;
  meldung?: string;
}

/** Meldung, wenn ein Text nicht zu den Prüfregeln passt (#996) – dieselbe im Formular und auf dem Server. */
export function textFehler(f: Pick<EinstellungFeld, 'laengeMin' | 'laengeMax' | 'muster' | 'meldung'>, v: string): string | null {
  const n = [...v].length;
  if (f.laengeMin !== undefined && n < f.laengeMin) return t('gemeinsam.paketeinstellungen.laenge-mindestens', { anzahl: f.laengeMin });
  if (f.laengeMax !== undefined && n > f.laengeMax) return t('gemeinsam.paketeinstellungen.laenge-hoechstens', { anzahl: f.laengeMax });
  if (f.muster && v && !passtMuster(f.muster, v)) return f.meldung || t('gemeinsam.paketeinstellungen.muster-passt-nicht');
  return null;
}
/** Passt der ganze Wert zum Muster? Ein Muster, das sich nicht übersetzen lässt, passt nie. */
function passtMuster(muster: string, v: string): boolean {
  try {
    return new RegExp(`^(?:${muster})$`, 'u').test(v);
  } catch {
    return false;
  }
}
/** Ein Vorschlag für eine Zahl (#657), z. B. { wert: 300, name: "normal – empfohlen" }. */
export interface ZahlVorschlag {
  wert: number;
  name: string;
}

/** Meldung, wenn eine Zahl nicht passt (#657) – dieselbe im Formular und auf dem Server. */
export function zahlFehler(f: Pick<EinstellungFeld, 'min' | 'max' | 'schritt'>, v: unknown): string | null {
  const roh = typeof v === 'number' ? String(v) : String(v ?? '').trim();
  const n = typeof v === 'number' ? v : /^-?\d+([.,]\d+)?$/.test(roh) ? Number(roh.replace(',', '.')) : NaN;
  const bereich =
    f.min !== undefined && f.max !== undefined
      ? t('gemeinsam.paketeinstellungen.bitte-eine-zahl-zwischen', { zahlText: zahlText(f.min), zahlText2: zahlText(f.max) })
      : f.min !== undefined
        ? t('gemeinsam.paketeinstellungen.bitte-eine-zahl-ab', { zahlText: zahlText(f.min) })
        : f.max !== undefined
          ? t('gemeinsam.paketeinstellungen.bitte-eine-zahl-bis', { zahlText: zahlText(f.max) })
          : t('gemeinsam.paketeinstellungen.bitte-eine-zahl');
  if (!Number.isFinite(n)) return bereich;
  if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) return bereich;
  if (f.schritt && Math.abs(Math.round((n - (f.min ?? 0)) / f.schritt) * f.schritt - (n - (f.min ?? 0))) > 1e-9) {
    return t('gemeinsam.paketeinstellungen.bitte-in-schritten-von', { anzahl: f.schritt, zahlText: zahlText(f.schritt) });
  }
  return null;
}
const zahlText = (n: number) => String(n).replace('.', ',');

/**
 * Dienst-Adresse (#444): Ein Paket mit Code darf zusätzlich zu `code.netz` nur zu der Adresse ins Netz, die der
 * Administrator in dieser Einstellung einträgt und bestätigt. http ist erlaubt (Dienste im Heimnetz wie Ollama);
 * keine Zugangsdaten, keine Parameter. Höchstens eine je Paket, nur in Abschnitten, ohne Vorgabe.
 */
export const ADRESSE_MAX = 500;
export function pruefeAdresse(v: string): string | null {
  if (v.length > ADRESSE_MAX) return t('gemeinsam.paketeinstellungen.zu-lang');
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return 'Keine gültige Adresse – z. B. http://ollama:11434/v1.';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Nur http:// oder https://.';
  if (u.username || u.password) return t('gemeinsam.paketeinstellungen.bitte-ohne-zugangsdaten-in');
  if (u.search || u.hash) return t('gemeinsam.paketeinstellungen.bitte-ohne-und-in');
  return null;
}
/** Die Einstellungen vom Typ adresse (Abschnitte). */
export const adressfelder = (b: Einstellungsbeschreibung) => abschnittsfelder(b).filter((f) => f.typ === 'adresse');
export type EinstellungBlock =
  | { art: 'abschnitt'; titel: string; hilfe?: string; felder: EinstellungFeld[] }
  | { art: 'liste'; schluessel: string; name: string; eintrag: string; hilfe?: string; sortierbar: boolean; felder: EinstellungFeld[] };
export interface PaketAktion {
  schluessel: string;
  name: string;
  hilfe?: string;
  bestaetigen?: boolean;
}
export interface Einstellungsbeschreibung {
  bloecke: EinstellungBlock[];
  aktionen: PaketAktion[];
}

/** Gespeicherter Wert eines Felds vom Typ feld: Mappentyp-Id und Feldschlüssel. */
export interface FeldVerweis {
  typ: string;
  feld: string;
}
/** Geheimnis in der Oberfläche: nie der Wert, nur ob einer gesetzt ist. */
export interface GeheimStand {
  gesetzt: boolean;
}
/** Eingabe für ein Geheimnis: neuer Wert (Text), behalten oder löschen (null). */
export type GeheimEingabe = string | { behalten: true } | null;
/** Einträge einer Liste tragen eine feste Id, damit Geheimnisse beim Sortieren beim richtigen Eintrag bleiben. */
export const EINTRAG_ID = '_id';

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** Ganze Zahl ab 0 (Länge bei den Prüfregeln, #996). */
const ganz = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 0;
/** Muster nur bei text, nicht leer, höchstens MUSTER_MAX Zeichen (#996). */
const mitMuster = (f: Record<string, unknown>, typ: EinstellungTyp) =>
  typ === 'text' && typeof f.muster === 'string' && f.muster.length > 0 && f.muster.length <= MUSTER_MAX;
/** Merkt sich einen Schlüssel; ein zweites Mal ist ein Fehler. */
const einmal = (s: string, menge: Set<string>, wo: string, fehler: string[]) => {
  if (menge.has(s)) fehler.push(`${wo}: Schlüssel „${s}“ doppelt.`);
  menge.add(s);
};

/** Liest die Beschreibung aus code.einstellungen und code.aktionen; null = das Paket hat keine. */
export function liesBeschreibung(code: unknown): { beschreibung: Einstellungsbeschreibung | null; fehler: string[] } {
  const fehler: string[] = [];
  if (!istObjekt(code) || (!Array.isArray(code.einstellungen) && !Array.isArray(code.aktionen))) return { beschreibung: null, fehler };
  const bloecke = liesBloecke(code.einstellungen, fehler);
  pruefeBloecke(bloecke, fehler);
  const aktionen = liesAktionen(code.aktionen, fehler);
  return { beschreibung: { bloecke, aktionen }, fehler };
}

/** Ein Feld einer Einstellung; null = ungültig (Fehler steht dann in `fehler`). */
function liesFeld(f: unknown, wo: string, fehler: string[]): EinstellungFeld | null {
  if (!istObjekt(f)) {
    fehler.push(`${wo}: Feld ungültig.`);
    return null;
  }
  const typ = str(f.typ) as EinstellungTyp;
  if (!SCHLUESSEL.test(str(f.schluessel))) fehler.push(`${wo}: ungültiger Schlüssel „${str(f.schluessel)}“.`);
  if (!(typ in EINSTELLUNG_TYPEN)) {
    fehler.push(`${wo}/${str(f.schluessel)}: unbekannter Typ „${typ}“.`);
    return null;
  }
  const bei = `${wo}/${str(f.schluessel)}`;
  pruefeFeldArt(f, typ, bei, fehler);
  const vorschlaege = liesVorschlaege(f, typ, bei, fehler);
  pruefeFeldRegeln(f, typ, bei, fehler);
  return feldAus(f, typ, vorschlaege);
}

/** Auswahl braucht Optionen; Geheimnis und Dienst-Adresse haben keine Vorgabe. */
function pruefeFeldArt(f: Record<string, unknown>, typ: EinstellungTyp, bei: string, fehler: string[]) {
  if ((typ === 'auswahl' || typ === 'mehrfachauswahl') && !(Array.isArray(f.optionen) && f.optionen.length))
    fehler.push(`${bei}: ${typ} braucht optionen.`);
  if (typ === 'geheim' && f.standard !== undefined) fehler.push(`${bei}: geheim hat keine Vorgabe.`);
  // Dienst-Adresse (#444): nie voreingestellt – der Administrator trägt sie selbst ein und bestätigt sie.
  if (typ === 'adresse' && f.standard !== undefined)
    fehler.push(`${bei}: adresse hat keine Vorgabe (höchstens ein beispiel, das im leeren Feld steht).`);
  if (typ === 'adresse' && f.beispiel !== undefined && (typeof f.beispiel !== 'string' || pruefeAdresse(f.beispiel)))
    fehler.push(`${bei}: beispiel ist keine gültige Adresse.`);
}

/** Zahlen (#657): Schrittweite und Vorschläge; Vorschläge liegen in min/max, die Vorgabe ist einer davon. */
function liesVorschlaege(f: Record<string, unknown>, typ: EinstellungTyp, bei: string, fehler: string[]): ZahlVorschlag[] | undefined {
  let vorschlaege: ZahlVorschlag[] | undefined;
  if (f.schritt !== undefined && (typ !== 'zahl' || typeof f.schritt !== 'number' || !(f.schritt > 0)))
    fehler.push(`${bei}: schritt nur bei zahl, größer als 0.`);
  if (f.vorschlaege !== undefined) {
    if (typ !== 'zahl' || !Array.isArray(f.vorschlaege) || !f.vorschlaege.length)
      fehler.push(`${bei}: vorschlaege nur bei zahl, als Liste mit wert und name.`);
    else {
      vorschlaege = [];
      for (const x of f.vorschlaege) {
        if (!istObjekt(x) || typeof x.wert !== 'number' || !Number.isFinite(x.wert) || !str(x.name).trim()) {
          fehler.push(`${bei}: vorschlaege: jeder Eintrag braucht wert (Zahl) und name.`);
          continue;
        }
        if ((typeof f.min === 'number' && x.wert < f.min) || (typeof f.max === 'number' && x.wert > f.max))
          fehler.push(`${bei}: Vorschlag ${x.wert} liegt nicht zwischen min und max.`);
        vorschlaege.push({ wert: x.wert, name: str(x.name).trim().slice(0, 100) });
      }
      if (f.standard !== undefined && !vorschlaege.some((x) => x.wert === f.standard))
        fehler.push(`${bei}: standard muss einer der vorschlaege sein.`);
    }
  }
  return vorschlaege;
}

/** Mehrfach, gegenseitiger Ausschluss, Prüfregeln (#658, #996) und Feldarten des Kerns. */
function pruefeFeldRegeln(f: Record<string, unknown>, typ: EinstellungTyp, bei: string, fehler: string[]) {
  if (f.mehrfach !== undefined && (f.mehrfach !== true || !MEHRFACH_VERWEISE.includes(typ)))
    fehler.push(`${bei}: mehrfach: true gibt es nur bei ${MEHRFACH_VERWEISE.join(', ')}.`);
  if (f.schliesst_aus !== undefined && !SCHLUESSEL.test(str(f.schliesst_aus)))
    fehler.push(`${bei}: schliesst_aus nennt keinen gültigen Schlüssel.`);
  pruefeTextregeln(f, typ, bei, fehler);
  // Feldarten des Kerns (#996): ohne Vorgabe und Pflicht – den Wert hält Ablago.
  if ((KERN_TYPEN as readonly string[]).includes(typ) && (f.standard !== undefined || f.pflicht !== undefined))
    fehler.push(`${bei}: ${typ} hat keine Vorgabe und keine Pflicht – den Wert hält Ablago.`);
}

/** Prüfregeln (#996): Länge bei text/mehrzeilig, Muster nur bei text (kurze Werte), das Muster muss sich übersetzen lassen. */
function pruefeTextregeln(f: Record<string, unknown>, typ: EinstellungTyp, bei: string, fehler: string[]) {
  for (const k of ['laenge_min', 'laenge_max'] as const) {
    if (f[k] !== undefined && (!['text', 'mehrzeilig'].includes(typ) || !ganz(f[k])))
      fehler.push(`${bei}: ${k} nur bei text und mehrzeilig, als ganze Zahl ab 0.`);
  }
  if (ganz(f.laenge_min) && ganz(f.laenge_max) && (f.laenge_min as number) > (f.laenge_max as number))
    fehler.push(`${bei}: laenge_min ist größer als laenge_max.`);
  if (f.muster !== undefined) {
    let ok = mitMuster(f, typ);
    if (ok)
      try {
        new RegExp(f.muster as string, 'u');
      } catch {
        ok = false;
      }
    if (!ok) fehler.push(`${bei}: muster nur bei text, als gültiger regulärer Ausdruck (höchstens ${MUSTER_MAX} Zeichen).`);
  }
  if (f.meldung !== undefined && (f.muster === undefined || typeof f.meldung !== 'string' || f.meldung.length > MELDUNG_MAX))
    fehler.push(`${bei}: meldung nur zusammen mit muster, höchstens ${MELDUNG_MAX} Zeichen.`);
}

/** Das gelesene Feld: nur die Angaben, die zum Typ passen (in dieser Reihenfolge). */
const feldAus = (f: Record<string, unknown>, typ: EinstellungTyp, vorschlaege: ZahlVorschlag[] | undefined): EinstellungFeld => ({
  ...feldGrund(f, typ),
  ...feldZahl(f, typ, vorschlaege),
  ...feldVerweis(f, typ),
  ...feldText(f, typ),
});

/** Schlüssel, Name, Typ, Hilfe, Pflicht, Vorgabe, Beispiel und Optionen. */
function feldGrund(f: Record<string, unknown>, typ: EinstellungTyp): EinstellungFeld {
  return {
    schluessel: str(f.schluessel),
    name: str(f.name) || str(f.schluessel),
    typ,
    ...(f.hilfe ? { hilfe: str(f.hilfe) } : {}),
    ...(f.pflicht === true ? { pflicht: true } : {}),
    ...(f.standard !== undefined && typ !== 'geheim' && typ !== 'adresse' && !VERWEISE.includes(typ) ? { standard: f.standard } : {}),
    ...(typ === 'adresse' && typeof f.beispiel === 'string' ? { beispiel: f.beispiel } : {}),
    ...(Array.isArray(f.optionen) ? { optionen: f.optionen.map(str) } : {}),
  };
}

/** Grenzen, Schrittweite und Vorschläge (#657). */
const feldZahl = (f: Record<string, unknown>, typ: EinstellungTyp, vorschlaege: ZahlVorschlag[] | undefined): Partial<EinstellungFeld> => ({
  ...(typeof f.min === 'number' ? { min: f.min } : {}),
  ...(typeof f.max === 'number' ? { max: f.max } : {}),
  ...(typ === 'zahl' && typeof f.schritt === 'number' && f.schritt > 0 ? { schritt: f.schritt } : {}),
  ...(vorschlaege?.length ? { vorschlaege } : {}),
});

/** Mappentyp beim Feld-Verweis, Mehrfachauswahl und gegenseitiger Ausschluss (#658). */
const feldVerweis = (f: Record<string, unknown>, typ: EinstellungTyp): Partial<EinstellungFeld> => ({
  ...(typ === 'feld' && f.mappentyp ? { mappentyp: str(f.mappentyp) } : {}),
  ...(f.mehrfach === true && MEHRFACH_VERWEISE.includes(typ) ? { mehrfach: true as const } : {}),
  ...(f.schliesst_aus !== undefined && SCHLUESSEL.test(str(f.schliesst_aus)) ? { schliesstAus: str(f.schliesst_aus) } : {}),
});

/** Prüfregeln für Texte (#996): Länge, Muster und Meldung. */
const feldText = (f: Record<string, unknown>, typ: EinstellungTyp): Partial<EinstellungFeld> => ({
  ...(['text', 'mehrzeilig'].includes(typ) && ganz(f.laenge_min) ? { laengeMin: f.laenge_min as number } : {}),
  ...(['text', 'mehrzeilig'].includes(typ) && ganz(f.laenge_max) ? { laengeMax: f.laenge_max as number } : {}),
  ...(mitMuster(f, typ)
    ? {
        muster: f.muster as string,
        ...(typeof f.meldung === 'string' && f.meldung ? { meldung: f.meldung.slice(0, MELDUNG_MAX) } : {}),
      }
    : {}),
});

/** Abschnitte und Listen aus `code.einstellungen`; Schlüssel je Ebene nur einmal. */
function liesBloecke(einstellungen: unknown, fehler: string[]): EinstellungBlock[] {
  const bloecke: EinstellungBlock[] = [];
  const oben = new Set<string>();
  for (const [i, b] of (Array.isArray(einstellungen) ? einstellungen : []).entries()) {
    if (!istObjekt(b)) continue;
    const felder = (Array.isArray(b.felder) ? b.felder : [])
      .map((f, j) => liesFeld(f, `einstellungen[${i + 1}].felder[${j + 1}]`, fehler))
      .filter((f): f is EinstellungFeld => !!f);
    if (b.liste !== undefined) {
      if (!SCHLUESSEL.test(str(b.liste)))
        fehler.push(t('gemeinsam.paketeinstellungen.einstellungen-ungueltiger-schluessel', { wert: i + 1 }));
      einmal(str(b.liste), oben, 'einstellungen', fehler);
      const innen = new Set<string>();
      for (const f of felder) einmal(f.schluessel, innen, `Liste ${str(b.liste)}`, fehler);
      for (const f of felder)
        if (istKernFeld(f)) fehler.push(`Liste ${str(b.liste)}/${f.schluessel}: ${f.typ} geht nur in einem Abschnitt.`);
      for (const f of felder)
        if (f.typ === 'adresse')
          fehler.push(t('gemeinsam.paketeinstellungen.liste-adresse-geht-nur', { str: str(b.liste), schluessel: f.schluessel }));
      bloecke.push({
        art: 'liste',
        schluessel: str(b.liste),
        name: str(b.name) || str(b.liste),
        eintrag: str(b.eintrag) || 'Eintrag',
        ...(b.hilfe ? { hilfe: str(b.hilfe) } : {}),
        sortierbar: b.sortierbar === true,
        felder,
      });
    } else {
      for (const f of felder) einmal(f.schluessel, oben, 'einstellungen', fehler);
      bloecke.push({ art: 'abschnitt', titel: str(b.abschnitt), ...(b.hilfe ? { hilfe: str(b.hilfe) } : {}), felder });
    }
  }
  return bloecke;
}

/** Über alle Blöcke: höchstens eine Dienst-Adresse, jede Feldart des Kerns einmal, schliesst_aus passend (#658). */
function pruefeBloecke(bloecke: EinstellungBlock[], fehler: string[]) {
  if (bloecke.flatMap((x) => (x.art === 'abschnitt' ? x.felder : [])).filter((f) => f.typ === 'adresse').length > 1)
    fehler.push(t('gemeinsam.paketeinstellungen.einstellungen-hoechstens-eine'));
  for (const k of KERN_TYPEN)
    if (bloecke.flatMap((x) => x.felder).filter((f) => f.typ === k).length > 1) fehler.push(`einstellungen: ${k} höchstens einmal.`);
  // schliesst_aus (#658): nur zwischen Feldern eines Abschnitts mit demselben Verweistyp.
  const oberste = bloecke.flatMap((x) => (x.art === 'abschnitt' ? x.felder : []));
  for (const x of bloecke)
    for (const f of x.felder) {
      if (!f.schliesstAus) continue;
      const g = oberste.find((y) => y.schluessel === f.schliesstAus);
      if (x.art !== 'abschnitt' || !g || g === f || g.typ !== f.typ || !MEHRFACH_VERWEISE.includes(f.typ))
        fehler.push(
          t('gemeinsam.paketeinstellungen.einstellungen-schliesst-aus-muss', {
            schluessel: f.schluessel,
            schliesstAus: f.schliesstAus,
            MEHRFACH_VERWEISE: MEHRFACH_VERWEISE.join(', '),
          }),
        );
    }
}

/** Aktionen aus `code.aktionen`; ungültige fallen mit Fehler weg. */
function liesAktionen(roh: unknown, fehler: string[]): PaketAktion[] {
  const aktionen: PaketAktion[] = [];
  const ak = new Set<string>();
  for (const a of Array.isArray(roh) ? roh : []) {
    if (!istObjekt(a) || !SCHLUESSEL.test(str(a.schluessel))) {
      fehler.push(t('gemeinsam.paketeinstellungen.aktionen-ungueltige-aktion'));
      continue;
    }
    einmal(str(a.schluessel), ak, 'aktionen', fehler);
    aktionen.push({
      schluessel: str(a.schluessel),
      name: str(a.name) || str(a.schluessel),
      ...(a.hilfe ? { hilfe: str(a.hilfe) } : {}),
      ...(a.bestaetigen === true ? { bestaetigen: true } : {}),
    });
  }
  return aktionen;
}

/** Alle Felder der obersten Ebene (Abschnitte) und die Listen. */
export const abschnittsfelder = (b: Einstellungsbeschreibung) => b.bloecke.flatMap((x) => (x.art === 'abschnitt' ? x.felder : []));
export const listen = (b: Einstellungsbeschreibung) =>
  b.bloecke.filter((x): x is Extract<EinstellungBlock, { art: 'liste' }> => x.art === 'liste');

/** Vorgaben: Felder mit standard; Listen leer. */
export function vorgaben(b: Einstellungsbeschreibung): Record<string, unknown> {
  const w: Record<string, unknown> = {};
  for (const f of abschnittsfelder(b)) if (f.standard !== undefined) w[f.schluessel] = f.standard;
  for (const l of listen(b)) w[l.schluessel] = [];
  return w;
}

/**
 * Nach einem Update: neue Felder bekommen ihre Vorgabe, vorhandene Werte bleiben, wegfallende
 * Felder (auch in Listeneinträgen) werden entfernt.
 */
export function ueberfuehre(b: Einstellungsbeschreibung, alt: Record<string, unknown>): { werte: Record<string, unknown>; weg: string[] } {
  const werte = vorgaben(b);
  const weg: string[] = [];
  const oben = new Set([...abschnittsfelder(b).map((f) => f.schluessel), ...listen(b).map((l) => l.schluessel)]);
  for (const [k, v] of Object.entries(alt)) {
    if (!oben.has(k)) {
      weg.push(k);
      continue;
    }
    const l = listen(b).find((x) => x.schluessel === k);
    // Aus einer Liste mit einem Verweisfeld wird eine Mehrfachauswahl (#658): Einträge → Ids, nichts geht verloren.
    const mf = abschnittsfelder(b).find((f) => f.schluessel === k && f.mehrfach);
    if (!l && mf && Array.isArray(v) && v.some(istObjekt)) {
      werte[k] = [
        ...new Set(
          v.flatMap((e) =>
            istObjekt(e)
              ? Object.entries(e)
                  .filter(([ek, ev]) => ek !== EINTRAG_ID && typeof ev === 'string' && ev)
                  .map(([, ev]) => String(ev))
                  .slice(0, 1)
              : typeof e === 'string'
                ? [e]
                : [],
          ),
        ),
      ];
      continue;
    }
    if (!l) {
      werte[k] = v;
      continue;
    }
    const keys = new Set([EINTRAG_ID, ...l.felder.map((f) => f.schluessel)]);
    werte[k] = (Array.isArray(v) ? v : []).filter(istObjekt).map((e) => {
      const n: Record<string, unknown> = {};
      for (const [ek, ev] of Object.entries(e)) {
        if (keys.has(ek)) n[ek] = ev;
        else if (!weg.includes(`${k}.${ek}`)) weg.push(`${k}.${ek}`);
      }
      for (const f of l.felder) if (!(f.schluessel in n) && f.standard !== undefined) n[f.schluessel] = f.standard;
      return n;
    });
  }
  return { werte, weg };
}

/** Welche Felder in einer neuen Beschreibung gegenüber einer alten dazukommen bzw. wegfallen (für die Vorschau). */
export function einstellungsAenderung(
  alt: Einstellungsbeschreibung | null,
  neu: Einstellungsbeschreibung | null,
): { neu: string[]; weg: string[] } {
  const namen = (b: Einstellungsbeschreibung | null) =>
    new Map(
      b
        ? [
            ...abschnittsfelder(b).map((f) => [f.schluessel, f.name] as const),
            ...listen(b).flatMap((l) => [
              [l.schluessel, l.name] as const,
              ...l.felder.map((f) => [`${l.schluessel}.${f.schluessel}`, `${l.name} › ${f.name}`] as const),
            ]),
          ]
        : [],
    );
  const a = namen(alt),
    n = namen(neu);
  return { neu: [...n].filter(([k]) => !a.has(k)).map(([, v]) => v), weg: [...a].filter(([k]) => !n.has(k)).map(([, v]) => v) };
}

const leer = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

/** Pflichtfelder ohne Wert (lesbar); Geheimnisse zählen als gesetzt, wenn ein verschlüsselter Wert da ist. */
export function fehlendePflicht(b: Einstellungsbeschreibung, werte: Record<string, unknown>): string[] {
  const erg: string[] = [];
  for (const f of abschnittsfelder(b)) if (f.pflicht && leer(werte[f.schluessel])) erg.push(f.name);
  for (const l of listen(b)) {
    for (const [i, e] of (Array.isArray(werte[l.schluessel]) ? (werte[l.schluessel] as Record<string, unknown>[]) : []).entries()) {
      for (const f of l.felder) if (f.pflicht && leer(e?.[f.schluessel])) erg.push(`${l.eintrag} ${i + 1} › ${f.name}`);
    }
  }
  return erg;
}

/** Was es im DMS gibt – zum Prüfen der Verweise. */
export interface Verweisquelle {
  typen: Array<{ id: string; felder: Array<{ key: string }> }>;
  benutzer: string[];
  rollen: string[];
  sichten: string[];
  /** Mappentyp-Verweis aus dem Manifest (lokal oder <paket>:<schluessel>) → Id; null = unbekannt. */
  typVon(verweis: string): string | null;
}

/**
 * Prüft die Eingabe gegen die Beschreibung: Typ, Pflicht, Auswahlwerte, Grenzen, ob Verweise existieren.
 * Geheimnisse bleiben, wie sie kommen (Text, {behalten}, null) – verschlüsselt wird auf dem Server.
 * Fehler je Feld: „schluessel“ bzw. „liste.<nr>.schluessel“ (nr ab 1).
 */
export function pruefeWerte(
  b: Einstellungsbeschreibung,
  eingabe: unknown,
  q: Verweisquelle,
): { werte: Record<string, unknown>; fehler: Record<string, string> } {
  const e = istObjekt(eingabe) ? eingabe : {};
  const fehler: Record<string, string> = {};
  const werte: Record<string, unknown> = {};
  const eins = (f: EinstellungFeld, v: unknown, pfad: string): unknown => {
    if (f.typ === 'geheim') {
      if (v === null || v === undefined || v === '') return null;
      if (istObjekt(v) && v.behalten === true) return { behalten: true };
      if (typeof v !== 'string') {
        fehler[pfad] = t('gemeinsam.paketeinstellungen.ungueltiger-wert');
        return null;
      }
      return v;
    }
    if (leer(v)) {
      if (f.pflicht) fehler[pfad] = 'Pflichtfeld.';
      return f.typ === 'mehrfachauswahl' || f.mehrfach ? [] : null;
    }
    // Verweise als Mehrfachauswahl (#658): jede Id muss es geben.
    if (f.mehrfach) {
      const l = [...new Set((Array.isArray(v) ? v : [v]).map(String))].slice(0, 500);
      const gibt = (x: string) =>
        f.typ === 'mappentyp'
          ? q.typen.some((t) => t.id === x)
          : f.typ === 'benutzer'
            ? q.benutzer.includes(x)
            : f.typ === 'rolle'
              ? q.rollen.includes(x)
              : q.sichten.includes(x);
      if (l.some((x) => !gibt(x))) {
        fehler[pfad] =
          {
            mappentyp: t('gemeinsam.paketeinstellungen.einen-der-mappentypen-gibt'),
            benutzer: t('gemeinsam.paketeinstellungen.einen-der-benutzer-gibt'),
            rolle: t('gemeinsam.paketeinstellungen.eine-der-rollen-gibt'),
            sicht: t('gemeinsam.paketeinstellungen.eine-der-ansichten-gibt'),
          }[f.typ as 'mappentyp'] ?? t('gemeinsam.paketeinstellungen.ungueltiger-wert');
        return [];
      }
      return l;
    }
    switch (f.typ) {
      case 'text':
      case 'mehrzeilig': {
        if (typeof v !== 'string') {
          fehler[pfad] = t('gemeinsam.paketeinstellungen.text-erwartet');
          return null;
        }
        if (v.length > (f.typ === 'text' ? 500 : 10000)) {
          fehler[pfad] = t('gemeinsam.paketeinstellungen.zu-lang');
          return null;
        }
        const falsch = textFehler(f, f.typ === 'text' ? v.trim() : v);
        if (falsch) {
          fehler[pfad] = falsch;
          return null;
        }
        return f.typ === 'text' ? v.trim() : v;
      }
      case 'adresse': {
        const a = typeof v === 'string' ? v.trim() : '';
        const falsch = typeof v !== 'string' ? t('gemeinsam.paketeinstellungen.text-erwartet') : pruefeAdresse(a);
        if (falsch) {
          fehler[pfad] = falsch;
          return null;
        }
        return a;
      }
      case 'zahl': {
        // Nur Ziffern (ggf. Komma), in min/max und Schrittweite (#657) – dieselbe Prüfung wie im Formular.
        const falsch = zahlFehler(f, v);
        if (falsch) {
          fehler[pfad] = falsch;
          return null;
        }
        return typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
      }
      case 'janein':
        return v === true || v === 'true';
      case 'datum':
        if (typeof v !== 'string' || !DATUM.test(v) || Number.isNaN(Date.parse(v))) {
          fehler[pfad] = t('gemeinsam.paketeinstellungen.kein-datum');
          return null;
        }
        return v;
      case 'auswahl':
        if (!f.optionen?.includes(String(v))) {
          fehler[pfad] = t('gemeinsam.paketeinstellungen.steht-nicht-zur-auswahl', { v: String(v) });
          return null;
        }
        return String(v);
      case 'mehrfachauswahl': {
        const l = (Array.isArray(v) ? v : [v]).map(String);
        const falsch = l.filter((x) => !f.optionen?.includes(x));
        if (falsch.length) {
          fehler[pfad] = t('gemeinsam.paketeinstellungen.steht-nicht-zur-auswahl-2', { falsch: falsch[0] });
          return null;
        }
        return [...new Set(l)];
      }
      case 'mappentyp':
        if (!q.typen.some((t) => t.id === v)) {
          fehler[pfad] = t('gemeinsam.paketeinstellungen.diesen-mappentyp-gibt-es');
          return null;
        }
        return v;
      case 'benutzer':
        if (!q.benutzer.includes(String(v))) {
          fehler[pfad] = t('gemeinsam.paketeinstellungen.diesen-benutzer-gibt-es');
          return null;
        }
        return v;
      case 'rolle':
        if (!q.rollen.includes(String(v))) {
          fehler[pfad] = t('gemeinsam.paketeinstellungen.diese-rolle-gibt-es');
          return null;
        }
        return v;
      case 'sicht':
        if (!q.sichten.includes(String(v))) {
          fehler[pfad] = t('gemeinsam.paketeinstellungen.diese-ansicht-gibt-es');
          return null;
        }
        return v;
      case 'feld': {
        const x = v as Partial<FeldVerweis>;
        const soll = f.mappentyp ? q.typVon(f.mappentyp) : null;
        const typ = q.typen.find((t) => t.id === x?.typ);
        if (!typ || !typ.felder.some((g) => g.key === x?.feld) || (f.mappentyp && typ.id !== soll)) {
          fehler[pfad] = t('gemeinsam.paketeinstellungen.dieses-feld-gibt-es');
          return null;
        }
        return { typ: typ.id, feld: String(x.feld) };
      }
    }
    return null;
  };
  for (const f of abschnittsfelder(b)) if (!istKernFeld(f)) werte[f.schluessel] = eins(f, e[f.schluessel], f.schluessel);
  // Gegenseitiger Ausschluss (#658): dieselbe Kennung nicht in beiden Feldern.
  const ids = (v: unknown) => (Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)]);
  for (const f of abschnittsfelder(b)) {
    const g = f.schliesstAus ? abschnittsfelder(b).find((x) => x.schluessel === f.schliesstAus) : undefined;
    if (!g || fehler[f.schluessel]) continue;
    if (ids(werte[f.schluessel]).some((x) => ids(werte[g.schluessel]).includes(x)))
      fehler[f.schluessel] = t('gemeinsam.paketeinstellungen.steht-auch-in-beides', { name: g.name });
  }
  for (const l of listen(b)) {
    const roh = Array.isArray(e[l.schluessel]) ? (e[l.schluessel] as unknown[]).filter(istObjekt).slice(0, 500) : [];
    werte[l.schluessel] = roh.map((x, i) => {
      const n: Record<string, unknown> = {
        [EINTRAG_ID]:
          typeof x[EINTRAG_ID] === 'string' && x[EINTRAG_ID]
            ? String(x[EINTRAG_ID]).slice(0, 64)
            : `e${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 6)}`,
      };
      for (const f of l.felder) n[f.schluessel] = eins(f, x[f.schluessel], `${l.schluessel}.${i + 1}.${f.schluessel}`);
      return n;
    });
  }
  return { werte, fehler };
}
