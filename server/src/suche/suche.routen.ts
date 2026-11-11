/**
 * Suche (#960: aus routen.ts): Vektoren, Sucheinstellungen, Erkennung und „Frag deine Ablage“.
 */
import { PassThrough } from 'node:stream';
import { Fachfehler } from '../fehler';
import { t } from '../sprache';
import { ok, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../routen';

export function sucheRouten(k: RoutenKontext): Route[] {
  const { dienst, x, zg } = k;
  return [
    // Vektoren (#442): Stand der Berechnung, Einstellung „Ähnliche Treffer in der Suche“, neu berechnen.
    // Suche (#356): Tippfehler an/aus, gleichbedeutende Wörter, Wörterverzeichnis.
    { methode: 'GET', pfad: '/api/werkbank/suche', zugang: 'admin', handler: async () => ok(await dienst.suche.sucheStand()) },
    { methode: 'PUT', pfad: '/api/werkbank/suche', zugang: 'admin', handler: async (a) => ok(await dienst.suche.setzeSuche(a.body, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/suche/synonyme', zugang: 'admin', handler: async (a) => ok(await dienst.suche.legeSynonymAn(a.body, ich(a).email)) },
    { methode: 'PUT', pfad: '/api/werkbank/suche/synonyme/:id', zugang: 'admin', handler: async (a) => ok(await dienst.suche.aendereSynonym(a.params.id, a.body, ich(a).email)) },
    { methode: 'DELETE', pfad: '/api/werkbank/suche/synonyme/:id', zugang: 'admin', handler: async (a) => ok(await dienst.suche.loescheSynonym(a.params.id, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/suche/woerter', zugang: 'admin', handler: async (a) => ok(await dienst.suche.woerterNeu(ich(a).email)) },
    { methode: 'GET', pfad: '/api/werkbank/vektoren', zugang: 'admin', handler: async () => ok(await dienst.suche.vektorStand()) },
    // „Aus Dokument ausfüllen“ per Paket (#511): Standard-Erkennung (eingebaut oder Paket mit dms:erkennen).
    { methode: 'GET', pfad: '/api/werkbank/erkennung', zugang: 'admin', handler: async () => ok(await dienst.erkennung.engineStand()) },
    { methode: 'PUT', pfad: '/api/werkbank/erkennung', zugang: 'admin', handler: async (a) => ok(await dienst.erkennung.setzeStandard(a.body)) },
    // „Frag deine Ablage“ (#444): Höchstmenge je Frage (Ausschnitte, Zeichen).
    { methode: 'GET', pfad: '/api/werkbank/fragen', zugang: 'admin', handler: async () => ok(await dienst.fragen.stand()) },
    { methode: 'PUT', pfad: '/api/werkbank/fragen', zugang: 'admin', handler: async (a) => { await dienst.fragen.setzeGrenzen(a.body); return ok(await dienst.fragen.stand()); } },
    { methode: 'GET', pfad: '/api/fragen', zugang: 'angemeldet', handler: async () => { const s = await dienst.fragen.stand(); return ok({ verfuegbar: s.verfuegbar, paket: s.paket }); } },
    // Frage stellen: Antwort als NDJSON-Strom (Ausschnitte, Teile, fertig/fehler). Inhalt steht nirgends im Protokoll.
    { methode: 'POST', pfad: '/api/fragen', zugang: 'angemeldet', handler: async (a) => {
      const z = await zg(a);
      const strom = new PassThrough();
      const zeile = (x: unknown) => { if (!strom.destroyed && !strom.writableEnded) strom.write(`${JSON.stringify(x)}\n`); };
      // Fehler vor dem ersten Ausschnitt (keine Frage, kein Paket, schon eine Frage offen) kommen als normale Antwort.
      let erste: (() => void) | null = null;
      const bereit = new Promise<void>((ok) => { erste = ok; });
      const lauf = dienst.fragen.frage(z, a.body, (x) => { zeile(x); erste?.(); erste = null; });
      await Promise.race([bereit, lauf]);
      void lauf.catch(() => {}).finally(() => { if (!strom.destroyed) strom.end(); });
      return { strom };
    } },
    { methode: 'PUT', pfad: '/api/werkbank/vektoren', zugang: 'admin', handler: async (a) => { await dienst.suche.setzeVektorEinstellung(a.body); return ok(await dienst.suche.vektorStand()); } },
    { methode: 'POST', pfad: '/api/werkbank/vektoren/neu', zugang: 'admin', handler: async () => {
      if (!x.paketlaeufer) throw new Fachfehler(404, t('meldungen.routen.pakete-mit-code-laufen'));
      try { return ok(await x.paketlaeufer.vektorenNeu()); } catch (e) { throw e instanceof Fachfehler ? e : new Fachfehler(409, (e as Error).message); }
    } },
  ];
}
