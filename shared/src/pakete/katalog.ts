/** Paketverwaltung (#1278 aus pakete.ts): Katalog der Registry und installierte Pakete – Adressen, Typen, Ergänzungen. */
import { PAKET_ID, hauptpaket } from '../kennungen';
import { t } from '../texte';
import type { BeispielStand, PaketCode } from './schnittstellen';
import type { Mitkommt } from '../mitkommt';

/** Der offizielle Katalog (Branch gh-pages der Registry). */
export const OFFIZIELLER_KATALOG = 'https://catalog.ablago.app/katalog.json';
/** Die Katalog-Webseite (GitHub Pages der Registry), u. a. zum Zusammenstellen einer Sammeldatei (#461). */
export const KATALOG_SEITE = 'https://catalog.ablago.app/';
/** Die Registry selbst – Quellen, Regeln, Vorlage. */
export const REGISTRY = 'https://github.com/motom001/dms-registry';
export const VERSION = /^\d+\.\d+\.\d+$/;

/**
 * „Im Katalog ansehen“ (#622, dms-registry #84): Adresse der Katalog-Webseite – oder mit `paket` der
 * Seite dieses Pakets – mit der eigenen DMS-Version im **Fragment** `#dms=<Version>`. Das Fragment
 * schickt der Browser nie an den Server (kein Zugriffsprotokoll, keine Telemetrie, #389); nur das
 * Skript der Katalogseite (`dms.js`) liest es, merkt es sich im Browser und entfernt es wieder.
 * Nur die Version, nie ein Parameter (`?…`). Die Katalogseite nimmt genau `X.Y.Z` an – eine andere
 * Angabe (z. B. „unbekannt“) lässt das Fragment weg; eine ungültige Paket-Id die Paketseite.
 */
export function katalogSeiteMitVersion(dms: string, paket?: string): string {
  return mitVersion(paket && PAKET_ID.test(paket) ? `${KATALOG_SEITE}paket/${paket}/` : KATALOG_SEITE, dms);
}
/** Seite „Pakete herunterladen“ der Katalog-Webseite: Sammeldatei für ein DMS ohne Internet (#461). */
export const SAMMEL_SEITE = `${KATALOG_SEITE}sammeldatei.html`;
/**
 * Link auf die Sammeldatei-Seite – wie {@link katalogSeiteMitVersion} mit der Version nur im Fragment
 * `#dms=<Version>` (dms.js liest es dort ebenso), nie als Query `?dms=` (das stünde im Zugriffsprotokoll).
 */
export const sammelSeiteMitVersion = (dms: string): string => mitVersion(SAMMEL_SEITE, dms);
const mitVersion = (seite: string, dms: string) => (VERSION.test(dms) ? `${seite}#dms=${dms}` : seite);
/** Links auf die Katalog-Webseite: neuer Tab ohne Zugriff aufs DMS und ohne Herkunftsadresse (#622). */
export const KATALOG_LINK_REL = 'noopener noreferrer';
export const BEREICH = /^(>=|>|=|\^|~)?(\d+\.\d+\.\d+)( <(\d+\.\d+\.\d+))?$/;

export interface Benannt {
  schluessel: string;
  name: string;
}
export interface KatalogVersion {
  version: string;
  /** Nötige DMS-Version, z. B. „>=0.63.0“. */
  dms: string;
  abhaengigkeiten: Record<string, string>;
  inhalt: { mappentypen: Benannt[]; sichten: Benannt[]; beispiele: number };
  code: boolean;
  /** Adresse des Archivs, relativ zu katalog.json. */
  archiv: string;
  sha256: string;
  groesse: number;
  veroeffentlicht: string;
  quelle: string;
  readme: string;
  changelog: string;
  /** Ergänzung eines anderen Pakets (#405, Manifest `ergaenzt`), z. B. eine Zusatzsprache der Texterkennung. */
  ergaenzt?: Ergaenzung;
  /** Sprachpaket (#731): Sprache, maschinell übersetzt oder geprüft – für den Hinweis im Katalog. */
  sprache?: KatalogSprache;
}
/** Angaben eines Sprachpakets im Katalog (#731, dms-registry #116). */
export interface KatalogSprache {
  kennung: string;
  maschinell: boolean;
  geprueftVon?: string;
  ablago?: string;
}

