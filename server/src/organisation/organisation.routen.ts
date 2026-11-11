/**
 * Eigene Organisation (#995): Werkbank → Benutzer und Sicherheit → Eigene Organisation. Nur im Verwaltungsmodus mit dem
 * Bereich „organisation“ (verwaltungsbereiche.ts). Die Angaben selbst ändert man in der Ablage.
 */
import { L, ok, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../routen';

export function organisationRouten(k: RoutenKontext): Route[] {
  const { dienst, zg } = k;
  return [
    { methode: 'GET', pfad: '/api/werkbank/organisation', zugang: 'admin', handler: async () => ok(await dienst.organisation.stand()) },
    { methode: 'PUT', pfad: '/api/werkbank/organisation', zugang: 'admin', handler: async (a) => ok(await dienst.organisation.setze(a.body, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/organisation/uebernehmen', zugang: 'admin', handler: async (a) => {
      const r = await dienst.organisation.uebernehmen(await zg(a), ich(a).id);
      L.datenschutz.info('Eigene Organisation aus der bisherigen Angabe angelegt', { von: ich(a).email });
      return ok(r, 201);
    } },
    // Einrichtungsassistent (#1045): „Deine Organisation“ anlegen – nur, solange es keine eigene gibt.
    { methode: 'POST', pfad: '/api/werkbank/organisation/anlegen', zugang: 'admin', handler: async (a) => ok(await dienst.organisation.anlegen(a.body, await zg(a), ich(a).id), 201) },
  ];
}
