import type { Benutzer } from '../../shared/src/model';
import { ladeBeispiele } from './beispiele';
import type { Dienst } from './dienst';
import { Fachfehler } from './fehler';
import { SITZUNG_TAGE, type Konten } from './konten';

/**
 * Alle Schnittstellen an einem Ort, jede mit ihrer Zugriffsstufe:
 *   offen      – ohne Anmeldung (Einrichtung, Anmeldung, Passwort-Links)
 *   angemeldet – jeder angemeldete Benutzer
 *   admin      – nur Administratoren
 * Der HTTP-Adapter (http.ts) setzt die Stufen durch.
 */
export type Zugang = 'offen' | 'angemeldet' | 'admin';

export interface Anfrage {
  body: unknown;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  benutzer?: Benutzer;
  sitzung?: string;
  ip: string;
}
export interface Antwort { status?: number; body?: unknown; sitzungSetzen?: string | null }
export interface Route { methode: 'GET' | 'POST' | 'PUT' | 'DELETE'; pfad: string; zugang: Zugang; handler(a: Anfrage): Promise<Antwort> }

export const SITZUNG_COOKIE = 'dms_sitzung';
export const SITZUNG_SEKUNDEN = SITZUNG_TAGE * 24 * 60 * 60;

const ok = (body: unknown, status = 200): Antwort => ({ status, body });
const leer: Antwort = { status: 204 };
const b = (a: Anfrage) => (a.body ?? {}) as Record<string, unknown>;
const ich = (a: Anfrage) => {
  if (!a.benutzer) throw new Fachfehler(401, 'Bitte anmelden.');
  return a.benutzer;
};

export function routen(dienst: Dienst, konten: Konten, log: (m: string) => void = () => {}): Route[] {
  return [
    { methode: 'GET', pfad: '/api/gesundheit', zugang: 'offen', handler: async () => ok({ ok: true }) },

    /* ---------- Konto ---------- */
    { methode: 'GET', pfad: '/api/konto/status', zugang: 'offen', handler: async (a) => ok({
      einrichtungNoetig: await konten.einrichtungNoetig(),
      mail: konten.mailAktiv,
      benutzer: a.benutzer ?? null,
    }) },
    { methode: 'POST', pfad: '/api/konto/einrichten', zugang: 'offen', handler: async (a) => {
      const r = await konten.einrichten(b(a));
      return { status: 201, body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },
    { methode: 'POST', pfad: '/api/konto/anmelden', zugang: 'offen', handler: async (a) => {
      const r = await konten.anmelden(b(a), a.ip);
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },
    { methode: 'POST', pfad: '/api/konto/abmelden', zugang: 'offen', handler: async (a) => {
      await konten.abmelden(a.sitzung);
      return { status: 204, sitzungSetzen: null };
    } },
    { methode: 'POST', pfad: '/api/konto/passwort-vergessen', zugang: 'offen', handler: async (a) => {
      await konten.passwortVergessen(b(a), log);
      return leer;
    } },
    { methode: 'GET', pfad: '/api/konto/link/:schluessel', zugang: 'offen', handler: async (a) => ok(await konten.linkPruefen(a.params.schluessel)) },
    { methode: 'POST', pfad: '/api/konto/passwort-setzen', zugang: 'offen', handler: async (a) => {
      const r = await konten.passwortSetzen(b(a));
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },

    /* ---------- Benutzer ---------- */
    { methode: 'GET', pfad: '/api/personen', zugang: 'angemeldet', handler: async () => ok(await konten.personen()) },
    { methode: 'GET', pfad: '/api/benutzer', zugang: 'admin', handler: async () => ok(await konten.listeBenutzer()) },
    { methode: 'POST', pfad: '/api/benutzer', zugang: 'admin', handler: async (a) => ok(await konten.legeBenutzerAn(b(a)), 201) },
    { methode: 'PUT', pfad: '/api/benutzer/:id', zugang: 'admin', handler: async (a) => ok(await konten.aendereBenutzer(ich(a), a.params.id, b(a))) },
    { methode: 'DELETE', pfad: '/api/benutzer/:id', zugang: 'admin', handler: async (a) => { await konten.loescheBenutzer(ich(a), a.params.id); return leer; } },
    { methode: 'POST', pfad: '/api/benutzer/:id/link', zugang: 'admin', handler: async (a) => ok(await konten.neuerLink(a.params.id)) },

    /* ---------- Mappentypen ---------- */
    { methode: 'GET', pfad: '/api/typen', zugang: 'angemeldet', handler: async () => ok(await dienst.listeTypen()) },
    { methode: 'POST', pfad: '/api/typen', zugang: 'admin', handler: async (a) => ok(await dienst.legeTypAn(a.body), 201) },
    { methode: 'PUT', pfad: '/api/typen/:id', zugang: 'admin', handler: async (a) => ok(await dienst.aendereTyp(a.params.id, a.body)) },
    { methode: 'DELETE', pfad: '/api/typen/:id', zugang: 'admin', handler: async (a) => { await dienst.loescheTyp(a.params.id); return leer; } },
    { methode: 'POST', pfad: '/api/beispiele', zugang: 'admin', handler: async (a) => { await ladeBeispiele(dienst, ich(a).id); return leer; } },

    /* ---------- Mappen ---------- */
    { methode: 'GET', pfad: '/api/mappen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.listeMappen(a.query.typ)) },
    { methode: 'GET', pfad: '/api/mappen/:id', zugang: 'angemeldet', handler: async (a) => ok(await dienst.holeMappe(a.params.id)) },
    { methode: 'POST', pfad: '/api/mappen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.legeMappeAn(a.body, ich(a).id), 201) },
    { methode: 'PUT', pfad: '/api/mappen/:id', zugang: 'angemeldet', handler: async (a) => ok(await dienst.aendereMappe(a.params.id, a.body, ich(a).id)) },
    { methode: 'DELETE', pfad: '/api/mappen/:id', zugang: 'angemeldet', handler: async (a) => { await dienst.loescheMappe(a.params.id); return leer; } },
  ];
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
export function sitzungsCookie(schluessel: string | null, sicher: boolean): string {
  const teile = [`${SITZUNG_COOKIE}=${schluessel ? encodeURIComponent(schluessel) : ''}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${schluessel ? SITZUNG_SEKUNDEN : 0}`];
  if (sicher) teile.push('Secure');
  return teile.join('; ');
}

/**
 * Prüft Zugang und Schutz vor fremden Seiten (CSRF): Ändernde Anfragen
 * müssen den Header X-DMS tragen, den nur die eigene Oberfläche setzt.
 */
export async function pruefeZugang(r: Route, a: Anfrage, kopf: (n: string) => string | undefined, konten: Konten) {
  a.benutzer = await konten.benutzerZu(a.sitzung);
  if (r.methode !== 'GET' && kopf('x-dms') !== '1') throw new Fachfehler(403, 'Anfrage ohne Kennung der Oberfläche abgelehnt.');
  if (r.zugang === 'offen') return;
  if (!a.benutzer) throw new Fachfehler(401, 'Bitte anmelden.');
  if (r.zugang === 'admin' && a.benutzer.rolle !== 'admin') throw new Fachfehler(403, 'Dafür sind Administratorrechte nötig.');
}
