/**
 * Aufgaben (#960: aus routen.ts): Aufgaben, Fristen und Termine, Erinnerungen, persönliche Zeiten der täglichen Zusammenfassung.
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
    // Aufgabe vergeben (#54) – seit #1044 die Automatisierungsvorlage „Aufgabe vergeben“ (sofort, in dieser Anfrage).
    { methode: 'POST', pfad: '/api/mappen/:id/aufgaben', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, a.params.id, 'R');
      await empfaengerSichtbar(a, b(a).empfaengerId);
      const auf = (await dienst.ablaeufe.anwenden(a.params.id, 'aufgabe_vergeben', b(a), ich(a).id, await zg(a))).aufgaben[0];
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
      x.region ? (await x.region.lies()).bundesland : null)) },
    // Startseite (#725): Kachel „Nächster Termin“.
    { methode: 'GET', pfad: '/api/termine/naechster', zugang: 'angemeldet', handler: async (a) => ok(await dienst.fristen.naechsterTermin(await zg(a))) },
    // Alte Adresse (#725): „Anstehend“ gibt es nicht mehr.
    { methode: 'GET', pfad: '/api/anstehend', zugang: 'angemeldet', handler: async () => { throw new Fachfehler(410, t('meldungen.routen.anstehend-gibt-es-nicht')); } },
    // Erinnern (#131) – seit #1044 die Automatisierungsvorlage „Erinnern“; die alten Adressen bleiben (API v1).
    { methode: 'POST', pfad: '/api/mappen/:id/erinnerungen', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, a.params.id, 'R');
      await empfaengerSichtbar(a, b(a).empfaengerId);
      const e = (await dienst.ablaeufe.anwenden(a.params.id, 'erinnern', b(a), ich(a).id, await zg(a))).ablauf!;
      return ok({ ...e, ...await leseHinweis(e.empfaengerId, a.params.id) }, 201);
    } },
    ...(['/api/erinnerungen/:id', '/api/ablaeufe/:id'] as const).flatMap((pfad): Route[] => [
      { methode: 'PUT', pfad, zugang: 'angemeldet', handler: async (a) => {
        const mappeId = await dienst.ablaeufe.ablaufMappe(a.params.id);
        await darf(a, mappeId, 'R');
        await empfaengerSichtbar(a, b(a).empfaengerId);
        const e = await dienst.ablaeufe.aendere(a.params.id, b(a), ich(a));
        return ok({ ...e, ...await leseHinweis(e.empfaengerId, mappeId) });
      } },
      { methode: 'DELETE', pfad, zugang: 'angemeldet', handler: async (a) => {
        await darf(a, await dienst.ablaeufe.ablaufMappe(a.params.id), 'R');
        await dienst.ablaeufe.loesche(a.params.id, ich(a));
        return leer;
      } },
    ]),
    // Mappen-Abläufe (#1044): Vorlagen dieser Mappe und was geplant ist; anwenden mit den Antworten auf die Fragen.
    { methode: 'GET', pfad: '/api/mappen/:id/ablaeufe', zugang: 'angemeldet', handler: async (a) => {
      const m = await darf(a, a.params.id, 'R');
      return ok({ geplant: await dienst.ablaeufe.anMappe(m.id), vorlagen: await dienst.ablaeufe.zumAnwenden(m.typId) });
    } },
    { methode: 'POST', pfad: '/api/mappen/:id/ablaeufe', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, a.params.id, 'R');
      await empfaengerSichtbar(a, b(a).empfaengerId);
      const r = await dienst.ablaeufe.anwenden(a.params.id, b(a).vorlage, b(a), ich(a).id, await zg(a));
      const an = r.aufgaben[0]?.empfaengerId ?? r.ablauf?.empfaengerId ?? null;
      return ok({ ...r, ...(an ? await leseHinweis(an, a.params.id) : {}) }, 201);
    } },
    // Angehaltene Abläufe fortsetzen (Werkbank): prüft die Rechte der Person erneut.
    { methode: 'POST', pfad: '/api/werkbank/ablaeufe/:id/fortsetzen', zugang: 'admin', handler: async (a) => ok(await dienst.ablaeufe.fortsetzen(a.params.id, ich(a).id)) },
    // Werkbank → Automatisierungsvorlagen (#1044).
    { methode: 'GET', pfad: '/api/werkbank/ablaufvorlagen', zugang: 'admin', handler: async () => ok({ vorlagen: await dienst.ablaeufe.uebersicht(), ...await dienst.ablaeufe.warnungen() }) },
    { methode: 'POST', pfad: '/api/werkbank/ablaufvorlagen', zugang: 'admin', handler: async (a) => ok(await dienst.ablaeufe.legeVorlage(a.body, ich(a).id), 201) },
    { methode: 'GET', pfad: '/api/werkbank/ablaufvorlagen/:kennung', zugang: 'admin', handler: async (a) => ok(await dienst.ablaeufe.ansicht(a.params.kennung)) },
    { methode: 'PUT', pfad: '/api/werkbank/ablaufvorlagen/:kennung', zugang: 'admin', handler: async (a) => ok(await dienst.ablaeufe.aendereVorlage(a.params.kennung, a.body, ich(a).id)) },
    { methode: 'DELETE', pfad: '/api/werkbank/ablaufvorlagen/:kennung', zugang: 'admin', handler: async (a) => { await dienst.ablaeufe.loescheVorlage(a.params.kennung); return leer; } },
    { methode: 'PUT', pfad: '/api/werkbank/ablaufvorlagen/:kennung/aktiv', zugang: 'admin', handler: async (a) => ok(await dienst.ablaeufe.schalteVorlage(a.params.kennung, b(a).aktiv === true, ich(a).id)) },
    { methode: 'POST', pfad: '/api/werkbank/ablaufvorlagen/:kennung/kopieren', zugang: 'admin', handler: async (a) => ok(await dienst.ablaeufe.kopiere(a.params.kennung, ich(a).id), 201) },
    { methode: 'POST', pfad: '/api/werkbank/ablaufvorlagen/:kennung/zuruecksetzen', zugang: 'admin', handler: async (a) => ok(await dienst.ablaeufe.zuruecksetzen(a.params.kennung)) },
    { methode: 'GET', pfad: '/api/werkbank/ablaufvorlagen/:kennung/verlauf', zugang: 'admin', handler: async (a) => ok(await dienst.ablaeufe.verlauf(a.params.kennung, Number((a.query as { anzahl?: unknown }).anzahl) || 50)) },
    { methode: 'GET', pfad: '/api/werkbank/ablaufvorlagen/:kennung/benutzt', zugang: 'admin', handler: async (a) => ok(await dienst.ablaeufe.benutzt(a.params.kennung, await zg(a))) },
    { methode: 'POST', pfad: '/api/werkbank/ablaufvorlagen/:kennung/ausprobieren', zugang: 'admin', handler: async (a) => ok({ zeilen: await dienst.ablaeufe.ausprobieren(a.params.kennung, b(a).mappeId, b(a), ich(a), await zg(a)) }) },
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
