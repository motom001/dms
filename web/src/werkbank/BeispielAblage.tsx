import { useCallback, useEffect, useState } from 'react';
import type { BeispielAblageStand } from '../../../shared/src/beispielablage';
import { werkbankApi } from '../api/werkbank';
import { Etikett, etikettArt, Knopf, type KnopfErgebnis } from '../bausteine';
import { useDaten } from '../daten';
import { Link } from '../ort';
import { t, tn } from '../sprache';
import { Kopf } from './Kopf';

/**
 * Beispiel-Ablage (#988): eine kleine, stimmige Ablage einer erfundenen Familie zum Umsehen – die Beispiel-Mappen der
 * installierten Pakete, angelegt und wieder entfernt mit je einem Klick. Fehlt ein nötiges Paket, steht das vorher da,
 * mit dem Weg zu den Paketen. Getrennt von den Lasttest-Daten (früher „Demo-Daten“).
 */
export function BeispielAblagePanel() {
  const d = useDaten();
  const [stand, setStand] = useState<BeispielAblageStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try {
      setStand(await werkbankApi.beispielAblage());
      setFehler(undefined);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void laden();
  }, [laden]);
  const fehlt = stand?.noetig.filter((p) => !p.installiert) ?? [];
  const name = (p: { id: string; name: string | null }) => p.name ?? t.frei(`werkbank.beispielablage.paket.${p.id}`);

  async function anlegen(): Promise<KnopfErgebnis> {
    const r = await werkbankApi.beispielAblageAnlegen();
    await laden();
    await d.neuLaden();
    if (r.fehler.length)
      return {
        art: 'warn',
        text: t('werkbank.beispielablage.angelegt.teils', {
          anzahl: r.angelegt,
          fehler: r.fehler.map((f) => `${f.name}: ${f.meldung}`).join(' · '),
        }),
      };
    return { art: 'gut', text: t('werkbank.beispielablage.angelegt', { anzahl: r.angelegt }) };
  }
  async function entfernen(): Promise<KnopfErgebnis> {
    const r = await werkbankApi.beispielAblageEntfernen();
    await laden();
    await d.neuLaden();
    const text = t('werkbank.beispielablage.entfernt', { anzahl: r.entfernt });
    if (!r.behalten.length) return { art: 'gut', text };
    return {
      art: 'info',
      text: `${text} ${t('werkbank.beispielablage.behalten', { anzahl: r.behalten.length, titel: r.behalten.map((b) => b.titel).join(', ') })}`,
    };
  }

  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.bereich.beispielablage.name')} hilfe="werkbank.beispielablage">
        <p className="leise">{t('werkbank.beispielablage.text')}</p>
      </Kopf>
      {fehler && (
        <div className="hinweis schlecht">
          <p>{fehler}</p>
        </div>
      )}
      {!stand ? (
        !fehler && <p className="leise">{t('werkbank.beispielablage.lade')}</p>
      ) : (
        <>
          <section className="blatt stapel" aria-labelledby="beispielablage-anlegen">
            <h2 className="h3" id="beispielablage-anlegen">
              {t('werkbank.beispielablage.anlegen.titel')}
            </h2>
            <p>{t('werkbank.beispielablage.anlegen.text')}</p>
            <ul className="stapel">
              {stand.noetig.map((p) => (
                <li key={p.id}>
                  {name(p)}{' '}
                  <Etikett art={etikettArt(p.installiert ? 'gut' : 'warn')}>
                    {p.installiert ? t('werkbank.beispielablage.installiert') : t('werkbank.beispielablage.fehlt')}
                  </Etikett>
                </li>
              ))}
            </ul>
            {fehlt.length > 0 && (
              <div className="hinweis warn">
                <p>
                  {tn('werkbank.beispielablage.fehlt.text', {
                    pakete: fehlt.map(name).join(', '),
                    link: (
                      <Link to="/werkbank/pakete" className="verweis">
                        {t('werkbank.bereich.pakete.name')}
                      </Link>
                    ),
                  })}
                </p>
              </div>
            )}
            <div className="knoepfe">
              <Knopf art="haupt" gesperrt={fehlt.length ? t('werkbank.beispielablage.fehlt.kurz') : false} onClick={anlegen}>
                {t('werkbank.beispielablage.anlegen')}
              </Knopf>
            </div>
          </section>
          {stand.angelegt > 0 && (
            <section className="blatt stapel" aria-labelledby="beispielablage-da">
              <h2 className="h3" id="beispielablage-da">
                {t('werkbank.beispielablage.da.titel')} <Etikett>{t('werkbank.beispielablage.chip')}</Etikett>
              </h2>
              <p>{t('werkbank.beispielablage.da.text', { anzahl: stand.angelegt })}</p>
              <ul className="stapel">
                {stand.pakete.map((p) => (
                  <li key={p.id}>{t('werkbank.beispielablage.da.paket', { name: p.name, anzahl: p.angelegt })}</li>
                ))}
              </ul>
              <div className="knoepfe">
                <Knopf
                  art="gefahr"
                  symbol="geloescht"
                  onClick={entfernen}
                  rueckfrage={{
                    titel: t('werkbank.beispielablage.entfernen.frage'),
                    text: t('werkbank.beispielablage.entfernen.rueckfrage'),
                    ja: t('werkbank.beispielablage.entfernen'),
                  }}>
                  {t('werkbank.beispielablage.entfernen')}
                </Knopf>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
