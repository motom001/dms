import { useEffect, useState } from 'react';
import { api } from '../api';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { rueckfrage } from '../rueckfrage';
import { titelOder } from '../seiten';

type Posten = Awaited<ReturnType<typeof api.absenderVorschau>>['posten'];
const datum = (iso: string) => new Date(iso).toLocaleDateString('de-DE');

/**
 * Wartung „Absender bereinigen“ (#494): Bis 0.99 bekam eingehende Post ohne Absender den Namen dessen,
 * der sie angelegt hat. Die Vorschau zeigt die betroffenen Posts; geleert wird nur, was angehakt ist.
 */
export function AbsenderBereinigen() {
  const [posten, setPosten] = useState<Posten | null>(null);
  const [wahl, setWahl] = useState<Set<string>>(new Set());
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  async function laden() {
    try { const v = await api.absenderVorschau(); setPosten(v.posten); setWahl(new Set(v.posten.map((p) => p.id))); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }
  useEffect(() => { void laden(); }, []);
  async function los() {
    const ids = [...wahl];
    if (!ids.length || !(await rueckfrage({ titel: `Absender bei ${ids.length === 1 ? 'einer Post' : `${ids.length} Posts`} leeren?`, text: 'Das Feld „Absender“ ist danach leer. In der Historie jeder Post steht, was vorher drin war.', ja: 'Absender leeren' }))) return;
    setLaeuft(true); setMeldung(undefined);
    try {
      const r = await api.absenderBereinigen(ids);
      setMeldung({ art: 'gut', text: r.bereinigt === 1 ? 'Bei einer Post ist der Absender jetzt leer.' : `Bei ${r.bereinigt} Posts ist der Absender jetzt leer.` });
      await laden();
    } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); } finally { setLaeuft(false); }
  }
  const umschalten = (id: string) => setWahl((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <section className="blatt" id="absender">
      <h2 className="h3">Absender bereinigen <Hilfe ort="werkbank.wartung.absender" /></h2>
      <p className="leise">Bis Version 0.99 stand bei hochgeladener Post ohne Absender der Name dessen, der sie angelegt hat (beim Eingangsordner „Eingangsordner“). Hier findest du diese Posts und leerst das Feld. Post aus Postfächern und versendete E-Mails sind nicht dabei.</p>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      {posten === null ? <p className="leise">Lade …</p> : !posten.length ? <p className="leise">Nichts zu bereinigen – keine Post hat den Namen ihres Anlegenden als Absender.</p> : <>
        <p>{posten.length === 1 ? 'Eine Post hat' : `${posten.length} Posts haben`} vermutlich einen falschen Absender. Nimm den Haken weg, wo der Absender doch stimmt.</p>
        <div className="tabellenrahmen festhoehe">
          <table className="absb-tabelle">
            <thead><tr>
              <th><input type="checkbox" aria-label="Alle wählen" checked={wahl.size === posten.length} onChange={(e) => setWahl(e.target.checked ? new Set(posten.map((p) => p.id)) : new Set())} /></th>
              <th>Post</th><th>Absender</th><th>Kanal</th><th>angelegt</th>
            </tr></thead>
            <tbody>{posten.map((p) => (
              <tr key={p.id}>
                <td><input type="checkbox" aria-label={`„${titelOder(p.titel)}“ bereinigen`} checked={wahl.has(p.id)} onChange={() => umschalten(p.id)} /></td>
                <td><Link to={`/ablage/eingang/${p.id}`} className="verweis">{titelOder(p.titel)}</Link></td>
                <td>{p.absender}</td><td>{p.kanal}</td><td>{datum(p.erstellt)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="knoepfe"><button type="button" className="knopf primaer" disabled={laeuft || !wahl.size} onClick={() => void los()}>{laeuft ? 'Leere …' : `Absender leeren (${wahl.size})`}</button></div>
      </>}
    </section>
  );
}
