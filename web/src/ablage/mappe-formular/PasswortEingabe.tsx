import { useEffect, useState, type ReactNode } from 'react';
import type { Feld as FeldDef } from '../../../../shared/src/model';
import { mappenApi } from '../../api/mappen';
import { Feld, FeldGruppe, Knopf, type FeldProps } from '../../bausteine';
import { useKonto } from '../../konto';
import { t } from '../../sprache';
import { Symbol } from '../../Symbol';
import type { Roh, RohPasswort } from '../../werte';

/**
 * Passwortfeld (#46): Das gespeicherte Passwort kommt nie mit der Mappe. Das Auge holt es
 * einzeln vom Server (steht im Protokoll); zum Ändern wird ein neues eingegeben.
 */
export function PasswortEingabe({
  rahmen,
  unter,
  feld: f,
  roh: p,
  setze,
  mappeId,
  nurLesen,
  sehen = true,
}: {
  rahmen: Omit<FeldProps, 'children'>;
  unter?: ReactNode;
  feld: FeldDef;
  roh: RohPasswort;
  setze: (v: Roh) => void;
  mappeId?: string;
  nurLesen?: boolean;
  sehen?: boolean;
}) {
  const { passwoerterMoeglich } = useKonto();
  const [klartext, setKlartext] = useState<string | null>(null);
  const [zeigen, setZeigen] = useState(false);
  const [aendern, setAendern] = useState(false);
  // Nach dem Speichern (neuer Stand vom Server) die Anzeige zurücksetzen.
  useEffect(() => {
    if (!p.neu) {
      setKlartext(null);
      setAendern(false);
      setZeigen(false);
    }
  }, [p.gesetzt, p.lesbar]); // eslint-disable-line react-hooks/exhaustive-deps -- nur zurücksetzen, wenn sich der gespeicherte Wert ändert
  const auge = (an: boolean) => <Symbol name={an ? 'auge-aus' : 'auge'} />;

  // Ohne Eingabe (gespeichertes Passwort, wird entfernt, nichts gespeichert): eine Gruppe mit der Beschriftung.
  if (p.entfernen)
    return (
      <FeldGruppe {...rahmen}>
        <div className="passwort">
          <span className="festwert leise">{t('ablage.mappeformular.wird-beim-speichern-entfernt')}</span>
          <Knopf groesse="klein" onClick={() => setze({ ...p, entfernen: false })}>
            {t('ablage.mappeformular.rueckgaengig')}
          </Knopf>
        </div>
        {unter}
      </FeldGruppe>
    );

  if (nurLesen && !p.gesetzt)
    return (
      <FeldGruppe {...rahmen}>
        <span className="festwert leise">{t('ablage.mappeformular.kein-passwort-gespeichert')}</span>
        {unter}
      </FeldGruppe>
    );
  if (p.gesetzt && (!aendern || nurLesen) && !p.neu) {
    async function umschalten() {
      if (klartext !== null) {
        setKlartext(null);
        return;
      }
      if (!mappeId) return;
      setKlartext((await mappenApi.passwortAnzeigen(mappeId, f.key)).wert);
    }
    const hinweise = [
      ...(Array.isArray(rahmen.hinweis) ? rahmen.hinweis : [rahmen.hinweis]),
      !sehen && p.lesbar ? t('ablage.mappeformular.passwoerter-dieser-mappe-darfst') : null,
      !passwoerterMoeglich && !nurLesen ? t('ablage.mappeformular.aendern-geht-erst-wieder') : null,
    ];
    return (
      <FeldGruppe {...rahmen} hinweis={hinweise}>
        <div className="passwort">
          <span className={`festwert mono ${p.lesbar ? '' : 'leise'}`} aria-live="polite">
            {!p.lesbar ? t('ablage.mappeformular.nicht-lesbar-bitte-neu') : (klartext ?? '••••••••')}
          </span>
          {p.lesbar && mappeId && sehen && (
            <Knopf
              groesse="klein"
              nurSymbol={klartext === null ? t('ablage.mappeformular.passwort-anzeigen') : t('ablage.mappeformular.passwort-verbergen')}
              title={
                klartext === null
                  ? t('ablage.mappeformular.passwort-anzeigen-wird-protokolliert')
                  : t('ablage.mappeformular.passwort-verbergen')
              }
              onClick={() => umschalten()}>
              {auge(klartext !== null)}
            </Knopf>
          )}
          {!nurLesen && (
            <Knopf
              groesse="klein"
              gesperrt={!passwoerterMoeglich && t('ablage.mappeformular.aendern-geht-erst-wieder')}
              onClick={() => {
                setKlartext(null);
                setAendern(true);
              }}>
              {t('ablage.mappeformular.aendern')}
            </Knopf>
          )}
          {/* Entfernen lässt sich bis zum Speichern zurücknehmen (Leitsatz 5): normaler Knopf, nicht rot. */}
          {!nurLesen && (
            <Knopf
              groesse="klein"
              onClick={() => {
                setKlartext(null);
                setze({ ...p, entfernen: true });
              }}
              title={t('ablage.mappeformular.wird-erst-mit-mappe')}>
              {t('ablage.mappeformular.passwort-entfernen')}
            </Knopf>
          )}
        </div>
        {unter}
      </FeldGruppe>
    );
  }

  if (!passwoerterMoeglich)
    return (
      <Feld
        {...rahmen}
        hinweis={[
          ...(Array.isArray(rahmen.hinweis) ? rahmen.hinweis : [rahmen.hinweis]),
          t('ablage.mappeformular.passwoerter-lassen-sich-erst'),
        ]}>
        {(v) => (
          <>
            <input {...v} type="password" disabled placeholder={t('ablage.mappeformular.nicht-moeglich')} />
            {unter}
          </>
        )}
      </Feld>
    );

  return (
    <Feld {...rahmen}>
      {(v) => (
        <>
          <div className="passwort">
            <input
              {...v}
              type={zeigen ? 'text' : 'password'}
              value={p.neu}
              autoComplete="new-password"
              spellCheck={false}
              placeholder={p.gesetzt ? t('ablage.mappeformular.neues-passwort') : ''}
              onChange={(e) => setze({ ...p, neu: e.target.value })}
            />
            <Knopf
              groesse="klein"
              nurSymbol={zeigen ? t('ablage.mappeformular.eingabe-verbergen') : t('ablage.mappeformular.eingabe-anzeigen')}
              onClick={() => setZeigen(!zeigen)}>
              {auge(zeigen)}
            </Knopf>
            {p.gesetzt && (
              <Knopf
                groesse="klein"
                onClick={() => {
                  setze({ ...p, neu: '' });
                  setAendern(false);
                  setZeigen(false);
                }}>
                {t('ablage.mappeformular.abbrechen')}
              </Knopf>
            )}
          </div>
          {unter}
        </>
      )}
    </Feld>
  );
}
