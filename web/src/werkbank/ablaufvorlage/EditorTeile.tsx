import { useState } from 'react';
import {
  fragtDatum,
  istKernVorlage,
  VORLAGEN_GRENZEN,
  wannText,
  type AblaufvorlageAnsicht,
  type AblaufWann,
} from '../../../../shared/src/ablaufvorlagen';
import type { Mappentyp } from '../../../../shared/src/model';
import type { Zeitraumeinheit } from '../../../../shared/src/feldarten';
import { automatisierungApi } from '../../api/automatisierung';
import { geheZu } from '../../ort';
import { t } from '../../sprache';
import {
  Feld,
  FeldGruppe,
  HakenFeld,
  Knopf,
  Mehrfachauswahl,
  Schalter,
  Umschalter,
  ZeitraumEingabe,
  type ZeitraumRoh,
} from '../../bausteine';
import { pfad } from './zustand';
import type { Entwurf } from './AblaufvorlageEditor';

/**
 * Mappentypen fürs Menü „Mappe“ (#1175): dieselbe Mehrfachauswahl wie im Verweisfeld einer Mappe – Suchfeld mit
 * Vorschlägen, Gewähltes darunter; leer heißt „bei allen Mappentypen“.
 */
export function TypenWahl({ typen, gewaehlt, setze }: { typen: Mappentyp[]; gewaehlt: string[]; setze: (x: string[]) => void }) {
  const [eingabe, setEingabe] = useState('');
  const [offen, setOffen] = useState(false);
  const q = eingabe.trim().toLowerCase();
  const name = (id: string) => typen.find((x) => x.id === id)?.name ?? id;
  return (
    <Feld beschriftung={t('automatisierung.vorlage.ui.typen')} id="vorlage-typen">
      {(v) => (
        <Mehrfachauswahl
          id={v.id}
          name={t('automatisierung.vorlage.ui.typen')}
          platzhalter={t('automatisierung.vorlage.ui.typen.suchen')}
          eingabe={eingabe}
          setEingabe={setEingabe}
          offen={offen}
          setOffen={setOffen}
          vorschlaege={typen
            .filter((x) => !gewaehlt.includes(x.id) && (!q || x.name.toLowerCase().includes(q)))
            .map((x) => ({ id: x.id, text: x.name }))}
          leerText={t('automatisierung.vorlage.ui.typen.keine')}
          waehle={(id) => {
            setze([...gewaehlt, id]);
            setEingabe('');
          }}
          gewaehlt={gewaehlt.map((id) => ({
            id,
            inhalt: name(id),
            entfernenText: t('automatisierung.vorlage.ui.typen.entfernen', { name: name(id) }),
          }))}
          entferne={(id) => setze(gewaehlt.filter((x) => x !== id))}
          darunter={!gewaehlt.length && <p className="leise klein">{t('automatisierung.vorlage.ui.typen.text')}</p>}
        />
      )}
    </Feld>
  );
}

/**
 * Wann (#1175): „Sofort | Am gewählten Datum | In [6] [Monaten]“ – Anzahl und Einheit stehen immer direkt hinter „In“,
 * blass (nicht gesperrt), solange „In“ nicht gewählt ist; ein Klick hinein wählt „In“. So springt nichts, und „In“
 * erklärt sich selbst. Schmal bricht die Reihe um, die Felder stehen dann fest unter „In“ (rechts).
 */
export function WannEditor({ wann, setze }: { wann: AblaufWann; setze: (w: AblaufWann) => void }) {
  // Zuletzt gewählter Zeitraum – bleibt stehen, wenn man kurz „Sofort“ wählt.
  const [letzter, setLetzter] = useState<ZeitraumRoh>(() =>
    wann.art === 'in' ? { anzahl: String(wann.anzahl), einheit: wann.einheit } : { anzahl: '6', einheit: 'monate' },
  );
  const roh: ZeitraumRoh = wann.art === 'in' ? { anzahl: String(wann.anzahl), einheit: wann.einheit } : letzter;
  const ausRoh = (r: ZeitraumRoh): AblaufWann => {
    const n = Math.max(1, Math.trunc(Number(r.anzahl)) || 1);
    const e = r.einheit as Zeitraumeinheit;
    return e === 'jahre'
      ? { art: 'in', anzahl: Math.min(VORLAGEN_GRENZEN.anzahl, n * 12), einheit: 'monate' }
      : { art: 'in', anzahl: Math.min(VORLAGEN_GRENZEN.anzahl, n), einheit: e };
  };
  const waehle = (art: AblaufWann['art']) => {
    if (art === 'in') setze(ausRoh(roh));
    else {
      setLetzter(roh);
      setze({ art });
    }
  };
  return (
    <FeldGruppe beschriftung={t('automatisierung.vorlage.ui.wann')}>
      <div className="wann-reihe">
        <Umschalter
          beschriftung={t('automatisierung.vorlage.ui.wann')}
          wert={wann.art}
          setze={waehle}
          schmalUntereinander
          wahlen={[
            { wert: 'sofort', text: wannText({ art: 'sofort' }) },
            { wert: 'datum', text: wannText({ art: 'datum' }) },
            { wert: 'in', text: t('automatisierung.vorlage.ui.wann.in') },
          ]}
        />
        <span
          className={`wann-in${wann.art === 'in' ? '' : ' blass'}`}
          onFocus={() => {
            if (wann.art !== 'in') waehle('in');
          }}>
          <ZeitraumEingabe
            aria-label={t('automatisierung.vorlage.ui.wann.zeitraum')}
            wert={roh}
            setze={(r) => {
              setLetzter(r);
              setze(ausRoh(r));
            }}
          />
        </span>
      </div>
    </FeldGruppe>
  );
}

