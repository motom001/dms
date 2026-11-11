import { t, tn } from '../sprache';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { api, type ZweifaktorStand } from '../api';
import { Hilfe } from '../Hilfe';
import { useKonto } from '../konto-kontext';
import { gebietsschema } from '../../../shared/src/sprache';
import { abfangen } from '../bausteine';

/**
 * Zwei-Faktor-Anmeldung (#242): Einrichten mit einer Authenticator-App, Wiederherstellungscodes,
 * Abschalten. Dieselbe Einrichtung zeigt der Pflicht-Bildschirm nach der Anmeldung.
 */

const datum = (iso: string) => new Date(iso).toLocaleDateString(gebietsschema(), { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Zehn Einmalcodes – nur jetzt sichtbar; zum Ausdrucken oder Abspeichern. */
export function Wiederherstellungscodes({ codes, weiter }: { codes: string[]; weiter: () => void }) {
  const [gesichert, setGesichert] = useState(false);
  const text = t('profil.zweifaktor.wiederherstellungscodes-je-einmal', { codes: codes.join('\n') });
  return (
    <div className="stapel">
      <p className="hinweis warn">{t('profil.zweifaktor.bewahre-diese-codes-sicher')}</p>
      <ol className="codes" aria-label={t('profil.zweifaktor.wiederherstellungscodes')}>{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ol>
      <div className="knoepfe">
        <button type="button" className="knopf" onClick={() => { void navigator.clipboard?.writeText(text); setGesichert(true); }}>{t('profil.zweifaktor.kopieren')}</button>
        <a className="knopf" href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`} download="wiederherstellungscodes.txt" onClick={() => setGesichert(true)}>{t('profil.zweifaktor.als-datei-speichern')}</a>
        <button type="button" className="knopf" onClick={() => { print(); setGesichert(true); }}>{t('profil.zweifaktor.drucken')}</button>
      </div>
      <label className="haken"><input type="checkbox" checked={gesichert} onChange={(e) => setGesichert(e.target.checked)} /><span>{t('profil.zweifaktor.ich-habe-die-codes')}</span></label>
      <div className="knoepfe"><button type="button" className="knopf primaer" disabled={!gesichert} onClick={weiter}>{t('profil.zweifaktor.fertig')}</button></div>
    </div>
  );
}

/** QR-Code scannen, Code eingeben – danach die Wiederherstellungscodes. */
export function ZweifaktorEinrichten({ fertig, abbrechen }: { fertig: () => void; abbrechen?: () => void }) {
  const [entwurf, setEntwurf] = useState<{ geheimnis: string; uri: string; bild: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [sendet, setSendet] = useState(false);
  const beginnen = useCallback(async () => {
    setFehler(undefined);
    try {
      const e = await api.zweifaktorBeginnen();
      setEntwurf({ ...e, bild: await QRCode.toDataURL(e.uri, { margin: 1, width: 200, errorCorrectionLevel: 'M' }) });
    } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { void beginnen(); }, [beginnen]);
  async function bestaetigen(e: FormEvent) {
    e.preventDefault();
    setSendet(true); setFehler(undefined);
    try { setCodes((await api.zweifaktorBestaetigen(code)).codes); } catch (x) { setFehler((x as Error).message); } finally { setSendet(false); }
  }
  if (codes) return <Wiederherstellungscodes codes={codes} weiter={fertig} />;
  return (
    <form className="stapel" onSubmit={abfangen(bestaetigen, setFehler)}>
      <p>{t('profil.zweifaktor.1-oeffne-eine-authenticator')}</p>
      {entwurf ? (
        <div className="qr">
          <img src={entwurf.bild} width={200} height={200} alt={t('profil.zweifaktor.qr-code-fuer-die')} />
          <div>
            <p className="leise klein">{t('profil.zweifaktor.scannen-geht-nicht-gib')}</p>
            <code className="geheimnis">{entwurf.geheimnis}</code>
          </div>
        </div>
      ) : !fehler && <p className="leise">{t('profil.zweifaktor.erzeuge-schluessel')}</p>}
      <label className="eigenschaft"><span>{t('profil.zweifaktor.2-sechsstelligen-code-aus')}</span>
        <input id="zweifaktor-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required />
      </label>
      {fehler && <p className="fehlertext">{fehler}</p>}
      <div className="knoepfe">
        {abbrechen && <button type="button" className="knopf" onClick={abbrechen}>{t('profil.zweifaktor.abbrechen')}</button>}
        <button className="knopf primaer" disabled={sendet || !entwurf}>{t('profil.zweifaktor.bestaetigen')}</button>
      </div>
    </form>
  );
}

/** Profil → Sicherheit. */
export function ZweifaktorBlatt() {
  const { aktualisieren } = useKonto();
  const [stand, setStand] = useState<ZweifaktorStand | null>(null);
  const [modus, setModus] = useState<'ruhe' | 'einrichten' | 'codes' | 'aus'>('ruhe');
  const [pw, setPw] = useState('');
  const [neueCodes, setNeueCodes] = useState<string[] | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const laden = useCallback(async () => { try { setStand(await api.zweifaktor()); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); } }, []);
  useEffect(() => { void laden(); }, [laden]);

  async function mitPasswort(e: FormEvent) {
    e.preventDefault(); setMeldung(undefined);
    try {
      if (modus === 'codes') { setNeueCodes((await api.zweifaktorCodes(pw)).codes); }
      else { await api.zweifaktorEntfernen(pw); setModus('ruhe'); setMeldung({ art: 'gut', text: t('profil.zweifaktor.zwei-faktor-anmeldung-abgeschaltet') }); await laden(); }
      setPw('');
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }

  return (
    <div className="blatt" id="zweifaktor">
      <h2 className="h3">{tn('profil.zweifaktor.zwei-faktor-anmeldung', { hilfe: <Hilfe ort="profil.zweifaktor" /> })}</h2>
      <p className="leise">{t('profil.zweifaktor.neben-dem-passwort-fragt')}</p>
      {!stand ? <p className="leise">{t('profil.zweifaktor.lade')}</p> : modus === 'einrichten' ? (
        <ZweifaktorEinrichten fertig={() => { setModus('ruhe'); setMeldung({ art: 'gut', text: t('profil.zweifaktor.zwei-faktor-anmeldung-eingerichtet') }); void laden(); void aktualisieren(); }} abbrechen={() => setModus('ruhe')} />
      ) : neueCodes ? (
        <Wiederherstellungscodes codes={neueCodes} weiter={() => { setNeueCodes(null); setModus('ruhe'); void laden(); }} />
      ) : stand.aktiv ? (
        <>
          <p><span className="chip gut punkt">{t('profil.zweifaktor.eingerichtet')}</span>{stand.seit && <> {' '}{t('profil.zweifaktor.seit', { datum: datum(stand.seit) })}</>} {' '}{t('profil.zweifaktor.von-10-wiederherstellungscodes', { codesUebrig: stand.codesUebrig })}</p>
          {stand.codesUebrig <= 3 && <p className="hinweis warn">{t('profil.zweifaktor.nur-noch-wiederherstellungscodes', { codesUebrig: stand.codesUebrig })}</p>}
          {modus === 'ruhe' ? (
            <div className="knoepfe">
              <button type="button" className="knopf" onClick={() => setModus('codes')}>{t('profil.zweifaktor.neue-wiederherstellungscodes')}</button>
              {!stand.pflicht && <button type="button" className="knopf gefahr-rand" onClick={() => setModus('aus')}>{t('profil.zweifaktor.abschalten')}</button>}
            </div>
          ) : (
            <form className="stapel" onSubmit={abfangen(mitPasswort, (text) => setMeldung({ art: 'schlecht', text }))}>
              <p className="leise">{t('profil.zweifaktor.bitte-mit-deinem-passwort', { wert: modus === 'codes' ? t('profil.zweifaktor.die-bisherigen-codes-gelten') : t('profil.zweifaktor.danach-reicht-wieder-das') })}</p>
              <label className="eigenschaft"><span>{t('profil.zweifaktor.aktuelles-passwort')}</span><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" autoFocus required /></label>
              <div className="knoepfe">
                <button type="button" className="knopf" onClick={() => { setModus('ruhe'); setPw(''); }}>{t('profil.zweifaktor.abbrechen')}</button>
                <button className={`knopf ${modus === 'aus' ? 'gefahr' : 'primaer'}`} disabled={!pw}>{modus === 'codes' ? t('profil.zweifaktor.neue-codes-erzeugen') : t('profil.zweifaktor.abschalten')}</button>
              </div>
            </form>
          )}
          {stand.pflicht && <p className="leise klein">{t('profil.zweifaktor.fuer-dich-ist-die')}</p>}
          {stand.passkeyErfuellt && <p className="leise klein">{t('profil.zweifaktor.passkey-erfuellt')}</p>}
        </>
      ) : (
        <div className="knoepfe"><button type="button" className="knopf primaer" onClick={() => { setMeldung(undefined); setModus('einrichten'); }}>{t('profil.zweifaktor.einrichten')}</button></div>
      )}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
    </div>
  );
}
