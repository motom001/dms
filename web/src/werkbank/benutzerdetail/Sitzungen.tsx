import { useCallback, useEffect, useState } from 'react';
import { geraetText, istGeradeAktiv, type Benutzer, type Sitzung } from '../../../../shared/src/model';
import { kontoApi } from '../../api/konto';
import { t } from '../../sprache';
import { Etikett, Knopf } from '../../bausteine';
import { datumZeit } from './hilfen';

/** Angemeldete Geräte des Benutzers; einzeln oder alle abmelden. */
export function Sitzungen({ b, neuLaden }: { b: Benutzer; neuLaden: () => Promise<void> }) {
  const [liste, setListe] = useState<Sitzung[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try {
      setListe(await kontoApi.sitzungen(b.id));
    } catch (e) {
      setFehler((e as Error).message);
    }
  }, [b.id]);
  useEffect(() => {
    void laden();
  }, [laden]);
  async function beende(fn: () => Promise<unknown>, eigene: boolean) {
    try {
      await fn();
    } catch (e) {
      setFehler((e as Error).message);
    }
    if (eigene) location.reload();
    else {
      await laden();
      await neuLaden();
    }
  }
  return (
    <div>
      <h3 className="h4">
        {t('werkbank.benutzer.angemeldet-auf', {
          wert: liste?.length ?? '…',
          wert2: liste?.length === 1 ? t('werkbank.benutzer.geraet') : t('werkbank.benutzer.geraeten'),
        })}
      </h3>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {liste && !liste.length && <p className="leise">{t('werkbank.benutzer.gerade-nirgends-angemeldet')}</p>}
      {liste && liste.length > 0 && (
        <ul className="sitzungsliste">
          {liste.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{geraetText(s.geraet)}</strong>
                {s.aktuell && (
                  <>
                    {' '}
                    <Etikett>{t('werkbank.benutzer.diese-sitzung')}</Etikett>
                  </>
                )}
                {s.vertretungId && (
                  <>
                    {' '}
                    <Etikett art="warn">{t('werkbank.verwaltungsrecht.vertretung')}</Etikett>
                  </>
                )}
                {istGeradeAktiv(s.zuletztAktiv) && (
                  <>
                    {' '}
                    <Etikett art="gut" punkt>
                      {t('werkbank.benutzer.gerade-aktiv')}
                    </Etikett>
                  </>
                )}
                <span className="leise klein blockzeile">
                  {t('werkbank.benutzer.zuletzt-aktiv-angemeldet-seit', {
                    datumZeit: datumZeit(s.zuletztAktiv),
                    datumZeit2: datumZeit(s.erstellt),
                    wert: s.ip ? ` · ${s.ip}` : '',
                  })}
                </span>
              </div>
              <Knopf
                art="gefahr"
                groesse="klein"
                symbol="abmelden"
                onClick={() => beende(() => kontoApi.sitzungBeenden(b.id, s.id), !!s.aktuell)}
                rueckfrage={{
                  titel: t('werkbank.benutzer.abmelden.frage'),
                  text: t('werkbank.benutzer.abmelden.frage.text', { geraet: geraetText(s.geraet) }),
                  ja: t('werkbank.benutzer.abmelden'),
                }}>
                {t('werkbank.benutzer.abmelden')}
              </Knopf>
            </li>
          ))}
        </ul>
      )}
      {liste && liste.length > 1 && (
        <div className="knoepfe">
          <Knopf
            art="gefahr"
            symbol="abmelden"
            onClick={() =>
              beende(
                () => kontoApi.alleSitzungenBeenden(b.id),
                liste.some((s) => s.aktuell),
              )
            }
            rueckfrage={{
              titel: t('werkbank.benutzer.auf-allen-geraeten-abmelden', { wert: b.name || b.email, liste: liste.length }),
              ja: t('werkbank.benutzer.ueberall-abmelden'),
            }}>
            {t('werkbank.benutzer.ueberall-abmelden')}
          </Knopf>
        </div>
      )}
    </div>
  );
}
