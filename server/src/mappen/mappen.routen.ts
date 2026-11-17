/**
 * Mappen (#960: aus routen.ts): E-Mail, Post und Fotos, Zuordnen und Abgleich, Vorschläge und Erkennung, Notizen,
 * Historie, Anlegen und Ändern, Export einer Sicht, Auswahl, Löschen und Papierkorb.
 */
import { liesAnlass } from '../../../shared/src/loeschprotokoll';
import { liesQuelle } from '../sprache/uebersetzung';
import { L, ok, leer, b, quelle, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../http/routen-typen';
import { mappenPostRouten, zuordnenRouten } from './mappen-post.routen';
import { erkennungRouten } from './mappen-erkennung.routen';
import { papierkorbRouten, werkbankPapierkorbRouten } from './mappen-papierkorb.routen';

export function mappenRouten(k: RoutenKontext): Route[] {
  return [
    ...erwaehnungenRouten(k),
    ...mappenPostRouten(k),
    ...zuordnenRouten(k),
    ...erkennungRouten(k),
    ...notizenRouten(k),
    ...mappeBearbeitenRouten(k),
    ...mehrereMappenRouten(k),
    ...loeschenRouten(k),
    ...papierkorbRouten(k),
    ...werkbankPapierkorbRouten(k),
  ];
}

/** Sichtbarkeit verwiesener Mappen (#888), Erwähnen mit @ (#889) und E-Mail aus der Mappe. */
function erwaehnungenRouten(k: RoutenKontext): Route[] {
  const { dienst, x, modusSpur, zg, zuletztGeoeffnet } = k;
  return [
    // Sichtbarkeit verwiesener Mappen (#888): Erwähnungen und Namen unterscheiden „nicht sichtbar“ von „gelöscht“.
    // Nur für Ids, die die Oberfläche schon kennt; keine Titel, kein Typ (wie „nicht sichtbare Mappe“, #124).
    {
      methode: 'POST',
      pfad: '/api/mappen/sichtbarkeit',
      zugang: 'angemeldet',
      lesend: true,
      handler: async (a) => ok(await dienst.rechtepruefung.sichtbarkeit(await zg(a), b(a).ids)),
    },
    // Erwähnen mit @ (#889): Vorschläge (nur lesbare Mappen), aktuelle Titel erwähnter Mappen, wo eine Mappe erwähnt ist.
    {
      methode: 'GET',
      pfad: '/api/mappen/erwaehnen',
      zugang: 'angemeldet',
      handler: async (a) => ok(await dienst.erwaehnungen.vorschlaege(await zg(a), a.query.suche, await zuletztGeoeffnet(a, 20))),
    },
    {
      methode: 'POST',
      pfad: '/api/mappen/verweise',
      zugang: 'angemeldet',
      lesend: true,
      handler: async (a) => ok(await dienst.erwaehnungen.verweise(await zg(a), b(a).ids)),
    },
    {
      methode: 'GET',
      pfad: '/api/mappen/:id/erwaehnungen',
      zugang: 'angemeldet',
      handler: async (a) => ok(await dienst.erwaehnungen.uebersicht(await zg(a), a.params.id)),
    },
    // Notizen (#55)
    // E-Mail aus der Mappe (#58)
    { methode: 'GET', pfad: '/api/email/bereit', zugang: 'angemeldet', handler: async () => ok({ bereit: !!x.betrieb?.mailer() }) },
    {
      methode: 'POST',
      pfad: '/api/mappen/:id/email',
      zugang: 'angemeldet',
      handler: async (a) => {
        const i = ich(a);
        // Versenden gibt Daten hinaus wie ein Export (#330): Lesen und Exportrecht, gemeinsame Prüfstelle (#723).
        const r = await dienst.ausgangEmail.versendeMappe(
          a.params.id,
          b(a),
          { id: i.id, name: i.name, email: i.email },
          x.betrieb?.mailer() ?? null,
          await zg(a),
        );
        await modusSpur(a, [a.params.id], 'versendet');
        return ok(r, 201);
      },
    },
  ];
}

/** Übersetzung, Notizen (#55, #124), verweisende Mappen und Änderungshistorie (#57). */
function notizenRouten(k: RoutenKontext): Route[] {
  const { dienst, spracheFuer, zg, darf } = k;
  return [
    // Notizen brauchen nur Lesen (#124).
    // Übersetzung anzeigen (#732): nur Kennungen – den Text liest der Kern mit den Rechten der Person; je Aufruf ein Abschnitt.
    // Gespeichert wird nichts an der Mappe; die Übersetzung liegt nur im Zwischenspeicher.
    {
      methode: 'POST',
      pfad: '/api/uebersetzung',
      zugang: 'angemeldet',
      lesend: true,
      handler: async (a) =>
        ok(
          await dienst.uebersetzung.uebersetze(liesQuelle(b(a).quelle), {
            teil: b(a).teil,
            nach: (await spracheFuer(a)).sprache,
            ich: ich(a),
            z: await zg(a),
          }),
        ),
    },
    {
      methode: 'GET',
      pfad: '/api/mappen/:id/notizen',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, a.params.id, 'R');
        return ok(await dienst.mappen.notizen(a.params.id));
      },
    },
    {
      methode: 'POST',
      pfad: '/api/mappen/:id/notizen',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, a.params.id, 'R');
        return ok(await dienst.mappenNotizen.legeNotizAn(a.params.id, b(a).text, ich(a).id), 201);
      },
    },
    {
      methode: 'PUT',
      pfad: '/api/notizen/:id',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('notiz', a.params.id), 'R');
        return ok(await dienst.mappenNotizen.aendereNotiz(a.params.id, b(a).text, ich(a).id));
      },
    },
    {
      methode: 'DELETE',
      pfad: '/api/notizen/:id',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, await dienst.rechtepruefung.mappeVon('notiz', a.params.id), 'R');
        await dienst.mappenNotizen.loescheNotiz(a.params.id, ich(a).id);
        return leer;
      },
    },
    // Änderungshistorie (#57)
    {
      methode: 'GET',
      pfad: '/api/mappen/:id/verweisende',
      zugang: 'angemeldet',
      handler: async (a) =>
        ok(await dienst.mappen.verweisende(a.params.id, String(a.query.typ ?? ''), String(a.query.feld ?? ''), await zg(a))),
    },
    {
      methode: 'GET',
      pfad: '/api/mappen/:id/historie',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, a.params.id, 'R');
        // #800: ?register=… zeigt, was dieses Register „Historie“ zeigt; ?max=…&vor=… seitenweise. Ohne Angaben alles.
        return ok(await dienst.mappenHistorie.historie(a.params.id, { register: a.query.register, max: a.query.max, vor: a.query.vor }));
      },
    },
  ];
}

