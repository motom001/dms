/**
 * Quellen für Einrichtung und Nachweise (#1053) aus den Diensten der Routen. Hier wird schon schmal gemacht: Jede
 * Quelle gibt nur die Angaben weiter, die einrichtung.ts bzw. nachweise.ts ausdrücklich übernehmen.
 */
import { rechteZeilen, rechtePunkte } from '../../../shared/src/pakete';
import { istPerson } from '../../../shared/src/model';
import { AUSKUNFT_TAGE } from '../../../shared/src/auskunft';
import { eigeneVersion } from '../system';
import { nachweisjournal } from '../nachweisjournal';
import type { EinrichtungQuellen, NachweisQuellen } from './index';
import type { RoutenKontext } from '../http/routen-kontext';

const sicher = async <T>(f: () => Promise<T>, sonst: T): Promise<T> => { try { return await f(); } catch { return sonst; } };

export function einrichtungQuellen(k: RoutenKontext): EinrichtungQuellen {
  const { dienst, konten, x } = k;
  const personen = async () => (await konten.listeBenutzer()).filter((b) => istPerson(b));
  return {
    version: eigeneVersion(),
    beruflich: async () => (await dienst.werkbank.merkmale()).beruflich,
    organisationen: async () => (await dienst.organisation.stand()).organisationen.map((o) => ({
      id: o.mappeId, angaben: { ...o.angaben },
      verantwortlicher: o.verantwortlicher && 'angaben' in o.verantwortlicher ? (o.verantwortlicher.angaben.name ?? ([o.verantwortlicher.angaben.vorname, o.verantwortlicher.angaben.nachname].filter(Boolean).join(' ') || null)) : null,
      datenschutzbeauftragter: o.datenschutzbeauftragter ? (o.datenschutzbeauftragter.angaben.name ?? ([o.datenschutzbeauftragter.angaben.vorname, o.datenschutzbeauftragter.angaben.nachname].filter(Boolean).join(' ') || null)) : null,
    })),
    ...(x.postfaecher ? { postfaecher: async () => (await x.postfaecher!.ansicht()).map((p) => ({ id: p.id, name: p.name, aktiv: p.aktiv, server: p.server, anmeldung: p.anmeldung === 'oauth' ? !!p.oauth : p.passwortGesetzt })) } : {}),
    ...(x.eingangsordner ? { eingangsordner: async () => { const e = await x.eingangsordner!.einstellung(); return { aktiv: e.aktiv, nachher: e.nachher, doppelteUeberspringen: !!e.doppelteUeberspringen }; } } : {}),
    ...(x.texterkennung ? { texterkennung: async () => ({ aktiv: (await x.texterkennung!.optionen()).aktiv }) } : {}),
    typen: () => dienst.mappentypen.listeTypen(),
    kiTypen: async () => new Set((await dienst.ki.kiUebersicht()).typen.filter((t) => t.zugelassen).map((t) => t.id)),
    ...(konten.zweifaktor ? { zweifaktor: async () => ({ ...(await konten.zweifaktor!.pflicht()) }) } : {}),
    ...(konten.passkeys ? { passkeys: async () => ({ moeglich: !!konten.passkeys!.pflichtRp(), pflicht: { ...(await konten.passkeys!.pflicht()) } }) } : {}),
    anmeldeschutz: async () => { const e = await konten.sperre.einstellung(); return { konto: { ...e.konto }, ip: { ...e.ip }, ausnahmen: e.ausnahmen.length, mail: e.mail }; },
    ...(x.webdav ? { webdav: async () => { const e = (await x.webdav!.stand()).einstellung; return { aktiv: e.aktiv, nurLesend: e.nurLesend }; } } : {}),
    ...(x.apiSchluessel ? { apiSchluessel: async () => { let n = 0; for (const b of await personen()) n += (await x.apiSchluessel!.liste(b)).length; return n; } } : {}),
    rollen: async () => (await dienst.postSystemmappen.listeRollen()).map((r) => ({ id: r.id, name: r.name })),
    verwaltung: async () => (await personen()).filter((b) => b.aktiv).map((b) => b.verwaltung),
    pakete: async () => (await dienst.kern.repo.listePakete()).map((p) => ({
      id: p.id, name: p.name, version: p.version, schnittstellen: [...(p.laeufer?.rechte.schnittstellen ?? [])],
      rechte: p.laeufer ? rechteZeilen(rechtePunkte(p.laeufer, (v) => v)) : [],
    })),
    ...(x.automatisierungen ? { automatisierungen: async () => (await x.automatisierungen!.uebersicht()).automatisierungen.map((a) => ({ id: a.id, name: a.name, aktiv: a.aktiv, herkunft: a.herkunft, paket: a.paketId ?? null })) } : {}),
    assistent: async () => { const f = await dienst.fragen.stand(); return { verfuegbar: f.verfuegbar, paket: f.paket }; },
    ...(x.wartung ? { wartung: async () => ({ stufe: x.wartung!.stand.stufe }) } : {}),
    sicherung: async () => {
      if (!x.sicherung) return null;
      const s = x.sicherung;
      const plan = await s.plan();
      return {
        plan: { aktiv: plan.aktiv, uhrzeit: plan.uhrzeit, haeufigkeit: plan.haeufigkeit, wochentag: plan.wochentag, aufbewahrung: { ...plan.aufbewahrung }, nurNeueste: plan.nurNeueste },
        probe: await sicher(async () => { const p = await s.probePlan(); return { aktiv: p.aktiv, wochentag: p.wochentag, uhrzeit: p.uhrzeit }; }, null),
        verschluesselt: !!x.tresor?.bereit,
        ziele: (await sicher(() => s.externZiele(), [])).map((z) => ({ paket: z.id, name: z.name, ziel: z.ziel ?? null })),
      };
    },
    datenschutz: async () => ({
      typen: (await dienst.datenschutzDienst.datenschutzFuerUnterlagen()).typen,
      papierkorbTage: await dienst.kern.papierkorbTage(), historieTage: await dienst.mappenHistorie.historieTage(),
      loeschprotokollJahre: await dienst.loeschprotokollVerwaltung.loeschprotokollJahre(), auskunftTage: AUSKUNFT_TAGE,
    }),
  };
}

