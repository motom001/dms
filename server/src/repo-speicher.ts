import { volltextHerkunft } from '../../shared/src/volltext';
import { randomUUID } from 'node:crypto';
import { lesbar, werte } from '../../shared/src/rechte';
import { kannTerminHaben, type Erinnerung } from '../../shared/src/fristen';
import { umschluesseleTief } from './tresor';
import { datumIn, ziehe, type Nummernkreis } from '../../shared/src/nummernkreis';
import type { InstalliertesPaket } from '../../shared/src/pakete';
import { standardliste, TREFFER_ANFANG, TREFFER_ENDE, trefferlistenVon, type Aufgabe, type Ausschnitt, type Dokument, type FallOhneLeserecht, type DokumentVersion, type Historieneintrag, type Mappe, type Notiz, type Mappentyp, type MappentypDaten, type Werte } from '../../shared/src/model';
import { alsText } from '../../shared/src/markdown';
import { teileKennung } from '../../shared/src/kennungen';
import { SPRACHE_MARKE, spracheAusInfo } from '../../shared/src/textsprache';
import { teilenAb, type Seitensprache } from '../../shared/src/seitensprachen';
import { ausschnittAus } from './repo-pg';
import { aehnlichkeit, AEHNLICH_AB, falte, normal, suchbegriffe, teilwoerter, TIPPFEHLER_MIN, woerterIn, type Varianten } from '../../shared/src/suche';
import { inSicht, type Sicht, type SichtDaten, type Zaehlquelle } from '../../shared/src/sichten';
import { istZeitraum, zeitraumTage } from '../../shared/src/feldarten';
import { feldweise, KonfigurationVeraltet, StandVeraltet, type AuskunftLinkIntern, type PapierkorbEintrag, type Repo, type Rueckverweis, type SortierungIntern, type Synonymgruppe, type Verweis } from './repo';
import { passt as passtLoesch, type LoeschDokument, type LoeschEintrag } from '../../shared/src/loeschprotokoll';
import { t } from './sprache';

/** Trefferlisten (#75) immer in beiden Formen: Liste der Trefferlisten und Spalten der Standardliste. */
const listen = (d: MappentypDaten) => ({ trefferlisten: structuredClone(trefferlistenVon(d)), trefferliste: [...standardliste(d).spalten] });

