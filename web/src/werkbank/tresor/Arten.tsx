import type { TresorStatus } from '../../api/betrieb';
import { Hilfe } from '../../Hilfe';
import { t } from '../../sprache';
import { gebietsschema } from '../../../../shared/src/sprache';

/** Was verschlüsselt ist (je Art, mit nicht lesbaren). */
export function arten(s: TresorStatus) {
  return (
    <section className="blatt" id="arten">
      <h2 className="h3">
        {t('werkbank.verschluesselung.was-verschluesselt-ist')} <Hilfe ort="verschluesselung.arten" />
      </h2>
      <p className="leise klein">{t('werkbank.verschluesselung.alles-hier-verschluesselt-ablago')}</p>
      <table className="vs-arten">
        <thead>
          <tr>
            <th>{t('werkbank.verschluesselung.art')}</th>
            <th className="vs-zahl">{t('werkbank.verschluesselung.anzahl')}</th>
          </tr>
        </thead>
        <tbody>
          {s.arten!.map((a) => (
            <tr key={a.art}>
              <td>{a.name}</td>
              <td className="vs-zahl">
                {a.anzahl.toLocaleString(gebietsschema())}
                {a.unlesbar > 0 && (
                  <>
                    {' '}
                    <span className="chip schlecht" title={t('werkbank.verschluesselung.mit-dem-vorhandenen-schluessel')}>
                      {t('werkbank.verschluesselung.nicht-lesbar', { unlesbar: a.unlesbar })}
                    </span>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Nicht lesbare oder unverschlüsselte Werte. */
export function betroffen(s: TresorStatus) {
  return (
    <section className="blatt" id="betroffen">
      <h2 className="h3">{t('werkbank.verschluesselung.nicht-lesbare-oder-unverschluesselte')}</h2>
      {!s.betroffen.length ? (
        <p className="leise">{t('werkbank.verschluesselung.keine-alle-gespeicherten-passwoerter')}</p>
      ) : (
        <ul className="liste-einfach">
          {s.betroffen.map((b, i) => (
            <li key={i}>
              <strong>{b.bereich}:</strong> {b.was}
              {b.wo ? <span className="leise"> – {b.wo}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
