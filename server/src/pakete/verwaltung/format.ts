/**
 * Paketformat (motom001/dms-registry): Manifest, Typen, Ansichten, Beispiele, Code, Sprache; Hilfen für Verweise.
 */
import { type Feld, type Mappentyp, type Register } from '../../../../shared/src/model';
import { type Beschriftungen, type NamensTeile, type TypTeile } from '../../../../shared/src/beschriftung';
import type { MappenAktion } from '../../../../shared/src/paketaktionen';
import { ALLE_TYPEN, type PaketCode, type InstalliertesPaket, katalogPaketZu, type Ergaenzung } from '../../../../shared/src/pakete';
import { type PaketArchiv } from '../../../../shared/src/archiv';
import type { PaketAblaufvorlage } from '../../aufgaben';
import { typKennung } from '../../../../shared/src/kennungen';
import { type Einstellungsbeschreibung } from '../../../../shared/src/paketeinstellungen';
import { type Sprachangabe, type SprachBeschriftung, type Sprachtexte } from '../../../../shared/src/sprachpaket';
import type { PaketTexte } from '../../../../shared/src/entdecken-paket';
import { type PaketErgaenzung, type PaketVorgabe } from '../index';
import type { UmbauSchritt } from '../../../../shared/src/umbau';

export interface Manifest {
  id: string;
  name: string;
  version: string;
  beschreibung: string;
  autor: { name: string; github: string };
  lizenz: string;
  dms: string;
  abhaengigkeiten: Record<string, string>;
  code?: unknown;
  /** Ergänzt ein anderes Paket (#405), z. B. eine Zusatzsprache die Texterkennung. */
  ergaenzt?: Ergaenzung;
  /** Herausgeber (#1084) als umgedrehte Domain, z. B. `app.ablago`; fehlt bei älteren Paketen (dann gilt standardHerausgeber). */
  herausgeber?: string;
  /** Ersetzte Ids (#1084): Ein Update zieht die Installation unter einer davon auf diese Id um (z. B. texterkennung_fra). */
  ersetzt?: string[];
}

/**
 * Feld im Paket. Verweisfelder (#1036): `ziel` ist ein Typverweis oder eine Liste davon (mehrere Zieltypen);
 * `zielOptional` nennt Typen anderer Pakete als `paket:schluessel`, von denen das Paket nicht abhängt – Ablago nimmt
 * sie auf, sobald es sie gibt. Ein Verweisfeld darf auch nur `zielOptional` haben.
 */
export interface PaketFeld extends Omit<Partial<Feld>, 'quelle'> {
  key: string;
  label: string;
  typ: Feld['typ'];
  ziel?: string | string[];
  zielOptional?: string[];
  /** Berechnet (#1034): nur der Code dieses Pakets schreibt den Wert; Ablago speichert es als `berechnetVon`. */
  berechnet?: boolean;
  /**
   * Tabelle (#1030): Mappen vom Typ `typ` (Typverweis wie bei `ziel`), die über `feld` hierher verweisen; Spalten aus der
   * Trefferliste `trefferliste` (in Paketen nur „standard“) und „+ Neu“ mit der Beschriftung `neu`.
   */
  quelle?: PaketTabellenquelle;
}

/** Quelle einer Tabelle im Paket (#1030) – Schreibweise des Registry-Schemas (`schema/inhalt.schema.json`). */
export interface PaketTabellenquelle {
  typ: string;
  feld: string;
  trefferliste?: string;
  neu?: string;
}

/** Typverweis der Quelle einer Tabelle (#1030), sonst nichts. */
export const tabellenTyp = (f: Pick<PaketFeld, 'typ' | 'quelle'>): string[] =>
  f.typ === 'tabelle' && f.quelle?.typ ? [str(f.quelle.typ)] : [];

/** Die festen Ziele eines Paketfelds als Liste (#1036): `ziel` einzeln oder als Liste. */
export const paketZiele = (f: Pick<PaketFeld, 'ziel'>): string[] => (Array.isArray(f.ziel) ? f.ziel.map(str) : f.ziel ? [str(f.ziel)] : []);

export interface PaketRegister {
  key: string;
  name: string;
  art: Register['art'];
  felder?: string[];
  quellen?: Array<{ typ: string; feld: string }>;
  volltext?: boolean;
  beschriftungen?: Beschriftungen<NamensTeile>;
  /** Abschnitte im Feldregister (#890): `{ vor, titel?, eingeklappt?, beschriftungen? }`; ältere Ablago ignorieren sie. */
  abschnitte?: unknown;
  /** Ausgeblendet (#655), nur beim ersten Installieren; ältere Ablago ignorieren es. */
  ausgeblendet?: boolean;
}

/**
 * Mappentyp im Paket. Beschriftungen je Sprache (#728) stehen unter `beschriftungen` – am Typ (name, beschreibung), an
 * Feldern (label, hilfe, optionen: fester Wert → Text) und an Registern (name). Ältere Pakete ohne sie gelten unverändert:
 * Ihre Optionen sind ihr eigener fester Wert.
 */
