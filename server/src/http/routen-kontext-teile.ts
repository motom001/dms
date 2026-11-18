/**
 * Teile des Routen-Kontexts, die beim Bau entstehen (#1278, Schritt 6b-1: aus `routenKontext` verschoben, unverändert):
 * Fotostapel, Paketverwaltung und -erstellung, „Ablago entdecken“, Rundgänge der Werkbank und Umwandlung – in dieser
 * Reihenfolge gebaut.
 */
import { darfErstellen } from '../../../shared/src/model';
import type { Dienst } from '../dienst/dienst';
import type { Konten } from '../konten';
import { Paketverwaltung } from '../pakete/verwaltung/index';
import { Paketerstellung } from '../pakete/erstellung/index';
import { Umwandlung } from '../pakete/umwandlung';
import { Entdecken } from '../entdecken/entdecken';
import { RundgaengeWerkbank, WERKBANK_EINSTELLUNG } from '../entdecken/entdecken-werkbank';
import { heuteIn } from '../../../shared/src/sichten';
import { eigeneVersion } from '../system/system';
import { Fotostapel } from '../post/fotostapel';
import { L } from './routen-hilfen';
import type { RoutenExtras } from './routen-extras';

/** Fotostapel, Pakete, Entdecken, Rundgänge der Werkbank und Umwandlung – je einmal je Aufruf von routen(). */
export function kontextTeile(dienst: Dienst, konten: Konten, x: RoutenExtras) {
  const fotostapel = x.fotostapel ?? new Fotostapel();
  const pakete =
    x.pakete ??
    new Paketverwaltung(dienst, {
      version: eigeneVersion,
      benutzer: async () =>
        (await konten.listeBenutzer()).filter((b) => b.aktiv !== false).map((b) => ({ id: b.id, name: b.name || b.email })),
    });
  const paketerstellung = new Paketerstellung(dienst, {
    version: eigeneVersion,
    ...(x.automatisierungen ? { automatisierungen: async () => (await x.automatisierungen!.uebersicht()).automatisierungen } : {}),
  });
  const entdecken = x.entdecken ?? baueEntdecken(dienst, konten, x);
  const rundgaengeWerkbank = baueRundgaengeWerkbank(dienst, entdecken);
  const umwandlung = new Umwandlung(dienst);
  return { fotostapel, pakete, paketerstellung, entdecken, rundgaengeWerkbank, umwandlung };
}

/** Ablago entdecken (#831, #832): Rundgänge und Tipps je Person; Funktionen, nach denen Tipps gefiltert werden. */
function baueEntdecken(dienst: Dienst, konten: Konten, x: RoutenExtras): Entdecken {
  return new Entdecken({
    einstellungen: (b) => konten.einstellungen(b),
    setzeEinstellung: (b, k, w) => konten.setzeEinstellung(b, k, w),
    version: eigeneVersion,
    heute: () => heuteIn(),
    funktionen: async () => {
      const f = new Set<'fragen' | 'laufwerk' | 'mail'>();
      if ((await dienst.fragen.stand()).verfuegbar) f.add('fragen');
      if (x.webdav && (await x.webdav.einstellung()).aktiv) f.add('laufwerk');
      if (konten.mailAktiv) f.add('mail');
      return f;
    },
    // Rundgänge aus Paketen (#831): Pakete, Mappentypen und die Rechte der Person daran.
    pakete: () => dienst.kern.repo.listePakete(),
    typen: async () =>
      (await dienst.kern.repo.listeTypen()).map((x) => ({
        kennung: x.schluessel ?? x.id,
        felder: x.felder.map((f) => f.key),
        register: x.register.map((r) => r.key),
      })),
    lesbareTypen: async (b) => {
      const z = await dienst.rechtepruefung.zugriff(b);
      const lesbar = new Set((await dienst.mappentypen.rechteUebersicht(z)).filter((x) => x.rechte.R !== 'nie').map((x) => x.typId));
      return new Set([...z.typen.values()].filter((x) => lesbar.has(x.id)).map((x) => x.schluessel ?? x.id));
    },
    oeffnen: async (b, kennung, art) => {
      const z = await dienst.rechtepruefung.zugriff(b);
      const alle = await dienst.mappentypen.typenFuer(z);
      // Ohne Kennung (#1307, Tipp an „Mappe ▾“): Mappen aller Typen, die die Person sieht.
      const typen = kennung === null ? alle : alle.filter((x) => (x.schluessel ?? x.id) === kennung);
      if (!typen.length || (art === 'neu' && kennung === null)) return null;
      if (art === 'neu') return darfErstellen(typen[0]) ? `/ablage/${typen[0].id}/neu` : null;
      // Die erste Mappe, die die Person lesen darf – zuletzt geänderte zuerst.
      const mappen = (await Promise.all(typen.map((t) => dienst.kern.repo.listeMappen(t.id))))
        .flat()
        .sort((a, b2) => b2.geaendert.localeCompare(a.geaendert));
      const lesbar = await dienst.rechtepruefung.lesbare(
        z,
        mappen.slice(0, 500).map((m) => m.id),
      );
      const m = mappen.find((x) => lesbar.has(x.id));
      return m ? `/ablage/${m.typId}/${m.id}` : null;
    },
    werkbank: async () => dienst.kern.einstellungen?.lies(WERKBANK_EINSTELLUNG) ?? null,
    log: L.konto,
  });
}

/** Werkbank → Rundgänge (#941): eigene Rundgänge und An/aus in der Einstellung der Ablage. */
function baueRundgaengeWerkbank(dienst: Dienst, entdecken: Entdecken): RundgaengeWerkbank {
  return new RundgaengeWerkbank({
    speicher: {
      lies: async () => dienst.kern.einstellungen?.lies(WERKBANK_EINSTELLUNG) ?? null,
      schreibe: async (w) => {
        await dienst.kern.einstellungen?.schreibe(WERKBANK_EINSTELLUNG, w);
      },
      ...(dienst.kern.einstellungen?.tausche
        ? { tausche: (alt: unknown, neu: unknown) => dienst.kern.einstellungen!.tausche!(WERKBANK_EINSTELLUNG, alt, neu) }
        : {}),
    },
    pruefung: async () => {
      const typen = new Map(
        (await dienst.kern.repo.listeTypen()).map((x) => [
          x.schluessel ?? x.id,
          { kennung: x.schluessel ?? x.id, felder: x.felder.map((f) => f.key), register: x.register.map((r) => r.key) },
        ]),
      );
      return { anker: entdecken.ablago().anker, typ: (k: string) => typen.get(k) ?? null };
    },
  });
}
