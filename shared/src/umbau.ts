/**
 * Paket-Update baut um (#1041): Ein Paket bringt Umbau-Schritte mit – Mappen eines Mappentyps ziehen in einen Typ
 * dieses Pakets, ihre Werte in dessen Felder. So kommen Verträge, Versicherungen, Mietverträge und Rechnungen aus
 * Haushalt, Vermietung und Fahrzeuge in die Pakete Verträge und Rechnungen (dms-registry #163), mit allen Werten.
 *
 * Im Manifest (`umbau`, eine Liste):
 *
 * ```yaml
 * umbau:
 *   - von: haushalt:vertrag          # Typ, dessen Mappen umziehen (paket:schluessel; ohne Präfix ein früherer eigener)
 *     nach: vertrag                  # Zieltyp: Schlüssel dieses Pakets oder paket:schluessel einer Abhängigkeit
 *     felder: { vertragspartner: von, kuendigungsfrist: kuendigungsfrist }   # alt → neu; mehrere alte auf ein neues
 *   - von: haushalt:versicherung
 *     nach: vertrag
 *     felder: { versicherer: von, beitrag: betrag, versicherungsnummer: vertragsnummer }
 *     setzen: { art: { vorgabe: versicherung } }                             # fester Wert, z. B. die Vertragsart
 *     register: { unterlagen: dokumente }                                    # Dokumente: Register alt → neu
 * ```
 *
 * **Zwei Arten:** Gibt es den Zieltyp noch nicht, **übernimmt** der erste Schritt dorthin den alten Typ mit seiner Id –
 * Ansichten, Rechte-Regeln, KI-Zulassung, Automatisierungen und Direktlinks hängen an der Id und bleiben, wie sie sind.
 * Sonst werden die Typen **zusammengelegt**: Die Mappen wechseln in den Zieltyp (Ids bleiben), der alte Typ verschwindet,
 * Verweise darauf zeigen auf den Zieltyp.
 *
 * **Werte:** Ein Wert landet im neuen Feld, wenn er dazu passt (Text → Zeitraum „3 Monate“ als Vorschlag, Zahl ↔
 * Betrag …). Was nicht passt oder keinen Platz hat, steht danach in einer Notiz an der Mappe – nichts geht verloren.
 * Jede Mappe bekommt einen Eintrag in der Historie: „Umgebaut durch Paket Verträge 1.0.0“.
 *
 * **Sicherheit** (Ergänzungen im Issue, Entscheidung Thomas 10.11.2026 11:28): Der Umbau gibt Mappen nie
 * stillschweigend breitere Rechte – die Recht-Regeln des alten Typs gehen mit (`umbau_aus` und vorangestellte Regeln am
 * Zieltyp), ebenso die KI-Sperre (#796) und „Paket verwehrt“; ein Archivmodus darf nicht lockerer werden (#1051). Alles
 * läuft in einer Transaktion; nur „Gesamte Verwaltung“ bestätigt, mit frischer Anmeldung. Schritte fassen nur Typen
 * desselben Herausgebers an (#1084).
 */
import type { Archiv } from './archiv';
import type { Regel, RegelBedingung, Regelwerk, Recht } from './rechte';
import { RECHTE_LISTE } from './rechte';
import { t } from './texte';

/**
 * Ab dieser Version führt Ablago Umbau-Schritte aus (#1041). Ältere übergehen `umbau` und installieren das Paket wie
 * jedes andere – Pakete mit Umbau setzen deshalb `dms` mindestens auf diese Version. Beim Einreihen auf die Version
 * setzen, mit der es erscheint.
 */
export const DMS_UMBAU_AB = '0.243.0';
/** Höchstens so viele Schritte in einem Paket. */
export const UMBAU_MAX = 50;
/**
 * Kennung des Felds, das am Zieltyp sagt, aus welchem Typ eine Mappe kam – nur, wenn die Regeln des alten Typs mitgehen
 * müssen (die vorangestellten Regeln fragen es ab). Nur lesbar: berechnet vom Kern (`berechnetVon: dms`).
 */
export const UMBAU_FELD = 'umbau_aus';
/** `berechnetVon` des Felds `umbau_aus`: „dms“ ist als Paket-Id verboten, kein Paket kann es schreiben. */
export { UMBAU_SCHREIBER } from './berechnet';

