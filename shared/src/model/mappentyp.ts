/**
 * Mappentypen (#1278, vorher `shared/src/model.ts`): Abschnitte, Register, der Mappentyp selbst, die
 * Systemmappentypen und die Trefferlisten eines Typs.
 */
import type { Beschriftungen, AbschnittTeile, NamensTeile, TypTeile } from './beschriftungen';
import type { Quelle } from './angaben';
import type { Anzeigeregel, Feld } from './felder';
import { type Historiengruppe, HISTORIE_VORAUSWAHL } from './historienarten';
import { t, t as tx } from '../texte';

/**
 * Abschnitt in einem Feldregister (#890): Ab dem Feld `vor` beginnt eine neue Zeile. Mit Überschrift (`titel`) zeigt
 * die Mappe eine dünne Linie und die Überschrift, auf Wunsch eingeklappt; ohne Überschrift ist es nur ein Umbruch.
 * Nur Darstellung – Werte, Export, PDF der Angaben und API kennen keine Abschnitte.
 */
export interface Abschnitt {
  /** Kennung des Felds, vor dem der Abschnitt beginnt (ein Feld dieses Registers). */
  vor: string;
  /** Überschrift; fehlt = nur ein Zeilenumbruch. */
  titel?: string;
  /** Vorgabe beim Öffnen einer Mappe: eingeklappt (nur mit Überschrift). Jede Person kann es sich anders merken. */
  eingeklappt?: boolean;
  /** Überschrift in weiteren Sprachen (#728). */
  beschriftungen?: Beschriftungen<AbschnittTeile>;
  /**
   * „Anzeigen, wenn …“ (#1033): Trifft die Regel nicht zu, fehlt der Abschnitt samt allen Feldern bis zum nächsten
   * Abschnitt; deren Werte bleiben gespeichert. Fehlt = immer.
   */
  anzeigen?: Anzeigeregel;
}
/** Höchstlänge der Überschrift eines Abschnitts (#890). */
export const ABSCHNITT_TITEL_MAX = 80;

export const REGISTERARTEN = {
  felder: 'Feldregister',
  dokumente: 'Dokumentenregister',
  verknuepfungen: 'Verknüpfungsregister',
  /** Änderungshistorie der Mappe (#57). */
  protokoll: 'Historie',
} as const;
export type Registerart = keyof typeof REGISTERARTEN;

/** Ein Trennblatt an der Mappe. */
export interface Register {
  /** Fester Schlüssel (Dokumente merken sich ihr Register darüber). */
  key: string;
  name: string;
  art: Registerart;
  /** Feldregister: Schlüssel der Felder auf diesem Blatt. Jedes Feld liegt auf genau einem Feldregister. */
  felder?: string[];
  /** Verknüpfungsregister: welche Verweise es zeigt; leer = alle. */
  quellen?: Quelle[];
  /** Dokumentenregister: Volltext erzeugen (Texterkennung, #45); Standard: ja. */
  volltext?: boolean;
  /** Dokumentenregister (#194): Ersetzen legt eine neue Version an, die alte bleibt. */
  versionierung?: boolean;
  /** Nur die letzten N Versionen behalten (mit der aktuellen); leer = alle. */
  versionenBehalten?: number | null;
  /** Historie (#800): welche Gruppen von Einträgen das Register zeigt; fehlt = HISTORIE_VORAUSWAHL. */
  zeigt?: Historiengruppe[];
  /** Name in weiteren Sprachen (#728). */
  beschriftungen?: Beschriftungen<NamensTeile>;
  /** Feldregister (#890): Abschnitte zwischen den Feldern – Zeilenumbruch, Überschrift, eingeklappt. Fehlt = keine. */
  abschnitte?: Abschnitt[];
  /**
   * Ausgeblendet (#655): Die Mappe zeigt das Register nicht; Felder darauf gelten als ausgeblendet, ihre Werte bleiben.
   * Nicht bei Dokumentenregistern und nicht bei Registern mit Systemfeldern.
   */
  ausgeblendet?: boolean;
}

