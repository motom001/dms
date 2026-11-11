/**
 * System (#960: aus routen.ts): E-Mail-Versand und Adresse, Fehlermeldungen; Einrichtungsstand, Datenbank-Anbindung,
 * Anmeldeschutz; WebDAV, Eingangsordner, Speicherplatz, Auslastung, Datenbank und Lasttest.
 */
import { Fachfehler } from '../fehler';
import { t } from '../sprache';
import { eigeneVersion, uebersicht, versionsabgleich } from '../system';
import { zwischenspeicherAus } from '../zaehlerspeicher';
import type { Prozessstand } from '../aufteilung';
import { arbeiterStand } from '../arbeit';
import { VERSAND_OAUTH_ID } from '../postfach-oauth';
import { heimnetzStand } from '../notfallcode';
import { FEHLERMELDUNG_KOERPER_MAX, MB } from '../grenzen';
import { L, ok, leer, b, ich, grenzenUndEngpaesse, prozessZeilen, engpassStand, POSTFACH_BINDUNG_COOKIE, kurzCookie } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../routen';
import { extern } from '../externmessung';
import { monatAus } from '../../../shared/src/extern';
import { istKiPaket } from '../../../shared/src/pakete';

export function betriebRouten(k: RoutenKontext): Route[] {
  const { x, system, betrieb, meldungen, pfOAuth, pfRueckruf } = k;
  return [
    // Name der Ablage für den vorgeschlagenen Absender (#813).
    { methode: 'GET', pfad: '/api/werkbank/betrieb', zugang: 'admin', handler: async () => ok({ ...await betrieb().stand(), ablage: x.einrichtung ? await x.einrichtung.stand().then((e) => e.mandant, () => null) : null }) },
    { methode: 'PUT', pfad: '/api/werkbank/betrieb/mail', zugang: 'admin', handler: async (a) => ok(await betrieb().speichereMail(b(a), ich(a).email)) },
    // Server zur Adresse finden (#813): eingebaute Liste, sonst DNS und Autoconfig der eigenen Domain; Thunderbird nur auf Knopfdruck.
    { methode: 'POST', pfad: '/api/werkbank/betrieb/mail/finden', zugang: 'admin', lesend: true, handler: async (a) => ok(await betrieb().findeServer(b(a))) },
    // Anmeldung über OAuth für den Versand (#813): dieselbe App und derselbe Rückruf wie bei den Postfächern.
    { methode: 'POST', pfad: '/api/werkbank/betrieb/mail/oauth/start', zugang: 'admin', handler: async (a) => {
      const s = await pfOAuth().start(betrieb().oauthZiel(), { id: ich(a).id, email: ich(a).email }, pfRueckruf());
      return { body: { url: s.url }, cookies: [kurzCookie(POSTFACH_BINDUNG_COOKIE, s.bindung, 600, '/api/oauth/postfach')] };
    } },
    { methode: 'POST', pfad: '/api/werkbank/betrieb/mail/oauth/geraet', zugang: 'admin', handler: async (a) => ok(await pfOAuth().geraetStart(betrieb().oauthZiel(), { id: ich(a).id, email: ich(a).email })) },
    { methode: 'POST', pfad: '/api/werkbank/betrieb/mail/oauth/geraet/pruefen', zugang: 'admin', lesend: true, handler: async (a) => ok(await pfOAuth().geraetPruefen(VERSAND_OAUTH_ID, { id: ich(a).id })) },
    { methode: 'POST', pfad: '/api/werkbank/betrieb/mail/oauth/abmelden', zugang: 'admin', handler: async (a) => {
      await pfOAuth().abmelden(VERSAND_OAUTH_ID, ich(a).email);
      return ok(await betrieb().stand());
    } },
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
    { methode: 'POST', pfad: '/api/konto/fehlermeldung', zugang: 'angemeldet', roh: FEHLERMELDUNG_KOERPER_MAX, handler: async (a) => ok(await meldungen().melde(ich(a).id, b(a)), 201) },
    { methode: 'GET', pfad: '/api/werkbank/fehlermeldungen', zugang: 'admin', handler: async (a) => ok(await meldungen().liste(a.query.erledigt !== undefined)) },
    { methode: 'GET', pfad: '/api/werkbank/fehlermeldungen/:id', zugang: 'admin', handler: async (a) => ok(await meldungen().hole(a.params.id)) },
    { methode: 'GET', pfad: '/api/werkbank/fehlermeldungen/:id/bilder/:nr', zugang: 'admin', handler: async (a) => {
      const { bild, inhalt } = await meldungen().bild(a.params.id, Number(a.params.nr));
      return { datei: { inhalt, name: bild.name, mime: bild.mime, anzeigen: true, groesse: bild.groesse } };
    } },
    { methode: 'POST', pfad: '/api/werkbank/fehlermeldungen/:id/erledigt', zugang: 'admin', handler: async (a) => ok(await meldungen().erledigt(a.params.id, b(a).erledigt !== false, ich(a).id)) },
    { methode: 'DELETE', pfad: '/api/werkbank/fehlermeldungen/:id', zugang: 'admin', handler: async (a) => { await meldungen().loesche(a.params.id); return leer; } },
  ];
}

