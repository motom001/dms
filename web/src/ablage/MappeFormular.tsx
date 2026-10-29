import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Stern } from './Stern';
import { spaltenName, zelle } from './spalten';
import { darfErstellen, darfLoeschen, formatiere, trefferlistenVon, geschuetzteFelder, istLeer, istOk,  standardRegister, VERWEISARTEN, type Dokument, type Feld, type Mappe, type Mappentyp, type Pruefergebnis, type Register } from '../../../shared/src/model';
import { api, ApiFehler, type Bezuege, type MappeDetails, type Rueckverweis } from '../api';
import { useDaten } from '../daten';
import { useKonto } from '../konto';
import { geheZu, Link, loeseWache, useUngespeichert } from '../ort';
import { leeresPasswort, rohAusWerten, standardRoh, werteAusRoh, type Roh, type RohBetrag, type RohPasswort, type RohWerte } from '../werte';
import { titelOder } from '../seiten';
import { Formatiert, FormatiertEingabe } from './Formatiert';
import { Historie } from './Historie';
import { Notizen } from './Notizen';
import { AufgabenHinweis, NeueAufgabe } from './Aufgaben';
import { Aktionsmenue, Druckansicht, EmailMaske } from './Aktionen';
import { linkZuMappe } from '../../../shared/src/direktlink';
import { Person } from '../Person';
import { Dokumente, type NeueDatei } from './Dokumente';

const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

/** Register des Typs; ältere Typen ohne Register bekommen die Standardregister. */
const registerVon = (t: Mappentyp): Register[] => (t.register?.length ? t.register : standardRegister(t.felder));

export function NeueMappe({ typ, verweis, sicht }: { typ: Mappentyp; verweis?: string; sicht: string }) {
  const start = standardRoh(typ);
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
      <Formular typ={typ} start={start} sicht={sicht} />
    </>
  );
}

