/**
 * Anmeldung (#960: aus routen.ts): Gesundheit, Wartung und Sprache ohne Anmeldung, Konto-Status, Verwaltungsmodus,
 * Einrichtungsassistent, Anmelden, Anbieter (OIDC), Befehl dms, Zwei-Faktor, Passwort-Links und Notfallzugang.
 */
import { Fachfehler } from '../fehler';
import { pflichtRolle } from '../zweifaktor';
import { PASSKEYS_HOECHSTENS } from '../passkeys';
import { t } from '../sprache';
import { hatGesamt } from '../../../shared/src/verwaltungsrecht';
import { eigeneVersion, standKennung } from '../system';
import { SPRACHE_HOECHSTENS_MS } from '../sprachwahl';
import { zeitzone } from '../../../shared/src/region';
import { istVerfuegbar, liesSpracheinstellung, SPRACHEN_STANDARD } from '../../../shared/src/sprachwahl';
import { L, SITZUNG_SEKUNDEN, ok, leer, b, info, ich, leseCookie, BINDUNG_COOKIE, ANBIETER_COOKIE, kurzCookie, zweifaktorStatus, passkeyStatus } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../routen';

/** Eigene Anmeldung ändern geht nicht, während jemand als diese Person agiert (#43, #811). */
function ohneVertretung(a: { sitzungsDaten?: { vertretungId?: string | null } }) {
  if (a.sitzungsDaten?.vertretungId) throw new Fachfehler(403, t('anmeldung.passkey.fehler.vertretung'));
}

