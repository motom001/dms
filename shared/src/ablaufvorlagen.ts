/**
 * Automatisierungsvorlagen und Mappen-Abläufe (#1044): eine Automatisierung mit Lücken, die man an **einer** Mappe
 * anwendet. „Aufgabe vergeben“ und „Erinnern“ sind solche Vorlagen – es gibt keine getrennte Erinnerungs- und
 * Aufgabentechnik mehr.
 *
 * - **Wann** (die Wenn-Karte der Vorlage): sofort, am Datum, das man beim Anwenden angibt, oder in N Tagen, Wochen bzw.
 *   Monaten – fest oder, mit der Frage „Datum“, als änderbarer Vorschlag (#1180).
 * - **Karten** (Dann): nur aus der erlaubten Liste {@link VORLAGEN_KARTEN} – Aufgabe oder Benachrichtigung. Keine Karte
 *   schickt Daten nach außen (keine E-Mail an frei eingegebene Adressen, kein Adressaufruf); das gilt auch für Vorlagen
 *   aus Paketen und für deren Updates (Sicherheit).
 * - **Fragt beim Anwenden** ({@link FRAGEN}): Empfänger, Text, Datum. Der Text ist von Hand geschrieben und bleibt für
 *   den Empfänger sichtbar wie bisher; Platzhalter der Vorlage füllt der Motor mit den Rechten des Empfängers (#795).
 * - Ein **Mappen-Ablauf** ist eine angewendete Vorlage, die noch nicht gelaufen ist (früher: freie Erinnerung). Er läuft
 *   mit den Rechten der Person, die ihn angelegt hat – geprüft zur Laufzeit, nie mit mehr. Ist er gelaufen, verschwindet
 *   er; was passiert ist, steht in der Historie der Mappe und im Verlauf der Vorlage.
 *
 * Kern-Vorgaben ({@link KERN_VORLAGEN}): „Aufgabe vergeben“ und „Erinnern“ funktionieren auch ohne Paket. Ein Paket
 * (Benachrichtigungen) kann sie mit `ersetzt` überlagern; wird es entfernt, gilt wieder die Vorgabe des Kerns. Abläufe
 * nennen ihre Vorlage über die Kennung – so bleiben sie gültig, egal wer die Vorlage gerade liefert.
 */
import { VORLAUF_EINHEITEN, type VorlaufEinheit } from './fristen';
import { einzigesZiel, jedeMappe, zieleVon, type Mappentyp } from './model';
import { verschiebe } from './sichten';
import { t } from './texte';

/** Ab dieser Version von Ablago dürfen Pakete Automatisierungsvorlagen mitbringen (`inhalt.ablaufvorlagen`). */
export const DMS_ABLAUFVORLAGEN_AB = '0.256.0';

/** Kennungen der Kern-Vorgaben: gibt es immer, auch ohne Paket. */
export const KERN_VORLAGEN = ['aufgabe_vergeben', 'erinnern'] as const;
export type KernVorlage = (typeof KERN_VORLAGEN)[number];
export const istKernVorlage = (k: unknown): k is KernVorlage => typeof k === 'string' && (KERN_VORLAGEN as readonly string[]).includes(k);

/** Was eine Vorlage beim Anwenden fragen kann. */
export const FRAGEN = ['empfaenger', 'datum', 'text'] as const;
export type Frage = (typeof FRAGEN)[number];

/** Erlaubte Karten (Sicherheit): nur Aufgabe bzw. Benachrichtigung – auch für Vorlagen aus Paketen. */
export const VORLAGEN_KARTEN = ['aufgabe'] as const;

/** Grenzen der Vorlagen (Länge der Texte, Karten); die Bremse je Person und Mappe steht in server/src/grenzen.ts. */
export const VORLAGEN_GRENZEN = { vorlagen: 100, name: 120, beschreibung: 1000, text: 2000, eingabe: 2000, karten: 5, empfaenger: 5, anzahl: 120 } as const;
/** Reihenfolge im Menü „Mappe“ (1–99; kleiner = weiter oben). */
export const VORLAGEN_REIHENFOLGE = { min: 1, max: 99, eigen: 50, paket: 30 } as const;

/** Wann die Vorlage läuft: sofort, am beim Anwenden gewählten Datum, oder in N Tagen/Wochen/Monaten. */
export type AblaufWann = { art: 'sofort' } | { art: 'datum' } | { art: 'in'; anzahl: number; einheit: VorlaufEinheit };

