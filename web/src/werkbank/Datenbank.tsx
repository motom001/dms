import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type DatenbankStand } from '../api';
import { Link } from '../ort';
import { Hilfe } from '../Hilfe';

/**
 * Lange Datenbankzugriffe (#12): Mitte die gespeicherten Langläufer, rechts
 * Einstellungen (Schwelle, Aufbewahrung) und was gerade in der Datenbank läuft.
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

export function LanglaeuferListe({ z, offen }: { z: DatenbankZustand; offen?: string }) {
  const liste = z.stand?.langlaeufer ?? [];
  const e = z.stand?.einstellungen;
  return (
    <>
      <div className="listenkopf">
        <div><h1>Lange Datenbankzugriffe</h1>
          <p className="leise klein">{e ? `Ab ${dauer(e.schwelleMs)}, aufbewahrt ${e.tage} Tage.` : ''} Neueste oben. <Hilfe ort="werkbank.datenbank" /></p></div>
      </div>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {!z.stand ? <p className="leise">Lade …</p> : !liste.length
        ? <p className="leise leerliste">Keine – alle Zugriffe waren schneller als die Schwelle.</p>
        : <ul className="mappenliste">
            {liste.map((l) => (
              <li key={l.id}>
                <Link to={`/werkbank/datenbank/${l.id}`} className={`eintrag werk ${offen === String(l.id) ? 'an' : ''}`}>
                  <span className="zeile1"><span className="mono klein">{zeit(l.zeit)}</span> <span className={`chip ${l.dauerMs >= 5000 ? 'stufe-error' : 'stufe-warn'}`}>{dauer(l.dauerMs)}</span></span>
                  <span className="titel mono">{l.zugriff}</span>
                  <span className="unter">{[l.anfrage, l.benutzer].filter(Boolean).join(' · ') || 'außerhalb einer Anfrage'}</span>
                </Link>
              </li>
            ))}
          </ul>}
    </>
  );
}

export function DatenbankPanel({ z, id }: { z: DatenbankZustand; id?: string }) {
  const l = id ? z.stand?.langlaeufer.find((x) => String(x.id) === id) : undefined;
  if (id && l) return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Langer Datenbankzugriff</p>
        <h1 className="mono">{l.zugriff}</h1>
        <dl className="index">
          <div><dt>Zeit</dt><dd>{zeit(l.zeit)}</dd></div>
          <div><dt>Dauer</dt><dd>{dauer(l.dauerMs)}</dd></div>
          {l.anfrage && <div><dt>Anfrage</dt><dd className="mono">{l.anfrage}</dd></div>}
          {l.benutzer && <div><dt>Benutzer</dt><dd>{l.benutzer}</dd></div>}
        </dl>
      </div>
      <p className="leise">Ein Datenbankzugriff ist eine Methode der Datenzugriffsschicht (z. B. <span className="mono">mappen.seite</span> für eine Seite einer Sicht) und kann mehrere SQL-Anweisungen umfassen. Mehr Einzelheiten zur selben Zeit stehen im <Link to="/werkbank/protokoll" className="verweis">Protokoll</Link> (Modul datenbank).</p>
      <div className="knoepfe"><Link to="/werkbank/datenbank" className="knopf">Schließen</Link></div>
    </div>
  );
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Datenbank</h1>
        <p className="leise">Jeder Datenbankzugriff wird gestoppt. Was länger dauert als die Schwelle, landet links in der Liste und als Warnung im Protokoll.</p>
      </div>
      {z.stand?.einstellungen && <Einstellungen z={z} />}
      <Laufend z={z} />
    </div>
  );
}

function Einstellungen({ z }: { z: DatenbankZustand }) {
  const e = z.stand!.einstellungen!;
  const [schwelle, setSchwelle] = useState(String(e.schwelleMs));
  const [tage, setTage] = useState(String(e.tage));
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  async function speichern(ev: FormEvent) {
    ev.preventDefault();
    try { await api.datenbankEinstellen({ schwelleMs: Number(schwelle), tage: Number(tage) }); setMeldung({ art: 'gut', text: 'Gespeichert.' }); await z.laden(); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  const geaendert = schwelle !== String(e.schwelleMs) || tage !== String(e.tage);
  return (
    <form className="blatt" onSubmit={speichern}>
      <h2 className="h3">Einstellungen</h2>
      <div className="raster">
        <label className="eigenschaft"><span>Lang ab <small>Millisekunden, Standard 500</small></span><input type="number" min={1} max={600000} value={schwelle} onChange={(x) => setSchwelle(x.target.value)} /></label>
        <label className="eigenschaft"><span>Aufbewahren <small>Tage, Standard 30</small></span><input type="number" min={1} max={3650} value={tage} onChange={(x) => setTage(x.target.value)} /></label>
      </div>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'}>{meldung.text}</p>}
      <div className="knoepfe"><button className="knopf primaer" disabled={!geaendert}>Speichern</button></div>
    </form>
  );
}

function Laufend({ z }: { z: DatenbankZustand }) {
  const liste = z.stand?.laufend ?? [];
  const schwelle = z.stand?.einstellungen?.schwelleMs ?? 500;
  const lang = liste.filter((q) => q.seitMs >= schwelle).length;
  return (
    <div className="blatt">
      <h2 className="h3">Läuft gerade</h2>
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
