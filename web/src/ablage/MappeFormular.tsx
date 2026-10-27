import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { istLeer, istOk, standardRegister, VERWEISARTEN, type Dokument, type Feld, type Mappe, type Mappentyp, type Pruefergebnis, type Register } from '../../../shared/src/model';
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

function Formular({ typ, mappe, start, sicht, details, neuLaden }: {
  typ: Mappentyp; mappe?: Mappe; start: RohWerte; sicht: string; details?: MappeDetails | null; neuLaden?: () => Promise<void>;
}) {
  const d = useDaten();
  const register = registerVon(typ);
  const [aktiv, setAktiv] = useState(register[0]?.key);
  const [basis, setBasis] = useState(() => JSON.stringify(start));
  const [roh, setRoh] = useState<RohWerte>(start);
  const [fehler, setFehler] = useState<Pruefergebnis | null>(null);
  const [meldung, setMeldung] = useState<string>();
  const [sendet, setSendet] = useState(false);
  const geaendert = JSON.stringify(roh) !== basis || !mappe;
  useUngespeichert(JSON.stringify(roh) !== basis);

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
    setSendet(true);
    try {
      const m = mappe ? await api.mappeAendern(mappe.id, { werte }) : await api.mappeAnlegen({ typId: typ.id, werte });
      setFehler(null); setBasis(JSON.stringify(roh)); loeseWache();
      await d.neuLaden();
      if (!mappe) geheZu(`/ablage/${sicht}/${m.id}`);
      else setMeldung('Gespeichert.');
    } catch (e) {
      const f = e as ApiFehler;
      if (f.pruefung) zeigeFehler(f.pruefung);
      setMeldung(f.message);
    } finally { setSendet(false); }
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
  } else if (!mappe) {
    inhalt = <p className="leise">Erst die Mappe speichern, dann gibt es hier {reg.art === 'dokumente' ? 'Dokumente' : 'Verknüpfungen'}.</p>;
  } else if (!details) {
    inhalt = <p className="leise">Lade …</p>;
  } else if (reg.art === 'dokumente') {
    inhalt = <Dokumente mappe={mappe} register={reg} dokumente={details.dokumente.filter((x) => x.registerKey === reg.key)} neuLaden={neuLaden!} />;
  } else {
    inhalt = <Verknuepfungen mappe={mappe} register={reg} details={details} />;
  }

  return (
    <form className="blatt mitregistern" onSubmit={(e) => { e.preventDefault(); void speichern(); }} noValidate>
      <div className="registertaben" role="tablist" aria-label="Register">
        {register.map((r) => {
          const n = fehlerAuf(r);
          const zahl = r.art === 'dokumente' ? details?.dokumente.filter((x) => x.registerKey === r.key).length : undefined;
          return (
            <button key={r.key} type="button" role="tab" aria-selected={r.key === reg?.key} className={`registertab art-${r.art} ${r.key === reg?.key ? 'an' : ''}`}
              disabled={!mappe && r.art !== 'felder'} onClick={() => setAktiv(r.key)}>
              {r.name}
              {n > 0 && <span className="fehlerpunkt" title={`${n} Feld${n === 1 ? '' : 'er'} mit Fehler`}>{n}</span>}
              {!!zahl && <span className="anzahl">{zahl}</span>}
            </button>
          );
        })}
      </div>
      {fehler?.allgemein.length ? <div className="hinweis schlecht"><p>{fehler.allgemein.join(' ')}</p></div> : null}
      <div className="registerinhalt" role="tabpanel">{inhalt}</div>
      <div className="speicherleiste">
        {mappe ? <button type="button" className="textknopf gefahr" onClick={() => void loeschen()}>Mappe löschen</button> : <span />}
        <span className={`status ${meldung && fehler ? 'schlecht' : ''}`} role="status">{meldung ?? (geaendert && mappe ? 'Ungespeicherte Änderungen' : '')}</span>
        <div className="knoepfe">
          {mappe
            ? <button type="button" className="knopf" disabled={!geaendert || sendet} onClick={() => { setRoh(JSON.parse(basis)); setFehler(null); setMeldung(undefined); }}>Verwerfen</button>
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

function Dokumente({ mappe, register, dokumente, neuLaden }: { mappe: Mappe; register: Register; dokumente: Dokument[]; neuLaden: () => Promise<void> }) {
  const d = useDaten();
  const auswahl = useRef<HTMLInputElement>(null);
  const [laeuft, setLaeuft] = useState<string>();
  const [meldungen, setMeldungen] = useState<Array<{ art: 'gut' | 'warn' | 'schlecht'; text: ReactNode }>>([]);
  const [ziehen, setZiehen] = useState(false);
  const [ansicht, setAnsicht] = useState<string>();
  const gewaehlt = dokumente.find((x) => x.id === ansicht);

  async function hochladen(dateien: FileList | File[]) {
    const liste = [...dateien];
    if (!liste.length) return;
    const neu: typeof meldungen = [];
    for (const [i, f] of liste.entries()) {
      setLaeuft(liste.length > 1 ? `Lade hoch (${i + 1}/${liste.length}): ${f.name}` : `Lade hoch: ${f.name}`);
      try {
        const r = await api.ladeHoch(mappe.id, register.key, f);
        if (r.gleicherInhalt.length) {
          const anderswo = r.gleicherInhalt.filter((g) => g.mappeId !== mappe.id);
          neu.push({ art: 'warn', text: <>„{f.name}“ hat denselben Inhalt wie {anderswo.length
            ? anderswo.map((g, j) => { const m = d.mappe(g.mappeId); return <span key={j}>{j > 0 && ', '}„{g.name}“ in {m ? <Link to={`/ablage/${m.typId}/${m.id}`} className="verweis">{d.titel(m)}</Link> : 'einer anderen Mappe'}</span>; })
            : `„${r.gleicherInhalt[0].name}“ in dieser Mappe`}. Gespeichert ist die Datei trotzdem nur einmal.</> });
        }
        if (r.dokument.anzeigbar) setAnsicht(r.dokument.id);
      } catch (e) {
        neu.push({ art: 'schlecht', text: `„${f.name}“: ${(e as Error).message}` });
      }
    }
    setLaeuft(undefined);
    setMeldungen(neu);
    await neuLaden();
  }

  async function loeschen(x: Dokument) {
    if (!confirm(`Dokument „${x.name}“ löschen?`)) return;
    try { await api.dokumentLoeschen(x.id); if (ansicht === x.id) setAnsicht(undefined); await neuLaden(); }
    catch (e) { setMeldungen([{ art: 'schlecht', text: (e as Error).message }]); }
  }

  const fallen = (e: DragEvent) => { e.preventDefault(); setZiehen(false); void hochladen(e.dataTransfer.files); };

  return (
    <div className="dokumente">
      <div className={`ablagezone ${ziehen ? 'zieht' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setZiehen(true); }} onDragLeave={() => setZiehen(false)} onDrop={fallen}>
        <p>{laeuft ?? <>Dateien hierher ziehen oder <button type="button" className="textknopf" onClick={() => auswahl.current?.click()}>auswählen</button></>}</p>
        <p className="leise klein">Bis 100 MB je Datei. PDFs und Bilder lassen sich direkt ansehen.</p>
        <input ref={auswahl} type="file" multiple hidden onChange={(e) => { if (e.target.files) void hochladen(e.target.files); e.target.value = ''; }} />
      </div>
      {meldungen.map((m, i) => <div key={i} className={`hinweis ${m.art}`}><p>{m.text}</p></div>)}
      {dokumente.length === 0
        ? <p className="leise">Noch keine Dokumente in „{register.name}“.</p>
        : <ul className="dokumentliste">
            {dokumente.map((x) => (
              <li key={x.id} className={x.id === ansicht ? 'an' : ''}>
                <div className="dokname">
                  {x.anzeigbar
                    ? <button type="button" className="textknopf" onClick={() => setAnsicht(x.id === ansicht ? undefined : x.id)}>{x.name}</button>
                    : <a className="verweis" href={dokumentUrl(x.id, true)}>{x.name}</a>}
                  <span className="leise klein">{groesse(x.groesse)} · {zeit(x.erstellt)} · {d.person(x.erstelltVon)}</span>
                </div>
                <div className="zeilenaktionen">
                  {x.anzeigbar && <a className="textknopf" href={dokumentUrl(x.id)} target="_blank" rel="noreferrer">Öffnen</a>}
                  <a className="textknopf" href={dokumentUrl(x.id, true)}>Herunterladen</a>
                  <button type="button" className="textknopf gefahr" onClick={() => void loeschen(x)}>Löschen</button>
                </div>
              </li>
            ))}
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

function Verknuepfungen({ mappe, register, details }: { mappe: Mappe; register: Register; details: MappeDetails }) {
  const d = useDaten();
  const gewaehlt = register.quellen ?? [];
  // Jede Kombination aus Typ und Referenzfeld, die auf diesen Typ zeigt – eingeschränkt auf die gewählten Quellen.
  const gruppen = d.typen.flatMap((t) => t.felder
    .filter((f) => f.typ === 'referenz' && f.zielTyp === mappe.typId)
    .filter((f) => !gewaehlt.length || gewaehlt.some((q) => q.typId === t.id && q.feldKey === f.key))
    .map((f) => ({
      t, f,
      treffer: details.rueckverweise.filter((r) => r.quelleTypId === t.id && r.feldKey === f.key)
        .map((r) => d.mappe(r.quelleId)).filter((m): m is Mappe => !!m),
    })));

  if (!gruppen.length) return <p className="leise">Kein Mappentyp verweist auf „{d.typ(mappe.typId)?.name}“. Lege dafür in der Einrichtung ein Referenzfeld an.</p>;
  return (
    <div className="gruppen">
      {gruppen.map(({ t, f, treffer }) => (
        <section key={`${t.id}-${f.key}`} className="gruppe">
          <header>
            <span><strong>{t.name}</strong> <span className="leise">über „{f.label}“</span> <span className="chip">{VERWEISARTEN[f.verweisart ?? 'bezug']}</span></span>
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
