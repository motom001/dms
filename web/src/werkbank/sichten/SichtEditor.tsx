import { istTeiltyp } from '../../../../shared/src/teile';
import { SprachText } from '../../einrichtung/Beschriftung';
import { useState } from 'react';
import type { Mappentyp } from '../../../../shared/src/model';
import {
  kinderVon,
  mitNachkommen,
  typenDerSicht,
  zeigtAlleTypen,
  ALLE_TYPEN,
  type Sicht,
  type SichtDaten,
} from '../../../../shared/src/sichten';
import { useDaten } from '../../daten';
import { Link } from '../../ort';
import { Speicherleiste } from '../../Speicherleiste';
import { SichtBerechtigungen, SichtTestlauf } from '../SichtRechte';
import { t, tn } from '../../sprache';
import { gebietsschema } from '../../../../shared/src/sprache';
import { Bereich, Fassungen, Feld, FeldGruppe, HakenFeld, Knopf, useBereiche, type Klappe } from '../../bausteine';
import { baumzeilen } from './baum';
import {
  liveFehler,
  sichtAktionen,
  SICHT_BEREICHE,
  useSichtEntwurf,
  useSichtVorschau,
  type SichtBereich,
  type SichtEntwurf,
} from './sicht-editor-zustand';
import { SymbolWahl } from './SymbolWahl';
import { TrefferlistenWahl } from './TrefferlistenWahl';
import { Bedingungen } from './Bedingungen';

type Daten = ReturnType<typeof useDaten>;

export function SichtEditor({ id }: { id: string }) {
  const d = useDaten();
  const x = useSichtEntwurf(id, d);
  const { neu, vorhanden, e, setE, ent, vorschau } = x;
  // Bereiche (#148) wie am Mappentyp: neu offen, bestehend eingeklappt bzw. wie zuletzt.
  const b = useBereiche(neu ? SICHT_BEREICHE.filter(([k]) => k !== 'fassungen') : SICHT_BEREICHE, 'sicht', neu ? null : id);
  const [fehlerOrte, setFehlerOrte] = useState<Set<SichtBereich>>(new Set());
  const hatFehler = (k: SichtBereich) => fehlerOrte.has(k) || liveFehler(k, e, d);
  const klappe = (k: SichtBereich): Klappe => b.klappe(k, hatFehler(k));

  const alleIds = d.typen.map((mappentyp) => mappentyp.id);
  const eigeneTypen = typenDerSicht(e, alleIds)
    .map((text) => d.typ(text))
    .filter((eintrag): eintrag is Mappentyp => !!eintrag);
  // Eine neue Sicht ist im Baum noch nicht da; für die Auswahl der Elternsicht zählt sie als Blatt.
  const ausgeschlossen = new Set(neu ? [] : mitNachkommen(d.sichten, id).map((s) => s.id));
  const geschwister = kinderVon(d.sichten, vorhanden?.elternId ?? null);
  const stelle = vorhanden ? geschwister.findIndex((s) => s.id === id) : -1;
  const untersichten = neu ? 0 : mitNachkommen(d.sichten, id).length - 1;
  // Wirksame Typen: eigene und die der Untersichten – sie bestimmen, welche Trefferlisten es gibt (#75).
  const wirksam = [
    ...new Set([
      ...typenDerSicht(e, alleIds),
      ...(neu
        ? []
        : mitNachkommen(d.sichten, id)
            .filter((s) => s.id !== id)
            .flatMap((s) => typenDerSicht(s, alleIds))),
    ]),
  ]
    .map((text) => d.typ(text))
    .filter((eintrag): eintrag is Mappentyp => !!eintrag);

  useSichtVorschau(x, id, d);

  if (!neu && !vorhanden)
    return (
      <div className="leer">
        <p>{t('werkbank.sichten.diese-ansicht-gibt-es')}</p>
      </div>
    );

  const a = sichtAktionen(x, { id, d, b, setFehlerOrte, geschwister, stelle });

  return (
    <form
      className="editorform"
      onSubmit={(ev) => {
        ev.preventDefault();
        void a.speichern();
      }}
      onKeyDown={ent.tasten}
      noValidate>
      <div className="seitenkopf">
        <div>
          <p className="ueber">{t('werkbank.sichten.ansicht')}</p>
          <h1>{e.name || (neu ? t('werkbank.sichten.neue-ansicht') : t('werkbank.sichten.ohne-namen'))}</h1>
          {!neu && (
            <p className="leise">
              <Link to={`/ablage/${id}`} className="verweis tippziel">
                {t('werkbank.sichten.in-der-ablage-oeffnen')}
              </Link>
            </p>
          )}
        </div>
      </div>

      {b.leiste(hatFehler, t('werkbank.sichten.bereiche-der-ansicht'))}

      {grunddaten({ x, d, klappe: klappe('grunddaten'), ausgeschlossen, geschwister, stelle, verschiebe: a.verschiebe })}

      {mappentypen({ x, d, klappe: klappe('mappentypen'), eigeneTypen, untersichten })}

      <TrefferlistenWahl e={e} setE={setE} typen={wirksam} klappe={klappe('trefferliste')} />

      <Bedingungen e={e} setE={setE} typen={eigeneTypen} klappe={klappe('bedingungen')} />

      <SichtBerechtigungen e={e} setE={setE} alle={d.sichten.filter((s) => !ausgeschlossen.has(s.id))} klappe={klappe('berechtigungen')} />

      <SichtTestlauf id={neu ? null : id} e={e} klappe={klappe('testlauf')} />
      {vorhanden && (
        <Fassungen
          art="sicht"
          eintrag={vorhanden.id}
          stand={vorhanden.geaendert}
          nachher={() => d.neuLaden()}
          klappe={klappe('fassungen')}
        />
      )}

      {vorschauHinweis(vorschau, untersichten)}

      <Speicherleiste
        ent={ent}
        gegenstand={t('werkbank.sichten.ansicht')}
        sendet={x.sendet}
        meldung={x.meldung}
        loeschen={
          !neu
            ? {
                text: t('werkbank.sichten.ansicht-loeschen-2'),
                rueckfrage: {
                  titel: t('werkbank.sichten.ansicht-loeschen', { name: vorhanden!.name }),
                  text: t('werkbank.sichten.mappen-werden-nicht-geloescht', {
                    hinweis: untersichten ? t('werkbank.sichten.ihre-unteransichten-ruecken-eine', { anzahl: untersichten }) : '',
                  }),
                  ja: t('werkbank.sichten.loeschen'),
                },
                onClick: a.loeschen,
              }
            : undefined
        }
      />
    </form>
  );
}

