import type { Readable } from 'node:stream';
import { MAX_DATEIGROESSE, type Benutzer } from '../../shared/src/model';
import { ladeBeispiele } from './beispiele';
import { erzeugeDemo, pruefeAnzahl } from './demo';
import type { Dienst } from './dienst';
import { Fachfehler } from './fehler';
import { SITZUNG_TAGE, type Konten } from './konten';
import type { SitzungIntern } from './konto-repo';

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
  /** Daten der Sitzung (nach pruefeZugang). */
  sitzungsDaten?: SitzungIntern;
  ip: string;
  /** User-Agent des Browsers. */
  geraet?: string;
}
export interface Datei {
  inhalt: Readable | Buffer;
  name: string;
  /** Nur bei erkannten PDFs und Bildern wird im Browser angezeigt, sonst immer heruntergeladen. */
  mime: string;
  anzeigen: boolean;
  groesse: number;
}
export interface Antwort { status?: number; body?: unknown; sitzungSetzen?: string | null; datei?: Datei }
export interface Route {
  methode: 'GET' | 'POST' | 'PUT' | 'DELETE';
  pfad: string;
  zugang: Zugang;
  /** Rohdaten statt JSON (Datei-Upload) mit dieser Obergrenze in Bytes. */
  roh?: number;
  handler(a: Anfrage): Promise<Antwort>;
}

export const SITZUNG_COOKIE = 'dms_sitzung';
export const SITZUNG_SEKUNDEN = SITZUNG_TAGE * 24 * 60 * 60;

