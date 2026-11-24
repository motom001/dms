import { useEffect, useState } from 'react';
import { handbuchUrl } from '../../../shared/src/hilfe';
import { Knopf } from '../bausteine';
import { heikleDatei } from '../api/anfrage';
import { betriebApi } from '../api/betrieb';
import { einrichtungApi } from '../api/einrichtung';
import { geheZu } from '../ort';
import { t } from '../sprache';
import { Symbol } from '../Symbol';
import { ZweifaktorEinrichten } from '../profil/Zweifaktor';
import { PasskeyHinzufuegen } from '../profil/Passkeys';
import { passkeysImBrowser } from '../passkey';
import { ausfuehren } from './ausfuehren';
import { useSenden } from './ablauf';
import { NR, Rahmen, REPO, type Leiste } from './rahmen';
import { setzeStand, STUFEN, useAssistent, vergiss, type Ansicht, type Lauf, type Stufe } from './stand';

/** „Jetzt einrichten“ mit Fortschritt und der Abschluss mit Notfallblatt, Zwei-Faktor und Passkey (#1279 aus Schritte.tsx gezogen). */

/* ---------- Jetzt einrichten: Fortschritt ---------- */

const STUFE_TEXT: Record<Stufe, string> = {
  ablage: 'einrichtung.lauf.ablage',
  schluessel: 'einrichtung.lauf.schluessel',
  adresse: 'einrichtung.lauf.adresse',
  region: 'einrichtung.lauf.region',
  nutzung: 'einrichtung.lauf.nutzung',
  darf: 'einrichtung.lauf.darf',
  mail: 'einrichtung.lauf.mail',
  notfallkontakte: 'einrichtung.lauf.notfallkontakte',
  pakete: 'einrichtung.lauf.pakete',
  organisation: 'einrichtung.lauf.organisation',
  beispielablage: 'einrichtung.lauf.beispielablage',
};
/** Welcher Schritt eine Stufe ändert (nach einem Fehler). */
const SCHRITT_JE_STUFE: Partial<Record<Stufe, Ansicht>> = {
  ablage: 'konto',
  adresse: 'optional',
  region: 'optional',
  nutzung: 'nutzung',
  darf: 'darf',
  mail: 'optional',
  notfallkontakte: 'optional',
  pakete: 'pakete',
  organisation: 'nutzung',
  beispielablage: 'optional',
};

