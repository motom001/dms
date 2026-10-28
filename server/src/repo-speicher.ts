import { randomUUID } from 'node:crypto';
import { TREFFER_ANFANG, TREFFER_ENDE, type Aufgabe, type Ausschnitt, type Dokument, type Historieneintrag, type Mappe, type Notiz, type Mappentyp, type MappentypDaten, type Werte } from '../../shared/src/model';
import { alsText } from '../../shared/src/markdown';
import { ausschnittAus } from './repo-pg';
import { inSicht, type Sicht, type SichtDaten, type Zaehlquelle } from '../../shared/src/sichten';
import type { PapierkorbEintrag, Repo, Rueckverweis, SortierungIntern, Verweis } from './repo';

/** Repo im Arbeitsspeicher – für Tests und Oberflächenproben, nicht für den Betrieb. */
export function speicherRepo(): Repo {
  const typen = new Map<string, Mappentyp>();
  const mappen = new Map<string, Mappe>();
  const verweise = new Map<string, Verweis[]>();
  const dokumente = new Map<string, Dokument>();
  const sichten = new Map<string, Sicht>();
  /** Aufgaben (#54). */
  const aufgaben = new Map<string, Aufgabe>();
  const offenFuer = (m: Mappe, benutzerId: string, admin: boolean) =>
    [...aufgaben.values()].some((a) => a.mappeId === m.id && !a.erledigt && (a.empfaengerId === benutzerId || (admin && !a.empfaengerId)));
  const mitMappe = (a: Aufgabe): Aufgabe => ({ ...kopie(a), mappeTitel: mappen.get(a.mappeId)?.titel ?? '', typId: mappen.get(a.mappeId)?.typId });
  /** Notizen (#55). */
  const notizen = new Map<string, Notiz>();
  /** Änderungshistorie (#57). */
  const historie: Historieneintrag[] = [];
  let historieNr = 0;
  /** Volltext je Dokument (#45). */
  const texte = new Map<string, string | null>();
  /** Grob wie die deutsche Volltextsuche: alle Wörter kommen vor (ohne Groß-/Kleinschreibung). */
  const woerter = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);
  const findet = (text: string | null | undefined, q: string) => !!text && woerter(q).every((w) => text.toLowerCase().includes(w));
  /** Papierkorb (#43): Mappe mit ihren Verweisen und Dokumenten, wie beim Löschen. */
  const korb = new Map<string, { mappe: Mappe; verweise: Verweis[]; dokumente: Dokument[]; notizen?: Notiz[]; aufgaben?: Aufgabe[]; geloescht: string; geloeschtVon: string | null }>();
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
    async beruehreMappe(id, benutzerId) {
      const m = mappen.get(id);
      if (m) mappen.set(id, { ...m, geaendert: jetzt(), geaendertVon: benutzerId });
    },
    async holeSystemMappe(kennung) { const m = [...mappen.values()].find((x) => x.systemKennung === kennung); return m && kopie(m); },
    async loescheMappe(id) {
      mappen.delete(id); verweise.delete(id);
      for (const [k, n] of notizen) if (n.mappeId === id) notizen.delete(k);
      for (const [k, a] of aufgaben) if (a.mappeId === id) aufgaben.delete(k);
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
        .filter((m) => !o.eingang || offenFuer(m, o.eingang.benutzerId, o.eingang.admin))
        .filter((m) => !q || (m.titel ?? '').toLowerCase().includes(q) || Object.values(m.werte).some((v) => !(typeof v === 'string' && v.startsWith('dms1$')) && (typeof v === 'object' ? JSON.stringify(v) : String(v)).toLowerCase().includes(q))
          || (!!o.volltext && [...dokumente.values()].some((d) => d.mappeId === m.id && findet(texte.get(d.id), q)))
          || (!!o.notizen && [...notizen.values()].some((n) => n.mappeId === m.id && n.text.toLowerCase().includes(q))))
        .sort((a, b) => vergleiche(a, b, o.sortierung) || (a.titel ?? '').toLowerCase().localeCompare((b.titel ?? '').toLowerCase()) || a.id.localeCompare(b.id));
      const seite = alle.slice(o.von, o.von + o.anzahl).map(kopie);
      if ((!o.volltext && !o.notizen) || !q) return { gesamt: alle.length, mappen: seite };
      const ausschnitte: Record<string, Ausschnitt> = {};
      if (o.notizen) {
        for (const m of seite) {
          const n = [...notizen.values()].find((x) => x.mappeId === m.id && x.text.toLowerCase().includes(q));
          const t = n ? ausschnittAus(alsText(n.text), q) : null;
          if (t) ausschnitte[m.id] = { dokument: 'Notiz', text: t };
        }
      }
      if (o.volltext) for (const m of seite) {
        if (ausschnitte[m.id]) continue;
        const d = [...dokumente.values()].find((x) => x.mappeId === m.id && findet(texte.get(x.id), q));
        if (!d) continue;
        const text = texte.get(d.id)!;
        const w = woerter(q)[0];
        const i = text.toLowerCase().indexOf(w);
        ausschnitte[m.id] = { dokument: d.name, text: `${text.slice(Math.max(0, i - 40), i)}${TREFFER_ANFANG}${text.slice(i, i + w.length)}${TREFFER_ENDE}${text.slice(i + w.length, i + w.length + 40)}` };
      }
      return { gesamt: alle.length, mappen: seite, ausschnitte };
    },
    async zaehler(benutzerId, admin) {
      const typen = new Map<string, { anzahl: number; unpassend: number; demo: number }>();
      let eingang = 0;
      for (const m of mappen.values()) {
        const z = typen.get(m.typId) ?? { anzahl: 0, unpassend: 0, demo: 0 };
        z.anzahl++;
        if (m.passt !== true) z.unpassend++;
        if (offenFuer(m, benutzerId, admin)) eingang++;
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
    async legeDokumentAn(d) { const n = { ...kopie(d), ocr: d.ocr ?? { stand: 'keiner' as const } }; dokumente.set(d.id, n); return kopie(n); },
    async loescheDokument(id) { dokumente.delete(id); },
    async ocrEinreihen(ids) { for (const id of ids) { const d = dokumente.get(id); if (d) d.ocr = { stand: 'wartet' }; } },
    async ocrNaechster() {
      const d = [...dokumente.values()].filter((x) => x.ocr?.stand === 'wartet').sort((a, b) => a.erstellt.localeCompare(b.erstellt))[0];
      if (!d) return undefined;
      d.ocr = { ...d.ocr!, stand: 'laeuft', zeit: jetzt() };
      return kopie(d);
    },
    async ocrSetze(id, e) {
      const d = dokumente.get(id);
      if (!d) return;
      d.ocr = { stand: e.stand, info: e.info ?? null, seiten: e.seiten ?? null, zeit: jetzt() };
      if (e.text !== undefined) texte.set(id, e.text);
    },
    async ocrVonSha(sha, ausser) {
      const d = [...dokumente.values()].find((x) => x.sha256 === sha && x.id !== ausser && x.ocr?.stand === 'fertig' && texte.get(x.id) != null);
      return d ? { text: texte.get(d.id)!, seiten: d.ocr?.seiten ?? null, info: d.ocr?.info ?? null } : undefined;
    },
    async ocrZurueckstellen() {
      let n = 0;
      for (const d of dokumente.values()) if (d.ocr?.stand === 'laeuft') { d.ocr = { ...d.ocr, stand: 'wartet' }; n++; }
      return n;
    },
    async ocrZaehler() {
      const z = { keiner: 0, wartet: 0, laeuft: 0, fertig: 0, fehler: 0, ausgelassen: 0 };
      for (const d of dokumente.values()) z[d.ocr?.stand ?? 'keiner']++;
      return z;
    },
    async ocrAuftraege({ stand, von, anzahl }) {
      const alle = [...dokumente.values()].filter((d) => (d.ocr?.stand ?? 'keiner') === stand && mappen.has(d.mappeId))
        .sort((a, b) => (b.ocr?.zeit ?? b.erstellt).localeCompare(a.ocr?.zeit ?? a.erstellt));
      return { gesamt: alle.length, eintraege: alle.slice(von, von + anzahl).map((d) => ({ dokument: kopie(d), mappeTitel: mappen.get(d.mappeId)!.titel ?? '', typId: mappen.get(d.mappeId)!.typId })) };
    },
    async ocrOhneVolltext() {
      return [...dokumente.values()].filter((d) => (d.ocr?.stand ?? 'keiner') === 'keiner' && mappen.has(d.mappeId))
        .map((d) => ({ id: d.id, typId: mappen.get(d.mappeId)!.typId, registerKey: d.registerKey }));
    },
    async volltext(id) { return texte.get(id) ?? null; },
    async aufgabenZurPassung(liste) {
      for (const { id, problem } of liste) {
        const offen = [...aufgaben.values()].find((a) => a.mappeId === id && a.art === 'passung' && !a.erledigt);
        if (problem) {
          const text = `Passt nicht zur Definition: ${problem}`;
          if (offen) offen.text = text;
          else if (mappen.has(id)) {
            const nid = randomUUID();
            aufgaben.set(nid, { id: nid, mappeId: id, empfaengerId: mappen.get(id)!.erstelltVon, art: 'passung', text, erstellt: jetzt(), erstelltVon: null, erledigt: null, erledigtVon: null });
          }
        } else if (offen) offen.erledigt = jetzt();
      }
    },
    async legeAufgabeAn(a) { const x = { ...kopie(a), erstellt: jetzt(), erledigt: null, erledigtVon: null }; aufgaben.set(a.id, x); return kopie(x); },
    async holeAufgabe(id) { const a = aufgaben.get(id); return a && kopie(a); },
    async aufgabenVon(mappeId) {
      return [...aufgaben.values()].filter((a) => a.mappeId === mappeId)
        .sort((a, b) => Number(!!a.erledigt) - Number(!!b.erledigt) || b.erstellt.localeCompare(a.erstellt)).map(kopie);
    },
    async offeneAufgaben(f = {}) {
      return [...aufgaben.values()].filter((a) => !a.erledigt && mappen.has(a.mappeId)
        && (!f.benutzerId || a.empfaengerId === f.benutzerId || (!!f.admin && !a.empfaengerId))
        && (!f.mappeIds || f.mappeIds.includes(a.mappeId))).map(mitMappe);
    },
    async erledigteAufgaben(max) {
      return [...aufgaben.values()].filter((a) => a.erledigt && mappen.has(a.mappeId)).sort((a, b) => b.erledigt!.localeCompare(a.erledigt!)).slice(0, max).map(mitMappe);
    },
    async erledigeAufgabe(id, von) { const a = aufgaben.get(id); if (a && !a.erledigt) { a.erledigt = jetzt(); a.erledigtVon = von; } },
    async delegiereAufgabe(id, an) { const a = aufgaben.get(id); if (a) a.empfaengerId = an; },
    async notizen(mappeId) { return [...notizen.values()].filter((n) => n.mappeId === mappeId).sort((a, b) => a.erstellt.localeCompare(b.erstellt)).map(kopie); },
    async holeNotiz(id) { const n = notizen.get(id); return n && kopie(n); },
    async legeNotizAn(n) { const x = { ...kopie(n), erstellt: jetzt(), geaendert: jetzt(), geaendertVon: n.erstelltVon }; notizen.set(n.id, x); return kopie(x); },
    async aendereNotiz(id, text, von) { const n = notizen.get(id)!; n.text = text; n.geaendert = jetzt(); n.geaendertVon = von; return kopie(n); },
    async loescheNotiz(id) { notizen.delete(id); },
    async historieSchreibe(e) {
      for (const x of e) historie.push({ id: ++historieNr, mappeId: x.mappeId, zeit: jetzt(), benutzerId: x.benutzerId, art: x.art, daten: kopie(x.daten ?? {}) });
    },
    async historie(mappeId) { return historie.filter((h) => h.mappeId === mappeId).map(kopie).reverse(); },
    async historieAufraeumen(vor) {
      const weg = new Set(historie.filter((h) => h.art === 'endgueltig' && h.zeit < vor && !mappen.has(h.mappeId) && !korb.has(h.mappeId)).map((h) => h.mappeId));
      const vorher = historie.length;
      for (let i = historie.length - 1; i >= 0; i--) if (weg.has(historie[i].mappeId)) historie.splice(i, 1);
      return vorher - historie.length;
    },

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
        notizen: [...notizen.values()].filter((n) => n.mappeId === id).map(kopie),
        aufgaben: [...aufgaben.values()].filter((a) => a.mappeId === id).map(kopie),
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
      for (const n of k.notizen ?? []) notizen.set(n.id, kopie(n));
      for (const a of k.aufgaben ?? []) aufgaben.set(a.id, kopie(a));
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
