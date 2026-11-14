import { useCallback, useEffect, useRef, useState } from 'react';
import type { Auftrag } from '../../../shared/src/auftrag';
import { DOKUMENTARTEN, type Dokumentart } from '../../../shared/src/demodaten';
import { betriebApi } from '../api/betrieb';
import { einrichtungApi, type DemoAbschaetzung, type DemoErgebnis, type DemoOptionen, type DemoStufe } from '../api/einrichtung';
import { useDaten } from '../daten';
import { fortschrittText } from '../../../shared/src/auftrag';
import { t, tn } from '../sprache';
import { JE_MAPPE_STUFEN, MAX_DEMO, MAX_DEMO_DOKUMENTE, MAX_DUPLIKATE, mengenWarnung, MISCHUNGEN, schaetzeMenge, stelleMischung, stelleVonBis, stufeVon } from '../../../shared/src/demodaten';
import { gebietsschema } from '../../../shared/src/sprache';
import { Feld, HakenFeld, Knopf } from '../bausteine';
import { Kopf } from './Kopf';

type Uebersicht = Array<{ typId: string; name: string; demo: number; gesamt: number }>;

function useUebersicht() {
  const d = useDaten();
  const [u, setU] = useState<Uebersicht>([]);
  const laden = useCallback(async () => { try { setU(await einrichtungApi.demoUebersicht()); } catch { /* Anzeige bleibt leer */ } }, []);
  useEffect(() => { void laden(); }, [laden, d.stand]);
  return u;
}

type Meldung = { art: 'gut' | 'warn' | 'schlecht'; text: string; liste?: string[] };

const ARTNAME: Record<Dokumentart, string> = { brief: t('werkbank.demo.brief-rechnung-1-seite'), mehrseitig: t('werkbank.demo.mehrseitiges-pdf'), scan: t('werkbank.demo.gescanntes-pdf'), bild: t('werkbank.demo.bild-jpeg-png'), gross: t('werkbank.demo.grosse-datei-20-100') };
const STUFENTEXT: Record<DemoStufe | 'eigen', string> = { leicht: 'leicht', realistisch: 'realistisch', schwer: 'schwer', eigen: t('werkbank.demo.eigene-mischung') };

/** Schieberegler mit Wertanzeige (#365): nativ, also mit Pfeiltasten und Bild auf/ab bedienbar. */
function Regler({ id, name, hinweis, wert, min, max, anzeige, onChange }: {
  id: string; name: string; hinweis?: string; wert: number; min: number; max: number; anzeige: string; onChange: (n: number) => void;
}) {
  return (
    <Feld beschriftung={name} hinweis={hinweis} className="regler" kopfZusatz={<output htmlFor={id} aria-hidden="true">{anzeige}</output>}>
      <input id={id} type="range" min={min} max={max} step={1} value={wert} aria-valuetext={anzeige} onChange={(e) => onChange(Number(e.target.value))} />
    </Feld>
  );
}
const dokumente = (n: number) => t('werkbank.demo.dokumente', { anzahl: n, n: n.toLocaleString(gebietsschema()) });

const groesse = (b: number) => b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : `${Math.max(1, Math.round(b / 1024 ** 2)).toLocaleString(gebietsschema())} MB`;
const dauer = (ms: number) => ms < 60_000 ? `${Math.round(ms / 1000)} s` : ms < 3_600_000 ? `${Math.round(ms / 60_000)} min` : `${(ms / 3_600_000).toFixed(1).replace('.', ',')} h`;

