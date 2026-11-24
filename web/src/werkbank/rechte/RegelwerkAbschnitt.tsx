import { Hilfe } from '../../Hilfe';
import { Knopf, Bereich, type Klappe } from '../../bausteine';
import { useCallback, useState, type ReactNode } from 'react';
import type { Mappentyp } from '../../../../shared/src/model';
import {
  kurzStandard,
  RECHTE,
  RECHTE_LISTE,
  regelProblem,
  systemSperre,
  type Recht,
  type Regel,
  type Regelwerk,
} from '../../../../shared/src/rechte';
import { t, tn } from '../../sprache';
import { Ansage, umgestellt, useZiehen, Ziehgriff } from '../../ziehen';
import { neueId, WIRKUNG_TEXT } from './hilfen';
import { RegelKarte } from './RegelKarte';

type SetzeRw = (f: (x: Regelwerk) => Regelwerk) => void;

/**
 * Abschnitt „Berechtigungen“ im Mappentyp-Editor (#142, #146). `typ` ist der Entwurf (Felder wie gerade bearbeitet),
 * `gespeichert` die Regeln, wie sie gespeichert sind – Kopieren in andere Typen geht nur mit gespeicherten Regeln.
 */
export function RegelwerkAbschnitt({
  rw,
  setRw,
  typ,
  gespeichert,
  neu,
  klappe,
  nachStandard,
}: {
  /** Feste Zeile direkt unter „Standard“ (#1559: „Darf an Dienste im Netz gehen“). */
  nachStandard?: ReactNode;
  rw: Regelwerk;
  setRw: (f: (x: Regelwerk) => Regelwerk) => void;
  typ: Mappentyp;
  gespeichert: Regelwerk | null;
  neu: boolean;
  klappe: Klappe;
}) {
  const o = useRegelnOrdnen(setRw);
  const { titel, merke } = o;
  const probleme = rw.regeln.map((r) => regelProblem(r, typ));
  const unveraendert = !!gespeichert && JSON.stringify(gespeichert) === JSON.stringify(rw);
  const setzeRegel = (i: number, r: Regel) => setRw((x) => ({ ...x, regeln: x.regeln.map((y, j) => (j === i ? r : y)) }));
  const sperre = systemSperre(typ);

  return (
    <Bereich
      id="berechtigungen"
      titel={t('werkbank.berechtigungen.berechtigungen')}
      hilfe={<Hilfe ort="werkbank.berechtigungen" />}
      klappe={klappe}
      kurz={t('werkbank.berechtigungen.standard-regeln', {
        anzahl: rw.regeln.length,
        kurzStandard: kurzStandard(
          Object.fromEntries(RECHTE_LISTE.map((k) => [k, rw.grund[k] && !((k === 'C' && sperre.C) || (k === 'D' && sperre.D))])) as Record<
            Recht,
            boolean
          >,
        ),
        wert: rw.regeln.length || t('werkbank.berechtigungen.keine'),
      })}
      beschreibung={
        <>
          {tn('werkbank.berechtigungen.wer-mappen-dieses-mappentyps', {
            b: <strong>{t('werkbank.berechtigungen.verwaltungsmodus')}</strong>,
          })}
        </>
      }>
      {grundWahl(rw, setRw, typ)}
      {nachStandard}

      <h3 className="zwischen">
        {t('werkbank.berechtigungen.regeln')} <Hilfe ort="berechtigungen.regeln" />
      </h3>
      <p className="leise">{t('werkbank.berechtigungen.von-oben-nach-unten')}</p>
      {rw.regeln.length > 0 && (
        <ol className="regeln">
          {rw.regeln.map((r, i) => (
            <li key={r.id} {...o.zieh.eintrag(r.id)}>
              <RegelKarte
                r={r}
                typ={typ}
                problem={probleme[i]}
                setze={(n) => setzeRegel(i, n)}
                titel={titel}
                merke={merke}
                offen={o.offen.has(r.id)}
                umschalten={() => o.umschalten(r.id)}
                griff={
                  <Ziehgriff
                    griff={o.zieh.griff(r.id, r.name || t('werkbank.berechtigungen.regel'))}
                    tasten={{ hoch: () => o.verschiebe(i, -1), runter: () => o.verschiebe(i, 1) }}
                  />
                }
                weg={() => setRw((x) => ({ ...x, regeln: x.regeln.filter((y) => y.id !== r.id) }))}
                gespeichert={unveraendert && !neu}
                nachKopie={() => {}}
              />
            </li>
          ))}
        </ol>
      )}
      <Ansage text={o.ansage} />
      <div className="knoepfe">
        <Knopf onClick={o.neueRegel}>{t('werkbank.berechtigungen.regel-2')}</Knopf>
      </div>
    </Bereich>
  );
}

