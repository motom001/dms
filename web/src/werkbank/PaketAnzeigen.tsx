import { Etikett, etikettArt } from '../bausteine';
import { Fragment, useEffect, useState } from 'react';
import { gebietsschema } from '../../../shared/src/sprache';
import type { AnzeigeWert } from '../../../shared/src/paketreiter';
import { paketeApi, type PaketAnzeigenStand } from '../api/pakete';
import { t } from '../sprache';
import { zeit } from './PaketEinstellungen';

/** Ein gemeldeter Wert – gleich bei allen Paketen: Zahl, Anteil mit Balken, Text oder Zustand als Chip. */
function Wert({ w }: { w: AnzeigeWert | null }) {
  const z = (n: number) => n.toLocaleString(gebietsschema());
  if (!w) return <span className="leise">{t('pakete.reiter.anzeige.kein-wert')}</span>;
  if (w.art === 'zahl') return <>{z(w.zahl)}</>;
  if (w.art === 'text') return <>{w.text}</>;
  if (w.art === 'anteil')
    return (
      <>
        <progress className="aehnl-fortschritt" max={Math.max(w.von, 1)} value={Math.min(w.zahl, w.von)} />{' '}
        {t('pakete.reiter.anzeige.anteil', { zahl: z(w.zahl), von: z(w.von) })}
      </>
    );
  const chip = { ok: 'gut', warnung: 'warn', fehler: 'schlecht' }[w.zustand];
  const name = {
    ok: t('pakete.reiter.anzeige.ok'),
    warnung: t('pakete.reiter.anzeige.warnung'),
    fehler: t('pakete.reiter.anzeige.fehler'),
  }[w.zustand];
  return (
    <>
      <Etikett art={etikettArt(chip)}>{name}</Etikett>
      {w.text ? ` ${w.text}` : ''}
    </>
  );
}

/**
 * Übersicht eines Pakets (#996): was das Paket meldet (`code.anzeigen`, Werte aus seinem Speicher) und sein
 * Statusbereich. Nur lesen – das Paket liefert Werte, Ablago stellt sie dar.
 */
export function PaketAnzeigen({ paket }: { paket: string }) {
  const [s, setS] = useState<PaketAnzeigenStand | null>(null);
  useEffect(() => {
    paketeApi.paketAnzeigen(paket).then(setS, () => setS(null));
  }, [paket]);
  if (!s || (!s.anzeigen.length && !s.status)) return null;
  return (
    <section aria-labelledby="paket-anzeigen-titel" data-anker="pakete.anzeigen">
      <h2 className="h3" id="paket-anzeigen-titel">
        {t('pakete.reiter.anzeigen')}
      </h2>
      <p className="leise klein">{t('werkbank.paketeinstellungen.schreibt-nur-das-paket')}</p>
      <dl className="eigenschaften">
        {s.anzeigen.map((a) => (
          <Fragment key={a.schluessel}>
            <dt>{a.name}</dt>
            <dd>
              <Wert w={a.wert} />
              {a.hilfe && (
                <>
                  <br />
                  <small className="leise">{a.hilfe}</small>
                </>
              )}
            </dd>
          </Fragment>
        ))}
        {s.status && (
          <>
            <dt>{t('werkbank.paketeinstellungen.letzter-lauf')}</dt>
            <dd>{zeit(s.status.letzterLauf)}</dd>
          </>
        )}
      </dl>
      {s.status &&
        (s.status.meldungen.length ? (
          <ul className="klein">
            {s.status.meldungen.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        ) : (
          <p className="leise klein">{t('werkbank.paketeinstellungen.noch-keine-meldungen')}</p>
        ))}
    </section>
  );
}
