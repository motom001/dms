import { useState } from 'react';
import { betriebApi, type Notfallblattstand } from '../api/betrieb';
import { useKonto } from '../konto';
import { NotfallblattGrund, NOTFALLBLATT_URL, meldeSicherung, zeit } from './Sicherung';
import { heikelHerunterladen } from '../verwaltungsmodus';
import { Hilfe } from '../Hilfe';
import { t } from '../sprache';
import { Kopf } from './Kopf';
import { melde, type TresorZustand } from './tresor/zustand';
import { NotfallkontakteAbschnitt } from './Notfallkontakte';
import { schluesselAbschnitt } from './tresor/Schluessel';
import { wechselAbschnitt, type Wechsel } from './tresor/Wechseln';
import { arten, betroffen } from './tresor/Arten';

/**
 * Schlüssel für verschlüsselte Zugangsdaten (#39): Status, Fingerabdruck, Erzeugen
 * und die Liste der Werte, die (noch) nicht lesbar sind. Das Notfallblatt (#106, Notfallcode #815) steht seit #993
 * nur hier; Sicherung, Übersicht und Anmeldeschutz verlinken auf den Abschnitt `#notfallblatt`. Darunter die
 * Notfallkontakte (#812) für „Wen fragen?“ – sie gehören zum Notfallblatt.
 *
 * Teile in tresor/ (#1279): Schlüssel, Schlüssel wechseln, was verschlüsselt ist.
 */

export { useTresor, type TresorZustand } from './tresor/zustand';

export function TresorPanel({ t: eintrag }: { t: TresorZustand }) {
  const { aktualisieren } = useKonto();
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [wechsel, setWechsel] = useState<Wechsel>();
  const [gesichert, setGesichert] = useState<{ ok: boolean; text: string }>();
  const [blattGeladen, setBlattGeladen] = useState(false);
  if (eintrag.fehler)
    return (
      <div className="hinweis schlecht">
        <p>{eintrag.fehler}</p>
      </div>
    );
  const s = eintrag.stand;
  if (!s) return <p className="leise">{t('werkbank.verschluesselung.lade')}</p>;

  async function erzeugen() {
    setLaeuft(true);
    setMeldung(undefined);
    try {
      eintrag.setStand(await betriebApi.tresorErzeugen());
      melde();
      await aktualisieren();
      setMeldung({ art: 'gut', text: t('werkbank.verschluesselung.schluessel-erzeugt-passwoerter') });
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    } finally {
      setLaeuft(false);
    }
  }

  async function wechseln() {
    setLaeuft(true);
    setMeldung(undefined);
    setWechsel(undefined);
    try {
      const r = await betriebApi.tresorWechseln();
      eintrag.setStand(r);
      setWechsel(r);
      melde();
      await aktualisieren();
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="einspaltig">
      <Kopf
        titel={t('werkbank.verschluesselung.verschluesselung')}
        ueber={t('werkbank.verschluesselung.werkbank')}
        hilfe="werkbank.verschluesselung">
        <p className="leise">{t('werkbank.verschluesselung.passwoerter-und-andere-geheimnisse')}</p>
      </Kopf>

      {schluesselAbschnitt({ s, laeuft, meldung, erzeugen })}

      {s.zustand === 'vorhanden' &&
        wechselAbschnitt({ wechsel, laeuft, wechseln, blattGeladen, setBlattGeladen, gesichert, setGesichert, eintrag })}

      <Notfallblatt stand={s.notfallblatt} schluessel={s.zustand === 'vorhanden'} geladen={() => void eintrag.laden()} />

      <NotfallkontakteAbschnitt geaendert={() => void eintrag.laden()} />

      {s.arten && s.arten.length > 0 && arten(s)}

      {betroffen(s)}
    </div>
  );
}

/** Notfallblatt (#106): herunterladen, Stand, Hinweis nach einem Schlüsselwechsel oder benutztem Notfallcode (#815). */
export function Notfallblatt({
  stand,
  schluessel,
  geladen,
}: {
  stand: Notfallblattstand | null | undefined;
  schluessel: boolean;
  geladen(): void;
}) {
  return (
    <section className="blatt" id="notfallblatt">
      <h2 className="h3">
        {t('werkbank.sicherung.notfallblatt')} <Hilfe ort="verschluesselung.notfallblatt" />
      </h2>
      <p>{t('werkbank.notfallblatt.ui.text')}</p>
      {stand?.am && (
        <p className="leise klein">
          {t('werkbank.sicherung.zuletzt-heruntergeladen', {
            zeit: zeit(stand.am),
            wert: stand.von ? t('werkbank.sicherung.von-2', { von: stand.von }) : '',
          })}
        </p>
      )}
      {stand && !stand.aktuell && stand.am && (
        <div className="hinweis warn">
          <p>
            <NotfallblattGrund n={stand} />
          </p>
        </div>
      )}
      {schluessel && stand && !stand.am && (
        <div className="hinweis warn">
          <p>
            <strong>{t('werkbank.sicherung.das-notfallblatt-fehlt')}</strong>
          </p>
        </div>
      )}
      {stand?.am && stand.aktuell && stand.kontakteGeaendert && (
        <div className="hinweis warn" role="status">
          <p>{t('werkbank.notfallkontakte.blatt-neu')}</p>
        </div>
      )}
      <div className="knoepfe">
        {schluessel ? (
          <a
            className="knopf primaer"
            href={NOTFALLBLATT_URL}
            download
            onClick={(e) =>
              void heikelHerunterladen(e, NOTFALLBLATT_URL, () => {
                setTimeout(geladen, 1500);
                setTimeout(meldeSicherung, 1500);
              })
            }>
            {t('werkbank.sicherung.notfallblatt-herunterladen-pdf')}
          </a>
        ) : (
          <span className="leise">{t('werkbank.sicherung.erst-moeglich-wenn-es')}</span>
        )}
      </div>
    </section>
  );
}
