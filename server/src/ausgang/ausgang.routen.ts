/**
 * Export (#960: aus routen.ts): Vollexport und persönlicher Export.
 */
import { Fachfehler } from '../fehler';
import { exportDateien, exporteIn, exportOrdner, freierPlatz, loescheExport, pruefeExport, vollexport, VOLLEXPORT_PHASEN, type ExportOptionen } from '../vollexport';
import { oeffneStrom } from '../dateispeicher';
import { EXPORT_TAGE } from '../../../shared/src/auskunft';
import { persoenlicherOrdner, umzugGesehen, umzugHinweis } from '../exportordner';
import { t } from '../sprache';
import { zipGroesse, zipStrom, ZIP_MAX, type ZipEintrag } from '../zip';
import { eigeneVersion } from '../system';
import { protokoll } from '../protokoll';
import { MB, PLATZ_RESERVE } from '../grenzen';
import { L, ok, leer, ich, kontaktVorschlaege } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../routen';

export function exportRouten(k: RoutenKontext): Route[] {
  const { dienst, konten, x, zg, EXPORT_LAEUFT, EXPORT_FEHLER, eigenerExport, exportZiel, danachLoeschen } = k;
  return [
    /* ---------- Vollexport (#254) ---------- */
    { methode: 'GET', pfad: '/api/werkbank/export', zugang: 'admin', handler: async () => {
      const ziel = exportZiel();
      const typen = await dienst.mappentypen.listeTypen();
      return ok({ ordner: ziel, tage: EXPORT_TAGE, imSicherungsordner: !!x.exporte?.imSicherungsordner, volume: x.exporte?.volume ?? null, umzug: await umzugHinweis(dienst.kern.einstellungen), exporte: await exporteIn(ziel), abschaetzung: await dienst.auskunftZustellen.exportAbschaetzung(), frei: await freierPlatz(ziel), kontakte: kontaktVorschlaege(typen), persoenlich: await dienst.auskunftZustellen.persoenlicherExportErlaubt() });
    } },
    { methode: 'POST', pfad: '/api/werkbank/export', zugang: 'admin', handler: async (a) => {
      const e = (a.body ?? {}) as { passwoerter?: unknown; passwoerterBestaetigt?: unknown; protokolle?: unknown; kontakte?: unknown };
      if (e.passwoerter === true && e.passwoerterBestaetigt !== true) throw new Fachfehler(422, t('meldungen.routen.passwoerter-im-klartext-nur'));
      const ziel = exportZiel();
      const s = await dienst.auskunftZustellen.exportAbschaetzung();
      const frei = await freierPlatz(ziel);
      // Grob: Dokumente plus ein Zuschlag für Tabellen und PDFs.
      if (frei !== null && frei < s.bytes * 1.1 + PLATZ_RESERVE) throw new Fachfehler(507, t('meldungen.routen.zu-wenig-platz-am', { round: Math.round(frei / MB), round2: Math.round((s.bytes * 1.1 + PLATZ_RESERVE) / MB) }));
      const kontakte = e.kontakte && typeof e.kontakte === 'object' ? e.kontakte as ExportOptionen['kontakte'] : undefined;
      const quelle = dienst.vollexport.vollexportQuelle({
        mandant: (await x.mandantName?.()) ?? '', version: eigeneVersion(),
        benutzer: () => konten.exportDaten(), designs: async () => (x.designs ? (await x.designs.liste()).designs : []),
        protokoll: () => protokoll.eintraege({}),
        // Region (#726): Land, Bundesland, Zeitzone als struktur/region.json.
        ...(x.region ? { region: () => x.region!.lies() } : {}),
        // Merkmale der Ablage (#1032) als struktur/merkmale.json.
        merkmale: () => dienst.werkbank.merkmale(),
        // Eigene Organisation (#995): Verweis, Rollen und Notizen als struktur/organisation.json (die Angaben stehen in der Mappe).
        organisation: () => dienst.organisation.einstellung(),
      });
      const von = ich(a).email;
      if (e.passwoerter === true) L.werkbank.warn('Vollexport mit Passwörtern im Klartext gestartet', { von });
      else L.werkbank.info('Vollexport gestartet', { von, protokolle: e.protokolle === true });
      return ok(await dienst.auftraege.angemeldet(dienst.auftraege.starte('vollexport', 'Vollexport', async (f) => {
        const r = await vollexport(quelle, ziel, { passwoerter: e.passwoerter === true, protokolle: e.protokolle === true, kontakte }, f);
        L.werkbank.info('Vollexport fertig', { von, name: r.name, dateien: r.dateien, mb: Math.round(r.bytes / MB), mappen: r.mappen });
        return r;
      }, VOLLEXPORT_PHASEN)), 202);
    } },
    // #797: Hinweis „Exporte aus dem Sicherungsordner verschoben“ gelesen.
    { methode: 'POST', pfad: '/api/werkbank/export/umzug-gesehen', zugang: 'admin', handler: async () => { await umzugGesehen(dienst.kern.einstellungen); return ok(null); } },
    { methode: 'POST', pfad: '/api/werkbank/export/:name/pruefen', zugang: 'admin', handler: async (a) => ok(await pruefeExport(exportOrdner(exportZiel(), a.params.name))) },
    { methode: 'DELETE', pfad: '/api/werkbank/export/:name', zugang: 'admin', handler: async (a) => {
      await loescheExport(exportOrdner(exportZiel(), a.params.name));
      L.werkbank.info('Vollexport gelöscht', { name: a.params.name, von: ich(a).email });
      return leer;
    } },
    { methode: 'GET', pfad: '/api/werkbank/export/:name/zip', zugang: 'admin', handler: async (a) => {
      const ordner = exportOrdner(exportZiel(), a.params.name);
      const dateien = await exportDateien(ordner).catch(() => { throw new Fachfehler(404, t('meldungen.routen.diesen-export-gibt-es')); });
      const eintraege: ZipEintrag[] = dateien.map((d) => ({ name: `${a.params.name}/${d.name}`, groesse: d.groesse, inhalt: () => oeffneStrom(d.pfad) }));
      const groesse = zipGroesse(eintraege);
      if (groesse > ZIP_MAX) throw new Fachfehler(422, t('meldungen.routen.der-export-ist-groesser'));
      L.werkbank.info('Vollexport heruntergeladen', { name: a.params.name, von: ich(a).email });
      const strom = danachLoeschen(zipStrom(eintraege), ordner, () => L.werkbank.info('Vollexport nach dem Herunterladen gelöscht', { name: a.params.name }));
      return { datei: { inhalt: strom, name: `${a.params.name}.zip`, mime: 'application/zip', anzeigen: false, groesse, koepfe: { 'cache-control': 'no-store' } } };
    } },
    /* ---------- Persönlicher Export (#255) ---------- */
    { methode: 'PUT', pfad: '/api/werkbank/export/persoenlich', zugang: 'admin', handler: async (a) => ok({ erlaubt: await dienst.auskunftZustellen.setzePersoenlicherExport((a.body as { erlaubt?: unknown })?.erlaubt, ich(a).email) }) },
    { methode: 'GET', pfad: '/api/konto/export', zugang: 'angemeldet', handler: async (a) => {
      const id = ich(a).id;
      const ordner = persoenlicherOrdner(exportZiel(), id);
      const fertig = (await exporteIn(ordner))[0] ?? null;
      return ok({ erlaubt: await dienst.auskunftZustellen.persoenlicherExportErlaubt(), ...(await eigenerExport(id)), fertig });
    } },
    { methode: 'POST', pfad: '/api/konto/export', zugang: 'angemeldet', handler: async (a) => {
      if (!(await dienst.auskunftZustellen.persoenlicherExportErlaubt())) throw new Fachfehler(403, t('meldungen.routen.der-persoenliche-export-ist'));
      const e = (a.body ?? {}) as { passwoerter?: unknown; passwoerterBestaetigt?: unknown };
      if (e.passwoerter === true && e.passwoerterBestaetigt !== true) throw new Fachfehler(422, t('meldungen.routen.passwoerter-im-klartext-nur'));
      const id = ich(a).id;
      if ((await eigenerExport(id)).laeuft) throw new Fachfehler(409, t('meldungen.routen.dein-export-laeuft-schon'));
      if (a.sitzungsDaten?.vertretungId) throw new Fachfehler(403, t('meldungen.routen.waehrend-jemand-in-diesem'));
      const ziel = persoenlicherOrdner(exportZiel(), id);
      const quelle = await dienst.vollexport.persoenlicheQuelle(await zg(a), { mandant: (await x.mandantName?.()) ?? '', version: eigeneVersion(), ich: await konten.exportDatenVon(id) });
      if (!(await dienst.kurzzustand.belege(EXPORT_LAEUFT, id, 12 * 3600_000))) throw new Fachfehler(409, t('meldungen.routen.dein-export-laeuft-schon'));
      await dienst.kurzzustand.loesche(EXPORT_FEHLER, id);
      const zustand = { fehler: null as string | null };
      L.konto[e.passwoerter === true ? 'warn' : 'info'](e.passwoerter === true ? t('meldungen.routen.meine-daten-exportieren-mit') : t('meldungen.routen.meine-daten-exportieren-gestartet'), {});
      void (async () => {
        try {
          for (const alt of await exporteIn(ziel)) await loescheExport(exportOrdner(ziel, alt.name));
          const r = await vollexport(quelle, ziel, { passwoerter: e.passwoerter === true });
          L.konto.info('„Meine Daten exportieren“ fertig', { benutzer: id, dateien: r.dateien, mb: Math.round(r.bytes / MB) });
        } catch (x2) { zustand.fehler = (x2 as Error).message; L.konto.error('„Meine Daten exportieren“ fehlgeschlagen', { benutzer: id, fehler: zustand.fehler }); }
        finally {
          if (zustand.fehler) await dienst.kurzzustand.setze(EXPORT_FEHLER, id, zustand.fehler, Date.now() + 7 * 24 * 3600_000).catch(() => {});
          await dienst.kurzzustand.loesche(EXPORT_LAEUFT, id).catch(() => {});
        }
      })();
      return ok({ laeuft: true }, 202);
    } },
    { methode: 'GET', pfad: '/api/konto/export/zip', zugang: 'angemeldet', handler: async (a) => {
      const ziel = persoenlicherOrdner(exportZiel(), ich(a).id);
      const fertig = (await exporteIn(ziel))[0];
      if (!fertig) throw new Fachfehler(404, t('meldungen.routen.es-gibt-noch-keinen-2'));
      const ordner = exportOrdner(ziel, fertig.name);
      const dateien = await exportDateien(ordner);
      const eintraege: ZipEintrag[] = dateien.map((d) => ({ name: `${fertig.name}/${d.name}`, groesse: d.groesse, inhalt: () => oeffneStrom(d.pfad) }));
      const groesse = zipGroesse(eintraege);
      if (groesse > ZIP_MAX) throw new Fachfehler(422, t('meldungen.routen.dein-export-ist-groesser'));
      L.konto.info('„Meine Daten exportieren“ heruntergeladen', {});
      const strom = danachLoeschen(zipStrom(eintraege), ordner, () => L.konto.info('„Meine Daten exportieren“ nach dem Herunterladen gelöscht', {}));
      return { datei: { inhalt: strom, name: `${fertig.name}.zip`, mime: 'application/zip', anzeigen: false, groesse, koepfe: { 'cache-control': 'no-store' } } };
    } },
  ];
}
