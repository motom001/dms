import type { Readable } from 'node:stream';
import type { Benutzer } from '../../../shared/src/model';
import type { SitzungIntern } from '../konten/konto-repo';
import type { ApiSchluessel } from '../anmeldung/apischluessel';

/*
 * Form der Routen (#1278, Schritt 5b; vorher in http/routen.ts): Route, Anfrage, Antwort, Datei, Zugang. Fachrouten
 * (*.routen.ts) und die HTTP-Schicht binden die Form von hier ein – diese Datei bindet nichts aus Routen, Kontext oder
 * Fachbereichen zurück ein, sonst entstünde wieder ein Kreis über http/routen.ts.
 */

/**
 * Alle Schnittstellen an einem Ort, jede mit ihrer Zugriffsstufe:
 *   offen      – ohne Anmeldung (Einrichtung, Anmeldung, Passwort-Links)
 *   angemeldet – jeder angemeldete Benutzer
 *   admin      – Werkbank: nur im Verwaltungsmodus (#819) und nur mit Recht auf den Bereich der Route (#818,
 *                Zuordnung in verwaltungsbereiche.ts); nie mit einem API-Schlüssel
 * Der HTTP-Adapter (http.ts) setzt die Stufen durch.
 */
type Zugang = 'offen' | 'angemeldet' | 'admin';

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
  /** Kopf X-Einrichtungscode (#119), solange das DMS nicht eingerichtet ist; mit Herkunft aus dem Heimnetz (#1359). */
  einrichtungscode?: string | import('../einrichtung/einrichtungscode').EinrichtungsAngabe;
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
  status?: number;
  body?: unknown;
  sitzungSetzen?: string | null;
  datei?: Datei;
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
   * Körper unverändert als Puffer, gleich welcher Content-Type (auch JSON wird nicht gelesen), höchstens so viele
   * Bytes – für Signaturen über die Bytes, wie sie ankamen (Aufruf von außen, #679).
   */
  rohKoerper?: number;
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
  /** Öffentliche API (#1307): Ändernd, aber ein Schlüssel der Stufe „lesen“ genügt – nur Merker der eigenen Person. */
  lesenGenuegt?: boolean;
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
  /**
   * Ohne Sitzung (#1198): Die Anfrage schaut gar nicht nach der Anmeldung – nur für die Gesundheitsprüfung, die sonst
   * mit Sitzungs-Cookie (Browser) an derselben Datenbank hinge, die sie prüfen soll.
   */
  ohneSitzung?: boolean;
  /**
   * Anmeldung höchstens so lange nachsehen (#1198, nur `offen`): Antwortet die Datenbank nicht rechtzeitig, läuft die
   * Anfrage ohne angemeldete Person weiter – für `/api/sprache` beim Start der Oberfläche.
   */
  anmeldungHoechstensMs?: number;
  handler(a: Anfrage): Promise<Antwort>;
}