/** Liest `sprache` einer Katalogversion; Ungültiges zählt nicht (das Paket bleibt sichtbar, nur ohne Hinweis). */
export function liesKatalogSprache(v: unknown): KatalogSprache | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.kennung !== 'string' || !/^[a-z]{2,3}(-[A-Z]{2})?$/.test(o.kennung)) return undefined;
  const gv = typeof o.geprueft_von === 'string' ? o.geprueft_von : typeof o.geprueftVon === 'string' ? o.geprueftVon : '';
  return {
    kennung: o.kennung,
    maschinell: o.maschinell === true,
    ...(gv.trim() && gv.length <= 200 && !/[<>]/.test(gv) ? { geprueftVon: gv.trim() } : {}),
    ...(typeof o.ablago === 'string' && VERSION.test(o.ablago) ? { ablago: o.ablago } : {}),
  };
}

/**
 * Ein Paket ergänzt ein anderes (#405): Manifest-Feld `ergaenzt: <paket>` oder `ergaenzt: { paket, gruppe }`. Das
 * ergänzte Paket muss unter `abhaengigkeiten` stehen. Die Installation zeigt Ergänzungen als Häkchen unter dem
 * ergänzten Paket, gruppiert nach `gruppe` (z. B. „Weitere Sprachen“); ohne Gruppe unter „Ergänzungen“.
 * Ältere DMS-Versionen übergehen das Feld (#635) – Pakete damit brauchen kein höheres `dms`.
 */
export interface Ergaenzung {
  paket: string;
  gruppe?: string;
}
/** Ab dieser Version zeigt das DMS Ergänzungen als Häkchen und installiert mehrere Pakete in einem Ablauf (#405). */
export const DMS_ERGAENZUNG_AB = '0.151.0';
export const ERGAENZUNG_GRUPPE_MAX = 40;

/** Liest `ergaenzt` (Manifest oder Katalog); null, wenn nicht da. fehler: was daran ungültig ist. */
export function liesErgaenzt(v: unknown, abhaengigkeiten: Record<string, unknown> = {}): { ergaenzt: Ergaenzung | null; fehler: string[] } {
  if (v === undefined || v === null) return { ergaenzt: null, fehler: [] };
  const roh =
    typeof v === 'string' ? { paket: v } : v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  if (!roh) return { ergaenzt: null, fehler: ['ergaenzt: der Name eines Pakets oder { paket, gruppe }.'] };
  const fehler: string[] = [];
  const paket = typeof roh.paket === 'string' ? roh.paket : '';
  if (!PAKET_ID.test(paket)) fehler.push(t('gemeinsam.pakete.ergaenzt-ungueltige-paket-id'));
  else if (!(paket in abhaengigkeiten)) fehler.push(t('gemeinsam.pakete.ergaenzt-muss-auch-unter', { paket }));
  const gruppe = roh.gruppe === undefined ? undefined : typeof roh.gruppe === 'string' ? roh.gruppe.trim() : null;
  if (gruppe === null || (gruppe !== undefined && (!gruppe || gruppe.length > ERGAENZUNG_GRUPPE_MAX)))
    fehler.push(t('gemeinsam.pakete.ergaenzt-gruppe-ein-text', { ERGAENZUNG_GRUPPE_MAX }));
  for (const k of Object.keys(roh)) if (k !== 'paket' && k !== 'gruppe') fehler.push(t('gemeinsam.pakete.ergaenzt-gibt-es-nicht', { k }));
  return fehler.length ? { ergaenzt: null, fehler } : { ergaenzt: { paket, ...(gruppe ? { gruppe } : {}) }, fehler };
}

/**
 * Punkt in der Id (#1084): `<hauptpaket>.<zusatz>` heißt „ergänzt das Hauptpaket“ – das Paket muss dann
 * `ergaenzt: <hauptpaket>` angeben. Liefert den Fehler oder null.
 */
export function punktIdFehler(id: string, ergaenzt: Ergaenzung | null | undefined): string | null {
  const haupt = hauptpaket(id);
  return haupt && ergaenzt?.paket !== haupt ? t('gemeinsam.pakete.punkt-id-ohne-ergaenzt', { id, haupt }) : null;
}

