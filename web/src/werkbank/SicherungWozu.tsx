import { useState } from 'react';
import { betriebApi, type SicherungEintrag } from '../api/betrieb';
import { Feld, Knopf } from '../bausteine';
import { t } from '../sprache';
import { artText } from './sicherungFormat';

/** Höchstens so viele Zeichen hat „Wozu?“ (wie auf dem Server, sicherung-hilfen.ts). */
export const WOZU_MAX = 80;

/**
 * Art einer Sicherung in der Liste mit „Wozu?“ (#1529): „von Hand“ und darunter der Name, automatische mit
 * „automatisch“ (nachgeholte mit „automatisch · nachgeholt“, #1531). „Wozu? ändern“ öffnet das Feld an derselben Stelle.
 */
export function ArtMitWozu({ x, gesperrt, laden }: { x: SicherungEintrag; gesperrt: boolean; laden(): Promise<void> }) {
  const meta = x.meta!;
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState(meta.wozu ?? '');
  const [fehler, setFehler] = useState<string>();
  const [sendet, setSendet] = useState(false);
  if (!offen)
    return (
      <span className="stapel">
        <span>{artText(meta)}</span>
        {meta.wozu && <span className="klein">„{meta.wozu}“</span>}
        {/* Nur Sicherungen von Hand haben ein „Wozu?“ – automatische zeigen „automatisch“. */}
        {meta.art === 'manuell' && (
          <span>
            <Knopf
              groesse="klein"
              gesperrt={gesperrt}
              onClick={() => {
                setText(meta.wozu ?? '');
                setFehler(undefined);
                setOffen(true);
              }}>
              {t('werkbank.sicherung.wozu.aendern')}
            </Knopf>
          </span>
        )}
      </span>
    );
  return (
    <form
      className="stapel"
      onSubmit={(e) => {
        e.preventDefault();
        setSendet(true);
        setFehler(undefined);
        betriebApi
          .sicherungWozu(x.name, text)
          .then(async () => {
            setOffen(false);
            await laden();
          })
          .catch((f: Error) => setFehler(f.message))
          .finally(() => setSendet(false));
      }}>
      <Feld beschriftung={t('werkbank.sicherung.wozu')} hinweis={t('werkbank.sicherung.wozu.leer')}>
        <input value={text} maxLength={WOZU_MAX} autoFocus onChange={(e) => setText(e.target.value)} />
      </Feld>
      {fehler && (
        <p className="fehlertext klein" role="alert">
          {fehler}
        </p>
      )}
      <div className="knoepfe">
        <Knopf art="haupt" type="submit" groesse="klein" laeuft={sendet}>
          {t('werkbank.sicherung.wozu.speichern')}
        </Knopf>
        <Knopf groesse="klein" onClick={() => setOffen(false)}>
          {t('werkbank.sicherung.wozu.abbrechen')}
        </Knopf>
      </div>
    </form>
  );
}
