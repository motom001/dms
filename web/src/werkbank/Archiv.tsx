import { useCallback, useEffect, useState } from 'react';
import { api, type Auftrag } from '../api';
import { useDaten } from '../daten';
import { Link } from '../ort';
import { Hilfe } from '../Hilfe';
import { datumText } from '../../../shared/src/archiv';
import { titelOder } from '../seiten';
import { rueckfrage } from '../rueckfrage';

/** Werkbank → Darf weg (#212): Mappen im Archivmodus, deren Aufbewahrungsfrist abgelaufen ist. */

type Eintrag = Awaited<ReturnType<typeof api.darfWeg>>[number];

export function useDarfWeg(offen: boolean) {
  const [liste, setListe] = useState<Eintrag[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setListe(await api.darfWeg()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { void laden(); }, [laden, offen]);
  return { liste, fehler, laden };
}
export type DarfWegZustand = ReturnType<typeof useDarfWeg>;

export function DarfWegListe({ z }: { z: DarfWegZustand }) {
  return (
    <>
      <div className="listenkopf"><div><h1>Darf weg</h1><p className="leise klein">Archivierte Mappen nach Ablauf der Frist. <Hilfe ort="werkbank.darfweg" /></p></div></div>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {!z.liste ? <p className="leise">Lade …</p> : !z.liste.length ? <p className="leise leerliste">Nichts – keine Frist ist abgelaufen.</p> : (
        <ul className="mappenliste">
          {z.liste.map((m) => (
            <li key={m.id}><Link to={`/ablage/${m.typId}/${m.id}`} className="eintrag werk">
              <span className="titel">{titelOder(m.titel)}</span>
              <span className="unter">{m.typ} · aufbewahren bis {datumText(m.aufbewahrenBis)}</span>
            </Link></li>
          ))}
        </ul>
      )}
    </>
  );
}

export function DarfWegPanel({ z }: { z: DarfWegZustand }) {
  const d = useDaten();
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [laeuft, setLaeuft] = useState(false);
  const liste = z.liste ?? [];
  const alle = liste.length > 0 && gewaehlt.size === liste.length;
  async function loeschen() {
    const ids = liste.filter((m) => gewaehlt.has(m.id)).map((m) => m.id);
    if (!ids.length || !(await rueckfrage({ titel: `${ids.length === 1 ? 'Diese Mappe' : `Diese ${ids.length} Mappen`} löschen?`, text: 'Mit eingeschaltetem Papierkorb landen sie dort, sonst sind sie endgültig weg.', ja: 'Löschen', gefahr: true }))) return;
    setLaeuft(true); setMeldung(undefined);
    const fehler: string[] = [];
    for (const id of ids) { try { await api.mappeLoeschen(id); } catch (e) { fehler.push((e as Error).message); } }
    setLaeuft(false); setGewaehlt(new Set());
    setMeldung(fehler.length ? { art: 'schlecht', text: `${ids.length - fehler.length} gelöscht, ${fehler.length} nicht: ${fehler[0]}` } : { art: 'gut', text: `${ids.length} gelöscht.` });
    await z.laden(); await d.neuLaden();
  }
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Darf weg</h1>
        <p className="leise">Mappen aus Mappentypen im Archivmodus, deren Aufbewahrungsfrist abgelaufen ist. Gelöscht wird nichts automatisch – entscheide selbst, was weg darf.</p>
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      {liste.length > 0 && (
        <div className="blatt">
          <label className="haken"><input type="checkbox" checked={alle} onChange={() => setGewaehlt(alle ? new Set() : new Set(liste.map((m) => m.id)))} /><span>{gewaehlt.size ? `${gewaehlt.size} von ${liste.length} ausgewählt` : 'Alle auswählen'}</span></label>
          <ul className="stapel">
            {liste.map((m) => (
              <li key={m.id}><label className="haken"><input type="checkbox" checked={gewaehlt.has(m.id)} onChange={(e) => setGewaehlt((x) => { const n = new Set(x); if (e.target.checked) n.add(m.id); else n.delete(m.id); return n; })} />
                <span><Link to={`/ablage/${m.typId}/${m.id}`} className="verweis">{titelOder(m.titel)}</Link> <small className="leise">{m.typ} · Frist abgelaufen am {datumText(m.aufbewahrenBis)}</small></span></label></li>
            ))}
          </ul>
          <div className="knoepfe"><button type="button" className="knopf gefahr" disabled={!gewaehlt.size || laeuft} onClick={() => void loeschen()}>{laeuft ? 'Lösche …' : 'Ausgewählte löschen'}</button></div>
        </div>
      )}
    </div>
  );
}

/** Wartung (#212): jede Datei gegen ihren Prüfwert. */
export function DateienPruefen() {
  const [auftrag, setAuftrag] = useState<Auftrag | null>(null);
  const [fehler, setFehler] = useState<string>();
  useEffect(() => {
    if (auftrag?.status !== 'laeuft') return;
    const t = setInterval(() => void api.auftrag().then(setAuftrag), 1000);
    return () => clearInterval(t);
  }, [auftrag?.status]);
  const e = auftrag?.status === 'fertig' && auftrag.art === 'dateien-pruefen'
    ? auftrag.ergebnis as { dateien: number; abweichungen: Array<{ sha256: string; grund: string; dokumente: Array<{ name: string; mappeId: string; version: number }> }> } : null;
  return (
    <section className="blatt" id="dateien">
      <h2 className="h3">Alle Dateien prüfen <Hilfe ort="werkbank.dateienpruefen" /></h2>
      <p className="leise">Liest jede gespeicherte Datei – auch ältere Versionen – und vergleicht sie mit ihrem Prüfwert. So fällt auf, wenn eine Datei auf dem Speicher verändert wurde oder fehlt. Das Ergebnis steht auch im Protokoll.</p>
      {auftrag?.status === 'laeuft' && <p className="leise">Prüfe … {auftrag.fertig} von {auftrag.gesamt}</p>}
      {e && (e.abweichungen.length
        ? <div className="hinweis schlecht"><p>{e.abweichungen.length} von {e.dateien} Dateien weichen ab:</p>
            <ul>{e.abweichungen.map((a) => <li key={a.sha256}>{a.grund}: {a.dokumente.map((x, i) => <span key={i}>{i > 0 && ', '}<Link to={`/ablage/eingang/${x.mappeId}`} className="verweis">{x.name}</Link>{x.version > 1 ? ` (Version ${x.version})` : ''}</span>)}</li>)}</ul></div>
        : <p className="gutertext" role="status">Alle {e.dateien} Dateien sind in Ordnung.</p>)}
      {(fehler || auftrag?.status === 'fehler') && <p className="fehlertext">{fehler ?? auftrag?.fehler}</p>}
      <div className="knoepfe"><button type="button" className="knopf primaer" disabled={auftrag?.status === 'laeuft'} onClick={() => void api.dateienPruefen().then(setAuftrag).catch((x) => setFehler((x as Error).message))}>Jetzt prüfen</button></div>
    </section>
  );
}
