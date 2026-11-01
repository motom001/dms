import { randomUUID } from 'node:crypto';
import { lesbar, werte } from '../../shared/src/rechte';
import type { Erinnerung } from '../../shared/src/fristen';
import { umschluesseleTief } from './tresor';
import { datumIn, ziehe, type Nummernkreis } from '../../shared/src/nummernkreis';
import type { InstalliertesPaket } from '../../shared/src/pakete';
import { standardliste, TREFFER_ANFANG, TREFFER_ENDE, trefferlistenVon, type Aufgabe, type Ausschnitt, type Dokument, type DokumentVersion, type Historieneintrag, type Mappe, type Notiz, type Mappentyp, type MappentypDaten, type Werte } from '../../shared/src/model';
import { alsText } from '../../shared/src/markdown';
import { ausschnittAus } from './repo-pg';
import { teilwoerter, woerterIn } from '../../shared/src/suche';
import { inSicht, type Sicht, type SichtDaten, type Zaehlquelle } from '../../shared/src/sichten';
import type { PapierkorbEintrag, Repo, Rueckverweis, SortierungIntern, Verweis } from './repo';

/** Trefferlisten (#75) immer in beiden Formen: Liste der Trefferlisten und Spalten der Standardliste. */
const listen = (d: MappentypDaten) => ({ trefferlisten: structuredClone(trefferlistenVon(d)), trefferliste: [...standardliste(d).spalten] });

