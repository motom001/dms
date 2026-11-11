import type { Readable } from 'node:stream';
import type { Benutzer } from '../../shared/src/model';
import type { Dienst } from './dienst';
import { Fachfehler } from './fehler';
import type { Konten } from './konten';
import type { SitzungIntern } from './konto-repo';
import { openapi, v1Routen } from './api-v1';
import { NUR_ZAEHLER, ZAEHLER_PFAD, type ApiSchluessel, type ApiSchluesselDienst } from './apischluessel';
import type { Designs } from './designs';
import type { Oidc } from './oidc';
import type { ExportOrt } from './exportordner';
import { t } from './sprache';
import { ALS_KOPF, KONSOLE_KOPF, istLoopback, konsolenBenutzer, type Konsolenzugang } from './konsole';
import { bereicheDerRoute, heikleHandlung, JEDER, NUR_GESAMT } from './verwaltungsbereiche';
import { darfBereich, darfVerwalten, hatGesamt } from '../../shared/src/verwaltungsrecht';
import type { Messung } from './messung';
import type { Vorschaubilder } from './vorschau';
import { Paketverwaltung } from './pakete';
import type { LaeuferSicht } from './laeufer/fern';
import { Entdecken } from './entdecken';
import { eigeneVersion, type SystemQuelle } from './system';
import type { Fehlermeldungen } from './fehlermeldungen';
import type { Verwaltung } from './verwaltung';
import type { Stufe } from './protokoll';
import type { Betrieb } from './betrieb';
import { maskiere, type Tresor } from './tresor';
import type { Texterkennung } from './texterkennung';
import type { Wartung } from './wartung';
import type { Notfallzugang } from './notfall';
import type { Sicherung } from './sicherung';
import type { Wiederherstellung } from './wiederherstellung';
import type { Speicherplatz } from './speicherplatz';
import type { AbfragenStand, Zuruecksetzen } from './abfragestatistik';
import type { Systemlast } from './systemlast';
import type { ProzessEinstellung, Verbund } from './prozesse';
import type { Eingangsordner } from './eingangsordner';
import type { Webdav } from './webdav';
import type { Postfaecher } from './postfach';
import type { PostfachOAuth } from './postfach-oauth';
import type { OrdnerPruefung } from './ordner';
import type { Einrichtung } from './einrichtung';
import type { AnbindungVerwaltung } from './anbindung';
import type { Notfallcode } from './notfallcode';
import { Fotostapel } from './fotostapel';
import type { Aufgabenmail } from './aufgabenmail';
import { SITZUNG_COOKIE, SITZUNG_SEKUNDEN, ok } from './http/routen-hilfen';
import { routenKontext, type RoutenKontext } from './http/routen-kontext';
import { anmeldungRouten, notfallRouten } from './anmeldung/anmeldung.routen';
import { kontenRouten, apiSchluesselRouten } from './konten/konten.routen';
import { typenRouten, typenArchivRouten, berechtigungenRouten } from './mappentypen/mappentypen.routen';
import { werkbankRouten, werkbankUebersichtRouten, werkbankEinstellungenRouten } from './werkbank/werkbank.routen';
import { exportRouten } from './ausgang/ausgang.routen';
import { datenschutzRouten, abrufRouten } from './datenschutz/datenschutz.routen';
import { organisationRouten } from './organisation/organisation.routen';
import { textsatzRouten } from './textsatz/textsatz.routen';
import { paketeRouten, paketeEinstellungenRouten } from './pakete/pakete.routen';
import { sucheRouten } from './suche/suche.routen';
import { wartungRouten } from './wartung/wartung.routen';
import { sicherungRouten } from './sicherung/sicherung.routen';
import { betriebRouten, systemRouten, systemzustandRouten } from './system/system.routen';
import { postfaecherRouten } from './post/post.routen';
import { automatisierungRouten } from './automatisierung/automatisierung.routen';
import { webhooksRouten, kontoWebhooksRouten } from './webhooks/webhooks.routen';
import { ablageRouten } from './sichten/sichten.routen';
import { aufgabenRouten } from './aufgaben/aufgaben.routen';
import { mappenRouten } from './mappen/mappen.routen';
import { dokumenteRouten } from './dokumente/dokumente.routen';

