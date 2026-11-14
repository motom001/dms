import { useEffect, useState } from 'react';
import { api, type ApiSchluessel } from '../api';
import { Hilfe, useHandbuch } from '../Hilfe';
import { t } from '../sprache';
import { NeuerSchluessel } from './ApiSchluessel';
import { Feld, Knopf, KnopfLink } from '../bausteine';

/**
 * Mein Konto → Laufwerk (#720): Adresse, Benutzername, Schlüssel und eine kurze Anleitung je Gerät.
 * Nur sichtbar, wenn der Administrator das Laufwerk eingeschaltet hat.
 */
const GERAETE = [
  { k: 'windows', anker: 'windows', schritte: 5 },
  { k: 'mac', anker: 'mac-finder', schritte: 3 },
  { k: 'iphone', anker: 'iphone-und-ipad-dateien-app', schritte: 4 },
] as const;

/** Text kopieren; ohne Erlaubnis (oder ohne HTTPS) markiert der Knopf ihn zum Kopieren von Hand. */
function KopierFeld({ wert, beschriftung, id }: { wert: string; beschriftung: string; id: string }) {
  const [stand, setStand] = useState<'' | 'kopiert' | 'markiert'>('');
  function kopieren() {
    const feld = document.getElementById(id) as HTMLInputElement | null;
    const markieren = () => { feld?.focus(); feld?.select(); setStand('markiert'); };
    if (!navigator.clipboard) { markieren(); return; }
    navigator.clipboard.writeText(wert).then(() => setStand('kopiert'), markieren);
  }
  return (
    <Feld id={id} beschriftung={beschriftung} hinweis={stand === 'markiert' && <span role="status">{t('profil.laufwerk.markiert')}</span>}>
      {(v) => (
        <div className="linkzeile">
          <input {...v} className="mono" readOnly value={wert} onFocus={(e) => e.target.select()} />
          <Knopf onClick={kopieren}>{stand === 'kopiert' ? t('profil.laufwerk.kopiert') : t('profil.laufwerk.kopieren')}</Knopf>
        </div>
      )}
    </Feld>
  );
}

export function LaufwerkBereich() {
  const handbuch = useHandbuch();
  const [s, setS] = useState<{ adresse: string; https: boolean; benutzername: string } | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [neu, setNeu] = useState<(ApiSchluessel & { schluessel: string }) | null>(null);
  const [sendet, setSendet] = useState(false);
  useEffect(() => { api.laufwerk().then(setS, (e) => setFehler((e as Error).message)); }, []);
  async function schluessel() {
    setSendet(true); setFehler(undefined);
    try { setNeu(await api.apiSchluesselAnlegen({ name: t('profil.laufwerk.schluesselname'), recht: 'schreiben', ablauf: null, passwoerter: false })); }
    catch (e) { setFehler((e as Error).message); } finally { setSendet(false); }
  }
  if (!s) return fehler ? <div className="hinweis schlecht"><p>{fehler}</p></div> : <p className="leise">{t('profil.laufwerk.lade')}</p>;
  return (
    <>
      <section className="blatt" aria-labelledby="laufwerk-titel">
        <h2 className="h3" id="laufwerk-titel">{t('profil.laufwerk.titel')} <Hilfe ort="profil.laufwerk" /></h2>
        <p className="leise">{t('profil.laufwerk.einleitung')}</p>
        <KopierFeld id="laufwerk-adresse" beschriftung={t('profil.laufwerk.adresse')} wert={s.adresse} />
        <KopierFeld id="laufwerk-benutzer" beschriftung={t('profil.laufwerk.benutzername')} wert={s.benutzername} />
        <p className="leise klein">{t('profil.laufwerk.passwort')}</p>
        {!s.https && <div className="hinweis warn"><p>{t('profil.laufwerk.ohneHttps')}</p></div>}
      </section>
      <section className="blatt" aria-labelledby="laufwerk-schluessel">
        <h2 className="h3" id="laufwerk-schluessel">{t('profil.laufwerk.schluessel')}</h2>
        {/* #818: Auch wer verwaltet, nutzt das Laufwerk – der Schlüssel bekommt nie Verwaltungsrechte. */}
        <p className="leise">{t('profil.laufwerk.schluessel.text')}</p>
        {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
        {neu ? <NeuerSchluessel s={neu} schliessen={() => setNeu(null)} />
          : <div className="knoepfe"><Knopf art="haupt" laeuft={sendet} onClick={schluessel}>{t('profil.laufwerk.schluessel.anlegen')}</Knopf>
              <KnopfLink to="/profil/sicherheit">{t('profil.laufwerk.schluessel.alle')}</KnopfLink></div>}
      </section>
      <section className="blatt" aria-labelledby="laufwerk-geraete">
        <h2 className="h3" id="laufwerk-geraete">{t('profil.laufwerk.geraete')}</h2>
        {GERAETE.map((g) => (
          <details key={g.k} className="aufklappbereich">
            <summary>{t.frei(`profil.laufwerk.${g.k}`)}</summary>
            <ol>{Array.from({ length: g.schritte }, (_, i) => <li key={i}>{t.frei(`profil.laufwerk.${g.k}.${i + 1}`, { adresse: s.adresse })}</li>)}</ol>
            <p className="leise klein"><a href={`${handbuch('benutzer', 'laufwerk/')}#${g.anker}`} target="_blank" rel="noreferrer">{t('profil.laufwerk.mehr')}</a></p>
          </details>
        ))}
      </section>
    </>
  );
}
