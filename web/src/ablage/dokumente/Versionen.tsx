/** Versionen eines Dokuments (#194, #1279). */
import { useEffect, useState } from 'react';
import { HERKUNFT, type Dokument, type DokumentVersion, type Herkunft } from '../../../../shared/src/model';
import { kannStempeln } from '../../../../shared/src/stempel';
import { t, tn } from '../../sprache';
import { dokumenteApi, versionUrl } from '../../api/dokumente';
import { Person } from '../../Person';
import { Hilfe } from '../../Hilfe';
import { Symbol } from '../../Symbol';
import { rueckfrage } from '../../rueckfrage';
import { Knopf, KnopfLink } from '../../bausteine';
import { groesse, zeit } from './hilfen';

/** Alle Versionen eines Dokuments (#194): ansehen, herunterladen, zurückholen. */
export function Versionen({
  d,
  zurueck,
  neuLaden,
  mitStempel,
  mitnehmen = true,
}: {
  d: Dokument;
  zurueck: boolean;
  neuLaden?: () => Promise<void>;
  /** Pflicht-Stempel (#394): Herunterladen nur über den Dialog. */ mitStempel?: (nummer: number) => void;
  /** Exportrecht (#723): ohne E nur ansehen. */ mitnehmen?: boolean;
}) {
  const [liste, setListe] = useState<DokumentVersion[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  useEffect(() => {
    dokumenteApi
      .versionen(d.id)
      .then((r) => setListe(r.aeltere))
      .catch((e) => setFehler((e as Error).message));
  }, [d.id, d.version]);
  async function hole(n: number) {
    setFehler(undefined);
    try {
      await dokumenteApi.zurueckholen(d.id, n);
      await neuLaden?.();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }
  const herkunft = (h: Herkunft | null | undefined) => (h ? (HERKUNFT[h] ?? h) : 'hochgeladen');
  return (
    <div className="versionen">
      {fehler && <p className="fehlertext">{fehler}</p>}
      <table className="tabelle klein">
        <thead>
          <tr>
            <th>{t('ablage.dokumente.version-3')}</th>
            <th>{t('ablage.dokumente.datei')}</th>
            <th>{t('ablage.dokumente.gespeichert-2')}</th>
            <th>{t('ablage.dokumente.von')}</th>
            <th>{t('ablage.dokumente.herkunft')}</th>
            <th>{t('ablage.dokumente.groesse')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{tn('ablage.dokumente.aktuell', { b: <strong>{d.version ?? 1}</strong> })}</td>
            <td>{d.name}</td>
            <td>{zeit(d.erstellt)}</td>
            <td>
              <Person id={d.erstelltVon} />
            </td>
            <td>{herkunft(d.herkunft)}</td>
            <td>{groesse(d.groesse)}</td>
            <td />
          </tr>
          {liste === null ? (
            <tr>
              <td colSpan={7} className="leise">
                {t('ablage.dokumente.lade')}
              </td>
            </tr>
          ) : (
            liste.map((v) => (
              <tr key={v.nummer}>
                <td>{v.nummer}</td>
                <td>{v.name}</td>
                <td>{zeit(v.erstellt)}</td>
                <td>
                  <Person id={v.erstelltVon} />
                </td>
                <td>{herkunft(v.herkunft)}</td>
                <td>{groesse(v.groesse)}</td>
                <td className="zeilenaktionen">
                  {v.anzeigbar && (
                    <a
                      className="symbolverweis"
                      href={versionUrl(d.id, v.nummer)}
                      target="_blank"
                      rel="noreferrer"
                      title={t('ablage.dokumente.ansehen')}
                      aria-label={t('ablage.dokumente.version-ansehen', { nummer: v.nummer })}>
                      <Symbol name="extern" />
                    </a>
                  )}
                  {!mitnehmen ? null : mitStempel ? (
                    kannStempeln(v.mime) && (
                      <Knopf onClick={() => mitStempel(v.nummer)}>{t('ablage.dokumente.mit-stempel-herunterladen')}</Knopf>
                    )
                  ) : (
                    <KnopfLink href={versionUrl(d.id, v.nummer, true)} art="link">
                      {t('ablage.dokumente.herunterladen')}
                    </KnopfLink>
                  )}
                  {zurueck && (
                    <Knopf
                      onClick={async () => {
                        if (
                          await rueckfrage({
                            titel: t('ablage.dokumente.version-zurueckholen', { nummer: v.nummer }),
                            text: t('ablage.dokumente.sie-wird-zur-neuen', { wert: (d.version ?? 1) + 1 }),
                            ja: t('ablage.dokumente.zurueckholen'),
                          })
                        )
                          void hole(v.nummer);
                      }}>
                      {t('ablage.dokumente.zurueckholen')}
                    </Knopf>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {liste !== null && !liste.length && <p className="leise klein">{t('ablage.dokumente.keine-aelteren-versionen')}</p>}
      <p className="leise klein">
        <Hilfe ort="dokumente.versionen" />
      </p>
    </div>
  );
}
