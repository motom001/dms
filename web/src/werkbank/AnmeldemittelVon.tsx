import { useCallback, useEffect, useState } from 'react';
import type { Benutzer } from '../../../shared/src/model';
import { kontoApi } from '../api/konto';
import { Knopf } from '../bausteine';
import { t } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';

/** Anmeldemittel einer Person in Werkbank → Benutzer: Zwei-Faktor-Anmeldung (#242) und Passkeys (#811) – seit #1000 im Bereich „Anmeldung und Sicherheit“. */

/** Passkeys der Person (#811): wie viele, und alle zurücksetzen (z. B. Handy verloren, neue Adresse). */
export function PasskeysVon({ b }: { b: Benutzer }) {
  const [anzahl, setAnzahl] = useState<number | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setAnzahl((await kontoApi.benutzerPasskeys(b.id)).anzahl); } catch (e) { setFehler((e as Error).message); } }, [b.id]);
  useEffect(() => { void laden(); }, [laden]);
  const name = b.name || b.email;
  const zuruecksetzen = async () => {
    await kontoApi.benutzerPasskeysZuruecksetzen(b.id);
    await laden();
    return { art: 'gut' as const, text: t('werkbank.benutzer.zurueckgesetzt') };
  };
  return (
    <div id="passkeys-von">
      <h3 className="h4">{t('werkbank.benutzer.passkeys')}</h3>
      {anzahl === null ? (fehler ? <p className="fehlertext">{fehler}</p> : <p className="leise">{t('werkbank.benutzer.lade')}</p>)
        : anzahl > 0 ? <>
          <p>{t('werkbank.benutzer.passkeys.anzahl', { anzahl })}</p>
          <div className="knoepfe"><Knopf art="gefahr" symbol="zuruecksetzen" onClick={zuruecksetzen}
            rueckfrage={{ titel: t('werkbank.benutzer.passkeys.frage', { name }), text: t('werkbank.benutzer.passkeys.frage.text', { name }), ja: t('werkbank.benutzer.zuruecksetzen') }}>{t('werkbank.benutzer.zuruecksetzen')}</Knopf></div>
        </> : <p className="leise">{t('werkbank.benutzer.passkeys.keine')}</p>}
    </div>
  );
}

/** Zwei-Faktor-Anmeldung des Benutzers (#242): Stand und Zurücksetzen (z. B. Handy verloren). */
export function ZweifaktorVon({ b }: { b: Benutzer }) {
  const [stand, setStand] = useState<{ aktiv: boolean; seit: string | null; codesUebrig: number } | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const laden = useCallback(async () => { try { setStand(await kontoApi.benutzerZweifaktor(b.id)); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); } }, [b.id]);
  useEffect(() => { void laden(); }, [laden]);
  const name = b.name || b.email;
  return (
    <div>
      <h3 className="h4">{t('werkbank.benutzer.zwei-faktor-anmeldung')}</h3>
      {!stand ? !meldung && <p className="leise">{t('werkbank.benutzer.lade')}</p> : stand.aktiv ? <>
        <p><span className="chip gut punkt">{t('werkbank.benutzer.eingerichtet')}</span>{stand.seit && <> {' '}{t('werkbank.benutzer.seit-2', { datum: new Date(stand.seit).toLocaleDateString(gebietsschema()) })}</>} {' '}{t('werkbank.benutzer.wiederherstellungscodes-uebrig', { codesUebrig: stand.codesUebrig })}</p>
        <div className="knoepfe"><Knopf art="gefahr" symbol="zuruecksetzen" rueckfrage={{ titel: t('werkbank.benutzer.zwei-faktor-anmeldung-von', { name }), text: t('werkbank.benutzer.danach-reicht-das-passwort', { name }), ja: t('werkbank.benutzer.zuruecksetzen') }} onClick={() => {
          void kontoApi.benutzerZweifaktorZuruecksetzen(b.id).then(() => { setMeldung({ art: 'gut', text: t('werkbank.benutzer.zurueckgesetzt') }); return laden(); }).catch((e) => setMeldung({ art: 'schlecht', text: (e as Error).message }));
        }}>{t('werkbank.benutzer.zuruecksetzen')}</Knopf></div>
      </> : <p className="leise">{t('werkbank.benutzer.nicht-eingerichtet')}</p>}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
    </div>
  );
}
