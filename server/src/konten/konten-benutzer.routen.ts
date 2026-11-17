/**
 * Konten (#1278, aus `konten.routen.ts`): Benutzer – Personen, Systemkonten (#673), anlegen, ändern,
 * Verwaltungsrecht (#818), löschen und Link senden.
 */
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import { L, ok, leer, b, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../http/routen-typen';

/** Personen, Systemkonten (#673) und Benutzer. */
export function benutzerListeRouten(k: RoutenKontext): Route[] {
  const { dienst, konten, zg } = k;
  return [
    /* ---------- Benutzer ---------- */
    // #137: nur Benutzer, deren Benutzer-Mappe man lesen darf (Administratoren: alle).
    {
      methode: 'GET',
      pfad: '/api/personen',
      zugang: 'angemeldet',
      handler: async (a) => {
        const alle = await konten.personen();
        const sichtbar = await dienst.rechtepruefung.lesbare(
          await zg(a),
          alle.map((p) => p.id),
        );
        // Dienstkonten der Pakete haben keine Benutzer-Mappe; ihr Name („Paket …“) ist für alle sichtbar (#338).
        // Ebenso Systemkonten wie „Automatisierung“ (#673).
        return ok(alle.filter((p) => sichtbar.has(p.id) || ('art' in p && (p.art === 'dienst' || p.art === 'system'))));
      },
    },
    // Systemkonten und Dienstkonten der Pakete (#673): sichtbar, aber nicht bearbeitbar.
    {
      methode: 'GET',
      pfad: '/api/benutzer/systemkonten',
      zugang: 'admin',
      handler: async () =>
        ok(await dienst.postSystemmappen.systemkontenUebersicht(await konten.listeSystemkonten(), await konten.listeDienstkonten())),
    },
    {
      methode: 'GET',
      pfad: '/api/benutzer',
      zugang: 'admin',
      handler: async () => {
        const rollen = await dienst.systemtypen.weitereRollen();
        // Offene Aufgaben je Benutzer (#77): Deaktivieren geht erst ohne.
        const offen = new Map<string, number>();
        for (const x of await dienst.ohneLeserecht.alleAufgaben())
          if (x.empfaengerId) offen.set(x.empfaengerId, (offen.get(x.empfaengerId) ?? 0) + 1);
        return ok(
          (await konten.listeBenutzer()).map((x) => ({ ...x, rollen: rollen.get(x.id) ?? [], offeneAufgaben: offen.get(x.id) ?? 0 })),
        );
      },
    },
  ];
}

/** Benutzer anlegen, ändern, Verwaltungsrecht (#818), Rollen, löschen und Link senden. */
export function benutzerVerwaltenRouten(k: RoutenKontext): Route[] {
  const { dienst, konten, mitRollen } = k;
  return [
    {
      methode: 'POST',
      pfad: '/api/benutzer',
      zugang: 'admin',
      handler: async (a) => {
        if (b(a).rollen !== undefined) await dienst.postSystemmappen.pruefeRollen(b(a).rollen);
        // Verwaltungsrecht beim Anlegen nur über den Befehl dms (`--admin`); in der Oberfläche danach mit frischer Anmeldung (#818).
        const r = await konten.legeBenutzerAn(
          { email: b(a).email, name: b(a).name, verwaltung: a.konsole ? b(a).verwaltung : undefined },
          ich(a).id,
        );
        if (b(a).rollen !== undefined) await dienst.postSystemmappen.setzeRollen(r.benutzer.id, b(a).rollen, ich(a).id);
        L.konto.info('Benutzer angelegt', {
          email: r.benutzer.email,
          verwaltung: r.benutzer.verwaltung?.join(', ') || '–',
          mail: r.mailVerschickt,
        });
        if (r.mailFehler) L.mail.warn('Einladung nicht verschickt', { an: r.benutzer.email, fehler: r.mailFehler });
        return ok({ ...r, benutzer: await mitRollen(r.benutzer) }, 201);
      },
    },
    {
      methode: 'PUT',
      pfad: '/api/benutzer/:id',
      zugang: 'admin',
      handler: async (a) => {
        // Weitere Rollen zuerst prüfen, damit eine ungültige Auswahl nichts halb ändert.
        if (b(a).rollen !== undefined) {
          if (!(await konten.listeBenutzer()).some((x) => x.id === a.params.id))
            throw new Fachfehler(404, t('meldungen.routen.diesen-benutzer-gibt-es'));
          await dienst.postSystemmappen.pruefeRollen(b(a).rollen);
        }
        const r = await konten.aendereBenutzer(ich(a), a.params.id, b(a));
        if (b(a).rollen !== undefined) await dienst.postSystemmappen.setzeRollen(r.id, b(a).rollen, ich(a).id);
        L.konto.info('Benutzer geändert', { email: r.email, aenderung: b(a) });
        return ok(await mitRollen(r));
      },
    },
    // Verwaltungsrecht (#818): nur „Gesamte Verwaltung“, mit frischer Anmeldung (heikle Handlung „rechte“).
    {
      methode: 'PUT',
      pfad: '/api/benutzer/:id/verwaltung',
      zugang: 'admin',
      handler: async (a) => {
        const r = await konten.setzeVerwaltung(ich(a), a.params.id, b(a).verwaltung, (m) => L.mail.warn(m));
        return ok(await mitRollen(r));
      },
    },
    { methode: 'GET', pfad: '/api/rollen', zugang: 'admin', handler: async () => ok(await dienst.postSystemmappen.listeRollen()) },
    {
      methode: 'DELETE',
      pfad: '/api/benutzer/:id',
      zugang: 'admin',
      handler: async (a) => {
        await konten.loescheBenutzer(ich(a), a.params.id);
        // Gemerkte Passwörter für Dokumente (#827) gehören nur dieser Person: mit weg.
        await dienst.geschuetztePdfs.pdfEntsperren?.vergiss(a.params.id).catch(() => {});
        L.konto.info('Benutzer gelöscht', { id: a.params.id });
        return leer;
      },
    },
    {
      methode: 'POST',
      pfad: '/api/benutzer/:id/link',
      zugang: 'admin',
      handler: async (a) => {
        await konten.pruefeKontoVon(ich(a), a.params.id);
        const r = await konten.neuerLink(a.params.id);
        L.konto.info('Passwort-Link erzeugt', { email: r.benutzer.email, mail: r.mailVerschickt });
        return ok(r);
      },
    },
  ];
}
