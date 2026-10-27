import type { Benutzer, Dokument, Mappe, Mappentyp, Pruefergebnis, Rolle } from '../../shared/src/model';

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
  const daten = r.status === 204 ? null : await r.json().catch(() => null);
  if (r.status === 401 && !url.startsWith('/api/konto/')) dispatchEvent(new Event(ABGEMELDET));
  if (!r.ok) throw new ApiFehler(r.status, daten?.fehler ?? `Fehler ${r.status}`, daten?.details);
  return daten as T;
}

export interface Rueckverweis { quelleId: string; quelleTypId: string; feldKey: string }
export interface KontoStatus { einrichtungNoetig: boolean; mail: boolean; benutzer: Benutzer | null }
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

  typen: () => anfrage<Mappentyp[]>('GET', '/api/typen'),
  typAnlegen: (t: unknown) => anfrage<Mappentyp>('POST', '/api/typen', t),
  typAendern: (id: string, t: unknown) => anfrage<Mappentyp>('PUT', `/api/typen/${id}`, t),
  typLoeschen: (id: string) => anfrage<null>('DELETE', `/api/typen/${id}`),
  mappen: () => anfrage<Mappe[]>('GET', '/api/mappen'),
  mappe: (id: string) => anfrage<MappeDetails>('GET', `/api/mappen/${id}`),
  mappeAnlegen: (m: unknown) => anfrage<Mappe>('POST', '/api/mappen', m),
  mappeAendern: (id: string, m: unknown) => anfrage<Mappe>('PUT', `/api/mappen/${id}`, m),
  mappeLoeschen: (id: string) => anfrage<null>('DELETE', `/api/mappen/${id}`),
  beispiele: () => anfrage<null>('POST', '/api/beispiele'),
  demoUebersicht: () => anfrage<Array<{ typId: string; name: string; demo: number; gesamt: number }>>('GET', '/api/werkbank/demo'),
  demoErzeugen: (anzahl: number) => anfrage<{ gesamt: number; erzeugt: Record<string, number>; uebersprungen: Array<{ typ: string; grund: string }> }>('POST', '/api/werkbank/demo', { anzahl }),
  demoEntfernen: () => anfrage<{ entfernt: number }>('DELETE', '/api/werkbank/demo'),
  profil: (name: string) => anfrage<Benutzer>('PUT', '/api/konto/profil', { name }),
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

export interface MappeDetails { mappe: Mappe; rueckverweise: Rueckverweis[]; dokumente: Dokument[] }
export interface Hochgeladen { dokument: Dokument; gleicherInhalt: Array<{ mappeId: string; name: string }> }
export const dokumentUrl = (id: string, herunterladen = false) => `/api/dokumente/${id}/inhalt${herunterladen ? '?herunterladen=1' : ''}`;
