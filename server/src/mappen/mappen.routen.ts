/**
 * Mappen (#960: aus routen.ts): E-Mail, Post und Fotos, Zuordnen und Abgleich, Vorschläge und Erkennung, Notizen,
 * Historie, Anlegen und Ändern, Export einer Sicht, Auswahl, Löschen und Papierkorb.
 */
import { MAX_DATEIGROESSE, POST_KANAL } from '../../../shared/src/model';
import { Fachfehler } from '../fehler';
import { t } from '../sprache';
import { liesAnlass } from '../../../shared/src/loeschprotokoll';
import { liesQuelle } from '../uebersetzung';
import { VORSCHLAG_DATEI_MAX } from '../grenzen';
import { L, ok, leer, b, quelle, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../routen';

export function mappenRouten(k: RoutenKontext): Route[] {
  const { dienst, x, fotostapel, typName, spracheFuer, modusSpur, zg, darf } = k;
  return [
    // Sichtbarkeit verwiesener Mappen (#888): Erwähnungen und Namen unterscheiden „nicht sichtbar“ von „gelöscht“.
    // Nur für Ids, die die Oberfläche schon kennt; keine Titel, kein Typ (wie „nicht sichtbare Mappe“, #124).
    { methode: 'POST', pfad: '/api/mappen/sichtbarkeit', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.rechtepruefung.sichtbarkeit(await zg(a), b(a).ids)) },
    // Notizen (#55)
    // E-Mail aus der Mappe (#58)
    { methode: 'GET', pfad: '/api/email/bereit', zugang: 'angemeldet', handler: async () => ok({ bereit: !!x.betrieb?.mailer() }) },
    { methode: 'POST', pfad: '/api/mappen/:id/email', zugang: 'angemeldet', handler: async (a) => {
      const i = ich(a);
      // Versenden gibt Daten hinaus wie ein Export (#330): Lesen und Exportrecht, gemeinsame Prüfstelle (#723).
      const r = await dienst.ausgangEmail.versendeMappe(a.params.id, b(a), { id: i.id, name: i.name, email: i.email }, x.betrieb?.mailer() ?? null, await zg(a));
      await modusSpur(a, [a.params.id], 'versendet');
      return ok(r, 201);
    } },
    // Post (#192): anlegen („+ Post“, Dokumente danach über das Hochladen) und einer Mappe zuordnen.
    { methode: 'POST', pfad: '/api/post', zugang: 'angemeldet', handler: async (a) => {
      const i = ich(a);
      return ok(await dienst.post.legePostAn(b(a), { id: i.id, name: i.name }, await zg(a), a.apiSchluessel ? POST_KANAL.api : POST_KANAL.hochgeladen), 201);
    } },
    // Post fotografieren (#490): Fotos einzeln in den Stapel, „Fertig“ macht ein PDF daraus.
    { methode: 'POST', pfad: '/api/fotostapel', zugang: 'angemeldet', roh: MAX_DATEIGROESSE, handler: async (a) => ok({ id: await fotostapel.lege(ich(a).id, a.body) }, 201) },
    { methode: 'POST', pfad: '/api/post/fotos', zugang: 'angemeldet', handler: async (a) => {
      const i = ich(a);
      const ids = (b(a) as { stapel?: unknown }).stapel;
      const fotos = await fotostapel.nimm(i.id, ids);
      const r = await dienst.postFotos.postAusFotos(b(a), fotos, { id: i.id, name: i.name }, await zg(a), a.apiSchluessel ? POST_KANAL.api : POST_KANAL.hochgeladen);
      await fotostapel.weg(i.id, ids as string[]);
      return ok(r, 201);
    } },
    { methode: 'POST', pfad: '/api/mappen/:id/fotos', zugang: 'angemeldet', handler: async (a) => {
      const i = ich(a);
      const ids = (b(a) as { stapel?: unknown }).stapel;
      const fotos = await fotostapel.nimm(i.id, ids);
      const r = await dienst.postFotos.fotosAnMappe(a.params.id, b(a), fotos, i.id, await zg(a));
      await fotostapel.weg(i.id, ids as string[]);
      return ok(r, 201);
    } },
    { methode: 'POST', pfad: '/api/post/:id/zusammenlegen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.postFotos.legePostZusammen(a.params.id, b(a), ich(a).id, await zg(a))) },
    { methode: 'POST', pfad: '/api/mappen/:id/zuordnen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.post.ordneZu(a.params.id, b(a), ich(a).id, await zg(a), undefined, quelle(a))) },
    // „Dokument übernehmen“ (#934): Folgedokumente als neue Post abtrennen; Abgleich mit vorhandenen Mappen (Belege, Doppelte, Typ).
    { methode: 'POST', pfad: '/api/mappen/:id/abtrennen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.postAufloesen.trennePostAb(a.params.id, b(a), ich(a).id, await zg(a))) },
    { methode: 'POST', pfad: '/api/abgleich', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.erkennung.abgleichDokumente(b(a), await zg(a))) },
    // „Wohin gehört das?“ mehrstufig (#939): Pakete mit dms:klassifizieren, Kern-Erkennung und Abgleich – ein Vorschlag mit Belegen.
    { methode: 'POST', pfad: '/api/klassifizieren', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.erkennung.klassifizierung.klassifiziere(b(a), await zg(a))) },
    // „Aus Dokument ausfüllen“ (#391): Vorschläge für die Felder eines Mappentyps aus Text, Dokumenten oder einer Datei.
    { methode: 'POST', pfad: '/api/typen/:id/vorschlaege', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.erkennung.fuerTyp(a.params.id, b(a), await zg(a))) },
    { methode: 'POST', pfad: '/api/typen/:id/vorschlaege/datei', zugang: 'angemeldet', lesend: true, roh: VORSCHLAG_DATEI_MAX, handler: async (a) => {
      const z = await zg(a);
      if (!Buffer.isBuffer(a.body) || !a.body.length) throw new Fachfehler(422, t('meldungen.routen.die-datei-ist-leer'));
      // Erst Zugriff prüfen, dann die (teure) Texterkennung.
      await dienst.erkennung.fuerTyp(a.params.id, { mappe: a.query.mappe }, z);
      // E-Rechnung (#1043): XML direkt, im PDF aus dem Anhang – ihre Angaben gehen vor.
      const { text, info, erechnung } = await dienst.erkennung.dateiLesen(a.body, String(a.query.name ?? ''), String(a.query.typ ?? ''));
      return ok({ ...(await dienst.erkennung.fuerTyp(a.params.id, { text, mappe: a.query.mappe, positionen: a.query.positionen === '1' || a.query.positionen === 'true' }, z, { erechnung })), text: text.slice(0, 200_000), info });
    } },
    { methode: 'GET', pfad: '/api/typen/:id/erkennungsschema', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.erkennung.schema(a.params.id, await zg(a))) },
    // Erkennung (#336): Vorschläge beim Zuordnen; POST rechnet neu (z. B. nach dem Anlegen einer Organisation).
    { methode: 'GET', pfad: '/api/mappen/:id/erkennung', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.erkennung.fuerBenutzer(a.params.id, await zg(a))) },
    { methode: 'POST', pfad: '/api/mappen/:id/erkennung', zugang: 'angemeldet', handler: async (a) => {
      const z = await zg(a);
      await dienst.rechtepruefung.pruefeRecht(z, a.params.id, 'R');
      await dienst.erkennung.fuerPost(a.params.id);
      return ok(await dienst.erkennung.fuerBenutzer(a.params.id, z));
    } },
    // Notizen brauchen nur Lesen (#124).
    // Übersetzung anzeigen (#732): nur Kennungen – den Text liest der Kern mit den Rechten der Person; je Aufruf ein Abschnitt.
    // Gespeichert wird nichts an der Mappe; die Übersetzung liegt nur im Zwischenspeicher.
    { methode: 'POST', pfad: '/api/uebersetzung', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.uebersetzung.uebersetze(liesQuelle(b(a).quelle), { teil: b(a).teil, nach: (await spracheFuer(a)).sprache, ich: ich(a), z: await zg(a) })) },
    { methode: 'GET', pfad: '/api/mappen/:id/notizen', zugang: 'angemeldet', handler: async (a) => { await darf(a, a.params.id, 'R'); return ok(await dienst.mappen.notizen(a.params.id)); } },
    { methode: 'POST', pfad: '/api/mappen/:id/notizen', zugang: 'angemeldet', handler: async (a) => { await darf(a, a.params.id, 'R'); return ok(await dienst.mappenNotizen.legeNotizAn(a.params.id, b(a).text, ich(a).id), 201); } },
    { methode: 'PUT', pfad: '/api/notizen/:id', zugang: 'angemeldet', handler: async (a) => { await darf(a, await dienst.rechtepruefung.mappeVon('notiz', a.params.id), 'R'); return ok(await dienst.mappenNotizen.aendereNotiz(a.params.id, b(a).text, ich(a).id)); } },
    { methode: 'DELETE', pfad: '/api/notizen/:id', zugang: 'angemeldet', handler: async (a) => { await darf(a, await dienst.rechtepruefung.mappeVon('notiz', a.params.id), 'R'); await dienst.mappenNotizen.loescheNotiz(a.params.id, ich(a).id); return leer; } },
    // Änderungshistorie (#57)
    { methode: 'GET', pfad: '/api/mappen/:id/verweisende', zugang: 'angemeldet', handler: async (a) => ok(await dienst.mappen.verweisende(a.params.id, String(a.query.typ ?? ''), String(a.query.feld ?? ''), await zg(a))) },
    { methode: 'GET', pfad: '/api/mappen/:id/historie', zugang: 'angemeldet', handler: async (a) => {
      await darf(a, a.params.id, 'R');
      // #800: ?register=… zeigt, was dieses Register „Historie“ zeigt; ?max=…&vor=… seitenweise. Ohne Angaben alles.
      return ok(await dienst.mappenHistorie.historie(a.params.id, { register: a.query.register, max: a.query.max, vor: a.query.vor }));
    } },
    // Passwortfeld anzeigen (#46): einzeln, mit Protokolleintrag (ohne den Wert).
    { methode: 'POST', pfad: '/api/mappen/:id/passwoerter/:feld', zugang: 'angemeldet', handler: async (a) => { await darf(a, a.params.id, 'P'); return ok(await dienst.passwortfelder.zeigePasswort(a.params.id, a.params.feld, ich(a).id)); } },
    // Hinweise von Paketen (#1034): nur Dienstkonten mit dms:hinweise; das Paket ergibt sich aus dem Konto.
    { methode: 'PUT', pfad: '/api/mappen/:id/hinweise/:schluessel', zugang: 'angemeldet', handler: async (a) => ok(await dienst.mappenHinweise.setze(await zg(a), a.params.id, a.params.schluessel, b(a))) },
    { methode: 'DELETE', pfad: '/api/mappen/:id/hinweise/:schluessel', zugang: 'angemeldet', handler: async (a) => { await dienst.mappenHinweise.entferne(await zg(a), a.params.id, a.params.schluessel); return leer; } },
    // Vor dem Speichern (#126): Rechte mit den neuen Werten – für die Warnung beim Selbst-Entziehen.
    { methode: 'POST', pfad: '/api/mappen/:id/rechte-vorschau', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.mappenEingaben.rechteVorschau(a.params.id, a.body, await zg(a))) },
    { methode: 'POST', pfad: '/api/mappen', zugang: 'angemeldet', handler: async (a) => {
      const m = await dienst.mappen.legeMappeAn(a.body, ich(a).id, false, await zg(a));
      L.ablage.info('Mappe angelegt', { typ: await typName(m.typId), titel: m.titel, id: m.id });
      return ok(m, 201);
    } },
    { methode: 'PUT', pfad: '/api/mappen/:id', zugang: 'angemeldet', handler: async (a) => {
      const m = await dienst.mappen.aendereMappe(a.params.id, a.body, ich(a).id, await zg(a));
      await modusSpur(a, [m.id], 'geaendert');
      L.ablage.info('Mappe geändert', { typ: await typName(m.typId), titel: m.titel, id: m.id });
      return ok(m);
    } },
    // Export (#152, #153): Tabelle, ZIP mit Dokumenten oder PDF – Recht E an der Sicht, Lesen je Mappe.
    { methode: 'POST', pfad: '/api/export', zugang: 'angemeldet', handler: async (a) => {
      const r = await dienst.ausgangExport.exportiere(ich(a), b(a), await zg(a), (ids) => modusSpur(a, ids, 'exportiert'), a.apiSchluessel ? 'api' : 'oberflaeche');
      L.ablage.info('Mappen exportiert', { von: ich(a).email, sicht: b(a).sicht, format: b(a).format, mappen: r.mappen, ausgelassen: r.ausgelassen, auswahl: Array.isArray(b(a).ids) });
      return { datei: { inhalt: r.inhalt, name: r.name, mime: r.mime, anzeigen: false, groesse: r.groesse, koepfe: { 'x-dms-ausgelassen': String(r.ausgelassen) } } };
    } },
    // Auswahl (#149): alle Treffer einer Sicht (mit Suche) als Ids; mehrere Mappen löschen (#150).
    { methode: 'GET', pfad: '/api/mappen/auswahl', zugang: 'angemeldet', handler: async (a) => ok(await dienst.sichten.trefferIds(ich(a), a.query, await zg(a))) },
    // Mehrere Mappen per E-Mail (#151): Lesen und Versenden (Recht E einer Ansicht) je Mappe.
    { methode: 'POST', pfad: '/api/mappen/email', zugang: 'angemeldet', handler: async (a) => {
      const i = ich(a);
      const r = await dienst.ausgangEmail.versendeMappen(b(a), { id: i.id, name: i.name, email: i.email, rolle: i.rolle }, await zg(a), x.betrieb?.mailer() ?? null);
      await modusSpur(a, (Array.isArray(b(a).ids) ? b(a).ids as unknown[] : []).map(String), 'versendet');
      L.ablage.info('Mehrere Mappen per E-Mail verschickt', { von: i.email, mappen: r.mappen, anhaenge: r.anhaenge });
      return ok(r, 201);
    } },
    { methode: 'POST', pfad: '/api/mappen/loeschen', zugang: 'angemeldet', handler: async (a) => {
      const r = await dienst.loeschen.loescheMappen(b(a), ich(a).id, await zg(a), quelle(a));
      if (b(a).probe !== true) L.ablage.info('Mehrere Mappen gelöscht', { geloescht: r.geloescht, ausgelassen: r.ausgelassen.length });
      return ok(r);
    } },
    { methode: 'DELETE', pfad: '/api/mappen/:id', zugang: 'angemeldet', handler: async (a) => {
      const papierkorb = (await dienst.kern.papierkorbTage()) > 0;
      await dienst.loeschen.loescheMappe(a.params.id, ich(a).id, await zg(a), { ...liesAnlass({ ...a.query, ...b(a) }), ausloeser: quelle(a), weg: 'einzeln' });
      L.ablage.info(papierkorb ? 'Mappe in den Papierkorb gelegt' : 'Mappe gelöscht', { id: a.params.id });
      return leer;
    } },

    // Mit allen verknüpften Mappen löschen (#424): Vorschau als Baum, dann Ausführen mit derselben Prüfung.
    { methode: 'GET', pfad: '/api/mappen/:id/loeschvorschau', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.mitVerknuepften.loeschVorschau(a.params.id, a.query, await zg(a))) },
    { methode: 'POST', pfad: '/api/mappen/:id/mit-verknuepften-loeschen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.mitVerknuepften.loescheMitVerknuepften(a.params.id, a.body, ich(a).id, await zg(a), quelle(a))) },

    /* ---------- Papierkorb (#43): in der Ablage nur, was ich gelöscht habe ---------- */
    { methode: 'GET', pfad: '/api/papierkorb', zugang: 'angemeldet', handler: async (a) => ok(await dienst.papierkorbVerwaltung.papierkorb(ich(a))) },
    // Einzelne Dokumente (#344): eigene Liste, damit die Antwort von /api/papierkorb gleich bleibt.
    { methode: 'GET', pfad: '/api/papierkorb/dokumente', zugang: 'angemeldet', handler: async (a) => ok(await dienst.papierkorbVerwaltung.papierkorbDokumente(ich(a))) },
    { methode: 'POST', pfad: '/api/papierkorb/dokumente/:id/wiederherstellen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.papierkorbVerwaltung.stelleDokumentWiederHer(a.params.id, ich(a), await zg(a), false, quelle(a))) },
    { methode: 'DELETE', pfad: '/api/papierkorb/dokumente/:id', zugang: 'angemeldet', handler: async (a) => ok({ geloescht: await dienst.papierkorbVerwaltung.loescheDokumentEndgueltig([a.params.id], ich(a), false, quelle(a)) }) },
    { methode: 'DELETE', pfad: '/api/papierkorb', zugang: 'angemeldet', handler: async (a) => ok({ geloescht: await dienst.papierkorbVerwaltung.leerePapierkorb(ich(a), false, { quelle: quelle(a) }) }) },
    { methode: 'GET', pfad: '/api/papierkorb/:id', zugang: 'angemeldet', handler: async (a) => ok(await dienst.papierkorbVerwaltung.papierkorbEintrag(a.params.id, ich(a))) },
    { methode: 'POST', pfad: '/api/papierkorb/:id/wiederherstellen', zugang: 'angemeldet', handler: async (a) => {
      const r = await dienst.papierkorbVerwaltung.stelleWiederHer(a.params.id, ich(a), false, quelle(a));
      // Eigener Papierkorb (#126): immer wiederherstellbar; danach gelten wieder die Regeln.
      const sichtbar = (await dienst.rechtepruefung.lesbare(await zg(a), [a.params.id])).has(a.params.id);
      return ok(sichtbar ? r : { ...r, hinweis: t('meldungen.routen.wiederhergestellt-diese-mappe-kannst') });
    } },
    { methode: 'DELETE', pfad: '/api/papierkorb/:id', zugang: 'angemeldet', handler: async (a) => ok({ geloescht: await dienst.papierkorbVerwaltung.loescheEndgueltig([a.params.id], ich(a), false, quelle(a)) }) },
    // Ein Vorgang (#424): alle Mappen, die zusammen gelöscht wurden.
    { methode: 'POST', pfad: '/api/papierkorb/vorgang/:id/wiederherstellen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.mitVerknuepften.stelleVorgangWiederHer(a.params.id, ich(a), false, quelle(a))) },
    /* … und in der Werkbank alles */
    { methode: 'GET', pfad: '/api/werkbank/papierkorb', zugang: 'admin', handler: async (a) => ok({ tage: await dienst.kern.papierkorbTage(), historieTage: await dienst.mappenHistorie.historieTage(), eintraege: await dienst.papierkorbVerwaltung.papierkorb(ich(a), true), dokumente: await dienst.papierkorbVerwaltung.papierkorbDokumente(ich(a), true) }) },
    { methode: 'POST', pfad: '/api/werkbank/papierkorb/dokumente/:id/wiederherstellen', zugang: 'admin', handler: async (a) => ok(await dienst.papierkorbVerwaltung.stelleDokumentWiederHer(a.params.id, ich(a), undefined, true, quelle(a))) },
    { methode: 'DELETE', pfad: '/api/werkbank/papierkorb/dokumente/:id', zugang: 'admin', handler: async (a) => ok({ geloescht: await dienst.papierkorbVerwaltung.loescheDokumentEndgueltig([a.params.id], ich(a), true, quelle(a)) }) },
    { methode: 'PUT', pfad: '/api/werkbank/papierkorb/einstellungen', zugang: 'admin', handler: async (a) => {
      const historieTage = b(a).historieTage === undefined ? await dienst.mappenHistorie.historieTage() : await dienst.mappenHistorie.setzeHistorieTage(b(a).historieTage);
      const r = b(a).tage === undefined ? { tage: await dienst.kern.papierkorbTage(), geleert: 0 } : await dienst.papierkorbVerwaltung.setzePapierkorbTage(b(a).tage, ich(a).id);
      return ok({ ...r, historieTage });
    } },
    { methode: 'DELETE', pfad: '/api/werkbank/papierkorb', zugang: 'admin', handler: async (a) => ok({ geloescht: await dienst.papierkorbVerwaltung.leerePapierkorb(ich(a), true, { quelle: quelle(a) }) }) },
    { methode: 'GET', pfad: '/api/werkbank/papierkorb/:id', zugang: 'admin', handler: async (a) => ok(await dienst.papierkorbVerwaltung.papierkorbEintrag(a.params.id, ich(a), true)) },
    { methode: 'POST', pfad: '/api/werkbank/papierkorb/:id/wiederherstellen', zugang: 'admin', handler: async (a) => ok(await dienst.papierkorbVerwaltung.stelleWiederHer(a.params.id, ich(a), true, quelle(a))) },
    { methode: 'POST', pfad: '/api/werkbank/papierkorb/vorgang/:id/wiederherstellen', zugang: 'admin', handler: async (a) => ok(await dienst.mitVerknuepften.stelleVorgangWiederHer(a.params.id, ich(a), true, quelle(a))) },
    { methode: 'DELETE', pfad: '/api/werkbank/papierkorb/:id', zugang: 'admin', handler: async (a) => ok({ geloescht: await dienst.papierkorbVerwaltung.loescheEndgueltig([a.params.id], ich(a), true, quelle(a)) }) },
  ];
}
