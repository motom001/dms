import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { feldLabel, typBeschreibung, typName } from '../../../shared/src/beschriftung';
import type { Abgleich, Abgleichtreffer } from '../../../shared/src/erkennung';
import type { Einschaetzung, Klassbeleg, Klassifizierung } from '../../../shared/src/klassifizierung';
import { auswahlText, darfErstellen, formatiere, istVersendet, kannAusPost, POST_STAND, titelAus, type Dokument, type Feld, type Mappentyp, type Wert, type Werte } from '../../../shared/src/model';
import { kannSchwaerzen, type Bereich, type SchwaerzSeite } from '../../../shared/src/schwaerzen';
import { textformen, stelleVon, wertAusText } from '../../../shared/src/uebernehmen';
import type { WortSeite } from '../../../shared/src/archivfassung';
import { api, schwaerzBildUrl, type Bezuege, type MappeDetails, type TypVorschlaege } from '../api';
import { Dreiteilung } from '../bereiche';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { geheZu, Link, loeseWache } from '../ort';
import { hinweis } from '../rueckfrage';
import { titelOder } from '../seiten';
import { t, tn } from '../sprache';
import { Symbol } from '../Symbol';
import { BrueckeKontext, farbeVon, setzeNutzlast, type Bruecke, type FormularAnschluss, type Marke, type Nutzlast } from './bruecke';
import { ansichtVon } from './Dokumente';
import { MappeAnsicht, MappenWahl, NeueMappe } from './MappeFormular';
import { Mehrfachauswahl } from './Mehrfachauswahl';
import { useMappenZiel } from './NeuePost';
import { AufloesungHinweis, merkeAufloesung, vorschlagFuer } from './Post';

/**
 * Seite „Dokument übernehmen“ (#934): eine Seite für neue Post aus allen Eingängen und für „Aus Dokument ausfüllen“ an
 * einer Mappe. Links die gewohnten Ansichten, in der Mitte das Dokument, rechts die Mappe wie überall sonst.
 *
 * /ablage/:sicht/:postId/uebernehmen          Post: „Wohin gehört das?“ wählt den Mappentyp, daraus wird beim Speichern
 *                                               die Mappe (Post auflösen, #936), danach die nächste Post
 * /ablage/:sicht/:mappeId/uebernehmen?dokument=…  „Aus Dokument ausfüllen“: diese Mappe rechts, ihr Dokument in der Mitte
 *
 * Erkannte Werte bekommen nummerierte, farbige Rahmen an der Fundstelle; Rahmen und Feld leuchten gemeinsam auf.
 * Werte lassen sich ins Feld ziehen oder per Feld wählen → Rahmen anklicken übernehmen; markierter Text (Textebene
 * bzw. Texterkennung) geht in das zuletzt gewählte Feld. Die mobile Fassung kommt im zweiten Schritt – bis dahin steht
 * alles in einer Spalte untereinander.
 */

/** Höchstens so viele Dokumente gehen in Erkennung und Abgleich (wie der Server). */
const DOKS_MAX = 10;
/** Belege je Verweisfeld als Rahmen. */
const BELEGE_MAX = 3;

type Laden<T> = T | null | 'fehlt';
interface Woerter { seiten: SchwaerzSeite[]; mitText: boolean }

