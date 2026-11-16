/**
 * Plan der Vorschau und Eingaben zum Installieren und für den Umbau.
 */
import type { MappenAktion } from '../../../../shared/src/paketaktionen';
import {
  type HerkunftPruefung,
  type RechtePunkt,
  type InstalliertesPaket,
  type SichtZustand,
  type KatalogVersion,
} from '../../../../shared/src/pakete';
import { type Archiv } from '../../../../shared/src/archiv';
import { type Abdeckung, type Sprachangabe } from '../../../../shared/src/sprachpaket';
import { type Mitkommt } from '../../../../shared/src/mitkommt';
import type { UmbauEntscheidungen, UmbauPlan } from '../../../../shared/src/umbau';
import { type ErgaenzungPlan, type VorgabePlan } from '../../../../shared/src/vorgaben';
import { type Paket } from './format';
import { type Handelnder } from './optionen';

export interface TypPlan {
  schluessel: string;
  dmsSchluessel: string;
  name: string;
  felder: number;
  /** Bei Update: Typ gibt es schon; nur neue Felder und Register. */
  vorhanden: boolean;
  neueFelder: string[];
  neueRegister: string[];
  /** Bei Update (#336): vorhandene Felder, die das Paket jetzt „für die Erkennung“ markiert (nur wo noch nichts eingestellt ist). */
  erkennung?: string[];
  /** Bei Update (#938): vorhandene Felder, die das Paket jetzt „zum Wiederfinden“ markiert (nur wo der Haken noch fehlt). */
  wiederfinden?: string[];
  /** Bei Update (#1037): vorhandene Verweisfelder, die jetzt „beim Auswählen übernehmen“ (nur wo noch nichts eingestellt ist). */
  vorbelegen?: string[];
  /** Bei Update (#937): Das Paket gibt „Kann aus Post angelegt werden“ bzw. „Woran man ihn erkennt“ vor, wo noch nichts eingestellt ist. */
  typAngaben?: boolean;
  /** Bei Update (#534): Verweisfelder mit aus_text und wie viele Angaben im alten Textfeld danach umgewandelt werden können. */
  umwandeln?: Array<{ feld: string; aus: string; anzahl: number }>;
  /** Bei Update (#535): vorhandene Felder, die das Paket jetzt mit Format bzw. Datumsgrenzen prüft (nur wo noch nichts eingestellt ist). */
  formate?: string[];
  /** Bei Update (#728): Wie viele Beschriftungen das Paket ergänzt (nur, wo der Administrator nichts beschriftet hat). */
  beschriftungen?: number;
  /** Bei Update (#890): Feldregister, die Abschnitte bekommen (nur, wo noch keine sind). */
  abschnitte?: string[];
  /** Name schon vergeben (von einem anderen Typ) – mit Vorschlag. */
  konflikt: string | null;
  vorschlag: string | null;
  /** Fehlt im DMS, obwohl das Paket ihn installiert hatte (gelöscht) – wird nicht neu angelegt. */
  geloescht?: boolean;
  /** Umbau (#1041): Der Typ entsteht nicht neu, sondern aus diesem vorhandenen (gleiche Id, Name des Pakets). */
  uebernimmt?: string;
  /**
   * Archivmodus, mit dem ein neuer Typ angelegt wird (#1051): Vorgabe des Pakets, mit „beruflich genutzt“ jahreBeruflich;
   * stichtagName ist die Beschriftung des Stichtag-Felds. Fehlt bei vorhandenen Typen – deren Archivmodus bleibt.
   */
  archiv?: Archiv & { stichtagName: string | null };
}

export interface SichtPlan {
  schluessel: string;
  name: string;
  eltern: string | null;
  vorhanden: boolean;
  konflikt: string | null;
  vorschlag: string | null;
  /** Wird nicht installiert (#656), mit Grund. */ ausgelassen?: string | null;
  /** Mappentypen, die hier fehlen – die Ansicht kommt ohne sie (#656). */ ohne?: string[];
  /** Vorhandene Ansicht beim Update (#1125): bleibt, wird ersetzt oder ist geändert (auf Wunsch: `sichtenErsetzen`). */
  zustand?: SichtZustand;
}

/**
 * Abhängigkeit in der Vorschau. problem: der Eintrag aus `probleme`, wenn die installierte Version nicht passt – „Alle
 * aktualisieren“ (#1168) übergeht ihn, wenn dieselbe Runde die Abhängigkeit vorher auf eine passende Version bringt.
 */
export interface AbhaengigkeitPlan {
  id: string;
  bereich: string;
  installiert: string | null;
  ok: boolean;
  verfuegbar: string | null;
  problem?: string;
}

