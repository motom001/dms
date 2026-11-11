/**
 * Wartung (#960: aus routen.ts): Nummernkreise, Datenpflege (Nummern, Absender, Formate, Volltext, Vorschaubilder) und
 * Wartungsmodus.
 */
import { ok, b, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../routen';

export function wartungRouten(k: RoutenKontext): Route[] {
  const { dienst, konten, wartung } = k;
  return [
    { methode: 'GET', pfad: '/api/werkbank/nummernkreise', zugang: 'admin', handler: async () => ok(await dienst.nummernkreise.listeNummernkreise()) },
    { methode: 'POST', pfad: '/api/werkbank/nummernkreise', zugang: 'admin', handler: async (a) => {
      await dienst.nummernkreise.speichereNummernkreis({ ...(a.body as object), neu: true }, ich(a).email);
      return ok(await dienst.nummernkreise.listeNummernkreise(), 201);
    } },
    { methode: 'PUT', pfad: '/api/werkbank/nummernkreise/:schluessel', zugang: 'admin', handler: async (a) => {
      await dienst.nummernkreise.speichereNummernkreis({ ...(a.body as object), schluessel: a.params.schluessel, neu: false }, ich(a).email);
      return ok(await dienst.nummernkreise.listeNummernkreise());
    } },
    { methode: 'DELETE', pfad: '/api/werkbank/nummernkreise/:schluessel', zugang: 'admin', handler: async (a) => {
      await dienst.nummernkreise.loescheNummernkreis(a.params.schluessel, ich(a).email);
      return ok(await dienst.nummernkreise.listeNummernkreise());
    } },
    { methode: 'POST', pfad: '/api/werkbank/nummernkreise/:schluessel/zaehler', zugang: 'admin', handler: async (a) => {
      await dienst.nummernkreise.setzeZaehler(a.params.schluessel, a.body, ich(a).email);
      return ok(await dienst.nummernkreise.listeNummernkreise());
    } },
    { methode: 'GET', pfad: '/api/werkbank/wartung/nummern', zugang: 'admin', handler: async (a) => ok(await dienst.nummernkreise.nummernVorschau(a.query.typ ?? '', a.query.feld ?? '')) },
    { methode: 'POST', pfad: '/api/werkbank/wartung/nummern', zugang: 'admin', handler: async (a) =>
      ok(await dienst.auftraege.angemeldet(dienst.nummernkreise.nummernNachtragen(String((a.body as { typId?: unknown })?.typId ?? ''), String((a.body as { feldKey?: unknown })?.feldKey ?? ''), ich(a).email)), 202) },
    // Absender bereinigen (#494): Vorschau, dann nur die gewählten Posts.
    { methode: 'GET', pfad: '/api/werkbank/wartung/absender', zugang: 'admin', handler: async () => ok(await dienst.mappenTitel.absenderVorschau()) },
    // Angaben, die nicht zum Format passen (#535): je Mappentyp und Feld, mit Sprung zur Mappe.
    { methode: 'GET', pfad: '/api/werkbank/wartung/formate', zugang: 'admin', handler: async () => ok({ typen: await dienst.mappenEingaben.unpassendeFormate() }) },
    { methode: 'POST', pfad: '/api/werkbank/wartung/absender', zugang: 'admin', handler: async (a) =>
      ok(await dienst.mappenTitel.absenderBereinigen((a.body as { ids?: unknown })?.ids, { id: ich(a).id, email: ich(a).email })) },
    { methode: 'POST', pfad: '/api/werkbank/wartung/volltext', zugang: 'admin', handler: async () => ok({ eingereiht: await dienst.volltextNachholen() }) },
    // „Volltext neu erzeugen“ (#458): erst die Anzahl für die Rückfrage, dann als Auftrag mit Fortschritt (abbrechbar).
    { methode: 'GET', pfad: '/api/werkbank/wartung/volltext-neu', zugang: 'admin', handler: async (a) => ok({ ...(await dienst.volltextNeuAnzahl(a.query.umfang)), paket: await dienst.texterkennungPaket() }) },
    { methode: 'POST', pfad: '/api/werkbank/wartung/volltext-neu', zugang: 'admin', handler: async (a) => ok(await dienst.auftraege.angemeldet(dienst.volltextNeu((b(a) as { umfang?: unknown }).umfang, ich(a).email)), 202) },
    { methode: 'POST', pfad: '/api/werkbank/wartung/vorschau', zugang: 'admin', handler: async () => ok({ eingereiht: await dienst.vorschauNachholen() }) },

    /* ---------- Verschlüsselung (#39) ---------- */
    /* ---------- Wartungsmodus (#102) ---------- */
    { methode: 'GET', pfad: '/api/werkbank/wartung', zugang: 'admin', handler: async (a) => ok({
      ...wartung().stand, ...wartung().oeffentlich(), sitzungen: await konten.alleSitzungen(a.sitzungsDaten?.id),
    }) },
    { methode: 'POST', pfad: '/api/werkbank/wartung/ein', zugang: 'admin', handler: async (a) => ok(await wartung().einschalten(b(a), ich(a), a.sitzungsDaten?.id ?? null)) },
    { methode: 'POST', pfad: '/api/werkbank/wartung/jetzt', zugang: 'admin', handler: async (a) => ok(await wartung().jetztAktiv(ich(a), a.sitzungsDaten?.id ?? null)) },
    { methode: 'POST', pfad: '/api/werkbank/wartung/aus', zugang: 'admin', handler: async (a) => ok(await wartung().ausschalten(ich(a).email)) },
  ];
}
