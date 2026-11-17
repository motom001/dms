import type { ReactNode } from 'react';
import { ErgebnisBlock, Feld, HakenFeld, Knopf, Schalter } from '../../bausteine';
import type { MailAnbieter } from '../../../../shared/src/mailanbieter';
import type { BetriebAnsicht } from '../../api/betrieb';
import type { Verbindung } from '../../api/einrichtung';
import { Link } from '../../ort';
import { Symbol } from '../../Symbol';
import { t } from '../../sprache';
import { portFuer, QUELLE, type Feld as MailFeld } from './hilfen';
import type { mailAktionen, mailVorschlaege, MailZustand } from './mail-zustand';

/** Was die Abschnitte des Formulars brauchen. */
export type MailKontext = MailZustand &
  ReturnType<typeof mailVorschlaege> & {
    s: BetriebAnsicht;
    a: ReturnType<typeof mailAktionen>;
    vor: (f: MailFeld) => ReactNode;
    ergebnis: ReactNode;
    anbieter: MailAnbieter | null;
    oauthAnbieter: 'microsoft' | 'google' | undefined;
    oauth: boolean;
    domain: string | null | undefined;
  };

/** Ein/aus, Adresse, Passwort, Anmeldung und „Verbindung prüfen“ mit Ergebnis. */
export function zugang(k: MailKontext) {
  const { assistent, m, setze, vor, adresse, setAdresse, s, loeschen, setLoeschen, oauth, oauthAnbieter } = k;
  const { finden, anmeldungWaehlen } = k.a;
  return (
    <>
      {!assistent && (
        <Schalter
          an={m.aktiv}
          setze={(an) => setze({ aktiv: an })}
          beschriftung={t('werkbank.mail.schalter')}
          hinweis={vor('aktiv') || undefined}
        />
      )}
      <div className="raster">
        <Feld beschriftung={t('werkbank.mail.adresse')} hinweis={t('werkbank.mail.adresse.hilfe')}>
          <input
            id="mail-adresse"
            type="email"
            value={adresse}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setAdresse(e.target.value)}
            onBlur={() => void finden()}
          />
        </Feld>
        {!oauth && (
          <Feld
            beschriftung={t('werkbank.mail.passwort')}
            hinweis={s.mail.passwortGesetzt && !loeschen ? t('werkbank.mail.passwort.gesetzt') : t('werkbank.mail.passwort.app')}>
            <input
              id="mail-passwort"
              type="password"
              value={m.passwort}
              disabled={!s.passwoerterMoeglich}
              onChange={(e) => {
                setze({ passwort: e.target.value });
                setLoeschen(false);
              }}
              autoComplete="new-password"
              placeholder={s.mail.passwortGesetzt && !loeschen ? '••••••••' : ''}
            />
          </Feld>
        )}
        {oauthAnbieter && (
          <Feld
            beschriftung={t('werkbank.mail.anmeldung')}
            hilfe={assistent ? undefined : 'werkbank.mail.oauth'}
            hinweis={assistent ? t('werkbank.mail.anmeldung.spaeter') : undefined}>
            <select
              id="mail-anmeldung"
              value={m.anmeldung}
              disabled={assistent}
              onChange={(e) => anmeldungWaehlen(e.target.value as 'passwort' | 'oauth')}>
              <option value="passwort">{t('werkbank.mail.anmeldung.passwort')}</option>
              <option value="oauth">
                {oauthAnbieter === 'microsoft' ? t('werkbank.mail.anmeldung.microsoft') : t('werkbank.mail.anmeldung.google')}
              </option>
            </select>
          </Feld>
        )}
      </div>
      {pruefen(k)}
    </>
  );
}

/** „Verbindung prüfen“ (nicht im Assistenten), Suche läuft, Ergebnis direkt darunter (#986). */
function pruefen(k: MailKontext) {
  const { assistent, laeuft, m, sucht, probe, ergebnis } = k;
  const { teste } = k.a;
  return (
    <>
      <div className="knoepfe">
        {/* Prüfen und Testmail brauchen eine Anmeldung – im Assistenten erst danach in der Werkbank (#803). */}
        {!assistent && (
          <Knopf
            gesperrt={(!!laeuft && laeuft !== 'pruefen') || !m.host}
            laeuft={laeuft === 'pruefen'}
            laeuftText={t('werkbank.mail.pruefe')}
            onClick={() => teste('pruefen')}>
            {t('werkbank.mail.pruefen')}
          </Knopf>
        )}
        {sucht && (
          <span className="leise klein" role="status">
            {t('werkbank.mail.sucht')}
          </span>
        )}
      </div>
      {/* Ergebnis direkt unter dem Knopf (#986), angesagt und bei Bedarf ins Bild gerollt. */}
      {!assistent && <ErgebnisBlock anlass={probe?.was === 'pruefen' && probe}>{probe?.was === 'pruefen' && ergebnis}</ErgebnisBlock>}
    </>
  );
}