/** Höchstens so viele frühere Ids (#1084). */
export const ERSETZT_MAX = 5;
/**
 * Ersetzte Ids eines Pakets (#1084, Manifest `ersetzt`): Ein Update unter neuer Id zieht die Installation unter einer
 * dieser Ids um, statt ein zweites Paket anzulegen – z. B. `texterkennung.fra` mit `ersetzt: texterkennung_fra`. Ein
 * Text oder eine Liste von Paket-Ids, nicht die eigene.
 */
export function liesErsetzt(v: unknown, id: string): { ersetzt: string[]; fehler: string[] } {
  if (v === undefined || v === null) return { ersetzt: [], fehler: [] };
  const liste = typeof v === 'string' ? [v] : Array.isArray(v) ? v : null;
  if (!liste || liste.some((x) => typeof x !== 'string' || !PAKET_ID.test(x) || x === id || x === 'dms') || liste.length > ERSETZT_MAX) {
    return { ersetzt: [], fehler: [t('gemeinsam.pakete.ersetzt-ungueltig', { max: ERSETZT_MAX })] };
  }
  return { ersetzt: [...new Set(liste as string[])], fehler: [] };
}

/** Ein Angebot zum Mitinstallieren (#405): Ergänzung eines Pakets aus dem Katalog. */
export interface ErgaenzungAngebot {
  id: string;
  name: string;
  version: string;
  beschreibung: string;
  gruppe: string | null;
  code: boolean;
}
export interface KatalogPaket {
  id: string;
  name: string;
  beschreibung: string;
  autor: { name: string; github: string };
  lizenz: string;
  aktuell: string;
  /** Neueste zuerst. */
  versionen: KatalogVersion[];
  /** Anzeige wie im Katalog (#645, dms-registry #84/#98): Lucide-Name, Sprachkürzel, Kategorien – optional. */
  symbol?: string;
  kuerzel?: string;
  kategorien?: string[];
  /** Herausgeber (#1084, dms-registry #173) als umgedrehte Domain, z. B. `app.ablago`; fehlt in älteren Katalogen. */
  herausgeber?: string;
  /** Ersetzte Ids dieses Pakets (#1084, Manifest `ersetzt`), z. B. texterkennung_fra für texterkennung.fra. */
  ersetzt?: string[];
}
/**
 * empfohlen (#1048): „Für den Anfang“ – Paket-Ids in dieser Reihenfolge (Liste im Katalog, dms-registry
 * `werkzeuge/empfohlen.yaml`); fehlt in älteren Katalogen, dann nimmt Ablago seine eigene Liste.
 */
export interface Katalog {
  format: number;
  erstellt: string;
  quelle: string;
  pakete: KatalogPaket[];
  empfohlen?: string[];
}

/**
 * Katalogeintrag zu einer Paket-Id (#1084): die Id selbst, sonst das eine Paket, das sie unter `ersetzt` nennt – so
 * findet ein Update von texterkennung_fra das umgezogene texterkennung.fra.
 */
export function katalogPaketZu(k: Katalog, id: string): KatalogPaket | undefined {
  const nach = k.pakete.filter((p) => p.ersetzt?.includes(id));
  return k.pakete.find((p) => p.id === id) ?? (nach.length === 1 ? nach[0] : undefined);
}

/** Eine neuere Version eines installierten Pakets im Katalog seiner Quelle (#1167). */
export interface NeueVersion {
  id: string;
  name: string;
  installiert: string;
  neu: string;
  quelle: string;
}

/** Woher ein installiertes Paket stammt. */
export type Herkunft = { art: 'katalog'; url: string } | { art: 'hochgeladen'; von: string | null; am: string };

/**
 * Herkunftsprüfung (#594): Was die Signatur über einen Katalog, eine Sammeldatei oder ein hochgeladenes Paket
 * sagt. Die Vorschau zeigt sie als Zeile „Herkunft“.
 */