/**
 * Empfänger einer Karte: die beim Anwenden gewählte Person (`frage`), wer die Vorlage anwendet (`selbst`), die Person(en)
 * in einem Feld der Mappe (sonst wer anwendet) oder wer die Mappe angelegt hat. Feste Personen oder Rollen gibt es nicht –
 * eine Vorlage gilt für alle, die sie anwenden.
 */
export type VorlagenEmpfaenger = { art: 'frage' } | { art: 'selbst' } | { art: 'feld'; feld: string } | { art: 'ersteller' };

/** Karte „Aufgabe / Benachrichtigung“ – dieselbe wie in Automatisierungen, mit den Empfängern einer Vorlage. */
export interface VorlagenKarte {
  id: string; art: 'aufgabe'; als: 'aufgabe' | 'benachrichtigung';
  empfaenger: VorlagenEmpfaenger[];
  /** Text mit Platzhaltern wie beim Mappentitel, dazu {eingabe} (der Text beim Anwenden), {person} und {empfaenger}. */
  text: string;
}

export interface AblaufvorlageDaten {
  name: string;
  beschreibung: string;
  reihenfolge: number;
  /** Mappentypen, an denen sie im Menü „Mappe“ steht; leer = alle. */
  typen: string[];
  wann: AblaufWann;
  fragen: Frage[];
  karten: VorlagenKarte[];
}

export type VorlagenHerkunft = 'kern' | 'eigen' | 'paket';

export interface Ablaufvorlage extends AblaufvorlageDaten {
  kennung: string;
  aktiv: boolean;
  herkunft: VorlagenHerkunft;
  /** Paket, das sie liefert (auch als Überlagerung einer Kern-Vorgabe). */
  paketId: string | null;
  /** Fortlaufende Fassung (0 = unveränderte Kern-Vorgabe ohne gespeicherten Stand). */
  version: number;
  geaendert: string | null; geaendertVon: string | null;
}

/** Ansicht in der Werkbank: dazu Kurzform, Zahl der offenen Abläufe und was nicht passt. */
export interface AblaufvorlageAnsicht extends Ablaufvorlage { kurz: string; offen: number; angehalten: number; probleme: string[]; ueberlagert?: string | null }

/** Für das Menü „Mappe“ und den kleinen Dialog. */
export interface VorlageZumAnwenden { kennung: string; name: string; beschreibung: string; wann: AblaufWann; fragen: Frage[]; reihenfolge: number }

/** Warum ein Ablauf angehalten ist (Sicherheit: Rechte zur Laufzeit). */
export interface AblaufAngehalten { grund: 'person' | 'deaktiviert' | 'leserecht' | 'vorlage'; text: string; zeit: string }

/** Ein offener Mappen-Ablauf (früher: freie Erinnerung, #131) – bis er läuft. */
export interface MappenAblauf {
  id: string;
  /** Kennung der Vorlage (`erinnern`, `benachrichtigungen:wiedervorlage`, `eigen:…`). */
  vorlage: string;
  mappeId: string;
  /** Antwort auf „Empfänger“ (sonst null). */
  empfaengerId: string | null;
  /** Wann er läuft. */
  datum: string;
  /** Antwort auf „Text“ (sonst leer). */
  text: string;
  erstellt: string;
  /** Die Person, mit deren Rechten er läuft. */
  erstelltVon: string | null;
  angehalten: AblaufAngehalten | null;
  /** Für Listen. */
  mappeTitel?: string; typId?: string; vorlageName?: string;
}

/** Eintrag im Verlauf einer Vorlage. */
export interface AblaufVerlauf {
  id: string; vorlage: string; mappeId: string | null; ablaufId: string | null; personId: string | null; zeit: string;
  art: 'angewendet' | 'geplant' | 'gelaufen' | 'angehalten' | 'geloescht' | 'fortgesetzt';
  text: string;
}

/** Antworten beim Anwenden. */
export interface AblaufAntworten { empfaengerId?: unknown; datum?: unknown; text?: unknown }

/**
 * Ausprobieren (#1176): was ein Empfänger sähe – Aufgabe oder Benachrichtigung, an wen, mit welchem Text und (bei einer
 * Aufgabe, die später läuft) an welchem Tag sie fällig wird; `hinweis`, wenn er die Mappe nicht oder nicht ganz sieht.
 */
export interface AblaufProbe { als: 'aufgabe' | 'benachrichtigung'; an: string; text: string; datum: string | null; hinweis?: string }

