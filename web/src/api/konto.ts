/** Schnittstelle (#1234): Konto, Anmeldung und Verwaltungsmodus: Status, Benutzer und Rollen, Passkeys, Zwei-Faktor, Anbieter, Anmeldeschutz, Sprache, Entdecken. */
import type { SystemkontoFehler } from '../../../shared/src/systemkonten';
import type { GemerktesPasswort } from '../../../shared/src/entsperren';
import type { UebersetzenAngebot } from '../../../shared/src/uebersetzung';
import type { Abwesenheit, Benutzer, Rolle, Sitzung, Vertretung } from '../../../shared/src/model';
import type { Recht } from '../../../shared/src/rechte';
import type { EntdeckenStand } from '../../../shared/src/entdecken';
import type { Verwaltungsstand } from '../../../shared/src/verwaltungsrecht';
import { anfrage, stilleAnfrage } from './anfrage';
import type { KontaktZuordnung } from './betrieb';

/** Anmeldung über einen Anbieter, OpenID Connect (#241). */
export interface AnbieterEingabe {
  aktiv: boolean; aussteller: string; clientId: string; clientSecret: string; clientSecretLoeschen: boolean; knopf: string;
  anlegen: boolean; standardrolle: Rolle; adminGruppe: string; gruppenClaim: string; lokalNurAdmins: boolean; abmeldenBeimAnbieter: boolean;
}
export type AnbieterStand = Omit<AnbieterEingabe, 'clientSecret' | 'clientSecretLoeschen'> & { secretGesetzt: boolean; rueckkehr: string; abmeldenZurueck: string };
/** Zwei-Faktor-Anmeldung (#242). */
/** `pflicht`: vorgeschrieben und von keinem Passkey erfüllt; `passkeyErfuellt`: vorgeschrieben, ein Passkey erfüllt sie (#811). */
export interface ZweifaktorStand { aktiv: boolean; seit: string | null; codesUebrig: number; pflicht: boolean; passkeyErfuellt?: boolean }
export interface ZweifaktorPflicht { admin: boolean; mitglied: boolean }
/** Passkeys (#811): ein eigener Passkey in Mein Konto → Sicherheit. `passt` = gilt für die Adresse von Ablago. */
export interface Passkey { nr: string; name: string; erstellt: string; zuletzt: string | null; mehrgeraete: boolean; passt: boolean; rpId: string }
/** `pflicht`: Der letzte Passkey ist nötig – wegen der Passkey- oder der Zwei-Faktor-Pflicht (ohne Code-App). */
export interface PasskeyStand { liste: Passkey[]; moeglich: boolean; adresse: string | null; pflicht: 'passkey' | 'zweifaktor' | null; hoechstens: number }
/** `moeglich`: gepflegte HTTPS-Adresse vorhanden – nur dann lässt sich die Pflicht einschalten; `adresse`: deren Origin. */
export type PasskeyPflicht = ZweifaktorPflicht & { moeglich: boolean; adresse: string | null };
/** Optionen und Kennung einer Herausforderung zum Anmelden mit Passkey (Optionen im JSON-Format von WebAuthn). */
export interface PasskeyAnfrage { kennung: string; optionen: PublicKeyCredentialRequestOptionsJSON }
/** Antwort des Geräts mit der Kennung der Herausforderung – so geht sie an den Server. */
export interface PasskeyAntwort { kennung: string; antwort: unknown }
/** Zweiter Schritt der Anmeldung (#242, #811): welche Wege gehen? */
export interface ZweiteWege { code: boolean; passkey: boolean }
/** Sprache für die Oberfläche (#729). */
export interface SprachStatus { sprache: string; standard: string; erlaubt: string[]; maschinell: string[] }
export interface KontoStatus {
  einrichtungNoetig: boolean; mail: boolean; benutzer: Benutzer | null;
  /**
   * Zwei-Faktor (#242): eingerichtet; für die Rolle vorgeschrieben, aber noch nicht eingerichtet (fehlt: erst einrichten;
   * ausstehend: die Sitzung lief schon vor dem Einschalten der Pflicht – weiterarbeiten mit Hinweis, #416).
   */
  zweifaktor?: { aktiv: boolean; fehlt: boolean; ausstehend?: boolean } | null;
  /** Passkeys (#811): gehen sie über diese Adresse (HTTPS)? Angemeldet zusätzlich: eigener vorhanden, Pflicht offen. */
  passkey?: { moeglich: boolean; aktiv?: boolean; fehlt?: boolean; ausstehend?: boolean } | null;
  /** Anmeldung über einen Anbieter (#241), nur ohne Anmeldung. */
  anbieter?: { knopf: string; lokalNurAdmins: boolean } | null;
  /** Gibt es einen Schlüssel, um Passwörter zu speichern (#39, #46)? */
  passwoerterMoeglich?: boolean;
  /** Zeitzone der Region (#726), z. B. Europe/Berlin. */
  zeitzone?: string;
  /** Sprachen (#729): wirksame Sprache, Sprache der Installation, erlaubte und maschinell übersetzte Sprachen. */
  sprachen?: SprachStatus;
  /** Laufwerk eingeschaltet (#720)? */
  laufwerk?: boolean;
  /** Inhalte übersetzen (#732): null = kein Knopf (aus für alle oder kein Paket). */
  uebersetzen?: UebersetzenAngebot | null;
  /** Ein Administrator agiert gerade als dieser Benutzer. */
  vertretung?: { adminName: string; beginn: string } | null;
  /** Wer hat als dieser Benutzer agiert (noch nicht gesehen)? */
  hinweise?: Vertretung[];
  /** Logo und Schriftzug des Standard-Designs (#72) für die Anmeldeseite. */
  marke?: { schriftzug: string | null; logo: string | null } | null;
  /** Wartungsmodus (#102). */
  wartung?: WartungOeffentlich | null;
  /** Wiederherstellung (#107): läuft eine, oder steht eine Abschlussmeldung aus? */
  wiederherstellung?: { laeuft: boolean; abschluss: boolean };
  /** Version der Installation (#111), nur angemeldet. */
  version?: string | null;
  /** Einrichtungsassistent (#119). */
  einrichtung?: EinrichtungStatus | null;
  /** Favoriten benachrichtigen (#506): für diesen Benutzer in der Werkbank erlaubt? */
  favoritenBenachrichtigung?: boolean | null;
  /** Lasttest-Modus (#612): Das DMS misst und zeigt nur die Seite mit Fortschritt und Ergebnis. */
  lasttest?: boolean;
  /** Aufgaben ohne Empfänger (#719): Sieht dieser Benutzer sie (Administrator oder gewählter Alltags-Benutzer)? */
  aufgabenOhneEmpfaenger?: boolean;
  /** Technische Aufgaben (#719): Für die Verwaltung liegt etwas an – nur ja/nein, außerhalb des Verwaltungsmodus. */
  verwaltung?: boolean;
  /** Verwaltungsmodus (#819): darf die Person verwalten, läuft er, Wiedereinstieg mit einem Klick? */
  verwaltungsmodus?: Verwaltungsstand | null;
}
/** Im Verwaltungsmodus angesehen (#820): Werkbank-Liste für „Gesamte Verwaltung“. */
export interface ModusEintrag { id: number; zeit: string; mappeId: string; typId: string | null; benutzerId: string | null; person: string; was: string; titel: string }
export interface AnbindungAnsicht { host: string; port: number; datenbank: string; benutzer: string; passwortGesetzt: boolean }
export interface EinrichtungStatus {
  /** datenbank: noch keine Verbindung (Einrichtungsmodus); startet: gleich da; konto: Mandant und Administrator. */
  phase: 'datenbank' | 'startet' | 'konto';
  code: boolean;
  /** Angemeldeter Administrator: weitere Schritte offen. */
  assistent?: boolean;
  anbindung?: AnbindungAnsicht | null;
  quelle?: 'datei' | 'umgebung' | null;
  fehler?: string | null;
}
/** Wartungsmodus (#102), wie ihn jeder sieht; sekunden = bis zur aktiven Stufe. */
export interface WartungOeffentlich { stufe: 'aus' | 'angekuendigt' | 'aktiv'; text: string; ende: string | null; aktivAb: string | null; sekunden: number | null; ausloeser?: 'speicherplatz' | null }
/** Werkbank → Anmeldeschutz → Notfallzugang (#815). */
export interface NotfallzugangStand { internet: boolean; von: string | null; am: string | null; code: { vorhanden: boolean; erstellt: string | null }; heimnetz: boolean; /** #885: nur bei heimnetz: false */ grund?: 'oeffentlich' | 'proxy' }
/** Benutzer für Namen und Empfängerauswahl; abwesend, solange die Abwesenheit an ist (#78). */
export interface Person { id: string; name: string; aktiv?: boolean; /** Datum der Deaktivierung (#663) */ deaktiviert?: string | null; /** Dienstkonto eines Pakets (#338) bzw. Systemkonto (#673) */ art?: 'dienst' | 'system'; abwesend?: { wirkt: boolean; von: string | null; bis: string | null; vertreter: string } }
/** Werkbank: tägliche Zusammenfassung (#54, #92, #94). */
export interface Zusammenfassung {
  aktiv: boolean; uhrzeit: string | null; tage: number[]; feiertage: boolean;
  standard: { uhrzeit: string; tage: number[]; bundesland: string | null }; versand: boolean;
}
/** Ein Konto, das kein Mensch ist (#673): Systemkonto „Automatisierung“ oder Dienstkonto eines Pakets. */
export interface Systemkonto { id: string; name: string; rolle: 'systemkonto' | 'paket'; aktiv: boolean; systemkonto?: string; paketId?: string; paket?: string | null; automatisierungen: Array<{ id: string; name: string; angehalten?: boolean }>; /** Auffälligkeiten (#817) */ fehler?: SystemkontoFehler; weitreichend?: boolean }
export interface LinkErgebnis { benutzer: Benutzer; mailVerschickt: boolean; link?: string; mailFehler?: string }
export type RechtStufe = 'immer' | 'nie' | 'teils';
/** Exporte aus dem Sicherungsordner verschoben (#797), bis ein Administrator den Hinweis gelesen hat. */
export interface ExportUmzug { am: string; anzahl: number; uebrig: boolean }
export interface VollexportStand {
  ordner: string; frei: number | null;
  /** Export-Ordner (#797): Frist in Tagen, liegt im Sicherungsordner, eigenes Volume, Umzug beim Update. */
  tage: number; imSicherungsordner: boolean; volume: boolean | null; umzug: ExportUmzug | null;
  abschaetzung: { mappen: number; dokumente: number; bytes: number };
  /** `bis`: danach (und nach dem Herunterladen) gelöscht (#797). */
  exporte: Array<{ name: string; erstellt: string | null; bis: string; bytes: number; dateien: number; mappen: number | null; passwoerter: boolean }>;
  kontakte: Array<{ typId: string; typ: string; zuordnung: KontaktZuordnung }>;
  /** Dürfen Benutzer ihre Daten selbst exportieren (#255)? */
  persoenlich: boolean;
}
export interface Diagnose {
  dms: { version: string; commit: string | null; gebaut: string | null }; serverzeit: string; zeitzone: string; node: string; postgres: string | null;
  texterkennung: boolean | null; mail: boolean; benutzer: { name: string; rolle: string }; sitzung: string | null; vertretung: boolean;
}
/** Stufe eines API-Schlüssels; „zaehler“ = nur Zähler (#625). */
export type ApiSchluesselRecht = 'lesen' | 'schreiben' | 'zaehler';
export interface ApiSchluessel { id: string; name: string; praefix: string; recht: ApiSchluesselRecht; passwoerter: boolean; ablauf: string | null; erstellt: string; zuletztBenutzt: string | null }
export interface ApiSchluesselEingabe { name: string; recht: ApiSchluesselRecht; passwoerter: boolean; ablauf: string | null }
/** Anmeldeschutz (#240). */
export interface SperrEinstellung { konto: { versuche: number; minuten: number }; ip: { versuche: number; minuten: number }; ausnahmen: string[]; mail: boolean; mailKonto: boolean }
export interface IpSperre { ip: string; seit: string; bis: string | null; grund: string }
export interface AnmeldeschutzStand { einstellung: SperrEinstellung; gesperrt: IpSperre[]; deineIp: string }

