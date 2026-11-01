import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type DatenbankStand } from '../api';
import { Link } from '../ort';
import { Hilfe } from '../Hilfe';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';

/**
 * Lange Datenbankzugriffe (#12) und was gerade in der Datenbank läuft – seit #407 unter
 * Einstellungen → Datenbank-Anbindung, unter der Verbindung: Einstellungen (Schwelle, Aufbewahrung)
 * direkt bei der Liste der gespeicherten Langläufer (#366), darunter „Was läuft gerade“.
 */
const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' });
const dauer = (ms: number) => (ms >= 10_000 ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : `${ms.toLocaleString('de-DE')} ms`);

export function useDatenbank(sichtbar: boolean) {
  const [stand, setStand] = useState<DatenbankStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await api.datenbank()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => {
    if (!sichtbar) return;
    void laden();
    const t = setInterval(() => void laden(), 5000);
    return () => clearInterval(t);
  }, [sichtbar, laden]);
  return { stand, fehler, laden };
}
export type DatenbankZustand = ReturnType<typeof useDatenbank>;

/** Abschnitte unter der Verbindung (#407): lange Datenbankzugriffe, was gerade läuft. */
export function DatenbankAbschnitte({ z, offen }: { z: DatenbankZustand; offen?: string }) {
  return (
    <>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {z.stand?.einstellungen ? <Einstellungen z={z} offen={offen} /> : !z.stand && <p className="leise">Lade …</p>}
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
  }, [offen, liste.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const umschalten = (id: string) => setAuf((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="stapel">
      <h3 className="zwischen">Gespeicherte Zugriffe <span className="zusatz">· neueste oben</span></h3>
      {!liste.length
        ? <p className="leise">Keine – alle Zugriffe waren schneller als die Schwelle.</p>
        : <ul ref={rahmen} className="aufklappliste festhoehe">
            {liste.map((l) => {
              const id = String(l.id);
              const offenHier = auf.has(id);
              return (
                <li key={id} data-id={id} className={offenHier ? 'an' : undefined}>
                  <button type="button" className="aufklappzeile" aria-expanded={offenHier} onClick={() => umschalten(id)}>
                    <span className="mono klein">{zeit(l.zeit)}</span> <span className={`chip ${l.dauerMs >= 5000 ? 'stufe-error' : 'stufe-warn'}`}>{dauer(l.dauerMs)}</span>{' '}
                    <span className="mono">{l.zugriff}</span>
                  </button>
                  {offenHier && (
                    <dl className="eigenschaften klein">
                      <dt>Abfrage</dt><dd className="mono">{l.zugriff}</dd>
                      <dt>Aufrufer</dt><dd>{[l.anfrage, l.benutzer].filter(Boolean).join(' · ') || 'außerhalb einer Anfrage'}</dd>
                      <dt>Dauer</dt><dd>{dauer(l.dauerMs)}</dd>
                      <dt>Zeit</dt><dd>{zeit(l.zeit)}</dd>
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>}
      <p className="leise klein">Ein Datenbankzugriff ist eine Methode der Datenzugriffsschicht (z. B. <span className="mono">mappen.seite</span> für eine Seite einer Ansicht) und kann mehrere SQL-Anweisungen umfassen. Mehr Einzelheiten zur selben Zeit stehen im <Link to="/werkbank/protokoll" className="verweis">Protokoll</Link> (Modul datenbank).</p>
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
    try { await api.datenbankEinstellen({ schwelleMs: Number(schwelle), tage: Number(tage) }); setMeldung({ art: 'gut', text: 'Gespeichert.' }); await z.laden(); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  return (
    <form className="blatt" id="lange-zugriffe" onSubmit={speichern} onKeyDown={ent.tasten}>
      <h2 className="h3">Lange Datenbankzugriffe <Hilfe ort="werkbank.datenbank" /></h2>
      <p className="leise">Jeder Datenbankzugriff wird gestoppt. Was länger dauert als die Schwelle, landet in der Liste und als Warnung im Protokoll.</p>
      <div className="raster">
        <label className="eigenschaft"><span>Lang ab <small>Millisekunden, Standard 500</small></span><input type="number" min={1} max={600000} value={schwelle} onChange={(x) => setSchwelle(x.target.value)} /></label>
        <label className="eigenschaft"><span>Aufbewahren <small>Tage, Standard 30</small></span><input type="number" min={1} max={3650} value={tage} onChange={(x) => setTage(x.target.value)} /></label>
      </div>
      <Langlaeufer z={z} offen={offen} />
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'}>{meldung.text}</p>}
      <Speicherleiste ent={ent} gegenstand="Einstellungen" sendet={sendet} />
    </form>
  );
}

function Laufend({ z }: { z: DatenbankZustand }) {
  const liste = z.stand?.laufend ?? [];
  const schwelle = z.stand?.einstellungen?.schwelleMs ?? 500;
  const lang = liste.filter((q) => q.seitMs >= schwelle).length;
  return (
    <div className="blatt" id="laeuft-gerade">
      <h2 className="h3">Was läuft gerade</h2>
      {lang > 0 && <div className="hinweis warn"><p>{lang} {lang === 1 ? 'Abfrage läuft' : 'Abfragen laufen'} schon länger als {dauer(schwelle)}.</p></div>}
      {!liste.length
        ? <p className="leise">Gerade keine Abfrage in der Datenbank (außer dieser). Wird alle fünf Sekunden aktualisiert.</p>
        : <ul className="sitzungsliste">
            {liste.map((q) => (
              <li key={q.pid}>
                <div>
                  <strong className={q.seitMs >= schwelle ? 'fehlertext' : ''}>{dauer(q.seitMs)}</strong> <span className="leise klein">{q.zustand} · Prozess {q.pid}{q.anwendung ? ` · ${q.anwendung}` : ''}</span>
                  <span className="mono klein blockzeile">{q.abfrage}</span>
                </div>
              </li>
            ))}
          </ul>}
    </div>
  );
}
