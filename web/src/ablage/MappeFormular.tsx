import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { istLeer, istOk, MAX_DATEIGROESSE, standardRegister, VERWEISARTEN, type Dokument, type Feld, type Mappe, type Mappentyp, type Pruefergebnis, type Register } from '../../../shared/src/model';
import { api, ApiFehler, dokumentUrl, type MappeDetails } from '../api';
import { useDaten } from '../daten';
import { geheZu, Link, loeseWache, useUngespeichert } from '../ort';
import { rohAusWerten, standardRoh, werteAusRoh, type Roh, type RohBetrag, type RohWerte } from '../werte';

const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const groesse = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

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

export function MappeAnsicht({ typ, mappe, sicht }: { typ: Mappentyp; mappe: Mappe; sicht: string }) {
  const d = useDaten();
  const [details, setDetails] = useState<MappeDetails | null>(null);
  const laden = useCallback(async () => {
    try { setDetails(await api.mappe(mappe.id)); } catch { setDetails({ mappe, rueckverweise: [], dokumente: [] }); }
  }, [mappe]);
  useEffect(() => { void laden(); }, [laden, d.stand]);

  const abweichung = d.pruefe(typ, mappe.werte, mappe.id);
  const bekannt = new Set(typ.felder.map((f) => f.key));
  const verwaist = Object.entries(mappe.werte).filter(([k, v]) => !bekannt.has(k) && !istLeer(v));
  return (
    <>
      <div className="mappenkopf">
        <p className="ueber">{typ.name}</p>
        <h1>{d.titel(mappe)}</h1>
        <dl className="index">
          <div><dt>Angelegt</dt><dd>{zeit(mappe.erstellt)} von {d.person(mappe.erstelltVon)}</dd></div>
          <div><dt>Zuletzt geändert</dt><dd>{zeit(mappe.geaendert)} von {d.person(mappe.geaendertVon)}</dd></div>
        </dl>
      </div>
      {!istOk(abweichung) && (
        <div className="hinweis warn"><p>Diese Mappe passt nicht mehr zur aktuellen Definition von „{typ.name}“. Beim nächsten Speichern müssen die markierten Felder stimmen.</p></div>
      )}
      <Formular typ={typ} mappe={mappe} start={rohAusWerten(typ, mappe.werte)} sicht={sicht} details={details} neuLaden={laden} />
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

/** Eine Datei, die erst beim Speichern der Mappe hochgeladen wird. */
export interface NeueDatei { uid: string; datei: File; register: string }
let zaehler = 0;

/** Mappen, die laut Register hierher verweisen (alle oder nur gewählte Quellen). */
function verknuepfungsGruppen(d: ReturnType<typeof useDaten>, mappe: Mappe | undefined, typId: string, register: Register, details?: MappeDetails | null) {
  const gewaehlt = register.quellen ?? [];
  return d.typen.flatMap((t) => t.felder
    .filter((f) => f.typ === 'referenz' && f.zielTyp === typId)
    .filter((f) => !gewaehlt.length || gewaehlt.some((q) => q.typId === t.id && q.feldKey === f.key))
    .map((f) => ({
      t, f,
      treffer: !mappe || !details ? [] : details.rueckverweise.filter((r) => r.quelleTypId === t.id && r.feldKey === f.key)
        .map((r) => d.mappe(r.quelleId)).filter((m): m is Mappe => !!m),
    })));
}

function Formular({ typ, mappe, start, sicht, details, neuLaden }: {
  typ: Mappentyp; mappe?: Mappe; start: RohWerte; sicht: string; details?: MappeDetails | null; neuLaden?: () => Promise<void>;
}) {
  const d = useDaten();
  const register = registerVon(typ);
  const [aktiv, setAktiv] = useState(register[0]?.key);
  const [basis, setBasis] = useState(() => JSON.stringify(start));
  const [roh, setRoh] = useState<RohWerte>(start);
  const [neueDateien, setNeueDateien] = useState<NeueDatei[]>([]);
  const [entfernt, setEntfernt] = useState<string[]>([]);
  const [fehler, setFehler] = useState<Pruefergebnis | null>(null);
  const [meldung, setMeldung] = useState<string>();
  const [hinweise, setHinweise] = useState<Array<{ art: 'warn' | 'schlecht'; text: ReactNode }>>([]);
  const [sendet, setSendet] = useState(false);
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
    const p = d.pruefe(typ, werte, mappe?.id);
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
        if (anderswo.length) neu.push({ art: 'warn', text: <>„{n.datei.name}“ hat denselben Inhalt wie {anderswo.map((g, j) => { const m = d.mappe(g.mappeId); return <span key={j}>{j > 0 && ', '}„{g.name}“ in {m ? <Link to={`/ablage/${m.typId}/${m.id}`} className="verweis">{d.titel(m)}</Link> : 'einer anderen Mappe'}</span>; })}. Gespeichert ist die Datei nur einmal.</> });
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
    if (!confirm(`Mappe „${d.titel(mappe)}“ löschen?${n ? ` Ihre ${n} Dokument${n === 1 ? '' : 'e'} werden mitgelöscht.` : ''}`)) return;
    try {
      await api.mappeLoeschen(mappe.id);
      loeseWache(); await d.neuLaden(); geheZu(`/ablage/${sicht}`);
    } catch (e) { setMeldung((e as Error).message); }
  }

  let inhalt: ReactNode = null;
  if (!reg) inhalt = <p className="leise">Dieser Mappentyp hat keine Register.</p>;
  else if (reg.art === 'felder') {
    const felder = felderAuf(reg);
    inhalt = felder.length
      ? <div className="formular">{felder.map((f) => <FeldEingabe key={f.key} feld={f} roh={roh[f.key]} fehler={fehler?.felder[f.key]?.[0]} setze={(v) => setze(f.key, v)} eigeneId={mappe?.id} />)}</div>
      : <p className="leise">Auf diesem Register liegen keine Felder.</p>;
  } else if (reg.art === 'dokumente') {
    inhalt = mappe && !details ? <p className="leise">Lade …</p> : (
      <Dokumente register={reg} dokumente={dokumenteIn(reg.key)} neue={neueDateien.filter((n) => n.register === reg.key)} entfernt={entfernt}
        hinzufuegen={(dateien) => setNeueDateien((x) => [...x, ...dateien.map((datei) => ({ uid: `n${++zaehler}`, datei, register: reg.key }))])}
        entferne={(id) => setEntfernt((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))}
        vergiss={(uid) => setNeueDateien((x) => x.filter((n) => n.uid !== uid))} />
    );
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
      <div className="speicherleiste">
        {mappe ? <button type="button" className="textknopf gefahr" onClick={() => void loeschen()}>Mappe löschen</button> : <span />}
        <span className={`status ${meldung && fehler ? 'schlecht' : ''}`} role="status">{sendet ? 'Speichere …' : meldung ?? (mappe && (werteGeaendert || dokumenteGeaendert) ? 'Ungespeicherte Änderungen' : '')}</span>
        <div className="knoepfe">
          {mappe
            ? <button type="button" className="knopf" disabled={!(werteGeaendert || dokumenteGeaendert) || sendet} onClick={verwerfen}>Verwerfen</button>
            : <Link to={`/ablage/${sicht}`} className="knopf">Abbrechen</Link>}
          <button type="submit" className="knopf gruen" disabled={sendet}>{sendet ? 'Speichere …' : 'Mappe speichern'}</button>
        </div>
      </div>
    </form>
  );
}

function FeldEingabe({ feld: f, roh, fehler, setze, eigeneId }: { feld: Feld; roh: Roh | undefined; fehler?: string; setze: (v: Roh) => void; eigeneId?: string }) {
  const d = useDaten();
  const id = `feld-${f.key}`;
  let ctl: ReactNode;
  let breit = false;
  let mitLabelFor = true;

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
      const kandidaten = d.mappenVon(ziel.id).filter((m) => m.id !== eigeneId);
      const anlegen = <Link to={`/ablage/${ziel.id}/neu`} className="verweis klein">+ {ziel.name} anlegen</Link>;
      if (!kandidaten.length) { mitLabelFor = false; ctl = <div className="refbox"><p className="leise">Noch keine Mappe in „{ziel.name}“.</p>{anlegen}</div>; break; }
      if (f.mehrfach) {
        mitLabelFor = false;
        const gewaehlt = (roh as string[]) ?? [];
        ctl = <div className="refbox"><div className="auswahlliste">{kandidaten.map((m) => (
          <label key={m.id} className="haken"><input type="checkbox" checked={gewaehlt.includes(m.id)} onChange={(e) => setze(e.target.checked ? [...gewaehlt, m.id] : gewaehlt.filter((x) => x !== m.id))} /><span>{d.titel(m)}</span></label>
        ))}</div>{anlegen}</div>;
      } else {
        const r = String(roh ?? '');
        const gewaehlt = d.mappe(r);
        ctl = <div className="refbox">
          <select id={id} value={r} onChange={(e) => setze(e.target.value)}>
            <option value="">– keine –</option>
            {kandidaten.map((m) => <option key={m.id} value={m.id}>{d.titel(m)}</option>)}
            {r && !gewaehlt && <option value={r}>(gelöschte Mappe)</option>}
          </select>
          <div className="zeile">{gewaehlt && <Link to={`/ablage/${gewaehlt.typId}/${gewaehlt.id}`} className="verweis klein">{d.titel(gewaehlt)} öffnen →</Link>}{anlegen}</div>
        </div>;
      }
      break;
    }
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


/* ---------- Dokumentenregister ---------- */

function Dokumente({ register, dokumente, neue, entfernt, hinzufuegen, entferne, vergiss }: {
  register: Register; dokumente: Dokument[]; neue: NeueDatei[]; entfernt: string[];
  hinzufuegen(d: File[]): void; entferne(id: string): void; vergiss(uid: string): void;
}) {
  const d = useDaten();
  const auswahl = useRef<HTMLInputElement>(null);
  const [ziehen, setZiehen] = useState(false);
  const [zuGross, setZuGross] = useState<string[]>([]);
  const [ansicht, setAnsicht] = useState<string>();
  const gewaehlt = dokumente.find((x) => x.id === ansicht && !entfernt.includes(x.id));

  function nimm(liste: FileList | File[]) {
    const alle = [...liste];
    const gross = alle.filter((f) => f.size > MAX_DATEIGROESSE);
    setZuGross(gross.map((f) => f.name));
    hinzufuegen(alle.filter((f) => f.size <= MAX_DATEIGROESSE && f.size > 0));
  }
  const fallen = (e: DragEvent) => { e.preventDefault(); setZiehen(false); nimm(e.dataTransfer.files); };

  return (
    <div className="dokumente">
      <div className={`ablagezone ${ziehen ? 'zieht' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setZiehen(true); }} onDragLeave={() => setZiehen(false)} onDrop={fallen}>
        <p>Dateien hierher ziehen oder <button type="button" className="textknopf" onClick={() => auswahl.current?.click()}>auswählen</button></p>
        <p className="leise klein">Bis 100 MB je Datei. Übernommen wird mit „Mappe speichern“.</p>
        <input ref={auswahl} type="file" multiple hidden onChange={(e) => { if (e.target.files) nimm(e.target.files); e.target.value = ''; }} />
      </div>
      {zuGross.length > 0 && <div className="hinweis schlecht"><p>Zu groß (über 100 MB): {zuGross.join(', ')}</p></div>}
      {dokumente.length + neue.length === 0
        ? <p className="leise">Noch keine Dokumente in „{register.name}“.</p>
        : <ul className="dokumentliste">
            {neue.map((n) => (
              <li key={n.uid} className="neu">
                <div className="dokname">
                  <span>{n.datei.name} <span className="chip gut">neu</span></span>
                  <span className="leise klein">{groesse(n.datei.size)} · wird beim Speichern hochgeladen</span>
                </div>
                <div className="zeilenaktionen"><button type="button" className="textknopf" onClick={() => vergiss(n.uid)}>Entfernen</button></div>
              </li>
            ))}
            {dokumente.map((x) => {
              const weg = entfernt.includes(x.id);
              return (
                <li key={x.id} className={`${x.id === ansicht && !weg ? 'an' : ''} ${weg ? 'weg' : ''}`}>
                  <div className="dokname">
                    {x.anzeigbar && !weg
                      ? <button type="button" className="textknopf" onClick={() => setAnsicht(x.id === ansicht ? undefined : x.id)}>{x.name}</button>
                      : <span className="dateiname">{x.name}</span>}
                    <span className="leise klein">{weg ? 'wird beim Speichern gelöscht' : `${groesse(x.groesse)} · ${zeit(x.erstellt)} · ${d.person(x.erstelltVon)}`}</span>
                  </div>
                  <div className="zeilenaktionen">
                    {!weg && x.anzeigbar && <a className="textknopf" href={dokumentUrl(x.id)} target="_blank" rel="noreferrer">Öffnen</a>}
                    {!weg && <a className="textknopf" href={dokumentUrl(x.id, true)}>Herunterladen</a>}
                    <button type="button" className={`textknopf ${weg ? '' : 'gefahr'}`} onClick={() => entferne(x.id)}>{weg ? 'Behalten' : 'Löschen'}</button>
                  </div>
                </li>
              );
            })}
          </ul>}
      {gewaehlt && (
        <div className="dokansicht">
          {gewaehlt.mime === 'application/pdf'
            ? <iframe src={dokumentUrl(gewaehlt.id)} title={gewaehlt.name} />
            : <img src={dokumentUrl(gewaehlt.id)} alt={gewaehlt.name} />}
        </div>
      )}
    </div>
  );
}

/* ---------- Verknüpfungsregister ---------- */

function Verknuepfungen({ mappe, gruppen }: { mappe: Mappe; gruppen: ReturnType<typeof verknuepfungsGruppen> }) {
  const d = useDaten();
  if (!gruppen.length) return <p className="leise">Kein Mappentyp verweist auf „{d.typ(mappe.typId)?.name}“. Lege dafür in der Werkbank ein Referenzfeld an.</p>;
  return (
    <div className="gruppen">
      {gruppen.map(({ t, f, treffer }) => (
        <section key={`${t.id}-${f.key}`} className="gruppe">
          <header>
            <span><strong>{t.name}</strong> <span className="leise">über „{f.label}“</span> <span className="chip">{VERWEISARTEN[f.verweisart ?? 'bezug']}</span> <span className="anzahl">{treffer.length}</span></span>
            <Link to={`/ablage/${t.id}/neu?verweis=${encodeURIComponent(`${f.key}:${mappe.id}`)}`} className="knopf klein">+ {t.name} anlegen</Link>
          </header>
          {treffer.length
            ? <ul>{treffer.map((m) => <li key={m.id}><Link to={`/ablage/${m.typId}/${m.id}`} className="verweis">{d.titel(m)}</Link></li>)}</ul>
            : <p className="leise">Noch keine.</p>}
        </section>
      ))}
    </div>
  );
}