export function LaufAnsicht() {
  const st = useAssistent();
  const l = st.lauf!;
  const fehler = STUFEN.find((s) => l.stufen[s].zustand === 'fehler');
  const anzahl = st.sammlung.pakete?.eingabe.pakete?.length ?? 0;
  const ablageFertig = l.stufen.ablage.zustand === 'fertig';
  const leiste: Leiste = { erledigt: (i) => i < NR.zusammenfassung, gesperrt: () => t('einrichtung.gesperrt.lauf') };
  return (
    <Rahmen
      aktiv={NR.zusammenfassung}
      titel={fehler ? t('einrichtung.lauf.titel.fehler') : t('einrichtung.lauf.titel')}
      unter={fehler ? t('einrichtung.lauf.unter.fehler') : t('einrichtung.lauf.unter')}
      leiste={leiste}>
      <ol className="lauf-liste" aria-live="polite">
        {STUFEN.filter((s) => l.stufen[s].zustand !== 'ausgelassen').map((s) => {
          const x = l.stufen[s];
          const text = t(STUFE_TEXT[s] as 'einrichtung.lauf.ablage', { ablage: st.sammlung.ablage, anzahl });
          const ziel = SCHRITT_JE_STUFE[s];
          return (
            <li key={s} className={`lauf-${x.zustand}`} aria-busy={x.zustand === 'laeuft' || undefined}>
              <span className="lauf-zeichen" aria-hidden="true">
                {x.zustand === 'fertig' ? (
                  <Symbol name="haken" />
                ) : x.zustand === 'fehler' ? (
                  <Symbol name="warnung" />
                ) : x.zustand === 'laeuft' ? (
                  '…'
                ) : (
                  '·'
                )}
              </span>
              <span className="lauf-text">
                <span>
                  {text}
                  {x.zustand === 'laeuft' ? ' …' : ''}
                  <span className="sr"> – {t(`einrichtung.lauf.zustand.${x.zustand}`)}</span>
                </span>
                {x.meldung && <span className={x.zustand === 'fehler' ? 'fehlertext klein' : 'leise klein'}>{x.meldung}</span>}
                {x.zustand === 'fehler' && (
                  <span className="knoepfe">
                    {ziel && (
                      <Knopf
                        onClick={() =>
                          setzeStand((a) =>
                            // Vor dem Anlegen der Ablage ist noch nichts passiert: zurück zum Sammeln.
                            ablageFertig
                              ? { ...a, aendern: ziel, sammlung: { ...a.sammlung, ansicht: ziel } }
                              : { ...a, lauf: null, sammlung: { ...a.sammlung, ansicht: ziel, zurZusammenfassung: true } },
                          )
                        }>
                        {t('einrichtung.zf.aendern')}
                      </Knopf>
                    )}
                    <Knopf art="haupt" laeuft={l.laeuft} onClick={() => void ausfuehren()}>
                      {t('einrichtung.lauf.nochmal')}
                    </Knopf>
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {fehler && <p className="leise klein">{t('einrichtung.lauf.rest')}</p>}
    </Rahmen>
  );
}

/* ---------- Fertig: Notfallblatt, Zwei-Faktor ---------- */

/**
 * Zwei-Faktor-Anmeldung anbieten (#821, #810 Frage 10): „Jetzt einrichten“ oder „Später“, keine Pflicht. Den Passkey
 * bietet `PasskeyAngebot` an (#811). Die Wahl steht im Lauf (sessionStorage), damit sie ein Neuladen übersteht.
 */
function ZweifaktorAngebot({ l, aktualisieren }: { l: Lauf; aktualisieren: () => Promise<void> }) {
  const [einrichten, setEinrichten] = useState(false);
  const setze = (zweifaktor: Lauf['zweifaktor']) => setzeStand((a) => (a.lauf ? { ...a, lauf: { ...a.lauf, zweifaktor } } : a));
  return (
    <section className="blatt stapel" aria-label={t('einrichtung.abschluss.zweifaktor')}>
      <h2 className="h3">{t('einrichtung.abschluss.zweifaktor')}</h2>
      {l.zweifaktor === 'eingerichtet' ? (
        <p className="gutertext klein" role="status">
          <Symbol name="haken" /> {t('einrichtung.abschluss.zweifaktor.fertig')}
        </p>
      ) : einrichten ? (
        // Danach den Kontostand neu laden: Die erneute Anmeldung fragt jetzt auch den Code ab.
        <ZweifaktorEinrichten
          fertig={() => {
            setze('eingerichtet');
            setEinrichten(false);
            void aktualisieren();
          }}
          abbrechen={() => setEinrichten(false)}
        />
      ) : (
        <>
          <p>{t('einrichtung.abschluss.zweifaktor.text')}</p>
          {l.zweifaktor === 'spaeter' && <p className="leise klein">{t('einrichtung.abschluss.zweifaktor.spaeter.text')}</p>}
          <div className="knoepfe links">
            <Knopf onClick={() => setEinrichten(true)}>{t('einrichtung.abschluss.zweifaktor.jetzt')}</Knopf>
            {l.zweifaktor !== 'spaeter' && <Knopf onClick={() => setze('spaeter')}>{t('einrichtung.abschluss.zweifaktor.spaeter')}</Knopf>}
          </div>
        </>
      )}
    </section>
  );
}

/** Passkey anbieten (#811): wie die Zwei-Faktor-Anmeldung – „Jetzt hinzufügen“ oder „Später“, keine Pflicht. */
function PasskeyAngebot({ l, aktualisieren }: { l: Lauf; aktualisieren: () => Promise<void> }) {
  const [neu, setNeu] = useState(false);
  const setze = (passkey: Lauf['passkey']) => setzeStand((a) => (a.lauf ? { ...a, lauf: { ...a.lauf, passkey } } : a));
  return (
    <section className="blatt stapel" aria-label={t('einrichtung.abschluss.passkey')}>
      <h2 className="h3">{t('einrichtung.abschluss.passkey')}</h2>
      {l.passkey === 'eingerichtet' ? (
        <p className="gutertext klein" role="status">
          <Symbol name="haken" /> {t('einrichtung.abschluss.passkey.fertig')}
        </p>
      ) : neu ? (
        <PasskeyHinzufuegen
          autoFocus
          fertig={() => {
            setze('eingerichtet');
            setNeu(false);
            void aktualisieren();
          }}
          abbrechen={() => setNeu(false)}
        />
      ) : (
        <>
          <p>{t('einrichtung.abschluss.passkey.text')}</p>
          {l.passkey === 'spaeter' && <p className="leise klein">{t('einrichtung.abschluss.passkey.spaeter.text')}</p>}
          <div className="knoepfe links">
            <Knopf onClick={() => setNeu(true)}>{t('einrichtung.abschluss.passkey.jetzt')}</Knopf>
            {l.passkey !== 'spaeter' && <Knopf onClick={() => setze('spaeter')}>{t('einrichtung.abschluss.zweifaktor.spaeter')}</Knopf>}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Sicherung nach der Einrichtung (#1509): eine normale Zeile der Fortschrittsliste – kein Kasten, keine Warnfarbe.
 * Mit „Einrichtung abschließen“ schaltet Ablago die Sicherung ein und macht gleich die erste samt Probe; läuft sie
 * schon (z. B. nach Neuladen), zeigt die Zeile „läuft“ bzw. den Haken.
 */
function ErsteSicherungZeile() {
  const [zustand, setZustand] = useState<'offen' | 'laeuft' | 'fertig'>('offen');
  useEffect(() => {
    void betriebApi.sicherung().then(
      (s) => {
        const e = s.zustand.erste?.status;
        setZustand(e === 'ok' ? 'fertig' : e === 'offen' || e === 'laeuft' ? 'laeuft' : 'offen');
      },
      () => {},
    );
  }, []);
  return (
    <ol className="lauf-liste">
      <li className={`lauf-${zustand}`} aria-busy={zustand === 'laeuft' || undefined}>
        <span className="lauf-zeichen" aria-hidden="true">
          {zustand === 'fertig' ? <Symbol name="haken" /> : zustand === 'laeuft' ? '…' : '·'}
        </span>
        <span className="lauf-text">
          <span>
            {t('einrichtung.abschluss.sicherung')}
            {zustand === 'laeuft' ? ' …' : ''}
          </span>
          <span className="leise klein">{t('einrichtung.abschluss.sicherung.notfallblatt')}</span>
        </span>
      </li>
    </ol>
  );
}

/**
 * Abschluss: Notfallblatt (Pflicht), Zwei-Faktor anbieten, Links, „Einrichtung abschließen“.
 *
 * Das Notfallblatt lädt die Oberfläche selbst herunter (statt über einen Link): Es ist eine heikle Handlung (#819), und
 * dauerte „Jetzt einrichten“ länger als 10 Minuten oder endete der Verwaltungsmodus inzwischen, verlangt der Server
 * eine frische Anmeldung. Ein Link könnte diese Antwort nicht abfangen – `heikleDatei` zeigt dafür denselben Dialog wie
 * die Werkbank und lädt danach herunter. Eine Ausnahme von der Frischeprüfung für den offenen Assistenten gibt es
 * bewusst nicht: Der Assistent bleibt offen, bis man abschließt, und eine liegen gelassene Sitzung brächte sonst den
 * Schlüssel mit.
 */
export function Abschluss({ abschliessen, version }: { abschliessen: () => Promise<void>; version: string | null }) {
  const st = useAssistent();
  const l = st.lauf!;
  const [fingerabdruck, setFingerabdruck] = useState<string | null>(null);
  const [geladen, setGeladen] = useState(false);
  const x = useSenden();
  const blatt = useSenden();
  useEffect(() => {
    void betriebApi.tresor().then(
      (s) => {
        setFingerabdruck(s.fingerabdruck);
        if (s.notfallblatt?.aktuell) setGeladen(true);
      },
      () => {},
    );
  }, []);
  // Der Server merkt sich das Herunterladen (mit neuem Notfallcode, #815); erst dann gilt es – auch nach Neuladen.
  const herunterladen = () =>
    void blatt.los(async () => {
      await heikleDatei('/api/werkbank/notfallblatt', 'Ablago-Notfallblatt.pdf');
      setGeladen(!!(await betriebApi.tresor()).notfallblatt?.aktuell);
    });
  const umgebung = t('einrichtung.abschluss.problem.umgebung', {
    version: version ?? t('einrichtung.abschluss.problem.unbekannt'),
    browser: navigator.userAgent,
  });
  const issue = `${REPO}/issues/new?${new URLSearchParams({ title: t('einrichtung.abschluss.problem.titel'), body: `${t('einrichtung.abschluss.problem.vorlage')}\n\n---\n${umgebung}` })}`;
  const nicht = STUFEN.filter((s) => l.stufen[s].meldung && l.stufen[s].zustand === 'fertig');
  const leiste: Leiste = { erledigt: (i) => i < NR.fertig, gesperrt: () => t('einrichtung.gesperrt.abschluss') };
  return (
    <Rahmen
      aktiv={NR.fertig}
      titel={t('einrichtung.abschluss.titel', { ablage: st.sammlung.ablage || t('einrichtung.abschluss.titel.ohne') })}
      unter={t('einrichtung.abschluss.unter')}
      leiste={leiste}>
      {l.unterbrochen && (
        <div className="hinweis info">
          <p>{t('einrichtung.abschluss.unterbrochen')}</p>
        </div>
      )}
      {nicht.length > 0 && (
        <div className="hinweis warn">
          <ul>
            {nicht.map((s) => (
              <li key={s}>{l.stufen[s].meldung}</li>
            ))}
          </ul>
        </div>
      )}
      <section className="blatt stapel" aria-label={t('einrichtung.abschluss.notfallblatt')}>
        <h2 className="h3">{t('einrichtung.abschluss.notfallblatt')}</h2>
        <p>{t('einrichtung.abschluss.notfallblatt.text')}</p>
        {fingerabdruck && (
          <p className="leise klein">
            {t('einrichtung.abschluss.fingerabdruck')} <span className="mono">{fingerabdruck}</span>
          </p>
        )}
        <div className="knoepfe links">
          <Knopf art={geladen ? 'neben' : 'haupt'} symbol="herunterladen" laeuft={blatt.sendet} onClick={herunterladen}>
            {t('einrichtung.abschluss.herunterladen')}
          </Knopf>
        </div>
        {blatt.fehler && (
          <p className="fehlertext" role="alert">
            {blatt.fehler}
          </p>
        )}
        {/* Ohne Notfallblatt ist „Einrichtung abschließen“ gesperrt – der Grund steht am Knopf (Leitsatz 6). */}
        {geladen && (
          <p className="gutertext klein" role="status">
            <Symbol name="haken" /> {t('einrichtung.abschluss.geladen')}
          </p>
        )}
      </section>
      <ErsteSicherungZeile />
      <ZweifaktorAngebot l={l} aktualisieren={abschliessen} />
      {/* Passkey (#811): nur über HTTPS (oder localhost) – sonst bietet der Assistent ihn gar nicht erst an. */}
      {passkeysImBrowser() && <PasskeyAngebot l={l} aktualisieren={abschliessen} />}
      <ul className="linkliste">
        <li>
          <a className="verweis" href={handbuchUrl('admin', version, 'fuenf-schritte/')} target="_blank" rel="noreferrer">
            {t('einrichtung.abschluss.link.fuenf')}
          </a>{' '}
          – {t('einrichtung.abschluss.link.fuenf.text')}
        </li>
        <li>
          <a className="verweis" href={handbuchUrl('benutzer', version)} target="_blank" rel="noreferrer">
            {t('einrichtung.abschluss.link.benutzer')}
          </a>{' '}
          – {t('einrichtung.abschluss.link.benutzer.text')}
        </li>
        <li>
          <a className="verweis" href={handbuchUrl('admin', version)} target="_blank" rel="noreferrer">
            {t('einrichtung.abschluss.link.admin')}
          </a>{' '}
          – {t('einrichtung.abschluss.link.admin.text')}
        </li>
        <li>
          <a className="verweis" href={issue} target="_blank" rel="noreferrer">
            {t('einrichtung.abschluss.link.problem')}
          </a>{' '}
          – {t('einrichtung.abschluss.link.problem.text')}
        </li>
        <li>
          <a className="verweis" href="https://github.com/sponsors/motom001" target="_blank" rel="noreferrer">
            {t('einrichtung.abschluss.link.unterstuetzen')}
          </a>{' '}
          – {t('einrichtung.abschluss.link.unterstuetzen.text')}
        </li>
      </ul>
      {x.fehler && (
        <p className="fehlertext" role="alert">
          {x.fehler}
        </p>
      )}
      <div className="knoepfe">
        <Knopf
          art="haupt"
          gesperrt={geladen ? false : t('einrichtung.abschluss.pflicht')}
          laeuft={x.sendet}
          onClick={() =>
            void x.los(async () => {
              await einrichtungApi.einrichtungSchritt('fertig');
              vergiss();
              geheZu('/werkbank', true);
              await abschliessen();
            })
          }>
          {t('einrichtung.abschluss.knopf')}
        </Knopf>
      </div>
    </Rahmen>
  );
}