export interface HerkunftPruefung {
  /**
   * projekt: gültig signiert vom DMS-Projekt (offizieller Katalog bzw. Sammeldatei daraus);
   * anbieter: gültig signiert mit dem bestätigten Schlüssel eines eigenen Katalogs;
   * unsigniert: keine Signatur; ungueltig: Signatur da, aber ungültig (steht im Protokoll);
   * nichtgeprueft: Signatur des offiziellen Katalogs ließ sich nicht abrufen (#1351);
   * datei: hochgeladenes Paket ohne signierten Katalog.
   */
  art: 'projekt' | 'anbieter' | 'unsigniert' | 'ungueltig' | 'nichtgeprueft' | 'datei';
  /** Belegt aus dem offiziellen Katalog bzw. einer Sammeldatei damit – nur mit gültiger Signatur (#1351). */
  offiziell: boolean;
  /** Stand (`erstellt`) des signierten Katalogs. */
  stand?: string;
  /** Älter als KATALOG_ALT_TAGE (nur ohne Internet, Sammeldatei). */
  alt?: boolean;
  /** Fingerabdruck des Anbieter-Schlüssels (eigener Katalog). */
  fingerabdruck?: string;
  /** Der Anbieter hat seinen Schlüssel geordnet gewechselt (neuer mit dem alten signiert). */
  wechsel?: boolean;
  /** Hochgeladenes Paket: Prüfsumme steht so im offiziellen Katalog, in dieser Version. */
  katalogversion?: string;
  /** Das DMS hat noch Testschlüssel statt der echten Schlüssel des Projekts. */
  test?: boolean;
  /** Vor der Installation muss die Herkunft bestätigt werden. */
  bestaetigen: boolean;
}
/** Ab so vielen Tagen warnt das DMS vor einem alten Katalogstand (Sammeldatei ohne Internet, #594). */
export const KATALOG_ALT_TAGE = 90;

/**
 * Empfohlene Pakete (#460, #1511): im Einrichtungsassistenten vorgewählt und in der Übersicht der Werkbank als ein
 * Hinweis „Empfohlene Pakete“, solange eines fehlt – in dieser Reihenfolge.
 */
export const EMPFOHLENE_PAKETE = ['texterkennung', 'benachrichtigungen'] as const;
export type EmpfohlenesPaket = (typeof EMPFOHLENE_PAKETE)[number];

/**
 * Angehalten (#1563): Der Läufer startet das Paket nicht, es bekommt keine Ereignisse, Aufträge und Leistungen, seine
 * Aktionen und Automatisierungen ruhen. Mappentypen, Mappen, Ansichten und Vorlagen bleiben nutzbar; Einstellungen und
 * Geheimnisse bleiben gespeichert. `darf`: angehalten, weil „Was Ablago darf“ gesenkt wurde (#1562); `hand`: von Hand.
 */
export interface PaketAngehalten {
  grund: 'darf' | 'hand';
  /** Bei `darf`: was das Paket braucht, das nicht mehr erlaubt ist (Stufe aus dem Manifest). */
  stufe?: 'vorlagen' | 'lokal' | 'netz';
  am: string;
  von: string;
}

/** Was einem beschädigten Paket fehlt (#1551): Schlüssel der eigenen Mappentypen bzw. Ansichten. */
export interface FehlendeTeile {
  typen: string[];
  sichten: string[];
}

