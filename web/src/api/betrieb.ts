/** Schnittstelle (#1234): Betrieb in der Werkbank: Wartung, Sicherung, Systemzustand, Protokoll, Fehlermeldungen, Übersicht, Export, Tresor, Notfallkontakte. */
import type { UeberfluessigeVariable } from '../../../shared/src/umgebungsvariablen';
import type { Akzeptiert, Schwere } from '../../../shared/src/meldungen';
import type { Auftrag } from '../../../shared/src/auftrag';
import type { BudgetStand, ExternAufruf, KostenEinstellung } from '../../../shared/src/extern';
import type { Notfallkontakt, NotfallkontaktEingabe, NotfallkontakteStand, NotfallMailStand } from '../../../shared/src/notfallkontakte';
import { anfrage } from './anfrage';
import type { ExportUmzug, VollexportStand, WartungOeffentlich } from './konto';
import type { EinrichtungStand, MailSuche, SicherungSchlank, SicherungsMeta, Verbindung, WhSchritt } from './einrichtung';
import type { ExternUebersicht } from './pakete';

/** Antwort auf eine Änderung an einem Notfallkontakt (#812). */
export interface NotfallkontaktErgebnis { kontakt: Notfallkontakt | null; mail: NotfallMailStand | 'keine' | 'grenze' }
/** Externe Dienste (#565): je Dienst und Paket Kennzahlen, die letzten Aufrufe – nur Metadaten. */
export interface ExternZeile extends ExternAufruf { id?: number; zeit: string; benutzerId: string | null; kosten: number }
export type ExterneDiensteStand = ExternUebersicht & { budget: BudgetStand & { waehrung: string }; pakete: Record<string, string> };
export interface ExternSummeZeile { schluessel: string | null; anzahl: number; fehler: number; ms: number; tokenEin: number; tokenAus: number; kosten: number }
export interface ExternKosten {
  monat: string; monate: string[]; einstellung: KostenEinstellung; gesamt: ExternSummeZeile; budget: BudgetStand & { waehrung: string };
  jePaket: ExternSummeZeile[]; jePerson: ExternSummeZeile[]; jeFunktion: ExternSummeZeile[]; teuerste: ExternZeile[];
  rohTage: number; monateAufbewahrt: number;
  personen: Record<string, string>; pakete: Record<string, string>; kiPakete: Array<{ id: string; name: string }>;
}
export interface WartungSitzung { id: string; benutzerId: string; name: string; email: string; rolle: string; geraet: string; ip: string; zuletztAktiv: string; erstellt: string; aktuell: boolean }
export type ExternStatus = 'offen' | 'laeuft' | 'hochgeladen' | 'geprueft' | 'fehlgeschlagen';
export interface ExternStand { status: ExternStatus; pruefung?: 'pruefsumme' | 'stichprobe' | 'groesse' | 'keine'; grund?: string; endgueltig?: boolean; ziel?: string; bytes?: number; gesamt?: number; seit: string; am: string }
export interface Sicherungsziel { id: string; name: string; adresse: string | null; ziel?: string | null }
export interface ExternZustand {
  ziele: Sicherungsziel[];
  letzte: { name: string; paket: string; beginn: string; stand: ExternStand } | null;
  fehler: { name: string; paket: string; beginn: string; stand: ExternStand } | null;
  zuAlt: boolean;
}
export interface SicherungEintrag { name: string; meta: SicherungsMeta | null; schlank?: SicherungSchlank; bytes: number; pruefung?: { am: string; ok: boolean }; probe?: { am: string; ok: boolean; info: string }; extern?: Record<string, ExternStand> }
export interface SicherungsPlan { aktiv: boolean; uhrzeit: string; haeufigkeit: 'taeglich' | 'woechentlich'; wochentag: number; aufbewahrung: { taeglich: number; woechentlich: number; monatlich: number }; mindestFreiGB: number; aktivSeit: string | null; /** #585 */ nurNeueste?: boolean }
export interface SicherungsLauf { art: string; titel: string; status: 'laeuft' | 'fertig' | 'fehler'; schritt: string; bytes: number; gesamt: number; gestartet: string; beendet?: string; fehler?: string; ergebnis?: unknown }
/** Notfallblatt (#106); seit #815 mit Notfallcode: ohne (`ohneCode`) oder benutzt (`codeBenutzt`) ist es nicht mehr aktuell. */
export interface Notfallblattstand {
  am: string | null; von: string | null; fingerabdruck: string | null; aktuell: boolean; ohneCode?: boolean; codeBenutzt?: string | null;
  /** Warum nicht aktuell: fehlt, früherer Schlüssel, noch ohne Notfallcode, Notfallcode benutzt. */
  grund?: 'fehlt' | 'schluessel' | 'ohne-code' | 'benutzt' | null;
  /** Notfallkontakte (#812) seit dem Blatt geändert: „Notfallblatt neu ausdrucken“ (nur unter Verschlüsselung). */
  kontakteGeaendert?: boolean;
}
export interface SicherungsZustand {
  letzte: { name: string; ende: string; art: string } | null;
  fehler: { am: string; art: string; grund: string } | null;
  zuAlt: boolean; planAktiv: boolean; notfallblatt: Notfallblattstand; schluessel: boolean;
  /** Aktueller Schlüssel (#47). */
  fingerabdruck?: string | null;
  ort: { ordner: string; volume: boolean | null; gleichePlatte: boolean | null };
  /** Probe-Wiederherstellung (#109). */
  probe?: ProbeStand;
  /** Kopie außer Haus (#585); null ohne Paket mit dms:sicherung-lesen. */
  extern?: ExternZustand | null;
}
export interface SicherungStand {
  lauf: SicherungsLauf | null; liste: SicherungEintrag[]; plan: SicherungsPlan; zustand: SicherungsZustand;
  /** Laufende oder letzte Probe-Wiederherstellung (#109). */
  probe?: WhLauf | null;
  speicher: { dateienBytes: number; dateien: number; datenbankBytes: number; sicherungenBytes: number; anzahl: number; frei: number | null; gesamt: number | null; hochrechnung: { stueck: number; bytes: number }; mindestBytes: number; knapp: boolean };
}
export interface WhLauf { art: 'wiederherstellung' | 'probe'; sicherung: string; von: string; status: 'laeuft' | 'fertig' | 'fehler' | 'neustart'; schritte: WhSchritt[]; bytes: number; gesamt: number; gestartet: string; beendet?: string; fehler?: string }
export interface ProbeStand { ampel: 'gruen' | 'gelb' | 'rot' | null; letzte: { name: string; am: string; ok: boolean; info: string } | null; plan: { aktiv: boolean; wochentag: number; uhrzeit: string } }
export interface WartungWerkbank extends WartungOeffentlich { beginn: string | null; von: string | null; sitzungen: WartungSitzung[]; /** „Jetzt sofort gesperrt“ (#402) */ sofort?: boolean }
export interface KontaktZuordnung { name: string; email?: string; telefon?: string; adresse?: string; firma?: string; notiz?: string }
export type Stufe = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export interface Protokolleintrag { nr: number; zeit: string; stufe: Stufe; modul: string; text: string; benutzer?: string; anfrage?: string; daten?: Record<string, unknown> }
export interface DebugStand { an: boolean; bis: string | null; grundstufe: string }
export interface ProtokollAntwort { eintraege: Protokolleintrag[]; letzte: number; gespeichert: number; debug: DebugStand; module: string[]; /** Einträge je Modul (#682). */ jeModul?: Record<string, number> }
export interface MessEinstellungen { schwelleMs: number; tage: number }
export interface Langlaeufer { id: number; zeit: string; dauerMs: number; zugriff: string; anfrage: string; benutzer: string }
export interface LaufendeAbfrage { pid: number; seitMs: number; zustand: string; abfrage: string; anwendung: string }
/** Verzögerung der Ereignisschleife in ms (#477). */
export interface Schleifenverzoegerung { median: number; p99: number; max: number; seitSekunden: number }
export type SystemlastAntwort = import('../../../shared/src/systemlast').SystemlastStand & {
  schleife: { aktuell: Schleifenverzoegerung | null; vorher: Schleifenverzoegerung | null; warnungSeit?: string | null; grenzeMs?: number; minuten?: number } | null;
  /** Arbeiter für PDF und große Exporte (#542). */
  arbeiter?: import('../../../shared/src/systemlast').ArbeiterStand;
  /** Erweiterungen der Suche (#562); null = nicht lesbar. */
  erweiterungen?: ErweiterungStand[] | null;
  /** Arbeiter, Verbindungen, Überlastgrenze mit Herkunft (#544). */
  grenzen?: import('../../../shared/src/systemlast').Grenzwerte;
  /** Engpässe, je mit der Variable (#544). */
  engpaesse?: import('../../../shared/src/systemlast').Engpass[];
  /** Zwischenspeicher der Zahlen, Trefferzahlen und Termine (#918): „aus“ mit DMS_ZWISCHENSPEICHER=aus. */
  zwischenspeicher?: 'an' | 'aus';
};
/** Datenbank-Erweiterung der Suche (#562): ok, fehlt oder in einem Schema, das eine Wiederherstellung löscht. */
export interface ErweiterungStand { name: 'pg_trgm' | 'unaccent'; schema: string | null; zustand: 'ok' | 'fehlt' | 'gefaehrdet' }
export interface DatenbankStand {
  einstellungen: MessEinstellungen | null; langlaeufer: Langlaeufer[]; laufend: LaufendeAbfrage[]; auslastung?: { aktuell: Schleifenverzoegerung | null; vorher: Schleifenverzoegerung | null } | null;
  /** Verbindungen zur Datenbank und Warten auf eine freie (#544). */
  verbindungen?: { max: number; quelle: 'vorgabe' | 'umgebung'; messungen: number; median: number | null; p95: number | null; hoechstens: number | null } | null;
  /** Mehrere Prozesse (#745): je Prozess; fehlt mit einem. */
  prozesse?: import('../../../shared/src/systemlast').ProzessZeile[];
}
export interface WerkbankUebersicht {
  tresor: { zustand: string; eingebunden: boolean | null; betroffen: number } | null;
  mail: boolean; adresse: boolean;
  texterkennung: Record<'keiner' | 'wartet' | 'laeuft' | 'fertig' | 'fehler' | 'ausgelassen' | 'paket', number> | null;
  /** #459: Ein Paket übernimmt die Texterkennung. */
  texterkennungPaket?: boolean;
  aufgaben: { offen: number; ohneEmpfaenger: number };
  /** #798: offene Fälle – Aufgaben bei Personen ohne Leserecht. */
  ohneLeserecht?: number;
  /** #877: Dokumentdateien, die beim Lesen fehlten und noch fehlen. */
  dateienFehlen?: number;
  /** #719: Alltags-Benutzer für Aufgaben ohne Empfänger; `moeglich` = aktive Benutzer ohne Admin-Rechte. */
  aufgabenEmpfaenger?: { benutzerId: string | null; moeglich: number } | null;
  unpassend: number;
  papierkorb: { anzahl: number; aeltester: string | null; tage: number };
  version: { version: string; commit: string | null; gebaut: string | null };
  bestand: { version: string; groesseBytes: number; mappen: number; typen: number; benutzer: number; dokumente: number; dokumenteBytes: number } | null;
  fehlermeldungen: number | null;
  /** Automatisierungen (#675): mit fehlgeschlagenen Läufen bzw. angehalten oder fehlerhaft. */
  /** Angehaltene Mappen-Abläufe (#1044). */
  ablaeufe?: { angehalten: Array<{ id: string; vorlage: string; mappeId: string; grund: string }> } | null;
  automatisierungen?: { fehlgeschlagen: number; angehalten: Array<{ id: string; name: string; grund: string }>; /** Erinnerungen am Feld beim Update übernommen (#712), bis gelesen. */ umgezogen?: { am: string; anzahl: number } | null; /** Keine Automatisierung schickt die Tägliche Zusammenfassung (#678). */ ohneBenachrichtigungen?: boolean; /** Keine eingeschaltete Automatisierung legt „Post für dich“ an (#1001). */ ohnePostFuerDich?: boolean;
    /** Adressen, die gerade Aufrufe von außen annehmen (#679). */ aufrufe?: Array<{ id: string; name: string; adresse: string }> };
  /** Notfallzugänge (#108), bis sie umbenannt oder deaktiviert sind. */
  notfallzugaenge?: Array<{ id: string; name: string; erstellt: string }>;
  /** Notfallcode benutzt (#815), bis jemand den Hinweis als gelesen markiert. */
  notfallcodeBenutzt?: Array<{ id: string; benutzerId: string; name: string; am: string }>;
  /** Eine zweite Person mit Verwaltungsrecht empfehlen (#821). */
  zweitePerson?: boolean;
  /** Wartungsmodus (#102). */
  wartung?: WartungOeffentlich | null;
  /** Sicherung (#105). */
  sicherung?: SicherungsZustand | null;
  /** Export-Ordner (#797): liegt im Sicherungsordner; Exporte beim Update verschoben. */
  exporte?: { pfad: string; imSicherungsordner: boolean; umzug: ExportUmzug | null } | null;
  /** Speicherplatz (#116). */
  speicherplatz?: SpeicherplatzStand | null;
  /** Auslastung (#409): CPU oder Arbeitsspeicher seit 5 Minuten über 90 %. */
  auslastung?: Array<'cpu' | 'speicher'>;
  /** Engpässe im Server, je mit der Variable (#544). */
  engpaesse?: import('../../../shared/src/systemlast').Engpass[];
  /** Erweiterungen der Suche, die fehlen oder gefährdet liegen (#562). */
  erweiterungen?: ErweiterungStand[];
  /** Frühere Variablen, die aus der Compose-Datei entfernt werden können (#115), je mit Grund (#478). */
  variablen?: UeberfluessigeVariable[];
  /** Datenbank-Anbindung (#119): DATABASE_URL abweichend, Neustart nötig. */
  anbindung?: { umgebung: 'fehlt' | 'gleich' | 'abweichend'; neustartNoetig: boolean; /** #943 */ ohneVolume?: boolean } | null;
  /** DMS_LASTTEST gesetzt, aber nicht gestartet, weil hier echte Daten liegen (#612). */
  lasttestAbbruch?: string | null;
  /** Einrichtungsassistent (#119): übersprungene Schritte. */
  einrichtung?: EinrichtungStand | null;
  /** Pakete, deren Pflicht-Einstellungen fehlen (#405) – Aufgabe für den Administrator. */
  paketeEinstellungen?: Array<{ id: string; name: string }>;
  /** KI-Dienste (#796): Hinweis nach dem Update, solange niemand „Verstanden“ gewählt hat. */
  kiTypen?: { pakete: Array<{ id: string; name: string }> } | null;
  /** Zahlen für die linke Spalte (#375), bis der Bereich selbst geladen ist; null = unbekannt. */
  zahlen?: { nummernkreise: number | null; pakete: number | null; benutzer: number | null; postfaecher: number | null; darfWeg: number | null };
  /** Postfächer mit abgelaufener oder fehlender OAuth-Anmeldung (#358). */
  postfachAnmeldung?: Array<{ id: string; name: string; zustand: 'abgelaufen' | 'abgemeldet' }>;
  /** Eingangsordner (#915): Warnungen, Ordner ohne Person, nicht umbenannte Personenordner. */
  eingangsordner?: EingangMeldungen | null;
  /** Bewusst akzeptierte Meldungen (#816) je Schlüssel: Schwere beim Akzeptieren, wer, wann, Begründung. */
  akzeptiert?: Akzeptiert;
}
/* Feste Ordner (#115) und Speicherplatz (#116) */
export type OrdnerArt = 'dateien' | 'geheim' | 'sicherung';
export interface OrdnerStand { art: OrdnerArt; pfad: string; text: string; gesamt: number | null; frei: number | null; belegt: number | null; volume: boolean | null; geraet: string | null; zustand?: 'ok' | 'warnung' | 'grenze' | null; warnBytes?: number | null; grenzBytes?: number | null }
export interface Schwelle { wert: number; einheit: 'prozent' | 'gb' }
export interface SpeicherplatzEinstellung { warnung: Schwelle; grenze: Schwelle }
export interface SpeicherplatzStand { zustand: 'ok' | 'warnung' | 'grenze'; gemessen: string; ordner: OrdnerStand[]; einstellung: SpeicherplatzEinstellung; seit: string | null; wartungBeenden: boolean; /** Vorschaubilder (#332), nur beim Abruf der Seite. */ vorschau?: { anzahl: number; bytes: number } | null }
export interface Fehlermeldung {
  id: string; benutzerId: string | null; erstellt: string; text: string; angaben: Record<string, unknown>;
  bilder: Array<{ nr: number; name: string; mime: string; groesse: number }>; erledigt: string | null; erledigtVon: string | null;
}
export interface Systemuebersicht {
  dms: { version: string; commit: string | null; gebaut: string | null; /** #208 */ variante?: 'dms' | 'komplett' };
  laufzeit: { node: string; system: string; architektur: string; container: boolean; alpine: string | null; zeitzone: string; laeuftSeit: string };
  datenbank: { version: string; groesseBytes: number; mappen: number; typen: number; benutzer: number; dokumente: number; dokumenteBytes: number } | { fehler: string };
  bibliotheken: Record<string, string | null>;
  einstellungen: Record<string, string>;
  /** Feste Ordner mit belegtem und freiem Platz (#115). */
  ordner?: OrdnerStand[] | null;
  variablen?: string[];
}
export interface Vergleich { komponente: string; installiert: string | null; aktuell: string | null; status: 'aktuell' | 'neuer' | 'veraltet' | 'unbekannt'; hinweis?: string; quelle: string; /** #216 */ gruppe?: 'selbst' | 'dms'; bezeichnung?: string }
export interface MailAnsicht {
  aktiv: boolean; host: string; port: number; verbindung: Verbindung; benutzer: string; absender: string; selbstsigniert: boolean;
  /** #813: Passwort oder Anmeldung über OAuth (Microsoft 365, Google). */
  anmeldung: 'passwort' | 'oauth'; anbieter?: 'microsoft' | 'google';
  /** Das Passwort selbst kommt nie zurück. */
  passwortGesetzt: boolean;
  /** false = mit einem verlorenen Schlüssel verschlüsselt (#39). */
  passwortLesbar: boolean;
  /** Noch im Klartext aus einer älteren Version, bis es einen Schlüssel gibt. */
  passwortUnverschluesselt: boolean;
}
export type MailEingabe = Omit<MailAnsicht, 'passwortGesetzt' | 'passwortLesbar' | 'passwortUnverschluesselt'> & { passwort?: string; passwortLoeschen?: boolean };
export interface BetriebAnsicht {
  mail: MailAnsicht; adresse: string; vorschlag: string | null; verbindungen: Record<Verbindung, string>; passwoerterMoeglich: boolean;
  /** #813: Zustand der OAuth-Anmeldung des Versands (ohne Token); Name der Ablage für den Absender. */
  oauth?: OAuthStatus | null; oauthMoeglich?: boolean; ablage?: string | null;
}
export interface TresorStatus {
  zustand: 'vorhanden' | 'fehlt' | 'verloren' | 'falsch';
  fingerabdruck: string | null; erwartet: string | null; erstellt: string | null; datei: string;
  eingebunden: boolean | null;
  betroffen: Array<{ bereich: string; was: string; wo?: string }>;
  /** Was verschlüsselt gespeichert ist, mit Anzahl je Art (#410). */
  arten?: Array<{ art: string; name: string; anzahl: number; unlesbar: number }>;
  /** Notfallblatt zum aktuellen Schlüssel (#106). */
  notfallblatt?: Notfallblattstand | null;
}
export interface Probe { ok: boolean; meldung: string; /** Antwort des Servers (#813). */ technisch?: string }
export type EingangWarnung = 'alt' | 'groesse' | 'fehler' | 'anzahl';
/** Eingangsordner in der Werkbank-Übersicht (#915). */
export interface EingangMeldungen {
  warnungen: EingangWarnung[]; dateien: number; bytes: number; aeltester: string | null; fehler: number;
  grenzen: { tage: number; gb: number; dateien: number }; ohnePerson: string[]; umbenennen: Array<{ alt: string; neu: string }>;
}
export interface OAuthStatus { angemeldet: boolean; zustand: 'ok' | 'abgelaufen' | 'abgemeldet'; ablauf: string | null; angemeldetAm: string | null; von: string | null; fehler: string | null }