/** Früher hier definiert (#960: nach http/routen-hilfen.ts verschoben), weiter auch von hier erreichbar. */
export { SITZUNG_COOKIE, SITZUNG_SEKUNDEN, ZWEITE_ABGELEHNT, leseCookie, BINDUNG_COOKIE, ANBIETER_COOKIE, POSTFACH_BINDUNG_COOKIE, kurzCookie, passtEtag, nurEigeneBereiche, kontaktVorschlaege } from './http/routen-hilfen';

/** Teuerste Abfragen (#894): nur auf Anfrage gelesen bzw. zurückgesetzt (Lasttest). */
export interface Abfragestatistik { stand(anzahl: number): Promise<AbfragenStand>; zuruecksetzen(): Promise<Zuruecksetzen> }

/**
 * Alle Schnittstellen an einem Ort, jede mit ihrer Zugriffsstufe:
 *   offen      – ohne Anmeldung (Einrichtung, Anmeldung, Passwort-Links)
 *   angemeldet – jeder angemeldete Benutzer
 *   admin      – Werkbank: nur im Verwaltungsmodus (#819) und nur mit Recht auf den Bereich der Route (#818,
 *                Zuordnung in verwaltungsbereiche.ts); nie mit einem API-Schlüssel
 * Der HTTP-Adapter (http.ts) setzt die Stufen durch.
 */
export type Zugang = 'offen' | 'angemeldet' | 'admin';

export interface Anfrage {
  body: unknown;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  benutzer?: Benutzer;
  sitzung?: string;
  /** Daten der Sitzung (nach pruefeZugang). */
  sitzungsDaten?: SitzungIntern;
  ip: string;
  /** User-Agent des Browsers. */
  geraet?: string;
  /** Angemeldet über einen API-Schlüssel (nur /api/v1). */
  apiSchluessel?: ApiSchluessel;
  /** Kopf Cookie, für weitere Cookies als die Sitzung (#241). */
  cookieKopf?: string;
  /** Direkte Gegenstelle der Verbindung (ohne Proxy-Köpfe) – für den Konsolenzugang (#244). */
  peer?: string;
  /** Über den Befehl `dms` im Container (#244). */
  konsole?: boolean;
  /** Kopf X-Einrichtungscode (#119), solange das DMS nicht eingerichtet ist. */
  einrichtungscode?: string;
  /** Läuft in dieser Sitzung der Verwaltungsmodus (#819)? Dann ist `benutzer.rolle` = `admin`. */
  verwaltungsmodus?: boolean;
  /** Weitere Köpfe der Anfrage (klein geschrieben), z. B. If-None-Match beim Zähler-Endpunkt (#625). */
  kopf?: (name: string) => string | undefined;
}
export interface Datei {
  inhalt: Readable | Buffer;
  name: string;
  /** Nur bei erkannten PDFs und Bildern wird im Browser angezeigt, sonst immer heruntergeladen. */
  mime: string;
  anzeigen: boolean;
  groesse: number;
  /** Zusätzliche Kopfzeilen, z. B. ausgelassene Mappen beim Export (#294). */
  koepfe?: Record<string, string>;
}
export interface Antwort {
  status?: number; body?: unknown; sitzungSetzen?: string | null; datei?: Datei;
  /** Weiterleitung (302), z. B. zum Anbieter (#241). */
  weiterleiten?: string;
  /** Weitere Cookies (Set-Cookie). */
  cookies?: string[];
  /** Antwort Stück für Stück (#444): NDJSON, eine Zeile je Ereignis, ohne Zwischenspeicher im Proxy. */
  strom?: Readable;
  /** Zusätzliche Köpfe einer JSON-Antwort, z. B. ETag (#625); gehen den Standardköpfen vor. */
  koepfe?: Record<string, string>;
  /**
   * Erst nach der Antwort (#741), z. B. „zuletzt geöffnet“ und „gesehen“ beim Öffnen einer Mappe (http.ts, `Nachlauf`).
   * Nur für Merkposten, die einen Augenblick später ankommen dürfen. Fehler nur im Protokoll.
   */
  danach?: Array<() => Promise<unknown>>;
}
export interface Route {
  methode: 'GET' | 'POST' | 'PUT' | 'DELETE';
  pfad: string;
  zugang: Zugang;
  /** Rohdaten statt JSON (Datei-Upload) mit dieser Obergrenze in Bytes. */
  roh?: number;
  /**
   * Mit `roh`: Der Körper kommt als Strom in eine temporäre Datei (#746), `body` ist dann ein `Hochgeladen` statt eines
   * Puffers – für Dokumente bis 100 MB, die nicht ganz im Arbeitsspeicher liegen sollen.
   */
  strom?: boolean;
  /** Teil der öffentlichen API (/api/v1): API-Schlüssel erlaubt. */
  api?: boolean;
  /** Nur über den Befehl `dms` im Container (#244). */
  konsole?: boolean;
  /**
   * Liest nur, auch wenn es ein POST ist (Vorschau, Zählen, Testlauf): Die Anfragezeile steht
   * dann nur auf Stufe „debug“ im Protokoll, wie bei GET (#373).
   */
  lesend?: boolean;
  /** Öffentliche API (#818): Bereich der Werkbank wie bei dieser internen Route. */
  bereichVon?: { methode: string; pfad: string };
  /** Keine automatische HEAD-Route (z. B. Einmal-Download: ein HEAD würde das Ticket verbrauchen). */
  ohneHead?: boolean;
  /**
   * Abfrage im Hintergrund (#919, #921): Die Oberfläche fragt sie von selbst nach (alle 10–15 s, nur im sichtbaren Tab).
   * Sie zählt nie als Aktivität – verlängert den Verwaltungsmodus nicht (auch nicht mit `x-dms-aktiv`) und setzt
   * „zuletzt aktiv“ der Sitzung nicht.
   */
  still?: boolean;
  handler(a: Anfrage): Promise<Antwort>;
}

