import type { Design } from './design';
import { messung } from './messung';
import type { Abwesenheit, Aufgabe, Ausschnitt, Benutzer, Dokument, Historieneintrag, Notiz, Mappe, MappenBezug, Mappentyp, OcrStandArt, Pruefergebnis, Rolle, Sitzung, Sortierung, Vertretung, Werte } from '../../shared/src/model';
import type { Sicht, SichtDaten } from '../../shared/src/sichten';
import { merkeAnfrage } from './diagnose';

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
    merkeAnfrage(methode, url, 0, 'Der Server ist nicht erreichbar.');
    throw new ApiFehler(0, 'Der Server ist nicht erreichbar.');
  }
  const kopf = performance.now();
  const daten = r.status === 204 ? null : await r.json().catch(() => null);
  messung.erfasse(seite, methode, url, r, start, kopf, performance.now());
  if (r.status === 401 && !url.startsWith('/api/konto/')) dispatchEvent(new Event(ABGEMELDET));
  if (!r.ok) {
    merkeAnfrage(methode, url, r.status, daten?.fehler ?? `Fehler ${r.status}`);
    throw new ApiFehler(r.status, daten?.fehler ?? `Fehler ${r.status}`, daten?.details);
  }
  return daten as T;
}

export interface Rueckverweis { quelleId: string; quelleTypId: string; feldKey: string; titel: string }
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
}
/** Eine Mappe im Papierkorb (#43). */
export interface PapierkorbEintrag {
  id: string; typId: string; titel: string; werte: Werte; demo: boolean;
  erstellt: string; erstelltVon: string | null; geaendert: string; geaendertVon: string | null;
  geloescht: string; geloeschtVon: string | null; dokumente: number;
}
export interface KontoStatus {
  einrichtungNoetig: boolean; mail: boolean; benutzer: Benutzer | null;
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
export interface AnbindungStand { anbindung: AnbindungAnsicht; datei: string; umgebung: 'fehlt' | 'gleich' | 'abweichend'; neustartNoetig: boolean }
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
  anmelden: (d: { email: string; passwort: string }) => anfrage<{ benutzer: Benutzer }>('POST', '/api/konto/anmelden', d),
  abmelden: () => anfrage<null>('POST', '/api/konto/abmelden'),
  passwortVergessen: (email: string) => anfrage<null>('POST', '/api/konto/passwort-vergessen', { email }),
  linkPruefen: (s: string) => anfrage<{ email: string; name: string; zweck: 'einladung' | 'zuruecksetzen' }>('GET', `/api/konto/link/${encodeURIComponent(s)}`),
  passwortSetzen: (schluessel: string, passwort: string) => anfrage<{ benutzer: Benutzer }>('POST', '/api/konto/passwort-setzen', { schluessel, passwort }),

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
  seite: (sicht: string, von = 0, anzahl = 100, suche = '', sortierung?: Sortierung | null, volltext = false, notizen = false, link?: string) =>
    anfrage<Seite>('GET', `/api/mappen?${new URLSearchParams({
      sicht, ...(link !== undefined ? { link } : {}), von: String(von), anzahl: String(anzahl), ...(suche ? { suche } : {}), ...(suche && volltext ? { volltext: 'true' } : {}), ...(suche && notizen ? { notizen: 'true' } : {}),
      ...(sortierung ? { sortierung: sortierung.spalte, absteigend: String(sortierung.absteigend) } : {}),
    })}`),
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
  /** Verweisende Mappen eines Typs über ein Feld, vollständig (Tabelle im Verknüpfungsregister, #75). */
  verweisende: (id: string, typ: string, feld: string) => anfrage<{ gesamt: number; mappen: Mappe[]; bezuege: Bezuege }>('GET', `/api/mappen/${id}/verweisende?${new URLSearchParams({ typ, feld })}`),
  favorit: (id: string, an: boolean) => anfrage<null>(an ? 'PUT' : 'DELETE', `/api/mappen/${id}/favorit`),
  mappeAnlegen: (m: unknown) => anfrage<Mappe>('POST', '/api/mappen', m),
  mappeAendern: (id: string, m: unknown) => anfrage<Mappe>('PUT', `/api/mappen/${id}`, m),
  mappeLoeschen: (id: string) => anfrage<null>('DELETE', `/api/mappen/${id}`),
  /* Volltext und Texterkennung (#45) */
  volltext: (id: string) => anfrage<{ id: string; name: string; text: string | null }>('GET', `/api/dokumente/${id}/volltext`),
  texterkennungErneut: (id: string) => anfrage<Dokument>('POST', `/api/dokumente/${id}/texterkennung`),
  texterkennung: (werkzeugeNeu = false) => anfrage<OcrStatus>('GET', `/api/werkbank/texterkennung${werkzeugeNeu ? '?neu' : ''}`),
  texterkennungSpeichern: (e: Partial<OcrEinstellungen>) => anfrage<OcrStatus>('PUT', '/api/werkbank/texterkennung', e),
  volltextNachholen: () => anfrage<{ eingereiht: number }>('POST', '/api/werkbank/wartung/volltext'),
  /* Papierkorb (#43): Ablage = eigener, Werkbank = alle */
  papierkorb: () => anfrage<PapierkorbEintrag[]>('GET', '/api/papierkorb'),
  papierkorbWerkbank: () => anfrage<{ tage: number; historieTage: number; eintraege: PapierkorbEintrag[] }>('GET', '/api/werkbank/papierkorb'),
  papierkorbEintrag: (id: string, werkbank = false) => anfrage<PapierkorbEintrag>('GET', `/api/${werkbank ? 'werkbank/' : ''}papierkorb/${id}`),
  wiederherstellen: (id: string, werkbank = false) => anfrage<{ mappe: Mappe; verweiseEntfallen: number }>('POST', `/api/${werkbank ? 'werkbank/' : ''}papierkorb/${id}/wiederherstellen`),
  endgueltigLoeschen: (id: string, werkbank = false) => anfrage<{ geloescht: number }>('DELETE', `/api/${werkbank ? 'werkbank/' : ''}papierkorb/${id}`),
  papierkorbLeeren: (werkbank = false) => anfrage<{ geloescht: number }>('DELETE', `/api/${werkbank ? 'werkbank/' : ''}papierkorb`),
  emailBereit: () => anfrage<{ bereit: boolean }>('GET', '/api/email/bereit'),
  emailSenden: (mappeId: string, e: { an: string; betreff: string; nachricht: string; dokumente: string[] }) => anfrage<{ id: string; typId: string }>('POST', `/api/mappen/${mappeId}/email`, e),
  papierkorbTage: (e: { tage?: number; historieTage?: number }) => anfrage<{ tage: number; geleert: number; historieTage: number }>('PUT', '/api/werkbank/papierkorb/einstellungen', e),
  /* Aufgaben (#54) */
  aufgabeAnlegen: (mappeId: string, empfaengerId: string, text: string) => anfrage<Aufgabe>('POST', `/api/mappen/${mappeId}/aufgaben`, { empfaengerId, text }),
  aufgabeErledigt: (id: string) => anfrage<Aufgabe>('POST', `/api/aufgaben/${id}/erledigt`),
  aufgabeDelegieren: (id: string, empfaengerId: string) => anfrage<Aufgabe>('POST', `/api/aufgaben/${id}/delegieren`, { empfaengerId }),
  aufgabenWerkbank: (erledigt = false) => anfrage<{ aufgaben: Aufgabe[]; mail: MailEinstellung | null }>('GET', `/api/werkbank/aufgaben${erledigt ? '?erledigt' : ''}`),
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
  demoErzeugen: (anzahl: number) => anfrage<Auftrag>('POST', '/api/werkbank/demo', { anzahl }),
  demoEntfernen: () => anfrage<Auftrag>('DELETE', '/api/werkbank/demo'),
  auftrag: () => anfrage<Auftrag | null>('GET', '/api/werkbank/auftrag'),
  protokoll: (f: Record<string, string | number | undefined>) =>
    anfrage<ProtokollAntwort>('GET', `/api/werkbank/protokoll?${new URLSearchParams(Object.entries(f).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]))}`),
  debug: (an: boolean) => anfrage<DebugStand>('PUT', '/api/werkbank/debug', { an }),
  datenbank: () => anfrage<DatenbankStand>('GET', '/api/werkbank/datenbank'),
  system: () => anfrage<Systemuebersicht>('GET', '/api/werkbank/system'),
  speicherplatz: () => anfrage<SpeicherplatzStand>('GET', '/api/werkbank/speicherplatz'),
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
  async ladeHoch(mappeId: string, register: string, datei: File): Promise<Hochgeladen> {
    const q = new URLSearchParams({ register, name: datei.name, typ: datei.type || 'application/octet-stream' });
    let r: Response;
    try {
      r = await fetch(`/api/mappen/${mappeId}/dokumente?${q}`, {
        method: 'POST', credentials: 'same-origin', body: datei,
        headers: { 'x-dms': '1', 'content-type': 'application/octet-stream' },
      });
    } catch { throw new ApiFehler(0, 'Der Server ist nicht erreichbar.'); }
    const d = await r.json().catch(() => null);
    if (r.status === 401) dispatchEvent(new Event(ABGEMELDET));
    if (!r.ok) throw new ApiFehler(r.status, d?.fehler ?? (r.status === 413 ? 'Die Datei ist zu groß.' : `Fehler ${r.status}`), d?.details);
    return d as Hochgeladen;
  },
};

