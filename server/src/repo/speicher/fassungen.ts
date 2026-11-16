import type { GespeicherteFassung } from '../../../../shared/src/fassungen';
import type { RepoTeil } from '..';
import { kopie } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Fassungen (#1006): anlegen, fortschreiben, Löschvermerk, lesen. */
export function speicherFassungen(sp: SpeicherKontext) {
  const { fassungen, fassungenVon } = sp;
  return {
    async fassungen(art, eintrag, max = Infinity) {
      return kopie([...fassungenVon(art, eintrag)].reverse().slice(0, max));
    },
    async zaehleFassungen(art, eintrag) {
      return fassungenVon(art, eintrag).length;
    },
    async fassung(art, eintrag, nr) {
      const f = fassungenVon(art, eintrag).find((x) => x.nr === nr);
      return f && kopie(f);
    },
    async letzteFassungen(art) {
      const m = new Map<string, GespeicherteFassung>();
      for (const [k, l] of fassungen) if (k.startsWith(`${art}|`) && l.length) m.set(l[l.length - 1].eintrag, kopie(l[l.length - 1]));
      return m;
    },
    async legeFassungAn(f) {
      const k = `${f.art}|${f.eintrag}`;
      const l = fassungen.get(k) ?? [];
      if (l.some((x) => x.nr === f.nr)) throw new Error(`Fassung ${k} ${f.nr} gibt es schon`);
      l.push(kopie(f));
      l.sort((a, b) => a.nr - b.nr);
      fassungen.set(k, l);
    },
    async schreibeFassungFort(art, eintrag, nr, d) {
      const f = fassungenVon(art, eintrag).find((x) => x.nr === nr);
      if (f) Object.assign(f, kopie({ name: d.name, daten: d.daten, bis: d.bis }));
    },
    async loescheFassung(art, eintrag, nr) {
      const l = fassungenVon(art, eintrag);
      const i = l.findIndex((x) => x.nr === nr);
      if (i >= 0) l.splice(i, 1);
    },
    async vermerkeLoeschung(art, eintrag, vermerk) {
      const l = fassungenVon(art, eintrag);
      if (!l.length) return;
      const letzte = l[l.length - 1];
      letzte.geloescht = kopie(vermerk);
      fassungen.set(`${art}|${eintrag}`, [letzte]);
    },
    async geloeschteFassungen(arten) {
      return kopie(
        [...fassungen.values()]
          .map((l) => l[l.length - 1])
          .filter((f) => f?.geloescht && arten.includes(f.art))
          .sort((a, b) => b.geloescht!.zeit.localeCompare(a.geloescht!.zeit)),
      );
    },
    async alleFassungen() {
      return kopie(
        [...fassungen.values()].flat().sort((a, b) => a.art.localeCompare(b.art) || a.eintrag.localeCompare(b.eintrag) || a.nr - b.nr),
      );
    },
  } satisfies RepoTeil;
}
