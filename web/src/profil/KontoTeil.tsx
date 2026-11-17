import { useEffect, useState } from 'react';
import { kontoApi } from '../api/konto';
import { useKonto } from '../konto';
import { Hilfe } from '../Hilfe';
import { RECHTE, RECHTE_LISTE } from '../../../shared/src/rechte';
import { t, tn, wechsleSprache } from '../sprache';
import { sprachname } from '../../../shared/src/beschriftung';
import { MITMACHEN_URL } from '../../../shared/src/sprachwahl';
import { Feld, Knopf, Schalter } from '../bausteine';
import { MeinExport } from './MeinExport';
import type { ProfilZustand } from './useProfil';

/** Profil → Konto (#1279 aus Profil.tsx gezogen): Name, Sprache, E-Mail-Adresse, Rechte und eigener Export. */
export function KontoTeil({ z }: { z: ProfilZustand }) {
  const { ich, mail } = useKonto();
  const { name, setName, email, setEmail, pwEmail, setPwEmail, fName, fEmail } = z;
  return (
    <>
      <form className="blatt" onSubmit={fName.absenden}>
        <h2 className="h3">{t('profil.profil.name')}</h2>
        <Feld beschriftung={t('profil.profil.so-erscheinst-du-bei')}>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Feld>
        {fName.anzeige}
        <div className="knoepfe">
          <Knopf art="haupt" type="submit" laeuft={fName.sendet} gesperrt={!name.trim() || name === ich.name}>
            {t('profil.profil.speichern')}
          </Knopf>
        </div>
      </form>

      <SpracheWaehlen />

      <form className="blatt" onSubmit={fEmail.absenden}>
        <h2 className="h3">{t('profil.profil.e-mail-adresse')}</h2>
        <p className="leise">{t('profil.profil.damit-meldest-du-dich', { wert: mail ? t('profil.profil.und-bekommst-links-zum') : '' })}</p>
        <div className="raster">
          <Feld beschriftung={t('profil.profil.neue-adresse')}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </Feld>
          <Feld beschriftung={t('profil.profil.aktuelles-passwort')}>
            <input type="password" value={pwEmail} onChange={(e) => setPwEmail(e.target.value)} autoComplete="current-password" required />
          </Feld>
        </div>
        {fEmail.anzeige}
        <div className="knoepfe">
          <Knopf art="haupt" type="submit" laeuft={fEmail.sendet} gesperrt={email === ich.email || !pwEmail}>
            {t('profil.profil.adresse-aendern')}
          </Knopf>
        </div>
      </form>

      {/* Nur zum Nachlesen – deshalb unter den Formularen (#198). */}
      <MeineRechte admin={ich.rolle === 'admin'} />

      <MeinExport />
    </>
  );
}

const STUFE = {
  immer: t('profil.profil.stufe.immer'),
  nie: t('profil.profil.stufe.nie'),
  teils: t('profil.profil.je-nach-mappe'),
} as const;