/** Rückmeldung zur Kopie außer Haus per PUT (#585) – nur noch im Übergang für Pakete vor #636; entfällt mit 1.0.0 (uebergaenge.ts, #902). */
const SICHERUNG_EXTERN_PFAD = '/api/v1/sicherungen/:name/extern';

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
  verbindungen?: import('./db').Verbindungswarten;
  /** Wartezeit auf Verbindungen für den Lasttest (#874), in diesem Prozess. */
  poolmessung?: import('./poolmessung').Poolmessung;
  /** Sitzungen der Datenbank mit Sperren (#874). */
  sitzungen?: () => Promise<import('./poolmessung').Sitzungsstand | null>;
  /** Teuerste Abfragen aus pg_stat_statements für den Lasttest (#894). */
  abfragen?: Abfragestatistik;
  /** CPU und Speicher je Prozessgruppe für den Lasttest (#895), gemessen im Leiter. */
  prozessgruppen?: () => Promise<import('./prozessgruppen').GruppenStand | null>;
  /** Erweiterungen der Suche, pg_trgm und unaccent (#562). */
  erweiterungen?: () => Promise<import('./erweiterungen').ErweiterungStand[]>;
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
  region?: import('./region').RegionDienst;
  /** Sprachen der Ablage (#729): erlaubte Sprachen und Sprache der Installation. */
  sprachen?: import('./sprachwahl').SprachDienst;
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
  /** Webhooks (#627): eigene im Profil, Übersicht, Abschalten und freigegebene Ziele in der Werkbank. */
  webhooks?: import('./webhook').Webhooks;
  /** Automatisierungen (#674). */
  automatisierungen?: import('./automatisierung').Automatisierungen;
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

/** Routen der Fachbereiche (#960), in der Reihenfolge, in der sie früher hier standen (Registrierreihenfolge). */
const BEREICHE: Array<(k: RoutenKontext) => Route[]> = [
  anmeldungRouten,
  kontenRouten,
  typenRouten,
  werkbankRouten,
  exportRouten,
  datenschutzRouten,
  notfallRouten,
  abrufRouten,
  organisationRouten,
  textsatzRouten,
  typenArchivRouten,
  paketeRouten,
  sucheRouten,
  paketeEinstellungenRouten,
  wartungRouten,
  sicherungRouten,
  betriebRouten,
  werkbankUebersichtRouten,
  berechtigungenRouten,
  systemRouten,
  postfaecherRouten,
  automatisierungRouten,
  webhooksRouten,
  systemzustandRouten,
  ablageRouten,
  aufgabenRouten,
  werkbankEinstellungenRouten,
  mappenRouten,
  dokumenteRouten,
  kontoWebhooksRouten,
  apiSchluesselRouten,
];

