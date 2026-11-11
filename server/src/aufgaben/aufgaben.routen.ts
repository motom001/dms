/**
 * Aufgaben (#960: aus routen.ts): Aufgaben, Fristen und Termine, Erinnerungen, tägliche Zusammenfassung.
 */
import { Fachfehler } from '../fehler';
import { t } from '../sprache';
import { pruefeZeit } from '../aufgabenmail';
import { L, ok, leer, b, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../routen';

export function aufgabenRouten(k: RoutenKontext): Route[] {
  const { dienst, konten, x, zusammenfassung, zg, empfaengerSichtbar, leseHinweis, darf } = k;
  return [
    // Aufgaben (#54, #56)
    { methode: 'GET', pfad: '/api/aufgaben', zugang: 'angemeldet', handler: async (a) => ok(await dienst.vertretung.meineAufgaben(ich(a), await zg(a))) },
    { methode: 'GET', pfad: '/api/mappen/:id/aufgaben', zugang: 'angemeldet', handler: async (a) => { await darf(a, a.params.id, 'R'); return ok(await dienst.ohneLeserecht.aufgabenVon(a.params.id)); } },
    { methode: 'POST', pfad: '/api/mappen/:id/aufgaben', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, a.params.id, 'R');
      await empfaengerSichtbar(a, b(a).empfaengerId);
      const auf = await dienst.vertretung.legeAufgabeAn(a.params.id, a.body, ich(a).id);
      return ok({ ...auf, ...await leseHinweis(auf.empfaengerId, a.params.id) }, 201);
    } },
    // Vor dem Zuweisen (#798): Darf dieser Benutzer die Mappe lesen? Nur ja/nein, für den Hinweis mit „Trotzdem zuweisen“.
    { methode: 'GET', pfad: '/api/mappen/:id/leserecht/:benutzer', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, a.params.id, 'R');
      await empfaengerSichtbar(a, a.params.benutzer);
      return ok({ lesen: await dienst.rechtepruefung.kannLesen(a.params.benutzer, a.params.id) });
    } },
    { methode: 'POST', pfad: '/api/aufgaben/:id/erledigt', zugang: 'angemeldet', handler: async (a) => ok(await dienst.vertretung.erledigeAufgabe(a.params.id, ich(a))) },
    // Automatisch zugeordnet (#337): Rückgängig direkt aus der Aufgabe.
    { methode: 'POST', pfad: '/api/aufgaben/:id/rueckgaengig', zugang: 'angemeldet', handler: async (a) => ok(await dienst.post.automatikRueckgaengig(a.params.id, ich(a), await zg(a))) },
    // Sammel-Weitergabe und -Erledigen (#415, #419): Werkbank → Aufgaben und Profil → Abwesenheit.
    { methode: 'POST', pfad: '/api/aufgaben/weitergeben', zugang: 'angemeldet', handler: async (a) => {
      await empfaengerSichtbar(a, b(a).empfaengerId);
      return ok(await dienst.vertretung.aufgabenWeitergeben(b(a).ids, b(a).empfaengerId, ich(a)));
    } },
    { methode: 'POST', pfad: '/api/aufgaben/erledigt', zugang: 'angemeldet', handler: async (a) => ok(await dienst.vertretung.aufgabenErledigen(b(a).ids, ich(a))) },
    { methode: 'POST', pfad: '/api/aufgaben/:id/delegieren', zugang: 'angemeldet', handler: async (a) => {
      await empfaengerSichtbar(a, b(a).empfaengerId);
      const auf = await dienst.vertretung.delegiereAufgabe(a.params.id, b(a).empfaengerId, ich(a));
      return ok({ ...auf, ...await leseHinweis(auf.empfaengerId, auf.mappeId) });
    } },
    { methode: 'GET', pfad: '/api/werkbank/aufgaben', zugang: 'admin', handler: async (a) => {
      // Aufgaben, deren Empfänger die Mappe nicht lesen darf (#129, #131; seit #798 jede Art, über die Fälle).
      await dienst.ohneLeserecht.faelleAbgleichen();
      return ok({
        aufgaben: await dienst.ohneLeserecht.alleAufgaben(a.query.erledigt !== undefined),
        mail: x.aufgabenmail ? await x.aufgabenmail.einstellung() : null,
        unlesbar: (await dienst.ohneLeserecht.offeneFaelle()).map((f) => f.aufgabeId),
      });
    } },
    // Aufgaben bei Personen ohne Leserecht (#798): offene und vergangene Fälle; Leserecht auf Zeit gibt nur der Admin.
    { methode: 'GET', pfad: '/api/werkbank/aufgaben/ohne-leserecht', zugang: 'admin', handler: async () => ok(await dienst.ohneLeserecht.faelleUebersicht()) },
    { methode: 'POST', pfad: '/api/werkbank/aufgaben/ohne-leserecht/:id/leserecht', zugang: 'admin', handler: async (a) => ok(await dienst.ohneLeserecht.leserechtAufZeitGeben(a.params.id, ich(a).id)) },
    // Fristen (#129–#132)
    { methode: 'POST', pfad: '/api/aufgaben/:id/folgetermin', zugang: 'angemeldet', handler: async (a) => ok(await dienst.fristen.setzeFolgetermin(a.params.id, ich(a), await zg(a))) },
    // Termine für „Zu erledigen“ → Monat und Jahr (?von=&bis=&favoriten=1, #528, #725) – mit den Feiertagen der Region (#726).
    { methode: 'GET', pfad: '/api/termine', zugang: 'angemeldet', handler: async (a) => ok(await dienst.fristen.termine(await zg(a), { von: a.query.von, bis: a.query.bis, favoriten: a.query.favoriten },
      x.region ? (await x.region.lies()).bundesland : x.aufgabenmail ? (await x.aufgabenmail.einstellung()).bundesland : null)) },
    // Startseite (#725): Kachel „Nächster Termin“.
    { methode: 'GET', pfad: '/api/termine/naechster', zugang: 'angemeldet', handler: async (a) => ok(await dienst.fristen.naechsterTermin(await zg(a))) },
    // Alte Adresse (#725): „Anstehend“ gibt es nicht mehr.
    { methode: 'GET', pfad: '/api/anstehend', zugang: 'angemeldet', handler: async () => { throw new Fachfehler(410, t('meldungen.routen.anstehend-gibt-es-nicht')); } },
    { methode: 'POST', pfad: '/api/mappen/:id/erinnerungen', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, a.params.id, 'R');
      await empfaengerSichtbar(a, b(a).empfaengerId);
      const e = await dienst.fristen.legeErinnerungAn(a.params.id, a.body, ich(a).id);
      return ok({ ...e, ...await leseHinweis(e.empfaengerId, a.params.id) }, 201);
    } },
    { methode: 'PUT', pfad: '/api/erinnerungen/:id', zugang: 'angemeldet', handler: async (a) => {
      const mappeId = await dienst.fristen.erinnerungMappe(a.params.id);
      await darf(a, mappeId, 'R');
      await empfaengerSichtbar(a, b(a).empfaengerId);
      const e = await dienst.fristen.aendereErinnerung(a.params.id, a.body, ich(a));
      return ok({ ...e, ...await leseHinweis(e.empfaengerId, mappeId) });
    } },
    { methode: 'DELETE', pfad: '/api/erinnerungen/:id', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, await dienst.fristen.erinnerungMappe(a.params.id), 'R');
      await dienst.fristen.loescheErinnerung(a.params.id, ich(a));
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
  ];
}
