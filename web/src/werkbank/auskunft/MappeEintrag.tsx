import type { ReactNode } from 'react';
import { Symbol } from '../../Symbol';
import type { AuskunftMappe } from '../../../../shared/src/auskunft';
import { t, tn } from '../../sprache';
import { titelOder } from '../../seiten';
import { Etikett, Feld, HakenFeld } from '../../bausteine';
import { groesse, zeit } from './hilfen';
import type { WahlArt } from './erteilen-zustand';
import type { Wahl } from './wahl';

type Schalte = (art: WahlArt, id: string, an: boolean) => void;

/** Eine Mappe im Baum: Haken für die Mappe, darunter Dokumente, Notizen (abgewählt mit Grund) und Historie. */
export function MappeEintrag({
  id,
  titel,
  typ,
  typId,
  inhalt,
  wahl,
  schalte,
  setGrund,
  info,
  nurInhalt,
}: {
  id: string;
  titel: string;
  typ: string;
  typId: string;
  inhalt?: AuskunftMappe;
  wahl: Wahl;
  info?: ReactNode;
  nurInhalt?: boolean;
  schalte: Schalte;
  setGrund(id: string, g: string): void;
}) {
  const an = wahl.mappen.has(id);
  return (
    <div className={`auskunft-mappe ${an ? '' : 'aus'}`}>
      {!nurInhalt && (
        <HakenFeld
          beschriftung={
            <>
              {titelOder(titel)} <span className="leise klein">{typ}</span>
              {info}
            </>
          }
          hinweis={
            <a href={`/ablage/${typId}/${id}`} className="verweis klein" target="_blank" rel="noreferrer">
              {t('werkbank.datenschutz.oeffnen')}
            </a>
          }>
          <input type="checkbox" checked={an} onChange={(e) => schalte('mappen', id, e.target.checked)} />
        </HakenFeld>
      )}
      {an && inhalt && (
        <div className="auskunft-inhalt">
          {inhalt.dritte.length > 0 && (
            <p className="klein auskunft-dritte">
              {t('werkbank.datenschutz.daten-dritter-haengt-auch', {
                dritte: inhalt.dritte.slice(0, 4).join(', '),
                wert: inhalt.dritte.length > 4 ? ' …' : '',
              })}
            </p>
          )}
          {inhalt.dokumente.map((x) => dokumentHaken(x, { id, typId, wahl, schalte }))}
          {inhalt.notizen.map((n) => notizZeile(n, { wahl, schalte, setGrund }))}
          {inhalt.historie > 0 && (
            <HakenFeld
              className="klein"
              beschriftung={tn('werkbank.datenschutz.historie-eintraege', { anzahl: inhalt.historie, symbol: <Symbol name="historie" /> })}>
              <input type="checkbox" checked={wahl.historie.has(id)} onChange={(e) => schalte('historie', id, e.target.checked)} />
            </HakenFeld>
          )}
          {inhalt.ohneFelder.length > 0 && (
            <p className="leise klein">{t('werkbank.datenschutz.nie-enthalten', { ohneFelder: inhalt.ohneFelder.join(', ') })}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Ein Dokument: Haken, Name, Register, Größe; geschwärzt oder mit Weg zum Schwärzen. */
function dokumentHaken(
  x: AuskunftMappe['dokumente'][number],
  { id, typId, wahl, schalte }: { id: string; typId: string; wahl: Wahl; schalte: Schalte },
) {
  return (
    <HakenFeld
      key={x.id}
      className="klein"
      beschriftung={
        <>
          <Symbol name="dokument" /> {x.name}{' '}
          <span className="leise">
            {x.register} · {groesse(x.groesse)}
          </span>
          {x.geschwaerzt && <Etikett>{t('werkbank.datenschutz.geschwaerzt')}</Etikett>}
          {x.geschwaerzteFassung && <span className="leise"> {t('werkbank.datenschutz.geschwaerzte-fassung-vorhanden')}</span>}
        </>
      }
      hinweis={
        !x.geschwaerzt &&
        x.schwaerzbar && (
          <a
            href={`/ablage/${typId}/${id}`}
            className="verweis"
            target="_blank"
            rel="noreferrer"
            title={t('werkbank.datenschutz.mappe-in-einem-neuen')}>
            {t('werkbank.datenschutz.schwaerzen')}
          </a>
        )
      }>
      <input type="checkbox" checked={wahl.dokumente.has(x.id)} onChange={(e) => schalte('dokumente', x.id, e.target.checked)} />
    </HakenFeld>
  );
}

/** Eine Notiz: Haken; abgewählt braucht sie einen Grund. */
function notizZeile(
  n: AuskunftMappe['notizen'][number],
  { wahl, schalte, setGrund }: { wahl: Wahl; schalte: Schalte; setGrund(id: string, g: string): void },
) {
  return (
    <div key={n.id}>
      <HakenFeld
        className="klein"
        beschriftung={
          <>
            <Symbol name="notiz" /> {n.text.length > 120 ? `${n.text.slice(0, 120)} …` : n.text}{' '}
            <span className="leise">{zeit(n.erstellt)}</span>
          </>
        }>
        <input type="checkbox" checked={wahl.notizen.has(n.id)} onChange={(e) => schalte('notizen', n.id, e.target.checked)} />
      </HakenFeld>
      {!wahl.notizen.has(n.id) && (
        <Feld
          beschriftung={t('werkbank.datenschutz.warum-zurueckhalten')}
          hinweis={t('werkbank.datenschutz.pflicht-z-b-interne')}
          className="einzug klein">
          <input value={wahl.gruende[n.id] ?? ''} maxLength={500} onChange={(e) => setGrund(n.id, e.target.value)} />
        </Feld>
      )}
    </div>
  );
}