export function nachweisQuellen(k: RoutenKontext): NachweisQuellen {
  const { dienst, konten, x } = k;
  return {
    journal: async (monat) => (await nachweisjournal()?.monat(monat)) ?? { eintraege: [], weitere: 0, zaehler: {} },
    benutzer: async () => {
      const rollen = await dienst.systemtypen.weitereRollen();
      const namen = new Map((await dienst.postSystemmappen.listeRollen()).map((r) => [r.id, r.name] as const));
      const aus = [];
      for (const b of (await konten.listeBenutzer()).filter((y) => istPerson(y))) {
        const wege = await sicher(() => konten.zweiteWege(b), null);
        aus.push({ konto: b.email, aktiv: b.aktiv, rollen: [b.rolle, ...(rollen.get(b.id) ?? []).map((r) => namen.get(r) ?? r)], zweifaktor: !!wege?.code, passkey: !!wege?.passkey, verwaltung: [...(b.verwaltung ?? [])] });
      }
      return aus;
    },
    ...(x.sicherung ? { sicherungen: async () => (await x.sicherung!.liste()).filter((e) => e.meta).map((e) => ({
      name: e.name, beginn: e.meta!.beginn, ende: e.meta!.ende ?? null, art: e.meta!.art,
      pruefung: e.pruefung ? { am: e.pruefung.am, ok: e.pruefung.ok } : null, probe: e.probe ? { am: e.probe.am, ok: e.probe.ok } : null,
    })) } : {}),
    loeschungen: async (von, bis) => (await dienst.loeschprotokollVerwaltung.loeschprotokoll({ von: von.slice(0, 10), bis: bis.slice(0, 10), max: 20_000 })).eintraege
      .filter((e) => e.zeit >= von && e.zeit <= bis).map((e) => ({ zeit: e.zeit, schritt: e.schritt, grund: e.grund ?? null, typ: e.typ, art: e.art })),
    post: async (von, bis) => {
      const post = (await dienst.kern.system()).post;
      const je: Record<string, number> = {};
      for (const m of await dienst.kern.repo.listeMappen(post.id)) {
        if (m.erstellt < von || m.erstellt > bis) continue;
        const weg = typeof m.werte.kanal === 'string' && m.werte.kanal ? m.werte.kanal : 'ohne';
        je[weg] = (je[weg] ?? 0) + 1;
      }
      return je;
    },
  };
}
