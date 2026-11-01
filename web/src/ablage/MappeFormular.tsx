import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Symbol } from '../Symbol';
import { Stern } from './Stern';
import { spaltenName, zelle } from './spalten';
import { eigeneFelderIm, vorbelegungAus } from '../../../shared/src/sichten';
import { datumText, inFrist } from '../../../shared/src/archiv';
import { darfErstellen, darfLoeschen, formatiere, trefferlistenVon, geschuetzteFelder, istLeer, istOk,  standardRegister, VERWEISARTEN, type Dokument, type Feld, type Mappe, type Mappentyp, type Pruefergebnis, type Register, type Werte } from '../../../shared/src/model';
import { api, ApiFehler, type Bezuege, type MappeDetails, type Rueckverweis } from '../api';
import { useDaten } from '../daten';
import { useKonto } from '../konto';
import { geheZu, Link, loeseWache, useUngespeichert } from '../ort';
import { leeresPasswort, rohAusWerten, standardRoh, werteAusRoh, type Roh, type RohBetrag, type RohPasswort, type RohWerte } from '../werte';
import { titelOder } from '../seiten';
import { Formatiert, FormatiertEingabe } from './Formatiert';
import { Historie } from './Historie';
import { mitNotizen, NOTIZEN_REGISTER, startRegister, type AnsichtsRegister } from '../../../shared/src/mappenansicht';
import { Notizen } from './Notizen';
import { AufgabenHinweis, ErinnerungFormular, Erinnerungen, NeueAufgabe } from './Aufgaben';
import { Aktionsmenue, Druckansicht, EmailMaske } from './Aktionen';
import { LoeschBaum } from './LoeschBaum';
import { PostLeiste } from './Post';
import { linkZuMappe } from '../../../shared/src/direktlink';
import { Person } from '../Person';
import { Dokumente, type NeueDatei } from './Dokumente';
import { hinweis, rueckfrage } from '../rueckfrage';
import { mitGrund } from './Loeschgrund';

const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

/** Register des Typs; ältere Typen ohne Register bekommen die Standardregister. */
const registerVon = (t: Mappentyp): Register[] => (t.register?.length ? t.register : standardRegister(t.felder));

/** Neue Mappe als Ziel von „Zuordnen“ (#192): danach wird die Post ihr zugeordnet. */
export interface ZuordnenNachher { post: string; register?: string; dokumente: string[]; kopieren: boolean; vorschlag: Record<string, string> }

export function NeueMappe({ typ, verweis, sicht, zuordnen, vorbelegen }: { typ: Mappentyp; verweis?: string; sicht: string; zuordnen?: ZuordnenNachher; vorbelegen?: string }) {
  const start = standardRoh(typ);
  // ?vorbelegen={…} (#172): was sich aus dem Auswahlfilter eines Referenzfelds ergibt, z. B. Art = Arzt.
  try {
    for (const [k, v] of Object.entries(vorbelegen ? JSON.parse(vorbelegen) as Record<string, unknown> : {})) {
      const f = typ.felder.find((x) => x.key === k);
      if (!f || f.typ === 'passwort' || f.typ === 'betrag') continue;
      if (f.typ === 'janein' && typeof v === 'boolean') start[k] = v;
      else if (Array.isArray(v) && f.mehrfach) start[k] = v.map(String);
      else if (typeof v === 'string' && !f.mehrfach) start[k] = v;
    }
  } catch { /* ohne Vorbelegung */ }
  // Vorschläge aus der Post (Betreff, Datum) für Text- und Datumsfelder.
  for (const [k, v] of Object.entries(zuordnen?.vorschlag ?? {})) {
    const f = typ.felder.find((x) => x.key === k);
    if (f && (f.typ === 'text' || f.typ === 'datum') && typeof v === 'string') start[k] = v;
  }
  // ?verweis=feldKey:mappeId belegt ein Referenzfeld vor („+ Vertrag anlegen“ beim Vertragspartner).
  if (verweis) {
    const [k, id] = verweis.split(':');
    const f = typ.felder.find((x) => x.key === k && x.typ === 'referenz');
    if (f && id) start[f.key] = f.mehrfach ? [id] : id;
  }
  return (
    <>
      <div className="mappenkopf">
        <p className="ueber">{typ.name}</p>
        <h1>Neue Mappe</h1>
      </div>
      {zuordnen && <div className="hinweis info"><p>Nach dem Speichern wird die Post dieser Mappe zugeordnet{zuordnen.dokumente.length ? `, ${zuordnen.dokumente.length === 1 ? 'ihr Dokument kommt' : `ihre ${zuordnen.dokumente.length} Dokumente kommen`} hierher` : ''}.</p></div>}
      <Formular typ={typ} start={start} sicht={sicht} zuordnen={zuordnen} />
    </>
  );
}

