import { useCallback, useEffect, useRef, useState } from 'react';
import { fuelleErgebnis, GERAET_MAX, PLATZHALTER, restMinuten, type LasttestLiveStand, type LasttestStand, type Speicherwahl } from '../../shared/src/lasttest';
import type { Messpunkt } from '../../shared/src/systemlast';
import { handbuchUrl } from '../../shared/src/hilfe';
import { einrichtungApi } from './api/einrichtung';
import { Feld, Knopf } from './bausteine';
import { t } from './sprache';
import { Symbol } from './Symbol';
import { gebietsschema } from '../../shared/src/sprache';
import { CpuKachel, SpeicherKachel } from './werkbank/Auslastung';
import { platz } from './werkbank/Speicherplatz';

/**
 * Lasttest-Modus (#612): die einzige Seite, die ein mit DMS_LASTTEST gestartetes DMS zeigt. Fortschritt und Restdauer,
 * Gerät und Speicher (gehen sofort in den Ergebnisblock), am Ende Bericht und Block zum Kopieren oder Herunterladen,
 * Links zum Formular und zum Sammel-Issue und der Knopf zum Herunterfahren. Keine Zugangsdaten, keine Adressen.
 */

const FORMULAR = 'https://github.com/motom001/dms/issues/new?template=messergebnis-lasttest.yml';
const SAMMEL = 'https://github.com/motom001/dms/issues/576';
const zahl = (n: number) => n.toLocaleString(gebietsschema());
/** `<Dauer>` im Text einer Meldung (#909): höchste und mittlere Dauer, bei gleichen nur eine. */
const mitDauer = (text: string, d?: { max: number; mittel: number }) => (!text.includes('<Dauer>') ? text
  : text.replace('<Dauer>', !d ? t('lasttest.live.dauer.ohne') : d.max === d.mittel ? t('lasttest.live.dauer.eine', { ms: zahl(d.max) }) : t('lasttest.live.dauer', { max: zahl(d.max), mittel: zahl(d.mittel) })));
const prozent = (q: number) => `${(q * 100).toFixed(2).replace('.', ',')} %`;

/** Kopieren auch ohne HTTPS (NAS im Heimnetz): Zwischenablage, sonst markieren und execCommand. */
async function kopiere(text: string, feld: HTMLTextAreaElement | null): Promise<boolean> {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch { /* weiter */ }
  if (!feld) return false;
  feld.focus(); feld.select();
  try { return document.execCommand('copy'); } catch { return false; }
}

