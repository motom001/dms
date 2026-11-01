import { useEffect, useState, type ReactNode } from 'react';
import { beschreibeRegelBedingung, type Wirkung } from '../../../shared/src/rechte';
import {
  kurzSicht, kurzSichtRegel, offeneSicht, SICHT_RECHTE, SICHT_RECHTE_LISTE, sichtRegelProblem, sichtRegelwerkVon,
  type SichtBedingung, type SichtRechte, type SichtRegel, type SichtRegelwerk,
} from '../../../shared/src/sichtrechte';
import type { Sicht, SichtDaten } from '../../../shared/src/sichten';
import { api } from '../api';
import { useDaten } from '../daten';
import { Bereich, type Klappe } from '../einrichtung/Bereich';
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
    kette.length ? `erbt von „${kette.at(-1)!.name}“${geerbt ? ` (${geerbt} Regel${geerbt === 1 ? '' : 'n'})` : ''}` : `Standard: ${kurzSicht(rw.grund)}`,
    rw.regeln.length ? `${rw.regeln.length} eigene Regel${rw.regeln.length === 1 ? '' : 'n'}` : 'keine eigenen Regeln',
  ];
  return teile.join(' · ');
}

function useNamen() {
  const d = useDaten();
  const [titel, setTitel] = useState<Record<string, string>>({});
  const merke = (id: string, t: string) => setTitel((x) => (x[id] === t ? x : { ...x, [id]: t }));
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
    setAnsage(`${x.regeln[i].name || 'Regel'} steht jetzt an Stelle ${j + 1}.`);
    return { ...x, regeln: umgestellt(x.regeln, i, j, r < 0 ? 'vor' : 'nach') };
  });
  const ids = [...kette.flatMap((s) => sichtRegelwerkVon(s).regeln), ...rw.regeln].flatMap((r) => r.wenn.flatMap((b) => (b.art === 'rolle' ? b.rollen : b.benutzer)));
  const fehlend = ids.filter((x) => !namen.titel[x]).join(',');
  useEffect(() => { if (fehlend) namen.laden(fehlend.split(',')); }, [fehlend]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Bereich id="berechtigungen" titel="Berechtigungen" hilfe={<Hilfe ort="sicht.berechtigungen" />} klappe={klappe} kurz={sichtRechteKurz(e, alle)}
      beschreibung={<>Wer die Ansicht in der Ablage sieht (R) und dort „+ Neu“ bekommt (C). Ob eine Mappe lesbar ist, regelt weiter der <strong>Mappentyp</strong>. Für Administratoren gelten die Regeln nicht.</>}>
      {untersicht ? (
        <>
          <h3 className="zwischen">Geerbt</h3>
          <p className="leise klein">Diese Regeln kommen von den Elternsichten und gelten hier zuerst. Ändern lassen sie sich nur dort.</p>
          {kette.map((s, i) => {
            const x = sichtRegelwerkVon(s);
            return (
              <div key={s.id} className="geerbt">
                <p className="klein"><strong><Link to={`/werkbank/sichten/${s.id}#berechtigungen`} className="verweis">{s.name}</Link></strong>
                  {i === 0 && <> · Standard <span className="chip">{kurzSicht({ ...x.grund })}</span></>}
                  {!x.regeln.length && <span className="leise"> · keine Regeln</span>}</p>
                {x.regeln.length > 0 && (
                  <ol className="regeln geerbt">
                    {x.regeln.map((r) => (
                      <li key={r.id}><div className="regel zu gesperrt"><div className="regelkopf"><span className="regelsumme">
                        <strong>{r.name}</strong><span className="chip">{kurzSichtRegel(r.dann)}{r.stopp ? ' · Stopp' : ''}</span>
                        <span className="leise klein">wenn {r.wenn.map(namen.text).join(' und ')}</span>
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
          <h3 className="zwischen">Standard <Hilfe ort="sicht.berechtigungen" /></h3>
          <p className="leise klein">Gilt, solange keine Regel etwas anderes sagt. Unteransichten erben ihn.</p>
          <div className="rechtewahl" role="group" aria-label="Standard je Recht">
            {SICHT_RECHTE_LISTE.map((k) => (
              <button key={k} type="button" className={`rechtknopf ${rw.grund[k] ? 'erteilen' : 'entziehen'}`}
                aria-label={`Standard ${SICHT_RECHTE[k]}: ${rw.grund[k] ? 'erteilt' : 'entzogen'}`} title={`${SICHT_RECHTE[k]}: klicken zum Wechseln`}
                onClick={() => setRw((x) => ({ ...x, grund: { ...x.grund, [k]: !x.grund[k] } }))}>
                <span className="buchstabe">{k}</span><span aria-hidden="true">{rw.grund[k] ? '✓' : '✗'}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <h3 className="zwischen">{untersicht ? 'Eigene Regeln' : 'Regeln'}</h3>
      <p className="leise klein">{untersicht
        ? 'Kommen nach den geerbten und können nur weiter einschränken (✗): Ein Recht gilt hier nur, wenn es an der Elternsicht gilt und keine eigene Regel es entzieht.'
        : 'Von oben nach unten: Jede zutreffende Regel setzt ihre ✓ und ✗; „Stopp“ beendet die Prüfung. Bedingungen gibt es nur über den Benutzer.'}</p>
      {rw.regeln.length > 0 && (
        <ol className="regeln">
          {rw.regeln.map((r, i) => (
            <li key={r.id} {...zieh.eintrag(r.id)}>
              <SichtRegelKarte r={r} untersicht={untersicht} namen={namen} offen={offen.has(r.id)}
                umschalten={() => setOffen((x) => { const n = new Set(x); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                setze={(n) => setRw((x) => ({ ...x, regeln: x.regeln.map((y, j) => (j === i ? n : y)) }))}
                weg={() => setRw((x) => ({ ...x, regeln: x.regeln.filter((y) => y.id !== r.id) }))}
                griff={<button {...zieh.griff(r.id, r.name || 'Regel')} onKeyDown={(ev) => ziehTasten(ev, { hoch: () => verschiebe(i, -1), runter: () => verschiebe(i, 1) })}><span aria-hidden="true">⠿</span></button>} />
            </li>
          ))}
        </ol>
      )}
      <Ansage text={ansage} />
      <div className="knoepfe"><button type="button" className="knopf klein" onClick={() => {
        const id = neueId();
        setOffen((x) => new Set([...x, id]));
        setRw((x) => ({ ...x, regeln: [...x.regeln, { id, name: '', wenn: [{ art: 'rolle', rollen: [] }], dann: {}, stopp: false }] }));
      }}>+ Regel</button></div>
    </Bereich>
  );
}

function SichtRegelKarte({ r, untersicht, namen, offen, umschalten, setze, weg, griff }: {
  r: SichtRegel; untersicht: boolean; namen: ReturnType<typeof useNamen>; offen: boolean; umschalten: () => void;
  setze: (r: SichtRegel) => void; weg: () => void; griff: ReactNode;
}) {
  const d = useDaten();
  const problem = sichtRegelProblem(r, untersicht);
  const rollenTyp = d.typen.find((t) => t.system === 'rolle')?.id;
  const benutzerTyp = d.typen.find((t) => t.system === 'benutzer')?.id;
  const setzeB = (i: number, b: SichtBedingung) => setze({ ...r, wenn: r.wenn.map((x, j) => (j === i ? b : x)) });
  // In Untersichten nur „–“ ↔ „✗“ (#148).
  const naechste = (w: '' | Wirkung): '' | Wirkung => (untersicht ? (w === 'entziehen' ? '' : 'entziehen') : w === '' ? 'erteilen' : w === 'erteilen' ? 'entziehen' : '');

  if (!offen) return (
    <div className={`regel zu ${problem ? 'fehlerhaft' : ''}`}>
      <div className="regelkopf">
        {griff}
        <button type="button" className="regelsumme" aria-expanded={false} onClick={umschalten}>
          <strong>{r.name || 'Ohne Namen'}</strong>
          <span className="chip">{kurzSichtRegel(r.dann)}{r.stopp ? ' · Stopp' : ''}</span>
          <span className="leise klein">wenn {r.wenn.map(namen.text).join(' und ') || '…'}</span>
        </button>
      </div>
      {problem && <p className="fehlertext klein">{problem}</p>}
    </div>
  );

  return (
    <div className={`regel ${problem ? 'fehlerhaft' : ''}`}>
      <div className="regelkopf">
        {griff}
        <input aria-label="Name der Regel" placeholder="Name, z. B. „Kinder sehen das nicht“" value={r.name} onChange={(x) => setze({ ...r, name: x.target.value })} />
        <span className="chip">{kurzSichtRegel(r.dann)}{r.stopp ? ' · Stopp' : ''}</span>
      </div>
      <p className="ueber klein">Wenn</p>
      <ul className="bedingungen">
        {r.wenn.map((b, i) => (
          <li key={i}>
            <div className="bedingungszeile">
              <select aria-label="Art der Bedingung" value={b.art} onChange={(x) => setzeB(i, x.target.value === 'rolle' ? { art: 'rolle', rollen: [], nicht: b.nicht } : { art: 'benutzer', benutzer: [], nicht: b.nicht })}>
                <option value="rolle">Benutzer hat Rolle</option>
                <option value="benutzer">Benutzer ist</option>
              </select>
              <label className="haken klein"><input type="checkbox" checked={!!b.nicht} onChange={(x) => setzeB(i, { ...b, nicht: x.target.checked || undefined })} /><span>nicht</span></label>
              {b.art === 'rolle' && rollenTyp && <MappenSuche typId={rollenTyp} gewaehlt={b.rollen} titel={namen.titel} merke={namen.merke} setze={(ids) => setzeB(i, { ...b, rollen: ids })} />}
              {b.art === 'benutzer' && benutzerTyp && <MappenSuche typId={benutzerTyp} gewaehlt={b.benutzer} titel={namen.titel} merke={namen.merke} setze={(ids) => setzeB(i, { ...b, benutzer: ids })} />}
              <button type="button" className="textknopf gefahr klein" onClick={() => setze({ ...r, wenn: r.wenn.filter((_, j) => j !== i) })}>Bedingung entfernen</button>
            </div>
            <p className="leise klein">{namen.text(b)}</p>
          </li>
        ))}
      </ul>
      <div className="knoepfe"><button type="button" className="knopf klein" onClick={() => setze({ ...r, wenn: [...r.wenn, { art: 'rolle', rollen: [] }] })}>+ Bedingung</button>{r.wenn.length > 1 && <span className="leise klein">Alle Bedingungen müssen zutreffen.</span>}</div>
      <p className="ueber klein">Dann</p>
      <div className="rechtewahl" role="group" aria-label="Wirkung je Recht">
        {SICHT_RECHTE_LISTE.map((k) => {
          const w = r.dann[k] ?? '';
          return (
            <button key={k} type="button" className={`rechtknopf ${w}`} aria-label={`${SICHT_RECHTE[k]}: ${w || 'unverändert'}`} title={`${SICHT_RECHTE[k]}: klicken zum Wechseln`}
              onClick={() => { const n = naechste(w); const dann = { ...r.dann }; if (n) dann[k] = n; else delete dann[k]; setze({ ...r, dann }); }}>
              <span className="buchstabe">{k}</span><span aria-hidden="true">{ZEICHEN[w]}</span>
            </button>
          );
        })}
        <label className="haken"><input type="checkbox" checked={r.stopp} onChange={(x) => setze({ ...r, stopp: x.target.checked })} /><span>Stopp <small className="leise">– trifft die Regel zu, folgende nicht mehr prüfen</small></span></label>
      </div>
      {problem && <p className="fehlertext klein">{problem}</p>}
      <div className="knoepfe">
        <button type="button" className="textknopf gefahr klein" onClick={weg}>Regel entfernen</button>
        <button type="button" className="knopf klein" onClick={umschalten}>Zuklappen</button>
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
    <Bereich id="testlauf" titel="Testlauf" hilfe={<Hilfe ort="sicht.berechtigungen" />} klappe={klappe}
      kurz="Was ein Benutzer an dieser Ansicht darf – auch mit ungespeicherten Regeln"
      beschreibung="Sieht ein Benutzer diese Ansicht, und bekommt er „+ Neu“? Geprüft werden die Regeln, wie sie oben stehen, mit den geerbten.">
      <div className="formular">
        <TestBenutzerWahl id="sicht-testlauf-benutzer" wert={b} setze={setB} />
      </div>
      {!schluessel && <p className="leise klein">Wähle einen Benutzer – das Ergebnis erscheint sofort.</p>}
      {schluessel && !erg && !fehler && <div className="knoepfe"><button type="button" className="knopf klein primaer" onClick={() => void los()}>Prüfen</button></div>}
      {fehler && <p className="fehlertext klein">{fehler}</p>}
      {erg && (
        <div className="testlauf" role="status">
          {erg.admin
            ? <p><strong>{erg.benutzer.name}</strong> ist Administrator – für ihn gelten die Regeln nicht, er sieht alles.</p>
            : <>
                <p><strong>{erg.benutzer.name}</strong> an „{e.name || 'dieser Ansicht'}“: <RechteZeile r={erg.wirksam!} />
                  {!erg.wirksam!.R && <span className="leise"> – die Ansicht fehlt in seinem Baum, ihre Mappen auch in den Elternsichten.</span>}</p>
                <table className="tabelle klein">
                  <thead><tr><th>Ansicht</th><th>Schritt</th><th>trifft zu?</th><th>setzt</th><th>Stand danach</th></tr></thead>
                  <tbody>
                    {erg.kette.flatMap((k) => [
                      ...(k.grund ? [<tr key={`${k.sicht}-g`}><td>{k.name}</td><td>Standard</td><td>–</td><td>–</td><td><RechteZeile r={k.grund} /></td></tr>] : []),
                      ...k.spur.map((s) => (
                        <tr key={`${k.sicht}-${s.regel}`} className={s.traf ? 'traf' : ''}>
                          <td>{k.name}</td><td>{s.name || 'Regel'}{s.stopp && s.traf ? ' · Stopp' : ''}</td>
                          <td>{s.traf === null ? 'nicht geprüft (Stopp davor)' : s.traf ? 'ja' : 'nein'}</td>
                          <td>{s.traf ? kurzSichtRegel(s.gesetzt) : '–'}</td><td><RechteZeile r={s.stand} /></td>
                        </tr>
                      )),
                      <tr key={`${k.sicht}-e`} className="summe"><td>{k.name}</td><td>{k.untersicht ? 'mit Elternsicht (UND)' : 'Ergebnis'}</td><td /><td /><td><RechteZeile r={k.stand} /></td></tr>,
                    ])}
                  </tbody>
                </table>
              </>}
        </div>
      )}
    </Bereich>
  );
}