export function MappeAnsicht({ typ, details, sicht, anhang = '', neuLaden }: { typ: Mappentyp; details: MappeDetails; sicht: string; anhang?: string; neuLaden: () => Promise<void> }) {
  const d = useDaten();
  const { ich } = useKonto();
  const mappe = details.mappe;
  const bekannt = new Set(typ.felder.map((f) => f.key));
  const verwaist = Object.entries(mappe.werte).filter(([k, v]) => !bekannt.has(k) && !istLeer(v));
  // Sprung auf einen Register von außen, z. B. „Zur Notiz“ im Aufgaben-Banner (#427).
  const [registerWunsch, setRegisterWunsch] = useState<{ key: string; n: number }>();
  const [aufgabeOffen, setAufgabeOffen] = useState(false);
  const [erinnernOffen, setErinnernOffen] = useState(false);
  const [emailOffen, setEmailOffen] = useState(false);
  const [drucken, setDrucken] = useState(false);
  const [loeschBaum, setLoeschBaum] = useState(false);
  // Handy (#489): „Mappe löschen“ steht im Menü „Mappe ▾“ statt in der Speicherleiste; der Formular-Teil löscht.
  const [loeschWunsch, setLoeschWunsch] = useState(0);
  const loeschbarHier = darfLoeschen(typ, mappe);
  const druckEnde = useCallback(() => setDrucken(false), []);
  // Sprechender Link (#98) über ein eindeutiges Feld oder die Titelfelder.
  const direktlink = linkZuMappe(typ, mappe);
  const [kopiert, setKopiert] = useState<{ link: string; ok: boolean } | null>(null);
  // Mit verknüpften Mappen löschen (#424): im Menü „Mappe ▾“ unter den Löschwegen (#427) und unter
  // „Warum nicht?“ am Löschknopf (#423); die Vorschau steht oben unter dem Kopf.
  const mitVerknuepften = darfLoeschen(typ, mappe) && details.rechte?.D !== false ? () => {
    setLoeschBaum(true);
    window.setTimeout(() => document.querySelector('.lb-blatt')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
  } : undefined;
  return (
    <>
      <div className="mappenkopf">
        <p className="ueber">{typ.name}</p>
        {/* Kopfzeile (#427): „Mappe ▾“ neben dem Stern – gehört sichtbar zur Mappe, nicht zum Aufgaben-Banner. */}
        <div className="titelzeile"><h1>{titelOder(mappe.titel)}</h1>
          <div className="mappenkopf-knoepfe">
            <Stern mappeId={mappe.id} an={!!details.favorit} />
            <Aktionsmenue aufgabe={() => setAufgabeOffen(true)} erinnern={() => setErinnernOffen(true)} email={details.exportierbar === false ? undefined : () => setEmailOffen(true)} drucken={details.exportierbar === false ? undefined : () => setDrucken(true)}
              link={direktlink ? () => { const l = location.origin + direktlink; void kopiere(l).then((ok) => setKopiert({ link: l, ok })); } : undefined}
              auskunft={details.auskunft ? () => geheZu(`/werkbank/datenschutz?mappe=${encodeURIComponent(details.mappe.id)}`) : undefined}
              loeschwege={[
                ...(loeschbarHier ? [{ text: 'Mappe löschen …', tu: () => setLoeschWunsch((n) => n + 1), nurSchmal: true }] : []),
                ...(mitVerknuepften ? [{ text: 'Mit verknüpften Mappen löschen …', titel: 'Diese Mappe samt allen Mappen, die zu ihr gehören – nach einer Vorschau als Baum', tu: mitVerknuepften }] : []),
              ]} />
          </div>
        </div>
        <dl className="index">
          <div><dt>Angelegt</dt><dd>{zeit(mappe.erstellt)} von <Person id={mappe.erstelltVon} /></dd></div>
          <div><dt>Zuletzt geändert</dt><dd>{zeit(mappe.geaendert)} von <Person id={mappe.geaendertVon} /></dd></div>
          {/* Archivmodus (#212) */}
          {details.aufbewahrenBis && <div><dt><span className="chip archiv" title="Archivmodus: vor Fristende nicht löschbar">Archiv</span></dt><dd>{inFrist(details.aufbewahrenBis) ? 'aufbewahren bis' : 'Frist abgelaufen am'} {datumText(details.aufbewahrenBis)}</dd></div>}
        </dl>
        {typ.system === 'benutzer' && ich.rolle === 'admin' && <p className="leise klein"><Link to={`/werkbank/benutzer/${mappe.id}`} className="verweis">In der Benutzerverwaltung öffnen →</Link></p>}
        {mappe.systemKennung && <p className="leise klein"><span className="chip">Systemrolle</span> Wer sie hat, ergibt sich aus der Rolle in der Benutzerverwaltung.</p>}
        {kopiert && <LinkKopiert {...kopiert} schliessen={() => setKopiert(null)} />}
      </div>
      {typ.system === 'post' && <PostLeiste typ={typ} details={details} neuLaden={neuLaden} />}
      <AufgabenHinweis aufgaben={details.aufgaben ?? []} neuLaden={neuLaden} zuNotizen={() => setRegisterWunsch((w) => ({ key: NOTIZEN_REGISTER, n: (w?.n ?? 0) + 1 }))} />
      <Erinnerungen liste={details.erinnerungen ?? []} neuLaden={neuLaden} />
      {aufgabeOffen && <NeueAufgabe mappeId={mappe.id} neuLaden={neuLaden} schliessen={() => setAufgabeOffen(false)} />}
      {erinnernOffen && <ErinnerungFormular mappeId={mappe.id} neuLaden={neuLaden} schliessen={() => setErinnernOffen(false)} />}
      {loeschBaum && <LoeschBaum key={mappe.id} mappeId={mappe.id} titel={mappe.titel ?? ''} sicht={sicht} schliessen={() => setLoeschBaum(false)} neuLaden={neuLaden} />}
      {emailOffen && <EmailMaske key={mappe.id} typ={typ} details={details} neuLaden={neuLaden} schliessen={() => setEmailOffen(false)} />}
      {drucken && <Druckansicht typ={typ} details={details} fertig={druckEnde} />}
      {mappe.passt === false && (
        <div className="hinweis warn"><p>Diese Mappe passt nicht mehr zur aktuellen Definition von „{typ.name}“{mappe.problem ? ` (${mappe.problem})` : ''}. Beim nächsten Speichern müssen die markierten Felder stimmen.</p></div>
      )}
      <Formular typ={typ} mappe={mappe} start={rohAusWerten(typ, mappe.werte)} sicht={sicht} anhang={anhang} details={details} neuLaden={neuLaden} registerWunsch={registerWunsch} mitVerknuepften={mitVerknuepften} loeschWunsch={loeschWunsch} />
      {verwaist.length > 0 && (
        <section className="blatt">
          <h2 className="h3">Werte ohne Felddefinition</h2>
          <p className="leise">Diese Werte stammen aus Feldern, die es im Mappentyp nicht mehr gibt. Sie bleiben erhalten.</p>
          <ul className="verwaist">{verwaist.map(([k, v]) => <li key={k}><code>{k}</code>: {typeof v === 'object' ? JSON.stringify(v) : String(v)}</li>)}</ul>
        </section>
      )}
    </>
  );
}

/**
 * Register-Reihe (#427): Am Handy ist sie breiter als der Bildschirm und rollt waagerecht.
 * Ein Schatten am Rand zeigt, dass es weitergeht; der aktive Register rollt immer in den Blick.
 */
function RegisterReihe({ aktiv, children }: { aktiv?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [rand, setRand] = useState({ links: false, rechts: false });
  const messe = useCallback(() => {
    const e = ref.current;
    if (!e) return;
    const links = e.scrollLeft > 2, rechts = e.scrollLeft + e.clientWidth < e.scrollWidth - 2;
    setRand((r) => (r.links === links && r.rechts === rechts ? r : { links, rechts }));
  }, []);
  useEffect(() => {
    const e = ref.current;
    if (!e) return;
    messe();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(messe);
    ro?.observe(e);
    return () => ro?.disconnect();
  }, [messe]);
  useEffect(() => {
    const e = ref.current, t = e?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!e || !t || e.scrollWidth <= e.clientWidth) return;
    // Nur waagerecht rollen – scrollIntoView würde auch die Seite verschieben.
    if (t.offsetLeft < e.scrollLeft) e.scrollLeft = t.offsetLeft - 16;
    else if (t.offsetLeft + t.offsetWidth > e.scrollLeft + e.clientWidth) e.scrollLeft = t.offsetLeft + t.offsetWidth - e.clientWidth + 16;
    messe();
  }, [aktiv, messe]);
  return (
    <div className={`registerreihe${rand.links ? ' registerreihe-links' : ''}${rand.rechts ? ' registerreihe-rechts' : ''}`}>
      <div className="registertaben" role="tablist" aria-label="Register" ref={ref} onScroll={messe}>{children}</div>
    </div>
  );
}

/** In die Zwischenablage; ohne HTTPS (z. B. http://nas:8080) über ein unsichtbares Textfeld. */
async function kopiere(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* weiter mit dem Rückfall */ }
  const t = document.createElement('textarea');
  t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t); t.select();
  try { return document.execCommand('copy'); } catch { return false; } finally { t.remove(); }
}

/** Rückmeldung zu „Link kopieren“ (#98); klappt das Kopieren nicht, steht der Link markiert zum Kopieren da. */
function LinkKopiert({ link, ok, schliessen }: { link: string; ok: boolean; schliessen(): void }) {
  return (
    <div className={`hinweis ${ok ? 'gut' : 'warn'} linkkopiert`} role="status">
      <p>{ok ? 'Link kopiert:' : 'Kopieren ging nicht – markiere den Link und kopiere ihn selbst:'}</p>
      <input type="text" readOnly value={link} aria-label="Link auf diese Mappe" onFocus={(e) => e.target.select()} autoFocus={!ok} />
      <button type="button" className="textknopf" onClick={schliessen}>Schließen</button>
    </div>
  );
}

let zaehler = 0;

