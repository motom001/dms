import type { Entdecken } from '../entdecken/entdecken';
import type { Verbund, ProzessEinstellung } from '../prozesse/prozesse';
import type { Fotostapel } from '../post/fotostapel';
import type { Messung } from '../datenbank/messung';
import type { Systemlast } from '../system/systemlast';
import type { AbfragenStand, Zuruecksetzen } from '../lasttest/abfragestatistik';
import type { SystemQuelle } from '../system/system';
import type { Betrieb } from '../einstellungen/betrieb';
import type { Designs } from '../oberflaeche/designs';
import type { Tresor } from '../geheimnisse/tresor';
import type { Texterkennung } from '../volltext/texterkennung';
import type { Aufgabenmail } from '../aufgaben/aufgabenmail';
import type { Fehlermeldungen } from '../system/fehlermeldungen';
import type { Verwaltung } from '../werkbank/verwaltung';
import type { ApiSchluesselDienst } from '../anmeldung/apischluessel';
import type { Konsolenzugang } from '../system/konsole';
import type { Oidc } from '../anmeldung/oidc';
import type { Wartung } from '../wartung/wartung';
import type { Notfallzugang } from '../notfall/notfall';
import type { Notfallcode } from '../notfall/notfallcode';
import type { Sicherung } from '../sicherung/sicherung';
import type { ExportOrt } from '../export/exportordner';
import type { Wiederherstellung } from '../sicherung/wiederherstellung';
import type { Speicherplatz } from '../dateien/speicherplatz';
import type { Vorschaubilder } from '../dateien/vorschau';
import type { Eingangsordner } from '../post/eingangsordner';
import type { Webdav } from '../webdav/webdav';
import type { Postfaecher } from '../post/postfach';
import type { PostfachOAuth } from '../post/postfach-oauth';
import type { OrdnerPruefung } from '../dateien/ordner';
import type { Paketverwaltung } from '../pakete/verwaltung/index';
import type { LaeuferSicht } from '../laeufer/fern';
import type { Einrichtung } from '../einrichtung/einrichtung';
import type { AnbindungVerwaltung } from '../datenbank/anbindung';

/*
 * Was der Start an Routen und Kontext übergibt (#1278, Schritt 5b; vorher in http/routen.ts). Eigene Datei, damit
 * Kontext (routen-kontext.ts) und Hilfen (routen-hilfen.ts) sie einbinden, ohne http/routen.ts und darüber alle
 * Fachrouten einzubinden.
 */

/** Teuerste Abfragen (#894): nur auf Anfrage gelesen bzw. zurückgesetzt (Lasttest). */
export interface Abfragestatistik {
  stand(anzahl: number): Promise<AbfragenStand>;
  zuruecksetzen(): Promise<Zuruecksetzen>;
}