/** Grunddaten: Name, Elternsicht, Beschreibung, Symbol und die Stelle auf der Ebene. */
function grunddaten({
  x: { neu, vorhanden, e, setE, ent },
  d,
  klappe,
  ausgeschlossen,
  geschwister,
  stelle,
  verschiebe,
}: {
  x: SichtEntwurf;
  d: Daten;
  klappe: Klappe;
  ausgeschlossen: Set<string>;
  geschwister: Sicht[];
  stelle: number;
  verschiebe: (r: number) => Promise<void>;
}) {
  const { geaendert } = ent;
  const elternWahl = baumzeilen(d.sichten).filter(({ s }) => !ausgeschlossen.has(s.id));
  const setzeBeschriftungen = (b: unknown) => setE({ ...e, beschriftungen: (b ?? null) as SichtDaten['beschriftungen'] });
  return (
    <Bereich
      id="grunddaten"
      titel={t('werkbank.sichten.grunddaten')}
      klappe={klappe}
      kurz={e.elternId ? t('werkbank.sichten.unter-2', { wert: d.sicht(e.elternId)?.name ?? '…' }) : t('werkbank.sichten.oberste-ebene')}>
      <div className="raster">
        {/* Name und Beschreibung je Sprache (#728). */}
        <SprachText
          beschriftung={t('werkbank.sichten.name')}
          id="sicht-name"
          wert={e.name}
          placeholder={t('werkbank.sichten.z-b-vertraege-mit')}
          autoFocus={neu}
          teil="name"
          beschriftungen={e.beschriftungen ?? undefined}
          setzeWert={(name) => setE({ ...e, name })}
          setzeBeschriftungen={setzeBeschriftungen}
        />
        <Feld beschriftung={t('werkbank.sichten.liegt-unter')} hinweis={t('werkbank.sichten.elternsicht-im-baum')}>
          <select value={e.elternId ?? ''} onChange={(x) => setE({ ...e, elternId: x.target.value || null })}>
            <option value="">{t('werkbank.sichten.oberste-ebene-2')}</option>
            {elternWahl.map(({ s, tiefe }) => (
              <option key={s.id} value={s.id}>
                {'  '.repeat(tiefe)}
                {s.name}
              </option>
            ))}
          </select>
        </Feld>
      </div>
      <SprachText
        beschriftung={t('werkbank.sichten.beschreibung')}
        hinweis={t('werkbank.sichten.steht-in-der-ablage')}
        optional
        id="sicht-beschreibung"
        wert={e.beschreibung}
        teil="beschreibung"
        beschriftungen={e.beschriftungen ?? undefined}
        setzeWert={(beschreibung) => setE({ ...e, beschreibung })}
        setzeBeschriftungen={setzeBeschriftungen}
      />
      <SymbolWahl wert={e.symbol ?? null} setze={(symbol) => setE({ ...e, symbol })} />
      {!neu && geschwister.length > 1 && (
        <div className="knoepfe">
          <span className="leise klein">
            {t('werkbank.sichten.reihenfolge-auf-dieser-ebene', { wert: stelle + 1, geschwister: geschwister.length })}
          </span>
          <Knopf
            symbol="sortiert-auf"
            gesperrt={geaendert ? t('werkbank.sichten.erst-speichern') : stelle <= 0}
            onClick={() => verschiebe(-1)}>
            {t('werkbank.sichten.nach-oben')}
          </Knopf>
          <Knopf
            symbol="sortiert-ab"
            gesperrt={geaendert ? t('werkbank.sichten.erst-speichern') : stelle >= geschwister.length - 1}
            onClick={() => verschiebe(1)}>
            {t('werkbank.sichten.nach-unten')}
          </Knopf>
        </div>
      )}
      {!neu && vorhanden && e.elternId !== vorhanden.elternId && (
        <p className="hinweis info klein">
          {e.elternId
            ? t('werkbank.sichten.nach-dem-speichern-erbt', { wert: d.sicht(e.elternId)?.name ?? '…' })
            : t('werkbank.sichten.nach-dem-speichern-erbt-2')}
        </p>
      )}
    </Bereich>
  );
}