/** Mappen, die laut Register hierher verweisen (alle oder nur gewählte Quellen). */
function verknuepfungsGruppen(d: ReturnType<typeof useDaten>, mappe: Mappe | undefined, typId: string, register: Register, details?: MappeDetails | null) {
  const gewaehlt = register.quellen ?? [];
  return d.typen.flatMap((t) => t.felder
    .filter((f) => f.typ === 'referenz' && (f.zielTyp === typId || f.zielTyp === '*'))
    .filter((f) => !gewaehlt.length || gewaehlt.some((q) => q.typId === t.id && q.feldKey === f.key))
    .map((f) => ({
      t, f,
      // Trefferliste dieser Quelle (#75); fehlt sie (mehr), einfache Liste.
      liste: trefferlistenVon(t).find((l) => l.key === gewaehlt.find((q) => q.typId === t.id && q.feldKey === f.key)?.trefferliste),
      treffer: !mappe || !details ? [] as Rueckverweis[] : details.rueckverweise.filter((r) => r.quelleTypId === t.id && r.feldKey === f.key),
    })));
}

function Formular({ typ, mappe, start, sicht, anhang = '', details, neuLaden, zuordnen, registerWunsch, mitVerknuepften, loeschWunsch = 0 }: {
  typ: Mappentyp; mappe?: Mappe; start: RohWerte; sicht: string; anhang?: string; details?: MappeDetails | null; neuLaden?: () => Promise<void>; zuordnen?: ZuordnenNachher;
  /** „Mit verknüpften Mappen löschen …“ (#424) – als weiterer Weg unter „Warum nicht?“ (#423). */
  mitVerknuepften?: () => void;
  /** Register von außen öffnen (#427); `n` zählt, damit derselbe Wunsch erneut wirkt. */
  registerWunsch?: { key: string; n: number };
  /** „Mappe löschen …“ aus dem Menü „Mappe ▾“ (Handy, #489): zählt hoch, jeder neue Wert löscht (mit Rückfrage). */
  loeschWunsch?: number;
}) {
  const d = useDaten();
  const { ich } = useKonto();
  // Register des Typs plus System-Register „Notizen“ vor der Historie (#427).
  const register = mitNotizen(registerVon(typ));
  // Nur lesbar: Systemfelder von Benutzern, Name einer Systemrolle (#26, #27).
  const geschuetzt = geschuetzteFelder(typ, mappe);
  // Berechtigungen (#126): ohne „Bearbeiten“ nur ansehen; Löschen und Passwörter je nach Recht.
  const rechte = mappe ? details?.rechte : undefined;
  const nurLesen = !!rechte && !rechte.U;
  const darfLoeschenHier = !rechte || rechte.D;
  // „Mappe löschen“ (#423): nie kommentarlos grau – warum nicht, steht auf Klick direkt am Knopf.
  const loeschenZeigen = !!mappe && darfLoeschen(typ, mappe);
  const loeschSperre: Loeschsperre | undefined = !loeschenZeigen ? undefined
    : !darfLoeschenHier ? { grund: 'Mappen dieses Mappentyps darfst du nach den Berechtigungen nicht löschen. Das legt ein Administrator fest.' }
    : details?.loeschbar?.ok === false ? { grund: details.loeschbar.grund ?? 'Diese Mappe lässt sich gerade nicht löschen.', rueckverweise: details.loeschbar.rueckverweise }
    : undefined;
  // Weitere Löschwege trotz Sperre (z. B. „Mit verknüpften Mappen löschen …“, #424) kommen über `wege` dazu.
  const loeschKnopf = loeschenZeigen ? <LoeschKnopf sperre={loeschSperre} loeschen={() => void loeschen()}
    wege={mitVerknuepften && <button type="button" className="textknopf gefahr klein" onClick={mitVerknuepften}>Mit verknüpften Mappen löschen …</button>} /> : <span />;
  // Sprung aus der Suche nach einer Archivnummer (#345): ?register=… öffnet das Register.
  // Erwähnung in einer Notiz (#427): gleich den Register „Notizen“.
  const [aktiv, setAktiv] = useState(() => startRegister(register, new URLSearchParams(location.search).get('register'), details?.aufgaben, ich.id));
  useEffect(() => { if (registerWunsch) setAktiv(registerWunsch.key); }, [registerWunsch]);
  const [basis, setBasis] = useState(() => JSON.stringify(start));
  const [roh, setRoh] = useState<RohWerte>(start);
  const [neueDateien, setNeueDateien] = useState<NeueDatei[]>([]);
  const [entfernt, setEntfernt] = useState<string[]>([]);
  const [fehler, setFehler] = useState<Pruefergebnis | null>(null);
  const [meldung, setMeldung] = useState<string>();
  const [hinweise, setHinweise] = useState<Array<{ art: 'warn' | 'schlecht'; text: ReactNode }>>([]);
  const [sendet, setSendet] = useState(false);
  // Titel und Typ der Mappen, auf die verwiesen wird (vom Server und aus der Auswahl).
  const [bekannt, setBekannt] = useState<Bezuege>(details?.bezuege ?? {});
  useEffect(() => { if (details) setBekannt((b) => ({ ...b, ...details.bezuege })); }, [details]);
  const merke = (id: string, b: { titel: string; typId: string }) => setBekannt((x) => (x[id]?.titel === b.titel ? x : { ...x, [id]: b }));
  const werteGeaendert = JSON.stringify(roh) !== basis;
  // Hat sich die Mappe anderswo geändert (z. B. „Datum auf … setzen“, #130) und ist hier nichts ungespeichert: übernehmen.
  const startJson = JSON.stringify(start);
  useEffect(() => {
    if (mappe && !werteGeaendert && startJson !== basis) { setBasis(startJson); setRoh(JSON.parse(startJson)); }
  }, [startJson]); // eslint-disable-line react-hooks/exhaustive-deps
  const dokumenteGeaendert = neueDateien.length > 0 || entfernt.length > 0;
  const geaendert = werteGeaendert || dokumenteGeaendert || !mappe;
  useUngespeichert(werteGeaendert || dokumenteGeaendert);

  const dokumenteIn = (key: string) => (details?.dokumente ?? []).filter((x) => x.registerKey === key);
  const anzahl = (r: AnsichtsRegister): number | undefined => {
    if (r.art === 'notizen') return mappe ? details?.notizen?.length ?? 0 : undefined;
    if (r.art === 'dokumente') return dokumenteIn(r.key).filter((x) => !entfernt.includes(x.id)).length + neueDateien.filter((n) => n.register === r.key).length;
    if (r.art === 'verknuepfungen') return verknuepfungsGruppen(d, mappe, typ.id, r, details).reduce((a, g) => a + g.treffer.length, 0);
    return undefined;
  };
  const verwerfen = () => { setRoh(JSON.parse(basis)); setNeueDateien([]); setEntfernt([]); setFehler(null); setMeldung(undefined); setHinweise([]); };

  const reg = register.find((r) => r.key === aktiv) ?? register[0];
  const felderAuf = (r: Register) => typ.felder.filter((f) => r.felder?.includes(f.key));
  const fehlerAuf = (r: AnsichtsRegister) => (r.art === 'felder' ? felderAuf(r).filter((f) => fehler?.felder[f.key]).length : 0);

  /** Auswahlfilter mit Werten dieser Mappe (#173): nur die Felder, von denen er abhängt. */
  const eigeneWerte = (f: Feld): Werte | undefined => {
    const keys = eigeneFelderIm(f.auswahlFilter);
    if (!keys.length) return undefined;
    const w = werteAusRoh(typ, roh);
    return Object.fromEntries(keys.map((k) => [k, w[k] ?? null]));
  };
  const setze = (k: string, v: Roh) => {
    setRoh((r) => ({ ...r, [k]: v }));
    if (fehler?.felder[k]) setFehler((f) => f && { ...f, felder: Object.fromEntries(Object.entries(f.felder).filter(([x]) => x !== k)) });
  };

  function zeigeFehler(p: Pruefergebnis) {
    setFehler(p);
    // Zum ersten Register mit Fehler springen, falls das aktuelle keinen hat.
    if (reg?.art === 'felder' && felderAuf(reg).some((f) => p.felder[f.key])) return;
    const ziel = register.find((r) => r.art === 'felder' && felderAuf(r).some((f) => p.felder[f.key]));
    if (ziel) setAktiv(ziel.key);
  }

  async function speichern() {
    setMeldung(undefined);
    const werte = werteAusRoh(typ, roh);
    const p = d.pruefe(typ, werte, (id) => bekannt[id]?.typId);
    if (!istOk(p)) { zeigeFehler(p); setMeldung('Bitte die markierten Felder prüfen.'); return; }
    // Würde man sich mit diesen Werten selbst das Lesen oder Bearbeiten entziehen? Dann erst fragen (#126).
    if (mappe && werteGeaendert && ich.rolle !== 'admin') {
      const r = await api.rechteVorschau(mappe.id, werte).catch(() => null);
      if (r && !r.R && !(await rueckfrage({ titel: 'Trotzdem speichern?', text: 'Nach dem Speichern kannst du diese Mappe nach den Berechtigungen nicht mehr sehen.', ja: 'Trotzdem speichern', gefahr: true }))) return;
      if (r && r.R && !r.U && !(await rueckfrage({ titel: 'Trotzdem speichern?', text: 'Nach dem Speichern kannst du diese Mappe nach den Berechtigungen nicht mehr bearbeiten.', ja: 'Trotzdem speichern', gefahr: true }))) return;
    }
    setSendet(true); setHinweise([]);
    let gespeichert: (Mappe & { hinweis?: string }) | undefined = mappe;
    try {
      if (!mappe || werteGeaendert) gespeichert = mappe ? await api.mappeAendern(mappe.id, { werte }) : await api.mappeAnlegen({ typId: typ.id, werte });
      setFehler(null); setBasis(JSON.stringify(roh));
    } catch (e) {
      const f = e as ApiFehler;
      if (f.pruefung) zeigeFehler(f.pruefung);
      setMeldung(f.message);
      setSendet(false);
      return;
    }
    // Dokumente erst jetzt: hochladen, was neu ist, und entfernen, was markiert ist.
    const neu: typeof hinweise = [];
    const offen: NeueDatei[] = [];
    for (const n of neueDateien) {
      try {
        // Gleicher Name (#194): Standard mit Versionierung „neue Version“, sonst „mit Zähler“.
        const gleich = (details?.dokumente ?? []).some((x) => x.registerKey === n.register && !entfernt.includes(x.id) && x.name.toLowerCase() === n.datei.name.toLowerCase());
        const versioniert = !!typ.register.find((r) => r.key === n.register)?.versionierung;
        const r = await api.ladeHoch(gespeichert!.id, n.register, n.datei, gleich ? n.gleicherName ?? (versioniert ? 'version' : 'zaehler') : undefined);
        const anderswo = r.gleicherInhalt.filter((g) => g.mappeId !== gespeichert!.id);
        if (anderswo.length) neu.push({ art: 'warn', text: <>„{n.datei.name}“ hat denselben Inhalt wie {anderswo.map((g, j) => { return <span key={j}>{j > 0 && ', '}„{g.name}“ in {g.typId ? <Link to={`/ablage/${g.typId}/${g.mappeId}`} className="verweis">{titelOder(g.titel)}</Link> : 'einer anderen Mappe'}</span>; })}. Gespeichert ist die Datei nur einmal.</> });
      } catch (e) {
        offen.push(n);
        neu.push({ art: 'schlecht', text: `„${n.datei.name}“ wurde nicht hochgeladen: ${(e as Error).message}` });
      }
    }
    // Zuordnen (#192): Die Post gehört jetzt zu dieser neuen Mappe.
    if (!mappe && zuordnen) {
      try { await api.zuordnen(zuordnen.post, { ziel: gespeichert!.id, register: zuordnen.register, dokumente: zuordnen.dokumente, kopieren: zuordnen.kopieren }); }
      catch (e) { await hinweis({ titel: 'Post nicht zugeordnet', text: `Die Mappe ist angelegt, aber das Zuordnen der Post ging nicht: ${(e as Error).message}` }); }
    }
    const nichtEntfernt: string[] = [];
    for (const id of entfernt) {
      try { await api.dokumentLoeschen(id); } catch (e) { nichtEntfernt.push(id); neu.push({ art: 'schlecht', text: (e as Error).message }); }
    }
    setNeueDateien(offen); setEntfernt(nichtEntfernt); setHinweise(neu);
    if (!offen.length && !nichtEntfernt.length) loeseWache();
    // Lesen verloren (#126): zurück zur Liste, mit Hinweis.
    const verloren = gespeichert?.hinweis?.includes('nicht mehr sehen');
    if (verloren) { loeseWache(); await hinweis({ titel: 'Gespeichert', text: gespeichert!.hinweis }); await d.neuLaden(); geheZu(`/ablage/${sicht}${anhang}`); return; }
    await d.neuLaden();
    await neuLaden?.();
    setSendet(false);
    if (!mappe) geheZu(`/ablage/${sicht}/${gespeichert!.id}`);
    else setMeldung(gespeichert?.hinweis ?? (offen.length || nichtEntfernt.length ? 'Teilweise gespeichert.' : 'Gespeichert.'));
  }

  async function loeschen() {
    if (!mappe) return;
    const n = details?.dokumente.length ?? 0;
    const korb = d.zaehler.papierkorbTage ?? 0;
    // Grund fürs Löschprotokoll (#470).
    const anlass = await mitGrund(korb
      ? { titel: `Mappe „${titelOder(mappe.titel)}“ in den Papierkorb legen?`, text: `${n ? `Ihre ${n} Dokument${n === 1 ? '' : 'e'} kommen mit. ` : ''}Dort lässt sie sich ${korb === 1 ? 'einen Tag' : `${korb} Tage`} lang wiederherstellen.`, ja: 'In den Papierkorb', gefahr: true }
      : { titel: `Mappe „${titelOder(mappe.titel)}“ endgültig löschen?`, text: `${n ? `Ihre ${n} Dokument${n === 1 ? '' : 'e'} werden mitgelöscht. ` : ''}Das lässt sich nicht rückgängig machen.`, ja: 'Endgültig löschen', gefahr: true });
    if (!anlass) return;
    try {
      await api.mappeLoeschen(mappe.id, anlass);
      loeseWache(); await d.neuLaden(); geheZu(`/ablage/${sicht}${anhang}`);
    } catch (e) { setMeldung((e as Error).message); }
  }

  const loeschenRef = useRef({ loeschen, loeschSperre });
  loeschenRef.current = { loeschen, loeschSperre };
  const ersterLoeschWunsch = useRef(loeschWunsch);
  useEffect(() => {
    if (loeschWunsch === ersterLoeschWunsch.current) return;
    const { loeschen: tu, loeschSperre: sperre } = loeschenRef.current;
    if (sperre) void hinweis({ titel: 'Löschen nicht möglich', text: sperre.grund });
    else void tu();
  }, [loeschWunsch]);

  let inhalt: ReactNode = null;
  if (!reg) inhalt = <p className="leise">Dieser Mappentyp hat keine Register.</p>;
  else if (reg.art === 'felder') {
    const felder = felderAuf(reg);
    inhalt = felder.length
      ? <div className="formular">{felder.map((f) => <FeldEingabe key={f.key} feld={f} roh={roh[f.key]} fehler={fehler?.felder[f.key]?.[0]} setze={(v) => setze(f.key, v)} eigeneId={mappe?.id} bekannt={bekannt} merke={merke}
          typId={typ.id} unpassend={details?.unpassend?.[f.key]} eigene={eigeneWerte(f)}
          gesperrt={geschuetzt[f.key] ?? (nurLesen && f.typ !== 'passwort' ? '' : undefined)} nurLesen={nurLesen} passwortSehen={!rechte || rechte.P} />)}</div>
      : <p className="leise">Auf diesem Register liegen keine Felder.</p>;
  } else if (reg.art === 'dokumente') {
    inhalt = mappe && !details ? <p className="leise">Lade …</p> : (
      <Dokumente key={reg.key} register={reg} dokumente={dokumenteIn(reg.key)} neue={neueDateien.filter((n) => n.register === reg.key)} entfernt={entfernt}
        hinzufuegen={(dateien) => setNeueDateien((x) => [...x, ...dateien.map((datei) => ({ uid: `n${++zaehler}`, datei, register: reg.key }))])}
        entferne={(id) => setEntfernt((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))}
        entferneMehrere={(ids) => setEntfernt((x) => [...x, ...ids.filter((id) => !x.includes(id))])}
        vergiss={(uid) => setNeueDateien((x) => x.filter((n) => n.uid !== uid))} nurLesen={nurLesen}
        setzeNeue={(uid, patch) => setNeueDateien((x) => x.map((n) => (n.uid === uid ? { ...n, ...patch } : n)))}
        neuLaden={mappe ? async () => { await neuLaden?.(); await d.neuLaden(); } : undefined} post={typ.system === 'post'} typ={typ} mappeTitel={mappe?.titel ?? ''} />
    );
  } else if (reg.art === 'notizen') {
    inhalt = !mappe ? <p className="leise">Notizen gehen nach dem ersten Speichern.</p>
      : !details ? <p className="leise">Lade …</p>
      : <Notizen mappeId={mappe.id} notizen={details.notizen ?? []} neuLaden={async () => { await neuLaden?.(); }} />;
  } else if (reg.art === 'protokoll') {
    inhalt = mappe ? <Historie mappeId={mappe.id} stand={mappe.geaendert} /> : <p className="leise">Die Historie beginnt mit dem ersten Speichern.</p>;
  } else if (!mappe) {
    inhalt = <p className="leise">Verknüpfungen entstehen, sobald andere Mappen auf diese verweisen – also nach dem ersten Speichern.</p>;
  } else if (!details) {
    inhalt = <p className="leise">Lade …</p>;
  } else {
    inhalt = <Verknuepfungen mappe={mappe} gruppen={verknuepfungsGruppen(d, mappe, typ.id, reg, details)} />;
  }

  return (
    <form className="blatt mitregistern" onSubmit={(e) => { e.preventDefault(); void speichern(); }} noValidate>
      <RegisterReihe aktiv={reg?.key}>
        {register.map((r) => {
          const n = fehlerAuf(r);
          const zahl = anzahl(r);
          return (
            <button key={r.key} type="button" role="tab" aria-selected={r.key === reg?.key} className={`registertab art-${r.art} ${r.key === reg?.key ? 'an' : ''}`}
              onClick={() => setAktiv(r.key)}>
              {r.name}
              {n > 0 && <span className="fehlerpunkt" title={`${n} Feld${n === 1 ? '' : 'er'} mit Fehler`}>{n}</span>}
              {zahl !== undefined && <span className="anzahl">{zahl}</span>}
            </button>
          );
        })}
      </RegisterReihe>
      {fehler?.allgemein.length ? <div className="hinweis schlecht"><p>{fehler.allgemein.join(' ')}</p></div> : null}
      {hinweise.map((h, i) => <div key={i} className={`hinweis ${h.art}`}><p>{h.text}</p></div>)}
      <div className="registerinhalt" role="tabpanel">{inhalt}</div>
      {nurLesen ? <div className="speicherleiste">
        <span className="hy-nur-breit">{loeschKnopf}</span>
        <span className="status" role="status">{meldung ?? 'Nur lesen – bearbeiten darfst du diese Mappe nach den Berechtigungen nicht.'}</span>
        <span />
      </div> : <div className={`speicherleiste${mappe && !werteGeaendert && !dokumenteGeaendert && !sendet && !meldung ? ' hy-ruhig' : ''}`}>
        <span className="hy-nur-breit">{loeschKnopf}</span>
        <span className={`status ${meldung && fehler ? 'schlecht' : ''}`} role="status">{sendet ? 'Speichere …' : meldung ?? (mappe && (werteGeaendert || dokumenteGeaendert) ? 'Ungespeicherte Änderungen' : '')}</span>
        <div className="knoepfe">
          {mappe
            ? <button type="button" className="knopf" disabled={!(werteGeaendert || dokumenteGeaendert) || sendet} onClick={verwerfen}><span className="hy-nur-breit">Änderungen verwerfen</span><span className="hy-nur-schmal">Verwerfen</span></button>
            : <Link to={`/ablage/${sicht}`} className="knopf">Abbrechen</Link>}
          <button type="submit" className="knopf gruen" disabled={sendet}>{sendet ? 'Speichere …' : <><span className="hy-nur-breit">Mappe speichern</span><span className="hy-nur-schmal">Speichern</span></>}</button>
        </div>
      </div>}
    </form>
  );
}

