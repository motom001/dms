/** Schnittstelle des Repos (#1278 aus repo/index.ts): Typen, Fehler und Hilfen, die die Teil-Schnittstellen und ihre Nutzer brauchen. */
import type { Sprachtexte, SprachBeschriftung } from '../../../../shared/src/sprachpaket';
import type { Werte, OcrStandArt, Dokument, Herkunft } from '../../../../shared/src/model';
import { t } from '../../sprache/sprache';
import type { AuskunftLink } from '../../../../shared/src/auskunft';
import type { Klausel } from '../../../../shared/src/sichten';
import type { Varianten } from '../../../../shared/src/suche';
import type { Lesefilter } from '../../../../shared/src/rechte';
import type { Seitensprache } from '../../../../shared/src/seitensprachen';
import type { LoeschDokument } from '../../../../shared/src/loeschprotokoll';

/** Seitenweises Lesen der Historie (#800). */
export interface HistorieAbfrage {
  arten?: readonly string[];
  max?: number;
  vor?: number;
}

export interface Verweis {
  feldKey: string;
  zielId: string;
}
/** Texte und Beschriftungen eines Sprachpakets (#731). */
export interface SprachpaketDaten {
  kennung: string;
  texte: Sprachtexte;
  beschriftungen: Record<string, SprachBeschriftung>;
}

/**
 * Gleichzeitig bearbeiten (#609): Mappe feldweise schreiben. `basis` sind die Werte, auf denen die neuen
 * beruhen (so wie sie gelesen wurden). Geschrieben wird nur, was sich gegenüber `basis` ändert; alle anderen
 * Felder bleiben, wie sie gerade in der Datenbank stehen – auch wenn sie inzwischen jemand anderes geändert hat.
 * `verweise` berechnet die Verweise aus dem Ergebnis. Mit `stand` (Zeitpunkt „zuletzt geändert“ als ISO-Text)
 * schreibt die Datenbank nur, wenn die Mappe noch genau diesen Stand hat, sonst kommt `StandVeraltet`.
 */
export interface FeldweiseSchreiben {
  basis: Werte;
  verweise: (werte: Werte) => Verweis[];
  stand?: string;
  /**
   * Titel zu den Werten, die tatsächlich geschrieben werden (#743): im selben UPDATE gesetzt. undefined = nicht
   * bekannt (z. B. ein Verweis, dessen Titel nicht vorab gelesen wurde) – dann bleibt der Titel, wie er ist.
   */
  titel?: (werte: Werte) => string | undefined;
}

/** Die Mappe hat sich zwischen Lesen und Schreiben geändert (#609) – neu lesen und noch einmal versuchen. */
export class StandVeraltet extends Error {
  constructor() {
    super(t('meldungen.repo.die-mappe-hat-sich'));
  }
}

/**
 * Gleichzeitig bearbeitet (#917): Mappentyp oder Ansicht hat seit dem erwarteten Stand (`geaendert`) jemand anderes
 * gespeichert. Nichts wurde geändert; der Dienst macht daraus eine 409.
 */
export class KonfigurationVeraltet extends Error {
  constructor() {
    super('Stand veraltet');
    this.name = 'KonfigurationVeraltet';
  }
}