export function routen(dienst: Dienst, konten: Konten, x: RoutenExtras = {}): Route[] {
  const k = routenKontext(dienst, konten, x);
  const { zg } = k;
  const intern: Route[] = BEREICHE.flatMap((f) => f(k));
  // Öffentliche API /api/v1 und ihre Beschreibung (aus der installierten Version).
  const doku = async () => ok(openapi(eigeneVersion()));
  // Die Id des Typs Post ändert sich nicht (Systemtyp); einmal nachgeschlagen.
  let postId: string | undefined;
  const alle: Route[] = [
    ...intern,
    // Post (#1042): alte Namen absender/fuer in Antworten der v1 mitliefern (Übergang bis 1.0.0).
    ...v1Routen(intern, { postTypId: async () => (postId ??= (await dienst.kern.system()).post.id) }),
    { methode: 'GET', pfad: '/api/openapi.json', zugang: 'offen', handler: doku },
    { methode: 'GET', pfad: '/api/v1/openapi.json', zugang: 'offen', handler: doku },
  ];
  // Kein verschlüsselter Wert verlässt den Server: Passwortfelder erscheinen als { gesetzt, lesbar } (#46).
  const lesbar = (v: string) => !!x.tresor?.lesbar(v);
  // Dienstkonten (#338): Dokumente nur mit dem bestätigten Recht – lesen (GET) bzw. schreiben.
  // Dienstkonten von Paketen (#338): Dokumente nur mit dem Recht aus dem Manifest; E-Mail-Versand nie (Anhänge, Netz).
  // Vorlagen (#1040): Liste und „Text setzen“ lesen Vorlagen (Dokumente) und legen Dokumente ab – wie Dokumente.
  const dokumentRoute = (r: Route) => /\/dokumente\b|\/archivnummern\b|\/vektoren\b|\/mappen\/[^/]+\/vorlagen\b/.test(r.pfad);
  const nieFuerPakete = (r: Route) => /\/email\b/.test(r.pfad);
  // Vektoren (#442) ändern das Dokument nicht: Lesen reicht, das Recht dms:vektoren prüft der Dienst.
  // Fassung und Vorschaubild (#577) ändern das Dokument auch nicht: Lesen reicht, dms:umwandeln prüft der Dienst.
  const lesendePost = (r: Route) => /\/dokumente\/gleiche$|\/dokumente\/:id\/vektor$|\/vektoren\/aehnliche$|\/dokumente\/:id\/(fassung|vorschaubild|archivfassung)$/.test(r.pfad);
  // Volltext und Sprache (#614): mit dms:volltext reicht Lesen – für welche Dokumente, prüft der Dienst (Dateitypen des Pakets).
  const nurVolltext = (r: Route, s: readonly string[] | undefined) => r.methode === 'PUT' && /\/dokumente\/:id\/(volltext|sprache)$/.test(r.pfad) && !!s?.includes('dms:volltext');
  const dokumentRecht = async (r: Route, a: Anfrage): Promise<'keine' | 'lesen' | 'schreiben' | null> => {
    if (a.benutzer?.art !== 'dienst') return null;
    if (nieFuerPakete(r)) throw new Fachfehler(403, t('meldungen.routen.pakete-duerfen-keine-e'));
    const paket = (await zg(a)).paket;
    const recht = paket?.dokumente ?? 'keine';
    if (!dokumentRoute(r)) return recht;
    const schreibt = r.methode !== 'GET' && !lesendePost(r) && !nurVolltext(r, paket?.schnittstellen);
    if (recht === 'keine' || (schreibt && recht !== 'schreiben')) throw new Fachfehler(403, t('meldungen.routen.dieses-paket-darf-das'));
    return recht;
  };
  /** Ohne Dokumentrecht sieht ein Paket an der Mappe auch die Liste der Dokumente nicht. */
  const ohneDokumente = (body: unknown) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
    const { dokumente: _weg, ...rest } = body as Record<string, unknown>;
    return rest;
  };
  return alle.map((r) => ({
    ...r,
    handler: async (a: Anfrage) => {
      const paketRecht = await dokumentRecht(r, a);
      const antwort = await r.handler(a);
      if (antwort.body === undefined) return antwort;
      const body = paketRecht === 'keine' && r.methode === 'GET' && /\/mappen\/:id$/.test(r.pfad) ? ohneDokumente(antwort.body) : antwort.body;
      return { ...antwort, body: maskiere(body, lesbar) };
    },
  }));
}


