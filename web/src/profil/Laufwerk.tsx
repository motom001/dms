import { useEffect, useState, type ReactNode } from 'react';
import { kontoApi, type ApiSchluessel } from '../api/konto';
import { Hilfe, useHandbuch } from '../Hilfe';
import { t } from '../sprache';
import { NeuerSchluessel } from './ApiSchluessel';
import { Feld, Knopf, KnopfLink, Umschalter } from '../bausteine';

/**
 * Mein Konto → Laufwerk (#720): Adresse, Benutzername, Schlüssel und eine kurze Anleitung je Gerät.
 * Nur sichtbar, wenn der Administrator das Laufwerk eingeschaltet hat. Seit #1332 „erst erklären, dann tun“: oben die
 * Erklärung mit der Wahl des Geräts und seiner Anleitung, darunter die Schritte in der Reihenfolge des Ablaufs –
 * Schlüssel anlegen, Adresse und Benutzername kopieren, im Gerät eintragen.
 */
const GERAETE = [
  { k: 'windows', anker: 'windows', schritte: 5 },
  { k: 'mac', anker: 'mac-finder', schritte: 3 },
  { k: 'iphone', anker: 'iphone-und-ipad-dateien-app', schritte: 4 },
] as const;
type Geraet = (typeof GERAETE)[number]['k'];

/** Vorwahl des Geräts nach dem Browser; die Seite merkt sich die Wahl nicht. */
function geraetVorwahl(): Geraet {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iphone';
  return /Macintosh|Mac OS X/.test(ua) ? 'mac' : 'windows';
}

