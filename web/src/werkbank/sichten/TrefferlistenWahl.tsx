import { SYSTEMSPALTEN, istSystemspalte, type Mappentyp } from '../../../../shared/src/model';
import { gemeinsameTrefferlisten, spaltenDerSicht, trefferlistenProblem, type SichtDaten } from '../../../../shared/src/sichten';
import { Hilfe } from '../../Hilfe';
import { t, tn } from '../../sprache';
import { Bereich, Feld, type Klappe } from '../../bausteine';

/* ---------- Trefferliste (#75) ---------- */

export function TrefferlistenWahl({
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
  const listen = gemeinsameTrefferlisten(typen);
  const wahl = spaltenDerSicht(typen, e.trefferliste);
  const problem = trefferlistenProblem(e.trefferliste, typen);
  const name = (k: string) => (istSystemspalte(k) ? SYSTEMSPALTEN[k] : (typen[0]?.felder.find((f) => f.key === k)?.label ?? k));
  const standard = listen.find((l) => l.standard);
  return (
    <Bereich
      id="trefferliste"
      titel={t('werkbank.sichten.trefferliste')}
      hilfe={<Hilfe ort="sicht.trefferliste" />}
      klappe={klappe}
      kurz={
        !typen.length
          ? t('werkbank.sichten.systemspalten')
          : problem
            ? t('werkbank.sichten.trefferliste-fehlt-standard')
            : (listen.find((l) => l.key === e.trefferliste)?.name ??
              (standard ? t('werkbank.sichten.standard', { name: standard.name }) : t('werkbank.sichten.standard-2')))
      }>
      {!typen.length ? (
        <p className="leise">{t('werkbank.sichten.ohne-mappentypen-zeigt-die')}</p>
      ) : (
        <>
          <p className="leise">
            {tn('werkbank.sichten.welche-spalten-die-liste', {
              wert: typen.length > 1 && t('werkbank.sichten.bei-mehreren-mappentypen-gibt'),
            })}
          </p>
          <Feld beschriftung={t('werkbank.sichten.trefferliste')} className="schmal">
            <select value={e.trefferliste ?? ''} onChange={(x) => setE((y) => ({ ...y, trefferliste: x.target.value || null }))}>
              <option value="">
                {standard ? t('werkbank.sichten.standard', { name: standard.name }) : t('werkbank.sichten.standard-systemspalten')}
              </option>
              {problem && <option value={e.trefferliste!}>{tn('werkbank.sichten.fehlt', { trefferliste: e.trefferliste })}</option>}
              {listen.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.name}
                  {l.standard ? t('werkbank.sichten.standard-3') : ''}
                </option>
              ))}
            </select>
          </Feld>
          {problem ? (
            <p className="fehlertext klein">{problem}</p>
          ) : (
            <p className="leise klein">
              {t('werkbank.sichten.spalten')}{' '}
              {wahl.spalten.length ? wahl.spalten.map(name).join(', ') : t('werkbank.sichten.keine-einfache-liste-mit')}
            </p>
          )}
        </>
      )}
    </Bereich>
  );
}
