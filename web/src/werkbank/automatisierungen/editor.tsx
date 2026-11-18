import {
  AUTOMATISIERUNG_GRENZEN,
  aussenKarten,
  istAufruf,
  kontextTyp,
  REIHENFOLGE,
  type Kontextdaten,
} from '../../../../shared/src/automatisierung';
import { automatisierungApi } from '../../api/automatisierung';
import { Bereich, Fassungen, Feld, Knopf, Schalter } from '../../bausteine';
import { geheZu, Link, loeseWache } from '../../ort';
import { t } from '../../sprache';
import { Speicherleiste } from '../../Speicherleiste';
import { Symbol } from '../../Symbol';
import { Ansage } from '../../ziehen';
import { AufrufAdresse } from '../AutomatisierungAufruf';
import { Zustellungen } from '../AutomatisierungAussen';
import { dannKurz, DannEditor } from './dann';
import { Bereichskasten, KarteHinzu, KartenListe, mitgeliefertSperre, Probleme, Vorrat } from './editor-teile';
import { kurzWennVon, useEditor, type EditorZustand } from './editor-zustand';
import { passt, vorratMit, vorratName } from './hilfen';
import { UndListe } from './und';
import { Verlauf, Wiedergeben } from './verlauf';
import { WennEditor } from './wenn';
import type { AutomatisierungenZustand } from './zustand';

/**
 * Editor einer Automatisierung (#675, #1000; #1279 aus Automatisierungen.tsx gezogen): Kopf mit Schalter, Sprungleiste,
 * Grunddaten, Wenn mit Und, Dann und Sonst; gespeichert dazu Ausprobieren, Verlauf, Zustellungen und Fassungen.
 */

type X = EditorZustand;

/** Kopf (#709, #1082, #706, #1173): Hinweise, Kurzform mit Position, Schalter an einer Stelle, Kopieren. */
function EditorKopf({ x, z }: { x: X; z: AutomatisierungenZustand }) {
  const { a, neu, e, setE, aktion } = x;
  const gleiche = z.stand!.automatisierungen.filter((y) => y.ausloeser === (a?.ausloeser ?? '') && y.aktiv);
  const position = a ? gleiche.findIndex((y) => y.id === a.id) + 1 : 0;
  return (
    <div className="mappenkopf">
      <p className="ueber">{t('automatisierung.ui.ueber')}</p>
      <h1>{neu ? t('automatisierung.ui.neu.titel') : a!.name}</h1>
      {/* Kann nie laufen, weil das Konto „Automatisierung“ den Mappentyp nicht lesen darf (#709): Hinweis mit Weg zum Testlauf (#710). */}
      {/* „Paket nach Zeitplan ausführen“ läuft ins Leere (#1082): Paket entfernt oder ohne das Ereignis – kein Fehler. */}
      {a?.leer?.map((x) => (
        <div key={x} className="hinweis warn" role="status">
          <p>{x}</p>
        </div>
      ))}
      {a?.rechte && (
        <div className="hinweis warn" role="status">
          <p>
            {a.rechte.text}{' '}
            <Link
              to={`/werkbank/typen/${a.rechte.typId}${a.rechte.kontoId ? `?testkonto=${a.rechte.kontoId}` : ''}#testlauf`}
              className="verweis">
              {t('automatisierung.ui.rechte.link')}
            </Link>
          </p>
        </div>
      )}
      {a && (
        <p className="leise">
          {a.kurz}
          {position > 0 && gleiche.length > 1 && <> · {t('automatisierung.ui.position', { nr: position, anzahl: gleiche.length })}</>}
        </p>
      )}
      {/* An/aus an einer Stelle (#706): neu wirkt der Schalter mit dem Speichern, sonst sofort. Er steht immer hier (#1173):
          angehalten ist er aus, der Grund steht einmal daneben, und Wieder-Einschalten ist das Umlegen. Keine Meldung
          danach – der Schalter zeigt den Zustand selbst; nur ein Fehler steht am Schalter. */}
      <div className="zeile handlungen">
        <Schalter
          an={a ? a.aktiv && !a.angehalten : e.aktiv}
          beschriftung={t('automatisierung.ui.schalter')}
          beschriftungVerbergen
          hinweis={a?.aktiv && a.angehalten ? a.angehalten.text : neu ? t('automatisierung.ui.schalter.neu') : undefined}
          setze={(an) => {
            if (!a) {
              setE({ ...e, aktiv: an });
              return;
            }
            return automatisierungApi.automatisierungSchalten(a.id, an).then(() => z.laden());
          }}
        />
        {a && (
          <Knopf
            onClick={() =>
              aktion(async () => {
                const x = await automatisierungApi.automatisierungKopieren(a.id);
                geheZu(`/werkbank/automatisierungen/${x.id}`);
              }, t('automatisierung.ui.kopiert'))
            }>
            {t('automatisierung.ui.kopieren')}
          </Knopf>
        )}
      </div>
    </div>
  );
}