/** Was der Assistent vorschlägt – alles sichtbar, nichts Verstecktes. */
export function vorschlag(k: MailKontext) {
  const { m, anbieter, s, vor, suche, vorgeschlagen, sucht, domain } = k;
  const { finden } = k.a;
  return (
    <div className="hinweis info mail-vorschlag">
      {m.host ? (
        <p>
          <strong>{anbieter ? t('werkbank.mail.ueber', { anbieter: anbieter.name }) : t('werkbank.mail.ueber-server')}</strong>{' '}
          <span className="mono">
            {m.host}:{m.port}
          </span>{' '}
          ({s.verbindungen[m.verbindung]}){vor('host')}
          {suche?.fund && vorgeschlagen.has('host') && (
            <>
              {' '}
              <span className="leise klein">– {t.frei(QUELLE[suche.fund.quelle])}</span>
            </>
          )}
        </p>
      ) : (
        <p>
          <strong>{t('werkbank.mail.nicht-gefunden', { domain: suche?.domain ?? '' })}</strong> {t('werkbank.mail.nicht-gefunden.text')}
        </p>
      )}
      {suche && (
        <p className="leise klein">
          {suche.gefragt.length ? t('werkbank.mail.gefragt', { wen: suche.gefragt.join(', ') }) : t('werkbank.mail.ohne-netz')}
        </p>
      )}
      {suche && !suche.fund && !sucht && domain && (
        <p className="klein">
          <Knopf groesse="klein" onClick={() => finden(true)}>
            {t('werkbank.mail.thunderbird')}
          </Knopf>{' '}
          <span className="leise">{t('werkbank.mail.thunderbird.text', { domain })}</span>
        </p>
      )}
      {anbieter?.hinweise.map((h) => (
        <p key={h.text}>
          {t.frei(h.text, { anbieter: anbieter.name })}
          {h.link && (
            <>
              {' '}
              <a className="verweis" href={h.link} target="_blank" rel="noreferrer noopener">
                {t('werkbank.mail.hilfe-anbieter', { anbieter: anbieter.name })} <Symbol name="extern" />
              </a>
            </>
          )}
        </p>
      ))}
      {m.benutzer && (
        <p className="klein">
          {t('werkbank.mail.benutzer')}: <span className="mono">{m.benutzer}</span>
          {vor('benutzer')}
        </p>
      )}
      {m.absender && (
        <p className="klein">
          {t('werkbank.mail.absender')}: <span className="mono">{m.absender}</span>
          {vor('absender')}
        </p>
      )}
    </div>
  );
}

