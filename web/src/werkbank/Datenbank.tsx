import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type DatenbankStand } from '../api';
import { Link } from '../ort';
import { Hilfe } from '../Hilfe';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { Symbol } from '../Symbol';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { ProzessTabelle } from './Auslastung';
import { abfangen, Feld, Knopf } from '../bausteine';

/**
 * Lange Datenbankzugriffe (#12) und was gerade in der Datenbank läuft – seit #407 unter
 * Einstellungen → Datenbank-Anbindung, unter der Verbindung: Einstellungen (Schwelle, Aufbewahrung)
 * direkt bei der Liste der gespeicherten Langläufer (#366), darunter „Was läuft gerade“.
 */
const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'medium' });
const dauer = (ms: number) => (ms >= 10_000 ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : `${ms.toLocaleString(gebietsschema())} ms`);

export function useDatenbank(sichtbar: boolean) {
  const [stand, setStand] = useState<DatenbankStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await api.datenbank()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => {
    if (!sichtbar) return;
    void laden();
    const timer = setInterval(() => void laden(), 5000);
    return () => clearInterval(timer);
  }, [sichtbar, laden]);
  return { stand, fehler, laden };
}
export type DatenbankZustand = ReturnType<typeof useDatenbank>;

/** Abschnitte unter der Verbindung (#407): lange Datenbankzugriffe, was gerade läuft. */
export function DatenbankAbschnitte({ z, offen }: { z: DatenbankZustand; offen?: string }) {
  return (
    <>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {z.stand?.einstellungen ? <Einstellungen z={z} offen={offen} /> : !z.stand && <p className="leise">{t('werkbank.datenbank.lade')}</p>}
      <Auslastung z={z} />
      <Laufend z={z} />
    </>
  );
}

/**
 * Lange Datenbankzugriffe (#366: früher die mittlere Spalte): feste Höhe für etwa zehn Einträge,
 * neueste oben; ein Klick klappt den Eintrag auf statt die Seite zu wechseln.
 */
