import { useState } from 'react';
import { ausprobierTypen, type AblaufProbe, type AblaufvorlageAnsicht } from '../../../../shared/src/ablaufvorlagen';
import { datumDe } from '../../../../shared/src/fristen';
import { automatisierungApi } from '../../api/automatisierung';
import type { Bezuege } from '../../api/mappen';
import { VorlagenDialog } from '../../ablage/Aufgaben';
import { MappenWahl } from '../../ablage/MappeFormular';
import { useDaten } from '../../daten';
import { t } from '../../sprache';
import { Feld, Knopf } from '../../bausteine';
import { titelOder } from '../../seiten';
import { Symbol } from '../../Symbol';

/**
 * Ausprobieren (#1176): Mappe wählen, dann öffnet sich derselbe kleine Dialog wie an der Mappe – mit genau den Fragen
 * der Vorlage, gleicher Vorbelegung, Beschriftung und Reihenfolge –, gekennzeichnet als Probe. Nach dem Bestätigen die
 * Vorschau so, wie die Empfänger es sähen, darunter die Zusammenfassung. Angelegt wird nichts (mit den Rechten des
 * Admins als Person).
 */
export function Ausprobieren({ v }: { v: AblaufvorlageAnsicht }) {
  const d = useDaten();
  // #1179: Mappen aller Typen, für die die Vorlage gilt – nicht nur des ersten.
  const ziele = ausprobierTypen(v, d.typen);
  const typ = ziele[0];
  const [mappe, setMappe] = useState('');
  const [bekannt, setBekannt] = useState<Bezuege>({});
  const [schritt, setSchritt] = useState<'wahl' | 'dialog' | 'ergebnis'>('wahl');
  const [runde, setRunde] = useState(0);
  const [ergebnis, setErgebnis] = useState<{ zeilen: string[]; vorschau: AblaufProbe[] } | null>(null);
  const oeffnen = () => {
    setErgebnis(null);
    setRunde((r) => r + 1);
    setSchritt('dialog');
  };
  const titel = mappe ? titelOder(bekannt[mappe]?.titel) : '';
  return (
    <div className="blatt">
      <h2 className="h3">{t('automatisierung.vorlage.ui.ausprobieren')}</h2>
      <p className="leise klein">{t('automatisierung.vorlage.ui.ausprobieren.text')}</p>
      {typ && (
        <Feld beschriftung={t('automatisierung.vorlage.ui.mappe')} id="vorlage-mappe">
          {(x) => (
            <MappenWahl
              id={x.id}
              ziel={typ}
              ziele={ziele}
              mehrfach={false}
              wert={mappe || undefined}
              bekannt={bekannt}
              ohneAnlegen
              merke={(id, y) => setBekannt((b) => ({ ...b, [id]: y }))}
              setze={(y) => {
                setMappe(typeof y === 'string' ? y : '');
                setSchritt('wahl');
                setErgebnis(null);
              }}
            />
          )}
        </Feld>
      )}
      {schritt === 'wahl' && (
        <div className="knoepfe">
          <Knopf gesperrt={!mappe} onClick={oeffnen}>
            {t('automatisierung.vorlage.ui.ausprobieren.los')}
          </Knopf>
        </div>
      )}
      {schritt === 'dialog' && (
        <VorlagenDialog
          key={runde}
          mappeId={mappe}
          vorlage={v}
          schliessen={() => setSchritt('wahl')}
          probe={{
            anwenden: async (x) => {
              setErgebnis(await automatisierungApi.ablaufvorlageAusprobieren(v.kennung, mappe, x));
              setSchritt('ergebnis');
            },
          }}
        />
      )}
      {schritt === 'ergebnis' && ergebnis && (
        <>
          <ProbeVorschau ergebnis={ergebnis} mappe={titel} />
          <div className="knoepfe">
            <Knopf onClick={oeffnen}>{t('automatisierung.vorlage.ui.ausprobieren.nochmal')}</Knopf>
            <Knopf
              onClick={() => {
                const el = document.getElementById('vorlage-name');
                el?.scrollIntoView({ block: 'center' });
                el?.focus();
              }}>
              {t('automatisierung.vorlage.ui.ausprobieren.anpassen')}
            </Knopf>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Vorschau nach dem Ausprobieren (#1176): je Empfänger, was er sähe – eine Aufgabe (fällig wann) oder eine
 * Benachrichtigung, mit Mappe und Text; darunter als Zusammenfassung die Zeilen von bisher.
 */
function ProbeVorschau({ ergebnis, mappe }: { ergebnis: { zeilen: string[]; vorschau: AblaufProbe[] }; mappe: string }) {
  return (
    <div className="stapel probe-vorschau" role="status">
      <p>
        <strong>{t('automatisierung.vorlage.ui.ausprobieren.ergebnis')}</strong>
      </p>
      {!ergebnis.vorschau.length && <p className="leise">{ergebnis.zeilen[ergebnis.zeilen.length - 1]}</p>}
      <ul className="stapel probe-karten">
        {ergebnis.vorschau.map((x, i) => (
          <li key={i} className="probe-karte">
            <p className="probe-kopf">
              <Symbol name={x.als === 'aufgabe' ? (x.datum ? 'erinnern' : 'aufgabe') : 'info'} />{' '}
              <strong>
                {t(
                  x.als === 'aufgabe'
                    ? 'automatisierung.vorlage.ui.vorschau.aufgabe'
                    : 'automatisierung.vorlage.ui.vorschau.benachrichtigung',
                  { name: x.an },
                )}
              </strong>
              {x.als === 'aufgabe' && (
                <span className="leise">
                  {' '}
                  ·{' '}
                  {x.datum
                    ? t('automatisierung.vorlage.ui.vorschau.faellig', { datum: datumDe(x.datum) })
                    : t('automatisierung.vorlage.ui.vorschau.sofort')}
                </span>
              )}
            </p>
            {mappe && <p className="leise klein">{t('automatisierung.vorlage.ui.vorschau.mappe', { titel: mappe })}</p>}
            <p className="probe-text">{x.text || <span className="leise">{t('automatisierung.vorlage.ui.vorschau.ohne-text')}</span>}</p>
            {x.hinweis && <p className="klein warnung">{x.hinweis}</p>}
          </li>
        ))}
      </ul>
      <details className="probe-zusammenfassung">
        <summary className="klein tippziel">{t('automatisierung.vorlage.ui.vorschau.zusammenfassung')}</summary>
        <ul className="klein">
          {ergebnis.zeilen.map((z, i) => (
            <li key={i}>{z}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