export interface RoutenExtras {
  /** Rundgänge und Tipps (#831, #832); Standard: aus shared/entdecken. */
  entdecken?: Entdecken;
  /** Mehrere Prozesse (#745): Verbund dieses Prozesses und die Einstellung DMS_PROZESSE. */
  verbund?: Verbund;
  prozessEinstellung?: ProzessEinstellung;
  /** Fotos vom Handy bis „Fertig“ (#490); Standard: Arbeitsordner im Temp-Verzeichnis. */
  fotostapel?: Fotostapel;
  messung?: Messung;
  /** Systemzustand → Auslastung (#409). */
  systemlast?: Systemlast;
  /** Überlastschutz (#544). */
  ueberlast?: import('./ueberlast').Ueberlastschutz;
  /** Warten auf eine freie Verbindung zur Datenbank (#544). */
  verbindungen?: import('../datenbank/db').Verbindungswarten;
  /** Gesundheitsprüfung mit Datenbank (#1198): kurze Abfrage mit Zeitgrenze, kurz zwischengespeichert. */
  datenbank?: { befund(): Promise<import('../datenbank/db').DatenbankBefund> };
  /** Wartezeit auf Verbindungen für den Lasttest (#874), in diesem Prozess. */
  poolmessung?: import('../datenbank/poolmessung').Poolmessung;
  /** Sitzungen der Datenbank mit Sperren (#874). */
  sitzungen?: () => Promise<import('../datenbank/poolmessung').Sitzungsstand | null>;
  /** Teuerste Abfragen aus pg_stat_statements für den Lasttest (#894). */
  abfragen?: Abfragestatistik;
  /** CPU und Speicher je Prozessgruppe für den Lasttest (#895), gemessen im Leiter. */
  prozessgruppen?: () => Promise<import('../lasttest/prozessgruppen').GruppenStand | null>;
  /** Erweiterungen der Suche, pg_trgm und unaccent (#562). */
  erweiterungen?: () => Promise<import('../datenbank/erweiterungen').ErweiterungStand[]>;
  /** Datenbankangaben für die Versionsübersicht. */
  system?: SystemQuelle;
  /** E-Mail-Versand und Adresse des DMS (#37). */
  betrieb?: Betrieb;
  /** Designs der Oberfläche (#21). */
  designs?: Designs;
  /** Schlüssel für verschlüsselte Zugangsdaten (#39). */
  tresor?: Tresor;
  /** Texterkennung und Volltext (#45). */
  texterkennung?: Texterkennung;
  /** Tägliche Zusammenfassung der Aufgaben (#54). */
  aufgabenmail?: Aufgabenmail;
  /** Region der Ablage (#726): Land, Bundesland, Zeitzone. */
  region?: import('../einstellungen/region').RegionDienst;
  /** Sprachen der Ablage (#729): erlaubte Sprachen und Sprache der Installation. */
  sprachen?: import('../sprache/sprachwahl').SprachDienst;
  /** Fehlermeldungen von Benutzern (#70). */
  fehlermeldungen?: Fehlermeldungen;
  /** Technische Aufgaben des Admin-Kontos (#719): Hinweis ohne Einzelheiten beim Alltags-Benutzer. */
  verwaltung?: Verwaltung;
  /** API-Schlüssel (#20). */
  apiSchluessel?: ApiSchluesselDienst;
  /** Befehl `dms` im Container (#244). */
  konsole?: Konsolenzugang;
  /** Anmeldung über einen Anbieter (#241). */
  oidc?: Oidc;
  /** Name des Mandanten (Vollexport, #254). */
  mandantName?: () => Promise<string | null>;
  /** Wartungsmodus (#102). */
  wartung?: Wartung;
  /** Notfallzugang über eine RESCUE-Datei (#108). */
  notfall?: Notfallzugang;
  /** Notfallzugang mit dem Notfallcode vom Notfallblatt (#815). */
  notfallcode?: Notfallcode;
  /** Wem Ablago die Angaben eines Reverse Proxys glaubt (#234) – für „nur aus dem Heimnetz“ (#815). */
  proxy?: import('./proxy').ProxyVertrauen;
  /** Gateways der eigenen Netze (#1355); ohne Angabe aus der Routing-Tabelle. Für Tests fest. */
  gateways?: import('./gateway').Gateways;
  /** Sicherungen (#103–#105). */
  sicherung?: Sicherung;
  /** Export-Ordner (#797): Vollexport, persönliche Exporte, Auskünfte – nie im Sicherungsordner. */
  exporte?: ExportOrt;
  /** Wiederherstellen und Probe (#107, #109). */
  wiederherstellung?: Wiederherstellung;
  /** Speicherplatz-Überwachung (#116). */
  speicherplatz?: Speicherplatz;
  /** Vorschaubilder der ersten Seite (#332). */
  vorschau?: Vorschaubilder;
  /** Eingangsordner (#195). */
  eingangsordner?: Eingangsordner;
  /** WebDAV-Laufwerk (#346). */
  webdav?: Webdav;
  /** Automatisierungen (#674). */
  automatisierungen?: import('../automatisierung').Automatisierungen;
  /** Postfächer (#196). */
  postfaecher?: Postfaecher;
  /** Anmeldung der Postfächer per OAuth 2.0 (#358). */
  postfachOAuth?: PostfachOAuth;
  /** Feste Ordner und überflüssige frühere Variablen (#115). */
  ordner?: OrdnerPruefung;
  /** Paketverwaltung (#188); ohne Angabe: offizieller Katalog über das Netz. */
  pakete?: Paketverwaltung;
  /** Paket-Läufer (#338): Stand für die Werkbank. */
  paketlaeufer?: LaeuferSicht;
  /** Einrichtungsassistent und Datenbank-Anbindung (#119). */
  einrichtung?: Einrichtung;
  anbindung?: AnbindungVerwaltung;
  /** Hinweis zu HAUSHALT_ID (übernommen oder abweichend). */
  mandantHinweis?: string | null;
  /** DMS_LASTTEST gesetzt, aber der Lasttest läuft nicht (echte Ablage, #612): Grund für die Übersicht. */
  lasttestAbbruch?: () => string | null;
  /** Für Tests: Abruf fremder Adressen beim Versionsabgleich. */
  abruf?: (url: string) => Promise<unknown>;
  log?: (m: string) => void;
}
