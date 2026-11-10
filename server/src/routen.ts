import { PassThrough, type Readable } from 'node:stream';
import { buffer as alsPuffer } from 'node:stream/consumers';
import { pdfFuerAnzeige } from './pdfanzeige';
import { istPerson, MAX_DATEIGROESSE, POST_KANAL, type Abruffassung, type Benutzer, type Mappe, type Mappentyp } from '../../shared/src/model';
import { type Recht } from '../../shared/src/rechte';
import { ladeBeispiele } from './beispiele';
import { demoPhasen, erzeugeDemo, pruefeDemoOptionen, schaetzeDemo, type DemoPlatz } from './demo';
import { taugtAlsAufgabenEmpfaenger, type Dienst } from './dienst';
import { VOLLTEXT_KOERPER_MAX } from '../../shared/src/paketvolltext';
import { ARCHIVFASSUNG_MAX_BYTES, archivfassungName, pdfaName } from '../../shared/src/archivfassung';
import { Fachfehler } from './fehler';
import { SITZUNG_TAGE, ZULETZT_LISTE, type Konten } from './konten';
import { zuletztListe, type SitzungIntern } from './konto-repo';
import { pflichtRolle, type Zweifaktor } from './zweifaktor';
import { openapi, v1Routen } from './api-v1';
import { wunschAus } from '../../shared/src/stempel';
import { NUR_ZAEHLER, ZAEHLER_PFAD, type ApiSchluessel, type ApiSchluesselDienst } from './apischluessel';
import type { Designs } from './designs';
import type { Oidc } from './oidc';
import { exportDateien, exporteIn, exportOrdner, freierPlatz, loescheExport, pruefeExport, vollexport, VOLLEXPORT_PHASEN, type ExportOptionen, type KontaktZuordnung } from './vollexport';
import { oeffneStrom } from './dateispeicher';
import { mkdir } from 'node:fs/promises';
import { AUSKUNFT_PHASEN, auskuenfteIn, auskunftDatei, auskunftOrdner, erzeugeAuskunft, haltenBis, loescheAuskunft } from './auskunft';
import { AUSKUNFT_TAGE, EXPORT_TAGE, linkStatus, oeffentlichErreichbar } from '../../shared/src/auskunft';
import { persoenlicherOrdner, umzugGesehen, umzugHinweis, type ExportOrt } from './exportordner';
import { textDritte, type TextDritte } from '../../shared/src/anrede';
import { t } from './sprache';
import { GEMERKT_MAX } from '../../shared/src/entsperren';
import { loeschkonzept, luecken, type LoeschkonzeptQuelle } from '../../shared/src/loeschkonzept';
import { DOCX_MIME, schriftstueckDocx, schriftstueckPdf } from './schriftstueck';
import { liesAnlass, type Ausloeser } from '../../shared/src/loeschprotokoll';
import { AbrufBremse, AbrufTickets, ipBereich, kuerzeIp } from './abruf';
import { zipGroesse, zipStrom, ZIP_MAX, type ZipEintrag } from './zip';
import { join } from 'node:path';
import { ALS_KOPF, KONSOLE_KOPF, istLoopback, konsolenBenutzer, type Konsolenzugang } from './konsole';
import { bereicheDerRoute, heikleHandlung, JEDER, NUR_GESAMT } from './verwaltungsbereiche';
import { darfBereich, darfVerwalten, hatGesamt } from '../../shared/src/verwaltungsrecht';
import type { Messung } from './messung';
import type { Vorschaubilder } from './vorschau';
import { ARCHIV_MAX, Paketverwaltung, SAMMEL_MAX, type InstallierenEingabe } from './pakete';
import { hatSchnittstelle, type AblaufEingabe, type AblaufInstallation } from '../../shared/src/pakete';
import { Paketerstellung } from './paketerstellung';
import { Umwandlung } from './umwandlung';
import type { LaeuferSicht } from './laeufer/fern';
import { Entdecken } from './entdecken';
import { heuteIn } from '../../shared/src/sichten';
import { eigeneVersion, standKennung, uebersicht, versionsabgleich, type SystemQuelle } from './system';
import type { Fehlermeldungen } from './fehlermeldungen';
import type { Verwaltung } from './verwaltung';
import { MODULE, protokoll, STUFEN, type Stufe } from './protokoll';
import { zwischenspeicherAus } from './zaehlerspeicher';
import type { Betrieb } from './betrieb';
import { maskiere, type Tresor } from './tresor';
import type { Texterkennung } from './texterkennung';
import { FASSUNG_MAX_BYTES, VORSCHAUBILD_MAX_BYTES } from '../../shared/src/dateiumwandlung';
import type { Wartung } from './wartung';
import type { Notfallzugang } from './notfall';
import type { Sicherung } from './sicherung';
import type { Wiederherstellung } from './wiederherstellung';
import type { Speicherplatz } from './speicherplatz';
import { KLASSEN_MS, poolZusammen, type PoolStand } from './poolmessung';
import type { AbfragenStand, Zuruecksetzen } from './abfragestatistik';

/** Teuerste Abfragen (#894): nur auf Anfrage gelesen bzw. zurückgesetzt (Lasttest). */
export interface Abfragestatistik { stand(anzahl: number): Promise<AbfragenStand>; zuruecksetzen(): Promise<Zuruecksetzen> }
import { dateiLeser, liesPss, liesRss, type Systemlast } from './systemlast';
import type { ProzessEinstellung, Verbund } from './prozesse';
import { PROZESSE_MAX } from './prozesse';
import type { Prozessstand } from './aufteilung';
import { ARBEITER_MAX, arbeiterStand } from './arbeit';
import { VERBINDUNGEN_MAX, VERBINDUNGEN_MIN } from './db';
import { MAX_ANFRAGEN_MAX, MAX_ANFRAGEN_MIN } from './ueberlast';
import { engpaesseAus, VARIABLE, type Grenzwerte, type ProzessZeile } from '../../shared/src/systemlast';
import type { Eingangsordner } from './eingangsordner';
import type { Webdav } from './webdav';
import type { Postfaecher } from './postfach';
import { RueckrufFehler, VERSAND_OAUTH_ID, type PostfachOAuth } from './postfach-oauth';
import type { OrdnerPruefung } from './ordner';
import type { Einrichtung } from './einrichtung';
import type { AnbindungVerwaltung } from './anbindung';
import { notfallblatt } from './notfallblatt';
import { heimnetzStand, type Notfallcode } from './notfallcode';
import { WartungFehler } from './wartung';
import { werkbankZahlen } from './werkbankzahlen';
import { akzeptanzAufheben, akzeptierteMeldungen, meldungAkzeptieren } from './meldungen';
import { ueberfluessigeVariablen } from '../../shared/src/umgebungsvariablen';
import { Fotostapel } from './fotostapel';
import { liesQuelle } from './uebersetzung';
import { MAIL_STANDARD, pruefeZeit, STANDARD_TAGE, wirksameZeit, type Aufgabenmail, type MailZeit } from './aufgabenmail';
import { LAENDER, ZEITZONEN, zeitzone } from '../../shared/src/region';
import { istMaschinell, istVerfuegbar, liesSpracheinstellung, SPRACHEN_STANDARD, spracheAusKopf, wirksameSprache } from '../../shared/src/sprachwahl';
import { BUNDESLAENDER } from '../../shared/src/feiertage';
import { RegionDienst } from './region';
import { gebietsschema } from '../../shared/src/sprache';
import { FEHLERMELDUNG_KOERPER_MAX, GB, KOERPER_SPIELRAUM, LOGO_MAX, MB, PLATZ_RESERVE, VORSCHLAG_DATEI_MAX } from './grenzen';

const L = {
  konto: protokoll.modul('konto'), ablage: protokoll.modul('ablage'), werkbank: protokoll.modul('werkbank'),
  dokumente: protokoll.modul('dokumente'), system: protokoll.modul('system'), mail: protokoll.modul('mail'),
  datenschutz: protokoll.modul('datenschutz'),
};

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

export const SITZUNG_COOKIE = 'dms_sitzung';
export const SITZUNG_SEKUNDEN = SITZUNG_TAGE * 24 * 60 * 60;

const ok = (body: unknown, status = 200): Antwort => ({ status, body });

/**
 * Archivmodus (#212, #373): genau ein Eintrag je gespeicherter Änderung, mit vorher/nachher
 * (an/aus, Frist, Stichtag). Ausschalten ist eine Warnung.
 */
function archivProtokoll(t: { name: string; archiv?: Mappentyp['archiv'] }, vorher: Mappentyp['archiv'] | null) {
  const nachher = t.archiv ?? null;
  if (JSON.stringify(vorher) === JSON.stringify(nachher)) return;
  const zustand = (x: Mappentyp['archiv'] | null) => (x ? { an: true, jahre: x.jahre, stichtag: x.stichtag ?? 'Anlagedatum' } : { an: false });
  const daten = { typ: t.name, vorher: zustand(vorher), nachher: zustand(nachher) };
  if (!nachher) L.werkbank.warn('Archivmodus ausgeschaltet', daten);
  else L.werkbank.info(vorher ? 'Archivmodus geändert' : 'Archivmodus eingeschaltet', daten);
}
const leer: Antwort = { status: 204 };
/** Rückmeldung zur Kopie außer Haus per PUT (#585) – nur noch im Übergang für Pakete vor #636. */
const SICHERUNG_EXTERN_PFAD = '/api/v1/sicherungen/:name/extern';
const b = (a: Anfrage) => (a.body ?? {}) as Record<string, unknown>;
const info = (a: Anfrage) => ({ ip: a.ip, geraet: a.geraet ?? '' });
/** Löschprotokoll (#470): wer löscht – Benutzer in der Oberfläche, Schnittstelle (API-Schlüssel) oder Paket (Dienstkonto). */
const quelle = (a: Anfrage): Ausloeser => (a.benutzer?.art === 'dienst' ? 'paket' : a.apiSchluessel ? 'api' : 'benutzer');
const ich = (a: Anfrage) => {
  if (!a.benutzer) throw new Fachfehler(401, t('anmeldung.fehler.bitte-anmelden'));
  return a.benutzer;
};

/**
 * Systemzustand (#544): Arbeiter, Verbindungen zur Datenbank und Grenze des Überlastschutzes – nur zum Ansehen,
 * eingestellt per Umgebungsvariable – und die Engpässe, je mit der Variable, die man ändern müsste.
 */
function grenzenUndEngpaesse(x: RoutenExtras) {
  const a = arbeiterStand();
  const v = x.verbindungen?.stand();
  const u = x.ueberlast?.stand();
  // Mehrere Prozesse (#745): Arbeiter und Anfragen gelten je Prozess, Verbindungen seit #874 zusammen.
  const p = x.verbund?.mehrere ? { prozesse: x.verbund.anzahl } : {};
  const pe = x.prozessEinstellung;
  const grenzen: Grenzwerte = {
    ...(pe ? { prozesse: { wert: x.verbund?.anzahl ?? pe.anzahl, quelle: pe.quelle, variable: VARIABLE.prozesse, min: 1, max: PROZESSE_MAX } } : {}),
    arbeiter: { wert: a.aus ? 0 : a.groesse, quelle: a.quelle, variable: VARIABLE.arbeiter, min: 0, max: ARBEITER_MAX, ...p },
    // #874: Verbindungen gelten für alle Prozesse zusammen – Wert ist die Summe, dazu die Anteile.
    ...(v ? { verbindungen: { wert: x.verbindungen?.aufteilung?.gesamt ?? v.max, quelle: v.quelle, variable: VARIABLE.verbindungen, min: VERBINDUNGEN_MIN, max: VERBINDUNGEN_MAX, ...(x.verbund?.mehrere && x.verbindungen?.aufteilung ? { aufteilung: { leiter: x.verbindungen.aufteilung.leiter, andere: x.verbindungen.aufteilung.andere, prozesse: x.verbund.anzahl } } : {}) } } : {}),
    ...(u ? { anfragen: { wert: u.max, quelle: u.quelle, variable: VARIABLE.anfragen, min: MAX_ANFRAGEN_MIN, max: MAX_ANFRAGEN_MAX, ...p } } : {}),
  };
  const engpaesse = engpaesseAus({
    schleife: !!x.messung?.auslastung.warnung(),
    verbindungen: v ? { median: v.median, messungen: v.messungen } : null,
    arbeiterAbgewiesen: a.aus ? null : a.zuletztAbgewiesen,
    ueberlastAbgewiesen: u?.zuletztAbgewiesen ?? null,
  });
  return { grenzen, engpaesse };
}

/**
 * Mehrere Prozesse (#745): Stand jedes Prozesses – Arbeitsspeicher (Pss aus /proc, sonst RSS), Rechenzeit, Wartezeit der
 * Ereignisschleife und laufende Anfragen; dazu der Hauptprozess. null mit einem Prozess.
 */
async function prozessZeilen(x: RoutenExtras, frage: 'prozess.stand' | 'prozess.last' = 'prozess.stand'): Promise<{ zeilen: ProzessZeile[]; staende: Array<Prozessstand | null>; halde: Record<number, number | null>; rssMb: number; speicherMb: number } | null> {
  const v = x.verbund;
  if (!v?.mehrere) return null;
  const alle = await v.frageAlle<Prozessstand>(frage);
  const zeilen: ProzessZeile[] = [];
  let rss = 0;
  if (v.primaer) {
    const r = liesRss(dateiLeser, v.primaer);
    rss += r ?? 0;
    zeilen.push({ nr: 0, pid: v.primaer, rolle: 'haupt', speicher: liesPss(dateiLeser, v.primaer) ?? r, cpu: null, schleifeP99: null, anfragen: null });
  }
  for (const p of alle) {
    rss += p.wert ? p.wert.rssMb * MB : liesRss(dateiLeser, p.pid) ?? 0;
    zeilen.push({
      nr: p.nr, pid: p.pid, rolle: p.leiter ? 'leiter' : 'anfragen', speicher: liesPss(dateiLeser, p.pid) ?? (p.wert ? p.wert.rssMb * MB : null),
      cpu: p.wert?.cpu ?? null, schleifeP99: p.wert?.schleife?.p99 ?? null, anfragen: p.wert?.anfragen.laufend ?? null,
    });
  }
  // Summe für den Lasttest: Pss (geteilte Seiten anteilig – die Summe der RSS zählte den Code jedes Prozesses voll).
  const pss = zeilen.every((z) => z.speicher !== null) ? zeilen.reduce((n, z) => n + z.speicher!, 0) : rss;
  return { zeilen, staende: alle.map((p) => p.wert), halde: Object.fromEntries(alle.map((p) => [p.nr, p.wert?.heapMb ?? null])), rssMb: Math.round(rss / MB), speicherMb: Math.round(pss / MB) };
}

/**
 * Wo es unter Last hakt (#874), für den Lasttest über alle Prozesse: Wartezeit auf eine freie Verbindung (Klassen
 * fortlaufend, Höchstwert der letzten 10 s), belegte und erlaubte Verbindungen, Sitzungen der Datenbank mit Sperren,
 * Rechenzeit von PostgreSQL, Ablago und Container (fortlaufend in Sekunden) und der Arbeitsspeicher je Prozess.
 */
