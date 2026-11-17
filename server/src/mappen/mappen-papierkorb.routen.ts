/**
 * Mappen (#1278, aus `mappen.routen.ts`): Papierkorb (#43) in der Ablage und in der Werkbank.
 */
import { t } from '../sprache/sprache';
import { ok, b, quelle, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../http/routen-typen';

/** Papierkorb (#43, #344, #424) in der Ablage: nur, was ich gelöscht habe. */
export function papierkorbRouten(k: RoutenKontext): Route[] {
  const { dienst, zg } = k;
  return [
    /* ---------- Papierkorb (#43): in der Ablage nur, was ich gelöscht habe ---------- */
    {
      methode: 'GET',
      pfad: '/api/papierkorb',
      zugang: 'angemeldet',
      handler: async (a) => ok(await dienst.papierkorbVerwaltung.papierkorb(ich(a))),
    },
    // Einzelne Dokumente (#344): eigene Liste, damit die Antwort von /api/papierkorb gleich bleibt.
    {
      methode: 'GET',
      pfad: '/api/papierkorb/dokumente',
      zugang: 'angemeldet',
      handler: async (a) => ok(await dienst.papierkorbVerwaltung.papierkorbDokumente(ich(a))),
    },
    {
      methode: 'POST',
      pfad: '/api/papierkorb/dokumente/:id/wiederherstellen',
      zugang: 'angemeldet',
      handler: async (a) =>
        ok(await dienst.papierkorbVerwaltung.stelleDokumentWiederHer(a.params.id, ich(a), await zg(a), false, quelle(a))),
    },
    {
      methode: 'DELETE',
      pfad: '/api/papierkorb/dokumente/:id',
      zugang: 'angemeldet',
      handler: async (a) =>
        ok({ geloescht: await dienst.papierkorbVerwaltung.loescheDokumentEndgueltig([a.params.id], ich(a), false, quelle(a)) }),
    },
    {
      methode: 'DELETE',
      pfad: '/api/papierkorb',
      zugang: 'angemeldet',
      handler: async (a) => ok({ geloescht: await dienst.papierkorbVerwaltung.leerePapierkorb(ich(a), false, { quelle: quelle(a) }) }),
    },
    {
      methode: 'GET',
      pfad: '/api/papierkorb/:id',
      zugang: 'angemeldet',
      handler: async (a) => ok(await dienst.papierkorbVerwaltung.papierkorbEintrag(a.params.id, ich(a))),
    },
    {
      methode: 'POST',
      pfad: '/api/papierkorb/:id/wiederherstellen',
      zugang: 'angemeldet',
      handler: async (a) => {
        const r = await dienst.papierkorbVerwaltung.stelleWiederHer(a.params.id, ich(a), false, quelle(a));
        // Eigener Papierkorb (#126): immer wiederherstellbar; danach gelten wieder die Regeln.
        const sichtbar = (await dienst.rechtepruefung.lesbare(await zg(a), [a.params.id])).has(a.params.id);
        return ok(sichtbar ? r : { ...r, hinweis: t('meldungen.routen.wiederhergestellt-diese-mappe-kannst') });
      },
    },
    {
      methode: 'DELETE',
      pfad: '/api/papierkorb/:id',
      zugang: 'angemeldet',
      handler: async (a) => ok({ geloescht: await dienst.papierkorbVerwaltung.loescheEndgueltig([a.params.id], ich(a), false, quelle(a)) }),
    },
    // Ein Vorgang (#424): alle Mappen, die zusammen gelöscht wurden.
    {
      methode: 'POST',
      pfad: '/api/papierkorb/vorgang/:id/wiederherstellen',
      zugang: 'angemeldet',
      handler: async (a) => ok(await dienst.mitVerknuepften.stelleVorgangWiederHer(a.params.id, ich(a), false, quelle(a))),
    },
  ];
}

/** Papierkorb in der Werkbank: alles. */
export function werkbankPapierkorbRouten(k: RoutenKontext): Route[] {
  const { dienst } = k;
  return [
    /* … und in der Werkbank alles */
    {
      methode: 'GET',
      pfad: '/api/werkbank/papierkorb',
      zugang: 'admin',
      handler: async (a) =>
        ok({
          tage: await dienst.kern.papierkorbTage(),
          historieTage: await dienst.mappenHistorie.historieTage(),
          eintraege: await dienst.papierkorbVerwaltung.papierkorb(ich(a), true),
          dokumente: await dienst.papierkorbVerwaltung.papierkorbDokumente(ich(a), true),
        }),
    },
    {
      methode: 'POST',
      pfad: '/api/werkbank/papierkorb/dokumente/:id/wiederherstellen',
      zugang: 'admin',
      handler: async (a) => ok(await dienst.papierkorbVerwaltung.stelleDokumentWiederHer(a.params.id, ich(a), undefined, true, quelle(a))),
    },
    {
      methode: 'DELETE',
      pfad: '/api/werkbank/papierkorb/dokumente/:id',
      zugang: 'admin',
      handler: async (a) =>
        ok({ geloescht: await dienst.papierkorbVerwaltung.loescheDokumentEndgueltig([a.params.id], ich(a), true, quelle(a)) }),
    },
    {
      methode: 'PUT',
      pfad: '/api/werkbank/papierkorb/einstellungen',
      zugang: 'admin',
      handler: async (a) => {
        const historieTage =
          b(a).historieTage === undefined
            ? await dienst.mappenHistorie.historieTage()
            : await dienst.mappenHistorie.setzeHistorieTage(b(a).historieTage);
        const r =
          b(a).tage === undefined
            ? { tage: await dienst.kern.papierkorbTage(), geleert: 0 }
            : await dienst.papierkorbVerwaltung.setzePapierkorbTage(b(a).tage, ich(a).id);
        return ok({ ...r, historieTage });
      },
    },
    {
      methode: 'DELETE',
      pfad: '/api/werkbank/papierkorb',
      zugang: 'admin',
      handler: async (a) => ok({ geloescht: await dienst.papierkorbVerwaltung.leerePapierkorb(ich(a), true, { quelle: quelle(a) }) }),
    },
    {
      methode: 'GET',
      pfad: '/api/werkbank/papierkorb/:id',
      zugang: 'admin',
      handler: async (a) => ok(await dienst.papierkorbVerwaltung.papierkorbEintrag(a.params.id, ich(a), true)),
    },
    {
      methode: 'POST',
      pfad: '/api/werkbank/papierkorb/:id/wiederherstellen',
      zugang: 'admin',
      handler: async (a) => ok(await dienst.papierkorbVerwaltung.stelleWiederHer(a.params.id, ich(a), true, quelle(a))),
    },
    {
      methode: 'POST',
      pfad: '/api/werkbank/papierkorb/vorgang/:id/wiederherstellen',
      zugang: 'admin',
      handler: async (a) => ok(await dienst.mitVerknuepften.stelleVorgangWiederHer(a.params.id, ich(a), true, quelle(a))),
    },
    {
      methode: 'DELETE',
      pfad: '/api/werkbank/papierkorb/:id',
      zugang: 'admin',
      handler: async (a) => ok({ geloescht: await dienst.papierkorbVerwaltung.loescheEndgueltig([a.params.id], ich(a), true, quelle(a)) }),
    },
  ];
}