/** Mappentypen der Ansicht: alle oder eine Auswahl; Teile (#1031) nur, wenn schon gewählt. */
function mappentypen({
  x: { e, setE },
  d,
  klappe,
  eigeneTypen,
  untersichten,
}: {
  x: SichtEntwurf;
  d: Daten;
  klappe: Klappe;
  eigeneTypen: Mappentyp[];
  untersichten: number;
}) {
  const alleTypen = zeigtAlleTypen(e);
  const setzeTyp = (text: string, an: boolean) =>
    setE((x) => ({ ...x, typen: an ? [...x.typen, text] : x.typen.filter((y) => y !== text) }));
  return (
    <Bereich
      id="mappentypen"
      titel={t('werkbank.sichten.mappentypen')}
      klappe={klappe}
      kurz={
        alleTypen
          ? t('werkbank.sichten.alle-mappentypen')
          : eigeneTypen.length
            ? `${eigeneTypen.length}: ${eigeneTypen.map((mappentyp) => mappentyp.name).join(', ')}`
            : t('werkbank.sichten.nur-zum-gruppieren')
      }
      beschreibung={
        <>
          {t('werkbank.sichten.mappen-dieser-mappentypen-zeigt', {
            wert:
              untersichten > 0
                ? t('werkbank.sichten.dazu-kommen-die-mappen', { anzahl: untersichten })
                : t('werkbank.sichten.ohne-mappentyp-dient-sie'),
          })}
        </>
      }>
      <HakenFeld beschriftung={t('werkbank.sichten.alle-mappentypen-2')} hinweis={t('werkbank.sichten.auch-kuenftige-z-b')}>
        <input type="checkbox" checked={alleTypen} onChange={(x) => setE((y) => ({ ...y, typen: x.target.checked ? [ALLE_TYPEN] : [] }))} />
      </HakenFeld>
      <FeldGruppe beschriftung={t('werkbank.sichten.typen-gewaehlt')} beschriftungVerbergen className="typwahl">
        {/* Teile (#1031) stehen in keiner Ansicht – nur an ihrer übergeordneten Mappe. */}
        {d.typen
          .filter((mappentyp) => !istTeiltyp(mappentyp) || e.typen.includes(mappentyp.id))
          .map((mappentyp) => (
            <label key={mappentyp.id} className="haken">
              <input
                type="checkbox"
                disabled={alleTypen}
                checked={alleTypen || e.typen.includes(mappentyp.id)}
                onChange={(x) => setzeTyp(mappentyp.id, x.target.checked)}
              />
              <span>{mappentyp.name}</span>
            </label>
          ))}
      </FeldGruppe>
    </Bereich>
  );
}

/** Wie viele Mappen die Ansicht mit dem Entwurf zeigt. */
function vorschauHinweis(vorschau: number | null, untersichten: number) {
  return (
    <div className="hinweis info" role="status">
      <p>
        {vorschau === null ? (
          t('werkbank.sichten.vorschau-wird-berechnet')
        ) : (
          <>
            {tn('werkbank.sichten.diese-ansicht-zeigt-zurzeit', {
              b: (
                <strong>
                  {vorschau.toLocaleString(gebietsschema())} {t('werkbank.sichten.mappen-2', { anzahl: vorschau })}
                </strong>
              ),
              wert: untersichten > 0 ? t('werkbank.sichten.mit-unteransichten') : '',
            })}
          </>
        )}
      </p>
    </div>
  );
}
