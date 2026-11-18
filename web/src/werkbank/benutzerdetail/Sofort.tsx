import type { Benutzer } from '../../../../shared/src/model';
import { kontoApi } from '../../api/konto';
import { t } from '../../sprache';
import { Knopf, type BereicheZustand } from '../../bausteine';
import type { Aktion, BenutzerBereich } from './hilfen';
import { sperren, sperrFrage, useSperrgruende } from './Zugang';

/**
 * Sofort oben am Benutzer (#1291, Durchsicht Qualität 15.11.): „Zugang sperren“ und „Überall abmelden“ – die
 * wichtigsten Handgriffe unterwegs (Handy verloren), ohne erst die Bereiche „Zugang“ bzw. „Anmeldung und Sicherheit“
 * aufzuklappen. Dieselben Rückfragen (B4), dieselben Gründe gegen das Sperren und dieselben Prüfungen des Servers wie
 * unten in den Bereichen; das Ergebnis steht gleich darunter. Nicht bei dir selbst und nicht bei Gesperrten.
 */
export function Sofort({
  b,
  b2,
  selbst,
  aktion,
  abgemeldet,
}: {
  b: Benutzer;
  b2: BereicheZustand<BenutzerBereich>;
  selbst: boolean;
  aktion: Aktion;
  /** Nach „Überall abmelden“: Die Liste der Geräte unten neu laden. */
  abgemeldet: () => void;
}) {
  const { name, vertreter, gruende } = useSperrgruende(b, b2);
  if (selbst || !b.aktiv) return null;
  return (
    <div className="knoepfe" role="group" aria-label={t('werkbank.benutzer.sofort', { name })}>
      <Knopf
        art="gefahr"
        symbol="verboten"
        gesperrt={gruende.length ? { grund: t('konten.sperren.nochnicht'), eintraege: gruende.map(([, g]) => g) } : false}
        rueckfrage={sperrFrage(name, vertreter)}
        onClick={() => {
          void sperren(b, aktion);
        }}>
        {t('werkbank.benutzer.zugang-sperren')}
      </Knopf>
      {b.hatPasswort && (
        <Knopf
          art="gefahr"
          symbol="abmelden"
          rueckfrage={{
            titel: t('werkbank.benutzer.sofort.abmelden.frage', { name }),
            text: t('werkbank.benutzer.sofort.abmelden.text', { name }),
            ja: t('werkbank.benutzer.ueberall-abmelden'),
          }}
          onClick={() => {
            void aktion(
              async () => {
                await kontoApi.alleSitzungenBeenden(b.id);
                abgemeldet();
              },
              t('werkbank.benutzer.sofort.abgemeldet', { name }),
            );
          }}>
          {t('werkbank.benutzer.ueberall-abmelden')}
        </Knopf>
      )}
    </div>
  );
}
