import { bereichName, VORLAGEN } from '../../../shared/src/werkbankansicht';
import { useDaten } from '../daten';
import { Link } from '../ort';
import { t } from '../sprache';

/**
 * Der Satz (#1311): was rein private Nutzung für den Datenschutz heißt. Seit #1319 hängt die Gruppe „Datenschutz“ in der
 * Leiste nur an der Stufe (ab Selbständig); der Haken „beruflich“ bestimmt die beruflichen Angaben (eigene Organisation).
 */
function satz() {
  return t('werkbank.datenschutz.privat', {
    gruppe: t('werkbank.gruppe.datenschutz'),
    eintraege: ['auskuenfte', 'loeschkonzept', 'loeschprotokoll'].map(bereichName).join(', '),
    haken: t('werkbank.nutzung.beruflich'),
    stufe: VORLAGEN.selbstaendig.name,
  });
}

/** Auf „Eigene Organisation“ unter dem Haken „beruflich“ (#1311), solange er gespeichert aus ist. */
export function DatenschutzPrivatSatz() {
  return <p className="leise klein">{satz()}</p>;
}

/**
 * Oben auf Datenschutz-Auskünfte, Löschkonzept und Löschprotokoll (#1311), wenn jemand sie in einer rein privaten Ablage
 * über ihre Adresse öffnet: derselbe Satz und der Weg zum Haken.
 */
export function DatenschutzPrivatHinweis() {
  const m = useDaten().zaehler.merkmale;
  if (!m || m.beruflich) return null;
  return (
    <div className="hinweis info">
      <p>
        {satz()}{' '}
        <Link to="/werkbank/organisation#nutzung" className="verweis">
          {t('werkbank.datenschutz.privat.weg')}
        </Link>
      </p>
    </div>
  );
}