/** Passwortfelder (#46), Hinweise von Paketen (#1034), Rechte-Vorschau (#126), Mappe anlegen und ändern. */
function mappeBearbeitenRouten(k: RoutenKontext): Route[] {
  const { dienst, typName, modusSpur, zg, darf } = k;
  return [
    // Passwortfeld anzeigen (#46): einzeln, mit Protokolleintrag (ohne den Wert).
    {
      methode: 'POST',
      pfad: '/api/mappen/:id/passwoerter/:feld',
      zugang: 'angemeldet',
      handler: async (a) => {
        await darf(a, a.params.id, 'P');
        return ok(await dienst.passwortfelder.zeigePasswort(a.params.id, a.params.feld, ich(a).id));
      },
    },
    // Hinweise von Paketen (#1034): nur Dienstkonten mit dms:hinweise; das Paket ergibt sich aus dem Konto.
    {
      methode: 'PUT',
      pfad: '/api/mappen/:id/hinweise/:schluessel',
      zugang: 'angemeldet',
      handler: async (a) => ok(await dienst.mappenHinweise.setze(await zg(a), a.params.id, a.params.schluessel, b(a))),
    },
    {
      methode: 'DELETE',
      pfad: '/api/mappen/:id/hinweise/:schluessel',
      zugang: 'angemeldet',
      handler: async (a) => {
        await dienst.mappenHinweise.entferne(await zg(a), a.params.id, a.params.schluessel);
        return leer;
      },
    },
    // Vor dem Speichern (#126): Rechte mit den neuen Werten – für die Warnung beim Selbst-Entziehen.
    {
      methode: 'POST',
      pfad: '/api/mappen/:id/rechte-vorschau',
      zugang: 'angemeldet',
      lesend: true,
      handler: async (a) => ok(await dienst.mappenEingaben.rechteVorschau(a.params.id, a.body, await zg(a))),
    },
    {
      methode: 'POST',
      pfad: '/api/mappen',
      zugang: 'angemeldet',
      handler: async (a) => {
        const m = await dienst.mappen.legeMappeAn(a.body, ich(a).id, false, await zg(a));
        L.ablage.info('Mappe angelegt', { typ: await typName(m.typId), titel: m.titel, id: m.id });
        return ok(m, 201);
      },
    },
    {
      methode: 'PUT',
      pfad: '/api/mappen/:id',
      zugang: 'angemeldet',
      handler: async (a) => {
        const m = await dienst.mappen.aendereMappe(a.params.id, a.body, ich(a).id, await zg(a));
        await modusSpur(a, [m.id], 'geaendert');
        L.ablage.info('Mappe geändert', { typ: await typName(m.typId), titel: m.titel, id: m.id });
        return ok(m);
      },
    },
  ];
}