/** Text kopieren; ohne Erlaubnis (oder ohne HTTPS) markiert der Knopf ihn zum Kopieren von Hand. */
function KopierFeld({ wert, beschriftung, id }: { wert: string; beschriftung: string; id: string }) {
  const [stand, setStand] = useState<'' | 'kopiert' | 'markiert'>('');
  function kopieren() {
    const feld = document.getElementById(id) as HTMLInputElement | null;
    const markieren = () => {
      feld?.focus();
      feld?.select();
      setStand('markiert');
    };
    if (!navigator.clipboard) {
      markieren();
      return;
    }
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

type Stand = { adresse: string; https: boolean; benutzername: string };

/** Erklärung oben (#1332): wozu die Seite da ist, die Wahl des Geräts und dessen Anleitung. */
function Erklaerung({ s, geraet, setGeraet }: { s: Stand; geraet: Geraet; setGeraet(g: Geraet): void }) {
  const handbuch = useHandbuch();
  const g = GERAETE.find((x) => x.k === geraet) ?? GERAETE[0];
  return (
    <section className="blatt" aria-labelledby="laufwerk-titel">
      <h2 className="h3" id="laufwerk-titel">
        {t('profil.laufwerk.titel')} <Hilfe ort="profil.laufwerk" />
      </h2>
      <p className="leise">{t('profil.laufwerk.einleitung')}</p>
      {!s.https && (
        <div className="hinweis warn">
          <p>{t('profil.laufwerk.ohneHttps')}</p>
        </div>
      )}
      <h3 id="laufwerk-geraete">{t('profil.laufwerk.geraete')}</h3>
      <Umschalter
        wert={geraet}
        setze={setGeraet}
        beschriftung={t('profil.laufwerk.geraet')}
        schmalUntereinander
        wahlen={GERAETE.map((x) => ({ wert: x.k, text: t.frei(`profil.laufwerk.kurz.${x.k}`) }))}
      />
      <div id="laufwerk-anleitung" className="laufwerk-anleitung" role="group" aria-label={t.frei(`profil.laufwerk.${g.k}`)}>
        <ol>
          {Array.from({ length: g.schritte }, (_, i) => (
            <li key={i}>{t.frei(`profil.laufwerk.${g.k}.${i + 1}`, { adresse: s.adresse })}</li>
          ))}
        </ol>
        <p className="leise klein">
          <a href={`${handbuch('benutzer', 'laufwerk/')}#${g.anker}`} target="_blank" rel="noreferrer">
            {t('profil.laufwerk.mehr')}
          </a>
        </p>
      </div>
    </section>
  );
}

/** Ein Schritt der Liste „Der Reihe nach“: Überschrift mit Nummer aus der Liste, darunter, was zu tun ist. */
function Schritt({ id, titel, children }: { id: string; titel: string; children: ReactNode }) {
  return (
    <li>
      <h3 id={id}>{titel}</h3>
      {children}
    </li>
  );
}

/** Erster Schritt: Schlüssel anlegen (#818: auch wer verwaltet, nutzt das Laufwerk – der Schlüssel bekommt nie Verwaltungsrechte). */
function SchluesselSchritt() {
  const [fehler, setFehler] = useState<string>();
  const [neu, setNeu] = useState<(ApiSchluessel & { schluessel: string }) | null>(null);
  const [sendet, setSendet] = useState(false);
  async function schluessel() {
    setSendet(true);
    setFehler(undefined);
    try {
      setNeu(
        await kontoApi.apiSchluesselAnlegen({
          name: t('profil.laufwerk.schluesselname'),
          recht: 'schreiben',
          ablauf: null,
          passwoerter: false,
        }),
      );
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setSendet(false);
    }
  }
  return (
    <Schritt id="laufwerk-schluessel" titel={t('profil.laufwerk.schluessel')}>
      <p className="leise">{t('profil.laufwerk.schluessel.text')}</p>
      {fehler && (
        <div className="hinweis schlecht">
          <p>{fehler}</p>
        </div>
      )}
      {neu ? (
        <NeuerSchluessel s={neu} schliessen={() => setNeu(null)} />
      ) : (
        <div className="knoepfe">
          <Knopf art="haupt" laeuft={sendet} onClick={schluessel}>
            {t('profil.laufwerk.schluessel.anlegen')}
          </Knopf>
          <KnopfLink to="/profil/sicherheit">{t('profil.laufwerk.schluessel.alle')}</KnopfLink>
        </div>
      )}
    </Schritt>
  );
}

export function LaufwerkBereich() {
  const [s, setS] = useState<Stand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [geraet, setGeraet] = useState<Geraet>(geraetVorwahl);
  useEffect(() => {
    kontoApi.laufwerk().then(setS, (e) => setFehler((e as Error).message));
  }, []);
  if (!s)
    return fehler ? (
      <div className="hinweis schlecht">
        <p>{fehler}</p>
      </div>
    ) : (
      <p className="leise">{t('profil.laufwerk.lade')}</p>
    );
  return (
    <>
      <Erklaerung s={s} geraet={geraet} setGeraet={setGeraet} />
      <section className="blatt" aria-labelledby="laufwerk-schritte">
        <h2 className="h3" id="laufwerk-schritte">
          {t('profil.laufwerk.schritte')}
        </h2>
        <ol className="laufwerk-schritte">
          <SchluesselSchritt />
          <Schritt id="laufwerk-kopieren" titel={t('profil.laufwerk.kopieren.titel')}>
            <KopierFeld id="laufwerk-adresse" beschriftung={t('profil.laufwerk.adresse')} wert={s.adresse} />
            <KopierFeld id="laufwerk-benutzer" beschriftung={t('profil.laufwerk.benutzername')} wert={s.benutzername} />
            <p className="leise klein">{t('profil.laufwerk.passwort')}</p>
          </Schritt>
          <Schritt id="laufwerk-eintragen" titel={t('profil.laufwerk.eintragen')}>
            <p>
              {t('profil.laufwerk.eintragen.text', { geraet: t.frei(`profil.laufwerk.${geraet}`) })}{' '}
              <a href="#laufwerk-geraete" className="verweis">
                {t('profil.laufwerk.zur-anleitung')}
              </a>
            </p>
          </Schritt>
        </ol>
      </section>
    </>
  );
}
