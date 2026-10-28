import { useState } from 'react';
import { AUFGABENARTEN, type Aufgabe } from '../../../shared/src/model';
import { api } from '../api';
import { useDaten } from '../daten';
import { useKonto } from '../konto';

/** Aufgaben an einer Mappe (#54): offene als Hinweis über der Mappe; eigene erledigen oder weitergeben. */
const datum = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'short' });

export function BenutzerWahl({ wert, setze, ohne, label }: { wert: string; setze: (id: string) => void; ohne?: string | null; label: string }) {
  const d = useDaten();
  return (
    <select aria-label={label} value={wert} onChange={(e) => setze(e.target.value)}>
      <option value="">– Benutzer wählen –</option>
      {d.personen.filter((p) => p.aktiv !== false && p.id !== ohne).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

function Zeile({ a, neuLaden }: { a: Aufgabe; neuLaden: () => Promise<void> }) {
  const d = useDaten();
  const { ich } = useKonto();
  const [weiter, setWeiter] = useState(false);
  const [an, setAn] = useState('');
  const [fehler, setFehler] = useState<string>();
  const meine = a.empfaengerId === ich.id || (!a.empfaengerId && ich.rolle === 'admin');
  const darf = meine || ich.rolle === 'admin';
  async function tu(f: () => Promise<unknown>) {
    setFehler(undefined);
    try { await f(); setWeiter(false); await neuLaden(); await d.neuLaden(); } catch (e) { setFehler((e as Error).message); }
  }
  return (
    <li className={meine ? 'meine' : ''}>
      <div className="aufgabentext">
        <strong>{meine ? 'Für dich' : `Für ${a.empfaengerId ? d.person(a.empfaengerId) : 'Administratoren'}`}:</strong> {a.text}
        <span className="leise klein"> · {AUFGABENARTEN[a.art]} seit {datum(a.erstellt)}{a.erstelltVon ? ` von ${d.person(a.erstelltVon)}` : ''}</span>
      </div>
      {darf && (
        <div className="aufgabenaktionen">
          {a.art !== 'passung' && <button type="button" className="knopf klein" onClick={() => void tu(() => api.aufgabeErledigt(a.id))}>Erledigt</button>}
          {!weiter
            ? <button type="button" className="textknopf" onClick={() => setWeiter(true)}>Weitergeben</button>
            : <span className="weitergeben">
                <BenutzerWahl label="Weitergeben an" wert={an} setze={setAn} ohne={a.empfaengerId} />
                <button type="button" className="knopf klein" disabled={!an} onClick={() => void tu(() => api.aufgabeDelegieren(a.id, an))}>Weitergeben</button>
                <button type="button" className="textknopf" onClick={() => setWeiter(false)}>Abbrechen</button>
              </span>}
        </div>
      )}
      {fehler && <p className="fehlertext">{fehler}</p>}
    </li>
  );
}

/** Hinweis über der Mappe mit allen offenen Aufgaben. */
export function AufgabenHinweis({ aufgaben, neuLaden }: { aufgaben: Aufgabe[]; neuLaden: () => Promise<void> }) {
  const offen = aufgaben.filter((a) => !a.erledigt);
  if (!offen.length) return null;
  return (
    <div className="hinweis warn stapel aufgabenhinweis" role="status">
      <ul>{offen.map((a) => <Zeile key={a.id} a={a} neuLaden={neuLaden} />)}</ul>
    </div>
  );
}

/** Aufgabe von Hand vergeben. */
export function NeueAufgabe({ mappeId, neuLaden, schliessen }: { mappeId: string; neuLaden: () => Promise<void>; schliessen: () => void }) {
  const d = useDaten();
  const [an, setAn] = useState('');
  const [text, setText] = useState('');
  const [fehler, setFehler] = useState<string>();
  async function senden() {
    setFehler(undefined);
    try { await api.aufgabeAnlegen(mappeId, an, text); await neuLaden(); await d.neuLaden(); schliessen(); } catch (e) { setFehler((e as Error).message); }
  }
  return (
    <section className="blatt" aria-label="Aufgabe vergeben">
      <div className="blattkopf zeile-zwischen"><h2 className="h3">Aufgabe vergeben</h2><button type="button" className="textknopf" onClick={schliessen}>Schließen</button></div>
      <div className="raster">
        <label className="eigenschaft"><span>Für</span><BenutzerWahl label="Empfänger" wert={an} setze={setAn} /></label>
        <label className="eigenschaft breit"><span>Was ist zu tun?</span><input value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="z. B. Bitte Rechnung prüfen und bezahlen" /></label>
      </div>
      <p className="leise klein">Die Mappe erscheint im Eingang des Empfängers, bis er die Aufgabe erledigt oder weitergibt.</p>
      {fehler && <p className="fehlertext">{fehler}</p>}
      <div className="knoepfe"><button type="button" className="knopf primaer" disabled={!an || !text.trim()} onClick={() => void senden()}>Aufgabe vergeben</button></div>
    </section>
  );
}
