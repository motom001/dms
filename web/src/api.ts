import type { Design } from './design';
import { messung } from './messung';
import type { Nummernkreis } from '../../shared/src/nummernkreis';
import type { Archiv } from '../../shared/src/archiv';
import type { Abwesenheit, Aufgabe, Ausschnitt, Benutzer, Dokument, DokumentVersion, Historieneintrag, Notiz, Mappe, MappenBezug, Mappentyp, OcrStandArt, Pruefergebnis, Rolle, Sitzung, Sortierung, Vertretung, Werte } from '../../shared/src/model';
import type { Feldbedingung, Sicht, SichtDaten } from '../../shared/src/sichten';
import type { Ergebnis, Recht, Rechte, Regelwerk } from '../../shared/src/rechte';
import type { InstalliertesPaket, Katalog } from '../../shared/src/pakete';
import type { Einstellungsbeschreibung } from '../../shared/src/paketeinstellungen';
import type { EigeneAnsicht, WerkbankAnsicht } from '../../shared/src/werkbankansicht';
import type { SichtRechte, SichtRegelwerk, SichtSchritt } from '../../shared/src/sichtrechte';
import type { Anstehend, Erinnerung } from '../../shared/src/fristen';
import { merkeAnfrage } from './diagnose';
import { erreichbarkeit, NICHT_ERREICHBAR } from './erreichbar';
import { istAusfall } from '../../shared/src/erreichbarkeit';

export class ApiFehler extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
  /** Prüfergebnis, wenn der Server Eingaben abgelehnt hat (422). */
  get pruefung(): Pruefergebnis | undefined {
    const d = this.details as Pruefergebnis | undefined;
    return d && Array.isArray(d.allgemein) ? d : undefined;
  }
  get gruende(): string[] {
    const d = this.details as { gruende?: string[] } | undefined;
    return d?.gruende ?? [];
  }
}

/** Wird ausgelöst, wenn der Server die Sitzung nicht (mehr) kennt. */
export const ABGEMELDET = 'dms:abgemeldet';

/** Einrichtungscode (#119): solange das DMS nicht eingerichtet ist, bei jeder Anfrage mitschicken. */
let einrichtungscode: string | null = (() => { try { return sessionStorage.getItem('dms:einrichtungscode'); } catch { return null; } })();
export function setzeEinrichtungscode(c: string | null) {
  einrichtungscode = c;
  try { if (c) sessionStorage.setItem('dms:einrichtungscode', c); else sessionStorage.removeItem('dms:einrichtungscode'); } catch { /* egal */ }
}
export const hatEinrichtungscode = () => !!einrichtungscode;

