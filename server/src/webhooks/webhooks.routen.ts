/**
 * Webhooks (#960: aus routen.ts): Übersicht in der Werkbank und eigene im Profil.
 */
import { ok, leer, b, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../routen';

export function webhooksRouten(k: RoutenKontext): Route[] {
  const { webhooks } = k;
  return [
    { methode: 'GET', pfad: '/api/werkbank/webhooks', zugang: 'admin', handler: async () => ok(await webhooks().uebersicht()) },
    { methode: 'PUT', pfad: '/api/werkbank/webhooks/ziele', zugang: 'admin', handler: async (a) => ok({ ziele: await webhooks().setzeZiele((b(a) as { ziele?: unknown }).ziele, ich(a).email) }) },
    { methode: 'PUT', pfad: '/api/werkbank/webhooks/:id', zugang: 'admin', handler: async (a) => {
      await webhooks().schalteWerkbank(a.params.id, (b(a) as { aktiv?: unknown }).aktiv === true, ich(a).email);
      return ok(await webhooks().uebersicht());
    } },
    { methode: 'DELETE', pfad: '/api/werkbank/webhooks/:id', zugang: 'admin', handler: async (a) => { await webhooks().loescheWerkbank(a.params.id, ich(a).email); return leer; } },
  ];
}

export function kontoWebhooksRouten(k: RoutenKontext): Route[] {
  const { webhooks } = k;
  return [
    /* ---------- Webhooks im eigenen Profil (#627) ---------- */
    { methode: 'GET', pfad: '/api/konto/webhooks', zugang: 'angemeldet', handler: async (a) => ok({ webhooks: await webhooks().liste(ich(a)), ziele: await webhooks().ziele() }) },
    { methode: 'POST', pfad: '/api/konto/webhooks', zugang: 'angemeldet', handler: async (a) => ok(await webhooks().lege(ich(a), a.body), 201) },
    { methode: 'PUT', pfad: '/api/konto/webhooks/:id', zugang: 'angemeldet', handler: async (a) => ok(await webhooks().aendere(ich(a), a.params.id, a.body)) },
    { methode: 'DELETE', pfad: '/api/konto/webhooks/:id', zugang: 'angemeldet', handler: async (a) => { await webhooks().loesche(ich(a), a.params.id); return leer; } },
    { methode: 'POST', pfad: '/api/konto/webhooks/:id/probe', zugang: 'angemeldet', handler: async (a) => ok(await webhooks().probe(ich(a), a.params.id)) },
    { methode: 'POST', pfad: '/api/konto/webhooks/:id/geheimnis', zugang: 'angemeldet', handler: async (a) => ok(await webhooks().erneuereGeheimnis(ich(a), a.params.id)) },
    { methode: 'GET', pfad: '/api/konto/webhooks/:id/verlauf', zugang: 'angemeldet', handler: async (a) => ok(await webhooks().verlauf(ich(a), a.params.id)) },
  ];
}