/** Erweitert (eingeklappt): alle Felder, Passwort entfernen, selbstsigniert. */
export function erweitertFelder(k: MailKontext) {
  const { erweitert, setErweitert, m, oauth, setze, s, loeschen, setLoeschen } = k;
  return (
    <details className="erweitert" open={erweitert} onToggle={(e) => setErweitert((e.target as HTMLDetailsElement).open)}>
      <summary>{t('werkbank.mail.erweitert')}</summary>
      <div className="raster">
        <Feld beschriftung={t('werkbank.mail.server')} hinweis={t('werkbank.mail.server.beispiel')}>
          <input value={m.host} disabled={oauth} onChange={(e) => setze({ host: e.target.value })} autoComplete="off" spellCheck={false} />
        </Feld>
        <Feld beschriftung={t('werkbank.mail.verbindung')}>
          <select
            value={m.verbindung}
            onChange={(e) => {
              const v = e.target.value as Verbindung;
              setze({ verbindung: v, port: m.port === portFuer(m.verbindung) ? portFuer(v) : m.port });
            }}>
            {(Object.entries(s.verbindungen) as Array<[Verbindung, string]>).map(([k, v]) => (
              <option key={k} value={k} disabled={oauth && k === 'keine'}>
                {v}
              </option>
            ))}
          </select>
        </Feld>
        <Feld beschriftung={t('werkbank.mail.port')}>
          <input type="number" min={1} max={65535} value={m.port} onChange={(e) => setze({ port: Number(e.target.value) })} />
        </Feld>
        <Feld
          beschriftung={t('werkbank.mail.benutzer')}
          hinweis={oauth ? t('werkbank.mail.benutzer.oauth') : t('werkbank.mail.benutzer.leer')}>
          <input value={m.benutzer} onChange={(e) => setze({ benutzer: e.target.value })} autoComplete="off" spellCheck={false} />
        </Feld>
        <Feld beschriftung={t('werkbank.mail.absender')} hinweis={t('werkbank.mail.absender.beispiel')}>
          <input value={m.absender} onChange={(e) => setze({ absender: e.target.value })} autoComplete="off" spellCheck={false} />
        </Feld>
      </div>
      {s.mail.passwortGesetzt && !oauth && (
        <HakenFeld beschriftung={t('werkbank.mail.passwort.entfernen')}>
          <input
            type="checkbox"
            checked={loeschen}
            onChange={(e) => {
              setLoeschen(e.target.checked);
              if (e.target.checked) setze({ passwort: '' });
            }}
          />
        </HakenFeld>
      )}
      {!oauth && (
        <HakenFeld beschriftung={t('werkbank.mail.selbstsigniert')} hinweis={t('werkbank.mail.selbstsigniert.hilfe')}>
          <input type="checkbox" checked={m.selbstsigniert} onChange={(e) => setze({ selbstsigniert: e.target.checked })} />
        </HakenFeld>
      )}
    </details>
  );
}

/** Ob Passwörter verschlüsselt gespeichert werden können. */
export function passwortHinweis(k: MailKontext) {
  const { s, oauth } = k;
  return (
    <>
      {!s.passwoerterMoeglich ? (
        <div className="hinweis warn">
          <p>
            {t('werkbank.mail.schluessel-fehlt')}{' '}
            <Link to="/werkbank/verschluesselung" className="verweis">
              {t('werkbank.mail.schluessel-erzeugen')}
            </Link>
            .{s.mail.passwortUnverschluesselt ? ` ${t('werkbank.mail.passwort.unverschluesselt')}` : ''}
          </p>
        </div>
      ) : !s.mail.passwortLesbar ? (
        <div className="hinweis schlecht">
          <p>{t('werkbank.mail.passwort.unlesbar')}</p>
        </div>
      ) : (
        !oauth && <p className="leise klein">{t('werkbank.mail.passwort.verschluesselt')}</p>
      )}
    </>
  );
}

/** Testmail an eine Adresse, mit Ergebnis darunter. */
export function testen(k: MailKontext) {
  const { assistent, vorgeschlagen, setVorgeschlagen, an, setAn, laeuft, m, probe, ergebnis } = k;
  const { teste } = k.a;
  return (
    <>
      {!assistent && (
        <>
          <h3 className="zwischen">{t('werkbank.mail.testen')}</h3>
          <div className="raster">
            <Feld
              beschriftung={t('werkbank.mail.testmail-an')}
              kopfZusatz={vorgeschlagen.has('an') && <small className="vorschlag">{t('werkbank.mail.vorgeschlagen')}</small>}>
              <input
                type="email"
                value={an}
                onChange={(e) => {
                  setAn(e.target.value);
                  setVorgeschlagen((v) => {
                    const n = new Set(v);
                    n.delete('an');
                    return n;
                  });
                }}
              />
            </Feld>
            <div className="eigenschaft unten">
              <div className="knoepfe">
                <Knopf
                  gesperrt={(!!laeuft && laeuft !== 'testmail') || !m.host || !an}
                  laeuft={laeuft === 'testmail'}
                  laeuftText={t('werkbank.mail.sende')}
                  onClick={() => teste('testmail')}>
                  {t('werkbank.mail.testmail')}
                </Knopf>
              </div>
            </div>
          </div>
        </>
      )}
      {!assistent && <ErgebnisBlock anlass={probe?.was === 'testmail' && probe}>{probe?.was === 'testmail' && ergebnis}</ErgebnisBlock>}
    </>
  );
}
