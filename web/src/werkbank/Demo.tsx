import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Auftrag, type DemoErgebnis } from '../api';
import { useDaten } from '../daten';

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
      <div className="listenkopf"><div><h1>Demo-Daten</h1><p className="leise klein">Mappen je Typ, davon Demo-Mappen.</p></div></div>
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

/** Meldung zum Ergebnis eines beendeten Auftrags. */
function meldungAus(a: Auftrag): Meldung {
  if (a.status === 'fehler') return { art: 'schlecht', text: `${a.titel}: ${a.fehler ?? 'Fehler'}` };
  if (a.art === 'demo-entfernen') return { art: 'gut', text: `${(a.ergebnis as { entfernt: number }).entfernt.toLocaleString('de-DE')} Demo-Mappen entfernt.` };
  const r = a.ergebnis as DemoErgebnis;
  return {
    art: r.uebersprungen.length ? 'warn' : 'gut',
    text: `${r.gesamt.toLocaleString('de-DE')} Demo-Mappen erzeugt.`,
    liste: [...Object.entries(r.erzeugt).map(([k, v]) => `${k}: ${v.toLocaleString('de-DE')}`), ...r.uebersprungen.map((x) => `${x.typ} unvollständig: ${x.grund}`)],
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
        <p className="leise">Erzeugt Mappen für die vorhandenen Mappentypen – mit passenden Werten je Feld und Verweisen auf vorhandene Mappen. Demo-Mappen sind gekennzeichnet und lassen sich gesammelt wieder entfernen.</p>
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
        <form className="blatt" onSubmit={(e) => { e.preventDefault(); void starte(() => api.demoErzeugen(Number(anzahl))); }}>
          <h2 className="h3">Erzeugen</h2>
          <div className="raster">
            <label className="eigenschaft"><span>Anzahl <small>wird auf die Typen verteilt, Belege bekommen mehr als Stammdaten</small></span>
              <input type="number" min={1} max={5000} value={anzahl} onChange={(e) => setAnzahl(e.target.value)} /></label>
          </div>
          <div className="knoepfe"><button className="knopf primaer" disabled={laeuft}>Demo-Mappen erzeugen</button></div>
        </form>
      )}

      <div className="blatt">
        <h2 className="h3">Entfernen</h2>
        <p className="leise">Löscht alle {demo.toLocaleString('de-DE')} Demo-Mappen samt ihrer Dokumente. Echte Mappen bleiben unberührt; verweist eine echte Mappe auf eine Demo-Mappe, wird nichts gelöscht.</p>
        <div className="knoepfe"><button className="knopf gefahr-rand" disabled={!demo || laeuft} onClick={() => {
          if (confirm(`Alle ${demo} Demo-Mappen löschen?`)) void starte(() => api.demoEntfernen());
        }}>Alle Demo-Mappen entfernen</button></div>
      </div>
    </div>
  );
}