async function engpassStand(x: RoutenExtras, p: Awaited<ReturnType<typeof prozessZeilen>>) {
  let pool: PoolStand | null;
  if (p) pool = poolZusammen(p.staende.map((z) => z?.pool));
  else { x.poolmessung?.an(); pool = x.poolmessung?.stand() ?? null; }
  const pids = p ? p.zeilen.map((z) => z.pid) : [process.pid];
  // Je Prozess: Pss (sonst RSS) und davon die Halde von V8 (heapUsed) – zeigt, ob Daten oder Puffer wachsen.
  const speicher = p ? p.zeilen.map((z) => ({ nr: z.nr, rolle: z.rolle, mb: z.speicher === null ? null : Math.round(z.speicher / MB), haldeMb: p.halde[z.nr] ?? null }))
    : [{ nr: 1, rolle: 'leiter' as const, mb: Math.round((liesPss(dateiLeser, process.pid) ?? process.memoryUsage().rss) / MB), haldeMb: Math.round(process.memoryUsage().heapUsed / MB) }];
  return {
    pool, klassenMs: KLASSEN_MS,
    verbindungen: x.verbindungen?.aufteilung ? { gesamt: x.verbindungen.aufteilung.gesamt, leiter: x.verbindungen.aufteilung.leiter, andere: x.verbindungen.aufteilung.andere } : null,
    sitzungen: (await x.sitzungen?.().catch(() => null)) ?? null,
    cpu: x.systemlast?.cpuJeArt(pids) ?? null,
    speicher,
    // Abgestürzte und neu gestartete Prozesse seit dem Start: der Lasttest zählt den Unterschied je Durchgang.
    neustarts: x.verbund?.neustarts() ?? { anzahl: 0, letzte: [] },
    // #895: Warnungen und Fehler aller Prozesse (zusammengefasst, ohne Einzelheiten) und CPU/Speicher je Prozessgruppe.
    protokoll: (await x.verbund?.meldungen().catch(() => null)) ?? null,
    gruppen: (await x.prozessgruppen?.().catch(() => null)) ?? null,
  };
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

/** Einstellung: „Nein, danke“ zur Empfehlung einer zweiten Person mit Verwaltungsrecht (#821) – gilt dauerhaft. */
export const ZWEITE_ABGELEHNT = 'verwaltung_zweite_abgelehnt';

export function routen(dienst: Dienst, konten: Konten, x: RoutenExtras = {}): Route[] {
  const fotostapel = x.fotostapel ?? new Fotostapel();
  const { messung, system } = x;
  const designs = () => { if (!x.designs) throw new Fachfehler(404, t('meldungen.routen.designs-sind-nicht-eingerichtet')); return x.designs; };
  const log = x.log ?? ((m: string) => L.mail.warn(m));
  const pakete = x.pakete ?? new Paketverwaltung(dienst, { version: eigeneVersion, benutzer: async () => (await konten.listeBenutzer()).filter((b) => b.aktiv !== false).map((b) => ({ id: b.id, name: b.name || b.email })) });
  const paketerstellung = new Paketerstellung(dienst, { version: eigeneVersion });
  // Ablago entdecken (#831, #832): Rundgänge und Tipps je Person; Funktionen, nach denen Tipps gefiltert werden.
  const entdecken = x.entdecken ?? new Entdecken({
    einstellungen: (b) => konten.einstellungen(b), setzeEinstellung: (b, k, w) => konten.setzeEinstellung(b, k, w),
    version: eigeneVersion, heute: () => heuteIn(),
    funktionen: async () => {
      const f = new Set<'fragen' | 'laufwerk' | 'mail'>();
      if ((await dienst.fragen.stand()).verfuegbar) f.add('fragen');
      if (x.webdav && (await x.webdav.einstellung()).aktiv) f.add('laufwerk');
      if (konten.mailAktiv) f.add('mail');
      return f;
    },
    log: L.konto,
  });
  const umwandlung = new Umwandlung(dienst);
  const wer = (a: Anfrage) => ({ id: a.benutzer?.id ?? null, email: a.benutzer?.email ?? null });
  /**
   * Hilfen des Einrichtungsassistenten (#804, #806): Code vor der Einrichtung, danach bei offenem Assistenten eine
   * Person mit „Gesamte Verwaltung“ (#818) – nicht in einer Vertretung und nicht mit API-Schlüssel.
   */
  const einrichtungZugang = async (a: Anfrage) => {
    if (!x.einrichtung) throw new Fachfehler(404, t('meldungen.routen.kein-einrichtungsassistent'));
    await x.einrichtung.pruefeZugang(a.einrichtungscode, !!a.benutzer && !a.apiSchluessel && hatGesamt(a.benutzer) && !a.sitzungsDaten?.vertretungId);
  };
  /**
   * Ist ein Abruf ein Weitergeben (#394)? Herunterladen (?herunterladen), Stempel-Parameter oder ein API-Schlüssel
   * eines Benutzers. Anzeigen in der Oberfläche und Pakete (Dienstkonten, z. B. Texterkennung) bekommen das Original.
   */
  const weitergabe = (a: Anfrage) => a.query.herunterladen !== undefined || a.query.verkleinern !== undefined || !!wunschAus(a.query) || (!!a.apiSchluessel && a.benutzer?.art !== 'dienst');
  /**
   * Herunterladen ist Mitnehmen (#723): verlangt außer Lesen das Exportrecht E – über die gemeinsame Prüfstelle wie
   * E-Mail, Export und Laufwerk. Anzeigen im Browser (inline) bleibt mit R. Dienstkonten der Pakete (Texterkennung,
   * Umwandlung, Archivfassung) lesen Dateien zur Verarbeitung in Ablago und brauchen E nicht.
   */
  const mitnehmen = async (a: Anfrage, mappeId: string) => {
    if (a.benutzer?.art === 'dienst') return;
    await dienst.pruefeAusgang(ich(a), await zg(a), 'herunterladen', [mappeId]);
    await modusSpur(a, [mappeId], 'heruntergeladen');
  };
  /**
   * Abruf in die Historie (#800): in der Oberfläche heruntergeladen oder mit einem API-Schlüssel abgerufen – erst wenn
   * die Datei fertig zum Ausliefern ist (Rechte geprüft, Stempel und Fassung gebildet), nie bei einem Fehler. Pakete
   * (Dienstkonten) lesen Dateien zur Verarbeitung in Ablago; das ist kein Abruf. Gleiche Abrufe am selben Tag fasst
   * `notiereAbruf` zu einem Eintrag zusammen. Scheitert das Schreiben, geht die Datei nicht hinaus.
   */
  const abgerufen = async <T extends Antwort>(a: Anfrage, dokumentId: string, o: { fassung?: Abruffassung; version?: number | null; gestempelt?: boolean; datei?: string }, antwort: T): Promise<T> => {
    if (a.benutzer?.art === 'dienst') return antwort;
    try {
      await dienst.notiereAbruf({ dokumentId, benutzerId: ich(a).id, weg: a.apiSchluessel ? 'api' : 'oberflaeche', schluessel: a.apiSchluessel?.name ?? null, ...o });
    } catch (e) {
      const inhalt = antwort.datei?.inhalt;
      if (inhalt && !Buffer.isBuffer(inhalt)) (inhalt as Readable).destroy();
      throw e;
    }
    return antwort;
  };
  /** Abruf mit dem API-Schlüssel eines Menschen (nicht eines Pakets): gilt als Herausgeben (#394, #799). */
  const herausgeben = (a: Anfrage) => !!a.apiSchluessel && a.benutzer?.art !== 'dienst';
  /**
   * Seitenbilder über einen API-Schlüssel (#799): Recht E und – wenn ein Stempel gilt – Bilder aus der gestempelten
   * Kopie. Oberfläche und Pakete bekommen die Seiten, wie sie abgelegt sind (null).
   */
  const seitenquelle = async (a: Anfrage, mappeId: string) => {
    if (!herausgeben(a)) return null;
    await mitnehmen(a, mappeId);
    return dienst.gestempelteSeiten(a.params.id, { stempel: a.query, ich: ich(a) });
  };
  /** Kommt die Datei nicht zum Ansehen (inline), sondern zum Abspeichern? Mit API-Schlüssel eines Menschen immer. */
  const zumAbspeichern = (a: Anfrage) => a.query.herunterladen !== undefined || (!!a.apiSchluessel && a.benutzer?.art !== 'dienst');
  /**
   * Anzeige im Browser (#639): Ein PDF kommt nur als bereinigte Kopie in den eingebauten Betrachter (ohne JavaScript,
   * automatische Aktionen, Formular-Übermittlung, eingebettete Dateien). Mit API-Schlüssel (Pakete) das Original.
   * Lässt es sich nicht bereinigen, gibt es statt der Anzeige einen kurzen Hinweis – Herunterladen geht weiter.
   */
  const fuerAnzeige = async (a: Anfrage, d: Datei): Promise<Antwort> => {
    if (!d.anzeigen || d.mime !== 'application/pdf' || a.apiSchluessel) return { datei: d };
    const pdf = await pdfFuerAnzeige(Buffer.isBuffer(d.inhalt) ? d.inhalt : await alsPuffer(d.inhalt));
    if (!pdf) {
      const hinweis = Buffer.from('Dieses PDF lässt sich nicht sicher anzeigen (verschlüsselt oder beschädigt). Bitte lade es herunter und öffne es in einem PDF-Programm.\n\nThis PDF cannot be displayed safely (encrypted or damaged). Please download it and open it in a PDF reader.\n');
      return { datei: { inhalt: hinweis, name: 'hinweis.txt', mime: 'text/plain; charset=utf-8', anzeigen: true, groesse: hinweis.length, koepfe: { 'x-dms-anzeige': 'nur-herunterladen', 'cache-control': 'no-store' } } };
    }
    return { datei: { ...d, inhalt: pdf, groesse: pdf.length, koepfe: { ...d.koepfe, 'x-dms-anzeige': 'bereinigt' } } };
  };
  /** Antwort für eine ausgegebene Datei (#394): immer als Herunterladen. Verkleinert (#393): Kopf X-DMS-Verkleinert „vorher/nachher“. */
  const ausgabeDatei = (r: { name: string; mime: string; anzeigbar: boolean; groesse: number; inhalt: Buffer | Readable; gestempelt: boolean; verkleinert?: { vorher: number; nachher: number } | null }): Antwort => {
    L.dokumente.debug(r.gestempelt ? 'Dokument mit Stempel heruntergeladen' : 'Dokument heruntergeladen', { name: r.name });
    const koepfe: Record<string, string> = { ...(r.gestempelt ? { 'x-dms-stempel': '1' } : {}), ...(r.verkleinert ? { 'x-dms-verkleinert': `${r.verkleinert.vorher}/${r.verkleinert.nachher}` } : {}) };
    return { datei: { inhalt: r.inhalt, name: r.name, mime: r.anzeigbar ? r.mime : 'application/octet-stream', anzeigen: false, groesse: r.groesse, ...(Object.keys(koepfe).length ? { koepfe } : {}) } };
  };
  const typName = async (id: string) => (await dienst.listeTypen()).find((t) => t.id === id)?.name ?? id;
  /** Passwörter für Dokumente (#827): nur die Person selbst im Browser – kein API-Schlüssel, keine Vertretung. */
  const nurSelbst = (a: Anfrage) => {
    if (a.apiSchluessel || !a.sitzungsDaten?.id) throw new Fachfehler(403, t('mappen.entsperren.gemerkt.nur-browser'));
    if (a.sitzungsDaten.vertretungId) throw new Fachfehler(403, t('mappen.entsperren.gemerkt.vertretung'));
    const e = dienst.pdfEntsperren;
    if (!e) throw new Fachfehler(404, t('mappen.entsperren.gemerkt.aus'));
    return e;
  };
  const betrieb = () => { if (!x.betrieb) throw new Fachfehler(404, t('meldungen.routen.betriebseinstellungen-sind-nicht')); return x.betrieb; };
  const mail = () => { if (!x.aufgabenmail) throw new Fachfehler(404, t('meldungen.routen.die-aufgaben-mail-ist')); return x.aufgabenmail; };
  const region = () => { if (!x.region) throw new Fachfehler(404, t('meldungen.routen.die-region-ist-nicht')); return x.region; };
  const sprachen = () => { if (!x.sprachen) throw new Fachfehler(404, t('meldungen.sprachen.nicht-eingerichtet')); return x.sprachen; };
  /** Sprache für die Oberfläche (#729): die der Person, sonst die mitgeschickte, sonst die der Installation. */
  const spracheFuer = async (a: Anfrage) => {
    const e = x.sprachen ? await x.sprachen.lies() : liesSpracheinstellung(null);
    const kopf = spracheAusKopf(a.kopf?.('x-sprache'), e.erlaubt);
    return {
      sprache: a.benutzer ? wirksameSprache(a.benutzer.sprache ?? kopf, e) : kopf ?? e.standard,
      standard: e.standard, erlaubt: e.erlaubt,
      maschinell: e.erlaubt.filter(istMaschinell),
    };
  };
  const regionStand = async (r: import('../../shared/src/region').Region) => ({
    region: r, laender: LAENDER, bundeslaender: BUNDESLAENDER, zeitzonen: ZEITZONEN, feiertage: RegionDienst.feiertageIm(r),
  });
  /** Eigene Einstellung der täglichen Zusammenfassung mit den Standards der Werkbank (#92, #94). */
  const zusammenfassung = async (i: Benutzer) => {
    const std = x.aufgabenmail ? await x.aufgabenmail.einstellung() : MAIL_STANDARD;
    const e = await konten.einstellungen(i);
    const eigen = e.aufgaben_mail_zeit && typeof e.aufgaben_mail_zeit === 'object' ? e.aufgaben_mail_zeit as Partial<MailZeit> : null;
    return {
      aktiv: e.aufgaben_mail !== false,
      uhrzeit: typeof eigen?.uhrzeit === 'string' ? eigen.uhrzeit : null,
      ...(({ tage, feiertage }) => ({ tage, feiertage }))(wirksameZeit(eigen, std)),
      standard: { uhrzeit: std.uhrzeit, tage: STANDARD_TAGE, bundesland: std.bundesland },
      versand: !!x.betrieb?.mailer() && std.aktiv,
    };
  };
  const ocr = () => { if (!x.texterkennung) throw new Fachfehler(404, t('meldungen.routen.die-texterkennung-ist-nicht')); return x.texterkennung; };
  const meldungen = () => { if (!x.fehlermeldungen) throw new Fachfehler(404, t('meldungen.routen.gemeldete-fehler-sind-nicht')); return x.fehlermeldungen; };
  const tresor = () => { if (!x.tresor) throw new Fachfehler(404, t('meldungen.routen.die-verschluesselung-ist-nicht')); return x.tresor; };
  const schluessel = () => { if (!x.apiSchluessel) throw new Fachfehler(404, t('meldungen.routen.api-schluessel-sind-nicht')); return x.apiSchluessel; };
  const webhooks = () => { if (!x.webhooks) throw new Fachfehler(404, t('webhook.nicht-eingerichtet')); return x.webhooks; };
  const autos = () => { if (!x.automatisierungen) throw new Fachfehler(404, t('meldungen.routen.automatisierungen-sind-nicht')); return x.automatisierungen; };
  /**
   * ?passwoerter=anzeigen (#46): nur mit einem API-Schlüssel, der das Recht „Passwörter lesen“ hat.
   * Liefert den Namen des Schlüssels fürs Protokoll, sonst null.
   */
  const passwoerterAnzeigen = (a: Anfrage): string | null => {
    if (a.query.passwoerter === undefined) return null;
    if (a.query.passwoerter !== 'anzeigen') throw new Fachfehler(422, t('meldungen.routen.passwoerter-kennt-nur-den'));
    if (!a.apiSchluessel?.passwoerter) throw new Fachfehler(403, t('meldungen.routen.passwoerter-liefert-die-api'));
    return a.apiSchluessel.name;
  };
  /**
   * Technische Aufgaben (#719, #819): Hinweis ohne Einzelheiten für Personen mit Verwaltungsrecht außerhalb des
   * Verwaltungsmodus, wenn in einem ihrer Bereiche etwas anliegt – nicht in einer Vertretung, und nur ja/nein.
   */
  const verwaltungHinweis = async (a: Anfrage): Promise<boolean> => {
    if (!a.benutzer || a.benutzer.rolle === 'admin' || !darfVerwalten(a.benutzer) || a.sitzungsDaten?.vertretungId || !x.verwaltung) return false;
    try { return await x.verwaltung.offen(a.benutzer); } catch { return false; }
  };
  /**
   * Spur im Verwaltungsmodus (#820): Öffnet, lädt herunter, ändert, exportiert oder versendet jemand im Modus eine
   * Mappe, die er mit seinen Alltagsrechten nicht lesen dürfte, steht das dauerhaft in ihrer Historie. Liefert die
   * Mappen, für die das gilt.
   */
  const modusSpur = async (a: Anfrage, ids: string[], was: 'angesehen' | 'heruntergeladen' | 'geaendert' | 'exportiert' | 'versendet'): Promise<Set<string>> => {
    if (a.benutzer?.rolle !== 'admin' || a.konsole || !ids.length) return new Set();
    return dienst.vermerkeVerwaltungsmodus({ ...a.benutzer, rolle: 'mitglied' }, ids, was);
  };
  /** Berechtigungen (#124): Zugriff des Benutzers, einmal je Anfrage. */
  const zg = (a: Anfrage) => dienst.zugriff(ich(a));
  /** #137: Empfänger von Aufgaben nur unter den Benutzern, die man sieht. */
  const empfaengerSichtbar = async (a: Anfrage, id: unknown) => {
    if (typeof id !== 'string' || !id) return;
    if (!(await dienst.lesbare(await zg(a), [id])).has(id)) throw new Fachfehler(422, t('meldungen.routen.diesen-benutzer-gibt-es'));
  };
  /** #127: Darf der Empfänger die Mappe lesen? Sonst ein Hinweis in der Antwort. */
  const leseHinweis = async (empfaengerId: string | null, mappeId: string) =>
    (empfaengerId && !(await dienst.kannLesen(empfaengerId, mappeId)) ? { hinweis: t('meldungen.routen.gespeichert-der-empfaenger-darf') } : {});
  const darf = async (a: Anfrage, mappeId: string, recht: Recht) => dienst.pruefeRecht(await zg(a), mappeId, recht);
  /** „Zuletzt geöffnet“ (#334, #940): nur lesbare Mappen außerhalb des Papierkorbs, neueste oben, je mit Zeitpunkt. */
  const zuletztGeoeffnet = async (a: Anfrage, anzahl: number) => {
    const liste = zuletztListe((await konten.einstellungen(ich(a))).zuletzt_geoeffnet);
    const ids = liste.map((x) => x.id);
    const lesbar = await dienst.lesbare(await zg(a), ids);
    const bezuege = await dienst.bezuegeVon(ids.filter((id) => lesbar.has(id)));
    return liste.filter((x) => bezuege.has(x.id)).slice(0, anzahl).map((x) => ({ id: x.id, typId: bezuege.get(x.id)!.typId, titel: bezuege.get(x.id)!.titel, am: x.am }));
  };
  /** Klartext von Passwörtern nur für Mappen mit Recht P; die anderen bleiben verdeckt. */
  const entschluessele = async <T extends Mappe>(a: Anfrage, mappen: T[], klartext: string): Promise<T[]> => {
    const { mit } = await dienst.mitPasswortRecht(await zg(a), mappen);
    const klar = new Map((await dienst.entschluesselePasswoerter(mit, klartext, ich(a).id)).map((m) => [m.id, m]));
    return mappen.map((m) => klar.get(m.id) ?? m);
  };
  /** Benutzer mit ihren weiteren Rollen (#27). */
  const mitRollen = async (b: Benutzer) => ({ ...b, rollen: (await dienst.weitereRollen()).get(b.id) ?? [] });
  const sicherung = () => { if (!x.sicherung) throw new Fachfehler(404, t('meldungen.routen.sicherungen-sind-nicht-eingerichtet')); return x.sicherung; };
  /** Paket mit dms:sicherung-lesen (#585) – Menschen und andere Pakete bekommen 403. */
  const sicherungsPaket = async (a: Anfrage): Promise<string> => {
    const p = (await zg(a)).paket;
    if (!p) throw new Fachfehler(403, t('pakete.sicherung.nur-pakete'));
    if (!p.schnittstellen?.includes('dms:sicherung-lesen')) throw new Fachfehler(403, t('pakete.sicherung.recht'));
    return p.id;
  };
  /**
   * Persönlicher Export (#255): je Benutzer, ob er gerade läuft und woran er zuletzt scheiterte – seit #744 im
   * Kurzzustand, damit jeder Prozess es weiß. „Läuft“ ist eine Belegung mit Frist (endet ein Prozess mittendrin).
   */
  const EXPORT_LAEUFT = 'eigener-export-laeuft', EXPORT_FEHLER = 'eigener-export-fehler';
  const eigenerExport = async (id: string) => ({
    laeuft: !!(await dienst.kurzzustand.lies(EXPORT_LAEUFT, id)),
    fehler: ((await dienst.kurzzustand.lies(EXPORT_FEHLER, id))?.wert as string | undefined) ?? null,
  });
  // Vollexport (#254), persönliche Exporte (#255) und Auskünfte (#396) im Export-Ordner (#797), nicht bei den Sicherungen.
  // Auskünfte ohne Export-Ordner (Tests) im temporären Ordner.
  const auskunftZiel = () => auskunftOrdner(x.exporte?.pfad);
  /** Löschkonzept (#469): nur Typen, Einstellungen und Fristen – nichts aus Mappen. */
  const loeschkonzeptQuelle = async (): Promise<LoeschkonzeptQuelle> => ({
    typen: await dienst.listeTypen(), datenschutz: await dienst.datenschutz(),
    papierkorbTage: await dienst.papierkorbTage(), historieTage: await dienst.historieTage(),
    // Ohne eingerichtete Sicherung (oder wenn der Plan nicht lesbar ist) steht im Dokument „keine automatischen Sicherungen“.
    sicherung: (await x.sicherung?.plan?.().catch(() => null)) ?? null, auskunftTage: AUSKUNFT_TAGE,
    version: eigeneVersion(), stand: new Intl.DateTimeFormat('sv-SE', { timeZone: zeitzone() }).format(new Date()), mandant: (await x.mandantName?.()) ?? '',
    loeschprotokoll: { jahre: await dienst.loeschprotokollJahre() },
  });
  /** Auskunft zustellen (#455): Einmal-Tickets der öffentlichen Abrufseite. */
  const abrufTickets = new AbrufTickets(Date.now, dienst.kurzzustand);
  /** Fehlversuche je IP-Bereich über alle Abruf-Links und gleichzeitige Code-Prüfungen – getrennt vom Anmeldeschutz. */
  const abrufBremse = new AbrufBremse({ zustand: dienst.kurzzustand });
  /**
   * Notfallblatt (#106, #814) als PDF – jedes neue Blatt mit neuem Notfallcode (#815): Der bisherige gilt danach nicht
   * mehr, gespeichert ist nur der Hash des neuen. Aus der Werkbank (frische Anmeldung) und nach dem Notfallzugang.
   */
  const notfallblattErzeugen = async (von: string): Promise<Buffer> => {
    const tresor2 = tresor();
    const text = tresor2.alsText();
    if (!text || !tresor2.fingerabdruck) throw new Fachfehler(409, t('meldungen.routen.es-gibt-noch-keinen'));
    // #814: keine Ordner oder Dateinamen aus Docker oder vom NAS auf dem Blatt – nur Verweise ins Handbuch.
    const inhalt = await notfallblatt({
      name: (x.designs ? (await x.designs.marke()).schriftzug : null) || 'Ablago',
      haushaltId: x.sicherung?.haushaltId ?? '–',
      adresse: x.betrieb ? x.betrieb.ansicht().adresse || x.betrieb.adresseFuerLinks() : '',
      version: eigeneVersion(), erstellt: new Date(), schluessel: text, fingerabdruck: tresor2.fingerabdruck,
      aussenziele: x.sicherung ? await x.sicherung.externZiele().catch(() => []) : [],
      notfallcode: await konten.neuerNotfallcode(),
    });
    if (x.sicherung) await x.sicherung.notfallblattErstellt(von);
    else L.system.warn('Notfallblatt heruntergeladen', { von, fingerabdruck: tresor2.fingerabdruck });
    return inhalt;
  };
  const notfallblattDatei = async (von: string): Promise<Antwort> => {
    const inhalt = await notfallblattErzeugen(von);
    // Der Schlüssel steht darauf: nicht im Cache des Browsers ablegen.
    return { datei: { inhalt, name: `Ablago-Notfallblatt-${new Date().toISOString().slice(0, 10)}.pdf`, mime: 'application/pdf', anzeigen: false, groesse: inhalt.length, koepfe: { 'cache-control': 'no-store' } } };
  };
  const nf = () => { if (!x.notfallcode) throw new Fachfehler(404, t('konten.notfall.fehler.aus')); return x.notfallcode; };
  /** Meldungen der Abrufseite in der Anrede für Dritte (#474). */
  const abrufText = async (k: TextDritte) => textDritte((await dienst.datenschutz()).anrede, k);
  const exportZiel = () => { if (!x.exporte) throw new Fachfehler(404, t('werkbank.export.ohne-ordner')); return x.exporte.pfad; };
  /** Nach dem Herunterladen gelöscht (#797), wie die Auskunft: erst, wenn die ZIP ganz gelesen ist. */
  const danachLoeschen = (strom: Readable, ordner: string, melde: () => void) => strom.on('end', () => void loescheExport(ordner).then(melde, () => {}));
  const oidc = () => { if (!x.oidc) throw new Fachfehler(404, t('meldungen.routen.die-anmeldung-ueber-einen')); return x.oidc; };
  const adresse = () => (x.betrieb?.adresseFuerLinks() ?? '').replace(/\/+$/, '');
  const zf = () => { if (!konten.zweifaktor) throw new Fachfehler(404, t('meldungen.routen.die-zwei-faktor-anmeldung')); return konten.zweifaktor; };
  const postfaecher = () => { if (!x.postfaecher) throw new Fachfehler(404, t('meldungen.routen.postfaecher-sind-nicht-eingerichtet')); return x.postfaecher; };
  const pfOAuth = () => { if (!x.postfachOAuth) throw new Fachfehler(404, t('meldungen.routen.die-anmeldung-per-oauth')); return x.postfachOAuth; };
  /** #358: Rückruf-Adresse fest aus der eingestellten Adresse des DMS – nie aus der Anfrage. */
  const pfRueckruf = () => (adresse() ? `${adresse()}/api/oauth/postfach/rueckruf` : '');
  const oauthPostfach = async (id: string) => {
    const p = await postfaecher().hole(id);
    if (p.anmeldung !== 'oauth' || !p.anbieter) throw new Fachfehler(409, t('meldungen.routen.dieses-postfach-meldet-sich'));
    return { id: p.id, anbieter: p.anbieter, benutzer: p.benutzer };
  };
  /** Demo-Dokumente (#248): freier Platz bei den Dateien; frei bleiben müssen Mindest-Speicherplatz der Sicherung bzw. die Speicherplatz-Grenze. */
  const demoPlatz: DemoPlatz | undefined = x.speicherplatz ? {
    frei: async () => (await x.speicherplatz!.messe()).ordner.find((o) => o.art === 'dateien')?.frei ?? null,
    mindest: async () => {
      const grenze = (await x.speicherplatz!.messe()).ordner.find((o) => o.art === 'dateien')?.grenzBytes ?? 0;
      const sich = x.sicherung ? (await x.sicherung.plan()).mindestFreiGB * GB : 0;
      return Math.max(grenze, sich);
    },
  } : undefined;
  const wh = () => { if (!x.wiederherstellung) throw new Fachfehler(404, t('meldungen.routen.die-wiederherstellung-ist-nicht')); return x.wiederherstellung; };
  const anbindung = () => { if (!x.anbindung) throw new Fachfehler(404, t('meldungen.routen.die-datenbank-anbindung-ist')); return x.anbindung; };
  const speicherplatz = () => { if (!x.speicherplatz) throw new Fachfehler(404, t('meldungen.routen.die-speicherplatz-ueberwachung-ist')); return x.speicherplatz; };
  /** Stand für den Wiederherstellungsbildschirm: läuft etwas, oder gibt es eine Abschlussmeldung? */
  const whStand = async () => {
    const lauf = x.wiederherstellung?.aktuellerLauf();
    const abschluss = x.sicherung ? (await x.sicherung.einstellungen.lies('wiederherstellung_abschluss')) as Record<string, unknown> | null : null;
    // Ohne Anmeldung lesbar: ohne die Adresse dessen, der sie gestartet hat.
    return {
      lauf: lauf?.art === 'wiederherstellung' ? { ...lauf, von: '' } : null,
      abschluss: abschluss ? { ...abschluss, von: '' } : null,
    };
  };
  const wartung = () => { if (!x.wartung) throw new Fachfehler(404, t('meldungen.routen.der-wartungsmodus-ist-nicht')); return x.wartung; };
  /** Wiederherstellen im laufenden System (#107, #818): im Verwaltungsmodus mit Recht auf „Sicherung“. */
  const darfWiederherstellen = (a: Anfrage) => a.benutzer?.rolle === 'admin' && darfBereich(a.benutzer, 'sicherung');
  /** Ab der Ankündigung kommen nur Administratoren hinein (#102): eine neue Sitzung gleich wieder beenden. */
  const nurAdminsInWartung = async (r: { benutzer: Benutzer; schluessel: string }) => {
    if (!x.wartung?.sperrtAnmeldung(r.benutzer)) return;
    await konten.abmelden(r.schluessel);
    L.konto.info('Anmeldung im Wartungsmodus abgewiesen', { email: r.benutzer.email });
    throw new WartungFehler(x.wartung.meldung(), x.wartung.retryAfter());
  };
  const intern: Route[] = [
    { methode: 'GET', pfad: '/api/gesundheit', zugang: 'offen', handler: async () => ok({ ok: true, zustand: 'laeuft', stand: standKennung() }) },
    // Wartungsmodus (#102): für Banner und Anmeldeseite, auch ohne Anmeldung.
    { methode: 'GET', pfad: '/api/wartung', zugang: 'offen', handler: async () => ok(x.wartung?.oeffentlich() ?? { stufe: 'aus', text: '', ende: null, aktivAb: null, sekunden: null }) },

    // Sprache vor dem ersten Bild (#729): Die Oberfläche lädt damit ihre Texte, bevor sie etwas zeigt.
    { methode: 'GET', pfad: '/api/sprache', zugang: 'offen', handler: async (a) => ok(await spracheFuer(a)) },
    // Texte eines Sprachpakets (#731) für die Oberfläche – nur erlaubte Sprachen; Texte sind nichts Geheimes (auch die
    // Anmeldeseite braucht sie). Die Oberfläche setzt sie nie als HTML.
    { methode: 'GET', pfad: '/api/sprache/texte/:kennung', zugang: 'offen', handler: async (a) => {
      const e = x.sprachen ? await x.sprachen.lies() : liesSpracheinstellung(null);
      const texte = e.erlaubt.includes(a.params.kennung) ? x.sprachen?.pakete?.texte(a.params.kennung) : null;
      if (!texte) throw new Fachfehler(404, t('meldungen.sprachpakete.keine-texte'));
      return ok(texte);
    } },

    /* ---------- Konto ---------- */
    { methode: 'GET', pfad: '/api/konto/status', zugang: 'offen', handler: async (a) => ok({
      // Sprache (#729): wirksame Sprache, erlaubte Sprachen, Sprache der Installation.
      sprachen: await spracheFuer(a),
      einrichtungNoetig: await konten.einrichtungNoetig(),
      // Einrichtungsassistent (#119): Code nötig? Weitere Schritte für den Administrator offen?
      // #818: für Personen mit „Gesamte Verwaltung“; die Schritte selbst brauchen den Verwaltungsmodus.
      einrichtung: x.einrichtung ? { phase: 'konto', code: x.einrichtung.codeNoetig, assistent: hatGesamt(a.benutzer) && !a.sitzungsDaten?.vertretungId ? (await x.einrichtung.stand()).offen : false } : null,
      mail: konten.mailAktiv,
      benutzer: a.benutzer ?? null,
      // Anmeldung über einen Anbieter (#241): Knopf auf der Anmeldeseite.
      anbieter: !a.benutzer && x.oidc ? await x.oidc.bereit().then((e) => (e ? { knopf: e.knopf, lokalNurAdmins: e.lokalNurAdmins } : null)) : null,
      // Zwei-Faktor (#242): eingerichtet? Für die Rolle vorgeschrieben, aber noch nicht eingerichtet?
      // #416: ausstehend = vorgeschrieben, aber diese Sitzung lief schon vorher – Hinweis statt Sperre.
      zweifaktor: a.benutzer && konten.zweifaktor ? await zweifaktorStatus(konten.zweifaktor, a.benutzer, a.sitzungsDaten) : null,
      // Ohne Schlüssel (Werkbank → Verschlüsselung) lassen sich keine Passwörter speichern (#39, #46).
      passwoerterMoeglich: dienst.passwoerterMoeglich,
      // Logo und Schriftzug des Standard-Designs für die Anmeldeseite (#72).
      marke: x.designs ? await x.designs.marke() : null,
      // Zeitzone der Region (#726): die Oberfläche rechnet „heute“ und Uhrzeiten wie der Server.
      zeitzone: zeitzone(),
      // Wartungsmodus (#102): Hinweis auf der Anmeldeseite.
      wartung: x.wartung?.oeffentlich() ?? null,
      // Version der Installation für Hilfe-Links ins passende Handbuch (#110, #111); nur angemeldet.
      version: a.benutzer ? eigeneVersion() : null,
      // Wiederherstellung (#107): läuft eine, oder gibt es eine Abschlussmeldung?
      wiederherstellung: await (async () => { const s = await whStand(); return { laeuft: !!s.lauf && s.lauf.status !== 'fehler', abschluss: !!s.abschluss }; })(),
      // Ein Administrator agiert gerade als dieser Benutzer:
      vertretung: await konten.vertretungZu(a.sitzungsDaten),
      // Hinweise für den Benutzer selbst (nicht, solange jemand als er agiert):
      hinweise: a.benutzer && !a.sitzungsDaten?.vertretungId ? await konten.hinweise(a.benutzer.id) : [],
      // Favoriten benachrichtigen (#506): von der Werkbank für diesen Benutzer erlaubt? Sonst kein Schalter.
      favoritenBenachrichtigung: a.benutzer ? await dienst.favoritenBenachrichtigungErlaubt(a.benutzer.id) : null,
      // Laufwerk (#720): eingeschaltet? Nur dann zeigt die Oberfläche „Als Laufwerk einbinden“.
      laufwerk: a.benutzer && x.webdav ? (await x.webdav.einstellung()).aktiv : false,
      // Inhalte übersetzen (#732): Knopf „Übersetzung anzeigen“ – Paket, Zielsprache, wohin der Text ggf. geht.
      uebersetzen: a.benutzer ? await dienst.uebersetzung.angebot(a.benutzer, (await spracheFuer(a)).sprache) : null,
      // Aufgaben ohne Empfänger (#719): Sieht dieser Benutzer sie (Administrator oder gewählter Alltags-Benutzer)?
      aufgabenOhneEmpfaenger: a.benutzer ? await dienst.siehtOhneEmpfaenger(a.benutzer) : false,
      // Technische Aufgaben (#719): nur außerhalb des Verwaltungsmodus, nur ja/nein – nie, was genau anliegt.
      verwaltung: await verwaltungHinweis(a),
      // Verwaltungsmodus (#819): darf die Person verwalten, läuft er, bis wann, Wiedereinstieg mit einem Klick?
      verwaltungsmodus: a.benutzer ? await konten.verwaltungsstand(a.benutzer, a.sitzungsDaten) : null,
    }) },
    /* ---------- Verwaltungsmodus (#819) ---------- */
    // Beginnen: ohne Angaben, wenn die Anmeldung frisch oder heute schon bestätigt ist; sonst mit Passwort und Code.
    { methode: 'POST', pfad: '/api/konto/verwaltung', zugang: 'angemeldet', handler: async (a) => ok(await konten.beginneVerwaltung(ich(a), a.sitzung, a.sitzungsDaten, b(a), a.ip)) },
    { methode: 'POST', pfad: '/api/konto/verwaltung/beenden', zugang: 'angemeldet', handler: async (a) => {
      await konten.beendeVerwaltung(ich(a), a.sitzung, a.sitzungsDaten);
      return ok(await konten.verwaltungsstand(ich(a), { ...a.sitzungsDaten!, verwaltungSeit: null, verwaltungAktiv: null }));
    } },
    // Frische Anmeldung für eine heikle Handlung (immer mit Passwort, gilt 10 Minuten).
    { methode: 'POST', pfad: '/api/konto/verwaltung/bestaetigen', zugang: 'angemeldet', handler: async (a) => {
      await konten.bestaetigeFrisch(ich(a), a.sitzung, a.sitzungsDaten, b(a), a.ip);
      return ok({ frisch: true });
    } },
    // Laufwerk für Benutzer (#720): Adresse und Benutzername; ausgeschaltet gibt es nichts.
    { methode: 'GET', pfad: '/api/konto/laufwerk', zugang: 'angemeldet', handler: async (a) => {
      if (!x.webdav || !(await x.webdav.einstellung()).aktiv) throw new Fachfehler(404, t('meldungen.routen.das-laufwerk-ist-nicht'));
      const s = await x.webdav.stand();
      return ok({ adresse: s.adresse, https: s.https, benutzername: ich(a).email });
    } },
    { methode: 'POST', pfad: '/api/konto/hinweise/gesehen', zugang: 'angemeldet', handler: async (a) => {
      if (!a.sitzungsDaten?.vertretungId) await konten.hinweiseGesehen(ich(a).id);
      return leer;
    } },
    { methode: 'POST', pfad: '/api/konto/vertretung-beenden', zugang: 'angemeldet', handler: async (a) => {
      const r = await konten.vertretungBeenden(a.sitzung, info(a));
      L.konto.warn('Vertretung beendet, zurück im eigenen Konto', { als: a.benutzer?.email, admin: r.benutzer?.email });
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },
    { methode: 'POST', pfad: '/api/einrichtung/code', zugang: 'offen', handler: async (a) => {
      if (!x.einrichtung) throw new Fachfehler(404, t('meldungen.routen.kein-einrichtungsassistent'));
      await x.einrichtung.pruefeCode(a.einrichtungscode);
      return ok({ ok: true });
    } },
    // Sammeln vor „Jetzt einrichten“ (#804) und Konfigurationsdatei (#806): mit Code, solange nicht eingerichtet.
    { methode: 'POST', pfad: '/api/einrichtung/pruefen', zugang: 'offen', lesend: true, handler: async (a) => {
      await einrichtungZugang(a);
      return ok({ probleme: x.einrichtung!.pruefePlan(b(a).plan, { passwort: b(a).passwort }) });
    } },
    { methode: 'POST', pfad: '/api/einrichtung/datei/lesen', zugang: 'offen', lesend: true, handler: async (a) => {
      await einrichtungZugang(a);
      return ok(x.einrichtung!.dateiLesen(b(a).text));
    } },
    { methode: 'POST', pfad: '/api/einrichtung/datei/schreiben', zugang: 'offen', lesend: true, handler: async (a) => {
      await einrichtungZugang(a);
      return ok(x.einrichtung!.dateiSchreiben(b(a).plan));
    } },
    // Pakete wählen, bevor es einen Administrator gibt (#804): nur lesend und nur der offizielle Katalog.
    { methode: 'GET', pfad: '/api/einrichtung/pakete', zugang: 'offen', handler: async (a) => {
      await einrichtungZugang(a);
      return ok({ installiert: await pakete.installierte(), dms: eigeneVersion() });
    } },
    { methode: 'POST', pfad: '/api/einrichtung/pakete/katalog', zugang: 'offen', lesend: true, handler: async (a) => {
      await einrichtungZugang(a);
      return ok(await pakete.abrufen(false));
    } },
    { methode: 'POST', pfad: '/api/einrichtung/pakete/plan', zugang: 'offen', lesend: true, handler: async (a) => {
      await einrichtungZugang(a);
      const liste = (b(a) as { pakete?: unknown }).pakete;
      return ok(await pakete.ablaufPlan({ pakete: Array.isArray(liste) ? liste.filter((p): p is string => typeof p === 'string').slice(0, 100) : [] }));
    } },
    // E-Mail-Versand im Assistenten (#813, #804): nur die Server-Suche, nur lesend; gespeichert wird erst mit „Jetzt einrichten“.
    { methode: 'POST', pfad: '/api/einrichtung/mail/finden', zugang: 'offen', lesend: true, handler: async (a) => {
      await einrichtungZugang(a);
      return ok(await betrieb().findeServer(b(a)));
    } },
    { methode: 'POST', pfad: '/api/konto/einrichten', zugang: 'offen', handler: async (a) => {
      const r = x.einrichtung ? await x.einrichtung.einrichten(b(a), a.einrichtungscode, info(a)) : await konten.einrichten(b(a), info(a));
      L.konto.info('Erste Person mit „Gesamte Verwaltung“ eingerichtet', { email: r.benutzer.email });
      // Sprache aus dem ersten Schritt des Assistenten (#729): Sprache der Installation und der Person, die einrichtet.
      let benutzer = r.benutzer;
      const spr = b(a).sprache;
      if (x.sprachen && istVerfuegbar(spr)) {
        await x.sprachen.speichere({ standard: spr, erlaubt: [...new Set([...SPRACHEN_STANDARD.erlaubt, spr])] });
        benutzer = await konten.aendereProfil(benutzer, { sprache: spr });
      }
      return { status: 201, body: { benutzer }, sitzungSetzen: r.schluessel };
    } },
    { methode: 'POST', pfad: '/api/konto/anmelden', zugang: 'offen', handler: async (a) => {
      let r;
      try { r = await konten.anmelden(b(a), a.ip, a.geraet); } catch (e) {
        L.konto.warn('Anmeldung fehlgeschlagen', { email: String(b(a).email ?? ''), ip: a.ip, grund: (e as Error).message });
        throw e;
      }
      // Zwei-Faktor (#242): Passwort stimmt, jetzt der Code.
      if ('zweiterSchritt' in r && r.zweiterSchritt) return ok({ zweiterSchritt: r.zweiterSchritt });
      if (!r.benutzer || !r.schluessel) throw new Fachfehler(500, t('anmeldung.fehler.unvollstaendig'));
      await nurAdminsInWartung({ benutzer: r.benutzer, schluessel: r.schluessel });
      L.konto.info('Angemeldet', { email: r.benutzer.email, ip: a.ip, geraet: a.geraet });
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },
    { methode: 'POST', pfad: '/api/konto/anmelden/code', zugang: 'offen', handler: async (a) => {
      let r;
      try { r = await konten.anmeldenMitCode(b(a), a.ip); } catch (e) {
        L.konto.warn('Zweiter Faktor falsch', { ip: a.ip, grund: (e as Error).message });
        throw e;
      }
      await nurAdminsInWartung(r);
      L.konto.info(r.wiederherstellung ? 'Angemeldet mit Wiederherstellungscode' : 'Angemeldet (zwei Faktoren)', { email: r.benutzer.email, ip: a.ip, geraet: a.geraet });
      return { body: { benutzer: r.benutzer, wiederherstellung: r.wiederherstellung }, sitzungSetzen: r.schluessel };
    } },
    /* ---------- Anmeldung über einen Anbieter, OpenID Connect (#241) ---------- */
    { methode: 'GET', pfad: '/api/konto/anbieter/start', zugang: 'offen', handler: async () => {
      try {
        const s = await oidc().start(`${adresse()}/api/konto/anbieter/rueckkehr`);
        return { weiterleiten: s.url, cookies: [kurzCookie(BINDUNG_COOKIE, s.bindung, 600, '/api/konto/anbieter')] };
      } catch (e) {
        L.konto.warn('Anmeldung über den Anbieter nicht begonnen', { fehler: (e as Error).message });
        return { weiterleiten: `/?anmeldefehler=${encodeURIComponent((e as Error).message)}` };
      }
    } },
    { methode: 'GET', pfad: '/api/konto/anbieter/rueckkehr', zugang: 'offen', handler: async (a) => {
      const raus = [kurzCookie(BINDUNG_COOKIE, '', 0, '/api/konto/anbieter')];
      try {
        const id = await oidc().rueckkehr(a.query, leseCookie(a.cookieKopf, BINDUNG_COOKIE));
        const r = await konten.anmeldenMitAnbieter(id, (await oidc().bereit())!, { ip: a.ip, geraet: a.geraet ?? '' });
        raus.push(kurzCookie(ANBIETER_COOKIE, '1', SITZUNG_SEKUNDEN, '/'));
        if ('zweiterSchritt' in r && r.zweiterSchritt) {
          L.konto.info('Anbieter bestätigt, Zwei-Faktor folgt', { email: id.email, ip: a.ip });
          return { weiterleiten: `/anmelden/code#${r.zweiterSchritt}`, cookies: raus };
        }
        if (!r.benutzer || !r.schluessel) throw new Fachfehler(500, t('anmeldung.fehler.unvollstaendig'));
        await nurAdminsInWartung({ benutzer: r.benutzer, schluessel: r.schluessel });
        L.konto.info('Angemeldet über den Anbieter', { email: r.benutzer.email, ip: a.ip, geraet: a.geraet });
        return { weiterleiten: '/', sitzungSetzen: r.schluessel, cookies: raus };
      } catch (e) {
        L.konto.warn('Anmeldung über den Anbieter fehlgeschlagen', { ip: a.ip, grund: (e as Error).message });
        return { weiterleiten: `/?anmeldefehler=${encodeURIComponent((e as Error).message)}`, cookies: raus };
      }
    } },
    { methode: 'GET', pfad: '/api/werkbank/anbieter', zugang: 'admin', handler: async () => ok({ ...(await oidc().ansicht()), rueckkehr: `${adresse()}/api/konto/anbieter/rueckkehr`, abmeldenZurueck: `${adresse()}/` }) },
    { methode: 'PUT', pfad: '/api/werkbank/anbieter', zugang: 'admin', handler: async (a) => ok({ ...(await oidc().speichere(a.body, ich(a).email)), rueckkehr: `${adresse()}/api/konto/anbieter/rueckkehr`, abmeldenZurueck: `${adresse()}/` }) },
    { methode: 'POST', pfad: '/api/werkbank/anbieter/pruefen', zugang: 'admin', handler: async () => ok(await oidc().pruefe()) },
    /* ---------- Befehl dms im Container (#244) ---------- */
    { methode: 'POST', pfad: '/api/konsole/passwort', zugang: 'offen', konsole: true, handler: async (a) => {
      const z = await konten.setzePasswortDirekt(b(a).email, b(a).passwort);
      L.konto.warn('Passwort über die Konsole gesetzt, alle Sitzungen beendet', { email: z.email, aktiv: z.aktiv });
      return ok({ email: z.email, name: z.name, verwaltung: z.verwaltung ?? [], aktiv: z.aktiv, zweifaktor: konten.zweifaktor ? await konten.zweifaktor.aktiv(z.id) : false });
    } },
    { methode: 'GET', pfad: '/api/konsole/ich', zugang: 'offen', konsole: true, handler: async (a) => ok({ als: a.benutzer?.email ?? null, version: eigeneVersion() }) },
    /* ---------- Zwei-Faktor-Anmeldung (#242) ---------- */
    { methode: 'GET', pfad: '/api/konto/zweifaktor', zugang: 'angemeldet', handler: async (a) => ok({ ...(await zf().status(ich(a).id)), pflicht: (await zf().pflicht())[pflichtRolle(ich(a))] }) },
    { methode: 'POST', pfad: '/api/konto/zweifaktor/beginnen', zugang: 'angemeldet', handler: async (a) => ok(await zf().beginne(ich(a), (await x.designs?.marke())?.schriftzug || 'Ablago')) },
    { methode: 'POST', pfad: '/api/konto/zweifaktor/bestaetigen', zugang: 'angemeldet', handler: async (a) => {
      const codes = await zf().bestaetige(ich(a).id, b(a).code, ich(a).email);
      // #819: Zwei-Faktor geändert – Verwaltungsmodus und Tagesmerker gelten nicht mehr.
      await konten.zweifaktorGeaendert(ich(a).id);
      return ok({ codes });
    } },
    { methode: 'POST', pfad: '/api/konto/zweifaktor/codes', zugang: 'angemeldet', handler: async (a) => {
      await konten.pruefeEigenesPasswort(ich(a), b(a).passwort);
      return ok({ codes: await zf().neueCodes(ich(a).id, ich(a).email) });
    } },
    { methode: 'POST', pfad: '/api/konto/zweifaktor/entfernen', zugang: 'angemeldet', handler: async (a) => {
      if ((await zf().pflicht())[pflichtRolle(ich(a))]) throw new Fachfehler(409, t('meldungen.routen.fuer-dich-ist-die'));
      await konten.pruefeEigenesPasswort(ich(a), b(a).passwort);
      await zf().entferne(ich(a).id, ich(a).email);
      await konten.zweifaktorGeaendert(ich(a).id);
      return leer;
    } },
    { methode: 'GET', pfad: '/api/werkbank/zweifaktor', zugang: 'admin', handler: async () => ok(await zf().pflicht()) },
    { methode: 'PUT', pfad: '/api/werkbank/zweifaktor', zugang: 'admin', handler: async (a) => ok(await zf().setzePflicht(a.body, ich(a).email)) },
    { methode: 'GET', pfad: '/api/benutzer/:id/zweifaktor', zugang: 'admin', handler: async (a) => ok(await zf().status(a.params.id)) },
    { methode: 'POST', pfad: '/api/benutzer/:id/zweifaktor/zuruecksetzen', zugang: 'admin', handler: async (a) => {
      await konten.pruefeKontoVon(ich(a), a.params.id);
      if (!(await zf().entferne(a.params.id, ich(a).email))) throw new Fachfehler(404, t('meldungen.routen.dieser-benutzer-hat-keine'));
      await konten.zweifaktorGeaendert(a.params.id);
      return leer;
    } },
    { methode: 'POST', pfad: '/api/konto/abmelden', zugang: 'offen', handler: async (a) => {
      // Papierkorb beim Abmelden leeren, wenn im Profil so eingestellt (#43) – nicht, solange ein Administrator vertritt.
      if (a.benutzer && !a.sitzungsDaten?.vertretungId && (await konten.einstellungen(a.benutzer)).papierkorb_beim_abmelden === true) {
        await dienst.leerePapierkorb(a.benutzer, false, { weg: 'abmelden' }).catch((e) => L.ablage.warn('Papierkorb beim Abmelden nicht geleert', { fehler: (e as Error).message }));
      }
      await konten.abmelden(a.sitzung);
      if (a.benutzer) L.konto.info('Abgemeldet', { email: a.benutzer.email });
      // Über einen Anbieter angemeldet (#241): auch dort abmelden, wenn eingestellt.
      const beimAnbieter = leseCookie(a.cookieKopf, ANBIETER_COOKIE) === '1' && x.oidc ? await x.oidc.abmeldeUrl(`${adresse()}/`) : null;
      return { status: beimAnbieter ? 200 : 204, body: beimAnbieter ? { abmelden: beimAnbieter } : undefined, sitzungSetzen: null, cookies: [kurzCookie(ANBIETER_COOKIE, '', 0, '/')] };
    } },
    { methode: 'POST', pfad: '/api/konto/passwort-vergessen', zugang: 'offen', handler: async (a) => {
      await konten.passwortVergessen(b(a), log);
      L.konto.info('Passwort vergessen angefordert', { email: String(b(a).email ?? '') });
      return leer;
    } },
    { methode: 'GET', pfad: '/api/konto/link/:schluessel', zugang: 'offen', handler: async (a) => ok(await konten.linkPruefen(a.params.schluessel)) },
    { methode: 'POST', pfad: '/api/konto/passwort-setzen', zugang: 'offen', handler: async (a) => {
      const r = await konten.passwortSetzen(b(a), info(a));
      L.konto.info('Passwort über Link gesetzt', { email: r.benutzer.email });
      if ('zweiterSchritt' in r && r.zweiterSchritt) return ok({ zweiterSchritt: r.zweiterSchritt });
      if (!r.schluessel) throw new Fachfehler(500, t('anmeldung.fehler.unvollstaendig'));
      await nurAdminsInWartung({ benutzer: r.benutzer, schluessel: r.schluessel });
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },

    /* ---------- Eigenes Profil ---------- */
    { methode: 'PUT', pfad: '/api/konto/profil', zugang: 'angemeldet', handler: async (a) => {
      const r = await konten.aendereProfil(ich(a), b(a));
      if (b(a).name !== undefined) L.konto.info('Eigenen Namen geändert', { name: r.name });
      if (b(a).entwicklermodus !== undefined) L.konto.info(`Entwicklermodus ${r.entwicklermodus ? 'ein' : 'aus'}geschaltet`);
      return ok(r);
    } },
    { methode: 'PUT', pfad: '/api/konto/email', zugang: 'angemeldet', handler: async (a) => {
      const alt = ich(a).email;
      const r = await konten.aendereEmail(ich(a), b(a), log);
      if (r.email !== alt) L.konto.info('Eigene E-Mail-Adresse geändert', { alt, neu: r.email });
      return ok(r);
    } },
    { methode: 'PUT', pfad: '/api/konto/passwort', zugang: 'angemeldet', handler: async (a) => {
      const r = await konten.aenderePasswort(ich(a), b(a), log, info(a));
      L.konto.info('Eigenes Passwort geändert, andere Sitzungen beendet');
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },

    /* ---------- Abwesenheit mit Vertreter (#78) ---------- */
    { methode: 'GET', pfad: '/api/konto/abwesenheit', zugang: 'angemeldet', handler: async (a) => {
      const x = (await konten.listeBenutzer()).find((y) => y.id === ich(a).id);
      const offen = (await dienst.meineAufgaben({ id: ich(a).id, rolle: 'mitglied' })).length;
      return ok({ abwesenheit: x?.abwesenheit ?? null, offeneAufgaben: offen });
    } },
    { methode: 'PUT', pfad: '/api/konto/abwesenheit', zugang: 'angemeldet', handler: async (a) => {
      await empfaengerSichtbar(a, b(a).vertreterId); // #137
      const r = await konten.setzeAbwesenheit(ich(a), ich(a).id, b(a));
      L.konto.info(r.abwesenheit?.an ? 'Abwesenheit eingetragen' : 'Abwesenheit ausgeschaltet', { von: r.abwesenheit?.von ?? null, bis: r.abwesenheit?.bis ?? null });
      return ok(r);
    } },
    { methode: 'POST', pfad: '/api/konto/abwesenheit/aufgaben-uebergeben', zugang: 'angemeldet', handler: async (a) => ok(await konten.aufgabenAnVertreter(ich(a), ich(a).id)) },
    { methode: 'PUT', pfad: '/api/benutzer/:id/abwesenheit', zugang: 'admin', handler: async (a) => {
      const r = await konten.setzeAbwesenheit(ich(a), a.params.id, b(a));
      L.konto.info('Abwesenheit eines Benutzers geändert', { email: r.email, an: !!r.abwesenheit?.an, von: r.abwesenheit?.von ?? null, bis: r.abwesenheit?.bis ?? null });
      return ok(await mitRollen(r));
    } },
    { methode: 'POST', pfad: '/api/benutzer/:id/aufgaben-uebergeben', zugang: 'admin', handler: async (a) => ok(await konten.aufgabenAnVertreter(ich(a), a.params.id)) },

    { methode: 'GET', pfad: '/api/konto/einstellungen', zugang: 'angemeldet', handler: async (a) => ok(await konten.einstellungen(ich(a))) },
    { methode: 'PUT', pfad: '/api/konto/einstellungen/:schluessel', zugang: 'angemeldet', handler: async (a) => {
      let k = a.params.schluessel;
      try { k = decodeURIComponent(k); } catch { /* bleibt, wie er ist */ }
      await konten.setzeEinstellung(ich(a), k, b(a).wert);
      return leer;
    } },

    /* ---------- Ablago entdecken (#831, #832) ---------- */
    // Gefiltert nach der Person (Verwaltungsrecht, eingeschaltete Funktionen). In Vertretung startet nichts von selbst,
    // und Ablago merkt sich nichts für die vertretene Person.
    { methode: 'GET', pfad: '/api/entdecken', zugang: 'angemeldet', handler: async (a) => ok(await entdecken.stand(ich(a), { vertretung: !!a.sitzungsDaten?.vertretungId })) },
    { methode: 'POST', pfad: '/api/entdecken/tipps/:schluessel', zugang: 'angemeldet', handler: async (a) => {
      if (!a.sitzungsDaten?.vertretungId) await entdecken.tipp(ich(a), a.params.schluessel, b(a).aktion);
      return leer;
    } },
    { methode: 'POST', pfad: '/api/entdecken/rundgaenge/:schluessel', zugang: 'angemeldet', handler: async (a) => {
      if (!a.sitzungsDaten?.vertretungId) await entdecken.rundgang(ich(a), a.params.schluessel, b(a).stand);
      return leer;
    } },

    /* ---------- Benutzer ---------- */
    // #137: nur Benutzer, deren Benutzer-Mappe man lesen darf (Administratoren: alle).
    { methode: 'GET', pfad: '/api/personen', zugang: 'angemeldet', handler: async (a) => {
      const alle = await konten.personen();
      const sichtbar = await dienst.lesbare(await zg(a), alle.map((p) => p.id));
      // Dienstkonten der Pakete haben keine Benutzer-Mappe; ihr Name („Paket …“) ist für alle sichtbar (#338).
      // Ebenso Systemkonten wie „Automatisierung“ (#673).
      return ok(alle.filter((p) => sichtbar.has(p.id) || ('art' in p && (p.art === 'dienst' || p.art === 'system'))));
    } },
    // Systemkonten und Dienstkonten der Pakete (#673): sichtbar, aber nicht bearbeitbar.
    { methode: 'GET', pfad: '/api/benutzer/systemkonten', zugang: 'admin', handler: async () => ok(await dienst.systemkontenUebersicht(await konten.listeSystemkonten(), await konten.listeDienstkonten())) },
    { methode: 'GET', pfad: '/api/benutzer', zugang: 'admin', handler: async () => {
      const rollen = await dienst.weitereRollen();
      // Offene Aufgaben je Benutzer (#77): Deaktivieren geht erst ohne.
      const offen = new Map<string, number>();
      for (const x of await dienst.alleAufgaben()) if (x.empfaengerId) offen.set(x.empfaengerId, (offen.get(x.empfaengerId) ?? 0) + 1);
      return ok((await konten.listeBenutzer()).map((x) => ({ ...x, rollen: rollen.get(x.id) ?? [], offeneAufgaben: offen.get(x.id) ?? 0 })));
    } },
    { methode: 'POST', pfad: '/api/benutzer', zugang: 'admin', handler: async (a) => {
      if (b(a).rollen !== undefined) await dienst.pruefeRollen(b(a).rollen);
      // Verwaltungsrecht beim Anlegen nur über den Befehl dms (`--admin`); in der Oberfläche danach mit frischer Anmeldung (#818).
      const r = await konten.legeBenutzerAn({ email: b(a).email, name: b(a).name, verwaltung: a.konsole ? b(a).verwaltung : undefined }, ich(a).id);
      if (b(a).rollen !== undefined) await dienst.setzeRollen(r.benutzer.id, b(a).rollen, ich(a).id);
      L.konto.info('Benutzer angelegt', { email: r.benutzer.email, verwaltung: r.benutzer.verwaltung?.join(', ') || '–', mail: r.mailVerschickt });
      if (r.mailFehler) L.mail.warn('Einladung nicht verschickt', { an: r.benutzer.email, fehler: r.mailFehler });
      return ok({ ...r, benutzer: await mitRollen(r.benutzer) }, 201);
    } },
    { methode: 'PUT', pfad: '/api/benutzer/:id', zugang: 'admin', handler: async (a) => {
      // Weitere Rollen zuerst prüfen, damit eine ungültige Auswahl nichts halb ändert.
      if (b(a).rollen !== undefined) {
        if (!(await konten.listeBenutzer()).some((x) => x.id === a.params.id)) throw new Fachfehler(404, t('meldungen.routen.diesen-benutzer-gibt-es'));
        await dienst.pruefeRollen(b(a).rollen);
      }
      const r = await konten.aendereBenutzer(ich(a), a.params.id, b(a));
      if (b(a).rollen !== undefined) await dienst.setzeRollen(r.id, b(a).rollen, ich(a).id);
      L.konto.info('Benutzer geändert', { email: r.email, aenderung: b(a) });
      return ok(await mitRollen(r));
    } },
    // Verwaltungsrecht (#818): nur „Gesamte Verwaltung“, mit frischer Anmeldung (heikle Handlung „rechte“).
    { methode: 'PUT', pfad: '/api/benutzer/:id/verwaltung', zugang: 'admin', handler: async (a) => {
      const r = await konten.setzeVerwaltung(ich(a), a.params.id, b(a).verwaltung, (m) => L.mail.warn(m));
      return ok(await mitRollen(r));
    } },
    { methode: 'GET', pfad: '/api/rollen', zugang: 'admin', handler: async () => ok(await dienst.listeRollen()) },
    { methode: 'DELETE', pfad: '/api/benutzer/:id', zugang: 'admin', handler: async (a) => {
      await konten.loescheBenutzer(ich(a), a.params.id);
      // Gemerkte Passwörter für Dokumente (#827) gehören nur dieser Person: mit weg.
      await dienst.pdfEntsperren?.vergiss(a.params.id).catch(() => {});
      L.konto.info('Benutzer gelöscht', { id: a.params.id });
      return leer;
    } },
    { methode: 'POST', pfad: '/api/benutzer/:id/link', zugang: 'admin', handler: async (a) => {
      await konten.pruefeKontoVon(ich(a), a.params.id);
      const r = await konten.neuerLink(a.params.id);
      L.konto.info('Passwort-Link erzeugt', { email: r.benutzer.email, mail: r.mailVerschickt });
      return ok(r);
    } },
    /*
     * Passwörter für Dokumente (#827, Mein Konto → Sicherheit): gehören nur der Person – nicht mit API-Schlüssel, nicht
     * in einer Vertretung. Anzeigen und Ändern des Passworts nur nach erneuter Bestätigung (5 Minuten je Sitzung).
     */
    { methode: 'GET', pfad: '/api/konto/dokument-passwoerter', zugang: 'angemeldet', handler: async (a) => {
      const e = nurSelbst(a);
      return ok({ eintraege: await e.liste(ich(a).id), bestaetigtBis: await e.bestaetigtBis(a.sitzungsDaten?.id), max: GEMERKT_MAX, zweifaktor: (await zf().status(ich(a).id)).aktiv });
    } },
    { methode: 'POST', pfad: '/api/konto/dokument-passwoerter', zugang: 'angemeldet', handler: async (a) => ok(await nurSelbst(a).merke(ich(a).id, b(a).name, b(a).passwort), 201) },
    { methode: 'POST', pfad: '/api/konto/dokument-passwoerter/bestaetigen', zugang: 'angemeldet', handler: async (a) => {
      const e = nurSelbst(a);
      const bis = await e.bestaetige(ich(a).id, a.sitzungsDaten?.id, async () => {
        // Ein Code der Zwei-Faktor-Anmeldung (nur sechs Ziffern: kein Wiederherstellungscode wird verbraucht) oder das Passwort.
        const code = String(b(a).code ?? '').replace(/\s/g, '');
        if (/^\d{6}$/.test(code)) { if ((await zf().pruefe(ich(a).id, code)) !== 'totp') throw new Fachfehler(403, t('mappen.entsperren.gemerkt.code-falsch')); return; }
        await konten.pruefeEigenesPasswort(ich(a), b(a).passwort);
      });
      return ok({ bestaetigtBis: bis });
    } },
    { methode: 'GET', pfad: '/api/konto/dokument-passwoerter/:id', zugang: 'angemeldet', handler: async (a) => {
      const e = nurSelbst(a);
      await e.pruefeBestaetigt(a.sitzungsDaten?.id);
      return { status: 200, body: { passwort: await e.zeige(ich(a).id, a.params.id) }, koepfe: { 'cache-control': 'no-store' } };
    } },
    { methode: 'PUT', pfad: '/api/konto/dokument-passwoerter/:id', zugang: 'angemeldet', handler: async (a) => {
      const e = nurSelbst(a);
      if (b(a).passwort !== undefined) await e.pruefeBestaetigt(a.sitzungsDaten?.id);
      return ok(await e.aendere(ich(a).id, a.params.id, { name: b(a).name, passwort: b(a).passwort }));
    } },
    { methode: 'DELETE', pfad: '/api/konto/dokument-passwoerter/:id', zugang: 'angemeldet', handler: async (a) => { await nurSelbst(a).loesche(ich(a).id, a.params.id); return leer; } },
    // Eigene angemeldete Geräte (#69): ansehen und beenden – nicht während einer Vertretung.
    { methode: 'GET', pfad: '/api/konto/sitzungen', zugang: 'angemeldet', handler: async (a) => ok(await konten.sitzungenVon(ich(a).id, a.sitzungsDaten?.id)) },
    { methode: 'DELETE', pfad: '/api/konto/sitzungen/:sitzung', zugang: 'angemeldet', handler: async (a) => {
      if (a.sitzungsDaten?.vertretungId) throw new Fachfehler(403, t('meldungen.routen.in-einer-vertretung-lassen'));
      if (a.params.sitzung === a.sitzungsDaten?.id) throw new Fachfehler(409, t('meldungen.routen.das-ist-dieses-geraet'));
      await konten.beendeSitzung(ich(a).id, a.params.sitzung);
      L.konto.info('Eigene Sitzung beendet', { sitzung: a.params.sitzung.slice(0, 8) });
      return leer;
    } },
    { methode: 'POST', pfad: '/api/konto/sitzungen/andere-beenden', zugang: 'angemeldet', handler: async (a) => {
      if (a.sitzungsDaten?.vertretungId) throw new Fachfehler(403, t('meldungen.routen.in-einer-vertretung-lassen'));
      const r = await konten.beendeAndereSitzungen(ich(a).id, a.sitzungsDaten?.id);
      L.konto.info('Andere eigene Sitzungen beendet', { anzahl: r.beendet });
      return ok(r);
    } },
    // Sitzungen Verwaltender (Geräte, Adressen, Abmelden) nur mit „Gesamte Verwaltung“ (#957).
    { methode: 'GET', pfad: '/api/benutzer/:id/sitzungen', zugang: 'admin', handler: async (a) => {
      await konten.pruefeKontoVon(ich(a), a.params.id);
      return ok(await konten.sitzungenVon(a.params.id, a.sitzungsDaten?.id));
    } },
    { methode: 'DELETE', pfad: '/api/benutzer/:id/sitzungen', zugang: 'admin', handler: async (a) => {
      await konten.pruefeKontoVon(ich(a), a.params.id);
      const r = await konten.beendeAlleSitzungen(a.params.id);
      L.konto.info('Alle Sitzungen eines Benutzers beendet', { id: a.params.id, anzahl: r.beendet });
      return ok(r);
    } },
    { methode: 'DELETE', pfad: '/api/benutzer/:id/sitzungen/:sitzung', zugang: 'admin', handler: async (a) => {
      await konten.pruefeKontoVon(ich(a), a.params.id);
      await konten.beendeSitzung(a.params.id, a.params.sitzung);
      L.konto.info('Sitzung beendet', { id: a.params.id, sitzung: a.params.sitzung });
      return leer;
    } },
    { methode: 'POST', pfad: '/api/benutzer/:id/vertreten', zugang: 'admin', handler: async (a) => {
      const r = await konten.vertrete(ich(a), a.sitzung, a.params.id, info(a));
      L.konto.warn('Im Namen eines anderen Benutzers angemeldet', { von: ich(a).email, als: r.benutzer.email, imVerwaltungsmodus: true });
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },

    /* ---------- Stempel beim Weitergeben (#394) ---------- */
    { methode: 'GET', pfad: '/api/stempel/vorlagen', zugang: 'angemeldet', handler: async () => ok(await dienst.stempelVorlagen()) },
    { methode: 'POST', pfad: '/api/werkbank/stempel/vorlagen', zugang: 'admin', handler: async (a) => ok(await dienst.speichereStempelVorlage(null, a.body, ich(a).email), 201) },
    { methode: 'PUT', pfad: '/api/werkbank/stempel/vorlagen/:id', zugang: 'admin', handler: async (a) => ok(await dienst.speichereStempelVorlage(a.params.id, a.body, ich(a).email)) },
    { methode: 'DELETE', pfad: '/api/werkbank/stempel/vorlagen/:id', zugang: 'admin', handler: async (a) => ok(await dienst.loescheStempelVorlage(a.params.id, ich(a).email)) },

    /* ---------- Mappentypen ---------- */
    // Regeln (#123) sehen nur Administratoren; alle anderen erfahren, ob sie anlegen dürfen.
    { methode: 'GET', pfad: '/api/typen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.typenFuer(await zg(a))) },
    { methode: 'GET', pfad: '/api/konto/rechte', zugang: 'angemeldet', handler: async (a) => ok(await dienst.rechteUebersicht(await zg(a))) },
    { methode: 'POST', pfad: '/api/typen', zugang: 'admin', handler: async (a) => {
      const t = await dienst.legeTypAn(a.body);
      L.werkbank.info('Mappentyp angelegt', { typ: t.name, id: t.id, felder: t.felder.length });
      if (t.archiv) archivProtokoll(t, null);
      return ok(t, 201);
    } },
    { methode: 'PUT', pfad: '/api/typen/:id', zugang: 'admin', handler: async (a) => {
      const start = Date.now();
      const vorher = (await dienst.listeTypen()).find((x) => x.id === a.params.id);
      const t = await dienst.aendereTyp(a.params.id, a.body);
      L.werkbank.info('Mappentyp geändert, Titel und Passung neu berechnet', { typ: t.name, id: t.id, ms: Date.now() - start });
      // Archivmodus (#212): Ein-, Aus- und Umschalten festhalten – erst hier beim Speichern (#373).
      archivProtokoll(t, vorher?.archiv ?? null);
      // Versionierung (#194): Ein- und Ausschalten je Register festhalten.
      for (const r of t.register.filter((x) => x.art === 'dokumente')) {
        const war = !!vorher?.register.find((x) => x.key === r.key)?.versionierung;
        if (war !== !!r.versionierung) L.werkbank.info(r.versionierung ? 'Versionierung eingeschaltet' : 'Versionierung ausgeschaltet', { typ: t.name, register: r.name });
      }
      return ok(t);
    } },
    { methode: 'DELETE', pfad: '/api/typen/:id', zugang: 'admin', handler: async (a) => {
      const name = await typName(a.params.id);
      await dienst.loescheTyp(a.params.id);
      L.werkbank.info('Mappentyp gelöscht', { typ: name, id: a.params.id });
      return leer;
    } },
    { methode: 'POST', pfad: '/api/beispiele', zugang: 'admin', handler: async (a) => {
      // Beispiele lösen keine Ereignisse aus (#670).
      await dienst.ohneEreignisse(() => ladeBeispiele(dienst, ich(a).id));
      L.werkbank.info('Beispiel-Mappentypen geladen');
      return leer;
    } },
    { methode: 'GET', pfad: '/api/werkbank/demo', zugang: 'admin', handler: async () => ok(await dienst.demoUebersicht()) },
    // Erzeugen und Entfernen laufen im Hintergrund (202); den Stand liefert /api/werkbank/auftrag.
    { methode: 'POST', pfad: '/api/werkbank/demo', zugang: 'admin', handler: async (a) => {
      const o = pruefeDemoOptionen(b(a));
      const benutzerId = ich(a).id;
      L.werkbank.info('Demo-Mappen werden erzeugt', { anzahl: o.anzahl, dokumente: !!o.dokumente, startwert: o.startwert ?? null });
      const titel = t('meldungen.routen.demo-mappen-erzeugen', { zahl: o.anzahl.toLocaleString(gebietsschema()), wert: o.dokumente ? t('meldungen.routen.mit-dokumenten') : '' });
      return ok(await dienst.auftraege.angemeldet(dienst.auftraege.starte('demo-erzeugen', titel, async (f) => {
        const r = await dienst.ohneEreignisse(() => erzeugeDemo(dienst, o, benutzerId, f, demoPlatz));
        L.werkbank.info('Demo-Daten erzeugt', { mappen: r.gesamt, dokumente: r.dokumente?.anzahl ?? 0, bytes: r.dokumente?.bytes ?? 0, dauerMs: r.dauerMs, startwert: r.startwert, abgebrochen: r.abgebrochen ?? null });
        return r;
      }, demoPhasen(!!o.dokumente))), 202);
    } },
    // Abschätzung vor dem Start (#248): Mappen, Dokumente, Größe, Seiten für die Texterkennung, freier Platz.
    { methode: 'POST', pfad: '/api/werkbank/demo/abschaetzung', zugang: 'admin', lesend: true, handler: async (a) => ok(await schaetzeDemo(dienst, pruefeDemoOptionen(b(a)), demoPlatz)) },
    { methode: 'DELETE', pfad: '/api/werkbank/demo', zugang: 'admin', handler: async () =>
      ok(await dienst.auftraege.angemeldet(dienst.auftraege.starte('demo-entfernen', 'Demo-Mappen entfernen', (f) => dienst.ohneEreignisse(() => dienst.entferneDemo(f)), [{ key: 'mappen', name: 'Demo-Mappen entfernen', einheit: 'Mappen' }])), 202) },
    { methode: 'GET', pfad: '/api/werkbank/auftrag', zugang: 'admin', handler: async () => ok(await dienst.auftraege.stand()) },
    // Abbrechen (#458) – nur Aufträge, die das erlauben (z. B. „Volltext neu erzeugen“).
    { methode: 'POST', pfad: '/api/werkbank/auftrag/abbrechen', zugang: 'admin', handler: async (a) => ok(await dienst.auftraege.abbrechen((b(a) as { id?: unknown }).id)) },

    /* ---------- Protokoll und Debug-Modus ---------- */
    { methode: 'GET', pfad: '/api/werkbank/protokoll', zugang: 'admin', handler: async (a) => {
      const q = a.query;
      const stufe = (STUFEN as readonly string[]).includes(q.stufe ?? '') ? (q.stufe as Stufe) : undefined;
      const eintraege = protokoll.eintraege({
        seit: Number(q.seit) || undefined, stufe, modul: q.modul || undefined, benutzer: q.benutzer || undefined, anfrage: q.anfrage || undefined,
        suche: q.suche?.slice(0, 200) || undefined, max: Math.min(2000, Number(q.max) || 500),
      });
      return ok({ eintraege, letzte: protokoll.letzteNr, gespeichert: protokoll.anzahl, debug: protokoll.debugStand, module: MODULE, jeModul: protokoll.jeModul() });
    } },
    { methode: 'PUT', pfad: '/api/werkbank/debug', zugang: 'admin', handler: async (a) => {
      const an = !!b(a).an;
      const r = protokoll.setzeDebug(an);
      L.system.warn(an ? `Debug-Modus eingeschaltet bis ${new Date(r.bis!).toLocaleTimeString('de-DE', { timeZone: zeitzone() })}` : 'Debug-Modus ausgeschaltet');
      return ok(r);
    } },

    /* ---------- Designs ---------- */
    // Alle Angemeldeten lesen (zum Anwenden und Auswählen), nur Administratoren ändern.
    { methode: 'GET', pfad: '/api/designs', zugang: 'angemeldet', handler: async () => ok(x.designs ? await x.designs.liste() : { designs: [], standard: null }) },
    { methode: 'POST', pfad: '/api/designs', zugang: 'admin', handler: async (a) => {
      const d = await designs().lege(a.body);
      L.werkbank.info('Design angelegt', { name: d.name });
      return ok(d, 201);
    } },
    { methode: 'PUT', pfad: '/api/designs/:id', zugang: 'admin', handler: async (a) => {
      const d = await designs().aendere(a.params.id, a.body);
      L.werkbank.info('Design geändert', { name: d.name });
      return ok(d);
    } },
    { methode: 'DELETE', pfad: '/api/designs/:id', zugang: 'admin', handler: async (a) => {
      await designs().loesche(a.params.id);
      L.werkbank.info('Design gelöscht', { id: a.params.id });
      return leer;
    } },
    // Logo je Design (#72): hochladen als rohe Bytes, entfernen, ausliefern (ohne Anmeldung nur das des Standard-Designs).
    { methode: 'PUT', pfad: '/api/designs/:id/logo', zugang: 'admin', roh: LOGO_MAX + KOERPER_SPIELRAUM, handler: async (a) => {
      const d = await designs().setzeLogo(a.params.id, a.body);
      L.werkbank.info('Logo eines Designs geändert', { design: d.name, bytes: d.logo?.groesse });
      return ok(d);
    } },
    { methode: 'DELETE', pfad: '/api/designs/:id/logo', zugang: 'admin', handler: async (a) => {
      const d = await designs().entferneLogo(a.params.id);
      L.werkbank.info('Logo eines Designs entfernt', { design: d.name });
      return ok(d);
    } },
    { methode: 'GET', pfad: '/api/designs/:id/logo', zugang: 'offen', handler: async (a) => {
      const { logo, inhalt } = await designs().logo(a.params.id, !!a.benutzer);
      return { datei: { inhalt, name: 'logo', mime: logo.mime, anzeigen: true, groesse: logo.groesse } };
    } },
    { methode: 'PUT', pfad: '/api/designs-standard', zugang: 'admin', handler: async (a) => {
      const r = await designs().setzeStandard(String(b(a).id ?? ''));
      L.werkbank.info('Standard-Design festgelegt', { id: r.standard });
      return ok(r);
    } },

    /* ---------- Technik und Versionen ---------- */
    /* ---------- E-Mail-Versand und Adresse (#37) ---------- */
    /* ---------- Texterkennung und Wartungsoperationen (#45) ---------- */
    // Mit den Dateitypen, die Pakete umwandeln bzw. umwandeln könnten (#577).
    { methode: 'GET', pfad: '/api/werkbank/texterkennung', zugang: 'admin', handler: async (a) => ok({ ...(await ocr().status(a.query.neu !== undefined)), umwandlung: await dienst.umwandlungStand(), archivfassung: await dienst.archivStand() }) },
    // Aufträge der Texterkennung einsehen, neu starten, abbrechen (#61)
    { methode: 'GET', pfad: '/api/werkbank/texterkennung/auftraege', zugang: 'admin', handler: async (a) => ok(await ocr().auftraege(a.query)) },
    { methode: 'POST', pfad: '/api/werkbank/texterkennung/auftraege/neu', zugang: 'admin', handler: async (a) => ok(await ocr().neuStarten(b(a).ids, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/texterkennung/auftraege/fehler-neu', zugang: 'admin', handler: async (a) => ok(await ocr().fehlerNeuStarten(ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/texterkennung/auftraege/abbrechen', zugang: 'admin', handler: async (a) => ok(await ocr().abbrechen(b(a).ids, ich(a).email)) },
    { methode: 'PUT', pfad: '/api/werkbank/texterkennung', zugang: 'admin', handler: async (a) => { await ocr().speichere(a.body); return ok({ ...(await ocr().status()), umwandlung: await dienst.umwandlungStand(), archivfassung: await dienst.archivStand() }); } },
    /* ---------- Vollexport (#254) ---------- */
    { methode: 'GET', pfad: '/api/werkbank/export', zugang: 'admin', handler: async () => {
      const ziel = exportZiel();
      const typen = await dienst.listeTypen();
      return ok({ ordner: ziel, tage: EXPORT_TAGE, imSicherungsordner: !!x.exporte?.imSicherungsordner, volume: x.exporte?.volume ?? null, umzug: await umzugHinweis(dienst.einstellungenSpeicher), exporte: await exporteIn(ziel), abschaetzung: await dienst.exportAbschaetzung(), frei: await freierPlatz(ziel), kontakte: kontaktVorschlaege(typen), persoenlich: await dienst.persoenlicherExportErlaubt() });
    } },
    { methode: 'POST', pfad: '/api/werkbank/export', zugang: 'admin', handler: async (a) => {
      const e = (a.body ?? {}) as { passwoerter?: unknown; passwoerterBestaetigt?: unknown; protokolle?: unknown; kontakte?: unknown };
      if (e.passwoerter === true && e.passwoerterBestaetigt !== true) throw new Fachfehler(422, t('meldungen.routen.passwoerter-im-klartext-nur'));
      const ziel = exportZiel();
      const s = await dienst.exportAbschaetzung();
      const frei = await freierPlatz(ziel);
      // Grob: Dokumente plus ein Zuschlag für Tabellen und PDFs.
      if (frei !== null && frei < s.bytes * 1.1 + PLATZ_RESERVE) throw new Fachfehler(507, t('meldungen.routen.zu-wenig-platz-am', { round: Math.round(frei / MB), round2: Math.round((s.bytes * 1.1 + PLATZ_RESERVE) / MB) }));
      const kontakte = e.kontakte && typeof e.kontakte === 'object' ? e.kontakte as ExportOptionen['kontakte'] : undefined;
      const quelle = dienst.vollexportQuelle({
        mandant: (await x.mandantName?.()) ?? '', version: eigeneVersion(),
        benutzer: () => konten.exportDaten(), designs: async () => (x.designs ? (await x.designs.liste()).designs : []),
        protokoll: () => protokoll.eintraege({}),
        // Region (#726): Land, Bundesland, Zeitzone als struktur/region.json.
        ...(x.region ? { region: () => x.region!.lies() } : {}),
      });
      const von = ich(a).email;
      if (e.passwoerter === true) L.werkbank.warn('Vollexport mit Passwörtern im Klartext gestartet', { von });
      else L.werkbank.info('Vollexport gestartet', { von, protokolle: e.protokolle === true });
      return ok(await dienst.auftraege.angemeldet(dienst.auftraege.starte('vollexport', 'Vollexport', async (f) => {
        const r = await vollexport(quelle, ziel, { passwoerter: e.passwoerter === true, protokolle: e.protokolle === true, kontakte }, f);
        L.werkbank.info('Vollexport fertig', { von, name: r.name, dateien: r.dateien, mb: Math.round(r.bytes / MB), mappen: r.mappen });
        return r;
      }, VOLLEXPORT_PHASEN)), 202);
    } },
    // #797: Hinweis „Exporte aus dem Sicherungsordner verschoben“ gelesen.
    { methode: 'POST', pfad: '/api/werkbank/export/umzug-gesehen', zugang: 'admin', handler: async () => { await umzugGesehen(dienst.einstellungenSpeicher); return ok(null); } },
    { methode: 'POST', pfad: '/api/werkbank/export/:name/pruefen', zugang: 'admin', handler: async (a) => ok(await pruefeExport(exportOrdner(exportZiel(), a.params.name))) },
    { methode: 'DELETE', pfad: '/api/werkbank/export/:name', zugang: 'admin', handler: async (a) => {
      await loescheExport(exportOrdner(exportZiel(), a.params.name));
      L.werkbank.info('Vollexport gelöscht', { name: a.params.name, von: ich(a).email });
      return leer;
    } },
    { methode: 'GET', pfad: '/api/werkbank/export/:name/zip', zugang: 'admin', handler: async (a) => {
      const ordner = exportOrdner(exportZiel(), a.params.name);
      const dateien = await exportDateien(ordner).catch(() => { throw new Fachfehler(404, t('meldungen.routen.diesen-export-gibt-es')); });
      const eintraege: ZipEintrag[] = dateien.map((d) => ({ name: `${a.params.name}/${d.name}`, groesse: d.groesse, inhalt: () => oeffneStrom(d.pfad) }));
      const groesse = zipGroesse(eintraege);
      if (groesse > ZIP_MAX) throw new Fachfehler(422, t('meldungen.routen.der-export-ist-groesser'));
      L.werkbank.info('Vollexport heruntergeladen', { name: a.params.name, von: ich(a).email });
      const strom = danachLoeschen(zipStrom(eintraege), ordner, () => L.werkbank.info('Vollexport nach dem Herunterladen gelöscht', { name: a.params.name }));
      return { datei: { inhalt: strom, name: `${a.params.name}.zip`, mime: 'application/zip', anzeigen: false, groesse, koepfe: { 'cache-control': 'no-store' } } };
    } },
    /* ---------- Persönlicher Export (#255) ---------- */
    { methode: 'PUT', pfad: '/api/werkbank/export/persoenlich', zugang: 'admin', handler: async (a) => ok({ erlaubt: await dienst.setzePersoenlicherExport((a.body as { erlaubt?: unknown })?.erlaubt, ich(a).email) }) },
    { methode: 'GET', pfad: '/api/konto/export', zugang: 'angemeldet', handler: async (a) => {
      const id = ich(a).id;
      const ordner = persoenlicherOrdner(exportZiel(), id);
      const fertig = (await exporteIn(ordner))[0] ?? null;
      return ok({ erlaubt: await dienst.persoenlicherExportErlaubt(), ...(await eigenerExport(id)), fertig });
    } },
    { methode: 'POST', pfad: '/api/konto/export', zugang: 'angemeldet', handler: async (a) => {
      if (!(await dienst.persoenlicherExportErlaubt())) throw new Fachfehler(403, t('meldungen.routen.der-persoenliche-export-ist'));
      const e = (a.body ?? {}) as { passwoerter?: unknown; passwoerterBestaetigt?: unknown };
      if (e.passwoerter === true && e.passwoerterBestaetigt !== true) throw new Fachfehler(422, t('meldungen.routen.passwoerter-im-klartext-nur'));
      const id = ich(a).id;
      if ((await eigenerExport(id)).laeuft) throw new Fachfehler(409, t('meldungen.routen.dein-export-laeuft-schon'));
      if (a.sitzungsDaten?.vertretungId) throw new Fachfehler(403, t('meldungen.routen.waehrend-jemand-in-diesem'));
      const ziel = persoenlicherOrdner(exportZiel(), id);
      const quelle = await dienst.persoenlicheQuelle(await zg(a), { mandant: (await x.mandantName?.()) ?? '', version: eigeneVersion(), ich: await konten.exportDatenVon(id) });
      if (!(await dienst.kurzzustand.belege(EXPORT_LAEUFT, id, 12 * 3600_000))) throw new Fachfehler(409, t('meldungen.routen.dein-export-laeuft-schon'));
      await dienst.kurzzustand.loesche(EXPORT_FEHLER, id);
      const zustand = { fehler: null as string | null };
      L.konto[e.passwoerter === true ? 'warn' : 'info'](e.passwoerter === true ? t('meldungen.routen.meine-daten-exportieren-mit') : t('meldungen.routen.meine-daten-exportieren-gestartet'), {});
      void (async () => {
        try {
          for (const alt of await exporteIn(ziel)) await loescheExport(exportOrdner(ziel, alt.name));
          const r = await vollexport(quelle, ziel, { passwoerter: e.passwoerter === true });
          L.konto.info('„Meine Daten exportieren“ fertig', { benutzer: id, dateien: r.dateien, mb: Math.round(r.bytes / MB) });
        } catch (x2) { zustand.fehler = (x2 as Error).message; L.konto.error('„Meine Daten exportieren“ fehlgeschlagen', { benutzer: id, fehler: zustand.fehler }); }
        finally {
          if (zustand.fehler) await dienst.kurzzustand.setze(EXPORT_FEHLER, id, zustand.fehler, Date.now() + 7 * 24 * 3600_000).catch(() => {});
          await dienst.kurzzustand.loesche(EXPORT_LAEUFT, id).catch(() => {});
        }
      })();
      return ok({ laeuft: true }, 202);
    } },
    { methode: 'GET', pfad: '/api/konto/export/zip', zugang: 'angemeldet', handler: async (a) => {
      const ziel = persoenlicherOrdner(exportZiel(), ich(a).id);
      const fertig = (await exporteIn(ziel))[0];
      if (!fertig) throw new Fachfehler(404, t('meldungen.routen.es-gibt-noch-keinen-2'));
      const ordner = exportOrdner(ziel, fertig.name);
      const dateien = await exportDateien(ordner);
      const eintraege: ZipEintrag[] = dateien.map((d) => ({ name: `${fertig.name}/${d.name}`, groesse: d.groesse, inhalt: () => oeffneStrom(d.pfad) }));
      const groesse = zipGroesse(eintraege);
      if (groesse > ZIP_MAX) throw new Fachfehler(422, t('meldungen.routen.dein-export-ist-groesser'));
      L.konto.info('„Meine Daten exportieren“ heruntergeladen', {});
      const strom = danachLoeschen(zipStrom(eintraege), ordner, () => L.konto.info('„Meine Daten exportieren“ nach dem Herunterladen gelöscht', {}));
      return { datei: { inhalt: strom, name: `${fertig.name}.zip`, mime: 'application/zip', anzeigen: false, groesse, koepfe: { 'cache-control': 'no-store' } } };
    } },
    /* ---------- Baum über Verweise (#396, #424): mit den Rechten des Aufrufers ---------- */
    { methode: 'GET', pfad: '/api/mappen/:id/baum', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.baum(a.params.id, a.query, await zg(a))) },
    /* ---------- Datenschutz: Auskunft nach Art. 15 DSGVO (#396), nur Administratoren ---------- */
    { methode: 'GET', pfad: '/api/werkbank/datenschutz', zugang: 'admin', handler: async () => {
      const bereit = await auskuenfteIn(auskunftZiel());
      const auftrag = await dienst.auftraege.stand();
      const laufend = auftrag?.art === 'auskunft' && auftrag.status === 'laeuft' ? { id: auftrag.id, titel: auftrag.titel, gestartet: auftrag.gestartet } : null;
      return ok({
      einstellung: await dienst.datenschutz(), auskuenfte: bereit, tage: AUSKUNFT_TAGE,
      // Liste der Auskünfte (#668): auch Gelöschte als Nachweis, Anfragen mit Frist, der laufende Auftrag.
      verzeichnis: await dienst.auskunftVerzeichnis(bereit, laufend),
      // Zustellen (#455): Abruf-Links (Nachweis, auch nach dem Löschen der ZIP), Erreichbarkeit, E-Mail-Versand.
      links: await dienst.auskunftLinks({ max: 200 }), adresse: adresse(), oeffentlich: oeffentlichErreichbar(adresse()), mail: !!x.betrieb?.mailer(),
      // Löschkonzept (#469): was im erzeugten Dokument noch fehlen würde.
      loeschkonzept: { luecken: luecken(await loeschkonzeptQuelle()) },
    }); } },
    { methode: 'GET', pfad: '/api/werkbank/datenschutz/loeschkonzept', zugang: 'admin', handler: async (a) => {
      const format = a.query.format === 'docx' ? 'docx' : 'pdf';
      const q = await loeschkonzeptQuelle();
      const k = loeschkonzept(q);
      const s = { titel: k.titel, untertitel: k.untertitel, stand: k.stand, vorbemerkung: k.vorbemerkung, abschnitte: k.abschnitte };
      const inhalt = format === 'docx' ? schriftstueckDocx(s) : await schriftstueckPdf(s);
      L.datenschutz.info('Löschkonzept erzeugt', { format, datenarten: k.datenarten.length, luecken: k.luecken.length, von: ich(a).email });
      return { datei: { inhalt, name: `Löschkonzept ${q.stand}.${format}`, mime: format === 'docx' ? DOCX_MIME : 'application/pdf', anzeigen: false, groesse: inhalt.length } };
    } },
    /* Löschprotokoll (#470): nur lesen und ausgeben; ändern lässt sich nur die Aufbewahrung. */
    { methode: 'GET', pfad: '/api/werkbank/loeschprotokoll', zugang: 'admin', lesend: true, handler: async (a) => ok(await dienst.loeschprotokoll(a.query)) },
    { methode: 'GET', pfad: '/api/werkbank/loeschprotokoll/datei', zugang: 'admin', lesend: true, handler: async (a) => {
      const format = a.query.format === 'csv' ? 'csv' : 'pdf';
      const r = await dienst.loeschprotokollAusgabe(a.query, format, { von: ich(a).name || ich(a).email, mandant: (await x.mandantName?.()) ?? '', version: eigeneVersion() });
      L.datenschutz.info('Löschprotokoll ausgegeben', { format, von: ich(a).email });
      return { datei: { inhalt: r.inhalt, name: r.name, mime: r.mime, anzeigen: false, groesse: r.inhalt.length } };
    } },
    { methode: 'PUT', pfad: '/api/werkbank/loeschprotokoll/einstellungen', zugang: 'admin', handler: async (a) => ok({ jahre: await dienst.setzeLoeschprotokollJahre(b(a).jahre, ich(a).email) }) },
    { methode: 'PUT', pfad: '/api/werkbank/datenschutz', zugang: 'admin', handler: async (a) => ok(await dienst.setzeDatenschutz(a.body, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/auskunft/vorschau', zugang: 'admin', lesend: true, handler: async (a) => ok(await dienst.auskunftVorschau(a.body, await zg(a))) },
    { methode: 'POST', pfad: '/api/werkbank/auskunft/frist', zugang: 'admin', handler: async (a) => ok(await dienst.auskunftFrist(a.body, await zg(a), ich(a).id), 201) },
    { methode: 'POST', pfad: '/api/werkbank/auskunft', zugang: 'admin', handler: async (a) => {
      const mandant = (await x.mandantName?.()) ?? '';
      const daten = await dienst.auskunftDaten(a.body, await zg(a), { mandant, version: eigeneVersion() });
      const ziel = auskunftZiel();
      await mkdir(ziel, { recursive: true });
      await auskuenfteIn(ziel);
      const von = { id: ich(a).id, name: ich(a).name, email: ich(a).email };
      L.datenschutz.info('Auskunft gestartet', { mappeId: daten.start.id, mappen: daten.anzahl.mappen, dokumente: daten.anzahl.dokumente, von: von.email });
      return ok(await dienst.auftraege.angemeldet(dienst.auftraege.starte('auskunft', `Auskunft für ${daten.start.titel || 'Ohne Titel'}`, async (f) => {
        const r = await erzeugeAuskunft(daten, ziel, { von, mandant }, f);
        await dienst.auskunftNachweis(daten, von, r);
        return r;
      }, AUSKUNFT_PHASEN)), 202);
    } },
    { methode: 'GET', pfad: '/api/werkbank/auskunft/:id/zip', zugang: 'admin', handler: async (a) => {
      const ziel = auskunftZiel();
      const { stand, pfad, groesse } = await auskunftDatei(ziel, a.params.id);
      // Nach dem Herunterladen gelöscht (#396): erst, wenn die Datei ganz gelesen ist – außer, ein Abruf-Link
      // gilt noch (#455): Dann bleibt sie, bis die Person sie abgerufen hat oder der Link abläuft.
      const halten = await dienst.auskunftLinkAktiv(stand.id);
      const strom = await oeffneStrom(pfad);
      strom.on('end', () => void dienst.auskunftNotiz(stand, ich(a).id, 'download').catch(() => {}));
      strom.on('end', () => (halten ? L.datenschutz.info('Auskunft heruntergeladen (bleibt für den Abruf-Link)', { mappeId: stand.mappeId, von: ich(a).email })
        : void loescheAuskunft(ziel, stand.id).then(() => L.datenschutz.info('Auskunft heruntergeladen und gelöscht', { mappeId: stand.mappeId, von: ich(a).email }))));
      // Personenbezogene Daten: nicht im Cache des Browsers ablegen (fremder oder gemeinsam genutzter Rechner).
      return { datei: { inhalt: strom, name: `${stand.name}.zip`, mime: 'application/zip', anzeigen: false, groesse, koepfe: { 'cache-control': 'no-store' } } };
    } },
    { methode: 'DELETE', pfad: '/api/werkbank/auskunft/:id', zugang: 'admin', handler: async (a) => {
      // Nachweis (#668): vorher merken, zu wem sie gehört – die Zeile bleibt in der Liste der Auskünfte.
      const vorher = (await auskuenfteIn(auskunftZiel())).find((s) => s.id === a.params.id);
      await loescheAuskunft(auskunftZiel(), a.params.id);
      if (vorher) await dienst.auskunftNotiz(vorher, ich(a).id, 'geloescht');
      // Ohne ZIP kein Abruf (#455): gültige Links gleich mit zurückziehen.
      for (const l of await dienst.auskunftLinks({ auskunftId: a.params.id })) if (linkStatus(l) === 'aktiv') await dienst.auskunftLinkWiderrufen(l.id, ich(a));
      L.datenschutz.info('Auskunft gelöscht', { id: a.params.id, von: ich(a).email });
      return leer;
    } },
    /* ---------- Auskunft zustellen (#455) ---------- */
    { methode: 'POST', pfad: '/api/werkbank/auskunft/:id/email', zugang: 'admin', handler: async (a) => {
      const { stand, pfad } = await auskunftDatei(auskunftZiel(), a.params.id);
      const i = ich(a);
      return ok(await dienst.auskunftPerEmail(stand, () => oeffneStrom(pfad), a.body, { id: i.id, name: i.name, email: i.email }, x.betrieb?.mailer() ?? null));
    } },
    { methode: 'POST', pfad: '/api/werkbank/auskunft/:id/link', zugang: 'admin', handler: async (a) => {
      const ziel = auskunftZiel();
      const { stand } = await auskunftDatei(ziel, a.params.id);
      const i = ich(a);
      const r = await dienst.auskunftLinkAnlegen(stand, a.body, { id: i.id, name: i.name, email: i.email }, { adresse: adresse(), mailer: x.betrieb?.mailer() ?? null });
      // Die ZIP bleibt, solange der Link gilt.
      await haltenBis(ziel, stand.id, r.link.ablauf);
      return ok(r, 201);
    } },
    { methode: 'POST', pfad: '/api/werkbank/auskunft/link/:id/widerrufen', zugang: 'admin', handler: async (a) => {
      const l = await dienst.auskunftLinkWiderrufen(a.params.id, ich(a));
      // Ohne gültigen Link gilt für die ZIP wieder das ursprüngliche Ende.
      if (!(await dienst.auskunftLinkAktiv(l.auskunftId))) await haltenBis(auskunftZiel(), l.auskunftId, null);
      return ok(l);
    } },
    /*
     * Öffentliche Abrufseite (#455) – der einzige Weg ohne Anmeldung zu einer Auskunft. Schlüssel und Code
     * kommen per POST (mit X-DMS, also nicht von fremden Seiten); Fehlversuche zählen im Anmeldeschutz je IP
     * und am Link (Sperre nach LINK_FEHLVERSUCHE_MAX). Antworten verraten nicht, ob es einen Link gibt.
     * Im Protokoll stehen weder Schlüssel noch Code, die IP nur gekürzt.
     */
    /*
     * Notfallzugang mit dem Notfallcode vom Notfallblatt (#815) – ohne Anmeldung, auf /notfall. Erst der richtige Code
     * zeigt die Konten zur Wahl; jede Fehleingabe sperrt den Adressbereich 30 Sekunden (notfallcode.ts).
     */
    { methode: 'GET', pfad: '/api/notfall', zugang: 'offen', handler: async (a) => ok(await nf().stand(a)) },
    { methode: 'POST', pfad: '/api/notfall/pruefen', zugang: 'offen', handler: async (a) => ok(await nf().pruefe(a, b(a).code)) },
    { methode: 'POST', pfad: '/api/notfall/einloesen', zugang: 'offen', handler: async (a) => ok(await nf().einloesen(a, b(a))) },
    { methode: 'GET', pfad: '/api/notfall/blatt', zugang: 'offen', ohneHead: true, handler: async (a) => {
      const inhalt = await nf().blatt(a.query.schluessel, notfallblattErzeugen);
      return { datei: { inhalt, name: `Ablago-Notfallblatt-${new Date().toISOString().slice(0, 10)}.pdf`, mime: 'application/pdf', anzeigen: false, groesse: inhalt.length, koepfe: { 'cache-control': 'no-store' } } };
    } },
    // Anrede (#474): Die Abrufseite fragt nur ab, ob sie „du“ oder „Sie“ schreibt – sonst nichts über das DMS.
    { methode: 'GET', pfad: '/api/abruf/anrede', zugang: 'offen', handler: async () => ok({ anrede: (await dienst.datenschutz()).anrede }) },
    { methode: 'POST', pfad: '/api/abruf', zugang: 'offen', handler: async (a) => {
      const o = (a.body ?? {}) as Record<string, unknown>;
      const bereich = ipBereich(a.ip);
      if (await abrufBremse.gesperrt(bereich)) throw new Fachfehler(429, await abrufText('abruf.fehler.zuviele'));
      // Code-Prüfungen (scrypt) nur mit freiem Platz der Bremse: Parallele Anfragen kommen so weder an den
      // Zählern vorbei noch lasten sie den Server aus.
      const r = await dienst.auskunftAbrufPruefen(o.schluessel, o.code, () => abrufBremse.belege());
      if (r.art === 'beschaeftigt') throw new Fachfehler(429, await abrufText('abruf.fehler.zuviele'));
      if (r.art === 'falsch') {
        await abrufBremse.fehlschlag(bereich);
        L.datenschutz.warn('Abruf einer Auskunft fehlgeschlagen', { ip: kuerzeIp(a.ip), ...(r.link ? { link: r.link.id } : {}) });
        throw new Fachfehler(403, await abrufText('abruf.fehler.falsch'));
      }
      if (r.art === 'ungueltig') throw new Fachfehler(410, await abrufText('abruf.fehler.ungueltig'));
      const link = r.link!;
      const datei = await auskunftDatei(auskunftZiel(), link.auskunftId).catch(() => null);
      if (!datei) throw new Fachfehler(410, await abrufText('abruf.fehler.ungueltig'));
      L.datenschutz.info('Abrufcode einer Auskunft bestätigt', { link: link.id, ip: kuerzeIp(a.ip) });
      return ok({ ticket: await abrufTickets.stelleAus(link.id), groesse: datei.groesse, verschluesselt: datei.stand.verschluesselt, bis: link.ablauf, abrufe: link.abrufe, maxAbrufe: link.maxAbrufe });
    } },
    { methode: 'GET', pfad: '/api/abruf/datei', zugang: 'offen', ohneHead: true, handler: async (a) => {
      const id = await abrufTickets.loese(a.query.ticket);
      const link = id ? await dienst.auskunftLinkMitId(id) : undefined;
      if (!link) throw new Fachfehler(410, await abrufText('abruf.fehler.ticket'));
      const ziel = auskunftZiel();
      const datei = await auskunftDatei(ziel, link.auskunftId).catch(() => null);
      if (!datei) throw new Fachfehler(410, await abrufText('abruf.fehler.ungueltig'));
      const nr = await dienst.auskunftAbrufZaehlen(link.id);
      if (nr === null) throw new Fachfehler(410, await abrufText('abruf.fehler.ungueltig'));
      const { stand, pfad, groesse } = datei;
      const strom = await oeffneStrom(pfad);
      let fertig = false;
      strom.on('end', () => {
        fertig = true;
        void (async () => {
          await dienst.auskunftAbgerufen(link, nr, true, stand.vonId);
          L.datenschutz.info('Auskunft abgerufen', { mappeId: link.mappeId, link: link.id, nr, ip: kuerzeIp(a.ip) });
          // Alle Abrufe verbraucht: Die ZIP wird nicht mehr gebraucht.
          if (nr >= link.maxAbrufe) await loescheAuskunft(ziel, stand.id);
        })().catch((e) => L.datenschutz.error('Abruf nicht vermerkt', { fehler: (e as Error).message }));
      });
      strom.on('close', () => { if (!fertig) void dienst.auskunftAbgerufen(link, nr, false).catch(() => {}); });
      // Personenbezogene Daten: nicht im Cache des Browsers ablegen (fremder oder gemeinsam genutzter Rechner).
      return { datei: { inhalt: strom, name: `${stand.name}.zip`, mime: 'application/zip', anzeigen: false, groesse, koepfe: { 'cache-control': 'no-store' } } };
    } },
    /* ---------- Archivmodus (#212) ---------- */
    { methode: 'POST', pfad: '/api/werkbank/archiv/vorschau', zugang: 'admin', lesend: true, handler: async (a) => ok(await dienst.archivVorschau(String((a.body as { typId?: unknown })?.typId ?? ''), (a.body as { archiv?: unknown })?.archiv)) },
    { methode: 'GET', pfad: '/api/werkbank/darf-weg', zugang: 'admin', handler: async () => ok(await dienst.darfWeg()) },
    { methode: 'POST', pfad: '/api/werkbank/wartung/dateien', zugang: 'admin', handler: async (a) => ok(await dienst.auftraege.angemeldet(dienst.pruefeDateien(ich(a).email)), 202) },
    // Nur Vorhandensein (#877), ohne zu lesen: für den Lasttest („Dokumente ohne Datei: n“) und Skripte.
    { methode: 'GET', pfad: '/api/werkbank/wartung/dateien/fehlend', zugang: 'admin', handler: async () => ok(await dienst.dokumenteOhneDatei()) },
    /* ---------- Auswahlfilter am Referenzfeld (#172, #173) ---------- */
    { methode: 'POST', pfad: '/api/mappen/auswahl-pruefen', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.auswahlPruefen(a.body, ich(a).id, await zg(a))) },
    // Folgt aus (#886): was aus den gewählten Quellen folgt – die Oberfläche füllt damit leere Felder und fragt bei Abweichung.
    { methode: 'POST', pfad: '/api/mappen/folgen', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.folgen(a.body, await zg(a))) },
    { methode: 'POST', pfad: '/api/werkbank/auswahlfilter/zaehlen', zugang: 'admin', lesend: true, handler: async (a) => ok(await dienst.zaehleAuswahl(a.body, ich(a).id)) },
    /* ---------- Nummernkreise (#171) ---------- */
    // Paketverwaltung (#188, #189): Kataloge nur auf Knopfdruck; weitere Quellen und Hochladen in der erweiterten Ansicht.
    { methode: 'GET', pfad: '/api/werkbank/pakete', zugang: 'admin', handler: async () => ok({ installiert: await pakete.installierte(), katalogUrl: pakete.katalogUrl, quellen: await pakete.quellen(), dms: eigeneVersion() }) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/katalog', zugang: 'admin', handler: async (a) => ok(await pakete.abrufen((a.body as { alle?: unknown } | null)?.alle === true)) },
    // Eigener Katalog mit Schlüssel (#594): ohne passenden Fingerabdruck 409 mit dem Fingerabdruck zum Bestätigen.
    { methode: 'POST', pfad: '/api/werkbank/pakete/quellen', zugang: 'admin', handler: async (a) => ok(await pakete.quelleHinzufuegen((a.body ?? {}) as { url?: unknown; fingerabdruck?: unknown }, wer(a))) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/quellen/schluessel', zugang: 'admin', handler: async (a) => ok(await pakete.quelleSchluessel((a.body ?? {}) as { url?: unknown; fingerabdruck?: unknown }, wer(a))) },
    { methode: 'PUT', pfad: '/api/werkbank/pakete/quellen', zugang: 'admin', handler: async (a) => ok(await pakete.quelleSchalten((a.body ?? {}) as { url?: unknown; aktiv?: unknown }, wer(a))) },
    { methode: 'DELETE', pfad: '/api/werkbank/pakete/quellen', zugang: 'admin', handler: async (a) => ok(await pakete.quelleEntfernen(String(a.query.url ?? ''), wer(a))) },
    // Paket selbst erstellen (#374): Auswahl, Prüfung, Export als .zip im Format der Registry.
    { methode: 'GET', pfad: '/api/werkbank/pakete/erstellen', zugang: 'admin', handler: async () => ok(await paketerstellung.stand()) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/erstellen/pruefen', zugang: 'admin', handler: async (a) => ok(await paketerstellung.pruefe(a.body)) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/erstellen/letzte', zugang: 'admin', lesend: true, roh: ARCHIV_MAX + KOERPER_SPIELRAUM, handler: async (a) => ok(paketerstellung.liesLetzteVersion(a.body)) },
    // „Paket erstellen“ (#652): erstellt, ohne herunterzuladen; selbst erstellte Pakete in der Paketverwaltung.
    { methode: 'POST', pfad: '/api/werkbank/pakete/erstellen/anlegen', zugang: 'admin', handler: async (a) => ok(await paketerstellung.erstelle(a.body, wer(a))) },
    { methode: 'GET', pfad: '/api/werkbank/pakete/selbst', zugang: 'admin', handler: async () => ok(await paketerstellung.selbstErstellt()) },
    { methode: 'GET', pfad: '/api/werkbank/pakete/selbst/:id', zugang: 'admin', handler: async (a) => ok(await paketerstellung.selbstErstelltDetail(a.params.id)) },
    { methode: 'GET', pfad: '/api/werkbank/pakete/selbst/:id/zip', zugang: 'admin', handler: async (a) => {
      const r = await paketerstellung.archiv(a.params.id, String(a.query.version ?? ''));
      return { datei: { inhalt: r.daten, name: r.name, mime: 'application/zip', anzeigen: false, groesse: r.daten.length } };
    } },
    { methode: 'DELETE', pfad: '/api/werkbank/pakete/selbst/:id', zugang: 'admin', handler: async (a) => ok(await paketerstellung.ausListeNehmen(a.params.id, wer(a))) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/erstellen/export', zugang: 'admin', handler: async (a) => {
      const r = await paketerstellung.exportiere(a.body, wer(a));
      return { datei: { inhalt: r.daten, name: r.name, mime: 'application/zip', anzeigen: false, groesse: r.daten.length } };
    } },
    // Ein Paket (höchstens PAKET_MAX, #644) oder eine Sammeldatei mit mehreren Paketen (#461, höchstens SAMMEL_MAX).
    { methode: 'POST', pfad: '/api/werkbank/pakete/hochladen', zugang: 'admin', roh: SAMMEL_MAX + KOERPER_SPIELRAUM, handler: async (a) => ok(await pakete.hochladenDatei(a.body, wer(a))) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/vorschau', zugang: 'admin', lesend: true, handler: async (a) => ok(await pakete.vorschau((a.body ?? {}) as { id?: string; version?: string; quelle?: string; upload?: string })) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/installieren', zugang: 'admin', handler: async (a) => ok(await pakete.mitSperre(() => pakete.installiere((a.body ?? {}) as InstallierenEingabe, wer(a)))) },
    // Mehrere Pakete in einem Ablauf (#405): Plan (nichts wird gespeichert) und Installation mit allen Antworten.
    { methode: 'POST', pfad: '/api/werkbank/pakete/ablauf/plan', zugang: 'admin', lesend: true, handler: async (a) => ok(await pakete.ablaufPlan((a.body ?? {}) as AblaufEingabe)) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/ablauf/installieren', zugang: 'admin', handler: async (a) => ok(await pakete.mitSperre(() => pakete.ablaufInstallieren((a.body ?? {}) as AblaufInstallation, wer(a)))) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/updates', zugang: 'admin', handler: async () => ok(await pakete.updates()) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/:id/aktualisieren', zugang: 'admin', handler: async (a) => ok(await pakete.mitSperre(() => pakete.aktualisiere(a.params.id, (a.body ?? {}) as { version?: string; bestaetigt?: boolean; rechteBestaetigt?: boolean }, wer(a)))) },
    // Paket-Läufer (#338): Stand je Paket mit Code – geladen, Aufrufe, Fehler, Ereignisse.
    { methode: 'GET', pfad: '/api/werkbank/pakete/laeufer', zugang: 'admin', handler: async () => ok(x.paketlaeufer ? await x.paketlaeufer.uebersicht() : null) },
    // Vektoren (#442): Stand der Berechnung, Einstellung „Ähnliche Treffer in der Suche“, neu berechnen.
    // Suche (#356): Tippfehler an/aus, gleichbedeutende Wörter, Wörterverzeichnis.
    { methode: 'GET', pfad: '/api/werkbank/suche', zugang: 'admin', handler: async () => ok(await dienst.sucheStand()) },
    { methode: 'PUT', pfad: '/api/werkbank/suche', zugang: 'admin', handler: async (a) => ok(await dienst.setzeSuche(a.body, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/suche/synonyme', zugang: 'admin', handler: async (a) => ok(await dienst.legeSynonymAn(a.body, ich(a).email)) },
    { methode: 'PUT', pfad: '/api/werkbank/suche/synonyme/:id', zugang: 'admin', handler: async (a) => ok(await dienst.aendereSynonym(a.params.id, a.body, ich(a).email)) },
    { methode: 'DELETE', pfad: '/api/werkbank/suche/synonyme/:id', zugang: 'admin', handler: async (a) => ok(await dienst.loescheSynonym(a.params.id, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/suche/woerter', zugang: 'admin', handler: async (a) => ok(await dienst.woerterNeu(ich(a).email)) },
    { methode: 'GET', pfad: '/api/werkbank/vektoren', zugang: 'admin', handler: async () => ok(await dienst.vektorStand()) },
    // „Aus Dokument ausfüllen“ per Paket (#511): Standard-Erkennung (eingebaut oder Paket mit dms:erkennen).
    { methode: 'GET', pfad: '/api/werkbank/erkennung', zugang: 'admin', handler: async () => ok(await dienst.erkennung.engineStand()) },
    { methode: 'PUT', pfad: '/api/werkbank/erkennung', zugang: 'admin', handler: async (a) => ok(await dienst.erkennung.setzeStandard(a.body)) },
    // „Frag deine Ablage“ (#444): Höchstmenge je Frage (Ausschnitte, Zeichen).
    { methode: 'GET', pfad: '/api/werkbank/fragen', zugang: 'admin', handler: async () => ok(await dienst.fragen.stand()) },
    { methode: 'PUT', pfad: '/api/werkbank/fragen', zugang: 'admin', handler: async (a) => { await dienst.fragen.setzeGrenzen(a.body); return ok(await dienst.fragen.stand()); } },
    { methode: 'GET', pfad: '/api/fragen', zugang: 'angemeldet', handler: async () => { const s = await dienst.fragen.stand(); return ok({ verfuegbar: s.verfuegbar, paket: s.paket }); } },
    // Frage stellen: Antwort als NDJSON-Strom (Ausschnitte, Teile, fertig/fehler). Inhalt steht nirgends im Protokoll.
    { methode: 'POST', pfad: '/api/fragen', zugang: 'angemeldet', handler: async (a) => {
      const z = await zg(a);
      const strom = new PassThrough();
      const zeile = (x: unknown) => { if (!strom.destroyed && !strom.writableEnded) strom.write(`${JSON.stringify(x)}\n`); };
      // Fehler vor dem ersten Ausschnitt (keine Frage, kein Paket, schon eine Frage offen) kommen als normale Antwort.
      let erste: (() => void) | null = null;
      const bereit = new Promise<void>((ok) => { erste = ok; });
      const lauf = dienst.fragen.frage(z, a.body, (x) => { zeile(x); erste?.(); erste = null; });
      await Promise.race([bereit, lauf]);
      void lauf.catch(() => {}).finally(() => { if (!strom.destroyed) strom.end(); });
      return { strom };
    } },
    { methode: 'PUT', pfad: '/api/werkbank/vektoren', zugang: 'admin', handler: async (a) => { await dienst.setzeVektorEinstellung(a.body); return ok(await dienst.vektorStand()); } },
    { methode: 'POST', pfad: '/api/werkbank/vektoren/neu', zugang: 'admin', handler: async () => {
      if (!x.paketlaeufer) throw new Fachfehler(404, t('meldungen.routen.pakete-mit-code-laufen'));
      try { return ok(await x.paketlaeufer.vektorenNeu()); } catch (e) { throw e instanceof Fachfehler ? e : new Fachfehler(409, (e as Error).message); }
    } },
    { methode: 'DELETE', pfad: '/api/werkbank/pakete/:id', zugang: 'admin', handler: async (a) => ok(await pakete.mitSperre(() => pakete.entferne(a.params.id, wer(a), a.query.einstellungenBehalten === '1', a.query.spracheBestaetigt === '1'))) },
    // Beispiele entfernen (#878): unveränderte Beispiel-Mappen samt Dokumenten; geänderte bleiben und stehen in der Antwort.
    { methode: 'POST', pfad: '/api/werkbank/pakete/:id/beispiele/entfernen', zugang: 'admin', handler: async (a) => ok(await pakete.mitSperre(() => pakete.beispieleEntfernen(a.params.id, wer(a)))) },
    // Paket-Einstellungen (#197): nur Administratoren, nicht über die API v1.
    // Paket-Update: Text in Verweis umwandeln (#534) – Vorschau, Umwandeln, Rückgängig.
    { methode: 'GET', pfad: '/api/werkbank/pakete/:id/umwandlungen', zugang: 'admin', handler: async (a) => ok(await umwandlung.liste(a.params.id)) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/:id/umwandlungen/vorschau', zugang: 'admin', lesend: true, handler: async (a) => ok(await umwandlung.vorschau(a.params.id, (a.body ?? {}) as { typId?: unknown; feldKey?: unknown }, await zg(a))) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/:id/umwandlungen', zugang: 'admin', handler: async (a) => ok(await umwandlung.umwandeln(a.params.id, (a.body ?? {}) as { typId?: unknown; feldKey?: unknown; entscheidungen?: unknown }, wer(a), await zg(a))) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/:id/umwandlungen/:vorgang/rueckgaengig', zugang: 'admin', handler: async (a) => ok(await umwandlung.rueckgaengig(a.params.vorgang, wer(a), await zg(a))) },
    { methode: 'GET', pfad: '/api/werkbank/pakete/:id/einstellungen', zugang: 'admin', handler: async (a) => ok(await pakete.einstellungen(a.params.id)) },
    { methode: 'PUT', pfad: '/api/werkbank/pakete/:id/einstellungen', zugang: 'admin', handler: async (a) => ok(await pakete.speichereEinstellungen(a.params.id, a.body, wer(a))) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/:id/aktionen/:aktion', zugang: 'admin', handler: async (a) => ok(await pakete.aktion(a.params.id, a.params.aktion, wer(a))) },
    { methode: 'GET', pfad: '/api/werkbank/nummernkreise', zugang: 'admin', handler: async () => ok(await dienst.listeNummernkreise()) },
    { methode: 'POST', pfad: '/api/werkbank/nummernkreise', zugang: 'admin', handler: async (a) => {
      await dienst.speichereNummernkreis({ ...(a.body as object), neu: true }, ich(a).email);
      return ok(await dienst.listeNummernkreise(), 201);
    } },
    { methode: 'PUT', pfad: '/api/werkbank/nummernkreise/:schluessel', zugang: 'admin', handler: async (a) => {
      await dienst.speichereNummernkreis({ ...(a.body as object), schluessel: a.params.schluessel, neu: false }, ich(a).email);
      return ok(await dienst.listeNummernkreise());
    } },
    { methode: 'DELETE', pfad: '/api/werkbank/nummernkreise/:schluessel', zugang: 'admin', handler: async (a) => {
      await dienst.loescheNummernkreis(a.params.schluessel, ich(a).email);
      return ok(await dienst.listeNummernkreise());
    } },
    { methode: 'POST', pfad: '/api/werkbank/nummernkreise/:schluessel/zaehler', zugang: 'admin', handler: async (a) => {
      await dienst.setzeZaehler(a.params.schluessel, a.body, ich(a).email);
      return ok(await dienst.listeNummernkreise());
    } },
    { methode: 'GET', pfad: '/api/werkbank/wartung/nummern', zugang: 'admin', handler: async (a) => ok(await dienst.nummernVorschau(a.query.typ ?? '', a.query.feld ?? '')) },
    { methode: 'POST', pfad: '/api/werkbank/wartung/nummern', zugang: 'admin', handler: async (a) =>
      ok(await dienst.auftraege.angemeldet(dienst.nummernNachtragen(String((a.body as { typId?: unknown })?.typId ?? ''), String((a.body as { feldKey?: unknown })?.feldKey ?? ''), ich(a).email)), 202) },
    // Absender bereinigen (#494): Vorschau, dann nur die gewählten Posts.
    { methode: 'GET', pfad: '/api/werkbank/wartung/absender', zugang: 'admin', handler: async () => ok(await dienst.absenderVorschau()) },
    // Angaben, die nicht zum Format passen (#535): je Mappentyp und Feld, mit Sprung zur Mappe.
    { methode: 'GET', pfad: '/api/werkbank/wartung/formate', zugang: 'admin', handler: async () => ok({ typen: await dienst.unpassendeFormate() }) },
    { methode: 'POST', pfad: '/api/werkbank/wartung/absender', zugang: 'admin', handler: async (a) =>
      ok(await dienst.absenderBereinigen((a.body as { ids?: unknown })?.ids, { id: ich(a).id, email: ich(a).email })) },
    { methode: 'POST', pfad: '/api/werkbank/wartung/volltext', zugang: 'admin', handler: async () => ok({ eingereiht: await dienst.volltextNachholen() }) },
    // „Volltext neu erzeugen“ (#458): erst die Anzahl für die Rückfrage, dann als Auftrag mit Fortschritt (abbrechbar).
    { methode: 'GET', pfad: '/api/werkbank/wartung/volltext-neu', zugang: 'admin', handler: async (a) => ok({ ...(await dienst.volltextNeuAnzahl(a.query.umfang)), paket: await dienst.texterkennungPaket() }) },
    { methode: 'POST', pfad: '/api/werkbank/wartung/volltext-neu', zugang: 'admin', handler: async (a) => ok(await dienst.auftraege.angemeldet(dienst.volltextNeu((b(a) as { umfang?: unknown }).umfang, ich(a).email)), 202) },
    { methode: 'POST', pfad: '/api/werkbank/wartung/vorschau', zugang: 'admin', handler: async () => ok({ eingereiht: await dienst.vorschauNachholen() }) },

    /* ---------- Verschlüsselung (#39) ---------- */
    /* ---------- Wartungsmodus (#102) ---------- */
    { methode: 'GET', pfad: '/api/werkbank/wartung', zugang: 'admin', handler: async (a) => ok({
      ...wartung().stand, ...wartung().oeffentlich(), sitzungen: await konten.alleSitzungen(a.sitzungsDaten?.id),
    }) },
    { methode: 'POST', pfad: '/api/werkbank/wartung/ein', zugang: 'admin', handler: async (a) => ok(await wartung().einschalten(b(a), ich(a), a.sitzungsDaten?.id ?? null)) },
    { methode: 'POST', pfad: '/api/werkbank/wartung/jetzt', zugang: 'admin', handler: async (a) => ok(await wartung().jetztAktiv(ich(a), a.sitzungsDaten?.id ?? null)) },
    { methode: 'POST', pfad: '/api/werkbank/wartung/aus', zugang: 'admin', handler: async (a) => ok(await wartung().ausschalten(ich(a).email)) },

    /* ---------- Wiederherstellen (#107): frisches System ohne Anmeldung, sonst Admin im Wartungsmodus ---------- */
    { methode: 'GET', pfad: '/api/wiederherstellung/status', zugang: 'offen', handler: async () => ok(await whStand()) },
    { methode: 'POST', pfad: '/api/wiederherstellung/abschluss-gesehen', zugang: 'offen', handler: async () => {
      if (x.sicherung && !x.wiederherstellung?.laeuft()) await x.sicherung.einstellungen.schreibe('wiederherstellung_abschluss', null);
      return leer;
    } },
    { methode: 'GET', pfad: '/api/wiederherstellung/sicherungen', zugang: 'offen', handler: async (a) => {
      const art = await wh().pruefeZugang(darfWiederherstellen(a), a.einrichtungscode);
      return ok({ art, ordner: sicherung().ordner, liste: (await sicherung().liste()).map((e) => ({ name: e.name, bytes: e.bytes, meta: e.meta, ...(e.schlank ? { schlank: e.schlank } : {}) })) });
    } },
    { methode: 'POST', pfad: '/api/wiederherstellung/abgleich', zugang: 'offen', handler: async (a) => {
      await wh().pruefeZugang(darfWiederherstellen(a), a.einrichtungscode);
      return ok(await wh().abgleich(String(b(a).name ?? ''), typeof b(a).schluessel === 'string' ? b(a).schluessel as string : undefined));
    } },
    { methode: 'POST', pfad: '/api/wiederherstellung/start', zugang: 'offen', handler: async (a) => {
      // Wiederherstellen ist eine heikle Handlung (#819): im laufenden System nur mit frischer Anmeldung.
      const admin = darfWiederherstellen(a);
      if (admin && !a.konsole && !konten.istFrisch(a.sitzungsDaten)) throw new Fachfehler(403, t('konten.verwaltung.fehler.frisch'), { frisch: true, handlung: 'wiederherstellen' });
      return ok(await wh().starte(b(a), admin ? a.benutzer! : null, a.einrichtungscode));
    } },
    // Probe-Wiederherstellung (#109)
    { methode: 'POST', pfad: '/api/werkbank/sicherung/probe', zugang: 'admin', handler: async (a) => ok((await wh().starteProbe(typeof b(a).name === 'string' ? b(a).name as string : null, ich(a).email)).lauf) },
    { methode: 'GET', pfad: '/api/werkbank/sicherung/probe', zugang: 'admin', handler: async () => ok(x.wiederherstellung?.aktuellerLauf() ?? null) },
    { methode: 'PUT', pfad: '/api/werkbank/sicherung/probe-plan', zugang: 'admin', handler: async (a) => ok(await sicherung().speichereProbePlan(a.body, ich(a).email)) },

    /* ---------- Sicherung (#103–#105) und Notfallblatt (#106) ---------- */
    { methode: 'GET', pfad: '/api/werkbank/sicherung', zugang: 'admin', handler: async () => {
      const s = sicherung();
      return ok({ lauf: s.aktuellerLauf(), liste: await s.liste(), plan: await s.plan(), speicher: await s.speicher(), zustand: await s.zustand(), probe: x.wiederherstellung?.aktuellerLauf() ?? null });
    } },
    { methode: 'GET', pfad: '/api/werkbank/sicherung/lauf', zugang: 'admin', handler: async () => ok(sicherung().aktuellerLauf()) },
    { methode: 'POST', pfad: '/api/werkbank/sicherung/jetzt', zugang: 'admin', handler: async (a) => ok((await sicherung().starte('manuell', ich(a).email)).lauf) },
    { methode: 'PUT', pfad: '/api/werkbank/sicherung/plan', zugang: 'admin', handler: async (a) => ok(await sicherung().speicherePlan(a.body, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/sicherung/:name/pruefen', zugang: 'admin', handler: async (a) => ok(await sicherung().pruefe(a.params.name, ich(a).email)) },
    { methode: 'DELETE', pfad: '/api/werkbank/sicherung/:name', zugang: 'admin', handler: async (a) => { await sicherung().loesche(a.params.name, ich(a).email); return leer; } },
    // Sicherung außer Haus (#585): nur Pakete mit dms:sicherung-lesen, nur die Sicherungen aus ihrem Ereignis sicherung.fertig –
    // die verschlüsselte Datei in Stücken, schlanke Metadaten und die Rückmeldung. Nie Schlüssel, nie andere Dateien.
    { methode: 'GET', pfad: '/api/sicherungen/:name', zugang: 'angemeldet', handler: async (a) => ok(await sicherung().externMeta(await sicherungsPaket(a), a.params.name)) },
    { methode: 'GET', pfad: '/api/sicherungen/:name/datei', zugang: 'angemeldet', handler: async (a) => {
      const s = await sicherung().externStueck(await sicherungsPaket(a), a.params.name, a.query.versatz, a.query.laenge);
      return { datei: { inhalt: s.inhalt, name: `${a.params.name}.dms-sicherung`, mime: 'application/octet-stream', anzeigen: false, groesse: s.inhalt.length, koepfe: { 'x-dms-groesse': String(s.groesse), 'cache-control': 'no-store' } } };
    } },
    { methode: 'PUT', pfad: '/api/sicherungen/:name/extern', zugang: 'angemeldet', handler: async (a) => ok(await sicherung().externRueckmeldung(await sicherungsPaket(a), a.params.name, a.body)) },
    { methode: 'GET', pfad: '/api/werkbank/notfallblatt', zugang: 'admin', handler: async (a) => notfallblattDatei(ich(a).email) },

    { methode: 'GET', pfad: '/api/werkbank/tresor', zugang: 'admin', handler: async () => ok({ ...await tresor().status(), notfallblatt: x.sicherung ? await x.sicherung.notfallblatt() : null }) },
    { methode: 'POST', pfad: '/api/werkbank/tresor/erzeugen', zugang: 'admin', handler: async () => ok(await tresor().erzeuge()) },
    // Schlüssel wechseln (#47): nur mit Bestätigung; danach neues Notfallblatt und neue Sicherung.
    { methode: 'POST', pfad: '/api/werkbank/tresor/wechseln', zugang: 'admin', handler: async (a) => {
      if (b(a).bestaetigt !== true) throw new Fachfehler(400, t('meldungen.routen.bitte-den-wechsel-bestaetigen'));
      if (x.sicherung?.laeuft()) throw new Fachfehler(409, t('meldungen.routen.gerade-laeuft-eine-sicherung'));
      const w = await dienst.schluesselWechseln(ich(a).email);
      const alte = x.sicherung ? (await x.sicherung.liste()).filter((s) => s.meta && s.meta.verschluesselung.fingerabdruck !== w.neu).length : 0;
      return ok({ ...w, alteSicherungen: alte, ...await tresor().status(), notfallblatt: x.sicherung ? await x.sicherung.notfallblatt() : null });
    } },
    // Name der Ablage für den vorgeschlagenen Absender (#813).
    { methode: 'GET', pfad: '/api/werkbank/betrieb', zugang: 'admin', handler: async () => ok({ ...await betrieb().stand(), ablage: x.einrichtung ? await x.einrichtung.stand().then((e) => e.mandant, () => null) : null }) },
    { methode: 'PUT', pfad: '/api/werkbank/betrieb/mail', zugang: 'admin', handler: async (a) => ok(await betrieb().speichereMail(b(a), ich(a).email)) },
    // Server zur Adresse finden (#813): eingebaute Liste, sonst DNS und Autoconfig der eigenen Domain; Thunderbird nur auf Knopfdruck.
    { methode: 'POST', pfad: '/api/werkbank/betrieb/mail/finden', zugang: 'admin', lesend: true, handler: async (a) => ok(await betrieb().findeServer(b(a))) },
    // Anmeldung über OAuth für den Versand (#813): dieselbe App und derselbe Rückruf wie bei den Postfächern.
    { methode: 'POST', pfad: '/api/werkbank/betrieb/mail/oauth/start', zugang: 'admin', handler: async (a) => {
      const s = await pfOAuth().start(betrieb().oauthZiel(), { id: ich(a).id, email: ich(a).email }, pfRueckruf());
      return { body: { url: s.url }, cookies: [kurzCookie(POSTFACH_BINDUNG_COOKIE, s.bindung, 600, '/api/oauth/postfach')] };
    } },
    { methode: 'POST', pfad: '/api/werkbank/betrieb/mail/oauth/geraet', zugang: 'admin', handler: async (a) => ok(await pfOAuth().geraetStart(betrieb().oauthZiel(), { id: ich(a).id, email: ich(a).email })) },
    { methode: 'POST', pfad: '/api/werkbank/betrieb/mail/oauth/geraet/pruefen', zugang: 'admin', lesend: true, handler: async (a) => ok(await pfOAuth().geraetPruefen(VERSAND_OAUTH_ID, { id: ich(a).id })) },
    { methode: 'POST', pfad: '/api/werkbank/betrieb/mail/oauth/abmelden', zugang: 'admin', handler: async (a) => {
      await pfOAuth().abmelden(VERSAND_OAUTH_ID, ich(a).email);
      return ok(await betrieb().stand());
    } },
    { methode: 'PUT', pfad: '/api/werkbank/betrieb/adresse', zugang: 'admin', handler: async (a) => ok(await betrieb().speichereAdresse(b(a).adresse)) },
    { methode: 'POST', pfad: '/api/werkbank/betrieb/mail/pruefen', zugang: 'admin', handler: async (a) => ok(await betrieb().pruefeVerbindung(b(a))) },
    { methode: 'POST', pfad: '/api/werkbank/betrieb/mail/testmail', zugang: 'admin', handler: async (a) => ok(await betrieb().sendeTestmail(b(a).mail, b(a).an)) },

    // Fehler melden (#70): technische Angaben des Servers für jeden angemeldeten Benutzer – ohne Betriebsgeheimnisse.
    { methode: 'GET', pfad: '/api/konto/diagnose', zugang: 'angemeldet', handler: async (a) => {
      const i = ich(a);
      let postgresVersion: string | null = null;
      try { postgresVersion = system ? (await system.datenbank()).version : null; } catch { /* ohne */ }
      let ocr: boolean | null = null;
      try { ocr = x.texterkennung ? (await x.texterkennung.status()).einstellungen.aktiv !== false : null; } catch { /* ohne */ }
      return ok({
        dms: { version: eigeneVersion(), commit: process.env.DMS_COMMIT || null, gebaut: process.env.DMS_GEBAUT || null },
        serverzeit: new Date().toISOString(), zeitzone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        node: process.versions.node, postgres: postgresVersion,
        texterkennung: ocr, mail: !!x.betrieb?.mailer(),
        benutzer: { name: i.name, rolle: i.rolle }, sitzung: a.sitzungsDaten?.id ? String(a.sitzungsDaten.id).slice(0, 8) : null,
        vertretung: !!a.sitzungsDaten?.vertretungId,
      });
    } },
    { methode: 'POST', pfad: '/api/konto/fehlermeldung', zugang: 'angemeldet', roh: FEHLERMELDUNG_KOERPER_MAX, handler: async (a) => ok(await meldungen().melde(ich(a).id, b(a)), 201) },
    { methode: 'GET', pfad: '/api/werkbank/fehlermeldungen', zugang: 'admin', handler: async (a) => ok(await meldungen().liste(a.query.erledigt !== undefined)) },
    { methode: 'GET', pfad: '/api/werkbank/fehlermeldungen/:id', zugang: 'admin', handler: async (a) => ok(await meldungen().hole(a.params.id)) },
    { methode: 'GET', pfad: '/api/werkbank/fehlermeldungen/:id/bilder/:nr', zugang: 'admin', handler: async (a) => {
      const { bild, inhalt } = await meldungen().bild(a.params.id, Number(a.params.nr));
      return { datei: { inhalt, name: bild.name, mime: bild.mime, anzeigen: true, groesse: bild.groesse } };
    } },
    { methode: 'POST', pfad: '/api/werkbank/fehlermeldungen/:id/erledigt', zugang: 'admin', handler: async (a) => ok(await meldungen().erledigt(a.params.id, b(a).erledigt !== false, ich(a).id)) },
    { methode: 'DELETE', pfad: '/api/werkbank/fehlermeldungen/:id', zugang: 'admin', handler: async (a) => { await meldungen().loesche(a.params.id); return leer; } },
    // Ansicht der Werkbank (#281): für alle und je Administrator.
    { methode: 'GET', pfad: '/api/werkbank/ansicht', zugang: 'admin', handler: async (a) => {
      // Was eingerichtet ist, soll nicht unbemerkt aus der Leiste verschwinden.
      const sicher = async (f: () => Promise<boolean> | boolean) => { try { return await f(); } catch { return false; } };
      const benutzt = Object.entries({
        nummernkreise: () => dienst.listeNummernkreise().then((l) => l.length > 0),
        postfaecher: async () => !!x.postfaecher && (await x.postfaecher.liste()).length > 0,
        eingangsordner: () => !!x.eingangsordner?.vorhanden,
        anmeldeschutz: async () => !!x.oidc && !!(await x.oidc.bereit()),
      });
      const liste: string[] = [];
      for (const [pfad, f] of benutzt) if (await sicher(f)) liste.push(pfad);
      return ok({ ...(await dienst.werkbankAnsicht(ich(a))), benutzt: liste });
    } },
    { methode: 'PUT', pfad: '/api/werkbank/ansicht', zugang: 'admin', handler: async (a) => ok(await dienst.setzeWerkbankAnsicht(ich(a), b(a))) },
    // Übersicht als Startseite der Werkbank (#68): was zu tun ist, auf einen Blick.
    // Werkbank (#921): wer außer mir gerade im Verwaltungsmodus ist – nur im Modus (zugang „admin“, Bereich für alle,
    // die verwalten), nie mit API-Schlüssel, nicht in /api/v1. Nachgefragt im Takt (`still`: verlängert den Modus nicht).
    { methode: 'GET', pfad: '/api/werkbank/gerade-im-modus', zugang: 'admin', still: true, handler: async (a) => ok(await konten.andereImVerwaltungsmodus(ich(a))) },
    { methode: 'GET', pfad: '/api/werkbank/uebersicht', zugang: 'admin', handler: async (a) => {
      const sicher = async <T>(f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch { return null; } };
      const ts = x.tresor ? await sicher(() => x.tresor!.status()) : null;
      const z = await dienst.zaehler(ich(a));
      const aufgaben = await dienst.alleAufgaben(false);
      const korb = await dienst.papierkorb(ich(a), true);
      const sys = await uebersicht(system, x.betrieb?.kurz());
      return ok(nurEigeneBereiche(ich(a), {
        tresor: ts ? { zustand: ts.zustand, eingebunden: ts.eingebunden, betroffen: ts.betroffen.length } : null,
        mail: !!x.betrieb?.mailer(),
        adresse: x.betrieb ? !!x.betrieb.ansicht().adresse : true,
        texterkennung: x.texterkennung ? await sicher(() => x.texterkennung!.zaehler()) : null,
        // #459: Ist ein Paket für die Texterkennung installiert? Sonst Hinweis „Texterkennung ist jetzt ein Paket“.
        texterkennungPaket: !!(await sicher(() => dienst.texterkennungPaket())),
        aufgaben: { offen: aufgaben.length, ohneEmpfaenger: aufgaben.filter((y) => !y.empfaengerId).length },
        // #798: Aufgaben bei Personen ohne Leserecht (offene Fälle, abgeglichen alle fünf Minuten und beim Öffnen).
        ohneLeserecht: (await sicher(async () => (await dienst.offeneFaelle()).length)) ?? 0,
        // Eingangsordner (#915): Warnungen (zu alt, zu groß, fehler/, zu viele), Ordner ohne Person, nicht umbenannte Ordner.
        eingangsordner: x.eingangsordner?.vorhanden ? await sicher(() => x.eingangsordner!.meldungen()) : null,
        // #877: Dokumentdateien, die beim Lesen fehlten (und noch fehlen) – Volume vergessen, Datei gelöscht, Platte defekt.
        dateienFehlen: (await sicher(() => dienst.fehlendeDateien())) ?? 0,
        // #719: Wer im Alltag die Aufgaben ohne Empfänger bekommt; `moeglich` = aktive Benutzer ohne Admin-Rechte.
        aufgabenEmpfaenger: await sicher(async () => ({ benutzerId: (await dienst.alltagsEmpfaenger()).wirksam, moeglich: (await konten.listeBenutzer()).filter(taugtAlsAufgabenEmpfaenger).length })),
        unpassend: Object.values(z.typen).reduce((s, t) => s + (t.unpassend ?? 0), 0),
        papierkorb: { anzahl: korb.length, aeltester: korb.reduce<string | null>((m, e) => (!m || e.geloescht < m ? e.geloescht : m), null), tage: await dienst.papierkorbTage() },
        version: sys.dms,
        bestand: 'fehler' in sys.datenbank ? null : sys.datenbank,
        fehlermeldungen: x.fehlermeldungen ? await sicher(() => x.fehlermeldungen!.offen()) : null,
        // Notfallzugänge (#108), bis sie umbenannt oder deaktiviert sind.
        notfallzugaenge: x.notfall ? await sicher(() => x.notfall!.offen()) ?? [] : [],
        // Notfallcode benutzt (#815): bis jemand mit „Gesamte Verwaltung“ den Hinweis als gelesen markiert.
        notfallcodeBenutzt: x.notfallcode ? (await sicher(() => x.notfallcode!.offen()))?.map((n) => ({ id: n.id, benutzerId: n.benutzerId, name: n.name, am: n.am })) ?? [] : [],
        // Zweite Person mit Verwaltungsrecht empfehlen (#821, Konzept Punkt 7): nach der Einrichtung, solange nur eine
        // Person verwalten darf und niemand „Nein, danke“ gewählt hat.
        zweitePerson: (await sicher(async () => !(await dienst.einstellungenSpeicher?.lies(ZWEITE_ABGELEHNT))
          && !(x.einrichtung && (await x.einrichtung.stand()).offen)
          && (await konten.listeBenutzer()).filter((p) => istPerson(p) && p.aktiv && darfVerwalten(p)).length === 1)) ?? false,
        wartung: x.wartung?.oeffentlich() ?? null,
        // Sicherung (#105): fehlgeschlagen, zu alt, Speicherort, Notfallblatt.
        sicherung: x.sicherung ? await sicher(() => x.sicherung!.zustand()) : null,
        // Export-Ordner (#797): liegt im Sicherungsordner; Exporte beim Update aus dem Sicherungsordner verschoben.
        exporte: x.exporte ? { pfad: x.exporte.pfad, imSicherungsordner: x.exporte.imSicherungsordner, umzug: await sicher(() => umzugHinweis(dienst.einstellungenSpeicher)) ?? null } : null,
        // Speicherplatz (#116) und frühere Variablen, die entfernt werden können (#115).
        speicherplatz: x.speicherplatz ? await sicher(() => x.speicherplatz!.stand()) : null,
        // Auslastung (#409): CPU oder Arbeitsspeicher seit 5 Minuten über 90 %.
        auslastung: x.systemlast?.warnung() ?? [],
        // Engpässe (#544): Wartezeit, Verbindungen, Arbeiter, Überlast – je mit der Variable.
        engpaesse: grenzenUndEngpaesse(x).engpaesse,
        // Erweiterungen der Suche (#562): fehlend oder in einem Schema, das eine Wiederherstellung löscht.
        erweiterungen: x.erweiterungen ? (await sicher(() => x.erweiterungen!()))?.filter((e) => e.zustand !== 'ok') ?? [] : [],
        // Je Variable mit Grund (#478).
        variablen: ueberfluessigeVariablen({ ordner: x.ordner?.ueberfluessig, datenbank: x.anbindung?.stand().umgebung === 'gleich', haushalt: !!(x.mandantHinweis && process.env.HAUSHALT_ID) }),
        // DATABASE_URL weicht von der Anbindung in /data/geheim ab und wird ignoriert (#119); dms-komplett ohne Volume
        // für /data/postgres (#943): Die Datenbank ginge beim nächsten Update verloren.
        anbindung: x.anbindung ? { umgebung: x.anbindung.stand().umgebung, neustartNoetig: x.anbindung.stand().neustartNoetig, ohneVolume: x.anbindung.stand().ohneVolume } : null,
        // DMS_LASTTEST in einer echten Installation (#612): nicht gestartet, das DMS läuft normal.
        lasttestAbbruch: x.lasttestAbbruch?.() ?? null,
        einrichtung: x.einrichtung ? await sicher(() => x.einrichtung!.stand()) : null,
        // Automatisierungen (#674): fehlgeschlagene Läufe und angehaltene Automatisierungen.
        automatisierungen: x.automatisierungen ? await sicher(() => x.automatisierungen!.warnungen()) : null,
        // Pflicht-Einstellungen eines Pakets fehlen (#405: im Ablauf „später ausfüllen“) – Aufgabe für den Administrator.
        paketeEinstellungen: (await sicher(() => pakete.installierte()))?.filter((p) => p.einstellungenNoetig).map((p) => ({ id: p.id, name: p.name })) ?? [],
        // KI-Dienste (#796): nach dem Update einmal sagen, dass sich Mappentypen jetzt ausschließen lassen (nur mit KI-Paketen).
        kiTypen: (await sicher(async () => { const k = await dienst.kiUebersicht(); return k.hinweis ? { pakete: k.pakete.map((p) => ({ id: p.id, name: p.name })) } : null; })) ?? null,
        // Zahlen für die linke Spalte (#375), bis der Bereich selbst geladen ist.
        zahlen: await werkbankZahlen({
          nummernkreise: () => dienst.listeNummernkreise(),
          pakete: () => pakete.installierte(),
          benutzer: () => konten.listeBenutzer(),
          postfaecher: x.postfaecher ? () => x.postfaecher!.ansicht() : undefined,
          darfWeg: () => dienst.darfWeg(),
        }),
        // Postfächer mit abgelaufener oder fehlender OAuth-Anmeldung (#358).
        postfachAnmeldung: x.postfaecher ? await sicher(() => x.postfaecher!.anmeldungFehlt()) ?? [] : [],
        // Bewusst akzeptierte Meldungen (#816): wer, wann, Begründung; die Übersicht stellt sie unten zusammen.
        akzeptiert: await sicher(() => akzeptierteMeldungen(dienst.einstellungenSpeicher)) ?? {},
      }));
    } },
    // Im Verwaltungsmodus angesehen (#820): Person, Mappe, Zeit – nur für „Gesamte Verwaltung“ (verwaltungsbereiche.ts).
    { methode: 'GET', pfad: '/api/werkbank/verwaltungsmodus', zugang: 'admin', handler: async () => {
      const liste = await dienst.imVerwaltungsmodus();
      const namen = new Map((await konten.personen()).map((p) => [p.id, p.name] as const));
      return ok(liste.map((e) => ({ ...e, person: e.benutzerId ? namen.get(e.benutzerId) ?? '' : '' })));
    } },
    // „Zur Kenntnis genommen“ (#816): nur gelbe Warnungen und Hinweise, im Protokoll mit Benutzer und Begründung.
    { methode: 'POST', pfad: '/api/werkbank/uebersicht/akzeptieren', zugang: 'admin', handler: async (a) => ok(await meldungAkzeptieren(dienst.einstellungenSpeicher, b(a), ich(a).name || ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/uebersicht/aufheben', zugang: 'admin', handler: async (a) => ok(await akzeptanzAufheben(dienst.einstellungenSpeicher, b(a), ich(a).name || ich(a).email)) },
    /*
     * Hinweise, die man einmal abschließt (#821, #815): „Nein, danke“ zur zweiten Person mit Verwaltungsrecht gilt
     * dauerhaft; „Gelesen“ beim benutzten Notfallcode. Beides nur „Gesamte Verwaltung“ (nur sie sieht die Hinweise).
     */
    { methode: 'POST', pfad: '/api/werkbank/uebersicht/erledigt', zugang: 'admin', handler: async (a) => {
      const k = String(b(a).schluessel ?? '');
      // KI-Dienste (#796): „Verstanden“ zum Hinweis nach dem Update – für alle, die Pakete verwalten (sie sehen ihn).
      if (k === 'ki.typen') {
        if (!darfBereich(ich(a), 'pakete')) throw new Fachfehler(403, t('konten.verwaltung.fehler.vergeben'));
        await dienst.kiHinweisGelesen(); L.werkbank.info('Hinweis „Mappentypen von KI-Diensten ausschließen“ gelesen', { von: ich(a).email });
        return leer;
      }
      if (!hatGesamt(ich(a))) throw new Fachfehler(403, t('konten.verwaltung.fehler.vergeben'));
      if (k === 'verwaltung.zweite-person') {
        const e = dienst.einstellungenSpeicher;
        if (!e) throw new Fachfehler(500, t('werkbank.uebersicht.akzeptiert.ohne-speicher'));
        await e.schreibe(ZWEITE_ABGELEHNT, { von: ich(a).name || ich(a).email, am: new Date().toISOString() });
        L.werkbank.info('Empfehlung „zweite Person mit Verwaltungsrecht“ abgelehnt', { meldung: k, von: ich(a).email });
      } else if (k.startsWith('notfallzugang.benutzt:')) await nf().gelesen(k.slice('notfallzugang.benutzt:'.length), ich(a));
      else throw new Fachfehler(400, t('werkbank.uebersicht.akzeptiert.ungueltig'));
      return leer;
    } },
    { methode: 'GET', pfad: '/api/werkbank/system', zugang: 'admin', handler: async () => {
      const sicher = async <T>(f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch { return null; } };
      const sp = x.speicherplatz ? await sicher(() => x.speicherplatz!.stand()) : null;
      return ok({ ...await uebersicht(system, x.betrieb?.kurz()), ordner: sp?.ordner ?? null, variablen: x.ordner?.ueberfluessig ?? [] });
    } },
    /* ---------- Berechtigungen (#123, #125) ---------- */
    { methode: 'GET', pfad: '/api/werkbank/berechtigungen', zugang: 'admin', handler: async () => ok(await dienst.berechtigungenListe()) },
    { methode: 'PUT', pfad: '/api/werkbank/berechtigungen/:typId', zugang: 'admin', handler: async (a) => {
      const r = await dienst.setzeBerechtigungen(a.params.typId, b(a).berechtigungen, b(a).bestaetigt === true);
      return ok({ typ: r.typ, niemand: r.niemand });
    } },
    // Pakete am Mappentyp (#686): welche Pakete Mappen dieses Typs lesen dürften, und einzelnen den Typ verwehren.
    { methode: 'GET', pfad: '/api/werkbank/berechtigungen/:typId/pakete', zugang: 'admin', handler: async (a) => ok(await dienst.paketeAmTyp(a.params.typId)) },
    { methode: 'PUT', pfad: '/api/werkbank/berechtigungen/:typId/pakete/:paketId', zugang: 'admin', handler: async (a) => {
      await dienst.setzePaketVerwehrt(a.params.typId, a.params.paketId, b(a).verwehrt === true, ich(a).email);
      return ok(await dienst.paketeAmTyp(a.params.typId));
    } },
    // KI-Dienste (#796): welche Mappentypen an KI-Pakete gehen dürfen; neue erst nach Zulassung.
    { methode: 'GET', pfad: '/api/werkbank/ki-typen', zugang: 'admin', handler: async () => ok(await dienst.kiUebersicht()) },
    { methode: 'PUT', pfad: '/api/werkbank/ki-typen/:typId', zugang: 'admin', handler: async (a) => ok(await dienst.setzeKiTyp(a.params.typId, b(a).zugelassen === true, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/berechtigungen/:typId/kopieren', zugang: 'admin', handler: async (a) => {
      const r = await dienst.kopiereRegel(a.params.typId, String(b(a).regelId ?? ''), b(a).ziele);
      L.werkbank.info('Regel kopiert', { typ: a.params.typId, regel: String(b(a).regelId ?? ''), kopiert: r.kopiert, ausgelassen: r.ausgelassen, von: ich(a).email });
      return ok(r);
    } },
    { methode: 'POST', pfad: '/api/werkbank/berechtigungen/testlauf', zugang: 'admin', lesend: true, handler: async (a) => ok(await dienst.testlauf(b(a))) },
    { methode: 'POST', pfad: '/api/werkbank/sichten/testlauf', zugang: 'admin', lesend: true, handler: async (a) => ok(await dienst.sichtTestlauf(b(a))) },
    { methode: 'GET', pfad: '/api/werkbank/berechtigungen/sicht/:benutzerId', zugang: 'admin', handler: async (a) => ok(await dienst.wasSieht(a.params.benutzerId)) },

    /* ---------- Einrichtungsassistent (#119) ---------- */
    { methode: 'GET', pfad: '/api/werkbank/einrichtung', zugang: 'admin', handler: async () => {
      if (!x.einrichtung) throw new Fachfehler(404, t('meldungen.routen.kein-einrichtungsassistent'));
      return ok(await x.einrichtung.stand());
    } },
    { methode: 'POST', pfad: '/api/werkbank/einrichtung/schritt', zugang: 'admin', handler: async (a) => {
      if (!x.einrichtung) throw new Fachfehler(404, t('meldungen.routen.kein-einrichtungsassistent'));
      return ok(await x.einrichtung.merke(b(a).schritt, b(a).uebersprungen === true, ich(a).email));
    } },
    /* ---------- Datenbank-Anbindung (#119) ---------- */
    { methode: 'GET', pfad: '/api/werkbank/anbindung', zugang: 'admin', handler: async () => ok(anbindung().stand()) },
    { methode: 'POST', pfad: '/api/werkbank/anbindung/pruefen', zugang: 'admin', handler: async (a) => ok(await anbindung().pruefe(b(a).anbindung)) },
    { methode: 'PUT', pfad: '/api/werkbank/anbindung', zugang: 'admin', handler: async (a) => ok(await anbindung().speichere({ ...(b(a).anbindung as object ?? {}), leerBestaetigt: b(a).leerBestaetigt }, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/neustart', zugang: 'admin', handler: async (a) => { anbindung().neustart(ich(a).email); return leer; } },
    /* ---------- Speicherplatz (#116) ---------- */
    // Anmeldeschutz (#240): Fehlversuche, gesperrte IPs, Ausnahmen.
    { methode: 'GET', pfad: '/api/werkbank/anmeldeschutz', zugang: 'admin', handler: async (a) => ok({ einstellung: await konten.sperre.einstellung(), gesperrt: await konten.sperre.gesperrt(), deineIp: a.ip }) },
    { methode: 'PUT', pfad: '/api/werkbank/anmeldeschutz', zugang: 'admin', handler: async (a) => ok({ einstellung: await konten.sperre.speichere(a.body, ich(a).email), gesperrt: await konten.sperre.gesperrt(), deineIp: a.ip }) },
    // Notfallzugang (#815): Vorgabe „nur Heimnetz“; „aus dem Internet erlauben“ ist eine heikle Handlung (frische Anmeldung).
    { methode: 'GET', pfad: '/api/werkbank/anmeldeschutz/notfallzugang', zugang: 'admin', handler: async (a) => ok({ ...await nf().einstellung(), code: await konten.notfallcodeStand(), ...heimnetzStand(a, x.proxy) }) },
    { methode: 'PUT', pfad: '/api/werkbank/anmeldeschutz/notfallzugang', zugang: 'admin', handler: async (a) => ok({ ...await nf().setzeEinstellung(b(a), ich(a).email), code: await konten.notfallcodeStand(), ...heimnetzStand(a, x.proxy) }) },
    { methode: 'POST', pfad: '/api/werkbank/anmeldeschutz/entsperren', zugang: 'admin', handler: async (a) => {
      const ip = String((b(a) as { ip?: unknown }).ip ?? '');
      if (!(await konten.sperre.entsperre(ip, ich(a).email))) throw new Fachfehler(404, t('meldungen.routen.diese-adresse-ist-nicht'));
      return ok({ einstellung: await konten.sperre.einstellung(), gesperrt: await konten.sperre.gesperrt(), deineIp: a.ip });
    } },
    // Postfächer (#196): nur Administratoren; Passwörter verlassen den Server nie.
    { methode: 'GET', pfad: '/api/werkbank/postfaecher', zugang: 'admin', handler: async () => ok(await postfaecher().ansicht()) },
    { methode: 'POST', pfad: '/api/werkbank/postfaecher', zugang: 'admin', handler: async (a) => ok(await postfaecher().speichere(a.body, null, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/postfaecher/testen', zugang: 'admin', handler: async (a) => ok(await postfaecher().teste(a.body, typeof (b(a) as { id?: unknown }).id === 'string' ? (b(a) as { id: string }).id : null)) },
    { methode: 'PUT', pfad: '/api/werkbank/postfaecher/:id', zugang: 'admin', handler: async (a) => ok(await postfaecher().speichere(a.body, a.params.id, ich(a).email)) },
    { methode: 'DELETE', pfad: '/api/werkbank/postfaecher/:id', zugang: 'admin', handler: async (a) => { await postfaecher().loesche(a.params.id, ich(a).email); return leer; } },
    { methode: 'POST', pfad: '/api/werkbank/postfaecher/:id/abrufen', zugang: 'admin', handler: async (a) => ok({ uebernommen: await postfaecher().abrufen(a.params.id) }) },
    /* ---------- Postfächer: Anmeldung per OAuth 2.0 (#358) ---------- */
    // Gerätecode-Status wird alle paar Sekunden abgefragt: lesend (#373); die erfolgreiche Anmeldung protokolliert postfach-oauth.ts selbst.
    { methode: 'GET', pfad: '/api/werkbank/postfaecher-oauth', zugang: 'admin', handler: async () => ok({ apps: await pfOAuth().appsAnsicht(), rueckruf: pfRueckruf() }) },
    { methode: 'PUT', pfad: '/api/werkbank/postfaecher-oauth/:anbieter', zugang: 'admin', handler: async (a) => ok({
      // Neuer Mandant bzw. Token-Endpunkt: Postfächer dieses Anbieters abmelden (Sicherheits-Review #358).
      // Auch die Anmeldung des E-Mail-Versands (#813), wenn sie diesen Anbieter nutzt.
      apps: await pfOAuth().speichereApp(a.params.anbieter, a.body, ich(a).email, async (an) => [
        ...(x.postfaecher ? (await x.postfaecher.liste()).filter((p) => p.anmeldung === 'oauth' && p.anbieter === an).map((p) => p.id) : []),
        ...(x.betrieb?.ansicht?.().mail.anmeldung === 'oauth' && x.betrieb.ansicht().mail.anbieter === an ? [VERSAND_OAUTH_ID] : []),
      ]),
      rueckruf: pfRueckruf(),
    }) },
    { methode: 'POST', pfad: '/api/werkbank/postfaecher/:id/oauth/start', zugang: 'admin', handler: async (a) => {
      const s = await pfOAuth().start(await oauthPostfach(a.params.id), { id: ich(a).id, email: ich(a).email }, pfRueckruf());
      return { body: { url: s.url }, cookies: [kurzCookie(POSTFACH_BINDUNG_COOKIE, s.bindung, 600, '/api/oauth/postfach')] };
    } },
    { methode: 'POST', pfad: '/api/werkbank/postfaecher/:id/oauth/geraet', zugang: 'admin', handler: async (a) => ok(await pfOAuth().geraetStart(await oauthPostfach(a.params.id), { id: ich(a).id, email: ich(a).email })) },
    { methode: 'POST', pfad: '/api/werkbank/postfaecher/:id/oauth/geraet/pruefen', zugang: 'admin', lesend: true, handler: async (a) => ok(await pfOAuth().geraetPruefen(a.params.id, { id: ich(a).id })) },
    { methode: 'POST', pfad: '/api/werkbank/postfaecher/:id/oauth/abmelden', zugang: 'admin', handler: async (a) => {
      await postfaecher().hole(a.params.id);
      await pfOAuth().abmelden(a.params.id, ich(a).email);
      return ok(await postfaecher().ansicht());
    } },
    // Rückruf des Anbieters: nur für den Administrator, der die Anmeldung begonnen hat (state, Sitzung, Bindungs-Cookie).
    // Ziel der Rückkehr ist immer ein fester Pfad in der Werkbank – das Postfach stammt aus dem gespeicherten state.
    { methode: 'GET', pfad: '/api/oauth/postfach/rueckruf', zugang: 'offen', handler: async (a) => {
      const raus = [kurzCookie(POSTFACH_BINDUNG_COOKIE, '', 0, '/api/oauth/postfach')];
      // Im Verwaltungsmodus mit Recht auf Postfächer oder – für den Versand (#813) – auf E-Mail und Adresse. Welches der
      // beiden gemeint war, steht erst nach dem Rückruf fest; die Bindung an den Start (Cookie, Person) prüft PostfachOAuth.
      const admin = a.benutzer?.rolle === 'admin' && (darfBereich(a.benutzer, 'postfaecher') || darfBereich(a.benutzer, 'betrieb')) ? { id: a.benutzer.id } : null;
      try {
        const r = await pfOAuth().rueckruf(a.query, admin, leseCookie(a.cookieKopf, POSTFACH_BINDUNG_COOKIE));
        // E-Mail-Versand (#813): zurück zu E-Mail und Adresse.
        if (r.postfachId === VERSAND_OAUTH_ID) return { weiterleiten: '/werkbank/betrieb?oauth=angemeldet', cookies: raus };
        return { weiterleiten: `/werkbank/postfaecher/${encodeURIComponent(r.postfachId)}?oauth=angemeldet`, cookies: raus };
      } catch (e) {
        const text = (e as Error).message;
        L.ablage.warn('Postfach: OAuth-Rückruf abgelehnt', { ip: a.ip, grund: text });
        // Nur ein fester Fehlercode in der Adresse – die Texte stehen in der Oberfläche (kein fremder Text als Meldung).
        const id = e instanceof RueckrufFehler && e.postfachId && admin ? `/${encodeURIComponent(e.postfachId)}` : '';
        const code = e instanceof RueckrufFehler ? e.code : 'unbekannt';
        if (e instanceof RueckrufFehler && e.postfachId === VERSAND_OAUTH_ID && admin) return { weiterleiten: `/werkbank/betrieb?oauthfehler=${code}`, cookies: raus };
        return { weiterleiten: `/werkbank/postfaecher${id}?oauthfehler=${code}`, cookies: raus };
      }
    } },
    // Eingangsordner (#195): nur sichtbar, wenn /eingang eingebunden ist.
    // WebDAV-Laufwerk (#346): an/aus (Standard aus), Adresse, Stand und letzte Zugriffe.
    // Webhooks (#627): alle im Überblick, abschalten, löschen; freigegebene Ziele.
    // Automatisierungen (#674): nur Administratoren legen an und ändern; ausgeführt wird unter dem Systemkonto.
    { methode: 'GET', pfad: '/api/werkbank/automatisierungen', zugang: 'admin', handler: async () => ok({ ...await autos().uebersicht(), kontext: await autos().kontext(), umgezogen: await autos().umzug() }) },
    // #712: Hinweis „Erinnerungen sind umgezogen“ gelesen.
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/umzug-gesehen', zugang: 'admin', handler: async () => { await autos().umzugGesehen(); return ok(null); } },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen', zugang: 'admin', handler: async (a) => ok(await autos().lege(a.body, ich(a).id), 201) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/wiederholen', zugang: 'admin', handler: async () => ok(await autos().wiederholeAlle()) },
    { methode: 'GET', pfad: '/api/werkbank/automatisierungen/laeufe/:id', zugang: 'admin', handler: async (a) => ok(await autos().lauf(a.params.id)) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/laeufe/:id/wiederholen', zugang: 'admin', handler: async (a) => ok(await autos().wiederhole(a.params.id)) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/laeufe/:id/nicht-wiederholen', zugang: 'admin', handler: async (a) => ok(await autos().nichtWiederholen({ laufId: a.params.id }, ich(a).id)) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/nicht-wiederholen', zugang: 'admin', handler: async (a) => ok(await autos().nichtWiederholen({}, ich(a).id)) },
    { methode: 'GET', pfad: '/api/werkbank/automatisierungen/:id', zugang: 'admin', handler: async (a) => ok(await autos().hole(a.params.id)) },
    { methode: 'PUT', pfad: '/api/werkbank/automatisierungen/:id', zugang: 'admin', handler: async (a) => ok(await autos().aendere(a.params.id, a.body, ich(a).id)) },
    { methode: 'DELETE', pfad: '/api/werkbank/automatisierungen/:id', zugang: 'admin', handler: async (a) => { await autos().loesche(a.params.id); return leer; } },
    { methode: 'PUT', pfad: '/api/werkbank/automatisierungen/:id/aktiv', zugang: 'admin', handler: async (a) => ok(await autos().schalte(a.params.id, (b(a) as { aktiv?: unknown }).aktiv === true, ich(a).id)) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/:id/kopieren', zugang: 'admin', handler: async (a) => ok(await autos().kopiere(a.params.id, ich(a).id), 201) },
    { methode: 'GET', pfad: '/api/werkbank/automatisierungen/:id/laeufe', zugang: 'admin', handler: async (a) => ok(await autos().laeufe(a.params.id, Number((a.query as { anzahl?: unknown }).anzahl) || 50)) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/:id/wiederholen', zugang: 'admin', handler: async (a) => ok(await autos().wiederholeAlle(a.params.id)) },
    { methode: 'GET', pfad: '/api/werkbank/automatisierungen/:id/testmappen', zugang: 'admin', handler: async (a) => ok(await autos().testmappen(a.params.id, (a.query as { suche?: unknown }).suche)) },
    { methode: 'GET', pfad: '/api/werkbank/automatisierungen/:id/fassungen', zugang: 'admin', handler: async (a) => ok(await autos().fassungen(a.params.id)) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/:id/fassungen/:version', zugang: 'admin', handler: async (a) => ok(await autos().stelleWieder(a.params.id, Number(a.params.version), ich(a).id)) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/:id/wiedergeben', zugang: 'admin', handler: async (a) => {
      const e = b(a) as { mappeId?: unknown; trocken?: unknown };
      return ok(await autos().wiedergeben(a.params.id, e.mappeId, e.trocken !== false));
    } },
    { methode: 'GET', pfad: '/api/werkbank/webhooks', zugang: 'admin', handler: async () => ok(await webhooks().uebersicht()) },
    { methode: 'PUT', pfad: '/api/werkbank/webhooks/ziele', zugang: 'admin', handler: async (a) => ok({ ziele: await webhooks().setzeZiele((b(a) as { ziele?: unknown }).ziele, ich(a).email) }) },
    { methode: 'PUT', pfad: '/api/werkbank/webhooks/:id', zugang: 'admin', handler: async (a) => {
      await webhooks().schalteWerkbank(a.params.id, (b(a) as { aktiv?: unknown }).aktiv === true, ich(a).email);
      return ok(await webhooks().uebersicht());
    } },
    { methode: 'DELETE', pfad: '/api/werkbank/webhooks/:id', zugang: 'admin', handler: async (a) => { await webhooks().loescheWerkbank(a.params.id, ich(a).email); return leer; } },
    { methode: 'GET', pfad: '/api/werkbank/webdav', zugang: 'admin', handler: async () => {
      if (!x.webdav) throw new Fachfehler(404, t('meldungen.routen.das-webdav-laufwerk-ist'));
      return ok(await x.webdav.stand());
    } },
    { methode: 'PUT', pfad: '/api/werkbank/webdav', zugang: 'admin', handler: async (a) => {
      if (!x.webdav) throw new Fachfehler(404, t('meldungen.routen.das-webdav-laufwerk-ist'));
      return ok(await x.webdav.speichere(a.body, ich(a).email));
    } },
    { methode: 'GET', pfad: '/api/werkbank/eingangsordner', zugang: 'admin', handler: async () => ok(x.eingangsordner ? await x.eingangsordner.stand() : { vorhanden: false }) },
    { methode: 'PUT', pfad: '/api/werkbank/eingangsordner', zugang: 'admin', handler: async (a) => {
      if (!x.eingangsordner?.vorhanden) throw new Fachfehler(404, t('meldungen.routen.es-ist-kein-eingangsordner'));
      return ok(await x.eingangsordner.speichere(a.body, ich(a).email));
    } },
    // „Ordner für alle Benutzer anlegen“ (#915): je aktive Person eingang/<e-mail>/.
    { methode: 'POST', pfad: '/api/werkbank/eingangsordner/personen', zugang: 'admin', handler: async (a) => {
      if (!x.eingangsordner?.vorhanden) throw new Fachfehler(404, t('meldungen.routen.es-ist-kein-eingangsordner'));
      return ok(await x.eingangsordner.ordnerFuerAlle(ich(a).email));
    } },
    { methode: 'POST', pfad: '/api/werkbank/eingangsordner/pruefen', zugang: 'admin', handler: async () => {
      if (!x.eingangsordner?.vorhanden) throw new Fachfehler(404, t('meldungen.routen.es-ist-kein-eingangsordner'));
      const n = await x.eingangsordner.pruefe(true);
      return ok({ uebernommen: n, stand: await x.eingangsordner.stand() });
    } },
    // Mit der Belegung der Vorschaubilder (#332) – sie liegen im Ordner der Dateien, werden aber nicht gesichert.
    { methode: 'GET', pfad: '/api/werkbank/speicherplatz', zugang: 'admin', handler: async () => ok({ ...(await speicherplatz().pruefe()), vorschau: x.vorschau ? await x.vorschau.belegung() : null }) },
    { methode: 'PUT', pfad: '/api/werkbank/speicherplatz', zugang: 'admin', handler: async (a) => ok(await speicherplatz().speichere(a.body, ich(a).email)) },
    // Auslastung (#409): CPU, Arbeitsspeicher, Netzwerk des Containers; dazu die Wartezeit der Ereignisschleife (#477).
    { methode: 'GET', pfad: '/api/werkbank/systemlast', zugang: 'admin', handler: async () => {
      if (!x.systemlast) throw new Fachfehler(404, t('meldungen.routen.die-messung-der-auslastung'));
      const erweiterungen = x.erweiterungen ? await x.erweiterungen().catch(() => null) : null;
      const stand = x.systemlast.stand();
      // Mehrere Prozesse (#745): Anteil von Ablago = alle Prozesse zusammen, dazu die Liste je Prozess.
      const p = await prozessZeilen(x).catch(() => null);
      const dms = p && p.zeilen.every((z) => z.speicher !== null) ? p.zeilen.reduce((n, z) => n + z.speicher!, 0) : stand.anteile.dms;
      // #918: Hinweis, wenn die Zwischenspeicher zur Fehlersuche abgeschaltet sind (DMS_ZWISCHENSPEICHER=aus).
      return ok({ ...stand, anteile: { ...stand.anteile, dms }, ...(p ? { prozesse: p.zeilen } : {}), schleife: x.messung?.auslastung.stand() ?? null, arbeiter: arbeiterStand(), erweiterungen, ...grenzenUndEngpaesse(x), zwischenspeicher: zwischenspeicherAus() ? 'aus' : 'an' });
    } },
    { methode: 'POST', pfad: '/api/werkbank/system/abgleich', zugang: 'admin', handler: async (a) => {
      const browser = Object.fromEntries(Object.entries((b(a).browser ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
      const start = Date.now();
      const r = await versionsabgleich(await uebersicht(system, x.betrieb?.kurz()), browser, x.abruf);
      L.werkbank.info('Versionsabgleich', { ms: Date.now() - start, neuer: r.filter((v) => v.status === 'neuer' || v.status === 'veraltet').map((v) => v.komponente).join(', ') || undefined });
      return ok(r);
    } },

    /* ---------- Datenbank: lange Zugriffe ---------- */
    { methode: 'GET', pfad: '/api/werkbank/datenbank', zugang: 'admin', handler: async () => {
      const verbindungen = x.verbindungen?.stand() ?? null;
      if (!messung) return ok({ einstellungen: null, langlaeufer: [], laufend: [], auslastung: null, verbindungen });
      const [langlaeufer, laufend] = await Promise.all([messung.speicher.liste(500), messung.speicher.laufende()]);
      // Verzögerung der Ereignisschleife (#477): wie lange Anfragen auf den Server warten.
      const p = await prozessZeilen(x).catch(() => null);
      return ok({ einstellungen: messung.einstellungen, langlaeufer, laufend, auslastung: messung.auslastung.stand(), verbindungen, ...(p ? { prozesse: p.zeilen } : {}) });
    } },
    // Messwerte für den Lasttest (#544): Ereignisschleife, Arbeitsspeicher, Warten auf Verbindungen, Überlastschutz,
    // Arbeiter. Wird vom Überlastschutz nie abgewiesen.
    { methode: 'GET', pfad: '/api/werkbank/last', zugang: 'admin', lesend: true, handler: async (a) => {
      const s = messung?.auslastung.stand();
      const w = s ? (s.aktuell && (s.aktuell.seitSekunden >= 5 || !s.vorher) ? s.aktuell : s.vorher ?? s.aktuell) : null;
      const m = process.memoryUsage();
      const jetzt = x.verbindungen ? await x.verbindungen.probe() : null;
      const v = x.verbindungen?.stand();
      // Mehrere Prozesse (#745): Arbeitsspeicher aller Prozesse zusammen (auch des Hauptprozesses; Pss, die Summe der
      // RSS unter `rssMb`), Wartezeit des langsamsten; je Prozess unter `prozesse`.
      const p = await prozessZeilen(x, 'prozess.last').catch(() => null);
      const schlimmste = p?.staende.filter((z): z is Prozessstand => !!z?.schleife).sort((a, b) => b.schleife!.p99 - a.schleife!.p99)[0];
      return ok({
        schleife: schlimmste?.schleife ?? (w ? { median: w.median, p99: w.p99, max: w.max } : null), schleifeWarnung: s?.warnungSeit ?? null,
        speicherMb: p ? p.speicherMb : Math.round(m.rss / MB), ...(p ? { rssMb: p.rssMb } : {}), heapMb: Math.round(m.heapUsed / MB),
        ...(p ? { prozesse: p.zeilen } : {}),
        // Ganzer Container (#696): so viel zeigt die NAS an – mit PostgreSQL (dms-komplett) und Dateizwischenspeicher.
        // #895: dazu Grenze und Kerne – die Lasttest-Seite zeigt CPU und Speicher in Prozent wie die Auslastung.
        container: (() => { const c = x.systemlast?.container(); const r = x.systemlast?.rahmen(); const mb = (v: number | null | undefined) => (v == null ? null : Math.round(v / MB)); return c && c.aktuell !== null ? { mb: mb(c.aktuell), spitzeMb: mb(c.spitze), programmeMb: mb(c.programme), zwischenspeicherMb: mb(c.zwischenspeicher), datenbankMb: mb(c.datenbank), ...(r ? { grenzeMb: mb(r.grenze), ohneGrenze: r.ohneGrenze, kerne: r.kerne, kerneBegrenzt: r.kerneBegrenzt } : {}) } : null; })(),
        datenbank: v ? { verbindungen: x.verbindungen?.aufteilung?.gesamt ?? v.max, jeProzess: v.max, wartenJetzt: jetzt === null ? null : Math.round(jetzt * 10) / 10, wartenP95: v.p95, wartenMax: v.hoechstens } : null,
        anfragen: x.ueberlast?.stand() ?? null,
        arbeiter: arbeiterStand(),
        engpass: await engpassStand(x, p),
        // Teuerste Abfragen (#894): nur mit ?abfragen=<Anzahl> – der Lasttest fragt einmal am Ende eines Durchgangs.
        ...(a.query.abfragen !== undefined ? { abfragen: x.abfragen ? await x.abfragen.stand(Number(a.query.abfragen) || 10) : null } : {}),
      });
    } },
    // Vor jedem Durchgang des Lasttests (#894): Werte von pg_stat_statements der eigenen Datenbank zurücksetzen.
    { methode: 'POST', pfad: '/api/werkbank/last/abfragen-zuruecksetzen', zugang: 'admin', handler: async () => ok(x.abfragen ? await x.abfragen.zuruecksetzen() : { zurueckgesetzt: false, grund: 'fehler', hinweis: null }) },
    { methode: 'PUT', pfad: '/api/werkbank/datenbank', zugang: 'admin', handler: async (a) => {
      if (!messung) throw new Fachfehler(404, t('meldungen.routen.messung-ist-nicht-aktiv'));
      try {
        const e = await messung.setze({ schwelleMs: b(a).schwelleMs as number, tage: b(a).tage as number });
        L.werkbank.info('Einstellungen für lange Datenbankzugriffe geändert', { ...e });
        return ok(e);
      } catch (e) { throw new Fachfehler(422, (e as Error).message); }
    } },

    /* ---------- Mappen ---------- */
    // Mit ?sicht=… seitenweise (von, anzahl, suche); ohne: alle Mappen (für Skripte und Tests).
    { methode: 'GET', pfad: '/api/mappen', zugang: 'angemeldet', handler: async (a) => {
      const klartext = passwoerterAnzeigen(a);
      const z = await zg(a);
      if (!a.query.sicht) {
        const alle = await dienst.listeMappen(a.query.typ);
        const sichtbar = await dienst.lesbare(z, alle.map((m) => m.id));
        const liste = alle.filter((m) => sichtbar.has(m.id));
        return ok(klartext ? await entschluessele(a, liste, klartext) : liste);
      }
      const start = Date.now();
      const s = await dienst.seite(ich(a), a.query, z);
      L.ablage.debug('Ansicht geladen', { sicht: a.query.sicht, von: s.von, anzahl: s.mappen.length, gesamt: s.gesamt, suche: a.query.suche, ms: Date.now() - start });
      return ok(klartext ? { ...s, mappen: await entschluessele(a, s.mappen.filter((m) => !m.verborgen), klartext) } : s);
    } },
    // Favoriten (#62)
    { methode: 'PUT', pfad: '/api/mappen/:id/favorit', zugang: 'angemeldet', handler: async (a) => { await darf(a, a.params.id, 'R'); return ok(await dienst.setzeFavorit(ich(a), a.params.id, true)); } },
    { methode: 'DELETE', pfad: '/api/mappen/:id/favorit', zugang: 'angemeldet', handler: async (a) => ok(await dienst.setzeFavorit(ich(a), a.params.id, false)) },
    // Favorit = Abo (#422): je Favorit benachrichtigen an/aus; Mappen als gesehen markieren (Hervorhebung, „Geändert“).
    { methode: 'PUT', pfad: '/api/mappen/:id/favorit/benachrichtigen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.setzeFavoritBenachrichtigen(ich(a), a.params.id, b(a).an)) },
    { methode: 'POST', pfad: '/api/gesehen', zugang: 'angemeldet', handler: async (a) => { await dienst.gesehen(ich(a), b(a).ids); return leer; } },
    { methode: 'GET', pfad: '/api/sichten', zugang: 'angemeldet', handler: async (a) => ok(await dienst.zaehler(ich(a), await zg(a))) },
    // Stand der Ablage (#919): ein Fingerabdruck ohne Inhalt; die Oberfläche lädt Startseite und Zähler nur bei Änderung.
    // Nur für die eigene Oberfläche (nicht in /api/v1); zählt nicht als Aktivität (`still`).
    { methode: 'GET', pfad: '/api/ablage/stand', zugang: 'angemeldet', still: true, handler: async (a) => ok({ stand: await dienst.ablageStand(ich(a)) }) },
    // Ohne Zählen (#512): Papierkorb-Tage und „Neue Post“ – die Ablage erscheint damit sofort, die Zahlen kommen danach.
    { methode: 'GET', pfad: '/api/sichten/rahmen', zugang: 'angemeldet', handler: async () => ok(await dienst.zaehlerRahmen()) },
    // Zähler-Endpunkt (#625): nur Zahlen; ETag und 304, damit häufiges Nachfragen nichts kostet.
    { methode: 'GET', pfad: '/api/ich/zaehler', zugang: 'angemeldet', handler: async (a) => {
      const r = await dienst.zaehlerAbruf(await zg(a));
      const koepfe = { etag: r.etag, 'cache-control': 'private, no-cache' };
      if (passtEtag(a.kopf?.('if-none-match'), r.etag)) return { status: 304, koepfe };
      return { status: 200, body: { ...r.zahlen, stand: r.stand, geaendert: r.geaendert }, koepfe };
    } },

    /* ---------- Sichten verwalten (#38, #40, #41) ---------- */
    { methode: 'GET', pfad: '/api/sichten/definitionen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.listeSichten(await zg(a))) },
    { methode: 'POST', pfad: '/api/sichten/definitionen', zugang: 'admin', handler: async (a) => {
      const s = await dienst.legeSichtAn(a.body);
      L.werkbank.info('Ansicht angelegt', { sicht: s.name, typen: s.typen.length, bedingungen: s.bedingungen.length });
      return ok(s, 201);
    } },
    { methode: 'PUT', pfad: '/api/sichten/definitionen/:id', zugang: 'admin', handler: async (a) => {
      const s = await dienst.aendereSicht(a.params.id, a.body);
      L.werkbank.info('Ansicht geändert', { sicht: s.name, typen: s.typen.length, bedingungen: s.bedingungen.length });
      return ok(s);
    } },
    { methode: 'DELETE', pfad: '/api/sichten/definitionen/:id', zugang: 'admin', handler: async (a) => {
      await dienst.loescheSicht(a.params.id);
      L.werkbank.info('Ansicht gelöscht', { id: a.params.id });
      return leer;
    } },
    { methode: 'POST', pfad: '/api/sichten/definitionen/:id/verschieben', zugang: 'admin', handler: async (a) => {
      const r = await dienst.verschiebeSicht(a.params.id, b(a).elternId, b(a).stelle);
      L.werkbank.info('Ansicht verschoben', { id: a.params.id, elternId: b(a).elternId ?? null, stelle: b(a).stelle });
      return ok(r);
    } },
    { methode: 'PUT', pfad: '/api/sichten/reihenfolge', zugang: 'admin', handler: async (a) => ok(await dienst.ordneSichten(b(a).elternId, b(a).ids)) },
    { methode: 'POST', pfad: '/api/sichten/vorschau', zugang: 'admin', lesend: true, handler: async (a) => ok(await dienst.sichtVorschau(ich(a), b(a).id, b(a).sicht)) },
    { methode: 'GET', pfad: '/api/typen/:id/belegung', zugang: 'admin', handler: async (a) => ok(await dienst.belegung(a.params.id)) },
    { methode: 'GET', pfad: '/api/mappen/:id', zugang: 'angemeldet', handler: async (a) => {
      const klartext = passwoerterAnzeigen(a);
      const z = await zg(a);
      // Unabhängiges gleichzeitig (#741): Der Stern ist nur ein Ja/Nein der Person und geht nur mit der Mappe hinaus.
      const [m, favorit] = await Promise.all([dienst.holeMappe(a.params.id, z), dienst.istFavorit(ich(a), a.params.id)]);
      const d = { ...m, favorit, exportierbar: false };
      if (klartext && !d.rechte.P) throw new Fachfehler(403, t('meldungen.routen.passwoerter-dieser-mappe-darfst'));
      // Exportrecht (#294, #723): Herunterladen, Versenden, „Als PDF exportieren“ nur für lesbare Mappen, die in einer
      // Sicht mit Recht E liegen – dieselbe Prüfstelle wie beim Herunterladen selbst.
      // Verwaltungsmodus (#820): ohne Modus nicht lesbar → Historie und Hinweis in der Oberfläche.
      const [mitnehmbar, spur] = await Promise.all([
        d.rechte?.R !== false ? dienst.mitnehmbar(ich(a), z, [a.params.id]) : Promise.resolve(new Set<string>()),
        modusSpur(a, [a.params.id], 'angesehen'),
      ]);
      d.exportierbar = mitnehmbar.has(a.params.id);
      const nurImVerwaltungsmodus = spur.has(a.params.id);
      const antwort = { ...d, ...(nurImVerwaltungsmodus ? { nurImVerwaltungsmodus } : {}) };
      const danach: Array<() => Promise<unknown>> = [];
      // Startseite (#334): „Zuletzt geöffnet“ – nur in der Oberfläche, nicht über API-Schlüssel. Nach der Antwort (#741).
      const b = a.benutzer;
      if (!a.apiSchluessel && b) danach.push(() => konten.merkeGeoeffnet(b, a.params.id));
      // Favorit = Abo (#422): geöffnet = gesehen – Hervorhebung weg, offene „Geändert“-Benachrichtigung erledigt.
      if (!a.apiSchluessel && b && !a.sitzungsDaten?.vertretungId) danach.push(() => dienst.gesehen(b, a.params.id, d.aufgaben));
      return { ...ok(klartext ? { ...antwort, mappe: (await dienst.entschluesselePasswoerter([d.mappe], klartext, ich(a).id))[0] } : antwort), danach };
    } },
    // Startseite (#334): zuletzt geöffnete Mappen (nur lesbare, höchstens 5) und ob es schon eigene Mappen gibt.
    { methode: 'GET', pfad: '/api/startseite', zugang: 'angemeldet', handler: async (a) => ok({ zuletzt: await zuletztGeoeffnet(a, 5), leer: await dienst.ohneEigeneMappen() }) },
    // „Zuletzt geöffnet“ als Liste (#940): die letzten 25 lesbaren Mappen der Person, neueste oben, mit Zeitpunkt.
    { methode: 'GET', pfad: '/api/startseite/zuletzt', zugang: 'angemeldet', handler: async (a) => ok(await zuletztGeoeffnet(a, ZULETZT_LISTE)) },
    // Aufgaben (#54, #56)
    { methode: 'GET', pfad: '/api/aufgaben', zugang: 'angemeldet', handler: async (a) => ok(await dienst.meineAufgaben(ich(a), await zg(a))) },
    { methode: 'GET', pfad: '/api/mappen/:id/aufgaben', zugang: 'angemeldet', handler: async (a) => { await darf(a, a.params.id, 'R'); return ok(await dienst.aufgabenVon(a.params.id)); } },
    { methode: 'POST', pfad: '/api/mappen/:id/aufgaben', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, a.params.id, 'R');
      await empfaengerSichtbar(a, b(a).empfaengerId);
      const auf = await dienst.legeAufgabeAn(a.params.id, a.body, ich(a).id);
      return ok({ ...auf, ...await leseHinweis(auf.empfaengerId, a.params.id) }, 201);
    } },
    // Vor dem Zuweisen (#798): Darf dieser Benutzer die Mappe lesen? Nur ja/nein, für den Hinweis mit „Trotzdem zuweisen“.
    { methode: 'GET', pfad: '/api/mappen/:id/leserecht/:benutzer', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, a.params.id, 'R');
      await empfaengerSichtbar(a, a.params.benutzer);
      return ok({ lesen: await dienst.kannLesen(a.params.benutzer, a.params.id) });
    } },
    { methode: 'POST', pfad: '/api/aufgaben/:id/erledigt', zugang: 'angemeldet', handler: async (a) => ok(await dienst.erledigeAufgabe(a.params.id, ich(a))) },
    // Automatisch zugeordnet (#337): Rückgängig direkt aus der Aufgabe.
    { methode: 'POST', pfad: '/api/aufgaben/:id/rueckgaengig', zugang: 'angemeldet', handler: async (a) => ok(await dienst.automatikRueckgaengig(a.params.id, ich(a), await zg(a))) },
    // Sammel-Weitergabe und -Erledigen (#415, #419): Werkbank → Aufgaben und Profil → Abwesenheit.
    { methode: 'POST', pfad: '/api/aufgaben/weitergeben', zugang: 'angemeldet', handler: async (a) => {
      await empfaengerSichtbar(a, b(a).empfaengerId);
      return ok(await dienst.aufgabenWeitergeben(b(a).ids, b(a).empfaengerId, ich(a)));
    } },
    { methode: 'POST', pfad: '/api/aufgaben/erledigt', zugang: 'angemeldet', handler: async (a) => ok(await dienst.aufgabenErledigen(b(a).ids, ich(a))) },
    { methode: 'POST', pfad: '/api/aufgaben/:id/delegieren', zugang: 'angemeldet', handler: async (a) => {
      await empfaengerSichtbar(a, b(a).empfaengerId);
      const auf = await dienst.delegiereAufgabe(a.params.id, b(a).empfaengerId, ich(a));
      return ok({ ...auf, ...await leseHinweis(auf.empfaengerId, auf.mappeId) });
    } },
    { methode: 'GET', pfad: '/api/werkbank/aufgaben', zugang: 'admin', handler: async (a) => {
      // Aufgaben, deren Empfänger die Mappe nicht lesen darf (#129, #131; seit #798 jede Art, über die Fälle).
      await dienst.faelleAbgleichen();
      return ok({
        aufgaben: await dienst.alleAufgaben(a.query.erledigt !== undefined),
        mail: x.aufgabenmail ? await x.aufgabenmail.einstellung() : null,
        unlesbar: (await dienst.offeneFaelle()).map((f) => f.aufgabeId),
      });
    } },
    // Aufgaben bei Personen ohne Leserecht (#798): offene und vergangene Fälle; Leserecht auf Zeit gibt nur der Admin.
    { methode: 'GET', pfad: '/api/werkbank/aufgaben/ohne-leserecht', zugang: 'admin', handler: async () => ok(await dienst.faelleUebersicht()) },
    { methode: 'POST', pfad: '/api/werkbank/aufgaben/ohne-leserecht/:id/leserecht', zugang: 'admin', handler: async (a) => ok(await dienst.leserechtAufZeitGeben(a.params.id, ich(a).id)) },
    // Fristen (#129–#132)
    { methode: 'POST', pfad: '/api/aufgaben/:id/folgetermin', zugang: 'angemeldet', handler: async (a) => ok(await dienst.setzeFolgetermin(a.params.id, ich(a), await zg(a))) },
    // Termine für „Zu erledigen“ → Monat und Jahr (?von=&bis=&favoriten=1, #528, #725) – mit den Feiertagen der Region (#726).
    { methode: 'GET', pfad: '/api/termine', zugang: 'angemeldet', handler: async (a) => ok(await dienst.termine(await zg(a), { von: a.query.von, bis: a.query.bis, favoriten: a.query.favoriten },
      x.region ? (await x.region.lies()).bundesland : x.aufgabenmail ? (await x.aufgabenmail.einstellung()).bundesland : null)) },
    // Startseite (#725): Kachel „Nächster Termin“.
    { methode: 'GET', pfad: '/api/termine/naechster', zugang: 'angemeldet', handler: async (a) => ok(await dienst.naechsterTermin(await zg(a))) },
    // Alte Adresse (#725): „Anstehend“ gibt es nicht mehr.
    { methode: 'GET', pfad: '/api/anstehend', zugang: 'angemeldet', handler: async () => { throw new Fachfehler(410, t('meldungen.routen.anstehend-gibt-es-nicht')); } },
    { methode: 'POST', pfad: '/api/mappen/:id/erinnerungen', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, a.params.id, 'R');
      await empfaengerSichtbar(a, b(a).empfaengerId);
      const e = await dienst.legeErinnerungAn(a.params.id, a.body, ich(a).id);
      return ok({ ...e, ...await leseHinweis(e.empfaengerId, a.params.id) }, 201);
    } },
    { methode: 'PUT', pfad: '/api/erinnerungen/:id', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.erinnerungMappe(a.params.id);
      await darf(a, mappeId, 'R');
      await empfaengerSichtbar(a, b(a).empfaengerId);
      const e = await dienst.aendereErinnerung(a.params.id, a.body, ich(a));
      return ok({ ...e, ...await leseHinweis(e.empfaengerId, mappeId) });
    } },
    { methode: 'DELETE', pfad: '/api/erinnerungen/:id', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.erinnerungMappe(a.params.id), 'R');
      await dienst.loescheErinnerung(a.params.id, ich(a));
      return leer;
    } },
    // Tägliche Zusammenfassung je Benutzer: Uhrzeit, Wochentage, Feiertage (#92, #94)
    { methode: 'GET', pfad: '/api/konto/zusammenfassung', zugang: 'angemeldet', handler: async (a) => ok(await zusammenfassung(ich(a))) },
    { methode: 'PUT', pfad: '/api/konto/zusammenfassung', zugang: 'angemeldet', handler: async (a) => {
      const z = pruefeZeit(b(a));
      if (b(a).aktiv !== undefined) await konten.setzeEinstellung(ich(a), 'aufgaben_mail', b(a).aktiv === false ? false : null);
      await konten.setzeEinstellung(ich(a), 'aufgaben_mail_zeit', z);
      L.konto.info('Tägliche Zusammenfassung eingestellt', { uhrzeit: z.uhrzeit ?? 'Standard', tage: z.tage.join(','), feiertage: z.feiertage });
      return ok(await zusammenfassung(ich(a)));
    } },
    // Region (#726): Land, Bundesland, Zeitzone an einer Stelle; Vorschau der Feiertage des laufenden Jahres.
    { methode: 'GET', pfad: '/api/werkbank/region', zugang: 'admin', handler: async () => ok(await regionStand(await region().lies())) },
    { methode: 'PUT', pfad: '/api/werkbank/region', zugang: 'admin', handler: async (a) => ok(await regionStand(await region().speichere(a.body))) },
    { methode: 'GET', pfad: '/api/region', zugang: 'angemeldet', handler: async () => ok(await region().lies()) },
    // Sprachen (#729): Werkbank → Sprachen.
    { methode: 'GET', pfad: '/api/werkbank/sprachen', zugang: 'admin', handler: async () => ok(await sprachen().stand()) },
    { methode: 'PUT', pfad: '/api/werkbank/sprachen', zugang: 'admin', handler: async (a) => { await sprachen().speichere(a.body); return ok(await sprachen().stand()); } },
    // Inhalte übersetzen (#732): an/aus für alle, Paket, Bestätigung des Datenabflusses bei Paketen mit Netz.
    { methode: 'GET', pfad: '/api/werkbank/uebersetzen', zugang: 'admin', handler: async () => ok(await dienst.uebersetzung.stand()) },
    { methode: 'PUT', pfad: '/api/werkbank/uebersetzen', zugang: 'admin', handler: async (a) => ok(await dienst.uebersetzung.setze(a.body)) },
    { methode: 'PUT', pfad: '/api/werkbank/aufgaben/mail', zugang: 'admin', handler: async (a) => ok(await mail().speichere(a.body)) },
    { methode: 'POST', pfad: '/api/werkbank/aufgaben/mail/senden', zugang: 'admin', handler: async () => ok({ verschickt: await mail().sende() }) },
    // Favoriten benachrichtigen (#506): für alle, je Rolle oder gar nicht; Vorgabe für neue Benutzer.
    // Aufgaben ohne Empfänger gehen an einen Alltags-Benutzer (#719).
    { methode: 'GET', pfad: '/api/werkbank/aufgaben-empfaenger', zugang: 'admin', handler: async () => ok(await dienst.alltagsEmpfaenger()) },
    { methode: 'PUT', pfad: '/api/werkbank/aufgaben-empfaenger', zugang: 'admin', handler: async (a) => ok(await dienst.setzeAufgabenEmpfaenger(a.body, ich(a).id)) },
    { methode: 'GET', pfad: '/api/werkbank/favoriten-freigabe', zugang: 'admin', handler: async () => ok({ freigabe: await dienst.favoritenFreigabe(), rollen: await dienst.listeRollen() }) },
    { methode: 'PUT', pfad: '/api/werkbank/favoriten-freigabe', zugang: 'admin', handler: async (a) => ok({ freigabe: await dienst.setzeFavoritenFreigabe(a.body, ich(a).email), rollen: await dienst.listeRollen() }) },
    { methode: 'POST', pfad: '/api/werkbank/favoriten-freigabe/anwenden', zugang: 'admin', handler: async (a) => ok({ benutzer: await dienst.favoritenVorgabeAnwenden(ich(a).email) }) },
    // Notizen (#55)
    // E-Mail aus der Mappe (#58)
    { methode: 'GET', pfad: '/api/email/bereit', zugang: 'angemeldet', handler: async () => ok({ bereit: !!x.betrieb?.mailer() }) },
    { methode: 'POST', pfad: '/api/mappen/:id/email', zugang: 'angemeldet', handler: async (a) => {
      const i = ich(a);
      // Versenden gibt Daten hinaus wie ein Export (#330): Lesen und Exportrecht, gemeinsame Prüfstelle (#723).
      const r = await dienst.versendeMappe(a.params.id, b(a), { id: i.id, name: i.name, email: i.email }, x.betrieb?.mailer() ?? null, await zg(a));
      await modusSpur(a, [a.params.id], 'versendet');
      return ok(r, 201);
    } },
    // Post (#192): anlegen („+ Post“, Dokumente danach über das Hochladen) und einer Mappe zuordnen.
    { methode: 'POST', pfad: '/api/post', zugang: 'angemeldet', handler: async (a) => {
      const i = ich(a);
      return ok(await dienst.legePostAn(b(a), { id: i.id, name: i.name }, await zg(a), a.apiSchluessel ? POST_KANAL.api : POST_KANAL.hochgeladen), 201);
    } },
    // Post fotografieren (#490): Fotos einzeln in den Stapel, „Fertig“ macht ein PDF daraus.
    { methode: 'POST', pfad: '/api/fotostapel', zugang: 'angemeldet', roh: MAX_DATEIGROESSE, handler: async (a) => ok({ id: await fotostapel.lege(ich(a).id, a.body) }, 201) },
    { methode: 'POST', pfad: '/api/post/fotos', zugang: 'angemeldet', handler: async (a) => {
      const i = ich(a);
      const ids = (b(a) as { stapel?: unknown }).stapel;
      const fotos = await fotostapel.nimm(i.id, ids);
      const r = await dienst.postAusFotos(b(a), fotos, { id: i.id, name: i.name }, await zg(a), a.apiSchluessel ? POST_KANAL.api : POST_KANAL.hochgeladen);
      await fotostapel.weg(i.id, ids as string[]);
      return ok(r, 201);
    } },
    { methode: 'POST', pfad: '/api/mappen/:id/fotos', zugang: 'angemeldet', handler: async (a) => {
      const i = ich(a);
      const ids = (b(a) as { stapel?: unknown }).stapel;
      const fotos = await fotostapel.nimm(i.id, ids);
      const r = await dienst.fotosAnMappe(a.params.id, b(a), fotos, i.id, await zg(a));
      await fotostapel.weg(i.id, ids as string[]);
      return ok(r, 201);
    } },
    { methode: 'POST', pfad: '/api/post/:id/zusammenlegen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.legePostZusammen(a.params.id, b(a), ich(a).id, await zg(a))) },
    { methode: 'POST', pfad: '/api/mappen/:id/zuordnen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.ordneZu(a.params.id, b(a), ich(a).id, await zg(a), undefined, quelle(a))) },
    // „Dokument übernehmen“ (#934): Folgedokumente als neue Post abtrennen; Abgleich mit vorhandenen Mappen (Belege, Doppelte, Typ).
    { methode: 'POST', pfad: '/api/mappen/:id/abtrennen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.trennePostAb(a.params.id, b(a), ich(a).id, await zg(a))) },
    { methode: 'POST', pfad: '/api/abgleich', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.erkennung.abgleichDokumente(b(a), await zg(a))) },
    // „Wohin gehört das?“ mehrstufig (#939): Pakete mit dms:klassifizieren, Kern-Erkennung und Abgleich – ein Vorschlag mit Belegen.
    { methode: 'POST', pfad: '/api/klassifizieren', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.erkennung.klassifizierung.klassifiziere(b(a), await zg(a))) },
    // „Aus Dokument ausfüllen“ (#391): Vorschläge für die Felder eines Mappentyps aus Text, Dokumenten oder einer Datei.
    { methode: 'POST', pfad: '/api/typen/:id/vorschlaege', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.erkennung.fuerTyp(a.params.id, b(a), await zg(a))) },
    { methode: 'POST', pfad: '/api/typen/:id/vorschlaege/datei', zugang: 'angemeldet', lesend: true, roh: VORSCHLAG_DATEI_MAX, handler: async (a) => {
      const z = await zg(a);
      if (!Buffer.isBuffer(a.body) || !a.body.length) throw new Fachfehler(422, t('meldungen.routen.die-datei-ist-leer'));
      // Erst Zugriff prüfen, dann die (teure) Texterkennung.
      await dienst.erkennung.fuerTyp(a.params.id, { mappe: a.query.mappe }, z);
      const { text, info } = await dienst.textAusDatei(a.body, String(a.query.name ?? ''), String(a.query.typ ?? ''));
      return ok({ ...(await dienst.erkennung.fuerTyp(a.params.id, { text, mappe: a.query.mappe }, z)), text: text.slice(0, 200_000), info });
    } },
    { methode: 'GET', pfad: '/api/typen/:id/erkennungsschema', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.erkennung.schema(a.params.id, await zg(a))) },
    // Erkennung (#336): Vorschläge beim Zuordnen; POST rechnet neu (z. B. nach dem Anlegen einer Organisation).
    { methode: 'GET', pfad: '/api/mappen/:id/erkennung', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.erkennung.fuerBenutzer(a.params.id, await zg(a))) },
    { methode: 'POST', pfad: '/api/mappen/:id/erkennung', zugang: 'angemeldet', handler: async (a) => {
      const z = await zg(a);
      await dienst.pruefeRecht(z, a.params.id, 'R');
      await dienst.erkennung.fuerPost(a.params.id);
      return ok(await dienst.erkennung.fuerBenutzer(a.params.id, z));
    } },
    // Notizen brauchen nur Lesen (#124).
    // Übersetzung anzeigen (#732): nur Kennungen – den Text liest der Kern mit den Rechten der Person; je Aufruf ein Abschnitt.
    // Gespeichert wird nichts an der Mappe; die Übersetzung liegt nur im Zwischenspeicher.
    { methode: 'POST', pfad: '/api/uebersetzung', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.uebersetzung.uebersetze(liesQuelle(b(a).quelle), { teil: b(a).teil, nach: (await spracheFuer(a)).sprache, ich: ich(a), z: await zg(a) })) },
    { methode: 'GET', pfad: '/api/mappen/:id/notizen', zugang: 'angemeldet', handler: async (a) => { await darf(a, a.params.id, 'R'); return ok(await dienst.notizen(a.params.id)); } },
    { methode: 'POST', pfad: '/api/mappen/:id/notizen', zugang: 'angemeldet', handler: async (a) => { await darf(a, a.params.id, 'R'); return ok(await dienst.legeNotizAn(a.params.id, b(a).text, ich(a).id), 201); } },
    { methode: 'PUT', pfad: '/api/notizen/:id', zugang: 'angemeldet', handler: async (a) => { await darf(a, await dienst.mappeVon('notiz', a.params.id), 'R'); return ok(await dienst.aendereNotiz(a.params.id, b(a).text, ich(a).id)); } },
    { methode: 'DELETE', pfad: '/api/notizen/:id', zugang: 'angemeldet', handler: async (a) => { await darf(a, await dienst.mappeVon('notiz', a.params.id), 'R'); await dienst.loescheNotiz(a.params.id, ich(a).id); return leer; } },
    // Änderungshistorie (#57)
    { methode: 'GET', pfad: '/api/mappen/:id/verweisende', zugang: 'angemeldet', handler: async (a) => ok(await dienst.verweisende(a.params.id, String(a.query.typ ?? ''), String(a.query.feld ?? ''), await zg(a))) },
    { methode: 'GET', pfad: '/api/mappen/:id/historie', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, a.params.id, 'R');
      // #800: ?register=… zeigt, was dieses Register „Historie“ zeigt; ?max=…&vor=… seitenweise. Ohne Angaben alles.
      return ok(await dienst.historie(a.params.id, { register: a.query.register, max: a.query.max, vor: a.query.vor }));
    } },
    // Passwortfeld anzeigen (#46): einzeln, mit Protokolleintrag (ohne den Wert).
    { methode: 'POST', pfad: '/api/mappen/:id/passwoerter/:feld', zugang: 'angemeldet', handler: async (a) => { await darf(a, a.params.id, 'P'); return ok(await dienst.zeigePasswort(a.params.id, a.params.feld, ich(a).id)); } },
    // Vor dem Speichern (#126): Rechte mit den neuen Werten – für die Warnung beim Selbst-Entziehen.
    { methode: 'POST', pfad: '/api/mappen/:id/rechte-vorschau', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.rechteVorschau(a.params.id, a.body, await zg(a))) },
    { methode: 'POST', pfad: '/api/mappen', zugang: 'angemeldet', handler: async (a) => {
      const m = await dienst.legeMappeAn(a.body, ich(a).id, false, await zg(a));
      L.ablage.info('Mappe angelegt', { typ: await typName(m.typId), titel: m.titel, id: m.id });
      return ok(m, 201);
    } },
    { methode: 'PUT', pfad: '/api/mappen/:id', zugang: 'angemeldet', handler: async (a) => {
      const m = await dienst.aendereMappe(a.params.id, a.body, ich(a).id, await zg(a));
      await modusSpur(a, [m.id], 'geaendert');
      L.ablage.info('Mappe geändert', { typ: await typName(m.typId), titel: m.titel, id: m.id });
      return ok(m);
    } },
    // Export (#152, #153): Tabelle, ZIP mit Dokumenten oder PDF – Recht E an der Sicht, Lesen je Mappe.
    { methode: 'POST', pfad: '/api/export', zugang: 'angemeldet', handler: async (a) => {
      const r = await dienst.exportiere(ich(a), b(a), await zg(a), (ids) => modusSpur(a, ids, 'exportiert'), a.apiSchluessel ? 'api' : 'oberflaeche');
      L.ablage.info('Mappen exportiert', { von: ich(a).email, sicht: b(a).sicht, format: b(a).format, mappen: r.mappen, ausgelassen: r.ausgelassen, auswahl: Array.isArray(b(a).ids) });
      return { datei: { inhalt: r.inhalt, name: r.name, mime: r.mime, anzeigen: false, groesse: r.groesse, koepfe: { 'x-dms-ausgelassen': String(r.ausgelassen) } } };
    } },
    // Auswahl (#149): alle Treffer einer Sicht (mit Suche) als Ids; mehrere Mappen löschen (#150).
    { methode: 'GET', pfad: '/api/mappen/auswahl', zugang: 'angemeldet', handler: async (a) => ok(await dienst.trefferIds(ich(a), a.query, await zg(a))) },
    // Mehrere Mappen per E-Mail (#151): Lesen und Versenden (Recht E einer Ansicht) je Mappe.
    { methode: 'POST', pfad: '/api/mappen/email', zugang: 'angemeldet', handler: async (a) => {
      const i = ich(a);
      const r = await dienst.versendeMappen(b(a), { id: i.id, name: i.name, email: i.email, rolle: i.rolle }, await zg(a), x.betrieb?.mailer() ?? null);
      await modusSpur(a, (Array.isArray(b(a).ids) ? b(a).ids as unknown[] : []).map(String), 'versendet');
      L.ablage.info('Mehrere Mappen per E-Mail verschickt', { von: i.email, mappen: r.mappen, anhaenge: r.anhaenge });
      return ok(r, 201);
    } },
    { methode: 'POST', pfad: '/api/mappen/loeschen', zugang: 'angemeldet', handler: async (a) => {
      const r = await dienst.loescheMappen(b(a), ich(a).id, await zg(a), quelle(a));
      if (b(a).probe !== true) L.ablage.info('Mehrere Mappen gelöscht', { geloescht: r.geloescht, ausgelassen: r.ausgelassen.length });
      return ok(r);
    } },
    { methode: 'DELETE', pfad: '/api/mappen/:id', zugang: 'angemeldet', handler: async (a) => {
      const papierkorb = (await dienst.papierkorbTage()) > 0;
      await dienst.loescheMappe(a.params.id, ich(a).id, await zg(a), { ...liesAnlass({ ...a.query, ...b(a) }), ausloeser: quelle(a), weg: 'einzeln' });
      L.ablage.info(papierkorb ? 'Mappe in den Papierkorb gelegt' : 'Mappe gelöscht', { id: a.params.id });
      return leer;
    } },

    // Mit allen verknüpften Mappen löschen (#424): Vorschau als Baum, dann Ausführen mit derselben Prüfung.
    { methode: 'GET', pfad: '/api/mappen/:id/loeschvorschau', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.loeschVorschau(a.params.id, a.query, await zg(a))) },
    { methode: 'POST', pfad: '/api/mappen/:id/mit-verknuepften-loeschen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.loescheMitVerknuepften(a.params.id, a.body, ich(a).id, await zg(a), quelle(a))) },

    /* ---------- Papierkorb (#43): in der Ablage nur, was ich gelöscht habe ---------- */
    { methode: 'GET', pfad: '/api/papierkorb', zugang: 'angemeldet', handler: async (a) => ok(await dienst.papierkorb(ich(a))) },
    // Einzelne Dokumente (#344): eigene Liste, damit die Antwort von /api/papierkorb gleich bleibt.
    { methode: 'GET', pfad: '/api/papierkorb/dokumente', zugang: 'angemeldet', handler: async (a) => ok(await dienst.papierkorbDokumente(ich(a))) },
    { methode: 'POST', pfad: '/api/papierkorb/dokumente/:id/wiederherstellen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.stelleDokumentWiederHer(a.params.id, ich(a), await zg(a), false, quelle(a))) },
    { methode: 'DELETE', pfad: '/api/papierkorb/dokumente/:id', zugang: 'angemeldet', handler: async (a) => ok({ geloescht: await dienst.loescheDokumentEndgueltig([a.params.id], ich(a), false, quelle(a)) }) },
    { methode: 'DELETE', pfad: '/api/papierkorb', zugang: 'angemeldet', handler: async (a) => ok({ geloescht: await dienst.leerePapierkorb(ich(a), false, { quelle: quelle(a) }) }) },
    { methode: 'GET', pfad: '/api/papierkorb/:id', zugang: 'angemeldet', handler: async (a) => ok(await dienst.papierkorbEintrag(a.params.id, ich(a))) },
    { methode: 'POST', pfad: '/api/papierkorb/:id/wiederherstellen', zugang: 'angemeldet', handler: async (a) => {
      const r = await dienst.stelleWiederHer(a.params.id, ich(a), false, quelle(a));
      // Eigener Papierkorb (#126): immer wiederherstellbar; danach gelten wieder die Regeln.
      const sichtbar = (await dienst.lesbare(await zg(a), [a.params.id])).has(a.params.id);
      return ok(sichtbar ? r : { ...r, hinweis: t('meldungen.routen.wiederhergestellt-diese-mappe-kannst') });
    } },
    { methode: 'DELETE', pfad: '/api/papierkorb/:id', zugang: 'angemeldet', handler: async (a) => ok({ geloescht: await dienst.loescheEndgueltig([a.params.id], ich(a), false, quelle(a)) }) },
    // Ein Vorgang (#424): alle Mappen, die zusammen gelöscht wurden.
    { methode: 'POST', pfad: '/api/papierkorb/vorgang/:id/wiederherstellen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.stelleVorgangWiederHer(a.params.id, ich(a), false, quelle(a))) },
    /* … und in der Werkbank alles */
    { methode: 'GET', pfad: '/api/werkbank/papierkorb', zugang: 'admin', handler: async (a) => ok({ tage: await dienst.papierkorbTage(), historieTage: await dienst.historieTage(), eintraege: await dienst.papierkorb(ich(a), true), dokumente: await dienst.papierkorbDokumente(ich(a), true) }) },
    { methode: 'POST', pfad: '/api/werkbank/papierkorb/dokumente/:id/wiederherstellen', zugang: 'admin', handler: async (a) => ok(await dienst.stelleDokumentWiederHer(a.params.id, ich(a), undefined, true, quelle(a))) },
    { methode: 'DELETE', pfad: '/api/werkbank/papierkorb/dokumente/:id', zugang: 'admin', handler: async (a) => ok({ geloescht: await dienst.loescheDokumentEndgueltig([a.params.id], ich(a), true, quelle(a)) }) },
    { methode: 'PUT', pfad: '/api/werkbank/papierkorb/einstellungen', zugang: 'admin', handler: async (a) => {
      const historieTage = b(a).historieTage === undefined ? await dienst.historieTage() : await dienst.setzeHistorieTage(b(a).historieTage);
      const r = b(a).tage === undefined ? { tage: await dienst.papierkorbTage(), geleert: 0 } : await dienst.setzePapierkorbTage(b(a).tage, ich(a).id);
      return ok({ ...r, historieTage });
    } },
    { methode: 'DELETE', pfad: '/api/werkbank/papierkorb', zugang: 'admin', handler: async (a) => ok({ geloescht: await dienst.leerePapierkorb(ich(a), true, { quelle: quelle(a) }) }) },
    { methode: 'GET', pfad: '/api/werkbank/papierkorb/:id', zugang: 'admin', handler: async (a) => ok(await dienst.papierkorbEintrag(a.params.id, ich(a), true)) },
    { methode: 'POST', pfad: '/api/werkbank/papierkorb/:id/wiederherstellen', zugang: 'admin', handler: async (a) => ok(await dienst.stelleWiederHer(a.params.id, ich(a), true, quelle(a))) },
    { methode: 'POST', pfad: '/api/werkbank/papierkorb/vorgang/:id/wiederherstellen', zugang: 'admin', handler: async (a) => ok(await dienst.stelleVorgangWiederHer(a.params.id, ich(a), true, quelle(a))) },
    { methode: 'DELETE', pfad: '/api/werkbank/papierkorb/:id', zugang: 'admin', handler: async (a) => ok({ geloescht: await dienst.loescheEndgueltig([a.params.id], ich(a), true, quelle(a)) }) },

    /* ---------- Dokumente ---------- */
    { methode: 'POST', pfad: '/api/mappen/:id/dokumente', zugang: 'angemeldet', roh: MAX_DATEIGROESSE, strom: true, handler: async (a) => {
      await darf(a, a.params.id, 'U');
      const r = await dienst.ladeHoch(a.params.id, { register: a.query.register, name: a.query.name, typ: a.query.typ, gleicherName: a.query.gleicherName, herkunft: a.apiSchluessel ? 'api' : 'hochgeladen' }, a.body, ich(a).id);
      // Gleicher Inhalt (#333): nur Mappen, die der Benutzer lesen darf.
      const lesbar = await dienst.lesbare(await zg(a), r.gleicherInhalt.map((g) => g.mappeId));
      r.gleicherInhalt = r.gleicherInhalt.filter((g) => lesbar.has(g.mappeId));
      L.dokumente.info('Dokument hochgeladen', {
        name: r.dokument.name, groesse: r.dokument.groesse, mime: r.dokument.mime, anzeigbar: r.dokument.anzeigbar,
        mappe: a.params.id, gleicherInhalt: r.gleicherInhalt.length || undefined,
      });
      return ok(r, 201);
    } },
    // Doppelte Dateien vor dem Hochladen erkennen (#333): Prüfwerte (SHA-256) → Fundstellen in lesbaren Mappen.
    { methode: 'POST', pfad: '/api/dokumente/gleiche', zugang: 'angemeldet', lesend: true, handler: async (a) => {
      const e = (a.body ?? {}) as { pruefwerte?: unknown; ohneMappe?: unknown };
      return ok({ fundstellen: await dienst.fundstellen(await zg(a), e.pruefwerte, typeof e.ohneMappe === 'string' ? e.ohneMappe : undefined) });
    } },
    { methode: 'GET', pfad: '/api/dokumente/:id/inhalt', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'R');
      // Herunterladen ist Weitergeben (#394): mit Stempel-Parametern oder Pflicht des Mappentyps gestempelt – und Mitnehmen (#723, Recht E).
      if (weitergabe(a) || a.query.fassung !== undefined) {
        await mitnehmen(a, mappeId);
        const r = await dienst.dokumentFuerAusgabe(a.params.id, { stempel: a.query, verkleinern: a.query.verkleinern, fassung: a.query.fassung, ich: ich(a) });
        return abgerufen(a, a.params.id, { fassung: a.query.fassung === 'archiv' ? 'archiv' : 'original', gestempelt: r.gestempelt, datei: r.name }, ausgabeDatei(r));
      }
      const d0 = await dienst.holeDokument(a.params.id);
      // Was der Browser nicht anzeigen kann (Word, Excel …), kommt nur zum Abspeichern: auch das ist Mitnehmen (#723).
      if (!d0.anzeigbar) await mitnehmen(a, mappeId);
      const { dokument: d, inhalt } = await dienst.dokumentInhalt(a.params.id);
      // Abspeichern ist Herunterladen (#800); Anzeigen in der Oberfläche nicht.
      if (!d.anzeigbar) {
        L.dokumente.debug('Dokument heruntergeladen', { name: d.name, id: d.id });
        return abgerufen(a, d.id, {}, { datei: { inhalt, name: d.name, mime: 'application/octet-stream', anzeigen: false, groesse: d.groesse } });
      }
      // Geschütztes PDF (#827): Angezeigt wird die entsperrte Fassung (bereinigt); Herunterladen liefert das Original.
      const frei = d.mime === 'application/pdf' && d.anzeigbar && !a.apiSchluessel ? await dienst.pdfEntsperren?.fassung(d.sha256).catch(() => null) : null;
      if (frei) return fuerAnzeige(a, { inhalt: frei.inhalt, name: d.name, mime: 'application/pdf', anzeigen: true, groesse: frei.inhalt.length, koepfe: { 'x-dms-entsperrt': '1' } });
      const anzeigen = d.anzeigbar;
      L.dokumente.debug(anzeigen ? 'Dokument angezeigt' : 'Dokument heruntergeladen', { name: d.name, id: d.id });
      return fuerAnzeige(a, { inhalt, name: d.name, mime: d.anzeigbar ? d.mime : 'application/octet-stream', anzeigen, groesse: d.groesse });
    } },
    // Herunterladen mit Stempel aus der Oberfläche (#394): Angaben im Körper, sonst wie oben.
    { methode: 'POST', pfad: '/api/dokumente/:id/herunterladen', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'R');
      await mitnehmen(a, mappeId);
      const e = (a.body ?? {}) as { stempel?: unknown; version?: unknown; verkleinern?: unknown; fassung?: unknown };
      const version = e.version == null ? undefined : Number(e.version);
      const r = await dienst.dokumentFuerAusgabe(a.params.id, { stempel: e.stempel, verkleinern: e.verkleinern, fassung: e.fassung, version: Number.isInteger(version) ? version : undefined, ich: ich(a) });
      return abgerufen(a, a.params.id, { fassung: Number.isInteger(version) ? 'version' : e.fassung === 'archiv' ? 'archiv' : 'original', version: Number.isInteger(version) ? version : null, gestempelt: r.gestempelt, datei: r.name }, ausgabeDatei(r));
    } },
    // Vorschaubild der ersten Seite (#332): gleiche Rechte wie das Dokument; 404, solange es keins gibt.
    { methode: 'GET', pfad: '/api/dokumente/:id/vorschau', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'R');
      // Mit API-Schlüssel und Stempel (#799): Seite 1 der gestempelten Kopie statt des abgelegten Vorschaubilds.
      const q = await seitenquelle(a, mappeId);
      if (q) {
        const s1 = await dienst.pdfSeitenbild(a.params.id, 1, q);
        if (!s1) throw new Fachfehler(404, t('meldungen.routen.fuer-dieses-dokument-gibt'));
        return abgerufen(a, a.params.id, { fassung: 'seiten', gestempelt: true }, { datei: { inhalt: s1, name: 'vorschau.jpg', mime: 'image/jpeg', anzeigen: true, groesse: s1.length, koepfe: { 'cache-control': 'no-store' } } });
      }
      const d = await dienst.holeDokument(a.params.id);
      const bild = x.vorschau ? await x.vorschau.bild(d) : null;
      if (!bild) throw new Fachfehler(404, t('meldungen.routen.fuer-dieses-dokument-gibt'));
      // Die Adresse trägt den Prüfwert (?v=…): ein neues Bild hat eine neue Adresse, das Bild darf im Browser bleiben.
      const antwort: Antwort = { datei: { inhalt: bild, name: 'vorschau.jpg', mime: 'image/jpeg', anzeigen: true, groesse: bild.length, koepfe: { 'cache-control': t('meldungen.routen.private-max-age-604800') } } };
      // Über einen API-Schlüssel ist auch das Vorschaubild ein Abruf (#800) – in der Oberfläche nicht.
      return herausgeben(a) ? abgerufen(a, a.params.id, { fassung: 'seiten' }, antwort) : antwort;
    } },
    // Dateien umwandeln (#577): Fassung und Vorschaubild schreiben nur Pakete mit dms:umwandeln, die das Dokument lesen
    // dürfen (das Original bleibt unverändert, deshalb genügt Lesen); ansehen darf die Fassung, wer das Dokument liest.
    { methode: 'PUT', pfad: '/api/dokumente/:id/fassung', zugang: 'angemeldet', roh: FASSUNG_MAX_BYTES + KOERPER_SPIELRAUM, handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.setzeFassung(await zg(a), a.params.id, a.query.sha256, a.body));
    } },
    { methode: 'PUT', pfad: '/api/dokumente/:id/vorschaubild', zugang: 'angemeldet', roh: VORSCHAUBILD_MAX_BYTES + KOERPER_SPIELRAUM, handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.setzeVorschaubild(await zg(a), a.params.id, a.query.sha256, a.body));
    } },
    // Geschützte PDFs (#827): mit dem Passwort eine entsperrte Fassung anlegen. Das Passwort geht nur an qpdf (über die
    // Standardeingabe), nie in Datenbank, Protokoll oder Historie – außer mit „merken“ verschlüsselt im eigenen Konto.
    { methode: 'POST', pfad: '/api/dokumente/:id/entsperren', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.entsperreDokument(a.params.id, ich(a).id, b(a), !a.apiSchluessel && !a.sitzungsDaten?.vertretungId));
    } },
    { methode: 'GET', pfad: '/api/dokumente/:id/fassung', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'R');
      if (zumAbspeichern(a)) await mitnehmen(a, mappeId);
      const g = herausgeben(a) ? await dienst.fassungFuerAusgabe(a.params.id, 'umgewandelt', { stempel: a.query, ich: ich(a) }) : null;
      if (g) return abgerufen(a, a.params.id, { fassung: 'umgewandelt', gestempelt: true, datei: g.name }, ausgabeDatei({ name: g.name, mime: g.mime, anzeigbar: true, groesse: g.inhalt.length, inhalt: g.inhalt, gestempelt: true }));
      const f = await dienst.fassungVon(a.params.id);
      const punkt = f.d.name.lastIndexOf('.');
      const endung = f.info.mime === 'application/pdf' ? 'pdf' : f.info.mime === 'image/png' ? 'png' : 'jpg';
      const name = `${punkt > 0 ? f.d.name.slice(0, punkt) : f.d.name} (${f.info.entsperrt ? 'entsperrt' : 'umgewandelt'}).${endung}`;
      const antwort = await fuerAnzeige(a, { inhalt: f.inhalt, name, mime: f.info.mime, anzeigen: a.query.herunterladen === undefined, groesse: f.inhalt.length,
        koepfe: { 'x-dms-fassung-paket': `${f.info.paket.id} ${f.info.paket.version}`, 'cache-control': t('meldungen.routen.private-max-age-60') } });
      return zumAbspeichern(a) ? abgerufen(a, a.params.id, { fassung: 'umgewandelt', datei: name }, antwort) : antwort;
    } },
    // Archivfassung (PDF/A, #631): ablegen nur Pakete mit dms:archivfassung, die das Dokument lesen dürfen (das Original
    // bleibt unverändert); ansehen, wer das Dokument liest. Wortpositionen ebenso mit Lesen (ohne weiteres Recht).
    { methode: 'PUT', pfad: '/api/dokumente/:id/archivfassung', zugang: 'angemeldet', roh: ARCHIVFASSUNG_MAX_BYTES + KOERPER_SPIELRAUM, handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.setzeArchivfassung(await zg(a), a.params.id, a.query.sha256, a.body));
    } },
    { methode: 'GET', pfad: '/api/dokumente/:id/archivfassung', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'R');
      if (zumAbspeichern(a)) await mitnehmen(a, mappeId);
      // Mit API-Schlüssel ist das Herausgeben (#799): mit Pflicht- oder gewünschtem Stempel eine gestempelte Kopie.
      // Die gespeicherte Archivfassung bleibt unverändert; Pakete bekommen sie immer, wie sie ist.
      const g = herausgeben(a) ? await dienst.fassungFuerAusgabe(a.params.id, 'archiv', { stempel: a.query, ich: ich(a) }) : null;
      if (g) return abgerufen(a, a.params.id, { fassung: 'archiv', gestempelt: true, datei: g.name }, ausgabeDatei({ name: g.name, mime: g.mime, anzeigbar: true, groesse: g.inhalt.length, inhalt: g.inhalt, gestempelt: true }));
      const f = await dienst.archivfassungVon(a.params.id);
      const name = f.info.imOriginal ? f.d.name : archivfassungName(f.d.name);
      const antwort = await fuerAnzeige(a, { inhalt: f.inhalt, name, mime: 'application/pdf', anzeigen: a.query.herunterladen === undefined, groesse: f.inhalt.length,
        koepfe: { 'x-dms-archivfassung': `${pdfaName(f.info.pdfa)}; ${f.info.paket.id} ${f.info.paket.version}${f.info.imOriginal ? '; original' : ''}`, 'cache-control': t('meldungen.routen.private-max-age-60') } });
      return zumAbspeichern(a) ? abgerufen(a, a.params.id, { fassung: 'archiv', datei: name }, antwort) : antwort;
    } },
    { methode: 'GET', pfad: '/api/dokumente/:id/wortpositionen', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.wortpositionen(a.params.id));
    } },
    // Volltext und Texterkennung (#45)
    { methode: 'GET', pfad: '/api/dokumente/:id/volltext', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'R');
      const r = await dienst.volltext(a.params.id);
      return ok({ id: r.dokument.id, name: r.dokument.name, ocr: r.dokument.ocr, sprache: r.dokument.sprache ?? null, weitereSprachen: r.dokument.weitereSprachen ?? [], text: r.text, ...(r.seiten ? { seiten: r.seiten } : {}) });
    } },
    // Volltext schreiben (#338): für Pakete wie die Texterkennung – Dienstkonto mit „Dokumente schreiben“ oder Recht Bearbeiten;
    // mit dms:volltext (#614) nur für die Dateitypen des Pakets. Bis zur Grenze des Kerns (5 Mio. Zeichen) in einer Anfrage.
    { methode: 'PUT', pfad: '/api/dokumente/:id/volltext', zugang: 'angemeldet', roh: VOLLTEXT_KOERPER_MAX, handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), a.benutzer?.art === 'dienst' ? 'R' : 'U');
      if (a.benutzer?.art === 'dienst') await dienst.pruefeVolltextRecht(await zg(a), a.params.id);
      const p = a.benutzer?.art === 'dienst' ? (await dienst.listePakete()).find((x) => x.id === a.benutzer!.paketId) : undefined;
      const herkunft = p ? `${p.name} ${p.version}` : t('meldungen.routen.ueber-die-api', { wert: ich(a).name || ich(a).email });
      const d = await dienst.schreibeVolltext(a.params.id, a.body, { id: ich(a).id, herkunft, paket: !!p, ausgelesen: !!p && hatSchnittstelle(p.laeufer, 'dms:volltext') && !hatSchnittstelle(p.laeufer, 'dms:texterkennung') });
      return ok({ id: d.id, name: d.name, ocr: d.ocr, sprache: d.sprache ?? null, weitereSprachen: d.weitereSprachen ?? [] });
    } },
    // Sprache des Volltexts (#400): bestimmt die Wortstämme der Suche – Rechte wie beim Volltext schreiben.
    { methode: 'PUT', pfad: '/api/dokumente/:id/sprache', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), a.benutzer?.art === 'dienst' ? 'R' : 'U');
      if (a.benutzer?.art === 'dienst') await dienst.pruefeVolltextRecht(await zg(a), a.params.id);
      const p = a.benutzer?.art === 'dienst' ? (await dienst.listePakete()).find((x) => x.id === a.benutzer!.paketId) : undefined;
      const d = await dienst.setzeDokumentSprache(a.params.id, a.body, { id: ich(a).id, wer: p ? `${p.name} ${p.version}` : t('meldungen.routen.ueber-die-api', { wert: ich(a).name || ich(a).email }) });
      return ok({ id: d.id, name: d.name, sprache: d.sprache ?? null, weitereSprachen: d.weitereSprachen ?? [], ocr: d.ocr });
    } },
    // Hinweis „Post teilen?“ wegklicken (#579): wer teilen dürfte (Bearbeiten), darf ihn auch ausblenden.
    { methode: 'DELETE', pfad: '/api/dokumente/:id/teilen-hinweis', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'U');
      const d = await dienst.teilenHinweisAus(a.params.id);
      return ok({ id: d.id, teilenAb: d.teilenAb ?? null });
    } },
    // Vektoren zu Dokumenten (#442): schreiben nur Pakete mit dms:vektoren, die das Dokument lesen dürfen.
    { methode: 'PUT', pfad: '/api/dokumente/:id/vektor', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.setzeVektor(await zg(a), a.params.id, (b(a) as { modell?: unknown }).modell, a.body));
    } },
    { methode: 'DELETE', pfad: '/api/dokumente/:id/vektor', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.loescheVektor(await zg(a), a.params.id, a.query.modell));
    } },
    { methode: 'GET', pfad: '/api/dokumente/:id/aehnliche', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.aehnlicheDokumente(await zg(a), { dokument: a.params.id, modell: a.query.modell, anzahl: a.query.anzahl, schwelle: a.query.schwelle }));
    } },
    { methode: 'POST', pfad: '/api/vektoren/aehnliche', zugang: 'angemeldet', lesend: true, handler: async (a) => {
      const e = b(a) as { modell?: unknown; vektor?: unknown; anzahl?: unknown; schwelle?: unknown };
      return ok(await dienst.aehnlicheDokumente(await zg(a), { modell: e.modell, vektor: e.vektor, anzahl: e.anzahl, schwelle: e.schwelle }));
    } },
    { methode: 'GET', pfad: '/api/mappen/:id/aehnliche', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.aehnlicheZurMappe(await zg(a), a.params.id)) },
    // Seite als Graustufenbild (#338): Eingabe für eine Texterkennung im Paket (PGM, 8 Bit).
    // Mit ?farbe=1 (#716) als Farbbild (PPM) – für die Archivfassung; wie das Graustufenbild nur mit Leserecht.
    { methode: 'GET', pfad: '/api/dokumente/:id/seiten/:nr/scan', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'R');
      // Rohbild der Seite zum Abspeichern: für Pakete (Dienstkonten) mit Lesen, für Menschen ist es Mitnehmen (#723).
      await mitnehmen(a, mappeId);
      const dpi = a.query.dpi === undefined ? 300 : Number(a.query.dpi);
      const farbe = a.query.farbe === '1' || a.query.farbe === 'true';
      // Mit API-Schlüssel und Stempel (#799): die Seite der gestempelten Kopie.
      const q = await seitenquelle(a, mappeId);
      const bild = await dienst.seiteAlsGraubild(a.params.id, Number(a.params.nr), dpi, farbe, q);
      return abgerufen(a, a.params.id, { fassung: 'seiten', gestempelt: !!q }, { datei: { inhalt: bild, name: `seite-${a.params.nr}.${farbe ? 'ppm' : 'pgm'}`, mime: farbe ? 'image/x-portable-pixmap' : 'image/x-portable-graymap', anzeigen: false, groesse: bild.length } });
    } },
    { methode: 'POST', pfad: '/api/dokumente/:id/texterkennung', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'U');
      const d = await dienst.texterkennungErneut(a.params.id);
      L.dokumente.info('Texterkennung erneut angestoßen', { name: d.name, id: d.id });
      return ok(d);
    } },
    /* Versionierung (#194): Ersetzen und Zurückholen mit dem Recht „Bearbeiten“, Versionen mit „Lesen“. */
    { methode: 'GET', pfad: '/api/dokumente/:id/versionen', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.versionen(a.params.id));
    } },
    { methode: 'GET', pfad: '/api/dokumente/:id/versionen/:nummer/inhalt', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'R');
      const nummer = Number(a.params.nummer);
      if (weitergabe(a)) {
        await mitnehmen(a, mappeId);
        const r = await dienst.dokumentFuerAusgabe(a.params.id, { version: nummer, stempel: a.query, verkleinern: a.query.verkleinern, ich: ich(a) });
        return abgerufen(a, a.params.id, { fassung: 'version', version: nummer, gestempelt: r.gestempelt, datei: r.name }, ausgabeDatei(r));
      }
      const { version: v, inhalt } = await dienst.versionInhalt(a.params.id, nummer);
      if (!v.anzeigbar) {
        try { await mitnehmen(a, mappeId); } catch (e) { if (!Buffer.isBuffer(inhalt)) (inhalt as Readable).destroy(); throw e; }
      }
      const anzeigen = v.anzeigbar;
      const antwort = await fuerAnzeige(a, { inhalt, name: v.name, mime: v.anzeigbar ? v.mime : 'application/octet-stream', anzeigen, groesse: v.groesse });
      return anzeigen ? antwort : abgerufen(a, a.params.id, { fassung: 'version', version: nummer, datei: v.name }, antwort);
    } },
    { methode: 'POST', pfad: '/api/dokumente/:id/ersetzen', zugang: 'angemeldet', roh: MAX_DATEIGROESSE, strom: true, handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'U');
      const d = await dienst.ersetzeDokument(a.params.id, { name: a.query.name, typ: a.query.typ, herkunft: a.apiSchluessel ? 'api' : 'hochgeladen' }, a.body, ich(a).id);
      L.dokumente.info('Neue Version eines Dokuments', { name: d.name, id: d.id, version: d.version });
      return ok(d, 201);
    } },
    { methode: 'POST', pfad: '/api/dokumente/:id/versionen/:nummer/zurueckholen', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'U');
      const d = await dienst.holeVersionZurueck(a.params.id, Number(a.params.nummer), ich(a).id);
      L.dokumente.info('Ältere Version zurückgeholt', { name: d.name, id: d.id, version: d.version, von: Number(a.params.nummer) });
      return ok(d, 201);
    } },
    /* PDF bearbeiten (#335): Seiten ansehen mit „Lesen“, bearbeiten mit „Bearbeiten“. */
    { methode: 'GET', pfad: '/api/dokumente/:id/seiten', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.pdfSeiten(a.params.id));
    } },
    { methode: 'GET', pfad: '/api/dokumente/:id/seiten/:nr/bild', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'R');
      const q = await seitenquelle(a, mappeId);
      const bild = await dienst.pdfSeitenbild(a.params.id, Number(a.params.nr), q);
      if (!bild) throw new Fachfehler(404, t('meldungen.routen.fuer-diese-seite-gibt'));
      const antwort: Antwort = { datei: { inhalt: bild, name: `seite-${a.params.nr}.jpg`, mime: 'image/jpeg', anzeigen: true, groesse: bild.length, koepfe: { 'cache-control': t('meldungen.routen.private-max-age-3600') } } };
      // Seitenbilder über einen API-Schlüssel sind ein Abruf (#799, #800); in der Oberfläche nur Anzeige.
      return herausgeben(a) ? abgerufen(a, a.params.id, { fassung: 'seiten', gestempelt: !!q }, antwort) : antwort;
    } },
    { methode: 'POST', pfad: '/api/dokumente/:id/seiten', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'U');
      return ok(await dienst.bearbeitePdf(a.params.id, a.body, ich(a).id, await zg(a)), 201);
    } },
    { methode: 'POST', pfad: '/api/dokumente/zusammenfuegen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.fuegePdfZusammen(a.body, ich(a).id, await zg(a)), 201) },
    /* Schwärzen (#392): Ansehen und Analyse mit „Lesen“, Schwärzen (neues Dokument bzw. Version) mit „Bearbeiten“. */
    { methode: 'GET', pfad: '/api/dokumente/:id/schwaerzen', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.schwaerzenVorschau(a.params.id));
    } },
    { methode: 'GET', pfad: '/api/dokumente/:id/schwaerzen/seiten/:nr', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.mappeVon('dokument', a.params.id);
      await darf(a, mappeId, 'R');
      const q = await seitenquelle(a, mappeId);
      // ?fassung=archiv (#934): die Seite der Archivfassung (PDF/A) – nicht mit Pflichtstempel, der gilt dem Original.
      const bild = a.query.fassung === 'archiv' && !q ? await dienst.archivSeitenbild(a.params.id, Number(a.params.nr)) : await dienst.schwaerzSeitenbild(a.params.id, Number(a.params.nr), q);
      if (!bild) throw new Fachfehler(404, t('meldungen.routen.fuer-diese-seite-gibt'));
      const antwort: Antwort = { datei: { inhalt: bild, name: `seite-${a.params.nr}.jpg`, mime: 'image/jpeg', anzeigen: true, groesse: bild.length, koepfe: { 'cache-control': t('meldungen.routen.private-max-age-3600') } } };
      return herausgeben(a) ? abgerufen(a, a.params.id, { fassung: 'seiten', gestempelt: !!q }, antwort) : antwort;
    } },
    { methode: 'POST', pfad: '/api/dokumente/:id/schwaerzen', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'U');
      return ok(await dienst.schwaerzeDokument(a.params.id, a.body, ich(a).id), 201);
    } },
    /* PDF verkleinern (#393): Schätzung mit „Lesen“, Verkleinern (neue Version) mit „Bearbeiten“. */
    { methode: 'GET', pfad: '/api/dokumente/:id/verkleinern', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'R');
      return ok(await dienst.verkleinernVorschau(a.params.id));
    } },
    { methode: 'POST', pfad: '/api/dokumente/:id/verkleinern', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'U');
      const r = await dienst.verkleinereDokument(a.params.id, a.body, ich(a).id);
      return ok(r, r.unveraendert ? 200 : 201);
    } },
    { methode: 'GET', pfad: '/api/werkbank/verkleinern', zugang: 'admin', handler: async (a) => ok(await dienst.grosseDokumente(a.query)) },
    { methode: 'POST', pfad: '/api/werkbank/verkleinern', zugang: 'admin', handler: async (a) => ok(await dienst.auftraege.angemeldet(dienst.verkleinereViele(a.body, { id: ich(a).id, email: ich(a).email })), 202) },
    { methode: 'GET', pfad: '/api/werkbank/verkleinern/einstellung', zugang: 'admin', handler: async () => ok(await dienst.verkleinernEinstellung()) },
    { methode: 'PUT', pfad: '/api/werkbank/verkleinern/einstellung', zugang: 'admin', handler: async (a) => ok(await dienst.setzeVerkleinernEinstellung(a.body)) },
    /* Archivnummer (#345): setzen mit „Bearbeiten“, suchen mit „Lesen“, Aufkleber in der Werkbank. */
    { methode: 'PUT', pfad: '/api/dokumente/:id/archivnummer', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'U');
      return ok(await dienst.setzeArchivnummer(a.params.id, (b(a) as { archivnummer?: unknown }).archivnummer, ich(a).id));
    } },
    { methode: 'GET', pfad: '/api/archivnummern/:nr', zugang: 'angemeldet', handler: async (a) => ok(await dienst.findeArchivnummer(a.params.nr, await zg(a))) },
    { methode: 'POST', pfad: '/api/werkbank/archivnummern/aufkleber', zugang: 'admin', handler: async (a) => {
      const r = await dienst.archivAufkleber(a.body, ich(a).email);
      return { datei: { inhalt: r.pdf, name: t('meldungen.routen.archivnummern-bis-pdf', { erste: r.erste, letzte: r.letzte }), mime: 'application/pdf', anzeigen: false, groesse: r.pdf.length } };
    } },
    { methode: 'DELETE', pfad: '/api/dokumente/:id', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'U');
      const r = await dienst.loescheDokument(a.params.id, ich(a).id, { ...liesAnlass({ ...a.query, ...b(a) }), ausloeser: quelle(a), weg: 'dokument' });
      L.dokumente.info(r.papierkorb ? 'Dokument in den Papierkorb gelegt' : 'Dokument gelöscht', { id: a.params.id });
      return leer;
    } },

    /* ---------- Webhooks im eigenen Profil (#627) ---------- */
    { methode: 'GET', pfad: '/api/konto/webhooks', zugang: 'angemeldet', handler: async (a) => ok({ webhooks: await webhooks().liste(ich(a)), ziele: await webhooks().ziele() }) },
    { methode: 'POST', pfad: '/api/konto/webhooks', zugang: 'angemeldet', handler: async (a) => ok(await webhooks().lege(ich(a), a.body), 201) },
    { methode: 'PUT', pfad: '/api/konto/webhooks/:id', zugang: 'angemeldet', handler: async (a) => ok(await webhooks().aendere(ich(a), a.params.id, a.body)) },
    { methode: 'DELETE', pfad: '/api/konto/webhooks/:id', zugang: 'angemeldet', handler: async (a) => { await webhooks().loesche(ich(a), a.params.id); return leer; } },
    { methode: 'POST', pfad: '/api/konto/webhooks/:id/probe', zugang: 'angemeldet', handler: async (a) => ok(await webhooks().probe(ich(a), a.params.id)) },
    { methode: 'POST', pfad: '/api/konto/webhooks/:id/geheimnis', zugang: 'angemeldet', handler: async (a) => ok(await webhooks().erneuereGeheimnis(ich(a), a.params.id)) },
    { methode: 'GET', pfad: '/api/konto/webhooks/:id/verlauf', zugang: 'angemeldet', handler: async (a) => ok(await webhooks().verlauf(ich(a), a.params.id)) },

    /* ---------- API-Schlüssel im eigenen Profil ---------- */
    { methode: 'GET', pfad: '/api/konto/api-schluessel', zugang: 'angemeldet', handler: async (a) => ok(await schluessel().liste(ich(a))) },
    { methode: 'POST', pfad: '/api/konto/api-schluessel', zugang: 'angemeldet', handler: async (a) => {
      const r = await schluessel().lege(ich(a), a.body);
      L.konto.info('API-Schlüssel erzeugt', { name: r.name, recht: r.recht, praefix: r.praefix });
      return ok(r, 201);
    } },
    { methode: 'PUT', pfad: '/api/konto/api-schluessel/:id', zugang: 'angemeldet', handler: async (a) => {
      const r = await schluessel().aendere(ich(a), a.params.id, a.body);
      L.konto.info('API-Schlüssel geändert', { name: r.name, recht: r.recht });
      return ok(r);
    } },
    { methode: 'DELETE', pfad: '/api/konto/api-schluessel/:id', zugang: 'angemeldet', handler: async (a) => {
      await schluessel().loesche(ich(a), a.params.id);
      L.konto.info('API-Schlüssel gelöscht', { id: a.params.id });
      return leer;
    } },
  ];
  // Öffentliche API /api/v1 und ihre Beschreibung (aus der installierten Version).
  const doku = async () => ok(openapi(eigeneVersion()));
  const alle: Route[] = [
    ...intern,
    ...v1Routen(intern),
    { methode: 'GET', pfad: '/api/openapi.json', zugang: 'offen', handler: doku },
    { methode: 'GET', pfad: '/api/v1/openapi.json', zugang: 'offen', handler: doku },
  ];
  // Kein verschlüsselter Wert verlässt den Server: Passwortfelder erscheinen als { gesetzt, lesbar } (#46).
  const lesbar = (v: string) => !!x.tresor?.lesbar(v);
  // Dienstkonten (#338): Dokumente nur mit dem bestätigten Recht – lesen (GET) bzw. schreiben.
  // Dienstkonten von Paketen (#338): Dokumente nur mit dem Recht aus dem Manifest; E-Mail-Versand nie (Anhänge, Netz).
  const dokumentRoute = (r: Route) => /\/dokumente\b|\/archivnummern\b|\/vektoren\b/.test(r.pfad);
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

