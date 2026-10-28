import type { Dokument, Mappe, Mappentyp, MappentypDaten, Werte } from '../../shared/src/model';
import { inSicht, type Sicht, type SichtDaten, type Zaehlquelle } from '../../shared/src/sichten';
import type { PapierkorbEintrag, Repo, Rueckverweis, SortierungIntern, Verweis } from './repo';

/** Repo im Arbeitsspeicher – für Tests und Oberflächenproben, nicht für den Betrieb. */
export function speicherRepo(): Repo {
  const typen = new Map<string, Mappentyp>();
  const mappen = new Map<string, Mappe>();
  const verweise = new Map<string, Verweis[]>();
  const dokumente = new Map<string, Dokument>();
  const sichten = new Map<string, Sicht>();
  /** Papierkorb (#43): Mappe mit ihren Verweisen und Dokumenten, wie beim Löschen. */
  const korb = new Map<string, { mappe: Mappe; verweise: Verweis[]; dokumente: Dokument[]; geloescht: string; geloeschtVon: string | null }>();
  const alsEintrag = (k: { mappe: Mappe; dokumente: Dokument[]; geloescht: string; geloeschtVon: string | null }): PapierkorbEintrag => ({
    id: k.mappe.id, typId: k.mappe.typId, titel: k.mappe.titel ?? '', werte: kopie(k.mappe.werte), demo: !!k.mappe.demo,
    erstellt: k.mappe.erstellt, erstelltVon: k.mappe.erstelltVon, geaendert: k.mappe.geaendert, geaendertVon: k.mappe.geaendertVon,
    geloescht: k.geloescht, geloeschtVon: k.geloeschtVon, dokumente: k.dokumente.length,
  });
  /** Zählt wie PostgreSQL: Dokumente je Register, Rückverweise (ohne sich selbst) je Quelle. */
  const zaehl: Zaehlquelle = {
    dokumente: (id, register) => [...dokumente.values()].filter((d) => d.mappeId === id && d.registerKey === register).length,
    verknuepfungen: (id, quellen) => new Set([...verweise.entries()]
      .filter(([q, vs]) => q !== id && vs.some((v) => v.zielId === id && (!quellen.length || quellen.some((x) => x.typId === mappen.get(q)?.typId && x.feldKey === v.feldKey))))
      .map(([q]) => q)).size,
  };
  const jetzt = () => new Date().toISOString();
  const kopie = <T>(x: T): T => structuredClone(x);
  /** Wie die Sortierung in PostgreSQL: leere Werte immer zuletzt. */
  const wertFuer = (m: Mappe, so: SortierungIntern): string | number | boolean | null => {
    const v = so.key ? m.werte[so.key] : undefined;
    switch (so.art) {
      case 'titel': return (m.titel ?? '').toLowerCase();
      case 'erstellt': return m.erstellt;
      case 'geaendert': return m.geaendert;
      case 'erstelltVon': return m.erstelltVon;
      case 'geaendertVon': return m.geaendertVon;
      case 'typ': return typen.get(m.typId)?.name.toLowerCase() ?? null;
      case 'betrag': return v && typeof v === 'object' && 'betrag' in v ? (v as { betrag: number }).betrag : null;
      case 'zahl': case 'janein': return v == null || v === '' ? null : (v as number | boolean);
      default: return v == null || v === '' ? null : String(v).toLowerCase();
    }
  };
  const vergleiche = (a: Mappe, b: Mappe, so?: SortierungIntern) => {
    if (!so) return 0;
    const x = wertFuer(a, so), y = wertFuer(b, so);
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    const r = x < y ? -1 : 1;
    return so.absteigend ? -r : r;
  };

  return {
    async listeTypen() { return [...typen.values()].map(kopie).sort((a, b) => a.name.localeCompare(b.name, 'de')); },
    async holeTyp(id) { const t = typen.get(id); return t && kopie(t); },
    async legeTypAn(id, d: MappentypDaten, system) {
      const t: Mappentyp = { id, ...kopie(d), erstellenErlaubt: d.erstellenErlaubt !== false, loeschenErlaubt: d.loeschenErlaubt !== false, system: system ?? null, erstellt: jetzt(), geaendert: jetzt() };
      typen.set(id, t);
      return kopie(t);
    },
    async aendereTyp(id, d) {
      const alt = typen.get(id)!;
      const t: Mappentyp = { ...alt, ...kopie(d), erstellenErlaubt: d.erstellenErlaubt !== false, loeschenErlaubt: d.loeschenErlaubt !== false, geaendert: jetzt() };
      typen.set(id, t);
      const refKeys = new Set(t.felder.filter((f) => f.typ === 'referenz').map((f) => f.key));
      for (const m of mappen.values()) if (m.typId === id) verweise.set(m.id, (verweise.get(m.id) ?? []).filter((v) => refKeys.has(v.feldKey)));
      return kopie(t);
    },
    async loescheTyp(id) { typen.delete(id); },
    async zaehleMappen(typId) { return [...mappen.values()].filter((m) => m.typId === typId).length; },

    async listeMappen(typId) { return [...mappen.values()].filter((m) => !typId || m.typId === typId).map(kopie); },
    async holeMappe(id) { const m = mappen.get(id); return m && kopie(m); },
    async legeMappeAn(id, typId, werte: Werte, vs, benutzerId, demo = false, systemKennung = null) {
      const m: Mappe = { id, typId, werte: kopie(werte), erstellt: jetzt(), erstelltVon: benutzerId, geaendert: jetzt(), geaendertVon: benutzerId, demo, passt: true, problem: null, systemKennung };
      mappen.set(id, m); verweise.set(id, kopie(vs));
      return kopie(m);
    },
    async legeMappenAn(liste) {
      const t = jetzt();
      for (const m of liste) {
        mappen.set(m.id, { id: m.id, typId: m.typId, werte: kopie(m.werte), titel: m.titel, erstellt: t, erstelltVon: m.benutzerId, geaendert: t, geaendertVon: m.benutzerId, demo: m.demo, passt: true, problem: null });
        verweise.set(m.id, kopie(m.verweise));
      }
    },
    async aendereMappe(id, werte, vs, benutzerId) {
      const m = { ...mappen.get(id)!, werte: kopie(werte), geaendert: jetzt(), geaendertVon: benutzerId, passt: true, problem: null };
      mappen.set(id, m); verweise.set(id, kopie(vs));
      return kopie(m);
    },
    async holeSystemMappe(kennung) { const m = [...mappen.values()].find((x) => x.systemKennung === kennung); return m && kopie(m); },
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
    async bezuege(ids) {
      const r = new Map<string, { titel: string; typId: string }>();
      for (const id of ids) { const m = mappen.get(id); if (m) r.set(id, { titel: m.titel ?? '', typId: m.typId }); }
      return r;
    },
    async seite(o) {
      const q = o.suche?.toLowerCase();
      const alle = [...mappen.values()]
        .filter((m) => !o.typId || m.typId === o.typId)
        .filter((m) => !o.klauseln || inSicht(m, o.klauseln, zaehl))
        .filter((m) => !o.eingang || (m.passt !== true && (m.erstelltVon === o.eingang.benutzerId || (o.eingang.admin && !m.erstelltVon))))
        .filter((m) => !q || (m.titel ?? '').toLowerCase().includes(q) || Object.values(m.werte).some((v) => !(typeof v === 'string' && v.startsWith('dms1$')) && (typeof v === 'object' ? JSON.stringify(v) : String(v)).toLowerCase().includes(q)))
        .sort((a, b) => vergleiche(a, b, o.sortierung) || (a.titel ?? '').toLowerCase().localeCompare((b.titel ?? '').toLowerCase()) || a.id.localeCompare(b.id));
      return { gesamt: alle.length, mappen: alle.slice(o.von, o.von + o.anzahl).map(kopie) };
    },
    async zaehler(benutzerId, admin) {
      const typen = new Map<string, { anzahl: number; unpassend: number; demo: number }>();
      let eingang = 0;
      for (const m of mappen.values()) {
        const z = typen.get(m.typId) ?? { anzahl: 0, unpassend: 0, demo: 0 };
        z.anzahl++;
        if (m.passt !== true) { z.unpassend++; if (m.erstelltVon === benutzerId || (admin && !m.erstelltVon)) eingang++; }
        if (m.demo) z.demo++;
        typen.set(m.typId, z);
      }
      return { typen, eingang };
    },
    async zaehleKlauseln(liste) { return liste.map((k) => [...mappen.values()].filter((m) => inSicht(m, k, zaehl)).length); },
    async listeSichten() { return [...sichten.values()].map(kopie).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de')); },
    async legeSichtAn(id, d: SichtDaten) { const x: Sicht = { id, ...kopie(d), erstellt: jetzt(), geaendert: jetzt() }; sichten.set(id, x); return kopie(x); },
    async aendereSicht(id, d: SichtDaten) { const x: Sicht = { ...sichten.get(id)!, ...kopie(d), geaendert: jetzt() }; sichten.set(id, x); return kopie(x); },
    async loescheSicht(id) {
      sichten.delete(id);
      for (const x of sichten.values()) if (x.elternId === id) x.elternId = null;
    },
    async setzePassung(liste) { for (const { id, problem } of liste) { const m = mappen.get(id); if (m) { m.passt = problem === null; m.problem = problem; } } },
    async unpassende(typId) { return [...mappen.values()].filter((m) => m.typId === typId && m.passt !== true).map((m) => m.id); },
    async typenOhnePassung() { return [...new Set([...mappen.values()].filter((m) => m.passt === undefined).map((m) => m.typId))]; },
    async belegung(typId) {
      const r: Record<string, number> = {};
      for (const m of mappen.values()) {
        if (m.typId !== typId) continue;
        for (const [k, v] of Object.entries(m.werte)) if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) r[k] = (r[k] ?? 0) + 1;
      }
      return r;
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
      for (const [quelleId, vs] of verweise) for (const v of vs) if (v.zielId === zielId) r.push({ quelleId, quelleTypId: mappen.get(quelleId)!.typId, feldKey: v.feldKey, titel: mappen.get(quelleId)!.titel ?? '' });
      return r.sort((a, b) => a.titel.toLowerCase().localeCompare(b.titel.toLowerCase()));
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
      const imKorb = [...korb.values()].filter((k) => k.mappe.demo);
      for (const k of imKorb) { korb.delete(k.mappe.id); for (const d of k.dokumente) if (!dateien.includes(d.sha256)) dateien.push(d.sha256); }
      return { anzahl: weg.length + imKorb.length, dateien };
    },

    async legeInPapierkorb(id, benutzerId) {
      const m = mappen.get(id);
      if (!m) return;
      korb.set(id, {
        mappe: kopie(m), verweise: kopie(verweise.get(id) ?? []), dokumente: [...dokumente.values()].filter((d) => d.mappeId === id).map(kopie),
        geloescht: jetzt(), geloeschtVon: benutzerId,
      });
      await this.loescheMappe(id);
    },
    async papierkorb(f = {}) {
      return [...korb.values()]
        .filter((k) => (!f.von || k.geloeschtVon === f.von) && (!f.vor || k.geloescht < f.vor) && (!f.typId || k.mappe.typId === f.typId))
        .sort((a, b) => b.geloescht.localeCompare(a.geloescht) || a.mappe.id.localeCompare(b.mappe.id))
        .map(alsEintrag);
    },
    async holeAusPapierkorb(id) { const k = korb.get(id); return k && alsEintrag(k); },
    async stelleWiederHer(id) {
      const k = korb.get(id);
      if (!k) return { verweiseEntfallen: 0 };
      mappen.set(id, kopie(k.mappe));
      const bleiben = k.verweise.filter((v) => mappen.has(v.zielId));
      verweise.set(id, bleiben);
      for (const d of k.dokumente) dokumente.set(d.id, kopie(d));
      korb.delete(id);
      return { verweiseEntfallen: k.verweise.length - bleiben.length };
    },
    async leerePapierkorb(ids) {
      const dateien = new Set<string>();
      for (const id of ids) { const k = korb.get(id); if (!k) continue; for (const d of k.dokumente) dateien.add(d.sha256); korb.delete(id); }
      return [...dateien];
    },
    async zaehlePapierkorb(von) { return [...korb.values()].filter((k) => !von || k.geloeschtVon === von).length; },
    async dateiBenutzt(sha) {
      return [...dokumente.values()].some((d) => d.sha256 === sha) || [...korb.values()].some((k) => k.dokumente.some((d) => d.sha256 === sha));
    },
    async dokumenteJeRegister(typId) {
      const r = new Map<string, number>();
      for (const d of dokumente.values()) if (mappen.get(d.mappeId)?.typId === typId) r.set(d.registerKey, (r.get(d.registerKey) ?? 0) + 1);
      return r;
    },
  };
}