/** Ein Umbau-Schritt, wie er im Paket steht (gelesen und geprüft). */
export interface UmbauSchritt {
  /** Typverweis des alten Typs: `paket:schluessel`, ohne Präfix ein (früherer) Typ dieses Pakets. */
  von: string;
  /** Typverweis des Zieltyps: Schlüssel dieses Pakets oder `paket:schluessel` einer Abhängigkeit. */
  nach: string;
  /** Felder alt → neu. Mehrere alte auf dasselbe neue: Der erste gefüllte Wert gilt, die übrigen kommen in die Notiz. */
  felder: Record<string, string>;
  /** Feste Werte im Zieltyp (nur in leere Felder): Text, Zahl, Ja/Nein, Liste oder `{ vorgabe: schluessel }` (#1038). */
  setzen: Record<string, unknown>;
  /** Dokumentregister alt → neu; ohne Angabe gleicher Schlüssel, sonst das erste Dokumentregister des Zieltyps. */
  register: Record<string, string>;
}

/**
 * Antwort auf eine Rückfrage je Feld: `notiz` (der Wert kommt in die Notiz), `feld` (das Feld kommt als eigenes Feld in
 * den Zieltyp), `paket` (wie das Paket es vorsieht) oder die Kennung eines Felds des Zieltyps.
 */
export type UmbauWahl = 'notiz' | 'feld' | 'paket' | string;
/** Antworten je Schritt (Kennung des alten Typs) und Feld. */
export type UmbauEntscheidungen = Record<string, Record<string, UmbauWahl>>;

/** Eine Rückfrage: ein Feld, das der Administrator am alten Typ angelegt oder geändert hat. */
export interface UmbauRueckfrage {
  feld: string; label: string;
  /** eigen = vom Administrator angelegt; geaendert = Feld des Pakets, dessen Art der Administrator geändert hat. */
  grund: 'eigen' | 'geaendert';
  /** Mappen mit einem Wert darin. */
  anzahl: number;
  vorschlag: UmbauWahl;
  moeglich: Array<{ wahl: UmbauWahl; text: string }>;
}

/** Vorschau eines Schritts. */
export interface UmbauPlan {
  von: { id: string; kennung: string; name: string; paket: string | null };
  nach: { id: string | null; kennung: string; name: string };
  art: 'uebernehmen' | 'zusammenlegen';
  /** Mappen, die umziehen (ohne Papierkorb). */
  mappen: number;
  /** Mappen im Papierkorb – bleiben beim alten Typ, der dann als eigener Typ stehen bleibt. */
  imPapierkorb: number;
  /** Je Feld des Pakets: wohin, wie viele Werte, wie viele davon in die Notiz (passen nicht). */
  felder: Array<{ von: string; nach: string; anzahl: number; notiz: number }>;
  /** Felder ohne Ziel: ihre Werte kommen in die Notiz. */
  notiz: Array<{ feld: string; anzahl: number }>;
  setzen: Array<{ feld: string; wert: string }>;
  rueckfragen: UmbauRueckfrage[];
  /**
   * Rechte (Entscheidung Thomas): regeln = die Recht-Regeln des alten Typs gelten für diese Mappen weiter (am Zieltyp
   * vorangestellt); ki = der Zieltyp wird für KI-Dienste gesperrt, weil der alte es war; verwehrt = Pakete, die den
   * Zieltyp danach auch nicht lesen (wie den alten).
   */
  rechte: { regeln: boolean; ki: boolean; verwehrt: string[] };
  /** Was danach auf den Zieltyp zeigt statt auf den alten: Verweisfelder und Ansichten. */
  umgeleitet: { felder: number; ansichten: number };
}

/* ---------- Werte umwandeln ---------- */

const EINHEITEN: Array<[RegExp, 'tage' | 'wochen' | 'monate' | 'jahre']> = [
  [/^(tag|tage|tagen|day|days)$/i, 'tage'], [/^(woche|wochen|week|weeks)$/i, 'wochen'],
  [/^(monat|monate|monaten|month|months)$/i, 'monate'], [/^(jahr|jahre|jahren|year|years)$/i, 'jahre'],
];
/**
 * Zeitraum aus Freitext (#1041, „Kündigungsfrist“): „3 Monate“, „1 Jahr“, „14 Tage zum Monatsende“. `genau` = der Text
 * ist nur der Zeitraum; sonst ist es ein Vorschlag, und der ganze Text kommt zusätzlich in die Notiz.
 */