/**
 * Haken „Datum“ unter „Fragt beim Anwenden“ (#1180): bei „In …“ frei wählbar – dann ist das Datum ein Vorschlag, den man
 * beim Anwenden ändern darf; bei „Am gewählten Datum“ immer an, bei „Sofort“ aus (beides gesperrt, mit Grund).
 */
export function DatumFrage({ e, setze }: { e: Entwurf; setze: (an: boolean) => void }) {
  return (
    <HakenFeld beschriftung={t('automatisierung.vorlage.ui.frage.datum')} hilfe="werkbank.ablaufvorlagen.datum">
      <input type="checkbox" checked={fragtDatum(e)} disabled={e.wann.art !== 'in'} onChange={(x) => setze(x.target.checked)} />
    </HakenFeld>
  );
}
/** Warum „Datum“ so steht (#1175): unter den Haken statt dazwischen. */
export const datumGrund = (e: Entwurf) =>
  t(
    e.wann.art === 'in'
      ? 'automatisierung.vorlage.ui.frage.datum.vorschlag'
      : e.wann.art === 'datum'
        ? 'automatisierung.vorlage.ui.frage.datum.text'
        : 'automatisierung.vorlage.ui.frage.datum.sofort',
  );

/** Kopf des Editors: Name, an/aus, Kopieren, Zurücksetzen – und ob ein Paket die Vorlage ersetzt. */
export function VorlageKopf({
  v,
  aktion,
}: {
  v?: AblaufvorlageAnsicht;
  aktion: (f: () => Promise<unknown>, gut: string) => Promise<void>;
}) {
  return (
    <>
      <div className="zeile-zwischen">
        <h2 className="h3">{v ? v.name : t('automatisierung.vorlage.ui.neu.titel')}</h2>
        {v && (
          <div className="knoepfe">
            {/* An/aus als Schalter (#1188), wirkt sofort. */}
            <Schalter
              an={v.aktiv}
              beschriftung={t('automatisierung.vorlage.ui.schalter')}
              beschriftungVerbergen
              setze={(an) =>
                aktion(
                  () => automatisierungApi.ablaufvorlageSchalten(v.kennung, an),
                  an ? t('automatisierung.vorlage.ui.eingeschaltet') : t('automatisierung.vorlage.ui.ausgeschaltet'),
                )
              }
            />
            <Knopf
              groesse="klein"
              onClick={() =>
                aktion(async () => {
                  const x = await automatisierungApi.ablaufvorlageKopieren(v.kennung);
                  geheZu(pfad(x.kennung));
                }, t('automatisierung.ui.kopiert'))
              }>
              {t('automatisierung.ui.kopieren')}
            </Knopf>
            {istKernVorlage(v.kennung) && v.herkunft === 'kern' && v.version > 0 && (
              <Knopf
                groesse="klein"
                onClick={() =>
                  aktion(() => automatisierungApi.ablaufvorlageZuruecksetzen(v.kennung), t('automatisierung.vorlage.ui.zurueckgesetzt'))
                }>
                {t('automatisierung.vorlage.ui.zuruecksetzen')}
              </Knopf>
            )}
          </div>
        )}
      </div>
      {v?.ueberlagert && <p className="leise klein">{t('automatisierung.vorlage.ui.ueberlagert', { paket: v.ueberlagert })}</p>}
      {v && !v.aktiv && <p className="leise klein">{t('automatisierung.vorlage.ui.aus.text')}</p>}
    </>
  );
}
