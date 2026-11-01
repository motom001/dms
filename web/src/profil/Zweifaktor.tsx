import { useCallback, useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { api, type ZweifaktorStand } from '../api';
import { Hilfe } from '../Hilfe';
import { useKonto } from '../konto';

/**
 * Zwei-Faktor-Anmeldung (#242): Einrichten mit einer Authenticator-App, Wiederherstellungscodes,
 * Abschalten. Dieselbe Einrichtung zeigt der Pflicht-Bildschirm nach der Anmeldung.
 */

const datum = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Zehn Einmalcodes – nur jetzt sichtbar; zum Ausdrucken oder Abspeichern. */
export function Wiederherstellungscodes({ codes, weiter }: { codes: string[]; weiter: () => void }) {
  const [gesichert, setGesichert] = useState(false);
  const text = `Wiederherstellungscodes (je einmal verwendbar)\n\n${codes.join('\n')}\n`;
  return (
    <div className="stapel">
      <p className="hinweis warn">Bewahre diese Codes sicher auf – getrennt vom Handy. Ohne Handy kommst du nur mit einem davon wieder hinein. Jeder Code gilt einmal. Sie werden nur jetzt angezeigt.</p>
      <ol className="codes" aria-label="Wiederherstellungscodes">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ol>
      <div className="knoepfe">
        <button type="button" className="knopf" onClick={() => { void navigator.clipboard?.writeText(text); setGesichert(true); }}>Kopieren</button>
        <a className="knopf" href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`} download="wiederherstellungscodes.txt" onClick={() => setGesichert(true)}>Als Datei speichern</a>
        <button type="button" className="knopf" onClick={() => { print(); setGesichert(true); }}>Drucken</button>
      </div>
      <label className="haken"><input type="checkbox" checked={gesichert} onChange={(e) => setGesichert(e.target.checked)} /><span>Ich habe die Codes gesichert.</span></label>
      <div className="knoepfe"><button type="button" className="knopf primaer" disabled={!gesichert} onClick={weiter}>Fertig</button></div>
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
    <form className="stapel" onSubmit={bestaetigen}>
      <p>1. Öffne eine Authenticator-App auf deinem Handy (z. B. Google Authenticator, Microsoft Authenticator, Aegis, 2FAS, Bitwarden oder den Passwort-Manager deines Geräts) und scanne den Code.</p>
      {entwurf ? (
        <div className="qr">
          <img src={entwurf.bild} width={200} height={200} alt="QR-Code für die Authenticator-App" />
          <div>
            <p className="leise klein">Scannen geht nicht? Gib diesen Schlüssel von Hand ein:</p>
            <code className="geheimnis">{entwurf.geheimnis}</code>
          </div>
        </div>
      ) : !fehler && <p className="leise">Erzeuge Schlüssel …</p>}
      <label className="eigenschaft"><span>2. Sechsstelligen Code aus der App eingeben</span>
        <input id="zweifaktor-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required />
      </label>
      {fehler && <p className="fehlertext">{fehler}</p>}
      <div className="knoepfe">
        {abbrechen && <button type="button" className="knopf" onClick={abbrechen}>Abbrechen</button>}
        <button className="knopf primaer" disabled={sendet || !entwurf}>Bestätigen</button>
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
      else { await api.zweifaktorEntfernen(pw); setModus('ruhe'); setMeldung({ art: 'gut', text: 'Zwei-Faktor-Anmeldung abgeschaltet.' }); await laden(); }
      setPw('');
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }

  return (
    <div className="blatt" id="zweifaktor">
      <h2 className="h3">Zwei-Faktor-Anmeldung <Hilfe ort="profil.zweifaktor" /></h2>
      <p className="leise">Neben dem Passwort fragt das DMS bei der Anmeldung einen Code aus einer App auf deinem Handy ab. Wer nur dein Passwort kennt, kommt dann nicht hinein.</p>
      {!stand ? <p className="leise">Lade …</p> : modus === 'einrichten' ? (
        <ZweifaktorEinrichten fertig={() => { setModus('ruhe'); setMeldung({ art: 'gut', text: 'Zwei-Faktor-Anmeldung eingerichtet.' }); void laden(); void aktualisieren(); }} abbrechen={() => setModus('ruhe')} />
      ) : neueCodes ? (
        <Wiederherstellungscodes codes={neueCodes} weiter={() => { setNeueCodes(null); setModus('ruhe'); void laden(); }} />
      ) : stand.aktiv ? (
        <>
          <p><span className="chip gut punkt">eingerichtet</span>{stand.seit && <> seit {datum(stand.seit)}</>} · {stand.codesUebrig} von 10 Wiederherstellungscodes übrig</p>
          {stand.codesUebrig <= 3 && <p className="hinweis warn">Nur noch {stand.codesUebrig} Wiederherstellungscodes. Erzeuge neue.</p>}
          {modus === 'ruhe' ? (
            <div className="knoepfe">
              <button type="button" className="knopf" onClick={() => setModus('codes')}>Neue Wiederherstellungscodes</button>
              {!stand.pflicht && <button type="button" className="knopf gefahr-rand" onClick={() => setModus('aus')}>Abschalten</button>}
            </div>
          ) : (
            <form className="stapel" onSubmit={mitPasswort}>
              <p className="leise">{modus === 'codes' ? 'Die bisherigen Codes gelten danach nicht mehr.' : 'Danach reicht wieder das Passwort allein.'} Bitte mit deinem Passwort bestätigen.</p>
              <label className="eigenschaft"><span>Aktuelles Passwort</span><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" autoFocus required /></label>
              <div className="knoepfe">
                <button type="button" className="knopf" onClick={() => { setModus('ruhe'); setPw(''); }}>Abbrechen</button>
                <button className={`knopf ${modus === 'aus' ? 'gefahr' : 'primaer'}`} disabled={!pw}>{modus === 'codes' ? 'Neue Codes erzeugen' : 'Abschalten'}</button>
              </div>
            </form>
          )}
          {stand.pflicht && <p className="leise klein">Für deine Rolle ist die Zwei-Faktor-Anmeldung vorgeschrieben. Neues Handy? Ein Administrator kann sie zurücksetzen; dann richtest du sie neu ein.</p>}
        </>
      ) : (
        <div className="knoepfe"><button type="button" className="knopf primaer" onClick={() => { setMeldung(undefined); setModus('einrichten'); }}>Einrichten</button></div>
      )}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
    </div>
  );
}