export interface InstalliertesPaket {
  id: string;
  /** Angehalten (#1563); fehlt = läuft. */
  angehalten?: PaketAngehalten;
  name: string;
  version: string;
  beschreibung: string;
  lizenz: string;
  autor: { name: string; github: string };
  herkunft: Herkunft;
  /** Herausgeber (#1084), umgedrehte Domain wie `app.ablago`; fehlt bei älteren Installationen (dann gilt der des Katalogs). */
  herausgeber?: string;
  /** Herausgeber belegt (offizieller Katalog bzw. Schlüssel eines signierten Katalogs); sonst „laut Paket, nicht geprüft“. */
  herausgeberGeprueft?: boolean;
  /** Fingerabdruck des signierten weiteren Katalogs, an den der Herausgeber gebunden ist (Sicherheit C). */
  herausgeberSchluessel?: string;
  /** Ersetzte Ids dieser Installation (#1084), z. B. texterkennung_fra nach dem Umzug auf texterkennung.fra. */
  ersetzt?: string[];
  installiert: string;
  installiertVon: string | null;
  aktualisiert: string | null;
  aktualisiertVon: string | null;
  /** Schlüssel der mitgelieferten Automatisierungen dieser Version (#712) – bei einem Update stehen nur neue zur Wahl. */
  automatisierungen?: string[];
  /** Lokaler Schlüssel → Id des Mappentyps bzw. der Sicht im DMS. */
  typen: Record<string, string>;
  sichten: Record<string, string>;
  /**
   * Ansichten des Pakets (#1125) je Schlüssel: Prüfwert, wie das Paket sie zuletzt geschrieben hat, und der Fassung im
   * Paket. Fehlt bei Installationen vor #1125 (dann weiß Ablago nicht, ob der Administrator sie geändert hat).
   */
  sichtStand?: Record<string, SichtStand>;
  /** Schlüssel der Beispiel-Mappen → Id (#347), nur wenn Beispiele mit Schlüssel angelegt wurden. */
  beispiele?: Record<string, string>;
  /**
   * Alle Beispiel-Mappen dieser Installation (#878) mit ihrem Stand direkt nach dem Anlegen. Unveränderte gehen beim
   * Entfernen des Pakets und mit „Beispiele entfernen“ samt ihren Dokumenten weg; fehlt bei älteren Installationen.
   */
  beispielMappen?: BeispielStand[];
  /** Vorgaben (#1038) je Schlüssel: Mappe, Stand nach dem letzten Schreiben, gelöscht, Vorlagen (shared/src/vorgaben.ts). */
  vorgaben?: Record<string, import('../vorgaben').VorgabeStand>;
  /** Vorlagen an Vorgaben anderer Pakete (#1038, `ergaenzt`) – nur diese Dokumente nimmt das Entfernen mit. */
  ergaenzungen?: Array<import('../vorgaben').ErgaenzungStand>;
  abhaengigkeiten: Record<string, string>;
  /** Einstellungen, wie das Paket sie beschreibt (#197); null = keine. */
  einstellungen?: import('../paketeinstellungen').Einstellungsbeschreibung | null;
  /** Nur in der Antwort der Werkbank: beschädigt (#1551) – diese eigenen Mappentypen bzw. Ansichten fehlen. */
  fehlt?: FehlendeTeile;
  /** Nur in der Antwort der Werkbank: Pflichtfelder der Einstellungen fehlen (#197). */
  einstellungenNoetig?: boolean;
  /** Nur in der Antwort der Werkbank: Sprachpaket (#731) – Übersetzung zu so viel Prozent vollständig (diese Version). */
  spracheAbdeckung?: number;
  /** Das Paket enthält Code (#338: läuft im Paket-Läufer). */
  code?: boolean;
  /** Code des Pakets (#338): Ereignisse, bestätigte Rechte und erlaubte Adressen im Netzwerk/Internet, Prüfwert des Moduls. */
  laeufer?: PaketCode;
  /** Links aus dem Katalog (README, Changelog, Quelle), sofern bekannt. */
  links?: { readme?: string; changelog?: string; quelle?: string };
  /** Nötige DMS-Version laut Manifest (seit #458 gespeichert; fehlt bei älteren Installationen). */
  dms?: string;
  /** Stand der Mappentypen, wie das Paket sie gebracht hat (#653), je Id – für „geändert“ mit Unterschieden. */
  typStand?: Record<string, import('../typvergleich').TypBild>;
  /** Sprachpaket (#731): Sprache, Gebietsschema, Ablago-Version der Texte, maschinell/geprüft; die Texte selbst stehen extra. */
  sprache?: import('../sprachpaket').SprachpaketInfo;
  /** Aktionen im Menü „Mappe“ (#1039, `mappenaktionen`), wie im Manifest; Mappentypen als Verweise. */
  mappenaktionen?: import('../paketaktionen').MappenAktion[];
  /** Was mitkommt (#1047), wie diese Version es mitbrachte; fehlt bei Installationen vor #1047 (bis zum nächsten Update). */
  mitkommt?: Mitkommt;
  /** Kurzanleitung „So nutzt du es“ (#1047) je Sprache, wenn das Paket eine mitbringt. */
  kurzanleitung?: Record<string, string[]>;
  /**
   * Rundgänge und Tipps (#831, #832, `inhalt.rundgaenge`/`inhalt.tipps`) roh wie im Paket – Ablago prüft sie bei jeder
   * Anzeige gegen die Anker dieser Version. `vorher`: Version vor dem letzten Update (für „Neu seit deinem letzten Besuch“).
   * `texte`: Sprachdateien des Pakets je Sprache (#1307, `entdecken-paket.ts`).
   */
  entdecken?: { rundgaenge?: unknown[]; tipps?: unknown[]; texte?: Record<string, Record<string, string>>; vorher?: string | null };
  /**
   * Regionspaket (#1696, `inhalt.region`): Feiertage und Regionen eines Landes als Regeln, geprüft beim Installieren.
   * Der Kern nimmt sie statt seines eingebauten Rechners (`shared/src/feiertagsquelle.ts`).
   */
  region?: import('../regionspaket').Regionsregeln;
}

