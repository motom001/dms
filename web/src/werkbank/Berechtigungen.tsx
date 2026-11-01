import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Mappentyp } from '../../../shared/src/model';
import { bedingungsfelder, beschreibeBedingung, OPERATOREN_JE_ART, type Bedingung, type Bedingungsfeld } from '../../../shared/src/sichten';
import {
  beschreibeRegelBedingung, kurz, kurzStandard, RECHTE, RECHTE_LISTE, regelProblem, systemSperre,
  type Recht, type Regel, type RegelBedingung, type Regelwerk, type Wirkung,
} from '../../../shared/src/rechte';
import { api, type Testlauf } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { Ansage, umgestellt, useZiehen, ziehTasten } from '../ziehen';
import { FeldBedingung, MappenSuche } from './Sichten';
import { Bereich, type Klappe } from '../einrichtung/Bereich';
import { passendesErgebnis, testlaufSchluessel, type TestlaufErgebnis } from '../../../shared/src/testlauf';
import { TestBenutzerWahl, TestMappeWahl, useTestlauf } from './TestlaufWahl';

/**
 * Berechtigungen (#123–#127, #137, #142): je Mappentyp eine Grundeinstellung und Regeln
 * „wenn … dann erteile/entziehe CRUDP“, in Reihenfolge, mit Stopp. Für Administratoren gelten sie nicht.
 *
 * Gepflegt im Mappentyp-Editor (Abschnitt „Berechtigungen“), gespeichert mit „Mappentyp speichern“.
 * Getestet am Mappentyp selbst (Testlauf mit dem Entwurf, #146); „Was sieht ein Benutzer?“ in der Benutzerverwaltung.
 */

const neueId = () => Math.random().toString(36).slice(2, 10);
const WIRKUNG_TEXT: Record<'' | Wirkung, string> = { '': '–', erteilen: '✓', entziehen: '✗' };
const NAECHSTE: Record<'' | Wirkung, '' | Wirkung> = { '': 'erteilen', erteilen: 'entziehen', entziehen: '' };

type Art = RegelBedingung['art'];
const ARTEN: Array<{ art: Art; name: string; nurBenutzerTyp?: boolean }> = [
  { art: 'rolle', name: 'Benutzer hat Rolle' },
  { art: 'benutzer', name: 'Benutzer ist' },
  { art: 'feld', name: 'Feld der Mappe' },
  { art: 'aufgabe', name: 'Offene Aufgabe für den Benutzer' },
  { art: 'eigeneMappe', name: 'Mappe ist die des Benutzers', nurBenutzerTyp: true },
];

/**
 * Abschnitt „Berechtigungen“ im Mappentyp-Editor (#142, #146). `typ` ist der Entwurf (Felder wie gerade bearbeitet),
 * `gespeichert` die Regeln, wie sie gespeichert sind – Kopieren in andere Typen geht nur mit gespeicherten Regeln.
 */