export interface Vorschau {
  paket: {
    id: string;
    name: string;
    version: string;
    beschreibung: string;
    lizenz: string;
    autor: { name: string; github: string };
    dms: string;
    abhaengigkeiten: Record<string, string>;
    readme: string | null;
    changelog: string | null;
    quelle: string | null;
    /** Herausgeber (#1084): aus dem Manifest, sonst der des Katalogs (standardHerausgeber); null = unbekannt. */
    herausgeber: string | null;
    /** Belegt (offizieller Katalog bzw. Schlüssel eines weiteren signierten Katalogs) – sonst „laut Paket, nicht geprüft“. */
    herausgeberGeprueft: boolean;
  };
  dmsVersion: string;
  dmsOk: boolean;
  installiert: string | null;
  update: boolean;
  /** Umzug (#1084): Das Update zieht die Installation von dieser früheren Id auf die neue um; sonst null. */
  umzug: string | null;
  /** Fingerabdruck des weiteren signierten Katalogs, an den der Herausgeber gebunden wird (Sicherheit C); sonst null. */
  herausgeberSchluessel: string | null;
  /** Das installierte Paket nannte keinen Herausgeber; dieses Update setzt ihn – nur mit `herausgeberBestaetigt` (Sicherheit C). */
  herausgeberBestaetigen: string | null;
  /** Herkunft des installierten Pakets (bei einem Update). */
  herkunft: InstalliertesPaket['herkunft'] | null;
  /** Was die Signatur über die Herkunft dieses Pakets sagt (#594); Zeile „Herkunft“ in der Vorschau. */
  pruefung: HerkunftPruefung | null;
  abhaengigkeiten: AbhaengigkeitPlan[];
  typen: TypPlan[];
  sichten: SichtPlan[];
  beispiele: number;
  /** Beispiel-Dokumente zu den Beispielen (#878): Anzahl und Größe zusammen in Bytes. */
  beispielDokumente: { anzahl: number; bytes: number };
  /** Vorgaben (#1038): was angelegt, aktualisiert oder belassen wird – auch in Mappentypen anderer Pakete. */
  vorgaben: VorgabePlan[];
  /** Vorlagen an Vorgaben anderer Pakete (#1038, `ergaenzt`). */
  ergaenzungen: ErgaenzungPlan[];
  /**
   * Umbau (#1041): je Schritt, was umzieht, wohin, was in die Notiz kommt, Rückfragen und Rechte. Nicht leer = das
   * Update braucht `umbauBestaetigt` (nur „Gesamte Verwaltung“, frische Anmeldung) und Antworten auf die Rückfragen.
   */
  umbau: UmbauPlan[];
  /** Was die Installation verhindert. */
  probleme: string[];
  /** Feste Kennungen zu `probleme` für die Oberfläche (#729: nicht am Text erkennen), z. B. „schon-installiert“. */
  fehlercodes: string[];
  /**
   * Namenskonflikte (#1123): die Einträge aus `probleme`, die sich in der Vorschau durch Umbenennen lösen lassen (Typen
   * und Ansichten des Pakets selbst). Mit `namen` bzw. `sichtNamen` beim Installieren fallen sie weg.
   */
  namenskonflikte: string[];
  /** Hinweise, die nicht verhindern (z. B. Code läuft noch nicht). */
  hinweise: string[];
  /**
   * Mitgelieferte Automatisierungen (#712); neu = kommt mit dieser Installation bzw. diesem Update dazu (nur die stehen zur
   * Wahl). eingeschaltet (#1082): wie im Paket angegeben – true = mit gesetztem Haken anbieten; fehlt = nicht angegeben.
   */
  automatisierungen: Array<{
    schluessel: string;
    name: string;
    beschreibung: string;
    neu: boolean;
    eingeschaltet?: boolean;
    /** „täglich um 05:00“ bei „Paket nach Zeitplan ausführen“ (#1082). */ zeitplan?: string;
    /** Update (#1174): selbst geändert – bleibt, wie sie ist; was die neue Fassung aus dem Paket anders macht. */ geaendert?: {
      id: string;
      aenderungen: string[];
    };
  }>;
  /**
   * Automatisierungsvorlagen (#1044) für die Rechte-Vorschau: jede mit ihren Karten in Klartext („Aufgabe an die gewählte
   * Person“), ob sie eine Kern-Vorgabe ersetzt und ob sie neu oder geändert ist (bei einem Update).
   */
  ablaufvorlagen?: Array<{ schluessel: string; name: string; karten: string[]; ersetzt: string | null; neu: boolean; geaendert: boolean }>;
  /** Einstellungen des Pakets (#197): bei einem Update neue und wegfallende Felder. */
  einstellungen: { neu: string[]; weg: string[] } | null;
  /** Code (#338): Rechte, Netzwerkzugriff, Ereignisse (#449) – muss bestätigt werden (bei einem Update nur, wenn sie sich ändern). */
  laeufer: { rechte: RechtePunkt[]; bestaetigen: boolean } | null;
  /** Sprachpaket (#731): Sprache, Abdeckung gegen diese Version, übergangene Texte, Pakete mit Beschriftungen. */
  sprache?: (Sprachangabe & { abdeckung: Abdeckung; uebergangen: number; pakete: string[] }) | null;
  /**
   * Aktionen im Menü „Mappe“ (#1039) mit ihren Rechten und Mappentypen (Namen) – Teil der Rechte-Vorschau. neu: kommt
   * mit diesem Update dazu oder braucht jetzt andere Rechte.
   */
  aktionen?: Array<{
    schluessel: string;
    name: string;
    rechte: MappenAktion['rechte'];
    typen: string[];
    dialog?: MappenAktion['dialog'];
    neu: boolean;
  }>;
  /** Was mitkommt (#1047): alles, was das Paket mitbringt, wie im Katalog; beim Update mit „neu in dieser Version“. */
  mitkommt?: Mitkommt;
  /** Kurzanleitung „So nutzt du es“ (#1047) je Sprache; null ohne. */
  kurzanleitung?: Record<string, string[]> | null;
}

