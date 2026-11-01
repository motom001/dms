import { useCallback, useEffect, useRef, useState } from 'react';
import { api, DOKUMENTARTEN, type Auftrag, type DemoAbschaetzung, type DemoErgebnis, type DemoOptionen, type DemoStufe, type Dokumentart } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { rueckfrage } from '../rueckfrage';
import { fortschrittText } from '../../../shared/src/auftrag';
import { JE_MAPPE_STUFEN, MAX_DEMO, MAX_DEMO_DOKUMENTE, MAX_DUPLIKATE, mengenWarnung, MISCHUNGEN, schaetzeMenge, stelleMischung, stelleVonBis, stufeVon } from '../../../shared/src/demodaten';

type Uebersicht = Array<{ typId: string; name: string; demo: number; gesamt: number }>;

function useUebersicht() {
  const d = useDaten();
  const [u, setU] = useState<Uebersicht>([]);
  const laden = useCallback(async () => { try { setU(await api.demoUebersicht()); } catch { /* Anzeige bleibt leer */ } }, []);
  useEffect(() => { void laden(); }, [laden, d.stand]);
  return u;
}

export function DemoListe() {
  const u = useUebersicht();
  return (
    <>
      <div className="listenkopf"><div><h1>Demo-Daten</h1><p className="leise klein">Mappen je Mappentyp, davon Demo-Mappen. <Hilfe ort="werkbank.demo" /></p></div></div>
      {!u.length
        ? <p className="leise leerliste">Noch keine Mappentypen.</p>
        : <ul className="mappenliste">
            {u.map((t) => (
              <li key={t.typId}><span className="eintrag werk">
                <span className="titel">{t.name}</span>
                <span className="unter">{t.gesamt.toLocaleString('de-DE')} {t.gesamt === 1 ? 'Mappe' : 'Mappen'}{t.demo ? `, davon ${t.demo.toLocaleString('de-DE')} Demo` : ''}</span>
              </span></li>
            ))}
          </ul>}
    </>
  );
}

type Meldung = { art: 'gut' | 'warn' | 'schlecht'; text: string; liste?: string[] };

const ARTNAME: Record<Dokumentart, string> = { brief: 'Brief/Rechnung (1 Seite)', mehrseitig: 'Mehrseitiges PDF', scan: '„Gescanntes“ PDF', bild: 'Bild (JPEG/PNG)', gross: 'Große Datei (20–100 MB)' };
const STUFENTEXT: Record<DemoStufe | 'eigen', string> = { leicht: 'leicht', realistisch: 'realistisch', schwer: 'schwer', eigen: 'eigene Mischung' };

