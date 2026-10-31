import type { Readable } from 'node:stream';
import { MAX_DATEIGROESSE, POST_KANAL, type Benutzer, type Mappe } from '../../shared/src/model';
import { type Recht } from '../../shared/src/rechte';
import { ladeBeispiele } from './beispiele';
import { erzeugeDemo, pruefeDemoOptionen, schaetzeDemo, type DemoPlatz } from './demo';
import type { Dienst } from './dienst';
import { Fachfehler } from './fehler';
import { SITZUNG_TAGE, type Konten } from './konten';
import type { SitzungIntern } from './konto-repo';
import { openapi, v1Routen } from './api-v1';
import type { ApiSchluessel, ApiSchluesselDienst } from './apischluessel';
import type { Designs } from './designs';
import type { Messung } from './messung';
import { eigeneVersion, standKennung, uebersicht, versionsabgleich, type SystemQuelle } from './system';
import type { Fehlermeldungen } from './fehlermeldungen';
import { MODULE, protokoll, STUFEN, type Stufe } from './protokoll';
import type { Betrieb } from './betrieb';
import { maskiere, type Tresor } from './tresor';
import type { Texterkennung } from './texterkennung';
import type { Wartung } from './wartung';
import type { Notfallzugang } from './notfall';
import type { Sicherung } from './sicherung';
import type { Wiederherstellung } from './wiederherstellung';
import type { Speicherplatz } from './speicherplatz';
import type { Eingangsordner } from './eingangsordner';
import type { Postfaecher } from './postfach';
import type { OrdnerPruefung } from './ordner';
import type { Einrichtung } from './einrichtung';
import type { AnbindungVerwaltung } from './anbindung';
import { notfallblatt } from './notfallblatt';
import { dirname } from 'node:path';
import { WartungFehler } from './wartung';
import { MAIL_STANDARD, pruefeZeit, STANDARD_TAGE, wirksameZeit, type Aufgabenmail, type MailZeit } from './aufgabenmail';

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
  /** Kopf X-Einrichtungscode (#119), solange das DMS nicht eingerichtet ist. */
  einrichtungscode?: string;
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
  /** Texterkennung und Volltext (#45). */
  texterkennung?: Texterkennung;
  /** Tägliche Zusammenfassung der Aufgaben (#54). */
  aufgabenmail?: Aufgabenmail;
  /** Fehlermeldungen von Benutzern (#70). */
  fehlermeldungen?: Fehlermeldungen;
  /** API-Schlüssel (#20). */
  apiSchluessel?: ApiSchluesselDienst;
  /** Wartungsmodus (#102). */
  wartung?: Wartung;
  /** Notfallzugang über eine RESCUE-Datei (#108). */
  notfall?: Notfallzugang;
  /** Sicherungen (#103–#105). */
  sicherung?: Sicherung;
  /** Wiederherstellen und Probe (#107, #109). */
  wiederherstellung?: Wiederherstellung;
  /** Speicherplatz-Überwachung (#116). */
  speicherplatz?: Speicherplatz;
  /** Eingangsordner (#195). */
  eingangsordner?: Eingangsordner;
  /** Postfächer (#196). */
  postfaecher?: Postfaecher;
  /** Feste Ordner und überflüssige frühere Variablen (#115). */
  ordner?: OrdnerPruefung;
  /** Einrichtungsassistent und Datenbank-Anbindung (#119). */
  einrichtung?: Einrichtung;
  anbindung?: AnbindungVerwaltung;
  /** Hinweis zu HAUSHALT_ID (übernommen oder abweichend). */
  mandantHinweis?: string | null;
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
  const mail = () => { if (!x.aufgabenmail) throw new Fachfehler(404, 'Die Aufgaben-Mail ist nicht eingerichtet.'); return x.aufgabenmail; };
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
  const ocr = () => { if (!x.texterkennung) throw new Fachfehler(404, 'Die Texterkennung ist nicht eingerichtet.'); return x.texterkennung; };
  const meldungen = () => { if (!x.fehlermeldungen) throw new Fachfehler(404, 'Fehlermeldungen sind nicht eingerichtet.'); return x.fehlermeldungen; };
  const tresor = () => { if (!x.tresor) throw new Fachfehler(404, 'Die Verschlüsselung ist nicht eingerichtet.'); return x.tresor; };
  const schluessel = () => { if (!x.apiSchluessel) throw new Fachfehler(404, 'API-Schlüssel sind nicht eingerichtet.'); return x.apiSchluessel; };
  /**
   * ?passwoerter=anzeigen (#46): nur mit einem API-Schlüssel, der das Recht „Passwörter lesen“ hat.
   * Liefert den Namen des Schlüssels fürs Protokoll, sonst null.
   */
  const passwoerterAnzeigen = (a: Anfrage): string | null => {
    if (a.query.passwoerter === undefined) return null;
    if (a.query.passwoerter !== 'anzeigen') throw new Fachfehler(422, '„passwoerter“ kennt nur den Wert „anzeigen“.');
    if (!a.apiSchluessel?.passwoerter) throw new Fachfehler(403, 'Passwörter liefert die API nur mit einem API-Schlüssel, der das Recht „Passwörter lesen“ hat.');
    return a.apiSchluessel.name;
  };
  /** Berechtigungen (#124): Zugriff des Benutzers, einmal je Anfrage. */
  const zg = (a: Anfrage) => dienst.zugriff(ich(a));
  /** #137: Empfänger von Aufgaben nur unter den Benutzern, die man sieht. */
  const empfaengerSichtbar = async (a: Anfrage, id: unknown) => {
    if (typeof id !== 'string' || !id) return;
    if (!(await dienst.lesbare(await zg(a), [id])).has(id)) throw new Fachfehler(422, 'Diesen Benutzer gibt es nicht.');
  };
  /** #127: Darf der Empfänger die Mappe lesen? Sonst ein Hinweis in der Antwort. */
  const leseHinweis = async (empfaengerId: string | null, mappeId: string) =>
    (empfaengerId && !(await dienst.kannLesen(empfaengerId, mappeId)) ? { hinweis: 'Gespeichert – der Empfänger darf diese Mappe nach den Berechtigungen aber nicht lesen.' } : {});
  const darf = async (a: Anfrage, mappeId: string, recht: Recht) => dienst.pruefeRecht(await zg(a), mappeId, recht);
  /** Klartext von Passwörtern nur für Mappen mit Recht P; die anderen bleiben verdeckt. */
  const entschluessele = async <T extends Mappe>(a: Anfrage, mappen: T[], klartext: string): Promise<T[]> => {
    const { mit } = await dienst.mitPasswortRecht(await zg(a), mappen);
    const klar = new Map((await dienst.entschluesselePasswoerter(mit, klartext, ich(a).id)).map((m) => [m.id, m]));
    return mappen.map((m) => klar.get(m.id) ?? m);
  };
  /** Benutzer mit ihren weiteren Rollen (#27). */
  const mitRollen = async (b: Benutzer) => ({ ...b, rollen: (await dienst.weitereRollen()).get(b.id) ?? [] });
  const sicherung = () => { if (!x.sicherung) throw new Fachfehler(404, 'Sicherungen sind nicht eingerichtet.'); return x.sicherung; };
  const postfaecher = () => { if (!x.postfaecher) throw new Fachfehler(404, 'Postfächer sind nicht eingerichtet.'); return x.postfaecher; };
  /** Demo-Dokumente (#248): freier Platz bei den Dateien; frei bleiben müssen Mindest-Speicherplatz der Sicherung bzw. die Speicherplatz-Grenze. */
  const demoPlatz: DemoPlatz | undefined = x.speicherplatz ? {
    frei: async () => (await x.speicherplatz!.messe()).ordner.find((o) => o.art === 'dateien')?.frei ?? null,
    mindest: async () => {
      const grenze = (await x.speicherplatz!.messe()).ordner.find((o) => o.art === 'dateien')?.grenzBytes ?? 0;
      const sich = x.sicherung ? (await x.sicherung.plan()).mindestFreiGB * 1024 ** 3 : 0;
      return Math.max(grenze, sich);
    },
  } : undefined;
  const wh = () => { if (!x.wiederherstellung) throw new Fachfehler(404, 'Die Wiederherstellung ist nicht eingerichtet.'); return x.wiederherstellung; };
  const anbindung = () => { if (!x.anbindung) throw new Fachfehler(404, 'Die Datenbank-Anbindung ist hier nicht einstellbar.'); return x.anbindung; };
  const speicherplatz = () => { if (!x.speicherplatz) throw new Fachfehler(404, 'Die Speicherplatz-Überwachung ist nicht eingerichtet.'); return x.speicherplatz; };
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
  const wartung = () => { if (!x.wartung) throw new Fachfehler(404, 'Der Wartungsmodus ist nicht eingerichtet.'); return x.wartung; };
  /** Ab der Ankündigung kommen nur Administratoren hinein (#102): eine neue Sitzung gleich wieder beenden. */
  const nurAdminsInWartung = async (r: { benutzer: Benutzer; schluessel: string }) => {
    if (!x.wartung?.sperrtAnmeldung(r.benutzer)) return;
    await konten.abmelden(r.schluessel);
    L.konto.info('Anmeldung im Wartungsmodus abgewiesen', { email: r.benutzer.email });
    throw new WartungFehler(x.wartung.meldung(), x.wartung.retryAfter());
  };
  const intern: Route[] = [
    { methode: 'GET', pfad: '/api/gesundheit', zugang: 'offen', handler: async () => ok({ ok: true, stand: standKennung() }) },
    // Wartungsmodus (#102): für Banner und Anmeldeseite, auch ohne Anmeldung.
    { methode: 'GET', pfad: '/api/wartung', zugang: 'offen', handler: async () => ok(x.wartung?.oeffentlich() ?? { stufe: 'aus', text: '', ende: null, aktivAb: null, sekunden: null }) },

    /* ---------- Konto ---------- */
    { methode: 'GET', pfad: '/api/konto/status', zugang: 'offen', handler: async (a) => ok({
      einrichtungNoetig: await konten.einrichtungNoetig(),
      // Einrichtungsassistent (#119): Code nötig? Weitere Schritte für den Administrator offen?
      einrichtung: x.einrichtung ? { phase: 'konto', code: x.einrichtung.codeNoetig, assistent: a.benutzer?.rolle === 'admin' && !a.sitzungsDaten?.vertretungId ? (await x.einrichtung.stand()).offen : false } : null,
      mail: konten.mailAktiv,
      benutzer: a.benutzer ?? null,
      // Ohne Schlüssel (Werkbank → Verschlüsselung) lassen sich keine Passwörter speichern (#39, #46).
      passwoerterMoeglich: dienst.passwoerterMoeglich,
      // Logo und Schriftzug des Standard-Designs für die Anmeldeseite (#72).
      marke: x.designs ? await x.designs.marke() : null,
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
    { methode: 'POST', pfad: '/api/einrichtung/code', zugang: 'offen', handler: async (a) => {
      if (!x.einrichtung) throw new Fachfehler(404, 'Kein Einrichtungsassistent.');
      await x.einrichtung.pruefeCode(a.einrichtungscode);
      return ok({ ok: true });
    } },
    { methode: 'POST', pfad: '/api/konto/einrichten', zugang: 'offen', handler: async (a) => {
      const r = x.einrichtung ? await x.einrichtung.einrichten(b(a), a.einrichtungscode, info(a)) : await konten.einrichten(b(a), info(a));
      L.konto.info('Administrator eingerichtet', { email: r.benutzer.email });
      return { status: 201, body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },
    { methode: 'POST', pfad: '/api/konto/anmelden', zugang: 'offen', handler: async (a) => {
      let r;
      try { r = await konten.anmelden(b(a), a.ip, a.geraet); } catch (e) {
        L.konto.warn('Anmeldung fehlgeschlagen', { email: String(b(a).email ?? ''), ip: a.ip, grund: (e as Error).message });
        throw e;
      }
      await nurAdminsInWartung(r);
      L.konto.info('Angemeldet', { email: r.benutzer.email, ip: a.ip, geraet: a.geraet });
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },
    { methode: 'POST', pfad: '/api/konto/abmelden', zugang: 'offen', handler: async (a) => {
      // Papierkorb beim Abmelden leeren, wenn im Profil so eingestellt (#43) – nicht, solange ein Administrator vertritt.
      if (a.benutzer && !a.sitzungsDaten?.vertretungId && (await konten.einstellungen(a.benutzer)).papierkorb_beim_abmelden === true) {
        await dienst.leerePapierkorb(a.benutzer).catch((e) => L.ablage.warn('Papierkorb beim Abmelden nicht geleert', { fehler: (e as Error).message }));
      }
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
      await nurAdminsInWartung(r);
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

    /* ---------- Benutzer ---------- */
    // #137: nur Benutzer, deren Benutzer-Mappe man lesen darf (Administratoren: alle).
    { methode: 'GET', pfad: '/api/personen', zugang: 'angemeldet', handler: async (a) => {
      const alle = await konten.personen();
      const sichtbar = await dienst.lesbare(await zg(a), alle.map((p) => p.id));
      return ok(alle.filter((p) => sichtbar.has(p.id)));
    } },
    { methode: 'GET', pfad: '/api/benutzer', zugang: 'admin', handler: async () => {
      const rollen = await dienst.weitereRollen();
      // Offene Aufgaben je Benutzer (#77): Deaktivieren geht erst ohne.
      const offen = new Map<string, number>();
      for (const x of await dienst.alleAufgaben()) if (x.empfaengerId) offen.set(x.empfaengerId, (offen.get(x.empfaengerId) ?? 0) + 1);
      return ok((await konten.listeBenutzer()).map((x) => ({ ...x, rollen: rollen.get(x.id) ?? [], offeneAufgaben: offen.get(x.id) ?? 0 })));
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
    // Eigene angemeldete Geräte (#69): ansehen und beenden – nicht während einer Vertretung.
    { methode: 'GET', pfad: '/api/konto/sitzungen', zugang: 'angemeldet', handler: async (a) => ok(await konten.sitzungenVon(ich(a).id, a.sitzungsDaten?.id)) },
    { methode: 'DELETE', pfad: '/api/konto/sitzungen/:sitzung', zugang: 'angemeldet', handler: async (a) => {
      if (a.sitzungsDaten?.vertretungId) throw new Fachfehler(403, 'In einer Vertretung lassen sich Sitzungen nicht beenden.');
      if (a.params.sitzung === a.sitzungsDaten?.id) throw new Fachfehler(409, 'Das ist dieses Gerät. Zum Beenden bitte abmelden.');
      await konten.beendeSitzung(ich(a).id, a.params.sitzung);
      L.konto.info('Eigene Sitzung beendet', { sitzung: a.params.sitzung.slice(0, 8) });
      return leer;
    } },
    { methode: 'POST', pfad: '/api/konto/sitzungen/andere-beenden', zugang: 'angemeldet', handler: async (a) => {
      if (a.sitzungsDaten?.vertretungId) throw new Fachfehler(403, 'In einer Vertretung lassen sich Sitzungen nicht beenden.');
      const r = await konten.beendeAndereSitzungen(ich(a).id, a.sitzungsDaten?.id);
      L.konto.info('Andere eigene Sitzungen beendet', { anzahl: r.beendet });
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
    // Regeln (#123) sehen nur Administratoren; alle anderen erfahren, ob sie anlegen dürfen.
    { methode: 'GET', pfad: '/api/typen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.typenFuer(await zg(a))) },
    { methode: 'GET', pfad: '/api/konto/rechte', zugang: 'angemeldet', handler: async (a) => ok(await dienst.rechteUebersicht(await zg(a))) },
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
      const o = pruefeDemoOptionen(b(a));
      const benutzerId = ich(a).id;
      L.werkbank.info('Demo-Mappen werden erzeugt', { anzahl: o.anzahl, dokumente: !!o.dokumente, startwert: o.startwert ?? null });
      const titel = `${o.anzahl.toLocaleString('de-DE')} Demo-Mappen${o.dokumente ? ' mit Dokumenten' : ''} erzeugen`;
      return ok(dienst.auftraege.starte('demo-erzeugen', titel, async (f) => {
        const r = await erzeugeDemo(dienst, o, benutzerId, f, demoPlatz);
        L.werkbank.info('Demo-Daten erzeugt', { mappen: r.gesamt, dokumente: r.dokumente?.anzahl ?? 0, bytes: r.dokumente?.bytes ?? 0, dauerMs: r.dauerMs, startwert: r.startwert, abgebrochen: r.abgebrochen ?? null });
        return r;
      }), 202);
    } },
    // Abschätzung vor dem Start (#248): Mappen, Dokumente, Größe, Seiten für die Texterkennung, freier Platz.
    { methode: 'POST', pfad: '/api/werkbank/demo/abschaetzung', zugang: 'admin', handler: async (a) => ok(await schaetzeDemo(dienst, pruefeDemoOptionen(b(a)), demoPlatz)) },
    { methode: 'DELETE', pfad: '/api/werkbank/demo', zugang: 'admin', handler: async () =>
      ok(dienst.auftraege.starte('demo-entfernen', 'Demo-Mappen entfernen', (f) => dienst.entferneDemo(f)), 202) },
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
    // Logo je Design (#72): hochladen als rohe Bytes, entfernen, ausliefern (ohne Anmeldung nur das des Standard-Designs).
    { methode: 'PUT', pfad: '/api/designs/:id/logo', zugang: 'admin', roh: 1024 * 1024 + 1024, handler: async (a) => {
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
    { methode: 'GET', pfad: '/api/werkbank/texterkennung', zugang: 'admin', handler: async (a) => ok(await ocr().status(a.query.neu !== undefined)) },
    // Aufträge der Texterkennung einsehen, neu starten, abbrechen (#61)
    { methode: 'GET', pfad: '/api/werkbank/texterkennung/auftraege', zugang: 'admin', handler: async (a) => ok(await ocr().auftraege(a.query)) },
    { methode: 'POST', pfad: '/api/werkbank/texterkennung/auftraege/neu', zugang: 'admin', handler: async (a) => ok(await ocr().neuStarten(b(a).ids, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/texterkennung/auftraege/fehler-neu', zugang: 'admin', handler: async (a) => ok(await ocr().fehlerNeuStarten(ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/texterkennung/auftraege/abbrechen', zugang: 'admin', handler: async (a) => ok(await ocr().abbrechen(b(a).ids, ich(a).email)) },
    { methode: 'PUT', pfad: '/api/werkbank/texterkennung', zugang: 'admin', handler: async (a) => { await ocr().speichere(a.body); return ok(await ocr().status()); } },
    { methode: 'POST', pfad: '/api/werkbank/wartung/volltext', zugang: 'admin', handler: async () => ok({ eingereiht: await dienst.volltextNachholen() }) },

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
      const art = await wh().pruefeZugang(a.benutzer?.rolle === 'admin', a.einrichtungscode);
      return ok({ art, ordner: sicherung().ordner, liste: (await sicherung().liste()).map((e) => ({ name: e.name, bytes: e.bytes, meta: e.meta })) });
    } },
    { methode: 'POST', pfad: '/api/wiederherstellung/abgleich', zugang: 'offen', handler: async (a) => {
      await wh().pruefeZugang(a.benutzer?.rolle === 'admin', a.einrichtungscode);
      return ok(await wh().abgleich(String(b(a).name ?? ''), typeof b(a).schluessel === 'string' ? b(a).schluessel as string : undefined));
    } },
    { methode: 'POST', pfad: '/api/wiederherstellung/start', zugang: 'offen', handler: async (a) => ok(await wh().starte(b(a), a.benutzer?.rolle === 'admin' ? a.benutzer : null, a.einrichtungscode)) },
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
    { methode: 'POST', pfad: '/api/werkbank/sicherung/:name/pruefen', zugang: 'admin', handler: async (a) => ok(sicherung().pruefe(a.params.name, ich(a).email)) },
    { methode: 'DELETE', pfad: '/api/werkbank/sicherung/:name', zugang: 'admin', handler: async (a) => { await sicherung().loesche(a.params.name, ich(a).email); return leer; } },
    { methode: 'GET', pfad: '/api/werkbank/notfallblatt', zugang: 'admin', handler: async (a) => {
      const t = tresor();
      const text = t.alsText();
      if (!text || !t.fingerabdruck) throw new Fachfehler(409, 'Es gibt noch keinen passenden Schlüssel. Erzeuge ihn zuerst unter Werkbank → Verschlüsselung.');
      const jetzt = new Date();
      const inhalt = notfallblatt({
        name: (x.designs ? (await x.designs.marke()).schriftzug : null) || 'DMS',
        haushaltId: x.sicherung?.haushaltId ?? '–',
        adresse: x.betrieb ? x.betrieb.ansicht().adresse || x.betrieb.adresseFuerLinks() : '',
        version: eigeneVersion(), erstellt: jetzt, schluessel: text, fingerabdruck: t.fingerabdruck,
        sicherungsordner: x.sicherung?.ordner ?? '/data/sicherung', schluesselordner: dirname(t.datei),
      });
      if (x.sicherung) await x.sicherung.notfallblattErstellt(ich(a).email);
      else L.system.warn('Notfallblatt heruntergeladen', { von: ich(a).email, fingerabdruck: t.fingerabdruck });
      return { datei: { inhalt, name: `DMS-Notfallblatt-${jetzt.toISOString().slice(0, 10)}.pdf`, mime: 'application/pdf', anzeigen: false, groesse: inhalt.length } };
    } },

    { methode: 'GET', pfad: '/api/werkbank/tresor', zugang: 'admin', handler: async () => ok({ ...await tresor().status(), notfallblatt: x.sicherung ? await x.sicherung.notfallblatt() : null }) },
    { methode: 'POST', pfad: '/api/werkbank/tresor/erzeugen', zugang: 'admin', handler: async () => ok(await tresor().erzeuge()) },
    // Schlüssel wechseln (#47): nur mit Bestätigung; danach neues Notfallblatt und neue Sicherung.
    { methode: 'POST', pfad: '/api/werkbank/tresor/wechseln', zugang: 'admin', handler: async (a) => {
      if (b(a).bestaetigt !== true) throw new Fachfehler(400, 'Bitte den Wechsel bestätigen.');
      if (x.sicherung?.laeuft()) throw new Fachfehler(409, 'Gerade läuft eine Sicherung. Bitte warten, bis sie fertig ist.');
      const w = await dienst.schluesselWechseln(ich(a).email);
      const alte = x.sicherung ? (await x.sicherung.liste()).filter((s) => s.meta && s.meta.verschluesselung.fingerabdruck !== w.neu).length : 0;
      return ok({ ...w, alteSicherungen: alte, ...await tresor().status(), notfallblatt: x.sicherung ? await x.sicherung.notfallblatt() : null });
    } },
    { methode: 'GET', pfad: '/api/werkbank/betrieb', zugang: 'admin', handler: async () => ok(betrieb().ansicht()) },
    { methode: 'PUT', pfad: '/api/werkbank/betrieb/mail', zugang: 'admin', handler: async (a) => ok(await betrieb().speichereMail(b(a))) },
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
    { methode: 'POST', pfad: '/api/konto/fehlermeldung', zugang: 'angemeldet', roh: 30 * 1024 * 1024, handler: async (a) => ok(await meldungen().melde(ich(a).id, b(a)), 201) },
    { methode: 'GET', pfad: '/api/werkbank/fehlermeldungen', zugang: 'admin', handler: async (a) => ok(await meldungen().liste(a.query.erledigt !== undefined)) },
    { methode: 'GET', pfad: '/api/werkbank/fehlermeldungen/:id', zugang: 'admin', handler: async (a) => ok(await meldungen().hole(a.params.id)) },
    { methode: 'GET', pfad: '/api/werkbank/fehlermeldungen/:id/bilder/:nr', zugang: 'admin', handler: async (a) => {
      const { bild, inhalt } = await meldungen().bild(a.params.id, Number(a.params.nr));
      return { datei: { inhalt, name: bild.name, mime: bild.mime, anzeigen: true, groesse: bild.groesse } };
    } },
    { methode: 'POST', pfad: '/api/werkbank/fehlermeldungen/:id/erledigt', zugang: 'admin', handler: async (a) => ok(await meldungen().erledigt(a.params.id, b(a).erledigt !== false, ich(a).id)) },
    { methode: 'DELETE', pfad: '/api/werkbank/fehlermeldungen/:id', zugang: 'admin', handler: async (a) => { await meldungen().loesche(a.params.id); return leer; } },
    // Übersicht als Startseite der Werkbank (#68): was zu tun ist, auf einen Blick.
    { methode: 'GET', pfad: '/api/werkbank/uebersicht', zugang: 'admin', handler: async (a) => {
      const sicher = async <T>(f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch { return null; } };
      const ts = x.tresor ? await sicher(() => x.tresor!.status()) : null;
      const z = await dienst.zaehler(ich(a));
      const aufgaben = await dienst.alleAufgaben(false);
      const korb = await dienst.papierkorb(ich(a), true);
      const sys = await uebersicht(system, x.betrieb?.kurz());
      return ok({
        tresor: ts ? { zustand: ts.zustand, eingebunden: ts.eingebunden, betroffen: ts.betroffen.length } : null,
        mail: !!x.betrieb?.mailer(),
        adresse: x.betrieb ? !!x.betrieb.ansicht().adresse : true,
        texterkennung: x.texterkennung ? await sicher(() => x.texterkennung!.zaehler()) : null,
        aufgaben: { offen: aufgaben.length, ohneEmpfaenger: aufgaben.filter((y) => !y.empfaengerId).length },
        unpassend: Object.values(z.typen).reduce((s, t) => s + (t.unpassend ?? 0), 0),
        papierkorb: { anzahl: korb.length, aeltester: korb.reduce<string | null>((m, e) => (!m || e.geloescht < m ? e.geloescht : m), null), tage: await dienst.papierkorbTage() },
        version: sys.dms,
        bestand: 'fehler' in sys.datenbank ? null : sys.datenbank,
        fehlermeldungen: x.fehlermeldungen ? await sicher(() => x.fehlermeldungen!.offen()) : null,
        // Notfallzugänge (#108), bis sie umbenannt oder deaktiviert sind.
        notfallzugaenge: x.notfall ? await sicher(() => x.notfall!.offen()) ?? [] : [],
        wartung: x.wartung?.oeffentlich() ?? null,
        // Sicherung (#105): fehlgeschlagen, zu alt, Speicherort, Notfallblatt.
        sicherung: x.sicherung ? await sicher(() => x.sicherung!.zustand()) : null,
        // Speicherplatz (#116) und frühere Variablen, die entfernt werden können (#115).
        speicherplatz: x.speicherplatz ? await sicher(() => x.speicherplatz!.stand()) : null,
        // #128: Schlüssel, die Administratoren gehören (aus der Zeit vor 0.26), durch die eines normalen Benutzers ersetzen.
        adminSchluessel: x.apiSchluessel ? await sicher(async () => {
          let n = 0;
          for (const b of (await konten.listeBenutzer()).filter((y) => y.rolle === 'admin')) n += (await x.apiSchluessel!.liste(b)).length;
          return n;
        }) ?? 0 : 0,
        variablen: [...(x.ordner?.ueberfluessig ?? []), ...(x.anbindung?.stand().umgebung === 'gleich' ? ['DATABASE_URL'] : []), ...(x.mandantHinweis && process.env.HAUSHALT_ID ? ['HAUSHALT_ID'] : [])],
        // DATABASE_URL weicht von der Anbindung in /data/geheim ab und wird ignoriert (#119).
        anbindung: x.anbindung ? { umgebung: x.anbindung.stand().umgebung, neustartNoetig: x.anbindung.stand().neustartNoetig } : null,
        einrichtung: x.einrichtung ? await sicher(() => x.einrichtung!.stand()) : null,
      });
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
    { methode: 'POST', pfad: '/api/werkbank/berechtigungen/:typId/kopieren', zugang: 'admin', handler: async (a) => {
      const r = await dienst.kopiereRegel(a.params.typId, String(b(a).regelId ?? ''), b(a).ziele);
      L.werkbank.info('Regel kopiert', { typ: a.params.typId, regel: String(b(a).regelId ?? ''), kopiert: r.kopiert, ausgelassen: r.ausgelassen, von: ich(a).email });
      return ok(r);
    } },
    { methode: 'POST', pfad: '/api/werkbank/berechtigungen/testlauf', zugang: 'admin', handler: async (a) => ok(await dienst.testlauf(b(a))) },
    { methode: 'POST', pfad: '/api/werkbank/sichten/testlauf', zugang: 'admin', handler: async (a) => ok(await dienst.sichtTestlauf(b(a))) },
    { methode: 'GET', pfad: '/api/werkbank/berechtigungen/sicht/:benutzerId', zugang: 'admin', handler: async (a) => ok(await dienst.wasSieht(a.params.benutzerId)) },

    /* ---------- Einrichtungsassistent (#119) ---------- */
    { methode: 'GET', pfad: '/api/werkbank/einrichtung', zugang: 'admin', handler: async () => {
      if (!x.einrichtung) throw new Fachfehler(404, 'Kein Einrichtungsassistent.');
      return ok(await x.einrichtung.stand());
    } },
    { methode: 'POST', pfad: '/api/werkbank/einrichtung/schritt', zugang: 'admin', handler: async (a) => {
      if (!x.einrichtung) throw new Fachfehler(404, 'Kein Einrichtungsassistent.');
      return ok(await x.einrichtung.merke(b(a).schritt, b(a).uebersprungen === true, ich(a).email));
    } },
    /* ---------- Datenbank-Anbindung (#119) ---------- */
    { methode: 'GET', pfad: '/api/werkbank/anbindung', zugang: 'admin', handler: async () => ok(anbindung().stand()) },
    { methode: 'POST', pfad: '/api/werkbank/anbindung/pruefen', zugang: 'admin', handler: async (a) => ok(await anbindung().pruefe(b(a).anbindung)) },
    { methode: 'PUT', pfad: '/api/werkbank/anbindung', zugang: 'admin', handler: async (a) => ok(await anbindung().speichere({ ...(b(a).anbindung as object ?? {}), leerBestaetigt: b(a).leerBestaetigt }, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/neustart', zugang: 'admin', handler: async (a) => { anbindung().neustart(ich(a).email); return leer; } },
    /* ---------- Speicherplatz (#116) ---------- */
    // Postfächer (#196): nur Administratoren; Passwörter verlassen den Server nie.
    { methode: 'GET', pfad: '/api/werkbank/postfaecher', zugang: 'admin', handler: async () => ok(await postfaecher().ansicht()) },
    { methode: 'POST', pfad: '/api/werkbank/postfaecher', zugang: 'admin', handler: async (a) => ok(await postfaecher().speichere(a.body, null, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/postfaecher/testen', zugang: 'admin', handler: async (a) => ok(await postfaecher().teste(a.body, typeof (b(a) as { id?: unknown }).id === 'string' ? (b(a) as { id: string }).id : null)) },
    { methode: 'PUT', pfad: '/api/werkbank/postfaecher/:id', zugang: 'admin', handler: async (a) => ok(await postfaecher().speichere(a.body, a.params.id, ich(a).email)) },
    { methode: 'DELETE', pfad: '/api/werkbank/postfaecher/:id', zugang: 'admin', handler: async (a) => { await postfaecher().loesche(a.params.id, ich(a).email); return leer; } },
    { methode: 'POST', pfad: '/api/werkbank/postfaecher/:id/abrufen', zugang: 'admin', handler: async (a) => ok({ uebernommen: await postfaecher().abrufen(a.params.id) }) },
    // Eingangsordner (#195): nur sichtbar, wenn /eingang eingebunden ist.
    { methode: 'GET', pfad: '/api/werkbank/eingangsordner', zugang: 'admin', handler: async () => ok(x.eingangsordner ? await x.eingangsordner.stand() : { vorhanden: false }) },
    { methode: 'PUT', pfad: '/api/werkbank/eingangsordner', zugang: 'admin', handler: async (a) => {
      if (!x.eingangsordner?.vorhanden) throw new Fachfehler(404, 'Es ist kein Eingangsordner eingebunden.');
      return ok(await x.eingangsordner.speichere(a.body, ich(a).email));
    } },
    { methode: 'POST', pfad: '/api/werkbank/eingangsordner/pruefen', zugang: 'admin', handler: async () => {
      if (!x.eingangsordner?.vorhanden) throw new Fachfehler(404, 'Es ist kein Eingangsordner eingebunden.');
      const n = await x.eingangsordner.pruefe(true);
      return ok({ uebernommen: n, stand: await x.eingangsordner.stand() });
    } },
    { methode: 'GET', pfad: '/api/werkbank/speicherplatz', zugang: 'admin', handler: async () => ok(await speicherplatz().pruefe()) },
    { methode: 'PUT', pfad: '/api/werkbank/speicherplatz', zugang: 'admin', handler: async (a) => ok(await speicherplatz().speichere(a.body, ich(a).email)) },
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
      L.ablage.debug('Sicht geladen', { sicht: a.query.sicht, von: s.von, anzahl: s.mappen.length, gesamt: s.gesamt, suche: a.query.suche, ms: Date.now() - start });
      return ok(klartext ? { ...s, mappen: await entschluessele(a, s.mappen.filter((m) => !m.verborgen), klartext) } : s);
    } },
    // Favoriten (#62)
    { methode: 'PUT', pfad: '/api/mappen/:id/favorit', zugang: 'angemeldet', handler: async (a) => { await darf(a, a.params.id, 'R'); return ok(await dienst.setzeFavorit(ich(a), a.params.id, true)); } },
    { methode: 'DELETE', pfad: '/api/mappen/:id/favorit', zugang: 'angemeldet', handler: async (a) => ok(await dienst.setzeFavorit(ich(a), a.params.id, false)) },
    { methode: 'GET', pfad: '/api/sichten', zugang: 'angemeldet', handler: async (a) => ok(await dienst.zaehler(ich(a), await zg(a))) },

    /* ---------- Sichten verwalten (#38, #40, #41) ---------- */
    { methode: 'GET', pfad: '/api/sichten/definitionen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.listeSichten(await zg(a))) },
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
    { methode: 'POST', pfad: '/api/sichten/definitionen/:id/verschieben', zugang: 'admin', handler: async (a) => {
      const r = await dienst.verschiebeSicht(a.params.id, b(a).elternId, b(a).stelle);
      L.werkbank.info('Sicht verschoben', { id: a.params.id, elternId: b(a).elternId ?? null, stelle: b(a).stelle });
      return ok(r);
    } },
    { methode: 'PUT', pfad: '/api/sichten/reihenfolge', zugang: 'admin', handler: async (a) => ok(await dienst.ordneSichten(b(a).elternId, b(a).ids)) },
    { methode: 'POST', pfad: '/api/sichten/vorschau', zugang: 'admin', handler: async (a) => ok(await dienst.sichtVorschau(ich(a), b(a).id, b(a).sicht)) },
    { methode: 'GET', pfad: '/api/typen/:id/belegung', zugang: 'admin', handler: async (a) => ok(await dienst.belegung(a.params.id)) },
    { methode: 'GET', pfad: '/api/mappen/:id', zugang: 'angemeldet', handler: async (a) => {
      const klartext = passwoerterAnzeigen(a);
      const d = { ...await dienst.holeMappe(a.params.id, await zg(a)), favorit: await dienst.istFavorit(ich(a), a.params.id) };
      if (klartext && !d.rechte.P) throw new Fachfehler(403, 'Passwörter dieser Mappe darfst du nicht sehen.');
      return ok(klartext ? { ...d, mappe: (await dienst.entschluesselePasswoerter([d.mappe], klartext, ich(a).id))[0] } : d);
    } },
    // Aufgaben (#54, #56)
    { methode: 'GET', pfad: '/api/aufgaben', zugang: 'angemeldet', handler: async (a) => ok(await dienst.meineAufgaben(ich(a), await zg(a))) },
    { methode: 'GET', pfad: '/api/mappen/:id/aufgaben', zugang: 'angemeldet', handler: async (a) => { await darf(a, a.params.id, 'R'); return ok(await dienst.aufgabenVon(a.params.id)); } },
    { methode: 'POST', pfad: '/api/mappen/:id/aufgaben', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, a.params.id, 'R');
      await empfaengerSichtbar(a, b(a).empfaengerId);
      const auf = await dienst.legeAufgabeAn(a.params.id, a.body, ich(a).id);
      return ok({ ...auf, ...await leseHinweis(auf.empfaengerId, a.params.id) }, 201);
    } },
    { methode: 'POST', pfad: '/api/aufgaben/:id/erledigt', zugang: 'angemeldet', handler: async (a) => ok(await dienst.erledigeAufgabe(a.params.id, ich(a))) },
    { methode: 'POST', pfad: '/api/aufgaben/:id/delegieren', zugang: 'angemeldet', handler: async (a) => {
      await empfaengerSichtbar(a, b(a).empfaengerId);
      const auf = await dienst.delegiereAufgabe(a.params.id, b(a).empfaengerId, ich(a));
      return ok({ ...auf, ...await leseHinweis(auf.empfaengerId, auf.mappeId) });
    } },
    { methode: 'GET', pfad: '/api/werkbank/aufgaben', zugang: 'admin', handler: async (a) => ok({
      aufgaben: await dienst.alleAufgaben(a.query.erledigt !== undefined),
      mail: x.aufgabenmail ? await x.aufgabenmail.einstellung() : null,
      // Fristen und Erinnerungen, deren Empfänger die Mappe nicht lesen darf (#129, #131).
      unlesbar: await dienst.unlesbareFristen(),
    }) },
    // Fristen (#129–#132)
    { methode: 'POST', pfad: '/api/aufgaben/:id/folgetermin', zugang: 'angemeldet', handler: async (a) => ok(await dienst.setzeFolgetermin(a.params.id, ich(a), await zg(a))) },
    { methode: 'GET', pfad: '/api/anstehend', zugang: 'angemeldet', handler: async (a) => ok(await dienst.anstehend(await zg(a), a.query.tage)) },
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
    { methode: 'PUT', pfad: '/api/werkbank/aufgaben/mail', zugang: 'admin', handler: async (a) => ok(await mail().speichere(a.body)) },
    { methode: 'POST', pfad: '/api/werkbank/aufgaben/mail/senden', zugang: 'admin', handler: async () => ok({ verschickt: await mail().sende() }) },
    // Notizen (#55)
    // E-Mail aus der Mappe (#58)
    { methode: 'GET', pfad: '/api/email/bereit', zugang: 'angemeldet', handler: async () => ok({ bereit: !!x.betrieb?.mailer() }) },
    { methode: 'POST', pfad: '/api/mappen/:id/email', zugang: 'angemeldet', handler: async (a) => {
      const i = ich(a);
      await darf(a, a.params.id, 'R');
      return ok(await dienst.versendeMappe(a.params.id, b(a), { id: i.id, name: i.name, email: i.email }, x.betrieb?.mailer() ?? null), 201);
    } },
    // Post (#192): anlegen („+ Post“, Dokumente danach über das Hochladen) und einer Mappe zuordnen.
    { methode: 'POST', pfad: '/api/post', zugang: 'angemeldet', handler: async (a) => {
      const i = ich(a);
      return ok(await dienst.legePostAn(b(a), { id: i.id, name: i.name }, await zg(a), a.apiSchluessel ? POST_KANAL.api : POST_KANAL.hochgeladen), 201);
    } },
    { methode: 'POST', pfad: '/api/mappen/:id/zuordnen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.ordneZu(a.params.id, b(a), ich(a).id, await zg(a))) },
    // Notizen brauchen nur Lesen (#124).
    { methode: 'GET', pfad: '/api/mappen/:id/notizen', zugang: 'angemeldet', handler: async (a) => { await darf(a, a.params.id, 'R'); return ok(await dienst.notizen(a.params.id)); } },
    { methode: 'POST', pfad: '/api/mappen/:id/notizen', zugang: 'angemeldet', handler: async (a) => { await darf(a, a.params.id, 'R'); return ok(await dienst.legeNotizAn(a.params.id, b(a).text, ich(a).id), 201); } },
    { methode: 'PUT', pfad: '/api/notizen/:id', zugang: 'angemeldet', handler: async (a) => { await darf(a, await dienst.mappeVon('notiz', a.params.id), 'R'); return ok(await dienst.aendereNotiz(a.params.id, b(a).text, ich(a).id)); } },
    { methode: 'DELETE', pfad: '/api/notizen/:id', zugang: 'angemeldet', handler: async (a) => { await darf(a, await dienst.mappeVon('notiz', a.params.id), 'R'); await dienst.loescheNotiz(a.params.id, ich(a).id); return leer; } },
    // Änderungshistorie (#57)
    { methode: 'GET', pfad: '/api/mappen/:id/verweisende', zugang: 'angemeldet', handler: async (a) => ok(await dienst.verweisende(a.params.id, String(a.query.typ ?? ''), String(a.query.feld ?? ''), await zg(a))) },
    { methode: 'GET', pfad: '/api/mappen/:id/historie', zugang: 'angemeldet', handler: async (a) => { await darf(a, a.params.id, 'R'); return ok(await dienst.historie(a.params.id)); } },
    // Passwortfeld anzeigen (#46): einzeln, mit Protokolleintrag (ohne den Wert).
    { methode: 'POST', pfad: '/api/mappen/:id/passwoerter/:feld', zugang: 'angemeldet', handler: async (a) => { await darf(a, a.params.id, 'P'); return ok(await dienst.zeigePasswort(a.params.id, a.params.feld, ich(a).id)); } },
    // Vor dem Speichern (#126): Rechte mit den neuen Werten – für die Warnung beim Selbst-Entziehen.
    { methode: 'POST', pfad: '/api/mappen/:id/rechte-vorschau', zugang: 'angemeldet', handler: async (a) => ok(await dienst.rechteVorschau(a.params.id, a.body, await zg(a))) },
    { methode: 'POST', pfad: '/api/mappen', zugang: 'angemeldet', handler: async (a) => {
      const m = await dienst.legeMappeAn(a.body, ich(a).id, false, await zg(a));
      L.ablage.info('Mappe angelegt', { typ: await typName(m.typId), titel: m.titel, id: m.id });
      return ok(m, 201);
    } },
    { methode: 'PUT', pfad: '/api/mappen/:id', zugang: 'angemeldet', handler: async (a) => {
      const m = await dienst.aendereMappe(a.params.id, a.body, ich(a).id, await zg(a));
      L.ablage.info('Mappe geändert', { typ: await typName(m.typId), titel: m.titel, id: m.id });
      return ok(m);
    } },
    // Export (#152, #153): Tabelle, ZIP mit Dokumenten oder PDF – Recht E an der Sicht, Lesen je Mappe.
    { methode: 'POST', pfad: '/api/export', zugang: 'angemeldet', handler: async (a) => {
      const r = await dienst.exportiere(ich(a), b(a), await zg(a));
      L.ablage.info('Mappen exportiert', { von: ich(a).email, sicht: b(a).sicht, format: b(a).format, mappen: r.mappen, auswahl: Array.isArray(b(a).ids) });
      return { datei: { inhalt: r.inhalt, name: r.name, mime: r.mime, anzeigen: false, groesse: r.groesse } };
    } },
    // Auswahl (#149): alle Treffer einer Sicht (mit Suche) als Ids; mehrere Mappen löschen (#150).
    { methode: 'GET', pfad: '/api/mappen/auswahl', zugang: 'angemeldet', handler: async (a) => ok(await dienst.trefferIds(ich(a), a.query, await zg(a))) },
    { methode: 'POST', pfad: '/api/mappen/loeschen', zugang: 'angemeldet', handler: async (a) => {
      const r = await dienst.loescheMappen(b(a), ich(a).id, await zg(a));
      if (b(a).probe !== true) L.ablage.info('Mehrere Mappen gelöscht', { geloescht: r.geloescht, ausgelassen: r.ausgelassen.length });
      return ok(r);
    } },
    { methode: 'DELETE', pfad: '/api/mappen/:id', zugang: 'angemeldet', handler: async (a) => {
      const papierkorb = (await dienst.papierkorbTage()) > 0;
      await dienst.loescheMappe(a.params.id, ich(a).id, await zg(a));
      L.ablage.info(papierkorb ? 'Mappe in den Papierkorb gelegt' : 'Mappe gelöscht', { id: a.params.id });
      return leer;
    } },

    /* ---------- Papierkorb (#43): in der Ablage nur, was ich gelöscht habe ---------- */
    { methode: 'GET', pfad: '/api/papierkorb', zugang: 'angemeldet', handler: async (a) => ok(await dienst.papierkorb(ich(a))) },
    { methode: 'DELETE', pfad: '/api/papierkorb', zugang: 'angemeldet', handler: async (a) => ok({ geloescht: await dienst.leerePapierkorb(ich(a)) }) },
    { methode: 'GET', pfad: '/api/papierkorb/:id', zugang: 'angemeldet', handler: async (a) => ok(await dienst.papierkorbEintrag(a.params.id, ich(a))) },
    { methode: 'POST', pfad: '/api/papierkorb/:id/wiederherstellen', zugang: 'angemeldet', handler: async (a) => {
      const r = await dienst.stelleWiederHer(a.params.id, ich(a));
      // Eigener Papierkorb (#126): immer wiederherstellbar; danach gelten wieder die Regeln.
      const sichtbar = (await dienst.lesbare(await zg(a), [a.params.id])).has(a.params.id);
      return ok(sichtbar ? r : { ...r, hinweis: 'Wiederhergestellt. Diese Mappe kannst du nach den Berechtigungen aber nicht mehr sehen.' });
    } },
    { methode: 'DELETE', pfad: '/api/papierkorb/:id', zugang: 'angemeldet', handler: async (a) => ok({ geloescht: await dienst.loescheEndgueltig([a.params.id], ich(a)) }) },
    /* … und in der Werkbank alles */
    { methode: 'GET', pfad: '/api/werkbank/papierkorb', zugang: 'admin', handler: async (a) => ok({ tage: await dienst.papierkorbTage(), historieTage: await dienst.historieTage(), eintraege: await dienst.papierkorb(ich(a), true) }) },
    { methode: 'PUT', pfad: '/api/werkbank/papierkorb/einstellungen', zugang: 'admin', handler: async (a) => {
      const historieTage = b(a).historieTage === undefined ? await dienst.historieTage() : await dienst.setzeHistorieTage(b(a).historieTage);
      const r = b(a).tage === undefined ? { tage: await dienst.papierkorbTage(), geleert: 0 } : await dienst.setzePapierkorbTage(b(a).tage);
      return ok({ ...r, historieTage });
    } },
    { methode: 'DELETE', pfad: '/api/werkbank/papierkorb', zugang: 'admin', handler: async (a) => ok({ geloescht: await dienst.leerePapierkorb(ich(a), true) }) },
    { methode: 'GET', pfad: '/api/werkbank/papierkorb/:id', zugang: 'admin', handler: async (a) => ok(await dienst.papierkorbEintrag(a.params.id, ich(a), true)) },
    { methode: 'POST', pfad: '/api/werkbank/papierkorb/:id/wiederherstellen', zugang: 'admin', handler: async (a) => ok(await dienst.stelleWiederHer(a.params.id, ich(a), true)) },
    { methode: 'DELETE', pfad: '/api/werkbank/papierkorb/:id', zugang: 'admin', handler: async (a) => ok({ geloescht: await dienst.loescheEndgueltig([a.params.id], ich(a), true) }) },

    /* ---------- Dokumente ---------- */
    { methode: 'POST', pfad: '/api/mappen/:id/dokumente', zugang: 'angemeldet', roh: MAX_DATEIGROESSE, handler: async (a) => {
      await darf(a, a.params.id, 'U');
      const r = await dienst.ladeHoch(a.params.id, { register: a.query.register, name: a.query.name, typ: a.query.typ }, a.body, ich(a).id);
      L.dokumente.info('Dokument hochgeladen', {
        name: r.dokument.name, groesse: r.dokument.groesse, mime: r.dokument.mime, anzeigbar: r.dokument.anzeigbar,
        mappe: a.params.id, gleicherInhalt: r.gleicherInhalt.length || undefined,
      });
      return ok(r, 201);
    } },
    { methode: 'GET', pfad: '/api/dokumente/:id/inhalt', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'R');
      const { dokument: d, inhalt } = await dienst.dokumentInhalt(a.params.id);
      const anzeigen = d.anzeigbar && a.query.herunterladen === undefined;
      L.dokumente.debug(anzeigen ? 'Dokument angezeigt' : 'Dokument heruntergeladen', { name: d.name, id: d.id });
      return { datei: { inhalt, name: d.name, mime: d.anzeigbar ? d.mime : 'application/octet-stream', anzeigen, groesse: d.groesse } };
    } },
    // Volltext und Texterkennung (#45)
    { methode: 'GET', pfad: '/api/dokumente/:id/volltext', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'R');
      const r = await dienst.volltext(a.params.id);
      return ok({ id: r.dokument.id, name: r.dokument.name, ocr: r.dokument.ocr, text: r.text });
    } },
    { methode: 'POST', pfad: '/api/dokumente/:id/texterkennung', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'U');
      const d = await dienst.texterkennungErneut(a.params.id);
      L.dokumente.info('Texterkennung erneut angestoßen', { name: d.name, id: d.id });
      return ok(d);
    } },
    { methode: 'DELETE', pfad: '/api/dokumente/:id', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.mappeVon('dokument', a.params.id), 'U');
      await dienst.loescheDokument(a.params.id, ich(a).id);
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
  const alle: Route[] = [
    ...intern,
    ...v1Routen(intern),
    { methode: 'GET', pfad: '/api/openapi.json', zugang: 'offen', handler: doku },
    { methode: 'GET', pfad: '/api/v1/openapi.json', zugang: 'offen', handler: doku },
  ];
  // Kein verschlüsselter Wert verlässt den Server: Passwortfelder erscheinen als { gesetzt, lesbar } (#46).
  const lesbar = (v: string) => !!x.tresor?.lesbar(v);
  return alle.map((r) => ({
    ...r,
    handler: async (a: Anfrage) => {
      const antwort = await r.handler(a);
      return antwort.body === undefined ? antwort : { ...antwort, body: maskiere(antwort.body, lesbar) };
    },
  }));
}


/** Zu welchem Modul eine Anfrage gehört (für das Protokoll). */
export function modulAus(url: string): string {
  if (/^\/api\/(konto|benutzer|personen|rollen)\b/.test(url)) return 'konto';
  if (/^\/api\/(dokumente|mappen\/[^/]+\/dokumente)\b/.test(url)) return 'dokumente';
  if (/^\/api\/(mappen|sichten|papierkorb|notizen|aufgaben)\b/.test(url)) return 'ablage';
  if (/^\/api\/(werkbank\/(sicherung|notfallblatt|wiederherstellung)|wiederherstellung)\b/.test(url)) return 'sicherung';
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
