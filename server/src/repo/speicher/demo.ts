import type { RepoTeil } from '..';
import type { SpeicherKontext } from './kontext';

/** Beispieldaten (Demo): zählen, Verweise darauf, löschen. */
export function speicherDemo(sp: SpeicherKontext) {
  const { mappen, verweise, dokumente, korb } = sp;
  return {
    async zaehleDemo() {
      const r = new Map<string, number>();
      for (const m of mappen.values()) if (m.demo) r.set(m.typId, (r.get(m.typId) ?? 0) + 1);
      return r;
    },
    async echteVerweiseAufDemo() {
      const q = new Set<string>();
      for (const [quelle, vs] of verweise) if (!mappen.get(quelle)?.demo && vs.some((v) => mappen.get(v.zielId)?.demo)) q.add(quelle);
      return q.size;
    },
    async loescheDemo(max) {
      const alle = [...mappen.values()].filter((m) => m.demo).map((m) => m.id);
      const weg = max ? alle.slice(0, max) : alle;
      const wegSet = new Set(weg);
      const dateien = [...new Set([...dokumente.values()].filter((d) => wegSet.has(d.mappeId)).map((d) => d.sha256))];
      for (const id of weg) await this.loescheMappe(id);
      if (max && weg.length === max) return { anzahl: weg.length, dateien };
      const imKorb = [...korb.values()].filter((k) => k.mappe.demo);
      for (const k of imKorb) {
        korb.delete(k.mappe.id);
        for (const d of k.dokumente) if (!dateien.includes(d.sha256)) dateien.push(d.sha256);
      }
      return { anzahl: weg.length + imKorb.length, dateien };
    },
  } satisfies RepoTeil;
}
