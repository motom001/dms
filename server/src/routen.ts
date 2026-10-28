import type { Readable } from 'node:stream';
import { MAX_DATEIGROESSE, type Benutzer } from '../../shared/src/model';
import { ladeBeispiele } from './beispiele';
import { erzeugeDemo, pruefeAnzahl } from './demo';
import type { Dienst } from './dienst';
import { Fachfehler } from './fehler';
import { SITZUNG_TAGE, type Konten } from './konten';
import type { SitzungIntern } from './konto-repo';
import { openapi, v1Routen } from './api-v1';
import type { ApiSchluessel, ApiSchluesselDienst } from './apischluessel';
import type { Designs } from './designs';
import type { Messung } from './messung';
import { eigeneVersion, uebersicht, versionsabgleich, type SystemQuelle } from './system';
import { MODULE, protokoll, STUFEN, type Stufe } from './protokoll';
import type { Betrieb } from './betrieb';
import type { Tresor } from './tresor';

const L = {
  konto: protokoll.modul('konto'), ablage: protokoll.modul('ablage'), werkbank: protokoll.modul('werkbank'),
  dokumente: protokoll.modul('dokumente'), system: protokoll.modul('system'), mail: protokoll.modul('mail'),
};

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
  /** Angemeldet über einen API-Schlüssel (nur /api/v1). */
  apiSchluessel?: ApiSchluessel;
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
  /** Teil der öffentlichen API (/api/v1): API-Schlüssel erlaubt. */
  api?: boolean;
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

export interface RoutenExtras {
  messung?: Messung;
  /** Datenbankangaben für die Versionsübersicht. */
  system?: SystemQuelle;
  /** E-Mail-Versand und Adresse des DMS (#37). */
  betrieb?: Betrieb;
  /** Designs der Oberfläche (#21). */
  designs?: Designs;
  /** Schlüssel für verschlüsselte Zugangsdaten (#39). */
  tresor?: Tresor;
  /** API-Schlüssel (#20). */
  apiSchluessel?: ApiSchluesselDienst;
  /** Für Tests: Abruf fremder Adressen beim Versionsabgleich. */
  abruf?: (url: string) => Promise<unknown>;
  log?: (m: string) => void;
}