/** Repo im Arbeitsspeicher – für Tests und Oberflächenproben, nicht für den Betrieb. */
export function speicherRepo(): Repo {
  const typen = new Map<string, Mappentyp>();
  const mappen = new Map<string, Mappe>();
  const kreise = new Map<string, Nummernkreis>();
  const pakete = new Map<string, InstalliertesPaket>();
  /** Nummer ziehen (#171); synchron, damit gleichzeitiges Anlegen keine doppelten Nummern ergibt. */
  const zieheSync = (schluessel: string, mappeId: string | null, j: Date) => {
    const k = kreise.get(schluessel);
    if (!k) throw new Error(`Nummernkreis ${schluessel} fehlt`);
    const r = ziehe(k, datumIn(j), mappeId, j.toISOString());
    kreise.set(schluessel, r.kreis);
    return r.nummer;
  };
  const verweise = new Map<string, Verweis[]>();
  const dokumente = new Map<string, Dokument>();
  /** Ältere Versionen (#194) je Dokument, aufsteigend. */
  type V = DokumentVersion & { volltext: string | null };
  const versionen = new Map<string, V[]>();
  const sichten = new Map<string, Sicht>();
  /** Aufgaben (#54). */
  const aufgaben = new Map<string, Aufgabe>();
  /** Favoriten (#62): Benutzer → Mappen. */
  const favoriten = new Map<string, Set<string>>();
  const istFavorit = (mappeId: string, benutzerId: string) => !!favoriten.get(benutzerId)?.has(mappeId);
  const offenFuer = (m: Mappe, benutzerId: string, admin: boolean) =>
    [...aufgaben.values()].some((a) => a.mappeId === m.id && !a.erledigt && (a.empfaengerId === benutzerId || (admin && !a.empfaengerId)));
  const mitMappe = (a: Aufgabe): Aufgabe => ({ ...kopie(a), mappeTitel: mappen.get(a.mappeId)?.titel ?? '', typId: mappen.get(a.mappeId)?.typId });
  /** Notizen (#55). */
  const notizen = new Map<string, Notiz>();
  /** Freie Erinnerungen (#131). */
  const erinnerungen = new Map<string, Erinnerung>();
  const mitMappeE = (e: Erinnerung): Erinnerung => ({ ...kopie(e), mappeTitel: mappen.get(e.mappeId)?.titel ?? '', typId: mappen.get(e.mappeId)?.typId });
  /** Änderungshistorie (#57). */
  const historie: Historieneintrag[] = [];
  let historieNr = 0;
  /** Volltext je Dokument (#45). */
  const texte = new Map<string, string | null>();
  /** Grob wie die deutsche Volltextsuche: alle Wörter kommen vor (ohne Groß-/Kleinschreibung). */
  const woerter = (q: string) => q.toLowerCase().replace(/["„“”]/g, ' ').split(/\s+/).filter(Boolean);
  // Teilwörter (#161): „Ofen“ findet „Backofen“; in Anführungszeichen nur ganze Wörter.
  const findet = (text: string | null | undefined, q: string) => {
    if (!text) return false;
    const teil = teilwoerter(q);
    if (teil) return teil.every((w) => text.toLowerCase().includes(w));
    const im = woerterIn(text);
    return woerter(q).every((w) => im.has(w));
  };
  /** Papierkorb (#43): Mappe mit ihren Verweisen und Dokumenten, wie beim Löschen. */
  /** Einzelne Dokumente im Papierkorb (#344). */
  const dokKorb = new Map<string, { dokument: Dokument; text: string | null; versionen: V[]; geloescht: string; geloeschtVon: string | null }>();
  const alsDokEintrag = (k: { dokument: Dokument; versionen: V[]; geloescht: string; geloeschtVon: string | null }) => ({
    id: k.dokument.id, mappeId: k.dokument.mappeId, registerKey: k.dokument.registerKey, name: k.dokument.name, mime: k.dokument.mime,
    groesse: k.dokument.groesse, sha256: k.dokument.sha256, erstellt: k.dokument.erstellt, erstelltVon: k.dokument.erstelltVon,
    versionen: k.versionen.length, geloescht: k.geloescht, geloeschtVon: k.geloeschtVon,
  });
  const korb = new Map<string, { mappe: Mappe; verweise: Verweis[]; dokumente: Dokument[]; versionen?: Array<[string, V[]]>; notizen?: Notiz[]; aufgaben?: Aufgabe[]; erinnerungen?: Erinnerung[]; geloescht: string; geloeschtVon: string | null }>();
  const alsEintrag = (k: { mappe: Mappe; dokumente: Dokument[]; geloescht: string; geloeschtVon: string | null }): PapierkorbEintrag => ({
    id: k.mappe.id, typId: k.mappe.typId, titel: k.mappe.titel ?? '', werte: kopie(k.mappe.werte), demo: !!k.mappe.demo,
    erstellt: k.mappe.erstellt, erstelltVon: k.mappe.erstelltVon, geaendert: k.mappe.geaendert, geaendertVon: k.mappe.geaendertVon,
    geloescht: k.geloescht, geloeschtVon: k.geloeschtVon, dokumente: k.dokumente.length,
  });
  /** Zählt wie PostgreSQL: Dokumente je Register, Rückverweise (ohne sich selbst) je Quelle. */
  const zaehl: Zaehlquelle = {
    dokumente: (id, register) => [...dokumente.values()].filter((d) => d.mappeId === id && (register === null || d.registerKey === register)).length,
    favorit: (id, benutzer) => istFavorit(id, benutzer),
    aufgabe: (id, benutzer) => [...aufgaben.values()].some((a) => a.mappeId === id && !a.erledigt && a.empfaengerId === benutzer),
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
      const t: Mappentyp = { id, ...kopie(d), ...listen(d), erstellenErlaubt: d.erstellenErlaubt !== false, loeschenErlaubt: d.loeschenErlaubt !== false, system: system ?? null, erstellt: jetzt(), geaendert: jetzt() };
      typen.set(id, t);
      return kopie(t);
    },
    async aendereTyp(id, d) {
      const alt = typen.get(id)!;
      const t: Mappentyp = { ...alt, ...kopie(d), schluessel: alt.schluessel ?? d.schluessel, ...listen(d), erstellenErlaubt: d.erstellenErlaubt !== false, loeschenErlaubt: d.loeschenErlaubt !== false, geaendert: jetzt() };
      typen.set(id, t);
      const refKeys = new Set(t.felder.filter((f) => f.typ === 'referenz').map((f) => f.key));
      for (const m of mappen.values()) if (m.typId === id) verweise.set(m.id, (verweise.get(m.id) ?? []).filter((v) => refKeys.has(v.feldKey)));
      return kopie(t);
    },
    async loescheTyp(id) { typen.delete(id); },
    async zaehleMappen(typId) { return [...mappen.values()].filter((m) => m.typId === typId).length; },

    async mappenKurz() { return [...mappen.values()].map((m) => ({ id: m.id, typId: m.typId, titel: m.titel ?? '' })); },
    async feldwerte(typId, key) { return [...mappen.values()].filter((m) => m.typId === typId && m.werte[key] != null).map((m) => String(m.werte[key])); },
    async listeMappen(typId) { return [...mappen.values()].filter((m) => !typId || m.typId === typId).map(kopie); },
    async holeMappe(id) { const m = mappen.get(id); return m && kopie(m); },
    async legeMappeAn(id, typId, werte: Werte, vs, benutzerId, demo = false, systemKennung = null, nummern) {
      werte = kopie(werte);
      for (const n of nummern?.felder ?? []) werte[n.feldKey] = zieheSync(n.kreis, id, nummern!.jetzt);
      const m: Mappe = { id, typId, werte: kopie(werte), erstellt: jetzt(), erstelltVon: benutzerId, geaendert: jetzt(), geaendertVon: benutzerId, demo, passt: true, problem: null, systemKennung };
      mappen.set(id, m); verweise.set(id, kopie(vs));
      return kopie(m);
    },
    async aktualisiereStatistik() { /* nur PostgreSQL */ },
    async legeMappenAn(liste) {
      const t = jetzt();
      for (const m of liste) {
        mappen.set(m.id, { id: m.id, typId: m.typId, werte: kopie(m.werte), titel: m.titel, erstellt: t, erstelltVon: m.benutzerId, geaendert: t, geaendertVon: m.benutzerId, demo: m.demo, passt: true, problem: null });
        verweise.set(m.id, kopie(m.verweise));
      }
    },
    async listePakete() { return [...pakete.values()].map(kopie).sort((a, b) => a.id.localeCompare(b.id)); },
    async speicherePaket(p) { pakete.set(p.id, kopie(p)); },
    async loeschePaket(id) { pakete.delete(id); },
    async listeNummernkreise() { return [...kreise.values()].map(kopie).sort((a, b) => a.name.localeCompare(b.name, 'de')); },
    async speichereNummernkreis(k) {
      const alt = kreise.get(k.schluessel);
      const neu: Nummernkreis = { staende: {}, zuletzt: [], ...alt, ...kopie(k) };
      kreise.set(k.schluessel, neu);
      return kopie(neu);
    },
    async loescheNummernkreis(s) { kreise.delete(s); },
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
    async zieheNummern(kreis, anzahl, j) { return Array.from({ length: anzahl }, () => zieheSync(kreis, null, j)); },
    async setzeArchivnummer(dokumentId, nummer) {
      const d = dokumente.get(dokumentId);
      if (!d) return false;
      if (nummer && [...dokumente.values()].some((x) => x.id !== dokumentId && x.archivnummer?.toLowerCase() === nummer.toLowerCase())) return false;
      dokumente.set(dokumentId, { ...d, archivnummer: nummer });
      return true;
    },
    async findeArchivnummer(nummer) {
      const d = [...dokumente.values()].find((x) => x.archivnummer?.toLowerCase() === nummer.toLowerCase());
      return d && { ...kopie(d), aeltere: versionen.get(d.id)?.length ?? 0 };
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
      for (const [k, e] of erinnerungen) if (e.mappeId === id) erinnerungen.delete(k);
      for (const [k, d] of dokumente) if (d.mappeId === id) { dokumente.delete(k); versionen.delete(k); }
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
      const tf = o.textfilter?.text.trim() && (o.textfilter.dokumente || o.textfilter.notizen) ? { ...o.textfilter, text: o.textfilter.text.trim().toLowerCase() } : null;
      // Fundstellen: zur Suche oder zum Volltextfilter.
      const fund = o.suche && (o.volltext || o.notizen) ? { volltext: !!o.volltext, notizen: !!o.notizen } : tf ? { volltext: tf.dokumente, notizen: tf.notizen } : null;
      const q = o.suche?.toLowerCase();
      const alle = [...mappen.values()]
        .filter((m) => !o.typId || m.typId === o.typId)
        .filter((m) => !o.klauseln || inSicht(m, o.klauseln, zaehl))
        .filter((m) => !o.eingang || offenFuer(m, o.eingang.benutzerId, o.eingang.admin))
        .filter((m) => !o.favoriten || istFavorit(m.id, o.favoriten.benutzerId))
        .filter((m) => lesbar(o.lesen ?? null, m, zaehl))
        .filter((m) => !q || (m.titel ?? '').toLowerCase().includes(q) || Object.values(m.werte).some((v) => !(typeof v === 'string' && v.startsWith('dms1$')) && (typeof v === 'object' ? JSON.stringify(v) : String(v)).toLowerCase().includes(q))
          || (!!o.volltext && [...dokumente.values()].some((d) => d.mappeId === m.id && findet(texte.get(d.id), q)))
          || (!!o.notizen && [...notizen.values()].some((n) => n.mappeId === m.id && n.text.toLowerCase().includes(q))))
        // Erweiterte Suche (#199): Begriff in Dokumenten oder Notizen – UND mit allem anderen.
        .filter((m) => !tf || (tf.dokumente && [...dokumente.values()].some((d) => d.mappeId === m.id && findet(texte.get(d.id), tf.text)))
          || (tf.notizen && [...notizen.values()].some((n) => n.mappeId === m.id && n.text.toLowerCase().includes(tf.text))))
        .sort((a, b) => vergleiche(a, b, o.sortierung) || (a.titel ?? '').toLowerCase().localeCompare((b.titel ?? '').toLowerCase()) || a.id.localeCompare(b.id));
      const seite = alle.slice(o.von, o.von + o.anzahl).map(kopie);
      if (!fund) return { gesamt: alle.length, mappen: seite };
      const ausschnitte: Record<string, Ausschnitt> = {};
      const q2 = o.suche && (o.volltext || o.notizen) ? q! : tf!.text;
      if (fund.notizen) {
        for (const m of seite) {
          const n = [...notizen.values()].find((x) => x.mappeId === m.id && x.text.toLowerCase().includes(q2));
          const t = n ? ausschnittAus(alsText(n.text), q2) : null;
          if (t) ausschnitte[m.id] = { dokument: 'Notiz', text: t };
        }
      }
      if (fund.volltext) for (const m of seite) {
        if (ausschnitte[m.id]) continue;
        const d = [...dokumente.values()].find((x) => x.mappeId === m.id && findet(texte.get(x.id), q2));
        if (!d) continue;
        const text = texte.get(d.id)!;
        const w = woerter(q2)[0];
        const i = text.toLowerCase().indexOf(w);
        ausschnitte[m.id] = { dokument: d.name, text: `${text.slice(Math.max(0, i - 40), i)}${TREFFER_ANFANG}${text.slice(i, i + w.length)}${TREFFER_ENDE}${text.slice(i + w.length, i + w.length + 40)}` };
      }
      return { gesamt: alle.length, mappen: seite, ausschnitte };
    },
    async zaehler(benutzerId, admin, lesen) {
      const typen = new Map<string, { anzahl: number; unpassend: number; demo: number }>();
      let eingang = 0;
      for (const m of mappen.values()) {
        if (!lesbar(lesen ?? null, m, zaehl)) continue;
        const z = typen.get(m.typId) ?? { anzahl: 0, unpassend: 0, demo: 0 };
        z.anzahl++;
        if (m.passt !== true) z.unpassend++;
        if (offenFuer(m, benutzerId, admin)) eingang++;
        if (m.demo) z.demo++;
        typen.set(m.typId, z);
      }
      return { typen, eingang, favoriten: [...(favoriten.get(benutzerId) ?? [])].filter((id) => mappen.has(id) && lesbar(lesen ?? null, mappen.get(id)!, zaehl)).length };
    },
    async zaehleKlauseln(liste, lesen) { return liste.map((k) => [...mappen.values()].filter((m) => inSicht(m, k, zaehl) && lesbar(lesen ?? null, m, zaehl)).length); },
    async lesbare(ids, lesen) { return new Set(ids.filter((id) => mappen.has(id) && lesbar(lesen, mappen.get(id)!, zaehl))); },
    async inKlauseln(ids, klauseln) { return new Set(ids.filter((id) => mappen.has(id) && inSicht(mappen.get(id)!, klauseln, zaehl))); },
    async zaehleAusdruck(typId, x) { return [...mappen.values()].filter((m) => m.typId === typId && werte(x, m, zaehl)).length; },
    async setzeTypSchluessel(typId, schluessel) { const t = typen.get(typId); if (t && !t.schluessel) t.schluessel = schluessel; },
    async setzeBerechtigungen(typId, rw) { const t = typen.get(typId)!; t.berechtigungen = rw ? kopie(rw) : null; t.geaendert = jetzt(); return kopie(t); },
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

    async listeDokumente(mappeId) { return [...dokumente.values()].filter((d) => d.mappeId === mappeId).map((d) => ({ ...kopie(d), aeltere: versionen.get(d.id)?.length ?? 0 })).reverse(); },
    async dokumenteVon(mappeIds) {
      const ids = new Set(mappeIds);
      return [...dokumente.values()].filter((d) => ids.has(d.mappeId)).map((d) => ({ ...kopie(d), aeltere: versionen.get(d.id)?.length ?? 0 })).reverse();
    },
    async holeDokument(id) { const d = dokumente.get(id); return d && { ...kopie(d), aeltere: versionen.get(d.id)?.length ?? 0 }; },
    async legeDokumentAn(d) { const n = { version: 1, herkunft: null, ...kopie(d), archivnummer: null, ocr: d.ocr ?? { stand: 'keiner' as const } }; dokumente.set(d.id, n); return kopie(n); },
    async loescheDokument(id) { dokumente.delete(id); versionen.delete(id); },
    async versionenVon(id) { return [...(versionen.get(id) ?? [])].reverse().map(({ volltext: _v, ...x }) => kopie(x)); },
    async versionenVonDokumenten(ids) { return [...new Set(ids)].flatMap((id) => [...(versionen.get(id) ?? [])].reverse().map(({ volltext: _v, ...x }) => kopie(x))); },
    async holeVersion(id, nummer) { const v = versionen.get(id)?.find((x) => x.nummer === nummer); return v && kopie(v); },
    async ersetzeDokument(id, neu) {
      const alt = dokumente.get(id);
      if (!alt) throw new Error('Dokument fehlt');
      const nummer = alt.version ?? 1;
      versionen.set(id, [...(versionen.get(id) ?? []), {
        dokumentId: id, nummer, name: alt.name, mime: alt.mime, groesse: alt.groesse, sha256: alt.sha256, anzeigbar: alt.anzeigbar,
        erstellt: alt.erstellt, erstelltVon: alt.erstelltVon, herkunft: alt.herkunft ?? null, volltext: texte.get(id) ?? null,
      }]);
      const uebernehmen = neu.volltext !== undefined && neu.volltext !== null;
      texte.set(id, uebernehmen ? neu.volltext! : null);
      const d: Dokument = { ...alt, name: neu.name, mime: neu.mime, groesse: neu.groesse, sha256: neu.sha256, anzeigbar: neu.anzeigbar, erstellt: jetzt(), erstelltVon: neu.erstelltVon, herkunft: neu.herkunft, version: nummer + 1, ocr: { stand: uebernehmen ? 'fertig' : 'keiner' } };
      dokumente.set(id, d);
      return { ...kopie(d), aeltere: versionen.get(id)!.length };
    },
    async alleDateien() {
      return [...dokumente.values()].flatMap((d) => [
        { sha256: d.sha256, groesse: d.groesse, dokumentId: d.id, mappeId: d.mappeId, name: d.name, version: d.version ?? 1 },
        ...(versionen.get(d.id) ?? []).map((v) => ({ sha256: v.sha256, groesse: v.groesse, dokumentId: d.id, mappeId: d.mappeId, name: v.name, version: v.nummer })),
      ]);
    },
    async kuerzeVersionen(id, behalten) {
      const v = versionen.get(id) ?? [];
      const weg = v.slice(0, Math.max(0, v.length - Math.max(0, behalten)));
      versionen.set(id, v.slice(weg.length));
      return [...new Set(weg.map((x) => x.sha256))];
    },
    async verschiebeDokument(id, mappeId, registerKey) { const d = dokumente.get(id); if (d) { d.mappeId = mappeId; d.registerKey = registerKey; } },
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
    async volltexte(ids) {
      const r = new Map<string, string>();
      for (const id of ids) { const t = texte.get(id); if (t != null) r.set(id, t); }
      return r;
    },
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
    async aufgabenVonMappen(mappeIds) {
      const ids = new Set(mappeIds);
      return [...aufgaben.values()].filter((a) => ids.has(a.mappeId))
        .sort((a, b) => a.mappeId.localeCompare(b.mappeId) || Number(!!a.erledigt) - Number(!!b.erledigt) || b.erstellt.localeCompare(a.erstellt)).map(kopie);
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
    async fristAufgaben(mappeIds) {
      return [...aufgaben.values()].filter((a) => a.art === 'frist' && mappen.has(a.mappeId) && (!mappeIds || mappeIds.includes(a.mappeId)))
        .sort((a, b) => a.erstellt.localeCompare(b.erstellt)).map(mitMappe);
    },
    async umschluesseln(um) {
      // Arbeitsspeicher: Mappen und Papierkorb (Einstellungen liegen anderswo); erst rechnen, dann schreiben.
      let umgeschluesselt = 0; let unlesbar = 0;
      const neu = [...mappen.values()].map((m) => { const x = umschluesseleTief(m.werte, um); umgeschluesselt += x.geaendert; unlesbar += x.unlesbar; return [m, x.wert] as const; });
      const korbNeu = [...korb.values()].map((k) => { const x = umschluesseleTief(k.mappe.werte, um); umgeschluesselt += x.geaendert; unlesbar += x.unlesbar; return [k, x.wert] as const; });
      for (const [m, w] of neu) m.werte = w;
      for (const [k, w] of korbNeu) k.mappe.werte = w;
      return { umgeschluesselt, unlesbar };
    },
    async erinnerungen(f = {}) {
      return [...erinnerungen.values()].filter((e) => mappen.has(e.mappeId) && (!f.mappeId || e.mappeId === f.mappeId)
        && (!f.empfaengerId || e.empfaengerId === f.empfaengerId) && (!f.bis || e.datum <= f.bis))
        .sort((a, b) => a.datum.localeCompare(b.datum) || a.erstellt.localeCompare(b.erstellt)).map(mitMappeE);
    },
    async holeErinnerung(id) { const e = erinnerungen.get(id); return e && kopie(e); },
    async legeErinnerungAn(e) { const x = { ...kopie(e), erstellt: jetzt() }; erinnerungen.set(e.id, x); return kopie(x); },
    async aendereErinnerung(id, e) { const x = erinnerungen.get(id); if (!x) return undefined; Object.assign(x, e); return kopie(x); },
    async loescheErinnerung(id) { erinnerungen.delete(id); },
    async notizen(mappeId) { return [...notizen.values()].filter((n) => n.mappeId === mappeId).sort((a, b) => a.erstellt.localeCompare(b.erstellt)).map(kopie); },
    async notizenVon(mappeIds) {
      const ids = new Set(mappeIds);
      return [...notizen.values()].filter((n) => ids.has(n.mappeId)).sort((a, b) => a.mappeId.localeCompare(b.mappeId) || a.erstellt.localeCompare(b.erstellt)).map(kopie);
    },
    async holeNotiz(id) { const n = notizen.get(id); return n && kopie(n); },
    async legeNotizAn(n) { const x = { ...kopie(n), erstellt: jetzt(), geaendert: jetzt(), geaendertVon: n.erstelltVon }; notizen.set(n.id, x); return kopie(x); },
    async aendereNotiz(id, text, von) { const n = notizen.get(id)!; n.text = text; n.geaendert = jetzt(); n.geaendertVon = von; return kopie(n); },
    async loescheNotiz(id) { notizen.delete(id); },
    async historieSchreibe(e) {
      for (const x of e) historie.push({ id: ++historieNr, mappeId: x.mappeId, zeit: jetzt(), benutzerId: x.benutzerId, art: x.art, daten: kopie(x.daten ?? {}) });
    },
    async historie(mappeId) { return historie.filter((h) => h.mappeId === mappeId).map(kopie).reverse(); },
    async historieVon(mappeIds) { const ids = new Set(mappeIds); return historie.filter((h) => ids.has(h.mappeId)).map(kopie).reverse(); },
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
    async loescheDemo(max) {
      const alle = [...mappen.values()].filter((m) => m.demo).map((m) => m.id);
      const weg = max ? alle.slice(0, max) : alle;
      const wegSet = new Set(weg);
      const dateien = [...new Set([...dokumente.values()].filter((d) => wegSet.has(d.mappeId)).map((d) => d.sha256))];
      for (const id of weg) await this.loescheMappe(id);
      if (max && weg.length === max) return { anzahl: weg.length, dateien };
      const imKorb = [...korb.values()].filter((k) => k.mappe.demo);
      for (const k of imKorb) { korb.delete(k.mappe.id); for (const d of k.dokumente) if (!dateien.includes(d.sha256)) dateien.push(d.sha256); }
      return { anzahl: weg.length + imKorb.length, dateien };
    },

    async setzeFavorit(benutzerId, mappeId, an) {
      const s = favoriten.get(benutzerId) ?? new Set<string>();
      if (an) s.add(mappeId); else s.delete(mappeId);
      favoriten.set(benutzerId, s);
    },
    async alleFavoriten() { return [...favoriten].flatMap(([benutzerId, s]) => [...s].filter((m) => mappen.has(m)).map((mappeId) => ({ benutzerId, mappeId }))); },
    async favoritenVon(benutzerId, mappeIds) { return new Set(mappeIds.filter((id) => istFavorit(id, benutzerId) && mappen.has(id))); },
    async legeInPapierkorb(id, benutzerId) {
      const m = mappen.get(id);
      if (!m) return;
      korb.set(id, {
        mappe: kopie(m), verweise: kopie(verweise.get(id) ?? []), dokumente: [...dokumente.values()].filter((d) => d.mappeId === id).map(kopie),
        versionen: [...dokumente.values()].filter((d) => d.mappeId === id && versionen.has(d.id)).map((d) => [d.id, kopie(versionen.get(d.id)!)] as [string, V[]]),
        notizen: [...notizen.values()].filter((n) => n.mappeId === id).map(kopie),
        aufgaben: [...aufgaben.values()].filter((a) => a.mappeId === id).map(kopie),
        erinnerungen: [...erinnerungen.values()].filter((e) => e.mappeId === id).map(kopie),
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
      for (const [d, v] of k.versionen ?? []) versionen.set(d, kopie(v));
      for (const n of k.notizen ?? []) notizen.set(n.id, kopie(n));
      for (const a of k.aufgaben ?? []) aufgaben.set(a.id, kopie(a));
      for (const e of k.erinnerungen ?? []) erinnerungen.set(e.id, kopie(e));
      korb.delete(id);
      return { verweiseEntfallen: k.verweise.length - bleiben.length };
    },
    async leerePapierkorb(ids) {
      const dateien = new Set<string>();
      for (const id of ids) {
        const k = korb.get(id); if (!k) continue;
        for (const d of k.dokumente) dateien.add(d.sha256);
        for (const [, v] of k.versionen ?? []) for (const x of v) dateien.add(x.sha256);
        korb.delete(id);
      }
      return [...dateien];
    },
    async zaehlePapierkorb(von) { return [...korb.values(), ...dokKorb.values()].filter((k) => !von || k.geloeschtVon === von).length; },
    async legeDokumentInPapierkorb(id, benutzerId) {
      const d = dokumente.get(id);
      if (!d) return;
      dokKorb.set(id, { dokument: kopie(d), text: texte.get(id) ?? null, versionen: kopie(versionen.get(id) ?? []), geloescht: jetzt(), geloeschtVon: benutzerId });
      dokumente.delete(id); versionen.delete(id); texte.delete(id);
    },
    async papierkorbDokumente(f = {}) {
      return [...dokKorb.values()]
        .filter((k) => (!f.von || k.geloeschtVon === f.von) && (!f.vor || k.geloescht < f.vor) && (!f.mappeIds || f.mappeIds.includes(k.dokument.mappeId)))
        .sort((a, b) => b.geloescht.localeCompare(a.geloescht) || a.dokument.id.localeCompare(b.dokument.id))
        .map(alsDokEintrag);
    },
    async holeDokumentAusPapierkorb(id) { const k = dokKorb.get(id); return k && alsDokEintrag(k); },
    async stelleDokumentWiederHer(id) {
      const k = dokKorb.get(id);
      if (!k) return;
      if (!mappen.has(k.dokument.mappeId)) throw new Error('Mappe fehlt');
      const nr = k.dokument.archivnummer?.toLowerCase();
      const belegt = !!nr && [...dokumente.values()].some((x) => x.archivnummer?.toLowerCase() === nr);
      dokumente.set(id, { ...kopie(k.dokument), ...(belegt ? { archivnummer: null } : {}) });
      if (k.versionen.length) versionen.set(id, kopie(k.versionen));
      texte.set(id, k.text);
      dokKorb.delete(id);
    },
    async leereDokumentPapierkorb(ids) {
      const dateien = new Set<string>();
      for (const id of ids) {
        const k = dokKorb.get(id); if (!k) continue;
        dateien.add(k.dokument.sha256);
        for (const v of k.versionen) dateien.add(v.sha256);
        dokKorb.delete(id);
      }
      return [...dateien];
    },
    async dateiBenutzt(sha) {
      if ([...dokKorb.values()].some((k) => k.dokument.sha256 === sha || k.versionen.some((v) => v.sha256 === sha))) return true;
      return [...dokumente.values()].some((d) => d.sha256 === sha) || [...versionen.values()].some((v) => v.some((x) => x.sha256 === sha))
        || [...korb.values()].some((k) => k.dokumente.some((d) => d.sha256 === sha) || (k.versionen ?? []).some(([, v]) => v.some((x) => x.sha256 === sha)));
    },
    async dokumenteJeRegister(typId) {
      const r = new Map<string, number>();
      for (const d of dokumente.values()) if (mappen.get(d.mappeId)?.typId === typId) r.set(d.registerKey, (r.get(d.registerKey) ?? 0) + 1);
      return r;
    },
  };
}
