import { useCallback, useEffect, useState } from 'react';
import { BUNDESLAENDER } from '../../../shared/src/feiertage';
import { AUFGABENARTEN, type Aufgabe } from '../../../shared/src/model';
import { api, type MailEinstellung } from '../api';
import { BenutzerWahl } from '../ablage/Aufgaben';
import { useDaten } from '../daten';
import { Link } from '../ort';
import { titelOder } from '../seiten';
import { Person } from '../Person';
import { Hilfe } from '../Hilfe';

/** Werkbank → Aufgaben (#54): alle offenen (oder erledigten) Aufgaben, weitergeben, tägliche Mail. */
const datum = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

export function useAufgaben(aktiv: boolean) {
  const [erledigt, setErledigt] = useState(false);
  const [liste, setListe] = useState<Aufgabe[] | null>(null);
  const [mail, setMail] = useState<MailEinstellung | null>(null);
  const [unlesbar, setUnlesbar] = useState<Set<string>>(new Set());
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { const r = await api.aufgabenWerkbank(erledigt); setListe(r.aufgaben); setMail(r.mail); setUnlesbar(new Set(r.unlesbar ?? [])); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, [erledigt]);
  useEffect(() => { if (aktiv) void laden(); }, [aktiv, laden]);
  return { liste, mail, setMail, erledigt, setErledigt, fehler, laden, unlesbar };
}
export type AufgabenZustand = ReturnType<typeof useAufgaben>;

export function AufgabenListe({ z }: { z: AufgabenZustand }) {
  const d = useDaten();
  const [fehler, setFehler] = useState<string>();
  const liste = z.liste ?? [];
  async function weiter(a: Aufgabe, an: string) {
    setFehler(undefined);
    try { await api.aufgabeDelegieren(a.id, an); await z.laden(); await d.neuLaden(); } catch (e) { setFehler((e as Error).message); }
  }
  return (
    <>
      <div className="listenkopf">
        <div><h1>Aufgaben</h1><p className="leise klein">{z.erledigt ? 'Zuletzt erledigte Aufgaben.' : 'Was an welcher Mappe für wen zu tun ist.'} <Hilfe ort="werkbank.aufgaben" /></p></div>
        <button type="button" className="knopf klein" onClick={() => z.setErledigt(!z.erledigt)}>{z.erledigt ? 'Offene zeigen' : 'Erledigte zeigen'}</button>
      </div>
      {(z.fehler || fehler) && <div className="hinweis schlecht"><p>{z.fehler ?? fehler}</p></div>}
      {!z.erledigt && z.unlesbar.size > 0 && <div className="hinweis warn"><p>{z.unlesbar.size === 1 ? 'Eine Frist oder Erinnerung ging' : `${z.unlesbar.size} Fristen oder Erinnerungen gingen`} an jemanden, der die Mappe nach den Berechtigungen nicht lesen darf. Gib sie weiter oder passe die Berechtigungen an.</p></div>}
      <div className="listenrumpf">
        {z.liste === null ? <p className="leise">Lade …</p> : !liste.length ? <p className="leise leerliste">{z.erledigt ? 'Noch nichts erledigt.' : 'Keine offenen Aufgaben.'}</p> : (
          <ul className="mappenliste">
            {liste.map((a) => (
              <li key={a.id}>
                <Link to={`/ablage/${a.typId}/${a.mappeId}`} className="eintrag">
                  <span className="titel">{titelOder(a.mappeTitel)}</span>
                  <span className="unter">{d.typ(a.typId)?.name} · {AUFGABENARTEN[a.art]} · {datum(z.erledigt && a.erledigt ? a.erledigt : a.erstellt)}</span>
                  <span className="unter">{a.text}</span>
                  {!z.erledigt && z.unlesbar.has(a.id) && <span className="problem">Empfänger darf die Mappe nicht lesen</span>}
                </Link>
                <div className="aufgabenzeile">
                  {z.erledigt
                    ? <span className="leise klein">erledigt von {a.erledigtVon ? <Person id={a.erledigtVon} /> : 'selbst (Mappe passt wieder)'}</span>
                    : <><span className="leise klein">für {a.empfaengerId ? <Person id={a.empfaengerId} /> : 'Administratoren'} · weitergeben an</span>
                        <BenutzerWahl label={`Aufgabe „${a.text}“ weitergeben an`} wert="" setze={(an) => { if (an) void weiter(a, an); }} ohne={a.empfaengerId} /></>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function AufgabenPanel({ z }: { z: AufgabenZustand }) {
  const [e, setE] = useState<MailEinstellung>(z.mail ?? { aktiv: true, uhrzeit: '07:00', bundesland: null });
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  useEffect(() => { if (z.mail) setE(z.mail); }, [z.mail]);
  async function speichern() {
    try { z.setMail(await api.aufgabenMailSpeichern(e)); setMeldung({ art: 'gut', text: 'Gespeichert.' }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  async function senden() {
    try { const r = await api.aufgabenMailSenden(); setMeldung({ art: 'gut', text: r.verschickt ? `${r.verschickt} ${r.verschickt === 1 ? 'Mail' : 'Mails'} verschickt.` : 'Niemand hat gerade offene Aufgaben (oder alle haben abbestellt).' }); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Aufgaben</h1>
        <p className="leise">Aufgaben entstehen, wenn eine Mappe nicht mehr zur Definition passt (für ihren Ersteller), wenn jemand in einem formatierten Text erwähnt wird, oder von Hand an der Mappe. Jede Mappe mit offener Aufgabe steht unter „Zu erledigen“ ihres Empfängers. Weitergeben dürfen der Empfänger und Administratoren; das steht im Protokoll.</p>
      </div>
      <form className="blatt" onSubmit={(ev) => { ev.preventDefault(); void speichern(); }}>
        <h2 className="h3">Tägliche Zusammenfassung</h2>
        <p className="leise">Statt einer Mail je Aufgabe bekommt jeder mit offenen Aufgaben die Tägliche Zusammenfassung. Jeder kann sie im Profil anpassen oder abbestellen. Braucht den E-Mail-Versand (Werkbank → E-Mail und Adresse).</p>
        <label className="haken"><input type="checkbox" checked={e.aktiv} onChange={(x) => setE({ ...e, aktiv: x.target.checked })} /><span>Zusammenfassung verschicken</span></label>
        <div className="raster">
          <label className="eigenschaft"><span>Standard-Uhrzeit <small>für alle, die im Profil keine eigene gewählt haben</small></span><input type="time" step={900} value={e.uhrzeit} onChange={(x) => setE({ ...e, uhrzeit: x.target.value })} /></label>
          <label className="eigenschaft"><span>Bundesland <small>für Feiertage ohne Zusammenfassung</small></span>
            <select value={e.bundesland ?? ''} onChange={(x) => setE({ ...e, bundesland: x.target.value || null })}>
              <option value="">keins – Feiertage nicht berücksichtigen</option>
              {Object.entries(BUNDESLAENDER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
        </div>
        <p className="leise klein">Jeder wählt im Profil Uhrzeit und Wochentage selbst (Standard: Montag bis Freitag) und ob an Feiertagen keine kommt. Berücksichtigt werden die landesweiten gesetzlichen Feiertage; solche, die nur in einzelnen Gemeinden gelten (z. B. Mariä Himmelfahrt in Teilen Bayerns), nicht.</p>
        {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
        <div className="knoepfe">
          <button type="button" className="knopf" onClick={() => void senden()}>Jetzt senden</button>
          <button className="knopf primaer" disabled={JSON.stringify(e) === JSON.stringify(z.mail)}>Speichern</button>
        </div>
      </form>
    </div>
  );
}
