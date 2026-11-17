import { useState } from 'react';
import { istOffen, tageBisFrist } from '../../../../shared/src/auskunft';
import { datumText } from '../../../../shared/src/archiv';
import { Link } from '../../ort';
import { Listenkopf } from '../../Listenkopf';
import { t } from '../../sprache';
import { bereichName } from '../../../../shared/src/werkbankansicht';
import { titelOder } from '../../seiten';
import { FilterHaken, Hervorgehoben, KeineTreffer, KnopfLink, ListenSuche, useListenSuche } from '../../bausteine';
import { heute, zeit, ZUSTAND_CHIP } from './hilfen';
import type { DatenschutzZustand } from './zustand';

/* ---------- Datenschutz-Auskünfte (#668): Liste in der Mitte, rechts eine Auskunft, der Assistent oder die Einstellungen ---------- */

/** Antwortfrist als kurzer Text („noch 12 Tage“, überfällig rot). */
export function FristText({ frist }: { frist: string }) {
  const n = tageBisFrist(frist, heute());
  const text =
    n > 0
      ? t('werkbank.auskunft.frist.noch', { anzahl: n })
      : n === 0
        ? t('werkbank.auskunft.frist.heute')
        : t('werkbank.auskunft.frist.ueber', { anzahl: -n });
  return (
    <span
      className={n < 0 ? 'frist-ueber' : n <= 7 ? 'frist-bald' : ''}
      title={t('werkbank.auskunft.frist.bis', { datum: datumText(frist) })}>
      {text}
    </span>
  );
}

/**
 * Auskünfte in der Mitte (#994): Suchfeld wie in der Ablage, darunter der Haken „Nur offene zeigen“ (Vorgabe an).
 * Die Vorgaben für Auskünfte stehen rechts (ohne Auswahl) und sind vom Assistenten aus verlinkt.
 */
export function AuskuenfteListe({ z, offen }: { z: DatenschutzZustand; offen?: string }) {
  const [nurOffene, setNurOffene] = useState(true);
  const alle = z.stand?.verzeichnis ?? [];
  const sichtbar = nurOffene ? alle.filter((e) => istOffen(e.zustand)) : alle;
  const such = useListenSuche(sichtbar, {
    quellen: (e) => [
      { wo: '', text: titelOder(e.titel), titel: true },
      { wo: t('werkbank.listensuche.auskunft.zustand'), text: t(`werkbank.auskunft.zustand.${e.zustand}`) },
    ],
  });
  const ausgeblendet = nurOffene && alle.length > sichtbar.length;
  return (
    <>
      <Listenkopf titel={bereichName('auskuenfte')} hilfe="werkbank.auskunft" beschreibung={t('werkbank.auskunft.liste.beschreibung')}>
        <KnopfLink to="/werkbank/auskuenfte/neu" art="anlegen" groesse="klein">
          {t('werkbank.auskunft.liste.neu')}
        </KnopfLink>
      </Listenkopf>
      <ListenSuche
        wert={such.eingabe}
        setze={such.setEingabe}
        beschriftung={t('werkbank.listensuche.auskunft.beschriftung')}
        platzhalter={t('werkbank.auskunft.liste.suche')}
        anker="werkbank.auskuenfte.suche"
        treffer={z.stand ? such.treffer.length : null}
        aktiv={such.aktiv || !nurOffene}
        anzahl={t('werkbank.listensuche.auskunft.anzahl', { anzahl: sichtbar.length })}
        filter={
          <FilterHaken an={nurOffene} setze={setNurOffene} anker="werkbank.auskuenfte.nur-offene">
            {t('werkbank.listensuche.auskunft.nur-offene')}
          </FilterHaken>
        }
      />
      {z.fehler && (
        <div className="hinweis schlecht">
          <p>{z.fehler}</p>
        </div>
      )}
      {!z.stand ? (
        <p className="leise">{t('werkbank.datenschutz.lade')}</p>
      ) : !such.treffer.length ? (
        // Blendet der Haken etwas aus, sagt der leere Zustand das und bietet „Alle zeigen“ (Suche bleibt).
        ausgeblendet ? (
          <KeineTreffer
            zuruecksetzen={() => setNurOffene(false)}
            text={such.gesucht ? t('werkbank.listensuche.auskunft.keine-offenen-treffer') : t('werkbank.auskunft.liste.leer.offen')}
            knopf={t('werkbank.listensuche.auskunft.alle-zeigen')}
          />
        ) : such.gesucht ? (
          <KeineTreffer zuruecksetzen={such.zuruecksetzen} />
        ) : (
          <p className="leise leerliste">{t('werkbank.auskunft.liste.leer.alle')}</p>
        )
      ) : (
        <ul className="mappenliste">
          {such.treffer.map(({ eintrag: e, titel }) => (
            <li key={e.id}>
              <Link to={`/werkbank/auskuenfte/${e.id}`} className={`eintrag werk ${offen === e.id ? 'an' : ''}`}>
                <span className="titel">
                  <Hervorgehoben teile={titel} text={titelOder(e.titel)} />
                </span>
                <span className="unter">
                  <span className={`chip ${ZUSTAND_CHIP[e.zustand]}`}>{t(`werkbank.auskunft.zustand.${e.zustand}`)}</span> {zeit(e.zeit)}
                  {e.mappen !== undefined ? ` · ${t('werkbank.auskunft.liste.mappen', { anzahl: e.mappen })}` : ''}
                  {e.frist && istOffen(e.zustand) && (
                    <>
                      {' '}
                      · <FristText frist={e.frist} />
                    </>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