export const kontoApi = {
  status: () => anfrage<KontoStatus>('GET', '/api/konto/status'),
  /** Verwaltungsmodus (#819): beginnen (ohne Angaben: Wiedereinstieg oder frische Anmeldung), beenden, frisch bestätigen. */
  verwaltungBeginnen: (angaben: { passwort?: string; code?: string; passkey?: PasskeyAntwort } = {}) => anfrage<Verwaltungsstand>('POST', '/api/konto/verwaltung', angaben),
  verwaltungBeenden: () => anfrage<Verwaltungsstand>('POST', '/api/konto/verwaltung/beenden'),
  verwaltungBestaetigen: (angaben: { passwort?: string; code?: string; passkey?: PasskeyAntwort }) => anfrage<{ frisch: true }>('POST', '/api/konto/verwaltung/bestaetigen', angaben),
  /** Verwaltungsrecht einer Person (#818): nur mit „Gesamte Verwaltung“ und frischer Anmeldung. */
  verwaltungSetzen: (id: string, verwaltung: string[]) => anfrage<Benutzer>('PUT', `/api/benutzer/${id}/verwaltung`, { verwaltung }),
  imVerwaltungsmodus: () => anfrage<ModusEintrag[]>('GET', '/api/werkbank/verwaltungsmodus'),
  laufwerk: () => anfrage<{ adresse: string; https: boolean; benutzername: string }>('GET', '/api/konto/laufwerk'),
  einrichten: (d: { mandant?: string; email: string; name: string; passwort: string; sprache?: string }) => anfrage<{ benutzer: Benutzer }>('POST', '/api/konto/einrichten', d),
  /** Mit Zwei-Faktor (#242) kommt statt des Benutzers eine Kennung für den zweiten Schritt. */
  anmelden: (d: { email: string; passwort: string }) => anfrage<{ benutzer?: Benutzer; zweiterSchritt?: string; wege?: ZweiteWege }>('POST', '/api/konto/anmelden', d),
  anmeldenCode: (kennung: string, code: string) => anfrage<{ benutzer: Benutzer; wiederherstellung: boolean }>('POST', '/api/konto/anmelden/code', { kennung, code }),
  zweifaktor: () => anfrage<ZweifaktorStand>('GET', '/api/konto/zweifaktor'),
  /** Passkeys (#811): anmelden (ohne E-Mail-Adresse oder als zweiter Schritt), eigene verwalten, Pflicht, Zurücksetzen. */
  passkeyOptionen: (zweiterSchritt?: string) => anfrage<PasskeyAnfrage>('POST', '/api/konto/passkey/optionen', zweiterSchritt ? { zweiterSchritt } : {}),
  passkeyAnmelden: (a: PasskeyAntwort & { zweiterSchritt?: string }) => anfrage<{ benutzer: Benutzer }>('POST', '/api/konto/passkey/anmelden', a),
  passkeys: () => anfrage<PasskeyStand>('GET', '/api/konto/passkeys'),
  passkeyBeginnen: () => anfrage<PublicKeyCredentialCreationOptionsJSON>('POST', '/api/konto/passkeys/beginnen'),
  passkeyHinzufuegen: (antwort: unknown, name: string) => anfrage<Passkey>('POST', '/api/konto/passkeys', { antwort, name }),
  passkeyBenennen: (nr: string, name: string) => anfrage<Passkey[]>('PUT', `/api/konto/passkeys/${encodeURIComponent(nr)}`, { name }),
  passkeyEntfernen: (nr: string) => anfrage<Passkey[]>('DELETE', `/api/konto/passkeys/${encodeURIComponent(nr)}`),
  passkeyBestaetigenOptionen: (fuer?: 'dokumentpasswoerter') => anfrage<PasskeyAnfrage>('POST', '/api/konto/passkeys/bestaetigen/optionen', fuer ? { fuer } : {}),
  passkeyPflicht: () => anfrage<PasskeyPflicht>('GET', '/api/werkbank/passkeys'),
  passkeyPflichtSetzen: (p: Partial<ZweifaktorPflicht>) => anfrage<PasskeyPflicht>('PUT', '/api/werkbank/passkeys', p),
  benutzerPasskeys: (id: string) => anfrage<{ anzahl: number }>('GET', `/api/benutzer/${id}/passkeys`),
  benutzerPasskeysZuruecksetzen: (id: string) => anfrage<null>('POST', `/api/benutzer/${id}/passkeys/zuruecksetzen`),
  zweifaktorBeginnen: () => anfrage<{ geheimnis: string; uri: string }>('POST', '/api/konto/zweifaktor/beginnen'),
  zweifaktorBestaetigen: (code: string) => anfrage<{ codes: string[] }>('POST', '/api/konto/zweifaktor/bestaetigen', { code }),
  zweifaktorCodes: (passwort: string) => anfrage<{ codes: string[] }>('POST', '/api/konto/zweifaktor/codes', { passwort }),
  zweifaktorEntfernen: (passwort: string) => anfrage<null>('POST', '/api/konto/zweifaktor/entfernen', { passwort }),
  zweifaktorPflicht: () => anfrage<ZweifaktorPflicht>('GET', '/api/werkbank/zweifaktor'),
  zweifaktorPflichtSetzen: (p: Partial<ZweifaktorPflicht>) => anfrage<ZweifaktorPflicht>('PUT', '/api/werkbank/zweifaktor', p),
  benutzerZweifaktor: (id: string) => anfrage<Omit<ZweifaktorStand, 'pflicht'>>('GET', `/api/benutzer/${id}/zweifaktor`),
  benutzerZweifaktorZuruecksetzen: (id: string) => anfrage<null>('POST', `/api/benutzer/${id}/zweifaktor/zuruecksetzen`),
  /** Über einen Anbieter angemeldet (#241): Adresse zum Abmelden dort. */
  abmelden: () => anfrage<{ abmelden?: string } | null>('POST', '/api/konto/abmelden'),
  anbieter: () => anfrage<AnbieterStand>('GET', '/api/werkbank/anbieter'),
  anbieterSetzen: (e: Partial<AnbieterEingabe>) => anfrage<AnbieterStand>('PUT', '/api/werkbank/anbieter', e),
  anbieterPruefen: () => anfrage<{ aussteller: string; abmelden: boolean; schluessel: number }>('POST', '/api/werkbank/anbieter/pruefen'),
  passwortVergessen: (email: string) => anfrage<null>('POST', '/api/konto/passwort-vergessen', { email }),
  linkPruefen: (s: string) => anfrage<{ email: string; name: string; zweck: 'einladung' | 'zuruecksetzen' }>('GET', `/api/konto/link/${encodeURIComponent(s)}`),
  passwortSetzen: (schluessel: string, passwort: string) => anfrage<{ benutzer?: Benutzer; zweiterSchritt?: string; wege?: ZweiteWege }>('POST', '/api/konto/passwort-setzen', { schluessel, passwort }),
  personen: () => anfrage<Person[]>('GET', '/api/personen'),
  /* Abwesenheit mit Vertreter (#78) */
  abwesenheit: () => anfrage<{ abwesenheit: Abwesenheit | null; offeneAufgaben: number }>('GET', '/api/konto/abwesenheit'),
  abwesenheitSetzen: (a: Abwesenheit) => anfrage<Benutzer>('PUT', '/api/konto/abwesenheit', a),
  aufgabenAnVertreter: () => anfrage<{ uebergeben: number }>('POST', '/api/konto/abwesenheit/aufgaben-uebergeben'),
  benutzerAbwesenheit: (id: string, a: Abwesenheit) => anfrage<Benutzer>('PUT', `/api/benutzer/${id}/abwesenheit`, a),
  benutzerAufgabenAnVertreter: (id: string) => anfrage<{ uebergeben: number }>('POST', `/api/benutzer/${id}/aufgaben-uebergeben`),
  benutzer: () => anfrage<Benutzer[]>('GET', '/api/benutzer'),
  benutzerAnlegen: (d: { email: string; name: string; rollen?: string[] }) => anfrage<LinkErgebnis>('POST', '/api/benutzer', d),
  benutzerAendern: (id: string, d: Partial<Pick<Benutzer, 'name' | 'aktiv' | 'rollen'>>) => anfrage<Benutzer>('PUT', `/api/benutzer/${id}`, d),
  /** Alle Rollen (Systemrollen zuerst) für die Benutzerverwaltung. */
  rollen: () => anfrage<Array<{ id: string; name: string; system: boolean }>>('GET', '/api/rollen'),
  /** Systemkonten und Dienstkonten der Pakete (#673). */
  systemkonten: () => anfrage<Systemkonto[]>('GET', '/api/benutzer/systemkonten'),
  benutzerLoeschen: (id: string) => anfrage<null>('DELETE', `/api/benutzer/${id}`),
  neuerLink: (id: string) => anfrage<LinkErgebnis>('POST', `/api/benutzer/${id}/link`),
  sitzungen: (id: string) => anfrage<Sitzung[]>('GET', `/api/benutzer/${id}/sitzungen`),
  meineSitzungen: () => anfrage<Sitzung[]>('GET', '/api/konto/sitzungen'),
  /** Passwörter für Dokumente (#827, Mein Konto → Sicherheit). */
  dokumentPasswoerter: () => anfrage<{ eintraege: GemerktesPasswort[]; bestaetigtBis: string | null; max: number; zweifaktor: boolean; passkey?: boolean }>('GET', '/api/konto/dokument-passwoerter'),
  dokumentPasswoerterBestaetigen: (e: { passwort?: string; code?: string; passkey?: PasskeyAntwort }) => anfrage<{ bestaetigtBis: string }>('POST', '/api/konto/dokument-passwoerter/bestaetigen', e),
  dokumentPasswortZeigen: (id: string) => anfrage<{ passwort: string }>('GET', `/api/konto/dokument-passwoerter/${id}`),
  dokumentPasswortAendern: (id: string, e: { name?: string; passwort?: string }) => anfrage<GemerktesPasswort>('PUT', `/api/konto/dokument-passwoerter/${id}`, e),
  dokumentPasswortLoeschen: (id: string) => anfrage<null>('DELETE', `/api/konto/dokument-passwoerter/${id}`),
  meineSitzungBeenden: (sitzung: string) => anfrage<null>('DELETE', `/api/konto/sitzungen/${sitzung}`),
  andereSitzungenBeenden: () => anfrage<{ beendet: number }>('POST', '/api/konto/sitzungen/andere-beenden'),
  sitzungBeenden: (id: string, sitzung: string) => anfrage<null>('DELETE', `/api/benutzer/${id}/sitzungen/${sitzung}`),
  alleSitzungenBeenden: (id: string) => anfrage<{ beendet: number }>('DELETE', `/api/benutzer/${id}/sitzungen`),
  vertreten: (id: string) => anfrage<{ benutzer: Benutzer }>('POST', `/api/benutzer/${id}/vertreten`),
  vertretungBeenden: () => anfrage<{ benutzer: Benutzer | null }>('POST', '/api/konto/vertretung-beenden'),
  hinweiseGesehen: () => anfrage<null>('POST', '/api/konto/hinweise/gesehen'),
  einstellungen: () => anfrage<Record<string, unknown>>('GET', '/api/konto/einstellungen'),
  // Ablago entdecken (#831, #832): Rundgänge, Tipps, Tipp des Tages; gesehen/ausgeblendet je Person.
  entdecken: () => anfrage<EntdeckenStand>('GET', '/api/entdecken'),
  tippHandlung: (schluessel: string, aktion: 'gezeigt' | 'erledigt' | 'ausblenden' | 'einblenden') => anfrage<null>('POST', `/api/entdecken/tipps/${encodeURIComponent(schluessel)}`, { aktion }),
  rundgangMerken: (schluessel: string, stand: 'gesehen' | 'spaeter') => anfrage<null>('POST', `/api/entdecken/rundgaenge/${encodeURIComponent(schluessel)}`, { stand }),
  apiSchluessel: () => anfrage<ApiSchluessel[]>('GET', '/api/konto/api-schluessel'),
  apiSchluesselAnlegen: (d: ApiSchluesselEingabe) => anfrage<ApiSchluessel & { schluessel: string }>('POST', '/api/konto/api-schluessel', d),
  apiSchluesselAendern: (id: string, d: ApiSchluesselEingabe) => anfrage<ApiSchluessel>('PUT', `/api/konto/api-schluessel/${id}`, d),
  apiSchluesselLoeschen: (id: string) => anfrage<null>('DELETE', `/api/konto/api-schluessel/${id}`),
  einstellungSetzen: (schluessel: string, wert: unknown) => anfrage<null>('PUT', `/api/konto/einstellungen/${encodeURIComponent(schluessel)}`, { wert }),
  /** Werkbank (#921): wer außer mir gerade im Verwaltungsmodus ist (Name und Beginn), nur im Verwaltungsmodus. */
  geradeImModus: () => stilleAnfrage<Array<{ name: string; seit: string }>>('/api/werkbank/gerade-im-modus'),
  meineRechte: () => anfrage<Array<{ typId: string; name: string; rechte: Record<Recht, RechtStufe> }>>('GET', '/api/konto/rechte'),
  gesehen: (ids: string[]) => anfrage<null>('POST', '/api/gesehen', { ids }),
  /** Eigene tägliche Zusammenfassung (#92, #94). */
  zusammenfassung: () => anfrage<Zusammenfassung>('GET', '/api/konto/zusammenfassung'),
  zusammenfassungSetzen: (z: { aktiv: boolean; uhrzeit: string | null; tage: number[]; feiertage: boolean }) => anfrage<Zusammenfassung>('PUT', '/api/konto/zusammenfassung', z),
  eigenesUebersetzen: (uebersetzen: boolean) => anfrage<Benutzer>('PUT', '/api/konto/profil', { uebersetzen }),
  /** Texte eines Sprachpakets (#731), auch vor der Anmeldung. */
  sprachTexte: (kennung: string) => anfrage<{ kennung: string; gebietsschema: string; maschinell: boolean; texte: Record<string, Record<string, string>> }>('GET', `/api/sprache/texte/${encodeURIComponent(kennung)}`),
  anmeldeschutz: () => anfrage<AnmeldeschutzStand>('GET', '/api/werkbank/anmeldeschutz'),
  anmeldeschutzSetzen: (e: Partial<SperrEinstellung>) => anfrage<AnmeldeschutzStand>('PUT', '/api/werkbank/anmeldeschutz', e),
  notfallzugang: () => anfrage<NotfallzugangStand>('GET', '/api/werkbank/anmeldeschutz/notfallzugang'),
  notfallzugangSetzen: (internet: boolean) => anfrage<NotfallzugangStand>('PUT', '/api/werkbank/anmeldeschutz/notfallzugang', { internet }),
  entsperren: (ip: string) => anfrage<AnmeldeschutzStand>('POST', '/api/werkbank/anmeldeschutz/entsperren', { ip }),
  // Fehler melden (#70)
  diagnose: () => anfrage<Diagnose>('GET', '/api/konto/diagnose'),
  fehlerMelden: (e: { text: string; angaben: Record<string, unknown>; bilder: Array<{ name: string; daten: string }> }) => anfrage<{ id: string }>('POST', '/api/konto/fehlermeldung', e),
  profil: (name: string) => anfrage<Benutzer>('PUT', '/api/konto/profil', { name }),
  entwicklermodus: (an: boolean) => anfrage<Benutzer>('PUT', '/api/konto/profil', { entwicklermodus: an }),
  /** Eigene Sprache (#729); null = wie die Installation. */
  eigeneSprache: (sprache: string | null) => anfrage<Benutzer>('PUT', '/api/konto/profil', { sprache }),
  emailAendern: (email: string, passwort: string) => anfrage<Benutzer>('PUT', '/api/konto/email', { email, passwort }),
  passwortAendern: (passwortAlt: string, passwortNeu: string) => anfrage<{ benutzer: Benutzer }>('PUT', '/api/konto/passwort', { passwortAlt, passwortNeu }),
  /* Persönlicher Export (#255) */
  meinExport: () => anfrage<{ erlaubt: boolean; laeuft: boolean; fehler: string | null; fertig: VollexportStand['exporte'][number] | null }>('GET', '/api/konto/export'),
  meinExportStarten: (passwoerter: boolean, passwoerterBestaetigt: boolean) => anfrage<{ laeuft: boolean }>('POST', '/api/konto/export', { passwoerter, passwoerterBestaetigt }),
};
