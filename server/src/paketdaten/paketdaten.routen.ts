/**
 * Einrichtung und Nachweise für Pakete (#1053, #1054): Quellen aus den Diensten der Routen und die Routen selbst.
 *
 * - Pakete lesen über ihr Dienstkonto – Personen und ihre API-Schlüssel bekommen 403 (Ergänzung Sicherheit). Je
 *   Abruf prüft freigabe.ts, ob der Bereich angefragt, angehakt und von der hinterlegten Person verwaltet ist.
 * - Die Werkbank liest und speichert die Auswahl auf der Seite des Pakets (Bereich „Pakete“; welche Haken jemand
 *   setzen darf, prüft freigabe.ts, die frische Anmeldung verwaltungsbereiche.ts).
 *
 * Die Quellen machen schon schmal: Jede gibt nur die Angaben weiter, die einrichtung.ts bzw. nachweise.ts ausdrücklich
 * übernehmen.
 */
import { rechteZeilen, rechtePunkte } from '../../../shared/src/pakete';
import { istPerson } from '../../../shared/src/model';
import { AUSKUNFT_TAGE } from '../../../shared/src/auskunft';
import { eigeneVersion } from '../system/system';
import { nachweisjournal } from '../protokoll/nachweisjournal';
import { einrichtung, liesEintraege, nachweise, vergleiche, type EinrichtungQuellen, type NachweisQuellen } from './index';
import { freigabeAnsicht, pruefeAbruf, setzeFreigabe } from './freigabe';
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import { protokoll } from '../protokoll/protokoll';
import { ok, ich } from '../http/routen-hilfen';
import { istPaketdatenBereich, MONAT, type PaketdatenArt, type PaketdatenBereich } from '../../../shared/src/paketdaten';
import type { Anfrage, Route } from '../http/routen';
import { routenKontext, type RoutenKontext } from '../http/routen-kontext';

const sicher = async <T>(f: () => Promise<T>, sonst: T): Promise<T> => {
  try {
    return await f();
  } catch {
    return sonst;
  }
};

