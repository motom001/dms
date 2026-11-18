import type { ReactNode } from 'react';
import { Symbol } from '../../Symbol';
import { erwaehnungText } from '../../../../shared/src/auskunft';
import { kinderVon, type BaumKnoten } from '../../../../shared/src/baum';
import { datumText } from '../../../../shared/src/archiv';
import { t, tn } from '../../sprache';
import { titelOder } from '../../seiten';
import { Etikett, HakenFeld } from '../../bausteine';
import type { ErteilenZustand } from './erteilen-zustand';
import type { erteilenAktionen } from './erteilen-zustand';
import { MappeEintrag } from './MappeEintrag';

/**
 * Baum der gesammelten Mappen (#396): zugehörige Mappen mit ihrem Inhalt, Bezug-Mappen (#472) nur als Erwähnung,
 * bewusst ganz aufnehmbar. Rekursiv als Funktion aufgerufen – der Baum entsteht genau so wie vorher.
 */
export function zeigeKnoten(k: BaumKnoten, x: ErteilenZustand, a: ReturnType<typeof erteilenAktionen>): ReactNode {
  const { wahl, setWahl, inhalte } = x;
  const { schalte, ganz } = a;
  const vorschau = x.vorschau;
  return k.nurBezug && k.ueber ? (
    <li key={k.id}>
      <div className={`auskunft-mappe ${wahl.erwaehnungen.has(k.id) || wahl.mappen.has(k.id) ? '' : 'aus'}`}>
        <HakenFeld
          beschriftung={
            <>
              {erwaehnungText({ typ: k.typ, titel: titelOder(k.titel), feld: k.ueber.feld, richtung: k.ueber.richtung })}{' '}
              <Etikett title={t('werkbank.datenschutz.nur-ueber-einen-verweis')}>{t('werkbank.datenschutz.bezug')}</Etikett>
            </>
          }
          hinweis={
            <a href={`/ablage/${k.typId}/${k.id}`} className="verweis klein" target="_blank" rel="noreferrer">
              {t('werkbank.datenschutz.oeffnen')}
            </a>
          }>
          <input
            type="checkbox"
            checked={wahl.erwaehnungen.has(k.id) || wahl.mappen.has(k.id)}
            disabled={wahl.mappen.has(k.id)}
            onChange={(e) => schalte('erwaehnungen', k.id, e.target.checked)}
          />
        </HakenFeld>
        <HakenFeld
          beschriftung={t('werkbank.datenschutz.ganz-aufnehmen')}
          hinweis={t('werkbank.datenschutz.mit-dokumenten-notizen-und')}
          className="klein auskunft-ganz">
          <input type="checkbox" checked={wahl.mappen.has(k.id)} onChange={(e) => ganz(k.id, e.target.checked)} />
        </HakenFeld>
        {wahl.mappen.has(k.id) && (
          <MappeEintrag
            id={k.id}
            titel={k.titel}
            typ={k.typ}
            typId={k.typId}
            inhalt={inhalte[k.id]}
            wahl={wahl}
            schalte={schalte}
            nurInhalt
            setGrund={(id, g) => setWahl((w) => ({ ...w, gruende: { ...w.gruende, [id]: g } }))}
          />
        )}
      </div>
    </li>
  ) : (
    <li key={k.id}>
      <MappeEintrag
        id={k.id}
        titel={k.titel}
        typ={k.typ}
        typId={k.typId}
        inhalt={inhalte[k.id]}
        wahl={wahl}
        schalte={schalte}
        setGrund={(id, g) => setWahl((w) => ({ ...w, gruende: { ...w.gruende, [id]: g } }))}
        info={
          <>
            {k.ueber && (
              <span className="leise klein">
                {' '}
                ·{' '}
                {k.ueber.richtung === 'verwiesenVon'
                  ? t('werkbank.datenschutz.verweist-ueber-darauf', { feld: k.ueber.feld })
                  : t('werkbank.datenschutz.ueber', { feld: k.ueber.feld })}
              </span>
            )}
            {k.auchUeber.length > 0 && <Etikett title={t('werkbank.datenschutz.diese-mappe-ist-auf')}>↻ {k.auchUeber.length}</Etikett>}
            {k.gesperrt && k.aufbewahrenBis && (
              <Etikett title={t('werkbank.datenschutz.archivmodus-aufbewahrungsfrist')}>
                {tn('werkbank.datenschutz.bis', { symbol: <Symbol name="schloss" />, datumText: datumText(k.aufbewahrenBis) })}
              </Etikett>
            )}
            {/* Die Frist läuft noch nicht (#1051): gesperrt ohne Datum. */}
            {k.gesperrt && !k.aufbewahrenBis && (
              <Etikett title={t('werkbank.datenschutz.archivmodus-aufbewahrungsfrist')}>
                {tn('werkbank.datenschutz.frist-offen', { symbol: <Symbol name="schloss" /> })}
              </Etikett>
            )}
          </>
        }
      />
      {kinderVon(vorschau!.baum, k.id).length > 0 && (
        <ul className="auskunft-baum">{kinderVon(vorschau!.baum, k.id).map((kind) => zeigeKnoten(kind, x, a))}</ul>
      )}
    </li>
  );
}
