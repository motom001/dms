/**
 * Anmeldung (#1278, aus `anmeldung.routen.ts`): Zwei-Faktor (#242), Passkeys (#811) und Anmeldeschutz in der Werkbank.
 */
import { Fachfehler } from '../grundlagen/fehler';
import { pflichtRolle } from './zweifaktor';
import { PASSKEYS_HOECHSTENS } from './passkeys';
import { t } from '../sprache/sprache';
import { L, ok, leer, b, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../http/routen-typen';

/** Eigene Anmeldung ändern geht nicht, während jemand als diese Person agiert (#43, #811). */
function ohneVertretung(a: { sitzungsDaten?: { vertretungId?: string | null } }) {
  if (a.sitzungsDaten?.vertretungId) throw new Fachfehler(403, t('anmeldung.passkey.fehler.vertretung'));
}

/** Zwei-Faktor-Anmeldung (#242). */
export function zweifaktorRouten(k: RoutenKontext): Route[] {
  const { konten, x, zf } = k;
  return [
    /* ---------- Zwei-Faktor-Anmeldung (#242) ---------- */
    // Pflicht: nur, solange kein Passkey sie erfüllt (#811) – dann darf die Code-App auch wieder weg.
    {
      methode: 'GET',
      pfad: '/api/konto/zweifaktor',
      zugang: 'angemeldet',
      handler: async (a) => {
        const rolle = (await zf().pflicht())[pflichtRolle(ich(a))];
        const passkey = !!konten.passkeys && (await konten.passkeys.fuerPflicht(ich(a).id));
        return ok({ ...(await zf().status(ich(a).id)), pflicht: rolle && !passkey, passkeyErfuellt: rolle && passkey });
      },
    },
    {
      methode: 'POST',
      pfad: '/api/konto/zweifaktor/beginnen',
      zugang: 'angemeldet',
      handler: async (a) => ok(await zf().beginne(ich(a), (await x.designs?.marke())?.schriftzug || 'Ablago')),
    },
    {
      methode: 'POST',
      pfad: '/api/konto/zweifaktor/bestaetigen',
      zugang: 'angemeldet',
      handler: async (a) => {
        const codes = await zf().bestaetige(ich(a).id, b(a).code, ich(a).email);
        // #819: Zwei-Faktor geändert – Verwaltungsmodus und Tagesmerker gelten nicht mehr.
        await konten.zweifaktorGeaendert(ich(a).id);
        return ok({ codes });
      },
    },
    {
      methode: 'POST',
      pfad: '/api/konto/zweifaktor/codes',
      zugang: 'angemeldet',
      handler: async (a) => {
        await konten.pruefeEigenesPasswort(ich(a), b(a).passwort);
        return ok({ codes: await zf().neueCodes(ich(a).id, ich(a).email) });
      },
    },
    {
      methode: 'POST',
      pfad: '/api/konto/zweifaktor/entfernen',
      zugang: 'angemeldet',
      handler: async (a) => {
        if ((await zf().pflicht())[pflichtRolle(ich(a))] && !(konten.passkeys && (await konten.passkeys.fuerPflicht(ich(a).id))))
          throw new Fachfehler(409, t('meldungen.routen.fuer-dich-ist-die'));
        await konten.pruefeEigenesPasswort(ich(a), b(a).passwort);
        await zf().entferne(ich(a).id, ich(a).email);
        await konten.zweifaktorGeaendert(ich(a).id);
        return leer;
      },
    },
  ];
}

/** Anmelden mit Passkey (#811). */
export function passkeyAnmeldenRouten(k: RoutenKontext): Route[] {
  const { konten, nurAdminsInWartung } = k;
  return [
    /* ---------- Passkeys (#811) ---------- */
    // Anmelden: Optionen holen (ohne E-Mail-Adresse oder als zweiter Schritt), dann die Antwort des Geräts prüfen.
    {
      methode: 'POST',
      pfad: '/api/konto/passkey/optionen',
      zugang: 'offen',
      handler: async (a) => ok(await konten.passkeyOptionen(b(a), a.ip)),
    },
    {
      methode: 'POST',
      pfad: '/api/konto/passkey/anmelden',
      zugang: 'offen',
      handler: async (a) => {
        const zweiter = b(a).zweiterSchritt !== undefined && b(a).zweiterSchritt !== null;
        let r;
        try {
          r = await konten.anmeldenMitPasskey(b(a), a.ip, a.geraet);
        } catch (e) {
          L.konto.warn(zweiter ? 'Zweiter Faktor falsch (Passkey)' : 'Anmeldung mit Passkey fehlgeschlagen', {
            ip: a.ip,
            grund: (e as Error).message,
          });
          throw e;
        }
        await nurAdminsInWartung(r);
        L.konto.info(zweiter ? 'Angemeldet (Passwort und Passkey)' : 'Angemeldet mit Passkey', {
          email: r.benutzer.email,
          ip: a.ip,
          geraet: a.geraet,
          passkey: r.passkey,
        });
        return { body: { benutzer: r.benutzer }, sitzungSetzen: r.schluessel };
      },
    },
  ];
}

/** Eigene Passkeys (#811) und erneute Anmeldung mit Passkey. */
export function eigenePasskeysRouten(k: RoutenKontext): Route[] {
  const { konten, pk } = k;
  return [
    // Mein Konto → Sicherheit: eigene Passkeys. Nicht in einer Vertretung – dort ändert niemand die Anmeldung eines anderen.
    {
      methode: 'GET',
      pfad: '/api/konto/passkeys',
      zugang: 'angemeldet',
      handler: async (a) =>
        ok({
          liste: await pk().liste(ich(a).id),
          moeglich: !!pk().rp(),
          adresse: pk().rp()?.rpId ?? null,
          pflicht: await konten.passkeyNoetig(ich(a)),
          hoechstens: PASSKEYS_HOECHSTENS,
        }),
    },
    {
      methode: 'POST',
      pfad: '/api/konto/passkeys/beginnen',
      zugang: 'angemeldet',
      handler: async (a) => {
        ohneVertretung(a);
        return ok(await pk().beginneRegistrierung(ich(a)));
      },
    },
    {
      methode: 'POST',
      pfad: '/api/konto/passkeys',
      zugang: 'angemeldet',
      handler: async (a) => {
        ohneVertretung(a);
        return { status: 201, body: await pk().bestaetigeRegistrierung(ich(a), b(a).antwort, b(a).name) };
      },
    },
    {
      methode: 'PUT',
      pfad: '/api/konto/passkeys/:nr',
      zugang: 'angemeldet',
      handler: async (a) => {
        ohneVertretung(a);
        return ok(await pk().benenne(ich(a), a.params.nr, b(a).name));
      },
    },
    // Entfernen nur mit frischer Anmeldung (#819): Wer nur kurz an einem fremden, angemeldeten Gerät sitzt, entfernt nichts.
    {
      methode: 'DELETE',
      pfad: '/api/konto/passkeys/:nr',
      zugang: 'angemeldet',
      handler: async (a) => {
        ohneVertretung(a);
        if (!konten.istFrisch(a.sitzungsDaten))
          throw new Fachfehler(403, t('konten.verwaltung.fehler.frisch'), { frisch: true, handlung: 'passkey-entfernen' });
        // Vorgeschrieben (wie bei der Zwei-Faktor-Anmeldung): den letzten passenden nicht entfernen.
        const liste = await pk().liste(ich(a).id);
        const der = liste.find((p) => p.nr === a.params.nr);
        // Nur Passkeys für die gepflegte Adresse erfüllen eine Pflicht – nur deren letzten schützen.
        const rp = pk().pflichtRp();
        const zaehlt = (p: { rpId: string }) => !!rp && p.rpId === rp.rpId;
        const noetig = der && zaehlt(der) && liste.filter(zaehlt).length === 1 ? await konten.passkeyNoetig(ich(a)) : null;
        if (noetig)
          throw new Fachfehler(
            409,
            t(noetig === 'passkey' ? 'anmeldung.passkey.fehler.letzter' : 'anmeldung.passkey.fehler.letzter.zweifaktor'),
          );
        return ok(await pk().entferne(ich(a), a.params.nr, ich(a).email));
      },
    },
    // Erneute Anmeldung mit Passkey (Verwaltungsmodus, heikle Handlungen): Optionen nur mit den eigenen Passkeys.
    // `{ fuer: 'dokumentpasswoerter' }`: eigene Herausforderung für „Passwörter für Dokumente“ (#827).
    {
      methode: 'POST',
      pfad: '/api/konto/passkeys/bestaetigen/optionen',
      zugang: 'angemeldet',
      handler: async (a) => ok(await konten.passkeyBestaetigungOptionen(ich(a), a.sitzungsDaten, b(a).fuer)),
    },
  ];
}

/** Werkbank → Anmeldeschutz: Passkey und Zwei-Faktor je Rolle, zurücksetzen je Benutzer. */
export function anmeldeschutzRouten(k: RoutenKontext): Route[] {
  const { konten, zf, pk } = k;
  return [
    // Werkbank → Anmeldeschutz: Passkey je Rolle vorschreiben; Verwaltung: Passkeys einer Person zurücksetzen.
    // `moeglich` = gepflegte HTTPS-Adresse vorhanden – nur dann lässt sich die Pflicht einschalten (Durchsicht Sicherheit).
    {
      methode: 'GET',
      pfad: '/api/werkbank/passkeys',
      zugang: 'admin',
      handler: async () => ok({ ...(await pk().pflicht()), moeglich: !!pk().pflichtRp(), adresse: pk().pflichtRp()?.origin ?? null }),
    },
    {
      methode: 'PUT',
      pfad: '/api/werkbank/passkeys',
      zugang: 'admin',
      handler: async (a) =>
        ok({ ...(await pk().setzePflicht(a.body, ich(a).email)), moeglich: !!pk().pflichtRp(), adresse: pk().pflichtRp()?.origin ?? null }),
    },
    {
      methode: 'GET',
      pfad: '/api/benutzer/:id/passkeys',
      zugang: 'admin',
      handler: async (a) => ok({ anzahl: await pk().anzahl(a.params.id) }),
    },
    {
      methode: 'POST',
      pfad: '/api/benutzer/:id/passkeys/zuruecksetzen',
      zugang: 'admin',
      handler: async (a) => {
        await konten.pruefeKontoVon(ich(a), a.params.id);
        const ziel = (await konten.listeBenutzer()).find((x) => x.id === a.params.id);
        if (!ziel || !(await pk().entferneAlle(ziel.id, ziel.email, ich(a).email)))
          throw new Fachfehler(404, t('anmeldung.passkey.fehler.keine'));
        return leer;
      },
    },
    { methode: 'GET', pfad: '/api/werkbank/zweifaktor', zugang: 'admin', handler: async () => ok(await zf().pflicht()) },
    {
      methode: 'PUT',
      pfad: '/api/werkbank/zweifaktor',
      zugang: 'admin',
      handler: async (a) => ok(await zf().setzePflicht(a.body, ich(a).email)),
    },
    { methode: 'GET', pfad: '/api/benutzer/:id/zweifaktor', zugang: 'admin', handler: async (a) => ok(await zf().status(a.params.id)) },
    {
      methode: 'POST',
      pfad: '/api/benutzer/:id/zweifaktor/zuruecksetzen',
      zugang: 'admin',
      handler: async (a) => {
        await konten.pruefeKontoVon(ich(a), a.params.id);
        if (!(await zf().entferne(a.params.id, ich(a).email))) throw new Fachfehler(404, t('meldungen.routen.dieser-benutzer-hat-keine'));
        await konten.zweifaktorGeaendert(a.params.id);
        return leer;
      },
    },
  ];
}
