import type { Sicht, SichtDaten } from '../../../../shared/src/sichten';
import { KonfigurationVeraltet, type RepoTeil } from '..';
import { jetzt, kopie, standWeiter } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Ansichten (#38): anlegen, ändern, verschieben, löschen. */
export function speicherSichten(sp: SpeicherKontext) {
  const { sichten } = sp;
  return {
    async listeSichten() {
      return [...sichten.values()].map(kopie).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de'));
    },
    async legeSichtAn(id, d: SichtDaten) {
      const x: Sicht = { id, ...kopie(d), erstellt: jetzt(), geaendert: jetzt() };
      sichten.set(id, x);
      return kopie(x);
    },
    async aendereSicht(id, d: SichtDaten, erwartet) {
      const alt = sichten.get(id)!;
      if (erwartet !== undefined && alt.geaendert !== erwartet) throw new KonfigurationVeraltet();
      const x: Sicht = { ...alt, ...kopie(d), geaendert: standWeiter(alt.geaendert) };
      sichten.set(id, x);
      return kopie(x);
    },
    async setzeSichtOrt(id, elternId, position) {
      const x = sichten.get(id);
      if (!x) return;
      if (x.elternId !== elternId) x.geaendert = standWeiter(x.geaendert);
      x.elternId = elternId;
      x.position = position;
    },
    async loescheSicht(id) {
      sichten.delete(id);
      for (const x of sichten.values()) if (x.elternId === id) x.elternId = null;
    },
  } satisfies RepoTeil;
}