/** Meldung zum Ergebnis eines beendeten Auftrags. */
function meldungAus(a: Auftrag): Meldung {
  if (a.status === 'fehler') return { art: 'schlecht', text: `${a.titel}: ${a.fehler ?? t('werkbank.demo.fehler')}` };
  if (a.art === 'demo-entfernen') return { art: 'gut', text: t('werkbank.demo.demo-mappen-entfernt', { entfernt: (a.ergebnis as { entfernt: number }).entfernt.toLocaleString(gebietsschema()) }) };
  const r = a.ergebnis as DemoErgebnis;
  const d = r.dokumente;
  return {
    art: r.uebersprungen.length || r.abgebrochen ? 'warn' : 'gut',
    text: t('werkbank.demo.demo-mappen-erzeugt', { gesamt: r.gesamt.toLocaleString(gebietsschema()), wert: d ? t('werkbank.demo.und-dokumente', { zahl: d.anzahl.toLocaleString(gebietsschema()), groesse: groesse(d.bytes) }) : '', wert2: r.dauerMs ? t('werkbank.demo.in', { dauer: dauer(r.dauerMs) }) : '', wert3: r.startwert ? t('werkbank.demo.startwert', { startwert: r.startwert }) : '' }),
    liste: [
      ...Object.entries(r.erzeugt).map(([k, v]) => `${k}: ${v.toLocaleString(gebietsschema())}`),
      ...(d ? [
        t('werkbank.demo.dokumente-2', { map: DOKUMENTARTEN.filter((x) => d.jeArt[x]).map((x) => `${ARTNAME[x]} ${d.jeArt[x].toLocaleString(gebietsschema())}`).join(', '), wert: d.duplikate ? t('werkbank.demo.duplikate', { duplikate: d.duplikate.toLocaleString(gebietsschema()) }) : '' }),
        t('werkbank.demo.seiten-dokumente-in-der', { seiten: d.seiten.toLocaleString(gebietsschema()), texterkennung: d.texterkennung.toLocaleString(gebietsschema()), dauer: dauer(d.dauerMs) }),
      ] : []),
      ...(r.ohneRastern ? [t('werkbank.demo.ohne-pdftoppm-scans-und')] : []),
      ...(r.abgebrochen ? [t('werkbank.demo.vorzeitig-beendet', { abgebrochen: r.abgebrochen })] : []),
      ...r.uebersprungen.map((x) => t('werkbank.demo.unvollstaendig', { typ: x.typ, grund: x.grund })),
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
      const neu = await betriebApi.auftrag();
      setA(neu);
      // Nur melden, wenn wir den Auftrag laufen gesehen haben (nicht bei alten Aufträgen nach dem Öffnen).
      if (neu && neu.status !== 'laeuft' && zuletzt.current === neu.id) { zuletzt.current = undefined; fertigRef.current(neu); }
      if (neu?.status === 'laeuft') zuletzt.current = neu.id;
    } catch { /* nächster Versuch */ }
  }, []);
  useEffect(() => { void abfragen(); }, [abfragen]);
  useEffect(() => {
    if (a?.status !== 'laeuft') return;
    const timer = setTimeout(() => void abfragen(), 1000);
    return () => clearTimeout(timer);
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
    const timer = setTimeout(() => { einrichtungApi.demoAbschaetzung(JSON.parse(schluessel) as DemoOptionen).then(setSchaetzung, () => setSchaetzung(null)); }, 400);
    return () => clearTimeout(timer);
  }, [schluessel, anzahlOk, zuViele]);
  const bytes = menge?.dokumente?.bytes ?? 0;
  // Mappentypen, die sich nicht erzeugen lassen (#711) – kommt vom Server mit der Abschätzung.
  const fehlen = (schaetzung?.nichtErzeugbar ?? []).reduce((n, x) => n + x.anzahl, 0);
  const reicht = !schaetzung || schaetzung.frei === null || schaetzung.frei - bytes >= schaetzung.mindest;
  const [meldung, setMeldung] = useState<Meldung>();
  const { auftrag, setze } = useAuftrag((a) => { setMeldung(meldungAus(a)); void d.neuLaden(); });
  const laeuft = auftrag?.status === 'laeuft';
  const demo = u.reduce((s, eintrag) => s + eintrag.demo, 0);

  async function starte(fn: () => Promise<Auftrag>) {
    setMeldung(undefined);
    try { setze(await fn()); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }

  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.demo.demo-daten')} ueber={t('werkbank.demo.werkbank')} hilfe="werkbank.demo">
        <p className="leise">{t('werkbank.demo.erzeugt-mappen-fuer-die')}</p>
      </Kopf>
      {meldung && <div className={`hinweis ${meldung.art} stapel`}><p>{meldung.text}</p>{meldung.liste && <ul>{meldung.liste.map((x) => <li key={x}>{x}</li>)}</ul>}</div>}
      {laeuft && auftrag && (
        <div className="hinweis info stapel" role="status">
          <p>{tn('werkbank.demo.laeuft-im-hintergrund-du', { b: <strong>{auftrag.titel}</strong> })}</p>
          {auftrag.gesamt > 0 && <>
            <progress max={auftrag.gesamt} value={auftrag.fertig} />
            <p className="klein leise">{fortschrittText(auftrag, t('werkbank.demo.mappen'))}</p>
            {/* Weniger als bestellt (#711): Gründe je Mappentyp, sobald der Schritt Mappen fertig ist. */}
            {auftrag.phasen.some((p) => p.gruende?.length) && (
              <details className="klein"><summary>{t('werkbank.demo.warum')}</summary>
                <ul>{auftrag.phasen.flatMap((p) => p.gruende ?? []).map((g) => <li key={g}>{g}</li>)}</ul>
                <p className="leise">{t('werkbank.demo.tipp')}</p>
              </details>
            )}
          </>}
        </div>
      )}

      {/* Ein früherer Ablageort des Kerns (#168, #883) zählt hier nicht als eigener Mappentyp. */}
      {!d.typen.some((mappentyp) => !mappentyp.system && mappentyp.schluessel !== 'ablageort' && mappentyp.schluessel !== 'basis:ablageort') ? (
        <div className="blatt">
          <h2 className="h3">{t('werkbank.demo.beispiel-mappentypen')}</h2>
          <p className="leise">{t('werkbank.demo.vertragspartner-vertrag-rechnung-und')}</p>
          <div className="knoepfe"><Knopf art="haupt" gesperrt={laeuft} onClick={async () => {
            setMeldung(undefined);
            try { await einrichtungApi.beispiele(); setMeldung({ art: 'gut', text: t('werkbank.demo.beispiele-geladen') }); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
            await d.neuLaden();
          }}>{t('werkbank.demo.beispiele-laden')}</Knopf></div>
        </div>
      ) : (
        <form className="blatt" onSubmit={(e) => { e.preventDefault(); void starte(() => einrichtungApi.demoErzeugen(optionen)); }}>
          <h2 className="h3">{t('werkbank.demo.erzeugen')}</h2>
          <div className="raster">
            <Feld beschriftung={t('werkbank.demo.anzahl')} hinweis={t('werkbank.demo.bis-50-000-je')}>
              <input id="demo-anzahl" type="number" min={1} max={50000} value={anzahl} onChange={(e) => setAnzahl(e.target.value)} />
            </Feld>
            <Feld beschriftung={t('werkbank.demo.startwert-2')} optional hinweis={t('werkbank.demo.optional-gleicher-startwert-ergibt')}>
              <input id="demo-startwert" value={startwert} maxLength={100} placeholder={t('werkbank.demo.z-b-messung-1')} onChange={(e) => setStartwert(e.target.value)} />
            </Feld>
          </div>
          <HakenFeld beschriftung={t('werkbank.demo.dokumente-erzeugen')} hinweis={t('werkbank.demo.nur-fuer-mappentypen-mit')}>
            <input id="demo-dokumente" type="checkbox" checked={mitDok} onChange={(e) => setMitDok(e.target.checked)} />
          </HakenFeld>
          {mitDok && <>
            <div className="raster">
              <Regler id="demo-anteil" name={t('werkbank.demo.mappen-mit-dokumenten')} wert={anteil} min={0} max={100} anzeige={`${anteil} %`} onChange={setAnteil} />
              <Regler id="demo-von" name={t('werkbank.demo.dokumente-je-mappe-von')} wert={stufeVon(jeMappe.von)} min={0} max={JE_MAPPE_STUFEN.length - 1}
                anzeige={dokumente(jeMappe.von)} onChange={(i) => setJeMappe(stelleVonBis(jeMappe, 'von', JE_MAPPE_STUFEN[i]))} />
              <Regler id="demo-bis" name="bis" wert={stufeVon(jeMappe.bis)} min={0} max={JE_MAPPE_STUFEN.length - 1}
                anzeige={dokumente(jeMappe.bis)} onChange={(i) => setJeMappe(stelleVonBis(jeMappe, 'bis', JE_MAPPE_STUFEN[i]))} />
              <Regler id="demo-duplikate" name={t('werkbank.demo.gewollte-duplikate')} hinweis={t('werkbank.demo.gleiche-datei-in-mehreren')} wert={duplikate} min={0} max={MAX_DUPLIKATE} anzeige={`${duplikate} %`} onChange={setDuplikate} />
            </div>
            <fieldset className="stapel mischung">
              <legend>{t('werkbank.demo.mischung')} <small className="leise">{t('werkbank.demo.zusammen-immer-100')}</small></legend>
              <Feld beschriftung={t('werkbank.demo.vorlage')} className="schmal">
                <select id="demo-stufe" value={stufe} onChange={(e) => { const v = e.target.value as DemoStufe | 'eigen'; setStufe(v); if (v !== 'eigen') setMischung(MISCHUNGEN[v]); }}>
                  {(['leicht', 'realistisch', 'schwer', 'eigen'] as const).map((x) => <option key={x} value={x}>{STUFENTEXT[x]}</option>)}
                </select>
              </Feld>
              <div className="raster">
                {DOKUMENTARTEN.map((a) => (
                  <Regler key={a} id={`demo-mischung-${a}`} name={ARTNAME[a]} wert={mischung[a]} min={0} max={100} anzeige={`${mischung[a]} %`}
                    onChange={(n) => { setStufe('eigen'); setMischung(stelleMischung(mischung, a, n)); }} />
                ))}
              </div>
              <p className="leise klein">{t('werkbank.demo.bewegst-du-einen-regler')}{' '}{DOKUMENTARTEN.reduce((x, a) => x + mischung[a], 0)} %</p>
            </fieldset>
            <p className="leise klein">{t('werkbank.demo.die-texterkennung-vieler-gescannter')}</p>
          </>}
          {menge && (
            <div className={`hinweis ${!reicht || zuViele ? 'schlecht' : warnung ? 'warn' : 'info'} stapel`} role="status" aria-live="polite">
              <p>{tn('werkbank.demo.mappen-2', { b: <strong>{t('werkbank.demo.abschaetzung')}</strong>, wert: (menge.mappen - fehlen).toLocaleString(gebietsschema()) })}{fehlen > 0 && <> ({t('werkbank.demo.nichtErzeugbar', { anzahl: fehlen.toLocaleString(gebietsschema()) })})</>}
                {menge.dokumente && <>{t('werkbank.demo.mit-seiten-zusammen-seiten', { dokumente: dokumente(menge.dokumente.dokumente), seiten: menge.dokumente.seiten.toLocaleString(gebietsschema()), groesse: groesse(menge.dokumente.bytes), ocrSeiten: menge.dokumente.ocrSeiten.toLocaleString(gebietsschema()) })}</>}.
                {schaetzung && schaetzung.frei !== null && <> {' '}{t('werkbank.demo.frei-frei-bleiben-muessen', { groesse: groesse(schaetzung.frei), groesse2: groesse(schaetzung.mindest) })}</>}</p>
              {warnung && <p>{warnung}</p>}
              {!reicht && <p>{t('werkbank.demo.der-speicherplatz-reicht-dafuer')}</p>}
              {!!schaetzung?.nichtErzeugbar?.length && <ul className="klein">{schaetzung.nichtErzeugbar.map((x) => <li key={x.typ}>{x.typ}: {x.anzahl.toLocaleString(gebietsschema())} – {x.grund}</li>)}</ul>}
              {mitDok && schaetzung && !schaetzung.rastern && <p className="klein">{t('werkbank.demo.ohne-pdftoppm-nur-in')}</p>}
            </div>
          )}
          <div className="knoepfe"><Knopf art="haupt" type="submit" gesperrt={laeuft || !anzahlOk || zuViele || !reicht}>{t('werkbank.demo.demo-daten-erzeugen')}</Knopf></div>
        </form>
      )}

      <div className="blatt">
        <h2 className="h3">{t('werkbank.demo.entfernen')}</h2>
        <p className="leise">{t('werkbank.demo.loescht-alle-demo-mappen', { demo: demo.toLocaleString(gebietsschema()) })}</p>
        <div className="knoepfe"><Knopf art="gefahr" symbol="geloescht" gesperrt={!demo || laeuft} onClick={() => { void starte(() => einrichtungApi.demoEntfernen()); }}
          rueckfrage={{ titel: t('werkbank.demo.alle-demo-mappen-loeschen', { demo: demo.toLocaleString(gebietsschema()) }), text: t('werkbank.demo.echte-mappen-bleiben-unberuehrt'), ja: t('werkbank.demo.demo-mappen-loeschen') }}>{t('werkbank.demo.alle-demo-mappen-entfernen')}</Knopf></div>
        <DemoTabelle u={u} />
      </div>
    </div>
  );
}