export function einrichtungQuellen(k: RoutenKontext): EinrichtungQuellen {
  const { dienst, konten, x } = k;
  const personen = async () => (await konten.listeBenutzer()).filter((b) => istPerson(b));
  return {
    version: eigeneVersion(),
    beruflich: async () => (await dienst.werkbank.merkmale()).beruflich,
    organisationen: async () =>
      (await dienst.organisation.stand()).organisationen.map((o) => ({
        id: o.mappeId,
        angaben: { ...o.angaben },
        verantwortlicher:
          o.verantwortlicher && 'angaben' in o.verantwortlicher
            ? (o.verantwortlicher.angaben.name ??
              ([o.verantwortlicher.angaben.vorname, o.verantwortlicher.angaben.nachname].filter(Boolean).join(' ') || null))
            : null,
        datenschutzbeauftragter: o.datenschutzbeauftragter
          ? (o.datenschutzbeauftragter.angaben.name ??
            ([o.datenschutzbeauftragter.angaben.vorname, o.datenschutzbeauftragter.angaben.nachname].filter(Boolean).join(' ') || null))
          : null,
      })),
    ...(x.postfaecher
      ? {
          postfaecher: async () =>
            (await x.postfaecher!.ansicht()).map((p) => ({
              id: p.id,
              name: p.name,
              aktiv: p.aktiv,
              server: p.server,
              anmeldung: p.anmeldung === 'oauth' ? !!p.oauth : p.passwortGesetzt,
            })),
        }
      : {}),
    ...(x.eingangsordner
      ? {
          eingangsordner: async () => {
            const e = await x.eingangsordner!.einstellung();
            return { aktiv: e.aktiv, nachher: e.nachher, doppelteUeberspringen: !!e.doppelteUeberspringen };
          },
        }
      : {}),
    ...(x.texterkennung ? { texterkennung: async () => ({ aktiv: (await x.texterkennung!.optionen()).aktiv }) } : {}),
    typen: () => dienst.mappentypen.listeTypen(),
    kiTypen: async () => new Set((await dienst.ki.kiUebersicht()).typen.filter((t) => t.zugelassen).map((t) => t.id)),
    ...(konten.zweifaktor ? { zweifaktor: async () => ({ ...(await konten.zweifaktor!.pflicht()) }) } : {}),
    ...(konten.passkeys
      ? { passkeys: async () => ({ moeglich: !!konten.passkeys!.pflichtRp(), pflicht: { ...(await konten.passkeys!.pflicht()) } }) }
      : {}),
    anmeldeschutz: async () => {
      const e = await konten.sperre.einstellung();
      return { konto: { ...e.konto }, ip: { ...e.ip }, ausnahmen: e.ausnahmen.length, mail: e.mail };
    },
    ...(x.webdav
      ? {
          webdav: async () => {
            const e = (await x.webdav!.stand()).einstellung;
            return { aktiv: e.aktiv, nurLesend: e.nurLesend };
          },
        }
      : {}),
    ...(x.apiSchluessel
      ? {
          apiSchluessel: async () => {
            let n = 0;
            for (const b of await personen()) n += (await x.apiSchluessel!.liste(b)).length;
            return n;
          },
        }
      : {}),
    rollen: async () => (await dienst.postSystemmappen.listeRollen()).map((r) => ({ id: r.id, name: r.name })),
    verwaltung: async () => (await personen()).filter((b) => b.aktiv).map((b) => b.verwaltung),
    pakete: async () =>
      (await dienst.kern.repo.listePakete()).map((p) => ({
        id: p.id,
        name: p.name,
        version: p.version,
        schnittstellen: [...(p.laeufer?.rechte.schnittstellen ?? [])],
        rechte: p.laeufer ? rechteZeilen(rechtePunkte(p.laeufer, (v) => v)) : [],
      })),
    ...(x.automatisierungen
      ? {
          automatisierungen: async () =>
            (await x.automatisierungen!.uebersicht()).automatisierungen.map((a) => ({
              id: a.id,
              name: a.name,
              aktiv: a.aktiv,
              herkunft: a.herkunft,
              paket: a.paketId ?? null,
            })),
        }
      : {}),
    assistent: async () => {
      const f = await dienst.fragen.stand();
      return { verfuegbar: f.verfuegbar, paket: f.paket };
    },
    ...(x.wartung ? { wartung: async () => ({ stufe: x.wartung!.stand.stufe }) } : {}),
    sicherung: async () => {
      if (!x.sicherung) return null;
      const s = x.sicherung;
      const plan = await s.plan();
      return {
        plan: {
          aktiv: plan.aktiv,
          uhrzeit: plan.uhrzeit,
          haeufigkeit: plan.haeufigkeit,
          wochentag: plan.wochentag,
          aufbewahrung: { ...plan.aufbewahrung },
          nurNeueste: plan.nurNeueste,
        },
        probe: await sicher(async () => {
          const p = await s.probePlan();
          return { aktiv: p.aktiv, wochentag: p.wochentag, uhrzeit: p.uhrzeit };
        }, null),
        verschluesselt: !!x.tresor?.bereit,
        ziele: (await sicher(() => s.externZiele(), [])).map((z) => ({ paket: z.id, name: z.name, ziel: z.ziel ?? null })),
      };
    },
    datenschutz: async () => ({
      typen: (await dienst.datenschutzDienst.datenschutzFuerUnterlagen()).typen,
      papierkorbTage: await dienst.kern.papierkorbTage(),
      historieTage: await dienst.mappenHistorie.historieTage(),
      loeschprotokollJahre: await dienst.loeschprotokollVerwaltung.loeschprotokollJahre(),
      auskunftTage: AUSKUNFT_TAGE,
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
        aus.push({
          konto: b.email,
          aktiv: b.aktiv,
          rollen: [b.rolle, ...(rollen.get(b.id) ?? []).map((r) => namen.get(r) ?? r)],
          zweifaktor: !!wege?.code,
          passkey: !!wege?.passkey,
          verwaltung: [...(b.verwaltung ?? [])],
        });
      }
      return aus;
    },
    ...(x.sicherung
      ? {
          sicherungen: async () =>
            (await x.sicherung!.liste())
              .filter((e) => e.meta)
              .map((e) => ({
                name: e.name,
                beginn: e.meta!.beginn,
                ende: e.meta!.ende ?? null,
                art: e.meta!.art,
                pruefung: e.pruefung ? { am: e.pruefung.am, ok: e.pruefung.ok } : null,
                probe: e.probe ? { am: e.probe.am, ok: e.probe.ok } : null,
              })),
        }
      : {}),
    loeschungen: async (von, bis) =>
      (await dienst.loeschprotokollVerwaltung.loeschprotokoll({ von: von.slice(0, 10), bis: bis.slice(0, 10), max: 20_000 })).eintraege
        .filter((e) => e.zeit >= von && e.zeit <= bis)
        .map((e) => ({ zeit: e.zeit, schritt: e.schritt, grund: e.grund ?? null, typ: e.typ, art: e.art })),
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

/** Beide Quellen auf einmal, z. B. für die Prüfung auf Geheimnisse (server/test/geheimnis-sperre.test.ts). */
export function paketdatenQuellen(...a: Parameters<typeof routenKontext>): { einrichtung: EinrichtungQuellen; nachweise: NachweisQuellen } {
  const k = routenKontext(...a);
  return { einrichtung: einrichtungQuellen(k), nachweise: nachweisQuellen(k) };
}

const log = protokoll.modul('werkbank');

export function paketdatenRouten(k: RoutenKontext): Route[] {
  const { dienst, konten, zg } = k;
  const einst = () => dienst.kern.einstellungen;
  const person = async (id: string) => (await konten.benutzerMitId(id)) ?? null;
  const paket = async (id: string) => {
    const p = (await dienst.kern.repo.listePakete()).find((x) => x.id === id);
    if (!p) throw new Fachfehler(404, t('pakete.daten.fehler.kein-paket'));
    return p;
  };
  /** Nur das Dienstkonto eines Pakets, nur freigegebene Bereiche; jeder Abruf steht im Protokoll. */
  const darf = async (a: Anfrage, art: PaketdatenArt): Promise<PaketdatenBereich> => {
    const bereich = a.params.bereich;
    if (!istPaketdatenBereich(bereich)) throw new Fachfehler(404, t('pakete.daten.fehler.bereich', { bereich: String(bereich) }));
    const z = await zg(a);
    if (!z.paket || a.benutzer?.art !== 'dienst') throw new Fachfehler(403, t('pakete.daten.fehler.nur-pakete'));
    await pruefeAbruf(
      einst(),
      (await dienst.kern.repo.listePakete()).find((x) => x.id === z.paket!.id),
      art,
      bereich,
      person,
    );
    log.info(art === 'nachweise' ? 'Paket liest Nachweise' : 'Paket liest Einrichtung', {
      paket: z.paket.id,
      bereich,
      ...(a.params.monat ? { monat: a.params.monat } : {}),
    });
    return bereich;
  };
  const monat = (a: Anfrage) => {
    const m = String(a.params.monat ?? '');
    if (!MONAT.test(m) || m > new Date().toISOString().slice(0, 7)) throw new Fachfehler(422, t('pakete.daten.fehler.monat'));
    return m;
  };
  return [
    // Werkbank → Pakete → Seite des Pakets: Auswahl lesen und speichern.
    {
      methode: 'GET',
      pfad: '/api/werkbank/pakete/:id/paketdaten',
      zugang: 'admin',
      handler: async (a) => ok(await freigabeAnsicht(einst(), await paket(a.params.id), ich(a), person)),
    },
    {
      methode: 'PUT',
      pfad: '/api/werkbank/pakete/:id/paketdaten',
      zugang: 'admin',
      handler: async (a) => {
        const p = await paket(a.params.id);
        await setzeFreigabe(einst(), p, ich(a), a.body, { verlauf: (e) => dienst.kern.repo.notiereVerlauf([e]) });
        return ok(await freigabeAnsicht(einst(), p, ich(a), person));
      },
    },
    // Für Pakete (über /api/v1): Einrichtung je Bereich, Vergleich mit einem gemerkten Stand, Nachweise je Monat.
    {
      methode: 'GET',
      pfad: '/api/paketdaten/einrichtung/:bereich',
      zugang: 'angemeldet',
      handler: async (a) => ok(await einrichtung(await darf(a, 'einrichtung'), einrichtungQuellen(k))),
    },
    {
      methode: 'POST',
      pfad: '/api/paketdaten/einrichtung/:bereich/vergleich',
      zugang: 'angemeldet',
      lesend: true,
      handler: async (a) => {
        const jetzt = await einrichtung(await darf(a, 'einrichtung'), einrichtungQuellen(k));
        const vorher = liesEintraege((a.body as { vorher?: unknown } | null)?.vorher);
        return ok({ bereich: jetzt.bereich, version: jetzt.version, aenderungen: vergleiche(vorher, jetzt.eintraege), stand: jetzt });
      },
    },
    {
      methode: 'GET',
      pfad: '/api/paketdaten/nachweise/:bereich/:monat',
      zugang: 'angemeldet',
      handler: async (a) => {
        const m = monat(a);
        return ok(await nachweise(await darf(a, 'nachweise'), m, nachweisQuellen(k)));
      },
    },
  ];
}
