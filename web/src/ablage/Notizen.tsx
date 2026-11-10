import { useState } from 'react';
import type { Notiz } from '../../../shared/src/model';
import { api } from '../api';
import { Formatiert, FormatiertEingabe } from './Formatiert';
import { Uebersetzbar } from './Uebersetzung';
import { Person } from '../Person';
import { rueckfrage } from '../rueckfrage';
import { t } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { Knopf } from '../bausteine';

/** Notizen an einer Mappe (#55): lesen, anlegen, bearbeiten, löschen – jeder darf alles. Seit #427 ein System-Register. */
const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });

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
    <section className="notizen notizregister" aria-label={t('ablage.notizen.notizen')}>
      {!notizen.length && <p className="leise">{t('ablage.notizen.noch-keine-notizen-notizen')}</p>}
      <ul className="notizliste">
        {notizen.map((n) => (
          <li key={n.id}>
            <div className="notizkopf leise klein">
              <Person id={n.erstelltVon} /> · {zeit(n.erstellt)}{n.geaendert !== n.erstellt && n.geaendert.slice(0, 16) !== n.erstellt.slice(0, 16) && <> {' '}{t('ablage.notizen.geaendert', { zeit: zeit(n.geaendert) })}{n.geaendertVon !== n.erstelltVon && <> {' '}{t('ablage.notizen.von')}{' '}<Person id={n.geaendertVon} /></>}</>}
              {bearbeite?.id !== n.id && <span className="zeilenaktionen">
                <button type="button" className="textknopf" onClick={() => setBearbeite({ id: n.id, text: n.text })}>{t('ablage.notizen.bearbeiten')}</button>
                <Knopf art="link" className="gefahr" gesperrt={laeuft} onClick={async () => { if (await rueckfrage({ titel: t('ablage.notizen.diese-notiz-loeschen'), ja: t('ablage.notizen.loeschen'), gefahr: true })) void tu(() => api.notizLoeschen(n.id)); }}>{t('ablage.notizen.loeschen')}</Knopf>
              </span>}
            </div>
            {bearbeite?.id === n.id
              ? <>
                  <FormatiertEingabe id={`notiz-${n.id}`} wert={bearbeite.text} setze={(text) => setBearbeite({ id: n.id, text })} />
                  <div className="knoepfe">
                    <button type="button" className="knopf" onClick={() => setBearbeite(null)}>{t('ablage.notizen.abbrechen')}</button>
                    <button type="button" className="knopf primaer" disabled={laeuft || !bearbeite.text.trim()} onClick={() => void tu(() => api.notizAendern(n.id, bearbeite.text)).then((ok) => { if (ok) setBearbeite(null); })}>{t('ablage.notizen.speichern')}</button>
                  </div>
                </>
              : <Uebersetzbar quelle={{ art: 'notiz', notiz: n.id }} original={n.text} darstellen={(x) => <Formatiert text={x} />}><Formatiert text={n.text} /></Uebersetzbar>}
          </li>
        ))}
      </ul>
      <div className="neuenotiz">
        <FormatiertEingabe id="neue-notiz" wert={neu} setze={setNeu} />
        <div className="knoepfe">
          <button type="button" className="knopf primaer" disabled={laeuft || !neu.trim()} onClick={() => void tu(() => api.notizAnlegen(mappeId, neu)).then((ok) => { if (ok) setNeu(''); })}>{t('ablage.notizen.notiz-hinzufuegen')}</button>
        </div>
      </div>
      {fehler && <p className="fehlertext">{fehler}</p>}
    </section>
  );
}
