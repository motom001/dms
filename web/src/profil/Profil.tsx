import { darfVerwalten, hatGesamt } from '../../../shared/src/verwaltungsrecht';
import { bereichName } from '../../../shared/src/werkbankansicht';
import { Link } from '../ort';
import { Symbol } from '../Symbol';
import { StillerRundgangHinweis } from '../entdecken/besuch';
import { letzteAblage } from './rueckweg';
import { FehlerMelden } from './FehlerMelden';
import { MeineAbwesenheit } from './Abwesenheit';
import { LaufwerkBereich } from './Laufwerk';
import { useKonto } from '../konto';
import { t } from '../sprache';
import { useProfilZustand } from './useProfil';
import { KontoTeil } from './KontoTeil';
import { SicherheitTeil } from './SicherheitTeil';
import { BenachrichtigungenTeil, DarstellungTeil } from './DarstellungTeil';

/** Bereiche der Profilseite (#69); jeder mit eigener Adresse, /profil führt zu „Konto“. */
const BEREICHE = {
  konto: t('profil.profil.konto'),
  sicherheit: t('profil.profil.sicherheit'),
  darstellung: t('profil.profil.darstellung'),
  benachrichtigungen: t('profil.profil.benachrichtigungen'),
} as const;
type Bereich = keyof typeof BEREICHE | 'fehler-melden' | 'abwesenheit' | 'laufwerk';

export function Profil({ teile = [] }: { teile?: string[] }) {
  const { laufwerk } = useKonto();
  // Laufwerk (#720) nur, wenn eingeschaltet; sonst führt /profil/laufwerk zum Konto.
  const b = (
    teile[1] &&
    (teile[1] in BEREICHE || teile[1] === 'fehler-melden' || teile[1] === 'abwesenheit' || (teile[1] === 'laufwerk' && laufwerk))
      ? teile[1]
      : 'konto'
  ) as Bereich;
  return (
    <>
      {/* #1302: von jeder Seite in „Mein Konto“ ein sichtbarer Weg zurück – zur zuletzt besuchten Seite der Ablage. */}
      <p className="zurueck-ablage">
        <Link to={letzteAblage()} className="verweis" anker="konto.zurueck">
          <Symbol name="pfeil-links" /> {t('profil.profil.zurueck-zur-ablage')}
        </Link>
      </p>
      {/* #1523: stiller Hinweis auf den Rundgang „Mein Konto“ beim ersten Besuch – startet nicht von selbst. */}
      <StillerRundgangHinweis seite="konto" />
      <div className="zweispaltig profil">
        <aside className="leiste" aria-label={t('profil.profil.bereiche-des-profils')}>
          <nav className="typliste">
            {(Object.keys(BEREICHE) as Array<keyof typeof BEREICHE>).map((k) => (
              <Link key={k} to={`/profil/${k}`} className={`typeintrag ${b === k ? 'an' : ''}`} anker={`konto.bereich:${k}`}>
                <span className="nm">{BEREICHE[k]}</span>
              </Link>
            ))}
            <Link to="/profil/abwesenheit" anker="konto.abwesenheit" className={`typeintrag ${b === 'abwesenheit' ? 'an' : ''}`}>
              <span className="nm">{t('profil.profil.abwesenheit')}</span>
            </Link>
            {laufwerk && (
              <Link to="/profil/laufwerk" className={`typeintrag ${b === 'laufwerk' ? 'an' : ''}`}>
                <span className="nm">{t('profil.laufwerk.bereich')}</span>
              </Link>
            )}
            {/* #1331: eigener Bereich, hervorgehoben wie die übrigen; dorthin führen Benutzermenü und Fehlerseite. */}
            <Link to="/profil/fehler-melden" className={`typeintrag ${b === 'fehler-melden' ? 'an' : ''}`} anker="konto.bereich:fehler-melden">
              <span className="nm">{t('oberflaeche.app.fehler-melden')}</span>
            </Link>
          </nav>
        </aside>
        <div className="inhalt">
          {b === 'fehler-melden' ? (
            <FehlerMelden />
          ) : b === 'abwesenheit' ? (
            <MeineAbwesenheit />
          ) : b === 'laufwerk' ? (
            <LaufwerkBereich />
          ) : (
            <ProfilBereich bereich={b} />
          )}
        </div>
      </div>
    </>
  );
}

/** Ein Bereich der Profilseite (seit #1279 in Teilen: KontoTeil, SicherheitTeil, DarstellungTeil). */
function ProfilBereich({ bereich }: { bereich: keyof typeof BEREICHE }) {
  const { ich } = useKonto();
  const z = useProfilZustand();
  return (
    <div className="einspaltig schmal">
      <div className="mappenkopf">
        <p className="ueber">{t('profil.profil.mein-konto', { BEREICHE: BEREICHE[bereich] })}</p>
        <h1>{ich.name || ich.email}</h1>
        <dl className="index">
          {darfVerwalten(ich) && (
            <div>
              <dt>{t('profil.verwaltung.titel')}</dt>
              <dd>{hatGesamt(ich) ? t('werkbank.verwaltungsrecht.chip.gesamt') : (ich.verwaltung ?? []).map(bereichName).join(', ')}</dd>
            </div>
          )}
          <div>
            <dt>{t('profil.profil.e-mail')}</dt>
            <dd>{ich.email}</dd>
          </div>
        </dl>
      </div>
      {bereich === 'konto' && <KontoTeil z={z} />}
      {bereich === 'sicherheit' && <SicherheitTeil z={z} />}
      {bereich === 'darstellung' && <DarstellungTeil z={z} />}
      {bereich === 'benachrichtigungen' && <BenachrichtigungenTeil />}
    </div>
  );
}
