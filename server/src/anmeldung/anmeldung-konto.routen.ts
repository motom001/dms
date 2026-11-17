/**
 * Anmeldung (#1278, aus `anmeldung.routen.ts`): Gesundheit, Wartung und Sprache ohne Anmeldung sowie
 * Verwaltungsmodus.
 */
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import { standKennung } from '../system/system';
import { SPRACHE_HOECHSTENS_MS } from '../sprache/sprachwahl';
import { liesSpracheinstellung } from '../../../shared/src/sprachwahl';
import { L, ok, leer, b, info, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../http/routen-typen';

/** Gesundheit (#1198), Wartung (#102) und Sprache (#729, #731) ohne Anmeldung. */
export function anmeldungOffenRouten(k: RoutenKontext): Route[] {
  const { x, spracheFuer } = k;
  return [
    // Mit Datenbank (#1198): Ist keine Verbindung frei oder antwortet sie nicht, 503 mit „datenbank“ – Docker, Überwachung
    // und die Leiste der Oberfläche merken den Ausfall. Ohne Sitzung: Sie bräuchte selbst die Datenbank.
    // #1199: dazu `datenbank` (antwortet-nicht | abgewiesen) und seit wann – für „Ablago antwortet gerade nicht“. Ohne
    // Fehlertext, Adresse oder Version: Die Antwort sieht jeder, der die Adresse kennt.
    {
      methode: 'GET',
      pfad: '/api/gesundheit',
      zugang: 'offen',
      ohneSitzung: true,
      handler: async () => {
        const b = x.datenbank ? await x.datenbank.befund() : null;
        if (b && b.datenbank !== 'ok')
          return { status: 503, body: { ok: false, zustand: 'datenbank', ...b, stand: standKennung() }, koepfe: { 'retry-after': '10' } };
        return ok({ ok: true, zustand: 'laeuft', stand: standKennung() });
      },
    },
    // Wartungsmodus (#102): für Banner und Anmeldeseite, auch ohne Anmeldung.
    {
      methode: 'GET',
      pfad: '/api/wartung',
      zugang: 'offen',
      handler: async () => ok(x.wartung?.oeffentlich() ?? { stufe: 'aus', text: '', ende: null, aktivAb: null, sekunden: null }),
    },

    // Sprache vor dem ersten Bild (#729): Die Oberfläche lädt damit ihre Texte, bevor sie etwas zeigt.
    // #1198: Antwortet die Datenbank nicht, nach kurzer Zeit ohne Anmeldung und mit der zuletzt gelesenen Einstellung.
    {
      methode: 'GET',
      pfad: '/api/sprache',
      zugang: 'offen',
      anmeldungHoechstensMs: SPRACHE_HOECHSTENS_MS,
      handler: async (a) => ok(await spracheFuer(a)),
    },
    // Texte eines Sprachpakets (#731) für die Oberfläche – nur erlaubte Sprachen; Texte sind nichts Geheimes (auch die
    // Anmeldeseite braucht sie). Die Oberfläche setzt sie nie als HTML.
    {
      methode: 'GET',
      pfad: '/api/sprache/texte/:kennung',
      zugang: 'offen',
      handler: async (a) => {
        const e = x.sprachen ? await x.sprachen.lies() : liesSpracheinstellung(null);
        const texte = e.erlaubt.includes(a.params.kennung) ? x.sprachen?.pakete?.texte(a.params.kennung) : null;
        if (!texte) throw new Fachfehler(404, t('meldungen.sprachpakete.keine-texte'));
        return ok(texte);
      },
    },
  ];
}

/** Verwaltungsmodus (#819), Laufwerk (#720), Hinweise und Vertretung beenden. */
export function verwaltungsmodusRouten(k: RoutenKontext): Route[] {
  const { konten, x } = k;
  return [
    /* ---------- Verwaltungsmodus (#819) ---------- */
    // Beginnen: ohne Angaben, wenn die Anmeldung frisch oder heute schon bestätigt ist; sonst mit Passwort und Code.
    {
      methode: 'POST',
      pfad: '/api/konto/verwaltung',
      zugang: 'angemeldet',
      handler: async (a) => ok(await konten.beginneVerwaltung(ich(a), a.sitzung, a.sitzungsDaten, b(a), a.ip)),
    },
    {
      methode: 'POST',
      pfad: '/api/konto/verwaltung/beenden',
      zugang: 'angemeldet',
      handler: async (a) => {
        await konten.beendeVerwaltung(ich(a), a.sitzung, a.sitzungsDaten);
        return ok(await konten.verwaltungsstand(ich(a), { ...a.sitzungsDaten!, verwaltungSeit: null, verwaltungAktiv: null }));
      },
    },
    // Frische Anmeldung für eine heikle Handlung (immer mit Passwort, gilt 10 Minuten).
    {
      methode: 'POST',
      pfad: '/api/konto/verwaltung/bestaetigen',
      zugang: 'angemeldet',
      handler: async (a) => {
        await konten.bestaetigeFrisch(ich(a), a.sitzung, a.sitzungsDaten, b(a), a.ip);
        return ok({ frisch: true });
      },
    },
    // Laufwerk für Benutzer (#720): Adresse und Benutzername; ausgeschaltet gibt es nichts.
    {
      methode: 'GET',
      pfad: '/api/konto/laufwerk',
      zugang: 'angemeldet',
      handler: async (a) => {
        if (!x.webdav || !(await x.webdav.einstellung()).aktiv) throw new Fachfehler(404, t('meldungen.routen.das-laufwerk-ist-nicht'));
        const s = await x.webdav.stand();
        return ok({ adresse: s.adresse, https: s.https, benutzername: ich(a).email });
      },
    },
    {
      methode: 'POST',
      pfad: '/api/konto/hinweise/gesehen',
      zugang: 'angemeldet',
      handler: async (a) => {
        if (!a.sitzungsDaten?.vertretungId) await konten.hinweiseGesehen(ich(a).id);
        return leer;
      },
    },
    {
      methode: 'POST',
      pfad: '/api/konto/vertretung-beenden',
      zugang: 'angemeldet',
      handler: async (a) => {
        const r = await konten.vertretungBeenden(a.sitzung, info(a));
        L.konto.warn('Vertretung beendet, zurück im eigenen Konto', { als: a.benutzer?.email, admin: r.benutzer?.email });
        return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
      },
    },
  ];
}