/** Repo im Arbeitsspeicher – für Tests und Oberflächenproben, nicht für den Betrieb. */
export function speicherRepo(): Repo {
  const typen = new Map<string, Mappentyp>();
  const mappen = new Map<string, Mappe>();
  const kreise = new Map<string, Nummernkreis>();
  const links = new Map<string, AuskunftLinkIntern>();
  const pakete = new Map<string, InstalliertesPaket>();
  const paketCode = new Map<string, Array<{ name: string; inhalt: Buffer }>>();
  const sprachpakete = new Map<string, import('./repo').SprachpaketDaten>();
  const ereignisse = new Map<string, { id: string; paketId: string; art: string; daten: Record<string, unknown>; erstellt: string; faellig: number; versuche: number; zugestellt: string | null; fehler: string | null }>();
  // Ereigniskatalog (#670)
  const katalog = new Map<string, { id: string; nr: number; art: string; daten: Record<string, unknown>; ausloeser: Record<string, unknown>; buendel: string | null; erstellt: string; faellig: number; gesperrtBis: number; versuche: number; fehler: string | null; verteilt: string | null }>();
  let katalogNr = 0;
  const fristMeldungen = new Set<string>();
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
  /** Seitensprachen je Dokument (#579). */
  const seitenSpr = new Map<string, Seitensprache[]>();
  /** Ältere Versionen (#194) je Dokument, aufsteigend. */
  type V = DokumentVersion & { volltext: string | null };
  const versionen = new Map<string, V[]>();
  const sichten = new Map<string, Sicht>();
  /** Aufgaben (#54). */
  const aufgaben = new Map<string, Aufgabe>();
  /** Favoriten (#62): Benutzer → Mappen. */
  const favoriten = new Map<string, Set<string>>();
  const istFavorit = (mappeId: string, benutzerId: string) => !!favoriten.get(benutzerId)?.has(mappeId);
  // Favorit = Abo (#422): seit wann Favorit, ausgeschaltete Benachrichtigung, zuletzt gesehen – je „Benutzer|Mappe“.
  const favoritSeit = new Map<string, string>();
  const favoritStumm = new Set<string>();
  const gesehen = new Map<string, string>();
  // Zähler-Endpunkt (#625): Stand der Zahlen je Benutzer.
  const zaehlerstaende = new Map<string, { stand: number; abdruck: string; geaendert: string }>();
  // Erkennung (#336): Ergebnis je Post.
  const erkennungen = new Map<string, { ergebnis: unknown; absenderId: string | null; zeit: string }>();
  const offenFuer = (m: Mappe, benutzerId: string, admin: boolean) =>
    [...aufgaben.values()].some((a) => a.mappeId === m.id && !a.erledigt && (a.empfaengerId === benutzerId || (admin && !a.empfaengerId)));
  const mitMappe = (a: Aufgabe): Aufgabe => ({ ...kopie(a), mappeTitel: mappen.get(a.mappeId)?.titel ?? '', typId: mappen.get(a.mappeId)?.typId });
  /** Aufgaben bei Personen ohne Leserecht (#798). */
  const faelle = new Map<string, FallOhneLeserecht>();
  const mitMappeF = (f: FallOhneLeserecht): FallOhneLeserecht => {
    const m = mappen.get(f.mappeId);
    return m ? { ...kopie(f), mappeTitel: m.titel ?? '', typId: m.typId } : kopie(f);
  };
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
  const vektoren = new Map<string, { dokumentId: string; paket: string; modell: string; vektor: Float32Array }>();
  /** Grob wie die deutsche Volltextsuche: alle Wörter kommen vor (ohne Groß-/Kleinschreibung). */
  const woerter = (q: string) => q.toLowerCase().replace(/["„“”]/g, ' ').split(/\s+/).filter(Boolean);
  // Teilwörter (#161): „Ofen“ findet „Backofen“; in Anführungszeichen nur ganze Wörter.
  // Unscharfe Suche (#356): gefaltet (Umlaute, ß), Bindestriche egal, je Begriff auch seine Varianten.
  const findet = (text: string | null | undefined, q: string, v: Varianten = {}) => {
    if (!text) return false;
    const teil = teilwoerter(q);
    const b = suchbegriffe(q);
    if (b) {
      const flach = normal(text);
      const im = new Set([...woerterIn(falte(text))].concat([...woerterIn(flach)]));
      return b.every((w) => [w, ...(v[falte(w)] ?? [])].some((x) => (teil ? flach.includes(normal(x)) : normal(x).split(/[^\p{L}\p{N}]+/u).filter(Boolean).every((y) => im.has(y)))));
    }
    if (teil) return teil.every((w) => text.toLowerCase().includes(w));
    const im = woerterIn(text);
    return woerter(q).every((w) => im.has(w));
  };
  /** Kommt der Text (bzw. bei einem Begriff eine seiner Varianten) vor – ohne Umlaute, Groß-/Kleinschreibung, Bindestriche? */
  const enthaelt = (wert: string, q: string, v: Varianten = {}) => {
    const b = suchbegriffe(q);
    return (b?.length === 1 ? [q, ...(v[falte(b[0])] ?? [])] : [q]).some((x) => normal(wert).includes(normal(x)));
  };
  const synonymListe: Synonymgruppe[] = [];
  /** Wörter aus Titeln, Werten, Notizen und Volltexten mit ihrer Häufigkeit (wie dms_woerter in PostgreSQL). */
  const alleWoerter = () => {
    const n = new Map<string, number>();
    const dazu = (t: string) => { for (const w of falte(t).split(/[^0-9a-zа-яёіїєґ]+/)) if (w.length >= 4 && w.length <= 40 && !/^\d+$/.test(w)) n.set(w, (n.get(w) ?? 0) + 1); };
    for (const m of mappen.values()) { dazu(m.titel ?? ''); for (const v of Object.values(m.werte)) if (!(typeof v === 'string' && v.startsWith('dms1$'))) dazu(typeof v === 'object' ? JSON.stringify(v) : String(v)); }
    for (const t of texte.values()) if (t) dazu(t);
    return n;
  };
  /** Löschprotokoll (#470): nur anfügen. */
  const loeschprotokoll: LoeschEintrag[] = [];
  const loeschDok = (d: Dokument): LoeschDokument => ({ dokumentId: d.id, version: d.version ?? 1, sha256: d.sha256, groesse: d.groesse, mime: d.mime, seiten: d.ocr?.seiten ?? null, archivnummer: d.archivnummer ?? null });
  const loeschVersion = (v: V): LoeschDokument => ({ dokumentId: v.dokumentId, version: v.nummer, sha256: v.sha256, groesse: v.groesse, mime: v.mime, seiten: null, archivnummer: null });
  /** Papierkorb (#43): Mappe mit ihren Verweisen und Dokumenten, wie beim Löschen. */
  /** Einzelne Dokumente im Papierkorb (#344). */
  const dokKorb = new Map<string, { dokument: Dokument; text: string | null; versionen: V[]; geloescht: string; geloeschtVon: string | null }>();
  const alsDokEintrag = (k: { dokument: Dokument; versionen: V[]; geloescht: string; geloeschtVon: string | null }) => ({
    id: k.dokument.id, mappeId: k.dokument.mappeId, registerKey: k.dokument.registerKey, name: k.dokument.name, mime: k.dokument.mime,
    groesse: k.dokument.groesse, sha256: k.dokument.sha256, erstellt: k.dokument.erstellt, erstelltVon: k.dokument.erstelltVon,
    versionen: k.versionen.length, geloescht: k.geloescht, geloeschtVon: k.geloeschtVon,
  });
  const korb = new Map<string, { mappe: Mappe; verweise: Verweis[]; dokumente: Dokument[]; versionen?: Array<[string, V[]]>; notizen?: Notiz[]; aufgaben?: Aufgabe[]; erinnerungen?: Erinnerung[]; geloescht: string; geloeschtVon: string | null; vorgang?: string | null; entkoppelt?: Array<{ quelleId: string; feldKey: string }> }>();
  const alsEintrag = (k: { mappe: Mappe; dokumente: Dokument[]; geloescht: string; geloeschtVon: string | null; vorgang?: string | null; entkoppelt?: Array<{ quelleId: string; feldKey: string }> }): PapierkorbEintrag => ({
    id: k.mappe.id, typId: k.mappe.typId, titel: k.mappe.titel ?? '', werte: kopie(k.mappe.werte), demo: !!k.mappe.demo,
    erstellt: k.mappe.erstellt, erstelltVon: k.mappe.erstelltVon, geaendert: k.mappe.geaendert, geaendertVon: k.mappe.geaendertVon,
    geloescht: k.geloescht, geloeschtVon: k.geloeschtVon, dokumente: k.dokumente.length,
    vorgang: k.vorgang ?? null, entkoppelt: kopie(k.entkoppelt ?? []),
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
  /** „Zuletzt geändert“ (#609): bei jedem Schreiben mindestens eine Millisekunde später als vorher. */
  const standWeiter = (vorher: string) => new Date(Math.max(Date.now(), Date.parse(vorher) + 1)).toISOString();
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
      case 'zeitraum': return istZeitraum(v) ? zeitraumTage(v) : null;
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

  // Paket der Kennung (#1084): wie in PostgreSQL getrennt – abgeleitet aus `paket:schluessel`, nie aus der Eingabe.
  const ohnePaket = <T extends object>(d: T): T => { const { paket: _p, ...rest } = d as T & { paket?: string }; return rest as T; };
  const mitPaket = (t: Mappentyp): Mappentyp => {
    const p = t.schluessel ? teileKennung(t.schluessel).paket : null;
    if (p) t.paket = p; else delete t.paket;
    return t;
  };
  return {
    async listeTypen() { return [...typen.values()].map(kopie).sort((a, b) => a.name.localeCompare(b.name, 'de')); },
    async holeTyp(id) { const t = typen.get(id); return t && kopie(t); },
    async legeTypAn(id, d: MappentypDaten, system) {
      const t: Mappentyp = { id, ...ohnePaket(kopie(d)), ...listen(d), erstellenErlaubt: d.erstellenErlaubt !== false, loeschenErlaubt: d.loeschenErlaubt !== false, system: system ?? null, erstellt: jetzt(), geaendert: jetzt() };
      typen.set(id, mitPaket(t));
      return kopie(t);
    },
    async aendereTyp(id, d, erwartet) {
      const alt = typen.get(id)!;
      if (erwartet !== undefined && alt.geaendert !== erwartet) throw new KonfigurationVeraltet();
      const t: Mappentyp = { ...alt, ...ohnePaket(kopie(d)), paket: alt.paket, schluessel: alt.schluessel ?? d.schluessel, ...listen(d), erstellenErlaubt: d.erstellenErlaubt !== false, loeschenErlaubt: d.loeschenErlaubt !== false, geaendert: standWeiter(alt.geaendert) };
      typen.set(id, mitPaket(t));
      const refKeys = new Set(t.felder.filter((f) => f.typ === 'referenz').map((f) => f.key));
      for (const m of mappen.values()) if (m.typId === id) verweise.set(m.id, (verweise.get(m.id) ?? []).filter((v) => refKeys.has(v.feldKey)));
      return kopie(t);
    },
    async loescheTyp(id) { typen.delete(id); },
    async zaehleMappen(typId) { return [...mappen.values()].filter((m) => m.typId === typId).length; },

    async mappenKurz() { return [...mappen.values()].map((m) => ({ id: m.id, typId: m.typId, titel: m.titel ?? '' })); },
    async feldwerte(typId, key) { return [...mappen.values()].filter((m) => m.typId === typId && m.werte[key] != null).map((m) => String(m.werte[key])); },
    async listeMappen(typId) { return [...mappen.values()].filter((m) => !typId || m.typId === typId).map(kopie); },
    async mappenMitDatum(typId, felder, von, bis) {
      return [...mappen.values()].filter((m) => m.typId === typId && felder.some((k) => { const w = m.werte[k]; return typeof w === 'string' && w >= von && w <= bis; })).map(kopie);
    },
    async fristKandidaten(typId, felder, ab, bis) {
      // Wie PostgreSQL (#918): Vorfilter über die Datumswerte (JJJJ-MM-TT), nur die Werte dieser Felder.
      return [...mappen.values()].filter((m) => m.typId === typId && felder.some((f) => {
        const w = m.werte[f.key];
        return typeof w === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(w) && kannTerminHaben(w, f.monate, ab, bis);
      })).map((m) => ({ id: m.id, typId: m.typId, titel: m.titel ?? null, werte: Object.fromEntries(felder.filter((f) => f.key in m.werte).map((f) => [f.key, kopie(m.werte[f.key])])) }));
    },
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
    transaktion(f) { return f(this); },
    async listePakete() { return [...pakete.values()].map(kopie).sort((a, b) => a.id.localeCompare(b.id)); },
    async speicherePaket(p) { pakete.set(p.id, kopie(p)); },
    async loeschePaket(id) { pakete.delete(id); },
    async speicherePaketCode(id, dateien) { paketCode.set(id, dateien.map((d) => ({ name: d.name, inhalt: Buffer.from(d.inhalt) }))); },
    async paketCode(id) { return (paketCode.get(id) ?? []).map((d) => ({ name: d.name, inhalt: Buffer.from(d.inhalt) })); },
    async loeschePaketCode(id) { paketCode.delete(id); },
    async speichereSprachpaket(id, d) { sprachpakete.set(id, structuredClone(d)); },
    async sprachpakete() { return [...sprachpakete].sort(([a], [b]) => a.localeCompare(b)).map(([paketId, d]) => ({ paketId, ...structuredClone(d) })); },
    async loescheSprachpaket(id) { sprachpakete.delete(id); },
    async legeEreignisseAn(liste) {
      // Gleiche Id = schon angelegt (#670: Ereignisse aus dem Katalog kommen mindestens einmal).
      for (const e of liste) if (!ereignisse.has(e.id)) ereignisse.set(e.id, { ...e, daten: kopie(e.daten), erstellt: jetzt(), faellig: Date.now(), versuche: 0, zugestellt: null, fehler: null });
    },
    async faelligeEreignisse(anzahl) {
      const t = Date.now();
      const alle = [...ereignisse.values()];
      // Reihenfolge je Paket: Wartet ein älteres Ereignis auf seine Wiederholung, warten die späteren mit.
      const blockiert = (e: typeof alle[number]) => alle.some((a) => a.paketId === e.paketId && !a.zugestellt && a.faellig > t && a.faellig !== Number.POSITIVE_INFINITY && a.erstellt < e.erstellt);
      return alle.filter((e) => !e.zugestellt && e.faellig <= t && !blockiert(e)).sort((a, b) => a.erstellt.localeCompare(b.erstellt)).slice(0, anzahl)
        .map((e) => ({ id: e.id, paketId: e.paketId, art: e.art, daten: kopie(e.daten), erstellt: e.erstellt, versuche: e.versuche }));
    },
    async ereignisZugestellt(id) {
      const e = ereignisse.get(id); if (e) e.zugestellt = jetzt();
      const t = Date.now();
      for (const [k, x] of ereignisse) if ((x.zugestellt && Date.parse(x.zugestellt) < t - 7 * 864e5) || (!x.zugestellt && x.faellig === Number.POSITIVE_INFINITY && Date.parse(x.erstellt) < t - 30 * 864e5)) ereignisse.delete(k);
    },
    async ereignisFehlgeschlagen(id, fehler, naechster) {
      const e = ereignisse.get(id); if (!e) return;
      e.versuche++; e.fehler = fehler; e.faellig = naechster ? naechster.getTime() : Number.POSITIVE_INFINITY;
    },
    async ereignisStand() {
      const erg: Record<string, { offen: number; aufgegeben: number; zugestellt: number; zuletzt: string | null }> = {};
      for (const e of ereignisse.values()) {
        const x = (erg[e.paketId] ??= { offen: 0, aufgegeben: 0, zugestellt: 0, zuletzt: null });
        if (e.zugestellt) { x.zugestellt++; if (!x.zuletzt || e.zugestellt > x.zuletzt) x.zuletzt = e.zugestellt; } else if (e.faellig === Number.POSITIVE_INFINITY) x.aufgegeben++; else x.offen++;
      }
      return erg;
    },
    async legeKatalogEreignisAn(e, mische) {
      const t = Date.now();
      if (e.buendel && mische) {
        const da = [...katalog.values()].find((x) => x.buendel === e.buendel && !x.verteilt && !x.versuche && x.gesperrtBis < t && x.faellig > t);
        if (da) { da.daten = kopie(mische(kopie(da.daten))); return da.id; }
      }
      katalog.set(e.id, { id: e.id, nr: ++katalogNr, art: e.art, daten: kopie(e.daten), ausloeser: kopie(e.ausloeser), buendel: e.buendel ?? null, erstellt: jetzt(), faellig: t + (e.buendel ? (e.buendelS ?? 0) * 1000 : 0), gesperrtBis: 0, versuche: 0, fehler: null, verteilt: null });
      return e.id;
    },
    async holeKatalogEreignisse(anzahl, sperreS) {
      const t = Date.now();
      const liste = [...katalog.values()].filter((x) => !x.verteilt && x.faellig <= t && x.gesperrtBis < t).sort((a, b) => a.nr - b.nr).slice(0, anzahl);
      for (const x of liste) x.gesperrtBis = t + sperreS * 1000;
      return liste.map((x) => ({ id: x.id, nr: x.nr, art: x.art, daten: kopie(x.daten), ausloeser: kopie(x.ausloeser), erstellt: x.erstellt, versuche: x.versuche }));
    },
    async katalogEreignisseVerteilt(ids) { for (const id of ids) { const x = katalog.get(id); if (x) { x.verteilt = jetzt(); x.fehler = null; } } },
    async katalogEreignisFehlgeschlagen(id, fehler, naechster) {
      const x = katalog.get(id); if (!x) return;
      x.versuche++; x.fehler = fehler.slice(0, 1000); x.gesperrtBis = 0;
      if (naechster) x.faellig = naechster.getTime(); else x.verteilt = jetzt();
    },
    async raeumeKatalogEreignisseAuf(tage) {
      const grenze = Date.now() - tage * 864e5; let n = 0;
      for (const [k, x] of katalog) if (x.verteilt && Date.parse(x.verteilt) < grenze) { katalog.delete(k); n++; }
      const jahr = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
      for (const k of fristMeldungen) if (k.split('|')[2] < jahr) fristMeldungen.delete(k);
      return n;
    },
    async katalogEreignisStand() {
      const alle = [...katalog.values()];
      const offen = alle.filter((x) => !x.verteilt);
      return { offen: offen.length, aufgegeben: alle.filter((x) => x.verteilt && x.fehler).length, verteilt: alle.filter((x) => x.verteilt && !x.fehler).length,
        aeltestesOffen: offen.map((x) => x.erstellt).sort()[0] ?? null };
    },
    async merkeFristMeldung(f) {
      const k = `${f.mappeId}|${f.feld}|${f.datum}|${f.zeitpunkt}`;
      if (fristMeldungen.has(k)) return false;
      fristMeldungen.add(k); return true;
    },
    async ereignisDaten(id, daten) { const e = ereignisse.get(id); if (e) e.daten = kopie(daten); },
    async loescheEreignisse(id) { for (const [k, e] of ereignisse) if (e.paketId === id) ereignisse.delete(k); },
    async loescheOffeneEreignisse(art, dokumente) {
      let n = 0;
      for (const [k, e] of ereignisse) if (e.art === art && !e.zugestellt && dokumente.includes(String(e.daten.dokument))) { ereignisse.delete(k); n++; }
      return n;
    },
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
    async aendereMappe(id, werte, vs, benutzerId, fw) {
      const a = mappen.get(id)!;
      // Feldweise (#609) wie in PostgreSQL: nur Geändertes auf den aktuellen Stand legen.
      if (fw?.stand !== undefined && a.geaendert !== fw.stand) throw new StandVeraltet();
      const neu = fw ? feldweise(a.werte, fw.basis, werte) : werte;
      const titel = fw?.titel?.(neu);
      const m = { ...a, werte: kopie(neu), geaendert: standWeiter(a.geaendert), geaendertVon: benutzerId, passt: true, problem: null, ...(titel !== undefined ? { titel } : {}) };
      mappen.set(id, m); verweise.set(id, kopie(fw ? fw.verweise(neu) : vs));
      return kopie(m);
    },
    async beruehreMappe(id, benutzerId) {
      const m = mappen.get(id);
      if (m) mappen.set(id, { ...m, geaendert: standWeiter(m.geaendert), geaendertVon: benutzerId });
    },
    async holeSystemMappe(kennung) { const m = [...mappen.values()].find((x) => x.systemKennung === kennung); return m && kopie(m); },
    async setzeSystemKennung(id, kennung) { const m = mappen.get(id); if (m) m.systemKennung = kennung; },
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
      const q = o.suche;
      const vv: Varianten = { ...(o.varianten ?? {}) };
      for (const [k, w] of Object.entries(o.aehnlich ?? {})) vv[k] = [...(vv[k] ?? []), ...w];
      const wertText = (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v));
      const alle = [...mappen.values()]
        .filter((m) => !o.typId || m.typId === o.typId)
        .filter((m) => !o.klauseln || inSicht(m, o.klauseln, zaehl))
        .filter((m) => !o.eingang || offenFuer(m, o.eingang.benutzerId, o.eingang.admin))
        .filter((m) => !o.favoriten || istFavorit(m.id, o.favoriten.benutzerId))
        .filter((m) => lesbar(o.lesen ?? null, m, zaehl))
        .filter((m) => !q || enthaelt(m.titel ?? '', q, vv) || Object.values(m.werte).some((v) => !(typeof v === 'string' && v.startsWith('dms1$')) && enthaelt(wertText(v), q, vv))
          || (!!o.volltext && [...dokumente.values()].some((d) => d.mappeId === m.id && findet(texte.get(d.id), q, vv)))
          || (!!o.notizen && [...notizen.values()].some((n) => n.mappeId === m.id && enthaelt(n.text, q, vv))))
        // Erweiterte Suche (#199): Begriff in Dokumenten oder Notizen – UND mit allem anderen.
        .filter((m) => !tf || (tf.dokumente && [...dokumente.values()].some((d) => d.mappeId === m.id && findet(texte.get(d.id), tf.text, vv)))
          || (tf.notizen && [...notizen.values()].some((n) => n.mappeId === m.id && enthaelt(n.text, tf.text, vv))))
        .sort((a, b) => vergleiche(a, b, o.sortierung) || (a.titel ?? '').toLowerCase().localeCompare((b.titel ?? '').toLowerCase()) || a.id.localeCompare(b.id));
      const seite = alle.slice(o.von, o.von + o.anzahl).map(kopie);
      if (!fund) return { gesamt: o.zahl ?? alle.length, mappen: seite };
      const ausschnitte: Record<string, Ausschnitt> = {};
      const q2 = (o.suche && (o.volltext || o.notizen) ? q! : tf!.text).toLowerCase();
      if (fund.notizen) {
        for (const m of seite) {
          const n = [...notizen.values()].find((x) => x.mappeId === m.id && x.text.toLowerCase().includes(q2));
          const t = n ? ausschnittAus(alsText(n.text), q2) : null;
          if (t) ausschnitte[m.id] = { dokument: 'Notiz', text: t };
        }
      }
      if (fund.volltext) for (const m of seite) {
        if (ausschnitte[m.id]) continue;
        const d = [...dokumente.values()].find((x) => x.mappeId === m.id && findet(texte.get(x.id), q2, vv));
        if (!d) continue;
        const text = texte.get(d.id)!;
        const w = [woerter(q2)[0], ...(vv[falte(woerter(q2)[0])] ?? []).map((x) => x.toLowerCase())].find((x) => text.toLowerCase().includes(x)) ?? woerter(q2)[0];
        const i = Math.max(0, text.toLowerCase().indexOf(w));
        ausschnitte[m.id] = { dokument: d.name, text: `${text.slice(Math.max(0, i - 40), i)}${TREFFER_ANFANG}${text.slice(i, i + w.length)}${TREFFER_ENDE}${text.slice(i + w.length, i + w.length + 40)}` };
      }
      return { gesamt: o.zahl ?? alle.length, mappen: seite, ausschnitte };
    },
    async gibtTreffer(o) { return (await this.seite({ ...o, von: 0, anzahl: 1 })).gesamt > 0; },
    /* Unscharfe Suche (#356): Wörterverzeichnis aus dem Bestand, jedes Mal neu gezählt. */
    async aehnlicheWoerter(liste, max) {
      const r: Record<string, string[]> = {};
      const ws = [...new Set(liste.map(falte).filter((w) => w.length >= TIPPFEHLER_MIN && w.length <= 40))];
      if (!ws.length) return r;
      const anzahl = alleWoerter();
      for (const w of ws) {
        const a = [...anzahl.keys()].filter((x) => x !== w).map((x) => ({ x, s: aehnlichkeit(x, w) })).filter((y) => y.s >= AEHNLICH_AB)
          .sort((p, q) => q.s - p.s || anzahl.get(q.x)! - anzahl.get(p.x)! || p.x.localeCompare(q.x)).slice(0, max).map((y) => y.x);
        if (a.length) r[w] = a;
      }
      return r;
    },
    async woerterAnzahl() { return alleWoerter().size; },
    async woerterNeu() { return alleWoerter().size; },
    // Im Arbeitsspeicher wird das Verzeichnis jedes Mal neu gezählt – es gibt keinen Eingang.
    async woerterEinarbeiten() { return 0; },
    async synonyme() { return synonymListe.map(kopie); },
    async legeSynonymAn(g) { synonymListe.push(kopie(g)); },
    async aendereSynonym(id, woerter) { const g = synonymListe.find((x) => x.id === id && x.quelle === 'werkbank'); if (!g) return false; g.woerter = [...woerter]; return true; },
    async loescheSynonym(id) { const i = synonymListe.findIndex((x) => x.id === id && x.quelle === 'werkbank'); if (i < 0) return false; synonymListe.splice(i, 1); return true; },
    async setzeSynonyme(quelle, gruppen) {
      for (let i = synonymListe.length - 1; i >= 0; i--) if (synonymListe[i].quelle === quelle) synonymListe.splice(i, 1);
      for (const g of gruppen) synonymListe.push({ id: randomUUID(), woerter: [...g], quelle });
    },
    async gibtMappen(typIds) { const t = new Set(typIds); for (const m of mappen.values()) if (t.has(m.typId)) return true; return false; },
    async zaehler(benutzerId, admin, lesen) {
      const typen = new Map<string, { anzahl: number; unpassend: number; demo: number }>();
      let eingang = 0;
      for (const m of mappen.values()) {
        // Eingang ohne Lesefilter (#127, #477).
        if (offenFuer(m, benutzerId, admin)) eingang++;
        if (!lesbar(lesen ?? null, m, zaehl)) continue;
        const z = typen.get(m.typId) ?? { anzahl: 0, unpassend: 0, demo: 0 };
        z.anzahl++;
        if (m.passt !== true) z.unpassend++;
        if (m.demo) z.demo++;
        typen.set(m.typId, z);
      }
      return { typen, eingang, favoriten: [...(favoriten.get(benutzerId) ?? [])].filter((id) => mappen.has(id) && lesbar(lesen ?? null, mappen.get(id)!, zaehl)).length };
    },
    async zaehleKlauseln(liste, lesen) { return liste.map((k) => [...mappen.values()].filter((m) => inSicht(m, k, zaehl) && lesbar(lesen ?? null, m, zaehl)).length); },
    async zaehleBestand(liste, lesen) {
      const typen = new Map<string, { anzahl: number; unpassend: number; demo: number }>();
      const sichten = liste.map(() => 0);
      for (const m of mappen.values()) {
        if (!lesbar(lesen ?? null, m, zaehl)) continue;
        const z = typen.get(m.typId) ?? { anzahl: 0, unpassend: 0, demo: 0 };
        z.anzahl++;
        if (m.passt !== true) z.unpassend++;
        if (m.demo) z.demo++;
        typen.set(m.typId, z);
        liste.forEach((k, i) => { if (inSicht(m, k, zaehl)) sichten[i]++; });
      }
      return { typen, sichten };
    },
    async zaehlePersoenlich(benutzerId, ohneEmpfaenger, lesen, liste = []) {
      let eingang = 0;
      for (const m of mappen.values()) if (offenFuer(m, benutzerId, ohneEmpfaenger)) eingang++;
      return {
        eingang,
        favoriten: [...(favoriten.get(benutzerId) ?? [])].filter((id) => mappen.has(id) && lesbar(lesen ?? null, mappen.get(id)!, zaehl)).length,
        papierkorb: [...korb.values(), ...dokKorb.values()].filter((k) => k.geloeschtVon === benutzerId).length,
        sichten: liste.map((k) => [...mappen.values()].filter((m) => inSicht(m, k, zaehl) && lesbar(lesen ?? null, m, zaehl)).length),
      };
    },
    async lesbare(ids, lesen) { return new Set(ids.filter((id) => mappen.has(id) && lesbar(lesen, mappen.get(id)!, zaehl))); },
    async inKlauseln(ids, klauseln) { return new Set(ids.filter((id) => mappen.has(id) && inSicht(mappen.get(id)!, klauseln, zaehl))); },
    async zaehleAusdruck(typId, x) { return [...mappen.values()].filter((m) => m.typId === typId && werte(x, m, zaehl)).length; },
    async setzeTypKennung(typId, kennung) { const t = typen.get(typId); if (t) { t.schluessel = kennung; mitPaket(t); } },
    async setzeTypSchluessel(typId, schluessel) { const t = typen.get(typId); if (t && !t.schluessel) t.schluessel = schluessel; },
    async setzeBerechtigungen(typId, rw) { const t = typen.get(typId)!; t.berechtigungen = rw ? kopie(rw) : null; t.geaendert = standWeiter(t.geaendert); return kopie(t); },
    async listeSichten() { return [...sichten.values()].map(kopie).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de')); },
    async legeSichtAn(id, d: SichtDaten) { const x: Sicht = { id, ...kopie(d), erstellt: jetzt(), geaendert: jetzt() }; sichten.set(id, x); return kopie(x); },
    async aendereSicht(id, d: SichtDaten, erwartet) {
      const alt = sichten.get(id)!;
      if (erwartet !== undefined && alt.geaendert !== erwartet) throw new KonfigurationVeraltet();
      const x: Sicht = { ...alt, ...kopie(d), geaendert: standWeiter(alt.geaendert) }; sichten.set(id, x); return kopie(x);
    },
    async setzeSichtOrt(id, elternId, position) {
      const x = sichten.get(id);
      if (!x) return;
      if (x.elternId !== elternId) x.geaendert = standWeiter(x.geaendert);
      x.elternId = elternId; x.position = position;
    },
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
    async findeDoppelte(typId, liste) {
      const erg = new Map<string, { id: string; titel: string }>();
      for (const x of liste) {
        const d = await this.findeDoppelt(typId, x.feldKey, x.wert, x.mappeId ?? undefined);
        if (d) erg.set(`${x.mappeId ?? ''}|${x.feldKey}`, { id: d.id, titel: d.titel ?? '' });
      }
      return erg;
    },
    async rueckverweise(zielId) {
      const r: Rueckverweis[] = [];
      for (const [quelleId, vs] of verweise) for (const v of vs) if (v.zielId === zielId) r.push({ quelleId, quelleTypId: mappen.get(quelleId)!.typId, feldKey: v.feldKey, titel: mappen.get(quelleId)!.titel ?? '' });
      return r.sort((a, b) => a.titel.toLowerCase().localeCompare(b.titel.toLowerCase()));
    },

    async listeDokumente(mappeId) { return [...dokumente.values()].filter((d) => d.mappeId === mappeId).map((d) => ({ ...kopie(d), aeltere: versionen.get(d.id)?.length ?? 0 })).reverse(); },
    async kantenVon(ids) {
      const z = new Set(ids);
      const r: Array<{ quelleId: string; feldKey: string; zielId: string }> = [];
      for (const [quelleId, vs] of verweise) {
        if (!mappen.has(quelleId)) continue;
        for (const v of vs) if (z.has(quelleId) || z.has(v.zielId)) r.push({ quelleId, feldKey: v.feldKey, zielId: v.zielId });
      }
      return r;
    },
    async zaehleDokumente(ids) {
      const z = new Set(ids);
      const r = new Map<string, number>();
      for (const d of dokumente.values()) if (z.has(d.mappeId)) r.set(d.mappeId, (r.get(d.mappeId) ?? 0) + 1);
      return r;
    },
    async dokumenteVon(mappeIds) {
      const ids = new Set(mappeIds);
      return [...dokumente.values()].filter((d) => ids.has(d.mappeId)).map((d) => ({ ...kopie(d), aeltere: versionen.get(d.id)?.length ?? 0 })).reverse();
    },
    async holeDokument(id) { const d = dokumente.get(id); return d && { ...kopie(d), aeltere: versionen.get(d.id)?.length ?? 0 }; },
    async setzeDokumentErstellt(id, erstellt) { const d = dokumente.get(id); if (d) d.erstellt = erstellt; },
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
      const d: Dokument = { ...alt, name: neu.name, mime: neu.mime, groesse: neu.groesse, sha256: neu.sha256, anzeigbar: neu.anzeigbar, erstellt: jetzt(), erstelltVon: neu.erstelltVon, herkunft: neu.herkunft, version: nummer + 1, ocr: { stand: uebernehmen ? 'fertig' : 'keiner' }, weitereSprachen: [], teilenAb: null };
      seitenSpr.delete(id);
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
      if (e.sprache !== undefined) d.sprache = e.sprache;
      if (e.text !== undefined || e.weitere !== undefined) d.weitereSprachen = e.weitere ?? [];
      if (e.text !== undefined || e.seitensprachen !== undefined) {
        if (e.seitensprachen?.length) seitenSpr.set(id, e.seitensprachen); else seitenSpr.delete(id);
        d.teilenAb = teilenAb(e.seitensprachen);
      }
    },
    async setzeDokumentSprache(id, sprache, weitere) {
      const d = dokumente.get(id);
      if (!d) return false;
      d.sprache = sprache;
      if (weitere !== undefined) { d.weitereSprachen = weitere; seitenSpr.delete(id); d.teilenAb = null; }
      else d.weitereSprachen = (d.weitereSprachen ?? []).filter((k) => k !== sprache);
      if (d.ocr?.info) d.ocr = { ...d.ocr, info: d.ocr.info.replace(/ · Sprache: [a-z_]{3,10}( \(\d{1,3} %\))?/, '') + (sprache ? `${SPRACHE_MARKE}${sprache}` : '') };
      return true;
    },
    async ocrVonSha(sha, ausser) {
      const d = [...dokumente.values()].find((x) => x.sha256 === sha && x.id !== ausser && x.ocr?.stand === 'fertig' && texte.get(x.id) != null);
      return d ? { text: texte.get(d.id)!, seiten: d.ocr?.seiten ?? null, info: d.ocr?.info ?? null, sprache: d.sprache ?? null, weitere: d.weitereSprachen ?? null, seitensprachen: seitenSpr.get(d.id) ?? null } : undefined;
    },
    async seitensprachen(id) { return seitenSpr.get(id) ?? null; },
    async teilenHinweisAus(id) {
      const d = dokumente.get(id);
      if (!d) return false;
      d.teilenAb = null;
      return true;
    },
    async ocrZurueckstellen() {
      let n = 0;
      for (const d of dokumente.values()) if (d.ocr?.stand === 'laeuft') { d.ocr = { ...d.ocr, stand: 'wartet' }; n++; }
      return n;
    },
    async ocrZaehler() {
      const z = { keiner: 0, wartet: 0, laeuft: 0, fertig: 0, fehler: 0, ausgelassen: 0, paket: 0 };
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
    async volltextKandidaten(umfang) {
      return [...dokumente.values()].filter((d) => mappen.has(d.mappeId) && !['wartet', 'laeuft'].includes(d.ocr?.stand ?? 'keiner') && (umfang === 'alle' || !(texte.get(d.id) ?? '').trim()))
        .sort((a, b) => a.erstellt.localeCompare(b.erstellt))
        .map((d) => ({ id: d.id, typId: mappen.get(d.mappeId)!.typId, registerKey: d.registerKey }));
    },
    async volltextHerkunft() {
      const z = { pdf: 0, paket: 0, api: 0, eingebaut: 0, sonst: 0, ohneText: 0 };
      for (const d of dokumente.values()) {
        if (d.ocr?.stand !== 'fertig') continue;
        if (!(texte.get(d.id) ?? '').trim()) { z.ohneText++; continue; }
        const h = volltextHerkunft(d.ocr);
        z[h?.art === 'pdf' || h?.art === 'paket' || h?.art === 'api' || h?.art === 'eingebaut' ? h.art : 'sonst']++;
      }
      return z;
    },
    async ocrSprachen() {
      const z: Record<string, number> = {};
      for (const d of dokumente.values()) {
        const s = d.ocr?.stand === 'fertig' ? spracheAusInfo(d.ocr.info) : null;
        if (s) z[s.sprache] = (z[s.sprache] ?? 0) + 1;
      }
      return z;
    },
    async volltext(id) { return texte.get(id) ?? null; },
    /* Vektoren (#442): mit dem Dokument weg wie ON DELETE CASCADE. */
    async vektorSetze(e) {
      if (!dokumente.has(e.dokumentId)) return false;
      vektoren.set(`${e.dokumentId}|${e.modell}`, { dokumentId: e.dokumentId, paket: e.paket, modell: e.modell, vektor: Float32Array.from(e.vektor) });
      return true;
    },
    async vektorLoesche(dokumentId, modell) {
      let n = 0;
      for (const [k, v] of vektoren) if (v.dokumentId === dokumentId && (modell === undefined || v.modell === modell)) { vektoren.delete(k); n++; }
      return n;
    },
    async vektorenLoeschePaket(paket, ausser) {
      let n = 0;
      for (const [k, v] of vektoren) if (v.paket === paket && v.modell !== ausser) { vektoren.delete(k); n++; }
      return n;
    },
    async vektorenLaden(modell, jeTeil) {
      jeTeil([...vektoren.values()].filter((v) => v.modell === modell && dokumente.has(v.dokumentId))
        .map((v) => ({ dokumentId: v.dokumentId, mappeId: dokumente.get(v.dokumentId)!.mappeId, vektor: Float32Array.from(v.vektor) })));
    },
    async vektorVon(dokumentId, modell) {
      const v = vektoren.get(`${dokumentId}|${modell}`);
      return v && dokumente.has(dokumentId) ? Float32Array.from(v.vektor) : null;
    },
    async vektorStand() {
      const z = new Map<string, { paket: string; modell: string; anzahl: number }>();
      for (const v of vektoren.values()) {
        if (!dokumente.has(v.dokumentId)) continue;
        const k = `${v.paket}|${v.modell}`;
        z.set(k, { paket: v.paket, modell: v.modell, anzahl: (z.get(k)?.anzahl ?? 0) + 1 });
      }
      return [...z.values()].sort((a, b) => a.paket.localeCompare(b.paket) || a.modell.localeCompare(b.modell));
    },
    async ohneVektor(modell, max, nach) {
      return [...dokumente.values()].filter((d) => texte.get(d.id) && !vektoren.has(`${d.id}|${modell}`) && (!nach || d.id > nach))
        .sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, max).map((d) => ({ id: d.id, mappeId: d.mappeId }));
    },
    async mitVolltext() { return [...dokumente.keys()].filter((id) => !!texte.get(id)).length; },

    async erkennungLies(mappeId) { const e = erkennungen.get(mappeId); return e && mappen.has(mappeId) ? kopie({ ergebnis: e.ergebnis, zeit: e.zeit }) : undefined; },
    async erkennungSchreibe(mappeId, ergebnis, absenderId) { if (mappen.has(mappeId)) erkennungen.set(mappeId, { ergebnis: kopie(ergebnis), absenderId, zeit: jetzt() }); },
    async erkennungenMitAbsender(absenderId, max) {
      return [...erkennungen].filter(([id, e]) => e.absenderId === absenderId && mappen.has(id)).sort((a, b) => b[1].zeit.localeCompare(a[1].zeit)).slice(0, max).map(([id]) => id);
    },
    async volltexte(ids) {
      const r = new Map<string, string>();
      for (const id of ids) { const t = texte.get(id); if (t != null) r.set(id, t); }
      return r;
    },
    async fragenFundstellen(o) {
      const woerter = o.woerter.map((w) => w.toLowerCase());
      if (!woerter.length) return { dokumente: [], mappen: [] };
      const darf = (m: Mappe | undefined) => !!m && lesbar(o.lesen ?? null, m, zaehl);
      const zaehleIn = (t: string) => woerter.filter((w) => t.toLowerCase().includes(w)).length;
      const docs = [...dokumente.values()]
        .map((d) => ({ d, n: zaehleIn(texte.get(d.id) ?? '') }))
        .filter((x) => x.n > 0 && darf(mappen.get(x.d.mappeId)))
        .sort((a, b) => b.n - a.n || a.d.id.localeCompare(b.d.id)).slice(0, Math.max(0, o.dokumente))
        .map((x) => ({ id: x.d.id, mappeId: x.d.mappeId, name: x.d.name, text: texte.get(x.d.id) ?? '' }));
      const treffer = [...mappen.values()].filter((m) => darf(m))
        .map((m) => ({ m, n: woerter.filter((w) => (m.titel ?? '').toLowerCase().includes(w) || Object.values(m.werte).some((v) => !(typeof v === 'string' && v.startsWith('dms1$')) && (typeof v === 'object' ? JSON.stringify(v) : String(v)).toLowerCase().includes(w))).length }))
        .filter((x) => x.n > 0).sort((a, b) => b.n - a.n || b.m.geaendert.localeCompare(a.m.geaendert)).slice(0, Math.max(0, o.mappen)).map((x) => kopie(x.m));
      return { dokumente: docs, mappen: treffer };
    },
    async aufgabenZurPassung(liste) {
      for (const { id, problem } of liste) {
        const offen = [...aufgaben.values()].find((a) => a.mappeId === id && a.art === 'passung' && !a.erledigt);
        if (problem) {
          const text = t('meldungen.repospeicher.passt-nicht-zur-definition', { problem });
          if (offen) offen.text = text;
          else if (mappen.has(id)) {
            const nid = randomUUID();
            aufgaben.set(nid, { id: nid, mappeId: id, empfaengerId: mappen.get(id)!.erstelltVon, art: 'passung', text, erstellt: jetzt(), erstelltVon: null, erledigt: null, erledigtVon: null });
          }
        } else if (offen) offen.erledigt = jetzt();
      }
    },
    async legeAufgabeAn(a) {
      // Wie der eindeutige Index in PostgreSQL: je Mappe, Feld, Datum und Empfänger höchstens eine Frist.
      if (a.art === 'frist' && [...aufgaben.values()].some((x) => x.art === 'frist' && x.mappeId === a.mappeId && x.feldKey === a.feldKey && x.datum === a.datum && (x.empfaengerId ?? null) === (a.empfaengerId ?? null))) throw new Error('duplicate key value violates unique constraint "aufgaben_frist_idx"');
      const x = { ...kopie(a), erstellt: jetzt(), erledigt: null, erledigtVon: null }; aufgaben.set(a.id, x); return kopie(x);
    },
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
    async aendereAufgabeText(id, text) { const a = aufgaben.get(id); if (a && !a.erledigt) a.text = text; },
    async fristAufgaben(mappeIds) {
      return [...aufgaben.values()].filter((a) => a.art === 'frist' && mappen.has(a.mappeId) && (!mappeIds || mappeIds.includes(a.mappeId)))
        .sort((a, b) => a.erstellt.localeCompare(b.erstellt)).map(mitMappe);
    },
    async faelleOhneLeserecht(f = {}) {
      return [...faelle.values()].filter((x) => (!f.offen || !x.ende) && (!f.mappeIds || f.mappeIds.includes(x.mappeId)))
        .sort((a, b) => Number(!!a.ende) - Number(!!b.ende) || (b.ende ?? b.beginn).localeCompare(a.ende ?? a.beginn) || a.id.localeCompare(b.id))
        .slice(0, f.max ?? 1000).map(mitMappeF);
    },
    async legeFallAn(f) {
      if ([...faelle.values()].some((x) => !x.ende && x.aufgabeId === f.aufgabeId && x.benutzerId === f.benutzerId)) return false;
      faelle.set(f.id, { ...f, beginn: jetzt(), ende: null, endeGrund: null, leserechtSeit: null, leserechtVon: null });
      return true;
    },
    async beendeFall(id, grund, zeit) {
      const x = faelle.get(id);
      if (!x || x.ende) return false;
      x.ende = zeit ?? jetzt(); x.endeGrund = grund;
      return true;
    },
    async gibLeserechtAufZeit(id, von) {
      const x = faelle.get(id);
      if (!x || x.ende || x.leserechtSeit) return false;
      x.leserechtSeit = jetzt(); x.leserechtVon = von;
      return true;
    },
    async leserechteAufZeit(benutzerId) {
      return [...faelle.values()].filter((f) => {
        const a = aufgaben.get(f.aufgabeId);
        return f.benutzerId === benutzerId && !f.ende && f.leserechtSeit && a && !a.erledigt && a.empfaengerId === benutzerId && a.mappeId === f.mappeId && mappen.has(f.mappeId);
      }).map((f) => ({ fallId: f.id, mappeId: f.mappeId, typId: mappen.get(f.mappeId)!.typId, aufgabeId: f.aufgabeId, aufgabentext: f.aufgabentext, seit: f.leserechtSeit!, von: f.leserechtVon }));
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
    async verschluesselteFundstellen() {
      // Arbeitsspeicher: nur Mappen und Papierkorb (Einstellungen liegen anderswo), wie umschluesseln.
      const hat = (w: unknown) => JSON.stringify(w).includes('dms1$');
      return [
        ...[...mappen.values()].filter((m) => hat(m.werte)).map((m) => ({ quelle: 'mappe' as const, schluessel: m.id, wert: structuredClone(m.werte), titel: m.titel })),
        ...[...korb.values()].filter((k) => hat(k.mappe.werte)).map((k) => ({ quelle: 'papierkorb' as const, schluessel: k.mappe.id, wert: structuredClone(k.mappe.werte), titel: k.mappe.titel })),
      ];
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
    async historie(mappeId, o = {}) {
      let x = historie.filter((h) => h.mappeId === mappeId && (!o.arten || o.arten.includes(h.art))).reverse();
      if (o.vor !== undefined) { const i = x.findIndex((h) => h.id === o.vor); x = i < 0 ? [] : x.slice(i + 1); }
      return (o.max ? x.slice(0, o.max) : x).map(kopie);
    },
    async letzterAbruf(mappeId, art, benutzerId, dokumentId, fassung, version, seit) {
      for (let i = historie.length - 1; i >= 0; i--) {
        const h = historie[i];
        if (h.zeit < seit) break;
        if (h.mappeId === mappeId && h.art === art && h.benutzerId === benutzerId && h.daten.dokumentId === dokumentId
          && String(h.daten.fassung ?? '') === fassung && String(h.daten.version ?? '') === (version === null ? '' : String(version))) return h.zeit;
      }
      return null;
    },
    async historieVon(mappeIds) { const ids = new Set(mappeIds); return historie.filter((h) => ids.has(h.mappeId)).map(kopie).reverse(); },
    async historieArt(art, max) { return historie.filter((h) => h.art === art).map(kopie).reverse().slice(0, max); },
    async uebertrageAnMappe(von, nach) {
      const n = { historie: 0, notizen: 0, aufgaben: 0, erinnerungen: 0 };
      for (const h of historie) if (h.mappeId === von) { h.mappeId = nach; h.daten = { ...h.daten, ausPost: von }; n.historie++; }
      for (const x of notizen.values()) if (x.mappeId === von) { x.mappeId = nach; n.notizen++; }
      for (const a of aufgaben.values()) if (a.mappeId === von && a.art !== 'post') { a.mappeId = nach; n.aufgaben++; }
      for (const e of erinnerungen.values()) if (e.mappeId === von) { e.mappeId = nach; n.erinnerungen++; }
      for (const f of faelle.values()) if (f.mappeId === von && !f.ende) f.mappeId = nach;
      return n;
    },
    async aufgeloesteIn(ids) {
      const m = new Map<string, { ziel: string; zielTyp: string }>();
      const gesucht = new Set(ids);
      for (const h of historie) {
        if (!gesucht.has(h.mappeId) || h.art !== 'zugeordnet' || h.daten.aufgeloest !== true || typeof h.daten.ziel !== 'string') continue;
        m.set(h.mappeId, { ziel: h.daten.ziel, zielTyp: String(h.daten.zielTyp ?? '') });
      }
      return m;
    },
    async historieAufraeumen(vor) {
      const weg = new Set(historie.filter((h) => h.art === 'endgueltig' && h.zeit < vor && !mappen.has(h.mappeId) && !korb.has(h.mappeId)).map((h) => h.mappeId));
      const vorher = historie.length;
      for (let i = historie.length - 1; i >= 0; i--) if (weg.has(historie[i].mappeId) && historie[i].art !== 'verwaltungsmodus') historie.splice(i, 1);
      return vorher - historie.length;
    },

    async dokumenteMitSha(sha) { return [...dokumente.values()].filter((d) => d.sha256 === sha).map(kopie); },
    async dokumenteMitTyp(mimes) { return [...dokumente.values()].filter((d) => mimes.includes(d.mime)).sort((a, b) => a.erstellt.localeCompare(b.erstellt) || a.id.localeCompare(b.id)).map(kopie); },
    async dokumentTypen() {
      const z: Record<string, number> = {};
      for (const d of dokumente.values()) z[d.mime] = (z[d.mime] ?? 0) + 1;
      return z;
    },
    async grossePdfs(ab, max) {
      return [...dokumente.values()].filter((d) => d.mime === 'application/pdf' && d.groesse >= ab).sort((a, b) => b.groesse - a.groesse).slice(0, max)
        .map((d) => ({ ...kopie(d), aeltere: versionen.get(d.id)?.length ?? 0 }));
    },
    async loescheVersion(id, nummer) {
      const v = versionen.get(id) ?? [];
      const weg = v.find((x) => x.nummer === nummer);
      if (!weg) return null;
      versionen.set(id, v.filter((x) => x !== weg));
      return weg.sha256;
    },
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
      if (an) { if (!s.has(mappeId)) favoritSeit.set(`${benutzerId}|${mappeId}`, jetzt()); s.add(mappeId); }
      else { s.delete(mappeId); favoritSeit.delete(`${benutzerId}|${mappeId}`); favoritStumm.delete(`${benutzerId}|${mappeId}`); }
      favoriten.set(benutzerId, s);
    },
    async favoritenDerMappe(mappeId) {
      return [...favoriten].filter(([, s]) => s.has(mappeId)).map(([benutzerId]) => ({ benutzerId, benachrichtigen: !favoritStumm.has(`${benutzerId}|${mappeId}`) }));
    },
    async setzeFavoritBenachrichtigen(benutzerId, mappeId, an) {
      if (!istFavorit(mappeId, benutzerId)) return;
      if (an) favoritStumm.delete(`${benutzerId}|${mappeId}`); else favoritStumm.add(`${benutzerId}|${mappeId}`);
    },
    async stummeFavoriten(benutzerId, mappeIds) { return new Set(mappeIds.filter((id) => istFavorit(id, benutzerId) && favoritStumm.has(`${benutzerId}|${id}`))); },
    async zaehlerstand(benutzerId) { const z = zaehlerstaende.get(benutzerId); return z && { ...z }; },
    async setzeZaehlerstand(benutzerId, abdruck) {
      const z = zaehlerstaende.get(benutzerId);
      if (z?.abdruck === abdruck) return { ...z };
      const neu = { stand: (z?.stand ?? 0) + 1, abdruck, geaendert: jetzt() };
      zaehlerstaende.set(benutzerId, neu);
      return { ...neu };
    },
    async merkeGesehen(benutzerId, mappeIds) { for (const id of mappeIds) if (mappen.has(id)) gesehen.set(`${benutzerId}|${id}`, jetzt()); },
    async geaendertVonAnderen(benutzerId, mappeIds, arten) {
      const erg = new Set<string>();
      for (const id of new Set(mappeIds)) {
        const m = mappen.get(id);
        if (!m || !(istFavorit(id, benutzerId) || m.erstelltVon === benutzerId)) continue;
        const seit = [gesehen.get(`${benutzerId}|${id}`), favoritSeit.get(`${benutzerId}|${id}`), m.erstellt].filter((x): x is string => !!x).sort().at(-1)!;
        if (historie.some((h) => h.mappeId === id && h.zeit > seit && h.benutzerId && h.benutzerId !== benutzerId && arten.includes(h.art) && h.daten?.aufgabenart !== 'aenderung')) erg.add(id);
      }
      return erg;
    },
    async legeAuskunftLinkAn(l) { links.set(l.id, { ...kopie(l), erstellt: l.erstellt || jetzt(), abrufe: 0, fehlversuche: 0, gesperrt: null, widerrufen: null, abgerufen: null }); },
    async auskunftLinkPerSchluessel(hash) { const l = [...links.values()].find((x) => x.schluessel === hash && mappen.has(x.mappeId)); return l ? kopie(l) : undefined; },
    async auskunftLinks(f = {}) {
      return [...links.values()].filter((l) => mappen.has(l.mappeId) && (!f.id || l.id === f.id) && (!f.mappeId || l.mappeId === f.mappeId) && (!f.auskunftId || l.auskunftId === f.auskunftId))
        .sort((a, b) => b.erstellt.localeCompare(a.erstellt)).slice(0, f.max ?? 500).map(kopie);
    },
    async auskunftLinkFehlversuch(id, max) {
      const l = links.get(id); if (!l) return undefined;
      l.fehlversuche++;
      if (!l.gesperrt && l.fehlversuche >= max) l.gesperrt = jetzt();
      return { fehlversuche: l.fehlversuche, gesperrt: !!l.gesperrt };
    },
    async auskunftLinkAbruf(id) {
      const l = links.get(id);
      if (!l || l.abrufe >= l.maxAbrufe || Date.parse(l.ablauf) <= Date.now() || l.gesperrt || l.widerrufen) return null;
      l.abrufe++; l.abgerufen = jetzt();
      return l.abrufe;
    },
    async widerrufeAuskunftLink(id) { const l = links.get(id); if (!l || l.widerrufen) return false; l.widerrufen = jetzt(); return true; },
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
    async legeVorgangInPapierkorb(ids, benutzerId, vorgang, entkoppelt) {
      const alle = [...new Set(ids)].filter((id) => mappen.has(id));
      const weg = new Set(alle);
      // Wie der Fremdschlüssel in PostgreSQL: verweist noch eine Mappe außerhalb darauf, geht nichts.
      for (const [q, vs] of verweise) if (!weg.has(q) && mappen.has(q) && vs.some((v) => weg.has(v.zielId))) throw new Error('Auf eine der Mappen verweist noch eine andere Mappe.');
      for (const id of alle) {
        await this.legeInPapierkorb(id, benutzerId);
        const k = korb.get(id)!;
        k.vorgang = vorgang; k.entkoppelt = kopie(entkoppelt[id] ?? []);
      }
    },
    async papierkorb(f = {}) {
      return [...korb.values()]
        .filter((k) => (!f.von || k.geloeschtVon === f.von) && (!f.vor || k.geloescht < f.vor) && (!f.typId || k.mappe.typId === f.typId))
        .sort((a, b) => b.geloescht.localeCompare(a.geloescht) || a.mappe.id.localeCompare(b.mappe.id))
        .map(alsEintrag);
    },
    async holeAusPapierkorb(id) { const k = korb.get(id); return k && alsEintrag(k); },
    async stelleWiederHer(id) { return this.stelleMehrereWiederHer([id]); },
    async stelleMehrereWiederHer(ids) {
      // Erst alle Mappen, dann die Verweise (#424: auch untereinander und im Kreis).
      const ks = [...new Set(ids)].map((id) => korb.get(id)).filter((k) => !!k);
      for (const k of ks) mappen.set(k.mappe.id, kopie(k.mappe));
      let entfallen = 0;
      for (const k of ks) {
        const id = k.mappe.id;
        const bleiben = k.verweise.filter((v) => mappen.has(v.zielId));
        entfallen += k.verweise.length - bleiben.length;
        verweise.set(id, bleiben);
        for (const d of k.dokumente) dokumente.set(d.id, kopie(d));
        for (const [d, v] of k.versionen ?? []) versionen.set(d, kopie(v));
        for (const n of k.notizen ?? []) notizen.set(n.id, kopie(n));
        for (const a of k.aufgaben ?? []) aufgaben.set(a.id, kopie(a));
        for (const e of k.erinnerungen ?? []) erinnerungen.set(e.id, kopie(e));
        korb.delete(id);
      }
      return { verweiseEntfallen: entfallen };
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
    async papierkorbInhalt(ids) {
      return ids.map((id) => korb.get(id)).filter((k) => !!k).map((k) => ({
        id: k.mappe.id, typId: k.mappe.typId, werte: kopie(k.mappe.werte), demo: !!k.mappe.demo, vorgang: k.vorgang ?? null,
        entkoppelt: (k.entkoppelt ?? []).length, notizen: (k.notizen ?? []).length,
        dokumente: [...k.dokumente.map(loeschDok), ...(k.versionen ?? []).flatMap(([, v]) => v.map(loeschVersion))],
      }));
    },
    async papierkorbDokumentInhalt(ids) {
      return ids.map((id) => dokKorb.get(id)).filter((k) => !!k).map((k) => ({ id: k.dokument.id, mappeId: k.dokument.mappeId, dokumente: [loeschDok(k.dokument), ...k.versionen.map(loeschVersion)] }));
    },
    async loeschprotokollSchreibe(e) { loeschprotokoll.push(...e.map(kopie)); },
    async loeschprotokoll(f) {
      const alle = loeschprotokoll.filter((e) => passtLoesch(e, f)).sort((a, b) => b.zeit.localeCompare(a.zeit) || (a.art === b.art ? 0 : a.art === 'mappe' ? -1 : 1));
      return { eintraege: alle.slice(0, f.max ?? 500).map(kopie), gesamt: alle.length };
    },
    async loeschprotokollAufraeumen(vor) {
      const vorher = loeschprotokoll.length;
      const bleibt = loeschprotokoll.filter((e) => e.zeit >= vor);
      loeschprotokoll.splice(0, loeschprotokoll.length, ...bleibt);
      return vorher - bleibt.length;
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