/** Was lege anlegt bzw. ergänzt (#1084: als ein Objekt, damit der Umzug es weiterreichen kann). */
export interface LegeAuftrag {
  paket: Paket;
  herkunft: InstalliertesPaket['herkunft'];
  v: KatalogVersion | undefined;
  plan: Vorschau;
  beispiele: boolean;
  von: Handelnder;
  alt: InstalliertesPaket | null;
  ein: string[];
}

/** Woher ein geplantes Paket kommt (#1084): für den Herausgeber und die Prüfung, ob er stimmen kann. */
export interface PlanQuelle {
  herkunft: InstalliertesPaket['herkunft'];
  pruefung: HerkunftPruefung;
}

export interface InstallierenEingabe {
  id?: string;
  version?: string;
  namen?: Record<string, string>;
  sichtNamen?: Record<string, string>;
  beispiele?: boolean;
  mitAbhaengigkeiten?: boolean;
  /**
   * Schlüssel mitgelieferter Automatisierungen, die gleich eingeschaltet werden (#712); ohne: die mit `eingeschaltet: true`
   * (#1082), alle anderen bleiben aus.
   */
  automatisierungen?: string[];
  /** Katalogadresse (#189); ohne: der offizielle Katalog. */
  quelle?: string;
  /** Hochgeladenes Paket (#189). */
  upload?: string;
  /** Herkunft außerhalb des offiziellen Katalogs ausdrücklich bestätigt (#189). */
  bestaetigt?: boolean;
  /** Rechte und erlaubte Adressen (Netzwerk/Internet) eines Pakets mit Code bestätigt (#338). */
  rechteBestaetigt?: boolean;
  /** Erstmals gesetzter Herausgeber eines Bestandspakets bestätigt (#1084, Vorschau.herausgeberBestaetigen). */
  herausgeberBestaetigt?: boolean;
  /** Umbau bestätigt (#1041, Vorschau.umbau). */
  umbauBestaetigt?: boolean;
  /** Antworten auf die Rückfragen des Umbaus: je alter Typ (Kennung) und Feld. */
  umbauEntscheidungen?: UmbauEntscheidungen;
  /** Setzt die Route (nie aus der Anfrage): Die Person hat „Gesamte Verwaltung“ – nur sie bestätigt einen Umbau. */
  gesamteVerwaltung?: boolean;
  /** Ansichten (Schlüssel), die das Update ersetzt, obwohl sie geändert sind (#1125, Zustand geaendert/unbekannt). */
  sichtenErsetzen?: string[];
}

/** Was ein Update mit Umbau zusätzlich braucht (#1041); setzt die Route aus Anfrage und Anmeldung. */
export interface UmbauEingabe {
  umbauBestaetigt?: boolean;
  umbauEntscheidungen?: UmbauEntscheidungen;
  gesamteVerwaltung?: boolean;
  /** #1125, wie bei InstallierenEingabe. */ sichtenErsetzen?: string[];
}

export const mitPruefung = (v: Vorschau, pruefung: HerkunftPruefung): Vorschau => ({ ...v, pruefung });
