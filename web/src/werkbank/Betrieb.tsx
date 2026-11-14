import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { betriebApi, type BetriebAnsicht } from '../api/betrieb';
import { kontoApi } from '../api/konto';
import { MailVersand } from './MailVersand';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { t, tn } from '../sprache';
import { abfangen, Feld, Knopf } from '../bausteine';
import { Kopf } from './Kopf';

/**
 * E-Mail-Versand und Adresse des DMS (#37) – früher Umgebungsvariablen (SMTP_*, APP_URL),
 * jetzt hier gepflegt, sofort wirksam und testbar.
 */
export function useBetrieb() {
  const [stand, setStand] = useState<BetriebAnsicht | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await betriebApi.betrieb()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  return { stand, setStand, fehler, laden };
}
export type BetriebZustand = ReturnType<typeof useBetrieb>;

export function BetriebPanel({ b }: { b: BetriebZustand }) {
  useEffect(() => { void b.laden(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- nur beim ersten Anzeigen laden
  if (b.fehler) return <div className="hinweis schlecht"><p>{b.fehler}</p></div>;
  if (!b.stand) return <p className="leise">{t('werkbank.betrieb.lade')}</p>;
  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.betrieb.e-mail-und-adresse')} ueber={t('werkbank.betrieb.werkbank')} hilfe="werkbank.betrieb">
        <p className="leise">{t('werkbank.betrieb.wie-ablago-e-mails')}</p>
      </Kopf>
      <Adresse b={b} />
      {/* #813: Adresse und Passwort genügen; Vorschläge, Server finden, Erweitert, OAuth. */}
      <MailVersand key={JSON.stringify(b.stand.mail)} b={b} />
    </div>
  );
}

/** Anderer Name (Domain) als bisher? Dann passen vorhandene Passkeys nicht mehr (#811). Port und Pfad zählen nicht. */
function anderer(neu: string, alt: string | null | undefined): boolean {
  const name = (x: string) => { try { return new URL(/^[a-z]+:\/\//i.test(x) ? x : `http://${x}`).hostname.toLowerCase(); } catch { return ''; } };
  return !!neu.trim() && !!alt && name(neu.trim()) !== '' && name(neu.trim()) !== name(alt);
}

function Adresse({ b }: { b: BetriebZustand }) {
  const s = b.stand!;
  const [adresse, setAdresse] = useState(s.adresse);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  // Passkey-Pflicht an (#811)? Dann warnen, bevor die Adresse ohne https:// gespeichert wird. Ohne Recht auf den
  // Anmeldeschutz gibt es die Angabe nicht – dann ohne Warnung.
  const [pflicht, setPflicht] = useState(false);
  useEffect(() => { kontoApi.passkeyPflicht().then((p) => setPflicht(p.admin || p.mitglied)).catch(() => setPflicht(false)); }, []);
  const ent = useEntwurf(s.adresse, adresse.trim(), { zuruecksetzen: () => { setAdresse(s.adresse); setMeldung(undefined); } });
  async function speichern(ev?: FormEvent, wert = adresse) {
    ev?.preventDefault();
    try { const n = await betriebApi.adresseSpeichern(wert); b.setStand({ ...b.stand!, ...n }); setAdresse(n.adresse); setMeldung({ art: 'gut', text: n.adresse ? t('werkbank.betrieb.gespeichert') : t('werkbank.betrieb.keine-adresse-gepflegt-links') }); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  return (
    <form className="blatt" id="adresse" onSubmit={abfangen(speichern, (text) => setMeldung({ art: 'schlecht', text }))} onKeyDown={ent.tasten}>
      <h2 className="h3">{t('werkbank.betrieb.adresse-von-ablago')}</h2>
      <p className="leise">{tn('werkbank.betrieb.unter-dieser-adresse-oeffnen', { span: <span className="mono">{'https://'}</span> })}</p>
      <Feld beschriftung={t('werkbank.betrieb.adresse-2')} hinweis={t('werkbank.betrieb.z-b-http-nas')}>
        <input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder={s.vorschlag ?? 'http://nas.home.arpa:8080'} inputMode="url" autoComplete="off" />
      </Feld>
      {!s.adresse && (
        <div className="hinweis info"><p>{t('werkbank.betrieb.noch-keine-adresse-gepflegt')}{s.vorschlag ? <> {' '}{tn('werkbank.betrieb.hier', { span: <span className="mono">{s.vorschlag}</span> })}</> : ''}.</p>
          {s.vorschlag && <Knopf groesse="klein" onClick={() => { setAdresse(s.vorschlag!); return speichern(undefined, s.vorschlag!); }}>{t('werkbank.betrieb.diese-adresse-uebernehmen')}</Knopf>}
        </div>
      )}
      {s.adresse.startsWith('https://') && s.vorschlag?.startsWith('http://') && (
        <div className="hinweis warn"><p>{tn('werkbank.betrieb.du-rufst-ablago-gerade', { span: <span className="mono">{t('werkbank.betrieb.trust-proxy')}</span>, span2: <span className="mono">{t('werkbank.betrieb.false')}</span> })}</p></div>
      )}
      {/* Passkeys (#811) gelten nur für den Namen, unter dem sie angelegt wurden: vor dem Speichern darauf hinweisen. */}
      {anderer(adresse, s.adresse || s.vorschlag) && <div className="hinweis warn" id="adresse-passkeys"><p>{t('werkbank.betrieb.passkeys')}</p></div>}
      {pflicht && !adresse.trim().toLowerCase().startsWith('https://') && <div className="hinweis warn" id="adresse-passkey-pflicht"><p>{t('werkbank.betrieb.passkey-pflicht')}</p></div>}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <Speicherleiste ent={ent} gegenstand={t('werkbank.betrieb.adresse-2')} />
    </form>
  );
}
