import type { Unscharf } from '../api/mappen';
import { t } from '../sprache';
import { Knopf } from '../bausteine';

/**
 * Unscharfe Suche (#356): Ohne genauen Treffer stehen Treffer mit ähnlichen Schreibweisen da – mit Hinweis und
 * „Meintest du …?“, das mit einem Klick genau das vorgeschlagene Wort sucht.
 */
export function UnscharfHinweis({ u, suchen }: { u: Unscharf; suchen(text: string): void }) {
  return (
    <div className="hinweis info klein unscharf" role="status">
      <p>{t('suche.unscharf.keine', { statt: u.statt })}{u.vorschlag && <>{' '}
        <Knopf art="link" title={t('suche.unscharf.titel', { vorschlag: u.vorschlag })} onClick={() => suchen(u.vorschlag!)}>{t('suche.unscharf.meintest', { vorschlag: u.vorschlag })}</Knopf></>}
      </p>
    </div>
  );
}
