/** Fragen an die Ablage, Wörterbuch für ähnliche Schreibweisen (#356) und Synonyme (Arbeitsspeicher). */
import { randomUUID } from 'node:crypto';
import type { Mappe } from '../../../../shared/src/model';
import { lesbar } from '../../../../shared/src/rechte';
import { AEHNLICH_AB, aehnlichkeit, falte, TIPPFEHLER_MIN } from '../../../../shared/src/suche';
import { KonfigurationVeraltet, type RepoTeil } from '..';
import { jetzt, kopie, standWeiter } from './hilfen';
import type { SpeicherKontext } from './kontext';

/** Fundstellen für Fragen; Wörterbuch für ähnliche Schreibweisen. */
export function speicherWoerter(sp: SpeicherKontext) {
  const { mappen, dokumente, texte, alleWoerter, zaehl } = sp;
  return {
    /* Unscharfe Suche (#356): Wörterverzeichnis aus dem Bestand, jedes Mal neu gezählt. */
    async aehnlicheWoerter(liste, max) {
      const r: Record<string, string[]> = {};
      const ws = [...new Set(liste.map(falte).filter((w) => w.length >= TIPPFEHLER_MIN && w.length <= 40))];
      if (!ws.length) return r;
      const anzahl = alleWoerter();
      for (const w of ws) {
        const a = [...anzahl.keys()]
          .filter((x) => x !== w)
          .map((x) => ({ x, s: aehnlichkeit(x, w) }))
          .filter((y) => y.s >= AEHNLICH_AB)
          .sort((p, q) => q.s - p.s || anzahl.get(q.x)! - anzahl.get(p.x)! || p.x.localeCompare(q.x))
          .slice(0, max)
          .map((y) => y.x);
        if (a.length) r[w] = a;
      }
      return r;
    },
    async woerterAnzahl() {
      return alleWoerter().size;
    },
    async woerterNeu() {
      return alleWoerter().size;
    },
    // Im Arbeitsspeicher wird das Verzeichnis jedes Mal neu gezählt – es gibt keinen Eingang.
    async woerterEinarbeiten() {
      return 0;
    },
    async fragenFundstellen(o) {
      const woerter = o.woerter.map((w) => w.toLowerCase());
      if (!woerter.length) return { dokumente: [], mappen: [] };
      const darf = (m: Mappe | undefined) => !!m && lesbar(o.lesen ?? null, m, zaehl);
      const zaehleIn = (t: string) => woerter.filter((w) => t.toLowerCase().includes(w)).length;
      const docs = [...dokumente.values()]
        .map((d) => ({ d, n: zaehleIn(texte.get(d.id) ?? '') }))
        .filter((x) => x.n > 0 && darf(mappen.get(x.d.mappeId)))
        .sort((a, b) => b.n - a.n || a.d.id.localeCompare(b.d.id))
        .slice(0, Math.max(0, o.dokumente))
        .map((x) => ({ id: x.d.id, mappeId: x.d.mappeId, name: x.d.name, text: texte.get(x.d.id) ?? '' }));
      const treffer = [...mappen.values()]
        .filter((m) => darf(m))
        .map((m) => ({
          m,
          n: woerter.filter(
            (w) =>
              (m.titel ?? '').toLowerCase().includes(w) ||
              Object.values(m.werte).some(
                (v) =>
                  !(typeof v === 'string' && v.startsWith('dms1$')) &&
                  (typeof v === 'object' ? JSON.stringify(v) : String(v)).toLowerCase().includes(w),
              ),
          ).length,
        }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n || b.m.geaendert.localeCompare(a.m.geaendert))
        .slice(0, Math.max(0, o.mappen))
        .map((x) => kopie(x.m));
      return { dokumente: docs, mappen: treffer };
    },
  } satisfies RepoTeil;
}

/** Synonyme: Gruppen gleichbedeutender Wörter. */
export function speicherSynonyme(sp: SpeicherKontext) {
  const { synonymListe } = sp;
  return {
    async synonyme() {
      return synonymListe.map(kopie);
    },
    async legeSynonymAn(g) {
      synonymListe.push({ ...kopie(g), geaendert: jetzt() });
    },
    async aendereSynonym(id, woerter, erwartet) {
      const g = synonymListe.find((x) => x.id === id && x.quelle === 'werkbank');
      if (!g) return false;
      if (erwartet !== undefined && g.geaendert !== erwartet) throw new KonfigurationVeraltet();
      g.woerter = [...woerter];
      g.geaendert = standWeiter(g.geaendert);
      return true;
    },
    async loescheSynonym(id) {
      const i = synonymListe.findIndex((x) => x.id === id && x.quelle === 'werkbank');
      if (i < 0) return false;
      synonymListe.splice(i, 1);
      return true;
    },
    async setzeSynonyme(quelle, gruppen) {
      for (let i = synonymListe.length - 1; i >= 0; i--) if (synonymListe[i].quelle === quelle) synonymListe.splice(i, 1);
      for (const g of gruppen) synonymListe.push({ id: randomUUID(), woerter: [...g], quelle, geaendert: jetzt() });
    },
  } satisfies RepoTeil;
}
