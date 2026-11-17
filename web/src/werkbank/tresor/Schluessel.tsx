import type { TresorStatus } from '../../api/betrieb';
import { Hilfe } from '../../Hilfe';
import { rueckfrage } from '../../rueckfrage';
import { t, tn } from '../../sprache';
import { gebietsschema } from '../../../../shared/src/sprache';
import { Knopf } from '../../bausteine';

type Meldung = { art: 'gut' | 'schlecht'; text: string };

const TEXT: Record<TresorStatus['zustand'], string> = {
  vorhanden: 'vorhanden',
  fehlt: 'fehlt',
  verloren: 'verloren',
  falsch: t('werkbank.verschluesselung.passt-nicht'),
};

/** Schlüssel (#39): Zustand, Fingerabdruck, Datei, Volume; Hinweise je Zustand; Erzeugen. */
export function schluesselAbschnitt({
  s,
  laeuft,
  meldung,
  erzeugen,
}: {
  s: TresorStatus;
  laeuft: boolean;
  meldung: Meldung | undefined;
  erzeugen: () => Promise<void>;
}) {
  const erzeugbar = s.zustand === 'fehlt' || s.zustand === 'verloren';
  return (
    <section className="blatt" id="schluessel">
      <h2 className="h3">
        {t('werkbank.verschluesselung.schluessel')} <Hilfe ort="verschluesselung.schluessel" />
      </h2>
      <dl className="eigenschaften">
        <dt>{t('werkbank.verschluesselung.zustand')}</dt>
        <dd>
          <span className={`chip ${s.zustand === 'vorhanden' ? 'gut' : 'schlecht'}`}>{TEXT[s.zustand]}</span>
        </dd>
        <dt>{t('werkbank.verschluesselung.fingerabdruck')}</dt>
        <dd className="mono">{s.fingerabdruck ?? '–'}</dd>
        {s.erwartet && s.erwartet !== s.fingerabdruck && (
          <>
            <dt>{t('werkbank.verschluesselung.erwartet')}</dt>
            <dd className="mono">{s.erwartet}</dd>
          </>
        )}
        {s.erstellt && (
          <>
            <dt>{t('werkbank.verschluesselung.erzeugt-am')}</dt>
            <dd>{new Date(s.erstellt).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' })}</dd>
          </>
        )}
        <dt>{t('werkbank.verschluesselung.datei')}</dt>
        <dd className="mono">{s.datei}</dd>
        <dt>{t('werkbank.verschluesselung.eigenes-volume')}</dt>
        <dd>
          {s.eingebunden === null
            ? t('werkbank.verschluesselung.nicht-feststellbar-laeuft-nicht')
            : s.eingebunden
              ? t('werkbank.verschluesselung.ja')
              : t('werkbank.verschluesselung.nein')}
        </dd>
      </dl>

      {schluesselHinweise(s)}
      {meldung && (
        <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">
          {meldung.text}
        </p>
      )}
      {erzeugbar && (
        <div className="knoepfe">
          <Knopf
            art="haupt"
            gesperrt={laeuft}
            onClick={async () => {
              if (
                s.zustand === 'verloren' &&
                !(await rueckfrage({
                  titel: t('werkbank.verschluesselung.neuen-schluessel-erzeugen'),
                  text: t('werkbank.verschluesselung.die-bisher-gespeicherten-passwoerter'),
                  ja: t('werkbank.verschluesselung.neuen-schluessel-erzeugen-2'),
                  gefahr: true,
                }))
              )
                return;
              void erzeugen();
            }}>
            {laeuft
              ? t('werkbank.verschluesselung.erzeuge')
              : s.zustand === 'verloren'
                ? t('werkbank.verschluesselung.neuen-schluessel-erzeugen-2')
                : t('werkbank.verschluesselung.schluessel-erzeugen')}
          </Knopf>
        </div>
      )}
    </section>
  );
}

/** Hinweise je Zustand: fehlt, verloren, passt nicht, kein eigenes Volume; dazu: Schlüsseldatei getrennt sichern. */
function schluesselHinweise(s: TresorStatus) {
  return (
    <>
      {s.zustand === 'fehlt' && (
        <div className="hinweis warn">
          <p>{t('werkbank.verschluesselung.noch-kein-schluessel-solange')}</p>
        </div>
      )}
      {s.zustand === 'verloren' && (
        <div className="hinweis schlecht stapel">
          <p>
            {tn('werkbank.verschluesselung.liegt-die-datei-noch', {
              b: (
                <strong>
                  {tn('werkbank.verschluesselung.der-schluessel-mit-dem', { span: <span className="mono">{s.erwartet}</span> })}
                </strong>
              ),
              span: <span className="mono">{s.datei}</span>,
            })}
          </p>
          <p>{t('werkbank.verschluesselung.erzeugst-du-stattdessen-einen')}</p>
        </div>
      )}
      {s.zustand === 'falsch' && (
        <div className="hinweis schlecht">
          <p>
            {tn('werkbank.verschluesselung.unter-liegt-ein-anderer', {
              span: <span className="mono">{s.datei}</span>,
              span2: <span className="mono">{s.fingerabdruck}</span>,
              span3: <span className="mono">{s.erwartet}</span>,
            })}
          </p>
        </div>
      )}
      {s.eingebunden === false && (
        <div className="hinweis warn">
          <p>
            {tn('werkbank.verschluesselung.der-ordner-ist-kein', {
              span: <span className="mono">{s.datei.replace(/\/[^/]+$/, '')}</span>,
              span2: <span className="mono">{t('werkbank.verschluesselung.volumes')}</span>,
              span3: (
                <span className="mono">
                  {t('werkbank.verschluesselung.volume1-docker-dms-geheim', { replace: s.datei.replace(/\/[^/]+$/, '') })}
                </span>
              ),
            })}
          </p>
        </div>
      )}
      <div className="hinweis info stapel">
        <p>
          {tn('werkbank.verschluesselung.eine-datenbanksicherung-laesst-sich', {
            b: <strong>{t('werkbank.verschluesselung.sichere-die-schluesseldatei-getrennt')}</strong>,
          })}
        </p>
      </div>
    </>
  );
}
