import type { Dokument } from '../../../shared/src/model';
import { t } from '../sprache';
import { FeldGruppe } from '../bausteine';

export type Fassung = 'archiv' | 'original';

/** Hat das Dokument eine eigene Archivfassung, die beim Weitergeben zählt (keine E-Rechnung, nicht schon das Original)? */
export const hatArchivfassung = (d: Pick<Dokument, 'archivfassung'>) => {
  const a = d.archivfassung?.stand === 'fertig' ? d.archivfassung.fassung : undefined;
  return !!a && !a.imOriginal && !a.erechnung;
};

/**
 * Archivfassung oder Original beim Weitergeben (#715) – überall gleich: Herunterladen mit Stempel, E-Mail einer
 * oder mehrerer Mappen, Export. Vorgabe wie beim Herunterladen: die Archivfassung, wo es eine gibt. Ohne
 * Archivfassung keine Wahl, nur ein kurzer Hinweis (es geht das Original). `dokumente` fehlt beim Export
 * (die Dokumente sind dort nicht geladen) – dann steht die Regel dabei.
 */
export function FassungWahl({ wert, setze, dokumente, id }: { wert: Fassung; setze(f: Fassung): void; dokumente?: Array<Pick<Dokument, 'archivfassung'>>; id: string }) {
  const mit = dokumente ? dokumente.filter(hatArchivfassung).length : null;
  if (mit === 0) return dokumente!.length ? <p className="leise klein fassungwahl">{t('volltext.archiv.wahl.keine')}</p> : null;
  const hinweis = wert === 'archiv' ? (mit === null ? t('volltext.archiv.wahl.unbekannt') : mit === dokumente!.length ? t('volltext.archiv.wahl.alle') : t('volltext.archiv.wahl.teil', { zahl: mit, gesamt: dokumente!.length })) : undefined;
  return (
    <FeldGruppe beschriftung={t('volltext.archiv.wahl.legende')} hinweis={hinweis} className="fassungwahl">
      <label className="haken" htmlFor={`${id}-archiv`}><input id={`${id}-archiv`} type="radio" name={id} checked={wert === 'archiv'} onChange={() => setze('archiv')} /><span>{t('volltext.archiv.wahl.archiv')}</span></label>
      <label className="haken" htmlFor={`${id}-original`}><input id={`${id}-original`} type="radio" name={id} checked={wert === 'original'} onChange={() => setze('original')} /><span>{t('volltext.archiv.wahl.original')}</span></label>
    </FeldGruppe>
  );
}
