import { useCallback, useEffect, useState } from 'react';
import { api, type Fehlermeldung } from '../api';
import { geheZu, Link } from '../ort';
import { Person } from '../Person';
import { Hilfe } from '../Hilfe';

/** Werkbank → Wartung und Fehlersuche → Fehlermeldungen (#70). */
const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const groesse = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

export function useFehlermeldungen(aktiv: boolean) {
  const [erledigt, setErledigt] = useState(false);
  const [liste, setListe] = useState<Fehlermeldung[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setListe(await api.fehlermeldungen(erledigt)); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, [erledigt]);
  useEffect(() => { if (aktiv) void laden(); }, [aktiv, laden]);
  return { liste, erledigt, setErledigt, fehler, laden };
}
export type FehlermeldungenZustand = ReturnType<typeof useFehlermeldungen>;

export function FehlermeldungenListe({ z, offen }: { z: FehlermeldungenZustand; offen?: string }) {
  return (
    <>
      <div className="listenkopf">
        <div><h1>Fehlermeldungen</h1><p className="leise klein">{z.erledigt ? 'Erledigte Meldungen der Benutzer.' : 'Was Benutzer gemeldet haben, mit technischen Angaben.'} <Hilfe ort="werkbank.fehlermeldungen" /></p></div>
        <button type="button" className="knopf klein" onClick={() => z.setErledigt(!z.erledigt)}>{z.erledigt ? 'Offene zeigen' : 'Erledigte zeigen'}</button>
      </div>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {z.liste === null ? <p className="leise">Lade …</p> : !z.liste.length ? <p className="leise leerliste">{z.erledigt ? 'Keine erledigten Meldungen.' : 'Keine offenen Meldungen.'}</p> : (
        <ul className="mappenliste">
          {z.liste.map((m) => (
            <li key={m.id}>
              <Link to={`/werkbank/fehlermeldungen/${m.id}`} className={`eintrag werk ${offen === m.id ? 'an' : ''}`}>
                <span className="titel">{m.text.split('\n')[0].slice(0, 80) || 'Ohne Beschreibung'}</span>
                <span className="unter">{zeit(m.erstellt)}{m.bilder.length ? ` · ${m.bilder.length} ${m.bilder.length === 1 ? 'Bild' : 'Bilder'}` : ''}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Technische Angaben als verschachtelte Liste. */
function Angaben({ wert }: { wert: unknown }) {
  if (wert === null || wert === undefined || wert === '') return <span className="leise">–</span>;
  if (typeof wert === 'boolean') return <span>{wert ? 'ja' : 'nein'}</span>;
  if (typeof wert !== 'object') return <span>{String(wert)}</span>;
  if (Array.isArray(wert)) return wert.length ? <ol className="angabenliste">{wert.map((x, i) => <li key={i}><Angaben wert={x} /></li>)}</ol> : <span className="leise">keine</span>;
  return (
    <dl className="eigenschaften angaben">
      {Object.entries(wert as Record<string, unknown>).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd><Angaben wert={v} /></dd></div>)}
    </dl>
  );
}

export function FehlermeldungDetail({ id, neuLaden }: { id: string; z: FehlermeldungenZustand; neuLaden: () => Promise<void> }) {
  const [m, setM] = useState<Fehlermeldung | null>(null);
  const [fehler, setFehler] = useState<string>();
  useEffect(() => { api.fehlermeldung(id).then(setM, (e: Error) => setFehler(e.message)); }, [id]);
  async function erledigt(an: boolean) {
    try { setM(await api.fehlermeldungErledigt(id, an)); await neuLaden(); } catch (e) { setFehler((e as Error).message); }
  }
  async function loeschen() {
    if (!confirm('Diese Fehlermeldung samt Bildern endgültig löschen?')) return;
    try { await api.fehlermeldungLoeschen(id); await neuLaden(); geheZu('/werkbank/fehlermeldungen'); } catch (e) { setFehler((e as Error).message); }
  }
  if (fehler) return <div className="hinweis schlecht"><p>{fehler}</p></div>;
  if (!m) return <p className="leise">Lade …</p>;
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Fehlermeldung</p>
        <h1>{m.text.split('\n')[0].slice(0, 120)}</h1>
        <dl className="index">
          <div><dt>Gemeldet</dt><dd>{zeit(m.erstellt)} von <Person id={m.benutzerId} /></dd></div>
          {m.erledigt && <div><dt>Erledigt</dt><dd>{zeit(m.erledigt)} von <Person id={m.erledigtVon} /></dd></div>}
        </dl>
      </div>
      <section className="blatt">
        <h2 className="h3">Beschreibung</h2>
        <p className="mehrzeilig">{m.text}</p>
      </section>
      {m.bilder.length > 0 && (
        <section className="blatt">
          <h2 className="h3">Screenshots</h2>
          <div className="fehlerbilder">
            {m.bilder.map((b) => {
              const url = `/api/werkbank/fehlermeldungen/${m.id}/bilder/${b.nr}`;
              return <a key={b.nr} href={url} target="_blank" rel="noreferrer" title={`${b.name} (${groesse(b.groesse)}) groß ansehen`}><img src={url} alt={b.name} loading="lazy" /></a>;
            })}
          </div>
        </section>
      )}
      <section className="blatt">
        <div className="blattkopf zeile-zwischen"><h2 className="h3">Technische Angaben</h2>
          <Link to="/werkbank/protokoll" className="verweis">Zum Protokoll (Einträge um {new Date(m.erstellt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr) →</Link></div>
        <Angaben wert={m.angaben} />
      </section>
      <div className="knoepfe">
        <button type="button" className="knopf gefahr-rand" onClick={() => void loeschen()}>Löschen</button>
        <button type="button" className="knopf primaer" onClick={() => void erledigt(!m.erledigt)}>{m.erledigt ? 'Wieder öffnen' : 'Als erledigt markieren'}</button>
      </div>
    </div>
  );
}
