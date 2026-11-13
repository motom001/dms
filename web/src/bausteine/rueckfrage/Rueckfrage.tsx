import { useEffect, useId, useRef, useState, type Ref } from 'react';
import { rueckfragenAnzeigen, type OffeneRueckfrage, type Rueckfrage } from '../../rueckfrage';
import { t } from '../../sprache';
import { Feld } from '../feld/Feld';
import { BestaetigenKnopf, Knopf } from '../knopf/Knopf';
import s from './Rueckfrage.module.css';

/**
 * Baustein Rückfrage (#355, aus Bausteinen seit #1210): das Fenster zu `rueckfrage()` und `hinweis()` aus
 * `web/src/rueckfrage.tsx`. „Abbrechen“ ist ein Knopf der Art Neben, der Bestätigungsknopf blau – bei Gefahr rot
 * gefüllt (Leitsatz 5: rot gefüllt nur im Moment der Entscheidung, nur hier). Bei Gefahr startet der Fokus auf
 * „Abbrechen“, damit Enter nichts zerstört. `role="alertdialog"`, modal mit Fokusfalle, Esc bricht ab.
 *
 * `RueckfrageVorschau` zeigt denselben Inhalt stehend, ohne Fenster – nur für die Musterseite.
 */

const klassen = (...k: Array<string | false | undefined | null>) => k.filter(Boolean).join(' ');

/** Einmal in der App einbinden (start.tsx). */
export function Rueckfragen() {
  const [liste, setListe] = useState<OffeneRueckfrage[]>([]);
  useEffect(() => rueckfragenAnzeigen((neu) => setListe((l) => [...l, ...neu])), []);
  const aktuell = liste[0];
  if (!aktuell) return null;
  const schliesse = (ok: boolean) => { setListe((l) => l.slice(1)); aktuell.fertig(ok); };
  return <Dialog key={aktuell.nr} r={aktuell} schliesse={schliesse} />;
}

/** Titel, Text, Eingabe zum Bestätigen und die beiden Knöpfe – im Fenster und auf der Musterseite gleich. */
function Inhalt({ r, id, schliesse, sicher, ja }: { r: Rueckfrage & { nurHinweis?: boolean }; id: string; schliesse(ok: boolean): void; sicher?: Ref<HTMLButtonElement>; ja?: Ref<HTMLButtonElement> }) {
  const [eingabe, setEingabe] = useState('');
  const feld = useRef<HTMLInputElement>(null);
  const passt = !r.bestaetigeMit || eingabe.trim().toLowerCase() === r.bestaetigeMit.toLowerCase();
  useEffect(() => { if (r.bestaetigeMit) feld.current?.focus(); }, [r.bestaetigeMit]);
  return (
    <form method="dialog" onSubmit={(e) => { e.preventDefault(); if (passt) schliesse(true); }}>
      <h2 id={`${id}-t`}>{r.titel}</h2>
      {r.text && <div id={`${id}-x`} className="rueckfrage-text">{typeof r.text === 'string' ? r.text.split('\n\n').map((text, i) => <p key={i}>{text}</p>) : r.text}</div>}
      {r.bestaetigeMit && (
        <Feld beschriftung={t('oberflaeche.rueckfrage.zum-bestaetigen-eintippen', { bestaetigeMit: r.bestaetigeMit })}>
          <input ref={feld} value={eingabe} onChange={(e) => setEingabe(e.target.value)} autoComplete="off" spellCheck={false} />
        </Feld>
      )}
      <div className="rueckfrage-knoepfe">
        {!r.nurHinweis && <Knopf ref={sicher} onClick={() => schliesse(false)}>{r.nein ?? t('oberflaeche.rueckfrage.abbrechen')}</Knopf>}
        <BestaetigenKnopf ref={ja} gefahr={r.gefahr && !r.nurHinweis} gesperrt={!passt}>{r.ja}</BestaetigenKnopf>
      </div>
    </form>
  );
}

function Dialog({ r, schliesse }: { r: OffeneRueckfrage; schliesse(ok: boolean): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const sicher = useRef<HTMLButtonElement>(null);
  const ja = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal?.();
    // Gefährliches: Fokus auf den sicheren Knopf, damit Enter nichts zerstört (die Eingabe fokussiert sich selbst).
    if (!r.bestaetigeMit) (r.gefahr && !r.nurHinweis ? sicher.current : ja.current)?.focus();
  }, [r]);
  return (
    <dialog ref={ref} className={klassen('rueckfrage', r.gefahr && 'gefahr')} role="alertdialog" aria-modal="true"
      aria-labelledby={`${id}-t`} aria-describedby={r.text ? `${id}-x` : undefined}
      onCancel={(e) => { e.preventDefault(); schliesse(false); }}>
      <Inhalt r={r} id={id} schliesse={schliesse} sicher={sicher} ja={ja} />
    </dialog>
  );
}

/** Die Rückfrage stehend, ohne Fenster (Musterseite): sieht aus wie das Fenster, tut nichts. */
export function RueckfrageVorschau({ r }: { r: Rueckfrage }) {
  const id = useId();
  return (
    <div className={klassen('rueckfrage', r.gefahr && 'gefahr', s.vorschau)} role="group" aria-labelledby={`${id}-t`}>
      <Inhalt r={r} id={id} schliesse={() => {}} />
    </div>
  );
}
