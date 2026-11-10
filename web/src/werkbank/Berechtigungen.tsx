import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Mappentyp } from '../../../shared/src/model';
import { bedingungsfelder, beschreibeBedingung, OPERATOREN_JE_ART, type Bedingung, type Bedingungsfeld } from '../../../shared/src/sichten';
import { merkmalName } from '../../../shared/src/merkmale';
import {
  beschreibeRegelBedingung, kurz, kurzStandard, RECHTE, RECHTE_LISTE, regelProblem, systemSperre,
  type Recht, type Regel, type RegelBedingung, type Regelwerk, type Wirkung,
} from '../../../shared/src/rechte';
import { api, type PaketAmTyp, type Testlauf } from '../api';
import type { KiUebersicht } from '../../../shared/src/pakete';
import { useDaten } from '../daten';
import { t, tn } from '../sprache';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { Ansage, umgestellt, useZiehen, ziehTasten } from '../ziehen';
import { FeldBedingung, MappenSuche } from './Sichten';
import { Bereich, type Klappe } from '../einrichtung/Bereich';
import { passendesErgebnis, testlaufSchluessel, type TestlaufErgebnis } from '../../../shared/src/testlauf';
import { TestBenutzerWahl, TestMappeWahl, useTestlauf } from './TestlaufWahl';
import { gebietsschema } from '../../../shared/src/sprache';

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
  { art: 'rolle', name: t('werkbank.berechtigungen.benutzer-hat-rolle') },
  { art: 'benutzer', name: t('werkbank.berechtigungen.benutzer-ist') },
  { art: 'feld', name: t('werkbank.berechtigungen.feld-der-mappe') },
  { art: 'aufgabe', name: t('werkbank.berechtigungen.offene-aufgabe-fuer-den') },
  { art: 'eigeneMappe', name: t('werkbank.berechtigungen.mappe-ist-die-des'), nurBenutzerTyp: true },
  // Merkmal der Ablage (#1032): gilt für alle Mappen gleich.
  { art: 'merkmal', name: merkmalName('beruflich') },
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
  const merke = useCallback((id: string, text: string) => setTitel((x) => ({ ...x, [id]: text })), []);
  const zieh = useZiehen({
    fertig: (quelle, ziel, ort) => {
      if (ort === 'in') return;
      setRw((x) => {
        const von = x.regeln.findIndex((r) => r.id === quelle);
        const nach = x.regeln.findIndex((r) => r.id === ziel);
        setAnsage(t('werkbank.berechtigungen.steht-jetzt', { wert: x.regeln[von]?.name || t('werkbank.berechtigungen.regel'), wert2: ort === 'vor' ? t('werkbank.berechtigungen.vor') : t('werkbank.berechtigungen.nach'), wert3: x.regeln[nach]?.name || t('werkbank.berechtigungen.regel') }));
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
    setAnsage(t('werkbank.berechtigungen.steht-jetzt-an-stelle', { wert: x.regeln[i].name || t('werkbank.berechtigungen.regel'), wert2: j + 1 }));
    return { ...x, regeln: umgestellt(x.regeln, i, j, r < 0 ? 'vor' : 'nach') };
  });
  const neueRegel = () => {
    const id = neueId();
    setOffen((x) => new Set([...x, id]));
    setRw((x) => ({ ...x, regeln: [...x.regeln, { id, name: '', wenn: [{ art: 'rolle', rollen: [] }], dann: {}, stopp: false }] }));
  };
  const sperre = systemSperre(typ);

  return (
    <Bereich id="berechtigungen" titel={t('werkbank.berechtigungen.berechtigungen')} hilfe={<Hilfe ort="werkbank.berechtigungen" />} klappe={klappe}
      kurz={t('werkbank.berechtigungen.standard-regeln', { anzahl: rw.regeln.length, kurzStandard: kurzStandard(Object.fromEntries(RECHTE_LISTE.map((k) => [k, rw.grund[k] && !((k === 'C' && sperre.C) || (k === 'D' && sperre.D))])) as Record<Recht, boolean>), wert: rw.regeln.length || t('werkbank.berechtigungen.keine') })}
      beschreibung={<>{tn('werkbank.berechtigungen.wer-mappen-dieses-mappentyps', { b: <strong>{t('werkbank.berechtigungen.verwaltungsmodus')}</strong> })}</>}>

      <h3 className="zwischen">{t('werkbank.berechtigungen.standard')} <Hilfe ort="berechtigungen.grund" /></h3>
      <p className="leise klein">{t('werkbank.berechtigungen.gilt-solange-keine-regel')}</p>
      <div className="rechtewahl" role="group" aria-label={t('werkbank.berechtigungen.standard-je-recht')}>
        {RECHTE_LISTE.map((k) => {
          const fest = (k === 'C' && sperre.C) || (k === 'D' && sperre.D);
          const an = rw.grund[k] && !fest;
          return (
            <button key={k} type="button" className={`rechtknopf ${an ? 'erteilen' : 'entziehen'}`} disabled={fest}
              aria-label={t('werkbank.berechtigungen.standard-2', { RECHTE: RECHTE[k], wert: an ? t('werkbank.berechtigungen.erteilt') : t('werkbank.berechtigungen.entzogen') })} title={fest ? t('werkbank.berechtigungen.geht-bei-diesem-systemtyp', { RECHTE: RECHTE[k] }) : t('werkbank.berechtigungen.klicken-zum-wechseln', { RECHTE: RECHTE[k], wert: an ? t('werkbank.berechtigungen.erteilt') : t('werkbank.berechtigungen.entzogen') })}
              onClick={() => setRw((x) => ({ ...x, grund: { ...x.grund, [k]: !x.grund[k] } }))}>
              <span className="buchstabe">{k}</span><span aria-hidden="true">{an ? '✓' : '✗'}</span>
            </button>
          );
        })}
      </div>
      {(sperre.C || sperre.D) && <p className="leise klein">{typ.system === 'benutzer' ? t('werkbank.berechtigungen.benutzer-entstehen-und-verschwinden') : t('werkbank.berechtigungen.e-mail-mappen-entstehen')}</p>}

      <h3 className="zwischen">{t('werkbank.berechtigungen.regeln')} <Hilfe ort="berechtigungen.regeln" /></h3>
      <p className="leise">{t('werkbank.berechtigungen.von-oben-nach-unten')}</p>
      {rw.regeln.length > 0 && (
        <ol className="regeln">
          {rw.regeln.map((r, i) => (
            <li key={r.id} {...zieh.eintrag(r.id)}>
              <RegelKarte r={r} typ={typ} problem={probleme[i]} setze={(n) => setzeRegel(i, n)} titel={titel} merke={merke}
                offen={offen.has(r.id)} umschalten={() => umschalten(r.id)}
                griff={<button {...zieh.griff(r.id, r.name || t('werkbank.berechtigungen.regel'))} onKeyDown={(ev) => ziehTasten(ev, { hoch: () => verschiebe(i, -1), runter: () => verschiebe(i, 1) })}><span aria-hidden="true">⠿</span></button>}
                weg={() => setRw((x) => ({ ...x, regeln: x.regeln.filter((y) => y.id !== r.id) }))}
                gespeichert={unveraendert && !neu}
                nachKopie={() => {}} />
            </li>
          ))}
        </ol>
      )}
      <Ansage text={ansage} />
      <div className="knoepfe"><button type="button" className="knopf klein" onClick={neueRegel}>{t('werkbank.berechtigungen.regel-2')}</button></div>
    </Bereich>
  );
}

/**
 * Abschnitt „Pakete“ im Mappentyp-Editor (#686): welche Pakete mit Code Mappen dieses Typs lesen dürften – mit Haken
 * „darf diesen Mappentyp sehen“. Gilt sofort (eigene Einstellung, nicht Teil von „Mappentyp speichern“).
 */
export function PaketeAmTyp({ typId, klappe }: { typId: string; klappe: Klappe }) {
  const [liste, setListe] = useState<PaketAmTyp[] | null>(null);
  const [fehler, setFehler] = useState('');
  const [meldung, setMeldung] = useState('');
  const [sendet, setSendet] = useState('');
  useEffect(() => {
    if (!typId) return;
    let weg = false;
    api.paketeAmTyp(typId).then((x) => { if (!weg) setListe(x); }, (e: Error) => { if (!weg) setFehler(e.message); });
    return () => { weg = true; };
  }, [typId]);
  if (typId && liste && !liste.length) return null;
  const verwehrt = liste?.filter((p) => p.verwehrt).length ?? 0;
  const setze = async (p: PaketAmTyp, darf: boolean) => {
    setSendet(p.id); setFehler(''); setMeldung('');
    try { setListe(await api.paketVerwehren(typId, p.id, !darf)); setMeldung(t(darf ? 'pakete.amtyp.gespeichert.an' : 'pakete.amtyp.gespeichert.aus', { name: p.name })); }
    catch (e) { setFehler((e as Error).message); }
    finally { setSendet(''); }
  };
  return (
    <Bereich id="pakete" titel={t('pakete.amtyp.titel')} hilfe={<Hilfe ort="werkbank.pakete_am_typ" />} klappe={klappe}
      kurz={liste ? t('pakete.amtyp.kurz', { anzahl: liste.length, verwehrt: verwehrt || t('pakete.amtyp.kurz.keine') }) : undefined}
      beschreibung={t('pakete.amtyp.beschreibung')}>
      {!typId && <p className="leise">{t('pakete.amtyp.neu')}</p>}
      {fehler && <p className="hinweis schlecht" role="alert">{fehler}</p>}
      {liste && (
        <ul className="liste-ohne">
          {liste.map((p) => (
            <li key={p.id}>
              <label className="haken"><input type="checkbox" checked={!p.verwehrt} disabled={sendet === p.id} onChange={(ev) => void setze(p, ev.target.checked)} />
                <span>{t('pakete.amtyp.darf', { name: p.name })}
                  <small className="hilfe">{[t(p.schreiben ? 'pakete.amtyp.was.schreiben' : 'pakete.amtyp.was.lesen'), ...(p.ereignisse ? [t('pakete.amtyp.was.ereignisse')] : [])].join(' · ')}</small></span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="leise klein" role="status">{meldung}</p>
    </Bereich>
  );
}

/**
 * Abschnitt „KI-Dienste“ im Mappentyp-Editor (#796): Darf der Mappentyp an KI-Pakete gehen (Pakete, die Inhalte ins Netz
 * schicken können)? Gilt sofort, eigene Einstellung. Neue Mappentypen sind gesperrt, bis man sie hier zulässt.
 */
export function KiAmTyp({ typId, klappe }: { typId: string; klappe: Klappe }) {
  const [k, setK] = useState<KiUebersicht | null>(null);
  const [fehler, setFehler] = useState('');
  const [meldung, setMeldung] = useState('');
  const [sendet, setSendet] = useState(false);
  useEffect(() => {
    let weg = false;
    api.kiTypen().then((x) => { if (!weg) setK(x); }, (e: Error) => { if (!weg) setFehler(e.message); });
    return () => { weg = true; };
  }, [typId]);
  const eintrag = k?.typen.find((x) => x.id === typId);
  const an = !!eintrag?.zugelassen;
  const setze = async (zugelassen: boolean) => {
    setSendet(true); setFehler(''); setMeldung('');
    try { setK(await api.setzeKiTyp(typId, zugelassen)); setMeldung(t(zugelassen ? 'pakete.ki.typ.gespeichert.an' : 'pakete.ki.typ.gespeichert.aus')); }
    catch (e) { setFehler((e as Error).message); }
    finally { setSendet(false); }
  };
  const pakete = k?.pakete ?? [];
  return (
    <Bereich id="ki" titel={t('pakete.ki.typ.titel')} hilfe={<Hilfe ort="pakete.ki" />} klappe={klappe}
      kurz={k ? (!typId ? t('pakete.ki.typ.kurz.neu') : an ? t('pakete.ki.typ.kurz.an') : t('pakete.ki.typ.kurz.aus')) : undefined}
      beschreibung={t('pakete.ki.typ.beschreibung')}>
      {fehler && <p className="hinweis schlecht" role="alert">{fehler}</p>}
      {!typId ? <p className="leise">{t('pakete.ki.typ.neu')}</p> : k && (
        <label className="haken"><input type="checkbox" checked={an} disabled={sendet} onChange={(ev) => void setze(ev.target.checked)} />
          <span>{t('pakete.ki.typ.darf')}<small className="hilfe">{an ? t('pakete.ki.typ.an.hilfe') : t('pakete.ki.typ.aus.hilfe')}</small></span>
        </label>
      )}
      {k && <p className="leise klein">{pakete.length ? t('pakete.ki.typ.pakete', { namen: pakete.map((p) => p.name).join(', ') }) : t('pakete.ki.typ.keine-pakete')}</p>}
      <p className="leise klein" role="status">{meldung}</p>
    </Bereich>
  );
}

function RegelKarte({ r, typ, problem, setze, weg, griff, titel, merke, gespeichert, nachKopie, offen, umschalten }: {
  r: Regel; typ: Mappentyp; problem: string | null; setze: (r: Regel) => void; weg: () => void; griff: ReactNode;
  titel: Record<string, string>; merke: (id: string, text: string) => void; gespeichert: boolean; nachKopie: () => void;
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
    if (art === 'merkmal') return { ...n, art, merkmal: 'beruflich' };
    return { ...n, art };
  };
  const rollenTyp = d.typen.find((mappentyp) => mappentyp.system === 'rolle')?.id;
  const benutzerTyp = d.typen.find((mappentyp) => mappentyp.system === 'benutzer')?.id;
  const feldName = (b: Extract<Bedingung, { art: 'feld' }>) => beschreibeBedingung(b, [typ], (id) => titel[id] ?? d.person(id));

  const bedText = (b: RegelBedingung) => beschreibeRegelBedingung(b, { benutzer: (id) => titel[id] ?? d.person(id), rolle: (id) => titel[id] ?? '…', feld: feldName });
  // Rollen- und Benutzernamen für die Kurzform nachladen.
  const fehlend = r.wenn.flatMap((b) => (b.art === 'rolle' ? b.rollen : b.art === 'benutzer' ? b.benutzer : [])).filter((x) => !titel[x]).join(',');
  useEffect(() => {
    if (offen) return;
    for (const x of fehlend ? fehlend.split(',') : []) api.mappe(x).then((m) => merke(x, m.mappe.titel ?? '')).catch(() => merke(x, '(gelöscht)'));
  }, [fehlend, offen]); // eslint-disable-line react-hooks/exhaustive-deps -- Namen nur nachladen, wenn sich die Liste der fehlenden Mappen ändert

  if (!offen) return (
    <div className={`regel zu ${problem ? 'fehlerhaft' : ''}`}>
      <div className="regelkopf">
        {griff}
        <button type="button" className="regelsumme" aria-expanded={false} onClick={umschalten}>
          <strong>{r.name || t('werkbank.berechtigungen.ohne-namen')}</strong>
          <span className="chip">{kurz(r.dann)}{r.stopp ? t('werkbank.berechtigungen.stopp') : ''}</span>
          <span className="leise klein">{t('werkbank.berechtigungen.wenn')}{' '}{r.wenn.map(bedText).join(` ${t('werkbank.berechtigungen.und')} `) || '…'}</span>
        </button>
      </div>
      {problem && <p className="fehlertext klein">{problem}</p>}
    </div>
  );

  return (
    <div className={`regel ${problem ? 'fehlerhaft' : ''}`}>
      <div className="regelkopf">
        {griff}
        <input aria-label={t('werkbank.berechtigungen.name-der-regel')} placeholder={t('werkbank.berechtigungen.name-z-b-buchhaltung')} value={r.name} onChange={(x) => setze({ ...r, name: x.target.value })} />
        <span className="chip" title={t('werkbank.berechtigungen.kurzform-der-wirkung')}>{kurz(r.dann)}{r.stopp ? t('werkbank.berechtigungen.stopp') : ''}</span>
      </div>
      <p className="ueber klein">{t('werkbank.berechtigungen.wenn-2')}</p>
      <ul className="bedingungen">
        {r.wenn.map((b, i) => {
          const feld: Bedingungsfeld | undefined = b.art === 'feld' ? felder.find((f) => f.key === b.bedingung.feld) : undefined;
          return (
            <li key={i}>
              <div className="bedingungszeile">
                <select aria-label={t('werkbank.berechtigungen.art-der-bedingung')} value={b.art} onChange={(x) => setzeB(i, neuB(x.target.value as Art, b.nicht))}>
                  {ARTEN.filter((a) => !a.nurBenutzerTyp || typ.system === 'benutzer' || a.art === b.art).map((a) => <option key={a.art} value={a.art}>{a.name}</option>)}
                </select>
                <label className="haken klein" title={t('werkbank.berechtigungen.bedingung-verneinen')}><input type="checkbox" checked={!!b.nicht} onChange={(x) => setzeB(i, { ...b, nicht: x.target.checked || undefined })} /><span>{t('werkbank.berechtigungen.nicht')}</span></label>
                {b.art === 'rolle' && rollenTyp && <MappenSuche typId={rollenTyp} gewaehlt={b.rollen} titel={titel} merke={merke} setze={(ids) => setzeB(i, { ...b, rollen: ids })} />}
                {b.art === 'benutzer' && benutzerTyp && <MappenSuche typId={benutzerTyp} gewaehlt={b.benutzer} titel={titel} merke={merke} setze={(ids) => setzeB(i, { ...b, benutzer: ids })} />}
                {b.art === 'feld' && <>
                  <select aria-label={t('werkbank.berechtigungen.feld')} value={b.bedingung.feld} onChange={(x) => { const f = felder.find((y) => y.key === x.target.value); if (f) setzeB(i, { ...b, bedingung: { art: 'feld', feld: f.key, op: OPERATOREN_JE_ART[f.art][0] } }); }}>
                    {!feld && <option value={b.bedingung.feld}>{t('werkbank.berechtigungen.fehlt', { feld: b.bedingung.feld })}</option>}
                    {felder.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                  {feld && <FeldBedingung b={b.bedingung} feld={feld} setze={(n) => n.art === 'feld' && setzeB(i, { ...b, bedingung: n })} titel={titel} merke={merke} />}
                </>}
                <button type="button" className="textknopf gefahr klein" onClick={() => setze({ ...r, wenn: r.wenn.filter((_, j) => j !== i) })}>{t('werkbank.berechtigungen.bedingung-entfernen')}</button>
              </div>
              <p className="leise klein">{bedText(b)}</p>
            </li>
          );
        })}
      </ul>
      <div className="knoepfe"><button type="button" className="knopf klein" onClick={() => setze({ ...r, wenn: [...r.wenn, neuB('rolle')] })}>{t('werkbank.berechtigungen.bedingung')}</button>{r.wenn.length > 1 && <span className="leise klein">{t('werkbank.berechtigungen.alle-bedingungen-muessen-zutreffen')}</span>}</div>
      <p className="ueber klein">{t('werkbank.berechtigungen.dann')}</p>
      <div className="rechtewahl" role="group" aria-label={t('werkbank.berechtigungen.wirkung-je-recht')}>
        {RECHTE_LISTE.map((k) => {
          const w = r.dann[k] ?? '';
          return (
            <button key={k} type="button" className={`rechtknopf ${w}`} aria-label={w ? t('werkbank.berechtigungen.recht-wert', { recht: RECHTE[k], wert: w }) : t('werkbank.berechtigungen.recht-unveraendert', { recht: RECHTE[k] })} title={t('werkbank.berechtigungen.klicken-zum-wechseln', { RECHTE: RECHTE[k], wert: w || t('werkbank.berechtigungen.unveraendert') })}
              onClick={() => { const n = NAECHSTE[w]; const dann = { ...r.dann }; if (n) dann[k] = n; else delete dann[k]; setze({ ...r, dann }); }}>
              <span className="buchstabe">{k}</span><span aria-hidden="true">{WIRKUNG_TEXT[w]}</span>
            </button>
          );
        })}
        <label className="haken"><input type="checkbox" checked={r.stopp} onChange={(x) => setze({ ...r, stopp: x.target.checked })} /><span>{tn('werkbank.berechtigungen.stopp-2', { klein: <small className="leise">{t('werkbank.berechtigungen.trifft-die-regel-zu')}</small> })}</span></label>
      </div>
      {problem && <p className="fehlertext klein">{problem}</p>}
      <div className="knoepfe">
        <button type="button" className="knopf klein" disabled={!gespeichert} title={gespeichert ? undefined : t('werkbank.berechtigungen.erst-speichern')} onClick={() => setKopie((x) => !x)}>{t('werkbank.berechtigungen.in-andere-mappentypen-kopieren')}</button>
        <button type="button" className="textknopf gefahr klein" onClick={weg}>{t('werkbank.berechtigungen.regel-entfernen')}</button>
        <button type="button" className="knopf klein" onClick={umschalten}>{t('werkbank.berechtigungen.zuklappen')}</button>
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
      setMeldung(t('werkbank.berechtigungen.in-mappentypen-ans-ende', { anzahl: r.kopiert, wert: r.ausgelassen ? t('werkbank.berechtigungen.bedingungen-passten-dort-nicht', { anzahl: r.ausgelassen }) : '' }));
      setZiele([]);
      void d.neuLaden();
      setTimeout(fertig, 2500);
    } catch (x) { setMeldung((x as Error).message); }
  }
  return (
    <div className="hinweis info">
      <p>{t('werkbank.berechtigungen.die-regel-kommt-in', { name: regel.name })}</p>
      <div className="typwahl">
        {d.typen.filter((mappentyp) => mappentyp.id !== typ.id).map((mappentyp) => (
          <label key={mappentyp.id} className="haken"><input type="checkbox" checked={ziele.includes(mappentyp.id)} onChange={(x) => setZiele(x.target.checked ? [...ziele, mappentyp.id] : ziele.filter((y) => y !== mappentyp.id))} /><span>{mappentyp.name}</span></label>
        ))}
      </div>
      <div className="knoepfe"><button type="button" className="knopf klein primaer" disabled={!ziele.length} onClick={() => void los()}>{t('werkbank.berechtigungen.kopieren')}</button></div>
      {meldung && <p role="status" className="klein">{meldung}</p>}
    </div>
  );
}

/* ---------- Testlauf (#125) ---------- */

function RechteZeile({ r }: { r: Record<Recht, boolean> }) {
  return (
    <span className="rechtezeile">
      {RECHTE_LISTE.map((k) => <span key={k} className={`recht ${r[k] ? 'ja' : 'nein'}`} title={r[k] ? t('werkbank.berechtigungen.recht-ja', { recht: RECHTE[k] }) : t('werkbank.berechtigungen.recht-nein', { recht: RECHTE[k] })}>{k}{r[k] ? '✓' : '✗'}</span>)}
    </span>
  );
}

/** Testlauf am Mappentyp (#146): mit den Regeln, wie sie gerade im Editor stehen – auch ungespeichert. */
export function TestlaufBlatt({ typId, entwurf, klappe }: { typId: string; entwurf: Regelwerk; klappe: Klappe }) {
  // Vorausgewähltes Konto über ?testkonto=<id> (#710), z. B. aus der Warnung einer Automatisierung (#709).
  const [b, setB] = useState(() => new URLSearchParams(location.search).get('testkonto') ?? '');
  // Vorausgewählte Testmappe über ?testmappe=<id> (#798, aus „Aufgaben bei Personen ohne Leserecht“).
  const [mappe, setMappe] = useState(() => new URLSearchParams(location.search).get('testmappe') ?? '');
  // Das Ergebnis gehört zu (Benutzer, Mappe, Regeln) – wechselt eines davon, ist es sofort weg (#371).
  const stand = JSON.stringify(entwurf);
  const schluessel = testlaufSchluessel({ benutzerId: b, mappeId: mappe, stand });
  const { erg, fehler, los } = useTestlauf<Testlauf>(schluessel, `${b}|${mappe}`,
    () => api.testlauf({ mappeId: mappe, benutzerId: b, berechtigungen: entwurf }));
  return (
    <Bereich id="testlauf" titel={t('werkbank.berechtigungen.testlauf')} hilfe={<Hilfe ort="berechtigungen.testlauf" />} klappe={klappe}
      kurz={typId ? t('werkbank.berechtigungen.rechte-eines-benutzers-an') : t('werkbank.berechtigungen.gibt-es-sobald-der')}
      beschreibung={t('werkbank.berechtigungen.welche-rechte-haette-ein')}>
      {!typId ? <p className="leise klein">{t('werkbank.berechtigungen.den-testlauf-gibt-es')}</p> : <>
      <div className="formular">
        <TestBenutzerWahl id="testlauf-benutzer" wert={b} setze={setB} mitKonten />
        <TestMappeWahl key={typId} id="testlauf-mappe" typId={typId} wert={mappe} setze={setMappe} />
      </div>
      {!schluessel && <p className="leise klein">{t('werkbank.berechtigungen.waehle-benutzer-und-testmappe')}</p>}
      {schluessel && !erg && !fehler && <div className="knoepfe"><button type="button" className="knopf klein primaer" onClick={() => void los()}>{t('werkbank.berechtigungen.pruefen')}</button></div>}
      {fehler && <p className="fehlertext klein">{fehler}</p>}
      {erg && (
        <div className="testlauf" role="status">
          {erg.konto && <p className="leise klein">{erg.unbestaetigt ? t('werkbank.testlauf.konto.unbestaetigt') : t('werkbank.testlauf.konto.hinweis', { rolle: t.frei(`werkbank.testlauf.konto.kennzeichen.${erg.konto}`) })}</p>}
          {erg.admin
            ? <p>{tn('werkbank.berechtigungen.ist-administrator-fuer-ihn', { b: <strong>{erg.benutzer.name}</strong> })}</p>
            : <>
                <p>{tn('werkbank.berechtigungen.an', { b: <strong>{erg.benutzer.name}</strong>, wert: erg.mappe.titel || t('werkbank.berechtigungen.ohne-titel') })}{' '}<RechteZeile r={erg.wirksam} /></p>
                <table className="tabelle klein">
                  <thead><tr><th>{t('werkbank.berechtigungen.schritt')}</th><th>{t('werkbank.berechtigungen.trifft-zu')}</th><th>{t('werkbank.berechtigungen.setzt')}</th><th>{t('werkbank.berechtigungen.stand-danach')}</th></tr></thead>
                  <tbody>
                    <tr><td>{t('werkbank.berechtigungen.standard-3')}</td><td>–</td><td>–</td><td><RechteZeile r={erg.grund} /></td></tr>
                    {erg.spur.map((s) => (
                      <tr key={s.regel} className={s.traf ? 'traf' : ''}>
                        <td>{s.name || t('werkbank.berechtigungen.regel')}{s.stopp && s.traf ? t('werkbank.berechtigungen.stopp') : ''}</td>
                        <td>{s.traf === null ? t('werkbank.berechtigungen.nicht-geprueft-stopp-davor') : s.traf ? t('werkbank.berechtigungen.ja') : t('werkbank.berechtigungen.nein', { wert: s.bedingungen.length > 1 ? ` (${s.bedingungen.map((x) => (x ? '✓' : '✗')).join(' ')})` : '' })}</td>
                        <td>{s.traf ? kurz(s.gesetzt) : '–'}</td>
                        <td><RechteZeile r={s.stand} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Leserecht auf Zeit (#798) mit seinem Grund. */}
                {erg.aufZeit && <p className="hinweis info klein">{t(erg.aufZeit.wirkt ? 'werkbank.testlauf.auf-zeit' : 'werkbank.testlauf.auf-zeit.ohnehin', { aufgabe: erg.aufZeit.aufgabe, seit: new Date(erg.aufZeit.seit).toLocaleDateString(gebietsschema()), von: erg.aufZeit.von ?? t('werkbank.ohne-leserecht.unbekannt') })}</p>}
                {RECHTE_LISTE.some((k) => erg.rechte[k] !== erg.wirksam[k]) && !erg.aufZeit?.wirkt && (
                  <p className="leise klein">{t('werkbank.berechtigungen.wirksam-weicht-ab-ohne')}</p>
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
      <h2 className="h3">{t('werkbank.berechtigungen.was-sieht-dieser-benutzer')} <Hilfe ort="benutzer.wasSieht" /></h2>
      {admin
        ? <p className="leise">{t('konten.verwaltende.berechtigungen.modus')}</p>
        : <>
            <p className="leise">{t('werkbank.berechtigungen.je-mappentyp-wie-viele')}</p>
            {!an && <div className="knoepfe"><button type="button" className="knopf klein" onClick={() => setAn(true)}>{t('werkbank.berechtigungen.anzeigen')}</button></div>}
            {fehler && <p className="fehlertext klein">{fehler}</p>}
            {an && !erg && !fehler && <p className="leise">{t('werkbank.berechtigungen.lade')}</p>}
            {erg && (
              <div className="tabellenrahmen"><table>
                <thead><tr><th>{t('werkbank.berechtigungen.mappentyp')}</th><th>{t('werkbank.berechtigungen.lesbar')}</th><th>{t('werkbank.berechtigungen.beispiele')}</th></tr></thead>
                <tbody>
                  {erg.typen.map((eintrag) => (
                    <tr key={eintrag.typId}>
                      <td><Link to={`/werkbank/typen/${eintrag.typId}#berechtigungen`} className="verweis">{eintrag.name}</Link></td>
                      <td>{t('werkbank.berechtigungen.von', { lesbar: eintrag.lesbar.toLocaleString(gebietsschema()), gesamt: eintrag.gesamt.toLocaleString(gebietsschema()) })}</td>
                      <td className="klein">{eintrag.beispiele.map((x) => x.titel || t('werkbank.berechtigungen.ohne-titel')).join(' · ') || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </>}
    </section>
  );
}