export interface PaketTyp {
  schluessel: string;
  name: string;
  beschreibung: string;
  titelVorlage?: string;
  felder: PaketFeld[];
  register: PaketRegister[];
  trefferliste?: string[];
  beschriftungen?: Beschriftungen<TypTeile>;
  /** „Kann aus Post angelegt werden“ (#937); fehlt = Vorgabe (an mit Dokumentenregister). Ältere Ablago ignorieren es. */
  ausPost?: boolean;
  /** „Woran man ihn erkennt“ (#937), Übersetzungen unter beschriftungen.<sprache>.erkennbarAn. */
  erkennbarAn?: string;
  /**
   * „Ist Teil einer anderen Mappe“ (#1031, Entwurf Rechnungen: `gehoertZu: rechnung`): Kennung des Verweisfelds dieses
   * Typs, über das jede Mappe zu ihrer übergeordneten gehört – ein Verweis (ziel genau ein Typ, ohne zielOptional), eine
   * Mappe, Pflicht. Ältere Ablago ignorieren es (die Teile stehen dort in den Ansichten).
   */
  gehoertZu?: string;
  /**
   * „In der allgemeinen Suche zeigen“ (#1220): `false` für reine Auswahllisten (z. B. „Vertragsart“) – ihre Mappen fehlen
   * dann in der Suche über die Kopfzeile und in „Frag deine Ablage“. Fehlt = ja. Ältere Ablago ignorieren es.
   */
  inSuche?: boolean;
  /**
   * Archivmodus (#1051, Entwurf Compliance): Vorgabe für einen Typ, den das Paket neu anlegt – mit „beruflich genutzt“
   * gilt jahreBeruflich. Vorhandene Typen ändert weder Installation noch Update; ältere Ablago ignorieren es.
   */
  archiv?: PaketArchiv;
}

/**
 * Mappentyp, den das Paket nicht mitbringt (#656): Das Zielsystem ordnet ihn über seine Kennung zu, wenn es ihn dort gibt –
 * sonst wird die Ansicht ohne ihn angelegt bzw. ganz übersprungen.
 */
export interface FremderTyp {
  kennung: string;
  name: string;
}

export interface PaketSicht {
  schluessel: string;
  name: string;
  beschreibung?: string;
  beschriftungen?: Beschriftungen<TypTeile>;
  eltern?: string;
  typen?: string[];
  fremdeTypen?: FremderTyp[];
  bedingungen?: Array<{ feld: string; operator: string; wert?: unknown }>;
  trefferliste?: string;
  symbol?: string;
}

/** Ab dieser Version verstehen DMS Ansichten mit `fremde_typen` (#656). */
export const FREMDE_TYPEN_AB = '0.178.0';

/** Beispiel-Mappe (#347): optional mit Schlüssel; Verweisfelder dürfen { beispiel: schluessel } bzw. { beispiel: paket:schluessel } sein. */
export interface PaketBeispiel {
  typ: string;
  werte: Record<string, unknown>;
  schluessel?: string;
  /** Beispiel-Dokumente (#878). */ dokumente?: PaketBeispielDokument[];
}

/**
 * Beispiel-Dokument (#878): `datei` relativ zu inhalt/ (beispiele/…), Titel = Dateiname in Ablago, Datum = „hochgeladen
 * am“, Register = Dokumentenregister des Mappentyps (ohne: das erste).
 */
export interface PaketBeispielDokument {
  datei: string;
  titel?: string;
  datum?: string;
  register?: string;
}

/** Code eines Pakets (#338): Angaben aus dem Manifest und die Dateien unter code/ (modul.wasm, daten/…). */
export interface PaketCodeTeil {
  info: PaketCode;
  dateien: Array<{ name: string; inhalt: Buffer }>;
}

export interface Paket {
  manifest: Manifest;
  typen: PaketTyp[];
  sichten: PaketSicht[];
  beispiele: PaketBeispiel[];
  /** Gleichbedeutende Wörter für die Suche (#356). */ wortlisten: string[][];
  /** Inhalt der Beispiel-Dokumente (#878) je `datei` (relativ zu inhalt/). */
  beispielDateien?: Map<string, Buffer>;
  /** Vorgaben (#1038): Mappen zum Behalten mit fester Kennung; Ergänzungen hängen nur Vorlagen an Vorgaben anderer Pakete. */
  vorgaben?: PaketVorgabe[];
  ergaenzungen?: PaketErgaenzung[];
  /** Inhalt der Text-Vorlagen (#1038) je `datei` (relativ zu inhalt/, vorlagen/…md). */
  vorlagenDateien?: Map<string, Buffer>;
  /** Umbau-Schritte (#1041, `umbau` im Manifest): Mappentypen ziehen in Typen dieses Pakets (shared/src/umbau.ts). */
  umbau?: UmbauSchritt[];
  /** Mitgelieferte Automatisierungen (#712, dms-registry #108), roh aus inhalt/automatisierungen.yaml; Typen als Paket-Schlüssel. */
  automatisierungen: PaketAutomatisierung[];
  readme: string;
  einstellungen: Einstellungsbeschreibung | null;
  code: PaketCodeTeil | null;
  /** Sprachpaket (#731): Angaben, Texte und Beschriftungen der Standardpakete; null bei allen anderen Paketen. */
  sprache?: PaketSprache | null;
  /** Aktionen im Menü „Mappe“ (#1039). */
  mappenaktionen?: MappenAktion[];
  /** Automatisierungsvorlagen (#1044), roh aus inhalt/ablaufvorlagen.yaml; nur erlaubte Karten. */
  ablaufvorlagen?: PaketAblaufvorlage[];
  /** Kurzanleitung „So nutzt du es“ (#1047, Manifest `kurzanleitung`) je Sprache. */
  kurzanleitung?: Record<string, string[]>;
  /** Rundgänge und Tipps (#831, #832; `inhalt.rundgaenge`, `inhalt.tipps`), roh und geprüft; Texte je Sprache (#1307). */
  entdecken?: { rundgaenge?: unknown[]; tipps?: unknown[]; texte?: PaketTexte };
}