function FeldEingabe({ feld: f, roh, fehler, setze, eigeneId, bekannt, merke, gesperrt, nurLesen, passwortSehen = true, typId, unpassend, eigene }: {
  feld: Feld; roh: Roh | undefined; fehler?: string; setze: (v: Roh) => void; eigeneId?: string;
  /** Typ der Mappe und Verweise, die nicht (mehr) zum Auswahlfilter passen (#172). */
  typId?: string; unpassend?: string[];
  /** Werte dieser Mappe, von denen der Auswahlfilter abhängt (#173). */
  eigene?: Werte;
  bekannt: Bezuege; merke: (id: string, b: { titel: string; typId: string }) => void;
  /** Grund, warum das Feld hier nur angezeigt wird. */
  gesperrt?: string;
  /** Berechtigungen (#126): ohne „Bearbeiten“ bzw. ohne „Passwörter sehen“. */
  nurLesen?: boolean; passwortSehen?: boolean;
}) {
  const d = useDaten();
  const id = `feld-${f.key}`;
  let ctl: ReactNode;
  let breit = false;
  let mitLabelFor = true;

  if (gesperrt !== undefined) {
    mitLabelFor = false;
    const ids = f.typ === 'referenz' ? (Array.isArray(roh) ? roh as string[] : roh ? [String(roh)] : []) : [];
    ctl = <div className="festwert" title={gesperrt}>{
      f.typ === 'referenz'
        ? <ul>{ids.map((x) => <li key={x}>{bekannt[x]?.typId && !bekannt[x].verborgen ? <Link to={`/ablage/${bekannt[x].typId}/${x}`} className="verweis">{titelOder(bekannt[x].titel)}</Link> : <span className={bekannt[x]?.verborgen ? 'verborgen-titel' : ''}>{titelOder(bekannt[x]?.titel)}</span>}</li>)}</ul>
        : f.typ === 'janein' ? (roh ? 'Ja' : 'Nein') : f.typ === 'formatiert' ? <Formatiert text={String(roh ?? '')} />
        : f.typ === 'datum' ? formatiere(f, String(roh ?? '')) : f.typ === 'langtext' ? <span className="mehrzeilig">{String(roh ?? '')}</span> : String(roh ?? '')
    }</div>;
    return (
      <div className={`feld ${f.typ === 'langtext' || f.typ === 'formatiert' ? 'breit' : ''}`}>
        <div className="feldkopf"><span className="label">{f.label}</span></div>
        {ctl}
        <span className="hilfe">{gesperrt}</span>
        {fehler && <p className="fehlertext">{fehler}</p>}
      </div>
    );
  }

  switch (f.typ) {
    case 'langtext':
      breit = true;
      ctl = <textarea id={id} rows={3} value={String(roh ?? '')} onChange={(e) => setze(e.target.value)} />;
      break;
    case 'zahl':
      ctl = <input id={id} inputMode="decimal" value={String(roh ?? '')} onChange={(e) => setze(e.target.value)} />;
      break;
    case 'betrag': {
      const b = (roh ?? { betrag: '', waehrung: 'EUR' }) as RohBetrag;
      ctl = (
        <div className="betrag">
          <input id={id} inputMode="decimal" placeholder="0,00" value={b.betrag} onChange={(e) => setze({ ...b, betrag: e.target.value })} />
          <input aria-label="Währung" className="mono" maxLength={3} value={b.waehrung} onChange={(e) => setze({ ...b, waehrung: e.target.value.toUpperCase() })} />
        </div>
      );
      break;
    }
    case 'datum':
      ctl = <input id={id} type="date" value={String(roh ?? '')} onChange={(e) => setze(e.target.value)} />;
      break;
    case 'janein':
      mitLabelFor = false;
      ctl = <label className="haken"><input id={id} type="checkbox" checked={!!roh} onChange={(e) => setze(e.target.checked)} /><span>Ja</span></label>;
      break;
    case 'auswahl': {
      const optionen = f.optionen ?? [];
      if (f.mehrfach) {
        mitLabelFor = false;
        const gewaehlt = (roh as string[]) ?? [];
        ctl = <div className="auswahlliste">{optionen.map((o) => (
          <label key={o} className="haken"><input type="checkbox" checked={gewaehlt.includes(o)} onChange={(e) => setze(e.target.checked ? [...gewaehlt, o] : gewaehlt.filter((x) => x !== o))} /><span>{o}</span></label>
        ))}</div>;
      } else {
        const r = String(roh ?? '');
        ctl = <select id={id} value={r} onChange={(e) => setze(e.target.value)}>
          <option value="">– keine Angabe –</option>
          {optionen.map((o) => <option key={o}>{o}</option>)}
          {r && !optionen.includes(r) && <option>{r}</option>}
        </select>;
      }
      break;
    }
    case 'referenz': {
      const ziel = d.typ(f.zielTyp);
      if (!ziel) { ctl = <p className="leise">Der Ziel-Mappentyp existiert nicht mehr.</p>; break; }
      mitLabelFor = !f.mehrfach;
      ctl = <MappenWahl id={id} ziel={ziel} mehrfach={!!f.mehrfach} wert={roh as string | string[] | undefined} eigeneId={eigeneId}
        bekannt={bekannt} merke={merke} setze={setze}
        sicht={f.auswahlFilter?.length && typId ? `feld:${typId}:${f.key}` : undefined}
        vorbelegen={f.auswahlFilter?.length ? vorbelegungAus(f.auswahlFilter, ziel) : undefined}
        unpassend={unpassend} eigene={eigene} />;
      break;
    }
    case 'formatiert':
      breit = true;
      mitLabelFor = false;
      ctl = <FormatiertEingabe id={id} wert={String(roh ?? '')} setze={setze} />;
      break;
    case 'passwort':
      ctl = <PasswortEingabe id={id} feld={f} roh={(roh ?? leeresPasswort) as RohPasswort} setze={setze} mappeId={eigeneId} nurLesen={nurLesen} sehen={passwortSehen} />;
      break;
    default:
      ctl = <input id={id} value={String(roh ?? '')} onChange={(e) => setze(e.target.value)} />;
  }

  return (
    <div className={`feld ${breit ? 'breit' : ''} ${fehler ? 'fehlerhaft' : ''}`}>
      <div className="feldkopf">
        {mitLabelFor ? <label htmlFor={id}>{f.label}{f.pflicht && <span className="pflicht">*</span>}</label> : <span className="label">{f.label}{f.pflicht && <span className="pflicht">*</span>}</span>}
        {f.typ === 'referenz' && <span className="chip">{VERWEISARTEN[f.verweisart ?? 'bezug']}</span>}
      </div>
      {ctl}
      {f.hilfe && <span className="hilfe">{f.hilfe}</span>}
      {fehler && <p className="fehlertext">{fehler}</p>}
    </div>
  );
}