const ok = (body: unknown, status = 200): Antwort => ({ status, body });
const leer: Antwort = { status: 204 };
const b = (a: Anfrage) => (a.body ?? {}) as Record<string, unknown>;
const info = (a: Anfrage) => ({ ip: a.ip, geraet: a.geraet ?? '' });
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
      // Ein Administrator agiert gerade als dieser Benutzer:
      vertretung: await konten.vertretungZu(a.sitzungsDaten),
      // Hinweise für den Benutzer selbst (nicht, solange jemand als er agiert):
      hinweise: a.benutzer && !a.sitzungsDaten?.vertretungId ? await konten.hinweise(a.benutzer.id) : [],
    }) },
    { methode: 'POST', pfad: '/api/konto/hinweise/gesehen', zugang: 'angemeldet', handler: async (a) => {
      if (!a.sitzungsDaten?.vertretungId) await konten.hinweiseGesehen(ich(a).id);
      return leer;
    } },
    { methode: 'POST', pfad: '/api/konto/vertretung-beenden', zugang: 'angemeldet', handler: async (a) => {
      const r = await konten.vertretungBeenden(a.sitzung, info(a));
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },
    { methode: 'POST', pfad: '/api/konto/einrichten', zugang: 'offen', handler: async (a) => {
      const r = await konten.einrichten(b(a), info(a));
      return { status: 201, body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },
    { methode: 'POST', pfad: '/api/konto/anmelden', zugang: 'offen', handler: async (a) => {
      const r = await konten.anmelden(b(a), a.ip, a.geraet);
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
      const r = await konten.passwortSetzen(b(a), info(a));
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },

    /* ---------- Eigenes Profil ---------- */
    { methode: 'PUT', pfad: '/api/konto/profil', zugang: 'angemeldet', handler: async (a) => ok(await konten.aendereProfil(ich(a), b(a))) },
    { methode: 'PUT', pfad: '/api/konto/email', zugang: 'angemeldet', handler: async (a) => ok(await konten.aendereEmail(ich(a), b(a), log)) },
    { methode: 'PUT', pfad: '/api/konto/passwort', zugang: 'angemeldet', handler: async (a) => {
      const r = await konten.aenderePasswort(ich(a), b(a), log, info(a));
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },

    /* ---------- Benutzer ---------- */
    { methode: 'GET', pfad: '/api/personen', zugang: 'angemeldet', handler: async () => ok(await konten.personen()) },
    { methode: 'GET', pfad: '/api/benutzer', zugang: 'admin', handler: async () => ok(await konten.listeBenutzer()) },
    { methode: 'POST', pfad: '/api/benutzer', zugang: 'admin', handler: async (a) => ok(await konten.legeBenutzerAn(b(a)), 201) },
    { methode: 'PUT', pfad: '/api/benutzer/:id', zugang: 'admin', handler: async (a) => ok(await konten.aendereBenutzer(ich(a), a.params.id, b(a))) },
    { methode: 'DELETE', pfad: '/api/benutzer/:id', zugang: 'admin', handler: async (a) => { await konten.loescheBenutzer(ich(a), a.params.id); return leer; } },
    { methode: 'POST', pfad: '/api/benutzer/:id/link', zugang: 'admin', handler: async (a) => ok(await konten.neuerLink(a.params.id)) },
    { methode: 'GET', pfad: '/api/benutzer/:id/sitzungen', zugang: 'admin', handler: async (a) => ok(await konten.sitzungenVon(a.params.id, a.sitzungsDaten?.id)) },
    { methode: 'DELETE', pfad: '/api/benutzer/:id/sitzungen', zugang: 'admin', handler: async (a) => ok(await konten.beendeAlleSitzungen(a.params.id)) },
    { methode: 'DELETE', pfad: '/api/benutzer/:id/sitzungen/:sitzung', zugang: 'admin', handler: async (a) => {
      await konten.beendeSitzung(a.params.id, a.params.sitzung); return leer;
    } },
    { methode: 'POST', pfad: '/api/benutzer/:id/vertreten', zugang: 'admin', handler: async (a) => {
      const r = await konten.vertrete(ich(a), a.sitzung, a.params.id, info(a));
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },

    /* ---------- Mappentypen ---------- */
    { methode: 'GET', pfad: '/api/typen', zugang: 'angemeldet', handler: async () => ok(await dienst.listeTypen()) },
    { methode: 'POST', pfad: '/api/typen', zugang: 'admin', handler: async (a) => ok(await dienst.legeTypAn(a.body), 201) },
    { methode: 'PUT', pfad: '/api/typen/:id', zugang: 'admin', handler: async (a) => ok(await dienst.aendereTyp(a.params.id, a.body)) },
    { methode: 'DELETE', pfad: '/api/typen/:id', zugang: 'admin', handler: async (a) => { await dienst.loescheTyp(a.params.id); return leer; } },
    { methode: 'POST', pfad: '/api/beispiele', zugang: 'admin', handler: async (a) => { await ladeBeispiele(dienst, ich(a).id); return leer; } },
    { methode: 'GET', pfad: '/api/werkbank/demo', zugang: 'admin', handler: async () => ok(await dienst.demoUebersicht()) },
    // Erzeugen und Entfernen laufen im Hintergrund (202); den Stand liefert /api/werkbank/auftrag.
    { methode: 'POST', pfad: '/api/werkbank/demo', zugang: 'admin', handler: async (a) => {
      const anzahl = pruefeAnzahl(b(a).anzahl);
      const benutzerId = ich(a).id;
      return ok(dienst.auftraege.starte('demo-erzeugen', `${anzahl} Demo-Mappen erzeugen`, (f) => erzeugeDemo(dienst, anzahl, benutzerId, f)), 202);
    } },
    { methode: 'DELETE', pfad: '/api/werkbank/demo', zugang: 'admin', handler: async () =>
      ok(dienst.auftraege.starte('demo-entfernen', 'Demo-Mappen entfernen', () => dienst.entferneDemo()), 202) },
    { methode: 'GET', pfad: '/api/werkbank/auftrag', zugang: 'admin', handler: async () => ok(dienst.auftraege.aktuell()) },

    /* ---------- Mappen ---------- */
    // Mit ?sicht=… seitenweise (von, anzahl, suche); ohne: alle Mappen (für Skripte und Tests).
    { methode: 'GET', pfad: '/api/mappen', zugang: 'angemeldet', handler: async (a) =>
      ok(a.query.sicht ? await dienst.seite(ich(a), a.query) : await dienst.listeMappen(a.query.typ)) },
    { methode: 'GET', pfad: '/api/sichten', zugang: 'angemeldet', handler: async (a) => ok(await dienst.zaehler(ich(a))) },
    { methode: 'GET', pfad: '/api/typen/:id/belegung', zugang: 'admin', handler: async (a) => ok(await dienst.belegung(a.params.id)) },
    { methode: 'GET', pfad: '/api/mappen/:id', zugang: 'angemeldet', handler: async (a) => ok(await dienst.holeMappe(a.params.id)) },
    { methode: 'POST', pfad: '/api/mappen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.legeMappeAn(a.body, ich(a).id), 201) },
    { methode: 'PUT', pfad: '/api/mappen/:id', zugang: 'angemeldet', handler: async (a) => ok(await dienst.aendereMappe(a.params.id, a.body, ich(a).id)) },
    { methode: 'DELETE', pfad: '/api/mappen/:id', zugang: 'angemeldet', handler: async (a) => { await dienst.loescheMappe(a.params.id); return leer; } },

    /* ---------- Dokumente ---------- */
    { methode: 'POST', pfad: '/api/mappen/:id/dokumente', zugang: 'angemeldet', roh: MAX_DATEIGROESSE, handler: async (a) =>
      ok(await dienst.ladeHoch(a.params.id, { register: a.query.register, name: a.query.name, typ: a.query.typ }, a.body, ich(a).id), 201) },
    { methode: 'GET', pfad: '/api/dokumente/:id/inhalt', zugang: 'angemeldet', handler: async (a) => {
      const { dokument: d, inhalt } = await dienst.dokumentInhalt(a.params.id);
      const anzeigen = d.anzeigbar && a.query.herunterladen === undefined;
      return { datei: { inhalt, name: d.name, mime: d.anzeigbar ? d.mime : 'application/octet-stream', anzeigen, groesse: d.groesse } };
    } },
    { methode: 'DELETE', pfad: '/api/dokumente/:id', zugang: 'angemeldet', handler: async (a) => { await dienst.loescheDokument(a.params.id); return leer; } },
  ];
}

/** Kopfzeilen für eine ausgelieferte Datei – so, dass sie nie als Teil der Anwendung ausgeführt wird. */
export function dateiKoepfe(d: Datei): Record<string, string> {
  const ascii = d.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const k: Record<string, string> = {
    'content-type': d.mime,
    'content-length': String(d.groesse),
    'content-disposition': `${d.anzeigen ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.name)}`,
    'x-content-type-options': 'nosniff',
    'cache-control': 'private, max-age=0, must-revalidate',
  };
  // PDFs brauchen den eingebauten Betrachter des Browsers; alles andere läuft in einer Sandbox.
  if (d.mime !== 'application/pdf') k['content-security-policy'] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";
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
  const anmeldung = await konten.anmeldungZu(a.sitzung);
  a.benutzer = anmeldung?.benutzer;
  a.sitzungsDaten = anmeldung?.sitzung;
  if (r.methode !== 'GET' && kopf('x-dms') !== '1') throw new Fachfehler(403, 'Anfrage ohne Kennung der Oberfläche abgelehnt.');
  if (r.zugang === 'offen') return;
  if (!a.benutzer) throw new Fachfehler(401, 'Bitte anmelden.');
  if (r.zugang === 'admin' && a.benutzer.rolle !== 'admin') throw new Fachfehler(403, 'Dafür sind Administratorrechte nötig.');
}
