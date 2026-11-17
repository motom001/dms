import { useMemo, useState } from 'react';
import type { Mappentyp } from '../../../../shared/src/model';
import {
  bedingungsfelder,
  bedingungsProblem,
  beschreibeBedingung,
  ZAEHLVERGLEICHE,
  type Bedingung,
  type Bedingungsfeld,
  type SichtDaten,
  type Zaehlvergleich,
} from '../../../../shared/src/sichten';
import { ausgeblendeteFelder } from '../../../../shared/src/darstellung';
import { useDaten } from '../../daten';
import { Hilfe } from '../../Hilfe';
import { t, tn } from '../../sprache';
import { Bereich, Feld, HakenFeld, Knopf, type Klappe } from '../../bausteine';
import { FeldBedingung } from './FeldBedingung';
import { bKey, neueBedingung as neu, ZIEL_GESAMT, zieleFuer, zielKey, zielName, type Ziel } from './ziele';

/* ---------- Bedingungen ---------- */

type Daten = ReturnType<typeof useDaten>;

export function Bedingungen({
  e,
  setE,
  typen,
  klappe,
}: {
  e: SichtDaten;
  setE: (f: (x: SichtDaten) => SichtDaten) => void;
  typen: Mappentyp[];
  klappe: Klappe;
}) {
  const d = useDaten();
  const felder = useMemo(() => bedingungsfelder(typen), [typen]);
  // Ausgeblendete Felder (#655) nicht für neue Bedingungen; bestehende bleiben wählbar.
  const aus = useMemo(() => new Set(typen.flatMap((x) => [...ausgeblendeteFelder(x)])), [typen]);
  const ziele = zieleFuer(felder, typen);
  const setze = (i: number, b: Bedingung) => setE((x) => ({ ...x, bedingungen: x.bedingungen.map((y, j) => (j === i ? b : y)) }));
  const weg = (i: number) => setE((x) => ({ ...x, bedingungen: x.bedingungen.filter((_, j) => j !== i) }));
  const [titel, setTitel] = useState<Record<string, string>>({});
  const merke = (mid: string, text: string) => setTitel((x) => ({ ...x, [mid]: text }));

  return (
    <Bereich
      id="bedingungen"
      titel={t('werkbank.sichten.bedingungen-2')}
      hilfe={<Hilfe ort="sicht.bedingungen" />}
      klappe={klappe}
      kurz={e.bedingungen.length ? t('werkbank.sichten.bedingungen-3', { anzahl: e.bedingungen.length }) : t('werkbank.sichten.keine')}>
      {!typen.length ? (
        <p className="leise">{t('werkbank.sichten.bedingungen-gelten-fuer-die')}</p>
      ) : (
        <>
          <p className="leise">
            {tn('werkbank.sichten.die-ansicht-zeigt-nur', {
              b: <strong>{t('werkbank.sichten.alle')}</strong>,
              wert: typen.length > 1 && t('werkbank.sichten.bei-mehreren-mappentypen-gibt-2'),
            })}
          </p>
          {e.bedingungen.length > 0 && (
            <ol className="bedingungen">
              {e.bedingungen.map((b, i) => bedingungsZeile({ b, i, typen, ziele, aus, d, titel, merke, setze, weg }))}
            </ol>
          )}
          <div className="knoepfe">
            <Knopf
              onClick={() =>
                setE((x) => ({
                  ...x,
                  bedingungen: [...x.bedingungen, neu(ziele.find((z) => z.wert !== 'feld' || !aus.has(z.feld.key)) ?? ziele[0])],
                }))
              }>
              {t('werkbank.sichten.bedingung')}
            </Knopf>
          </div>
        </>
      )}
    </Bereich>
  );
}

/** Eine Bedingung: Ziel, Vergleich und Wert, darunter in Worten (oder das Problem). */
function bedingungsZeile({
  b,
  i,
  typen,
  ziele,
  aus,
  d,
  titel,
  merke,
  setze,
  weg,
}: {
  b: Bedingung;
  i: number;
  typen: Mappentyp[];
  ziele: Ziel[];
  aus: Set<string>;
  d: Daten;
  titel: Record<string, string>;
  merke: (id: string, text: string) => void;
  setze: (i: number, b: Bedingung) => void;
  weg: (i: number) => void;
}) {
  const problem = bedingungsProblem(b, typen);
  const ziel = ziele.find((z) => zielKey(z) === bKey(b));
  return (
    <li key={i} className={problem ? 'fehlerhaft' : ''}>
      <div className="bedingungszeile">
        <Feld beschriftung={t('werkbank.sichten.feld-oder-register')} beschriftungVerbergen>
          <select
            value={ziel ? zielKey(ziel) : ''}
            onChange={(x) => {
              const z = ziele.find((y) => zielKey(y) === x.target.value);
              if (z) setze(i, neu(z));
            }}>
            {zielOptionen(b, ziel, ziele, aus)}
          </select>
        </Feld>
        {b.art === 'feld' && ziel?.wert === 'feld' ? (
          <FeldBedingung b={b} feld={ziel.feld} setze={(n) => setze(i, n)} titel={titel} merke={merke} />
        ) : b.art === 'frist' ? (
          <FristBedingung b={b} typen={typen} setze={(n) => setze(i, n)} />
        ) : (
          b.art !== 'feld' && b.art !== 'favorit' && b.art !== 'merkmal' && zaehlVergleich(b, (n) => setze(i, n))
        )}
        <Knopf art="link" groesse="klein" symbol="schliessen" onClick={() => weg(i)}>
          {t('werkbank.sichten.bedingung-entfernen')}
        </Knopf>
      </div>
      <p className={problem ? 'fehlertext klein' : 'leise klein'}>
        {problem ??
          beschreibeBedingung(
            b,
            typen,
            (mid) => titel[mid] ?? d.person(mid),
            undefined,
            (id) => d.typ(id)?.name,
          )}
      </p>
    </li>
  );
}