export function zeitraumAusText(text: string): { anzahl: number; einheit: 'tage' | 'wochen' | 'monate' | 'jahre'; genau: boolean } | null {
  const s = text.trim();
  const m = /(\d{1,4})\s*([A-Za-zäöüÄÖÜ]+)/.exec(s);
  if (!m) return null;
  const e = EINHEITEN.find(([re]) => re.test(m[2]));
  if (!e) return null;
  const anzahl = Number(m[1]);
  return { anzahl, einheit: e[1], genau: s.replace(/\s+/g, ' ') === `${m[1]} ${m[2]}` || s === m[0] };
}

/** Zahl aus Text: „1.234,56“, „1234.5“, „12 €“. */
export function zahlAusText(text: string): number | null {
  const s = text.replace(/[€\s]|EUR/gi, '');
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const n = Number(/,\d{1,2}$/.test(s) || (s.includes(',') && !s.includes('.')) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Datum aus Text: „31.12.2026“ oder „2026-12-31“ → „2026-12-31“. */
export function datumAusText(text: string): string | null {
  const s = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/* ---------- Rechte mitnehmen ---------- */

/** Bedingung „kam aus diesem Typ“ – über das Feld `umbau_aus` des Zieltyps. */
export const umbauBedingung = (kennung: string): RegelBedingung => ({ art: 'feld', bedingung: { art: 'feld', feld: UMBAU_FELD, op: 'gleich', wert: { art: 'fest', wert: kennung } } });

/**
 * Regelwerk des Zieltyps, wenn Mappen eines anderen Typs hinzukommen (Entscheidung Thomas: „Die Recht-Regeln des alten
 * Typs gehen auf die umgezogenen Mappen mit“). Für diese Mappen gilt danach genau das Regelwerk des alten Typs: zuerst
 * seine Grundeinstellung als Regel, dann seine Regeln (je mit der Bedingung „kam aus …“), zuletzt Stopp – die Regeln
 * des Zieltyps erreichen sie nicht. Für alle anderen Mappen ändert sich nichts. `null`: nichts nötig (der alte Typ war
 * offen oder hatte dasselbe Regelwerk). `ids` erzeugt neue Ids für die Regeln.
 */
export function regelnMitnehmen(alt: Regelwerk, ziel: Regelwerk, kennung: string, name: string, ids: () => string): Regelwerk | null {
  const offen = RECHTE_LISTE.every((k) => alt.grund[k]) && !alt.regeln.length;
  if (offen || JSON.stringify(ohneIds(alt)) === JSON.stringify(ohneIds(ziel))) return null;
  const b = umbauBedingung(kennung);
  const grund: Regel = { id: ids(), name: t('gemeinsam.umbau.regel-grund', { name }), wenn: [b], dann: Object.fromEntries(RECHTE_LISTE.map((k: Recht) => [k, alt.grund[k] ? 'erteilen' : 'entziehen'])), stopp: false };
  const regeln: Regel[] = alt.regeln.map((r) => ({ ...r, id: ids(), name: t('gemeinsam.umbau.regel', { name, regel: r.name }), wenn: [b, ...r.wenn] }));
  const ende: Regel = { id: ids(), name: t('gemeinsam.umbau.regel-ende', { name }), wenn: [b], dann: {}, stopp: true };
  // Schon mitgenommene Regeln (zweiter Schritt in denselben Zieltyp) bleiben vorn.
  return { grund: ziel.grund, regeln: [grund, ...regeln, ende, ...ziel.regeln] };
}
const ohneIds = (r: Regelwerk) => ({ grund: r.grund, regeln: r.regeln.map((x) => ({ ...x, id: '' })) });

/**
 * Wird der Archivmodus lockerer, wenn Mappen von `alt` nach `neu` ziehen (#1051, Sicherheit: „Archivmodus und
 * Fristsperre an den Mappen bleiben bestehen“)? Der Stichtag zählt über die Zuordnung der Felder. null = nein.
 */
export function archivLockerer(alt: Archiv | null | undefined, neu: Archiv | null | undefined, felder: Record<string, string>): 'aus' | 'jahre' | 'stichtag' | 'leer' | null {
  if (!alt) return null;
  if (!neu) return 'aus';
  if (neu.jahre < alt.jahre) return 'jahre';
  const stichtag = alt.stichtag ? felder[alt.stichtag] ?? alt.stichtag : null;
  if ((neu.stichtag ?? null) !== stichtag) return 'stichtag';
  if (alt.leererStichtag === 'laeuftNicht' && neu.leererStichtag !== 'laeuftNicht') return 'leer';
  return null;
}
