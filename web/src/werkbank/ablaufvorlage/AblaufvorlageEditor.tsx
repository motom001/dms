import { useState } from 'react';
import {
  FRAGEN,
  fragtDatum,
  VORLAGEN_GRENZEN,
  VORLAGEN_REIHENFOLGE,
  vorlagenProbleme,
  vorlagenTypen,
  wannText,
  type AblaufvorlageAnsicht,
  type Frage,
} from '../../../../shared/src/ablaufvorlagen';
import { automatisierungApi } from '../../api/automatisierung';
import { useDaten } from '../../daten';
import { geheZu, loeseWache } from '../../ort';
import { t } from '../../sprache';
import { Speicherleiste, useEntwurf } from '../../Speicherleiste';
import { Fassungen, Feld, FeldGruppe, HakenFeld, Knopf } from '../../bausteine';
import { FEST, pfad, type AblaufvorlagenZustand, type Entwurf } from './zustand';
import { KartenEditor } from './KartenEditor';
import { DatumFrage, datumGrund, TypenWahl, VorlageKopf, WannEditor } from './EditorTeile';
import { Ausprobieren } from './Ausprobieren';
import { GeradeBenutzt, Verlauf } from './Verlauf';

/* ---------- Editor ---------- */

const LEER: Entwurf = {
  name: '',
  beschreibung: '',
  reihenfolge: VORLAGEN_REIHENFOLGE.eigen,
  typen: [],
  wann: { art: 'in', anzahl: 6, einheit: 'monate' },
  fragen: ['text'],
  aktiv: true,
  karten: [{ id: 'k1', art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'selbst' }], text: '{eingabe}' }],
};
const kopie = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
type SetzeE = (e: Entwurf) => void;
type Aktion = (f: () => Promise<unknown>, gut: string) => Promise<void>;