export interface MappeDetails { mappe: Mappe; favorit?: boolean; rueckverweise: Rueckverweis[]; loeschbar?: { ok: boolean; grund?: string; rueckverweise?: Rueckverweis[] }; dokumente: Dokument[]; notizen: Notiz[]; aufgaben: Aufgabe[]; bezuege: Bezuege }
export interface Hochgeladen { dokument: Dokument; gleicherInhalt: Array<{ mappeId: string; name: string; titel?: string; typId?: string }> }
export const dokumentUrl = (id: string, herunterladen = false) => `/api/dokumente/${id}/inhalt${herunterladen ? '?herunterladen=1' : ''}`;

export interface Auftrag {
  id: string; art: string; titel: string; status: 'laeuft' | 'fertig' | 'fehler';
  fertig: number; gesamt: number; gestartet: string; beendet?: string; ergebnis?: unknown; fehler?: string;
}
export interface DemoErgebnis { gesamt: number; erzeugt: Record<string, number>; uebersprungen: Array<{ typ: string; grund: string }> }

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
export interface SpeicherplatzStand { zustand: 'ok' | 'warnung' | 'grenze'; gemessen: string; ordner: OrdnerStand[]; einstellung: SpeicherplatzEinstellung; seit: string | null; wartungBeenden: boolean }
export interface Diagnose {
  dms: { version: string; commit: string | null; gebaut: string | null }; serverzeit: string; zeitzone: string; node: string; postgres: string | null;
  texterkennung: boolean | null; mail: boolean; benutzer: { name: string; rolle: string }; sitzung: string | null; vertretung: boolean;
}
export interface Fehlermeldung {
  id: string; benutzerId: string | null; erstellt: string; text: string; angaben: Record<string, unknown>;
  bilder: Array<{ nr: number; name: string; mime: string; groesse: number }>; erledigt: string | null; erledigtVon: string | null;
}
export interface Systemuebersicht {
  dms: { version: string; commit: string | null; gebaut: string | null };
  laufzeit: { node: string; system: string; architektur: string; container: boolean; alpine: string | null; zeitzone: string; laeuftSeit: string };
  datenbank: { version: string; groesseBytes: number; mappen: number; typen: number; benutzer: number; dokumente: number; dokumenteBytes: number } | { fehler: string };
  bibliotheken: Record<string, string | null>;
  einstellungen: Record<string, string>;
  /** Feste Ordner mit belegtem und freiem Platz (#115). */
  ordner?: OrdnerStand[] | null;
  variablen?: string[];
}
export interface Vergleich { komponente: string; installiert: string | null; aktuell: string | null; status: 'aktuell' | 'neuer' | 'veraltet' | 'unbekannt'; hinweis?: string; quelle: string }
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
