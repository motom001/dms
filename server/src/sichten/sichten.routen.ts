/**
 * Ablage (#960: aus routen.ts): Mappenliste, Favoriten, Sichten, Stand und Zähler, Mappe öffnen, Startseite.
 */
import { Fachfehler } from '../fehler';
import { ZULETZT_LISTE } from '../konten';
import { t } from '../sprache';
import { L, ok, leer, b, ich, passtEtag } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../routen';

export function ablageRouten(k: RoutenKontext): Route[] {
  const { dienst, konten, passwoerterAnzeigen, modusSpur, zg, darf, zuletztGeoeffnet, entschluessele } = k;
  return [
    /* ---------- Mappen ---------- */
    // Mit ?sicht=… seitenweise (von, anzahl, suche); ohne: alle Mappen (für Skripte und Tests).
    { methode: 'GET', pfad: '/api/mappen', zugang: 'angemeldet', handler: async (a) => {
      const klartext = passwoerterAnzeigen(a);
      const z = await zg(a);
      if (!a.query.sicht) {
        const alle = await dienst.mappen.listeMappen(a.query.typ);
        const sichtbar = await dienst.rechtepruefung.lesbare(z, alle.map((m) => m.id));
        const liste = alle.filter((m) => sichtbar.has(m.id));
        return ok(klartext ? await entschluessele(a, liste, klartext) : liste);
      }
      const start = Date.now();
      const s = await dienst.sichten.seite(ich(a), a.query, z);
      L.ablage.debug('Ansicht geladen', { sicht: a.query.sicht, von: s.von, anzahl: s.mappen.length, gesamt: s.gesamt, suche: a.query.suche, ms: Date.now() - start });
      return ok(klartext ? { ...s, mappen: await entschluessele(a, s.mappen.filter((m) => !m.verborgen), klartext) } : s);
    } },
    // Feldart Tabelle (#1030): verweisende Mappen seitenweise – nur lesbare, auch in der Zahl.
    { methode: 'GET', pfad: '/api/mappen/:id/tabelle/:feld', zugang: 'angemeldet', handler: async (a) => ok(await dienst.sichten.tabelle(a.params.id, a.params.feld, a.query, await zg(a))) },
    // Favoriten (#62)
    { methode: 'PUT', pfad: '/api/mappen/:id/favorit', zugang: 'angemeldet', handler: async (a) => { await darf(a, a.params.id, 'R'); return ok(await dienst.mappen.setzeFavorit(ich(a), a.params.id, true)); } },
    { methode: 'DELETE', pfad: '/api/mappen/:id/favorit', zugang: 'angemeldet', handler: async (a) => ok(await dienst.mappen.setzeFavorit(ich(a), a.params.id, false)) },
    // Favorit = Abo (#422): je Favorit benachrichtigen an/aus; Mappen als gesehen markieren (Hervorhebung, „Geändert“).
    { methode: 'PUT', pfad: '/api/mappen/:id/favorit/benachrichtigen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.mappen.setzeFavoritBenachrichtigen(ich(a), a.params.id, b(a).an)) },
    { methode: 'POST', pfad: '/api/gesehen', zugang: 'angemeldet', handler: async (a) => { await dienst.mappen.gesehen(ich(a), b(a).ids); return leer; } },
    { methode: 'GET', pfad: '/api/sichten', zugang: 'angemeldet', handler: async (a) => ok(await dienst.sichten.zaehler(ich(a), await zg(a))) },
    // Stand der Ablage (#919): ein Fingerabdruck ohne Inhalt; die Oberfläche lädt Startseite und Zähler nur bei Änderung.
    // Nur für die eigene Oberfläche (nicht in /api/v1); zählt nicht als Aktivität (`still`).
    { methode: 'GET', pfad: '/api/ablage/stand', zugang: 'angemeldet', still: true, handler: async (a) => ok({ stand: await dienst.sichten.ablageStand(ich(a)) }) },
    // Ohne Zählen (#512): Papierkorb-Tage und „Neue Post“ – die Ablage erscheint damit sofort, die Zahlen kommen danach.
    { methode: 'GET', pfad: '/api/sichten/rahmen', zugang: 'angemeldet', handler: async () => ok(await dienst.sichten.zaehlerRahmen()) },
    // Zähler-Endpunkt (#625): nur Zahlen; ETag und 304, damit häufiges Nachfragen nichts kostet.
    { methode: 'GET', pfad: '/api/ich/zaehler', zugang: 'angemeldet', handler: async (a) => {
      const r = await dienst.sichten.zaehlerAbruf(await zg(a));
      const koepfe = { etag: r.etag, 'cache-control': 'private, no-cache' };
      if (passtEtag(a.kopf?.('if-none-match'), r.etag)) return { status: 304, koepfe };
      return { status: 200, body: { ...r.zahlen, stand: r.stand, geaendert: r.geaendert }, koepfe };
    } },

    /* ---------- Sichten verwalten (#38, #40, #41) ---------- */
    { methode: 'GET', pfad: '/api/sichten/definitionen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.sichtenVerwaltung.listeSichten(await zg(a))) },
    { methode: 'POST', pfad: '/api/sichten/definitionen', zugang: 'admin', handler: async (a) => {
      const s = await dienst.sichtenVerwaltung.legeSichtAn(a.body);
      L.werkbank.info('Ansicht angelegt', { sicht: s.name, typen: s.typen.length, bedingungen: s.bedingungen.length });
      return ok(s, 201);
    } },
    { methode: 'PUT', pfad: '/api/sichten/definitionen/:id', zugang: 'admin', handler: async (a) => {
      const s = await dienst.sichtenVerwaltung.aendereSicht(a.params.id, a.body);
      L.werkbank.info('Ansicht geändert', { sicht: s.name, typen: s.typen.length, bedingungen: s.bedingungen.length });
      return ok(s);
    } },
    { methode: 'DELETE', pfad: '/api/sichten/definitionen/:id', zugang: 'admin', handler: async (a) => {
      await dienst.sichtenVerwaltung.loescheSicht(a.params.id);
      L.werkbank.info('Ansicht gelöscht', { id: a.params.id });
      return leer;
    } },
    { methode: 'POST', pfad: '/api/sichten/definitionen/:id/verschieben', zugang: 'admin', handler: async (a) => {
      const r = await dienst.sichtenVerwaltung.verschiebeSicht(a.params.id, b(a).elternId, b(a).stelle);
      L.werkbank.info('Ansicht verschoben', { id: a.params.id, elternId: b(a).elternId ?? null, stelle: b(a).stelle });
      return ok(r);
    } },
    { methode: 'PUT', pfad: '/api/sichten/reihenfolge', zugang: 'admin', handler: async (a) => ok(await dienst.sichtenVerwaltung.ordneSichten(b(a).elternId, b(a).ids)) },
    { methode: 'POST', pfad: '/api/sichten/vorschau', zugang: 'admin', lesend: true, handler: async (a) => ok(await dienst.sichtenVerwaltung.sichtVorschau(ich(a), b(a).id, b(a).sicht)) },
    { methode: 'GET', pfad: '/api/typen/:id/belegung', zugang: 'admin', handler: async (a) => ok(await dienst.sichtenVerwaltung.belegung(a.params.id)) },
    { methode: 'GET', pfad: '/api/mappen/:id', zugang: 'angemeldet', handler: async (a) => {
      const klartext = passwoerterAnzeigen(a);
      const z = await zg(a);
      // Unabhängiges gleichzeitig (#741): Der Stern ist nur ein Ja/Nein der Person und geht nur mit der Mappe hinaus.
      const [m, favorit] = await Promise.all([dienst.mappen.holeMappe(a.params.id, z), dienst.mappen.istFavorit(ich(a), a.params.id)]);
      const d = { ...m, favorit, exportierbar: false };
      if (klartext && !d.rechte.P) throw new Fachfehler(403, t('meldungen.routen.passwoerter-dieser-mappe-darfst'));
      // Exportrecht (#294, #723): Herunterladen, Versenden, „Als PDF exportieren“ nur für lesbare Mappen, die in einer
      // Sicht mit Recht E liegen – dieselbe Prüfstelle wie beim Herunterladen selbst.
      // Verwaltungsmodus (#820): ohne Modus nicht lesbar → Historie und Hinweis in der Oberfläche.
      // Automatisierungsvorlagen (#1044): fürs Menü „Mappe“ und die Namen im Bereich „Geplant“ – im selben Zug.
      const lesen = d.rechte?.R !== false;
      const [mitnehmbar, spur, vorlagen] = await Promise.all([
        lesen ? dienst.ausgang.mitnehmbar(ich(a), z, [a.params.id]) : Promise.resolve(new Set<string>()),
        modusSpur(a, [a.params.id], 'angesehen'),
        lesen ? dienst.ablaeufe.vorlagen() : Promise.resolve([]),
      ]);
      d.exportierbar = mitnehmbar.has(a.params.id);
      const nurImVerwaltungsmodus = spur.has(a.params.id);
      const namen = new Map(vorlagen.map((v) => [v.kennung, v.name] as const));
      const ablaufvorlagen = lesen ? dienst.ablaeufe.zumAnwendenAus(vorlagen, m.mappe.typId, [...z.typen.values()]) : [];
      const antwort = { ...d, ...(nurImVerwaltungsmodus ? { nurImVerwaltungsmodus } : {}), erinnerungen: (d.erinnerungen ?? []).map((e) => ({ ...e, vorlageName: namen.get(e.vorlage) ?? e.vorlage })), ablaufvorlagen };
      const danach: Array<() => Promise<unknown>> = [];
      // Startseite (#334): „Zuletzt geöffnet“ – nur in der Oberfläche, nicht über API-Schlüssel. Nach der Antwort (#741).
      const b = a.benutzer;
      if (!a.apiSchluessel && b) danach.push(() => konten.merkeGeoeffnet(b, a.params.id));
      // Favorit = Abo (#422): geöffnet = gesehen – Hervorhebung weg, offene „Geändert“-Benachrichtigung erledigt.
      if (!a.apiSchluessel && b && !a.sitzungsDaten?.vertretungId) danach.push(() => dienst.mappen.gesehen(b, a.params.id, d.aufgaben));
      return { ...ok(klartext ? { ...antwort, mappe: (await dienst.passwortfelder.entschluesselePasswoerter([d.mappe], klartext, ich(a).id))[0] } : antwort), danach };
    } },
    // Startseite (#334): zuletzt geöffnete Mappen (nur lesbare, höchstens 5) und ob es schon eigene Mappen gibt.
    { methode: 'GET', pfad: '/api/startseite', zugang: 'angemeldet', handler: async (a) => ok({ zuletzt: await zuletztGeoeffnet(a, 5), leer: await dienst.dokumente.ohneEigeneMappen() }) },
    // „Zuletzt geöffnet“ als Liste (#940): die letzten 25 lesbaren Mappen der Person, neueste oben, mit Zeitpunkt.
    { methode: 'GET', pfad: '/api/startseite/zuletzt', zugang: 'angemeldet', handler: async (a) => ok(await zuletztGeoeffnet(a, ZULETZT_LISTE)) },
  ];
}
