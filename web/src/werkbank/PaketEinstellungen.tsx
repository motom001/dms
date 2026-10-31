import { useEffect, useState } from 'react';
import { abschnittsfelder, EINTRAG_ID, listen, type EinstellungBlock, type EinstellungFeld, type FeldVerweis, type GeheimStand } from '../../../shared/src/paketeinstellungen';
import { api, ApiFehler, type PaketEinstellungenStand } from '../api';
import { rueckfrage } from '../rueckfrage';

/**
 * Werkbank → Pakete → Paket → Einstellungen (#197): Formular aus der Beschreibung im Manifest.
 * Höchstens zwei Ebenen (Abschnitte, Listen). Geheimnisse sieht man nach dem Speichern nie wieder.
 */

type Werte = Record<string, unknown>;
const zeit = (iso: string | null) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
let zaehler = 0;
const neueId = () => `n${Date.now().toString(36)}${(zaehler++).toString(36)}`;

/** Gespeicherte Werte → Formular: Geheimnisse als „behalten“, wenn gesetzt. */
function zumFormular(s: PaketEinstellungenStand): Werte {
  const g = (f: EinstellungFeld, v: unknown) => (f.typ === 'geheim' ? ((v as GeheimStand)?.gesetzt ? { behalten: true } : null) : v);
  const w: Werte = {};
  for (const f of abschnittsfelder(s.beschreibung)) w[f.schluessel] = g(f, s.werte[f.schluessel]);
  for (const l of listen(s.beschreibung)) {
    w[l.schluessel] = ((s.werte[l.schluessel] as Werte[]) ?? []).map((e) => Object.fromEntries([[EINTRAG_ID, e[EINTRAG_ID]], ...l.felder.map((f) => [f.schluessel, g(f, e[f.schluessel])])]));
  }
  return w;
}

export function PaketEinstellungen({ id, gespeichert }: { id: string; gespeichert?: () => void }) {
  const [stand, setStand] = useState<PaketEinstellungenStand | null>(null);
  const [werte, setWerte] = useState<Werte>({});
  const [fehler, setFehler] = useState<Record<string, string>>({});
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht' | 'info'; text: string }>();
  const [laeuft, setLaeuft] = useState(false);
  useEffect(() => {
    let aktuell = true;
    api.paketEinstellungen(id).then((s) => { if (aktuell) { setStand(s); setWerte(zumFormular(s)); } }, (e) => aktuell && setMeldung({ art: 'schlecht', text: (e as Error).message }));
    return () => { aktuell = false; };
  }, [id]);
  if (!stand) return meldung ? <div className="hinweis schlecht"><p>{meldung.text}</p></div> : <p className="leise">Lade …</p>;

  async function speichern() {
    setLaeuft(true); setMeldung(undefined); setFehler({});
    try {
      const s = await api.paketEinstellungenSpeichern(id, werte);
      setStand(s); setWerte(zumFormular(s));
      setMeldung({ art: 'gut', text: 'Gespeichert.' });
      gespeichert?.();
    } catch (e) {
      const ff = e instanceof ApiFehler ? (e.details as { felderFehler?: Record<string, string> } | undefined)?.felderFehler : undefined;
      if (ff) setFehler(ff);
      setMeldung({ art: 'schlecht', text: (e as Error).message });
    } finally { setLaeuft(false); }
  }
  async function aktion(a: { schluessel: string; name: string; bestaetigen?: boolean }) {
    if (a.bestaetigen && !(await rueckfrage({ titel: `„${a.name}“ jetzt ausführen?`, ja: 'Ausführen' }))) return;
    setLaeuft(true); setMeldung(undefined);
    try { const r = await api.paketAktion(id, a.schluessel); setMeldung({ art: r.ok ? 'gut' : 'schlecht', text: r.text }); }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
    finally { setLaeuft(false); }
  }
  const b = stand.beschreibung;
  return (
    <div className="stapel paketeinstellungen">
      {stand.fehlend.length > 0 && <div className="hinweis warn" role="status"><p><strong>Einstellungen nötig.</strong> Es fehlen: {stand.fehlend.join(', ')}. Erst danach läuft das Paket.</p></div>}
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p></div>}
      {b.bloecke.map((blk, i) => <Block key={i} blk={blk} werte={werte} setze={setWerte} fehler={fehler} auswahl={stand.auswahl} />)}
      <div className="knoepfe">
        <button type="button" className="knopf primaer" disabled={laeuft} onClick={() => void speichern()}>{laeuft ? 'Speichere …' : 'Speichern'}</button>
      </div>
      {b.aktionen.length > 0 && (
        <section className="blatt">
          <h2 className="h3">Aktionen</h2>
          {!stand.laeufer && <p className="leise klein">Pakete mit Code laufen in diesem DMS noch nicht. Aktionen melden das, statt etwas zu tun.</p>}
          <div className="knoepfe">
            {b.aktionen.map((a) => <button key={a.schluessel} type="button" className="knopf" disabled={laeuft} title={a.hilfe} onClick={() => void aktion(a)}>{a.name}</button>)}
          </div>
        </section>
      )}
      <section className="blatt" aria-label="Status">
        <h2 className="h3">Status</h2>
        <p className="leise klein">Schreibt nur das Paket selbst.</p>
        <dl className="eigenschaften"><dt>Letzter Lauf</dt><dd>{zeit(stand.status?.letzterLauf ?? null)}</dd></dl>
        {stand.status?.meldungen.length ? <ul className="klein">{stand.status.meldungen.map((m, i) => <li key={i}>{m}</li>)}</ul> : <p className="leise klein">Noch keine Meldungen.</p>}
      </section>
    </div>
  );
}