const alsSeiten = (w: WortSeite[]): SchwaerzSeite[] => w.map((s) => ({ breite: s.breite ?? 1, hoehe: s.hoehe ?? 1, woerter: s.woerter }));
const kurz = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()} …` : s);

export function UebernehmenSeite({ id, sicht, links, suche }: { id: string; sicht: string; links: ReactNode; suche: URLSearchParams }) {
  const d = useDaten();
  const [details, setDetails] = useState<Laden<MappeDetails>>(null);
  const laden = useCallback(async () => {
    try { setDetails(await api.mappe(id)); } catch { setDetails('fehlt'); }
  }, [id]);
  useEffect(() => { void laden(); }, [laden]);
  // Solange die Texterkennung läuft, kommt der Text nach – dann noch einmal laden (Vorschläge und Rahmen).
  const wartet = details && details !== 'fehlt' && details.dokumente.some((x) => x.ocr?.stand === 'wartet' || x.ocr?.stand === 'laeuft');
  useEffect(() => {
    if (!wartet) return;
    const z = window.setInterval(() => void laden(), 4000);
    return () => window.clearInterval(z);
  }, [wartet, laden]);

  const typ = details && details !== 'fehlt' ? d.typ(details.mappe.typId) : undefined;
  const post = typ?.system === 'post';
  // Versendete E-Mails und Post, die man nicht bearbeiten darf, zeigt die gewohnte Mappe.
  const nichtHier = !!details && details !== 'fehlt' && post && (istVersendet(details.mappe.werte) || details.rechte?.U === false);
  useEffect(() => { if (nichtHier) geheZu(`/ablage/${sicht}/${id}?als=post`, true); }, [nichtHier, sicht, id]);

  let mitte: ReactNode; let rechts: ReactNode;
  if (details === null || nichtHier) { mitte = <p className="leise">{t('ablage.uebernehmen.lade')}</p>; rechts = null; }
  else if (details === 'fehlt' || !typ) { mitte = <div className="leer"><p>{t('ablage.uebernehmen.gibt-es-nicht')}</p></div>; rechts = null; }
  else return <Uebernehmen key={id} details={details} typ={typ} sicht={sicht} links={links} neuLaden={laden} dokumentWunsch={suche.get('dokument')} />;
  return (
    <Dreiteilung ort="uebernehmen" ebene="uebernehmen" offen={id}>
      {links}
      <section className="spalte liste ue-mitte" aria-label={t('ablage.uebernehmen.dokument')}>{mitte}</section>
      <section className="spalte mappe" aria-label={t('ablage.ablage.mappe')}>{rechts}</section>
    </Dreiteilung>
  );
}

function Uebernehmen({ details, typ, sicht, links, neuLaden, dokumentWunsch }: {
  details: MappeDetails; typ: Mappentyp; sicht: string; links: ReactNode; neuLaden: () => Promise<void>; dokumentWunsch: string | null;
}) {
  const d = useDaten();
  const m = details.mappe;
  const post = typ.system === 'post';
  // Dokumente in der Mitte: bei Post alle untereinander, an einer Mappe das gewählte (sonst das neueste mit Text).
  const mitText = details.dokumente.filter((x) => x.ocr?.stand === 'fertig');
  const [dokId, setDokId] = useState(() => dokumentWunsch ?? [...mitText].sort((a, b) => b.erstellt.localeCompare(a.erstellt))[0]?.id ?? details.dokumente[0]?.id);
  // Post: in der Reihenfolge, in der sie abgelegt wurden (Seite 1 zuerst) – „Ab hier abtrennen“ meint die folgenden.
  const doks = post ? [...details.dokumente].sort((a, b) => a.erstellt.localeCompare(b.erstellt) || a.name.localeCompare(b.name)) : details.dokumente.filter((x) => x.id === dokId);
  const erkennDoks = doks.filter((x) => x.ocr?.stand === 'fertig').slice(0, DOKS_MAX);
  const erkennKey = erkennDoks.map((x) => x.id).join(',');

  // „Wohin gehört das?“ (nur Post): Typen mit „Kann aus Post angelegt werden“, in denen ich anlegen darf (#937).
  // Vorschlag aus allen Wegen (#939): Pakete mit dms:klassifizieren, Überschrift im Text, Abgleich. Einmal je Dokumentstand –
  // wechselt die Person den Typ, läuft nur die Erkennung der Felder neu.
  const ziele = useMemo(() => d.typen.filter((x) => kannAusPost(x) && darfErstellen(x)), [d.typen]);
  const [klass, setKlass] = useState<(Klassifizierung & { bezuege: Bezuege }) | null | undefined>(post ? undefined : null);
  const [zielId, setZielId] = useState<string | null>(post ? null : typ.id);
  const [gewaehlt, setGewaehlt] = useState(false);
  useEffect(() => {
    if (!post || gewaehlt) return;
    if (!erkennKey) { setKlass(null); return; }
    let aktuell = true;
    api.klassifizieren({ dokumente: erkennKey.split(',') }).then((r) => {
      if (!aktuell) return;
      setKlass(r);
      if (r.vorschlag && ziele.some((x) => x.id === r.vorschlag!.typId)) setZielId(r.vorschlag.typId);
    }, () => aktuell && setKlass(null));
    return () => { aktuell = false; };
  }, [post, erkennKey, gewaehlt, ziele]);
  const zielTyp = zielId ? d.typ(zielId) : undefined;

  // Erkennung für den gewählten Typ: Vorschläge der Felder und Abgleich (Belege, Verweise, Doppelte).
  const [erkannt, setErkannt] = useState<{ typId: string; vorschlaege: TypVorschlaege | null; abgleich: (Abgleich & { bezuege: Bezuege }) | null } | null>(null);
  useEffect(() => {
    if (!zielTyp) { setErkannt(null); return; }
    if (!erkennKey) { setErkannt({ typId: zielTyp.id, vorschlaege: null, abgleich: null }); return; }
    let aktuell = true;
    setErkannt(null);
    const ids = erkennKey.split(',');
    void Promise.allSettled([
      api.vorschlaege(zielTyp.id, { dokumente: ids, ...(post ? {} : { mappe: m.id }) }),
      api.abgleich({ dokumente: ids, typ: zielTyp.id }),
    ]).then(([v, a]) => {
      if (aktuell) setErkannt({ typId: zielTyp.id, vorschlaege: v.status === 'fulfilled' ? v.value : null, abgleich: a.status === 'fulfilled' ? a.value : null });
    });
    return () => { aktuell = false; };
  }, [zielTyp, erkennKey, post, m.id]);

  // Wörter mit Lage je Dokument (für Rahmen und Markieren).
  const [woerter, setWoerter] = useState<Record<string, Woerter | 'keine'>>({});
  const dokKey = doks.map((x) => `${x.id}:${x.sha256}:${x.ocr?.stand ?? ''}`).join(',');
  useEffect(() => {
    let aktuell = true;
    for (const x of doks) {
      if (!kannSchwaerzen(x.mime)) { setWoerter((w) => ({ ...w, [x.id]: 'keine' })); continue; }
      api.wortpositionen(x.id).then(
        (r) => aktuell && setWoerter((w) => ({ ...w, [x.id]: { seiten: alsSeiten(r.seiten), mitText: r.seiten.some((s) => s.woerter.length > 0) } })),
        () => aktuell && setWoerter((w) => ({ ...w, [x.id]: 'keine' })),
      );
    }
    return () => { aktuell = false; };
  }, [dokKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vorschläge, wie das Formular sie einträgt: Erkennung, dazu Verweise aus dem Abgleich und bei Post Betreff und Datum.
  const vorschlagStart = useMemo<TypVorschlaege | undefined>(() => {
    if (!zielTyp || !erkannt || erkannt.typId !== zielTyp.id) return undefined;
    const v = erkannt.vorschlaege;
    const r: TypVorschlaege = { vorschlaege: { ...(v?.vorschlaege ?? {}) }, bezuege: { ...(v?.bezuege ?? {}), ...(erkannt.abgleich?.bezuege ?? {}) }, neu: { ...(v?.neu ?? {}) }, verworfen: v?.verworfen ?? 0, zeichen: v?.zeichen ?? 0, ...(v?.engine ? { engine: v.engine } : {}), ...(v?.hinweis ? { hinweis: v.hinweis } : {}) };
    for (const [k, liste] of Object.entries(erkannt.abgleich?.verweise ?? {})) {
      const f = zielTyp.felder.find((x) => x.key === k);
      const best = liste[0];
      if (!f || r.vorschlaege[k] || !best || best.unsicher) continue;
      r.vorschlaege[k] = { wert: f.mehrfach ? [best.mappeId] : best.mappeId, sicherheit: best.sicherheit, fundstelle: best.belege.map((b) => `${b.feld} ${b.wert}`).join(', ') };
      delete r.neu[k];
    }
    if (post) {
      for (const [k, w] of Object.entries(vorschlagFuer(zielTyp, m.werte, null))) {
        if (!r.vorschlaege[k]) r.vorschlaege[k] = { wert: w, sicherheit: 'niedrig', fundstelle: t('ablage.uebernehmen.aus-der-post') };
      }
    }
    return r;
  }, [zielTyp, erkannt, post, m.werte]);

  // Rahmen: je erkanntem Wert die Stelle im Dokument, bei Verweisen die Belege; nummeriert in der Reihenfolge der Felder.
  const marken = useMemo<Marke[]>(() => {
    if (!zielTyp || !vorschlagStart) return [];
    const liste: Marke[] = [];
    const stelle = (formen: string[], fundstelle: string) => {
      for (const x of doks) {
        const w = woerter[x.id];
        if (!w || w === 'keine' || !w.mitText) continue;
        const b = stelleVon(w.seiten, formen, fundstelle);
        if (b?.length) return { dokId: x.id, bereiche: b };
      }
      return null;
    };
    for (const f of zielTyp.felder) {
      const v = vorschlagStart.vorschlaege[f.key];
      if (f.typ === 'referenz') {
        const kandidat = erkannt?.abgleich?.verweise[f.key]?.[0];
        if (!kandidat) {
          // Vorschlag der Erkennung ohne Beleg aus dem Abgleich: der Titel der Mappe, wenn er im Dokument steht.
          const id = Array.isArray(v?.wert) ? String(v!.wert[0] ?? '') : typeof v?.wert === 'string' ? v.wert : '';
          const b = id ? vorschlagStart.bezuege[id] : undefined;
          const s = b?.titel ? stelle([b.titel], '') : null;
          if (s && b) liste.push({ nr: liste.length + 1, feldKey: f.key, ...s, sicherheit: v!.sicherheit, nutzlast: { text: b.titel, mappeId: id, typId: b.typId, titel: b.titel, feldTyp: 'referenz', wert: id } });
          continue;
        }
        const titel = erkannt?.abgleich?.bezuege[kandidat.mappeId]?.titel ?? '';
        for (const [i, b] of kandidat.belege.slice(0, BELEGE_MAX).entries()) {
          const s = stelle([b.wert], b.fundstelle);
          if (s) liste.push({ nr: liste.length + 1, feldKey: f.key, ...s, beleg: i, sicherheit: kandidat.sicherheit, nutzlast: { text: titel, mappeId: kandidat.mappeId, typId: kandidat.typId, titel, feldTyp: 'referenz', wert: kandidat.mappeId } });
        }
        continue;
      }
      if (!v) continue;
      // Stelle vom Server (#939: Fundstelle in der Textebene gesucht), sonst hier gesucht.
      const s = v.stelle && doks.some((x) => x.id === v.stelle!.dokument) ? { dokId: v.stelle.dokument, bereiche: v.stelle.bereiche } : stelle(textformen(f, v.wert), v.fundstelle);
      if (s) liste.push({ nr: liste.length + 1, feldKey: f.key, ...s, sicherheit: v.sicherheit, nutzlast: { text: formatiere(f, v.wert), wert: v.wert, feldTyp: f.typ } });
    }
    return liste;
  }, [zielTyp, vorschlagStart, erkannt, woerter, doks]);

  /* ---------- Brücke zwischen Dokument und Formular ---------- */
  const [hervor, setHervor] = useState<string | null>(null);
  const [aktiv, setAktiv] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ text: string; art: 'gut' | 'warn' } | null>(null);
  useEffect(() => { if (!meldung) return; const z = window.setTimeout(() => setMeldung(null), 5000); return () => window.clearTimeout(z); }, [meldung]);
  const anschluss = useRef<FormularAnschluss | null>(null);
  const anschliessen = useCallback((a: FormularAnschluss) => { anschluss.current = a; return () => { if (anschluss.current === a) anschluss.current = null; }; }, []);
  const nimm = useCallback((f: Feld, n: Nutzlast, ziel?: FormularAnschluss) => {
    const a = ziel ?? anschluss.current;
    if (!a) return;
    let wert: Wert | null = null;
    let bezug: { id: string; titel: string; typId: string } | undefined;
    if (f.typ === 'referenz') {
      if (n.mappeId && n.typId && (f.zielTyp === n.typId || f.zielTyp === '*')) { wert = f.mehrfach ? [n.mappeId] : n.mappeId; bezug = { id: n.mappeId, titel: n.titel ?? n.text, typId: n.typId }; }
    } else if (n.wert != null && n.feldTyp === f.typ) wert = n.wert;
    else wert = wertAusText(f, n.text);
    if (wert == null) {
      setMeldung({ art: 'warn', text: f.typ === 'referenz' ? t('ablage.uebernehmen.verweis-nur-rahmen', { feld: feldLabel(f) }) : t('ablage.uebernehmen.passt-nicht', { text: kurz(n.text), feld: feldLabel(f) }) });
      return;
    }
    a.setze(f.key, wert, bezug);
    setMeldung({ art: 'gut', text: t('ablage.uebernehmen.uebernommen', { text: kurz(n.text), feld: feldLabel(f) }) });
  }, []);
  // Fenster „+ … anlegen“ (#935): Solange es offen ist, gehen Rahmen und markierter Text dorthin.
  const fensterZiel = useRef<((n: Nutzlast) => boolean) | null>(null);
  const fenster = useCallback((z: ((n: Nutzlast) => boolean) | null) => { fensterZiel.current = z; }, []);
  /** Rahmen angeklickt bzw. Text markiert: ins zuletzt gewählte Feld; ohne gewähltes Feld zeigt der Rahmen sein Feld. */
  const insAktive = useCallback((n: Nutzlast, eigenesFeld?: string) => {
    if (fensterZiel.current) {
      if (!fensterZiel.current(n)) setMeldung({ art: 'warn', text: t('ablage.uebernehmen.erst-feld-waehlen', { text: kurz(n.text) }) });
      return;
    }
    const f = aktiv ? zielTyp?.felder.find((x) => x.key === aktiv) : undefined;
    if (f) { nimm(f, n); return; }
    if (eigenesFeld) { anschluss.current?.zeige(eigenesFeld); setHervor(eigenesFeld); return; }
    setMeldung({ art: 'warn', text: t('ablage.uebernehmen.erst-feld-waehlen', { text: kurz(n.text) }) });
  }, [aktiv, zielTyp, nimm]);
  const unterFeld = useCallback((f: Feld): ReactNode => {
    if (f.typ !== 'referenz' || !erkannt?.abgleich) return null;
    const liste = erkannt.abgleich.verweise[f.key] ?? [];
    if (!liste.length) return null;
    return <VerweisBelege f={f} liste={liste} bezuege={erkannt.abgleich.bezuege} marken={marken.filter((x) => x.feldKey === f.key)}
      nehmen={(x) => nimm(f, { text: erkannt.abgleich!.bezuege[x.mappeId]?.titel ?? '', mappeId: x.mappeId, typId: x.typId, titel: erkannt.abgleich!.bezuege[x.mappeId]?.titel ?? '' })} />;
  }, [erkannt, marken, nimm]);
  const bruecke = useMemo<Bruecke>(() => ({ marken, hervor, setHervor, aktiv, setAktiv, nimm, anschliessen, unterFeld, fenster }), [marken, hervor, aktiv, nimm, anschliessen, unterFeld, fenster]);

  /* ---------- Post: abtrennen, weitere Dokumente, ohne Mappe ---------- */
  const [kopieren, setKopieren] = useState(false);
  const postRegister = typ.register.find((r) => r.art === 'dokumente')?.key ?? 'dokumente';
  async function abtrennen(ab: number) {
    const weg = doks.slice(ab).map((x) => x.id);
    try {
      const r = await api.postAbtrennen(m.id, weg);
      setMeldung({ art: 'gut', text: t('ablage.uebernehmen.abgetrennt', { anzahl: weg.length, titel: titelOder(r.neu.titel) }) });
      await neuLaden(); await d.neuLaden();
    } catch (e) { await hinweis({ titel: t('ablage.uebernehmen.nicht-abgetrennt'), text: (e as Error).message }); }
  }
  async function hochladen(dateien: File[]) {
    const fehler: string[] = [];
    for (const f of dateien) { try { await api.ladeHoch(m.id, postRegister, f); } catch (e) { fehler.push(`„${f.name}“: ${(e as Error).message}`); } }
    if (fehler.length) await hinweis({ titel: t('ablage.uebernehmen.nicht-hochgeladen'), text: fehler.join('\n') });
    await neuLaden(); await d.neuLaden();
  }
  useMappenZiel(post ? { name: titelOder(m.titel), titel: t('ablage.uebernehmen.in-diese-post'), text: t('ablage.uebernehmen.in-diese-post-text'), nimm: (x) => void hochladen(x) } : null);

  /** Weiter mit der nächsten Post aus „Neue Post“ (wie nach dem Speichern, #936); ohne weitere die Ansicht. */
  async function weiter(nach?: { id: string; typId: string; titel: string; vorhanden: boolean }) {
    // Was rechts eingetragen war, gehört zu keiner Mappe mehr – ohne Rückfrage weiter.
    loeseWache();
    await d.neuLaden();
    const np = d.zaehler.neuePost;
    const naechste = np ? (await api.seite(np, 0, 2).catch(() => null))?.mappen.find((x) => !x.verborgen && x.id !== m.id) : undefined;
    if (naechste && np) {
      if (nach) merkeAufloesung({ fuer: naechste.id, ...nach });
      geheZu(`/ablage/${np}/${naechste.id}/uebernehmen`);
    } else if (nach) geheZu(`/ablage/${nach.typId}/${nach.id}`);
    else geheZu(`/ablage/${np ?? sicht}`);
  }
  /** In eine vorhandene Mappe legen (Nacharbeit #936: auch dort wird die Post aufgelöst). */
  async function inVorhandene(ziel: { id: string; typId: string; titel: string }) {
    const zt = d.typ(ziel.typId);
    const reg = zt?.register.find((r) => r.art === 'dokumente')?.key;
    if (details.dokumente.length && !reg) { await hinweis({ titel: t('ablage.uebernehmen.nicht-zugeordnet'), text: t('ablage.uebernehmen.ohne-dokumentenregister', { typ: zt ? typName(zt) : '' }) }); return; }
    try {
      const r = await api.zuordnen(m.id, { ziel: ziel.id, register: reg, dokumente: details.dokumente.map((x) => x.id), kopieren, aufloesen: !kopieren });
      if (r.hinweis) await hinweis({ titel: t('ablage.mappeformular.post-bleibt-zugeordnet'), text: r.hinweis });
      await weiter(r.aufgeloest ? { ...ziel, titel: r.ziel.titel ?? ziel.titel, vorhanden: true } : undefined);
    } catch (e) { await hinweis({ titel: t('ablage.uebernehmen.nicht-zugeordnet'), text: (e as Error).message }); }
  }
  async function ohneMappe() {
    try { await api.mappeAendern(m.id, { werte: { stand: POST_STAND.erledigt } }); await weiter(); }
    catch (e) { await hinweis({ titel: t('ablage.uebernehmen.nicht-erledigt'), text: (e as Error).message }); }
  }

  // „Passt eher zu …“: Folgedokumente, deren Name im Text (Überschrift) zu einem anderen Typ passt oder deren beste
  // wiedergefundene Mappe eine andere ist als beim ersten Dokument.
  const [folge, setFolge] = useState<Record<string, { typId?: string; mappe?: { id: string; typId: string; titel: string } }>>({});
  useEffect(() => {
    if (!post || doks.length < 2) { setFolge({}); return; }
    let aktuell = true;
    const mitT = doks.filter((x) => x.ocr?.stand === 'fertig').slice(0, DOKS_MAX);
    void Promise.allSettled(mitT.map((x) => api.abgleich({ dokumente: [x.id] }))).then((rs) => {
      if (!aktuell) return;
      const je = new Map(mitT.map((x, i) => [x.id, rs[i].status === 'fulfilled' ? rs[i].value : null]));
      const erster = je.get(doks[0].id);
      const besterVon = (r: typeof erster) => r?.treffer.find((x) => !x.unsicher);
      const e1 = besterVon(erster);
      const n: typeof folge = {};
      for (const x of doks.slice(1)) {
        const r = je.get(x.id);
        if (!r) continue;
        const typId = r.typ?.typId && r.typ.typId !== zielId && ziele.some((z) => z.id === r.typ!.typId) ? r.typ.typId : undefined;
        const b = besterVon(r);
        const mappe = b && e1 && b.mappeId !== e1.mappeId ? { id: b.mappeId, typId: b.typId, titel: r.bezuege[b.mappeId]?.titel ?? '' } : undefined;
        if (typId || mappe) n[x.id] = { typId, mappe };
      }
      setFolge(n);
    });
    return () => { aktuell = false; };
  }, [post, dokKey, zielId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Post: Zähler „Post 1 von N“ ---------- */
  const np = d.zaehler.neuePost;
  const [reihe, setReihe] = useState<string[] | null>(null);
  useEffect(() => {
    if (!post || !np) return;
    let aktuell = true;
    api.seite(np, 0, 200).then((s) => aktuell && setReihe(s.mappen.filter((x) => !x.verborgen).map((x) => x.id)), () => {});
    return () => { aktuell = false; };
  }, [post, np, d.stand]);
  const pos = reihe ? reihe.indexOf(m.id) : -1;

  const kopf = useCallback((werte: Werte, bekannt: Bezuege) => zielTyp ? <NeuKopf typ={zielTyp} werte={werte} bekannt={bekannt} /> : null, [zielTyp]);
  const zuordnen = useMemo(() => {
    const reg = zielTyp?.register.find((r) => r.art === 'dokumente')?.key;
    return { post: m.id, register: reg, dokumente: details.dokumente.map((x) => x.id), kopieren, vorschlag: {} as Record<string, Wert> };
  }, [m.id, details.dokumente, kopieren, zielTyp]);
  const ohneRegister = post && !!zielTyp && details.dokumente.length > 0 && !zielTyp.register.some((r) => r.art === 'dokumente');
  const doppelt = (erkannt?.abgleich?.doppelt ?? []).filter((x) => x.mappeId !== m.id);

  return (
    <BrueckeKontext.Provider value={bruecke}>
      <Dreiteilung ort="uebernehmen" ebene="uebernehmen" offen={m.id}>
        {links}
        <section className="spalte liste ue-mitte" aria-label={t('ablage.uebernehmen.dokument')} data-anker="uebernehmen.dokument">
          <div className="ue-kopf">
            {post ? <>
              <h2 className="ue-titel"><Symbol name="posteingang" /> {titelOder(m.titel)}</h2>
              {pos >= 0 && reihe && <nav className="ue-blaettern" aria-label={t('ablage.uebernehmen.blaettern')}>
                <button type="button" className="textknopf" disabled={pos <= 0} onClick={() => geheZu(`/ablage/${np}/${reihe[pos - 1]}/uebernehmen`)} aria-label={t('ablage.uebernehmen.vorige')}><Symbol name="pfeil-links" /></button>
                <span className="klein">{t('ablage.uebernehmen.post-von', { nr: pos + 1, anzahl: reihe.length })}</span>
                <button type="button" className="textknopf" disabled={pos >= reihe.length - 1} onClick={() => geheZu(`/ablage/${np}/${reihe[pos + 1]}/uebernehmen`)} aria-label={t('ablage.uebernehmen.naechste')}><Symbol name="pfeil-rechts" /></button>
              </nav>}
            </> : <>
              <Link to={`/ablage/${sicht}/${m.id}`} className="verweis ue-zurueck"><Symbol name="pfeil-links" /> {t('ablage.uebernehmen.zurueck-zur-mappe')}</Link>
              {mitText.length > 1 && <label className="klein ue-dokwahl"><span className="sr">{t('ablage.uebernehmen.dokument')}</span>
                <select value={dokId} onChange={(e) => setDokId(e.target.value)}>{mitText.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
            </>}
            <Hilfe ort="post.zuordnen" />
          </div>
          <p className={`ue-meldung klein ${meldung?.art ?? ''}`} role="status" aria-live="polite">{meldung?.text ?? ''}</p>
          {!doks.length && <p className="leise">{t('ablage.uebernehmen.keine-dokumente')}</p>}
          {doks.map((x, i) => (
            <div key={x.id}>
              {i > 0 && folge[x.id] && <div className="hinweis warn ue-passt" role="note">
                <p>{folge[x.id].mappe
                  ? tn('ablage.uebernehmen.passt-eher-mappe', { name: x.name, typ: d.typ(folge[x.id].mappe!.typId) ? typName(d.typ(folge[x.id].mappe!.typId)!) : '', link: <Link to={`/ablage/${folge[x.id].mappe!.typId}/${folge[x.id].mappe!.id}`} className="verweis">{titelOder(folge[x.id].mappe!.titel)}</Link> })
                  : t('ablage.uebernehmen.passt-eher-typ', { name: x.name, typ: d.typ(folge[x.id].typId) ? typName(d.typ(folge[x.id].typId)!) : '' })}</p>
                <button type="button" className="knopf klein" onClick={() => void abtrennen(i)}>{t('ablage.uebernehmen.ab-hier-abtrennen')}</button>
              </div>}
              <DokumentBlatt x={x} w={woerter[x.id]} marken={marken.filter((k) => k.dokId === x.id)} hervor={hervor} setHervor={setHervor} insAktive={insAktive} />
            </div>
          ))}
          {post && <Ablageflaeche hochladen={(f) => void hochladen(f)} />}
        </section>

        <section className="spalte mappe ue-rechts" aria-label={t('ablage.ablage.mappe')} data-anker="mappe">
          {post && <AufloesungHinweis postId={m.id} />}
          {post && <WohinGehoert ziele={ziele} zielTyp={zielTyp} klass={klass} waehle={(x) => { setGewaehlt(true); setZielId(x); }}
            kopieren={kopieren} setKopieren={details.dokumente.length ? setKopieren : undefined} inVorhandene={(z) => void inVorhandene(z)} ohneMappe={() => void ohneMappe()} alsPost={`/ablage/${sicht}/${m.id}?als=post`} />}
          {doppelt.length > 0 && zielTyp && <DoppeltWarnung liste={doppelt} bezuege={erkannt!.abgleich!.bezuege} post={post} legen={(x) => void inVorhandene(x)} />}
          {ohneRegister && <div className="hinweis warn"><p>{t('ablage.uebernehmen.ohne-dokumentenregister', { typ: typName(zielTyp!) })}</p></div>}
          {post
            ? zielTyp
              ? <NeueMappe key={zielTyp.id} typ={zielTyp} sicht={sicht} zuordnen={zuordnen} vorschlagStart={vorschlagStart} kopf={kopf} />
              : <p className="leise ue-leer">{t('ablage.uebernehmen.erst-typ-waehlen')}</p>
            : <MappeAnsicht key={m.id} typ={typ} details={details} sicht={sicht} neuLaden={neuLaden} vorschlagStart={vorschlagStart} />}
        </section>
      </Dreiteilung>
    </BrueckeKontext.Provider>
  );
}

/** Kopf der neuen Mappe wie überall sonst: Typ, Titel (wie er nach dem Speichern heißt), Stern und „Mappe ▾“ (erst nach dem Speichern). */
function NeuKopf({ typ, werte, bekannt }: { typ: Mappentyp; werte: Werte; bekannt: Bezuege }) {
  const titel = titelAus(typ, werte, (id) => bekannt[id]?.titel ?? '');
  const spaeter = t('ablage.uebernehmen.nach-dem-speichern');
  return (
    <div className="mappenkopf">
      <p className="ueber">{typName(typ)}</p>
      <div className="titelzeile"><h1 className={titel ? '' : 'leise'}>{titel || t('ablage.mappeformular.neue-mappe')}</h1>
        <div className="mappenkopf-knoepfe">
          <button type="button" className="stern" disabled aria-label={`${t('ablage.stern.zu-den-favoriten')} – ${spaeter}`} title={spaeter}><Symbol name="stern" /></button>
          <button type="button" className="knopf klein" disabled title={spaeter}>{tn('ablage.aktionen.mappe', { span: <span aria-hidden="true">▾</span> })}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * „Wohin gehört das?“ (nur Post) in der Optik eines Verweisfelds: gewählter Typ mit Kurzbeschreibung und „Ändern“,
 * sonst Suche und Liste. Ohne Erkennung „Mappentyp wählen …“. Darunter, was es sonst noch gibt.
 */
function WohinGehoert({ ziele, zielTyp, klass, waehle, kopieren, setKopieren, inVorhandene, ohneMappe, alsPost }: {
  ziele: Mappentyp[]; zielTyp?: Mappentyp; klass: (Klassifizierung & { bezuege: Bezuege }) | null | undefined; waehle(id: string): void;
  kopieren: boolean; setKopieren?: (an: boolean) => void;
  inVorhandene(z: { id: string; typId: string; titel: string }): void; ohneMappe(): void; alsPost: string;
}) {
  const [eingabe, setEingabe] = useState('');
  const [offen, setOffen] = useState(false);
  const [aendern, setAendern] = useState(false);
  const [vorhanden, setVorhanden] = useState(false);
  const [ziel, setZiel] = useState<string>('');
  const [bekannt, setBekannt] = useState<Bezuege>({});
  const kurzText = (x: Mappentyp) => { const b = typBeschreibung(x); const s = b.split(/(?<=[.!?])\s/)[0] ?? ''; return kurz(s, 90); };
  const such = eingabe.trim().toLocaleLowerCase('de-DE');
  const liste = ziele.filter((x) => !such || typName(x).toLocaleLowerCase('de-DE').includes(such) || typBeschreibung(x).toLocaleLowerCase('de-DE').includes(such));
  const vorgeschlagen = !!klass?.vorschlag && klass.vorschlag.typId === zielTyp?.id;
  // Belege des gewählten Typs (auch, wenn er nicht der Vorschlag war) und die anderen in Frage kommenden Typen.
  const einschaetzung = klass?.typen.find((x) => x.typId === zielTyp?.id);
  const andere = (klass?.typen ?? []).filter((x) => x.typId !== zielTyp?.id && ziele.some((z) => z.id === x.typId));
  const hinweise = (klass?.wege ?? []).filter((w) => w.hinweis);
  return (
    <section className="ue-wohin feld" aria-labelledby="ue-wohin-titel" data-anker="uebernehmen.wohin">
      <div className="feldkopf">
        <span className="label" id="ue-wohin-titel">{t('ablage.uebernehmen.wohin')}</span>
        {vorgeschlagen && <span className="chip">{t('ablage.mappeformular.vorschlag')}</span>}
      </div>
      {klass === undefined && !zielTyp
        ? <p className="leise klein">{t('ablage.uebernehmen.erkenne')}</p>
        : <Mehrfachauswahl name={t('ablage.uebernehmen.wohin')} eingabeLabel={t('ablage.uebernehmen.wohin')} platzhalter={zielTyp ? t('ablage.uebernehmen.typ-suchen') : t('ablage.uebernehmen.typ-waehlen')}
            eingabe={eingabe} setEingabe={setEingabe} offen={offen} setOffen={setOffen} schliessen={() => setAendern(false)} ohneSuche={!!zielTyp && !aendern}
            vorschlaege={liste.map((x) => ({ id: x.id, text: <span className="ue-typ"><strong>{typName(x)}</strong>{kurzText(x) && <span className="leise klein"> {kurzText(x)}</span>}</span> }))}
            leerText={ziele.length ? t('ablage.uebernehmen.kein-typ-passt') : t('ablage.uebernehmen.keine-typen')}
            waehle={(id) => { waehle(id); setEingabe(''); setOffen(false); setAendern(false); setVorhanden(false); setZiel(''); }}
            gewaehlt={zielTyp ? [{
              id: zielTyp.id,
              inhalt: <span className="ue-typ"><strong>{typName(zielTyp)}</strong>{kurzText(zielTyp) && <span className="leise klein"> {kurzText(zielTyp)}</span>}</span>,
              aktionen: !aendern && <button type="button" className="textknopf klein" onClick={() => { setAendern(true); setOffen(true); }}>{t('felder.verweis.aendern')}</button>,
              entfernenText: t('ablage.uebernehmen.typ-entfernen'),
            }] : []}
            entferne={() => { setAendern(true); setOffen(true); }} />}
      {einschaetzung && <TypBelege e={einschaetzung} vorgeschlagen={vorgeschlagen} bezuege={klass!.bezuege} />}
      {andere.length > 0 && <p className="leise klein ue-andere">{t('ablage.uebernehmen.auch-moeglich')}{' '}{andere.map((x, i) => {
        const zt = ziele.find((z) => z.id === x.typId)!;
        return <span key={x.typId}>{i > 0 && ', '}<button type="button" className="textknopf klein" onClick={() => waehle(x.typId)}>{t('ablage.uebernehmen.typ-mit-sicherheit', { typ: typName(zt), prozent: Math.round(x.sicherheit * 100) })}</button></span>;
      })}</p>}
      {hinweise.map((w, i) => <p key={`h${i}`} className="leise klein ue-weg-hinweis">{w.hinweis}</p>)}
      <div className="ue-wohin-fuss klein">
        {setKopieren && <label className="haken klein"><input type="checkbox" checked={kopieren} onChange={(e) => setKopieren(e.target.checked)} /><span>{t('ablage.post.kopie-in-der-post')}</span></label>}
        {zielTyp && <button type="button" className={`textknopf klein ${vorhanden ? 'an' : ''}`} aria-expanded={vorhanden} onClick={() => setVorhanden(!vorhanden)}>{t('ablage.uebernehmen.in-vorhandene', { typ: typName(zielTyp) })}</button>}
        <button type="button" className="textknopf klein" onClick={ohneMappe} title={t('ablage.uebernehmen.ohne-mappe-titel')}>{t('ablage.uebernehmen.ohne-mappe')}</button>
        <Link to={alsPost} className="textknopf klein">{t('ablage.uebernehmen.als-post')}</Link>
      </div>
      {vorhanden && zielTyp && (
        <div className="ue-vorhanden">
          <MappenWahl id="ue-vorhanden" ziel={zielTyp} mehrfach={false} wert={ziel || undefined} bekannt={bekannt} merke={(id, b) => setBekannt((x) => ({ ...x, [id]: b }))} setze={(v) => setZiel(typeof v === 'string' ? v : '')} ohneAnlegen />
          <div className="knoepfe">
            <button type="button" className="knopf primaer klein" disabled={!ziel} onClick={() => inVorhandene({ id: ziel, typId: zielTyp.id, titel: bekannt[ziel]?.titel ?? '' })}>
              {ziel ? t('ablage.uebernehmen.dorthin-legen', { titel: titelOder(bekannt[ziel]?.titel) }) : t('ablage.post.mappe-waehlen')}</button>
          </div>
          <p className="leise klein">{kopieren ? t('ablage.uebernehmen.vorhanden-kopie') : t('ablage.uebernehmen.vorhanden-aufloesen')}</p>
        </div>
      )}
    </section>
  );
}

/** Woran Ablago den Typ erkennt (#939): je Weg ein Beleg – Paket mit Begründung und Zitat, Überschrift, wiedergefundene Mappe. */
function TypBelege({ e, vorgeschlagen, bezuege }: { e: Einschaetzung; vorgeschlagen: boolean; bezuege: Bezuege }) {
  const text = (b: Klassbeleg) => {
    switch (b.weg) {
      case 'kern': return t('ablage.uebernehmen.weil', { wort: b.wort ?? '', fundstelle: b.fundstelle ?? '' });
      case 'ki': return t('ablage.uebernehmen.beleg-ki', { paket: b.paket?.name ?? '', begruendung: b.begruendung || t('ablage.uebernehmen.ohne-begruendung') });
      case 'aehnlichkeit': return t('ablage.uebernehmen.beleg-aehnlich', { paket: b.paket?.name ?? '', begruendung: b.begruendung || t('ablage.uebernehmen.ohne-begruendung') });
      case 'abgleich': return t('ablage.uebernehmen.beleg-abgleich', { feld: b.feld ?? '', titel: titelOder(b.mappeId ? bezuege[b.mappeId]?.titel : ''), merkmal: b.merkmal ?? '' });
    }
  };
  return (
    <div className="ue-typbelege leise klein" aria-label={t('ablage.uebernehmen.woran-typ')}>
      <p>{vorgeschlagen ? t('ablage.uebernehmen.vorschlag-sicherheit', { prozent: Math.round(e.sicherheit * 100) }) : t('ablage.uebernehmen.woran-typ')}</p>
      <ul>{e.belege.map((b, i) => <li key={`${b.weg}:${i}`}>{text(b)}{b.zitat && <> {t('ablage.uebernehmen.beleg-zitat', { zitat: b.zitat })}</>}</li>)}</ul>
    </div>
  );
}

/** Würde die Mappe doppelt (#938): „Rechnungsnummer R-1 gibt es schon: „…““ – mit Link und (bei Post) „Stattdessen dorthin legen“. */
function DoppeltWarnung({ liste, bezuege, post, legen }: { liste: Abgleichtreffer[]; bezuege: Bezuege; post: boolean; legen(z: { id: string; typId: string; titel: string }): void }) {
  return (
    <div className="hinweis warn ue-doppelt" role="alert">
      {liste.slice(0, 3).map((x) => {
        const b = x.belege.find((y) => !y.ueber && y.stark) ?? x.belege[0];
        const titel = bezuege[x.mappeId]?.titel ?? '';
        return (
          <p key={x.mappeId}>{tn('ablage.uebernehmen.gibt-es-schon', { feld: b?.feld ?? '', wert: b?.wert ?? '', link: <Link to={`/ablage/${x.typId}/${x.mappeId}`} className="verweis">{titelOder(titel)}</Link> })}
            {post && <> {' '}<button type="button" className="textknopf klein" onClick={() => legen({ id: x.mappeId, typId: x.typId, titel })}>{t('ablage.uebernehmen.stattdessen-dorthin')}</button></>}</p>
        );
      })}
    </div>
  );
}

/** Unter einem Verweisfeld: „Woran Ablago das erkennt“ und „auch gefunden … stattdessen nehmen“. */
function VerweisBelege({ f, liste, bezuege, marken, nehmen }: { f: Feld; liste: Abgleichtreffer[]; bezuege: Bezuege; marken: Marke[]; nehmen(x: Abgleichtreffer): void }) {
  const [erster, ...weitere] = liste;
  return (
    <div className="ue-belege klein" aria-label={t('ablage.uebernehmen.woran', { feld: feldLabel(f) })}>
      <p><strong>{t('ablage.uebernehmen.woran-kurz', { titel: titelOder(bezuege[erster.mappeId]?.titel) })}</strong>
        {erster.unsicher && <> <span className="chip warn">{t('ablage.post.unsicher').trim()}</span></>}</p>
      <ul>{erster.belege.map((b, i) => {
        const nr = marken.find((m) => m.nutzlast.mappeId === erster.mappeId && m.beleg === i)?.nr;
        return <li key={`${b.feldKey}:${b.wert}:${i}`}>{nr && <span className={`ue-nr ${farbeVon(nr)}`}>{nr}</span>} {b.ueber ? t('ablage.uebernehmen.beleg-ueber', { feld: b.feld, wert: b.wert, ueber: b.ueber.feld }) : t('ablage.uebernehmen.beleg', { feld: b.feld, wert: b.wert })}</li>;
      })}</ul>
      {weitere.length > 0 && <p className="leise">{t('ablage.uebernehmen.auch-gefunden')}{' '}{weitere.map((x, i) => (
        <span key={x.mappeId}>{i > 0 && ', '}„{titelOder(bezuege[x.mappeId]?.titel)}“ <button type="button" className="textknopf klein" onClick={() => nehmen(x)}>{t('ablage.uebernehmen.stattdessen-nehmen')}</button></span>
      ))}</p>}
    </div>
  );
}

/** Ein Dokument in der Mitte: Seitenbilder mit Rahmen und markierbarem Text; mit PDF/A „Original | PDF/A“. */
function DokumentBlatt({ x, w, marken, hervor, setHervor, insAktive }: {
  x: Dokument; w: Woerter | 'keine' | undefined; marken: Marke[]; hervor: string | null; setHervor(k: string | null): void; insAktive(n: Nutzlast, eigenesFeld?: string): void;
}) {
  const mitArchiv = x.archivfassung?.stand === 'fertig';
  const [archiv, setArchiv] = useState(mitArchiv);
  useEffect(() => { setArchiv(mitArchiv); }, [mitArchiv]);
  const seiten = w && w !== 'keine' ? w.seiten : null;
  const ansicht = ansichtVon(x, !archiv);
  return (
    <article className="ue-dokument" aria-label={x.name}>
      <div className="ue-dokkopf klein">
        <span className="ue-dokname">{x.name}</span>
        {mitArchiv && <span className="ue-fassung" role="group" aria-label={t('ablage.uebernehmen.fassung')}>
          <button type="button" className={`textknopf klein ${!archiv ? 'an' : ''}`} aria-pressed={!archiv} onClick={() => setArchiv(false)}>{t('ablage.uebernehmen.original')}</button>
          <span aria-hidden="true">|</span>
          <button type="button" className={`textknopf klein ${archiv ? 'an' : ''}`} aria-pressed={archiv} onClick={() => setArchiv(true)}>{t('ablage.uebernehmen.pdfa')}</button>
        </span>}
      </div>
      {w === undefined ? <p className="leise klein">{t('ablage.uebernehmen.lade')}</p>
        : seiten?.length
          ? <>
              {w !== 'keine' && !w.mitText && <p className="leise klein">{x.ocr?.stand === 'wartet' || x.ocr?.stand === 'laeuft' ? t('ablage.uebernehmen.text-kommt') : t('ablage.uebernehmen.ohne-text')}</p>}
              {seiten.map((s, i) => <Seite key={`${i}-${archiv}`} x={x} nr={i + 1} s={s} archiv={archiv} marken={marken} hervor={hervor} setHervor={setHervor} insAktive={insAktive} />)}
            </>
          : ansicht
            ? <div className="dokansicht ue-ansicht">{ansicht.pdf ? <iframe src={ansicht.url} title={x.name} /> : <img src={ansicht.url} alt={x.name} />}</div>
            : <p className="leise klein">{t('ablage.uebernehmen.keine-ansicht')}</p>}
    </article>
  );
}

/** Eine Seite: Bild, darüber die Wörter (zum Markieren) und die Rahmen (zum Ziehen und Anklicken). */
function Seite({ x, nr, s, archiv, marken, hervor, setHervor, insAktive }: {
  x: Dokument; nr: number; s: SchwaerzSeite; archiv: boolean; marken: Marke[]; hervor: string | null; setHervor(k: string | null): void; insAktive(n: Nutzlast, eigenesFeld?: string): void;
}) {
  const [wahl, setWahl] = useState<{ von: number; bis: number; zieht: boolean } | null>(null);
  const prozent = (a: { x: number; y: number; b: number; h: number }) => ({ left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.b * 100}%`, height: `${a.h * 100}%` });
  const hier = marken.flatMap((m) => m.bereiche.filter((b) => b.seite === nr).map((b, i) => ({ m, b, erster: i === 0 && m.bereiche.findIndex((y) => y.seite === nr) === m.bereiche.indexOf(b) })));
  const gewaehlt = wahl ? [Math.min(wahl.von, wahl.bis), Math.max(wahl.von, wahl.bis)] : null;
  function fertig() {
    if (!wahl || !gewaehlt) return;
    const text = s.woerter.slice(gewaehlt[0], gewaehlt[1] + 1).map((y) => y[0]).join(' ');
    setWahl({ ...wahl, zieht: false });
    if (text.trim()) insAktive({ text });
  }
  return (
    <figure className="ue-seite">
      <div className={`ue-flaeche${s.breite > 1 && s.hoehe > 1 ? ' mass' : ''}`} style={s.breite > 1 && s.hoehe > 1 ? { aspectRatio: `${s.breite} / ${s.hoehe}` } : undefined}
        onPointerUp={() => { if (wahl?.zieht) fertig(); }} onPointerLeave={() => { if (wahl?.zieht) fertig(); }}>
        <img src={schwaerzBildUrl(x, nr, archiv)} alt={t('ablage.uebernehmen.seite', { nr })} loading={nr <= 2 ? 'eager' : 'lazy'} draggable={false} />
        {s.woerter.map((y, k) => (
          <span key={k} className={`ue-wort${gewaehlt && k >= gewaehlt[0] && k <= gewaehlt[1] ? ' an' : ''}`} style={prozent({ x: y[1], y: y[2], b: y[3], h: y[4] })}
            onPointerDown={(e: ReactPointerEvent) => { if (e.button > 0) return; e.preventDefault(); setWahl({ von: k, bis: k, zieht: true }); }}
            onPointerEnter={() => { if (wahl?.zieht) setWahl({ ...wahl, bis: k }); }} />
        ))}
        {hier.map(({ m, b, erster }, k) => (
          <span key={`r${k}`} className={`ue-rahmen ${farbeVon(m.nr)}${hervor === m.feldKey ? ' an' : ''}${m.beleg !== undefined ? ' beleg' : ''}`} style={prozent(b as Bereich)} draggable
            role="button" tabIndex={erster ? 0 : -1} aria-label={t('ablage.uebernehmen.rahmen', { nr: m.nr, text: m.nutzlast.text })} title={t('ablage.uebernehmen.rahmen-titel', { text: m.nutzlast.text })}
            onDragStart={(e) => setzeNutzlast(e, m.nutzlast)} onPointerDown={(e) => e.stopPropagation()}
            onMouseEnter={() => setHervor(m.feldKey)} onMouseLeave={() => setHervor(null)} onFocus={() => setHervor(m.feldKey)} onBlur={() => setHervor(null)}
            onClick={() => insAktive(m.nutzlast, m.feldKey)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); insAktive(m.nutzlast, m.feldKey); } }}>
            {erster && <span className="ue-rahmen-nr">{m.nr}</span>}
          </span>
        ))}
      </div>
      <figcaption className="leise klein">{t('ablage.uebernehmen.seite', { nr })}</figcaption>
    </figure>
  );
}

/** Am Fuß der Mitte nur die Ablagefläche „Weitere Dokumente hierher ziehen“ (Klick wählt Dateien). */
function Ablageflaeche({ hochladen }: { hochladen(f: File[]): void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="ue-ablage" data-anker="uebernehmen.ablegen">
      <button type="button" className="ue-ablage-knopf" onClick={() => ref.current?.click()}>{t('ablage.uebernehmen.weitere-hierher')}</button>
      <input ref={ref} type="file" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) hochladen(f); }} />
    </div>
  );
}

/** Für Ablage.tsx: Post mit Stand „Neu“ öffnet diese Seite (alle Eingänge, #934) – außer man will die Post selbst sehen. */
export function oeffnetUebernehmen(details: MappeDetails, typ: Mappentyp | undefined): boolean {
  const w = details.mappe.werte;
  return typ?.system === 'post' && (auswahlText(w.stand) || POST_STAND.neu) === POST_STAND.neu && !istVersendet(w) && details.rechte?.U !== false;
}
