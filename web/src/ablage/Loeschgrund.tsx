import { useState, type ReactNode } from 'react';
import { GRUND_TEXT_MAX, LOESCHGRUENDE, type LoeschAnlass, type Loeschgrund } from '../../../shared/src/loeschprotokoll';
import { rueckfrage, type Rueckfrage } from '../rueckfrage';

/**
 * Grund fürs Löschprotokoll (#470) in der Rückfrage beim Löschen: Auswahl und optional ein kurzer Text –
 * ohne Personenbezug, weil das Protokoll bleibt, wenn die Daten weg sind.
 */
function GrundWahl({ wahl }: { wahl: { grund: Loeschgrund; text: string } }) {
  const [g, setG] = useState(wahl.grund);
  const [t, setT] = useState(wahl.text);
  return (
    <div className="lp-grund">
      <label className="eigenschaft"><span>Grund <small>steht im Löschprotokoll</small></span>
        <select value={g} onChange={(e) => { const v = e.target.value as Loeschgrund; setG(v); wahl.grund = v; }}>
          {Object.entries(LOESCHGRUENDE).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </label>
      <label className="eigenschaft"><span>Anmerkung <small>optional, ohne Namen oder andere Angaben zur Person</small></span>
        <input value={t} maxLength={GRUND_TEXT_MAX} placeholder="z. B. Anfrage vom 03.11., Vorgang 12" onChange={(e) => { setT(e.target.value); wahl.text = e.target.value; }} />
      </label>
    </div>
  );
}

/** Rückfrage mit Grund; null = abgebrochen. */
export async function mitGrund(r: Rueckfrage, vorschlag: Loeschgrund = 'nicht_noetig'): Promise<LoeschAnlass | null> {
  const wahl = { grund: vorschlag, text: '' };
  const text: ReactNode = <>{typeof r.text === 'string' ? r.text.split('\n\n').map((x, i) => <p key={i}>{x}</p>) : r.text}<GrundWahl wahl={wahl} /></>;
  if (!(await rueckfrage({ ...r, text }))) return null;
  return { grund: wahl.grund, text: wahl.text.trim() };
}