type Auswahl = PaketEinstellungenStand['auswahl'];

function Block({ blk, werte, setze, fehler, auswahl }: { blk: EinstellungBlock; werte: Werte; setze: (f: (w: Werte) => Werte) => void; fehler: Record<string, string>; auswahl: Auswahl }) {
  if (blk.art === 'abschnitt') return (
    <section className="blatt">
      {blk.titel && <h2 className="h3">{blk.titel}</h2>}
      {blk.hilfe && <p className="leise klein">{blk.hilfe}</p>}
      {blk.felder.map((f) => <Eingabe key={f.schluessel} f={f} wert={werte[f.schluessel]} fehler={fehler[f.schluessel]} auswahl={auswahl} id={`pe-${f.schluessel}`}
        setze={(v) => setze((w) => ({ ...w, [f.schluessel]: v }))} />)}
    </section>
  );
  const eintraege = (werte[blk.schluessel] as Werte[] | undefined) ?? [];
  const setzeListe = (n: Werte[]) => setze((w) => ({ ...w, [blk.schluessel]: n }));
  const schiebe = (i: number, d: number) => { const n = [...eintraege]; [n[i], n[i + d]] = [n[i + d], n[i]]; setzeListe(n); };
  return (
    <section className="blatt">
      <h2 className="h3">{blk.name}</h2>
      {blk.hilfe && <p className="leise klein">{blk.hilfe}</p>}
      {!eintraege.length && <p className="leise klein">Noch keine Einträge.</p>}
      <ol className="stapel paketliste">
        {eintraege.map((e, i) => (
          <li key={String(e[EINTRAG_ID])} className="paketeintrag">
            <div className="zeile-zwischen">
              <strong className="klein">{blk.eintrag} {i + 1}</strong>
              <span className="knoepfe">
                {blk.sortierbar && <><button type="button" className="textknopf klein" disabled={i === 0} aria-label={`${blk.eintrag} ${i + 1} nach oben`} onClick={() => schiebe(i, -1)}>↑</button>
                  <button type="button" className="textknopf klein" disabled={i === eintraege.length - 1} aria-label={`${blk.eintrag} ${i + 1} nach unten`} onClick={() => schiebe(i, 1)}>↓</button></>}
                <button type="button" className="textknopf klein gefahr" onClick={() => setzeListe(eintraege.filter((_, j) => j !== i))}>Löschen</button>
              </span>
            </div>
            {blk.felder.map((f) => <Eingabe key={f.schluessel} f={f} wert={e[f.schluessel]} fehler={fehler[`${blk.schluessel}.${i + 1}.${f.schluessel}`]} auswahl={auswahl}
              id={`pe-${blk.schluessel}-${i}-${f.schluessel}`} setze={(v) => setzeListe(eintraege.map((x, j) => (j === i ? { ...x, [f.schluessel]: v } : x)))} />)}
          </li>
        ))}
      </ol>
      <button type="button" className="knopf klein" onClick={() => setzeListe([...eintraege, Object.fromEntries([[EINTRAG_ID, neueId()], ...blk.felder.filter((f) => f.standard !== undefined).map((f) => [f.schluessel, f.standard])])])}>+ {blk.eintrag}</button>
    </section>
  );
}