/**
 * Passwortfeld (#46): Das gespeicherte Passwort kommt nie mit der Mappe. Das Auge holt es
 * einzeln vom Server (steht im Protokoll); zum Ändern wird ein neues eingegeben.
 */
function PasswortEingabe({ id, feld: f, roh: p, setze, mappeId, nurLesen, sehen = true }: { id: string; feld: Feld; roh: RohPasswort; setze: (v: Roh) => void; mappeId?: string; nurLesen?: boolean; sehen?: boolean }) {
  const { passwoerterMoeglich } = useKonto();
  const [klartext, setKlartext] = useState<string | null>(null);
  const [zeigen, setZeigen] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [aendern, setAendern] = useState(false);
  // Nach dem Speichern (neuer Stand vom Server) die Anzeige zurücksetzen.
  useEffect(() => { if (!p.neu) { setKlartext(null); setAendern(false); setZeigen(false); } }, [p.gesetzt, p.lesbar]); // eslint-disable-line react-hooks/exhaustive-deps
  const auge = (an: boolean) => <Symbol name={an ? 'auge-aus' : 'auge'} />;

  if (p.entfernen) return (
    <div className="passwort">
      <span className="festwert leise">wird beim Speichern entfernt</span>
      <button type="button" className="knopf klein" onClick={() => setze({ ...p, entfernen: false })}>Rückgängig</button>
    </div>
  );

  if (nurLesen && !p.gesetzt) return <span id={id} className="festwert leise">kein Passwort gespeichert</span>;
  if (p.gesetzt && (!aendern || nurLesen) && !p.neu) {
    async function umschalten() {
      if (klartext !== null) { setKlartext(null); return; }
      if (!mappeId) return;
      setLaedt(true); setFehler(undefined);
      try { setKlartext((await api.passwortAnzeigen(mappeId, f.key)).wert); } catch (e) { setFehler((e as Error).message); } finally { setLaedt(false); }
    }
    return (
      <>
        <div className="passwort">
          <span id={id} className={`festwert mono ${p.lesbar ? '' : 'leise'}`} aria-live="polite">{!p.lesbar ? 'nicht lesbar – bitte neu eingeben' : klartext ?? '••••••••'}</span>
          {p.lesbar && mappeId && sehen && <button type="button" className="knopf klein" disabled={laedt} onClick={() => void umschalten()} title={klartext === null ? 'Passwort anzeigen (wird protokolliert)' : 'Passwort verbergen'} aria-label={klartext === null ? 'Passwort anzeigen' : 'Passwort verbergen'}>{auge(klartext !== null)}</button>}
          {!nurLesen && <button type="button" className="knopf klein" disabled={!passwoerterMoeglich} onClick={() => { setKlartext(null); setAendern(true); }}>Ändern</button>}
          {!nurLesen && <button type="button" className="knopf klein" onClick={() => { setKlartext(null); setze({ ...p, entfernen: true }); }} title="Wird erst mit „Mappe speichern“ wirksam">Passwort entfernen</button>}
        </div>
        {fehler && <p className="fehlertext">{fehler}</p>}
        {!sehen && p.lesbar && <span className="hilfe">Passwörter dieser Mappe darfst du nach den Berechtigungen nicht sehen.</span>}
        {!passwoerterMoeglich && !nurLesen && <span className="hilfe">Ändern geht erst wieder, wenn ein Administrator den Schlüssel bereitstellt (Werkbank → Verschlüsselung).</span>}
      </>
    );
  }

  if (!passwoerterMoeglich) return (
    <>
      <input id={id} type="password" disabled placeholder="nicht möglich" />
      <span className="hilfe">Passwörter lassen sich erst speichern, wenn ein Administrator in der Werkbank unter „Verschlüsselung“ einen Schlüssel erzeugt hat.</span>
    </>
  );

  return (
    <div className="passwort">
      <input id={id} type={zeigen ? 'text' : 'password'} value={p.neu} autoComplete="new-password" spellCheck={false}
        placeholder={p.gesetzt ? 'neues Passwort' : ''} onChange={(e) => setze({ ...p, neu: e.target.value })} />
      <button type="button" className="knopf klein" onClick={() => setZeigen(!zeigen)} aria-label={zeigen ? 'Eingabe verbergen' : 'Eingabe anzeigen'} title={zeigen ? 'Eingabe verbergen' : 'Eingabe anzeigen'}>{auge(zeigen)}</button>
      {p.gesetzt && <button type="button" className="knopf klein" onClick={() => { setze({ ...p, neu: '' }); setAendern(false); setZeigen(false); }}>Abbrechen</button>}
    </div>
  );
}

