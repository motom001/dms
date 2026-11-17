import type { Benutzer } from '../../../../shared/src/model';
import { kontoApi, type LinkErgebnis } from '../../api/konto';
import { t } from '../../sprache';
import { Bereich, Knopf, type BereicheZustand } from '../../bausteine';
import { PasskeysVon, ZweifaktorVon } from '../AnmeldemittelVon';
import { datumZeit, type Aktion, type BenutzerBereich } from './hilfen';
import { Sitzungen } from './Sitzungen';

/** Anmeldung und Sicherheit (#1000): Passwort-Link bzw. Einladung, Zwei-Faktor, Passkeys und Geräte – alles Sofortaktionen. */
export function Sicherheit({
  b,
  b2,
  aktion,
  setErgebnis,
  neuLaden,
  loeschbar,
}: {
  b: Benutzer;
  b2: BereicheZustand<BenutzerBereich>;
  aktion: Aktion;
  setErgebnis: (e: LinkErgebnis) => void;
  neuLaden: () => Promise<void>;
  loeschbar: boolean;
}) {
  return (
    <Bereich
      id="sicherheit"
      titel={t('werkbank.benutzer.bereich.sicherheit')}
      klappe={b2.klappe('sicherheit')}
      kurz={
        b.hatPasswort
          ? t('werkbank.benutzer.bereich.sicherheit.kurz', { datumZeit: datumZeit(b.letzteAnmeldung) })
          : t('werkbank.benutzer.status.eingeladen')
      }>
      <div>
        <h3 className="h4">{t('werkbank.benutzer.bereich.passwort')}</h3>
        <p className="leise">
          {b.hatPasswort ? t('werkbank.benutzer.ein-passwort-link-ist') : t('werkbank.benutzer.der-benutzer-hat-sein')}{' '}
          {loeschbar ? t('werkbank.benutzer.solange-die-einladung-nicht') : t('werkbank.benutzer.wer-schon-angemeldet-war')}
        </p>
        <div className="knoepfe">
          <Knopf onClick={() => aktion(async () => setErgebnis(await kontoApi.neuerLink(b.id)))}>
            {b.hatPasswort ? t('werkbank.benutzer.passwort-link-erzeugen') : t('werkbank.benutzer.einladung-erneut-senden')}
          </Knopf>
        </div>
      </div>
      <ZweifaktorVon b={b} />
      <PasskeysVon b={b} />
      <Sitzungen b={b} neuLaden={neuLaden} />
    </Bereich>
  );
}
