import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
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
                <span className="unter">{t.gesamt} Mappen{t.demo ? `, davon ${t.demo} Demo` : ''}</span>
              </span></li>
            ))}
          </ul>}
    </>
  );
}

export function DemoPanel() {
  const d = useDaten();
  const [anzahl, setAnzahl] = useState('1000');
  const [laeuft, setLaeuft] = useState<string>();
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'warn' | 'schlecht'; text: string; liste?: string[] }>();
  const demo = d.mappen.filter((m) => m.demo).length;

  async function los(fn: () => Promise<void>, text: string) {
    setLaeuft(text); setMeldung(undefined);
    try { await fn(); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
    finally { setLaeuft(undefined); await d.neuLaden(); }
  }

  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Demo-Daten</h1>
        <p className="leise">Erzeugt Mappen für die vorhandenen Mappentypen – mit passenden Werten je Feld und Verweisen auf vorhandene Mappen. Demo-Mappen sind gekennzeichnet und lassen sich gesammelt wieder entfernen.</p>
      </div>
      {meldung && <div className={`hinweis ${meldung.art} stapel`}><p>{meldung.text}</p>{meldung.liste && <ul>{meldung.liste.map((x) => <li key={x}>{x}</li>)}</ul>}</div>}

      {!d.typen.length ? (
        <div className="blatt">
          <h2 className="h3">Beispiel-Mappentypen</h2>
          <p className="leise">Vertragspartner, Vertrag, Rechnung und Zahlung mit Registern und ein paar Mappen. Nur möglich, solange es noch keine Mappentypen gibt.</p>
          <div className="knoepfe"><button className="knopf primaer" disabled={!!laeuft} onClick={() => void los(async () => { await api.beispiele(); setMeldung({ art: 'gut', text: 'Beispiele geladen.' }); }, 'Lade Beispiele …')}>Beispiele laden</button></div>
        </div>
      ) : (
        <form className="blatt" onSubmit={(e) => {
          e.preventDefault();
          void los(async () => {
            const r = await api.demoErzeugen(Number(anzahl));
            setMeldung({
              art: r.uebersprungen.length ? 'warn' : 'gut',
              text: `${r.gesamt} Demo-Mappen erzeugt.`,
              liste: [...Object.entries(r.erzeugt).map(([k, v]) => `${k}: ${v}`), ...r.uebersprungen.map((x) => `${x.typ} unvollständig: ${x.grund}`)],
            });
          }, `Erzeuge ${anzahl} Demo-Mappen …`);
        }}>
          <h2 className="h3">Erzeugen</h2>
          <div className="raster">
            <label className="eigenschaft"><span>Anzahl <small>wird auf die Typen verteilt, Belege bekommen mehr als Stammdaten</small></span>
              <input type="number" min={1} max={5000} value={anzahl} onChange={(e) => setAnzahl(e.target.value)} /></label>
          </div>
          <div className="knoepfe"><button className="knopf primaer" disabled={!!laeuft}>{laeuft?.startsWith('Erzeuge') ? laeuft : 'Demo-Mappen erzeugen'}</button></div>
        </form>
      )}

      <div className="blatt">
        <h2 className="h3">Entfernen</h2>
        <p className="leise">Löscht alle {demo} Demo-Mappen samt ihrer Dokumente. Echte Mappen bleiben unberührt; verweist eine echte Mappe auf eine Demo-Mappe, wird nichts gelöscht.</p>
        <div className="knoepfe"><button className="knopf gefahr-rand" disabled={!demo || !!laeuft} onClick={() => {
          if (confirm(`Alle ${demo} Demo-Mappen löschen?`)) void los(async () => { const r = await api.demoEntfernen(); setMeldung({ art: 'gut', text: `${r.entfernt} Demo-Mappen entfernt.` }); }, 'Entferne …');
        }}>{laeuft === 'Entferne …' ? laeuft : 'Alle Demo-Mappen entfernen'}</button></div>
      </div>
    </div>
  );
}