/* ---------- Verknüpfungsregister ---------- */

/** Warum sich die Mappe nicht löschen lässt: Grund und ggf. die Mappen, die noch verweisen (#79). */
interface Loeschsperre { grund: string; rueckverweise?: Rueckverweis[] }

/**
 * „Mappe löschen“ mit der Begründung auf Klick (#423): Ist Löschen gesperrt (Verweise, Archivmodus,
 * fehlendes Recht), steht neben dem grauen Knopf „Warum nicht?“ und klappt die Begründung direkt
 * am Knopf auf. Bildschirmleser hören den Grund über aria-describedby schon am Knopf.
 *
 * `wege`: weitere Löschwege, die trotz Sperre gehen – sie stehen in der aufgeklappten Begründung
 * unter „Stattdessen“ (z. B. „Mit verknüpften Mappen löschen …“, #424).
 */
function LoeschKnopf({ sperre, loeschen, wege }: { sperre?: Loeschsperre; loeschen(): void; wege?: ReactNode }) {
  const d = useDaten();
  const [offen, setOffen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!offen) return;
    const zu = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOffen(false);
    };
    document.addEventListener('mousedown', zu); document.addEventListener('keydown', zu);
    return () => { document.removeEventListener('mousedown', zu); document.removeEventListener('keydown', zu); };
  }, [offen]);
  useEffect(() => { if (!sperre) setOffen(false); }, [sperre]);
  if (!sperre) return <button type="button" className="textknopf gefahr" onClick={loeschen}>Mappe löschen</button>;
  const quellen = [...new Map((sperre.rueckverweise ?? []).map((r) => [r.quelleId, r])).values()];
  const zeige = quellen.slice(0, 8);
  return (
    <div className="loeschwahl" ref={ref}>
      <button type="button" className="textknopf gefahr" disabled aria-describedby="loeschwahl-grund">Mappe löschen</button>
      <span id="loeschwahl-grund" className="sr-only">Löschen nicht möglich: {sperre.grund}</span>
      <button type="button" className="textknopf klein loeschwahl-warum" aria-expanded={offen} aria-controls="loeschwahl-begruendung" onClick={() => setOffen(!offen)}>
        <Symbol name="info" /> Warum nicht?
      </button>
      {offen && (
        <div className="loeschwahl-begruendung klein" id="loeschwahl-begruendung" role="region" aria-label="Warum sich die Mappe nicht löschen lässt">
          <p><strong>Löschen nicht möglich:</strong> {sperre.grund}</p>
          {zeige.length > 0 && <ul>{zeige.map((r) => (
            <li key={r.quelleId}>{r.verborgen ? <span className="verborgen-titel">{r.titel}</span> : <Link to={`/ablage/${r.quelleTypId}/${r.quelleId}`} className="verweis">{titelOder(r.titel)}</Link>} <span className="leise">({d.typ(r.quelleTypId)?.name ?? 'Mappe'})</span></li>
          ))}{quellen.length > zeige.length && <li className="leise">und {quellen.length - zeige.length} weitere</li>}</ul>}
          {wege && <div className="loeschwahl-wege"><p className="leise">Stattdessen:</p>{wege}</div>}
        </div>
      )}
    </div>
  );
}

