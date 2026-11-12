/**
 * Automatisierungen (#960: aus routen.ts).
 */
import { darfBereich } from '../../../shared/src/verwaltungsrecht';
import { ok, leer, b, ich } from '../http/routen-hilfen';
import { Fachfehler } from '../fehler';
import { AUFRUF_KOERPER_MAX } from '../grenzen';
import { t } from '../sprache';
import type { RoutenKontext } from '../http/routen-kontext';
import { AUFRUF_SIGNATUR_KOPF, AUFRUF_ZEIT_KOPF, laufFuer } from '../../../shared/src/automatisierung';
import type { Anfrage, Route } from '../routen';

export function automatisierungRouten(k: RoutenKontext): Route[] {
  const { autos } = k;
  // Werkbank-Karten (#677): nur mit dem Recht am jeweiligen Bereich einrichten (Sicherung, Gemeldete Fehler, Protokoll, Systemzustand);
  // im Verlauf ohne Text bzw. Konto aus „Protokoll“ und „Gemeldete Fehler“, solange man den Bereich nicht verwaltet (laufFuer).
  const darf = (a: Anfrage) => (bereich: string) => darfBereich(ich(a), bereich);
  return [
    // Eingangsordner (#195): nur sichtbar, wenn /eingang eingebunden ist.
    // WebDAV-Laufwerk (#346): an/aus (Standard aus), Adresse, Stand und letzte Zugriffe.
    // Automatisierungen (#674): nur Administratoren legen an und ändern; ausgeführt wird unter dem Systemkonto.
    { methode: 'GET', pfad: '/api/werkbank/automatisierungen', zugang: 'admin', handler: async () => ok({ ...await autos().uebersicht(), kontext: await autos().kontext(), umgezogen: await autos().umzug() }) },
    // #712: Hinweis „Erinnerungen sind umgezogen“ gelesen.
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/umzug-gesehen', zugang: 'admin', handler: async () => { await autos().umzugGesehen(); return ok(null); } },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen', zugang: 'admin', handler: async (a) => ok(await autos().lege(a.body, ich(a).id, 'eigen', darf(a)), 201) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/wiederholen', zugang: 'admin', handler: async () => ok(await autos().wiederholeAlle()) },
    { methode: 'GET', pfad: '/api/werkbank/automatisierungen/laeufe/:id', zugang: 'admin', handler: async (a) => ok(await autos().lauf(a.params.id, darf(a))) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/laeufe/:id/wiederholen', zugang: 'admin', handler: async (a) => ok(laufFuer(await autos().wiederhole(a.params.id), darf(a))) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/laeufe/:id/nicht-wiederholen', zugang: 'admin', handler: async (a) => ok(await autos().nichtWiederholen({ laufId: a.params.id }, ich(a).id)) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/nicht-wiederholen', zugang: 'admin', handler: async (a) => ok(await autos().nichtWiederholen({}, ich(a).id)) },
    { methode: 'GET', pfad: '/api/werkbank/automatisierungen/:id', zugang: 'admin', handler: async (a) => ok(await autos().hole(a.params.id)) },
    { methode: 'PUT', pfad: '/api/werkbank/automatisierungen/:id', zugang: 'admin', handler: async (a) => ok(await autos().aendere(a.params.id, a.body, ich(a).id, darf(a))) },
    { methode: 'DELETE', pfad: '/api/werkbank/automatisierungen/:id', zugang: 'admin', handler: async (a) => { await autos().loesche(a.params.id); return leer; } },
    { methode: 'PUT', pfad: '/api/werkbank/automatisierungen/:id/aktiv', zugang: 'admin', handler: async (a) => ok(await autos().schalte(a.params.id, (b(a) as { aktiv?: unknown }).aktiv === true, ich(a).id)) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/:id/kopieren', zugang: 'admin', handler: async (a) => ok(await autos().kopiere(a.params.id, ich(a).id, darf(a)), 201) },
    { methode: 'GET', pfad: '/api/werkbank/automatisierungen/:id/laeufe', zugang: 'admin', handler: async (a) => ok(await autos().laeufe(a.params.id, Number((a.query as { anzahl?: unknown }).anzahl) || 50, darf(a))) },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/:id/wiederholen', zugang: 'admin', handler: async (a) => ok(await autos().wiederholeAlle(a.params.id)) },
    { methode: 'GET', pfad: '/api/werkbank/automatisierungen/:id/testmappen', zugang: 'admin', handler: async (a) => ok(await autos().testmappen(a.params.id, (a.query as { suche?: unknown }).suche)) },
    // Fassungen (#1006): fassungen/fassungen.routen.ts, für alle Gegenstände gleich.
    // Aufruf von außen (#679): Adresse anlegen bzw. erneuern oder neues Geheimnis (frische Anmeldung, verwaltungsbereiche.ts) –
    // das Geheimnis steht nur in dieser Antwort; Adresse entfernen.
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/:id/aufruf', zugang: 'admin', handler: async (a) => ok(await autos().aufrufAnlegen(a.params.id, (b(a) as { was?: unknown }).was, ich(a).id)) },
    { methode: 'DELETE', pfad: '/api/werkbank/automatisierungen/:id/aufruf', zugang: 'admin', handler: async (a) => { await autos().aufrufEntfernen(a.params.id); return leer; } },
    { methode: 'POST', pfad: '/api/werkbank/automatisierungen/:id/wiedergeben', zugang: 'admin', handler: async (a) => {
      const e = b(a) as { mappeId?: unknown; trocken?: unknown };
      return ok(laufFuer(await autos().wiedergeben(a.params.id, e.mappeId, e.trocken !== false), darf(a)));
    } },
    /*
     * Aufruf von außen (#679): ohne Anmeldung, nur mit Signatur über Zeitstempel und Rumpf (Bytes, wie sie ankamen).
     * Antwort nur „angenommen“ (202) – sonst immer dieselbe Ablehnung (401), gleich ob es die Adresse gibt; Bremse 429.
     */
    { methode: 'POST', pfad: '/api/aufruf/:kennung', zugang: 'offen', rohKoerper: AUFRUF_KOERPER_MAX, handler: async (a) => {
      const r = await autos().aufrufAnnehmen({
        kennung: a.params.kennung ?? '', zeit: a.kopf?.(AUFRUF_ZEIT_KOPF), signatur: a.kopf?.(AUFRUF_SIGNATUR_KOPF),
        rumpf: Buffer.isBuffer(a.body) ? a.body : Buffer.alloc(0), ip: a.ip,
      });
      if (r.art === 'bremse') throw new Fachfehler(429, t('meldungen.aufruf.bremse'));
      if (r.art === 'inhalt') throw new Fachfehler(422, t('meldungen.aufruf.inhalt'));
      if (r.art !== 'angenommen') throw new Fachfehler(401, t('meldungen.aufruf.abgelehnt'));
      return ok({ ergebnis: t('meldungen.aufruf.angenommen') }, 202);
    } },
  ];
}