/** Zu welchem Modul eine Anfrage gehört (für das Protokoll). */
/**
 * Stufe der Anfragezeile im Protokoll („POST /api/… 200“): Fehler des Servers immer, Lesendes
 * (GET oder als lesend markierte POSTs wie Vorschauen, #373 – dort auch abgewiesene) nur auf „debug“,
 * häufige Abfragen auf „trace“. Ändernde Aufrufe stehen auf „info“.
 */
export function anfrageStufe(x: { methode: string; url: string; status: number; lesend?: boolean }): Stufe {
  const api = x.url.startsWith('/api/');
  if (x.status >= 500) return 'error';
  if (!api) return 'debug';
  if (/^\/api\/(werkbank\/(protokoll|auftrag)|gesundheit)\b/.test(x.url)) return 'trace';
  if (x.status === 401 && x.url === '/api/konto/status') return 'debug';
  if (x.lesend || (x.methode === 'GET' && x.status < 400)) return 'debug';
  return 'info';
}

export function modulAus(url: string): string {
  if (/^\/api\/(konto|benutzer|personen|rollen|notfall)\b/.test(url)) return 'konto';
  if (/^\/api\/(dokumente|mappen\/[^/]+\/dokumente)\b/.test(url)) return 'dokumente';
  if (/^\/api\/(mappen|sichten|papierkorb|notizen|aufgaben)\b/.test(url)) return 'ablage';
  if (/^\/api\/(werkbank\/(sicherung|notfallblatt|wiederherstellung)|wiederherstellung|(v1\/)?sicherungen)\b/.test(url)) return 'sicherung';
  if (/^\/api\/(typen|werkbank|beispiele)\b/.test(url)) return 'werkbank';
  return 'http';
}
/** Kopfzeilen für eine ausgelieferte Datei – so, dass sie nie als Teil der Anwendung ausgeführt wird. */
export function dateiKoepfe(d: Datei): Record<string, string> {
  const ascii = d.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const k: Record<string, string> = {
    'content-type': d.mime,
    'content-length': String(d.groesse),
    'content-disposition': t('meldungen.routen.filename-filename-utf-8', { wert: d.anzeigen ? 'inline' : 'attachment', ascii, encodeURIComponent: encodeURIComponent(d.name) }),
    'x-content-type-options': 'nosniff',
    'cache-control': t('meldungen.routen.private-max-age-0'),
  };
  // PDFs brauchen den eingebauten Betrachter des Browsers; alles andere läuft in einer Sandbox.
  if (d.mime !== 'application/pdf') k['content-security-policy'] = t('meldungen.routen.default-src-none-img');
  return k;
}

/** Set-Cookie für die Sitzung; `null` löscht sie. HttpOnly: kein Zugriff aus Skripten. */

export function sitzungsCookie(schluessel: string | null, sicher: boolean): string {
  const teile = [`${SITZUNG_COOKIE}=${schluessel ? encodeURIComponent(schluessel) : ''}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${schluessel ? SITZUNG_SEKUNDEN : 0}`];
  if (sicher) teile.push('Secure');
  return teile.join('; ');
}

/**
 * Zwei-Faktor-Pflicht lesen oder nur ausschalten (#416): geht für Administratoren auch, solange sie die
 * Zwei-Faktor-Anmeldung selbst noch einrichten müssen – so sperrt sich niemand mit dieser Einstellung aus.
 * Einschalten (ein Wert true) gehört nicht dazu.
 */
