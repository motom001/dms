import { useCallback, useEffect, useRef, useState } from 'react';
import { api, DOKUMENTARTEN, type Auftrag, type DemoAbschaetzung, type DemoErgebnis, type DemoOptionen, type DemoStufe, type Dokumentart } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';

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
const MISCHUNGEN: Record<DemoStufe, Record<Dokumentart, number>> = {
  leicht: { brief: 70, mehrseitig: 25, scan: 5, bild: 0, gross: 0 },
  realistisch: { brief: 45, mehrseitig: 20, scan: 20, bild: 14, gross: 1 },
  schwer: { brief: 20, mehrseitig: 25, scan: 30, bild: 20, gross: 5 },
};
const STUFENTEXT: Record<DemoStufe | 'eigen', string> = { leicht: 'leicht', realistisch: 'realistisch', schwer: 'schwer', eigen: 'eigene Mischung' };

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
  const [anteil, setAnteil] = useState('30');
  const [von, setVon] = useState('1');
  const [bis, setBis] = useState('3');
  const [stufe, setStufe] = useState<DemoStufe | 'eigen'>('realistisch');
  const [mischung, setMischung] = useState<Record<Dokumentart, number>>(MISCHUNGEN.realistisch);
  const [duplikate, setDuplikate] = useState('0');
  const [schaetzung, setSchaetzung] = useState<DemoAbschaetzung | null>(null);
  const optionen: DemoOptionen = {
    anzahl: Number(anzahl), startwert: startwert.trim() || undefined,
    dokumente: mitDok ? { anteil: Number(anteil), von: Number(von), bis: Number(bis), mischung, duplikate: Number(duplikate) } : null,
  };
  const schluessel = JSON.stringify(optionen);
  // Abschätzung vor dem Start: kurz nach der letzten Änderung neu berechnen.
  useEffect(() => {
    const t = setTimeout(() => { api.demoAbschaetzung(JSON.parse(schluessel) as DemoOptionen).then(setSchaetzung, () => setSchaetzung(null)); }, 400);
    return () => clearTimeout(t);
  }, [schluessel]);
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
            <p className="klein leise">{auftrag.fertig.toLocaleString('de-DE')} von {auftrag.gesamt.toLocaleString('de-DE')}</p>
          </>}
        </div>
      )}

      {!d.typen.length ? (
        <div className="blatt">
          <h2 className="h3">Beispiel-Mappentypen</h2>
          <p className="leise">Vertragspartner, Vertrag, Rechnung und Zahlung mit Registern und ein paar Mappen. Nur möglich, solange es noch keine Mappentypen gibt.</p>
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
              <label className="eigenschaft"><span>Mappen mit Dokumenten <small>in Prozent</small></span>
                <input id="demo-anteil" type="number" min={0} max={100} value={anteil} onChange={(e) => setAnteil(e.target.value)} /></label>
              <label className="eigenschaft"><span>Dokumente je Mappe von</span>
                <input id="demo-von" type="number" min={1} max={20} value={von} onChange={(e) => setVon(e.target.value)} /></label>
              <label className="eigenschaft"><span>bis</span>
                <input id="demo-bis" type="number" min={1} max={20} value={bis} onChange={(e) => setBis(e.target.value)} /></label>
              <label className="eigenschaft"><span>Mischung</span>
                <select id="demo-stufe" value={stufe} onChange={(e) => { const v = e.target.value as DemoStufe | 'eigen'; setStufe(v); if (v !== 'eigen') setMischung(MISCHUNGEN[v]); }}>
                  {(['leicht', 'realistisch', 'schwer', 'eigen'] as const).map((x) => <option key={x} value={x}>{STUFENTEXT[x]}</option>)}
                </select></label>
              <label className="eigenschaft"><span>Gewollte Duplikate <small>in Prozent; gleiche Datei in mehreren Mappen</small></span>
                <input id="demo-duplikate" type="number" min={0} max={50} value={duplikate} onChange={(e) => setDuplikate(e.target.value)} /></label>
            </div>
            <div className="raster">
              {DOKUMENTARTEN.map((a) => (
                <label key={a} className="eigenschaft"><span>{ARTNAME[a]} <small>Anteil in %</small></span>
                  <input id={`demo-mischung-${a}`} type="number" min={0} max={100} value={mischung[a]} onChange={(e) => { setStufe('eigen'); setMischung({ ...mischung, [a]: Number(e.target.value) }); }} /></label>
              ))}
            </div>
            <p className="leise klein">Die Texterkennung vieler „gescannter“ PDFs und Bilder dauert auf einem NAS eher Tage als Stunden; sie läuft danach im Hintergrund. Sicherungen werden entsprechend größer.</p>
          </>}
          {schaetzung && (
            <div className={`hinweis ${schaetzung.reicht ? 'info' : 'schlecht'} stapel`}>
              <p><strong>Abschätzung:</strong> etwa {schaetzung.mappen.toLocaleString('de-DE')} Mappen
                {schaetzung.dokumente && <>, {schaetzung.dokumente.dokumente.toLocaleString('de-DE')} Dokumente mit {schaetzung.dokumente.seiten.toLocaleString('de-DE')} Seiten, zusammen etwa {groesse(schaetzung.dokumente.bytes)}; {schaetzung.dokumente.ocrSeiten.toLocaleString('de-DE')} Seiten für die Texterkennung</>}.
                {schaetzung.frei !== null && <> Frei: {groesse(schaetzung.frei)}, frei bleiben müssen mindestens {groesse(schaetzung.mindest)}.</>}</p>
              {!schaetzung.reicht && <p>Der Speicherplatz reicht dafür nicht. Weniger Mappen, weniger Dokumente oder eine leichtere Mischung wählen.</p>}
              {mitDok && !schaetzung.rastern && <p className="klein">Ohne pdftoppm (nur in der Entwicklung) werden Scans und Bilder als einfache PDFs erzeugt.</p>}
            </div>
          )}
          <div className="knoepfe"><button className="knopf primaer" disabled={laeuft || (schaetzung ? !schaetzung.reicht : false)}>Demo-Daten erzeugen</button></div>
        </form>
      )}

      <div className="blatt">
        <h2 className="h3">Entfernen</h2>
        <p className="leise">Löscht alle {demo.toLocaleString('de-DE')} Demo-Mappen samt ihrer Dokumente, in Paketen zu je 1.000. Echte Mappen bleiben unberührt; verweist eine echte Mappe auf eine Demo-Mappe, wird nichts gelöscht.</p>
        <div className="knoepfe"><button className="knopf gefahr-rand" disabled={!demo || laeuft} onClick={() => {
          if (confirm(`Alle ${demo} Demo-Mappen löschen?`)) void starte(() => api.demoEntfernen());
        }}>Alle Demo-Mappen entfernen</button></div>
      </div>
    </div>
  );
}
