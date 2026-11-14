import { useRef, useSyncExternalStore } from 'react';
import type { FrageAusschnitt, FrageGekuerzt, VerlaufEintrag } from '../../../shared/src/fragen';
import { frageStellen } from '../api';
import { Feld, Knopf } from '../bausteine';
import { Link } from '../ort';
import { titelOder } from '../seiten';
import { t } from '../sprache';

/**
 * „Frag deine Ablage“ (#444): nur, wenn ein Paket mit dem Recht dms:antworten installiert ist. Antwort als Chat, entsteht
 * beim Schreiben; darunter Quellen als Links und aufklappbar genau die Stellen, die an die KI gingen. Die Antwort ist nur
 * Text (kein HTML, keine Links aus der Antwort) – sie kann nichts ändern. Der Chat liegt nur hier im Speicher der Seite:
 * weg beim Neuladen.
 *
 * Seit #1219 der Reiter „Fragen“ im Assistenten unten rechts (web/src/begleiter): oben das Gespräch mit Quellen unter
 * jeder Antwort, darunter das Feld und eine kleine Zeile mit dem KI-Hinweis. Die Eingabe gehört dem Assistenten, damit
 * sie beim Wechsel der Reiter stehen bleibt; das Gespräch bleibt beim Seitenwechsel erhalten (bis zum Neuladen).
 */

interface Runde {
  frage: string;
  ausschnitte?: FrageAusschnitt[];
  mappen?: number;
  teil: string;
  antwort?: string;
  quellen?: Array<{ id: string; typId: string; titel: string; nr: number[] }>;
  /** Vom Paket gekürzt (#564): nur diese Ausschnitte gingen an die KI, frühere Einträge des Chats fielen weg. */
  gekuerzt?: FrageGekuerzt;
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

export function FragAblage({ eingabe, setEingabe, paket }: { eingabe: string; setEingabe(wert: string): void; paket: string | null }) {
  const runden = useSyncExternalStore((h) => { hoerer.add(h); return () => { hoerer.delete(h); }; }, () => chat);
  const abbruch = useRef<AbortController | null>(null);
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
        else if (z.art === 'fertig') aendereLetzte((r) => ({ ...r, antwort: z.text, quellen: z.quellen, ...(z.gekuerzt ? { gekuerzt: z.gekuerzt } : {}), laeuft: false }));
        else aendereLetzte((r) => ({ ...r, fehler: z.text, laeuft: false }));
      }, ab.signal);
      aendereLetzte((r) => (r.laeuft ? { ...r, laeuft: false, fehler: r.antwort ? undefined : t('fragen.abgebrochen') } : r));
    } catch (e) {
      aendereLetzte((r) => ({ ...r, laeuft: false, fehler: (e as Error).name === 'AbortError' ? t('fragen.abgebrochen') : (e as Error).message }));
    } finally { abbruch.current = null; }
  }

  return (
    <div className="frag-fenster">
      {runden.length > 0 ? (
        <ol className="frag-chat" aria-live="polite">
          {runden.map((r, i) => <RundeAnzeige key={i} r={r} />)}
        </ol>
      ) : <p className="leise frag-leer">{t('fragen.leer')}</p>}
      <form className="frag-form" data-kachel="fragen" data-anker="startseite.fragen" onSubmit={(e) => { e.preventDefault(); void fragen(); }}>
        <Feld beschriftung={t('fragen.titel')} beschriftungVerbergen id="frag-feld">
          <textarea className="frag-feld" rows={2} maxLength={1000} value={eingabe} placeholder={t('fragen.platzhalter')}
            onChange={(e) => setEingabe(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void fragen(); } }} />
        </Feld>
        <div className="knoepfe">
          {laeuft
            ? <Knopf onClick={() => abbruch.current?.abort()}>{t('fragen.abbrechen')}</Knopf>
            : <Knopf art="haupt" type="submit" gesperrt={!eingabe.trim()}>{t('fragen.fragen')}</Knopf>}
          {runden.length > 0 && !laeuft && <Knopf art="link" onClick={() => setzeChat([])}>{t('fragen.neu')}</Knopf>}
        </div>
        <p className="leise klein">{t('fragen.hinweis', { paket: paket ?? '' })} {t('fragen.verlauf')}</p>
      </form>
    </div>
  );
}

function RundeAnzeige({ r }: { r: Runde }) {
  const text = r.antwort ?? r.teil;
  // Gekürzt (#564): nur die Ausschnitte zeigen, die wirklich an die KI gingen – und sagen, dass es weniger waren.
  const geschickt = r.ausschnitte && r.gekuerzt ? r.ausschnitte.filter((a) => r.gekuerzt!.geschickt.includes(a.nr)) : r.ausschnitte;
  return (
    <li className="frag-runde">
      <p className="frag-frage"><span className="sr">{t('fragen.du')}: </span>{r.frage}</p>
      <div className="frag-antwort">
        <span className="sr">{t('fragen.antwort')}: </span>
        {text ? <p className="frag-text">{text}</p> : r.laeuft ? <p className="leise klein">{r.ausschnitte ? t('fragen.laeuft') : t('fragen.sucht')}</p> : null}
        {r.fehler && <p className="fehlertext" role="alert">{r.fehler}</p>}
        {r.quellen && (r.quellen.length
          ? <p className="klein frag-quellen">{t('fragen.quellen')}: {r.quellen.map((q, i) => <span key={q.id}>{i > 0 && ' · '}<Link to={`/ablage/start/${q.id}`} className="verweis">{titelOder(q.titel)}</Link> <span className="leise">[{q.nr.join(', ')}]</span></span>)}</p>
          : <p className="leise klein">{t('fragen.keine-quellen')}</p>)}
        {r.ausschnitte && (r.ausschnitte.length
          ? (
            <details className="frag-stellen">
              <summary className="klein">{r.gekuerzt
                ? t('fragen.geschickt.gekuerzt', { geschickt: geschickt!.length, anzahl: r.ausschnitte.length })
                : t('fragen.geschickt', { anzahl: r.ausschnitte.length, mappen: r.mappen ?? 0 })}</summary>
              <ol className="frag-ausschnitte">
                {geschickt!.map((a) => (
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
        {r.gekuerzt && r.gekuerzt.verlauf > 0 && <p className="leise klein">{t('fragen.verlauf.gekuerzt', { anzahl: r.gekuerzt.verlauf })}</p>}
      </div>
    </li>
  );
}
