import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * Eigene Rückfragen statt `confirm()`/`alert()` (#355): einheitlich, mit Verb auf dem Knopf,
 * rot für Gefährliches, barrierefrei (`role="alertdialog"`, modal mit Fokusfalle, Esc bricht ab).
 *
 *   if (!(await rueckfrage({ titel: 'Notiz löschen?', ja: 'Löschen', gefahr: true }))) return;
 *   await hinweis({ titel: 'Gespeichert', text: '…' });
 *
 * Die Funktionen gehen überall (auch außerhalb von Komponenten); angezeigt wird im einen
 * `<Rueckfragen />`, das die App einmal einbindet. Mehrere Rückfragen kommen nacheinander.
 */
export interface Rueckfrage {
  /** Was passiert? Als Frage: „Notiz löschen?“ */
  titel: string;
  /** Folgen in einem Satz oder zwei. */
  text?: ReactNode;
  /** Knopf mit Verb: „Löschen“, „Abmelden“ … */
  ja: string;
  /** Sicherer Knopf; Standard „Abbrechen“. */
  nein?: string;
  /** Rot, Fokus zuerst auf dem sicheren Knopf. */
  gefahr?: boolean;
  /** Nur für sehr Gefährliches: dieses Wort muss eingetippt werden. */
  bestaetigeMit?: string;
}

interface Offen extends Rueckfrage { nr: number; nurHinweis?: boolean; fertig(ok: boolean): void }

let naechste = 0;
let zeige: ((r: Offen) => void) | null = null;
const wartend: Offen[] = [];

/** Rückfrage stellen; true = bestätigt. */
export function rueckfrage(r: Rueckfrage): Promise<boolean> {
  return new Promise((fertig) => {
    const o = { ...r, nr: ++naechste, fertig };
    if (zeige) zeige(o); else wartend.push(o);
  });
}

/** Nur ein Hinweis mit einem Knopf (statt `alert()`). */
export function hinweis(r: { titel: string; text?: ReactNode; ok?: string }): Promise<void> {
  return new Promise((fertig) => {
    const o: Offen = { nr: ++naechste, titel: r.titel, text: r.text, ja: r.ok ?? 'Verstanden', nurHinweis: true, fertig: () => fertig() };
    if (zeige) zeige(o); else wartend.push(o);
  });
}

/** Einmal in der App einbinden. */
export function Rueckfragen() {
  const [liste, setListe] = useState<Offen[]>([]);
  useEffect(() => {
    zeige = (o) => setListe((l) => [...l, o]);
    if (wartend.length) setListe((l) => [...l, ...wartend.splice(0)]);
    return () => { zeige = null; };
  }, []);
  const aktuell = liste[0];
  if (!aktuell) return null;
  const schliesse = (ok: boolean) => { setListe((l) => l.slice(1)); aktuell.fertig(ok); };
  return <Dialog key={aktuell.nr} r={aktuell} schliesse={schliesse} />;
}

function Dialog({ r, schliesse }: { r: Offen; schliesse(ok: boolean): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const sicher = useRef<HTMLButtonElement>(null);
  const jaKnopf = useRef<HTMLButtonElement>(null);
  const feld = useRef<HTMLInputElement>(null);
  const [eingabe, setEingabe] = useState('');
  const id = useId();
  const passt = !r.bestaetigeMit || eingabe.trim().toLowerCase() === r.bestaetigeMit.toLowerCase();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal?.();
    // Gefährliches: Fokus auf den sicheren Knopf, damit Enter nichts zerstört.
    (r.bestaetigeMit ? feld.current : r.gefahr && !r.nurHinweis ? sicher.current : jaKnopf.current)?.focus();
  }, [r]);
  return (
    <dialog ref={ref} className={`rueckfrage ${r.gefahr ? 'gefahr' : ''}`} role="alertdialog" aria-modal="true"
      aria-labelledby={`${id}-t`} aria-describedby={r.text ? `${id}-x` : undefined}
      onCancel={(e) => { e.preventDefault(); schliesse(false); }}>
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); if (passt) schliesse(true); }}>
        <h2 id={`${id}-t`}>{r.titel}</h2>
        {r.text && <div id={`${id}-x`} className="rueckfrage-text">{typeof r.text === 'string' ? r.text.split('\n\n').map((t, i) => <p key={i}>{t}</p>) : r.text}</div>}
        {r.bestaetigeMit && (
          <label className="eigenschaft">
            <span>Zum Bestätigen „{r.bestaetigeMit}“ eintippen</span>
            <input ref={feld} value={eingabe} onChange={(e) => setEingabe(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
        )}
        <div className="rueckfrage-knoepfe">
          {!r.nurHinweis && <button ref={sicher} type="button" className="knopf" onClick={() => schliesse(false)}>{r.nein ?? 'Abbrechen'}</button>}
          <button ref={jaKnopf} type="submit" className={`knopf ${r.gefahr ? 'gefahr' : 'primaer'}`} disabled={!passt}>{r.ja}</button>
        </div>
      </form>
    </dialog>
  );
}
