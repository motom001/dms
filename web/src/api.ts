import type { Design } from './design';
import { messung } from './messung';
import type { Benutzer, Dokument, Mappe, MappenBezug, Mappentyp, Pruefergebnis, Rolle, Sitzung, Sortierung, Vertretung } from '../../shared/src/model';

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

async function anfrage<T>(methode: string, url: string, body?: unknown): Promise<T> {
  let r: Response;
  const start = performance.now();
  const seite = messung.seite;
  try {
    r = await fetch(url, {
      method: methode,
      credentials: 'same-origin',
      // X-DMS kennzeichnet Anfragen der eigenen Oberfläche (Schutz vor fremden Seiten).
      headers: body === undefined ? { 'x-dms': '1' } : { 'x-dms': '1', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiFehler(0, 'Der Server ist nicht erreichbar.');
  }
  const kopf = performance.now();
  const daten = r.status === 204 ? null : await r.json().catch(() => null);
  messung.erfasse(seite, methode, url, r, start, kopf, performance.now());
  if (r.status === 401 && !url.startsWith('/api/konto/')) dispatchEvent(new Event(ABGEMELDET));
  if (!r.ok) throw new ApiFehler(r.status, daten?.fehler ?? `Fehler ${r.status}`, daten?.details);
  return daten as T;
}

export interface Rueckverweis { quelleId: string; quelleTypId: string; feldKey: string; titel: string }
export type Bezuege = Record<string, MappenBezug>;
export interface Seite { gesamt: number; von: number; mappen: Mappe[]; bezuege: Bezuege }
export interface Zaehler { typen: Record<string, { anzahl: number; unpassend: number; demo: number }>; eingang: number }
export interface KontoStatus {
  einrichtungNoetig: boolean; mail: boolean; benutzer: Benutzer | null;
  /** Ein Administrator agiert gerade als dieser Benutzer. */
  vertretung?: { adminName: string; beginn: string } | null;
  /** Wer hat als dieser Benutzer agiert (noch nicht gesehen)? */
  hinweise?: Vertretung[];
}
export interface LinkErgebnis { benutzer: Benutzer; mailVerschickt: boolean; link?: string; mailFehler?: string }

export const api = {
  status: () => anfrage<KontoStatus>('GET', '/api/konto/status'),
  einrichten: (d: { email: string; name: string; passwort: string }) => anfrage<{ benutzer: Benutzer }>('POST', '/api/konto/einrichten', d),
  anmelden: (d: { email: string; passwort: string }) => anfrage<{ benutzer: Benutzer }>('POST', '/api/konto/anmelden', d),
  abmelden: () => anfrage<null>('POST', '/api/konto/abmelden'),
  passwortVergessen: (email: string) => anfrage<null>('POST', '/api/konto/passwort-vergessen', { email }),
  linkPruefen: (s: string) => anfrage<{ email: string; name: string; zweck: 'einladung' | 'zuruecksetzen' }>('GET', `/api/konto/link/${encodeURIComponent(s)}`),
  passwortSetzen: (schluessel: string, passwort: string) => anfrage<{ benutzer: Benutzer }>('POST', '/api/konto/passwort-setzen', { schluessel, passwort }),

  personen: () => anfrage<Array<{ id: string; name: string }>>('GET', '/api/personen'),
  benutzer: () => anfrage<Benutzer[]>('GET', '/api/benutzer'),
  benutzerAnlegen: (d: { email: string; name: string; rolle: Rolle }) => anfrage<LinkErgebnis>('POST', '/api/benutzer', d),
  benutzerAendern: (id: string, d: Partial<Pick<Benutzer, 'name' | 'rolle' | 'aktiv'>>) => anfrage<Benutzer>('PUT', `/api/benutzer/${id}`, d),
  benutzerLoeschen: (id: string) => anfrage<null>('DELETE', `/api/benutzer/${id}`),
  neuerLink: (id: string) => anfrage<LinkErgebnis>('POST', `/api/benutzer/${id}/link`),
  sitzungen: (id: string) => anfrage<Sitzung[]>('GET', `/api/benutzer/${id}/sitzungen`),
  sitzungBeenden: (id: string, sitzung: string) => anfrage<null>('DELETE', `/api/benutzer/${id}/sitzungen/${sitzung}`),
  alleSitzungenBeenden: (id: string) => anfrage<{ beendet: number }>('DELETE', `/api/benutzer/${id}/sitzungen`),
  vertreten: (id: string) => anfrage<{ benutzer: Benutzer }>('POST', `/api/benutzer/${id}/vertreten`),
  vertretungBeenden: () => anfrage<{ benutzer: Benutzer | null }>('POST', '/api/konto/vertretung-beenden'),
  hinweiseGesehen: () => anfrage<null>('POST', '/api/konto/hinweise/gesehen'),

  typen: () => anfrage<Mappentyp[]>('GET', '/api/typen'),
  typAnlegen: (t: unknown) => anfrage<Mappentyp>('POST', '/api/typen', t),
  typAendern: (id: string, t: unknown) => anfrage<Mappentyp>('PUT', `/api/typen/${id}`, t),
  typLoeschen: (id: string) => anfrage<null>('DELETE', `/api/typen/${id}`),
  /** Eine Seite einer Sicht („eingang“ oder Typ-Id), nach Titel sortiert. */
  seite: (sicht: string, von = 0, anzahl = 100, suche = '', sortierung?: Sortierung | null) =>
    anfrage<Seite>('GET', `/api/mappen?${new URLSearchParams({
      sicht, von: String(von), anzahl: String(anzahl), ...(suche ? { suche } : {}),
      ...(sortierung ? { sortierung: sortierung.spalte, absteigend: String(sortierung.absteigend) } : {}),
    })}`),
  einstellungen: () => anfrage<Record<string, unknown>>('GET', '/api/konto/einstellungen'),
  designs: () => anfrage<{ designs: Design[]; standard: string | null }>('GET', '/api/designs'),
  designAnlegen: (d: Omit<Design, 'id'>) => anfrage<Design>('POST', '/api/designs', d),
  designAendern: (id: string, d: Omit<Design, 'id'>) => anfrage<Design>('PUT', `/api/designs/${id}`, d),
  designLoeschen: (id: string) => anfrage<null>('DELETE', `/api/designs/${id}`),
  designStandard: (id: string) => anfrage<{ designs: Design[]; standard: string | null }>('PUT', '/api/designs-standard', { id }),
  einstellungSetzen: (schluessel: string, wert: unknown) => anfrage<null>('PUT', `/api/konto/einstellungen/${encodeURIComponent(schluessel)}`, { wert }),
  sichten: () => anfrage<Zaehler>('GET', '/api/sichten'),
  belegung: (typId: string) => anfrage<Record<string, number>>('GET', `/api/typen/${typId}/belegung`),
  mappe: (id: string) => anfrage<MappeDetails>('GET', `/api/mappen/${id}`),
  mappeAnlegen: (m: unknown) => anfrage<Mappe>('POST', '/api/mappen', m),
  mappeAendern: (id: string, m: unknown) => anfrage<Mappe>('PUT', `/api/mappen/${id}`, m),
  mappeLoeschen: (id: string) => anfrage<null>('DELETE', `/api/mappen/${id}`),
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
  versionsabgleich: (browser: Record<string, string>) => anfrage<Vergleich[]>('POST', '/api/werkbank/system/abgleich', { browser }),
  datenbankEinstellen: (e: MessEinstellungen) => anfrage<MessEinstellungen>('PUT', '/api/werkbank/datenbank', e),
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

export interface MappeDetails { mappe: Mappe; rueckverweise: Rueckverweis[]; dokumente: Dokument[]; bezuege: Bezuege }
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
export interface Systemuebersicht {
  dms: { version: string; commit: string | null; gebaut: string | null };
  laufzeit: { node: string; system: string; architektur: string; container: boolean; alpine: string | null; zeitzone: string; laeuftSeit: string };
  datenbank: { version: string; groesseBytes: number; mappen: number; typen: number; benutzer: number; dokumente: number; dokumenteBytes: number } | { fehler: string };
  bibliotheken: Record<string, string | null>;
  einstellungen: Record<string, string>;
}
export interface Vergleich { komponente: string; installiert: string | null; aktuell: string | null; status: 'aktuell' | 'neuer' | 'veraltet' | 'unbekannt'; hinweis?: string; quelle: string }
