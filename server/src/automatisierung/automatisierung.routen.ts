/**
 * Automatisierungen (#960: aus routen.ts).
 */
import { ok, leer, b, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../routen';

export function automatisierungRouten(k: RoutenKontext): Route[] {
  const { autos } = k;
  return [
    // Eingangsordner (#195): nur sichtbar, wenn /eingang eingebunden ist.
    // WebDAV-Laufwerk (#346): an/aus (Standard aus), Adresse, Stand und letzte Zugriffe.
    // Automatisierungen (#674): nur Administratoren legen an und ändern; ausgeführt wird unter dem Systemkonto.
    { methode: 'GET', pfad: '/api/werkbank/automatisierungen', zugang: 'admin', handler: async () => ok({ ...await autos().uebersicht(), kontext: await autos().kontext(), umgezogen: await autos().umzug() }) },
    // #712: Hinweis „Erinnerungen sind umgezogen“ gelesen.
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/umzug-gesehen', zugang: 'admin', handler: async () => { await autos().umzugGesehen(); return ok(null); } },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen', zugang: 'admin', handler: async (a) => ok(await autos().lege(a.body, ich(a).id), 201) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/wiederholen', zugang: 'admin', handler: async () => ok(await autos().wiederholeAlle()) },
    { methode: 'GET', pfad: '/api/werkbank/automatisierungen/laeufe/:id', zugang: 'admin', handler: async (a) => ok(await autos().lauf(a.params.id)) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/laeufe/:id/wiederholen', zugang: 'admin', handler: async (a) => ok(await autos().wiederhole(a.params.id)) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/laeufe/:id/nicht-wiederholen', zugang: 'admin', handler: async (a) => ok(await autos().nichtWiederholen({ laufId: a.params.id }, ich(a).id)) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/nicht-wiederholen', zugang: 'admin', handler: async (a) => ok(await autos().nichtWiederholen({}, ich(a).id)) },
    { methode: 'GET', pfad: '/api/werkbank/automatisierungen/:id', zugang: 'admin', handler: async (a) => ok(await autos().hole(a.params.id)) },
    { methode: 'PUT', pfad: '/api/werkbank/automatisierungen/:id', zugang: 'admin', handler: async (a) => ok(await autos().aendere(a.params.id, a.body, ich(a).id)) },
    { methode: 'DELETE', pfad: '/api/werkbank/automatisierungen/:id', zugang: 'admin', handler: async (a) => { await autos().loesche(a.params.id); return leer; } },
    { methode: 'PUT', pfad: '/api/werkbank/automatisierungen/:id/aktiv', zugang: 'admin', handler: async (a) => ok(await autos().schalte(a.params.id, (b(a) as { aktiv?: unknown }).aktiv === true, ich(a).id)) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/:id/kopieren', zugang: 'admin', handler: async (a) => ok(await autos().kopiere(a.params.id, ich(a).id), 201) },
    { methode: 'GET', pfad: '/api/werkbank/automatisierungen/:id/laeufe', zugang: 'admin', handler: async (a) => ok(await autos().laeufe(a.params.id, Number((a.query as { anzahl?: unknown }).anzahl) || 50)) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/:id/wiederholen', zugang: 'admin', handler: async (a) => ok(await autos().wiederholeAlle(a.params.id)) },
    { methode: 'GET', pfad: '/api/werkbank/automatisierungen/:id/testmappen', zugang: 'admin', handler: async (a) => ok(await autos().testmappen(a.params.id, (a.query as { suche?: unknown }).suche)) },
    // Fassungen (#1006): fassungen/fassungen.routen.ts, für alle Gegenstände gleich.
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/:id/wiedergeben', zugang: 'admin', handler: async (a) => {
      const e = b(a) as { mappeId?: unknown; trocken?: unknown };
      return ok(await autos().wiedergeben(a.params.id, e.mappeId, e.trocken !== false));
    } },
  ];
}
