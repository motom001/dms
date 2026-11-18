import { useEffect, useState } from 'react';
import { MODUS_MINUTEN, type Verwaltungsstand } from '../../shared/src/verwaltungsrecht';
import { beiAktivitaet, zuletztAktiv } from './api/anfrage';
import { Knopf } from './bausteine';
import { t } from './sprache';

/**
 * Verwaltungsmodus oben auf jeder Seite (#819, #1252):
 *
 * - **Werkbank, Mein Konto, Entdecken** (`ruhig`): eine schmale, ruhige Zeile ohne Rot – „Verwaltung · noch 14 Min. ·
 *   Verwaltung beenden“. Dort sagt der Balken nichts Neues: In die Werkbank kommt man nur im Modus, und ein Warnhinweis,
 *   der immer da ist, wird übersehen (Musterkatalog B6, C14 Leitsatz 4).
 * - **Ablage, Suche, Zu erledigen** – überall, wo man im Modus Mappen sieht: der rote Balken mit dem Grund, warum es heikel
 *   ist (gesperrte Mappen, Einträge in der Historie).
 *
 * Für Screenreader: Der Satz des roten Balkens steht in einer Statusmeldung, die immer da ist und nur in der Ablage Text
 * trägt. So wird er beim Wechsel aus der Werkbank in die Ablage einmal vorgelesen, nicht bei jedem Seitenwechsel in der
 * Ablage. Die Restzeit zählt leise mit (kein Live-Bereich), in festen Ziffern, damit nichts springt.
 */
export function Verwaltungsbalken({ ruhig, stand, beenden }: { ruhig: boolean; stand: Verwaltungsstand; beenden(): Promise<void> }) {
  const minuten = useRestzeit(stand.bis);
  return (
    <section className={`verwaltungsbalken${ruhig ? ' ruhig' : ''}`} aria-label={t('konten.verwaltung.balken.titel')}>
      <p role="status" className="vb-satz">
        {!ruhig && (
          <>
            <strong>{t('konten.verwaltung.balken.titel')}</strong> {t('konten.verwaltung.balken.text')}
          </>
        )}
      </p>
      {ruhig && (
        <p className="vb-zeile">
          {t('konten.verwaltung.zeile')}
          {minuten !== null && (
            <>
              {' · '}
              <span className="vb-rest">{t('konten.verwaltung.zeile.rest', { minuten })}</span>
            </>
          )}
        </p>
      )}
      <Knopf id="verwaltung-beenden" groesse="klein" onClick={beenden}>
        {t('konten.verwaltung.beenden')}
      </Knopf>
    </section>
  );
}

/**
 * Minuten bis zum automatischen Ende (15 Minuten ohne Aktivität): aus dem Stand des Servers und – seitdem – jeder
 * Anfrage, die als Aktivität hinausging (api/anfrage.ts). Aufgerundet, nie unter 0; `null`, solange der Server kein Ende nennt.
 */
function useRestzeit(bis: string | null): number | null {
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setJetzt(Date.now()), 15_000);
    const weg = beiAktivitaet(() => setJetzt(Date.now()));
    return () => {
      clearInterval(tick);
      weg();
    };
  }, []);
  if (!bis) return null;
  const ende = Math.max(Date.parse(bis), zuletztAktiv() + MODUS_MINUTEN * 60_000);
  return Math.max(0, Math.ceil((ende - jetzt) / 60_000));
}