export interface MappentypDaten {
  name: string;
  /**
   * Feste Kennung (#145): nach dem Anlegen unveränderlich, z. B. für sprechende Links. Eigene Typen haben einen
   * Schlüssel ohne Präfix (`rechnung`), Typen aus Paketen `paket:schluessel` (#1084, z. B. `basis:person`).
   */
  schluessel?: string;
  beschreibung: string;
  /** Vorlage für den Titel einer Mappe, z. B. „{verwendungszweck} vom {zahlungsdatum}“. Leer = erstes Textfeld. */
  titelVorlage: string;
  felder: Feld[];
  register: Register[];
  /** Trefferlisten (#75): je Liste Spalten in ihrer Reihenfolge; genau eine ist Standard. */
  trefferlisten?: Trefferliste[];
  /**
   * Spalten der Standard-Trefferliste (Feldschlüssel oder Systemspalten wie _titel). Leer = einfache Liste.
   * Ältere Form; beim Speichern ersetzt sie die Spalten der Standardliste, wenn angegeben.
   */
  trefferliste?: string[];
  /** In der Ablage dürfen neue Mappen dieses Typs angelegt werden (Standard: ja). */
  erstellenErlaubt?: boolean;
  /** In der Ablage dürfen Mappen dieses Typs gelöscht werden (Standard: ja). */
  loeschenErlaubt?: boolean;
  /** Archivmodus (#212): Aufbewahrungsfrist und Stichtag; fehlt/null = aus. */
  archiv?: import('./angaben').Archiv | null;
  /**
   * Stempel beim Weitergeben (#394): vorschlagen oder Pflicht, mit Vorlage. Gespeichert in den
   * Einstellungen (nicht in der Tabelle der Mappentypen); beim Lesen und Speichern hier mitgeliefert.
   */
  stempel?: import('../stempel').StempelTyp | null;
  /** „Aus Dokument ausfüllen“ (#391): eigene Beschriftung oder ausgeblendet; wie der Stempel in den Einstellungen. */
  ausDokument?: import('./angaben').AusDokument | null;
  /**
   * Erkannte Post automatisch zuordnen (#337). Seit #1639 entscheidet „Was Ablago darf“ für alle Mappentypen; hier nur die
   * Ausnahme: true = wie in „Was Ablago darf“ (Standard), false = „Hier nie automatisch zuordnen“. In den Einstellungen.
   */
  autoZuordnen?: boolean;
  /**
   * „Kann aus Post angelegt werden“ (#937): Der Typ steht bei „Wohin gehört das?“ zur Wahl. Fehlt bzw. null = Vorgabe:
   * an, wenn der Typ ein Dokumentenregister hat (siehe `kannAusPost`). Systemtypen nie.
   */
  ausPost?: boolean | null;
  /** „Woran man ihn erkennt“ (#937): kurzer Text für die Klassifizierung (#939), höchstens ERKENNBAR_AN_MAX Zeichen. */
  erkennbarAn?: string;
  /**
   * Mehrzahl (#1446), z. B. „Verträge“: Listen zeigen damit „12 Verträge“ statt „12 × Vertrag“. Leer bzw. fehlt = keine;
   * andere Sprachen unter `beschriftungen.<sprache>.mehrzahl`. Höchstens MEHRZAHL_MAX Zeichen.
   */
  mehrzahl?: string;
  /** Name, Beschreibung und „Woran man ihn erkennt“ in weiteren Sprachen (#728, #937). */
  beschriftungen?: Beschriftungen<TypTeile>;
  /**
   * „Ist Teil einer anderen Mappe“ (#1031): Kennung des Verweisfelds, über das jede Mappe dieses Typs zu ihrer
   * übergeordneten Mappe gehört (z. B. Rechnungsposition → „rechnung“). Solche Mappen heißen Teile und erscheinen nur an
   * der übergeordneten Mappe und über einen direkten Link (teile.ts). Fehlt bzw. null = eigenständig.
   */
  teilVon?: string | null;
  /**
   * „In der allgemeinen Suche zeigen“ (#1220): `false` = Mappen dieses Typs fehlen in der Suche über die Kopfzeile (die
   * erweiterte Suche ohne gewählten Mappentyp) und als Quelle von „Frag deine Ablage“ – etwa reine Auswahllisten wie
   * „Vertragsart“. Mit gewähltem Typ findet die erweiterte Suche sie; Auswahl- und Verweisfelder bleiben unberührt.
   * Fehlt bzw. null = Vorgabe (ja); true/false = ausdrücklich eingestellt. Ein Paket-Update setzt sein „nein“ nur, solange
   * der Administrator nichts eingestellt hat (wie `ausPost`).
   */
  inSuche?: boolean | null;
}

/** „In der allgemeinen Suche zeigen“ (#1220): ja, außer ausdrücklich nein. */
export const inAllgemeinerSuche = (t: Pick<MappentypDaten, 'inSuche'> | undefined): boolean => t?.inSuche !== false;

/** Höchstlänge von „Woran man ihn erkennt“ (#937). */
export const ERKENNBAR_AN_MAX = 300;
/** Höchstlänge der Mehrzahl eines Mappentyps (#1446) – wie der Name. */
export const MEHRZAHL_MAX = 80;
/**
 * „Kann aus Post angelegt werden“ (#937): eingestellt – sonst an, wenn der Typ ein Dokumentenregister hat.
 * Systemtypen (Benutzer, Rolle, Post) nie.
 */
