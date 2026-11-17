import { t } from '../../sprache';
import type { Historieneintrag } from '../../../../shared/src/model';
import { gebietsschema } from '../../../../shared/src/sprache';
import { str, type Eintragsdaten, type Einzelheiten } from './hilfen';

/** Auskunft nach Art. 15 DSGVO (#396): nur Zahlen, keine Inhalte; Begründungen für zurückgehaltene Notizen. */
export function auskunft(e: Historieneintrag): Einzelheiten {
  const d = e.daten;
  const n = zahl(d);
  // Zustellen (#455): per E-Mail, Abruf-Link, Abruf – Zeitpunkt und Ergebnis, ohne IP und ohne Code.
  const zustellung = str(d.zustellung);
  if (zustellung) return auskunftZustellung(d, zustellung);
  const gruende = Array.isArray(d.gruende) ? (d.gruende as unknown[]).filter((g): g is string => typeof g === 'string') : [];
  return {
    hinweis: t('ablage.historie.mappen-dokumente', { n: n('mappen'), n2: n('dokumente') }),
    inhalt: (
      <dl className="eigenschaften einzeln">
        <dt>{t('ablage.historie.mappen')}</dt>
        <dd>{n('mappen')}</dd>
        <dt>{t('ablage.historie.dokumente')}</dt>
        <dd>{n('dokumente')}</dd>
        <dt>{t('ablage.historie.notizen')}</dt>
        <dd>
          {n('notizen')}
          {n('ohneNotizen') ? t('ablage.historie.zurueckgehalten', { n: n('ohneNotizen') }) : ''}
        </dd>
        <dt>{t('ablage.historie.historie')}</dt>
        <dd>{t('ablage.historie.von-mappen', { anzahl: n('historie') })}</dd>
        <dt>{t('ablage.historie.passwort')}</dt>
        <dd>{d.verschluesselt ? t('ablage.historie.ja-aes-256') : t('ablage.historie.nein')}</dd>
        {gruende.length > 0 && (
          <>
            <dt>{t('ablage.historie.zurueckgehalten-weil')}</dt>
            <dd>
              <ul className="einzeln">
                {gruende.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>
    ),
  };
}

/** Zahl aus den Daten der Auskunft; fehlt sie: 0. */
const zahl = (d: Eintragsdaten) => (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : 0);

/** Zugestellte Auskunft (#455): Weg, Empfänger, Ergebnis, Gültigkeit und Zahl der Abrufe. */
function auskunftZustellung(d: Eintragsdaten, zustellung: string): Einzelheiten {
  const n = zahl(d);
  const an = Array.isArray(d.an) ? (d.an as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const wie =
    zustellung === 'email'
      ? t('ablage.historie.per-e-mail-verschluesselt')
      : zustellung === 'link'
        ? t('ablage.historie.abruf-link')
        : t('ablage.historie.abruf-ueber-den-link');
  return {
    hinweis: str(d.text) ?? wie,
    inhalt: (
      <dl className="eigenschaften einzeln">
        <dt>{t('ablage.historie.weg')}</dt>
        <dd>{wie}</dd>
        {an.length > 0 && (
          <>
            <dt>{t('ablage.historie.an')}</dt>
            <dd>{an.join(', ')}</dd>
          </>
        )}
        {typeof d.erfolg === 'boolean' && (
          <>
            <dt>{t('ablage.historie.ergebnis')}</dt>
            <dd>{d.erfolg ? t('ablage.historie.erfolgreich') : t('ablage.historie.fehlgeschlagen')}</dd>
          </>
        )}
        {str(d.ablauf) && (
          <>
            <dt>{t('ablage.historie.gueltig-bis')}</dt>
            <dd>{new Date(str(d.ablauf)!).toLocaleDateString(gebietsschema())}</dd>
          </>
        )}
        {n('maxAbrufe') > 0 && (
          <>
            <dt>{t('ablage.historie.abrufe')}</dt>
            <dd>{t('ablage.historie.hoechstens', { n: n('maxAbrufe') })}</dd>
          </>
        )}
      </dl>
    ),
  };
}

/** Paket-Aktion (#1039): was dabei herauskam – Meldung, Dokument, Datei, geänderte Felder. */
export function paketaktion(e: Historieneintrag): Einzelheiten {
  const d = e.daten;
  const felder = Array.isArray(d.felder) ? (d.felder as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  return {
    hinweis: t('ablage.historie.paketaktion-ergebnis'),
    inhalt: (
      <dl className="eigenschaften einzeln">
        {str(d.paketName) && (
          <>
            <dt>{t('ablage.historie.paketaktion-paket')}</dt>
            <dd>{str(d.paketName)}</dd>
          </>
        )}
        {str(d.ergebnis) && (
          <>
            <dt>{t('ablage.historie.paketaktion-ergebnis')}</dt>
            <dd>{str(d.ergebnis)}</dd>
          </>
        )}
        {str(d.dokument) && (
          <>
            <dt>{t('ablage.historie.datei')}</dt>
            <dd>{str(d.dokument)}</dd>
          </>
        )}
        {str(d.datei) && (
          <>
            <dt>{t('ablage.historie.paketaktion-herausgegeben')}</dt>
            <dd>{str(d.datei)}</dd>
          </>
        )}
        {felder.length > 0 && (
          <>
            <dt>{t('ablage.historie.feld')}</dt>
            <dd>{felder.join(', ')}</dd>
          </>
        )}
      </dl>
    ),
  };
}