export function AblaufvorlageEditor({ z, kennung }: { z: AblaufvorlagenZustand; kennung: string }) {
  const d = useDaten();
  const neu = kennung === 'neu';
  const v = neu ? undefined : z.stand?.vorlagen.find((x) => x.kennung === kennung);
  const gespeichert: Entwurf = v
    ? {
        name: v.name,
        beschreibung: v.beschreibung,
        reihenfolge: v.reihenfolge,
        typen: v.typen,
        wann: v.wann,
        fragen: v.fragen,
        karten: v.karten,
        aktiv: v.aktiv,
      }
    : LEER;
  const [e, setE] = useState<Entwurf>(() => kopie(gespeichert));
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const ent = useEntwurf(gespeichert, e, { neu, zuruecksetzen: () => setE(kopie(gespeichert)), liste: '/werkbank/ablaufvorlagen' });
  if (!z.stand) return <p className="leise">{t('automatisierung.ui.lade')}</p>;
  if (!neu && !v)
    return (
      <div className="platzhalter">
        <p>{t('automatisierung.vorlage.fehlt')}</p>
      </div>
    );
  const typen = vorlagenTypen(d.typen);
  // Fragen folgen dem Inhalt: „Datum“ immer bei „am gewählten Datum“, nie bei „sofort“, bei „In …“ nach Wahl (#1180).
  const fragen = (x: Entwurf): Frage[] => FRAGEN.filter((f) => (f === 'datum' ? fragtDatum(x) : x.fragen.includes(f)));
  const probleme = vorlagenProbleme({ ...e, fragen: fragen(e) }, d.typen);
  const aktion = async (f: () => Promise<unknown>, gut: string) => {
    setMeldung(undefined);
    try {
      await f();
      await z.laden();
      setMeldung({ art: 'gut', text: gut });
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    }
  };
  async function speichern() {
    setSendet(true);
    setMeldung(undefined);
    try {
      const daten = { ...e, fragen: fragen(e) };
      const x = v
        ? await automatisierungApi.ablaufvorlageAendern(v.kennung, { ...daten, version: v.version })
        : await automatisierungApi.ablaufvorlageAnlegen(daten);
      await z.laden();
      loeseWache();
      if (neu) geheZu(pfad(x.kennung), true);
      setMeldung({ art: 'gut', text: t('automatisierung.vorlage.ui.gespeichert') });
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    } finally {
      setSendet(false);
    }
  }
  const frage = (f: Frage, an: boolean) => setE({ ...e, fragen: an ? [...new Set([...e.fragen, f])] : e.fragen.filter((x) => x !== f) });
  return (
    <div className="stapel">
      <form
        className="blatt"
        onSubmit={(x) => {
          x.preventDefault();
          void speichern();
        }}>
        <VorlageKopf v={v} aktion={aktion} />
        {grundangaben(e, setE)}
        <TypenWahl typen={typen} gewaehlt={e.typen} setze={(x) => setE({ ...e, typen: x })} />
        <WannEditor wann={e.wann} setze={(wann) => setE({ ...e, wann })} />
        {fragenGruppe(e, frage)}
        {kartenListe(e, setE, d.typen)}
        <p className="leise klein">
          {t('automatisierung.vorlage.ui.kurz', { wann: wannText(e.wann, e.wann.art === 'in' && fragtDatum(e)) })}
        </p>
        {probleme.length > 0 && (
          <ul className="fehlertext klein">
            {probleme.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {speicherleiste({ ent, sendet, probleme, meldung, v, aktion })}
      </form>
      {v && (
        <>
          <Ausprobieren key={`${v.kennung}-${v.version}`} v={v} />
          <GeradeBenutzt v={v} nachher={() => void z.laden()} />
          <Verlauf v={v} />
          <Fassungen art="ablaufvorlage" eintrag={v.kennung} stand={v.version} nachher={() => z.laden()} klappe={FEST} />
        </>
      )}
    </div>
  );
}

/** Name, Reihenfolge im Menü und Beschreibung. */
function grundangaben(e: Entwurf, setE: SetzeE) {
  return (
    <>
      <div className="raster">
        <Feld beschriftung={t('automatisierung.vorlage.ui.name')} id="vorlage-name">
          <input value={e.name} maxLength={VORLAGEN_GRENZEN.name} onChange={(x) => setE({ ...e, name: x.target.value })} />
        </Feld>
        <Feld beschriftung={t('automatisierung.vorlage.ui.reihenfolge')} hinweis={t('automatisierung.vorlage.ui.reihenfolge.text')}>
          <input
            type="number"
            min={VORLAGEN_REIHENFOLGE.min}
            max={VORLAGEN_REIHENFOLGE.max}
            value={e.reihenfolge}
            onChange={(x) => setE({ ...e, reihenfolge: Number(x.target.value) })}
          />
        </Feld>
      </div>
      <Feld beschriftung={t('automatisierung.vorlage.ui.beschreibung-feld')} optional>
        <textarea
          rows={2}
          maxLength={VORLAGEN_GRENZEN.beschreibung}
          value={e.beschreibung}
          onChange={(x) => setE({ ...e, beschreibung: x.target.value })}
        />
      </Feld>
    </>
  );
}

/** Was beim Anwenden gefragt wird: Empfänger, Datum (#1180), Text. */
function fragenGruppe(e: Entwurf, frage: (f: Frage, an: boolean) => void) {
  return (
    <FeldGruppe
      beschriftung={t('automatisierung.vorlage.ui.fragen')}
      hinweis={
        <>
          {t('automatisierung.vorlage.ui.fragen.text')} {t('automatisierung.vorlage.ui.frage.datum.hinweis', { grund: datumGrund(e) })}
        </>
      }>
      <HakenFeld beschriftung={t('automatisierung.vorlage.ui.frage.empfaenger')}>
        <input type="checkbox" checked={e.fragen.includes('empfaenger')} onChange={(x) => frage('empfaenger', x.target.checked)} />
      </HakenFeld>
      <DatumFrage e={e} setze={(an) => frage('datum', an)} />
      <HakenFeld beschriftung={t('automatisierung.vorlage.ui.frage.text')}>
        <input type="checkbox" checked={e.fragen.includes('text')} onChange={(x) => frage('text', x.target.checked)} />
      </HakenFeld>
    </FeldGruppe>
  );
}

/** Karten der Vorlage (Aufgabe oder Benachrichtigung) mit „+ Karte“. */
function kartenListe(e: Entwurf, setE: SetzeE, typen: ReturnType<typeof useDaten>['typen']) {
  return (
    <>
      <h3 className="h4">{t('automatisierung.vorlage.ui.karten')}</h3>
      <p className="leise klein">{t('automatisierung.vorlage.ui.karten.text')}</p>
      {e.karten.map((k) => (
        <KartenEditor
          key={k.id}
          karte={k}
          typen={typen}
          gewaehlt={e.typen}
          setze={(n) => setE({ ...e, karten: e.karten.map((x) => (x.id === k.id ? n : x)) })}
          entfernen={e.karten.length > 1 ? () => setE({ ...e, karten: e.karten.filter((x) => x.id !== k.id) }) : undefined}
        />
      ))}
      {e.karten.length < VORLAGEN_GRENZEN.karten && (
        <Knopf
          groesse="klein"
          onClick={() =>
            setE({
              ...e,
              karten: [
                ...e.karten,
                { id: `k${Date.now().toString(36)}`, art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'selbst' }], text: '' },
              ],
            })
          }>
          {t('automatisierung.vorlage.ui.karte-neu')}
        </Knopf>
      )}
    </>
  );
}

/** Speicherleiste der Vorlage; eigene Vorlagen lassen sich löschen. */
function speicherleiste({
  ent,
  sendet,
  probleme,
  meldung,
  v,
  aktion,
}: {
  ent: ReturnType<typeof useEntwurf>;
  sendet: boolean;
  probleme: string[];
  meldung: { art: 'gut' | 'schlecht'; text: string } | undefined;
  v: AblaufvorlageAnsicht | undefined;
  aktion: Aktion;
}) {
  return (
    <Speicherleiste
      ent={ent}
      gegenstand={t('automatisierung.vorlage.ui.gegenstand')}
      sendet={sendet}
      ungueltig={probleme.length > 0}
      meldung={meldung}
      loeschen={
        v && v.herkunft === 'eigen'
          ? {
              text: t('automatisierung.vorlage.ui.loeschen.knopf'),
              rueckfrage: {
                titel: t('automatisierung.vorlage.ui.loeschen.frage', { name: v.name }),
                text: t('automatisierung.vorlage.ui.loeschen.text'),
                ja: t('automatisierung.ui.loeschen'),
              },
              onClick: () =>
                aktion(async () => {
                  await automatisierungApi.ablaufvorlageLoeschen(v.kennung);
                  loeseWache();
                  geheZu('/werkbank/ablaufvorlagen', true);
                }, t('automatisierung.vorlage.ui.geloescht')),
            }
          : undefined
      }
    />
  );
}
