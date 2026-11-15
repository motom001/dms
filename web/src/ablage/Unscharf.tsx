import type { Unscharf } from '../api/mappen';
import { t } from '../sprache';
import { Knopf } from '../bausteine';

/**
 * Unscharfe Suche (#356): Ohne genauen Treffer stehen Treffer mit ähnlichen Schreibweisen da – mit Hinweis und
 * „Meintest du …?“, das mit einem Klick genau das vorgeschlagene Wort sucht. Seit #1191 auf Wunsch auch bei Treffern
 * (Werkbank → Suche und Volltext): Dann bleiben die genauen Treffer, und der Hinweis sagt, wie viele der Vorschlag findet.
 */
export function UnscharfHinweis({ u, suchen }: { u: Unscharf; suchen(text: string): void }) {
  const vorschlag = u.vorschlag && (
    <Knopf art="link" title={t('suche.unscharf.titel', { vorschlag: u.vorschlag })} onClick={() => suchen(u.vorschlag!)}>{t('suche.unscharf.meintest', { vorschlag: u.vorschlag })}</Knopf>
  );
  if (u.treffer !== undefined) return (
    <div className="hinweis info klein unscharf" role="status">
      <p>{vorschlag} {t('suche.unscharf.mehr', { anzahl: u.treffer })}</p>
    </div>
  );
  return (
    <div className="hinweis info klein unscharf" role="status">
      <p>{t('suche.unscharf.keine', { statt: u.statt })}{vorschlag && <>{' '}{vorschlag}</>}</p>
    </div>
  );
}