function Verknuepfungen({ mappe, gruppen }: { mappe: Mappe; gruppen: ReturnType<typeof verknuepfungsGruppen> }) {
  const d = useDaten();
  if (!gruppen.length) return <p className="leise">Kein Mappentyp verweist auf „{d.typ(mappe.typId)?.name}“. Lege dafür in der Werkbank ein Verweisfeld an.</p>;
  return (
    <div className="gruppen">
      {gruppen.map(({ t, f, treffer, liste }) => (
        <section key={`${t.id}-${f.key}`} className="gruppe">
          <header>
            <span><strong>{t.name}</strong> <span className="leise">über „{f.label}“</span> <span className="chip">{VERWEISARTEN[f.verweisart ?? 'bezug']}</span> <span className="anzahl">{treffer.length}</span></span>
            {darfErstellen(t) && <Link to={`/ablage/${t.id}/neu?verweis=${encodeURIComponent(`${f.key}:${mappe.id}`)}`} className="knopf klein">+ {t.name} anlegen</Link>}
          </header>
          {!treffer.length ? <p className="leise">Noch keine.</p>
            : liste?.spalten.length ? <VerweisTabelle mappeId={mappe.id} typ={t} feldKey={f.key} spalten={liste.spalten} anzahl={treffer.length} />
            : <Trefferliste treffer={treffer} />}
        </section>
      ))}
    </div>
  );
}