/** Export (#152, #153), Auswahl (#149) und mehrere Mappen per E-Mail (#151). */
function mehrereMappenRouten(k: RoutenKontext): Route[] {
  const { dienst, x, modusSpur, zg } = k;
  return [
    // Export (#152, #153): Tabelle, ZIP mit Dokumenten oder PDF – Recht E an der Sicht, Lesen je Mappe.
    {
      methode: 'POST',
      pfad: '/api/export',
      zugang: 'angemeldet',
      handler: async (a) => {
        const r = await dienst.ausgangExport.exportiere(
          ich(a),
          b(a),
          await zg(a),
          (ids) => modusSpur(a, ids, 'exportiert'),
          a.apiSchluessel ? 'api' : 'oberflaeche',
        );
        L.ablage.info('Mappen exportiert', {
          von: ich(a).email,
          sicht: b(a).sicht,
          format: b(a).format,
          mappen: r.mappen,
          ausgelassen: r.ausgelassen,
          auswahl: Array.isArray(b(a).ids),
        });
        return {
          datei: {
            inhalt: r.inhalt,
            name: r.name,
            mime: r.mime,
            anzeigen: false,
            groesse: r.groesse,
            koepfe: { 'x-dms-ausgelassen': String(r.ausgelassen) },
          },
        };
      },
    },
    // Auswahl (#149): alle Treffer einer Sicht (mit Suche) als Ids; mehrere Mappen löschen (#150).
    {
      methode: 'GET',
      pfad: '/api/mappen/auswahl',
      zugang: 'angemeldet',
      handler: async (a) => ok(await dienst.sichten.trefferIds(ich(a), a.query, await zg(a))),
    },
    // Mehrere Mappen per E-Mail (#151): Lesen und Versenden (Recht E einer Ansicht) je Mappe.
    {
      methode: 'POST',
      pfad: '/api/mappen/email',
      zugang: 'angemeldet',
      handler: async (a) => {
        const i = ich(a);
        const r = await dienst.ausgangEmail.versendeMappen(
          b(a),
          { id: i.id, name: i.name, email: i.email, rolle: i.rolle },
          await zg(a),
          x.betrieb?.mailer() ?? null,
        );
        await modusSpur(a, (Array.isArray(b(a).ids) ? (b(a).ids as unknown[]) : []).map(String), 'versendet');
        L.ablage.info('Mehrere Mappen per E-Mail verschickt', { von: i.email, mappen: r.mappen, anhaenge: r.anhaenge });
        return ok(r, 201);
      },
    },
  ];
}

/** Mappen löschen, auch mit allen verknüpften (#424). */
function loeschenRouten(k: RoutenKontext): Route[] {
  const { dienst, zg } = k;
  return [
    {
      methode: 'POST',
      pfad: '/api/mappen/loeschen',
      zugang: 'angemeldet',
      handler: async (a) => {
        const r = await dienst.loeschen.loescheMappen(b(a), ich(a).id, await zg(a), quelle(a));
        if (b(a).probe !== true) L.ablage.info('Mehrere Mappen gelöscht', { geloescht: r.geloescht, ausgelassen: r.ausgelassen.length });
        return ok(r);
      },
    },
    {
      methode: 'DELETE',
      pfad: '/api/mappen/:id',
      zugang: 'angemeldet',
      handler: async (a) => {
        const papierkorb = (await dienst.kern.papierkorbTage()) > 0;
        await dienst.loeschen.loescheMappe(a.params.id, ich(a).id, await zg(a), {
          ...liesAnlass({ ...a.query, ...b(a) }),
          ausloeser: quelle(a),
          weg: 'einzeln',
        });
        L.ablage.info(papierkorb ? 'Mappe in den Papierkorb gelegt' : 'Mappe gelöscht', { id: a.params.id });
        return leer;
      },
    },

    // Mit allen verknüpften Mappen löschen (#424): Vorschau als Baum, dann Ausführen mit derselben Prüfung.
    {
      methode: 'GET',
      pfad: '/api/mappen/:id/loeschvorschau',
      zugang: 'angemeldet',
      lesend: true,
      handler: async (a) => ok(await dienst.mitVerknuepften.loeschVorschau(a.params.id, a.query, await zg(a))),
    },
    {
      methode: 'POST',
      pfad: '/api/mappen/:id/mit-verknuepften-loeschen',
      zugang: 'angemeldet',
      handler: async (a) => ok(await dienst.mitVerknuepften.loescheMitVerknuepften(a.params.id, a.body, ich(a).id, await zg(a), quelle(a))),
    },
  ];
}
