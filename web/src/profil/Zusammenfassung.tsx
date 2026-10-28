import { useEffect, useState } from 'react';
import { BUNDESLAENDER, type Bundesland } from '../../../shared/src/feiertage';
import { api, type Zusammenfassung } from '../api';

/** Profil: tägliche Zusammenfassung der Aufgaben – an/aus, Uhrzeit, Wochentage, Feiertage (#54, #92, #94). */
const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const UHRZEITEN = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);

export function ZusammenfassungEinstellen() {
  const [z, setZ] = useState<Zusammenfassung | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [gespeichert, setGespeichert] = useState(false);
  useEffect(() => { api.zusammenfassung().then(setZ, (e: Error) => setFehler(e.message)); }, []);
  async function setze(n: Partial<Zusammenfassung>) {
    if (!z) return;
    const neu = { ...z, ...n };
    setZ(neu); setFehler(undefined); setGespeichert(false);
    try { setZ(await api.zusammenfassungSetzen({ aktiv: neu.aktiv, uhrzeit: neu.uhrzeit, tage: neu.tage, feiertage: neu.feiertage })); setGespeichert(true); }
    catch (e) { setFehler((e as Error).message); setZ(z); }
  }
  if (!z) return fehler ? <p className="fehlertext">{fehler}</p> : <p className="leise">Lade …</p>;
  const land = z.standard.bundesland ? BUNDESLAENDER[z.standard.bundesland as Bundesland] : null;
  return (
    <>
      <label className="haken"><input type="checkbox" checked={z.aktiv} onChange={(e) => void setze({ aktiv: e.target.checked })} />
        <span>Tägliche Zusammenfassung meiner Aufgaben per E-Mail</span></label>
      {z.aktiv && <div className="zusammenfassung">
        <label className="eigenschaft schmal"><span>Uhrzeit</span>
          <select value={z.uhrzeit ?? ''} onChange={(e) => void setze({ uhrzeit: e.target.value || null })}>
            <option value="">Standard ({z.standard.uhrzeit} Uhr)</option>
            {UHRZEITEN.map((u) => <option key={u} value={u}>{u} Uhr</option>)}
          </select></label>
        <fieldset className="wahl tagewahl"><legend>Wochentage</legend>
          <div className="tage">{TAGE.map((t, i) => (
            <label key={t} className="haken"><input type="checkbox" checked={z.tage.includes(i + 1)}
              onChange={(e) => void setze({ tage: e.target.checked ? [...z.tage, i + 1].sort() : z.tage.filter((x) => x !== i + 1) })} /><span>{t}</span></label>
          ))}</div>
        </fieldset>
        {!z.tage.length && <p className="hinweis warn klein">Kein Wochentag gewählt – die Zusammenfassung kommt dann nie.</p>}
        <label className={`haken ${land ? '' : 'aus'}`}><input type="checkbox" disabled={!land} checked={!!land && z.feiertage} onChange={(e) => void setze({ feiertage: e.target.checked })} />
          <span>Nicht an Feiertagen<small className="hilfe">{land ? `Gesetzliche Feiertage in ${land}.` : 'Dafür muss ein Administrator in der Werkbank das Bundesland wählen.'}</small></span></label>
        {!z.versand && <p className="leise klein">Der E-Mail-Versand ist gerade nicht eingerichtet oder ausgeschaltet; deine Einstellung gilt, sobald er läuft.</p>}
      </div>}
      {fehler && <p className="fehlertext">{fehler}</p>}
      {gespeichert && <p className="gutertext" role="status">Gespeichert.</p>}
    </>
  );
}