/** Datei vom Server holen und im Browser speichern (#153) – POST mit JSON, Antwort als Datei. */
export async function speichereDatei(url: string, body: unknown, ersatzname: string): Promise<{ name: string; bytes: number; ausgelassen: number }> {
  let r: Response;
  try {
    r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'x-dms': '1', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch { throw new ApiFehler(0, NICHT_ERREICHBAR); }
  if (!r.ok) {
    const d = await r.json().catch(() => null) as { fehler?: string; details?: unknown } | null;
    throw new ApiFehler(r.status, d?.fehler ?? `Fehler ${r.status}`, d?.details);
  }
  const kopf = r.headers.get('content-disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/i.exec(kopf);
  const name = m ? decodeURIComponent(m[1]) : ersatzname;
  const blob = await r.blob();
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  return { name, bytes: blob.size, ausgelassen: Number(r.headers.get('x-dms-ausgelassen')) || 0 };
}

async function anfrage<T>(methode: string, url: string, body?: unknown): Promise<T> {
  let r: Response;
  const start = performance.now();
  const seite = messung.seite;
  try {
    r = await fetch(url, {
      method: methode,
      credentials: 'same-origin',
      // X-DMS kennzeichnet Anfragen der eigenen Oberfläche (Schutz vor fremden Seiten).
      headers: {
        'x-dms': '1',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(einrichtungscode ? { 'x-einrichtungscode': einrichtungscode } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    erreichbarkeit.ausfall();
    merkeAnfrage(methode, url, 0, NICHT_ERREICHBAR);
    throw new ApiFehler(0, NICHT_ERREICHBAR);
  }
  const kopf = performance.now();
  const daten = r.status === 204 ? null : await r.json().catch(() => null);
  messung.erfasse(seite, methode, url, r, start, kopf, performance.now());
  // Update, Neustart (#122): Antwort vom Proxy statt vom DMS.
  if (istAusfall(r.status, daten)) {
    erreichbarkeit.ausfall();
    merkeAnfrage(methode, url, r.status, NICHT_ERREICHBAR);
    throw new ApiFehler(r.status, NICHT_ERREICHBAR);
  }
  erreichbarkeit.antwort();
  if (r.status === 401 && !url.startsWith('/api/konto/')) dispatchEvent(new Event(ABGEMELDET));
  if (!r.ok) {
    merkeAnfrage(methode, url, r.status, daten?.fehler ?? `Fehler ${r.status}`);
    throw new ApiFehler(r.status, daten?.fehler ?? `Fehler ${r.status}`, daten?.details);
  }
  return daten as T;
}

export interface Rueckverweis { quelleId: string; quelleTypId: string; feldKey: string; titel: string; /** Nicht lesbar (#126): ohne Link. */ verborgen?: boolean }
export type Bezuege = Record<string, MappenBezug>;
export interface Seite { gesamt: number; von: number; mappen: Mappe[]; bezuege: Bezuege; ausschnitte?: Record<string, Ausschnitt>; aufgaben?: Record<string, string>; /** Favoriten des Benutzers unter den Mappen dieser Seite (#62). */ favoriten?: string[] }
/** Texterkennung (#45): Stand, Werkzeuge und Einstellungen für die Werkbank. */
export interface OcrEinstellungen { aktiv: boolean; auftraege: number; maxSeiten: number; maxMB: number; sprachen: string; typen: Record<string, 'tesseract' | 'aus'> }
export interface OcrStatus {
  zaehler: Record<OcrStandArt, number>; laufend: number;
  werkzeuge: { tesseract: string | null; sprachen: string[]; pdftotext: boolean; pdftoppm: boolean };
  einstellungen: OcrEinstellungen; verfahren: Record<string, string>; dateitypen: Record<string, string>;
}
export interface Zaehler {
  typen: Record<string, { anzahl: number; unpassend: number; demo: number }>; eingang: number; sichten?: Record<string, number>;
  /** Eigene Favoriten (#62). */
  favoriten?: number;
  /** Eigene Mappen im Papierkorb (#43); Tage 0 = kein Papierkorb. */
  papierkorb?: number; papierkorbTage?: number;
  /** Post (#192): Id der Sicht „Neue Post“, deren Zahl hervorgehoben wird. */
  neuePost?: string | null;
}
/** Eine Mappe im Papierkorb (#43). */
/** Einzelnes Dokument im Papierkorb (#344). mappe: da · papierkorb (erst die Mappe wiederherstellen) · weg. */
export interface DokumentImKorb {
  id: string; art: 'dokument'; mappeId: string; typId: string; mappeTitel: string; registerKey: string; register: string;
  name: string; mime: string; groesse: number; versionen: number; geloescht: string; geloeschtVon: string | null; mappe: 'da' | 'papierkorb' | 'weg';
}
export interface PapierkorbEintrag {
  id: string; typId: string; titel: string; werte: Werte; demo: boolean;
  erstellt: string; erstelltVon: string | null; geaendert: string; geaendertVon: string | null;
  geloescht: string; geloeschtVon: string | null; dokumente: number;
}
/** Anmeldung über einen Anbieter, OpenID Connect (#241). */
export interface AnbieterEingabe {
  aktiv: boolean; aussteller: string; clientId: string; clientSecret: string; clientSecretLoeschen: boolean; knopf: string;
  anlegen: boolean; standardrolle: Rolle; adminGruppe: string; gruppenClaim: string; lokalNurAdmins: boolean; abmeldenBeimAnbieter: boolean;
}
export type AnbieterStand = Omit<AnbieterEingabe, 'clientSecret' | 'clientSecretLoeschen'> & { secretGesetzt: boolean; rueckkehr: string; abmeldenZurueck: string };
/** Zwei-Faktor-Anmeldung (#242). */
export interface ZweifaktorStand { aktiv: boolean; seit: string | null; codesUebrig: number; pflicht: boolean }
export interface ZweifaktorPflicht { admin: boolean; mitglied: boolean }
export interface KontoStatus {
  einrichtungNoetig: boolean; mail: boolean; benutzer: Benutzer | null;
  /** Zwei-Faktor (#242): eingerichtet; für die Rolle vorgeschrieben, aber noch nicht eingerichtet. */
  zweifaktor?: { aktiv: boolean; fehlt: boolean } | null;
  /** Anmeldung über einen Anbieter (#241), nur ohne Anmeldung. */
  anbieter?: { knopf: string; lokalNurAdmins: boolean } | null;
  /** Gibt es einen Schlüssel, um Passwörter zu speichern (#39, #46)? */
  passwoerterMoeglich?: boolean;
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
}
export interface AnbindungAnsicht { host: string; port: number; datenbank: string; benutzer: string; passwortGesetzt: boolean }
export interface AnbindungEingabe { host: string; port: number; datenbank: string; benutzer: string; passwort: string }
export type AnbindungPruefung = { ok: true; postgres: string; eingerichtet: boolean; benutzer: number } | { ok: false; art: 'nicht_erreichbar' | 'anmeldung' | 'datenbank_fehlt' | 'sonst'; text: string; anlegenMoeglich?: boolean; technisch: string };
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
export type EinrichtungSchritt = 'benutzer' | 'schluessel' | 'optional' | 'fertig';
export interface EinrichtungStand { offen: boolean; erledigt: EinrichtungSchritt[]; uebersprungen: EinrichtungSchritt[]; mandant: string | null }
export interface AnbindungStand { anbindung: AnbindungAnsicht; datei: string; umgebung: 'fehlt' | 'gleich' | 'abweichend'; neustartNoetig: boolean; /** dms-komplett (#208) */ imContainer?: boolean }
/** Wartungsmodus (#102), wie ihn jeder sieht; sekunden = bis zur aktiven Stufe. */
export interface WartungOeffentlich { stufe: 'aus' | 'angekuendigt' | 'aktiv'; text: string; ende: string | null; aktivAb: string | null; sekunden: number | null; ausloeser?: 'speicherplatz' | null }
export interface WartungSitzung { id: string; benutzerId: string; name: string; email: string; rolle: string; geraet: string; ip: string; zuletztAktiv: string; erstellt: string; aktuell: boolean }
/** Sicherungen (#103–#105). */
export interface SicherungsMeta {
  format: number; datei: string; haushaltId: string;
  umgebung: { dms: string; datenbankStand: string | null; postgres: string; node: string; system: string; architektur: string };
  art: 'manuell' | 'automatisch' | 'vor-wiederherstellung'; ausgeloestVon: string; beginn: string; ende: string; dauerSekunden: number;
  anzahl: { mappen: number; dokumente: number; benutzer: number; dateien: number; tabellen: number };
  groessen: { datenbankBytes: number; dateienBytes: number; sicherungBytes: number };
  verschluesselung: { verfahren: string; fingerabdruck: string }; sha256: string; migrationen: string[];
}
export interface SicherungEintrag { name: string; meta: SicherungsMeta | null; bytes: number; pruefung?: { am: string; ok: boolean }; probe?: { am: string; ok: boolean; info: string } }
export interface SicherungsPlan { aktiv: boolean; uhrzeit: string; haeufigkeit: 'taeglich' | 'woechentlich'; wochentag: number; aufbewahrung: { taeglich: number; woechentlich: number; monatlich: number }; mindestFreiGB: number; aktivSeit: string | null }
export interface SicherungsLauf { art: string; titel: string; status: 'laeuft' | 'fertig' | 'fehler'; schritt: string; bytes: number; gesamt: number; gestartet: string; beendet?: string; fehler?: string; ergebnis?: unknown }
export interface Notfallblattstand { am: string | null; von: string | null; fingerabdruck: string | null; aktuell: boolean }
export interface SicherungsZustand {
  letzte: { name: string; ende: string; art: string } | null;
  fehler: { am: string; art: string; grund: string } | null;
  zuAlt: boolean; planAktiv: boolean; notfallblatt: Notfallblattstand; schluessel: boolean;
  /** Aktueller Schlüssel (#47). */
  fingerabdruck?: string | null;
  ort: { ordner: string; volume: boolean | null; gleichePlatte: boolean | null };
  /** Probe-Wiederherstellung (#109). */
  probe?: ProbeStand;
}
export interface SicherungStand {
  lauf: SicherungsLauf | null; liste: SicherungEintrag[]; plan: SicherungsPlan; zustand: SicherungsZustand;
  /** Laufende oder letzte Probe-Wiederherstellung (#109). */
  probe?: WhLauf | null;
  speicher: { dateienBytes: number; dateien: number; datenbankBytes: number; sicherungenBytes: number; anzahl: number; frei: number | null; gesamt: number | null; hochrechnung: { stueck: number; bytes: number }; mindestBytes: number; knapp: boolean };
}
/** Wiederherstellen (#107) und Probe (#109). */
export interface WhSchritt { name: string; status: 'offen' | 'laeuft' | 'ok' | 'fehler' | 'hinweis' | 'ausgelassen'; info?: string }
export interface WhLauf { art: 'wiederherstellung' | 'probe'; sicherung: string; von: string; status: 'laeuft' | 'fertig' | 'fehler' | 'neustart'; schritte: WhSchritt[]; bytes: number; gesamt: number; gestartet: string; beendet?: string; fehler?: string }
export interface WhAbschluss { am: string; sicherung: string; von: string; schritte: WhSchritt[]; hinweise: string[] }
export interface WhAbgleich {
  name: string; meta: SicherungsMeta;
  vergleich: Array<{ was: string; damals: string; heute: string; urteil: 'gleich' | 'ok' | 'hinweis' | 'fehler'; info?: string }>;
  probleme: string[]; hinweise: string[]; schluesselNoetig: boolean;
}
export interface ProbeStand { ampel: 'gruen' | 'gelb' | 'rot' | null; letzte: { name: string; am: string; ok: boolean; info: string } | null; plan: { aktiv: boolean; wochentag: number; uhrzeit: string } }
export interface WartungWerkbank extends WartungOeffentlich { beginn: string | null; von: string | null; sitzungen: WartungSitzung[] }
/** Benutzer für Namen und Empfängerauswahl; abwesend, solange die Abwesenheit an ist (#78). */
export interface Person { id: string; name: string; aktiv?: boolean; abwesend?: { wirkt: boolean; von: string | null; bis: string | null; vertreter: string } }
/** Werkbank: tägliche Zusammenfassung (#54, #92, #94). */
export interface MailEinstellung { aktiv: boolean; uhrzeit: string; bundesland: string | null }
export interface Zusammenfassung {
  aktiv: boolean; uhrzeit: string | null; tage: number[]; feiertage: boolean;
  standard: { uhrzeit: string; tage: number[]; bundesland: string | null }; versand: boolean;
}
export interface LinkErgebnis { benutzer: Benutzer; mailVerschickt: boolean; link?: string; mailFehler?: string }

export const api = {
  status: () => anfrage<KontoStatus>('GET', '/api/konto/status'),
  /* Einrichtungsassistent (#119) */
  einrichtungCode: () => anfrage<{ ok: true }>('POST', '/api/einrichtung/code'),
  einrichtungDbPruefen: (anbindung: AnbindungEingabe) => anfrage<AnbindungPruefung>('POST', '/api/einrichtung/datenbank/pruefen', { anbindung }),
  einrichtungDbAnlegen: (anbindung: AnbindungEingabe) => anfrage<AnbindungPruefung>('POST', '/api/einrichtung/datenbank/anlegen', { anbindung }),
  einrichtungDbUebernehmen: (anbindung: AnbindungEingabe) => anfrage<{ ok: true }>('POST', '/api/einrichtung/datenbank/uebernehmen', { anbindung }),
  einrichtungStand: () => anfrage<EinrichtungStand>('GET', '/api/werkbank/einrichtung'),
  einrichtungSchritt: (schritt: EinrichtungSchritt, uebersprungen = false) => anfrage<EinrichtungStand>('POST', '/api/werkbank/einrichtung/schritt', { schritt, uebersprungen }),
  anbindung: () => anfrage<AnbindungStand>('GET', '/api/werkbank/anbindung'),
  anbindungPruefen: (anbindung: AnbindungEingabe) => anfrage<AnbindungPruefung>('POST', '/api/werkbank/anbindung/pruefen', { anbindung }),
  anbindungSpeichern: (anbindung: AnbindungEingabe, leerBestaetigt = false) => anfrage<AnbindungStand>('PUT', '/api/werkbank/anbindung', { anbindung, leerBestaetigt }),
  neustart: () => anfrage<null>('POST', '/api/werkbank/neustart'),
  wartung: () => anfrage<WartungOeffentlich>('GET', '/api/wartung'),
  sicherung: () => anfrage<SicherungStand>('GET', '/api/werkbank/sicherung'),
  sicherungLauf: () => anfrage<SicherungsLauf | null>('GET', '/api/werkbank/sicherung/lauf'),
  sicherungJetzt: () => anfrage<SicherungsLauf>('POST', '/api/werkbank/sicherung/jetzt'),
  sicherungPlan: (p: Partial<SicherungsPlan>) => anfrage<SicherungsPlan>('PUT', '/api/werkbank/sicherung/plan', p),
  sicherungPruefen: (name: string) => anfrage<SicherungsLauf>('POST', `/api/werkbank/sicherung/${encodeURIComponent(name)}/pruefen`),
  whStatus: () => anfrage<{ lauf: WhLauf | null; abschluss: WhAbschluss | null }>('GET', '/api/wiederherstellung/status'),
  whAbschlussGesehen: () => anfrage<null>('POST', '/api/wiederherstellung/abschluss-gesehen'),
  whSicherungen: () => anfrage<{ art: 'frisch' | 'laufend'; ordner: string; liste: Array<{ name: string; bytes: number; meta: SicherungsMeta | null }> }>('GET', '/api/wiederherstellung/sicherungen'),
  whAbgleich: (name: string, schluessel?: string) => anfrage<WhAbgleich>('POST', '/api/wiederherstellung/abgleich', { name, ...(schluessel ? { schluessel } : {}) }),
  whStart: (d: { name: string; schluessel?: string; bestaetigt?: boolean }) => anfrage<WhLauf>('POST', '/api/wiederherstellung/start', d),
  probeStarten: (name?: string) => anfrage<WhLauf>('POST', '/api/werkbank/sicherung/probe', name ? { name } : {}),
  probeLauf: () => anfrage<WhLauf | null>('GET', '/api/werkbank/sicherung/probe'),
  probePlan: (p: { aktiv?: boolean; wochentag?: number; uhrzeit?: string }) => anfrage<unknown>('PUT', '/api/werkbank/sicherung/probe-plan', p),
  sicherungLoeschen: (name: string) => anfrage<null>('DELETE', `/api/werkbank/sicherung/${encodeURIComponent(name)}`),
  werkbankWartung: () => anfrage<WartungWerkbank>('GET', '/api/werkbank/wartung'),
  wartungEin: (d: { text: string; ende: string | null; vorlauf: number }) => anfrage<unknown>('POST', '/api/werkbank/wartung/ein', d),
  wartungJetzt: () => anfrage<unknown>('POST', '/api/werkbank/wartung/jetzt'),
  wartungAus: () => anfrage<unknown>('POST', '/api/werkbank/wartung/aus'),
  einrichten: (d: { mandant?: string; email: string; name: string; passwort: string }) => anfrage<{ benutzer: Benutzer }>('POST', '/api/konto/einrichten', d),
  /** Mit Zwei-Faktor (#242) kommt statt des Benutzers eine Kennung für den zweiten Schritt. */
  anmelden: (d: { email: string; passwort: string }) => anfrage<{ benutzer?: Benutzer; zweiterSchritt?: string }>('POST', '/api/konto/anmelden', d),
  anmeldenCode: (kennung: string, code: string) => anfrage<{ benutzer: Benutzer; wiederherstellung: boolean }>('POST', '/api/konto/anmelden/code', { kennung, code }),
  zweifaktor: () => anfrage<ZweifaktorStand>('GET', '/api/konto/zweifaktor'),
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
  passwortSetzen: (schluessel: string, passwort: string) => anfrage<{ benutzer?: Benutzer; zweiterSchritt?: string }>('POST', '/api/konto/passwort-setzen', { schluessel, passwort }),

  personen: () => anfrage<Person[]>('GET', '/api/personen'),
  /* Abwesenheit mit Vertreter (#78) */
  abwesenheit: () => anfrage<{ abwesenheit: Abwesenheit | null; offeneAufgaben: number }>('GET', '/api/konto/abwesenheit'),
  abwesenheitSetzen: (a: Abwesenheit) => anfrage<Benutzer>('PUT', '/api/konto/abwesenheit', a),
  aufgabenAnVertreter: () => anfrage<{ uebergeben: number }>('POST', '/api/konto/abwesenheit/aufgaben-uebergeben'),
  benutzerAbwesenheit: (id: string, a: Abwesenheit) => anfrage<Benutzer>('PUT', `/api/benutzer/${id}/abwesenheit`, a),
  benutzerAufgabenAnVertreter: (id: string) => anfrage<{ uebergeben: number }>('POST', `/api/benutzer/${id}/aufgaben-uebergeben`),
  benutzer: () => anfrage<Benutzer[]>('GET', '/api/benutzer'),
  benutzerAnlegen: (d: { email: string; name: string; rolle: Rolle; rollen?: string[] }) => anfrage<LinkErgebnis>('POST', '/api/benutzer', d),
  benutzerAendern: (id: string, d: Partial<Pick<Benutzer, 'name' | 'rolle' | 'aktiv' | 'rollen'>>) => anfrage<Benutzer>('PUT', `/api/benutzer/${id}`, d),
  /** Alle Rollen (Systemrollen zuerst) für die Benutzerverwaltung. */
  rollen: () => anfrage<Array<{ id: string; name: string; system: boolean }>>('GET', '/api/rollen'),
  benutzerLoeschen: (id: string) => anfrage<null>('DELETE', `/api/benutzer/${id}`),
  neuerLink: (id: string) => anfrage<LinkErgebnis>('POST', `/api/benutzer/${id}/link`),
  sitzungen: (id: string) => anfrage<Sitzung[]>('GET', `/api/benutzer/${id}/sitzungen`),
  meineSitzungen: () => anfrage<Sitzung[]>('GET', '/api/konto/sitzungen'),
  meineSitzungBeenden: (sitzung: string) => anfrage<null>('DELETE', `/api/konto/sitzungen/${sitzung}`),
  andereSitzungenBeenden: () => anfrage<{ beendet: number }>('POST', '/api/konto/sitzungen/andere-beenden'),
  sitzungBeenden: (id: string, sitzung: string) => anfrage<null>('DELETE', `/api/benutzer/${id}/sitzungen/${sitzung}`),
  alleSitzungenBeenden: (id: string) => anfrage<{ beendet: number }>('DELETE', `/api/benutzer/${id}/sitzungen`),
  vertreten: (id: string) => anfrage<{ benutzer: Benutzer }>('POST', `/api/benutzer/${id}/vertreten`),
  vertretungBeenden: () => anfrage<{ benutzer: Benutzer | null }>('POST', '/api/konto/vertretung-beenden'),
  hinweiseGesehen: () => anfrage<null>('POST', '/api/konto/hinweise/gesehen'),

  typen: () => anfrage<Mappentyp[]>('GET', '/api/typen'),
  typAnlegen: (t: unknown) => anfrage<Mappentyp>('POST', '/api/typen', t),
  typAendern: (id: string, t: unknown) => anfrage<Mappentyp>('PUT', `/api/typen/${id}`, t),
  typLoeschen: (id: string) => anfrage<null>('DELETE', `/api/typen/${id}`),
  /** Eine Seite einer Sicht („eingang“, Sicht- oder Typ-Id; „link“ mit den Parametern eines sprechenden Links, #98). */
  seite: (sicht: string, von = 0, anzahl = 100, suche = '', sortierung?: Sortierung | null, volltext = false, notizen = false, link?: string, eigene?: Werte) =>
    anfrage<Seite>('GET', `/api/mappen?${new URLSearchParams({
      sicht, ...(link !== undefined ? { link } : {}), ...(eigene ? { eigene: JSON.stringify(eigene) } : {}), von: String(von), anzahl: String(anzahl), ...(suche ? { suche } : {}), ...(suche && volltext ? { volltext: 'true' } : {}), ...(suche && notizen ? { notizen: 'true' } : {}),
      ...(sortierung ? { sortierung: sortierung.spalte, absteigend: String(sortierung.absteigend) } : {}),
    })}`),
  /** Alle Treffer einer Sicht als Ids (#149) – mit derselben Suche wie die Liste. */
  auswahl: (sicht: string, suche = '', volltext = false, notizen = false, link?: string) =>
    anfrage<{ ids: string[]; gesamt: number }>('GET', `/api/mappen/auswahl?${new URLSearchParams({
      sicht, ...(link !== undefined ? { link } : {}), ...(suche ? { suche } : {}), ...(suche && volltext ? { volltext: 'true' } : {}), ...(suche && notizen ? { notizen: 'true' } : {}),
    })}`),
  /** Mehrere Mappen löschen (#150); probe = nur zählen. */
  mappenLoeschen: (ids: string[], probe = false) =>
    anfrage<{ mappen: number; dokumente: number; geloescht: number; ausgelassen: Array<{ id: string; titel: string; grund: string }> }>('POST', '/api/mappen/loeschen', { ids, probe }),
  einstellungen: () => anfrage<Record<string, unknown>>('GET', '/api/konto/einstellungen'),
  designs: () => anfrage<{ designs: Design[]; standard: string | null }>('GET', '/api/designs'),
  apiSchluessel: () => anfrage<ApiSchluessel[]>('GET', '/api/konto/api-schluessel'),
  apiSchluesselAnlegen: (d: ApiSchluesselEingabe) => anfrage<ApiSchluessel & { schluessel: string }>('POST', '/api/konto/api-schluessel', d),
  apiSchluesselAendern: (id: string, d: ApiSchluesselEingabe) => anfrage<ApiSchluessel>('PUT', `/api/konto/api-schluessel/${id}`, d),
  apiSchluesselLoeschen: (id: string) => anfrage<null>('DELETE', `/api/konto/api-schluessel/${id}`),
  openapi: () => anfrage<Record<string, unknown>>('GET', '/api/openapi.json'),
  designAnlegen: (d: Omit<Design, 'id'>) => anfrage<Design>('POST', '/api/designs', d),
  designAendern: (id: string, d: Omit<Design, 'id'>) => anfrage<Design>('PUT', `/api/designs/${id}`, d),
  designLoeschen: (id: string) => anfrage<null>('DELETE', `/api/designs/${id}`),
  designLogo: async (id: string, f: File) => {
    const r = await fetch(`/api/designs/${id}/logo`, { method: 'PUT', credentials: 'same-origin', headers: { 'x-dms': '1', 'content-type': 'application/octet-stream' }, body: f });
    const daten = await r.json().catch(() => null);
    if (istAusfall(r.status, daten)) { erreichbarkeit.ausfall(); throw new ApiFehler(r.status, NICHT_ERREICHBAR); }
    if (!r.ok) throw new ApiFehler(r.status, daten?.fehler ?? `Fehler ${r.status}`);
    return daten as Design;
  },
  designLogoEntfernen: (id: string) => anfrage<Design>('DELETE', `/api/designs/${id}/logo`),
  designStandard: (id: string) => anfrage<{ designs: Design[]; standard: string | null }>('PUT', '/api/designs-standard', { id }),
  einstellungSetzen: (schluessel: string, wert: unknown) => anfrage<null>('PUT', `/api/konto/einstellungen/${encodeURIComponent(schluessel)}`, { wert }),
  sichten: () => anfrage<Zaehler>('GET', '/api/sichten'),
  /* Sichten verwalten (#38) */
  sichtDefinitionen: () => anfrage<Sicht[]>('GET', '/api/sichten/definitionen'),
  sichtAnlegen: (s: Partial<SichtDaten>) => anfrage<Sicht>('POST', '/api/sichten/definitionen', s),
  sichtAendern: (id: string, s: Partial<SichtDaten>) => anfrage<Sicht>('PUT', `/api/sichten/definitionen/${id}`, s),
  sichtLoeschen: (id: string) => anfrage<null>('DELETE', `/api/sichten/definitionen/${id}`),
  /** Drag & Drop (#73): unter elternId an die Stelle stelle (0 = zuerst). */
  sichtVerschieben: (id: string, elternId: string | null, stelle: number) => anfrage<Sicht[]>('POST', `/api/sichten/definitionen/${id}/verschieben`, { elternId, stelle }),
  sichtenOrdnen: (elternId: string | null, ids: string[]) => anfrage<Sicht[]>('PUT', '/api/sichten/reihenfolge', { elternId, ids }),
  sichtVorschau: (id: string | null, sicht: Partial<SichtDaten>) => anfrage<{ anzahl: number }>('POST', '/api/sichten/vorschau', { id, sicht }),
  belegung: (typId: string) => anfrage<Record<string, number>>('GET', `/api/typen/${typId}/belegung`),
  mappe: (id: string) => anfrage<MappeDetails>('GET', `/api/mappen/${id}`),
  /* Berechtigungen (#123–#127) */
  rechteVorschau: (id: string, werte: unknown) => anfrage<Rechte>('POST', `/api/mappen/${id}/rechte-vorschau`, { werte }),
  meineRechte: () => anfrage<Array<{ typId: string; name: string; rechte: Record<Recht, RechtStufe> }>>('GET', '/api/konto/rechte'),
  berechtigungen: () => anfrage<BerechtigungEintrag[]>('GET', '/api/werkbank/berechtigungen'),
  berechtigungenSetzen: (typId: string, berechtigungen: Regelwerk, bestaetigt = false) => anfrage<{ typ: Mappentyp; niemand: number }>('PUT', `/api/werkbank/berechtigungen/${typId}`, { berechtigungen, bestaetigt }),
  regelKopieren: (typId: string, regelId: string, ziele: string[]) => anfrage<{ kopiert: number; ausgelassen: number }>('POST', `/api/werkbank/berechtigungen/${typId}/kopieren`, { regelId, ziele }),
  testlauf: (e: { mappeId: string; benutzerId: string; berechtigungen?: Regelwerk }) => anfrage<Testlauf>('POST', '/api/werkbank/berechtigungen/testlauf', e),
  /** Testlauf an einer Sicht (#148), auch mit ungespeicherten Regeln und Elternsicht. */
  sichtTestlauf: (e: { sichtId: string | null; benutzerId: string; elternId: string | null; berechtigungen: SichtRegelwerk | null }) =>
    anfrage<{ admin: boolean; benutzer: { id: string; name: string }; kette: Array<{ sicht: string; name: string; untersicht: boolean; grund: SichtRechte | null; spur: SichtSchritt[]; eigene: SichtRechte; stand: SichtRechte }>; wirksam?: SichtRechte }>('POST', '/api/werkbank/sichten/testlauf', e),
  wasSieht: (benutzerId: string) => anfrage<{ admin: boolean; typen: Array<{ typId: string; name: string; gesamt: number; lesbar: number; beispiele: Array<{ id: string; titel: string }> }> }>('GET', `/api/werkbank/berechtigungen/sicht/${benutzerId}`),
  /** Verweisende Mappen eines Typs über ein Feld, vollständig (Tabelle im Verknüpfungsregister, #75). */
  verweisende: (id: string, typ: string, feld: string) => anfrage<{ gesamt: number; mappen: Mappe[]; bezuege: Bezuege }>('GET', `/api/mappen/${id}/verweisende?${new URLSearchParams({ typ, feld })}`),
  favorit: (id: string, an: boolean) => anfrage<null>(an ? 'PUT' : 'DELETE', `/api/mappen/${id}/favorit`),
  mappeAnlegen: (m: unknown) => anfrage<Mappe & { hinweis?: string }>('POST', '/api/mappen', m),
  mappeAendern: (id: string, m: unknown) => anfrage<Mappe & { hinweis?: string }>('PUT', `/api/mappen/${id}`, m),
  mappeLoeschen: (id: string) => anfrage<null>('DELETE', `/api/mappen/${id}`),
  /* Volltext und Texterkennung (#45) */
  volltext: (id: string) => anfrage<{ id: string; name: string; text: string | null }>('GET', `/api/dokumente/${id}/volltext`),
  texterkennungErneut: (id: string) => anfrage<Dokument>('POST', `/api/dokumente/${id}/texterkennung`),
  texterkennung: (werkzeugeNeu = false) => anfrage<OcrStatus>('GET', `/api/werkbank/texterkennung${werkzeugeNeu ? '?neu' : ''}`),
  texterkennungSpeichern: (e: Partial<OcrEinstellungen>) => anfrage<OcrStatus>('PUT', '/api/werkbank/texterkennung', e),
  volltextNachholen: () => anfrage<{ eingereiht: number }>('POST', '/api/werkbank/wartung/volltext'),
  vorschauNachholen: () => anfrage<{ eingereiht: number }>('POST', '/api/werkbank/wartung/vorschau'),
  /* Papierkorb (#43): Ablage = eigener, Werkbank = alle */
  papierkorb: () => anfrage<PapierkorbEintrag[]>('GET', '/api/papierkorb'),
  papierkorbWerkbank: () => anfrage<{ tage: number; historieTage: number; eintraege: PapierkorbEintrag[]; dokumente?: DokumentImKorb[] }>('GET', '/api/werkbank/papierkorb'),
  /** Einzelne Dokumente im Papierkorb (#344). */
  papierkorbDokumente: () => anfrage<DokumentImKorb[]>('GET', '/api/papierkorb/dokumente'),
  dokumentWiederherstellen: (id: string, werkbank = false) => anfrage<{ dokument: Dokument; typId: string }>('POST', `/api/${werkbank ? 'werkbank/' : ''}papierkorb/dokumente/${id}/wiederherstellen`),
  dokumentEndgueltig: (id: string, werkbank = false) => anfrage<{ geloescht: number }>('DELETE', `/api/${werkbank ? 'werkbank/' : ''}papierkorb/dokumente/${id}`),
  papierkorbEintrag: (id: string, werkbank = false) => anfrage<PapierkorbEintrag>('GET', `/api/${werkbank ? 'werkbank/' : ''}papierkorb/${id}`),
  wiederherstellen: (id: string, werkbank = false) => anfrage<{ mappe: Mappe; verweiseEntfallen: number; hinweis?: string }>('POST', `/api/${werkbank ? 'werkbank/' : ''}papierkorb/${id}/wiederherstellen`),
  endgueltigLoeschen: (id: string, werkbank = false) => anfrage<{ geloescht: number }>('DELETE', `/api/${werkbank ? 'werkbank/' : ''}papierkorb/${id}`),
  papierkorbLeeren: (werkbank = false) => anfrage<{ geloescht: number }>('DELETE', `/api/${werkbank ? 'werkbank/' : ''}papierkorb`),
  emailBereit: () => anfrage<{ bereit: boolean }>('GET', '/api/email/bereit'),
  /** Post (#192): anlegen (Dokumente danach mit ladeHoch) und einer Mappe zuordnen. */
  postAnlegen: (e: { betreff?: string; fuer?: string | null }) => anfrage<Mappe>('POST', '/api/post', e),
  zuordnen: (postId: string, e: { ziel: string; register?: string; dokumente?: string[]; kopieren?: boolean }) =>
    anfrage<{ post: Mappe; ziel: Mappe }>('POST', `/api/mappen/${postId}/zuordnen`, e),
  emailSenden: (mappeId: string, e: { an: string; betreff: string; nachricht: string; dokumente: string[] }) => anfrage<{ id: string; typId: string }>('POST', `/api/mappen/${mappeId}/email`, e),
  papierkorbTage: (e: { tage?: number; historieTage?: number }) => anfrage<{ tage: number; geleert: number; historieTage: number }>('PUT', '/api/werkbank/papierkorb/einstellungen', e),
  /* Aufgaben (#54) */
  aufgabeAnlegen: (mappeId: string, empfaengerId: string, text: string) => anfrage<Aufgabe & { hinweis?: string }>('POST', `/api/mappen/${mappeId}/aufgaben`, { empfaengerId, text }),
  /** Mit folgetermin bei wiederkehrenden Fristen (#130). */
  aufgabeErledigt: (id: string) => anfrage<Aufgabe & { folgetermin?: string }>('POST', `/api/aufgaben/${id}/erledigt`),
  folgetermin: (id: string) => anfrage<Mappe & { hinweis?: string }>('POST', `/api/aufgaben/${id}/folgetermin`),
  /* Fristen und Erinnerungen (#129–#132) */
  /** Startseite (#334): zuletzt geöffnete Mappen und ob es schon eigene Mappen gibt. */
  startseite: () => anfrage<{ zuletzt: Array<{ id: string; typId: string; titel: string }>; leer: boolean }>('GET', '/api/startseite'),
  anstehend: (tage?: number) => anfrage<{ tage: number; eintraege: Anstehend[] }>('GET', `/api/anstehend${tage === undefined ? '' : `?tage=${tage}`}`),
  erinnerungAnlegen: (mappeId: string, e: { datum: string; text: string; empfaengerId?: string }) => anfrage<Erinnerung & { hinweis?: string }>('POST', `/api/mappen/${mappeId}/erinnerungen`, e),
  erinnerungAendern: (id: string, e: { datum: string; text: string; empfaengerId?: string }) => anfrage<Erinnerung & { hinweis?: string }>('PUT', `/api/erinnerungen/${id}`, e),
  erinnerungLoeschen: (id: string) => anfrage<null>('DELETE', `/api/erinnerungen/${id}`),
  aufgabeDelegieren: (id: string, empfaengerId: string) => anfrage<Aufgabe & { hinweis?: string }>('POST', `/api/aufgaben/${id}/delegieren`, { empfaengerId }),
  aufgabenWerkbank: (erledigt = false) => anfrage<{ aufgaben: Aufgabe[]; mail: MailEinstellung | null; unlesbar?: string[] }>('GET', `/api/werkbank/aufgaben${erledigt ? '?erledigt' : ''}`),
  aufgabenMailSpeichern: (e: MailEinstellung) => anfrage<MailEinstellung>('PUT', '/api/werkbank/aufgaben/mail', e),
  /** Eigene tägliche Zusammenfassung (#92, #94). */
  zusammenfassung: () => anfrage<Zusammenfassung>('GET', '/api/konto/zusammenfassung'),
  zusammenfassungSetzen: (z: { aktiv: boolean; uhrzeit: string | null; tage: number[]; feiertage: boolean }) => anfrage<Zusammenfassung>('PUT', '/api/konto/zusammenfassung', z),
  aufgabenMailSenden: () => anfrage<{ verschickt: number }>('POST', '/api/werkbank/aufgaben/mail/senden'),
  notizAnlegen: (mappeId: string, text: string) => anfrage<Notiz>('POST', `/api/mappen/${mappeId}/notizen`, { text }),
  notizAendern: (id: string, text: string) => anfrage<Notiz>('PUT', `/api/notizen/${id}`, { text }),
  notizLoeschen: (id: string) => anfrage<null>('DELETE', `/api/notizen/${id}`),
  historie: (mappeId: string) => anfrage<Historieneintrag[]>('GET', `/api/mappen/${mappeId}/historie`),
  /** Passwortfeld anzeigen (#46); steht im Protokoll. */
  passwortAnzeigen: (mappeId: string, feld: string) => anfrage<{ wert: string }>('POST', `/api/mappen/${mappeId}/passwoerter/${encodeURIComponent(feld)}`),
  beispiele: () => anfrage<null>('POST', '/api/beispiele'),
  demoUebersicht: () => anfrage<Array<{ typId: string; name: string; demo: number; gesamt: number }>>('GET', '/api/werkbank/demo'),
  demoErzeugen: (o: DemoOptionen) => anfrage<Auftrag>('POST', '/api/werkbank/demo', o),
  demoAbschaetzung: (o: DemoOptionen) => anfrage<DemoAbschaetzung>('POST', '/api/werkbank/demo/abschaetzung', o),
  demoEntfernen: () => anfrage<Auftrag>('DELETE', '/api/werkbank/demo'),
  auftrag: () => anfrage<Auftrag | null>('GET', '/api/werkbank/auftrag'),
  /** Auswahlfilter (#172, #173): welche gewählten Mappen passen zu den aktuellen Werten nicht? */
  auswahlPruefen: (typId: string, feldKey: string, ids: string[], werte: Werte) => anfrage<{ unpassend: string[] }>('POST', '/api/mappen/auswahl-pruefen', { typId, feldKey, ids, werte }),
  /** Auswahlfilter am Referenzfeld (#172): wie viele Mappen passen? */
  auswahlZaehlen: (zielTyp: string, bedingungen: Feldbedingung[]) => anfrage<{ passen: number; gesamt: number; probleme: string[] }>('POST', '/api/werkbank/auswahlfilter/zaehlen', { zielTyp, bedingungen }),
  /* Nummernkreise (#171) */
  nummernkreise: () => anfrage<NummernkreisAnsicht[]>('GET', '/api/werkbank/nummernkreise'),
  /* Paketverwaltung (#188, #189) */
  // Ansicht der Werkbank (#281)
  werkbankAnsicht: () => anfrage<WerkbankAnsichtStand>('GET', '/api/werkbank/ansicht'),
  setzeWerkbankAnsicht: (e: { installation?: WerkbankAnsicht; eigene?: EigeneAnsicht }) => anfrage<WerkbankAnsichtStand>('PUT', '/api/werkbank/ansicht', e),
  pakete: () => anfrage<{ installiert: Array<InstalliertesPaket & { einstellungenNoetig?: boolean }>; katalogUrl: string; quellen: PaketQuelle[]; dms: string }>('GET', '/api/werkbank/pakete'),
  paketKatalog: (alle: boolean) => anfrage<{ kataloge: Array<{ url: string; offiziell: boolean; katalog: Katalog | null; fehler: string | null }>; abgerufen: string }>('POST', '/api/werkbank/pakete/katalog', { alle }),
  paketQuelleHinzu: (url: string) => anfrage<PaketQuelle[]>('POST', '/api/werkbank/pakete/quellen', { url }),
  paketQuelleSchalten: (url: string, aktiv: boolean) => anfrage<PaketQuelle[]>('PUT', '/api/werkbank/pakete/quellen', { url, aktiv }),
  paketQuelleEntfernen: (url: string) => anfrage<PaketQuelle[]>('DELETE', `/api/werkbank/pakete/quellen?${new URLSearchParams({ url })}`),
  paketHochladen: (datei: File) => sendeDatei('/api/werkbank/pakete/hochladen', datei) as Promise<{ upload: string; vorschau: PaketVorschau }>,
  paketVorschau: (e: { id?: string; version?: string; quelle?: string; upload?: string }) => anfrage<PaketVorschau>('POST', '/api/werkbank/pakete/vorschau', e),
  paketInstallieren: (e: { id?: string; version?: string; quelle?: string; upload?: string; bestaetigt?: boolean; namen?: Record<string, string>; sichtNamen?: Record<string, string>; beispiele?: boolean; mitAbhaengigkeiten?: boolean }) => anfrage<InstalliertesPaket>('POST', '/api/werkbank/pakete/installieren', e),
  paketUpdates: () => anfrage<Array<{ id: string; installiert: string; neu: string; changelog: string | null; quelle: string }>>('POST', '/api/werkbank/pakete/updates'),
  paketAktualisieren: (id: string, version?: string, bestaetigt?: boolean) => anfrage<InstalliertesPaket>('POST', `/api/werkbank/pakete/${encodeURIComponent(id)}/aktualisieren`, { version, bestaetigt }),
  paketEntfernen: (id: string, einstellungenBehalten = false) => anfrage<void>('DELETE', `/api/werkbank/pakete/${encodeURIComponent(id)}${einstellungenBehalten ? '?einstellungenBehalten=1' : ''}`),
  paketEinstellungen: (id: string) => anfrage<PaketEinstellungenStand>('GET', `/api/werkbank/pakete/${encodeURIComponent(id)}/einstellungen`),
  paketEinstellungenSpeichern: (id: string, werte: Record<string, unknown>) => anfrage<PaketEinstellungenStand>('PUT', `/api/werkbank/pakete/${encodeURIComponent(id)}/einstellungen`, { werte }),
  paketAktion: (id: string, aktion: string) => anfrage<{ ok: boolean; text: string }>('POST', `/api/werkbank/pakete/${encodeURIComponent(id)}/aktionen/${encodeURIComponent(aktion)}`),
  nummernkreisAnlegen: (k: NummernkreisEingabe) => anfrage<NummernkreisAnsicht[]>('POST', '/api/werkbank/nummernkreise', k),
  nummernkreisAendern: (s: string, k: Omit<NummernkreisEingabe, 'schluessel'>) => anfrage<NummernkreisAnsicht[]>('PUT', `/api/werkbank/nummernkreise/${encodeURIComponent(s)}`, k),
  nummernkreisLoeschen: (s: string) => anfrage<NummernkreisAnsicht[]>('DELETE', `/api/werkbank/nummernkreise/${encodeURIComponent(s)}`),
  nummernkreisZaehler: (s: string, naechster: number) => anfrage<NummernkreisAnsicht[]>('POST', `/api/werkbank/nummernkreise/${encodeURIComponent(s)}/zaehler`, { naechster }),
  nummernVorschau: (typId: string, feldKey: string) => anfrage<{ anzahl: number; von: string | null; bis: string | null }>('GET', `/api/werkbank/wartung/nummern?typ=${encodeURIComponent(typId)}&feld=${encodeURIComponent(feldKey)}`),
  nummernNachtragen: (typId: string, feldKey: string) => anfrage<Auftrag>('POST', '/api/werkbank/wartung/nummern', { typId, feldKey }),
  protokoll: (f: Record<string, string | number | undefined>) =>
    anfrage<ProtokollAntwort>('GET', `/api/werkbank/protokoll?${new URLSearchParams(Object.entries(f).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]))}`),
  debug: (an: boolean) => anfrage<DebugStand>('PUT', '/api/werkbank/debug', { an }),
  datenbank: () => anfrage<DatenbankStand>('GET', '/api/werkbank/datenbank'),
  system: () => anfrage<Systemuebersicht>('GET', '/api/werkbank/system'),
  speicherplatz: () => anfrage<SpeicherplatzStand>('GET', '/api/werkbank/speicherplatz'),
  eingangsordner: () => anfrage<EingangStand>('GET', '/api/werkbank/eingangsordner'),
  postfaecher: () => anfrage<PostfachAnsicht[]>('GET', '/api/werkbank/postfaecher'),
  anmeldeschutz: () => anfrage<AnmeldeschutzStand>('GET', '/api/werkbank/anmeldeschutz'),
  anmeldeschutzSetzen: (e: Partial<SperrEinstellung>) => anfrage<AnmeldeschutzStand>('PUT', '/api/werkbank/anmeldeschutz', e),
  entsperren: (ip: string) => anfrage<AnmeldeschutzStand>('POST', '/api/werkbank/anmeldeschutz/entsperren', { ip }),
  postfachAnlegen: (p: PostfachEingabe) => anfrage<PostfachAnsicht[]>('POST', '/api/werkbank/postfaecher', p),
  postfachAendern: (id: string, p: PostfachEingabe) => anfrage<PostfachAnsicht[]>('PUT', `/api/werkbank/postfaecher/${id}`, p),
  postfachLoeschen: (id: string) => anfrage<void>('DELETE', `/api/werkbank/postfaecher/${id}`),
  postfachTesten: (p: PostfachEingabe & { id?: string }) => anfrage<{ ok: boolean; text: string; ordner?: string[]; anzahl?: number }>('POST', '/api/werkbank/postfaecher/testen', p),
  postfachAbrufen: (id: string) => anfrage<{ uebernommen: number }>('POST', `/api/werkbank/postfaecher/${id}/abrufen`),
  eingangsordnerSetzen: (e: Partial<EingangEinstellung>) => anfrage<EingangStand>('PUT', '/api/werkbank/eingangsordner', e),
  eingangsordnerPruefen: () => anfrage<{ uebernommen: number; stand: EingangStand }>('POST', '/api/werkbank/eingangsordner/pruefen'),
  speicherplatzSetzen: (e: SpeicherplatzEinstellung) => anfrage<SpeicherplatzStand>('PUT', '/api/werkbank/speicherplatz', e),
  versionsabgleich: (browser: Record<string, string>) => anfrage<Vergleich[]>('POST', '/api/werkbank/system/abgleich', { browser }),
  datenbankEinstellen: (e: MessEinstellungen) => anfrage<MessEinstellungen>('PUT', '/api/werkbank/datenbank', e),
  /* E-Mail-Versand und Adresse des DMS (#37) */
  tresor: () => anfrage<TresorStatus>('GET', '/api/werkbank/tresor'),
  uebersicht: () => anfrage<WerkbankUebersicht>('GET', '/api/werkbank/uebersicht'),
  // Fehler melden (#70)
  diagnose: () => anfrage<Diagnose>('GET', '/api/konto/diagnose'),
  fehlerMelden: (e: { text: string; angaben: Record<string, unknown>; bilder: Array<{ name: string; daten: string }> }) => anfrage<{ id: string }>('POST', '/api/konto/fehlermeldung', e),
  fehlermeldungen: (erledigt = false) => anfrage<Fehlermeldung[]>('GET', `/api/werkbank/fehlermeldungen${erledigt ? '?erledigt' : ''}`),
  fehlermeldung: (id: string) => anfrage<Fehlermeldung>('GET', `/api/werkbank/fehlermeldungen/${id}`),
  fehlermeldungErledigt: (id: string, erledigt: boolean) => anfrage<Fehlermeldung>('POST', `/api/werkbank/fehlermeldungen/${id}/erledigt`, { erledigt }),
  fehlermeldungLoeschen: (id: string) => anfrage<void>('DELETE', `/api/werkbank/fehlermeldungen/${id}`),
  // Aufträge der Texterkennung (#61)
  ocrAuftraege: (stand: string, von = 0) => anfrage<{ gesamt: number; eintraege: Array<{ dokument: Dokument; mappeTitel: string; typId: string }> }>('GET', `/api/werkbank/texterkennung/auftraege?stand=${stand}&von=${von}&anzahl=100`),
  ocrNeu: (ids: string[]) => anfrage<{ eingereiht: number }>('POST', '/api/werkbank/texterkennung/auftraege/neu', { ids }),
  ocrFehlerNeu: () => anfrage<{ eingereiht: number }>('POST', '/api/werkbank/texterkennung/auftraege/fehler-neu'),
  ocrAbbrechen: (ids: string[]) => anfrage<{ abgebrochen: number }>('POST', '/api/werkbank/texterkennung/auftraege/abbrechen', { ids }),
  tresorErzeugen: () => anfrage<TresorStatus>('POST', '/api/werkbank/tresor/erzeugen'),
  /** Schlüssel wechseln (#47). */
  tresorWechseln: () => anfrage<TresorStatus & { alt: string; neu: string; umgeschluesselt: number; unlesbar: number; alteSicherungen: number }>('POST', '/api/werkbank/tresor/wechseln', { bestaetigt: true }),
  betrieb: () => anfrage<BetriebAnsicht>('GET', '/api/werkbank/betrieb'),
  mailSpeichern: (m: MailEingabe) => anfrage<BetriebAnsicht>('PUT', '/api/werkbank/betrieb/mail', m),
  adresseSpeichern: (adresse: string) => anfrage<BetriebAnsicht>('PUT', '/api/werkbank/betrieb/adresse', { adresse }),
  mailPruefen: (m: MailEingabe) => anfrage<Probe>('POST', '/api/werkbank/betrieb/mail/pruefen', m),
  testmail: (m: MailEingabe, an: string) => anfrage<Probe>('POST', '/api/werkbank/betrieb/mail/testmail', { mail: m, an }),
  profil: (name: string) => anfrage<Benutzer>('PUT', '/api/konto/profil', { name }),
  entwicklermodus: (an: boolean) => anfrage<Benutzer>('PUT', '/api/konto/profil', { entwicklermodus: an }),
  emailAendern: (email: string, passwort: string) => anfrage<Benutzer>('PUT', '/api/konto/email', { email, passwort }),
  passwortAendern: (passwortAlt: string, passwortNeu: string) => anfrage<{ benutzer: Benutzer }>('PUT', '/api/konto/passwort', { passwortAlt, passwortNeu }),
  dokumentLoeschen: (id: string) => anfrage<null>('DELETE', `/api/dokumente/${id}`),
  /* Vollexport (#254) */
  vollexport: () => anfrage<VollexportStand>('GET', '/api/werkbank/export'),
  vollexportStarten: (o: { passwoerter: boolean; passwoerterBestaetigt: boolean; protokolle: boolean; kontakte: Record<string, KontaktZuordnung> }) => anfrage<Auftrag>('POST', '/api/werkbank/export', o),
  vollexportPruefen: (name: string) => anfrage<{ ok: boolean; dateien: number; fehlend: string[]; abweichend: string[] }>('POST', `/api/werkbank/export/${encodeURIComponent(name)}/pruefen`),
  vollexportLoeschen: (name: string) => anfrage<null>('DELETE', `/api/werkbank/export/${encodeURIComponent(name)}`),
  /* Persönlicher Export (#255) */
  meinExport: () => anfrage<{ erlaubt: boolean; laeuft: boolean; fehler: string | null; fertig: VollexportStand['exporte'][number] | null }>('GET', '/api/konto/export'),
  meinExportStarten: (passwoerter: boolean, passwoerterBestaetigt: boolean) => anfrage<{ laeuft: boolean }>('POST', '/api/konto/export', { passwoerter, passwoerterBestaetigt }),
  persoenlicherExport: (erlaubt: boolean) => anfrage<{ erlaubt: boolean }>('PUT', '/api/werkbank/export/persoenlich', { erlaubt }),
  /* Archivmodus (#212) */
  archivVorschau: (typId: string, archiv: Archiv) => anfrage<{ mappen: number; darfWeg: number }>('POST', '/api/werkbank/archiv/vorschau', { typId, archiv }),
  darfWeg: () => anfrage<Array<{ id: string; typId: string; typ: string; titel: string; aufbewahrenBis: string }>>('GET', '/api/werkbank/darf-weg'),
  dateienPruefen: () => anfrage<Auftrag>('POST', '/api/werkbank/wartung/dateien'),
  /* Versionierung (#194) */
  versionen: (id: string) => anfrage<{ aktuell: Dokument; aeltere: DokumentVersion[] }>('GET', `/api/dokumente/${id}/versionen`),
  zurueckholen: (id: string, nummer: number) => anfrage<Dokument>('POST', `/api/dokumente/${id}/versionen/${nummer}/zurueckholen`),
  async ersetzen(id: string, datei: File): Promise<Dokument> {
    return sendeDatei(`/api/dokumente/${id}/ersetzen?${new URLSearchParams({ name: datei.name, typ: datei.type || 'application/octet-stream' })}`, datei) as Promise<Dokument>;
  },
  /** PDF bearbeiten (#335). */
  pdfSeiten: (id: string) => anfrage<PdfSeiten>('GET', `/api/dokumente/${id}/seiten`),
  bearbeitePdf: (id: string, e: { seiten: Array<{ nr: number; drehung?: number }>; teile?: number[]; bestaetigt?: boolean }) =>
    anfrage<{ dokumente: Dokument[]; posten: Mappe[] }>('POST', `/api/dokumente/${id}/seiten`, e),
  fuegePdfZusammen: (e: { dokumente: string[]; name?: string; ziel?: string; register?: string; originaleEntfernen?: boolean; bestaetigt?: boolean }) =>
    anfrage<{ dokument: Dokument; erledigtePost: string[] }>('POST', '/api/dokumente/zusammenfuegen', e),
  /** gleicherName (#194): zaehler (Standard), version oder ersetzen. */
  /** Doppelte Dateien (#333): Prüfwerte → Fundstellen in Mappen, die man lesen darf. */
  gleicheDateien: (pruefwerte: string[], ohneMappe?: string) => anfrage<{ fundstellen: Record<string, Fundstelle[]> }>('POST', '/api/dokumente/gleiche', { pruefwerte, ...(ohneMappe ? { ohneMappe } : {}) }),
  async ladeHoch(mappeId: string, register: string, datei: File, gleicherName?: 'zaehler' | 'version' | 'ersetzen'): Promise<Hochgeladen> {
    const q = new URLSearchParams({ register, name: datei.name, typ: datei.type || 'application/octet-stream', ...(gleicherName ? { gleicherName } : {}) });
    return sendeDatei(`/api/mappen/${mappeId}/dokumente?${q}`, datei) as Promise<Hochgeladen>;
  },
};

async function sendeDatei(url: string, datei: File): Promise<unknown> {
    let r: Response;
    try {
      r = await fetch(url, {
        method: 'POST', credentials: 'same-origin', body: datei,
        headers: { 'x-dms': '1', 'content-type': 'application/octet-stream' },
      });
    } catch { erreichbarkeit.ausfall(); throw new ApiFehler(0, NICHT_ERREICHBAR); }
    const d = await r.json().catch(() => null);
    if (istAusfall(r.status, d)) { erreichbarkeit.ausfall(); throw new ApiFehler(r.status, NICHT_ERREICHBAR); }
    if (r.status === 401) dispatchEvent(new Event(ABGEMELDET));
    if (!r.ok) throw new ApiFehler(r.status, d?.fehler ?? (r.status === 413 ? 'Die Datei ist zu groß.' : `Fehler ${r.status}`), d?.details);
    return d;
}

/** Einstellungen eines Pakets (#197): Beschreibung, Werte (Geheimnisse nur „gesetzt“), Auswahllisten, Status. */
export interface PaketEinstellungenStand {
  beschreibung: Einstellungsbeschreibung; werte: Record<string, unknown>; fehlend: string[];
  status: { letzterLauf: string | null; meldungen: string[] } | null; laeufer: boolean;
  auswahl: { typen: Array<{ id: string; name: string; felder: Array<{ key: string; label: string }> }>; benutzer: Array<{ id: string; name: string }>; rollen: Array<{ id: string; name: string }>; sichten: Array<{ id: string; name: string }> };
}
/** Katalogquelle (#189): der offizielle Katalog oder eine weitere Adresse. */
export interface WerkbankAnsichtStand { installation: WerkbankAnsicht; eingestellt: boolean; eigene: EigeneAnsicht; /** Eingerichtete Bereiche (nur GET). */ benutzt?: string[] }
export interface PaketQuelle { url: string; offiziell: boolean; aktiv: boolean; von?: string | null; am?: string }
/** Vorschau einer Paketinstallation bzw. eines Updates (#188). */
export interface PaketVorschau {
  paket: { id: string; name: string; version: string; beschreibung: string; lizenz: string; autor: { name: string; github: string }; dms: string; abhaengigkeiten: Record<string, string>; readme: string | null; changelog: string | null; quelle: string | null };
  dmsVersion: string; dmsOk: boolean; installiert: string | null; update: boolean; herkunft: InstalliertesPaket['herkunft'] | null;
  abhaengigkeiten: Array<{ id: string; bereich: string; installiert: string | null; ok: boolean; verfuegbar: string | null }>;
  typen: Array<{ schluessel: string; dmsSchluessel: string; name: string; felder: number; vorhanden: boolean; neueFelder: string[]; neueRegister: string[]; konflikt: string | null; vorschlag: string | null; geloescht?: boolean }>;
  sichten: Array<{ schluessel: string; name: string; eltern: string | null; vorhanden: boolean; konflikt: string | null; vorschlag: string | null }>;
  beispiele: number; probleme: string[]; hinweise: string[]; einstellungen: { neu: string[]; weg: string[] } | null;
}
export type RechtStufe = 'immer' | 'nie' | 'teils';
export interface BerechtigungEintrag { typId: string; name: string; system: string | null; berechtigungen: Regelwerk }
export interface Testlauf extends Ergebnis { admin: boolean; mappe: { id: string; titel: string; typId: string }; benutzer: { id: string; name: string } }
/** 404 ohne Leserecht (#124): eigene offene Aufgaben an der Mappe, zum Erledigen oder Weitergeben. */
export const verborgeneAufgaben = (x: unknown): Aufgabe[] | null => {
  const d = x instanceof ApiFehler && x.status === 404 ? x.details as { verborgen?: boolean; aufgaben?: Aufgabe[] } | undefined : undefined;
  return d?.verborgen ? d.aufgaben ?? [] : null;
};
export interface MappeDetails { /** Wirksame Rechte an der Mappe (#126). */ rechte?: Rechte; mappe: Mappe; favorit?: boolean; /** Noch nicht fällige Erinnerungen (#131). */ erinnerungen?: Erinnerung[]; rueckverweise: Rueckverweis[]; loeschbar?: { ok: boolean; grund?: string; rueckverweise?: Rueckverweis[] }; dokumente: Dokument[]; notizen: Notiz[]; aufgaben: Aufgabe[]; bezuege: Bezuege; /** Verweise, die nicht (mehr) zum Auswahlfilter passen (#172). */ unpassend?: Record<string, string[]>; /** Archivmodus (#212). */ aufbewahrenBis?: string | null; /** Exportrecht (#294): darf als PDF exportiert werden. */ exportierbar?: boolean }
export interface Hochgeladen { dokument: Dokument; gleicherInhalt: Array<{ mappeId: string; name: string; titel?: string; typId?: string }> }
/** Vorschaubild der ersten Seite (#332); der Prüfwert in der Adresse sorgt für ein neues Bild nach einer neuen Version. */
export interface PdfSeiten { id: string; name: string; version: number; sha256: string; anzahl: number; drehungen: number[]; bilderBis: number }
/** Bild einer Seite (#335); die Adresse trägt den Prüfwert, ein neues PDF hat neue Bilder. */
export const seitenbildUrl = (d: { id: string; sha256: string }, nr: number) => `/api/dokumente/${d.id}/seiten/${nr}/bild?v=${d.sha256.slice(0, 12)}`;
export const vorschauUrl = (d: { id: string; sha256: string }, versuch = 0) => `/api/dokumente/${d.id}/vorschau?v=${d.sha256.slice(0, 12)}${versuch ? `&n=${versuch}` : ''}`;
/** Wo eine gleiche Datei schon liegt (#333) – nur lesbare Mappen. */
export interface Fundstelle { mappeId: string; typId: string; titel: string; typ: string; register: string; name: string; erstellt: string }
export const dokumentUrl = (id: string, herunterladen = false) => `/api/dokumente/${id}/inhalt${herunterladen ? '?herunterladen=1' : ''}`;
export const versionUrl = (id: string, nummer: number, herunterladen = false) => `/api/dokumente/${id}/versionen/${nummer}/inhalt${herunterladen ? '?herunterladen=1' : ''}`;

export interface NummernkreisEingabe { schluessel: string; name: string; muster: string; start: number }
export interface NummernkreisAnsicht extends Nummernkreis {
  naechste: string; naechsterZaehler: number; zeitraum: string; neubeginn: 'taeglich' | 'monatlich' | 'jaehrlich' | 'nie';
  verwendet: Array<{ typId: string; typ: string; feldKey: string; feld: string }>;
}
export interface KontaktZuordnung { name: string; email?: string; telefon?: string; adresse?: string; firma?: string; notiz?: string }
export interface VollexportStand {
  ordner: string; frei: number | null;
  abschaetzung: { mappen: number; dokumente: number; bytes: number };
  exporte: Array<{ name: string; erstellt: string | null; bytes: number; dateien: number; mappen: number | null; passwoerter: boolean }>;
  kontakte: Array<{ typId: string; typ: string; zuordnung: KontaktZuordnung }>;
  /** Dürfen Benutzer ihre Daten selbst exportieren (#255)? */
  persoenlich: boolean;
}
export interface Auftrag {
  id: string; art: string; titel: string; status: 'laeuft' | 'fertig' | 'fehler';
  fertig: number; gesamt: number; gestartet: string; beendet?: string; ergebnis?: unknown; fehler?: string;
}
export const DOKUMENTARTEN = ['brief', 'mehrseitig', 'scan', 'bild', 'gross'] as const;
export type Dokumentart = (typeof DOKUMENTARTEN)[number];
export type DemoStufe = 'leicht' | 'realistisch' | 'schwer';
export interface DemoOptionen {
  anzahl: number;
  startwert?: string;
  dokumente?: { anteil: number; von: number; bis: number; stufe?: DemoStufe; mischung?: Record<Dokumentart, number>; duplikate: number } | null;
}
export interface DemoAbschaetzung {
  mappen: number; mappenMitRegister: number; frei: number | null; mindest: number; reicht: boolean; rastern: boolean;
  dokumente: { dokumente: number; bytes: number; ocrSeiten: number; seiten: number; jeArt: Record<Dokumentart, number> } | null;
}
export interface DemoErgebnis {
  gesamt: number; erzeugt: Record<string, number>; uebersprungen: Array<{ typ: string; grund: string }>;
  startwert?: string; dauerMs?: number; abgebrochen?: string; ohneRastern?: boolean;
  dokumente?: { anzahl: number; bytes: number; seiten: number; texterkennung: number; duplikate: number; jeArt: Record<Dokumentart, number>; dauerMs: number } | null;
}

export type Stufe = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export interface Protokolleintrag { nr: number; zeit: string; stufe: Stufe; modul: string; text: string; benutzer?: string; anfrage?: string; daten?: Record<string, unknown> }
export interface DebugStand { an: boolean; bis: string | null; grundstufe: string }
export interface ProtokollAntwort { eintraege: Protokolleintrag[]; letzte: number; gespeichert: number; debug: DebugStand; module: string[] }
export interface MessEinstellungen { schwelleMs: number; tage: number }
export interface Langlaeufer { id: number; zeit: string; dauerMs: number; zugriff: string; anfrage: string; benutzer: string }
export interface LaufendeAbfrage { pid: number; seitMs: number; zustand: string; abfrage: string; anwendung: string }
export interface DatenbankStand { einstellungen: MessEinstellungen | null; langlaeufer: Langlaeufer[]; laufend: LaufendeAbfrage[] }
export interface WerkbankUebersicht {
  tresor: { zustand: string; eingebunden: boolean | null; betroffen: number } | null;
  mail: boolean; adresse: boolean;
  texterkennung: Record<'keiner' | 'wartet' | 'laeuft' | 'fertig' | 'fehler' | 'ausgelassen', number> | null;
  aufgaben: { offen: number; ohneEmpfaenger: number };
  unpassend: number;
  papierkorb: { anzahl: number; aeltester: string | null; tage: number };
  version: { version: string; commit: string | null; gebaut: string | null };
  bestand: { version: string; groesseBytes: number; mappen: number; typen: number; benutzer: number; dokumente: number; dokumenteBytes: number } | null;
  fehlermeldungen: number | null;
  /** Notfallzugänge (#108), bis sie umbenannt oder deaktiviert sind. */
  notfallzugaenge?: Array<{ id: string; name: string; erstellt: string }>;
  /** Wartungsmodus (#102). */
  wartung?: WartungOeffentlich | null;
  /** Sicherung (#105). */
  sicherung?: SicherungsZustand | null;
  /** Speicherplatz (#116). */
  speicherplatz?: SpeicherplatzStand | null;
  /** Frühere Variablen, die aus der Compose-Datei entfernt werden können (#115). */
  variablen?: string[];
  /** API-Schlüssel von Administratoren (#128). */
  adminSchluessel?: number;
  /** Datenbank-Anbindung (#119): DATABASE_URL abweichend, Neustart nötig. */
  anbindung?: { umgebung: 'fehlt' | 'gleich' | 'abweichend'; neustartNoetig: boolean } | null;
  /** Einrichtungsassistent (#119): übersprungene Schritte. */
  einrichtung?: EinrichtungStand | null;
}
/* Feste Ordner (#115) und Speicherplatz (#116) */
export type OrdnerArt = 'dateien' | 'geheim' | 'sicherung';
export interface OrdnerStand { art: OrdnerArt; pfad: string; text: string; gesamt: number | null; frei: number | null; belegt: number | null; volume: boolean | null; geraet: string | null; zustand?: 'ok' | 'warnung' | 'grenze' | null; warnBytes?: number | null; grenzBytes?: number | null }
export interface Schwelle { wert: number; einheit: 'prozent' | 'gb' }
export interface SpeicherplatzEinstellung { warnung: Schwelle; grenze: Schwelle }
export interface SpeicherplatzStand { zustand: 'ok' | 'warnung' | 'grenze'; gemessen: string; ordner: OrdnerStand[]; einstellung: SpeicherplatzEinstellung; seit: string | null; wartungBeenden: boolean; /** Vorschaubilder (#332), nur beim Abruf der Seite. */ vorschau?: { anzahl: number; bytes: number } | null }
export interface Diagnose {
  dms: { version: string; commit: string | null; gebaut: string | null }; serverzeit: string; zeitzone: string; node: string; postgres: string | null;
  texterkennung: boolean | null; mail: boolean; benutzer: { name: string; rolle: string }; sitzung: string | null; vertretung: boolean;
}
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
export interface ApiSchluessel { id: string; name: string; praefix: string; recht: 'lesen' | 'schreiben'; passwoerter: boolean; ablauf: string | null; erstellt: string; zuletztBenutzt: string | null }
export interface ApiSchluesselEingabe { name: string; recht: 'lesen' | 'schreiben'; passwoerter: boolean; ablauf: string | null }

export type Verbindung = 'starttls' | 'ssl' | 'keine';
export interface MailAnsicht {
  aktiv: boolean; host: string; port: number; verbindung: Verbindung; benutzer: string; absender: string; selbstsigniert: boolean;
  /** Das Passwort selbst kommt nie zurück. */
  passwortGesetzt: boolean;
  /** false = mit einem verlorenen Schlüssel verschlüsselt (#39). */
  passwortLesbar: boolean;
  /** Noch im Klartext aus einer älteren Version, bis es einen Schlüssel gibt. */
  passwortUnverschluesselt: boolean;
}
export type MailEingabe = Omit<MailAnsicht, 'passwortGesetzt' | 'passwortLesbar' | 'passwortUnverschluesselt'> & { passwort?: string; passwortLoeschen?: boolean };
export interface BetriebAnsicht { mail: MailAnsicht; adresse: string; vorschlag: string | null; verbindungen: Record<Verbindung, string>; passwoerterMoeglich: boolean }
export interface TresorStatus {
  zustand: 'vorhanden' | 'fehlt' | 'verloren' | 'falsch';
  fingerabdruck: string | null; erwartet: string | null; erstellt: string | null; datei: string;
  eingebunden: boolean | null;
  betroffen: Array<{ bereich: string; was: string; wo?: string }>;
  /** Notfallblatt zum aktuellen Schlüssel (#106). */
  notfallblatt?: Notfallblattstand | null;
}
export interface Probe { ok: boolean; meldung: string }

/** Eingangsordner (#195). */
export interface EingangEinstellung { aktiv: boolean; abstand: number; nachher: 'erledigt' | 'loeschen'; /** #333 */ doppelteUeberspringen?: boolean }
export interface EingangEreignis { datei: string; zeit: string; mappeId?: string; grund?: string }
export interface EingangStand {
  vorhanden: boolean; pfad?: string; einstellung?: EingangEinstellung; letztePruefung?: string | null; wartend?: number;
  pausiert?: string | null; uebernommen?: EingangEreignis[]; fehler?: EingangEreignis[]; andereInstanz?: boolean;
}

/** Postfächer (#196). */
export interface PostfachEingabe {
  name: string; aktiv: boolean; server: string; port: number; verschluesselung: 'ssl' | 'starttls' | 'keine'; benutzer: string; passwort?: string;
  ordner: string; abstand: number; fuer: string | null; absender: string[] | string; nachher: 'verschieben' | 'gelesen' | 'loeschen'; zielordner: string;
  nurMitAnhang: boolean; original: boolean; unverschluesseltBestaetigt?: boolean;
}
export interface PostfachEreignis { zeit: string; betreff?: string; absender?: string; mappeId?: string; fehler?: string }
export interface PostfachAnsicht extends Omit<PostfachEingabe, 'passwort' | 'absender'> {
  id: string; absender: string[]; passwortGesetzt: boolean;
  stand: { letzterAbruf: string | null; naechsterAbruf: string | null; fehlerFolge: number; uebernommen: PostfachEreignis[]; fehler: PostfachEreignis[] };
}

/** Anmeldeschutz (#240). */
export interface SperrEinstellung { konto: { versuche: number; minuten: number }; ip: { versuche: number; minuten: number }; ausnahmen: string[]; mail: boolean }
export interface IpSperre { ip: string; seit: string; bis: string | null; grund: string }
export interface AnmeldeschutzStand { einstellung: SperrEinstellung; gesperrt: IpSperre[]; deineIp: string }
