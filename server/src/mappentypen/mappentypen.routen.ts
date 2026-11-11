/**
 * Mappentypen (#960: aus routen.ts): Stempel, Mappentypen, Beispiele, Demo-Daten und Aufträge, Archivmodus und
 * Auswahlfilter, Berechtigungen je Mappentyp und KI-Typen.
 */
import { ladeBeispiele } from '../beispiele';
import { demoPhasen, erzeugeDemo, pruefeDemoOptionen, schaetzeDemo } from '../demo';
import { t } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { L, ok, archivProtokoll, leer, b, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../routen';

export function typenRouten(k: RoutenKontext): Route[] {
  const { dienst, typName, zg, demoPlatz } = k;
  return [
    /* ---------- Stempel beim Weitergeben (#394) ---------- */
    { methode: 'GET', pfad: '/api/stempel/vorlagen', zugang: 'angemeldet', handler: async () => ok(await dienst.stempelVorlagen()) },
    { methode: 'POST', pfad: '/api/werkbank/stempel/vorlagen', zugang: 'admin', handler: async (a) => ok(await dienst.speichereStempelVorlage(null, a.body, ich(a).email), 201) },
    { methode: 'PUT', pfad: '/api/werkbank/stempel/vorlagen/:id', zugang: 'admin', handler: async (a) => ok(await dienst.speichereStempelVorlage(a.params.id, a.body, ich(a).email)) },
    { methode: 'DELETE', pfad: '/api/werkbank/stempel/vorlagen/:id', zugang: 'admin', handler: async (a) => ok(await dienst.loescheStempelVorlage(a.params.id, ich(a).email)) },

    /* ---------- Mappentypen ---------- */
    // Regeln (#123) sehen nur Administratoren; alle anderen erfahren, ob sie anlegen dürfen.
    { methode: 'GET', pfad: '/api/typen', zugang: 'angemeldet', handler: async (a) => ok(await dienst.mappentypen.typenFuer(await zg(a))) },
    { methode: 'GET', pfad: '/api/konto/rechte', zugang: 'angemeldet', handler: async (a) => ok(await dienst.mappentypen.rechteUebersicht(await zg(a))) },
    { methode: 'POST', pfad: '/api/typen', zugang: 'admin', handler: async (a) => {
      const t = await dienst.mappentypen.legeTypAn(a.body);
      L.werkbank.info('Mappentyp angelegt', { typ: t.name, id: t.id, felder: t.felder.length });
      if (t.archiv) archivProtokoll(t, null);
      return ok(t, 201);
    } },
    { methode: 'PUT', pfad: '/api/typen/:id', zugang: 'admin', handler: async (a) => {
      const start = Date.now();
      const vorher = (await dienst.mappentypen.listeTypen()).find((x) => x.id === a.params.id);
      const t = await dienst.mappentypen.aendereTyp(a.params.id, a.body);
      L.werkbank.info('Mappentyp geändert, Titel und Passung neu berechnet', { typ: t.name, id: t.id, ms: Date.now() - start });
      // Archivmodus (#212): Ein-, Aus- und Umschalten festhalten – erst hier beim Speichern (#373).
      archivProtokoll(t, vorher?.archiv ?? null);
      // Versionierung (#194): Ein- und Ausschalten je Register festhalten.
      for (const r of t.register.filter((x) => x.art === 'dokumente')) {
        const war = !!vorher?.register.find((x) => x.key === r.key)?.versionierung;
        if (war !== !!r.versionierung) L.werkbank.info(r.versionierung ? 'Versionierung eingeschaltet' : 'Versionierung ausgeschaltet', { typ: t.name, register: r.name });
      }
      return ok(t);
    } },
    { methode: 'DELETE', pfad: '/api/typen/:id', zugang: 'admin', handler: async (a) => {
      const name = await typName(a.params.id);
      await dienst.mappentypen.loescheTyp(a.params.id);
      L.werkbank.info('Mappentyp gelöscht', { typ: name, id: a.params.id });
      return leer;
    } },
    { methode: 'POST', pfad: '/api/beispiele', zugang: 'admin', handler: async (a) => {
      // Beispiele lösen keine Ereignisse aus (#670).
      await dienst.kern.ohneEreignisse(() => ladeBeispiele(dienst, ich(a).id));
      L.werkbank.info('Beispiel-Mappentypen geladen');
      return leer;
    } },
    { methode: 'GET', pfad: '/api/werkbank/demo', zugang: 'admin', handler: async () => ok(await dienst.demoUebersicht()) },
    // Erzeugen und Entfernen laufen im Hintergrund (202); den Stand liefert /api/werkbank/auftrag.
    { methode: 'POST', pfad: '/api/werkbank/demo', zugang: 'admin', handler: async (a) => {
      const o = pruefeDemoOptionen(b(a));
      const benutzerId = ich(a).id;
      L.werkbank.info('Demo-Mappen werden erzeugt', { anzahl: o.anzahl, dokumente: !!o.dokumente, startwert: o.startwert ?? null });
      const titel = t('meldungen.routen.demo-mappen-erzeugen', { zahl: o.anzahl.toLocaleString(gebietsschema()), wert: o.dokumente ? t('meldungen.routen.mit-dokumenten') : '' });
      return ok(await dienst.auftraege.angemeldet(dienst.auftraege.starte('demo-erzeugen', titel, async (f) => {
        const r = await dienst.kern.ohneEreignisse(() => erzeugeDemo(dienst, o, benutzerId, f, demoPlatz));
        L.werkbank.info('Demo-Daten erzeugt', { mappen: r.gesamt, dokumente: r.dokumente?.anzahl ?? 0, bytes: r.dokumente?.bytes ?? 0, dauerMs: r.dauerMs, startwert: r.startwert, abgebrochen: r.abgebrochen ?? null });
        return r;
      }, demoPhasen(!!o.dokumente))), 202);
    } },
    // Abschätzung vor dem Start (#248): Mappen, Dokumente, Größe, Seiten für die Texterkennung, freier Platz.
    { methode: 'POST', pfad: '/api/werkbank/demo/abschaetzung', zugang: 'admin', lesend: true, handler: async (a) => ok(await schaetzeDemo(dienst, pruefeDemoOptionen(b(a)), demoPlatz)) },
    { methode: 'DELETE', pfad: '/api/werkbank/demo', zugang: 'admin', handler: async () =>
      ok(await dienst.auftraege.angemeldet(dienst.auftraege.starte('demo-entfernen', 'Demo-Mappen entfernen', (f) => dienst.kern.ohneEreignisse(() => dienst.entferneDemo(f)), [{ key: 'mappen', name: 'Demo-Mappen entfernen', einheit: 'Mappen' }])), 202) },
    { methode: 'GET', pfad: '/api/werkbank/auftrag', zugang: 'admin', handler: async () => ok(await dienst.auftraege.stand()) },
    // Abbrechen (#458) – nur Aufträge, die das erlauben (z. B. „Volltext neu erzeugen“).
    { methode: 'POST', pfad: '/api/werkbank/auftrag/abbrechen', zugang: 'admin', handler: async (a) => ok(await dienst.auftraege.abbrechen((b(a) as { id?: unknown }).id)) },
  ];
}

export function typenArchivRouten(k: RoutenKontext): Route[] {
  const { dienst, zg } = k;
  return [
    /* ---------- Archivmodus (#212) ---------- */
    { methode: 'POST', pfad: '/api/werkbank/archiv/vorschau', zugang: 'admin', lesend: true, handler: async (a) => ok(await dienst.mappenArchiv.archivVorschau(String((a.body as { typId?: unknown })?.typId ?? ''), (a.body as { archiv?: unknown })?.archiv)) },
    { methode: 'GET', pfad: '/api/werkbank/darf-weg', zugang: 'admin', handler: async () => ok(await dienst.mappenArchiv.darfWeg()) },
    { methode: 'POST', pfad: '/api/werkbank/wartung/dateien', zugang: 'admin', handler: async (a) => ok(await dienst.auftraege.angemeldet(dienst.mappenArchiv.pruefeDateien(ich(a).email)), 202) },
    // Nur Vorhandensein (#877), ohne zu lesen: für den Lasttest („Dokumente ohne Datei: n“) und Skripte.
    { methode: 'GET', pfad: '/api/werkbank/wartung/dateien/fehlend', zugang: 'admin', handler: async () => ok(await dienst.dateienFehlen.dokumenteOhneDatei()) },
    /* ---------- Auswahlfilter am Referenzfeld (#172, #173) ---------- */
    { methode: 'POST', pfad: '/api/mappen/auswahl-pruefen', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.mappenEingaben.auswahlPruefen(a.body, ich(a).id, await zg(a))) },
    // Folgt aus (#886): was aus den gewählten Quellen folgt – die Oberfläche füllt damit leere Felder und fragt bei Abweichung.
    { methode: 'POST', pfad: '/api/mappen/folgen', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.mappenEingaben.folgen(a.body, await zg(a))) },
    // Beim Auswählen übernehmen (#1037): Werte der gewählten Mappe als Vorschlag für leere Felder – nur, was die Person lesen darf.
    { methode: 'POST', pfad: '/api/mappen/vorbelegen', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.mappenEingaben.vorbelegen(a.body, await zg(a))) },
    { methode: 'POST', pfad: '/api/werkbank/auswahlfilter/zaehlen', zugang: 'admin', lesend: true, handler: async (a) => ok(await dienst.mappenEingaben.zaehleAuswahl(a.body, ich(a).id)) },
  ];
}

