import { useEffect, useMemo, useState } from 'react';
import type { Feld as FeldDef, Mappentyp } from '../../../../shared/src/model';
import {
  bedingungsfelder,
  beschreibeBedingung,
  OPERATOREN,
  OPERATOREN_JE_ART,
  auswahlProbleme,
  OPS_EIGENES_FELD,
  passendeEigeneFelder,
  type Bedingung,
  type Bedingungsfeld,
  type Feldbedingung,
  type Operator,
} from '../../../../shared/src/sichten';
import { werkbankApi } from '../../api/werkbank';
import { useDaten } from '../../daten';
import { Hilfe } from '../../Hilfe';
import { t, tn } from '../../sprache';
import { gebietsschema } from '../../../../shared/src/sprache';
import { Feld, HakenFeld, Knopf } from '../../bausteine';
import { FeldBedingung } from './FeldBedingung';

type Daten = ReturnType<typeof useDaten>;

/**
 * Auswahlfilter am Referenzfeld (#172): „Nur Mappen, die …“ – Bedingungen auf Felder und
 * Systemwerte des Zieltyps, wie bei Sichten; dazu, wie viele Mappen passen.
 */
export function AuswahlFilter({
  ziel,
  zielTypen,
  bedingungen,
  setze,
  eigeneFelder = [],
  feldKey = '',
}: {
  /** Bei mehreren Zieltypen (#1036) ein Bild mit den Feldern, die alle haben, und den Namen; gezählt wird über `zielTypen`. */
  ziel: Mappentyp;
  zielTypen?: string[];
  bedingungen: Feldbedingung[];
  setze: (b: Feldbedingung[]) => void;
  /** Werte aus der eigenen Mappe (#173): Felder dieses Typs und das Referenzfeld selbst (kein Kreis). */
  eigeneFelder?: FeldDef[];
  feldKey?: string;
}) {
  const eigeneNamen = Object.fromEntries(eigeneFelder.map((f) => [f.key, f.label]));
  const d = useDaten();
  const felder = useMemo(() => bedingungsfelder([ziel]), [ziel]);
  const [titel, setTitel] = useState<Record<string, string>>({});
  const merke = (mid: string, text: string) => setTitel((x) => ({ ...x, [mid]: text }));
  const [zahl, setZahl] = useState<{ passen: number; gesamt: number } | null>(null);
  const schluessel = JSON.stringify(bedingungen);
  useEffect(() => {
    let aktuell = true;
    const timer = setTimeout(() => {
      werkbankApi
        .auswahlZaehlen(zielTypen?.length ? zielTypen : [ziel.id], bedingungen)
        .then((z) => aktuell && setZahl(z))
        .catch(() => aktuell && setZahl(null));
    }, 300);
    return () => {
      aktuell = false;
      clearTimeout(timer);
    };
  }, [ziel.id, zielTypen?.join(','), schluessel]); // eslint-disable-line react-hooks/exhaustive-deps -- neu zählen nur bei anderem Ziel oder anderen Bedingungen (schluessel)
  const neu = (f: Bedingungsfeld): Feldbedingung => ({ art: 'feld', feld: f.key, op: OPERATOREN_JE_ART[f.art][0] });
  const aendere = (i: number, b: Bedingung) => {
    if (b.art === 'feld') setze(bedingungen.map((x, j) => (j === i ? b : x)));
  };
  const zeile = { ziel, felder, eigeneFelder, eigeneNamen, feldKey, d, titel, merke, neu, aendere };
  return (
    <div className="auswahlfilter">
      <p className="klein">
        <strong>{t('werkbank.sichten.nur-mappen-die')}</strong>{' '}
        <span className="leise">
          {tn('werkbank.sichten.alle-bedingungen-erfuellen-leer', { name: ziel.name, hilfe: <Hilfe ort="werkbank.auswahlfilter" /> })}
        </span>
      </p>
      {bedingungen.length > 0 && (
        <ol className="bedingungen">
          {bedingungen.map((b, i) => filterZeile(b, i, zeile, () => setze(bedingungen.filter((_, j) => j !== i))))}
        </ol>
      )}
      <div className="zeile">
        <Knopf gesperrt={!felder.length} onClick={() => setze([...bedingungen, neu(felder[0])])}>
          {t('werkbank.sichten.bedingung')}
        </Knopf>
        {zahl && bedingungen.length > 0 && (
          <span className="leise klein">
            {t('werkbank.sichten.von-passen', {
              passen: zahl.passen.toLocaleString(gebietsschema()),
              gesamt: zahl.gesamt.toLocaleString(gebietsschema()),
              name: ziel.name,
            })}
          </span>
        )}
      </div>
    </div>
  );
}

interface ZeilenKontext {
  ziel: Mappentyp;
  felder: Bedingungsfeld[];
  eigeneFelder: FeldDef[];
  eigeneNamen: Record<string, string>;
  feldKey: string;
  d: Daten;
  titel: Record<string, string>;
  merke: (id: string, text: string) => void;
  neu: (f: Bedingungsfeld) => Feldbedingung;
  aendere: (i: number, b: Bedingung) => void;
}