/** Was darf ich? (#126) Je Mappentyp und Recht: ja, nein oder je nach Mappe – ohne die Regeln selbst. */
function MeineRechte({ admin }: { admin: boolean }) {
  const [liste, setListe] = useState<Awaited<ReturnType<typeof kontoApi.meineRechte>>>();
  useEffect(() => {
    kontoApi
      .meineRechte()
      .then(setListe)
      .catch(() => setListe([]));
  }, []);
  return (
    <section className="blatt">
      <h2 className="h3">{tn('profil.profil.meine-rechte', { hilfe: <Hilfe ort="profil.rechte" /> })}</h2>
      {admin ? (
        <p className="leise">{t('profil.rechte.verwaltungsmodus')}</p>
      ) : (
        <p className="leise">{t('profil.profil.was-du-je-mappentyp')}</p>
      )}
      {!liste ? (
        <p className="leise">{t('profil.profil.lade')}</p>
      ) : (
        <div className="tabellenrahmen">
          <table>
            <thead>
              <tr>
                <th>{t('profil.profil.mappentyp')}</th>
                {RECHTE_LISTE.map((k) => (
                  <th key={k} title={RECHTE[k]}>
                    {RECHTE[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {liste.map((eintrag) => (
                <tr key={eintrag.typId}>
                  <td>{eintrag.name}</td>
                  {RECHTE_LISTE.map((k) => (
                    <td key={k} className={eintrag.rechte[k] === 'nie' ? 'leise' : ''}>
                      {STUFE[eintrag.rechte[k]]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Sprache (#729): Jede Person wählt aus den Sprachen, die der Administrator erlaubt hat; „Wie die Ablage“ folgt der
 * Sprache der Installation. Die Oberfläche lädt danach neu, damit alle Texte in der neuen Sprache entstehen.
 */
function SpracheWaehlen() {
  const { ich, sprachen } = useKonto();
  const [wahl, setWahl] = useState(ich.sprache && sprachen.erlaubt.includes(ich.sprache) ? ich.sprache : '');
  const [fehler, setFehler] = useState<string>();
  const [sendet, setSendet] = useState(false);
  const gilt = wahl || sprachen.standard;
  const name = (s: string) => sprachname(s, s);
  async function speichern(neu: string) {
    setWahl(neu);
    setSendet(true);
    setFehler(undefined);
    try {
      await kontoApi.eigeneSprache(neu || null);
      wechsleSprache(neu || sprachen.standard);
    } catch (e) {
      setFehler((e as Error).message);
      setWahl(ich.sprache ?? '');
    } finally {
      setSendet(false);
    }
  }
  return (
    <div className="blatt">
      <h2 className="h3">{tn('profil.sprache.titel', { hilfe: <Hilfe ort="profil.sprache" /> })}</h2>
      <Feld beschriftung={t('profil.sprache.wahl')}>
        <select id="profil-sprache" value={wahl} disabled={sendet} onChange={(e) => void speichern(e.target.value)}>
          <option value="">{t('profil.sprache.wie-ablage', { sprache: name(sprachen.standard) })}</option>
          {sprachen.erlaubt.map((s) => (
            <option key={s} value={s} lang={s}>
              {name(s)}
            </option>
          ))}
        </select>
      </Feld>
      {/* Sprachpaket entfernt (#731): Die Wahl bleibt gespeichert, es gilt die Sprache der Ablage – das sagen wir. */}
      {ich.sprache && !sprachen.erlaubt.includes(ich.sprache) && (
        <div className="hinweis info">
          <p>{t('profil.sprache.weg', { sprache: name(ich.sprache), ablage: name(sprachen.standard) })}</p>
        </div>
      )}
      {sprachen.maschinell.includes(gilt) && (
        <p className="leise klein">
          {tn('profil.sprache.maschinell', {
            link: (
              <a href={MITMACHEN_URL} target="_blank" rel="noreferrer">
                {t('profil.sprache.mitmachen')}
              </a>
            ),
          })}
        </p>
      )}
      <UebersetzenWahl />
      {fehler && (
        <div className="hinweis schlecht">
          <p>{fehler}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Übersetzung anzeigen (#732): Jede Person kann den Knopf an Feldern, Notizen und Volltexten für sich abschalten.
 * Den Schalter gibt es nur, wenn der Administrator das Übersetzen anbietet und ein Paket dafür läuft.
 */
function UebersetzenWahl() {
  const { uebersetzen, aktualisieren } = useKonto();
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string>();
  if (!uebersetzen) return null;
  async function schalte(an: boolean) {
    setSendet(true);
    setFehler(undefined);
    try {
      await kontoApi.eigenesUebersetzen(an);
      await aktualisieren();
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setSendet(false);
    }
  }
  return (
    <>
      <Schalter
        id="profil-uebersetzen"
        an={!uebersetzen.aus}
        gesperrt={sendet}
        setze={(an) => schalte(an)}
        beschriftung={t('profil.uebersetzen.anbieten')}
        hinweis={
          <>
            {uebersetzen.netz
              ? t('profil.uebersetzen.netz', { paket: uebersetzen.paket.name, ziele: uebersetzen.netz.join(', ') })
              : t('profil.uebersetzen.lokal', { paket: uebersetzen.paket.name })}{' '}
            <Hilfe ort="profil.uebersetzen" />
          </>
        }
      />
      {fehler && (
        <div className="hinweis schlecht">
          <p>{fehler}</p>
        </div>
      )}
    </>
  );
}