/** Ordnen, Auf- und Zuklappen und neue Regeln (#146): Ziehen, Tastatur, Ansage. */
function useRegelnOrdnen(setRw: SetzeRw) {
  const [ansage, setAnsage] = useState('');
  const [titel, setTitel] = useState<Record<string, string>>({});
  const [offen, setOffen] = useState<Set<string>>(new Set());
  const umschalten = (id: string) =>
    setOffen((x) => {
      const n = new Set(x);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const merke = useCallback((id: string, text: string) => setTitel((x) => ({ ...x, [id]: text })), []);
  const zieh = useZiehen({
    fertig: (quelle, ziel, ort) => {
      if (ort === 'in') return;
      setRw((x) => {
        const von = x.regeln.findIndex((r) => r.id === quelle);
        const nach = x.regeln.findIndex((r) => r.id === ziel);
        setAnsage(
          t('werkbank.berechtigungen.steht-jetzt', {
            wert: x.regeln[von]?.name || t('werkbank.berechtigungen.regel'),
            wert2: ort === 'vor' ? t('werkbank.berechtigungen.vor') : t('werkbank.berechtigungen.nach'),
            wert3: x.regeln[nach]?.name || t('werkbank.berechtigungen.regel'),
          }),
        );
        return { ...x, regeln: umgestellt(x.regeln, von, nach, ort) };
      });
    },
  });
  const verschiebe = (i: number, r: number) =>
    setRw((x) => {
      const j = i + r;
      if (j < 0 || j >= x.regeln.length) return x;
      setAnsage(
        t('werkbank.berechtigungen.steht-jetzt-an-stelle', { wert: x.regeln[i].name || t('werkbank.berechtigungen.regel'), wert2: j + 1 }),
      );
      return { ...x, regeln: umgestellt(x.regeln, i, j, r < 0 ? 'vor' : 'nach') };
    });
  const neueRegel = () => {
    const id = neueId();
    setOffen((x) => new Set([...x, id]));
    setRw((x) => ({ ...x, regeln: [...x.regeln, { id, name: '', wenn: [{ art: 'rolle', rollen: [] }], dann: {}, stopp: false }] }));
  };
  return { ansage, titel, merke, offen, umschalten, zieh, verschiebe, neueRegel };
}

/** Standard je Recht: Knöpfe zum Wechseln, bei Systemtypen gesperrt (C, D). */
function grundWahl(rw: Regelwerk, setRw: SetzeRw, typ: Mappentyp) {
  const sperre = systemSperre(typ);
  return (
    <>
      <h3 className="zwischen">
        {t('werkbank.berechtigungen.standard')} <Hilfe ort="berechtigungen.grund" />
      </h3>
      <p className="leise klein">{t('werkbank.berechtigungen.gilt-solange-keine-regel')}</p>
      <div className="rechtewahl" role="group" aria-label={t('werkbank.berechtigungen.standard-je-recht')}>
        {RECHTE_LISTE.map((k) => {
          const fest = (k === 'C' && sperre.C) || (k === 'D' && sperre.D);
          const an = rw.grund[k] && !fest;
          return (
            <Knopf
              key={k}
              art="eigen"
              className={`rechtknopf ${an ? 'erteilen' : 'entziehen'}`}
              gesperrt={fest && t('werkbank.berechtigungen.geht-bei-diesem-systemtyp', { RECHTE: RECHTE[k] })}
              nurSymbol={t('werkbank.berechtigungen.standard-2', {
                RECHTE: RECHTE[k],
                wert: an ? t('werkbank.berechtigungen.erteilt') : t('werkbank.berechtigungen.entzogen'),
              })}
              title={
                fest
                  ? undefined
                  : t('werkbank.berechtigungen.klicken-zum-wechseln', {
                      RECHTE: RECHTE[k],
                      wert: an ? t('werkbank.berechtigungen.erteilt') : t('werkbank.berechtigungen.entzogen'),
                    })
              }
              onClick={() => setRw((x) => ({ ...x, grund: { ...x.grund, [k]: !x.grund[k] } }))}>
              <span className="buchstabe">{k}</span>
              {an ? WIRKUNG_TEXT.erteilen : WIRKUNG_TEXT.entziehen}
            </Knopf>
          );
        })}
      </div>
      {(sperre.C || sperre.D) && (
        <p className="leise klein">
          {typ.system === 'benutzer'
            ? t('werkbank.berechtigungen.benutzer-entstehen-und-verschwinden')
            : t('werkbank.berechtigungen.e-mail-mappen-entstehen')}
        </p>
      )}
    </>
  );
}