/** Ein Feld mit den Bausteinen der Oberfläche; Verweise als Auswahllisten (gespeichert wird die Id). */
function Eingabe({ f, wert, setze, fehler, auswahl, id }: { f: EinstellungFeld; wert: unknown; setze: (v: unknown) => void; fehler?: string; auswahl: Auswahl; id: string }) {
  const [geheimNeu, setGeheimNeu] = useState(false);
  const [warGesetzt] = useState(!!wert && typeof wert === 'object');
  let ctl: React.ReactNode;
  const liste = (optionen: Array<{ id: string; name: string }>) => (
    <select id={id} value={String(wert ?? '')} onChange={(e) => setze(e.target.value || null)}>
      <option value="">– keine Auswahl –</option>
      {optionen.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
  switch (f.typ) {
    case 'text': ctl = <input id={id} type="text" value={String(wert ?? '')} onChange={(e) => setze(e.target.value)} />; break;
    case 'mehrzeilig': ctl = <textarea id={id} rows={4} value={String(wert ?? '')} onChange={(e) => setze(e.target.value)} />; break;
    case 'zahl': ctl = <input id={id} type="text" inputMode="decimal" value={wert == null ? '' : String(wert)} onChange={(e) => setze(e.target.value)} />; break;
    case 'datum': ctl = <input id={id} type="date" value={String(wert ?? '')} onChange={(e) => setze(e.target.value || null)} />; break;
    case 'janein': ctl = <label className="haken"><input id={id} type="checkbox" checked={wert === true} onChange={(e) => setze(e.target.checked)} /><span>{f.name}</span></label>; break;
    case 'auswahl': ctl = (
      <select id={id} value={String(wert ?? '')} onChange={(e) => setze(e.target.value || null)}>
        <option value="">– keine Auswahl –</option>{(f.optionen ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    ); break;
    case 'mehrfachauswahl': {
      const l = Array.isArray(wert) ? wert.map(String) : [];
      ctl = <div className="zeile">{(f.optionen ?? []).map((o) => <label key={o} className="haken klein"><input type="checkbox" checked={l.includes(o)} onChange={(e) => setze(e.target.checked ? [...l, o] : l.filter((x) => x !== o))} /><span>{o}</span></label>)}</div>;
      break;
    }
    case 'geheim': {
      const gesetzt = !!wert && typeof wert === 'object';
      ctl = gesetzt && !geheimNeu
        ? <div className="zeile"><span className="chip gut">gesetzt</span><button type="button" className="textknopf klein" onClick={() => setGeheimNeu(true)}>Ändern</button><button type="button" className="textknopf klein gefahr" onClick={() => setze(null)}>Löschen</button></div>
        : <input id={id} type="password" autoComplete="new-password" placeholder={wert === null && !geheimNeu ? 'nicht gesetzt' : 'neuer Wert'} value={typeof wert === 'string' ? wert : ''} onChange={(e) => setze(e.target.value || (warGesetzt && geheimNeu ? { behalten: true } : null))} />;
      break;
    }
    case 'mappentyp': ctl = liste(auswahl.typen); break;
    case 'benutzer': ctl = liste(auswahl.benutzer); break;
    case 'rolle': ctl = liste(auswahl.rollen); break;
    case 'sicht': ctl = liste(auswahl.sichten); break;
    case 'feld': {
      const v = wert as FeldVerweis | null;
      const optionen = auswahl.typen.flatMap((t) => t.felder.map((g) => ({ id: `${t.id}|${g.key}`, name: `${t.name} › ${g.label}` })));
      ctl = (
        <select id={id} value={v ? `${v.typ}|${v.feld}` : ''} onChange={(e) => { const [typ, feld] = e.target.value.split('|'); setze(e.target.value ? { typ, feld } : null); }}>
          <option value="">– keine Auswahl –</option>{optionen.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      );
      break;
    }
  }
  return (
    <div className={`eigenschaft${fehler ? ' fehlerhaft' : ''}`}>
      {f.typ !== 'janein' && <label htmlFor={id}>{f.name}{f.pflicht && <span aria-hidden="true"> *</span>}</label>}
      {ctl}
      {f.hilfe && <small className="leise">{f.hilfe}</small>}
      {fehler && <small className="fehlertext">{fehler}</small>}
    </div>
  );
}