/* ---------- Kern-Vorgaben ---------- */

/**
 * Die Kern-Vorgaben mit ihrem heutigen Verhalten: „Aufgabe vergeben“ fragt Empfänger und Text und legt sofort eine
 * Aufgabe an; „Erinnern“ fragt Datum, Empfänger und Text und legt am Datum eine Aufgabe „Erinnerung“ an.
 */
export function kernVorlage(k: KernVorlage): AblaufvorlageDaten {
  const karte: VorlagenKarte = { id: 'a1', art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'frage' }], text: '{eingabe}' };
  return k === 'aufgabe_vergeben'
    ? { name: t('gemeinsam.ablaufvorlagen.kern.aufgabe-vergeben'), beschreibung: t('gemeinsam.ablaufvorlagen.kern.aufgabe-vergeben.text'), reihenfolge: 10, typen: [], wann: { art: 'sofort' }, fragen: ['empfaenger', 'text'], karten: [karte] }
    : { name: t('gemeinsam.ablaufvorlagen.kern.erinnern'), beschreibung: t('gemeinsam.ablaufvorlagen.kern.erinnern.text'), reihenfolge: 20, typen: [], wann: { art: 'datum' }, fragen: ['datum', 'empfaenger', 'text'], karten: [karte] };
}

/* ---------- Bereinigen und prüfen ---------- */

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const FELDKEY = /^[a-z][a-z0-9_]{0,59}$/;

function bereinigeWann(w: unknown): AblaufWann {
  const x = (w ?? {}) as Record<string, unknown>;
  if (x.art === 'datum') return { art: 'datum' };
  if (x.art === 'in') {
    const n = Math.trunc(Number(x.anzahl));
    const einheit = (typeof x.einheit === 'string' && x.einheit in VORLAUF_EINHEITEN ? x.einheit : 'tage') as VorlaufEinheit;
    return { art: 'in', anzahl: Number.isFinite(n) ? Math.max(1, Math.min(VORLAGEN_GRENZEN.anzahl, n)) : 1, einheit };
  }
  return { art: 'sofort' };
}

function bereinigeEmpfaenger(e: unknown): VorlagenEmpfaenger | null {
  const x = (e ?? {}) as Record<string, unknown>;
  if (x.art === 'frage' || x.art === 'selbst' || x.art === 'ersteller') return { art: x.art };
  if (x.art === 'feld' && typeof x.feld === 'string' && FELDKEY.test(x.feld)) return { art: 'feld', feld: x.feld };
  return null;
}

function bereinigeKarte(k: unknown, i: number): VorlagenKarte | null {
  const x = (k ?? {}) as Record<string, unknown>;
  if (x.art !== 'aufgabe') return null;
  const empfaenger = (Array.isArray(x.empfaenger) ? x.empfaenger : []).slice(0, VORLAGEN_GRENZEN.empfaenger).map(bereinigeEmpfaenger).filter((e): e is VorlagenEmpfaenger => !!e);
  const id = typeof x.id === 'string' && /^[a-z0-9_-]{1,40}$/i.test(x.id) ? x.id : `k${i + 1}`;
  return { id, art: 'aufgabe', als: x.als === 'benachrichtigung' ? 'benachrichtigung' : 'aufgabe', empfaenger, text: text(x.text, VORLAGEN_GRENZEN.text) };
}

/** Nur, was hier steht; unbekannte Karten fallen weg (`vorlagenEingabeFehler` meldet sie vorher). */
export function bereinigeVorlage(e: unknown): AblaufvorlageDaten {
  const x = (e ?? {}) as Record<string, unknown>;
  const r = Math.trunc(Number(x.reihenfolge));
  const fragen = FRAGEN.filter((f) => Array.isArray(x.fragen) && x.fragen.includes(f));
  return {
    name: text(x.name, VORLAGEN_GRENZEN.name),
    beschreibung: text(x.beschreibung, VORLAGEN_GRENZEN.beschreibung),
    reihenfolge: Number.isFinite(r) ? Math.max(VORLAGEN_REIHENFOLGE.min, Math.min(VORLAGEN_REIHENFOLGE.max, r)) : VORLAGEN_REIHENFOLGE.eigen,
    typen: [...new Set((Array.isArray(x.typen) ? x.typen : []).filter((y): y is string => typeof y === 'string' && !!y))].slice(0, 50),
    wann: bereinigeWann(x.wann),
    fragen,
    karten: (Array.isArray(x.karten) ? x.karten : []).slice(0, VORLAGEN_GRENZEN.karten).map(bereinigeKarte).filter((k): k is VorlagenKarte => !!k),
  };
}