/** Neue Werte feldweise auf den aktuellen Stand legen (#609): nur Felder, die sich gegenüber `basis` ändern. */
export function feldweise(aktuell: Werte, basis: Werte, werte: Werte): Werte {
  const r: Werte = { ...aktuell };
  for (const k of new Set([...Object.keys(basis), ...Object.keys(werte)])) {
    if (JSON.stringify(basis[k] ?? null) === JSON.stringify(werte[k] ?? null)) continue;
    if (k in werte) r[k] = werte[k];
    else delete r[k];
  }
  return r;
}
/** Abruf-Link (#455) mit den Hashes von Schlüssel und Abrufcode – verlässt den Server nie. */
export interface AuskunftLinkIntern extends AuskunftLink {
  schluessel: string;
  code: string;
}
/** Ein gespeicherter Verweis mit beiden Enden (#396). */
export interface Kante {
  quelleId: string;
  feldKey: string;
  zielId: string;
}
/** Sortierung, wie sie das Repo braucht: Art der Spalte (für den richtigen Vergleich) und ggf. Feldschlüssel. */
export interface SortierungIntern {
  /** Prozent sortiert wie Zahl; Zeitraum nach seiner Länge in Tagen (#1035). */
  art:
    | 'titel'
    | 'typ'
    | 'erstellt'
    | 'geaendert'
    | 'erstelltVon'
    | 'geaendertVon'
    | 'text'
    | 'zahl'
    | 'betrag'
    | 'zeitraum'
    | 'datum'
    | 'janein';
  key?: string;
  absteigend: boolean;
}
export interface SeitenAnfrage {
  /** Mappen dieses Typs … */
  typId?: string;
  /** … oder der Eingang dieses Benutzers (nicht passende eigene Mappen; ohne Ersteller beim Admin). */
  eingang?: { benutzerId: string; admin: boolean };
  /** … oder die Favoriten dieses Benutzers (#62). */
  favoriten?: { benutzerId: string };
  /** … oder die Mappen einer Sicht (#38): ODER der Klauseln, Bedingungen aufgelöst. */
  klauseln?: Klausel[];
  /** Suche in Titel und Werten. */
  suche?: string;
  /** Suche auch im Volltext der Dokumente (deutsche Volltextsuche, #45). */
  volltext?: boolean;
  /** Suche auch in Notizen (#55). */
  notizen?: boolean;
  /**
   * Erweiterte Suche (#199): der Begriff muss in Dokumenten und/oder Notizen stehen – UND mit allem anderen. Mit
   * `felder` (#1218) zählt auch ein Treffer in Titel oder Feldern wie bei `suche`.
   */
  textfilter?: { text: string; dokumente: boolean; notizen: boolean; felder?: boolean };
  /**
   * Unscharfe Suche (#356): weitere Schreibweisen je Begriff (Schlüssel `falte(begriff)`) – gleichbedeutende Wörter,
   * ohne Bindestrich, bei keinem genauen Treffer ähnliche Wörter. Gilt für `suche` und `textfilter`.
   */
  varianten?: Varianten;
  /**
   * Ähnliche Schreibweisen aus dem Wörterverzeichnis (#356, Tippfehler) – wie `varianten`, aber nur für ganze Wörter,
   * nicht für die Suche nach Wortteilen im Volltext (die müsste dafür alle Texte lesen).
   */
  aehnlich?: Varianten;
  /**
   * Teile (#1031): Ids von Mappen, die als Treffer der Suche bzw. des Textfilters zählen, ohne den Begriff selbst zu
   * enthalten – übergeordnete Mappen, in deren Teilen er steht (die der Dienst vorher mit demselben Lesefilter gesucht
   * hat). Alle anderen Bedingungen und der Lesefilter gelten für sie wie immer. Nur mit `suche` bzw. `textfilter`.
   */
  auchIds?: string[];
  /** Reihenfolge; ohne: nach Titel. */
  sortierung?: SortierungIntern;
  /** Berechtigungen (#124): nur lesbare Mappen; fehlt/null = alle. */
  lesen?: Lesefilter | null;
  von: number;
  anzahl: number;
  /**
   * Gesamtzahl vom ersten Blatt (#740): Ohne Suche zählt das Repo beim Blättern (von > 0) nicht noch einmal, sondern
   * gibt diese Zahl zurück (mindestens so viele, wie bis hier geliefert sind). Fehlt sie, wird gezählt.
   */
  gesamt?: number;
  /**
   * Zahl der Treffer ist schon bekannt (#918, Zwischenspeicher bei gleichem Mappenstand): Das Repo zählt nicht, auch
   * nicht beim ersten Blatt oder mit Suche, und gibt diese Zahl zurück.
   */
  zahl?: number;
  /**
   * Tabellenfeld (#1265): dazu `verborgen` – die Zahl der Mappen, die ohne Lesefilter dazukämen (ohne Lesefilter 0) –
   * in derselben Abfrage wie Seite und Gesamtzahl; zählt auf jedem Blatt (`gesamt` gilt dann nicht). Mit Suche: wirkungslos.
   */
  mitVerborgenen?: boolean;
}
/** Mappe als Kandidat für Termine (#918): nur, was die Termine brauchen. */
export interface FristKandidat {
  id: string;
  typId: string;
  titel?: string | null;
  werte: Werte;
}
/**
 * Gruppe gleichbedeutender Wörter (#356); quelle „werkbank“ oder die Id eines Pakets. Die Reihenfolge der Wörter zählt
 * (#992): Unter dem ersten steht die Gruppe in der Liste. `geaendert` ist der Stand für den Konfliktschutz (#917).
 */
export interface Synonymgruppe {
  id: string;
  woerter: string[];
  quelle: string;
  geaendert: string;
}
export interface NeueMappe {
  id: string;
  typId: string;
  werte: Werte;
  verweise: Verweis[];
  titel: string;
  benutzerId: string | null;
  demo: boolean;
}

/** Ergebnis der Texterkennung für ein Dokument. */
/** Einträge je Lauf beim Einarbeiten ins Wörterverzeichnis (#575). */
export const WOERTER_JE_LAUF = 20_000;

export interface OcrErgebnis {
  stand: OcrStandArt;
  text?: string | null;
  info?: string | null;
  seiten?: number | null;
  /** Sprache des Texts (#400, Tesseract-Kennung); undefined = unverändert lassen, null = keine (Deutsch). */
  sprache?: string | null;
  /**
   * Mehrere Sprachen (#579). Mit `text` gilt: fehlt es, sind weitere Sprachen und Seitensprachen danach leer (ein
   * neuer Text hat neue Seiten); ohne `text` bleiben sie unverändert.
   */
  weitere?: string[] | null;
  seitensprachen?: Seitensprache[] | null;
}
export type OcrZaehler = Record<OcrStandArt, number>;

