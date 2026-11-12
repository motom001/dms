import { Bereich, type Klappe } from '../bausteine';
import { t, tn } from '../sprache';
import { useEffect, useState, type ReactNode } from 'react';
import { beschreibeRegelBedingung, type Wirkung } from '../../../shared/src/rechte';
import {
  kurzSicht, kurzSichtRegel, offeneSicht, SICHT_RECHTE, SICHT_RECHTE_LISTE, sichtRegelProblem, sichtRegelwerkVon,
  type SichtBedingung, type SichtRechte, type SichtRegel, type SichtRegelwerk,
} from '../../../shared/src/sichtrechte';
import type { Sicht, SichtDaten } from '../../../shared/src/sichten';
import { api } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { Ansage, umgestellt, useZiehen, ziehTasten } from '../ziehen';
import { MappenSuche } from './Sichten';
import { testlaufSchluessel } from '../../../shared/src/testlauf';
import { TestBenutzerWahl, useTestlauf } from './TestlaufWahl';

/**
 * Berechtigungen an Sichten (#148): Standard (nur oberste Sicht), geerbte Regeln schreibgeschützt,
 * eigene Regeln (in Untersichten nur ✗), Testlauf mit dem Entwurf.
 */

const neueId = () => Math.random().toString(36).slice(2, 10);
const ZEICHEN: Record<'' | Wirkung, string> = { '': '–', erteilen: '✓', entziehen: '✗' };

/** Die Elternkette eines Entwurfs, von oben nach unten (ohne Kreise). */
export function elternkette(alle: Sicht[], elternId: string | null): Sicht[] {
  const erg: Sicht[] = [];
  const gesehen = new Set<string>();
  let id = elternId;
  while (id && !gesehen.has(id)) {
    gesehen.add(id);
    const s = alle.find((x) => x.id === id);
    if (!s) break;
    erg.unshift(s);
    id = s.elternId;
  }
  return erg;
}

/** Kurzinfo für den eingeklappten Bereich und die Sichtenliste. */
export function sichtRechteKurz(e: Pick<SichtDaten, 'elternId' | 'berechtigungen'>, alle: Sicht[]): string {
  const rw = e.berechtigungen ?? offeneSicht();
  const kette = elternkette(alle, e.elternId);
  const geerbt = kette.reduce((n, s) => n + sichtRegelwerkVon(s).regeln.length, 0);
  const teile = [
    kette.length ? t('werkbank.sichtrechte.erbt-von', { name: kette.at(-1)!.name, wert: geerbt ? t('werkbank.sichtrechte.regeln', { anzahl: geerbt }) : '' }) : t('werkbank.sichtrechte.standard', { kurzSicht: kurzSicht(rw.grund) }),
    rw.regeln.length ? t('werkbank.sichtrechte.eigene-regeln', { anzahl: rw.regeln.length }) : t('werkbank.sichtrechte.keine-eigenen-regeln'),
  ];
  return teile.join(' · ');
}

function useNamen() {
  const d = useDaten();
  const [titel, setTitel] = useState<Record<string, string>>({});
  const merke = (id: string, text2: string) => setTitel((x) => (x[id] === text2 ? x : { ...x, [id]: text2 }));
  const text = (b: SichtBedingung) => beschreibeRegelBedingung(b, { benutzer: (id) => titel[id] ?? d.person(id), rolle: (id) => titel[id] ?? '…', feld: () => '' });
  // Namen für Kurzformen nachladen.
  const laden = (ids: string[]) => { for (const x of ids.filter((y) => !titel[y])) api.mappe(x).then((m) => merke(x, m.mappe.titel ?? '')).catch(() => merke(x, '(gelöscht)')); };
  return { titel, merke, text, laden };
}