/** Inhalt eines Sprachpakets (#731), geprüft gegen das Deutsche dieser Version. */
export interface PaketSprache {
  angabe: Sprachangabe;
  texte: Sprachtexte;
  uebergangen: string[];
  beschriftungen: Record<string, SprachBeschriftung>;
}

/**
 * Mappentypen des DMS, auf die Pakete mit `dms:<kennung>` verweisen dürfen (#310): nur, was jede
 * Installation hat und was sich nicht löschen lässt. Post nicht – Post zeigt über „Zugeordnet zu“
 * selbst auf jede Mappe, ein Paket braucht keinen eigenen Verweis darauf.
 */
export const DMS_TYPEN: Record<string, string> = { ablageort: 'Ablageort', benutzer: 'Benutzer', rolle: 'Rolle' };

/** Ab dieser Version bringt das Paket Basis den Ablageort mit (#883, dms-registry #138). */
export const BASIS_ABLAGEORT_AB = '1.6.0';

/** Ab dieser Version versteht das DMS Verweise `dms:…`; Pakete damit sollten `dms: ">=0.75.0"` angeben. */
export const DMS_VERWEISE_AB = '0.75.0';

export const DMS_PRAEFIX = 'dms:';

export const istDmsVerweis = (vw: string) => vw.startsWith(DMS_PRAEFIX);

/** Alle Typverweise eines Pakets: Felder, Quellen der Verknüpfungsregister, Typen der Ansichten. */
export const typverweise = (typen: PaketTyp[], sichten: PaketSicht[]) => [
  // Optionale Ziele (#1036) zählen nicht: Von ihnen hängt das Paket gerade nicht ab.
  ...typen.flatMap((t) => [
    ...t.felder.flatMap((f) => [...paketZiele(f), ...tabellenTyp(f)]),
    ...t.register.flatMap((r) => (r.quellen ?? []).map((q) => q.typ)),
  ]),
  ...sichten.flatMap((s) => (s.typen ?? []).filter((t) => t !== ALLE_TYPEN)),
];

export const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/**
 * Kennung der alten Form `<paket>_<schluessel>` (vor #1084) in die neue `paket:schluessel` – für ältere Pakete und
 * Dateien, die so noch auf Typen anderer Pakete zeigen (z. B. `fremde_typen`). Die Zuordnung kommt aus den installierten
 * Paketen (ihren Schlüsseln), nie aus dem Teilen am Unterstrich: `haus_garten_pflanze` kann `haus:garten_pflanze` wie
 * `haus_garten:pflanze` heißen. Passt nichts genau, bleibt die Kennung, wie sie ist.
 */
export function neueKennung(kennung: string, installierte: Array<Pick<InstalliertesPaket, 'id' | 'typen'>>): string {
  if (kennung.includes(':')) return kennung;
  const treffer = installierte.flatMap((p) =>
    Object.keys(p.typen)
      .filter((k) => `${p.id}_${k}` === kennung)
      .map((k) => typKennung(p.id, k)),
  );
  return treffer.length === 1 ? treffer[0] : kennung;
}

/** Katalogeintrag zu einer Paket-Id (#1084) – jetzt in shared/src/pakete/katalog.ts, hier für bestehende Aufrufer. */
export { katalogPaketZu };

/** Mappentyp zu einer Kennung aus einem Paket (`fremde_typen`, #656) – auch in der alten Form (neueKennung). */
export const fremderTyp = (kennung: string, typen: Mappentyp[], installierte: Array<Pick<InstalliertesPaket, 'id' | 'typen'>>) =>
  typen.find((t) => t.schluessel === kennung) ?? typen.find((t) => t.schluessel === neueKennung(kennung, installierte));

/** Eine mitgelieferte Automatisierung im Paket (#712) – Wenn/Und/Dann wie im Editor, Typen als Paket-Schlüssel. */
export interface PaketAutomatisierung {
  schluessel: string;
  name: string;
  beschreibung: string;
  wenn: Record<string, unknown>;
  und?: Record<string, unknown>;
  dann: unknown[];
  /** Gleich eingeschaltet (#1082): beim Installieren mit gesetztem Haken angeboten; fehlt = nicht angegeben. */
  eingeschaltet?: boolean;
}