/** Eine Filterbedingung: Feld des Zieltyps, Vergleich und Wert (fest oder aus dieser Mappe), darunter in Worten. */
function filterZeile(b: Feldbedingung, i: number, k: ZeilenKontext, entfernen: () => void) {
  const { ziel, felder, eigeneFelder, eigeneNamen, feldKey, d, titel, merke, neu, aendere } = k;
  const feld = felder.find((f) => f.key === b.feld);
  const problem = auswahlProbleme([b], ziel, { felder: eigeneFelder, feldKey })[0] ?? null;
  const moeglich = passendeEigeneFelder(b, ziel.felder, eigeneFelder, feldKey);
  const eigen = b.wert?.art === 'eigenesFeld' ? b.wert.feld : null;
  return (
    <li key={i} className={problem ? 'fehlerhaft' : ''}>
      <div className="bedingungszeile">
        <Feld beschriftung={t('werkbank.sichten.feld-des-zieltyps')} beschriftungVerbergen>
          <select
            value={feld ? b.feld : ''}
            onChange={(x) => {
              const f = felder.find((y) => y.key === x.target.value);
              if (f) aendere(i, neu(f));
            }}>
            {!feld && <option value="">{t('werkbank.sichten.fehlt-4', { feld: b.feld })}</option>}
            <optgroup label={t('werkbank.sichten.felder')}>
              {felder
                .filter((f) => !f.key.startsWith('_'))
                .map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
            </optgroup>
            <optgroup label={t('werkbank.sichten.systemwerte')}>
              {felder
                .filter((f) => f.key.startsWith('_'))
                .map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
            </optgroup>
          </select>
        </Feld>
        {feld &&
          (eigen === null ? (
            <FeldBedingung b={b} feld={feld} setze={(n) => aendere(i, n)} titel={titel} merke={merke} />
          ) : (
            eigenesFeld({ b, i, feld, eigen, moeglich }, k)
          ))}
        {feld && (moeglich.length > 0 || eigen !== null) && (
          <HakenFeld beschriftung={t('werkbank.sichten.wert-aus-dieser-mappe')} className="klein">
            <input
              type="checkbox"
              checked={eigen !== null}
              onChange={(x) =>
                aendere(
                  i,
                  x.target.checked
                    ? {
                        art: 'feld',
                        feld: b.feld,
                        op: OPS_EIGENES_FELD.includes(b.op)
                          ? b.op
                          : (OPERATOREN_JE_ART[feld.art].find((o) => OPS_EIGENES_FELD.includes(o)) ?? b.op),
                        wert: { art: 'eigenesFeld', feld: moeglich[0]?.key ?? '' },
                      }
                    : neu(feld),
                )
              }
            />
          </HakenFeld>
        )}
        <Knopf groesse="klein" symbol="schliessen" onClick={entfernen}>
          {t('werkbank.sichten.entfernen')}
        </Knopf>
      </div>
      <p className={problem ? 'fehlertext klein' : 'leise klein'}>
        {problem ??
          beschreibeBedingung(
            b,
            [ziel],
            (mid) => titel[mid] ?? d.person(mid),
            eigeneNamen,
            (id) => d.typ(id)?.name,
          )}
        {eigen && !problem && <span> {t('werkbank.sichten.ist-dieses-feld-leer')}</span>}
      </p>
    </li>
  );
}

/** Wert aus dieser Mappe (#173): Vergleich und das Feld der eigenen Mappe. */
function eigenesFeld(
  {
    b,
    i,
    feld,
    eigen,
    moeglich,
  }: { b: Feldbedingung; i: number; feld: Bedingungsfeld; eigen: string; moeglich: Array<{ key: string; label: string }> },
  k: ZeilenKontext,
) {
  return (
    <>
      <Feld beschriftung={t('werkbank.sichten.vergleich')} beschriftungVerbergen>
        <select value={b.op} onChange={(x) => k.aendere(i, { ...b, op: x.target.value as Operator })}>
          {OPERATOREN_JE_ART[feld.art]
            .filter((o) => OPS_EIGENES_FELD.includes(o))
            .map((o) => (
              <option key={o} value={o}>
                {OPERATOREN[o]}
              </option>
            ))}
        </select>
      </Feld>
      <Feld beschriftung={t('werkbank.sichten.feld-dieser-mappe')} beschriftungVerbergen>
        <select value={eigen} onChange={(x) => k.aendere(i, { ...b, wert: { art: 'eigenesFeld', feld: x.target.value } })}>
          {!moeglich.some((m) => m.key === eigen) && (
            <option value={eigen}>{t('werkbank.sichten.passt-nicht', { wert: k.eigeneNamen[eigen] ?? eigen })}</option>
          )}
          {moeglich.map((m) => (
            <option key={m.key} value={m.key}>
              {t('werkbank.sichten.dieser-mappe', { label: m.label })}
            </option>
          ))}
        </select>
      </Feld>
    </>
  );
}