/** Liest einen Cookie-Wert aus dem Cookie-Header. */
export function leseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const teil of header.split(';')) {
    const [k, ...v] = teil.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Set-Cookie für die Sitzung; `null` löscht sie. HttpOnly: kein Zugriff aus Skripten. */
/** Hilfs-Cookies der Anmeldung über einen Anbieter (#241). */
export const BINDUNG_COOKIE = 'dms_anbieter_bindung';
export const ANBIETER_COOKIE = 'dms_anbieter';
/** #358: bindet den OAuth-Fluss eines Postfachs an den Browser, in dem er begonnen wurde. */
export const POSTFACH_BINDUNG_COOKIE = 'dms_postfach_bindung';
export function kurzCookie(name: string, wert: string, sekunden: number, pfad: string): string {
  // Secure ergänzt http.ts wie beim Sitzungs-Cookie.
  return [`${name}=${encodeURIComponent(wert)}`, `Path=${pfad}`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${sekunden}`].join('; ');
}

export function sitzungsCookie(schluessel: string | null, sicher: boolean): string {
  const teile = [`${SITZUNG_COOKIE}=${schluessel ? encodeURIComponent(schluessel) : ''}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${schluessel ? SITZUNG_SEKUNDEN : 0}`];
  if (sicher) teile.push('Secure');
  return teile.join('; ');
}

/** Zwei-Faktor für /api/konto/status (#242, #416); beim Agieren als anderer Benutzer nie gesperrt. */
async function zweifaktorStatus(zf: Zweifaktor, b: Benutzer, s?: SitzungIntern) {
  const lage = s?.vertretungId ? 'ok' : await zf.lage(b, s?.erstellt);
  return { aktiv: await zf.aktiv(b.id), fehlt: lage === 'fehlt', ausstehend: lage === 'ausstehend' };
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

/** If-None-Match (RFC 9110): Liste von ETags, auch schwach (W/…) oder „*“. */
export function passtEtag(kopf: string | undefined, etag: string): boolean {
  if (!kopf) return false;
  return kopf.split(',').map((x) => x.trim().replace(/^W\//, '')).some((x) => x === '*' || x === etag);
}

/**
 * Prüft Zugang und Schutz vor fremden Seiten (CSRF): Ändernde Anfragen
 * müssen den Header X-DMS tragen, den nur die eigene Oberfläche setzt.
 */
/**
 * Übersicht der Werkbank (#818, Bauvorgabe Sicherheit): nur Meldungen der eigenen Bereiche. Was zu einem anderen
 * Bereich gehört, kommt neutral zurück (keine Warnung), damit die Oberfläche dieselben Felder hat.
 */
const UEBERSICHT_BEREICHE: Record<string, { bereich: string; leer: unknown }> = {
  tresor: { bereich: 'verschluesselung', leer: null }, mail: { bereich: 'betrieb', leer: true }, adresse: { bereich: 'betrieb', leer: true },
  texterkennung: { bereich: 'texterkennung', leer: null }, texterkennungPaket: { bereich: 'texterkennung', leer: true },
  // Fehlende Dateien (#877): Der Knopf führt zu „Alle Dateien prüfen“ unter Texterkennung.
  dateienFehlen: { bereich: 'texterkennung', leer: 0 },
  aufgaben: { bereich: 'aufgaben', leer: { offen: 0, ohneEmpfaenger: 0 } }, ohneLeserecht: { bereich: 'aufgaben', leer: 0 },
  aufgabenEmpfaenger: { bereich: 'benutzer', leer: null }, unpassend: { bereich: 'typen', leer: 0 },
  papierkorb: { bereich: 'papierkorb', leer: { anzahl: 0, aeltester: null, tage: 0 } }, fehlermeldungen: { bereich: 'fehlermeldungen', leer: null },
  notfallzugaenge: { bereich: NUR_GESAMT, leer: [] }, notfallcodeBenutzt: { bereich: NUR_GESAMT, leer: [] }, zweitePerson: { bereich: NUR_GESAMT, leer: false }, wartung: { bereich: 'wartung', leer: null }, sicherung: { bereich: 'sicherung', leer: null },
  exporte: { bereich: 'vollexport', leer: null }, speicherplatz: { bereich: 'systemzustand', leer: null }, auslastung: { bereich: 'systemzustand', leer: [] },
  engpaesse: { bereich: 'systemzustand', leer: [] }, erweiterungen: { bereich: 'systemzustand', leer: [] }, variablen: { bereich: 'systemzustand', leer: [] },
  bestand: { bereich: 'systemzustand', leer: null }, lasttestAbbruch: { bereich: 'systemzustand', leer: null }, anbindung: { bereich: 'anbindung', leer: null },
  einrichtung: { bereich: NUR_GESAMT, leer: null }, automatisierungen: { bereich: 'automatisierungen', leer: null },
  paketeEinstellungen: { bereich: 'pakete', leer: [] }, kiTypen: { bereich: 'pakete', leer: null }, postfachAnmeldung: { bereich: 'postfaecher', leer: [] },
  eingangsordner: { bereich: 'eingangsordner', leer: null },
};
export function nurEigeneBereiche<T extends Record<string, unknown>>(b: Benutzer, daten: T): T {
  if (hatGesamt(b)) return daten;
  const erg: Record<string, unknown> = { ...daten };
  for (const [k, { bereich, leer }] of Object.entries(UEBERSICHT_BEREICHE)) {
    if (!(k in erg)) continue;
    if (bereich === NUR_GESAMT || !darfBereich(b, bereich)) erg[k] = leer;
  }
  return erg as T;
}

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
    // mit dms:sicherung-lesen fragt). Fällt mit der übernächsten Fassung weg.
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

/** Vollexport (#254): Vorschlag, welche Felder eines Typs einen Kontakt (vCard) ergeben – bestätigt der Administrator. */
export function kontaktVorschlaege(typen: Mappentyp[]): Array<{ typId: string; typ: string; zuordnung: KontaktZuordnung }> {
  const erg: Array<{ typId: string; typ: string; zuordnung: KontaktZuordnung }> = [];
  for (const t of typen) {
    const text = t.felder.filter((f) => f.typ === 'text' || f.typ === 'langtext');
    const finde = (re: RegExp) => text.find((f) => re.test(`${f.key} ${f.label}`.toLowerCase()))?.key;
    const email = finde(/e-?mail/), telefon = finde(/telefon|tel\b|handy|mobil|phone/);
    const adresse = text.find((f) => /adresse|anschrift|stra(ss|ß)e/.test(`${f.key} ${f.label}`.toLowerCase()) && f.key !== email)?.key;
    if (!email && !telefon && !adresse) continue;
    const name = finde(/^name|\bname\b|bezeichnung|firma|kontakt/) ?? text[0]?.key;
    if (!name) continue;
    erg.push({ typId: t.id, typ: t.name, zuordnung: { name, ...(email ? { email } : {}), ...(telefon ? { telefon } : {}), ...(adresse ? { adresse } : {}), ...(finde(/firma|unternehmen|organisation/) && finde(/firma|unternehmen|organisation/) !== name ? { firma: finde(/firma|unternehmen|organisation/) } : {}) } });
  }
  return erg;
}