/**
 * Karten außerhalb der erlaubten Liste (Sicherheit): Pakete und die API bekommen einen Fehler statt einer stillen
 * Bereinigung – so kann ein Update keine Karte „E-Mail“ oder „Adresse aufrufen“ einschmuggeln.
 */
export function vorlagenEingabeFehler(e: unknown): string[] {
  const x = (e ?? {}) as Record<string, unknown>;
  const fehler: string[] = [];
  for (const [i, k] of (Array.isArray(x.karten) ? x.karten : []).entries()) {
    const art = (k ?? {}) as Record<string, unknown>;
    if (!(VORLAGEN_KARTEN as readonly string[]).includes(String(art.art))) fehler.push(t('gemeinsam.ablaufvorlagen.karte-nicht-erlaubt', { nr: i + 1, art: String(art.art ?? '?') }));
    for (const em of Array.isArray(art.empfaenger) ? art.empfaenger : []) if (!bereinigeEmpfaenger(em)) fehler.push(t('gemeinsam.ablaufvorlagen.empfaenger-unbekannt', { nr: i + 1 }));
  }
  const w = (x.wann ?? {}) as Record<string, unknown>;
  if (x.wann !== undefined && !['sofort', 'datum', 'in'].includes(String(w.art))) fehler.push(t('gemeinsam.ablaufvorlagen.wann-unbekannt', { art: String(w.art ?? '?') }));
  for (const f of Array.isArray(x.fragen) ? x.fragen : []) if (!(FRAGEN as readonly string[]).includes(String(f))) fehler.push(t('gemeinsam.ablaufvorlagen.frage-unbekannt', { frage: String(f) }));
  return fehler;
}

/**
 * Fragt die Vorlage beim Anwenden nach dem Datum? Bei „Am gewählten Datum“ immer; bei „In …“ nur mit der Frage „Datum“
 * (#1180) – dann ist „in 14 Tagen“ ein Vorschlag, den man beim Anwenden ändern darf. Ohne die Frage steht es fest.
 */
export function fragtDatum(d: Pick<AblaufvorlageDaten, 'wann' | 'fragen'>): boolean {
  return d.wann.art === 'datum' || (d.wann.art === 'in' && d.fragen.includes('datum'));
}

/** Fragen und Wann passen zusammen und zu den Karten. */
function fragenProbleme(d: AblaufvorlageDaten): string[] {
  const p: string[] = [];
  if (d.wann.art === 'datum' && !d.fragen.includes('datum')) p.push(t('gemeinsam.ablaufvorlagen.datum-fragen'));
  if (d.wann.art === 'sofort' && d.fragen.includes('datum')) p.push(t('gemeinsam.ablaufvorlagen.datum-nicht-sofort'));
  const fragtEmpfaenger = d.karten.some((k) => k.empfaenger.some((e) => e.art === 'frage'));
  if (fragtEmpfaenger && !d.fragen.includes('empfaenger')) p.push(t('gemeinsam.ablaufvorlagen.empfaenger-fragen'));
  if (!fragtEmpfaenger && d.fragen.includes('empfaenger')) p.push(t('gemeinsam.ablaufvorlagen.empfaenger-ungenutzt'));
  if (d.fragen.includes('text') && !d.karten.some((k) => k.text.includes('{eingabe}'))) p.push(t('gemeinsam.ablaufvorlagen.text-ungenutzt'));
  return p;
}

/** Ein Feld als Empfänger nur bei festen Mappentypen, und dort muss es auf Benutzer verweisen. */
function feldProbleme(feld: string, inFrage: Mappentyp[], typen: Mappentyp[]): string[] {
  if (!inFrage.length) return [t('gemeinsam.ablaufvorlagen.feld-ohne-typ', { feld })];
  const benutzerTyp = typen.find((x) => x.system === 'benutzer');
  return inFrage.flatMap((typ) => {
    const f = typ.felder.find((x) => x.key === feld);
    const aufBenutzer = !!f && f.typ === 'referenz' && ((!zieleVon(f).length && !jedeMappe(f)) || einzigesZiel(f) === benutzerTyp?.id);
    return aufBenutzer ? [] : [t('gemeinsam.ablaufvorlagen.feld-kein-benutzer', { feld, typ: typ.name })];
  });
}

