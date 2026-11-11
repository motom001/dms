import { Symbol } from '../Symbol';
import { t } from '../sprache';

/**
 * Namenskonflikte vor „Installieren“ (#1123): je Mappentyp bzw. Ansicht, wer den Namen schon hat (Paket, selbst
 * angelegt, Abhängigkeit, Paket davor im Ablauf). Umbenannt wird oben am Namen; danach verschwindet der Hinweis.
 */
export function NamenskonfliktHinweis({ liste }: { liste: string[] }) {
  return (
    <div className="hinweis warn" role="status">
      <p><Symbol name="warnung" /> <strong>{t('werkbank.pakete.namenskonflikte')}</strong> {t('werkbank.pakete.namenskonflikte-text')}</p>
      <ul>{liste.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );
}
