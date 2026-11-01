import { useState } from 'react';
import type { Notiz } from '../../../shared/src/model';
import { api } from '../api';
import { Formatiert, FormatiertEingabe } from './Formatiert';
import { Person } from '../Person';
import { rueckfrage } from '../rueckfrage';

/** Notizen an einer Mappe (#55): lesen, anlegen, bearbeiten, löschen – jeder darf alles. Seit #427 ein System-Register. */
const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

export function Notizen({ mappeId, notizen, neuLaden }: { mappeId: string; notizen: Notiz[]; neuLaden: () => Promise<void> }) {
  const [neu, setNeu] = useState('');
  const [bearbeite, setBearbeite] = useState<{ id: string; text: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();

  async function tu(f: () => Promise<unknown>) {
    setLaeuft(true); setFehler(undefined);
    try { await f(); await neuLaden(); return true; } catch (e) { setFehler((e as Error).message); return false; } finally { setLaeuft(false); }
  }

  return (
    <section className="notizen notizregister" aria-label="Notizen">
      {!notizen.length && <p className="leise">Noch keine Notizen. Notizen ergänzen die Mappe, ohne ihre Angaben zu ändern.</p>}
      <ul className="notizliste">
        {notizen.map((n) => (
          <li key={n.id}>
            <div className="notizkopf leise klein">
              <Person id={n.erstelltVon} /> · {zeit(n.erstellt)}{n.geaendert !== n.erstellt && n.geaendert.slice(0, 16) !== n.erstellt.slice(0, 16) && <> · geändert {zeit(n.geaendert)}{n.geaendertVon !== n.erstelltVon && <> von <Person id={n.geaendertVon} /></>}</>}
              {bearbeite?.id !== n.id && <span className="zeilenaktionen">
                <button type="button" className="textknopf" onClick={() => setBearbeite({ id: n.id, text: n.text })}>Bearbeiten</button>
                <button type="button" className="textknopf gefahr" disabled={laeuft} onClick={async () => { if (await rueckfrage({ titel: 'Diese Notiz löschen?', ja: 'Löschen', gefahr: true })) void tu(() => api.notizLoeschen(n.id)); }}>Löschen</button>
              </span>}
            </div>
            {bearbeite?.id === n.id
              ? <>
                  <FormatiertEingabe id={`notiz-${n.id}`} wert={bearbeite.text} setze={(text) => setBearbeite({ id: n.id, text })} />
                  <div className="knoepfe">
                    <button type="button" className="knopf" onClick={() => setBearbeite(null)}>Abbrechen</button>
                    <button type="button" className="knopf primaer" disabled={laeuft || !bearbeite.text.trim()} onClick={() => void tu(() => api.notizAendern(n.id, bearbeite.text)).then((ok) => { if (ok) setBearbeite(null); })}>Speichern</button>
                  </div>
                </>
              : <Formatiert text={n.text} />}
          </li>
        ))}
      </ul>
      <div className="neuenotiz">
        <FormatiertEingabe id="neue-notiz" wert={neu} setze={setNeu} />
        <div className="knoepfe">
          <button type="button" className="knopf primaer" disabled={laeuft || !neu.trim()} onClick={() => void tu(() => api.notizAnlegen(mappeId, neu)).then((ok) => { if (ok) setNeu(''); })}>Notiz hinzufügen</button>
        </div>
      </div>
      {fehler && <p className="fehlertext">{fehler}</p>}
    </section>
  );
}