/** Was nicht (mehr) passt – leer, wenn man die Vorlage anwenden kann. `typen`: alle Mappentypen der Ablage. */
export function vorlagenProbleme(d: AblaufvorlageDaten, typen: Mappentyp[]): string[] {
  const p: string[] = [];
  if (!d.name) p.push(t('gemeinsam.ablaufvorlagen.name-fehlt'));
  if (!d.karten.length) p.push(t('gemeinsam.ablaufvorlagen.karte-fehlt'));
  p.push(...fragenProbleme(d));
  if (d.typen.some((id) => !typen.some((x) => x.id === id))) p.push(t('gemeinsam.ablaufvorlagen.typ-fehlt'));
  const inFrage = d.typen.length ? typen.filter((x) => d.typen.includes(x.id)) : [];
  for (const k of d.karten) {
    if (!k.text) p.push(t('gemeinsam.ablaufvorlagen.text-fehlt'));
    if (!k.empfaenger.length) p.push(t('gemeinsam.ablaufvorlagen.empfaenger-fehlt'));
    for (const e of k.empfaenger) if (e.art === 'feld') p.push(...feldProbleme(e.feld, inFrage, typen));
  }
  return [...new Set(p)];
}

/**
 * Am Tag `heute` angewendet: wann läuft der Ablauf? null = sofort. `datum` ist die Antwort auf die Frage „Datum“ – nur
 * übergeben, wenn die Vorlage danach fragt ({@link fragtDatum}); bei „In …“ ersetzt sie den Vorschlag.
 */
export function laeuftAm(w: AblaufWann, heute: string, datum?: string | null): string | null {
  if (w.art === 'sofort') return null;
  if (w.art === 'datum') return datum ?? null;
  return datum ?? verschiebe(heute, w.anzahl, w.einheit);
}

/**
 * Vorbelegung des Datumsfelds beim Anwenden und Ausprobieren: bei „In …“ der Vorschlag (heute + 14 Tage), bei „Am
 * gewählten Datum“ wie bisher in einer Woche (#1180).
 */
export function vorschlagDatum(w: AblaufWann, heute: string): string {
  return w.art === 'in' ? verschiebe(heute, w.anzahl, w.einheit) : verschiebe(heute, 7);
}

/** „Sofort“, „Am gewählten Datum“, „In 6 Monaten“ – mit `aenderbar` (Frage „Datum“ bei „In …“): „In 14 Tagen (änderbar)“. */
export function wannText(w: AblaufWann, aenderbar = false): string {
  if (w.art === 'sofort') return t('gemeinsam.ablaufvorlagen.wann.sofort');
  if (w.art === 'datum') return t('gemeinsam.ablaufvorlagen.wann.datum');
  const x = t.frei(`gemeinsam.ablaufvorlagen.wann.in.${w.einheit}`, { anzahl: w.anzahl });
  return aenderbar ? t('gemeinsam.ablaufvorlagen.wann.aenderbar', { wann: x }) : x;
}

/** Beschriftung eines Empfängers (`feld`: das Label im Mappentyp, sonst die Kennung). */
export function empfaengerText(e: VorlagenEmpfaenger, typen: Mappentyp[] = []): string {
  if (e.art === 'feld') return typen.flatMap((x) => x.felder).find((f) => f.key === e.feld)?.label ?? e.feld;
  return t.frei(`gemeinsam.ablaufvorlagen.empfaenger.${e.art}`);
}

/** Eine Karte in Klartext – für die Werkbank und die Rechte-Vorschau beim Installieren eines Pakets. */
export function karteText(k: VorlagenKarte, typen: Mappentyp[] = []): string {
  return t(k.als === 'aufgabe' ? 'gemeinsam.ablaufvorlagen.karte.aufgabe' : 'gemeinsam.ablaufvorlagen.karte.benachrichtigung', { an: k.empfaenger.map((e) => empfaengerText(e, typen)).join(', ') || '?' });
}

/** „Sofort → Aufgabe an die gewählte Person“. */
export function vorlageKurz(d: AblaufvorlageDaten, typen: Mappentyp[] = []): string {
  return `${wannText(d.wann, d.wann.art === 'in' && fragtDatum(d))} → ${d.karten.map((k) => karteText(k, typen)).join(', ') || '…'}`;
}

/** Feste Platzhalter einer Vorlage (zusätzlich zu denen des Mappentitels). */
export const VORLAGEN_PLATZHALTER = ['eingabe', 'person', 'empfaenger'] as const;