/** Mappen je Mappentyp, davon Demo (#366: früher die mittlere Spalte). */
function DemoTabelle({ u }: { u: Uebersicht }) {
  if (!u.length) return <p className="leise klein">{t('werkbank.demo.noch-keine-mappentypen')}</p>;
  const z = (n: number) => n.toLocaleString(gebietsschema());
  return (
    // Rollt die Tabelle (feste Höhe), braucht sie den Tastaturfokus (axe scrollable-region-focusable).
    <div className="tabellenrahmen festhoehe" tabIndex={0} role="region" aria-label={t('werkbank.demo.tabelle')}>
      <table className="tabelle">
        <thead><tr><th>{t('werkbank.demo.mappentyp')}</th><th className="zahlzelle">{t('werkbank.demo.mappen')}</th><th className="zahlzelle">{t('werkbank.demo.davon-demo')}</th></tr></thead>
        <tbody>{u.map((eintrag) => <tr key={eintrag.typId}><td>{eintrag.name}</td><td className="zahlzelle">{z(eintrag.gesamt)}</td><td className="zahlzelle">{eintrag.demo ? z(eintrag.demo) : '–'}</td></tr>)}</tbody>
        <tfoot><tr><th>{t('werkbank.demo.summe')}</th><th className="zahlzelle">{z(u.reduce((s, eintrag) => s + eintrag.gesamt, 0))}</th><th className="zahlzelle">{z(u.reduce((s, eintrag) => s + eintrag.demo, 0))}</th></tr></tfoot>
      </table>
    </div>
  );
}
