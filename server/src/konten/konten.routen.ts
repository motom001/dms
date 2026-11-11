/**
 * Konten und Benutzer (#960: aus routen.ts): eigenes Profil, Abwesenheit, Einstellungen, Ablago entdecken, Benutzer,
 * Dokument-Passwörter, Sitzungen, Vertretung und API-Schlüssel im eigenen Profil.
 */
import { Fachfehler } from '../fehler';
import { t } from '../sprache';
import { GEMERKT_MAX } from '../../../shared/src/entsperren';
import { L, ok, leer, b, info, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../routen';

export function kontenRouten(k: RoutenKontext): Route[] {
  const { dienst, konten, log, entdecken, nurSelbst, zg, empfaengerSichtbar, mitRollen, zf } = k;
  return [
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

    /* ---------- Ablago entdecken (#831, #832) ---------- */
    // Gefiltert nach der Person (Verwaltungsrecht, eingeschaltete Funktionen). In Vertretung startet nichts von selbst,
    // und Ablago merkt sich nichts für die vertretene Person.
    { methode: 'GET', pfad: '/api/entdecken', zugang: 'angemeldet', handler: async (a) => ok(await entdecken.stand(ich(a), { vertretung: !!a.sitzungsDaten?.vertretungId })) },
    { methode: 'POST', pfad: '/api/entdecken/tipps/:schluessel', zugang: 'angemeldet', handler: async (a) => {
      if (!a.sitzungsDaten?.vertretungId) await entdecken.tipp(ich(a), a.params.schluessel, b(a).aktion);
      return leer;
    } },
    { methode: 'POST', pfad: '/api/entdecken/rundgaenge/:schluessel', zugang: 'angemeldet', handler: async (a) => {
      if (!a.sitzungsDaten?.vertretungId) await entdecken.rundgang(ich(a), a.params.schluessel, b(a).stand);
      return leer;
    } },

    /* ---------- Benutzer ---------- */
    // #137: nur Benutzer, deren Benutzer-Mappe man lesen darf (Administratoren: alle).
    { methode: 'GET', pfad: '/api/personen', zugang: 'angemeldet', handler: async (a) => {
      const alle = await konten.personen();
      const sichtbar = await dienst.rechtepruefung.lesbare(await zg(a), alle.map((p) => p.id));
      // Dienstkonten der Pakete haben keine Benutzer-Mappe; ihr Name („Paket …“) ist für alle sichtbar (#338).
      // Ebenso Systemkonten wie „Automatisierung“ (#673).
      return ok(alle.filter((p) => sichtbar.has(p.id) || ('art' in p && (p.art === 'dienst' || p.art === 'system'))));
    } },
    // Systemkonten und Dienstkonten der Pakete (#673): sichtbar, aber nicht bearbeitbar.
    { methode: 'GET', pfad: '/api/benutzer/systemkonten', zugang: 'admin', handler: async () => ok(await dienst.postSystemmappen.systemkontenUebersicht(await konten.listeSystemkonten(), await konten.listeDienstkonten())) },
    { methode: 'GET', pfad: '/api/benutzer', zugang: 'admin', handler: async () => {
      const rollen = await dienst.systemtypen.weitereRollen();
      // Offene Aufgaben je Benutzer (#77): Deaktivieren geht erst ohne.
      const offen = new Map<string, number>();
      for (const x of await dienst.alleAufgaben()) if (x.empfaengerId) offen.set(x.empfaengerId, (offen.get(x.empfaengerId) ?? 0) + 1);
      return ok((await konten.listeBenutzer()).map((x) => ({ ...x, rollen: rollen.get(x.id) ?? [], offeneAufgaben: offen.get(x.id) ?? 0 })));
    } },
    { methode: 'POST', pfad: '/api/benutzer', zugang: 'admin', handler: async (a) => {
      if (b(a).rollen !== undefined) await dienst.postSystemmappen.pruefeRollen(b(a).rollen);
      // Verwaltungsrecht beim Anlegen nur über den Befehl dms (`--admin`); in der Oberfläche danach mit frischer Anmeldung (#818).
      const r = await konten.legeBenutzerAn({ email: b(a).email, name: b(a).name, verwaltung: a.konsole ? b(a).verwaltung : undefined }, ich(a).id);
      if (b(a).rollen !== undefined) await dienst.postSystemmappen.setzeRollen(r.benutzer.id, b(a).rollen, ich(a).id);
      L.konto.info('Benutzer angelegt', { email: r.benutzer.email, verwaltung: r.benutzer.verwaltung?.join(', ') || '–', mail: r.mailVerschickt });
      if (r.mailFehler) L.mail.warn('Einladung nicht verschickt', { an: r.benutzer.email, fehler: r.mailFehler });
      return ok({ ...r, benutzer: await mitRollen(r.benutzer) }, 201);
    } },
    { methode: 'PUT', pfad: '/api/benutzer/:id', zugang: 'admin', handler: async (a) => {
      // Weitere Rollen zuerst prüfen, damit eine ungültige Auswahl nichts halb ändert.
      if (b(a).rollen !== undefined) {
        if (!(await konten.listeBenutzer()).some((x) => x.id === a.params.id)) throw new Fachfehler(404, t('meldungen.routen.diesen-benutzer-gibt-es'));
        await dienst.postSystemmappen.pruefeRollen(b(a).rollen);
      }
      const r = await konten.aendereBenutzer(ich(a), a.params.id, b(a));
      if (b(a).rollen !== undefined) await dienst.postSystemmappen.setzeRollen(r.id, b(a).rollen, ich(a).id);
      L.konto.info('Benutzer geändert', { email: r.email, aenderung: b(a) });
      return ok(await mitRollen(r));
    } },
    // Verwaltungsrecht (#818): nur „Gesamte Verwaltung“, mit frischer Anmeldung (heikle Handlung „rechte“).
    { methode: 'PUT', pfad: '/api/benutzer/:id/verwaltung', zugang: 'admin', handler: async (a) => {
      const r = await konten.setzeVerwaltung(ich(a), a.params.id, b(a).verwaltung, (m) => L.mail.warn(m));
      return ok(await mitRollen(r));
    } },
    { methode: 'GET', pfad: '/api/rollen', zugang: 'admin', handler: async () => ok(await dienst.postSystemmappen.listeRollen()) },
    { methode: 'DELETE', pfad: '/api/benutzer/:id', zugang: 'admin', handler: async (a) => {
      await konten.loescheBenutzer(ich(a), a.params.id);
      // Gemerkte Passwörter für Dokumente (#827) gehören nur dieser Person: mit weg.
      await dienst.geschuetztePdfs.pdfEntsperren?.vergiss(a.params.id).catch(() => {});
      L.konto.info('Benutzer gelöscht', { id: a.params.id });
      return leer;
    } },
    { methode: 'POST', pfad: '/api/benutzer/:id/link', zugang: 'admin', handler: async (a) => {
      await konten.pruefeKontoVon(ich(a), a.params.id);
      const r = await konten.neuerLink(a.params.id);
      L.konto.info('Passwort-Link erzeugt', { email: r.benutzer.email, mail: r.mailVerschickt });
      return ok(r);
    } },
    /*
     * Passwörter für Dokumente (#827, Mein Konto → Sicherheit): gehören nur der Person – nicht mit API-Schlüssel, nicht
     * in einer Vertretung. Anzeigen und Ändern des Passworts nur nach erneuter Bestätigung (5 Minuten je Sitzung).
     */
    { methode: 'GET', pfad: '/api/konto/dokument-passwoerter', zugang: 'angemeldet', handler: async (a) => {
      const e = nurSelbst(a);
      return ok({ eintraege: await e.liste(ich(a).id), bestaetigtBis: await e.bestaetigtBis(a.sitzungsDaten?.id), max: GEMERKT_MAX, zweifaktor: (await zf().status(ich(a).id)).aktiv });
    } },
    { methode: 'POST', pfad: '/api/konto/dokument-passwoerter', zugang: 'angemeldet', handler: async (a) => ok(await nurSelbst(a).merke(ich(a).id, b(a).name, b(a).passwort), 201) },
    { methode: 'POST', pfad: '/api/konto/dokument-passwoerter/bestaetigen', zugang: 'angemeldet', handler: async (a) => {
      const e = nurSelbst(a);
      const bis = await e.bestaetige(ich(a).id, a.sitzungsDaten?.id, async () => {
        // Ein Code der Zwei-Faktor-Anmeldung (nur sechs Ziffern: kein Wiederherstellungscode wird verbraucht) oder das Passwort.
        const code = String(b(a).code ?? '').replace(/\s/g, '');
        if (/^\d{6}$/.test(code)) { if ((await zf().pruefe(ich(a).id, code)) !== 'totp') throw new Fachfehler(403, t('mappen.entsperren.gemerkt.code-falsch')); return; }
        await konten.pruefeEigenesPasswort(ich(a), b(a).passwort);
      });
      return ok({ bestaetigtBis: bis });
    } },
    { methode: 'GET', pfad: '/api/konto/dokument-passwoerter/:id', zugang: 'angemeldet', handler: async (a) => {
      const e = nurSelbst(a);
      await e.pruefeBestaetigt(a.sitzungsDaten?.id);
      return { status: 200, body: { passwort: await e.zeige(ich(a).id, a.params.id) }, koepfe: { 'cache-control': 'no-store' } };
    } },
    { methode: 'PUT', pfad: '/api/konto/dokument-passwoerter/:id', zugang: 'angemeldet', handler: async (a) => {
      const e = nurSelbst(a);
      if (b(a).passwort !== undefined) await e.pruefeBestaetigt(a.sitzungsDaten?.id);
      return ok(await e.aendere(ich(a).id, a.params.id, { name: b(a).name, passwort: b(a).passwort }));
    } },
    { methode: 'DELETE', pfad: '/api/konto/dokument-passwoerter/:id', zugang: 'angemeldet', handler: async (a) => { await nurSelbst(a).loesche(ich(a).id, a.params.id); return leer; } },
    // Eigene angemeldete Geräte (#69): ansehen und beenden – nicht während einer Vertretung.
    { methode: 'GET', pfad: '/api/konto/sitzungen', zugang: 'angemeldet', handler: async (a) => ok(await konten.sitzungenVon(ich(a).id, a.sitzungsDaten?.id)) },
    { methode: 'DELETE', pfad: '/api/konto/sitzungen/:sitzung', zugang: 'angemeldet', handler: async (a) => {
      if (a.sitzungsDaten?.vertretungId) throw new Fachfehler(403, t('meldungen.routen.in-einer-vertretung-lassen'));
      if (a.params.sitzung === a.sitzungsDaten?.id) throw new Fachfehler(409, t('meldungen.routen.das-ist-dieses-geraet'));
      await konten.beendeSitzung(ich(a).id, a.params.sitzung);
      L.konto.info('Eigene Sitzung beendet', { sitzung: a.params.sitzung.slice(0, 8) });
      return leer;
    } },
    { methode: 'POST', pfad: '/api/konto/sitzungen/andere-beenden', zugang: 'angemeldet', handler: async (a) => {
      if (a.sitzungsDaten?.vertretungId) throw new Fachfehler(403, t('meldungen.routen.in-einer-vertretung-lassen'));
      const r = await konten.beendeAndereSitzungen(ich(a).id, a.sitzungsDaten?.id);
      L.konto.info('Andere eigene Sitzungen beendet', { anzahl: r.beendet });
      return ok(r);
    } },
    // Sitzungen Verwaltender (Geräte, Adressen, Abmelden) nur mit „Gesamte Verwaltung“ (#957).
    { methode: 'GET', pfad: '/api/benutzer/:id/sitzungen', zugang: 'admin', handler: async (a) => {
      await konten.pruefeKontoVon(ich(a), a.params.id);
      return ok(await konten.sitzungenVon(a.params.id, a.sitzungsDaten?.id));
    } },
    { methode: 'DELETE', pfad: '/api/benutzer/:id/sitzungen', zugang: 'admin', handler: async (a) => {
      await konten.pruefeKontoVon(ich(a), a.params.id);
      const r = await konten.beendeAlleSitzungen(a.params.id);
      L.konto.info('Alle Sitzungen eines Benutzers beendet', { id: a.params.id, anzahl: r.beendet });
      return ok(r);
    } },
    { methode: 'DELETE', pfad: '/api/benutzer/:id/sitzungen/:sitzung', zugang: 'admin', handler: async (a) => {
      await konten.pruefeKontoVon(ich(a), a.params.id);
      await konten.beendeSitzung(a.params.id, a.params.sitzung);
      L.konto.info('Sitzung beendet', { id: a.params.id, sitzung: a.params.sitzung });
      return leer;
    } },
    { methode: 'POST', pfad: '/api/benutzer/:id/vertreten', zugang: 'admin', handler: async (a) => {
      const r = await konten.vertrete(ich(a), a.sitzung, a.params.id, info(a));
      L.konto.warn('Im Namen eines anderen Benutzers angemeldet', { von: ich(a).email, als: r.benutzer.email, imVerwaltungsmodus: true });
      return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
    } },
  ];
}

export function apiSchluesselRouten(k: RoutenKontext): Route[] {
  const { schluessel } = k;
  return [
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
}
