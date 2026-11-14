import { useState, type ReactNode } from 'react';
import { GRUND_TEXT_MAX, LOESCHGRUENDE, type LoeschAnlass, type Loeschgrund } from '../../../../shared/src/loeschprotokoll';
import { rueckfrage, type Rueckfrage } from '../../rueckfrage';
import { t } from '../../sprache';
import { Feld } from '../feld/Feld';

/**
 * Grund fürs Löschprotokoll (#470) in der Rückfrage beim Löschen: Auswahl und optional ein kurzer Text – ohne
 * Personenbezug, weil das Protokoll bleibt, wenn die Daten weg sind. Seit #1211 im Baustein: Ein Gefahr-Knopf fragt
 * mit `rueckfrage.mitGrund` selbst danach und gibt den Anlass an `onClick` weiter.
 */
function GrundWahl({ wahl }: { wahl: { grund: Loeschgrund; text: string } }) {
  const [g, setG] = useState(wahl.grund);
  const [text, setT] = useState(wahl.text);
  return (
    <div className="lp-grund">
      <Feld beschriftung={t('ablage.loeschgrund.grund-feld')} hinweis={t('ablage.loeschgrund.steht-im-loeschprotokoll')}>
        <select value={g} onChange={(e) => { const v = e.target.value as Loeschgrund; setG(v); wahl.grund = v; }}>
          {Object.entries(LOESCHGRUENDE).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </Feld>
      <Feld beschriftung={t('ablage.loeschgrund.anmerkung-feld')} optional hinweis={t('ablage.loeschgrund.ohne-namen')}>
        <input value={text} maxLength={GRUND_TEXT_MAX} placeholder={t('ablage.loeschgrund.z-b-anfrage-vom')} onChange={(e) => { setT(e.target.value); wahl.text = e.target.value; }} />
      </Feld>
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