function Langlaeufer({ z, offen }: { z: DatenbankZustand; offen?: string }) {
  const liste = z.stand?.langlaeufer ?? [];
  const [auf, setAuf] = useState<Set<string>>(() => new Set(offen ? [offen] : []));
  const rahmen = useRef<HTMLUListElement>(null);
  // Alter Direktlink (/werkbank/datenbank/:id): Eintrag aufgeklappt und sichtbar.
  useEffect(() => {
    if (!offen || !liste.length) return;
    setAuf((x) => new Set(x).add(offen));
    rahmen.current?.querySelector(`[data-id="${CSS.escape(offen)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [offen, liste.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps -- nur aufklappen, wenn sich der offene Eintrag ändert oder die Liste erstmals da ist
  const umschalten = (id: string) => setAuf((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="stapel">
      <h3 className="zwischen">{tn('werkbank.datenbank.gespeicherte-zugriffe-und-anfragen', { span: <span className="zusatz">{t('werkbank.datenbank.neueste-oben')}</span> })}</h3>
      {!liste.length
        ? <p className="leise">{t('werkbank.datenbank.keine-alle-zugriffe-waren')}</p>
        : <ul ref={rahmen} className="aufklappliste festhoehe">
            {liste.map((l) => {
              const id = String(l.id);
              const offenHier = auf.has(id);
              return (
                <li key={id} data-id={id} className={offenHier ? 'an' : undefined}>
                  <Knopf art="link" className="aufklappzeile" aria-expanded={offenHier} onClick={() => umschalten(id)}>
                    <Symbol name={offenHier ? 'pfeil-unten' : 'pfeil-rechts'} className="zeichen" /><span className="mono klein">{zeit(l.zeit)}</span> <span className={`chip ${l.dauerMs >= 5000 ? 'stufe-error' : 'stufe-warn'}`}>{dauer(l.dauerMs)}</span>{' '}
                    <span className="mono">{l.zugriff}</span>
                  </Knopf>
                  {offenHier && (
                    <dl className="eigenschaften klein">
                      {l.zugriff.startsWith('Anfrage: ')
                        ? <><dt>{t('werkbank.datenbank.aufteilung')}</dt><dd>{l.zugriff.slice(9)}</dd></>
                        : <><dt>{t('werkbank.datenbank.abfrage')}</dt><dd className="mono">{l.zugriff}</dd></>}
                      <dt>{t('werkbank.datenbank.aufrufer')}</dt><dd>{[l.anfrage, l.benutzer].filter(Boolean).join(' · ') || t('werkbank.datenbank.ausserhalb-einer-anfrage')}</dd>
                      <dt>{t('werkbank.datenbank.dauer')}</dt><dd>{dauer(l.dauerMs)}</dd>
                      <dt>{t('werkbank.datenbank.zeit')}</dt><dd>{zeit(l.zeit)}</dd>
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>}
      <p className="leise klein">{tn('werkbank.datenbank.ein-datenbankzugriff-ist-eine', { span: <span className="mono">{'mappen.seite'}</span>, link: <Link to="/werkbank/protokoll" className="verweis">{t('werkbank.datenbank.protokoll')}</Link> })}</p>
    </div>
  );
}

function Einstellungen({ z, offen }: { z: DatenbankZustand; offen?: string }) {
  const e = z.stand!.einstellungen!;
  const [schwelle, setSchwelle] = useState(String(e.schwelleMs));
  const [tage, setTage] = useState(String(e.tage));
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const ent = useEntwurf({ schwelle: String(e.schwelleMs), tage: String(e.tage) }, { schwelle, tage }, {
    zuruecksetzen: () => { setSchwelle(String(e.schwelleMs)); setTage(String(e.tage)); setMeldung(undefined); },
  });
  async function speichern(ev: FormEvent) {
    ev.preventDefault();
    setSendet(true);
    try { await api.datenbankEinstellen({ schwelleMs: Number(schwelle), tage: Number(tage) }); setMeldung({ art: 'gut', text: t('werkbank.datenbank.gespeichert') }); await z.laden(); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  return (
    <form className="blatt" id="lange-zugriffe" onSubmit={abfangen(speichern, (text) => setMeldung({ art: 'schlecht', text }))} onKeyDown={ent.tasten}>
      <h2 className="h3">{t('werkbank.datenbank.lange-datenbankzugriffe')} <Hilfe ort="werkbank.datenbank" /></h2>
      <p className="leise">{t('werkbank.datenbank.jeder-datenbankzugriff-wird-gestoppt')}</p>
      <div className="raster">
        <Feld beschriftung={t('werkbank.datenbank.lang-ab')} hinweis={t('werkbank.datenbank.millisekunden-standard-500')}>
          <input type="number" min={1} max={600000} value={schwelle} onChange={(x) => setSchwelle(x.target.value)} />
        </Feld>
        <Feld beschriftung={t('werkbank.datenbank.aufbewahren')} hinweis={t('werkbank.datenbank.tage-standard-30')}>
          <input type="number" min={1} max={3650} value={tage} onChange={(x) => setTage(x.target.value)} />
        </Feld>
      </div>
      <Langlaeufer z={z} offen={offen} />
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'}>{meldung.text}</p>}
      <Speicherleiste ent={ent} gegenstand={t('werkbank.datenbank.einstellungen')} sendet={sendet} />
    </form>
  );
}

/**
 * Auslastung des Servers (#477): Verzögerung der Ereignisschleife. Node.js arbeitet Anfragen auf einem
 * Faden ab; rechnet eine Anfrage lange im Arbeitsspeicher, warten die anderen so lange.
 */
function Auslastung({ z }: { z: DatenbankZustand }) {
  const a = z.stand?.auslastung;
  if (!a) return null;
  const w = a.aktuell && (a.aktuell.seitSekunden >= 10 || !a.vorher) ? a.aktuell : a.vorher ?? a.aktuell;
  const zahl = (x: number) => `${x.toLocaleString(gebietsschema(), { maximumFractionDigits: 1 })} ms`;
  return (
    <div className="blatt">
      <h2 className="h3">{t('werkbank.datenbank.auslastung-des-servers')}</h2>
      {!w
        ? <p className="leise">{t('werkbank.datenbank.noch-keine-messwerte')}</p>
        : <>
            {w.p99 >= 100 && <div className="hinweis warn"><p>{t('werkbank.datenbank.der-server-war-zeitweise', { zahl: zahl(w.max) })}</p></div>}
            <dl className="eigenschaften">
              <dt>{t('werkbank.datenbank.wartezeit-ueblich')}</dt><dd>{zahl(w.median)}</dd>
              <dt>{t('werkbank.datenbank.wartezeit-99')}</dt><dd>{zahl(w.p99)}</dd>
              <dt>{t('werkbank.datenbank.wartezeit-hoechstens')}</dt><dd>{zahl(w.max)}</dd>
            </dl>
          </>}
      <p className="leise klein">{t('werkbank.datenbank.verzoegerung-der-ereignisschleife-in')}</p>
      <Verbindungen z={z} />
      <ProzessTabelle zeilen={z.stand?.prozesse} />
    </div>
  );
}

/** Verbindungen zur Datenbank (#544): Zahl und wie lange Abfragen auf eine freie warten. */
function Verbindungen({ z }: { z: DatenbankZustand }) {
  const v = z.stand?.verbindungen;
  if (!v) return null;
  const zahl = (x: number) => `${x.toLocaleString(gebietsschema(), { maximumFractionDigits: 1 })} ms`;
  return (
    <>
      <h3 className="h4">{t('systemzustand.verbindungen.titel')}</h3>
      <p>{t(v.quelle === 'umgebung' ? 'systemzustand.verbindungen.umgebung' : 'systemzustand.verbindungen.vorgabe', { max: v.max })}</p>
      <p>{v.median === null || v.hoechstens === null ? t('systemzustand.verbindungen.keine') : t('systemzustand.verbindungen.warten', { median: zahl(v.median), max: zahl(v.hoechstens) })}</p>
      <p className="leise klein">{t('systemzustand.verbindungen.hilfe')}</p>
    </>
  );
}

function Laufend({ z }: { z: DatenbankZustand }) {
  const liste = z.stand?.laufend ?? [];
  const schwelle = z.stand?.einstellungen?.schwelleMs ?? 500;
  const lang = liste.filter((q) => q.seitMs >= schwelle).length;
  return (
    <div className="blatt" id="laeuft-gerade">
      <h2 className="h3">{t('werkbank.datenbank.was-laeuft-gerade')}</h2>
      {lang > 0 && <div className="hinweis warn"><p>{t('werkbank.datenbank.abfragen-laufen-schon-laenger', { anzahl: lang, dauer: dauer(schwelle) })}</p></div>}
      {!liste.length
        ? <p className="leise">{t('werkbank.datenbank.gerade-keine-abfrage-in')}</p>
        : <ul className="sitzungsliste">
            {liste.map((q) => (
              <li key={q.pid}>
                <div>
                  <strong className={q.seitMs >= schwelle ? 'fehlertext' : ''}>{dauer(q.seitMs)}</strong> <span className="leise klein">{t('werkbank.datenbank.prozess', { zustand: q.zustand, pid: q.pid, wert: q.anwendung ? ` · ${q.anwendung}` : '' })}</span>
                  <span className="mono klein blockzeile">{q.abfrage}</span>
                </div>
              </li>
            ))}
          </ul>}
    </div>
  );
}
