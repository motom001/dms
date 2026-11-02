import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { FrageAusschnitt, VerlaufEintrag } from '../../../shared/src/fragen';
import { api, frageStellen } from '../api';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { titelOder } from '../seiten';
import { t } from '../sprache';
import { Symbol } from '../Symbol';

/**
 * „Frag deine Ablage“ (#444): eigenes Eingabefeld, getrennt von der Suche – nur, wenn ein Paket mit dem Recht
 * dms:antworten installiert ist. Antwort als Chat, entsteht beim Schreiben; darunter Quellen als Links und
 * aufklappbar genau die Stellen, die an die KI gingen. Die Antwort ist nur Text (kein HTML, keine Links aus der
 * Antwort) – sie kann nichts ändern. Der Chat liegt nur hier im Speicher der Seite: weg beim Neuladen.
 */

interface Runde {
  frage: string;
  ausschnitte?: FrageAusschnitt[];
  mappen?: number;
  teil: string;
  antwort?: string;
  quellen?: Array<{ id: string; typId: string; titel: string; nr: number[] }>;
  fehler?: string;
  laeuft: boolean;
}

/** Der Chat überdauert das Wechseln zwischen Ansichten, aber nicht das Neuladen (nichts im Browser-Speicher). */
let chat: Runde[] = [];
const hoerer = new Set<() => void>();
const setzeChat = (c: Runde[]) => { chat = c; for (const h of hoerer) h(); };
const aendereLetzte = (f: (r: Runde) => Runde) => setzeChat(chat.map((r, i) => (i === chat.length - 1 ? f(r) : r)));

/** Verlauf für die nächste Frage: nur fertige Runden, Fragen und Antworten. */
const verlauf = (): VerlaufEintrag[] => chat.filter((r) => r.antwort).flatMap((r) => [{ rolle: 'frage' as const, text: r.frage }, { rolle: 'antwort' as const, text: r.antwort! }]);

export function FragAblage() {
  const [stand, setStand] = useState<{ verfuegbar: boolean; paket: string | null } | null>(null);
  const runden = useSyncExternalStore((h) => { hoerer.add(h); return () => { hoerer.delete(h); }; }, () => chat);
  const [eingabe, setEingabe] = useState('');
  const abbruch = useRef<AbortController | null>(null);
  useEffect(() => {
    let aktuell = true;
    api.fragenVerfuegbar().then((s) => { if (aktuell) setStand(s); }, () => { if (aktuell) setStand({ verfuegbar: false, paket: null }); });
    return () => { aktuell = false; };
  }, []);
  if (!stand?.verfuegbar) return null;
  const laeuft = runden.some((r) => r.laeuft);

  async function fragen() {
    const frage = eingabe.trim();
    if (!frage || laeuft) return;
    const vorher = verlauf();
    setEingabe('');
    setzeChat([...chat, { frage, teil: '', laeuft: true }]);
    const ab = new AbortController();
    abbruch.current = ab;
    try {
      await frageStellen(frage, vorher, (z) => {
        if (z.art === 'ausschnitte') aendereLetzte((r) => ({ ...r, ausschnitte: z.ausschnitte, mappen: z.mappen }));
        else if (z.art === 'teil') aendereLetzte((r) => ({ ...r, teil: r.teil + z.text }));
        else if (z.art === 'fertig') aendereLetzte((r) => ({ ...r, antwort: z.text, quellen: z.quellen, laeuft: false }));
        else aendereLetzte((r) => ({ ...r, fehler: z.text, laeuft: false }));
      }, ab.signal);
      aendereLetzte((r) => (r.laeuft ? { ...r, laeuft: false, fehler: r.antwort ? undefined : t('fragen.abgebrochen') } : r));
    } catch (e) {
      aendereLetzte((r) => ({ ...r, laeuft: false, fehler: (e as Error).name === 'AbortError' ? t('fragen.abgebrochen') : (e as Error).message }));
    } finally { abbruch.current = null; }
  }

  return (
    <section className="frag blatt" aria-label={t('fragen.titel')} data-kachel="fragen">
      <h2 className="h3"><Symbol name="frage" /> {t('fragen.titel')} <Hilfe ort="ablage.fragen" /></h2>
      {runden.length > 0 && (
        <ol className="frag-chat" aria-live="polite">
          {runden.map((r, i) => <RundeAnzeige key={i} r={r} />)}
        </ol>
      )}
      <form className="frag-form" onSubmit={(e) => { e.preventDefault(); void fragen(); }}>
        <label className="sr-only" htmlFor="frag-feld">{t('fragen.feld')}</label>
        <textarea id="frag-feld" className="frag-feld" rows={2} maxLength={1000} value={eingabe} placeholder={t('fragen.beispiel')}
          onChange={(e) => setEingabe(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void fragen(); } }} />
        <div className="knoepfe">
          {laeuft
            ? <button type="button" className="knopf" onClick={() => abbruch.current?.abort()}>{t('fragen.abbrechen')}</button>
            : <button type="submit" className="knopf primaer" disabled={!eingabe.trim()}>{t('fragen.fragen')}</button>}
          {runden.length > 0 && !laeuft && <button type="button" className="textknopf" onClick={() => setzeChat([])}>{t('fragen.neu')}</button>}
        </div>
      </form>
      <p className="leise klein">{t('fragen.hinweis', { paket: stand.paket ?? '' })} {t('fragen.verlauf')}</p>
    </section>
  );
}

function RundeAnzeige({ r }: { r: Runde }) {
  const text = r.antwort ?? r.teil;
  return (
    <li className="frag-runde">
      <p className="frag-frage"><span className="sr-only">{t('fragen.du')}: </span>{r.frage}</p>
      <div className="frag-antwort">
        <span className="sr-only">{t('fragen.antwort')}: </span>
        {text ? <p className="frag-text">{text}</p> : r.laeuft ? <p className="leise klein">{r.ausschnitte ? t('fragen.laeuft') : t('fragen.sucht')}</p> : null}
        {r.fehler && <p className="fehlertext" role="alert">{r.fehler}</p>}
        {r.quellen && (r.quellen.length
          ? <p className="klein frag-quellen">{t('fragen.quellen')}: {r.quellen.map((q, i) => <span key={q.id}>{i > 0 && ' · '}<Link to={`/ablage/start/${q.id}`} className="verweis">{titelOder(q.titel)}</Link> <span className="leise">[{q.nr.join(', ')}]</span></span>)}</p>
          : <p className="leise klein">{t('fragen.keine-quellen')}</p>)}
        {r.ausschnitte && (r.ausschnitte.length
          ? (
            <details className="frag-stellen">
              <summary className="klein">{t('fragen.geschickt', { anzahl: r.ausschnitte.length, mappen: r.mappen ?? 0 })}</summary>
              <ol className="frag-ausschnitte">
                {r.ausschnitte.map((a) => (
                  <li key={a.nr} value={a.nr}>
                    <Link to={`/ablage/start/${a.mappe.id}`} className="verweis">{titelOder(a.mappe.titel)}</Link>
                    <span className="leise klein"> · {a.quelle.art === 'dokument' ? t('fragen.quelle.dokument', { name: a.quelle.name }) : t('fragen.quelle.angaben')}</span>
                    <blockquote className="frag-zitat klein">{a.text}</blockquote>
                  </li>
                ))}
              </ol>
            </details>
          )
          : <p className="leise klein">{t('fragen.geschickt.keine')}</p>)}
      </div>
    </li>
  );
}
