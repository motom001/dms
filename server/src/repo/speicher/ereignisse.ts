/** Ereignisse (Arbeitsspeicher): Zustellung an Pakete und Ereigniskatalog (#670). */
import type { RepoTeil } from '..';
import { jetzt, kopie } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Ereignisse an Pakete: anlegen, fällige holen, zugestellt oder fehlgeschlagen. */
export function speicherEreignisse(sp: SpeicherKontext) {
  const { ereignisse, fristMeldungen } = sp;
  return {
    async legeEreignisseAn(liste) {
      // Gleiche Id = schon angelegt (#670: Ereignisse aus dem Katalog kommen mindestens einmal).
      for (const e of liste)
        if (!ereignisse.has(e.id))
          ereignisse.set(e.id, {
            ...e,
            daten: kopie(e.daten),
            erstellt: jetzt(),
            faellig: Date.now(),
            versuche: 0,
            zugestellt: null,
            fehler: null,
          });
    },
    async faelligeEreignisse(anzahl) {
      const t = Date.now();
      const alle = [...ereignisse.values()];
      // Reihenfolge je Paket: Wartet ein älteres Ereignis auf seine Wiederholung, warten die späteren mit.
      const blockiert = (e: (typeof alle)[number]) =>
        alle.some(
          (a) =>
            a.paketId === e.paketId && !a.zugestellt && a.faellig > t && a.faellig !== Number.POSITIVE_INFINITY && a.erstellt < e.erstellt,
        );
      return alle
        .filter((e) => !e.zugestellt && e.faellig <= t && !blockiert(e))
        .sort((a, b) => a.erstellt.localeCompare(b.erstellt))
        .slice(0, anzahl)
        .map((e) => ({ id: e.id, paketId: e.paketId, art: e.art, daten: kopie(e.daten), erstellt: e.erstellt, versuche: e.versuche }));
    },
    async ereignisZugestellt(id) {
      const e = ereignisse.get(id);
      if (e) e.zugestellt = jetzt();
      const t = Date.now();
      for (const [k, x] of ereignisse)
        if (
          (x.zugestellt && Date.parse(x.zugestellt) < t - 7 * 864e5) ||
          (!x.zugestellt && x.faellig === Number.POSITIVE_INFINITY && Date.parse(x.erstellt) < t - 30 * 864e5)
        )
          ereignisse.delete(k);
    },
    async ereignisFehlgeschlagen(id, fehler, naechster) {
      const e = ereignisse.get(id);
      if (!e) return;
      e.versuche++;
      e.fehler = fehler;
      e.faellig = naechster ? naechster.getTime() : Number.POSITIVE_INFINITY;
    },
    async ereignisStand() {
      const erg: Record<string, { offen: number; aufgegeben: number; zugestellt: number; zuletzt: string | null }> = {};
      for (const e of ereignisse.values()) {
        const x = (erg[e.paketId] ??= { offen: 0, aufgegeben: 0, zugestellt: 0, zuletzt: null });
        if (e.zugestellt) {
          x.zugestellt++;
          if (!x.zuletzt || e.zugestellt > x.zuletzt) x.zuletzt = e.zugestellt;
        } else if (e.faellig === Number.POSITIVE_INFINITY) x.aufgegeben++;
        else x.offen++;
      }
      return erg;
    },
    async merkeFristMeldung(f) {
      const k = `${f.mappeId}|${f.feld}|${f.datum}|${f.zeitpunkt}`;
      if (fristMeldungen.has(k)) return false;
      fristMeldungen.add(k);
      return true;
    },
    async ereignisDaten(id, daten) {
      const e = ereignisse.get(id);
      if (e) e.daten = kopie(daten);
    },
    async loescheEreignisse(id) {
      for (const [k, e] of ereignisse) if (e.paketId === id) ereignisse.delete(k);
    },
    async loescheOffeneEreignisse(art, dokumente) {
      let n = 0;
      for (const [k, e] of ereignisse)
        if (e.art === art && !e.zugestellt && dokumente.includes(String(e.daten.dokument))) {
          ereignisse.delete(k);
          n++;
        }
      return n;
    },
  } satisfies RepoTeil;
}

/** Ereigniskatalog (#670): anlegen, verteilen, aufräumen. */
export function speicherKatalog(sp: SpeicherKontext) {
  const { katalog, fristMeldungen } = sp;
  return {
    async legeKatalogEreignisAn(e, mische) {
      const t = Date.now();
      if (e.buendel && mische) {
        const da = [...katalog.values()].find(
          (x) => x.buendel === e.buendel && !x.verteilt && !x.versuche && x.gesperrtBis < t && x.faellig > t,
        );
        if (da) {
          da.daten = kopie(mische(kopie(da.daten)));
          return da.id;
        }
      }
      katalog.set(e.id, {
        id: e.id,
        nr: ++sp.katalogNr,
        art: e.art,
        daten: kopie(e.daten),
        ausloeser: kopie(e.ausloeser),
        buendel: e.buendel ?? null,
        erstellt: jetzt(),
        faellig: t + (e.buendel ? (e.buendelS ?? 0) * 1000 : 0),
        gesperrtBis: 0,
        versuche: 0,
        fehler: null,
        verteilt: null,
      });
      return e.id;
    },
    async holeKatalogEreignisse(anzahl, sperreS) {
      const t = Date.now();
      const liste = [...katalog.values()]
        .filter((x) => !x.verteilt && x.faellig <= t && x.gesperrtBis < t)
        .sort((a, b) => a.nr - b.nr)
        .slice(0, anzahl);
      for (const x of liste) x.gesperrtBis = t + sperreS * 1000;
      return liste.map((x) => ({
        id: x.id,
        nr: x.nr,
        art: x.art,
        daten: kopie(x.daten),
        ausloeser: kopie(x.ausloeser),
        erstellt: x.erstellt,
        versuche: x.versuche,
      }));
    },
    async katalogEreignisseVerteilt(ids) {
      for (const id of ids) {
        const x = katalog.get(id);
        if (x) {
          x.verteilt = jetzt();
          x.fehler = null;
        }
      }
    },
    async katalogEreignisFehlgeschlagen(id, fehler, naechster) {
      const x = katalog.get(id);
      if (!x) return;
      x.versuche++;
      x.fehler = fehler.slice(0, 1000);
      x.gesperrtBis = 0;
      if (naechster) x.faellig = naechster.getTime();
      else x.verteilt = jetzt();
    },
    async raeumeKatalogEreignisseAuf(tage) {
      const grenze = Date.now() - tage * 864e5;
      let n = 0;
      for (const [k, x] of katalog)
        if (x.verteilt && Date.parse(x.verteilt) < grenze) {
          katalog.delete(k);
          n++;
        }
      const jahr = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
      for (const k of fristMeldungen) if (k.split('|')[2] < jahr) fristMeldungen.delete(k);
      return n;
    },
    async katalogEreignisStand() {
      const alle = [...katalog.values()];
      const offen = alle.filter((x) => !x.verteilt);
      return {
        offen: offen.length,
        aufgegeben: alle.filter((x) => x.verteilt && x.fehler).length,
        verteilt: alle.filter((x) => x.verteilt && !x.fehler).length,
        aeltestesOffen: offen.map((x) => x.erstellt).sort()[0] ?? null,
      };
    },
  } satisfies RepoTeil;
}
