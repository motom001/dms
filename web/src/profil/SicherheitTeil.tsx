import { useCallback, useEffect, useState } from 'react';
import { geraetText, istGeradeAktiv, PASSWORT_MINDESTLAENGE, type Sitzung } from '../../../shared/src/model';
import { kontoApi } from '../api/konto';
import { ApiSchluesselBlatt } from './ApiSchluessel';
import { useDaten } from '../daten';
import { ZweifaktorBlatt } from './Zweifaktor';
import { PasskeyBlatt } from './Passkeys';
import { DokumentPasswoerter } from './DokumentPasswoerter';
import { useKonto } from '../konto';
import { t } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { Feld, Knopf, Schalter } from '../bausteine';
import type { ProfilZustand } from './useProfil';

/** Profil → Sicherheit (#1279 aus Profil.tsx gezogen): Passwort, Passkeys, Zwei-Faktor, Geräte, API-Schlüssel, Papierkorb. */
export function SicherheitTeil({ z }: { z: ProfilZustand }) {
  const { ich } = useKonto();
  const d = useDaten();
  const { alt, setAlt, neu, setNeu, neu2, setNeu2, fPw } = z;
  return (
    <>
      <form className="blatt" onSubmit={fPw.absenden}>
        <h2 className="h3">{t('profil.profil.passwort')}</h2>
        <input type="email" value={ich.email} autoComplete="username" readOnly hidden />
        <div className="raster">
          <Feld beschriftung={t('profil.profil.aktuelles-passwort')}>
            <input type="password" value={alt} onChange={(e) => setAlt(e.target.value)} autoComplete="current-password" required />
          </Feld>
          <Feld
            beschriftung={t('profil.profil.neues-passwort')}
            hinweis={t('profil.profil.mindestens-zeichen', { PASSWORT_MINDESTLAENGE })}>
            <input type="password" value={neu} onChange={(e) => setNeu(e.target.value)} autoComplete="new-password" required />
          </Feld>
          <Feld beschriftung={t('profil.profil.neues-passwort-wiederholen')}>
            <input type="password" value={neu2} onChange={(e) => setNeu2(e.target.value)} autoComplete="new-password" required />
          </Feld>
        </div>
        {fPw.anzeige}
        <div className="knoepfe">
          <Knopf art="haupt" type="submit" laeuft={fPw.sendet} gesperrt={!alt || !neu}>
            {t('profil.profil.passwort-aendern')}
          </Knopf>
        </div>
      </form>

      <PasskeyBlatt />

      <ZweifaktorBlatt />

      <MeineGeraete />

      <DokumentPasswoerter />

      <ApiSchluesselBlatt />

      {/* #420: Löschen gehört zur Sicherheit. */}
      {(!!d.zaehler.papierkorbTage || d.einstellungen.papierkorb_beim_abmelden === true) && (
        <div className="blatt">
          <h2 className="h3">{t('profil.profil.papierkorb')}</h2>
          <p className="leise">
            {t('profil.profil.was-du-loeschst-bleibt', {
              wert:
                d.zaehler.papierkorbTage === 1
                  ? t('profil.profil.einen-tag')
                  : t('profil.profil.tage', { wert: d.zaehler.papierkorbTage ?? 0 }),
            })}
          </p>
          <Schalter
            an={d.einstellungen.papierkorb_beim_abmelden === true}
            setze={(an) => d.setzeEinstellung('papierkorb_beim_abmelden', an || null)}
            beschriftung={t('profil.profil.beim-abmelden-leeren')}
            hinweis={t('profil.profil.deine-geloeschten-mappen-werden')}
          />
        </div>
      )}
    </>
  );
}

const datumZeit = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' }) : '–';

/** Meine angemeldeten Geräte (#69): ansehen, einzeln oder alle anderen abmelden. */
function MeineGeraete() {
  const { vertretung } = useKonto();
  const [liste, setListe] = useState<Sitzung[] | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const laden = useCallback(async () => {
    try {
      setListe(await kontoApi.meineSitzungen());
    } catch (e) {
      setMeldung({ art: 'schlecht', text: (e as Error).message });
    }
  }, []);
  useEffect(() => {
    void laden();
  }, [laden]);
  async function tu(f: () => Promise<string>) {
    setMeldung(undefined);
    try {
      setMeldung({ art: 'gut', text: await f() });
      await laden();
    } catch (e) {
      setMeldung({ art: 'schlecht', text: (e as Error).message });
    }
  }
  const andere = (liste ?? []).filter((s) => !s.aktuell);
  return (
    <div className="blatt">
      <h2 className="h3">{t('profil.profil.meine-angemeldeten-geraete')}</h2>
      <p className="leise">{t('profil.profil.ueberall-wo-du-gerade')}</p>
      {liste === null ? (
        <p className="leise">{t('profil.profil.lade')}</p>
      ) : (
        <ul className="sitzungsliste">
          {liste.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{geraetText(s.geraet)}</strong>
                {s.aktuell && (
                  <>
                    {' '}
                    <span className="chip">{t('profil.profil.dieses-geraet')}</span>
                  </>
                )}
                {s.vertretungId && (
                  <>
                    {' '}
                    <span className="chip warn">{t('konten.verwaltende.vertretung.chip')}</span>
                  </>
                )}
                {istGeradeAktiv(s.zuletztAktiv) && (
                  <>
                    {' '}
                    <span className="chip gut punkt">{t('profil.profil.gerade-aktiv')}</span>
                  </>
                )}
                <span className="leise klein blockzeile">
                  {t('profil.profil.zuletzt-aktiv-angemeldet-seit', {
                    datumZeit: datumZeit(s.zuletztAktiv),
                    datumZeit2: datumZeit(s.erstellt),
                    wert: s.ip ? ` · ${s.ip}` : '',
                  })}
                </span>
              </div>
              {!s.aktuell && !vertretung && (
                <Knopf
                  art="gefahr"
                  symbol="abmelden"
                  rueckfrage={{
                    titel: t('profil.profil.geraet-abmelden.frage', { geraet: geraetText(s.geraet) }),
                    text: t('profil.profil.geraet-abmelden.text'),
                    ja: t('profil.profil.abmelden'),
                  }}
                  onClick={() =>
                    tu(async () => {
                      await kontoApi.meineSitzungBeenden(s.id);
                      return t('profil.profil.geraet-abgemeldet');
                    })
                  }>
                  {t('profil.profil.abmelden')}
                </Knopf>
              )}
            </li>
          ))}
        </ul>
      )}
      {meldung && (
        <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">
          {meldung.text}
        </p>
      )}
      {andere.length > 0 && !vertretung && (
        <div className="knoepfe">
          <Knopf
            art="gefahr"
            symbol="abmelden"
            rueckfrage={{
              titel: t('profil.profil.auf-allen-anderen-geraeten', { anzahl: andere.length }),
              ja: t('profil.profil.abmelden'),
            }}
            onClick={() =>
              tu(async () => {
                const r = await kontoApi.andereSitzungenBeenden();
                return t('profil.profil.geraete-abgemeldet', { anzahl: r.beendet });
              })
            }>
            {t('profil.profil.alle-anderen-abmelden')}
          </Knopf>
        </div>
      )}
    </div>
  );
}