export function pflichtZuruecknehmen(r: Pick<Route, 'methode' | 'pfad'>, a: Pick<Anfrage, 'body' | 'benutzer'>): boolean {
  if (r.pfad !== '/api/werkbank/zweifaktor' || a.benutzer?.rolle !== 'admin') return false;
  if (r.methode === 'GET') return true;
  if (r.methode !== 'PUT' || !a.body || typeof a.body !== 'object') return false;
  return Object.values(a.body as Record<string, unknown>).every((w) => w === false);
}

/**
 * Prüft Zugang und Schutz vor fremden Seiten (CSRF): Ändernde Anfragen
 * müssen den Header X-DMS tragen, den nur die eigene Oberfläche setzt.
 */

export async function pruefeZugang(r: Route, a: Anfrage, kopf: (n: string) => string | undefined, konten: Konten, schluessel?: ApiSchluesselDienst, konsole?: Konsolenzugang) {
  // Befehl `dms` im Container (#244): Schlüssel aus /tmp, nur über Loopback; handelt als Person mit „Gesamte
  // Verwaltung“ im Verwaltungsmodus (#818) – wer Zugang zum Container hat, hat ohnehin alles.
  const k = kopf(KONSOLE_KOPF);
  if (k !== undefined) {
    if (!konsole || !konsole.passt(k) || !istLoopback(a.peer)) throw new Fachfehler(401, t('meldungen.routen.konsolenzugang-ungueltig-der-befehl'));
    a.konsole = true;
    try { a.benutzer = { ...konsolenBenutzer(await konten.listeBenutzer(), kopf(ALS_KOPF)), rolle: 'admin' }; a.verwaltungsmodus = true; } catch (e) {
      // Nur die Konsolen-Befehle selbst gehen auch ohne Administrator (z. B. Passwort setzen).
      if (!r.konsole) throw e;
    }
    return;
  }
  if (r.konsole) throw new Fachfehler(404, t('meldungen.routen.diese-schnittstelle-gibt-es'));
  // Öffentliche API: Anmeldung per API-Schlüssel statt Sitzung; kein X-DMS nötig (kein Cookie im Spiel).
  const auth = kopf('authorization');
  if (r.api && auth && schluessel) {
    const s = await schluessel.pruefe(auth);
    const b = s ? await konten.benutzerMitId(s.benutzerId) : undefined;
    if (!s || !b) throw new Fachfehler(401, t('meldungen.routen.der-benutzer-dieses-schluessels'));
    a.benutzer = b; a.apiSchluessel = s;
    // „Nur Zähler“ (#625): genau eine Adresse, alles andere 403.
    if (s.recht === NUR_ZAEHLER && !(r.methode === 'GET' && r.pfad === ZAEHLER_PFAD)) throw new Fachfehler(403, t('api.schluessel.nur-zaehler'));
    // Übergang (#636): Pakete für die Kopie außer Haus haben seit 0.158.1 nur noch einen Leseschlüssel und melden ihren
    // Stand in der Antwort auf das Ereignis. Ältere Fassungen dürfen noch per PUT melden (die Route prüft, ob ein Paket
    // mit dms:sicherung-lesen fragt). Entfällt mit 1.0.0 (uebergaenge.ts, #902).
    const uebergang = r.methode === 'PUT' && r.pfad === SICHERUNG_EXTERN_PFAD;
    if (r.methode !== 'GET' && s.recht === 'lesen' && !uebergang) throw new Fachfehler(403, t('meldungen.routen.dieser-api-schluessel-darf'));
    // #818 (Frage 9 von Sicherheit): API-Schlüssel bekommen nie Verwaltungsrechte – auch nicht von Verwaltenden.
    a.benutzer = { ...b, rolle: 'mitglied' };
    if (r.zugang === 'admin') throw new Fachfehler(403, t('konten.verwaltung.fehler.schluessel'));
    return;
  }
  // Interne Schnittstellen nehmen keine API-Schlüssel. Ein Schlüssel „nur Zähler“ bekommt hier trotzdem eine klare
  // Antwort (#625) statt „bitte anmelden“ – etwa wenn eine Hausautomatisierung die falsche Adresse nutzt.
  if (auth && schluessel && /^Bearer\s+dms_/i.test(auth)) {
    const s = await schluessel.pruefe(auth).catch(() => undefined);
    if (s?.recht === NUR_ZAEHLER) throw new Fachfehler(403, t('api.schluessel.nur-zaehler'));
  }
  const anmeldung = await konten.anmeldungZu(a.sitzung, { still: r.still });
  a.benutzer = anmeldung?.benutzer;
  a.sitzungsDaten = anmeldung?.sitzung;
  if (r.methode !== 'GET' && kopf('x-dms') !== '1') throw new Fachfehler(403, t('meldungen.routen.anfrage-ohne-kennung-der'));
  // Verwaltungsmodus (#819): Zustand der Sitzung auf dem Server. Aktivität = jede ändernde Anfrage oder eine, die die
  // Oberfläche nach einer Eingabe als „aktiv“ kennzeichnet – Abfragen im Hintergrund verlängern den Modus nicht.
  if (a.benutzer) {
    // Abfragen im Hintergrund (#919, `still`) nie – auch nicht kurz nach einer Eingabe.
    const aktiv = !r.still && ((r.methode !== 'GET' && !r.lesend && !r.pfad.startsWith('/api/konto/verwaltung')) || kopf('x-dms-aktiv') === '1');
    a.verwaltungsmodus = await konten.modusPruefen(a.benutzer, a.sitzung, a.sitzungsDaten, aktiv);
    a.benutzer = { ...a.benutzer, rolle: a.verwaltungsmodus ? 'admin' : 'mitglied' };
  }
  if (r.zugang === 'offen') return;
  if (!a.benutzer) throw new Fachfehler(401, t('anmeldung.fehler.bitte-anmelden'));
  // Zwei-Faktor vorgeschrieben (#242), aber noch nicht eingerichtet: nur das eigene Konto.
  // #416: gilt erst für Sitzungen ab dem Einschalten der Pflicht; die Pflicht selbst lesen und ausschalten geht immer.
  if (konten.zweifaktor && !a.sitzungsDaten?.vertretungId && !r.pfad.startsWith('/api/konto/') && !pflichtZuruecknehmen(r, a)
    && (await konten.zweifaktor.fehlt(a.benutzer, a.sitzungsDaten?.erstellt))) {
    throw new Fachfehler(403, t('meldungen.routen.bitte-zuerst-die-zwei'));
  }
  if (r.zugang === 'admin') pruefeVerwaltung(r, a, konten);
}