function Grunddaten({ x }: { x: X }) {
  const { e, setE, klappe, probleme } = x;
  return (
    <Bereich
      id="grunddaten"
      titel={t('automatisierung.ui.bereich.grunddaten')}
      klappe={klappe('grunddaten')}
      kurz={[e.name, t('automatisierung.ui.bereich.reihenfolge', { reihenfolge: e.reihenfolge })].filter(Boolean).join(' · ')}>
      <div className="raster">
        <Feld beschriftung={t('automatisierung.ui.name')}>
          <input
            id="auto-name"
            value={e.name}
            maxLength={AUTOMATISIERUNG_GRENZEN.name}
            onChange={(x) => setE({ ...e, name: x.target.value })}
            required
          />
        </Feld>
        <Feld
          beschriftung={
            <>
              {t('automatisierung.ui.reihenfolge')} <small>{t('automatisierung.ui.reihenfolge.hilfe')}</small>
            </>
          }>
          <input
            id="auto-reihenfolge"
            type="number"
            min={REIHENFOLGE.min}
            max={REIHENFOLGE.max}
            value={e.reihenfolge}
            onChange={(x) => setE({ ...e, reihenfolge: Number(x.target.value) })}
          />
        </Feld>
        <Feld beschriftung={t('automatisierung.ui.beschreibung.feld')} className="breit">
          <textarea rows={2} value={e.beschreibung} onChange={(x) => setE({ ...e, beschreibung: x.target.value })} />
        </Feld>
      </div>
      <Probleme liste={probleme} ort="grunddaten" />
    </Bereich>
  );
}

/** Wenn mit den Und-Bedingungen (#1000): was die Automatisierung auslöst und wann sie weitermacht. */
function Wenn({ x, k, z }: { x: X; k: Kontextdaten; z: AutomatisierungenZustand }) {
  const { e, setE, klappe, probleme, a, typ, vorratOffen, setVorratOffen, ablage, fuegeHinzu } = x;
  const kurzWenn = kurzWennVon(x, k);
  return (
    <Bereich id="wenn" titel={t('automatisierung.ui.wenn')} klappe={klappe('wenn')} kurz={kurzWenn}>
      <div className="zeile">
        <Knopf groesse="klein" aria-expanded={vorratOffen} onClick={() => setVorratOffen(!vorratOffen)}>
          {t('automatisierung.ui.vorrat')}
        </Knopf>
      </div>
      {vorratOffen && <Vorrat vorrat={vorratMit(k)} ablage={ablage} fuegeHinzu={fuegeHinzu} passend={(v) => passt(v, typ, k, e.wenn)} />}
      <Bereichskasten hinweis={t('automatisierung.ui.wenn.hinweis')} ablage={ablage.ablage('wenn')}>
        <WennEditor w={e.wenn} k={k} setze={(w) => setE({ ...e, wenn: w })} />
      </Bereichskasten>
      {/* Aufruf von außen (#679): Adresse und Geheimnis erst an einer gespeicherten Karte. */}
      {istAufruf(e.wenn) &&
        (a && istAufruf(a.wenn) ? (
          <AufrufAdresse a={a} parameter={e.wenn.parameter} nachher={z.laden} />
        ) : (
          <p className="leise klein">{t('automatisierung.ui.aufruf.erst-speichern')}</p>
        ))}
      <div className="automatisierung-pfeil" aria-hidden="true">
        <Symbol name="sortiert-ab" />
      </div>
      <Bereichskasten
        titel={t('automatisierung.ui.und')}
        hinweis={e.und.karten.length ? undefined : t('automatisierung.ui.und.leer')}
        ablage={ablage.ablage('und')}
        kopf={
          e.und.karten.length > 1 && (
            <Feld beschriftung={t('automatisierung.ui.und.modus')} beschriftungVerbergen>
              <select value={e.und.modus} onChange={(x) => setE({ ...e, und: { ...e.und, modus: x.target.value as 'alle' | 'eine' } })}>
                <option value="alle">{t('automatisierung.ui.und.alle')}</option>
                <option value="eine">{t('automatisierung.ui.und.eine')}</option>
              </select>
            </Feld>
          )
        }
        fuss={<KarteHinzu vorrat={vorratMit(k)} bereich="und" fuegeHinzu={fuegeHinzu} passend={(v) => passt(v, typ, k, e.wenn)} />}>
        <UndListe karten={e.und.karten} typ={typ} k={k} setze={(karten) => setE({ ...e, und: { ...e.und, karten } })} />
      </Bereichskasten>
      <Probleme liste={probleme} ort="wenn" />
    </Bereich>
  );
}