export function MappeAnsicht({ typ, details, sicht, anhang = '', neuLaden }: { typ: Mappentyp; details: MappeDetails; sicht: string; anhang?: string; neuLaden: () => Promise<void> }) {
  const d = useDaten();
  const { ich } = useKonto();
  const mappe = details.mappe;
  const bekannt = new Set(typ.felder.map((f) => f.key));
  const verwaist = Object.entries(mappe.werte).filter(([k, v]) => !bekannt.has(k) && !istLeer(v));
  const [notizenOffen, setNotizenOffen] = useState(false);
  const [aufgabeOffen, setAufgabeOffen] = useState(false);
  const [emailOffen, setEmailOffen] = useState(false);
  const [drucken, setDrucken] = useState(false);
  const druckEnde = useCallback(() => setDrucken(false), []);
  const notizen = details.notizen ?? [];
  // Sprechender Link (#98) über ein eindeutiges Feld oder die Titelfelder.
  const direktlink = linkZuMappe(typ, mappe);
  const [kopiert, setKopiert] = useState<{ link: string; ok: boolean } | null>(null);
  return (
    <>
      <div className="mappenkopf">
        <p className="ueber">{typ.name}</p>
        <div className="titelzeile"><h1>{titelOder(mappe.titel)}</h1><Stern mappeId={mappe.id} an={!!details.favorit} /></div>
        <dl className="index">
          <div><dt>Angelegt</dt><dd>{zeit(mappe.erstellt)} von <Person id={mappe.erstelltVon} /></dd></div>
          <div><dt>Zuletzt geändert</dt><dd>{zeit(mappe.geaendert)} von <Person id={mappe.geaendertVon} /></dd></div>
        </dl>
        {typ.system === 'benutzer' && ich.rolle === 'admin' && <p className="leise klein"><Link to={`/werkbank/benutzer/${mappe.id}`} className="verweis">In der Benutzerverwaltung öffnen →</Link></p>}
        {mappe.systemKennung && <p className="leise klein"><span className="chip">Systemrolle</span> Wer sie hat, ergibt sich aus der Rolle in der Benutzerverwaltung.</p>}
        <div className="mappenleiste">
          <button type="button" className={`knopf klein ${notizenOffen ? 'an' : ''}`} aria-expanded={notizenOffen} onClick={() => setNotizenOffen(!notizenOffen)} title="Notizen zu dieser Mappe">
            <span aria-hidden="true">🗒</span> Notizen{notizen.length ? ` (${notizen.length})` : ''}
          </button>
          <Aktionsmenue aufgabe={() => setAufgabeOffen(true)} email={() => setEmailOffen(true)} drucken={() => setDrucken(true)}
            link={direktlink ? () => { const l = location.origin + direktlink; void kopiere(l).then((ok) => setKopiert({ link: l, ok })); } : undefined} />
        </div>
        {kopiert && <LinkKopiert {...kopiert} schliessen={() => setKopiert(null)} />}
      </div>
      <AufgabenHinweis aufgaben={details.aufgaben ?? []} neuLaden={neuLaden} />
      {aufgabeOffen && <NeueAufgabe mappeId={mappe.id} neuLaden={neuLaden} schliessen={() => setAufgabeOffen(false)} />}
      {emailOffen && <EmailMaske key={mappe.id} typ={typ} details={details} neuLaden={neuLaden} schliessen={() => setEmailOffen(false)} />}
      {drucken && <Druckansicht typ={typ} details={details} fertig={druckEnde} />}
      {notizenOffen && <Notizen mappeId={mappe.id} notizen={notizen} neuLaden={neuLaden} schliessen={() => setNotizenOffen(false)} />}
      {mappe.passt === false && (
        <div className="hinweis warn"><p>Diese Mappe passt nicht mehr zur aktuellen Definition von „{typ.name}“{mappe.problem ? ` (${mappe.problem})` : ''}. Beim nächsten Speichern müssen die markierten Felder stimmen.</p></div>
      )}
      <Formular typ={typ} mappe={mappe} start={rohAusWerten(typ, mappe.werte)} sicht={sicht} anhang={anhang} details={details} neuLaden={neuLaden} />
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

function Formular({ typ, mappe, start, sicht, anhang = '', details, neuLaden }: {
  typ: Mappentyp; mappe?: Mappe; start: RohWerte; sicht: string; anhang?: string; details?: MappeDetails | null; neuLaden?: () => Promise<void>;
}) {
  const d = useDaten();
  const register = registerVon(typ);
  // Nur lesbar: Systemfelder von Benutzern, Name einer Systemrolle (#26, #27).
  const geschuetzt = geschuetzteFelder(typ, mappe);
  const [aktiv, setAktiv] = useState(register[0]?.key);
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
  const dokumenteGeaendert = neueDateien.length > 0 || entfernt.length > 0;
  const geaendert = werteGeaendert || dokumenteGeaendert || !mappe;
  useUngespeichert(werteGeaendert || dokumenteGeaendert);

  const dokumenteIn = (key: string) => (details?.dokumente ?? []).filter((x) => x.registerKey === key);
  const anzahl = (r: Register): number | undefined => {
    if (r.art === 'dokumente') return dokumenteIn(r.key).filter((x) => !entfernt.includes(x.id)).length + neueDateien.filter((n) => n.register === r.key).length;
    if (r.art === 'verknuepfungen') return verknuepfungsGruppen(d, mappe, typ.id, r, details).reduce((a, g) => a + g.treffer.length, 0);
    return undefined;
  };
  const verwerfen = () => { setRoh(JSON.parse(basis)); setNeueDateien([]); setEntfernt([]); setFehler(null); setMeldung(undefined); setHinweise([]); };

  const reg = register.find((r) => r.key === aktiv) ?? register[0];
  const felderAuf = (r: Register) => typ.felder.filter((f) => r.felder?.includes(f.key));
  const fehlerAuf = (r: Register) => (r.art === 'felder' ? felderAuf(r).filter((f) => fehler?.felder[f.key]).length : 0);

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
    setSendet(true); setHinweise([]);
    let gespeichert: Mappe | undefined = mappe;
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
        const r = await api.ladeHoch(gespeichert!.id, n.register, n.datei);
        const anderswo = r.gleicherInhalt.filter((g) => g.mappeId !== gespeichert!.id);
        if (anderswo.length) neu.push({ art: 'warn', text: <>„{n.datei.name}“ hat denselben Inhalt wie {anderswo.map((g, j) => { return <span key={j}>{j > 0 && ', '}„{g.name}“ in {g.typId ? <Link to={`/ablage/${g.typId}/${g.mappeId}`} className="verweis">{titelOder(g.titel)}</Link> : 'einer anderen Mappe'}</span>; })}. Gespeichert ist die Datei nur einmal.</> });
      } catch (e) {
        offen.push(n);
        neu.push({ art: 'schlecht', text: `„${n.datei.name}“ wurde nicht hochgeladen: ${(e as Error).message}` });
      }
    }
    const nichtEntfernt: string[] = [];
    for (const id of entfernt) {
      try { await api.dokumentLoeschen(id); } catch (e) { nichtEntfernt.push(id); neu.push({ art: 'schlecht', text: (e as Error).message }); }
    }
    setNeueDateien(offen); setEntfernt(nichtEntfernt); setHinweise(neu);
    if (!offen.length && !nichtEntfernt.length) loeseWache();
    await d.neuLaden();
    await neuLaden?.();
    setSendet(false);
    if (!mappe) geheZu(`/ablage/${sicht}/${gespeichert!.id}`);
    else setMeldung(offen.length || nichtEntfernt.length ? 'Teilweise gespeichert.' : 'Gespeichert.');
  }

  async function loeschen() {
    if (!mappe) return;
    const n = details?.dokumente.length ?? 0;
    const korb = d.zaehler.papierkorbTage ?? 0;
    const frage = korb
      ? `Mappe „${titelOder(mappe.titel)}“ in den Papierkorb legen?${n ? ` Ihre ${n} Dokument${n === 1 ? '' : 'e'} kommen mit.` : ''} Dort lässt sie sich ${korb === 1 ? 'einen Tag' : `${korb} Tage`} lang wiederherstellen.`
      : `Mappe „${titelOder(mappe.titel)}“ endgültig löschen?${n ? ` Ihre ${n} Dokument${n === 1 ? '' : 'e'} werden mitgelöscht.` : ''}`;
    if (!confirm(frage)) return;
    try {
      await api.mappeLoeschen(mappe.id);
      loeseWache(); await d.neuLaden(); geheZu(`/ablage/${sicht}${anhang}`);
    } catch (e) { setMeldung((e as Error).message); }
  }

  let inhalt: ReactNode = null;
  if (!reg) inhalt = <p className="leise">Dieser Mappentyp hat keine Register.</p>;
  else if (reg.art === 'felder') {
    const felder = felderAuf(reg);
    inhalt = felder.length
      ? <div className="formular">{felder.map((f) => <FeldEingabe key={f.key} feld={f} roh={roh[f.key]} fehler={fehler?.felder[f.key]?.[0]} setze={(v) => setze(f.key, v)} eigeneId={mappe?.id} bekannt={bekannt} merke={merke} gesperrt={geschuetzt[f.key]} />)}</div>
      : <p className="leise">Auf diesem Register liegen keine Felder.</p>;
  } else if (reg.art === 'dokumente') {
    inhalt = mappe && !details ? <p className="leise">Lade …</p> : (
      <Dokumente key={reg.key} register={reg} dokumente={dokumenteIn(reg.key)} neue={neueDateien.filter((n) => n.register === reg.key)} entfernt={entfernt}
        hinzufuegen={(dateien) => setNeueDateien((x) => [...x, ...dateien.map((datei) => ({ uid: `n${++zaehler}`, datei, register: reg.key }))])}
        entferne={(id) => setEntfernt((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))}
        entferneMehrere={(ids) => setEntfernt((x) => [...x, ...ids.filter((id) => !x.includes(id))])}
        vergiss={(uid) => setNeueDateien((x) => x.filter((n) => n.uid !== uid))} />
    );
  } else if (reg.art === 'protokoll') {
    inhalt = mappe ? <Historie mappeId={mappe.id} stand={mappe.geaendert} /> : <p className="leise">Das Protokoll beginnt mit dem ersten Speichern.</p>;
  } else if (!mappe) {
    inhalt = <p className="leise">Verknüpfungen entstehen, sobald andere Mappen auf diese verweisen – also nach dem ersten Speichern.</p>;
  } else if (!details) {
    inhalt = <p className="leise">Lade …</p>;
  } else {
    inhalt = <Verknuepfungen mappe={mappe} gruppen={verknuepfungsGruppen(d, mappe, typ.id, reg, details)} />;
  }

  return (
    <form className="blatt mitregistern" onSubmit={(e) => { e.preventDefault(); void speichern(); }} noValidate>
      <div className="registertaben" role="tablist" aria-label="Register">
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
      </div>
      {fehler?.allgemein.length ? <div className="hinweis schlecht"><p>{fehler.allgemein.join(' ')}</p></div> : null}
      {hinweise.map((h, i) => <div key={i} className={`hinweis ${h.art}`}><p>{h.text}</p></div>)}
      <div className="registerinhalt" role="tabpanel">{inhalt}</div>
      {mappe && darfLoeschen(typ, mappe) && details?.loeschbar && !details.loeschbar.ok && <LoeschHindernis l={details.loeschbar} />}
      <div className="speicherleiste">
        {mappe && darfLoeschen(typ, mappe)
          ? <button type="button" className="textknopf gefahr" disabled={details?.loeschbar?.ok === false} title={details?.loeschbar?.ok === false ? details.loeschbar.grund : undefined}
              aria-describedby={details?.loeschbar?.ok === false ? 'loeschhindernis' : undefined} onClick={() => void loeschen()}>Mappe löschen</button>
          : <span />}
        <span className={`status ${meldung && fehler ? 'schlecht' : ''}`} role="status">{sendet ? 'Speichere …' : meldung ?? (mappe && (werteGeaendert || dokumenteGeaendert) ? 'Ungespeicherte Änderungen' : '')}</span>
        <div className="knoepfe">
          {mappe
            ? <button type="button" className="knopf" disabled={!(werteGeaendert || dokumenteGeaendert) || sendet} onClick={verwerfen}>Änderungen verwerfen</button>
            : <Link to={`/ablage/${sicht}`} className="knopf">Abbrechen</Link>}
          <button type="submit" className="knopf gruen" disabled={sendet}>{sendet ? 'Speichere …' : 'Mappe speichern'}</button>
        </div>
      </div>
    </form>
  );
}

