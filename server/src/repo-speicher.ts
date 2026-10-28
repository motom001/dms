import type { Dokument, Mappe, Mappentyp, MappentypDaten, Werte } from '../../shared/src/model';
import type { Repo, Rueckverweis, Verweis } from './repo';

/** Repo im Arbeitsspeicher – für Tests und Oberflächenproben, nicht für den Betrieb. */
export function speicherRepo(): Repo {
  const typen = new Map<string, Mappentyp>();
  const mappen = new Map<string, Mappe>();
  const verweise = new Map<string, Verweis[]>();
  const dokumente = new Map<string, Dokument>();
  const jetzt = () => new Date().toISOString();
  const kopie = <T>(x: T): T => structuredClone(x);

  return {
    async listeTypen() { return [...typen.values()].map(kopie).sort((a, b) => a.name.localeCompare(b.name, 'de')); },
    async holeTyp(id) { const t = typen.get(id); return t && kopie(t); },
    async legeTypAn(id, d: MappentypDaten) {
      const t: Mappentyp = { id, ...kopie(d), erstellt: jetzt(), geaendert: jetzt() };
      typen.set(id, t);
      return kopie(t);
    },
    async aendereTyp(id, d) {
      const alt = typen.get(id)!;
      const t: Mappentyp = { ...alt, ...kopie(d), geaendert: jetzt() };
      typen.set(id, t);
      const refKeys = new Set(t.felder.filter((f) => f.typ === 'referenz').map((f) => f.key));
      for (const m of mappen.values()) if (m.typId === id) verweise.set(m.id, (verweise.get(m.id) ?? []).filter((v) => refKeys.has(v.feldKey)));
      return kopie(t);
    },
    async loescheTyp(id) { typen.delete(id); },
    async zaehleMappen(typId) { return [...mappen.values()].filter((m) => m.typId === typId).length; },

    async listeMappen(typId) { return [...mappen.values()].filter((m) => !typId || m.typId === typId).map(kopie); },
    async holeMappe(id) { const m = mappen.get(id); return m && kopie(m); },
    async legeMappeAn(id, typId, werte: Werte, vs, benutzerId, demo = false) {
      const m: Mappe = { id, typId, werte: kopie(werte), erstellt: jetzt(), erstelltVon: benutzerId, geaendert: jetzt(), geaendertVon: benutzerId, demo };
      mappen.set(id, m); verweise.set(id, kopie(vs));
      return kopie(m);
    },
    async aendereMappe(id, werte, vs, benutzerId) {
      const m = { ...mappen.get(id)!, werte: kopie(werte), geaendert: jetzt(), geaendertVon: benutzerId };
      mappen.set(id, m); verweise.set(id, kopie(vs));
      return kopie(m);
    },
    async loescheMappe(id) {
      mappen.delete(id); verweise.delete(id);
      for (const [k, d] of dokumente) if (d.mappeId === id) dokumente.delete(k);
    },

    async holeMappen(ids) { return [...new Set(ids)].map((id) => mappen.get(id)).filter((m): m is Mappe => !!m).map(kopie); },
    async titelVon(ids) {
      const r = new Map<string, string>();
      for (const id of ids) { const m = mappen.get(id); if (m) r.set(id, m.titel ?? ''); }
      return r;
    },
    async setzeTitel(liste) { for (const { id, titel } of liste) { const m = mappen.get(id); if (m) m.titel = titel; } },
    async quellenVon(zielIds) {
      const z = new Set(zielIds);
      return [...verweise].filter(([q, vs]) => mappen.has(q) && vs.some((v) => z.has(v.zielId))).map(([q]) => q);
    },
    async ohneTitel() { return [...mappen.values()].filter((m) => m.titel === undefined).map((m) => m.id); },

    async typenVon(ids) {
      const r = new Map<string, string>();
      for (const id of ids) { const m = mappen.get(id); if (m) r.set(id, m.typId); }
      return r;
    },
    async findeDoppelt(typId, feldKey, wert, ausser) {
      const w = wert.trim().toLowerCase();
      const m = [...mappen.values()].find((x) => x.id !== ausser && x.typId === typId && x.werte[feldKey] != null && String(x.werte[feldKey]).trim().toLowerCase() === w);
      return m && kopie(m);
    },
    async rueckverweise(zielId) {
      const r: Rueckverweis[] = [];
      for (const [quelleId, vs] of verweise) for (const v of vs) if (v.zielId === zielId) r.push({ quelleId, quelleTypId: mappen.get(quelleId)!.typId, feldKey: v.feldKey });
      return r;
    },

    async listeDokumente(mappeId) { return [...dokumente.values()].filter((d) => d.mappeId === mappeId).map(kopie).reverse(); },
    async holeDokument(id) { const d = dokumente.get(id); return d && kopie(d); },
    async legeDokumentAn(d) { dokumente.set(d.id, kopie(d)); return kopie(d); },
    async loescheDokument(id) { dokumente.delete(id); },
    async dokumenteMitSha(sha) { return [...dokumente.values()].filter((d) => d.sha256 === sha).map(kopie); },
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
    async loescheDemo() {
      const weg = [...mappen.values()].filter((m) => m.demo).map((m) => m.id);
      const dateien = [...new Set([...dokumente.values()].filter((d) => weg.includes(d.mappeId)).map((d) => d.sha256))];
      for (const id of weg) await this.loescheMappe(id);
      return { anzahl: weg.length, dateien };
    },
    async dokumenteJeRegister(typId) {
      const r = new Map<string, number>();
      for (const d of dokumente.values()) if (mappen.get(d.mappeId)?.typId === typId) r.set(d.registerKey, (r.get(d.registerKey) ?? 0) + 1);
      return r;
    },
  };
}