/** Ein Dokument in der Liste der Texterkennung (#61). */
export interface OcrAuftrag {
  dokument: Dokument;
  mappeTitel: string;
  typId: string;
}
export interface Rueckverweis {
  quelleId: string;
  quelleTypId: string;
  feldKey: string;
  titel: string;
}

/** Eine Mappe im Papierkorb (#43), mit ihren Werten, wie sie beim Löschen waren. */
export interface PapierkorbEintrag {
  id: string;
  typId: string;
  titel: string;
  werte: Werte;
  demo: boolean;
  erstellt: string;
  erstelltVon: string | null;
  geaendert: string;
  geaendertVon: string | null;
  geloescht: string;
  geloeschtVon: string | null;
  /** Anzahl Dokumente, die mit ihr im Papierkorb liegen. */
  dokumente: number;
  /** Mit verknüpften Mappen gelöscht (#424): gemeinsame Id des Vorgangs, sonst null. */
  vorgang: string | null;
  /** Verweise bleibender Mappen auf diese, die beim Löschen entfernt wurden (#424). */
  entkoppelt: Array<{ quelleId: string; feldKey: string }>;
}
/** Eine Mappe im Papierkorb, wie das Löschprotokoll sie braucht (#470). */
export interface KorbInhalt {
  id: string;
  typId: string;
  werte: Werte;
  demo: boolean;
  vorgang: string | null;
  entkoppelt: number;
  notizen: number;
  dokumente: LoeschDokument[];
}
/** Ein einzelnes Dokument im Papierkorb (#344). */
export interface DokumentImPapierkorb {
  id: string;
  mappeId: string;
  registerKey: string;
  name: string;
  mime: string;
  groesse: number;
  sha256: string;
  erstellt: string;
  erstelltVon: string | null;
  /** Anlagen (#998): Hauptdokument, an dem es beim Löschen hing (kommt mit ihm zurück). */
  anlageZu?: string | null;
  /** Anzahl älterer Versionen, die mitgegangen sind. */
  versionen: number;
  geloescht: string;
  geloeschtVon: string | null;
}
export interface PapierkorbFilter {
  /** Nur, was dieser Benutzer gelöscht hat. */
  von?: string;
  /** Nur, was vor diesem Zeitpunkt gelöscht wurde. */
  vor?: string;
  typId?: string;
}

/**
 * Datenzugriff für einen Haushalt. Die Fachlogik (Dienst) kennt nur diese
 * Schnittstelle; PostgreSQL und der Arbeitsspeicher (für Tests) setzen sie um.
 */
/** Ein Ereignis für ein Paket (#338). */
export interface PaketEreignis {
  id: string;
  paketId: string;
  art: string;
  daten: Record<string, unknown>;
  erstellt: string;
  versuche: number;
}

/** Anzahl fertiger Dokumente je Herkunft des Volltexts (#459). */
export interface VolltextHerkunftZahlen {
  pdf: number;
  paket: number;
  api: number;
  eingebaut: number;
  sonst: number;
  ohneText: number;
}

/** Stand der Zahlen eines Benutzers (#625), in der Datenbank. */
export interface Zaehlerstand {
  stand: number;
  abdruck: string;
  geaendert: string;
}

/** Ein Ereignis des Katalogs (#670), wie es geschrieben wird. */
export interface NeuesKatalogEreignis {
  id: string;
  art: string;
  daten: Record<string, unknown>;
  ausloeser: Record<string, unknown>;
  buendel?: string;
  buendelS?: number;
}
export interface GespeichertesKatalogEreignis {
  id: string;
  nr: number;
  art: string;
  daten: Record<string, unknown>;
  ausloeser: Record<string, unknown>;
  erstellt: string;
  versuche: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Adresse eines Dienstkontos (#338) – mit Haushalt, weil die Adresse über alle Haushalte eindeutig ist (benutzer_email_uq). */
export const dienstEmail = (paketId: string, haushaltId: string) => `paket-${paketId}.${haushaltId}@dienst.invalid`;
export const istUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);

/** Nummern ziehen beim Anlegen (#171): Feld → Kreis, Tag des Ziehens. */
export interface NummernZiehen {
  felder: Array<{ feldKey: string; kreis: string }>;
  jetzt: Date;
}

/** Neue Version eines Dokuments (#194). */
export interface NeueVersion {
  name: string;
  mime: string;
  groesse: number;
  sha256: string;
  anzeigbar: boolean;
  erstelltVon: string | null;
  herkunft: Herkunft;
  /** Volltext übernehmen (Zurückholen); undefined = Texterkennung neu. */
  volltext?: string | null;
}