export const betriebApi = {
  wartung: () => anfrage<WartungOeffentlich>('GET', '/api/wartung'),
  sicherung: () => anfrage<SicherungStand>('GET', '/api/werkbank/sicherung'),
  sicherungLauf: () => anfrage<SicherungsLauf | null>('GET', '/api/werkbank/sicherung/lauf'),
  sicherungJetzt: () => anfrage<SicherungsLauf>('POST', '/api/werkbank/sicherung/jetzt'),
  sicherungPlan: (p: Partial<SicherungsPlan>) => anfrage<SicherungsPlan>('PUT', '/api/werkbank/sicherung/plan', p),
  sicherungPruefen: (name: string) => anfrage<SicherungsLauf>('POST', `/api/werkbank/sicherung/${encodeURIComponent(name)}/pruefen`),
  probeStarten: (name?: string) => anfrage<WhLauf>('POST', '/api/werkbank/sicherung/probe', name ? { name } : {}),
  probeLauf: () => anfrage<WhLauf | null>('GET', '/api/werkbank/sicherung/probe'),
  probePlan: (p: { aktiv?: boolean; wochentag?: number; uhrzeit?: string }) => anfrage<unknown>('PUT', '/api/werkbank/sicherung/probe-plan', p),
  sicherungLoeschen: (name: string) => anfrage<null>('DELETE', `/api/werkbank/sicherung/${encodeURIComponent(name)}`),
  /** Herunterladen (#975): die verschlüsselte Datei (heikle Handlung, frische Anmeldung) und die Metadaten daneben. */
  sicherungDateiUrl: (name: string) => `/api/werkbank/sicherung/${encodeURIComponent(name)}/datei`,
  sicherungMetadatenUrl: (name: string) => `/api/werkbank/sicherung/${encodeURIComponent(name)}/metadaten`,
  werkbankWartung: () => anfrage<WartungWerkbank>('GET', '/api/werkbank/wartung'),
  /** beginn (ISO) statt vorlauf (#402); sofort = „Jetzt sofort sperren“ (wie vorlauf 0). */
  wartungEin: (d: { text: string; ende: string | null; vorlauf?: number; beginn?: string; sofort?: boolean }) => anfrage<unknown>('POST', '/api/werkbank/wartung/ein', d),
  wartungJetzt: () => anfrage<unknown>('POST', '/api/werkbank/wartung/jetzt'),
  wartungAus: () => anfrage<unknown>('POST', '/api/werkbank/wartung/aus'),
  openapi: () => anfrage<Record<string, unknown>>('GET', '/api/openapi.json'),
  volltextNachholen: () => anfrage<{ eingereiht: number }>('POST', '/api/werkbank/wartung/volltext'),
  /** „Volltext neu erzeugen“ (#458): Anzahl für die Rückfrage, dann Auftrag. */
  volltextNeuAnzahl: (umfang: 'ohne' | 'alle') => anfrage<{ umfang: 'ohne' | 'alle'; anzahl: number; paket: { id: string; name: string; version: string } | null }>('GET', `/api/werkbank/wartung/volltext-neu?umfang=${umfang}`),
  volltextNeu: (umfang: 'ohne' | 'alle') => anfrage<Auftrag>('POST', '/api/werkbank/wartung/volltext-neu', { umfang }),
  auftragAbbrechen: (id: string) => anfrage<Auftrag>('POST', '/api/werkbank/auftrag/abbrechen', { id }),
  vorschauNachholen: () => anfrage<{ eingereiht: number }>('POST', '/api/werkbank/wartung/vorschau'),
  auftrag: () => anfrage<Auftrag | null>('GET', '/api/werkbank/auftrag'),
  nummernVorschau: (typId: string, feldKey: string) => anfrage<{ anzahl: number; von: string | null; bis: string | null }>('GET', `/api/werkbank/wartung/nummern?typ=${encodeURIComponent(typId)}&feld=${encodeURIComponent(feldKey)}`),
  absenderVorschau: () => anfrage<{ posten: Array<{ id: string; titel: string; absender: string; kanal: string; erstellt: string }> }>('GET', '/api/werkbank/wartung/absender'),
  absenderBereinigen: (ids: string[]) => anfrage<{ bereinigt: number }>('POST', '/api/werkbank/wartung/absender', { ids }),
  /** Angaben, die nicht zum Format passen (#535). */
  formateUnpassend: () => anfrage<{ typen: Array<{ typId: string; typ: string; felder: Array<{ key: string; label: string; anzahl: number; mappen: Array<{ id: string; titel: string; wert: string; grund: string }> }> }> }>('GET', '/api/werkbank/wartung/formate'),
  nummernNachtragen: (typId: string, feldKey: string) => anfrage<Auftrag>('POST', '/api/werkbank/wartung/nummern', { typId, feldKey }),
  protokoll: (f: Record<string, string | number | undefined>) =>
    anfrage<ProtokollAntwort>('GET', `/api/werkbank/protokoll?${new URLSearchParams(Object.entries(f).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]))}`),
  debug: (an: boolean) => anfrage<DebugStand>('PUT', '/api/werkbank/debug', { an }),
  datenbank: () => anfrage<DatenbankStand>('GET', '/api/werkbank/datenbank'),
  /** Externe Dienste (#565): Kennzahlen der letzten Stunden, Budget; Kosten je Monat; je Paket. */
  extern: (stunden: number) => anfrage<ExterneDiensteStand>('GET', `/api/werkbank/system/extern?stunden=${stunden}`),
  externKosten: (monat?: string) => anfrage<ExternKosten>('GET', `/api/werkbank/system/extern/kosten${monat ? `?monat=${encodeURIComponent(monat)}` : ''}`),
  setzeExternKosten: (e: KostenEinstellung) => anfrage<ExternKosten>('PUT', '/api/werkbank/system/extern/kosten', e),
  system: () => anfrage<Systemuebersicht>('GET', '/api/werkbank/system'),
  speicherplatz: () => anfrage<SpeicherplatzStand>('GET', '/api/werkbank/speicherplatz'),
  /** Auslastung (#409): CPU, Arbeitsspeicher, Netzwerk, Wartezeit der Ereignisschleife (#477). */
  systemlast: () => anfrage<SystemlastAntwort>('GET', '/api/werkbank/systemlast'),
  // Notfallkontakte (#812): Werkbank → Verschlüsselung, Einrichtungsassistent.
  notfallkontakte: () => anfrage<NotfallkontakteStand>('GET', '/api/werkbank/notfallkontakte'),
  notfallkontaktAnlegen: (e: NotfallkontaktEingabe) => anfrage<NotfallkontaktErgebnis>('POST', '/api/werkbank/notfallkontakte', e),
  notfallkontaktAendern: (id: string, e: NotfallkontaktEingabe) => anfrage<NotfallkontaktErgebnis>('PUT', `/api/werkbank/notfallkontakte/${encodeURIComponent(id)}`, e),
  notfallkontaktLoeschen: (id: string) => anfrage<NotfallkontaktErgebnis>('DELETE', `/api/werkbank/notfallkontakte/${encodeURIComponent(id)}`),
  notfallkontaktErneut: (id: string) => anfrage<NotfallkontaktErgebnis>('POST', `/api/werkbank/notfallkontakte/${encodeURIComponent(id)}/erneut`),
  speicherplatzSetzen: (e: SpeicherplatzEinstellung) => anfrage<SpeicherplatzStand>('PUT', '/api/werkbank/speicherplatz', e),
  versionsabgleich: (browser: Record<string, string>) => anfrage<Vergleich[]>('POST', '/api/werkbank/system/abgleich', { browser }),
  datenbankEinstellen: (e: MessEinstellungen) => anfrage<MessEinstellungen>('PUT', '/api/werkbank/datenbank', e),
  /* E-Mail-Versand und Adresse des DMS (#37) */
  tresor: () => anfrage<TresorStatus>('GET', '/api/werkbank/tresor'),
  uebersicht: () => anfrage<WerkbankUebersicht>('GET', '/api/werkbank/uebersicht'),
  meldungAkzeptieren: (schluessel: string, art: Schwere, grund?: string) => anfrage<Akzeptiert>('POST', '/api/werkbank/uebersicht/akzeptieren', { schluessel, art, grund }),
  akzeptanzAufheben: (schluessel: string[], anlass: 'eingeblendet' | 'erledigt' | 'schwerer') => anfrage<Akzeptiert>('POST', '/api/werkbank/uebersicht/aufheben', { schluessel, anlass }),
  /** „Nein, danke“ bzw. „Gelesen“ an einem Hinweis, der danach nicht wiederkommt (#821, #815). */
  meldungErledigt: (schluessel: string) => anfrage<null>('POST', '/api/werkbank/uebersicht/erledigt', { schluessel }),
  fehlermeldungen: (erledigt = false) => anfrage<Fehlermeldung[]>('GET', `/api/werkbank/fehlermeldungen${erledigt ? '?erledigt' : ''}`),
  fehlermeldung: (id: string) => anfrage<Fehlermeldung>('GET', `/api/werkbank/fehlermeldungen/${id}`),
  fehlermeldungErledigt: (id: string, erledigt: boolean) => anfrage<Fehlermeldung>('POST', `/api/werkbank/fehlermeldungen/${id}/erledigt`, { erledigt }),
  fehlermeldungLoeschen: (id: string) => anfrage<void>('DELETE', `/api/werkbank/fehlermeldungen/${id}`),
  tresorErzeugen: () => anfrage<TresorStatus>('POST', '/api/werkbank/tresor/erzeugen'),
  /** Schlüssel wechseln (#47). */
  tresorWechseln: () => anfrage<TresorStatus & { alt: string; neu: string; umgeschluesselt: number; unlesbar: number; alteSicherungen: number }>('POST', '/api/werkbank/tresor/wechseln', { bestaetigt: true }),
  betrieb: () => anfrage<BetriebAnsicht>('GET', '/api/werkbank/betrieb'),
  mailSpeichern: (m: MailEingabe) => anfrage<BetriebAnsicht>('PUT', '/api/werkbank/betrieb/mail', m),
  adresseSpeichern: (adresse: string) => anfrage<BetriebAnsicht>('PUT', '/api/werkbank/betrieb/adresse', { adresse }),
  mailPruefen: (m: MailEingabe) => anfrage<Probe>('POST', '/api/werkbank/betrieb/mail/pruefen', m),
  testmail: (m: MailEingabe, an: string) => anfrage<Probe>('POST', '/api/werkbank/betrieb/mail/testmail', { mail: m, an }),
  /* E-Mail-Versand leicht einrichten (#813) */
  mailFinden: (email: string, thunderbird = false) => anfrage<MailSuche>('POST', '/api/werkbank/betrieb/mail/finden', { email, thunderbird }),
  mailOAuthStart: () => anfrage<{ url: string }>('POST', '/api/werkbank/betrieb/mail/oauth/start'),
  mailOAuthGeraet: () => anfrage<{ code: string; adresse: string; bis: string; intervall: number }>('POST', '/api/werkbank/betrieb/mail/oauth/geraet'),
  mailOAuthGeraetPruefen: () => anfrage<{ fertig: boolean; text: string }>('POST', '/api/werkbank/betrieb/mail/oauth/geraet/pruefen'),
  mailOAuthAbmelden: () => anfrage<BetriebAnsicht>('POST', '/api/werkbank/betrieb/mail/oauth/abmelden'),
  /* Vollexport (#254) */
  vollexport: () => anfrage<VollexportStand>('GET', '/api/werkbank/export'),
  vollexportStarten: (o: { passwoerter: boolean; passwoerterBestaetigt: boolean; protokolle: boolean; kontakte: Record<string, KontaktZuordnung> }) => anfrage<Auftrag>('POST', '/api/werkbank/export', o),
  vollexportPruefen: (name: string) => anfrage<{ ok: boolean; dateien: number; fehlend: string[]; abweichend: string[] }>('POST', `/api/werkbank/export/${encodeURIComponent(name)}/pruefen`),
  /** SHA256SUMS eines Exports (#1195), auch nach dem Herunterladen der ZIP. */
  vollexportPruefsummenUrl: (name: string) => `/api/werkbank/export/${encodeURIComponent(name)}/pruefsummen`,
  vollexportZipUrl: (name: string) => `/api/werkbank/export/${encodeURIComponent(name)}/zip`,
  vollexportLoeschen: (name: string) => anfrage<null>('DELETE', `/api/werkbank/export/${encodeURIComponent(name)}`),
  vollexportUmzugGesehen: () => anfrage<null>('POST', '/api/werkbank/export/umzug-gesehen'),
  persoenlicherExport: (erlaubt: boolean) => anfrage<{ erlaubt: boolean }>('PUT', '/api/werkbank/export/persoenlich', { erlaubt }),
  dateienPruefen: () => anfrage<Auftrag>('POST', '/api/werkbank/wartung/dateien'),
};
