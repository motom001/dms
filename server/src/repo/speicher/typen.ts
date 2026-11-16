/** Mappentypen (Arbeitsspeicher): anlegen, ändern, Kennung und Berechtigungen, Passung der Mappen. */
import type { Mappentyp, MappentypDaten } from '../../../../shared/src/model';
import { KonfigurationVeraltet, type RepoTeil } from '..';
import { jetzt, kopie, listen, mitPaket, ohnePaket, standWeiter, zieleNeu } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Mappentypen lesen und schreiben, Kennung, Schlüssel und Berechtigungen. */
export function speicherTypen(sp: SpeicherKontext) {
  const { typen, mappen, verweise } = sp;
  return {
    async listeTypen() {
      return [...typen.values()].map(kopie).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    },
    async holeTyp(id) {
      const t = typen.get(id);
      return t && kopie(t);
    },
    async legeTypAn(id, d: MappentypDaten, system) {
      const t: Mappentyp = {
        id,
        ...ohnePaket(zieleNeu(kopie(d))),
        ...listen(d),
        erstellenErlaubt: d.erstellenErlaubt !== false,
        loeschenErlaubt: d.loeschenErlaubt !== false,
        system: system ?? null,
        erstellt: jetzt(),
        geaendert: jetzt(),
      };
      typen.set(id, mitPaket(t));
      return kopie(t);
    },
    async aendereTyp(id, d, erwartet) {
      const alt = typen.get(id)!;
      if (erwartet !== undefined && alt.geaendert !== erwartet) throw new KonfigurationVeraltet();
      const t: Mappentyp = {
        ...alt,
        ...ohnePaket(zieleNeu(kopie(d))),
        paket: alt.paket,
        schluessel: alt.schluessel ?? d.schluessel,
        ...listen(d),
        erstellenErlaubt: d.erstellenErlaubt !== false,
        loeschenErlaubt: d.loeschenErlaubt !== false,
        geaendert: standWeiter(alt.geaendert),
      };
      typen.set(id, mitPaket(t));
      const refKeys = new Set(t.felder.filter((f) => f.typ === 'referenz').map((f) => f.key));
      for (const m of mappen.values())
        if (m.typId === id)
          verweise.set(
            m.id,
            (verweise.get(m.id) ?? []).filter((v) => refKeys.has(v.feldKey)),
          );
      return kopie(t);
    },
    async loescheTyp(id) {
      typen.delete(id);
    },
    async setzeTypKennung(typId, kennung) {
      const t = typen.get(typId);
      if (t) {
        t.schluessel = kennung;
        mitPaket(t);
      }
    },
    async setzeTypSchluessel(typId, schluessel) {
      const t = typen.get(typId);
      if (t && !t.schluessel) t.schluessel = schluessel;
    },
    async setzeBerechtigungen(typId, rw) {
      const t = typen.get(typId)!;
      t.berechtigungen = rw ? kopie(rw) : null;
      t.geaendert = standWeiter(t.geaendert);
      return kopie(t);
    },
  } satisfies RepoTeil;
}

/** Passen die Mappen zu ihrem Typ? Belegung der Felder. */
export function speicherPassung(sp: SpeicherKontext) {
  const { mappen } = sp;
  return {
    async setzePassung(liste) {
      for (const { id, problem } of liste) {
        const m = mappen.get(id);
        if (m) {
          m.passt = problem === null;
          m.problem = problem;
        }
      }
    },
    async unpassende(typId) {
      return [...mappen.values()].filter((m) => m.typId === typId && m.passt !== true).map((m) => m.id);
    },
    async typenOhnePassung() {
      return [...new Set([...mappen.values()].filter((m) => m.passt === undefined).map((m) => m.typId))];
    },
    async belegung(typId) {
      const r: Record<string, number> = {};
      for (const m of mappen.values()) {
        if (m.typId !== typId) continue;
        for (const [k, v] of Object.entries(m.werte)) if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) r[k] = (r[k] ?? 0) + 1;
      }
      return r;
    },
  } satisfies RepoTeil;
}