function FeldEingabe({ feld: f, roh, fehler, setze, eigeneId, bekannt, merke, gesperrt }: {
  feld: Feld; roh: Roh | undefined; fehler?: string; setze: (v: Roh) => void; eigeneId?: string;
  bekannt: Bezuege; merke: (id: string, b: { titel: string; typId: string }) => void;
  /** Grund, warum das Feld hier nur angezeigt wird. */
  gesperrt?: string;
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
        ? <ul>{ids.map((x) => <li key={x}>{bekannt[x]?.typId ? <Link to={`/ablage/${bekannt[x].typId}/${x}`} className="verweis">{titelOder(bekannt[x].titel)}</Link> : titelOder(bekannt[x]?.titel)}</li>)}</ul>
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
        bekannt={bekannt} merke={merke} setze={setze} />;
      break;
    }
    case 'formatiert':
      breit = true;
      mitLabelFor = false;
      ctl = <FormatiertEingabe id={id} wert={String(roh ?? '')} setze={setze} />;
      break;
    case 'passwort':
      ctl = <PasswortEingabe id={id} feld={f} roh={(roh ?? leeresPasswort) as RohPasswort} setze={setze} mappeId={eigeneId} />;
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
function PasswortEingabe({ id, feld: f, roh: p, setze, mappeId }: { id: string; feld: Feld; roh: RohPasswort; setze: (v: Roh) => void; mappeId?: string }) {
  const { passwoerterMoeglich } = useKonto();
  const [klartext, setKlartext] = useState<string | null>(null);
  const [zeigen, setZeigen] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [aendern, setAendern] = useState(false);
  // Nach dem Speichern (neuer Stand vom Server) die Anzeige zurücksetzen.
  useEffect(() => { if (!p.neu) { setKlartext(null); setAendern(false); setZeigen(false); } }, [p.gesetzt, p.lesbar]); // eslint-disable-line react-hooks/exhaustive-deps
  const auge = (an: boolean) => <span aria-hidden="true">{an ? '🙈' : '👁'}</span>;

  if (p.entfernen) return (
    <div className="passwort">
      <span className="festwert leise">wird beim Speichern entfernt</span>
      <button type="button" className="knopf klein" onClick={() => setze({ ...p, entfernen: false })}>Rückgängig</button>
    </div>
  );

  if (p.gesetzt && !aendern && !p.neu) {
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
          {p.lesbar && mappeId && <button type="button" className="knopf klein" disabled={laedt} onClick={() => void umschalten()} title={klartext === null ? 'Passwort anzeigen (wird protokolliert)' : 'Passwort verbergen'} aria-label={klartext === null ? 'Passwort anzeigen' : 'Passwort verbergen'}>{auge(klartext !== null)}</button>}
          <button type="button" className="knopf klein" disabled={!passwoerterMoeglich} onClick={() => { setKlartext(null); setAendern(true); }}>Ändern</button>
          <button type="button" className="knopf klein" onClick={() => { setKlartext(null); setze({ ...p, entfernen: true }); }} title="Wird erst mit „Mappe speichern“ wirksam">Passwort entfernen</button>
        </div>
        {fehler && <p className="fehlertext">{fehler}</p>}
        {!passwoerterMoeglich && <span className="hilfe">Ändern geht erst wieder, wenn ein Administrator den Schlüssel bereitstellt (Werkbank → Verschlüsselung).</span>}
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

/** Warum „Mappe löschen“ gerade nicht geht, mit Links zu den verweisenden Mappen (#79). */
function LoeschHindernis({ l }: { l: NonNullable<MappeDetails['loeschbar']> }) {
  const d = useDaten();
  const quellen = [...new Map((l.rueckverweise ?? []).map((r) => [r.quelleId, r])).values()];
  const zeige = quellen.slice(0, 8);
  return (
    <div className="loeschhindernis leise klein" id="loeschhindernis">
      <strong>Löschen nicht möglich:</strong> {l.grund}
      {zeige.length > 0 && <ul>{zeige.map((r) => (
        <li key={r.quelleId}><Link to={`/ablage/${r.quelleTypId}/${r.quelleId}`} className="verweis">{titelOder(r.titel)}</Link> <span className="leise">({d.typ(r.quelleTypId)?.name ?? 'Mappe'})</span></li>
      ))}{quellen.length > zeige.length && <li className="leise">und {quellen.length - zeige.length} weitere</li>}</ul>}
    </div>
  );
}

function Verknuepfungen({ mappe, gruppen }: { mappe: Mappe; gruppen: ReturnType<typeof verknuepfungsGruppen> }) {
  const d = useDaten();
  if (!gruppen.length) return <p className="leise">Kein Mappentyp verweist auf „{d.typ(mappe.typId)?.name}“. Lege dafür in der Werkbank ein Referenzfeld an.</p>;
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

function MappenWahl({ id, ziel, mehrfach, wert, eigeneId, bekannt, merke, setze }: {
  id: string; ziel: Mappentyp; mehrfach: boolean; wert: string | string[] | undefined; eigeneId?: string;
  bekannt: Bezuege; merke: (id: string, b: { titel: string; typId: string }) => void; setze: (v: Roh) => void;
}) {
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
      api.seite(`typ:${ziel.id}`, 0, 20, eingabe.trim()).then((s) => { if (aktuell) { setTreffer(s.mappen); setGesamt(s.gesamt); } }).catch(() => aktuell && setTreffer([]));
    }, 200);
    return () => { aktuell = false; clearTimeout(t); };
  }, [offen, eingabe, ziel.id]);

  function waehle(m: Mappe) {
    merke(m.id, { titel: m.titel ?? '', typId: m.typId });
    setze(mehrfach ? [...gewaehlt, m.id] : m.id);
    setEingabe(''); setOffen(false); setAendern(false);
  }
  const auswahl = (treffer ?? []).filter((m) => m.id !== eigeneId && !gewaehlt.includes(m.id));
  const anlegen = darfErstellen(ziel) ? <Link to={`/ablage/${ziel.id}/neu`} className="verweis klein">+ {ziel.name} anlegen</Link> : null;

  return (
    <div className="refbox">
      {gewaehlt.length > 0 && (
        <ul className="gewaehlt">
          {gewaehlt.map((x) => (
            <li key={x}>
              {bekannt[x]?.typId ? <Link to={`/ablage/${bekannt[x].typId}/${x}`} className="verweis">{titelOder(bekannt[x].titel)}</Link> : <span className="leise">{bekannt[x]?.titel ?? 'Lade …'}</span>}
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