export function berechtigungenRouten(k: RoutenKontext): Route[] {
  const { dienst } = k;
  return [
    /* ---------- Berechtigungen (#123, #125) ---------- */
    { methode: 'GET', pfad: '/api/werkbank/berechtigungen', zugang: 'admin', handler: async () => ok(await dienst.berechtigungen.berechtigungenListe()) },
    { methode: 'PUT', pfad: '/api/werkbank/berechtigungen/:typId', zugang: 'admin', handler: async (a) => {
      const r = await dienst.berechtigungen.setzeBerechtigungen(a.params.typId, b(a).berechtigungen, b(a).bestaetigt === true);
      return ok({ typ: r.typ, niemand: r.niemand });
    } },
    // Pakete am Mappentyp (#686): welche Pakete Mappen dieses Typs lesen dürften, und einzelnen den Typ verwehren.
    { methode: 'GET', pfad: '/api/werkbank/berechtigungen/:typId/pakete', zugang: 'admin', handler: async (a) => ok(await dienst.typpakete.paketeAmTyp(a.params.typId)) },
    { methode: 'PUT', pfad: '/api/werkbank/berechtigungen/:typId/pakete/:paketId', zugang: 'admin', handler: async (a) => {
      await dienst.typpakete.setzePaketVerwehrt(a.params.typId, a.params.paketId, b(a).verwehrt === true, ich(a).email);
      return ok(await dienst.typpakete.paketeAmTyp(a.params.typId));
    } },
    // KI-Dienste (#796): welche Mappentypen an KI-Pakete gehen dürfen; neue erst nach Zulassung.
    { methode: 'GET', pfad: '/api/werkbank/ki-typen', zugang: 'admin', handler: async () => ok(await dienst.ki.kiUebersicht()) },
    { methode: 'PUT', pfad: '/api/werkbank/ki-typen/:typId', zugang: 'admin', handler: async (a) => ok(await dienst.ki.setzeKiTyp(a.params.typId, b(a).zugelassen === true, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/berechtigungen/:typId/kopieren', zugang: 'admin', handler: async (a) => {
      const r = await dienst.berechtigungen.kopiereRegel(a.params.typId, String(b(a).regelId ?? ''), b(a).ziele);
      L.werkbank.info('Regel kopiert', { typ: a.params.typId, regel: String(b(a).regelId ?? ''), kopiert: r.kopiert, ausgelassen: r.ausgelassen, von: ich(a).email });
      return ok(r);
    } },
    { methode: 'POST', pfad: '/api/werkbank/berechtigungen/testlauf', zugang: 'admin', lesend: true, handler: async (a) => ok(await dienst.berechtigungen.testlauf(b(a))) },
    { methode: 'POST', pfad: '/api/werkbank/sichten/testlauf', zugang: 'admin', lesend: true, handler: async (a) => ok(await dienst.sichtenVerwaltung.sichtTestlauf(b(a))) },
    { methode: 'GET', pfad: '/api/werkbank/berechtigungen/sicht/:benutzerId', zugang: 'admin', handler: async (a) => ok(await dienst.rechtepruefung.wasSieht(a.params.benutzerId)) },
  ];
}
