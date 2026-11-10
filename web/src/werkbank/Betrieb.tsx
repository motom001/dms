import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type BetriebAnsicht } from '../api';
import { MailVersand } from './MailVersand';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { Hilfe } from '../Hilfe';
import { t, tn } from '../sprache';

/**
 * E-Mail-Versand und Adresse des DMS (#37) – früher Umgebungsvariablen (SMTP_*, APP_URL),
 * jetzt hier gepflegt, sofort wirksam und testbar.
 */
export function useBetrieb() {
  const [stand, setStand] = useState<BetriebAnsicht | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await api.betrieb()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
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
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.betrieb.werkbank')}</p>
        <h1>{t('werkbank.betrieb.e-mail-und-adresse')}</h1>
        <p className="leise">{tn('werkbank.betrieb.wie-ablago-e-mails', { hilfe: <Hilfe ort="werkbank.betrieb" /> })}</p>
      </div>
      <Adresse b={b} />
      {/* #813: Adresse und Passwort genügen; Vorschläge, Server finden, Erweitert, OAuth. */}
      <MailVersand key={JSON.stringify(b.stand.mail)} b={b} />
    </div>
  );
}

function Adresse({ b }: { b: BetriebZustand }) {
  const s = b.stand!;
  const [adresse, setAdresse] = useState(s.adresse);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const ent = useEntwurf(s.adresse, adresse.trim(), { zuruecksetzen: () => { setAdresse(s.adresse); setMeldung(undefined); } });
  async function speichern(ev?: FormEvent, wert = adresse) {
    ev?.preventDefault();
    try { const n = await api.adresseSpeichern(wert); b.setStand({ ...b.stand!, ...n }); setAdresse(n.adresse); setMeldung({ art: 'gut', text: n.adresse ? t('werkbank.betrieb.gespeichert') : t('werkbank.betrieb.keine-adresse-gepflegt-links') }); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  return (
    <form className="blatt" id="adresse" onSubmit={speichern} onKeyDown={ent.tasten}>
      <h2 className="h3">{t('werkbank.betrieb.adresse-von-ablago')}</h2>
      <p className="leise">{tn('werkbank.betrieb.unter-dieser-adresse-oeffnen', { span: <span className="mono">{'https://'}</span> })}</p>
      <label className="eigenschaft"><span>{tn('werkbank.betrieb.adresse', { klein: <small>{t('werkbank.betrieb.z-b-http-nas')}</small> })}</span>
        <input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder={s.vorschlag ?? 'http://nas.home.arpa:8080'} inputMode="url" autoComplete="off" /></label>
      {!s.adresse && (
        <div className="hinweis info"><p>{t('werkbank.betrieb.noch-keine-adresse-gepflegt')}{s.vorschlag ? <> {' '}{tn('werkbank.betrieb.hier', { span: <span className="mono">{s.vorschlag}</span> })}</> : ''}.</p>
          {s.vorschlag && <button type="button" className="knopf klein" onClick={() => { setAdresse(s.vorschlag!); void speichern(undefined, s.vorschlag!); }}>{t('werkbank.betrieb.diese-adresse-uebernehmen')}</button>}
        </div>
      )}
      {s.adresse.startsWith('https://') && s.vorschlag?.startsWith('http://') && (
        <div className="hinweis warn"><p>{tn('werkbank.betrieb.du-rufst-ablago-gerade', { span: <span className="mono">{t('werkbank.betrieb.trust-proxy')}</span>, span2: <span className="mono">{t('werkbank.betrieb.false')}</span> })}</p></div>
      )}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <Speicherleiste ent={ent} gegenstand={t('werkbank.betrieb.adresse-2')} />
    </form>
  );
}
