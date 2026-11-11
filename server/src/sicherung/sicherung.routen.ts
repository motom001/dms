/**
 * Sicherung (#960: aus routen.ts): Wiederherstellen, Probe, Sicherungen, Kopie außer Haus, Notfallblatt und Verschlüsselung.
 */
import { Fachfehler } from '../fehler';
import { t } from '../sprache';
import { ok, leer, b, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../routen';
import { abruf } from '../http/teilabruf';

export function sicherungRouten(k: RoutenKontext): Route[] {
  const { dienst, konten, x, tresor, sicherung, sicherungsPaket, notfallblattDatei, wh, whStand, darfWiederherstellen } = k;
  return [
    /* ---------- Wiederherstellen (#107): frisches System ohne Anmeldung, sonst Admin im Wartungsmodus ---------- */
    { methode: 'GET', pfad: '/api/wiederherstellung/status', zugang: 'offen', handler: async () => ok(await whStand()) },
    { methode: 'POST', pfad: '/api/wiederherstellung/abschluss-gesehen', zugang: 'offen', handler: async () => {
      if (x.sicherung && !x.wiederherstellung?.laeuft()) await x.sicherung.einstellungen.schreibe('wiederherstellung_abschluss', null);
      return leer;
    } },
    { methode: 'GET', pfad: '/api/wiederherstellung/sicherungen', zugang: 'offen', handler: async (a) => {
      const art = await wh().pruefeZugang(darfWiederherstellen(a), a.einrichtungscode);
      return ok({ art, ordner: sicherung().ordner, liste: (await sicherung().liste()).map((e) => ({ name: e.name, bytes: e.bytes, meta: e.meta, ...(e.schlank ? { schlank: e.schlank } : {}) })) });
    } },
    { methode: 'POST', pfad: '/api/wiederherstellung/abgleich', zugang: 'offen', handler: async (a) => {
      await wh().pruefeZugang(darfWiederherstellen(a), a.einrichtungscode);
      return ok(await wh().abgleich(String(b(a).name ?? ''), typeof b(a).schluessel === 'string' ? b(a).schluessel as string : undefined));
    } },
    { methode: 'POST', pfad: '/api/wiederherstellung/start', zugang: 'offen', handler: async (a) => {
      // Wiederherstellen ist eine heikle Handlung (#819): im laufenden System nur mit frischer Anmeldung.
      const admin = darfWiederherstellen(a);
      if (admin && !a.konsole && !konten.istFrisch(a.sitzungsDaten)) throw new Fachfehler(403, t('konten.verwaltung.fehler.frisch'), { frisch: true, handlung: 'wiederherstellen' });
      return ok(await wh().starte(b(a), admin ? a.benutzer! : null, a.einrichtungscode));
    } },
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
    { methode: 'POST', pfad: '/api/werkbank/sicherung/:name/pruefen', zugang: 'admin', handler: async (a) => ok(await sicherung().pruefe(a.params.name, ich(a).email)) },
    // Herunterladen (#975): die verschlüsselte Datei unverändert, als Strom mit Weiterlesen (Range). Heikle Handlung
    // „sicherung“ (frische Anmeldung, verwaltungsbereiche.ts), Bereich „Sicherung“. Ohne HEAD: Jeder Abruf steht im Protokoll.
    { methode: 'GET', pfad: '/api/werkbank/sicherung/:name/datei', zugang: 'admin', ohneHead: true, handler: async (a) => {
      const d = await sicherung().datei(a.params.name);
      const { antwort, bereich } = await abruf(d, (n) => a.kopf?.(n));
      if (antwort.datei) sicherung().merkeHerunterladen(d.name, ich(a).email, bereich, antwort.datei.groesse);
      return antwort;
    } },
    // Die Metadaten daneben (#975): ohne sie lässt sich die Sicherung auf einem neuen Gerät nicht einspielen. Kein Schlüssel darin.
    { methode: 'GET', pfad: '/api/werkbank/sicherung/:name/metadaten', zugang: 'admin', handler: async (a) => {
      const m = await sicherung().metadatenDatei(a.params.name);
      return { datei: { inhalt: m.inhalt, name: m.dateiname, mime: 'application/json', anzeigen: false, groesse: m.inhalt.length, koepfe: { 'cache-control': 'no-store' } } };
    } },
    { methode: 'DELETE', pfad: '/api/werkbank/sicherung/:name', zugang: 'admin', handler: async (a) => { await sicherung().loesche(a.params.name, ich(a).email); return leer; } },
    // Sicherung außer Haus (#585): nur Pakete mit dms:sicherung-lesen, nur die Sicherungen aus ihrem Ereignis sicherung.fertig –
    // die verschlüsselte Datei in Stücken, schlanke Metadaten und die Rückmeldung. Nie Schlüssel, nie andere Dateien.
    { methode: 'GET', pfad: '/api/sicherungen/:name', zugang: 'angemeldet', handler: async (a) => ok(await sicherung().externMeta(await sicherungsPaket(a), a.params.name)) },
    { methode: 'GET', pfad: '/api/sicherungen/:name/datei', zugang: 'angemeldet', handler: async (a) => {
      const s = await sicherung().externStueck(await sicherungsPaket(a), a.params.name, a.query.versatz, a.query.laenge);
      return { datei: { inhalt: s.inhalt, name: `${a.params.name}.dms-sicherung`, mime: 'application/octet-stream', anzeigen: false, groesse: s.inhalt.length, koepfe: { 'x-dms-groesse': String(s.groesse), 'cache-control': 'no-store' } } };
    } },
    { methode: 'PUT', pfad: '/api/sicherungen/:name/extern', zugang: 'angemeldet', handler: async (a) => ok(await sicherung().externRueckmeldung(await sicherungsPaket(a), a.params.name, a.body)) },
    { methode: 'GET', pfad: '/api/werkbank/notfallblatt', zugang: 'admin', handler: async (a) => notfallblattDatei(ich(a).email) },

    { methode: 'GET', pfad: '/api/werkbank/tresor', zugang: 'admin', handler: async () => ok({ ...await tresor().status(), notfallblatt: x.sicherung ? await x.sicherung.notfallblatt() : null }) },
    { methode: 'POST', pfad: '/api/werkbank/tresor/erzeugen', zugang: 'admin', handler: async () => ok(await tresor().erzeuge()) },
    // Schlüssel wechseln (#47): nur mit Bestätigung; danach neues Notfallblatt und neue Sicherung.
    { methode: 'POST', pfad: '/api/werkbank/tresor/wechseln', zugang: 'admin', handler: async (a) => {
      if (b(a).bestaetigt !== true) throw new Fachfehler(400, t('meldungen.routen.bitte-den-wechsel-bestaetigen'));
      if (x.sicherung?.laeuft()) throw new Fachfehler(409, t('meldungen.routen.gerade-laeuft-eine-sicherung'));
      const w = await dienst.schluesselWechseln(ich(a).email);
      const alte = x.sicherung ? (await x.sicherung.liste()).filter((s) => s.meta && s.meta.verschluesselung.fingerabdruck !== w.neu).length : 0;
      return ok({ ...w, alteSicherungen: alte, ...await tresor().status(), notfallblatt: x.sicherung ? await x.sicherung.notfallblatt() : null });
    } },
  ];
}
