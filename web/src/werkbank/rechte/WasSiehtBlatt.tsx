import { Knopf } from '../../bausteine';
import { useEffect, useState } from 'react';
import { werkbankApi } from '../../api/werkbank';
import { t } from '../../sprache';
import { Hilfe } from '../../Hilfe';
import { Link } from '../../ort';
import { passendesErgebnis, type TestlaufErgebnis } from '../../../../shared/src/testlauf';
import { gebietsschema } from '../../../../shared/src/sprache';

/* ---------- Was sieht Benutzer X? (#125) ---------- */

/* ---------- Was sieht ein Benutzer? (#125, #146: in der Benutzerverwaltung, seit #1000 im Bereich „Rollen und Rechte“) ---------- */

export function WasSiehtBlatt({ benutzerId, admin }: { benutzerId: string; admin: boolean }) {
  // Ergebnis an den Benutzer gebunden (#371): nie die Liste eines anderen Benutzers zeigen.
  const [gespeichert, setErg] = useState<TestlaufErgebnis<Awaited<ReturnType<typeof werkbankApi.wasSieht>>>>();
  const [fehlerZu, setFehler] = useState<TestlaufErgebnis<string>>();
  const erg = passendesErgebnis(gespeichert, benutzerId);
  const fehler = passendesErgebnis(fehlerZu, benutzerId);
  const [an, setAn] = useState(false);
  useEffect(() => {
    if (!an || admin) return;
    let aktuell = true;
    werkbankApi
      .wasSieht(benutzerId)
      .then((x) => aktuell && setErg({ schluessel: benutzerId, wert: x }))
      .catch((x) => aktuell && setFehler({ schluessel: benutzerId, wert: (x as Error).message }));
    return () => {
      aktuell = false;
    };
  }, [an, benutzerId, admin]);
  return (
    <section id="was-sieht" aria-labelledby="was-sieht-titel">
      <h3 className="h4" id="was-sieht-titel">
        {t('werkbank.berechtigungen.was-sieht-dieser-benutzer')} <Hilfe ort="benutzer.wasSieht" />
      </h3>
      {admin ? (
        <p className="leise">{t('konten.verwaltende.berechtigungen.modus')}</p>
      ) : (
        <>
          <p className="leise">{t('werkbank.berechtigungen.je-mappentyp-wie-viele')}</p>
          {!an && (
            <div className="knoepfe">
              <Knopf onClick={() => setAn(true)}>{t('werkbank.berechtigungen.anzeigen')}</Knopf>
            </div>
          )}
          {fehler && <p className="fehlertext klein">{fehler}</p>}
          {an && !erg && !fehler && <p className="leise">{t('werkbank.berechtigungen.lade')}</p>}
          {erg && (
            <div className="tabellenrahmen">
              <table>
                <thead>
                  <tr>
                    <th>{t('werkbank.berechtigungen.mappentyp')}</th>
                    <th>{t('werkbank.berechtigungen.lesbar')}</th>
                    <th>{t('werkbank.berechtigungen.beispiele')}</th>
                  </tr>
                </thead>
                <tbody>
                  {erg.typen.map((eintrag) => (
                    <tr key={eintrag.typId}>
                      <td>
                        <Link to={`/werkbank/typen/${eintrag.typId}#berechtigungen`} className="verweis">
                          {eintrag.name}
                        </Link>
                      </td>
                      <td>
                        {t('werkbank.berechtigungen.von', {
                          lesbar: eintrag.lesbar.toLocaleString(gebietsschema()),
                          gesamt: eintrag.gesamt.toLocaleString(gebietsschema()),
                        })}
                      </td>
                      <td className="klein">
                        {eintrag.beispiele.map((x) => x.titel || t('werkbank.berechtigungen.ohne-titel')).join(' · ') || '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