/**
 * Werkbank (#818, #819): nur im Verwaltungsmodus, nur mit Recht auf den Bereich der Route (Vorgabe „nein“), und für
 * die heikelsten Handlungen nur mit frischer Anmeldung. Die Antwort sagt der Oberfläche, was fehlt (`details`).
 */
export function pruefeVerwaltung(route: Pick<Route, 'methode' | 'pfad' | 'bereichVon'>, a: Anfrage, konten: Konten) {
  const r = route.bereichVon ?? route;
  const b = a.benutzer!;
  if (a.konsole) return;
  if (!darfVerwalten(b)) throw new Fachfehler(403, t('konten.verwaltung.fehler.recht'));
  if (!a.verwaltungsmodus) throw new Fachfehler(403, t('konten.verwaltung.fehler.modus'), { verwaltungsmodus: true, heuteBestaetigt: konten.heuteBestaetigt(a.sitzungsDaten), frisch: konten.istFrisch(a.sitzungsDaten) });
  const bereiche = bereicheDerRoute(r.methode, r.pfad);
  const darf = bereiche === null ? hatGesamt(b) : bereiche.some((x) => (x === JEDER ? darfVerwalten(b) : x === NUR_GESAMT ? hatGesamt(b) : darfBereich(b, x)));
  if (!darf) throw new Fachfehler(403, t('konten.verwaltung.fehler.bereich'), { bereich: bereiche?.[0] ?? null });
  const heikel = heikleHandlung(r.methode, r.pfad, a.body);
  if (heikel && !konten.istFrisch(a.sitzungsDaten)) throw new Fachfehler(403, t('konten.verwaltung.fehler.frisch'), { frisch: true, handlung: heikel });
}
