import { useState } from 'react';
import { FAVORIT_ERWAEHNT, FAVORIT_ERWAEHNT_WAHL, favoritErwaehntWahl } from '../../../shared/src/erwaehnen';
import { ZusammenfassungEinstellen } from './Zusammenfassung';
import { kontoApi } from '../api/konto';
import { bereicheZuruecksetzen } from '../bereiche';
import { useDaten } from '../daten';
import { GRUNDLAGEN, leseSchrift, SCHRIFTEN, setzeSchrift, type Schrift } from '../design';
import { Farbfelder } from '../werkbank/Designs';
import { useKonto } from '../konto';
import { Hilfe } from '../Hilfe';
import { t, tn } from '../sprache';
import { Feld, FeldGruppe, Knopf, Schalter, Umschalter } from '../bausteine';
import type { ProfilZustand } from './useProfil';

/** Profil → Darstellung und Benachrichtigungen (#1279 aus Profil.tsx gezogen). */
export function DarstellungTeil({ z }: { z: ProfilZustand }) {
  const { ich, aktualisieren } = useKonto();
  const d = useDaten();
  const { entwickler, setEntwickler, ansicht, setAnsicht } = z;
  return (
    <>
      <div className="blatt">
        <h2 className="h3">{t('profil.profil.design')}</h2>
        <p className="leise">{t('profil.profil.gilt-fuer-dein-konto')}</p>
        <FeldGruppe beschriftung={t('profil.profil.design')} beschriftungVerbergen>
          <div className="designwahl">
            <label>
              <input
                type="radio"
                name="design"
                checked={!d.einstellungen.design || !d.designs.some((x) => x.id === d.einstellungen.design)}
                onChange={() => d.setzeEinstellung('design', null)}
              />
              <span className="nm">
                <strong>{t('profil.profil.standard')}</strong>
                <span className="leise klein">
                  {t('profil.profil.zurzeit')} {d.designs.find((x) => x.id === d.standardDesign)?.name ?? '–'}
                </span>
              </span>
            </label>
            {d.designs.map((x) => (
              <label key={x.id}>
                <input
                  type="radio"
                  name="design"
                  checked={d.einstellungen.design === x.id}
                  onChange={() => d.setzeEinstellung('design', x.id)}
                />
                <span className="nm">
                  <strong>{x.name}</strong>
                  <span className="leise klein">
                    <Farbfelder d={x} /> {GRUNDLAGEN[x.grundlage]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </FeldGruppe>
      </div>

      <SchriftWahl />

      {/* #420: Die Startseite steuert, was du siehst – deshalb unter Darstellung. */}
      <div className="blatt" data-anker="konto.startseite">
        <h2 className="h3">{t('profil.profil.startseite')}</h2>
        <p className="leise">{t('profil.profil.die-startseite-der-ablage')}</p>
        <Schalter
          an={d.einstellungen.startseite !== false}
          setze={(an) => d.setzeEinstellung('startseite', an ? null : false)}
          beschriftung={t('profil.profil.mit-der-startseite-beginnen')}
          hinweis={t('profil.profil.aus-nach-der-anmeldung')}
        />
        {d.einstellungen.startseite !== false && (
          <Feld beschriftung={t('profil.profil.vierte-kachel')}>
            <select
              value={typeof d.einstellungen.startseite_kachel === 'string' ? d.einstellungen.startseite_kachel : 'favoriten'}
              onChange={(e) => d.setzeEinstellung('startseite_kachel', e.target.value === 'favoriten' ? null : e.target.value)}>
              <option value="favoriten">{t('profil.profil.favoriten')}</option>
              {d.sichten
                .filter((s) => s.typen.length > 0)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {t('profil.profil.ansicht', { name: s.name })}
                  </option>
                ))}
            </select>
          </Feld>
        )}
        {/* Tipp des Tages (#832): an (Vorgabe) oder aus; „Ablago entdecken“ zeigt alle Tipps trotzdem. */}
        <div data-anker="konto.tipps">
          <Schalter
            an={d.einstellungen.tipps !== false}
            setze={(an) => d.setzeEinstellung('tipps', an ? null : false)}
            beschriftung={t('entdecken.konto.tipps')}
            hinweis={t('entdecken.konto.tipps.hilfe')}
          />
        </div>
      </div>

      {/* #725: Darstellung, keine Benachrichtigung – deshalb hier statt unter Benachrichtigungen. */}
      <div className="blatt">
        <h2 className="h3">{t('profil.profil.geaenderte-mappen')}</h2>
        <Schalter
          an={d.einstellungen.geaenderte_hervorheben !== false}
          setze={(an) => d.setzeEinstellung('geaenderte_hervorheben', an ? null : false)}
          beschriftung={t('profil.profil.geaenderte-favoriten-und-eigene')}
          hinweis={t('profil.profil.mit-einem-punkt-vor')}
        />
      </div>

      <div className="blatt">
        <h2 className="h3">{t('profil.profil.darstellung-auf-diesem-geraet')}</h2>
        <p className="leise">{t('profil.profil.die-breite-der-bereiche')}</p>
        <div className="knoepfe">
          <Knopf
            symbol="zuruecksetzen"
            onClick={() => {
              bereicheZuruecksetzen(ich.id);
              setAnsicht(true);
            }}>
            {t('profil.profil.standard-darstellung')}
          </Knopf>
        </div>
        {ansicht && (
          <p className="gutertext" role="status">
            {t('profil.profil.breiten-zurueckgesetzt')}
          </p>
        )}
      </div>

      <div className="blatt">
        <h2 className="h3">{t('profil.profil.entwicklermodus')}</h2>
        <p className="leise">{t('profil.profil.zeigt-unten-rechts-bei')}</p>
        <Schalter
          an={entwickler}
          beschriftung={t('profil.profil.zeitmessung-anzeigen')}
          setze={(an) => {
            setEntwickler(an);
            void kontoApi
              .entwicklermodus(an)
              .then(aktualisieren)
              .catch(() => setEntwickler(!an));
          }}
        />
      </div>
    </>
  );
}

export function BenachrichtigungenTeil() {
  const { favoritenBenachrichtigung } = useKonto();
  const d = useDaten();
  return (
    <>
      <div className="blatt" data-anker="konto.zusammenfassung">
        <h2 className="h3">{tn('profil.profil.aufgaben', { hilfe: <Hilfe ort="profil.benachrichtigungen" /> })}</h2>
        <p className="leise">
          {tn('profil.profil.mappen-mit-offenen-aufgaben', { b: <strong>{t('profil.profil.taegliche-zusammenfassung')}</strong> })}
        </p>
        <ZusammenfassungEinstellen />
      </div>

      {/* Favorit = Abo (#422): Stern an einer Mappe heißt auch „bei Änderungen benachrichtigen“. */}
      <div className="blatt" id="favoriten">
        <h2 className="h3">{tn('profil.profil.favoriten-2', { hilfe: <Hilfe ort="profil.favoriten" /> })}</h2>
        <p className="leise">{tn('profil.profil.was-dir-wichtig-ist', { b: <strong>{t('profil.profil.eine')}</strong> })}</p>
        {/* #506: Hat die Werkbank die Benachrichtigung für dich abgeschaltet, fehlt der Schalter; die Einstellung bleibt. */}
        {favoritenBenachrichtigung ? (
          <Schalter
            an={d.einstellungen.favoriten_benachrichtigen !== false}
            setze={(an) => d.setzeEinstellung('favoriten_benachrichtigen', an ? null : false)}
            beschriftung={t('profil.profil.bei-aenderungen-an-meinen')}
          />
        ) : (
          <p className="hinweis info">{t('profil.favoriten.abgeschaltet')}</p>
        )}
        {/* Erwähnen mit @ (#889): Wird ein Favorit in einer Notiz oder einem Feld erwähnt – sofort, täglich, nie. */}
        <p id="favorit-erwaehnt">{t('profil.favoriten.erwaehnt.hilfe')}</p>
        <Umschalter
          wert={favoritErwaehntWahl(d.einstellungen[FAVORIT_ERWAEHNT])}
          setze={(x) => d.setzeEinstellung(FAVORIT_ERWAEHNT, x === 'zusammenfassung' ? null : x)}
          beschriftung={t('profil.favoriten.erwaehnt')}
          wahlen={FAVORIT_ERWAEHNT_WAHL.map((w) => ({ wert: w, text: t(`profil.favoriten.erwaehnt.${w}`) }))}
        />
      </div>
    </>
  );
}

/** Schriftgröße je Gerät (#69: aus dem Benutzermenü hierher). */
function SchriftWahl() {
  const { ich } = useKonto();
  const [schrift, setSchrift] = useState<Schrift>(() => leseSchrift(ich.id));
  return (
    <div className="blatt" data-anker="konto.schrift">
      <h2 className="h3">{t('profil.profil.schriftgroesse-auf-diesem-geraet')}</h2>
      <p className="leise">{t('profil.profil.gilt-nur-fuer-das')}</p>
      {/* Umschalter (#1215, C17): jede Wahl in ihrer eigenen Schriftgröße. */}
      <Umschalter
        beschriftung={t('profil.profil.schriftgroesse')}
        wert={schrift}
        setze={(k) => {
          setSchrift(k);
          setzeSchrift(ich.id, k);
        }}
        wahlen={(Object.keys(SCHRIFTEN) as Schrift[]).map((k) => ({
          wert: k,
          text: <span style={{ fontSize: `${13 * SCHRIFTEN[k].skala}px` }}>{SCHRIFTEN[k].name}</span>,
        }))}
      />
    </div>
  );
}
