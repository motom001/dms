import { useMemo, useRef, useState, type ReactNode } from 'react';
import { erwaehnung, zerlege, type Block, type Inline } from '../../../shared/src/markdown';
import { useDaten } from '../daten';

/**
 * Formatierter Text (#53): Anzeige und Eingabe.
 * Die Anzeige baut React-Elemente aus dem zerlegten Markdown – es wird nie HTML eingesetzt.
 */

function Teile({ teile }: { teile: Inline[] }) {
  const d = useDaten();
  return <>{teile.map((t, i) => {
    switch (t.art) {
      case 'text': return <span key={i}>{t.text}</span>;
      case 'fett': return <strong key={i}><Teile teile={t.kinder} /></strong>;
      case 'kursiv': return <em key={i}><Teile teile={t.kinder} /></em>;
      case 'code': return <code key={i}>{t.text}</code>;
      case 'link': return <a key={i} href={t.ziel} target="_blank" rel="noreferrer noopener">{<Teile teile={t.kinder} />}</a>;
      case 'erwaehnung': {
        const p = d.personen.find((x) => x.id === t.benutzerId);
        return <span key={i} className="erwaehnung" title="Erwähnung">@{p?.name ?? t.name}</span>;
      }
    }
  })}</>;
}

function Bloecke({ bloecke }: { bloecke: Block[] }) {
  return <>{bloecke.map((b, i): ReactNode => {
    switch (b.art) {
      case 'ueberschrift': {
        const H = (`h${b.stufe + 2}`) as 'h3' | 'h4' | 'h5';
        return <H key={i}><Teile teile={b.inhalt} /></H>;
      }
      case 'absatz': return <p key={i}><Teile teile={b.inhalt} /></p>;
      case 'liste': {
        const L = b.nummeriert ? 'ol' : 'ul';
        return <L key={i}>{b.punkte.map((p, j) => <li key={j}><Teile teile={p} /></li>)}</L>;
      }
      case 'zitat': return <blockquote key={i}><Bloecke bloecke={b.bloecke} /></blockquote>;
    }
  })}</>;
}

export function Formatiert({ text }: { text: string }) {
  const bloecke = useMemo(() => zerlege(text), [text]);
  return <div className="formatiert"><Bloecke bloecke={bloecke} /></div>;
}

type Werkzeug = { titel: string; zeichen: ReactNode; vor: string; nach?: string; zeile?: boolean; platzhalter: string };
const WERKZEUGE: Werkzeug[] = [
  { titel: 'Fett', zeichen: <strong>F</strong>, vor: '**', nach: '**', platzhalter: 'fett' },
  { titel: 'Kursiv', zeichen: <em>K</em>, vor: '*', nach: '*', platzhalter: 'kursiv' },
  { titel: 'Überschrift', zeichen: 'Ü', vor: '## ', zeile: true, platzhalter: 'Überschrift' },
  { titel: 'Liste', zeichen: '•', vor: '- ', zeile: true, platzhalter: 'Punkt' },
  { titel: 'Nummerierte Liste', zeichen: '1.', vor: '1. ', zeile: true, platzhalter: 'Punkt' },
  { titel: 'Zitat', zeichen: '„“', vor: '> ', zeile: true, platzhalter: 'Zitat' },
  { titel: 'Link', zeichen: '🔗', vor: '[', nach: '](https://)', platzhalter: 'Linktext' },
];

/** Eingabe: Werkzeugleiste, Schreiben/Vorschau und @-Erwähnungen (#56). */
export function FormatiertEingabe({ id, wert, setze }: { id: string; wert: string; setze: (v: string) => void }) {
  const d = useDaten();
  const feld = useRef<HTMLTextAreaElement>(null);
  const [vorschau, setVorschau] = useState(!!wert);
  const [suche, setSuche] = useState<{ start: number; text: string } | null>(null);

  function einfuegen(w: Werkzeug) {
    const el = feld.current;
    if (!el) return;
    const [a, e] = [el.selectionStart, el.selectionEnd];
    let auswahl = wert.slice(a, e) || w.platzhalter;
    let start = a;
    let vor = w.vor;
    if (w.zeile) {
      // Zeilenweise: an den Anfang der Zeile(n) setzen.
      start = wert.lastIndexOf('\n', a - 1) + 1;
      auswahl = (wert.slice(start, e) || w.platzhalter).split('\n').map((z, i) => (w.vor === '1. ' ? `${i + 1}. ` : w.vor) + z).join('\n');
      vor = '';
    }
    const neu = wert.slice(0, start) + vor + auswahl + (w.nach ?? '') + wert.slice(w.zeile ? Math.max(e, start) : e);
    setze(neu);
    requestAnimationFrame(() => { el.focus(); const s = start + vor.length; el.setSelectionRange(s, s + auswahl.length); });
  }

  // @-Erwähnung: Wort nach @ bis zum Cursor.
  function pruefeErwaehnung(text: string, pos: number) {
    const m = /(^|\s)@([^\s@[\]]{0,30})$/.exec(text.slice(0, pos));
    setSuche(m ? { start: pos - m[2].length - 1, text: m[2].toLowerCase() } : null);
  }
  const vorschlaege = suche ? d.personen.filter((p) => p.aktiv !== false && p.name.toLowerCase().includes(suche.text)).slice(0, 6) : [];
  function waehle(p: { id: string; name: string }) {
    const el = feld.current;
    if (!el || !suche) return;
    const ende = el.selectionStart;
    const einsatz = `${erwaehnung(p.name, p.id)} `;
    setze(wert.slice(0, suche.start) + einsatz + wert.slice(ende));
    setSuche(null);
    requestAnimationFrame(() => { el.focus(); const s = suche.start + einsatz.length; el.setSelectionRange(s, s); });
  }

  return (
    <div className="formateingabe">
      <div className="formatleiste" role="toolbar" aria-label="Formatierung">
        <button type="button" className={`textknopf ${vorschau ? '' : 'an'}`} onClick={() => setVorschau(false)}>Schreiben</button>
        <button type="button" className={`textknopf ${vorschau ? 'an' : ''}`} onClick={() => setVorschau(true)}>Vorschau</button>
        {!vorschau && <span className="werkzeuge">{WERKZEUGE.map((w) => (
          <button key={w.titel} type="button" className="symbol" title={w.titel} aria-label={w.titel} onMouseDown={(e) => e.preventDefault()} onClick={() => einfuegen(w)}>{w.zeichen}</button>
        ))}</span>}
      </div>
      {vorschau
        ? <div className="formatvorschau" onDoubleClick={() => setVorschau(false)}>{wert.trim() ? <Formatiert text={wert} /> : <p className="leise">Noch nichts eingetragen.</p>}</div>
        : <div className="wahl">
            <textarea id={id} ref={feld} rows={6} value={wert}
              onChange={(e) => { setze(e.target.value); pruefeErwaehnung(e.target.value, e.target.selectionStart); }}
              onKeyDown={(e) => { if (e.key === 'Escape') setSuche(null); if (e.key === 'Enter' && vorschlaege.length && suche) { e.preventDefault(); waehle(vorschlaege[0]); } }}
              onBlur={() => setTimeout(() => setSuche(null), 150)}
              placeholder="**fett**, *kursiv*, - Liste, [Link](https://…), @Name erwähnt jemanden" />
            {vorschlaege.length > 0 && (
              <div className="wahlliste" role="listbox" aria-label="Benutzer erwähnen">
                {vorschlaege.map((p) => <button key={p.id} type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => waehle(p)}>@{p.name}</button>)}
              </div>
            )}
          </div>}
    </div>
  );
}
