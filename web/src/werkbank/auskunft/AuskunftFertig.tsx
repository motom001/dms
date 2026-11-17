import { useEffect, useRef } from 'react';
import type { AuskunftStand } from '../../../../shared/src/auskunft';
import { t } from '../../sprache';
import { Knopf } from '../../bausteine';
import { groesse, zeit } from './hilfen';

const anzahl = (n: number, eins: string, viele: string) => `${n} ${n === 1 ? eins : viele}`;

/** Ergebnis von „Auskunft erzeugen“ (#665): Text und Knöpfe untereinander, Fokus darauf, darunter „Neue Auskunft erstellen“. */
export function AuskunftFertig({
  f,
  zustellen,
  nachher,
  neu,
}: {
  f: AuskunftStand;
  zustellen(id: string): void;
  nachher(): Promise<void>;
  neu(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="auskunft-fertig">
      <div ref={ref} tabIndex={-1} className="hinweis gut stapel" role="status">
        <p>
          <strong>{t('werkbank.datenschutz.auskunft-ist-fertig')}</strong> –{' '}
          {anzahl(f.mappen, t('werkbank.datenschutz.mappe'), t('werkbank.datenschutz.mappen-2'))},{' '}
          {anzahl(f.dokumente, t('werkbank.datenschutz.dokument'), t('werkbank.datenschutz.dokumente-2'))} ({groesse(f.bytes)})
          {f.verschluesselt ? t('werkbank.datenschutz.mit-passwort') : ''}.
        </p>
        <p>{t('werkbank.datenschutz.wie-soll-sie-zur')}</p>
        <p className="knoepfe">
          <Knopf art="haupt" onClick={() => zustellen(f.id)}>
            {t('werkbank.datenschutz.zustellen')}
          </Knopf>
          <a className="knopf" href={`/api/werkbank/auskunft/${f.id}/zip`} onClick={() => window.setTimeout(() => void nachher(), 3000)}>
            {t('werkbank.datenschutz.herunterladen')}
          </a>
        </p>
        <p className="leise klein">{t('werkbank.datenschutz.ohne-abruf-link-wird', { zeit: zeit(f.bis) })}</p>
      </div>
      <p>
        <Knopf art="link" groesse="klein" onClick={neu}>
          {t('werkbank.datenschutz.neue-auskunft-erstellen')}
        </Knopf>
      </p>
    </div>
  );
}
