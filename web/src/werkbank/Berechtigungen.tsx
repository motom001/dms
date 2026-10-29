import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Mappentyp } from '../../../shared/src/model';
import { bedingungsfelder, beschreibeBedingung, OPERATOREN_JE_ART, type Bedingung, type Bedingungsfeld } from '../../../shared/src/sichten';
import {
  beschreibeRegelBedingung, istOffen, kurz, RECHTE, RECHTE_LISTE, regelProblem,
  type Recht, type Regel, type RegelBedingung, type Regelwerk, type Wirkung,
} from '../../../shared/src/rechte';
import { api, ApiFehler, type BerechtigungEintrag, type Testlauf } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { Link, loeseWache, useUngespeichert } from '../ort';
import { Ansage, umgestellt, useZiehen, ziehTasten } from '../ziehen';
import { FeldBedingung, MappenSuche } from './Sichten';
import type { Benutzer } from '../../../shared/src/model';

/**
 * Berechtigungen (#123–#127, #137): je Mappentyp eine Grundeinstellung und Regeln
 * „wenn … dann erteile/entziehe CRUDP“, in Reihenfolge, mit Stopp. Für Administratoren gelten sie nicht.
 *
 * /werkbank/berechtigungen/:typId   Regeln eines Mappentyps, mit Testlauf
 * /werkbank/berechtigungen/sicht    „Was sieht Benutzer X?“
 */

export function useBerechtigungen(aktiv: boolean) {
  const [liste, setListe] = useState<BerechtigungEintrag[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setListe(await api.berechtigungen()); setFehler(undefined); } catch (x) { setFehler((x as Error).message); }
  }, []);
  useEffect(() => { if (aktiv) void laden(); }, [aktiv, laden]);
  return { liste, fehler, laden };
}
export type BerechtigungenZustand = ReturnType<typeof useBerechtigungen>;

const zusammenfassung = (rw: Regelwerk) => (istOffen(rw)
  ? 'keine Regeln – alle dürfen alles'
  : `Grundeinstellung ${rw.grund} · ${rw.regeln.length} ${rw.regeln.length === 1 ? 'Regel' : 'Regeln'}`);