/** Verweisende Mappen als Tabelle mit den Spalten einer Trefferliste (#75). */
function VerweisTabelle({ mappeId, typ, feldKey, spalten, anzahl }: { mappeId: string; typ: Mappentyp; feldKey: string; spalten: string[]; anzahl: number }) {
  const d = useDaten();
  const [daten, setDaten] = useState<{ gesamt: number; mappen: Mappe[]; bezuege: Bezuege } | null>(null);
  const [fehler, setFehler] = useState<string>();
  useEffect(() => { api.verweisende(mappeId, typ.id, feldKey).then(setDaten, (e: Error) => setFehler(e.message)); }, [mappeId, typ.id, feldKey, anzahl, d.stand]);
  if (fehler) return <p className="fehlertext klein">{fehler}</p>;
  if (!daten) return <p className="leise klein">Lade …</p>;
  const rechts = (k: string) => { const f = typ.felder.find((x) => x.key === k); return f?.typ === 'zahl' || f?.typ === 'betrag'; };
  return (
    <div className="trefferliste verweistabelle">
      <table>
        <thead><tr>{spalten.map((k) => <th key={k} className={rechts(k) ? 'rechts' : ''}>{spaltenName(k, typ)}</th>)}</tr></thead>
        <tbody>
          {daten.mappen.map((m) => {
            const ziel = `/ablage/${typ.id}/${m.id}`;
            return (
              <tr key={m.id} onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) geheZu(ziel); }}>
                {spalten.map((k, i) => {
                  const text = zelle(k, m, typ, daten.bezuege, d.person);
                  return <td key={k} className={rechts(k) ? 'rechts' : ''}>{i === 0 ? <Link to={ziel}>{text || titelOder(m.titel)}</Link> : text}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {daten.gesamt > daten.mappen.length && <p className="leise klein">Die ersten {daten.mappen.length.toLocaleString('de-DE')} von {daten.gesamt.toLocaleString('de-DE')}.</p>}
    </div>
  );
}

/** Verweisende Mappen; bei sehr vielen erst die ersten 100. */
function Trefferliste({ treffer }: { treffer: Rueckverweis[] }) {
  const [alle, setAlle] = useState(false);
  const sichtbar = alle ? treffer : treffer.slice(0, 100);
  return (
    <>
      <ul>{sichtbar.map((r) => <li key={r.quelleId + r.feldKey}><Link to={`/ablage/${r.quelleTypId}/${r.quelleId}`} className="verweis">{titelOder(r.titel)}</Link></li>)}</ul>
      {sichtbar.length < treffer.length && <button type="button" className="textknopf" onClick={() => setAlle(true)}>Alle {treffer.length.toLocaleString('de-DE')} zeigen</button>}
    </>
  );
}

/* ---------- Auswahl verwiesener Mappen (mit Suche statt langer Klappliste) ---------- */

export function MappenWahl({ id, ziel, mehrfach, wert, eigeneId, bekannt, merke, setze, sicht, vorbelegen, unpassend: vomServer = [], eigene, ohneAnlegen }: {
  id: string; ziel: Mappentyp; mehrfach: boolean; wert: string | string[] | undefined; eigeneId?: string;
  bekannt: Bezuege; merke: (id: string, b: { titel: string; typId: string }) => void; setze: (v: Roh) => void;
  /** Auswahlfilter (#172): Sicht „feld:<typ>:<feld>“ und Vorbelegung für „+ anlegen“. */
  sicht?: string; vorbelegen?: Record<string, unknown>; unpassend?: string[]; eigene?: Werte;
  /** Ohne „+ … anlegen“, z. B. im Testlauf der Werkbank (#371). */
  ohneAnlegen?: boolean;
}) {
  const eigeneText = eigene ? JSON.stringify(eigene) : '';
  const gewaehlt = (Array.isArray(wert) ? wert : wert ? [wert] : []).filter(Boolean);
  const [offen, setOffen] = useState(false);
  const [eingabe, setEingabe] = useState('');
  const [treffer, setTreffer] = useState<Mappe[] | null>(null);
  const [gesamt, setGesamt] = useState(0);
  const [aendern, setAendern] = useState(false);
  const zeigeSuche = mehrfach || !gewaehlt.length || aendern;

  // Titel unbekannter Verweise nachladen (z. B. vorbelegt über ?verweis=…).
  const fehlend = gewaehlt.filter((x) => !bekannt[x]).join(',');
  useEffect(() => {
    for (const x of fehlend ? fehlend.split(',') : []) {
      api.mappe(x).then((r) => merke(x, { titel: r.mappe.titel ?? '', typId: r.mappe.typId })).catch(() => merke(x, { titel: '(gelöschte Mappe)', typId: '' }));
    }
  }, [fehlend]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!offen) return;
    let aktuell = true;
    const t = setTimeout(() => {
      api.seite(sicht ?? `typ:${ziel.id}`, 0, 20, eingabe.trim(), undefined, false, false, undefined, eigeneText ? JSON.parse(eigeneText) as Werte : undefined).then((s) => { if (aktuell) { setTreffer(s.mappen); setGesamt(s.gesamt); } }).catch(() => aktuell && setTreffer([]));
    }, 200);
    return () => { aktuell = false; clearTimeout(t); };
  }, [offen, eingabe, ziel.id, sicht, eigeneText]);

  // Passen die gewählten Mappen noch zu den Werten dieser Mappe (#173)? Hinweis schon vor dem Speichern.
  const gewaehltText = gewaehlt.join(',');
  const [live, setLive] = useState<string[] | null>(null);
  useEffect(() => {
    if (!sicht || !gewaehltText) { setLive(null); return; }
    const [, typId, feldKey] = sicht.split(':');
    let aktuell = true;
    const t = setTimeout(() => { api.auswahlPruefen(typId, feldKey, gewaehltText.split(','), eigeneText ? JSON.parse(eigeneText) as Werte : {}).then((r) => aktuell && setLive(r.unpassend)).catch(() => {}); }, 300);
    return () => { aktuell = false; clearTimeout(t); };
  }, [sicht, gewaehltText, eigeneText]);
  const unpassend = live ?? vomServer;

  function waehle(m: Mappe) {
    merke(m.id, { titel: m.titel ?? '', typId: m.typId });
    setze(mehrfach ? [...gewaehlt, m.id] : m.id);
    setEingabe(''); setOffen(false); setAendern(false);
  }
  const auswahl = (treffer ?? []).filter((m) => m.id !== eigeneId && !gewaehlt.includes(m.id));
  const vor = vorbelegen && Object.keys(vorbelegen).length ? `?vorbelegen=${encodeURIComponent(JSON.stringify(vorbelegen))}` : '';
  const anlegen = !ohneAnlegen && darfErstellen(ziel) ? <Link to={`/ablage/${ziel.id}/neu${vor}`} className="verweis klein">+ {ziel.name} anlegen</Link> : null;

  return (
    <div className="refbox">
      {gewaehlt.length > 0 && (
        <ul className="gewaehlt">
          {gewaehlt.map((x) => (
            <li key={x}>
              {bekannt[x]?.typId && !bekannt[x].verborgen ? <Link to={`/ablage/${bekannt[x].typId}/${x}`} className="verweis">{titelOder(bekannt[x].titel)}</Link> : <span className={bekannt[x]?.verborgen ? 'verborgen-titel' : 'leise'}>{bekannt[x]?.titel ?? 'Lade …'}</span>}
              {unpassend.includes(x) && <span className="chip warn" title="Bleibt gültig; neu wählen lässt sich nur, was zur Auswahl passt.">passt nicht mehr zum Filter</span>}
              <span className="verweisaktionen">
                {!mehrfach && !aendern && <button type="button" className="textknopf klein" onClick={() => { setAendern(true); setOffen(true); }}>Ändern</button>}
                <button type="button" className="textknopf klein gefahr" aria-label="Verweis entfernen" onClick={() => setze(mehrfach ? gewaehlt.filter((y) => y !== x) : '')}>Entfernen</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {zeigeSuche && (
        <div className="wahl" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setOffen(false); setAendern(false); } }}>
          <input id={id} type="search" role="combobox" aria-expanded={offen} aria-autocomplete="list" autoComplete="off"
            placeholder={`${ziel.name} suchen …`} value={eingabe}
            onFocus={() => setOffen(true)} onChange={(e) => { setEingabe(e.target.value); setOffen(true); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setOffen(false); setAendern(false); }
              if (e.key === 'Enter') { e.preventDefault(); if (auswahl[0]) waehle(auswahl[0]); }
            }} />
          {offen && (
            <div className="wahlliste" role="listbox">
              {treffer === null ? <p className="leise klein">Lade …</p>
                : !auswahl.length ? <p className="leise klein">{eingabe ? 'Nichts gefunden.' : `Noch keine Mappe in „${ziel.name}“.`}</p>
                : <>
                    {auswahl.map((m) => <button key={m.id} type="button" role="option" aria-selected={false} onClick={() => waehle(m)}>{titelOder(m.titel)}</button>)}
                    {gesamt > (treffer?.length ?? 0) && <p className="leise klein">{gesamt.toLocaleString('de-DE')} insgesamt – tippe, um einzugrenzen.</p>}
                  </>}
            </div>
          )}
        </div>
      )}
      {anlegen && <div className="zeile">{anlegen}</div>}
    </div>
  );
}