function herunterladen(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const MB = 1024 ** 2;
const uhr = (iso: string) => new Date(iso).toLocaleTimeString(gebietsschema(), { timeStyle: 'medium' });

/** Durchgang mit Gleichzeitigkeit; vor den Durchgängen (#1117) „–“ mit dem laufenden Schritt. */
const durchgangText = (j: LasttestLiveStand['jetzt'], schritt: LasttestStand['schritt']) => (j.name === null
  ? t('lasttest.live.durchgang.keiner', { schritt: t.frei(`lasttest.schritt.${schritt}`) })
  : t('lasttest.live.durchgang.wert', { name: j.name, n: zahl(j.n ?? 0) }));

/**
 * Live während des Laufs (#895): CPU und Arbeitsspeicher wie Werkbank → Systemzustand → Auslastung (dieselben Kacheln),
 * dazu Durchgang, Gleichzeitigkeit, p95 der letzten Sekunden, Warteschlange an der Datenbank, CPU je Gruppe und die
 * neuesten Warnungen und Fehler. Alles aus der Messung, die der Test ohnehin alle 2 Sekunden macht – seit #1117 schon
 * ab dem Einrichten; vor den Durchgängen steht statt des Durchgangs der Schritt, p95 bleibt „–“.
 */
function Live({ l, stufe, schritt }: { l: LasttestLiveStand; stufe: LasttestStand['stufe']; schritt: LasttestStand['schritt'] }) {
  const j = l.jetzt;
  const vorDemDurchgang = j.name === null;
  const verlauf: Messpunkt[] = l.verlauf.map((p) => ({ zeit: p.zeit, cpu: p.cpu, speicher: p.speicher, rx: null, tx: null }));
  const nv = t('systemzustand.auslastung.nicht-verfuegbar');
  const gruppe = (g: NonNullable<typeof j.gruppen>[number]) => (g.art !== 'ablago' ? t.frei(`lasttest.gruppe.${g.art}`)
    : g.nr === 0 ? t('lasttest.gruppe.haupt') : g.rolle === 'leiter' ? t('lasttest.gruppe.leiter', { nr: g.nr ?? 1 }) : t('lasttest.gruppe.prozess', { nr: g.nr ?? 0 }));
  return (
    <section className="lasttest-live" aria-labelledby="lasttest-live">
      <h2 id="lasttest-live">{t('lasttest.live.titel')}</h2>
      <p className="klein leise">{t(vorDemDurchgang ? 'lasttest.live.text.vorbereitung' : 'lasttest.live.text', { zeit: uhr(j.zeit) })}</p>
      <div className="az-raster">
        <CpuKachel jetzt={j.cpu} verlauf={verlauf} art="live">
          <p className="leise klein">{j.kerne === null ? nv : j.kerneBegrenzt ? t('systemzustand.cpu.kerne', { anzahl: j.kerne }) : t('systemzustand.cpu.kerne.ohne', { anzahl: j.kerne })}</p>
        </CpuKachel>
        <SpeicherKachel jetzt={j.speicher} verlauf={verlauf} art="live">
          <p className="leise klein">{j.speicherMb === null || j.grenzeMb === null ? nv
            : j.ohneGrenze ? t('systemzustand.speicher.ohne-grenze', { belegt: platz(j.speicherMb * MB), grenze: platz(j.grenzeMb * MB) })
              : t('systemzustand.speicher.belegt', { belegt: platz(j.speicherMb * MB), grenze: platz(j.grenzeMb * MB) })}</p>
        </SpeicherKachel>
        <div className="az-wert">
          <h3 className="az-titel">{t('lasttest.live.messung')}</h3>
          <dl className="eigenschaften klein">
            {stufe && <><dt>{t('lasttest.live.stufe')}</dt><dd>{t.frei(`lasttest.stufe.${stufe}`)}</dd></>}
            <dt>{t('lasttest.live.durchgang')}</dt><dd>{durchgangText(j, schritt)}</dd>
            <dt>{t('lasttest.live.p95')}</dt><dd>{j.p95 === null ? '–' : t('lasttest.live.p95.wert', { ms: zahl(j.p95), anfragen: zahl(j.anfragen) })}</dd>
            <dt>{t('lasttest.live.warteschlange')}</dt><dd>{j.warteschlange === null ? nv : t('lasttest.live.warteschlange.wert', { wartend: zahl(j.warteschlange), belegt: zahl(j.belegt ?? 0), von: zahl(j.verbindungen ?? 0) })}</dd>
          </dl>
        </div>
      </div>
      <h3 className="az-titel">{t('lasttest.live.gruppen')}</h3>
      {!j.gruppen ? <p className="klein leise">{t('lasttest.live.gruppen.nicht')}</p> : (
        <div className="tabellenrahmen">
          <table className="tabelle klein">
            <thead><tr><th>{t('lasttest.live.gruppe')}</th><th>{t('lasttest.live.prozesse')}</th><th>{t('lasttest.live.cpu')}</th><th>{t('lasttest.live.speicher')}</th></tr></thead>
            <tbody>
              {j.gruppen.map((g) => (
                <tr key={`${g.art}-${g.nr ?? ''}`}>
                  <td>{gruppe(g)}</td><td>{zahl(g.anzahl)}</td><td>{g.cpu === null ? '–' : `${zahl(g.cpu)} %`}</td><td>{platz(g.mb * MB)}</td>
                </tr>
              ))}
              {j.postgresExtern && !j.gruppen.some((g) => g.art === 'postgres') && <tr><td>{t('lasttest.gruppe.postgres')}</td><td colSpan={3} className="leise">{t('lasttest.live.postgres-extern')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="klein leise">{t('lasttest.live.gruppen.text')}</p>
      <h3 className="az-titel">{t('lasttest.live.meldungen')}</h3>
      {!j.meldungen.length ? <p className="klein leise">{t('lasttest.live.meldungen.keine')}</p> : (
        <ul className="klein lasttest-meldungen">
          {j.meldungen.map((m, i) => (
            <li key={i}>
              <span className={`lasttest-art ${m.stufe === 'warn' ? 'warn' : 'fehler'}`}>{t.frei(`lasttest.live.art.${m.stufe}`)}</span>{' '}
              {t('lasttest.live.meldung', { anzahl: zahl(m.anzahl), modul: m.modul, text: mitDauer(m.text, m.dauer), zeit: uhr(m.letzte) })}{m.ausnahme ? ` (${m.ausnahme})` : ''}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** #1117: welcher Container misst – im Kopf, von Anfang an und auch nach „Beenden“. */
function Version({ wert }: { wert?: string }) {
  return wert ? <p className="klein leise">{t('lasttest.version', { version: wert })}</p> : null;
}

export function LasttestSeite() {
  const [stand, setStand] = useState<LasttestStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [geraet, setGeraet] = useState<string | null>(null);
  const [speicher, setSpeicher] = useState<Speicherwahl | null | undefined>(undefined);
  const [kopiert, setKopiert] = useState<'ja' | 'nein' | null>(null);
  const [beendet, setBeendet] = useState(false);
  /** Heruntergeladen (#697): gilt wie kopiert – dann sagt die Rückfrage beim Herunterfahren nichts vom Ergebnis. */
  const [gesichert, setGesichert] = useState(false);
  const feld = useRef<HTMLTextAreaElement>(null);
  const senden = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Wann der Stand kam (Uhr des Browsers): Die Restdauer rechnet mit der Uhr des Servers weiter. */
  const geholt = useRef(0);

  const hole = useCallback(async () => {
    try { const s = await einrichtungApi.lasttest(); geholt.current = Date.now(); setStand(s); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { void hole(); }, [hole]);
  const laeuft = !beendet && (!stand || stand.zustand === 'laeuft');
  useEffect(() => {
    if (!laeuft) return;
    const z = setInterval(() => void hole(), 2000);
    return () => clearInterval(z);
  }, [laeuft, hole]);
  // Sekunden des Durchgangs mitzählen, ohne den Server öfter zu fragen.
  const [, setTick] = useState(0);
  useEffect(() => { const z = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(z); }, []);

  if (!stand) {
    return <div className="kartenseite"><div className="karte breit"><h1>{t('lasttest.titel')}</h1>{fehler ? <div className="hinweis schlecht"><p>{fehler}</p></div> : <p className="leise">{t('anmeldung.lade')}</p>}</div></div>;
  }

  // Eingaben gehen sofort in den Block; der Server bekommt sie kurz danach (für die Datei unter /data/ergebnis).
  const angaben = { geraet: geraet ?? stand.angaben.geraet, speicher: speicher === undefined ? stand.angaben.speicher : speicher };
  const merke = (a: Partial<LasttestStand['angaben']>) => {
    clearTimeout(senden.current);
    senden.current = setTimeout(() => { void einrichtungApi.lasttestAngaben(a).catch(() => {}); }, 400);
  };
  const block = stand.ergebnis ? fuelleErgebnis(stand.ergebnis.vorlage, angaben, stand.speicherErkannt) : '';
  const zeile = fuelleErgebnis(`${PLATZHALTER.geraet}\n${PLATZHALTER.speicher}`, angaben, stand.speicherErkannt).split('\n');
  const jetzt = stand.jetzt + (Date.now() - geholt.current);
  const rest = restMinuten({ ...stand, jetzt });
  const zustand = beendet ? 'beendet' : stand.zustand;
  const textDatei = stand.ergebnis ? `${stand.ergebnis.bericht}\n\n### ${t('lasttest.ergebnis')}\n\n${block}\n` : '';

  async function herunterfahren() {
    try { await einrichtungApi.lasttestBeenden(); setBeendet(true); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }
  // Herunterfahren ist Gefahr (#1215): immer mit Rückfrage. Läuft der Test noch, fällt alles weg; ist das Ergebnis
  // noch nicht kopiert oder heruntergeladen, sagt die Rückfrage das (#697).
  const beendenText = zustand === 'laeuft' ? t('lasttest.beenden.frage.laeuft')
    : stand.ergebnis && kopiert !== 'ja' && !gesichert ? t('lasttest.beenden.ungesichert') : t('lasttest.beenden.frage.fertig');

  return (
    <div className="kartenseite">
      <div className="karte breit lasttest">
        <h1>{t('lasttest.titel')}{stand.stufe ? ` – ${t.frei(`lasttest.stufe.${stand.stufe}`)}` : ''}</h1>
        <Version wert={stand.version} />
        <p className="leise">{t('lasttest.unter')}</p>

        <div className="lasttest-stand" role="status" aria-live="polite">
          {zustand === 'laeuft' && (
            <>
              {stand.stufe && <p className="klein leise">{t('lasttest.stufe', { nr: stand.nr, von: stand.von })}</p>}
              <p><strong>{t.frei(`lasttest.schritt.${stand.schritt}`)}</strong></p>
              {stand.demo && (<><progress max={stand.demo.gesamt || 1} value={stand.demo.fertig} /><p className="klein leise">{t('lasttest.demo', { fertig: zahl(stand.demo.fertig), gesamt: zahl(stand.demo.gesamt) })}</p></>)}
              {stand.durchgang && <p className="klein">{t('lasttest.durchgang', { name: stand.durchgang.name, n: stand.durchgang.n, sekunden: Math.max(0, Math.round((stand.durchgang.ende - jetzt) / 1000)) })}</p>}
              <p className="lasttest-rest"><Symbol name="stoppuhr" /> {rest ? (rest[0] === rest[1] ? t('lasttest.rest.eine', { bis: rest[1] }) : t('lasttest.rest', { von: rest[0], bis: rest[1] })) : t('lasttest.rest.gleich')}</p>
            </>
          )}
          {!!stand.ohneDatei && <div className="hinweis warn"><p><Symbol name="warnung" /> <strong>{t('lasttest.ohne-datei', { anzahl: stand.ohneDatei, zahl: zahl(stand.ohneDatei) })}</strong> {t('lasttest.ohne-datei.text')}</p></div>}
          {zustand === 'fertig' && <div className="hinweis gut"><p><Symbol name="haken" /> <strong>{t('lasttest.fertig')}</strong>{stand.ergebnis?.verfehlt ? ` ${t('lasttest.fertig.verfehlt')}` : ''}</p></div>}
          {(zustand === 'abbruch' || zustand === 'fehler') && (
            <div className="hinweis schlecht"><p><Symbol name="warnung" /> <strong>{t(zustand === 'abbruch' ? 'lasttest.abbruch' : 'lasttest.fehler')}</strong> {stand.meldung} {zustand === 'fehler' ? t('lasttest.fehler.protokoll') : ''}</p></div>
          )}
          {!!stand.durchgaenge.length && (
            <ul className="klein leise lasttest-durchgaenge">
              {stand.durchgaenge.map((d, i) => <li key={i}>{t('lasttest.durchgang.fertig', { name: d.name, p95: d.p95 ?? '–', fehler: prozent(d.fehlerquote) })}</li>)}
            </ul>
          )}
        </div>
        {zustand === 'laeuft' && stand.live && <Live l={stand.live} stufe={stand.stufe} schritt={stand.schritt} />}
        {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}

        <div className="formular">
          <Feld className="breit" beschriftung={t('lasttest.geraet')} hinweis={t('lasttest.geraet.hinweis')}>
            <input value={angaben.geraet} maxLength={GERAET_MAX} placeholder={t('lasttest.geraet.beispiel')} disabled={zustand === 'beendet'}
              onChange={(e) => { setGeraet(e.target.value); merke({ geraet: e.target.value }); }} />
          </Feld>
          <Feld beschriftung={t('lasttest.speicher')} hinweis={stand.speicherErkannt ? t('lasttest.speicher.hinweis.erkannt', { art: stand.speicherErkannt }) : t('lasttest.speicher.hinweis.offen')}>
            <select value={angaben.speicher ?? ''} disabled={zustand === 'beendet'}
              onChange={(e) => { const w = (e.target.value || null) as Speicherwahl | null; setSpeicher(w); merke({ speicher: w }); }}>
              {!angaben.speicher && <option value="">{t('lasttest.speicher.waehlen')}</option>}
              {(['HDD', 'SSD', t('oberflaeche.lasttest.nvme')] as const).map((a) => <option key={a} value={a}>{a === stand.speicherErkannt ? t('lasttest.speicher.erkannt', { art: a }) : a}</option>)}
              <option value="unbekannt">{t('lasttest.speicher.unbekannt')}</option>
            </select>
          </Feld>
          <p className="feld breit klein leise lasttest-auto">{t('lasttest.automatisch')}</p>
        </div>

        <section className="lasttest-ergebnis" aria-labelledby="lasttest-ergebnis">
          <h2 id="lasttest-ergebnis">{t('lasttest.ergebnis')}</h2>
          {!stand.ergebnis ? (
            <>
              <p className="leise">{t('lasttest.ergebnis.warten')}</p>
              <p className="klein mono umbruch">{t('lasttest.vorschau', { geraet: zeile[0], speicher: zeile[1] })}</p>
            </>
          ) : (
            <>
              <p className="klein leise">{t('lasttest.ergebnis.text')}</p>
              <Feld beschriftung={t('lasttest.ergebnis')} beschriftungVerbergen>
                <textarea ref={feld} className="mono lasttest-block" readOnly value={block} rows={block.split('\n').length} />
              </Feld>
              <div className="knoepfe">
                <Knopf art="haupt" symbol={kopiert === 'ja' ? 'haken' : undefined} onClick={() => kopiere(block, feld.current).then((ok) => setKopiert(ok ? 'ja' : 'nein'))}>{kopiert === 'ja' ? t('lasttest.kopiert') : t('lasttest.kopieren')}</Knopf>
                <Knopf symbol="herunterladen" onClick={() => { herunterladen(`lasttest-${stand.wahl}.md`, textDatei); setGesichert(true); }}>{t('lasttest.herunterladen')}</Knopf>
                <a className="knopf" href={FORMULAR} target="_blank" rel="noreferrer">{t('lasttest.formular')} <Symbol name="extern" /></a>
                <a className="knopf" href={SAMMEL} target="_blank" rel="noreferrer">{t('lasttest.sammel')} <Symbol name="extern" /></a>
              </div>
              {kopiert === 'nein' && <p className="klein fehlertext" role="alert">{t('lasttest.kopieren.geht-nicht')}</p>}
              {stand.datei && <p className="klein leise">{t('lasttest.datei', { datei: stand.datei })}</p>}
              <details><summary>{t('lasttest.bericht')}</summary><pre className="lasttest-bericht">{stand.ergebnis.bericht}</pre></details>
            </>
          )}
        </section>

        {/* Ergebnis an Stelle des Knopfs (#697): nach der Rückfrage der Abschluss – er bleibt stehen, auch wenn der Server
            nicht mehr antwortet (das Herunterfahren ist ja gewollt; es wird nichts mehr abgefragt). */}
        {zustand === 'beendet' ? (
          <div className="hinweis gut stapel" role="status">
            <p><strong>{t('lasttest.danke')}</strong></p>
            <p>{t('lasttest.danke.text')}</p>
            <p>{t('lasttest.danke.teilen')} <a className="verweis" href={SAMMEL} target="_blank" rel="noreferrer">{t('lasttest.sammel')} <Symbol name="extern" /></a></p>
            <p className="klein">{t('lasttest.beendet.text')}</p>
          </div>
        ) : (
          <div className="knoepfe lasttest-ende">
            <a className="verweis klein" href={handbuchUrl('admin', null, 'lasttest/')} target="_blank" rel="noreferrer">{t('lasttest.handbuch')} <Symbol name="extern" /></a>
            <Knopf art="gefahr" symbol="abmelden" onClick={herunterfahren}
              rueckfrage={{ titel: t('lasttest.beenden.frage'), text: beendenText, ja: t('lasttest.beenden.frage.ja') }}>{t('lasttest.beenden')}</Knopf>
          </div>
        )}
      </div>
    </div>
  );
}