export function RegelwerkAbschnitt({ rw, setRw, typ, gespeichert, neu, klappe }: {
  rw: Regelwerk; setRw: (f: (x: Regelwerk) => Regelwerk) => void; typ: Mappentyp; gespeichert: Regelwerk | null; neu: boolean; klappe: Klappe;
}) {
  const [ansage, setAnsage] = useState('');
  const [titel, setTitel] = useState<Record<string, string>>({});
  const [offen, setOffen] = useState<Set<string>>(new Set());
  const umschalten = (id: string) => setOffen((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const merke = useCallback((id: string, t: string) => setTitel((x) => ({ ...x, [id]: t })), []);
  const zieh = useZiehen({
    fertig: (quelle, ziel, ort) => {
      if (ort === 'in') return;
      setRw((x) => {
        const von = x.regeln.findIndex((r) => r.id === quelle);
        const nach = x.regeln.findIndex((r) => r.id === ziel);
        setAnsage(`${x.regeln[von]?.name || 'Regel'} steht jetzt ${ort === 'vor' ? 'vor' : 'nach'} „${x.regeln[nach]?.name || 'Regel'}“.`);
        return { ...x, regeln: umgestellt(x.regeln, von, nach, ort) };
      });
    },
  });
  const probleme = rw.regeln.map((r) => regelProblem(r, typ));
  const unveraendert = !!gespeichert && JSON.stringify(gespeichert) === JSON.stringify(rw);
  const setzeRegel = (i: number, r: Regel) => setRw((x) => ({ ...x, regeln: x.regeln.map((y, j) => (j === i ? r : y)) }));
  const verschiebe = (i: number, r: number) => setRw((x) => {
    const j = i + r;
    if (j < 0 || j >= x.regeln.length) return x;
    setAnsage(`${x.regeln[i].name || 'Regel'} steht jetzt an Stelle ${j + 1}.`);
    return { ...x, regeln: umgestellt(x.regeln, i, j, r < 0 ? 'vor' : 'nach') };
  });
  const neueRegel = () => {
    const id = neueId();
    setOffen((x) => new Set([...x, id]));
    setRw((x) => ({ ...x, regeln: [...x.regeln, { id, name: '', wenn: [{ art: 'rolle', rollen: [] }], dann: {}, stopp: false }] }));
  };
  const sperre = systemSperre(typ);

  return (
    <Bereich id="berechtigungen" titel="Berechtigungen" hilfe={<Hilfe ort="werkbank.berechtigungen" />} klappe={klappe}
      kurz={`Standard: ${kurzStandard(Object.fromEntries(RECHTE_LISTE.map((k) => [k, rw.grund[k] && !((k === 'C' && sperre.C) || (k === 'D' && sperre.D))])) as Record<Recht, boolean>)} · ${rw.regeln.length === 1 ? '1 Regel' : `${rw.regeln.length || 'keine'} Regeln`}`}
      beschreibung={<>Wer Mappen dieses Mappentyps anlegen (C), lesen (R), bearbeiten (U – Felder und Dokumente), löschen (D) und Passwörter sehen (P) darf. Für <strong>Administratoren</strong> gelten die Regeln nicht.</>}>

      <h3 className="zwischen">Standard <Hilfe ort="berechtigungen.grund" /></h3>
      <p className="leise klein">Gilt, solange keine Regel etwas anderes sagt. Klicken schaltet zwischen ✓ erteilt und ✗ entzogen.</p>
      <div className="rechtewahl" role="group" aria-label="Standard je Recht">
        {RECHTE_LISTE.map((k) => {
          const fest = (k === 'C' && sperre.C) || (k === 'D' && sperre.D);
          const an = rw.grund[k] && !fest;
          return (
            <button key={k} type="button" className={`rechtknopf ${an ? 'erteilen' : 'entziehen'}`} disabled={fest}
              aria-label={`Standard ${RECHTE[k]}: ${an ? 'erteilt' : 'entzogen'}`} title={fest ? `${RECHTE[k]}: geht bei diesem Systemtyp nur über die Benutzerverwaltung bzw. den Versand` : `${RECHTE[k]}: ${an ? 'erteilt' : 'entzogen'} – klicken zum Wechseln`}
              onClick={() => setRw((x) => ({ ...x, grund: { ...x.grund, [k]: !x.grund[k] } }))}>
              <span className="buchstabe">{k}</span><span aria-hidden="true">{an ? '✓' : '✗'}</span>
            </button>
          );
        })}
      </div>
      {(sperre.C || sperre.D) && <p className="leise klein">{typ.system === 'benutzer' ? 'Benutzer entstehen und verschwinden nur in der Benutzerverwaltung – auch für Administratoren.' : 'E-Mail-Mappen entstehen nur beim Versenden.'}</p>}

      <h3 className="zwischen">Regeln <Hilfe ort="berechtigungen.regeln" /></h3>
      <p className="leise">Von oben nach unten: Jede zutreffende Regel setzt ihre ✓ und ✗, „–“ lässt das Recht, wie es ist; „Stopp“ beendet die Prüfung. Ohne Lesen wirkt nur Anlegen; für Notizen und Aufgaben reicht Lesen. Reihenfolge per Ziehen am Griff oder mit Alt+↑/↓.</p>
      {rw.regeln.length > 0 && (
        <ol className="regeln">
          {rw.regeln.map((r, i) => (
            <li key={r.id} {...zieh.eintrag(r.id)}>
              <RegelKarte r={r} typ={typ} problem={probleme[i]} setze={(n) => setzeRegel(i, n)} titel={titel} merke={merke}
                offen={offen.has(r.id)} umschalten={() => umschalten(r.id)}
                griff={<button {...zieh.griff(r.id, r.name || 'Regel')} onKeyDown={(ev) => ziehTasten(ev, { hoch: () => verschiebe(i, -1), runter: () => verschiebe(i, 1) })}><span aria-hidden="true">⠿</span></button>}
                weg={() => setRw((x) => ({ ...x, regeln: x.regeln.filter((y) => y.id !== r.id) }))}
                gespeichert={unveraendert && !neu}
                nachKopie={() => {}} />
            </li>
          ))}
        </ol>
      )}
      <Ansage text={ansage} />
      <div className="knoepfe"><button type="button" className="knopf klein" onClick={neueRegel}>+ Regel</button></div>
    </Bereich>
  );
}

function RegelKarte({ r, typ, problem, setze, weg, griff, titel, merke, gespeichert, nachKopie, offen, umschalten }: {
  r: Regel; typ: Mappentyp; problem: string | null; setze: (r: Regel) => void; weg: () => void; griff: ReactNode;
  titel: Record<string, string>; merke: (id: string, t: string) => void; gespeichert: boolean; nachKopie: () => void;
  /** Zuklappen wie bei Feldern (#146). */
  offen: boolean; umschalten: () => void;
}) {
  const d = useDaten();
  const felder = useMemo(() => bedingungsfelder([typ]), [typ]);
  const [kopie, setKopie] = useState(false);
  const setzeB = (i: number, b: RegelBedingung) => setze({ ...r, wenn: r.wenn.map((x, j) => (j === i ? b : x)) });
  const neuB = (art: Art, nicht?: boolean): RegelBedingung => {
    const n = nicht ? { nicht: true } : {};
    if (art === 'feld') { const f = felder[0]; return { ...n, art, bedingung: { art: 'feld', feld: f?.key ?? '_erstellt', op: OPERATOREN_JE_ART[f?.art ?? 'zeit'][0] } }; }
    if (art === 'benutzer') return { ...n, art, benutzer: [] };
    if (art === 'rolle') return { ...n, art, rollen: [] };
    return { ...n, art };
  };
  const rollenTyp = d.typen.find((t) => t.system === 'rolle')?.id;
  const benutzerTyp = d.typen.find((t) => t.system === 'benutzer')?.id;
  const feldName = (b: Extract<Bedingung, { art: 'feld' }>) => beschreibeBedingung(b, [typ], (id) => titel[id] ?? d.person(id));

  const bedText = (b: RegelBedingung) => beschreibeRegelBedingung(b, { benutzer: (id) => titel[id] ?? d.person(id), rolle: (id) => titel[id] ?? '…', feld: feldName });
  // Rollen- und Benutzernamen für die Kurzform nachladen.
  const fehlend = r.wenn.flatMap((b) => (b.art === 'rolle' ? b.rollen : b.art === 'benutzer' ? b.benutzer : [])).filter((x) => !titel[x]).join(',');
  useEffect(() => {
    if (offen) return;
    for (const x of fehlend ? fehlend.split(',') : []) api.mappe(x).then((m) => merke(x, m.mappe.titel ?? '')).catch(() => merke(x, '(gelöscht)'));
  }, [fehlend, offen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!offen) return (
    <div className={`regel zu ${problem ? 'fehlerhaft' : ''}`}>
      <div className="regelkopf">
        {griff}
        <button type="button" className="regelsumme" aria-expanded={false} onClick={umschalten}>
          <strong>{r.name || 'Ohne Namen'}</strong>
          <span className="chip">{kurz(r.dann)}{r.stopp ? ' · Stopp' : ''}</span>
          <span className="leise klein">wenn {r.wenn.map(bedText).join(' und ') || '…'}</span>
        </button>
      </div>
      {problem && <p className="fehlertext klein">{problem}</p>}
    </div>
  );

  return (
    <div className={`regel ${problem ? 'fehlerhaft' : ''}`}>
      <div className="regelkopf">
        {griff}
        <input aria-label="Name der Regel" placeholder="Name, z. B. „Buchhaltung darf alles“" value={r.name} onChange={(x) => setze({ ...r, name: x.target.value })} />
        <span className="chip" title="Kurzform der Wirkung">{kurz(r.dann)}{r.stopp ? ' · Stopp' : ''}</span>
      </div>
      <p className="ueber klein">Wenn</p>
      <ul className="bedingungen">
        {r.wenn.map((b, i) => {
          const feld: Bedingungsfeld | undefined = b.art === 'feld' ? felder.find((f) => f.key === b.bedingung.feld) : undefined;
          return (
            <li key={i}>
              <div className="bedingungszeile">
                <select aria-label="Art der Bedingung" value={b.art} onChange={(x) => setzeB(i, neuB(x.target.value as Art, b.nicht))}>
                  {ARTEN.filter((a) => !a.nurBenutzerTyp || typ.system === 'benutzer' || a.art === b.art).map((a) => <option key={a.art} value={a.art}>{a.name}</option>)}
                </select>
                <label className="haken klein" title="Bedingung verneinen"><input type="checkbox" checked={!!b.nicht} onChange={(x) => setzeB(i, { ...b, nicht: x.target.checked || undefined })} /><span>nicht</span></label>
                {b.art === 'rolle' && rollenTyp && <MappenSuche typId={rollenTyp} gewaehlt={b.rollen} titel={titel} merke={merke} setze={(ids) => setzeB(i, { ...b, rollen: ids })} />}
                {b.art === 'benutzer' && benutzerTyp && <MappenSuche typId={benutzerTyp} gewaehlt={b.benutzer} titel={titel} merke={merke} setze={(ids) => setzeB(i, { ...b, benutzer: ids })} />}
                {b.art === 'feld' && <>
                  <select aria-label="Feld" value={b.bedingung.feld} onChange={(x) => { const f = felder.find((y) => y.key === x.target.value); if (f) setzeB(i, { ...b, bedingung: { art: 'feld', feld: f.key, op: OPERATOREN_JE_ART[f.art][0] } }); }}>
                    {!feld && <option value={b.bedingung.feld}>– {b.bedingung.feld} (fehlt) –</option>}
                    {felder.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                  {feld && <FeldBedingung b={b.bedingung} feld={feld} setze={(n) => n.art === 'feld' && setzeB(i, { ...b, bedingung: n })} titel={titel} merke={merke} />}
                </>}
                <button type="button" className="textknopf gefahr klein" onClick={() => setze({ ...r, wenn: r.wenn.filter((_, j) => j !== i) })}>Bedingung entfernen</button>
              </div>
              <p className="leise klein">{bedText(b)}</p>
            </li>
          );
        })}
      </ul>
      <div className="knoepfe"><button type="button" className="knopf klein" onClick={() => setze({ ...r, wenn: [...r.wenn, neuB('rolle')] })}>+ Bedingung</button>{r.wenn.length > 1 && <span className="leise klein">Alle Bedingungen müssen zutreffen.</span>}</div>
      <p className="ueber klein">Dann</p>
      <div className="rechtewahl" role="group" aria-label="Wirkung je Recht">
        {RECHTE_LISTE.map((k) => {
          const w = r.dann[k] ?? '';
          return (
            <button key={k} type="button" className={`rechtknopf ${w}`} aria-label={`${RECHTE[k]}: ${w || 'unverändert'}`} title={`${RECHTE[k]}: ${w || 'unverändert'} – klicken zum Wechseln`}
              onClick={() => { const n = NAECHSTE[w]; const dann = { ...r.dann }; if (n) dann[k] = n; else delete dann[k]; setze({ ...r, dann }); }}>
              <span className="buchstabe">{k}</span><span aria-hidden="true">{WIRKUNG_TEXT[w]}</span>
            </button>
          );
        })}
        <label className="haken"><input type="checkbox" checked={r.stopp} onChange={(x) => setze({ ...r, stopp: x.target.checked })} /><span>Stopp <small className="leise">– trifft die Regel zu, folgende nicht mehr prüfen</small></span></label>
      </div>
      {problem && <p className="fehlertext klein">{problem}</p>}
      <div className="knoepfe">
        <button type="button" className="knopf klein" disabled={!gespeichert} title={gespeichert ? undefined : 'Erst speichern'} onClick={() => setKopie((x) => !x)}>In andere Mappentypen kopieren …</button>
        <button type="button" className="textknopf gefahr klein" onClick={weg}>Regel entfernen</button>
        <button type="button" className="knopf klein" onClick={umschalten}>Zuklappen</button>
      </div>
      {kopie && <Kopieren typ={typ} regel={r} fertig={() => { setKopie(false); nachKopie(); }} />}
    </div>
  );
}

function Kopieren({ typ, regel, fertig }: { typ: Mappentyp; regel: Regel; fertig: () => void }) {
  const d = useDaten();
  const [ziele, setZiele] = useState<string[]>([]);
  const [meldung, setMeldung] = useState<string>();
  async function los() {
    try {
      const r = await api.regelKopieren(typ.id, regel.id, ziele);
      setMeldung(`In ${r.kopiert} ${r.kopiert === 1 ? 'Mappentyp' : 'Mappentypen'} ans Ende kopiert.${r.ausgelassen ? ` ${r.ausgelassen} Bedingung${r.ausgelassen === 1 ? '' : 'en'} passte${r.ausgelassen === 1 ? '' : 'n'} dort nicht (Feld fehlt) und ${r.ausgelassen === 1 ? 'fehlt' : 'fehlen'}.` : ''}`);
      setZiele([]);
      void d.neuLaden();
      setTimeout(fertig, 2500);
    } catch (x) { setMeldung((x as Error).message); }
  }
  return (
    <div className="hinweis info">
      <p>Die Regel „{regel.name}“ kommt in den gewählten Mappentypen ans Ende. Feldbedingungen werden nur übernommen, wo es das Feld gleich gibt.</p>
      <div className="typwahl">
        {d.typen.filter((t) => t.id !== typ.id).map((t) => (
          <label key={t.id} className="haken"><input type="checkbox" checked={ziele.includes(t.id)} onChange={(x) => setZiele(x.target.checked ? [...ziele, t.id] : ziele.filter((y) => y !== t.id))} /><span>{t.name}</span></label>
        ))}
      </div>
      <div className="knoepfe"><button type="button" className="knopf klein primaer" disabled={!ziele.length} onClick={() => void los()}>Kopieren</button></div>
      {meldung && <p role="status" className="klein">{meldung}</p>}
    </div>
  );
}

/* ---------- Testlauf (#125) ---------- */

function RechteZeile({ r }: { r: Record<Recht, boolean> }) {
  return (
    <span className="rechtezeile">
      {RECHTE_LISTE.map((k) => <span key={k} className={`recht ${r[k] ? 'ja' : 'nein'}`} title={`${RECHTE[k]}: ${r[k] ? 'ja' : 'nein'}`}>{k}{r[k] ? '✓' : '✗'}</span>)}
    </span>
  );
}

/** Testlauf am Mappentyp (#146): mit den Regeln, wie sie gerade im Editor stehen – auch ungespeichert. */
export function TestlaufBlatt({ typId, entwurf, klappe }: { typId: string; entwurf: Regelwerk; klappe: Klappe }) {
  const [b, setB] = useState('');
  const [mappe, setMappe] = useState('');
  // Das Ergebnis gehört zu (Benutzer, Mappe, Regeln) – wechselt eines davon, ist es sofort weg (#371).
  const stand = JSON.stringify(entwurf);
  const schluessel = testlaufSchluessel({ benutzerId: b, mappeId: mappe, stand });
  const { erg, fehler, los } = useTestlauf<Testlauf>(schluessel, `${b}|${mappe}`,
    () => api.testlauf({ mappeId: mappe, benutzerId: b, berechtigungen: entwurf }));
  return (
    <Bereich id="testlauf" titel="Testlauf" hilfe={<Hilfe ort="berechtigungen.testlauf" />} klappe={klappe}
      kurz={typId ? 'Rechte eines Benutzers an einer Mappe ausprobieren – auch mit ungespeicherten Regeln' : 'Gibt es, sobald der Mappentyp gespeichert ist'}
      beschreibung="Welche Rechte hätte ein Benutzer an einer bestimmten Mappe – und welche Regel hat das entschieden? Geprüft werden die Regeln, wie sie oben stehen, auch wenn sie noch nicht gespeichert sind.">
      {!typId ? <p className="leise klein">Den Testlauf gibt es, sobald der Mappentyp gespeichert ist und Mappen hat.</p> : <>
      <div className="formular">
        <TestBenutzerWahl id="testlauf-benutzer" wert={b} setze={setB} />
        <TestMappeWahl key={typId} id="testlauf-mappe" typId={typId} wert={mappe} setze={setMappe} />
      </div>
      {!schluessel && <p className="leise klein">Wähle Benutzer und Testmappe – das Ergebnis erscheint sofort.</p>}
      {schluessel && !erg && !fehler && <div className="knoepfe"><button type="button" className="knopf klein primaer" onClick={() => void los()}>Prüfen</button></div>}
      {fehler && <p className="fehlertext klein">{fehler}</p>}
      {erg && (
        <div className="testlauf" role="status">
          {erg.admin
            ? <p><strong>{erg.benutzer.name}</strong> ist Administrator – für ihn gelten die Regeln nicht, er darf alles.</p>
            : <>
                <p><strong>{erg.benutzer.name}</strong> an „{erg.mappe.titel || 'ohne Titel'}“: <RechteZeile r={erg.wirksam} /></p>
                <table className="tabelle klein">
                  <thead><tr><th>Schritt</th><th>trifft zu?</th><th>setzt</th><th>Stand danach</th></tr></thead>
                  <tbody>
                    <tr><td>Standard</td><td>–</td><td>–</td><td><RechteZeile r={erg.grund} /></td></tr>
                    {erg.spur.map((s) => (
                      <tr key={s.regel} className={s.traf ? 'traf' : ''}>
                        <td>{s.name || 'Regel'}{s.stopp && s.traf ? ' · Stopp' : ''}</td>
                        <td>{s.traf === null ? 'nicht geprüft (Stopp davor)' : s.traf ? 'ja' : `nein${s.bedingungen.length > 1 ? ` (${s.bedingungen.map((x) => (x ? '✓' : '✗')).join(' ')})` : ''}`}</td>
                        <td>{s.traf ? kurz(s.gesetzt) : '–'}</td>
                        <td><RechteZeile r={s.stand} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {RECHTE_LISTE.some((k) => erg.rechte[k] !== erg.wirksam[k]) && (
                  <p className="leise klein">Wirksam weicht ab: ohne Lesen wirkt nur Anlegen; außerdem gelten die Systemregeln des Mappentyps.</p>
                )}
              </>}
        </div>
      )}
      </>}
    </Bereich>
  );
}

/* ---------- Was sieht Benutzer X? (#125) ---------- */

/* ---------- Was sieht ein Benutzer? (#125, #146: in der Benutzerverwaltung) ---------- */

export function WasSiehtBlatt({ benutzerId, admin }: { benutzerId: string; admin: boolean }) {
  // Ergebnis an den Benutzer gebunden (#371): nie die Liste eines anderen Benutzers zeigen.
  const [gespeichert, setErg] = useState<TestlaufErgebnis<Awaited<ReturnType<typeof api.wasSieht>>>>();
  const [fehlerZu, setFehler] = useState<TestlaufErgebnis<string>>();
  const erg = passendesErgebnis(gespeichert, benutzerId);
  const fehler = passendesErgebnis(fehlerZu, benutzerId);
  const [an, setAn] = useState(false);
  useEffect(() => {
    if (!an || admin) return;
    let aktuell = true;
    api.wasSieht(benutzerId).then((x) => aktuell && setErg({ schluessel: benutzerId, wert: x })).catch((x) => aktuell && setFehler({ schluessel: benutzerId, wert: (x as Error).message }));
    return () => { aktuell = false; };
  }, [an, benutzerId, admin]);
  return (
    <section className="blatt" id="was-sieht">
      <h2 className="h3">Was sieht dieser Benutzer? <Hilfe ort="benutzer.wasSieht" /></h2>
      {admin
        ? <p className="leise">Administratoren sehen alles – für sie gelten die Berechtigungen nicht.</p>
        : <>
            <p className="leise">Je Mappentyp: wie viele Mappen er nach den gespeicherten Regeln lesen darf, mit einigen Beispielen.</p>
            {!an && <div className="knoepfe"><button type="button" className="knopf klein" onClick={() => setAn(true)}>Anzeigen</button></div>}
            {fehler && <p className="fehlertext klein">{fehler}</p>}
            {an && !erg && !fehler && <p className="leise">Lade …</p>}
            {erg && (
              <div className="tabellenrahmen"><table>
                <thead><tr><th>Mappentyp</th><th>lesbar</th><th>Beispiele</th></tr></thead>
                <tbody>
                  {erg.typen.map((t) => (
                    <tr key={t.typId}>
                      <td><Link to={`/werkbank/typen/${t.typId}#berechtigungen`} className="verweis">{t.name}</Link></td>
                      <td>{t.lesbar.toLocaleString('de-DE')} von {t.gesamt.toLocaleString('de-DE')}</td>
                      <td className="klein">{t.beispiele.map((x) => x.titel || 'ohne Titel').join(' · ') || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </>}
    </section>
  );
}