export function routen(dienst: Dienst, konten: Konten, x: RoutenExtras = {}): Route[] {
  const { messung, system } = x;
  const designs = () => { if (!x.designs) throw new Fachfehler(404, 'Designs sind nicht eingerichtet.'); return x.designs; };
  const log = x.log ?? ((m: string) => L.mail.warn(m));
  const typName = async (id: string) => (await dienst.listeTypen()).find((t) => t.id === id)?.name ?? id;
  const betrieb = () => { if (!x.betrieb) throw new Fachfehler(404, 'Betriebseinstellungen sind nicht eingerichtet.'); return x.betrieb; };
  const tresor = () => { if (!x.tresor) throw new Fachfehler(404, 'Die Verschlüsselung ist nicht eingerichtet.'); return x.tresor; };
  const schluessel = () => { if (!x.apiSchluessel) throw new Fachfehler(404, 'API-Schlüssel sind nicht eingerichtet.'); return x.apiSchluessel; };
  /** Benutzer mit ihren weiteren Rollen (#27). */
  const mitRollen = async (b: Benutzer) => ({ ...b, rollen: (await dienst.weitereRollen()).get(b.id) ?? [] });
  const intern: Route[] = [
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
      L.konto.warn('Vertretung beendet, zurück im eigenen Konto', { als: a.benutzer?.email, admin: r.benutzer?.email });
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },
    { methode: 'POST', pfad: '/api/konto/einrichten', zugang: 'offen', handler: async (a) => {
      const r = await konten.einrichten(b(a), info(a));
      L.konto.info('Administrator eingerichtet', { email: r.benutzer.email });
      return { status: 201, body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },
    { methode: 'POST', pfad: '/api/konto/anmelden', zugang: 'offen', handler: async (a) => {
      let r;
      try { r = await konten.anmelden(b(a), a.ip, a.geraet); } catch (e) {
        L.konto.warn('Anmeldung fehlgeschlagen', { email: String(b(a).email ?? ''), ip: a.ip, grund: (e as Error).message });
        throw e;
      }
      L.konto.info('Angemeldet', { email: r.benutzer.email, ip: a.ip, geraet: a.geraet });
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },
    { methode: 'POST', pfad: '/api/konto/abmelden', zugang: 'offen', handler: async (a) => {
      await konten.abmelden(a.sitzung);
      if (a.benutzer) L.konto.info('Abgemeldet', { email: a.benutzer.email });
      return { status: 204, sitzungSetzen: null };
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

    { methode: 'GET', pfad: '/api/konto/einstellungen', zugang: 'angemeldet', handler: async (a) => ok(await konten.einstellungen(ich(a))) },
    { methode: 'PUT', pfad: '/api/konto/einstellungen/:schluessel', zugang: 'angemeldet', handler: async (a) => {
      let k = a.params.schluessel;
      try { k = decodeURIComponent(k); } catch { /* bleibt, wie er ist */ }
      await konten.setzeEinstellung(ich(a), k, b(a).wert);
      return leer;
    } },

    /* ---------- Benutzer ---------- */
    { methode: 'GET', pfad: '/api/personen', zugang: 'angemeldet', handler: async () => ok(await konten.personen()) },
    { methode: 'GET', pfad: '/api/benutzer', zugang: 'admin', handler: async () => {
      const rollen = await dienst.weitereRollen();
      return ok((await konten.listeBenutzer()).map((x) => ({ ...x, rollen: rollen.get(x.id) ?? [] })));
    } },
    { methode: 'POST', pfad: '/api/benutzer', zugang: 'admin', handler: async (a) => {
      if (b(a).rollen !== undefined) await dienst.pruefeRollen(b(a).rollen);
      const r = await konten.legeBenutzerAn(b(a), ich(a).id);
      if (b(a).rollen !== undefined) await dienst.setzeRollen(r.benutzer.id, b(a).rollen, ich(a).id);
      L.konto.info('Benutzer angelegt', { email: r.benutzer.email, rolle: r.benutzer.rolle, mail: r.mailVerschickt });
      if (r.mailFehler) L.mail.warn('Einladung nicht verschickt', { an: r.benutzer.email, fehler: r.mailFehler });
      return ok({ ...r, benutzer: await mitRollen(r.benutzer) }, 201);
    } },
    { methode: 'PUT', pfad: '/api/benutzer/:id', zugang: 'admin', handler: async (a) => {
      // Weitere Rollen zuerst prüfen, damit eine ungültige Auswahl nichts halb ändert.
      if (b(a).rollen !== undefined) {
        if (!(await konten.listeBenutzer()).some((x) => x.id === a.params.id)) throw new Fachfehler(404, 'Diesen Benutzer gibt es nicht.');
        await dienst.pruefeRollen(b(a).rollen);
      }
      const r = await konten.aendereBenutzer(ich(a), a.params.id, b(a));
      if (b(a).rollen !== undefined) await dienst.setzeRollen(r.id, b(a).rollen, ich(a).id);
      L.konto.info('Benutzer geändert', { email: r.email, aenderung: b(a) });
      return ok(await mitRollen(r));
    } },
    { methode: 'GET', pfad: '/api/rollen', zugang: 'admin', handler: async () => ok(await dienst.listeRollen()) },
    { methode: 'DELETE', pfad: '/api/benutzer/:id', zugang: 'admin', handler: async (a) => {
      await konten.loescheBenutzer(ich(a), a.params.id);
      L.konto.info('Benutzer gelöscht', { id: a.params.id });
      return leer;
    } },
    { methode: 'POST', pfad: '/api/benutzer/:id/link', zugang: 'admin', handler: async (a) => {
      const r = await konten.neuerLink(a.params.id);
      L.konto.info('Passwort-Link erzeugt', { email: r.benutzer.email, mail: r.mailVerschickt });
      return ok(r);
    } },
    { methode: 'GET', pfad: '/api/benutzer/:id/sitzungen', zugang: 'admin', handler: async (a) => ok(await konten.sitzungenVon(a.params.id, a.sitzungsDaten?.id)) },
    { methode: 'DELETE', pfad: '/api/benutzer/:id/sitzungen', zugang: 'admin', handler: async (a) => {
      const r = await konten.beendeAlleSitzungen(a.params.id);
      L.konto.info('Alle Sitzungen eines Benutzers beendet', { id: a.params.id, anzahl: r.beendet });
      return ok(r);
    } },
    { methode: 'DELETE', pfad: '/api/benutzer/:id/sitzungen/:sitzung', zugang: 'admin', handler: async (a) => {
      await konten.beendeSitzung(a.params.id, a.params.sitzung);
      L.konto.info('Sitzung beendet', { id: a.params.id, sitzung: a.params.sitzung });
      return leer;
    } },
    { methode: 'POST', pfad: '/api/benutzer/:id/vertreten', zugang: 'admin', handler: async (a) => {
      const r = await konten.vertrete(ich(a), a.sitzung, a.params.id, info(a));
      L.konto.warn('Administrator agiert als anderer Benutzer', { admin: ich(a).email, als: r.benutzer.email });
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },

    /* ---------- Mappentypen ---------- */
    { methode: 'GET', pfad: '/api/typen', zugang: 'angemeldet', handler: async () => ok(await dienst.listeTypen()) },
    { methode: 'POST', pfad: '/api/typen', zugang: 'admin', handler: async (a) => {
      const t = await dienst.legeTypAn(a.body);
      L.werkbank.info('Mappentyp angelegt', { typ: t.name, id: t.id, felder: t.felder.length });
      return ok(t, 201);
    } },
    { methode: 'PUT', pfad: '/api/typen/:id', zugang: 'admin', handler: async (a) => {
      const start = Date.now();
      const t = await dienst.aendereTyp(a.params.id, a.body);
      L.werkbank.info('Mappentyp geändert, Titel und Passung neu berechnet', { typ: t.name, id: t.id, ms: Date.now() - start });
      return ok(t);
    } },
    { methode: 'DELETE', pfad: '/api/typen/:id', zugang: 'admin', handler: async (a) => {
      const name = await typName(a.params.id);
      await dienst.loescheTyp(a.params.id);
      L.werkbank.info('Mappentyp gelöscht', { typ: name, id: a.params.id });
      return leer;
    } },
    { methode: 'POST', pfad: '/api/beispiele', zugang: 'admin', handler: async (a) => {
      await ladeBeispiele(dienst, ich(a).id);
      L.werkbank.info('Beispiel-Mappentypen geladen');
      return leer;
    } },
    { methode: 'GET', pfad: '/api/werkbank/demo', zugang: 'admin', handler: async () => ok(await dienst.demoUebersicht()) },
    // Erzeugen und Entfernen laufen im Hintergrund (202); den Stand liefert /api/werkbank/auftrag.
    { methode: 'POST', pfad: '/api/werkbank/demo', zugang: 'admin', handler: async (a) => {
      const anzahl = pruefeAnzahl(b(a).anzahl);
      const benutzerId = ich(a).id;
      L.werkbank.info('Demo-Mappen werden erzeugt', { anzahl });
      return ok(dienst.auftraege.starte('demo-erzeugen', `${anzahl} Demo-Mappen erzeugen`, (f) => erzeugeDemo(dienst, anzahl, benutzerId, f)), 202);
    } },
    { methode: 'DELETE', pfad: '/api/werkbank/demo', zugang: 'admin', handler: async () =>
      ok(dienst.auftraege.starte('demo-entfernen', 'Demo-Mappen entfernen', () => dienst.entferneDemo()), 202) },
    { methode: 'GET', pfad: '/api/werkbank/auftrag', zugang: 'admin', handler: async () => ok(dienst.auftraege.aktuell()) },

    /* ---------- Protokoll und Debug-Modus ---------- */
    { methode: 'GET', pfad: '/api/werkbank/protokoll', zugang: 'admin', handler: async (a) => {
      const q = a.query;
      const stufe = (STUFEN as readonly string[]).includes(q.stufe ?? '') ? (q.stufe as Stufe) : undefined;
      const eintraege = protokoll.eintraege({
        seit: Number(q.seit) || undefined, stufe, modul: q.modul || undefined, benutzer: q.benutzer || undefined, anfrage: q.anfrage || undefined,
        suche: q.suche?.slice(0, 200) || undefined, max: Math.min(2000, Number(q.max) || 500),
      });
      return ok({ eintraege, letzte: protokoll.letzteNr, gespeichert: protokoll.anzahl, debug: protokoll.debugStand, module: MODULE });
    } },
    { methode: 'PUT', pfad: '/api/werkbank/debug', zugang: 'admin', handler: async (a) => {
      const an = !!b(a).an;
      const r = protokoll.setzeDebug(an);
      L.system.warn(an ? `Debug-Modus eingeschaltet bis ${new Date(r.bis!).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' })}` : 'Debug-Modus ausgeschaltet');
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
    { methode: 'PUT', pfad: '/api/designs-standard', zugang: 'admin', handler: async (a) => {
      const r = await designs().setzeStandard(String(b(a).id ?? ''));
      L.werkbank.info('Standard-Design festgelegt', { id: r.standard });
      return ok(r);
    } },

    /* ---------- Technik und Versionen ---------- */
    /* ---------- E-Mail-Versand und Adresse (#37) ---------- */
    /* ---------- Verschlüsselung (#39) ---------- */
    { methode: 'GET', pfad: '/api/werkbank/tresor', zugang: 'admin', handler: async () => ok(await tresor().status()) },
    { methode: 'POST', pfad: '/api/werkbank/tresor/erzeugen', zugang: 'admin', handler: async () => ok(await tresor().erzeuge()) },
    { methode: 'GET', pfad: '/api/werkbank/betrieb', zugang: 'admin', handler: async () => ok(betrieb().ansicht()) },
    { methode: 'PUT', pfad: '/api/werkbank/betrieb/mail', zugang: 'admin', handler: async (a) => ok(await betrieb().speichereMail(b(a))) },
    { methode: 'PUT', pfad: '/api/werkbank/betrieb/adresse', zugang: 'admin', handler: async (a) => ok(await betrieb().speichereAdresse(b(a).adresse)) },
    { methode: 'POST', pfad: '/api/werkbank/betrieb/mail/pruefen', zugang: 'admin', handler: async (a) => ok(await betrieb().pruefeVerbindung(b(a))) },
    { methode: 'POST', pfad: '/api/werkbank/betrieb/mail/testmail', zugang: 'admin', handler: async (a) => ok(await betrieb().sendeTestmail(b(a).mail, b(a).an)) },

    { methode: 'GET', pfad: '/api/werkbank/system', zugang: 'admin', handler: async () => ok(await uebersicht(system, x.betrieb?.kurz())) },
    { methode: 'POST', pfad: '/api/werkbank/system/abgleich', zugang: 'admin', handler: async (a) => {
      const browser = Object.fromEntries(Object.entries((b(a).browser ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
      const start = Date.now();
      const r = await versionsabgleich(await uebersicht(system, x.betrieb?.kurz()), browser, x.abruf);
      L.werkbank.info('Versionsabgleich', { ms: Date.now() - start, neuer: r.filter((v) => v.status === 'neuer' || v.status === 'veraltet').map((v) => v.komponente).join(', ') || undefined });
      return ok(r);
    } },

    /* ---------- Datenbank: lange Zugriffe ---------- */
    { methode: 'GET', pfad: '/api/werkbank/datenbank', zugang: 'admin', handler: async () => {
      if (!messung) return ok({ einstellungen: null, langlaeufer: [], laufend: [] });
      const [langlaeufer, laufend] = await Promise.all([messung.speicher.liste(500), messung.speicher.laufende()]);
      return ok({ einstellungen: messung.einstellungen, langlaeufer, laufend });
    } },
    { methode: 'PUT', pfad: '/api/werkbank/datenbank', zugang: 'admin', handler: async (a) => {
      if (!messung) throw new Fachfehler(404, 'Messung ist nicht aktiv.');
      try {
        const e = await messung.setze({ schwelleMs: b(a).schwelleMs as number, tage: b(a).tage as number });
        L.werkbank.info('Einstellungen für lange Datenbankzugriffe geändert', { ...e });
        return ok(e);
      } catch (e) { throw new Fachfehler(422, (e as Error).message); }
    } },

    /* ---------- Mappen ---------- */
    // Mit ?sicht=… seitenweise (von, anzahl, suche); ohne: alle Mappen (für Skripte und Tests).
    { methode: 'GET', pfad: '/api/mappen', zugang: 'angemeldet', handler: async (a) => {
      if (!a.query.sicht) return ok(await dienst.listeMappen(a.query.typ));
      const start = Date.now();
      const s = await dienst.seite(ich(a), a.query);
      L.ablage.debug('Sicht geladen', { sicht: a.query.sicht, von: s.von, anzahl: s.mappen.length, gesamt: s.gesamt, suche: a.query.suche, ms: Date.now() - start });
      return ok(s);
    } },
    { methode: 'GET', pfad: '/api/sichten', zugang: 'angemeldet', handler: async (a) => ok(await dienst.zaehler(ich(a))) },

    /* ---------- Sichten verwalten (#38, #40, #41) ---------- */
    { methode: 'GET', pfad: '/api/sichten/definitionen', zugang: 'angemeldet', handler: async () => ok(await dienst.listeSichten()) },
    { methode: 'POST', pfad: '/api/sichten/definitionen', zugang: 'admin', handler: async (a) => {
      const s = await dienst.legeSichtAn(a.body);
      L.werkbank.info('Sicht angelegt', { sicht: s.name, typen: s.typen.length, bedingungen: s.bedingungen.length });
      return ok(s, 201);
    } },
    { methode: 'PUT', pfad: '/api/sichten/definitionen/:id', zugang: 'admin', handler: async (a) => {
      const s = await dienst.aendereSicht(a.params.id, a.body);
      L.werkbank.info('Sicht geändert', { sicht: s.name, typen: s.typen.length, bedingungen: s.bedingungen.length });
      return ok(s);
    } },
    { methode: 'DELETE', pfad: '/api/sichten/definitionen/:id', zugang: 'admin', handler: async (a) => {
      await dienst.loescheSicht(a.params.id);
      L.werkbank.info('Sicht gelöscht', { id: a.params.id });
      return leer;
    } },
    { methode: 'PUT', pfad: '/api/sichten/reihenfolge', zugang: 'admin', handler: async (a) => ok(await dienst.ordneSichten(b(a).elternId, b(a).ids)) },
    { methode: 'POST', pfad: '/api/sichten/vorschau', zugang: 'admin', handler: async (a) => ok(await dienst.sichtVorschau(ich(a), b(a).id, b(a).sicht)) },
    { methode: 'GET', pfad: '/api/typen/:id/belegung', zugang: 'admin', handler: async (a) => ok(await dienst.belegung(a.params.id)) },
    { methode: 'GET', pfad: '/api/mappen/:id', zugang: 'angemeldet', handler: async (a) => ok(await dienst.holeMappe(a.params.id)) },
    { methode: 'POST', pfad: '/api/mappen', zugang: 'angemeldet', handler: async (a) => {
      const m = await dienst.legeMappeAn(a.body, ich(a).id);
      L.ablage.info('Mappe angelegt', { typ: await typName(m.typId), titel: m.titel, id: m.id });
      return ok(m, 201);
    } },
    { methode: 'PUT', pfad: '/api/mappen/:id', zugang: 'angemeldet', handler: async (a) => {
      const m = await dienst.aendereMappe(a.params.id, a.body, ich(a).id);
      L.ablage.info('Mappe geändert', { typ: await typName(m.typId), titel: m.titel, id: m.id });
      return ok(m);
    } },
    { methode: 'DELETE', pfad: '/api/mappen/:id', zugang: 'angemeldet', handler: async (a) => {
      await dienst.loescheMappe(a.params.id, ich(a).id);
      L.ablage.info('Mappe gelöscht', { id: a.params.id });
      return leer;
    } },

    /* ---------- Dokumente ---------- */
    { methode: 'POST', pfad: '/api/mappen/:id/dokumente', zugang: 'angemeldet', roh: MAX_DATEIGROESSE, handler: async (a) => {
      const r = await dienst.ladeHoch(a.params.id, { register: a.query.register, name: a.query.name, typ: a.query.typ }, a.body, ich(a).id);
      L.dokumente.info('Dokument hochgeladen', {
        name: r.dokument.name, groesse: r.dokument.groesse, mime: r.dokument.mime, anzeigbar: r.dokument.anzeigbar,
        mappe: a.params.id, gleicherInhalt: r.gleicherInhalt.length || undefined,
      });
      return ok(r, 201);
    } },
    { methode: 'GET', pfad: '/api/dokumente/:id/inhalt', zugang: 'angemeldet', handler: async (a) => {
      const { dokument: d, inhalt } = await dienst.dokumentInhalt(a.params.id);
      const anzeigen = d.anzeigbar && a.query.herunterladen === undefined;
      L.dokumente.debug(anzeigen ? 'Dokument angezeigt' : 'Dokument heruntergeladen', { name: d.name, id: d.id });
      return { datei: { inhalt, name: d.name, mime: d.anzeigbar ? d.mime : 'application/octet-stream', anzeigen, groesse: d.groesse } };
    } },
    { methode: 'DELETE', pfad: '/api/dokumente/:id', zugang: 'angemeldet', handler: async (a) => {
      await dienst.loescheDokument(a.params.id);
      L.dokumente.info('Dokument gelöscht', { id: a.params.id });
      return leer;
    } },

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
  return [
    ...intern,
    ...v1Routen(intern),
    { methode: 'GET', pfad: '/api/openapi.json', zugang: 'offen', handler: doku },
    { methode: 'GET', pfad: '/api/v1/openapi.json', zugang: 'offen', handler: doku },
  ];
}


/** Zu welchem Modul eine Anfrage gehört (für das Protokoll). */
export function modulAus(url: string): string {
  if (/^\/api\/(konto|benutzer|personen|rollen)\b/.test(url)) return 'konto';
  if (/^\/api\/(dokumente|mappen\/[^/]+\/dokumente)\b/.test(url)) return 'dokumente';
  if (/^\/api\/(mappen|sichten)\b/.test(url)) return 'ablage';
  if (/^\/api\/(typen|werkbank|beispiele)\b/.test(url)) return 'werkbank';
  return 'http';
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
export async function pruefeZugang(r: Route, a: Anfrage, kopf: (n: string) => string | undefined, konten: Konten, schluessel?: ApiSchluesselDienst) {
  // Öffentliche API: Anmeldung per API-Schlüssel statt Sitzung; kein X-DMS nötig (kein Cookie im Spiel).
  const auth = kopf('authorization');
  if (r.api && auth && schluessel) {
    const s = await schluessel.pruefe(auth);
    const b = s ? await konten.benutzerMitId(s.benutzerId) : undefined;
    if (!s || !b) throw new Fachfehler(401, 'Der Benutzer dieses Schlüssels ist deaktiviert oder gelöscht.');
    a.benutzer = b; a.apiSchluessel = s;
    if (r.methode !== 'GET' && s.recht === 'lesen') throw new Fachfehler(403, 'Dieser API-Schlüssel darf nur lesen.');
    if (r.zugang === 'admin' && b.rolle !== 'admin') throw new Fachfehler(403, 'Dafür sind Administratorrechte nötig.');
    return;
  }
  const anmeldung = await konten.anmeldungZu(a.sitzung);
  a.benutzer = anmeldung?.benutzer;
  a.sitzungsDaten = anmeldung?.sitzung;
  if (r.methode !== 'GET' && kopf('x-dms') !== '1') throw new Fachfehler(403, 'Anfrage ohne Kennung der Oberfläche abgelehnt.');
  if (r.zugang === 'offen') return;
  if (!a.benutzer) throw new Fachfehler(401, 'Bitte anmelden.');
  if (r.zugang === 'admin' && a.benutzer.rolle !== 'admin') throw new Fachfehler(403, 'Dafür sind Administratorrechte nötig.');
}