export function SichtBerechtigungen({ e, setE, alle, klappe }: {
  e: SichtDaten; setE: (f: (x: SichtDaten) => SichtDaten) => void; alle: Sicht[]; klappe: Klappe;
}) {
  const rw = e.berechtigungen ?? offeneSicht();
  const setRw = (f: (x: SichtRegelwerk) => SichtRegelwerk) => setE((x) => ({ ...x, berechtigungen: f(x.berechtigungen ?? offeneSicht()) }));
  const kette = elternkette(alle, e.elternId);
  const untersicht = kette.length > 0;
  const namen = useNamen();
  const [offen, setOffen] = useState<Set<string>>(new Set());
  const [ansage, setAnsage] = useState('');
  const zieh = useZiehen({
    fertig: (quelle, ziel, ort) => {
      if (ort === 'in') return;
      setRw((x) => ({ ...x, regeln: umgestellt(x.regeln, x.regeln.findIndex((r) => r.id === quelle), x.regeln.findIndex((r) => r.id === ziel), ort) }));
    },
  });
  const verschiebe = (i: number, r: number) => setRw((x) => {
    const j = i + r;
    if (j < 0 || j >= x.regeln.length) return x;
    setAnsage(t('werkbank.sichtrechte.steht-jetzt-an-stelle', { wert: x.regeln[i].name || t('werkbank.sichtrechte.regel'), wert2: j + 1 }));
    return { ...x, regeln: umgestellt(x.regeln, i, j, r < 0 ? 'vor' : 'nach') };
  });
  const ids = [...kette.flatMap((s) => sichtRegelwerkVon(s).regeln), ...rw.regeln].flatMap((r) => r.wenn.flatMap((b) => (b.art === 'rolle' ? b.rollen : b.benutzer)));
  const fehlend = ids.filter((x) => !namen.titel[x]).join(',');
  useEffect(() => { if (fehlend) namen.laden(fehlend.split(',')); }, [fehlend]); // eslint-disable-line react-hooks/exhaustive-deps -- Namen nur nachladen, wenn sich die Liste der fehlenden Mappen ändert

  return (
    <Bereich id="berechtigungen" titel={t('werkbank.sichtrechte.berechtigungen')} hilfe={<Hilfe ort="sicht.berechtigungen" />} klappe={klappe} kurz={sichtRechteKurz(e, alle)}
      beschreibung={<>{tn('werkbank.sichtrechte.wer-die-ansicht-in', { b: <strong>{t('werkbank.sichtrechte.mappentyp')}</strong> })}</>}>
      {untersicht ? (
        <>
          <h3 className="zwischen">{t('werkbank.sichtrechte.geerbt')}</h3>
          <p className="leise klein">{t('werkbank.sichtrechte.diese-regeln-kommen-von')}</p>
          {kette.map((s, i) => {
            const x = sichtRegelwerkVon(s);
            return (
              <div key={s.id} className="geerbt">
                <p className="klein"><strong><Link to={`/werkbank/sichten/${s.id}#berechtigungen`} className="verweis">{s.name}</Link></strong>
                  {i === 0 && <> {' '}{tn('werkbank.sichtrechte.standard-2', { span: <span className="chip">{kurzSicht({ ...x.grund })}</span> })}</>}
                  {!x.regeln.length && <span className="leise"> {' '}{t('werkbank.sichtrechte.keine-regeln')}</span>}</p>
                {x.regeln.length > 0 && (
                  <ol className="regeln geerbt">
                    {x.regeln.map((r) => (
                      <li key={r.id}><div className="regel zu gesperrt"><div className="regelkopf"><span className="regelsumme">
                        <strong>{r.name}</strong><span className="chip">{kurzSichtRegel(r.dann)}{r.stopp ? t('werkbank.sichtrechte.stopp') : ''}</span>
                        <span className="leise klein">{t('werkbank.sichtrechte.wenn')}{' '}{r.wenn.map(namen.text).join(' und ')}</span>
                      </span></div></div></li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </>
      ) : (
        <>
          <h3 className="zwischen">{t('werkbank.sichtrechte.standard-3')} <Hilfe ort="sicht.berechtigungen" /></h3>
          <p className="leise klein">{t('werkbank.sichtrechte.gilt-solange-keine-regel')}</p>
          <div className="rechtewahl" role="group" aria-label={t('werkbank.sichtrechte.standard-je-recht')}>
            {SICHT_RECHTE_LISTE.map((k) => (
              <button key={k} type="button" className={`rechtknopf ${rw.grund[k] ? 'erteilen' : 'entziehen'}`}
                aria-label={t('werkbank.sichtrechte.standard-4', { SICHT_RECHTE: SICHT_RECHTE[k], wert: rw.grund[k] ? t('werkbank.sichtrechte.erteilt') : t('werkbank.sichtrechte.entzogen') })} title={t('werkbank.sichtrechte.klicken-zum-wechseln', { SICHT_RECHTE: SICHT_RECHTE[k] })}
                onClick={() => setRw((x) => ({ ...x, grund: { ...x.grund, [k]: !x.grund[k] } }))}>
                <span className="buchstabe">{k}</span><span aria-hidden="true">{rw.grund[k] ? '✓' : '✗'}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <h3 className="zwischen">{untersicht ? t('werkbank.sichtrechte.eigene-regeln-2') : t('werkbank.sichtrechte.regeln-2')}</h3>
      <p className="leise klein">{untersicht
        ? t('werkbank.sichtrechte.kommen-nach-den-geerbten')
        : t('werkbank.sichtrechte.von-oben-nach-unten')}</p>
      {rw.regeln.length > 0 && (
        <ol className="regeln">
          {rw.regeln.map((r, i) => (
            <li key={r.id} {...zieh.eintrag(r.id)}>
              <SichtRegelKarte r={r} untersicht={untersicht} namen={namen} offen={offen.has(r.id)}
                umschalten={() => setOffen((x) => { const n = new Set(x); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                setze={(n) => setRw((x) => ({ ...x, regeln: x.regeln.map((y, j) => (j === i ? n : y)) }))}
                weg={() => setRw((x) => ({ ...x, regeln: x.regeln.filter((y) => y.id !== r.id) }))}
                griff={<button {...zieh.griff(r.id, r.name || t('werkbank.sichtrechte.regel'))} onKeyDown={(ev) => ziehTasten(ev, { hoch: () => verschiebe(i, -1), runter: () => verschiebe(i, 1) })}><span aria-hidden="true">⠿</span></button>} />
            </li>
          ))}
        </ol>
      )}
      <Ansage text={ansage} />
      <div className="knoepfe"><button type="button" className="knopf klein" onClick={() => {
        const id = neueId();
        setOffen((x) => new Set([...x, id]));
        setRw((x) => ({ ...x, regeln: [...x.regeln, { id, name: '', wenn: [{ art: 'rolle', rollen: [] }], dann: {}, stopp: false }] }));
      }}>{t('werkbank.sichtrechte.regel-2')}</button></div>
    </Bereich>
  );
}

function SichtRegelKarte({ r, untersicht, namen, offen, umschalten, setze, weg, griff }: {
  r: SichtRegel; untersicht: boolean; namen: ReturnType<typeof useNamen>; offen: boolean; umschalten: () => void;
  setze: (r: SichtRegel) => void; weg: () => void; griff: ReactNode;
}) {
  const d = useDaten();
  const problem = sichtRegelProblem(r, untersicht);
  const rollenTyp = d.typen.find((mappentyp) => mappentyp.system === 'rolle')?.id;
  const benutzerTyp = d.typen.find((mappentyp) => mappentyp.system === 'benutzer')?.id;
  const setzeB = (i: number, b: SichtBedingung) => setze({ ...r, wenn: r.wenn.map((x, j) => (j === i ? b : x)) });
  // In Untersichten nur „–“ ↔ „✗“ (#148).
  const naechste = (w: '' | Wirkung): '' | Wirkung => (untersicht ? (w === 'entziehen' ? '' : 'entziehen') : w === '' ? 'erteilen' : w === 'erteilen' ? 'entziehen' : '');

  if (!offen) return (
    <div className={`regel zu ${problem ? 'fehlerhaft' : ''}`}>
      <div className="regelkopf">
        {griff}
        <button type="button" className="regelsumme" aria-expanded={false} onClick={umschalten}>
          <strong>{r.name || t('werkbank.sichtrechte.ohne-namen')}</strong>
          <span className="chip">{kurzSichtRegel(r.dann)}{r.stopp ? t('werkbank.sichtrechte.stopp') : ''}</span>
          <span className="leise klein">{t('werkbank.sichtrechte.wenn')}{' '}{r.wenn.map(namen.text).join(' und ') || '…'}</span>
        </button>
      </div>
      {problem && <p className="fehlertext klein">{problem}</p>}
    </div>
  );

  return (
    <div className={`regel ${problem ? 'fehlerhaft' : ''}`}>
      <div className="regelkopf">
        {griff}
        <input aria-label={t('werkbank.sichtrechte.name-der-regel')} placeholder={t('werkbank.sichtrechte.name-z-b-kinder')} value={r.name} onChange={(x) => setze({ ...r, name: x.target.value })} />
        <span className="chip">{kurzSichtRegel(r.dann)}{r.stopp ? t('werkbank.sichtrechte.stopp') : ''}</span>
      </div>
      <p className="ueber klein">{t('werkbank.sichtrechte.wenn-2')}</p>
      <ul className="bedingungen">
        {r.wenn.map((b, i) => (
          <li key={i}>
            <div className="bedingungszeile">
              <select aria-label={t('werkbank.sichtrechte.art-der-bedingung')} value={b.art} onChange={(x) => setzeB(i, x.target.value === 'rolle' ? { art: 'rolle', rollen: [], nicht: b.nicht } : { art: 'benutzer', benutzer: [], nicht: b.nicht })}>
                <option value="rolle">{t('werkbank.sichtrechte.benutzer-hat-rolle')}</option>
                <option value="benutzer">{t('werkbank.sichtrechte.benutzer-ist')}</option>
              </select>
              <label className="haken klein"><input type="checkbox" checked={!!b.nicht} onChange={(x) => setzeB(i, { ...b, nicht: x.target.checked || undefined })} /><span>{t('werkbank.sichtrechte.nicht')}</span></label>
              {b.art === 'rolle' && rollenTyp && <MappenSuche typId={rollenTyp} gewaehlt={b.rollen} titel={namen.titel} merke={namen.merke} setze={(ids) => setzeB(i, { ...b, rollen: ids })} />}
              {b.art === 'benutzer' && benutzerTyp && <MappenSuche typId={benutzerTyp} gewaehlt={b.benutzer} titel={namen.titel} merke={namen.merke} setze={(ids) => setzeB(i, { ...b, benutzer: ids })} />}
              <button type="button" className="textknopf gefahr klein" onClick={() => setze({ ...r, wenn: r.wenn.filter((_, j) => j !== i) })}>{t('werkbank.sichtrechte.bedingung-entfernen')}</button>
            </div>
            <p className="leise klein">{namen.text(b)}</p>
          </li>
        ))}
      </ul>
      <div className="knoepfe"><button type="button" className="knopf klein" onClick={() => setze({ ...r, wenn: [...r.wenn, { art: 'rolle', rollen: [] }] })}>{t('werkbank.sichtrechte.bedingung')}</button>{r.wenn.length > 1 && <span className="leise klein">{t('werkbank.sichtrechte.alle-bedingungen-muessen-zutreffen')}</span>}</div>
      <p className="ueber klein">{t('werkbank.sichtrechte.dann')}</p>
      <div className="rechtewahl" role="group" aria-label={t('werkbank.sichtrechte.wirkung-je-recht')}>
        {SICHT_RECHTE_LISTE.map((k) => {
          const w = r.dann[k] ?? '';
          return (
            <button key={k} type="button" className={`rechtknopf ${w}`} aria-label={`${SICHT_RECHTE[k]}: ${w || 'unverändert'}`} title={t('werkbank.sichtrechte.klicken-zum-wechseln', { SICHT_RECHTE: SICHT_RECHTE[k] })}
              onClick={() => { const n = naechste(w); const dann = { ...r.dann }; if (n) dann[k] = n; else delete dann[k]; setze({ ...r, dann }); }}>
              <span className="buchstabe">{k}</span><span aria-hidden="true">{ZEICHEN[w]}</span>
            </button>
          );
        })}
        <label className="haken"><input type="checkbox" checked={r.stopp} onChange={(x) => setze({ ...r, stopp: x.target.checked })} /><span>{tn('werkbank.sichtrechte.stopp-2', { klein: <small className="leise">{t('werkbank.sichtrechte.trifft-die-regel-zu')}</small> })}</span></label>
      </div>
      {problem && <p className="fehlertext klein">{problem}</p>}
      <div className="knoepfe">
        <button type="button" className="textknopf gefahr klein" onClick={weg}>{t('werkbank.sichtrechte.regel-entfernen')}</button>
        <button type="button" className="knopf klein" onClick={umschalten}>{t('werkbank.sichtrechte.zuklappen')}</button>
      </div>
    </div>
  );
}

function RechteZeile({ r }: { r: SichtRechte }) {
  return <span className="rechtezeile">{SICHT_RECHTE_LISTE.map((k) => <span key={k} className={`recht ${r[k] ? 'ja' : 'nein'}`} title={`${SICHT_RECHTE[k]}: ${r[k] ? 'ja' : 'nein'}`}>{k}{r[k] ? '✓' : '✗'}</span>)}</span>;
}

/** „Was sieht Benutzer X an dieser Sicht?“ – mit dem Entwurf, auch ungespeichert. */
export function SichtTestlauf({ id, e, klappe }: { id: string | null; e: SichtDaten; klappe: Klappe }) {
  const [b, setB] = useState('');
  // Das Ergebnis gehört zu (Benutzer, Regeln, Elternansicht) – wechselt eines davon, ist es sofort weg (#371).
  const stand = JSON.stringify([id, e.berechtigungen, e.elternId]);
  const schluessel = testlaufSchluessel({ benutzerId: b, stand }, false);
  const { erg, fehler, los } = useTestlauf(schluessel, b,
    () => api.sichtTestlauf({ sichtId: id, benutzerId: b, elternId: e.elternId, berechtigungen: e.berechtigungen ?? null }));
  return (
    <Bereich id="testlauf" titel={t('werkbank.sichtrechte.testlauf')} hilfe={<Hilfe ort="sicht.berechtigungen" />} klappe={klappe}
      kurz={t('werkbank.sichtrechte.was-ein-benutzer-an')}
      beschreibung={t('werkbank.sichtrechte.sieht-ein-benutzer-diese')}>
      <div className="formular">
        <TestBenutzerWahl id="sicht-testlauf-benutzer" wert={b} setze={setB} />
      </div>
      {!schluessel && <p className="leise klein">{t('werkbank.sichtrechte.waehle-einen-benutzer-das')}</p>}
      {schluessel && !erg && !fehler && <div className="knoepfe"><button type="button" className="knopf klein primaer" onClick={() => void los()}>{t('werkbank.sichtrechte.pruefen')}</button></div>}
      {fehler && <p className="fehlertext klein">{fehler}</p>}
      {erg && (
        <div className="testlauf" role="status">
          {erg.admin
            ? <p>{tn('werkbank.sichtrechte.ist-administrator-fuer-ihn', { b: <strong>{erg.benutzer.name}</strong> })}</p>
            : <>
                <p>{tn('werkbank.sichtrechte.an', { b: <strong>{erg.benutzer.name}</strong>, wert: e.name || t('werkbank.sichtrechte.dieser-ansicht') })}{' '}<RechteZeile r={erg.wirksam!} />
                  {!erg.wirksam!.R && <span className="leise"> {' '}{t('werkbank.sichtrechte.die-ansicht-fehlt-in')}</span>}</p>
                <table className="tabelle klein">
                  <thead><tr><th>{t('werkbank.sichtrechte.ansicht')}</th><th>{t('werkbank.sichtrechte.schritt')}</th><th>{t('werkbank.sichtrechte.trifft-zu')}</th><th>{t('werkbank.sichtrechte.setzt')}</th><th>{t('werkbank.sichtrechte.stand-danach')}</th></tr></thead>
                  <tbody>
                    {erg.kette.flatMap((k) => [
                      ...(k.grund ? [<tr key={`${k.sicht}-g`}><td>{k.name}</td><td>{t('werkbank.sichtrechte.standard-5')}</td><td>–</td><td>–</td><td><RechteZeile r={k.grund} /></td></tr>] : []),
                      ...k.spur.map((s) => (
                        <tr key={`${k.sicht}-${s.regel}`} className={s.traf ? 'traf' : ''}>
                          <td>{k.name}</td><td>{s.name || t('werkbank.sichtrechte.regel')}{s.stopp && s.traf ? t('werkbank.sichtrechte.stopp') : ''}</td>
                          <td>{s.traf === null ? t('werkbank.sichtrechte.nicht-geprueft-stopp-davor') : s.traf ? t('werkbank.sichtrechte.ja') : t('werkbank.sichtrechte.nein')}</td>
                          <td>{s.traf ? kurzSichtRegel(s.gesetzt) : '–'}</td><td><RechteZeile r={s.stand} /></td>
                        </tr>
                      )),
                      <tr key={`${k.sicht}-e`} className="summe"><td>{k.name}</td><td>{k.untersicht ? t('werkbank.sichtrechte.mit-elternsicht-und') : t('werkbank.sichtrechte.ergebnis')}</td><td /><td /><td><RechteZeile r={k.stand} /></td></tr>,
                    ])}
                  </tbody>
                </table>
              </>}
        </div>
      )}
    </Bereich>
  );
}
