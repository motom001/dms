import { useEffect, useState, type ReactNode } from 'react';
import { istLeer, istOk, VERWEISARTEN, type Feld, type Mappe, type Mappentyp, type Pruefergebnis } from '../../../shared/src/model';
import { api, ApiFehler, type Rueckverweis } from '../api';
import { useDaten } from '../daten';
import { geheZu, Link, loeseWache, useUngespeichert } from '../ort';
import { rohAusWerten, standardRoh, werteAusRoh, type Roh, type RohBetrag, type RohWerte } from '../werte';

const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

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
      <Formular typ={typ} mappe={mappe} start={rohAusWerten(typ, mappe.werte)} sicht={sicht} />
      {verwaist.length > 0 && (
        <section className="blatt">
          <h2 className="h3">Werte ohne Felddefinition</h2>
          <p className="leise">Diese Werte stammen aus Feldern, die es im Mappentyp nicht mehr gibt. Sie bleiben erhalten.</p>
          <ul className="verwaist">{verwaist.map(([k, v]) => <li key={k}><code>{k}</code>: {typeof v === 'object' ? JSON.stringify(v) : String(v)}</li>)}</ul>
        </section>
      )}
      <Rueckverweise mappe={mappe} />
    </>
  );
}

function Formular({ typ, mappe, start, sicht }: { typ: Mappentyp; mappe?: Mappe; start: RohWerte; sicht: string }) {
  const d = useDaten();
  const [basis, setBasis] = useState(() => JSON.stringify(start));
  const [roh, setRoh] = useState<RohWerte>(start);
  const [fehler, setFehler] = useState<Pruefergebnis | null>(null);
  const [meldung, setMeldung] = useState<string>();
  const [sendet, setSendet] = useState(false);
  const geaendert = JSON.stringify(roh) !== basis || !mappe;
  useUngespeichert(JSON.stringify(roh) !== basis);

  const setze = (k: string, v: Roh) => {
    setRoh((r) => ({ ...r, [k]: v }));
    if (fehler?.felder[k]) setFehler((f) => f && { ...f, felder: Object.fromEntries(Object.entries(f.felder).filter(([x]) => x !== k)) });
  };

  async function speichern() {
    setMeldung(undefined);
    const werte = werteAusRoh(typ, roh);
    const p = d.pruefe(typ, werte, mappe?.id);
    if (!istOk(p)) { setFehler(p); setMeldung('Bitte die markierten Felder prüfen.'); return; }
    setSendet(true);
    try {
      const m = mappe ? await api.mappeAendern(mappe.id, { werte }) : await api.mappeAnlegen({ typId: typ.id, werte });
      setFehler(null); setBasis(JSON.stringify(roh)); loeseWache();
      await d.neuLaden();
      if (!mappe) geheZu(`/ablage/${sicht}/${m.id}`);
      else setMeldung('Gespeichert.');
    } catch (e) {
      const f = e as ApiFehler;
      if (f.pruefung) setFehler(f.pruefung);
      setMeldung(f.message);
    } finally { setSendet(false); }
  }

  async function loeschen() {
    if (!mappe || !confirm(`Mappe „${d.titel(mappe)}“ löschen?`)) return;
    try {
      await api.mappeLoeschen(mappe.id);
      loeseWache(); await d.neuLaden(); geheZu(`/ablage/${sicht}`);
    } catch (e) { setMeldung((e as Error).message); }
  }

  return (
    <form className="blatt" onSubmit={(e) => { e.preventDefault(); void speichern(); }} noValidate>
      {fehler?.allgemein.length ? <div className="hinweis schlecht"><p>{fehler.allgemein.join(' ')}</p></div> : null}
      {typ.felder.length ? (
        <div className="formular">
          {typ.felder.map((f) => <FeldEingabe key={f.key} feld={f} roh={roh[f.key]} fehler={fehler?.felder[f.key]?.[0]} setze={(v) => setze(f.key, v)} eigeneId={mappe?.id} />)}
        </div>
      ) : <p className="leise">Dieser Mappentyp hat noch keine Felder.</p>}
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

function Rueckverweise({ mappe }: { mappe: Mappe }) {
  const d = useDaten();
  const [rv, setRv] = useState<Rueckverweis[] | null>(null);
  useEffect(() => {
    let aktiv = true;
    api.mappe(mappe.id).then((r) => aktiv && setRv(r.rueckverweise)).catch(() => aktiv && setRv([]));
    return () => { aktiv = false; };
  }, [mappe.id, d.stand]);

  // Jede Kombination aus Typ und Referenzfeld, die auf diesen Typ zeigen kann.
  const gruppen = d.typen.flatMap((t) => t.felder
    .filter((f) => f.typ === 'referenz' && f.zielTyp === mappe.typId)
    .map((f) => ({ t, f, treffer: (rv ?? []).filter((r) => r.quelleTypId === t.id && r.feldKey === f.key).map((r) => d.mappe(r.quelleId)).filter((m): m is Mappe => !!m) })));

  if (!gruppen.length) return null;
  return (
    <section className="blatt">
      <h2 className="h3">Verweise auf diese Mappe</h2>
      <div className="gruppen">
        {gruppen.map(({ t, f, treffer }) => (
          <section key={`${t.id}-${f.key}`} className="gruppe">
            <header>
              <span><strong>{t.name}</strong> <span className="leise">über „{f.label}“</span></span>
              <Link to={`/ablage/${t.id}/neu?verweis=${encodeURIComponent(`${f.key}:${mappe.id}`)}`} className="knopf klein">+ {t.name} anlegen</Link>
            </header>
            {rv === null ? <p className="leise">Lade …</p> : treffer.length
              ? <ul>{treffer.map((m) => <li key={m.id}><Link to={`/ablage/${m.typId}/${m.id}`} className="verweis">{d.titel(m)}</Link></li>)}</ul>
              : <p className="leise">Noch keine.</p>}
          </section>
        ))}
      </div>
    </section>
  );
}
