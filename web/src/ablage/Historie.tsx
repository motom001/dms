import { useEffect, useState } from 'react';
import { HISTORIENARTEN, type Historieneintrag } from '../../../shared/src/model';
import { api } from '../api';
import { useDaten } from '../daten';
import { Link } from '../ort';

/** Änderungshistorie einer Mappe (#57): je Speichern ein Eintrag, Einzelheiten zum Aufklappen. */
const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

function kurz(e: Historieneintrag): string {
  const d = e.daten;
  if (d.aenderungen?.length) return d.aenderungen.map((a) => a.label).join(', ');
  if (d.dokument) return d.dokument;
  if (d.feld) return d.feld;
  if (typeof d.text === 'string') return d.text;
  return '';
}

export function Historie({ mappeId, stand }: { mappeId: string; stand?: string }) {
  const d = useDaten();
  const [liste, setListe] = useState<Historieneintrag[] | null>(null);
  const emailTyp = d.typen.find((t) => t.system === 'email')?.id;
  const [fehler, setFehler] = useState<string>();
  useEffect(() => {
    api.historie(mappeId).then((h) => { setListe(h); setFehler(undefined); }, (e: Error) => setFehler(e.message));
  }, [mappeId, stand]);
  if (fehler) return <div className="hinweis schlecht"><p>{fehler}</p></div>;
  if (!liste) return <p className="leise">Lade …</p>;
  if (!liste.length) return <p className="leise">Noch keine Einträge. Das Protokoll beginnt mit Version 0.12; ältere Änderungen sind nicht erfasst.</p>;
  return (
    <ul className="historie">
      {liste.map((e) => {
        const mehr = !!e.daten.aenderungen?.length;
        const kopf = (
          <>
            <span className="wann">{zeit(e.zeit)}</span>
            <span className="wer">{d.person(e.benutzerId)}</span>
            <span className="was"><strong>{HISTORIENARTEN[e.art] ?? e.art}</strong>{kurz(e) ? `: ${kurz(e)}` : ''}
              {e.art === 'email' && typeof e.daten.email === 'string' && emailTyp && <> · <Link to={`/ablage/${emailTyp}/${e.daten.email}`} className="verweis">öffnen</Link></>}</span>
          </>
        );
        return (
          <li key={e.id}>
            {mehr
              ? <details>
                  <summary>{kopf}</summary>
                  <table className="aenderungen">
                    <thead><tr><th>Feld</th><th>vorher</th><th>nachher</th></tr></thead>
                    <tbody>{e.daten.aenderungen!.map((a) => (
                      <tr key={a.feld}><td>{a.label}</td>{a.geheim ? <td colSpan={2} className="leise">geändert (Passwort, ohne Werte)</td> : <><td className={a.alt ? '' : 'leise'}>{a.alt || '–'}</td><td className={a.neu ? '' : 'leise'}>{a.neu || '–'}</td></>}</tr>
                    ))}</tbody>
                  </table>
                </details>
              : <div className="zeile">{kopf}</div>}
          </li>
        );
      })}
    </ul>
  );
}