/** Auswahl des Ziels: Felder, Systemwerte, Anzahl, Fristen, Persönlich, Ablage. */
function zielOptionen(b: Bedingung, ziel: Ziel | undefined, ziele: Ziel[], aus: Set<string>) {
  return (
    <>
      {!ziel && (
        <option value="">
          {t('werkbank.sichten.fehlt-2', { wert: b.art === 'feld' ? b.feld : 'register' in b ? b.register : b.art })}
        </option>
      )}
      <optgroup label={t('werkbank.sichten.felder')}>
        {ziele
          .filter((z) => z.wert === 'feld' && !z.feld.key.startsWith('_') && (!aus.has(z.feld.key) || zielKey(z) === bKey(b)))
          .map((z) => (
            <option key={zielKey(z)} value={zielKey(z)}>
              {(z as { feld: Bedingungsfeld }).feld.label}
            </option>
          ))}
      </optgroup>
      <optgroup label={t('werkbank.sichten.systemwerte')}>
        {ziele
          .filter((z) => z.wert === 'feld' && z.feld.key.startsWith('_'))
          .map((z) => (
            <option key={zielKey(z)} value={zielKey(z)}>
              {(z as { feld: Bedingungsfeld }).feld.label}
            </option>
          ))}
      </optgroup>
      <optgroup label={t('werkbank.sichten.anzahl')}>
        {ziele
          .filter(
            (z) => z.wert !== 'feld' && z.wert !== 'favorit' && z.wert !== 'frist' && z.wert !== 'merkmal' && z.wert !== 'merkmalNicht',
          )
          .map((z) => (
            <option key={zielKey(z)} value={zielKey(z)}>
              {zielName(z)}
            </option>
          ))}
      </optgroup>
      <optgroup label={t('werkbank.sichten.fristen')}>
        <option value="frist">{ZIEL_GESAMT.frist}</option>
      </optgroup>
      <optgroup label={t('werkbank.sichten.persoenlich')}>
        <option value="favorit">{ZIEL_GESAMT.favorit}</option>
      </optgroup>
      <optgroup label={t('werkbank.sichten.ablage')}>
        <option value="merkmal">{ZIEL_GESAMT.merkmal}</option>
        <option value="merkmalNicht">{ZIEL_GESAMT.merkmalNicht}</option>
      </optgroup>
    </>
  );
}

/** Anzahl von Dokumenten oder Verknüpfungen: Vergleich und Zahl. */
function zaehlVergleich(
  b: Extract<Bedingung, { art: 'dokumente' | 'verknuepfungen' | 'dokumenteGesamt' | 'verknuepfungenGesamt' }>,
  setze: (b: Bedingung) => void,
) {
  return (
    <>
      <Feld beschriftung={t('werkbank.sichten.vergleich')} beschriftungVerbergen>
        <select value={b.vergleich} onChange={(x) => setze({ ...b, vergleich: x.target.value as Zaehlvergleich })}>
          {Object.entries(ZAEHLVERGLEICHE).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Feld>
      <Feld beschriftung={t('werkbank.sichten.anzahl')} beschriftungVerbergen>
        <input
          type="number"
          min={0}
          className="kurz"
          value={b.anzahl}
          onChange={(x) => setze({ ...b, anzahl: Math.max(0, Math.trunc(Number(x.target.value) || 0)) })}
        />
      </Feld>
    </>
  );
}

/** „hat Frist in den nächsten n Tagen“ (#133): ein Datumsfeld oder alle mit Erinnerung, optional nur meine. */
function FristBedingung({
  b,
  typen,
  setze,
}: {
  b: Extract<Bedingung, { art: 'frist' }>;
  typen: Mappentyp[];
  setze: (b: Bedingung) => void;
}) {
  const datumsfelder = typen.length
    ? typen[0].felder.filter(
        (f) => f.typ === 'datum' && typen.every((mappentyp) => mappentyp.felder.some((g) => g.key === f.key && g.typ === 'datum')),
      )
    : [];
  return (
    <span className="wertgruppe umbruch">
      <Feld beschriftung={t('werkbank.sichten.datumsfeld')} beschriftungVerbergen>
        <select value={b.feld ?? ''} onChange={(x) => setze({ ...b, feld: x.target.value || null })}>
          <option value="">{t('werkbank.sichten.alle-datumsfelder-die-eine')}</option>
          {datumsfelder.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
              {f.frist ? t('werkbank.sichten.erinnert') : ''}
            </option>
          ))}
          {b.feld && !datumsfelder.some((f) => f.key === b.feld) && (
            <option value={b.feld}>{t('werkbank.sichten.fehlt-3', { feld: b.feld })}</option>
          )}
        </select>
      </Feld>
      <span className="leise">{t('werkbank.sichten.in-den-naechsten')}</span>
      <Feld beschriftung={t('werkbank.sichten.tage')} beschriftungVerbergen>
        <input
          type="number"
          min={0}
          max={3650}
          className="kurz"
          value={b.tage}
          onChange={(x) => setze({ ...b, tage: Math.max(0, Math.min(3650, Math.trunc(Number(x.target.value) || 0))) })}
        />
      </Feld>
      <span className="leise">{t('werkbank.sichten.tagen')}</span>
      <HakenFeld beschriftung={t('werkbank.sichten.nur-meine')} className="klein">
        <input type="checkbox" checked={!!b.nurMeine} onChange={(x) => setze({ ...b, nurMeine: x.target.checked || undefined })} />
      </HakenFeld>
    </span>
  );
}
