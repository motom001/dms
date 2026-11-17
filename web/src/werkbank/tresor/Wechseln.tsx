import { Link } from '../../ort';
import { betriebApi } from '../../api/betrieb';
import { Erledigt, NOTFALLBLATT_URL, meldeSicherung } from '../Sicherung';
import { heikelHerunterladen } from '../../verwaltungsmodus';
import { Hilfe } from '../../Hilfe';
import { t, tn } from '../../sprache';
import { Knopf } from '../../bausteine';
import type { TresorZustand } from './zustand';

/** Ergebnis eines Schlüsselwechsels. */
export interface Wechsel {
  alt: string;
  neu: string;
  umgeschluesselt: number;
  unlesbar: number;
  alteSicherungen: number;
}
interface WechselZustand {
  wechsel: Wechsel | undefined;
  laeuft: boolean;
  wechseln: () => Promise<void>;
  blattGeladen: boolean;
  setBlattGeladen: (an: boolean) => void;
  gesichert: { ok: boolean; text: string } | undefined;
  setGesichert: (g: { ok: boolean; text: string }) => void;
  eintrag: TresorZustand;
}

/** Schlüssel wechseln (mit Rückfrage), danach die zwei Schritte: Notfallblatt und neue Sicherung. */
export function wechselAbschnitt(w: WechselZustand) {
  const { wechsel, laeuft, wechseln } = w;
  return (
    <section className="blatt" id="wechseln">
      <h2 className="h3">
        {t('werkbank.verschluesselung.schluessel-wechseln-2')} <Hilfe ort="verschluesselung.wechseln" />
      </h2>
      <p className="leise">{t('werkbank.verschluesselung.wenn-der-schluessel-bekannt')}</p>
      {!wechsel && (
        <div className="knoepfe">
          <Knopf
            art="gefahr"
            symbol="neu-laden"
            laeuft={laeuft}
            laeuftText={t('werkbank.verschluesselung.wechsle')}
            onClick={wechseln}
            rueckfrage={{
              titel: t('werkbank.verschluesselung.schluessel-jetzt-wechseln'),
              text: t('werkbank.verschluesselung.alle-gespeicherten-passwoerter-und'),
              ja: t('werkbank.verschluesselung.schluessel-wechseln'),
              bestaetigeMit: 'wechseln',
            }}>
            {t('werkbank.verschluesselung.schluessel-wechseln')}
          </Knopf>
        </div>
      )}
      {wechsel && wechselErgebnis(wechsel, w)}
    </section>
  );
}

function wechselErgebnis(wechsel: Wechsel, w: WechselZustand) {
  const { blattGeladen, setBlattGeladen, gesichert, setGesichert, eintrag } = w;
  return (
    <div className="hinweis gut stapel" role="status">
      <p>
        {tn('werkbank.verschluesselung.werte-wurden-neu-verschluesselt', {
          anzahl: wechsel.umgeschluesselt,
          b: <strong>{t('werkbank.verschluesselung.schluessel-gewechselt')}</strong>,
          span: <span className="mono">{wechsel.alt}</span>,
          span2: <span className="mono">{wechsel.neu}</span>,
          wert: wechsel.unlesbar ? t('werkbank.verschluesselung.waren-schon-vorher-nicht', { unlesbar: wechsel.unlesbar }) : '',
        })}
      </p>
      <p>
        <strong>{t('werkbank.verschluesselung.jetzt-noch-zwei-schritte')}</strong>
      </p>
      <ol className="anleitung">
        <li className={blattGeladen ? 'erledigt' : ''}>
          {blattGeladen && <Erledigt />}
          {tn('werkbank.verschluesselung.das-neue-notfallblatt-herunterladen', {
            link: (
              <a
                className="knopf klein"
                href={NOTFALLBLATT_URL}
                download
                onClick={(e) =>
                  void heikelHerunterladen(e, NOTFALLBLATT_URL, () => {
                    setBlattGeladen(true);
                    setTimeout(() => void eintrag.laden(), 1500);
                    setTimeout(meldeSicherung, 1500);
                  })
                }>
                {t('werkbank.verschluesselung.notfallblatt-herunterladen')}
              </a>
            ),
          })}
        </li>
        <li className={gesichert?.ok ? 'erledigt' : ''}>
          {gesichert?.ok && <Erledigt />}
          {t('werkbank.verschluesselung.eine-neue-sicherung-anlegen')}{' '}
          <Knopf
            groesse="klein"
            gesperrt={gesichert?.ok}
            onClick={() =>
              betriebApi
                .sicherungJetzt()
                .then(() => setGesichert({ ok: true, text: t('werkbank.verschluesselung.sicherung-laeuft-den-stand') }))
                .catch((x) => setGesichert({ ok: false, text: (x as Error).message }))
            }>
            {t('werkbank.verschluesselung.jetzt-sichern')}
          </Knopf>
          {gesichert && (
            <span className={gesichert.ok ? 'leise klein' : 'fehlertext klein'}>
              {' '}
              {gesichert.text}{' '}
              <Link to="/werkbank/sicherung" className="verweis">
                {t('werkbank.verschluesselung.zur-sicherung')}
              </Link>
            </span>
          )}
        </li>
      </ol>
      {wechsel.alteSicherungen > 0 && (
        <p>
          {tn('werkbank.verschluesselung.aeltere-sicherungen-sind-noch', {
            anzahl: wechsel.alteSicherungen,
            link: (
              <Link to="/werkbank/sicherung" className="verweis">
                {t('werkbank.verschluesselung.sicherung')}
              </Link>
            ),
          })}
        </p>
      )}
    </div>
  );
}
