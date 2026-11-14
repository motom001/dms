import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Symbol } from '../Symbol';
import { erwaehnung, zerlege, type Block, type Inline } from '../../../shared/src/markdown';
import { abwesenheitText, useDaten } from '../daten';
import { Person } from '../Person';
import { t } from '../sprache';
import { Feld, Knopf, Umschalter, type FeldProps } from '../bausteine';

/**
 * Formatierter Text (#53): Anzeige und Eingabe.
 * Die Anzeige baut React-Elemente aus dem zerlegten Markdown – es wird nie HTML eingesetzt.
 */

function Teile({ teile }: { teile: Inline[] }) {
  return <>{teile.map((inline, i) => {
    switch (inline.art) {
      case 'text': return <span key={i}>{inline.text}</span>;
      case 'fett': return <strong key={i}><Teile teile={inline.kinder} /></strong>;
      case 'kursiv': return <em key={i}><Teile teile={inline.kinder} /></em>;
      case 'code': return <code key={i}>{inline.text}</code>;
      case 'link': return <a key={i} href={inline.ziel} target="_blank" rel="noreferrer noopener">{<Teile teile={inline.kinder} />}</a>;
      case 'erwaehnung': {
        return <Person key={i} id={inline.benutzerId} ersatz={inline.name} vor="@" className="erwaehnung" />;
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
  { titel: t('ablage.formatiert.fett'), zeichen: <strong>F</strong>, vor: '**', nach: '**', platzhalter: 'fett' },
  { titel: t('ablage.formatiert.kursiv'), zeichen: <em>K</em>, vor: '*', nach: '*', platzhalter: 'kursiv' },
  { titel: t('ablage.formatiert.ueberschrift'), zeichen: 'Ü', vor: '## ', zeile: true, platzhalter: t('ablage.formatiert.ueberschrift') },
  { titel: t('ablage.formatiert.liste'), zeichen: '•', vor: '- ', zeile: true, platzhalter: t('ablage.formatiert.punkt') },
  { titel: t('ablage.formatiert.nummerierte-liste'), zeichen: '1.', vor: '1. ', zeile: true, platzhalter: t('ablage.formatiert.punkt') },
  { titel: t('ablage.formatiert.zitat'), zeichen: '„“', vor: '> ', zeile: true, platzhalter: t('ablage.formatiert.zitat') },
  { titel: t('ablage.formatiert.link'), zeichen: <Symbol name="link" />, vor: '[', nach: '](https://)', platzhalter: t('ablage.formatiert.linktext') },
];


/** Position des Zeichens `pos` in einer textarea, relativ zu ihr (Spiegel-Element, #64). */
function cursorPosition(el: HTMLTextAreaElement, pos: number): { top: number; left: number; hoehe: number } {
  const stil = getComputedStyle(el);
  const spiegel = document.createElement('div');
  for (const k of ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'wordSpacing', 'tabSize', 'textIndent'] as const) {
    spiegel.style[k] = stil[k];
  }
  Object.assign(spiegel.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', borderStyle: 'solid' });
  spiegel.textContent = el.value.slice(0, pos);
  const marke = document.createElement('span');
  marke.textContent = el.value.slice(pos) || '.';
  spiegel.appendChild(marke);
  document.body.appendChild(spiegel);
  const hoehe = parseFloat(stil.lineHeight) || parseFloat(stil.fontSize) * 1.4;
  const r = { top: marke.offsetTop - el.scrollTop, left: marke.offsetLeft - el.scrollLeft, hoehe };
  document.body.removeChild(spiegel);
  return r;
}

/** Eingabe: Werkzeugleiste, Schreiben/Vorschau und @-Erwähnungen (#56). */
/**
 * Eingabe für formatierten Text (#64): Umschalter „Schreiben · Vorschau“ (C17), Werkzeuge, @-Erwähnungen. Im Feldrahmen
 * (#1211): `rahmen` sind Beschriftung, Hinweis, Fehler des Felds (in der Mappe); ohne Angabe eine Beschriftung nur für
 * Screenreader (Notizen).
 */
export function FormatiertEingabe({ id, wert, setze, rahmen, unter }: { id: string; wert: string; setze: (v: string) => void; rahmen?: Omit<FeldProps, 'children' | 'id'>; /** Unter der Eingabe, z. B. eine Übersetzung (#732). */ unter?: ReactNode }) {
  const d = useDaten();
  const feld = useRef<HTMLTextAreaElement>(null);
  const [vorschau, setVorschau] = useState(!!wert);
  const [suche, setSuche] = useState<{ start: number; text: string } | null>(null);
  const [aktiv, setAktiv] = useState(0);
  const [ort, setOrt] = useState<{ top: number; left: number; oben: boolean } | null>(null);

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
    const neu = m ? { start: pos - m[2].length - 1, text: m[2].toLowerCase() } : null;
    setSuche(neu);
    setAktiv(0);
    const el = feld.current;
    if (!neu || !el) { setOrt(null); return; }
    // Liste unter dem @ öffnen; reicht der Platz im Fenster nicht, darüber (#64).
    const p = cursorPosition(el, neu.start);
    const r = el.getBoundingClientRect();
    const unten = r.top + p.top + p.hoehe;
    const oben = window.innerHeight - unten < 220 && r.top + p.top > 220;
    setOrt({ top: el.offsetTop + p.top + (oben ? 0 : p.hoehe + 2), left: Math.max(0, Math.min(el.offsetLeft + p.left, el.offsetLeft + el.clientWidth - 200)), oben });
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
    <>
    <Feld {...(rahmen ?? { beschriftung: t('ablage.formatiert.text'), beschriftungVerbergen: true })} id={id}>{(v) => (
    <div className="formateingabe">
      <div className="formatleiste">
        <Umschalter wert={vorschau ? 'vorschau' : 'schreiben'} setze={(x) => setVorschau(x === 'vorschau')} beschriftung={t('ablage.formatiert.ansicht')}
          wahlen={[{ wert: 'schreiben', text: t('ablage.formatiert.schreiben') }, { wert: 'vorschau', text: t('ablage.formatiert.vorschau') }]} />
        {!vorschau && <span className="werkzeuge" role="toolbar" aria-label={t('ablage.formatiert.formatierung')}>{WERKZEUGE.map((w) => (
          <Knopf key={w.titel} art="link" nurSymbol={w.titel} onMouseDown={(e) => e.preventDefault()} onClick={() => einfuegen(w)}>{w.zeichen}</Knopf>
        ))}</span>}
      </div>
      {vorschau
        ? <div className="formatvorschau" id={v.id} tabIndex={-1} onDoubleClick={() => setVorschau(false)}>{wert.trim() ? <Formatiert text={wert} /> : <p className="leise">{t('ablage.formatiert.noch-nichts-eingetragen')}</p>}</div>
        : <div className="wahl">
            <textarea id={v.id} aria-describedby={v['aria-describedby']} aria-invalid={v['aria-invalid']} ref={feld} rows={6} value={wert}
              onChange={(e) => { setze(e.target.value); pruefeErwaehnung(e.target.value, e.target.selectionStart); }}
              onKeyDown={(e) => {
                if (!suche || !vorschlaege.length) return;
                if (e.key === 'Escape') { e.preventDefault(); setSuche(null); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); setAktiv((i) => (i + 1) % vorschlaege.length); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setAktiv((i) => (i - 1 + vorschlaege.length) % vorschlaege.length); }
                else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); waehle(vorschlaege[Math.min(aktiv, vorschlaege.length - 1)]); }
              }}
              onScroll={() => { if (suche && feld.current) pruefeErwaehnung(feld.current.value, feld.current.selectionStart); }}
              aria-autocomplete="list" aria-controls={suche ? `${id}-erw` : undefined}
              aria-activedescendant={suche && vorschlaege.length ? `${id}-erw-${Math.min(aktiv, vorschlaege.length - 1)}` : undefined}
              onBlur={() => setTimeout(() => setSuche(null), 150)}
              placeholder={t('ablage.formatiert.fett-kursiv-liste-link')} />
            {vorschlaege.length > 0 && (
              <div className={`wahlliste am-cursor ${ort?.oben ? 'oben' : ''}`} role="listbox" id={`${id}-erw`} aria-label={t('ablage.formatiert.benutzer-erwaehnen')}
                style={ort ? { top: ort.top, left: ort.left } : undefined}>
                {/* Optionen einer Combobox: Die Tastatur bleibt im Textfeld (aria-activedescendant), die Maus wählt hier. */}
                {vorschlaege.map((p, i) => <div key={p.id} id={`${id}-erw-${i}`} role="option" aria-selected={i === aktiv} className={`wahloption${i === aktiv ? ' an' : ''}`}
                  onMouseEnter={() => setAktiv(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => waehle(p)}>@{p.name}{p.abwesend && <span className="leise klein"> – {abwesenheitText(p)}</span>}</div>)}
              </div>
            )}
          </div>}
    </div>
    )}</Feld>
    {unter}
    </>
  );
}