/** Dann und Sonst (#677): Sonst läuft, wenn Und nicht zutrifft. */
function Dann({ x, k }: { x: X; k: Kontextdaten }) {
  const { e, setE, klappe, probleme, a, typ, ablage, fuegeHinzu, offenKarte, setOffenKarte } = x;
  return (
    <Bereich
      id="dann"
      titel={t('automatisierung.ui.dann')}
      klappe={klappe('dann')}
      kurz={[
        e.dann.length ? e.dann.map((x) => vorratName({ bereich: 'dann', art: x.art })).join(' · ') : t('automatisierung.ui.dann.leer'),
        ...(e.sonst.length
          ? [
              t('automatisierung.ui.sonst.kurz', {
                karten: e.sonst.map((x) => vorratName({ bereich: 'dann', art: x.art })).join(' · '),
              }),
            ]
          : []),
      ].join('; ')}>
      {(['dann', 'sonst'] as const).map((zweig) => (
        <Bereichskasten
          key={zweig}
          titel={zweig === 'sonst' ? t('automatisierung.ui.sonst') : undefined}
          hinweis={
            e[zweig].length
              ? zweig === 'sonst'
                ? t('automatisierung.ui.sonst.hinweis')
                : undefined
              : t.frei(`automatisierung.ui.${zweig}.leer`)
          }
          ablage={ablage.ablage(zweig)}
          fuss={<KarteHinzu vorrat={vorratMit(k)} bereich={zweig} fuegeHinzu={fuegeHinzu} passend={(v) => passt(v, typ, k, e.wenn)} />}>
          <KartenListe
            zweig={zweig}
            karten={e[zweig]}
            setze={(x) => setE((alt) => ({ ...alt, [zweig]: x }))}
            offen={offenKarte}
            setOffen={setOffenKarte}
            editor={(karte, setze) => (
              <DannEditor
                karte={karte}
                typ={typ}
                wenn={e.wenn}
                k={k}
                a={a}
                eigenesPaket={a?.herkunft === 'paket' ? (a.paketId ?? null) : undefined}
                setze={setze}
              />
            )}
            kurz={(karte) => dannKurz(karte, typ, k)}
          />
        </Bereichskasten>
      ))}
      <Probleme liste={probleme} ort="dann" />
    </Bereich>
  );
}

/** Speicherleiste mit Löschen – mitgelieferte (#1174) statt Löschen mit Erklärung. */
function Leiste({ x, k }: { x: X; k: Kontextdaten }) {
  const { a, ent, sendet, probleme, meldung, aktion } = x;
  return (
    <Speicherleiste
      ent={ent}
      gegenstand={t('automatisierung.ui.gegenstand')}
      sendet={sendet}
      ungueltig={probleme.length > 0}
      formular="auto-formular"
      meldung={meldung?.art === 'schlecht' ? meldung : undefined}
      loeschen={
        a
          ? {
              text: t('automatisierung.ui.loeschen'),
              rueckfrage: {
                titel: t('automatisierung.ui.loeschen.frage', { name: a.name }),
                text: t('automatisierung.ui.loeschen.text'),
                ja: t('automatisierung.ui.loeschen'),
              },
              onClick: () => {
                void aktion(async () => {
                  await automatisierungApi.automatisierungLoeschen(a.id);
                  loeseWache();
                  geheZu('/werkbank/automatisierungen', true);
                }, t('automatisierung.ui.geloescht'));
              },
              // Mitgeliefert (#1174): nicht löschbar – das Paket legte sie wieder an. Statt eines fehlenden Knopfs die Erklärung.
              gesperrt: a.herkunft === 'eigen' ? null : mitgeliefertSperre(a, k),
            }
          : undefined
      }
    />
  );
}

export function AutomatisierungEditor({ z, id }: { z: AutomatisierungenZustand; id: string }) {
  const x = useEditor(z, id);
  const { k, neu, a, b, hatFehler, meldung, ansage, speichern, ent, klappe } = x;
  if (!k)
    return z.fehler ? (
      <div className="hinweis schlecht">
        <p>{z.fehler}</p>
      </div>
    ) : (
      <p className="leise">{t('automatisierung.ui.lade')}</p>
    );
  if (!neu && !a)
    return (
      <div className="platzhalter">
        <p>{t('automatisierung.nicht-gefunden')}</p>
      </div>
    );
  return (
    <div className="editorform automatisierung">
      <EditorKopf x={x} z={z} />
      {b.leiste(hatFehler, t('automatisierung.ui.bereiche'))}
      {meldung && (
        <div className={`hinweis ${meldung.art}`}>
          <p>{meldung.text}</p>
        </div>
      )}
      <Ansage text={ansage} />
      <form
        id="auto-formular"
        className="editorform"
        onSubmit={(x) => {
          x.preventDefault();
          void speichern();
        }}
        onKeyDown={ent.tasten}>
        <Grunddaten x={x} />
        <Wenn x={x} k={k} z={z} />
        <Dann x={x} k={k} />
      </form>
      {a && (
        <>
          <Wiedergeben a={a} typ={kontextTyp(a.wenn, k.typen)} nachher={() => void z.laden()} klappe={klappe('ausprobieren')} />
          <Verlauf a={a} k={k} d={x.d.typ} klappe={klappe('verlauf')} />
          {aussenKarten(a).length > 0 && <Zustellungen a={a} klappe={klappe('zustellungen')} />}
          <Fassungen art="automatisierung" eintrag={a.id} stand={a.version} nachher={() => z.laden()} klappe={klappe('fassungen')} />
        </>
      )}
      <Leiste x={x} k={k} />
    </div>
  );
}
