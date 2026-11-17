import { Bereich, Knopf, type Klappe } from '../../bausteine';
import { useState } from 'react';
import { kurz, RECHTE, RECHTE_LISTE, type Recht, type Regelwerk } from '../../../../shared/src/rechte';
import { werkbankApi, type Testlauf } from '../../api/werkbank';
import { t, tn } from '../../sprache';
import { Hilfe } from '../../Hilfe';
import { testlaufSchluessel } from '../../../../shared/src/testlauf';
import { TestBenutzerWahl, TestMappeWahl, useTestlauf } from '../TestlaufWahl';
import { gebietsschema } from '../../../../shared/src/sprache';
import { WIRKUNG_TEXT } from './hilfen';

/* ---------- Testlauf (#125) ---------- */

function RechteZeile({ r }: { r: Record<Recht, boolean> }) {
  return (
    <span className="rechtezeile">
      {RECHTE_LISTE.map((k) => (
        <span
          key={k}
          className={`recht ${r[k] ? 'ja' : 'nein'}`}
          title={
            r[k]
              ? t('werkbank.berechtigungen.recht-ja', { recht: RECHTE[k] })
              : t('werkbank.berechtigungen.recht-nein', { recht: RECHTE[k] })
          }>
          {k}
          {r[k] ? WIRKUNG_TEXT.erteilen : WIRKUNG_TEXT.entziehen}
        </span>
      ))}
    </span>
  );
}

/** Testlauf am Mappentyp (#146): mit den Regeln, wie sie gerade im Editor stehen – auch ungespeichert. */
export function TestlaufBlatt({ typId, entwurf, klappe }: { typId: string; entwurf: Regelwerk; klappe: Klappe }) {
  // Vorausgewähltes Konto über ?testkonto=<id> (#710), z. B. aus der Warnung einer Automatisierung (#709).
  const [b, setB] = useState(() => new URLSearchParams(location.search).get('testkonto') ?? '');
  // Vorausgewählte Testmappe über ?testmappe=<id> (#798, aus „Aufgaben bei Personen ohne Leserecht“).
  const [mappe, setMappe] = useState(() => new URLSearchParams(location.search).get('testmappe') ?? '');
  // Das Ergebnis gehört zu (Benutzer, Mappe, Regeln) – wechselt eines davon, ist es sofort weg (#371).
  const stand = JSON.stringify(entwurf);
  const schluessel = testlaufSchluessel({ benutzerId: b, mappeId: mappe, stand });
  const { erg, fehler, los } = useTestlauf<Testlauf>(schluessel, `${b}|${mappe}`, () =>
    werkbankApi.testlauf({ mappeId: mappe, benutzerId: b, berechtigungen: entwurf }),
  );
  return (
    <Bereich
      id="testlauf"
      titel={t('werkbank.berechtigungen.testlauf')}
      hilfe={<Hilfe ort="berechtigungen.testlauf" />}
      klappe={klappe}
      kurz={typId ? t('werkbank.berechtigungen.rechte-eines-benutzers-an') : t('werkbank.berechtigungen.gibt-es-sobald-der')}
      beschreibung={t('werkbank.berechtigungen.welche-rechte-haette-ein')}>
      {!typId ? (
        <p className="leise klein">{t('werkbank.berechtigungen.den-testlauf-gibt-es')}</p>
      ) : (
        <>
          <div className="formular">
            <TestBenutzerWahl id="testlauf-benutzer" wert={b} setze={setB} mitKonten />
            <TestMappeWahl key={typId} id="testlauf-mappe" typId={typId} wert={mappe} setze={setMappe} />
          </div>
          {!schluessel && <p className="leise klein">{t('werkbank.berechtigungen.waehle-benutzer-und-testmappe')}</p>}
          {schluessel && !erg && !fehler && (
            <div className="knoepfe">
              <Knopf art="haupt" onClick={() => los()}>
                {t('werkbank.berechtigungen.pruefen')}
              </Knopf>
            </div>
          )}
          {fehler && <p className="fehlertext klein">{fehler}</p>}
          {erg && ergebnis(erg)}
        </>
      )}
    </Bereich>
  );
}

/** Ergebnis des Testlaufs: wirksame Rechte, Schritt für Schritt je Regel, Leserecht auf Zeit (#798). */
function ergebnis(erg: Testlauf) {
  return (
    <div className="testlauf" role="status">
      {erg.konto && (
        <p className="leise klein">
          {erg.unbestaetigt
            ? t('werkbank.testlauf.konto.unbestaetigt')
            : t('werkbank.testlauf.konto.hinweis', { rolle: t.frei(`werkbank.testlauf.konto.kennzeichen.${erg.konto}`) })}
        </p>
      )}
      {erg.admin ? (
        <p>{tn('werkbank.berechtigungen.ist-administrator-fuer-ihn', { b: <strong>{erg.benutzer.name}</strong> })}</p>
      ) : (
        <>
          <p>
            {tn('werkbank.berechtigungen.an', {
              b: <strong>{erg.benutzer.name}</strong>,
              wert: erg.mappe.titel || t('werkbank.berechtigungen.ohne-titel'),
            })}{' '}
            <RechteZeile r={erg.wirksam} />
          </p>
          <table className="tabelle klein">
            <thead>
              <tr>
                <th>{t('werkbank.berechtigungen.schritt')}</th>
                <th>{t('werkbank.berechtigungen.trifft-zu')}</th>
                <th>{t('werkbank.berechtigungen.setzt')}</th>
                <th>{t('werkbank.berechtigungen.stand-danach')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t('werkbank.berechtigungen.standard-3')}</td>
                <td>–</td>
                <td>–</td>
                <td>
                  <RechteZeile r={erg.grund} />
                </td>
              </tr>
              {erg.spur.map((s) => (
                <tr key={s.regel} className={s.traf ? 'traf' : ''}>
                  <td>
                    {s.name || t('werkbank.berechtigungen.regel')}
                    {s.stopp && s.traf ? t('werkbank.berechtigungen.stopp') : ''}
                  </td>
                  <td>
                    {s.traf === null
                      ? t('werkbank.berechtigungen.nicht-geprueft-stopp-davor')
                      : s.traf
                        ? t('werkbank.berechtigungen.ja')
                        : t('werkbank.berechtigungen.nein', {
                            wert: s.bedingungen.length > 1 ? ` (${s.bedingungen.map((x) => (x ? '✓' : '✗')).join(' ')})` : '',
                          })}
                  </td>
                  <td>{s.traf ? kurz(s.gesetzt) : '–'}</td>
                  <td>
                    <RechteZeile r={s.stand} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Leserecht auf Zeit (#798) mit seinem Grund. */}
          {erg.aufZeit && (
            <p className="hinweis info klein">
              {t(erg.aufZeit.wirkt ? 'werkbank.testlauf.auf-zeit' : 'werkbank.testlauf.auf-zeit.ohnehin', {
                aufgabe: erg.aufZeit.aufgabe,
                seit: new Date(erg.aufZeit.seit).toLocaleDateString(gebietsschema()),
                von: erg.aufZeit.von ?? t('werkbank.ohne-leserecht.unbekannt'),
              })}
            </p>
          )}
          {RECHTE_LISTE.some((k) => erg.rechte[k] !== erg.wirksam[k]) && !erg.aufZeit?.wirkt && (
            <p className="leise klein">{t('werkbank.berechtigungen.wirksam-weicht-ab-ohne')}</p>
          )}
        </>
      )}
    </div>
  );
}
