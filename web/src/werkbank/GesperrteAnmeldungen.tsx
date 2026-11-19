import { Etikett, Knopf } from '../bausteine';
import type { AktiveSperre } from '../api/konto';
import { Link } from '../ort';
import { t } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Gesperrte Anmeldungen (#1481): alle aktiven Sperren der drei Ebenen – je Konto, je E-Mail-Adresse und IP, je IP – mit
 * „Entsperren“. In Werkbank → Anmeldeschutz und an der Person (Werkbank → Benutzer). Nur für Personen mit
 * Verwaltungsrecht Anmeldeschutz: Die Einträge nennen E-Mail-Adressen und Adressen.
 */

const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });

/** Der Notfallzugang (#815) zählt unter diesem Namen statt einer E-Mail-Adresse. */
const NOTFALL = 'notfallzugang';

const ART: Record<AktiveSperre['art'], () => string> = {
  konto: () => t('werkbank.anmeldeschutz.art.konto'),
  'konto-ip': () => t('werkbank.anmeldeschutz.art.konto-ip'),
  ip: () => t('werkbank.anmeldeschutz.art.ip'),
};

/** Schlüssel eines Eintrags (eindeutig je Art). */
const sperrSchluessel = (s: Pick<AktiveSperre, 'art' | 'email' | 'ip'>) => `${s.art}|${s.ip ?? ''}|${s.email ?? ''}`;

/** Wen die Sperre trifft, für die Meldung nach dem Entsperren. */
export const sperrWer = (s: Pick<AktiveSperre, 'email' | 'ip'>) =>
  [s.email === NOTFALL ? t('werkbank.anmeldeschutz.notfallzugang') : s.email, s.ip].filter(Boolean).join(' · ');

function Zeitraum({ s }: { s: AktiveSperre }) {
  const bis = s.bis ? t('werkbank.anmeldeschutz.bis', { zeit: zeit(s.bis) }) : t('werkbank.anmeldeschutz.bis-entsperrt');
  const teile = [
    s.versuche !== null ? t('werkbank.anmeldeschutz.fehlversuche-anzahl', { anzahl: s.versuche }) : s.grund,
    s.seit ? t('werkbank.anmeldeschutz.seit-bis', { zeit: zeit(s.seit), bis }) : bis,
  ].filter(Boolean);
  return <span className="leise klein">{teile.join(' · ')}</span>;
}

/** Ein Eintrag: Art, betroffenes Konto bzw. Adresse, Fehlversuche, seit und bis, „Entsperren“. */
function SperrEintrag({ s, entsperren, mitPerson = true }: { s: AktiveSperre; entsperren: () => Promise<unknown>; mitPerson?: boolean }) {
  const email = s.email === NOTFALL ? t('werkbank.anmeldeschutz.notfallzugang') : s.email;
  return (
    <li data-sperre={s.art}>
      <span>
        <Etikett>{ART[s.art]()}</Etikett> {email && <strong>{email}</strong>}
        {email && s.ip && ' · '}
        {s.ip && <strong className="mono">{s.ip}</strong>}
        {mitPerson && s.person && (
          <>
            {' '}
            <Link to={`/werkbank/benutzer/${s.person.id}`} className="verweis">
              {s.person.name}
            </Link>
          </>
        )}{' '}
        <Zeitraum s={s} />
      </span>
      <Knopf groesse="klein" onClick={entsperren}>
        {t('werkbank.anmeldeschutz.entsperren')}
      </Knopf>
    </li>
  );
}

/** Liste der Sperren; leer erst, wenn wirklich keine Ebene sperrt. */
export function SperrListe({
  sperren,
  entsperren,
  leer,
  mitPerson,
}: {
  sperren: AktiveSperre[];
  entsperren: (s: AktiveSperre) => Promise<unknown>;
  leer: string;
  mitPerson?: boolean;
}) {
  if (!sperren.length) return <p className="leise">{leer}</p>;
  return (
    <ul className="sitzungsliste festhoehe">
      {sperren.map((s) => (
        <SperrEintrag key={sperrSchluessel(s)} s={s} entsperren={() => entsperren(s)} mitPerson={mitPerson} />
      ))}
    </ul>
  );
}