/** Schieberegler mit Wertanzeige (#365): nativ, also mit Pfeiltasten und Bild auf/ab bedienbar. */
function Regler({ id, name, hinweis, wert, min, max, anzeige, onChange }: {
  id: string; name: string; hinweis?: string; wert: number; min: number; max: number; anzeige: string; onChange: (n: number) => void;
}) {
  return (
    <label className="regler" htmlFor={id}>
      <span><span>{name}{hinweis && <> <small>{hinweis}</small></>}</span><output htmlFor={id} aria-hidden="true">{anzeige}</output></span>
      <input id={id} type="range" min={min} max={max} step={1} value={wert} aria-valuetext={anzeige} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
const dokumente = (n: number) => `${n.toLocaleString('de-DE')} ${n === 1 ? 'Dokument' : 'Dokumente'}`;

const groesse = (b: number) => b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : `${Math.max(1, Math.round(b / 1024 ** 2)).toLocaleString('de-DE')} MB`;
const dauer = (ms: number) => ms < 60_000 ? `${Math.round(ms / 1000)} s` : ms < 3_600_000 ? `${Math.round(ms / 60_000)} min` : `${(ms / 3_600_000).toFixed(1).replace('.', ',')} h`;

/** Meldung zum Ergebnis eines beendeten Auftrags. */
function meldungAus(a: Auftrag): Meldung {
  if (a.status === 'fehler') return { art: 'schlecht', text: `${a.titel}: ${a.fehler ?? 'Fehler'}` };
  if (a.art === 'demo-entfernen') return { art: 'gut', text: `${(a.ergebnis as { entfernt: number }).entfernt.toLocaleString('de-DE')} Demo-Mappen entfernt.` };
  const r = a.ergebnis as DemoErgebnis;
  const d = r.dokumente;
  return {
    art: r.uebersprungen.length || r.abgebrochen ? 'warn' : 'gut',
    text: `${r.gesamt.toLocaleString('de-DE')} Demo-Mappen${d ? ` und ${d.anzahl.toLocaleString('de-DE')} Dokumente (${groesse(d.bytes)})` : ''} erzeugt${r.dauerMs ? ` in ${dauer(r.dauerMs)}` : ''}.${r.startwert ? ` Startwert: ${r.startwert}` : ''}`,
    liste: [
      ...Object.entries(r.erzeugt).map(([k, v]) => `${k}: ${v.toLocaleString('de-DE')}`),
      ...(d ? [
        `Dokumente: ${DOKUMENTARTEN.filter((x) => d.jeArt[x]).map((x) => `${ARTNAME[x]} ${d.jeArt[x].toLocaleString('de-DE')}`).join(', ')}${d.duplikate ? `, Duplikate ${d.duplikate.toLocaleString('de-DE')}` : ''}`,
        `${d.seiten.toLocaleString('de-DE')} Seiten, ${d.texterkennung.toLocaleString('de-DE')} Dokumente in der Warteschlange der Texterkennung, Dokumente in ${dauer(d.dauerMs)}`,
      ] : []),
      ...(r.ohneRastern ? ['Ohne pdftoppm: Scans und Bilder wurden als einfache PDFs erzeugt.'] : []),
      ...(r.abgebrochen ? [`Vorzeitig beendet: ${r.abgebrochen}`] : []),
      ...r.uebersprungen.map((x) => `${x.typ} unvollständig: ${x.grund}`),
    ],
  };
}

/** Stand des Hintergrundauftrags; fragt jede Sekunde nach, solange er läuft. */
function useAuftrag(fertig: (a: Auftrag) => void) {
  const [a, setA] = useState<Auftrag | null>(null);
  const zuletzt = useRef<string | undefined>(undefined);
  const fertigRef = useRef(fertig);
  fertigRef.current = fertig;
  const abfragen = useCallback(async () => {
    try {
      const neu = await api.auftrag();
      setA(neu);
      // Nur melden, wenn wir den Auftrag laufen gesehen haben (nicht bei alten Aufträgen nach dem Öffnen).
      if (neu && neu.status !== 'laeuft' && zuletzt.current === neu.id) { zuletzt.current = undefined; fertigRef.current(neu); }
      if (neu?.status === 'laeuft') zuletzt.current = neu.id;
    } catch { /* nächster Versuch */ }
  }, []);
  useEffect(() => { void abfragen(); }, [abfragen]);
  useEffect(() => {
    if (a?.status !== 'laeuft') return;
    const t = setTimeout(() => void abfragen(), 1000);
    return () => clearTimeout(t);
  }, [a, abfragen]);
  return { auftrag: a, setze: (x: Auftrag) => { zuletzt.current = x.id; setA(x); } };
}

export function DemoPanel() {
  const d = useDaten();
  const u = useUebersicht();
  const [anzahl, setAnzahl] = useState('1000');
  const [startwert, setStartwert] = useState('');
  const [mitDok, setMitDok] = useState(false);
  const [anteil, setAnteil] = useState(30);
  const [jeMappe, setJeMappe] = useState({ von: 1, bis: 3 });
  const [stufe, setStufe] = useState<DemoStufe | 'eigen'>('realistisch');
  const [mischung, setMischung] = useState<Record<Dokumentart, number>>(MISCHUNGEN.realistisch);
  const [duplikate, setDuplikate] = useState(0);
  const [schaetzung, setSchaetzung] = useState<DemoAbschaetzung | null>(null);
  const dok = mitDok ? { anteil, von: jeMappe.von, bis: jeMappe.bis, mischung, duplikate } : null;
  const optionen: DemoOptionen = { anzahl: Number(anzahl), startwert: startwert.trim() || undefined, dokumente: dok };
  const schluessel = JSON.stringify(optionen);
  const anzahlOk = Number.isInteger(Number(anzahl)) && Number(anzahl) >= 1 && Number(anzahl) <= MAX_DEMO;
  // Abschätzung live beim Schieben (#365): dieselbe Rechnung wie auf dem Server …
  const menge = anzahlOk ? schaetzeMenge(d.typen, { anzahl: Number(anzahl), dokumente: dok }) : null;
  const warnung = menge ? mengenWarnung(menge) : null;
  const zuViele = (menge?.dokumente?.dokumente ?? 0) > MAX_DEMO_DOKUMENTE;
  // … den freien Platz (und ob pdftoppm da ist) liefert der Server kurz nach der letzten Änderung.
  useEffect(() => {
    if (!anzahlOk || zuViele) return;
    const t = setTimeout(() => { api.demoAbschaetzung(JSON.parse(schluessel) as DemoOptionen).then(setSchaetzung, () => setSchaetzung(null)); }, 400);
    return () => clearTimeout(t);
  }, [schluessel, anzahlOk, zuViele]);
  const bytes = menge?.dokumente?.bytes ?? 0;
  const reicht = !schaetzung || schaetzung.frei === null || schaetzung.frei - bytes >= schaetzung.mindest;
  const [meldung, setMeldung] = useState<Meldung>();
  const { auftrag, setze } = useAuftrag((a) => { setMeldung(meldungAus(a)); void d.neuLaden(); });
  const laeuft = auftrag?.status === 'laeuft';
  const demo = u.reduce((s, t) => s + t.demo, 0);

  async function starte(fn: () => Promise<Auftrag>) {
    setMeldung(undefined);
    try { setze(await fn()); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }

  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Demo-Daten</h1>
        <p className="leise">Erzeugt Mappen für die vorhandenen Mappentypen – mit passenden Werten je Feld und Verweisen auf vorhandene Mappen, wahlweise mit Dokumenten. So lässt sich beobachten, wie sich das DMS mit vielen Mappen und Dokumenten verhält. Demo-Mappen sind gekennzeichnet und lassen sich gesammelt wieder entfernen.</p>
      </div>
      {meldung && <div className={`hinweis ${meldung.art} stapel`}><p>{meldung.text}</p>{meldung.liste && <ul>{meldung.liste.map((x) => <li key={x}>{x}</li>)}</ul>}</div>}
      {laeuft && auftrag && (
        <div className="hinweis info stapel" role="status">
          <p><strong>{auftrag.titel}</strong> … läuft im Hintergrund, du kannst die Seite auch verlassen.</p>
          {auftrag.gesamt > 0 && <>
            <progress max={auftrag.gesamt} value={auftrag.fertig} />
            <p className="klein leise">{fortschrittText(auftrag, 'Mappen')}</p>
          </>}
        </div>
      )}

      {/* Der Ablageort (#168) gehört zum Standard und zählt hier nicht als eigener Mappentyp. */}
      {!d.typen.some((t) => !t.system && t.schluessel !== 'ablageort') ? (
        <div className="blatt">
          <h2 className="h3">Beispiel-Mappentypen</h2>
          <p className="leise">Vertragspartner, Vertrag, Rechnung und Zahlung mit Registern und ein paar Mappen. Nur möglich, solange es außer dem Ablageort noch keine Mappentypen gibt. Verträge und Rechnungen bekommen dabei das Feld „Verbleib Originaldokumente“ und ein paar Ablageorte.</p>
          <div className="knoepfe"><button className="knopf primaer" disabled={laeuft} onClick={() => void (async () => {
            setMeldung(undefined);
            try { await api.beispiele(); setMeldung({ art: 'gut', text: 'Beispiele geladen.' }); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
            await d.neuLaden();
          })()}>Beispiele laden</button></div>
        </div>
      ) : (
        <form className="blatt" onSubmit={(e) => { e.preventDefault(); void starte(() => api.demoErzeugen(optionen)); }}>
          <h2 className="h3">Erzeugen</h2>
          <div className="raster">
            <label className="eigenschaft"><span>Anzahl <small>bis 50.000 je Lauf, wird auf die Mappentypen verteilt, Belege bekommen mehr als Stammdaten</small></span>
              <input id="demo-anzahl" type="number" min={1} max={50000} value={anzahl} onChange={(e) => setAnzahl(e.target.value)} /></label>
            <label className="eigenschaft"><span>Startwert <small>optional; gleicher Startwert ergibt gleiche Daten, damit Messungen vergleichbar sind</small></span>
              <input id="demo-startwert" value={startwert} maxLength={100} placeholder="z. B. messung-1" onChange={(e) => setStartwert(e.target.value)} /></label>
          </div>
          <label className="haken"><input id="demo-dokumente" type="checkbox" checked={mitDok} onChange={(e) => setMitDok(e.target.checked)} /><span>Dokumente erzeugen <small className="leise">(nur für Mappentypen mit Dokumentenregister)</small></span></label>
          {mitDok && <>
            <div className="raster">
              <Regler id="demo-anteil" name="Mappen mit Dokumenten" wert={anteil} min={0} max={100} anzeige={`${anteil} %`} onChange={setAnteil} />
              <Regler id="demo-von" name="Dokumente je Mappe von" wert={stufeVon(jeMappe.von)} min={0} max={JE_MAPPE_STUFEN.length - 1}
                anzeige={dokumente(jeMappe.von)} onChange={(i) => setJeMappe(stelleVonBis(jeMappe, 'von', JE_MAPPE_STUFEN[i]))} />
              <Regler id="demo-bis" name="bis" wert={stufeVon(jeMappe.bis)} min={0} max={JE_MAPPE_STUFEN.length - 1}
                anzeige={dokumente(jeMappe.bis)} onChange={(i) => setJeMappe(stelleVonBis(jeMappe, 'bis', JE_MAPPE_STUFEN[i]))} />
              <Regler id="demo-duplikate" name="Gewollte Duplikate" hinweis="gleiche Datei in mehreren Mappen" wert={duplikate} min={0} max={MAX_DUPLIKATE} anzeige={`${duplikate} %`} onChange={setDuplikate} />
            </div>
            <fieldset className="stapel mischung">
              <legend>Mischung <small className="leise">– zusammen immer 100 %</small></legend>
              <label className="eigenschaft schmal"><span>Vorlage</span>
                <select id="demo-stufe" value={stufe} onChange={(e) => { const v = e.target.value as DemoStufe | 'eigen'; setStufe(v); if (v !== 'eigen') setMischung(MISCHUNGEN[v]); }}>
                  {(['leicht', 'realistisch', 'schwer', 'eigen'] as const).map((x) => <option key={x} value={x}>{STUFENTEXT[x]}</option>)}
                </select></label>
              <div className="raster">
                {DOKUMENTARTEN.map((a) => (
                  <Regler key={a} id={`demo-mischung-${a}`} name={ARTNAME[a]} wert={mischung[a]} min={0} max={100} anzeige={`${mischung[a]} %`}
                    onChange={(n) => { setStufe('eigen'); setMischung(stelleMischung(mischung, a, n)); }} />
                ))}
              </div>
              <p className="leise klein">Bewegst du einen Regler, passen sich die anderen im bisherigen Verhältnis an. Summe: {DOKUMENTARTEN.reduce((x, a) => x + mischung[a], 0)} %</p>
            </fieldset>
            <p className="leise klein">Die Texterkennung vieler „gescannter“ PDFs und Bilder dauert auf einem NAS eher Tage als Stunden; sie läuft danach im Hintergrund. Sicherungen werden entsprechend größer.</p>
          </>}
          {menge && (
            <div className={`hinweis ${!reicht || zuViele ? 'schlecht' : warnung ? 'warn' : 'info'} stapel`} role="status" aria-live="polite">
              <p><strong>Abschätzung:</strong> ≈ {menge.mappen.toLocaleString('de-DE')} Mappen
                {menge.dokumente && <>, ≈ {dokumente(menge.dokumente.dokumente)} mit ≈ {menge.dokumente.seiten.toLocaleString('de-DE')} Seiten, zusammen ≈ {groesse(menge.dokumente.bytes)}; ≈ {menge.dokumente.ocrSeiten.toLocaleString('de-DE')} Seiten für die Texterkennung</>}.
                {schaetzung && schaetzung.frei !== null && <> Frei: {groesse(schaetzung.frei)}, frei bleiben müssen mindestens {groesse(schaetzung.mindest)}.</>}</p>
              {warnung && <p>{warnung}</p>}
              {!reicht && <p>Der Speicherplatz reicht dafür nicht. Weniger Mappen, weniger Dokumente oder eine leichtere Mischung wählen.</p>}
              {mitDok && schaetzung && !schaetzung.rastern && <p className="klein">Ohne pdftoppm (nur in der Entwicklung) werden Scans und Bilder als einfache PDFs erzeugt.</p>}
            </div>
          )}
          <div className="knoepfe"><button className="knopf primaer" disabled={laeuft || !anzahlOk || zuViele || !reicht}>Demo-Daten erzeugen</button></div>
        </form>
      )}

      <div className="blatt">
        <h2 className="h3">Entfernen</h2>
        <p className="leise">Löscht alle {demo.toLocaleString('de-DE')} Demo-Mappen samt ihrer Dokumente, in Paketen zu je 1.000. Echte Mappen bleiben unberührt; verweist eine echte Mappe auf eine Demo-Mappe, wird nichts gelöscht.</p>
        <div className="knoepfe"><button className="knopf gefahr-rand" disabled={!demo || laeuft} onClick={async () => {
          if (await rueckfrage({ titel: `Alle ${demo.toLocaleString('de-DE')} Demo-Mappen löschen?`, text: 'Echte Mappen bleiben unberührt.', ja: 'Demo-Mappen löschen', gefahr: true })) void starte(() => api.demoEntfernen());
        }}>Alle Demo-Mappen entfernen</button></div>
      </div>
    </div>
  );
}
