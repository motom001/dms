/**
 * Konten (#1278, aus `konten.routen.ts`): Ablago entdecken (#831, #832), Werkbank → Rundgänge (#941) und
 * Werkbank → Tipps (#942).
 */
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import {
  EIGEN,
  type RundgangPruefergebnis,
  type WerkbankRundgaengeStand,
  type WerkbankTippsStand,
} from '../../../shared/src/entdecken-werkbank';
import { BEREICHE } from '../../../shared/src/werkbankansicht';
import { ok, leer, b, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../http/routen-typen';

/** Ablago entdecken (#831, #832). */
export function entdeckenRouten(k: RoutenKontext): Route[] {
  const { entdecken } = k;
  return [
    /* ---------- Ablago entdecken (#831, #832) ---------- */
    // Gefiltert nach der Person (Verwaltungsrecht, eingeschaltete Funktionen). In Vertretung startet nichts von selbst,
    // und Ablago merkt sich nichts für die vertretene Person.
    {
      methode: 'GET',
      pfad: '/api/entdecken',
      zugang: 'angemeldet',
      handler: async (a) => ok(await entdecken.stand(ich(a), { vertretung: !!a.sitzungsDaten?.vertretungId })),
    },
    {
      methode: 'POST',
      pfad: '/api/entdecken/tipps/:schluessel',
      zugang: 'angemeldet',
      handler: async (a) => {
        if (!a.sitzungsDaten?.vertretungId) await entdecken.tipp(ich(a), a.params.schluessel, b(a).aktion);
        return leer;
      },
    },
    {
      methode: 'POST',
      pfad: '/api/entdecken/rundgaenge/:schluessel',
      zugang: 'angemeldet',
      handler: async (a) => {
        if (!a.sitzungsDaten?.vertretungId) await entdecken.rundgang(ich(a), a.params.schluessel, b(a).stand);
        return leer;
      },
    },
    // Was ein Rundgang öffnet (#831, `oeffne.mappe`/`oeffne.neu`): erste lesbare Mappe bzw. leeres Formular, sonst null.
    {
      methode: 'GET',
      pfad: '/api/entdecken/rundgaenge/:schluessel/oeffnen',
      zugang: 'angemeldet',
      handler: async (a) => ok(await entdecken.oeffnen(ich(a), a.params.schluessel)),
    },
    // Tipp mit Ziel in einer Mappe (#832, `typ`): erste lesbare Mappe dieses Typs, sonst null.
    {
      methode: 'GET',
      pfad: '/api/entdecken/tipps/:schluessel/oeffnen',
      zugang: 'angemeldet',
      handler: async (a) => ok(await entdecken.oeffnen(ich(a), a.params.schluessel, 'tipp')),
    },
  ];
}

/** Werkbank → Rundgänge (#941). */
export function rundgaengeRouten(k: RoutenKontext): Route[] {
  const { dienst, entdecken, rundgaengeWerkbank } = k;
  return [
    /* ---------- Werkbank → Rundgänge (#941) ---------- */
    // Alle Rundgänge (auch ausgeschaltete) mit Datei, dazu Anker, Mappentypen und Bereiche für die Hilfe beim Schreiben.
    {
      methode: 'GET',
      pfad: '/api/werkbank/rundgaenge',
      zugang: 'admin',
      handler: async () => {
        const q = await entdecken.quellen({ alle: true });
        const pakete = await dienst.kern.repo.listePakete();
        const typen = (await dienst.kern.repo.listeTypen()).filter((x) => !x.system);
        return ok({
          rundgaenge: await rundgaengeWerkbank.liste(q.rundgaenge, (id) => pakete.find((p) => p.id === id)?.name, q.eigeneFehler),
          anker: q.anker,
          typen: typen.map((x) => ({
            kennung: x.schluessel ?? x.id,
            name: x.name,
            felder: x.felder.map((f) => ({ key: f.key, name: f.label })),
            register: x.register.map((r) => ({ key: r.key, name: r.name })),
          })),
          bereiche: BEREICHE.map((x) => ({ pfad: x.pfad, name: x.name })),
        } satisfies WerkbankRundgaengeStand);
      },
    },
    // Prüfen wie beim Installieren eines Pakets; ohne Fehler der Rundgang für „Ausprobieren“ (nur für mich).
    {
      methode: 'POST',
      pfad: '/api/werkbank/rundgaenge/pruefen',
      zugang: 'admin',
      handler: async (a) => {
        const p = await rundgaengeWerkbank.pruefe(b(a).yaml);
        const probe = p.rundgang
          ? await entdecken.probe(ich(a), { ...p.rundgang, schluessel: `${EIGEN}:${p.rundgang.schluessel}` })
          : { rundgang: null, pfad: null };
        return ok({ fehler: p.fehler, rundgang: probe.rundgang, pfad: probe.pfad } satisfies RundgangPruefergebnis);
      },
    },
    {
      methode: 'POST',
      pfad: '/api/werkbank/rundgaenge',
      zugang: 'admin',
      handler: async (a) => ok(await rundgaengeWerkbank.speichere(null, a.body, ich(a).email)),
    },
    {
      methode: 'PUT',
      pfad: '/api/werkbank/rundgaenge/:schluessel',
      zugang: 'admin',
      handler: async (a) => ok(await rundgaengeWerkbank.speichere(a.params.schluessel, a.body, ich(a).email)),
    },
    {
      methode: 'DELETE',
      pfad: '/api/werkbank/rundgaenge/:schluessel',
      zugang: 'admin',
      handler: async (a) => {
        await rundgaengeWerkbank.loesche(a.params.schluessel);
        return leer;
      },
    },
    // An/aus für alle (voller Schlüssel, z. B. ablago, vertraege:kennenlernen, eigen:urlaub).
    {
      methode: 'PUT',
      pfad: '/api/werkbank/rundgaenge/:schluessel/an',
      zugang: 'admin',
      handler: async (a) => {
        await rundgaengeWerkbank.schalte('rundgang', a.params.schluessel, b(a).an);
        return leer;
      },
    },
  ];
}

/** Werkbank → Tipps (#942). */
export function tippsRouten(k: RoutenKontext): Route[] {
  const { dienst, entdecken, rundgaengeWerkbank } = k;
  /** Was das Prüfen eines Tipps braucht (#942): Anker, Mappentypen, alle Rundgänge; dazu die Tipps mit ihren Originalen. */
  const tippKontext = async () => {
    const q = await entdecken.quellen({ alle: true });
    const p = await rundgaengeWerkbank.pruefungDaten();
    return { anker: q.anker, typ: p.typ, rundgaenge: q.rundgaenge.map((r) => r.schluessel), tipps: q.tipps, originale: q.tippOriginale };
  };
  return [
    /* ---------- Werkbank → Tipps (#942) ---------- */
    // Alle Tipps (auch ausgeschaltete) mit Herkunft, Original und Anpassung; dazu Anker, Mappentypen und Rundgänge fürs Formular.
    {
      methode: 'GET',
      pfad: '/api/werkbank/tipps',
      zugang: 'admin',
      handler: async () => {
        const q = await entdecken.quellen({ alle: true });
        const pakete = await dienst.kern.repo.listePakete();
        const typen = (await dienst.kern.repo.listeTypen()).filter((x) => !x.system);
        return ok({
          tipps: await rundgaengeWerkbank.tippListe(q.tipps, q.tippOriginale, (id) => pakete.find((p) => p.id === id)?.name, q.tippFehler),
          anker: q.anker,
          typen: typen.map((x) => ({
            kennung: x.schluessel ?? x.id,
            name: x.name,
            felder: x.felder.map((f) => ({ key: f.key, name: f.label })),
            register: x.register.map((r) => ({ key: r.key, name: r.name })),
          })),
          rundgaenge: q.rundgaenge.map((r) => ({ schluessel: r.schluessel, titel: r.titel })),
        } satisfies WerkbankTippsStand);
      },
    },
    {
      methode: 'POST',
      pfad: '/api/werkbank/tipps',
      zugang: 'admin',
      handler: async (a) => ok(await rundgaengeWerkbank.speichereTipp(null, a.body, ich(a).email, await tippKontext())),
    },
    // Eigenen Tipp ändern oder Tipp von Ablago bzw. aus einem Paket anpassen (getrennt gespeichert, das Original bleibt).
    {
      methode: 'PUT',
      pfad: '/api/werkbank/tipps/:schluessel',
      zugang: 'admin',
      handler: async (a) => {
        const k = await tippKontext();
        const schluessel = a.params.schluessel;
        const original = schluessel.startsWith(`${EIGEN}:`)
          ? undefined
          : (k.originale.get(schluessel) ?? k.tipps.find((x) => x.schluessel === schluessel));
        if (!schluessel.startsWith(`${EIGEN}:`) && !original) throw new Fachfehler(404, t('werkbank.tipps.fehler.gibt-es-nicht'));
        return ok(await rundgaengeWerkbank.speichereTipp(schluessel, a.body, ich(a).email, { ...k, ...(original ? { original } : {}) }));
      },
    },
    // Eigenen Tipp löschen bzw. „Auf Original zurücksetzen“.
    {
      methode: 'DELETE',
      pfad: '/api/werkbank/tipps/:schluessel',
      zugang: 'admin',
      handler: async (a) => {
        await rundgaengeWerkbank.loescheTipp(a.params.schluessel);
        return leer;
      },
    },
    {
      methode: 'PUT',
      pfad: '/api/werkbank/tipps/:schluessel/an',
      zugang: 'admin',
      handler: async (a) => {
        await rundgaengeWerkbank.schalte('tipp', a.params.schluessel, b(a).an);
        return leer;
      },
    },
    // „Ausprobieren“ eines Tipps mit Ziel in einer Mappe: erste Mappe dieses Typs, die ich lesen darf; `*` (#1307):
    // irgendeines Typs – für Anker an jeder Mappe wie „Mappe ▾“.
    {
      methode: 'GET',
      pfad: '/api/werkbank/tipps/mappe/:typ',
      zugang: 'admin',
      handler: async (a) => ok({ pfad: await entdecken.mappeVonTyp(ich(a), a.params.typ === '*' ? null : a.params.typ) }),
    },
  ];
}
