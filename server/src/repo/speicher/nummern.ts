import type { Nummernkreis } from '../../../../shared/src/nummernkreis';
import type { RepoTeil } from '..';
import { kopie } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Nummernkreise (#171) und Archivnummern (#345). */
export function speicherNummern(sp: SpeicherKontext) {
  const { mappen, kreise, zieheSync, dokumente, versionen } = sp;
  return {
    async listeNummernkreise() {
      return [...kreise.values()].map(kopie).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    },
    async speichereNummernkreis(k) {
      const alt = kreise.get(k.schluessel);
      const neu: Nummernkreis = { staende: {}, zuletzt: [], ...alt, ...kopie(k) };
      kreise.set(k.schluessel, neu);
      return kopie(neu);
    },
    async loescheNummernkreis(s) {
      kreise.delete(s);
    },
    async setzeZaehler(s, zeitraum, letzter) {
      const k = kreise.get(s);
      if (!k) return undefined;
      const neu = { ...k, staende: { ...k.staende, [zeitraum]: letzter } };
      kreise.set(s, neu);
      return kopie(neu);
    },
    async vergebeNummer(mappeId, feldKey, kreis, j) {
      const m = mappen.get(mappeId);
      if (!m || (m.werte[feldKey] != null && m.werte[feldKey] !== '')) return null;
      const nummer = zieheSync(kreis, mappeId, j);
      mappen.set(mappeId, { ...m, werte: { ...m.werte, [feldKey]: nummer } });
      return nummer;
    },
    async zieheNummern(kreis, anzahl, j) {
      return Array.from({ length: anzahl }, () => zieheSync(kreis, null, j));
    },
    async setzeArchivnummer(dokumentId, nummer) {
      const d = dokumente.get(dokumentId);
      if (!d) return false;
      if (nummer && [...dokumente.values()].some((x) => x.id !== dokumentId && x.archivnummer?.toLowerCase() === nummer.toLowerCase()))
        return false;
      dokumente.set(dokumentId, { ...d, archivnummer: nummer });
      return true;
    },
    async findeArchivnummer(nummer) {
      const d = [...dokumente.values()].find((x) => x.archivnummer?.toLowerCase() === nummer.toLowerCase());
      return d && { ...kopie(d), aeltere: versionen.get(d.id)?.length ?? 0 };
    },
  } satisfies RepoTeil;
}