/**
 * Stand einer Ansicht aus einem Paket (#1125, wie Vorgaben #1038). Ein Update ersetzt sie durch die Fassung im Paket,
 * solange sie noch so ist, wie das Paket sie geschrieben hat; was der Administrator geändert hat, bleibt.
 */
export interface SichtStand {
  /** Prüfwert der Ansicht (Name, Beschreibung, Elternsicht, Mappentypen, Bedingungen, Trefferliste, Symbol) in Ablago. */
  stand: string;
  /** Prüfwert der Ansicht im Paket – ändert er sich, bringt das Paket eine neue Fassung. */
  fassung: string;
}
/**
 * Was ein Update mit einer vorhandenen Ansicht des Pakets tut (#1125): gleich – nichts Neues; aktualisiert – unverändert,
 * wird durch die neue Fassung ersetzt; geaendert – vom Administrator geändert, bleibt (auf Wunsch ersetzen);
 * unbekannt – vor #1125 installiert und anders als im Paket, bleibt (auf Wunsch ersetzen); geloescht – gelöscht, bleibt weg.
 */
export type SichtZustand = 'gleich' | 'aktualisiert' | 'geaendert' | 'unbekannt' | 'geloescht';

/**
 * Teil eines vorhandenen Mappentyps beim Update (#1658): aktualisiert – unverändert, das Update übernimmt die neue
 * Fassung; geaendert – von der Verwaltung geändert, bleibt (auf Wunsch ersetzen); unbekannt – ohne Paketstand (vor
 * #653 installiert), bleibt (auf Wunsch ersetzen).
 */
export type TeilZustand = 'aktualisiert' | 'geaendert' | 'unbekannt';

/** Was ein Update an einem Teil eines vorhandenen Mappentyps ändern würde (#1658). */
export interface TeilPlan {
  /** Kennung für „Trotzdem ersetzen“ (`typTeileErsetzen`): `<Typ-Schlüssel>/typ|feld:<key>|register:<key>`. */
  teil: string;
  art: 'typ' | 'feld' | 'register';
  /** Name des Typs, Beschriftung des Felds bzw. Name des Registers in Ablago. */
  name: string;
  /** Geänderte Angaben: titelVorlage, beschreibung, mehrzahl, erkennbarAn · label, hilfe, min, max, … · felder (Reihenfolge). */
  was: string[];
  zustand: TeilZustand;
}

/** Ein Feld, das das Paket nicht mehr mitbringt (#1658). */
export interface EntfallPlan {
  /** Kennung für „Trotzdem entfernen“ (`typTeileErsetzen`) bzw. „Feld behalten“ (`felderBehalten`). */
  teil: string;
  key: string;
  label: string;
  /** Mappen mit einem Wert in diesem Feld. */
  anzahl: number;
  /** aktualisiert = unverändert, entfällt; geaendert/unbekannt = bleibt (auf Wunsch entfernen). */
  zustand: TeilZustand;
  /** Umbau-Schritt in denselben Typ (#1041): Die Werte ziehen in dieses Feld. */
  nach?: { key: string; label: string };
}
