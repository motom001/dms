import { Symbol } from '../../Symbol';
import type { Notfallblattstand } from '../../api/betrieb';
import { t, tn } from '../../sprache';

/** Warum ein heruntergeladenes Notfallblatt nicht mehr gilt (#47 Schlüssel, #815 Notfallcode). */
export function NotfallblattGrund({ n }: { n: Notfallblattstand }) {
  if (n.grund === 'benutzt')
    return (
      <>
        <strong>{t('werkbank.sicherung.notfallblatt.benutzt')}</strong> {t('werkbank.sicherung.notfallblatt.benutzt.text')}
      </>
    );
  if (n.grund === 'ohne-code')
    return (
      <>
        <strong>{t('werkbank.sicherung.notfallblatt.ohne-code')}</strong> {t('werkbank.sicherung.notfallblatt.ohne-code.text')}
      </>
    );
  return (
    <>{tn('werkbank.sicherung.lade-ein-neues-notfallblatt', { b: <strong>{t('werkbank.sicherung.der-schluessel-hat-sich')}</strong> })}</>
  );
}

/** Häkchen vor einem erledigten Schritt (#414). */
export function Erledigt() {
  return (
    <span className="nfb-haken" role="img" aria-label={t('werkbank.sicherung.erledigt')} title={t('werkbank.sicherung.erledigt')}>
      <Symbol name="haken" />{' '}
    </span>
  );
}