export function BerechtigungenListe({ z, offen }: { z: BerechtigungenZustand; offen?: string }) {
  return (
    <>
      <div className="listenkopf">
        <div><h1>Berechtigungen</h1><p className="leise klein">Wer welche Mappen anlegen, lesen, bearbeiten, löschen und welche Passwörter sehen darf. <Hilfe ort="werkbank.berechtigungen" /></p></div>
      </div>
      {z.fehler && <p className="fehlertext">{z.fehler}</p>}
      <ul className="mappenliste">
        <li>
          <Link to="/werkbank/berechtigungen/sicht" className={`eintrag werk ${offen === 'sicht' ? 'an' : ''}`}>
            <span className="titel">Was sieht ein Benutzer?</span>
            <span className="unter">je Mappentyp: wie viele Mappen jemand lesen darf</span>
          </Link>
        </li>
        {!z.liste ? <li className="leise leerliste">Lade …</li> : z.liste.map((t) => (
          <li key={t.typId}>
            <Link to={`/werkbank/berechtigungen/${t.typId}`} className={`eintrag werk ${offen === t.typId ? 'an' : ''}`}>
              <span className="titel">{t.name}{t.system && <span className="chip">System</span>}</span>
              <span className="unter">{zusammenfassung(t.berechtigungen)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ---------- Regeln eines Mappentyps ---------- */

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

export function BerechtigungEditor({ typId, z }: { typId: string; z: BerechtigungenZustand }) {
  const d = useDaten();
  const typ = d.typ(typId);
  const eintrag = z.liste?.find((x) => x.typId === typId);
  const [basis, setBasis] = useState(() => JSON.stringify(eintrag?.berechtigungen ?? { grund: 'erteilt', regeln: [] }));
  const [e, setE] = useState<Regelwerk>(() => JSON.parse(basis));
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const [ansage, setAnsage] = useState('');
  const [titel, setTitel] = useState<Record<string, string>>({});
  const merke = useCallback((id: string, t: string) => setTitel((x) => ({ ...x, [id]: t })), []);
  const geaendert = JSON.stringify(e) !== basis;
  useUngespeichert(geaendert);
  // Liste kam erst nach dem ersten Zeichnen: Stand übernehmen, solange nichts geändert ist.
  useEffect(() => {
    if (!eintrag || geaendert) return;
    const b = JSON.stringify(eintrag.berechtigungen);
    if (b !== basis) { setBasis(b); setE(JSON.parse(b)); }
  }, [eintrag]); // eslint-disable-line react-hooks/exhaustive-deps

  const zieh = useZiehen({
    fertig: (quelle, ziel, ort) => {
      const von = e.regeln.findIndex((r) => r.id === quelle);
      const nach = e.regeln.findIndex((r) => r.id === ziel);
      if (ort === 'in') return;
      setE((x) => ({ ...x, regeln: umgestellt(x.regeln, von, nach, ort) }));
      setAnsage(`${e.regeln[von]?.name || 'Regel'} steht jetzt ${ort === 'vor' ? 'vor' : 'nach'} „${e.regeln[nach]?.name || 'Regel'}“.`);
    },
  });

  if (!typ) return <div className="leer"><p>Diesen Mappentyp gibt es nicht (mehr).</p></div>;
  const probleme = e.regeln.map((r) => regelProblem(r, typ));

  const setzeRegel = (i: number, r: Regel) => setE((x) => ({ ...x, regeln: x.regeln.map((y, j) => (j === i ? r : y)) }));
  const verschiebe = (i: number, r: number) => setE((x) => {
    const j = i + r;
    if (j < 0 || j >= x.regeln.length) return x;
    setAnsage(`${x.regeln[i].name || 'Regel'} steht jetzt an Stelle ${j + 1}.`);
    return { ...x, regeln: umgestellt(x.regeln, i, j, r < 0 ? 'vor' : 'nach') };
  });
  const neueRegel = () => setE((x) => ({
    ...x, regeln: [...x.regeln, { id: neueId(), name: '', wenn: [{ art: 'rolle', rollen: [] }], dann: {}, stopp: false }],
  }));

  async function speichern(bestaetigt = false) {
    setSendet(true); setMeldung(undefined);
    try {
      const r = await api.berechtigungenSetzen(typId, e, bestaetigt);
      const b = JSON.stringify(r.typ.berechtigungen ?? { grund: 'erteilt', regeln: [] });
      setBasis(b); setE(JSON.parse(b)); loeseWache();
      await Promise.all([z.laden(), d.neuLaden()]);
      setMeldung({ art: 'gut', text: r.niemand ? `Gespeichert. ${r.niemand} ${r.niemand === 1 ? 'Mappe kann' : 'Mappen können'} nur Administratoren lesen.` : 'Berechtigungen gespeichert.' });
    } catch (x) {
      if (x instanceof ApiFehler && x.status === 409 && !bestaetigt && confirm(x.message)) { setSendet(false); await speichern(true); return; }
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    } finally { setSendet(false); }
  }

  return (
    <form onSubmit={(ev) => { ev.preventDefault(); void speichern(); }} noValidate>
      <div className="seitenkopf"><div>
        <p className="ueber">Berechtigungen</p>
        <h1>{typ.name}</h1>
        <p className="leise"><Link to={`/werkbank/typen/${typ.id}`} className="verweis">Mappentyp bearbeiten →</Link></p>
      </div></div>

      <div className="hinweis info">
        <p>Für <strong>Administratoren</strong> gelten diese Regeln nicht – sie sehen und dürfen alles. Die Haken „Neue Mappen erlauben“ und „Löschen erlauben“ am Mappentyp bleiben die Obergrenze für Anlegen und Löschen.</p>
      </div>

      <div className="blatt">
        <h2 className="h3">Grundeinstellung <Hilfe ort="berechtigungen.grund" /></h2>
        <p className="leise">Gilt, solange keine Regel etwas anderes sagt. Dann prüft das DMS die Regeln von oben nach unten: Jede zutreffende Regel setzt ihre ✓ und ✗, „–“ lässt das Recht, wie es ist. „Stopp“ beendet die Prüfung.</p>
        <div className="typwahl">
          <label className="haken"><input type="radio" name="grund" checked={e.grund === 'erteilt'} onChange={() => setE({ ...e, grund: 'erteilt' })} /><span>Alle Rechte erteilt <small className="leise">– Regeln schränken ein</small></span></label>
          <label className="haken"><input type="radio" name="grund" checked={e.grund === 'entzogen'} onChange={() => setE({ ...e, grund: 'entzogen' })} /><span>Alle Rechte entzogen <small className="leise">– Regeln geben frei</small></span></label>
        </div>
      </div>

      <div className="blatt">
        <h2 className="h3">Regeln <Hilfe ort="berechtigungen.regeln" /></h2>
        <p className="leise">C Anlegen · R Lesen · U Bearbeiten (Felder und Dokumente) · D Löschen · P Passwörter sehen. Ohne Lesen wirkt nur Anlegen; für Notizen und Aufgaben reicht Lesen. Reihenfolge per Ziehen am Griff oder mit Alt+↑/↓.</p>
        {e.regeln.length > 0 && (
          <ol className="regeln">
            {e.regeln.map((r, i) => (
              <li key={r.id} {...zieh.eintrag(r.id)}>
                <RegelKarte r={r} typ={typ} problem={probleme[i]} setze={(n) => setzeRegel(i, n)} titel={titel} merke={merke}
                  griff={<button {...zieh.griff(r.id, r.name || 'Regel')} onKeyDown={(ev) => ziehTasten(ev, { hoch: () => verschiebe(i, -1), runter: () => verschiebe(i, 1) })}><span aria-hidden="true">⠿</span></button>}
                  weg={() => setE((x) => ({ ...x, regeln: x.regeln.filter((y) => y.id !== r.id) }))}
                  gespeichert={!geaendert && JSON.parse(basis).regeln.some((y: Regel) => y.id === r.id)}
                  nachKopie={() => void z.laden()} />
              </li>
            ))}
          </ol>
        )}
        <Ansage text={ansage} />
        <div className="knoepfe"><button type="button" className="knopf klein" onClick={neueRegel}>+ Regel</button></div>
      </div>

      <TestlaufBlatt typ={typ} entwurf={geaendert ? e : undefined} />

      <div className="speicherleiste">
        <span />
        <span className={`status ${meldung?.art === 'schlecht' ? 'schlecht' : ''}`} role="status">{meldung?.text ?? (geaendert ? 'Ungespeicherte Änderungen' : '')}</span>
        <div className="knoepfe">
          <button type="button" className="knopf" disabled={!geaendert || sendet} onClick={() => { setE(JSON.parse(basis)); setMeldung(undefined); }}>Änderungen verwerfen</button>
          <button className="knopf primaer" disabled={sendet || !geaendert || probleme.some(Boolean)} title={probleme.find(Boolean) ?? undefined}>{sendet ? 'Speichere …' : 'Berechtigungen speichern'}</button>
        </div>
      </div>
    </form>
  );
}

function RegelKarte({ r, typ, problem, setze, weg, griff, titel, merke, gespeichert, nachKopie }: {
  r: Regel; typ: Mappentyp; problem: string | null; setze: (r: Regel) => void; weg: () => void; griff: ReactNode;
  titel: Record<string, string>; merke: (id: string, t: string) => void; gespeichert: boolean; nachKopie: () => void;
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
              <p className="leise klein">{beschreibeRegelBedingung(b, { benutzer: (id) => titel[id] ?? d.person(id), rolle: (id) => titel[id] ?? '…', feld: feldName })}</p>
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

function useRegelBenutzer() {
  const [liste, setListe] = useState<Benutzer[]>([]);
  useEffect(() => { api.benutzer().then((l) => setListe(l.filter((b) => b.aktiv))).catch(() => {}); }, []);
  return liste;
}

function RechteZeile({ r }: { r: Record<Recht, boolean> }) {
  return (
    <span className="rechtezeile">
      {RECHTE_LISTE.map((k) => <span key={k} className={`recht ${r[k] ? 'ja' : 'nein'}`} title={`${RECHTE[k]}: ${r[k] ? 'ja' : 'nein'}`}>{k}{r[k] ? '✓' : '✗'}</span>)}
    </span>
  );
}

function TestlaufBlatt({ typ, entwurf }: { typ: Mappentyp; entwurf?: Regelwerk }) {
  const benutzer = useRegelBenutzer();
  const [b, setB] = useState('');
  const [mappe, setMappe] = useState<string[]>([]);
  const [titel, setTitel] = useState<Record<string, string>>({});
  const [erg, setErg] = useState<Testlauf>();
  const [fehler, setFehler] = useState<string>();
  async function los() {
    setFehler(undefined);
    try { setErg(await api.testlauf({ mappeId: mappe[0], benutzerId: b, berechtigungen: entwurf })); } catch (x) { setFehler((x as Error).message); setErg(undefined); }
  }
  return (
    <div className="blatt">
      <h2 className="h3">Testlauf <Hilfe ort="berechtigungen.testlauf" /></h2>
      <p className="leise">Welche Rechte hätte ein Benutzer an einer bestimmten Mappe – und welche Regel hat das entschieden? {entwurf ? 'Geprüft wird der ungespeicherte Entwurf.' : 'Geprüft werden die gespeicherten Regeln.'}</p>
      <div className="bedingungszeile">
        <select aria-label="Benutzer" value={b} onChange={(x) => setB(x.target.value)}>
          <option value="">– Benutzer wählen –</option>
          {benutzer.map((x) => <option key={x.id} value={x.id}>{x.name || x.email}{x.rolle === 'admin' ? ' (Administrator)' : ''}</option>)}
        </select>
        <MappenSuche typId={typ.id} gewaehlt={mappe} titel={titel} merke={(id, t) => setTitel((x) => ({ ...x, [id]: t }))} setze={(ids) => setMappe(ids.slice(-1))} />
        <button type="button" className="knopf klein" disabled={!b || !mappe.length} onClick={() => void los()}>Prüfen</button>
      </div>
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
                    <tr><td>Grundeinstellung</td><td>–</td><td>–</td><td><RechteZeile r={erg.grund} /></td></tr>
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
                  <p className="leise klein">Wirksam weicht ab: ohne Lesen wirkt nur Anlegen; Anlegen und Löschen begrenzen außerdem die Haken am Mappentyp.</p>
                )}
              </>}
        </div>
      )}
    </div>
  );
}

/* ---------- Was sieht Benutzer X? (#125) ---------- */

export function WasSiehtPanel() {
  const benutzer = useRegelBenutzer();
  const [b, setB] = useState('');
  const [erg, setErg] = useState<Awaited<ReturnType<typeof api.wasSieht>>>();
  const [fehler, setFehler] = useState<string>();
  useEffect(() => {
    if (!b) { setErg(undefined); return; }
    let aktuell = true;
    api.wasSieht(b).then((x) => aktuell && setErg(x)).catch((x) => aktuell && setFehler((x as Error).message));
    return () => { aktuell = false; };
  }, [b]);
  return (
    <div>
      <div className="seitenkopf"><div><p className="ueber">Berechtigungen</p><h1>Was sieht ein Benutzer?</h1></div></div>
      <div className="blatt">
        <p className="leise">Je Mappentyp: wie viele Mappen der Benutzer nach den gespeicherten Regeln lesen darf, mit einigen Beispielen.</p>
        <select aria-label="Benutzer" value={b} onChange={(x) => { setFehler(undefined); setB(x.target.value); }}>
          <option value="">– Benutzer wählen –</option>
          {benutzer.map((x) => <option key={x.id} value={x.id}>{x.name || x.email}{x.rolle === 'admin' ? ' (Administrator)' : ''}</option>)}
        </select>
        {fehler && <p className="fehlertext klein">{fehler}</p>}
        {erg?.admin && <p className="hinweis info">Administratoren sehen alles – für sie gelten die Regeln nicht.</p>}
        {erg && !erg.admin && (
          <table className="tabelle">
            <thead><tr><th>Mappentyp</th><th>lesbar</th><th>Beispiele</th></tr></thead>
            <tbody>
              {erg.typen.map((t) => (
                <tr key={t.typId}>
                  <td><Link to={`/werkbank/berechtigungen/${t.typId}`} className="verweis">{t.name}</Link></td>
                  <td>{t.lesbar.toLocaleString('de-DE')} von {t.gesamt.toLocaleString('de-DE')}</td>
                  <td className="klein">{t.beispiele.map((x) => x.titel || 'ohne Titel').join(' · ') || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