export function anmeldungRouten(k: RoutenKontext): Route[] {
  const { dienst, konten, x, log, pakete, einrichtungZugang, betrieb, spracheFuer, verwaltungHinweis, oidc, adresse, zf, pk, whStand, nurAdminsInWartung } = k;
  return [
    // Mit Datenbank (#1198): Ist keine Verbindung frei oder antwortet sie nicht, 503 mit „datenbank“ – Docker, Überwachung
    // und die Leiste der Oberfläche merken den Ausfall. Ohne Sitzung: Sie bräuchte selbst die Datenbank.
    { methode: 'GET', pfad: '/api/gesundheit', zugang: 'offen', ohneSitzung: true, handler: async () => {
      if (x.datenbank && !(await x.datenbank.pruefe())) return { status: 503, body: { ok: false, zustand: 'datenbank', stand: standKennung() }, koepfe: { 'retry-after': '10' } };
      return ok({ ok: true, zustand: 'laeuft', stand: standKennung() });
    } },
    // Wartungsmodus (#102): für Banner und Anmeldeseite, auch ohne Anmeldung.
    { methode: 'GET', pfad: '/api/wartung', zugang: 'offen', handler: async () => ok(x.wartung?.oeffentlich() ?? { stufe: 'aus', text: '', ende: null, aktivAb: null, sekunden: null }) },

    // Sprache vor dem ersten Bild (#729): Die Oberfläche lädt damit ihre Texte, bevor sie etwas zeigt.
    // #1198: Antwortet die Datenbank nicht, nach kurzer Zeit ohne Anmeldung und mit der zuletzt gelesenen Einstellung.
    { methode: 'GET', pfad: '/api/sprache', zugang: 'offen', anmeldungHoechstensMs: SPRACHE_HOECHSTENS_MS, handler: async (a) => ok(await spracheFuer(a)) },
    // Texte eines Sprachpakets (#731) für die Oberfläche – nur erlaubte Sprachen; Texte sind nichts Geheimes (auch die
    // Anmeldeseite braucht sie). Die Oberfläche setzt sie nie als HTML.
    { methode: 'GET', pfad: '/api/sprache/texte/:kennung', zugang: 'offen', handler: async (a) => {
      const e = x.sprachen ? await x.sprachen.lies() : liesSpracheinstellung(null);
      const texte = e.erlaubt.includes(a.params.kennung) ? x.sprachen?.pakete?.texte(a.params.kennung) : null;
      if (!texte) throw new Fachfehler(404, t('meldungen.sprachpakete.keine-texte'));
      return ok(texte);
    } },

    /* ---------- Konto ---------- */
    { methode: 'GET', pfad: '/api/konto/status', zugang: 'offen', handler: async (a) => ok({
      // Sprache (#729): wirksame Sprache, erlaubte Sprachen, Sprache der Installation.
      sprachen: await spracheFuer(a),
      einrichtungNoetig: await konten.einrichtungNoetig(),
      // Einrichtungsassistent (#119): Code nötig? Weitere Schritte für den Administrator offen?
      // #818: für Personen mit „Gesamte Verwaltung“; die Schritte selbst brauchen den Verwaltungsmodus.
      einrichtung: x.einrichtung ? { phase: 'konto', code: x.einrichtung.codeNoetig, assistent: hatGesamt(a.benutzer) && !a.sitzungsDaten?.vertretungId ? (await x.einrichtung.stand()).offen : false } : null,
      mail: konten.mailAktiv,
      benutzer: a.benutzer ?? null,
      // Anmeldung über einen Anbieter (#241): Knopf auf der Anmeldeseite.
      anbieter: !a.benutzer && x.oidc ? await x.oidc.bereit().then((e) => (e ? { knopf: e.knopf, lokalNurAdmins: e.lokalNurAdmins } : null)) : null,
      // Zwei-Faktor (#242): eingerichtet? Für die Rolle vorgeschrieben, aber noch nicht eingerichtet?
      // #416: ausstehend = vorgeschrieben, aber diese Sitzung lief schon vorher – Hinweis statt Sperre.
      zweifaktor: a.benutzer && konten.zweifaktor ? await zweifaktorStatus(konten.zweifaktor, a.benutzer, a.sitzungsDaten) : null,
      // Passkeys (#811): Gehen sie über diese Adresse (HTTPS)? Angemeldet: eigener vorhanden, Pflicht offen.
      passkey: konten.passkeys ? await passkeyStatus(konten.passkeys, a.benutzer, a.sitzungsDaten) : null,
      // Ohne Schlüssel (Werkbank → Verschlüsselung) lassen sich keine Passwörter speichern (#39, #46).
      passwoerterMoeglich: dienst.passwortfelder.passwoerterMoeglich,
      // Logo und Schriftzug des Standard-Designs für die Anmeldeseite (#72).
      marke: x.designs ? await x.designs.marke() : null,
      // Zeitzone der Region (#726): die Oberfläche rechnet „heute“ und Uhrzeiten wie der Server.
      zeitzone: zeitzone(),
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
      // Favoriten benachrichtigen (#506): von der Werkbank für diesen Benutzer erlaubt? Sonst kein Schalter.
      favoritenBenachrichtigung: a.benutzer ? await dienst.ohneEmpfaenger.favoritenBenachrichtigungErlaubt(a.benutzer.id) : null,
      // Laufwerk (#720): eingeschaltet? Nur dann zeigt die Oberfläche „Als Laufwerk einbinden“.
      laufwerk: a.benutzer && x.webdav ? (await x.webdav.einstellung()).aktiv : false,
      // Inhalte übersetzen (#732): Knopf „Übersetzung anzeigen“ – Paket, Zielsprache, wohin der Text ggf. geht.
      uebersetzen: a.benutzer ? await dienst.uebersetzung.angebot(a.benutzer, (await spracheFuer(a)).sprache) : null,
      // Aufgaben ohne Empfänger (#719): Sieht dieser Benutzer sie (Administrator oder gewählter Alltags-Benutzer)?
      aufgabenOhneEmpfaenger: a.benutzer ? await dienst.ohneEmpfaenger.siehtOhneEmpfaenger(a.benutzer) : false,
      // Technische Aufgaben (#719): nur außerhalb des Verwaltungsmodus, nur ja/nein – nie, was genau anliegt.
      verwaltung: await verwaltungHinweis(a),
      // Verwaltungsmodus (#819): darf die Person verwalten, läuft er, bis wann, Wiedereinstieg mit einem Klick?
      verwaltungsmodus: a.benutzer ? await konten.verwaltungsstand(a.benutzer, a.sitzungsDaten) : null,
    }) },
    /* ---------- Verwaltungsmodus (#819) ---------- */
    // Beginnen: ohne Angaben, wenn die Anmeldung frisch oder heute schon bestätigt ist; sonst mit Passwort und Code.
    { methode: 'POST', pfad: '/api/konto/verwaltung', zugang: 'angemeldet', handler: async (a) => ok(await konten.beginneVerwaltung(ich(a), a.sitzung, a.sitzungsDaten, b(a), a.ip)) },
    { methode: 'POST', pfad: '/api/konto/verwaltung/beenden', zugang: 'angemeldet', handler: async (a) => {
      await konten.beendeVerwaltung(ich(a), a.sitzung, a.sitzungsDaten);
      return ok(await konten.verwaltungsstand(ich(a), { ...a.sitzungsDaten!, verwaltungSeit: null, verwaltungAktiv: null }));
    } },
    // Frische Anmeldung für eine heikle Handlung (immer mit Passwort, gilt 10 Minuten).
    { methode: 'POST', pfad: '/api/konto/verwaltung/bestaetigen', zugang: 'angemeldet', handler: async (a) => {
      await konten.bestaetigeFrisch(ich(a), a.sitzung, a.sitzungsDaten, b(a), a.ip);
      return ok({ frisch: true });
    } },
    // Laufwerk für Benutzer (#720): Adresse und Benutzername; ausgeschaltet gibt es nichts.
    { methode: 'GET', pfad: '/api/konto/laufwerk', zugang: 'angemeldet', handler: async (a) => {
      if (!x.webdav || !(await x.webdav.einstellung()).aktiv) throw new Fachfehler(404, t('meldungen.routen.das-laufwerk-ist-nicht'));
      const s = await x.webdav.stand();
      return ok({ adresse: s.adresse, https: s.https, benutzername: ich(a).email });
    } },
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
      if (!x.einrichtung) throw new Fachfehler(404, t('meldungen.routen.kein-einrichtungsassistent'));
      await x.einrichtung.pruefeCode(a.einrichtungscode);
      return ok({ ok: true });
    } },
    // Sammeln vor „Jetzt einrichten“ (#804) und Konfigurationsdatei (#806): mit Code, solange nicht eingerichtet.
    { methode: 'POST', pfad: '/api/einrichtung/pruefen', zugang: 'offen', lesend: true, handler: async (a) => {
      await einrichtungZugang(a);
      return ok({ probleme: x.einrichtung!.pruefePlan(b(a).plan, { passwort: b(a).passwort }) });
    } },
    { methode: 'POST', pfad: '/api/einrichtung/datei/lesen', zugang: 'offen', lesend: true, handler: async (a) => {
      await einrichtungZugang(a);
      return ok(x.einrichtung!.dateiLesen(b(a).text));
    } },
    { methode: 'POST', pfad: '/api/einrichtung/datei/schreiben', zugang: 'offen', lesend: true, handler: async (a) => {
      await einrichtungZugang(a);
      return ok(x.einrichtung!.dateiSchreiben(b(a).plan));
    } },
    // Pakete wählen, bevor es einen Administrator gibt (#804): nur lesend und nur der offizielle Katalog.
    { methode: 'GET', pfad: '/api/einrichtung/pakete', zugang: 'offen', handler: async (a) => {
      await einrichtungZugang(a);
      return ok({ installiert: await pakete.installierte(), dms: eigeneVersion() });
    } },
    { methode: 'POST', pfad: '/api/einrichtung/pakete/katalog', zugang: 'offen', lesend: true, handler: async (a) => {
      await einrichtungZugang(a);
      return ok(await pakete.abrufen(false));
    } },
    { methode: 'POST', pfad: '/api/einrichtung/pakete/plan', zugang: 'offen', lesend: true, handler: async (a) => {
      await einrichtungZugang(a);
      const liste = (b(a) as { pakete?: unknown }).pakete;
      return ok(await pakete.ablaufPlan({ pakete: Array.isArray(liste) ? liste.filter((p): p is string => typeof p === 'string').slice(0, 100) : [] }));
    } },
    // E-Mail-Versand im Assistenten (#813, #804): nur die Server-Suche, nur lesend; gespeichert wird erst mit „Jetzt einrichten“.
    { methode: 'POST', pfad: '/api/einrichtung/mail/finden', zugang: 'offen', lesend: true, handler: async (a) => {
      await einrichtungZugang(a);
      return ok(await betrieb().findeServer(b(a)));
    } },
    { methode: 'POST', pfad: '/api/konto/einrichten', zugang: 'offen', handler: async (a) => {
      const r = x.einrichtung ? await x.einrichtung.einrichten(b(a), a.einrichtungscode, info(a)) : await konten.einrichten(b(a), info(a));
      L.konto.info('Erste Person mit „Gesamte Verwaltung“ eingerichtet', { email: r.benutzer.email });
      // Sprache aus dem ersten Schritt des Assistenten (#729): Sprache der Installation und der Person, die einrichtet.
      let benutzer = r.benutzer;
      const spr = b(a).sprache;
      if (x.sprachen && istVerfuegbar(spr)) {
        await x.sprachen.speichere({ standard: spr, erlaubt: [...new Set([...SPRACHEN_STANDARD.erlaubt, spr])] });
        benutzer = await konten.aendereProfil(benutzer, { sprache: spr });
      }
      return { status: 201, body: { benutzer }, sitzungSetzen: r.schluessel };
    } },
    { methode: 'POST', pfad: '/api/konto/anmelden', zugang: 'offen', handler: async (a) => {
      let r;
      try { r = await konten.anmelden(b(a), a.ip, a.geraet); } catch (e) {
        L.konto.warn('Anmeldung fehlgeschlagen', { email: String(b(a).email ?? ''), ip: a.ip, grund: (e as Error).message });
        throw e;
      }
      // Zwei-Faktor (#242): Passwort stimmt, jetzt der Code – oder ein Passkey (#811).
      if ('zweiterSchritt' in r && r.zweiterSchritt) return ok({ zweiterSchritt: r.zweiterSchritt, wege: r.wege });
      if (!r.benutzer || !r.schluessel) throw new Fachfehler(500, t('anmeldung.fehler.unvollstaendig'));
      await nurAdminsInWartung({ benutzer: r.benutzer, schluessel: r.schluessel });
      L.konto.info('Angemeldet', { email: r.benutzer.email, ip: a.ip, geraet: a.geraet });
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },
    { methode: 'POST', pfad: '/api/konto/anmelden/code', zugang: 'offen', handler: async (a) => {
      let r;
      try { r = await konten.anmeldenMitCode(b(a), a.ip); } catch (e) {
        L.konto.warn('Zweiter Faktor falsch', { ip: a.ip, grund: (e as Error).message });
        throw e;
      }
      await nurAdminsInWartung(r);
      L.konto.info(r.wiederherstellung ? 'Angemeldet mit Wiederherstellungscode' : 'Angemeldet (zwei Faktoren)', { email: r.benutzer.email, ip: a.ip, geraet: a.geraet });
      return { body: { benutzer: r.benutzer, wiederherstellung: r.wiederherstellung }, sitzungSetzen: r.schluessel };
    } },
    /* ---------- Anmeldung über einen Anbieter, OpenID Connect (#241) ---------- */
    { methode: 'GET', pfad: '/api/konto/anbieter/start', zugang: 'offen', handler: async () => {
      try {
        const s = await oidc().start(`${adresse()}/api/konto/anbieter/rueckkehr`);
        return { weiterleiten: s.url, cookies: [kurzCookie(BINDUNG_COOKIE, s.bindung, 600, '/api/konto/anbieter')] };
      } catch (e) {
        L.konto.warn('Anmeldung über den Anbieter nicht begonnen', { fehler: (e as Error).message });
        return { weiterleiten: `/?anmeldefehler=${encodeURIComponent((e as Error).message)}` };
      }
    } },
    { methode: 'GET', pfad: '/api/konto/anbieter/rueckkehr', zugang: 'offen', handler: async (a) => {
      const raus = [kurzCookie(BINDUNG_COOKIE, '', 0, '/api/konto/anbieter')];
      try {
        const id = await oidc().rueckkehr(a.query, leseCookie(a.cookieKopf, BINDUNG_COOKIE));
        const r = await konten.anmeldenMitAnbieter(id, (await oidc().bereit())!, { ip: a.ip, geraet: a.geraet ?? '' });
        raus.push(kurzCookie(ANBIETER_COOKIE, '1', SITZUNG_SEKUNDEN, '/'));
        if ('zweiterSchritt' in r && r.zweiterSchritt) {
          L.konto.info('Anbieter bestätigt, Zwei-Faktor folgt', { email: id.email, ip: a.ip });
          // Wege im Anker (#811): c = Code, p = Passkey – die Oberfläche zeigt nur, was geht.
          const w = `${r.wege.code ? 'c' : ''}${r.wege.passkey ? 'p' : ''}`;
          return { weiterleiten: `/anmelden/code#${r.zweiterSchritt}.${w}`, cookies: raus };
        }
        if (!r.benutzer || !r.schluessel) throw new Fachfehler(500, t('anmeldung.fehler.unvollstaendig'));
        await nurAdminsInWartung({ benutzer: r.benutzer, schluessel: r.schluessel });
        L.konto.info('Angemeldet über den Anbieter', { email: r.benutzer.email, ip: a.ip, geraet: a.geraet });
        return { weiterleiten: '/', sitzungSetzen: r.schluessel, cookies: raus };
      } catch (e) {
        L.konto.warn('Anmeldung über den Anbieter fehlgeschlagen', { ip: a.ip, grund: (e as Error).message });
        return { weiterleiten: `/?anmeldefehler=${encodeURIComponent((e as Error).message)}`, cookies: raus };
      }
    } },
    { methode: 'GET', pfad: '/api/werkbank/anbieter', zugang: 'admin', handler: async () => ok({ ...(await oidc().ansicht()), rueckkehr: `${adresse()}/api/konto/anbieter/rueckkehr`, abmeldenZurueck: `${adresse()}/` }) },
    { methode: 'PUT', pfad: '/api/werkbank/anbieter', zugang: 'admin', handler: async (a) => ok({ ...(await oidc().speichere(a.body, ich(a).email)), rueckkehr: `${adresse()}/api/konto/anbieter/rueckkehr`, abmeldenZurueck: `${adresse()}/` }) },
    { methode: 'POST', pfad: '/api/werkbank/anbieter/pruefen', zugang: 'admin', handler: async () => ok(await oidc().pruefe()) },
    /* ---------- Befehl dms im Container (#244) ---------- */
    { methode: 'POST', pfad: '/api/konsole/passwort', zugang: 'offen', konsole: true, handler: async (a) => {
      const z = await konten.setzePasswortDirekt(b(a).email, b(a).passwort);
      L.konto.warn('Passwort über die Konsole gesetzt, alle Sitzungen beendet', { email: z.email, aktiv: z.aktiv });
      return ok({ email: z.email, name: z.name, verwaltung: z.verwaltung ?? [], aktiv: z.aktiv, zweifaktor: konten.zweifaktor ? await konten.zweifaktor.aktiv(z.id) : false });
    } },
    { methode: 'GET', pfad: '/api/konsole/ich', zugang: 'offen', konsole: true, handler: async (a) => ok({ als: a.benutzer?.email ?? null, version: eigeneVersion() }) },
    /* ---------- Zwei-Faktor-Anmeldung (#242) ---------- */
    // Pflicht: nur, solange kein Passkey sie erfüllt (#811) – dann darf die Code-App auch wieder weg.
    { methode: 'GET', pfad: '/api/konto/zweifaktor', zugang: 'angemeldet', handler: async (a) => {
      const rolle = (await zf().pflicht())[pflichtRolle(ich(a))];
      const passkey = !!konten.passkeys && (await konten.passkeys.fuerPflicht(ich(a).id));
      return ok({ ...(await zf().status(ich(a).id)), pflicht: rolle && !passkey, passkeyErfuellt: rolle && passkey });
    } },
    { methode: 'POST', pfad: '/api/konto/zweifaktor/beginnen', zugang: 'angemeldet', handler: async (a) => ok(await zf().beginne(ich(a), (await x.designs?.marke())?.schriftzug || 'Ablago')) },
    { methode: 'POST', pfad: '/api/konto/zweifaktor/bestaetigen', zugang: 'angemeldet', handler: async (a) => {
      const codes = await zf().bestaetige(ich(a).id, b(a).code, ich(a).email);
      // #819: Zwei-Faktor geändert – Verwaltungsmodus und Tagesmerker gelten nicht mehr.
      await konten.zweifaktorGeaendert(ich(a).id);
      return ok({ codes });
    } },
    { methode: 'POST', pfad: '/api/konto/zweifaktor/codes', zugang: 'angemeldet', handler: async (a) => {
      await konten.pruefeEigenesPasswort(ich(a), b(a).passwort);
      return ok({ codes: await zf().neueCodes(ich(a).id, ich(a).email) });
    } },
    { methode: 'POST', pfad: '/api/konto/zweifaktor/entfernen', zugang: 'angemeldet', handler: async (a) => {
      if ((await zf().pflicht())[pflichtRolle(ich(a))] && !(konten.passkeys && (await konten.passkeys.fuerPflicht(ich(a).id)))) throw new Fachfehler(409, t('meldungen.routen.fuer-dich-ist-die'));
      await konten.pruefeEigenesPasswort(ich(a), b(a).passwort);
      await zf().entferne(ich(a).id, ich(a).email);
      await konten.zweifaktorGeaendert(ich(a).id);
      return leer;
    } },
    /* ---------- Passkeys (#811) ---------- */
    // Anmelden: Optionen holen (ohne E-Mail-Adresse oder als zweiter Schritt), dann die Antwort des Geräts prüfen.
    { methode: 'POST', pfad: '/api/konto/passkey/optionen', zugang: 'offen', handler: async (a) => ok(await konten.passkeyOptionen(b(a), a.ip)) },
    { methode: 'POST', pfad: '/api/konto/passkey/anmelden', zugang: 'offen', handler: async (a) => {
      const zweiter = b(a).zweiterSchritt !== undefined && b(a).zweiterSchritt !== null;
      let r;
      try { r = await konten.anmeldenMitPasskey(b(a), a.ip, a.geraet); } catch (e) {
        L.konto.warn(zweiter ? 'Zweiter Faktor falsch (Passkey)' : 'Anmeldung mit Passkey fehlgeschlagen', { ip: a.ip, grund: (e as Error).message });
        throw e;
      }
      await nurAdminsInWartung(r);
      L.konto.info(zweiter ? 'Angemeldet (Passwort und Passkey)' : 'Angemeldet mit Passkey', { email: r.benutzer.email, ip: a.ip, geraet: a.geraet, passkey: r.passkey });
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },
    // Mein Konto → Sicherheit: eigene Passkeys. Nicht in einer Vertretung – dort ändert niemand die Anmeldung eines anderen.
    { methode: 'GET', pfad: '/api/konto/passkeys', zugang: 'angemeldet', handler: async (a) => ok({
      liste: await pk().liste(ich(a).id), moeglich: !!pk().rp(), adresse: pk().rp()?.rpId ?? null,
      pflicht: await konten.passkeyNoetig(ich(a)), hoechstens: PASSKEYS_HOECHSTENS,
    }) },
    { methode: 'POST', pfad: '/api/konto/passkeys/beginnen', zugang: 'angemeldet', handler: async (a) => {
      ohneVertretung(a);
      return ok(await pk().beginneRegistrierung(ich(a)));
    } },
    { methode: 'POST', pfad: '/api/konto/passkeys', zugang: 'angemeldet', handler: async (a) => {
      ohneVertretung(a);
      return { status: 201, body: await pk().bestaetigeRegistrierung(ich(a), b(a).antwort, b(a).name) };
    } },
    { methode: 'PUT', pfad: '/api/konto/passkeys/:nr', zugang: 'angemeldet', handler: async (a) => {
      ohneVertretung(a);
      return ok(await pk().benenne(ich(a), a.params.nr, b(a).name));
    } },
    // Entfernen nur mit frischer Anmeldung (#819): Wer nur kurz an einem fremden, angemeldeten Gerät sitzt, entfernt nichts.
    { methode: 'DELETE', pfad: '/api/konto/passkeys/:nr', zugang: 'angemeldet', handler: async (a) => {
      ohneVertretung(a);
      if (!konten.istFrisch(a.sitzungsDaten)) throw new Fachfehler(403, t('konten.verwaltung.fehler.frisch'), { frisch: true, handlung: 'passkey-entfernen' });
      // Vorgeschrieben (wie bei der Zwei-Faktor-Anmeldung): den letzten passenden nicht entfernen.
      const liste = await pk().liste(ich(a).id);
      const der = liste.find((p) => p.nr === a.params.nr);
      // Nur Passkeys für die gepflegte Adresse erfüllen eine Pflicht – nur deren letzten schützen.
      const rp = pk().pflichtRp();
      const zaehlt = (p: { rpId: string }) => !!rp && p.rpId === rp.rpId;
      const noetig = der && zaehlt(der) && liste.filter(zaehlt).length === 1 ? await konten.passkeyNoetig(ich(a)) : null;
      if (noetig) throw new Fachfehler(409, t(noetig === 'passkey' ? 'anmeldung.passkey.fehler.letzter' : 'anmeldung.passkey.fehler.letzter.zweifaktor'));
      return ok(await pk().entferne(ich(a), a.params.nr, ich(a).email));
    } },
    // Erneute Anmeldung mit Passkey (Verwaltungsmodus, heikle Handlungen): Optionen nur mit den eigenen Passkeys.
    // `{ fuer: 'dokumentpasswoerter' }`: eigene Herausforderung für „Passwörter für Dokumente“ (#827).
    { methode: 'POST', pfad: '/api/konto/passkeys/bestaetigen/optionen', zugang: 'angemeldet', handler: async (a) => ok(await konten.passkeyBestaetigungOptionen(ich(a), a.sitzungsDaten, b(a).fuer)) },
    // Werkbank → Anmeldeschutz: Passkey je Rolle vorschreiben; Verwaltung: Passkeys einer Person zurücksetzen.
    // `moeglich` = gepflegte HTTPS-Adresse vorhanden – nur dann lässt sich die Pflicht einschalten (Durchsicht Sicherheit).
    { methode: 'GET', pfad: '/api/werkbank/passkeys', zugang: 'admin', handler: async () => ok({ ...(await pk().pflicht()), moeglich: !!pk().pflichtRp(), adresse: pk().pflichtRp()?.origin ?? null }) },
    { methode: 'PUT', pfad: '/api/werkbank/passkeys', zugang: 'admin', handler: async (a) => ok({ ...(await pk().setzePflicht(a.body, ich(a).email)), moeglich: !!pk().pflichtRp(), adresse: pk().pflichtRp()?.origin ?? null }) },
    { methode: 'GET', pfad: '/api/benutzer/:id/passkeys', zugang: 'admin', handler: async (a) => ok({ anzahl: await pk().anzahl(a.params.id) }) },
    { methode: 'POST', pfad: '/api/benutzer/:id/passkeys/zuruecksetzen', zugang: 'admin', handler: async (a) => {
      await konten.pruefeKontoVon(ich(a), a.params.id);
      const ziel = (await konten.listeBenutzer()).find((x) => x.id === a.params.id);
      if (!ziel || !(await pk().entferneAlle(ziel.id, ziel.email, ich(a).email))) throw new Fachfehler(404, t('anmeldung.passkey.fehler.keine'));
      return leer;
    } },
    { methode: 'GET', pfad: '/api/werkbank/zweifaktor', zugang: 'admin', handler: async () => ok(await zf().pflicht()) },
    { methode: 'PUT', pfad: '/api/werkbank/zweifaktor', zugang: 'admin', handler: async (a) => ok(await zf().setzePflicht(a.body, ich(a).email)) },
    { methode: 'GET', pfad: '/api/benutzer/:id/zweifaktor', zugang: 'admin', handler: async (a) => ok(await zf().status(a.params.id)) },
    { methode: 'POST', pfad: '/api/benutzer/:id/zweifaktor/zuruecksetzen', zugang: 'admin', handler: async (a) => {
      await konten.pruefeKontoVon(ich(a), a.params.id);
      if (!(await zf().entferne(a.params.id, ich(a).email))) throw new Fachfehler(404, t('meldungen.routen.dieser-benutzer-hat-keine'));
      await konten.zweifaktorGeaendert(a.params.id);
      return leer;
    } },
    { methode: 'POST', pfad: '/api/konto/abmelden', zugang: 'offen', handler: async (a) => {
      // Papierkorb beim Abmelden leeren, wenn im Profil so eingestellt (#43) – nicht, solange ein Administrator vertritt.
      if (a.benutzer && !a.sitzungsDaten?.vertretungId && (await konten.einstellungen(a.benutzer)).papierkorb_beim_abmelden === true) {
        await dienst.papierkorbVerwaltung.leerePapierkorb(a.benutzer, false, { weg: 'abmelden' }).catch((e) => L.ablage.warn('Papierkorb beim Abmelden nicht geleert', { fehler: (e as Error).message }));
      }
      await konten.abmelden(a.sitzung);
      if (a.benutzer) L.konto.info('Abgemeldet', { email: a.benutzer.email });
      // Über einen Anbieter angemeldet (#241): auch dort abmelden, wenn eingestellt.
      const beimAnbieter = leseCookie(a.cookieKopf, ANBIETER_COOKIE) === '1' && x.oidc ? await x.oidc.abmeldeUrl(`${adresse()}/`) : null;
      return { status: beimAnbieter ? 200 : 204, body: beimAnbieter ? { abmelden: beimAnbieter } : undefined, sitzungSetzen: null, cookies: [kurzCookie(ANBIETER_COOKIE, '', 0, '/')] };
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
      if ('zweiterSchritt' in r && r.zweiterSchritt) return ok({ zweiterSchritt: r.zweiterSchritt, wege: r.wege });
      if (!r.schluessel) throw new Fachfehler(500, t('anmeldung.fehler.unvollstaendig'));
      await nurAdminsInWartung({ benutzer: r.benutzer, schluessel: r.schluessel });
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },
  ];
}

export function notfallRouten(k: RoutenKontext): Route[] {
  const { notfallblattErzeugen, nf } = k;
  return [
    /*
     * Notfallzugang mit dem Notfallcode vom Notfallblatt (#815) – ohne Anmeldung, auf /notfall. Erst der richtige Code
     * zeigt die Konten zur Wahl; jede Fehleingabe sperrt den Adressbereich 30 Sekunden (notfallcode.ts).
     */
    { methode: 'GET', pfad: '/api/notfall', zugang: 'offen', handler: async (a) => ok(await nf().stand(a)) },
    { methode: 'POST', pfad: '/api/notfall/pruefen', zugang: 'offen', handler: async (a) => ok(await nf().pruefe(a, b(a).code)) },
    { methode: 'POST', pfad: '/api/notfall/einloesen', zugang: 'offen', handler: async (a) => ok(await nf().einloesen(a, b(a))) },
    { methode: 'GET', pfad: '/api/notfall/blatt', zugang: 'offen', ohneHead: true, handler: async (a) => {
      const inhalt = await nf().blatt(a.query.schluessel, notfallblattErzeugen);
      return { datei: { inhalt, name: `Ablago-Notfallblatt-${new Date().toISOString().slice(0, 10)}.pdf`, mime: 'application/pdf', anzeigen: false, groesse: inhalt.length, koepfe: { 'cache-control': 'no-store' } } };
    } },
    // Anrede (#474): Die Abrufseite fragt nur ab, ob sie „du“ oder „Sie“ schreibt – sonst nichts über das DMS.
  ];
}