export function kannAusPost(
  t: Pick<MappentypDaten, 'ausPost' | 'register'> & { system?: Systemtyp | null; teilVon?: string | null },
): boolean {
  // Teile (#1031) entstehen nur an ihrer übergeordneten Mappe.
  if (t.system || t.teilVon) return false;
  return t.ausPost ?? t.register.some((r) => r.art === 'dokumente');
}
export interface Mappentyp extends MappentypDaten {
  id: string;
  erstellt: string;
  geaendert: string;
  /** Paket, aus dem der Typ stammt (#1084) – der Teil vor dem Doppelpunkt der Kennung; fehlt bei eigenen Typen. */
  paket?: string;
  /** Systemmappentyp (Benutzer, Rolle): lässt sich erweitern, aber nicht löschen. */
  system?: Systemtyp | null;
  /** Berechtigungen (#123): Grundeinstellung und Regeln; fehlt = alles erteilt. Nur für Administratoren geliefert. */
  berechtigungen?: import('./regelwerk').Regelwerk | null;
  /** Nur für Nicht-Administratoren (#126): Darf man nach den Berechtigungen überhaupt Mappen dieses Typs anlegen? */
  darfAnlegen?: boolean;
  /**
   * Berechnete Felder (#1034), nur beim Lesen ergänzt: je Paket-Id an `berechnetVon` sein Name und ob es noch rechnet.
   * Fehlt, wenn der Typ keine berechneten Felder hat.
   */
  berechnung?: Record<string, import('./angaben').Berechnung>;
}

/* ---------- Systemmappentypen: Benutzer und Rollen (#26, #27) ---------- */

export const SYSTEMTYPEN = {
  benutzer: t('gemeinsam.model.systemtyp.benutzer'),
  rolle: t('gemeinsam.model.systemtyp.rolle'),
  post: t('gemeinsam.model.systemtyp.post'),
} as const;
export type Systemtyp = keyof typeof SYSTEMTYPEN;
/** Mehrzahl der Systemtypen (#1446) zum Standardnamen; Post hat keine („n × Post“). */
export const SYSTEMTYP_MEHRZAHL: Partial<Record<Systemtyp, string>> = {
  benutzer: t('gemeinsam.model.systemtyp.benutzer-mehrzahl'),
  rolle: t('gemeinsam.model.systemtyp.rolle-mehrzahl'),
};

/** Systemeigene Spalten für Trefferlisten; beginnen mit _, damit sie nie mit Feldschlüsseln kollidieren. */
export const SYSTEMSPALTEN = {
  _titel: 'Titel',
  _typ: 'Mappentyp',
  _erstellt: 'Angelegt',
  _erstelltVon: 'Angelegt von',
  _geaendert: 'Zuletzt geändert',
  _geaendertVon: 'Zuletzt geändert von',
} as const;
export type Systemspalte = keyof typeof SYSTEMSPALTEN;
export const istSystemspalte = (k: string): k is Systemspalte => Object.prototype.hasOwnProperty.call(SYSTEMSPALTEN, k);
/** Spalten für Sichten mit gemischten Mappentypen (z. B. Eingang). */
/** Eine Trefferliste eines Mappentyps (#75). */
export interface Trefferliste {
  /** Fester Schlüssel; Sichten und Verknüpfungsregister wählen die Liste darüber. */
  key: string;
  name: string;
  /** Spalten in ihrer Reihenfolge: Feldschlüssel oder Systemspalten (_titel, _erstellt, …). Leer = einfache Liste. */
  spalten: string[];
  standard?: boolean;
  /** Name in weiteren Sprachen (#728). */
  beschriftungen?: Beschriftungen<NamensTeile>;
}

/** Trefferlisten eines Typs; Typen aus der Zeit vor #75 haben genau eine („Standard“). */
export function trefferlistenVon(t: Pick<MappentypDaten, 'trefferlisten' | 'trefferliste'>): Trefferliste[] {
  return t.trefferlisten?.length
    ? t.trefferlisten
    : [{ key: 'standard', name: tx('gemeinsam.model.trefferliste-standard'), spalten: t.trefferliste ?? [], standard: true }];
}
/** Die Standard-Trefferliste eines Typs. */
export function standardliste(t: Pick<MappentypDaten, 'trefferlisten' | 'trefferliste'>): Trefferliste {
  const l = trefferlistenVon(t);
  return l.find((x) => x.standard) ?? l[0];
}

export const GEMISCHTE_SPALTEN: Systemspalte[] = ['_titel', '_typ', '_erstelltVon', '_erstellt', '_geaendertVon', '_geaendert'];

/** Nach welchen Spalten der Server sortieren kann (Verweise und lange Texte nicht). */
export function sortierbar(spalte: string, t?: Pick<Mappentyp, 'felder'>): boolean {
  if (istSystemspalte(spalte)) return true;
  const f = t?.felder.find((x) => x.key === spalte);
  return !!f && f.typ !== 'referenz' && f.typ !== 'langtext' && f.typ !== 'formatiert' && f.typ !== 'passwort' && f.typ !== 'tabelle';
}
export interface Sortierung {
  spalte: string;
  absteigend: boolean;
}
/** Die Gruppen, die ein Register „Historie“ zeigt: seine Einstellung, sonst die Vorauswahl. */
export const historiengruppenVon = (r: Pick<Register, 'zeigt'> | undefined): Historiengruppe[] => [...(r?.zeigt ?? HISTORIE_VORAUSWAHL)];
