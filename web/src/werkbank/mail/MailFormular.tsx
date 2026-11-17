import { useMemo, type MutableRefObject } from 'react';
import { domainVon, MAIL_ANBIETER } from '../../../../shared/src/mailanbieter';
import { betriebApi, type BetriebAnsicht } from '../../api/betrieb';
import { Speicherleiste } from '../../Speicherleiste';
import { Hilfe } from '../../Hilfe';
import { t } from '../../sprache';
import { OAuthBereich } from '../Postfaecher';
import type { BetriebZustand } from '../betriebZustand';
import type { Feld, MailGriff } from './hilfen';
import { mailAktionen, mailVorschlaege, useMailZustand, useStartVorschlag } from './mail-zustand';
import { erweitertFelder, passwortHinweis, testen, vorschlag, zugang, type MailKontext } from './MailTeile';

export function MailFormular({
  s,
  email,
  b,
  aktualisieren,
  sammeln,
}: {
  s: BetriebAnsicht;
  email: string;
  b?: BetriebZustand;
  aktualisieren?: () => Promise<void>;
  sammeln?: { griff: MutableRefObject<MailGriff | null>; passwort: string };
}) {
  const x = useMailZustand(s, email, sammeln);
  const { assistent, m, ent, vorgeschlagen, adresse, probe, meldung, setMeldung, laeuft, suche } = x;
  const { setze, schlageVor } = mailVorschlaege(x, s, email);
  useStartVorschlag(x, s, schlageVor);
  const anbieter = useMemo(
    () => MAIL_ANBIETER.find((a) => a.id === suche?.fund?.anbieter) ?? MAIL_ANBIETER.find((a) => a.host === m.host.toLowerCase()) ?? null,
    [suche, m.host],
  );
  const oauthAnbieter = anbieter?.oauth ?? (m.anmeldung === 'oauth' ? m.anbieter : undefined);
  const oauth = m.anmeldung === 'oauth';

  const a = mailAktionen(x, { b, aktualisieren, oauthAnbieter, setze, schlageVor });
  // Assistent (#803, #804): „Weiter“ übernimmt, was sichtbar dasteht – in den Sammelstand, gespeichert wird nichts.
  if (sammeln)
    sammeln.griff.current = {
      sammle: () => ({
        aktiv: m.aktiv,
        host: m.host,
        port: m.port,
        verbindung: m.verbindung,
        benutzer: m.benutzer,
        absender: m.absender,
        selbstsigniert: m.selbstsigniert,
        passwort: m.passwort,
      }),
    };

  const vor = (f: Feld) => vorgeschlagen.has(f) && <small className="vorschlag">{t('werkbank.mail.vorgeschlagen')}</small>;
  const domain = domainVon(adresse);
  const ergebnis = probe && (
    <div className={`hinweis ${probe.ok ? 'gut' : 'schlecht'}`}>
      <p>{probe.ok && probe.was === 'pruefen' ? `${t('werkbank.mail.geprueft')} ${probe.meldung}` : probe.meldung}</p>
      {probe.technisch && (
        <details className="klein">
          <summary>{t('werkbank.mail.antwort-server')}</summary>
          <p className="mono">{probe.technisch}</p>
        </details>
      )}
    </div>
  );
  const k: MailKontext = { ...x, setze, schlageVor, s, a, vor, ergebnis, anbieter, oauthAnbieter, oauth, domain };

  const inhalt = (
    <>
      {zugang(k)}

      {(m.host || x.suche) && vorschlag(k)}

      {erweitertFelder(k)}

      {passwortHinweis(k)}

      {testen(k)}
      {meldung && (
        <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">
          {meldung.text}
        </p>
      )}
    </>
  );

  if (assistent || !b) return <div className="stapel">{inhalt}</div>;
  return (
    <>
      <form className="blatt" id="mail" onSubmit={(e) => void a.speichern(e)} onKeyDown={ent.tasten} noValidate>
        <h2 className="h3">
          {t('werkbank.mail.titel')} <Hilfe ort="werkbank.mail" />
        </h2>
        <p className="leise">{t('werkbank.mail.unter')}</p>
        {inhalt}
        <Speicherleiste ent={ent} gegenstand={t('werkbank.mail.gegenstand')} sendet={laeuft === 'speichern'} />
      </form>
      {oauth && m.anbieter && (
        <OAuthBereich
          anbieter={m.anbieter}
          versand
          geaendert={ent.geaendert || s.mail.anmeldung !== 'oauth'}
          setMeldung={setMeldung}
          ziel={
            s.mail.anmeldung === 'oauth'
              ? {
                  oauth: s.oauth,
                  start: betriebApi.mailOAuthStart,
                  geraet: betriebApi.mailOAuthGeraet,
                  geraetPruefen: betriebApi.mailOAuthGeraetPruefen,
                  abmelden: async () => {
                    b.setStand({ ...b.stand!, ...(await betriebApi.mailOAuthAbmelden()) });
                  },
                  neuLaden: b.laden,
                }
              : undefined
          }
        />
      )}
    </>
  );
}