export function systemRouten(k: RoutenKontext): Route[] {
  const { konten, x, nf, anbindung } = k;
  return [
    /* ---------- Einrichtungsassistent (#119) ---------- */
    { methode: 'GET', pfad: '/api/werkbank/einrichtung', zugang: 'admin', handler: async () => {
      if (!x.einrichtung) throw new Fachfehler(404, t('meldungen.routen.kein-einrichtungsassistent'));
      return ok(await x.einrichtung.stand());
    } },
    { methode: 'POST', pfad: '/api/werkbank/einrichtung/schritt', zugang: 'admin', handler: async (a) => {
      if (!x.einrichtung) throw new Fachfehler(404, t('meldungen.routen.kein-einrichtungsassistent'));
      return ok(await x.einrichtung.merke(b(a).schritt, b(a).uebersprungen === true, ich(a).email));
    } },
    /* ---------- Datenbank-Anbindung (#119) ---------- */
    { methode: 'GET', pfad: '/api/werkbank/anbindung', zugang: 'admin', handler: async () => ok(anbindung().stand()) },
    { methode: 'POST', pfad: '/api/werkbank/anbindung/pruefen', zugang: 'admin', handler: async (a) => ok(await anbindung().pruefe(b(a).anbindung)) },
    { methode: 'PUT', pfad: '/api/werkbank/anbindung', zugang: 'admin', handler: async (a) => ok(await anbindung().speichere({ ...(b(a).anbindung as object ?? {}), leerBestaetigt: b(a).leerBestaetigt }, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/neustart', zugang: 'admin', handler: async (a) => { anbindung().neustart(ich(a).email); return leer; } },
    /* ---------- Speicherplatz (#116) ---------- */
    // Anmeldeschutz (#240): Fehlversuche, gesperrte IPs, Ausnahmen.
    { methode: 'GET', pfad: '/api/werkbank/anmeldeschutz', zugang: 'admin', handler: async (a) => ok({ einstellung: await konten.sperre.einstellung(), gesperrt: await konten.sperre.gesperrt(), deineIp: a.ip }) },
    { methode: 'PUT', pfad: '/api/werkbank/anmeldeschutz', zugang: 'admin', handler: async (a) => ok({ einstellung: await konten.sperre.speichere(a.body, ich(a).email), gesperrt: await konten.sperre.gesperrt(), deineIp: a.ip }) },
    // Notfallzugang (#815): Vorgabe „nur Heimnetz“; „aus dem Internet erlauben“ ist eine heikle Handlung (frische Anmeldung).
    { methode: 'GET', pfad: '/api/werkbank/anmeldeschutz/notfallzugang', zugang: 'admin', handler: async (a) => ok({ ...await nf().einstellung(), code: await konten.notfallcodeStand(), ...heimnetzStand(a, x.proxy) }) },
    { methode: 'PUT', pfad: '/api/werkbank/anmeldeschutz/notfallzugang', zugang: 'admin', handler: async (a) => ok({ ...await nf().setzeEinstellung(b(a), ich(a).email), code: await konten.notfallcodeStand(), ...heimnetzStand(a, x.proxy) }) },
    { methode: 'POST', pfad: '/api/werkbank/anmeldeschutz/entsperren', zugang: 'admin', handler: async (a) => {
      const ip = String((b(a) as { ip?: unknown }).ip ?? '');
      if (!(await konten.sperre.entsperre(ip, ich(a).email))) throw new Fachfehler(404, t('meldungen.routen.diese-adresse-ist-nicht'));
      return ok({ einstellung: await konten.sperre.einstellung(), gesperrt: await konten.sperre.gesperrt(), deineIp: a.ip });
    } },
  ];
}

export function systemzustandRouten(k: RoutenKontext): Route[] {
  const { x, messung, system, speicherplatz, konten, pakete } = k;
  /** Namen zu den Ids der Auswertung (#565): Personen (gelöschte fehlen) und KI-Pakete (für die Preise). */
  const namen = async () => {
    const [benutzer, installiert] = await Promise.all([konten.listeBenutzer(), pakete.installierte().catch(() => [])]);
    return {
      personen: Object.fromEntries(benutzer.map((b) => [b.id, b.name || b.email])),
      pakete: Object.fromEntries(installiert.map((p) => [p.id, p.name])),
      kiPakete: installiert.filter((p) => istKiPaket(p.laeufer)).map((p) => ({ id: p.id, name: p.name })),
    };
  };
  return [
    /* ---------- Externe Dienste (#565): Laufzeit, Datenmenge, Fehler; KI-Kosten und Budget ---------- */
    { methode: 'GET', pfad: '/api/werkbank/system/extern', zugang: 'admin', handler: async (a) => ok({ ...await extern.uebersicht(Number(a.query.stunden) || 24), budget: extern.budget(), pakete: (await namen()).pakete }) },
    { methode: 'GET', pfad: '/api/werkbank/system/extern/kosten', zugang: 'admin', handler: async (a) => {
      const monat = monatAus(a.query.monat) ?? new Date();
      return ok({ ...await extern.auswertung(monat), ...await namen() });
    } },
    { methode: 'PUT', pfad: '/api/werkbank/system/extern/kosten', zugang: 'admin', handler: async (a) => {
      await extern.setzeKosten(a.body, ich(a).email);
      return ok({ ...await extern.auswertung(new Date()), ...await namen() });
    } },
    { methode: 'GET', pfad: '/api/werkbank/webdav', zugang: 'admin', handler: async () => {
      if (!x.webdav) throw new Fachfehler(404, t('meldungen.routen.das-webdav-laufwerk-ist'));
      return ok(await x.webdav.stand());
    } },
    { methode: 'PUT', pfad: '/api/werkbank/webdav', zugang: 'admin', handler: async (a) => {
      if (!x.webdav) throw new Fachfehler(404, t('meldungen.routen.das-webdav-laufwerk-ist'));
      return ok(await x.webdav.speichere(a.body, ich(a).email));
    } },
    { methode: 'GET', pfad: '/api/werkbank/eingangsordner', zugang: 'admin', handler: async () => ok(x.eingangsordner ? await x.eingangsordner.stand() : { vorhanden: false }) },
    { methode: 'PUT', pfad: '/api/werkbank/eingangsordner', zugang: 'admin', handler: async (a) => {
      if (!x.eingangsordner?.vorhanden) throw new Fachfehler(404, t('meldungen.routen.es-ist-kein-eingangsordner'));
      return ok(await x.eingangsordner.speichere(a.body, ich(a).email));
    } },
    // „Ordner für alle Benutzer anlegen“ (#915): je aktive Person eingang/<e-mail>/.
    { methode: 'POST', pfad: '/api/werkbank/eingangsordner/personen', zugang: 'admin', handler: async (a) => {
      if (!x.eingangsordner?.vorhanden) throw new Fachfehler(404, t('meldungen.routen.es-ist-kein-eingangsordner'));
      return ok(await x.eingangsordner.ordnerFuerAlle(ich(a).email));
    } },
    { methode: 'POST', pfad: '/api/werkbank/eingangsordner/pruefen', zugang: 'admin', handler: async () => {
      if (!x.eingangsordner?.vorhanden) throw new Fachfehler(404, t('meldungen.routen.es-ist-kein-eingangsordner'));
      const n = await x.eingangsordner.pruefe(true);
      return ok({ uebernommen: n, stand: await x.eingangsordner.stand() });
    } },
    // Mit der Belegung der Vorschaubilder (#332) – sie liegen im Ordner der Dateien, werden aber nicht gesichert.
    { methode: 'GET', pfad: '/api/werkbank/speicherplatz', zugang: 'admin', handler: async () => ok({ ...(await speicherplatz().pruefe()), vorschau: x.vorschau ? await x.vorschau.belegung() : null }) },
    { methode: 'PUT', pfad: '/api/werkbank/speicherplatz', zugang: 'admin', handler: async (a) => ok(await speicherplatz().speichere(a.body, ich(a).email)) },
    // Auslastung (#409): CPU, Arbeitsspeicher, Netzwerk des Containers; dazu die Wartezeit der Ereignisschleife (#477).
    { methode: 'GET', pfad: '/api/werkbank/systemlast', zugang: 'admin', handler: async () => {
      if (!x.systemlast) throw new Fachfehler(404, t('meldungen.routen.die-messung-der-auslastung'));
      const erweiterungen = x.erweiterungen ? await x.erweiterungen().catch(() => null) : null;
      const stand = x.systemlast.stand();
      // Mehrere Prozesse (#745): Anteil von Ablago = alle Prozesse zusammen, dazu die Liste je Prozess.
      const p = await prozessZeilen(x).catch(() => null);
      const dms = p && p.zeilen.every((z) => z.speicher !== null) ? p.zeilen.reduce((n, z) => n + z.speicher!, 0) : stand.anteile.dms;
      // #918: Hinweis, wenn die Zwischenspeicher zur Fehlersuche abgeschaltet sind (DMS_ZWISCHENSPEICHER=aus).
      return ok({ ...stand, anteile: { ...stand.anteile, dms }, ...(p ? { prozesse: p.zeilen } : {}), schleife: x.messung?.auslastung.stand() ?? null, arbeiter: arbeiterStand(), erweiterungen, ...grenzenUndEngpaesse(x), zwischenspeicher: zwischenspeicherAus() ? 'aus' : 'an' });
    } },
    { methode: 'POST', pfad: '/api/werkbank/system/abgleich', zugang: 'admin', handler: async (a) => {
      const browser = Object.fromEntries(Object.entries((b(a).browser ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
      const start = Date.now();
      const r = await versionsabgleich(await uebersicht(system, x.betrieb?.kurz()), browser, x.abruf);
      L.werkbank.info('Versionsabgleich', { ms: Date.now() - start, neuer: r.filter((v) => v.status === 'neuer' || v.status === 'veraltet').map((v) => v.komponente).join(', ') || undefined });
      return ok(r);
    } },

    /* ---------- Datenbank: lange Zugriffe ---------- */
    { methode: 'GET', pfad: '/api/werkbank/datenbank', zugang: 'admin', handler: async () => {
      const verbindungen = x.verbindungen?.stand() ?? null;
      if (!messung) return ok({ einstellungen: null, langlaeufer: [], laufend: [], auslastung: null, verbindungen });
      const [langlaeufer, laufend] = await Promise.all([messung.speicher.liste(500), messung.speicher.laufende()]);
      // Verzögerung der Ereignisschleife (#477): wie lange Anfragen auf den Server warten.
      const p = await prozessZeilen(x).catch(() => null);
      return ok({ einstellungen: messung.einstellungen, langlaeufer, laufend, auslastung: messung.auslastung.stand(), verbindungen, ...(p ? { prozesse: p.zeilen } : {}) });
    } },
    // Messwerte für den Lasttest (#544): Ereignisschleife, Arbeitsspeicher, Warten auf Verbindungen, Überlastschutz,
    // Arbeiter. Wird vom Überlastschutz nie abgewiesen.
    { methode: 'GET', pfad: '/api/werkbank/last', zugang: 'admin', lesend: true, handler: async (a) => {
      const s = messung?.auslastung.stand();
      const w = s ? (s.aktuell && (s.aktuell.seitSekunden >= 5 || !s.vorher) ? s.aktuell : s.vorher ?? s.aktuell) : null;
      const m = process.memoryUsage();
      const jetzt = x.verbindungen ? await x.verbindungen.probe() : null;
      const v = x.verbindungen?.stand();
      // Mehrere Prozesse (#745): Arbeitsspeicher aller Prozesse zusammen (auch des Hauptprozesses; Pss, die Summe der
      // RSS unter `rssMb`), Wartezeit des langsamsten; je Prozess unter `prozesse`.
      const p = await prozessZeilen(x, 'prozess.last').catch(() => null);
      const schlimmste = p?.staende.filter((z): z is Prozessstand => !!z?.schleife).sort((a, b) => b.schleife!.p99 - a.schleife!.p99)[0];
      return ok({
        schleife: schlimmste?.schleife ?? (w ? { median: w.median, p99: w.p99, max: w.max } : null), schleifeWarnung: s?.warnungSeit ?? null,
        speicherMb: p ? p.speicherMb : Math.round(m.rss / MB), ...(p ? { rssMb: p.rssMb } : {}), heapMb: Math.round(m.heapUsed / MB),
        ...(p ? { prozesse: p.zeilen } : {}),
        // Ganzer Container (#696): so viel zeigt die NAS an – mit PostgreSQL (dms-komplett) und Dateizwischenspeicher.
        // #895: dazu Grenze und Kerne – die Lasttest-Seite zeigt CPU und Speicher in Prozent wie die Auslastung.
        container: (() => { const c = x.systemlast?.container(); const r = x.systemlast?.rahmen(); const mb = (v: number | null | undefined) => (v == null ? null : Math.round(v / MB)); return c && c.aktuell !== null ? { mb: mb(c.aktuell), spitzeMb: mb(c.spitze), programmeMb: mb(c.programme), zwischenspeicherMb: mb(c.zwischenspeicher), datenbankMb: mb(c.datenbank), ...(r ? { grenzeMb: mb(r.grenze), ohneGrenze: r.ohneGrenze, kerne: r.kerne, kerneBegrenzt: r.kerneBegrenzt } : {}) } : null; })(),
        datenbank: v ? { verbindungen: x.verbindungen?.aufteilung?.gesamt ?? v.max, jeProzess: v.max, wartenJetzt: jetzt === null ? null : Math.round(jetzt * 10) / 10, wartenP95: v.p95, wartenMax: v.hoechstens } : null,
        anfragen: x.ueberlast?.stand() ?? null,
        arbeiter: arbeiterStand(),
        engpass: await engpassStand(x, p),
        // Teuerste Abfragen (#894): nur mit ?abfragen=<Anzahl> – der Lasttest fragt einmal am Ende eines Durchgangs.
        ...(a.query.abfragen !== undefined ? { abfragen: x.abfragen ? await x.abfragen.stand(Number(a.query.abfragen) || 10) : null } : {}),
      });
    } },
    // Vor jedem Durchgang des Lasttests (#894): Werte von pg_stat_statements der eigenen Datenbank zurücksetzen.
    { methode: 'POST', pfad: '/api/werkbank/last/abfragen-zuruecksetzen', zugang: 'admin', handler: async () => ok(x.abfragen ? await x.abfragen.zuruecksetzen() : { zurueckgesetzt: false, grund: 'fehler', hinweis: null }) },
    { methode: 'PUT', pfad: '/api/werkbank/datenbank', zugang: 'admin', handler: async (a) => {
      if (!messung) throw new Fachfehler(404, t('meldungen.routen.messung-ist-nicht-aktiv'));
      try {
        const e = await messung.setze({ schwelleMs: b(a).schwelleMs as number, tage: b(a).tage as number });
        L.werkbank.info('Einstellungen für lange Datenbankzugriffe geändert', { ...e });
        return ok(e);
      } catch (e) { throw new Fachfehler(422, (e as Error).message); }
    } },
  ];
}
