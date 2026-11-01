import { useEffect, useState } from 'react';
import { Symbol } from '../Symbol';
import { AUFGABENARTEN, type Aufgabe } from '../../../shared/src/model';
import { datumDe, type Erinnerung } from '../../../shared/src/fristen';
import { heuteIn, verschiebe } from '../../../shared/src/sichten';
import { api } from '../api';
import { nameMitAbwesenheit, useDaten } from '../daten';
import { useKonto } from '../konto';
import { Person } from '../Person';
import { Hilfe } from '../Hilfe';
import { rueckfrage } from '../rueckfrage';

/** Aufgaben an einer Mappe (#54): offene als Hinweis über der Mappe; eigene erledigen oder weitergeben. */
const datum = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'short' });

export function BenutzerWahl({ wert, setze, ohne, label, fokus }: { wert: string; setze: (id: string) => void; ohne?: string | null; label: string; fokus?: boolean }) {
  const d = useDaten();
  return (
    <select aria-label={label} value={wert} autoFocus={fokus} onChange={(e) => setze(e.target.value)}>
      <option value="">– Benutzer wählen –</option>
      {d.personen.filter((p) => p.aktiv !== false && p.id !== ohne).map((p) => <option key={p.id} value={p.id}>{nameMitAbwesenheit(p)}</option>)}
    </select>
  );
}

type Folge = { aufgabe: Aufgabe; datum: string };

function Zeile({ a, neuLaden, setBestaetigt, setFolge }: { a: Aufgabe; neuLaden: () => Promise<void>; setBestaetigt: (t: string) => void; setFolge: (f: Folge) => void }) {
  const d = useDaten();
  const { ich } = useKonto();
  const [weiter, setWeiter] = useState(false);
  const [an, setAn] = useState('');
  const [fehler, setFehler] = useState<string>();
  const meine = a.empfaengerId === ich.id || (!a.empfaengerId && ich.rolle === 'admin');
  const darf = meine || ich.rolle === 'admin';
  async function tu(f: () => Promise<unknown>, meldung?: string) {
    setFehler(undefined);
    try {
      const r = await f() as { hinweis?: string; folgetermin?: string } | null;
      setWeiter(false); setAn('');
      // Wiederkehrende Frist (#130): nächsten Termin vorschlagen.
      if (r?.folgetermin) setFolge({ aufgabe: a, datum: r.folgetermin });
      // Empfänger darf die Mappe nicht lesen (#127): trotzdem vergeben, aber Bescheid sagen.
      if (meldung || r?.hinweis) setBestaetigt([meldung, r?.hinweis].filter(Boolean).join(' '));
      await neuLaden(); await d.neuLaden();
    } catch (e) { setFehler((e as Error).message); }
  }
  return (
    <li className={meine ? 'meine' : ''}>
      <div className="aufgabentext">
        <strong>{meine ? 'Für dich' : <>Für {a.empfaengerId ? <Person id={a.empfaengerId} /> : 'Administratoren'}</>}:</strong> {a.text}
        {a.art === 'frist' && a.datum && <span className={`chip ${a.datum <= heuteIn() ? 'schlecht' : 'warn'}`} title="Frist">{noch(a.datum)}</span>}
        <span className="leise klein"> · {AUFGABENARTEN[a.art]} seit {datum(a.erstellt)}{a.erstelltVon && <> von <Person id={a.erstelltVon} /></>}</span>
      </div>
      {darf && !weiter && (
        <div className="aufgabenaktionen">
          {a.art !== 'passung' && <button type="button" className="knopf klein" onClick={() => void tu(() => api.aufgabeErledigt(a.id))}>Erledigt</button>}
          <button type="button" className="knopf klein" onClick={() => setWeiter(true)}>Weitergeben</button>
        </div>
      )}
      {darf && weiter && (
        <form className="weitergeben" onSubmit={(e) => { e.preventDefault(); if (an) void tu(() => api.aufgabeDelegieren(a.id, an), `An ${d.person(an)} weitergegeben.`); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setWeiter(false); setAn(''); } }}>
          <span className="leise klein">Weitergeben an</span>
          <BenutzerWahl label="Weitergeben an" wert={an} setze={setAn} ohne={a.empfaengerId} fokus />
          <button className="knopf klein primaer" disabled={!an}>Weitergeben</button>
          <button type="button" className="textknopf" onClick={() => { setWeiter(false); setAn(''); }}>Abbrechen</button>
        </form>
      )}
      {fehler && <p className="fehlertext">{fehler}</p>}
    </li>
  );
}

/** Hinweis über der Mappe mit allen offenen Aufgaben. */
export function AufgabenHinweis({ aufgaben, neuLaden }: { aufgaben: Aufgabe[]; neuLaden: () => Promise<void> }) {
  const offen = aufgaben.filter((a) => !a.erledigt);
  const [bestaetigt, setBestaetigt] = useState<string>();
  const [folge, setFolge] = useState<Folge>();
  useEffect(() => { if (!bestaetigt) return; const t = window.setTimeout(() => setBestaetigt(undefined), 6000); return () => window.clearTimeout(t); }, [bestaetigt]);
  const vorschlag = folge && <Folgetermin f={folge} neuLaden={neuLaden} fertig={(t) => { setFolge(undefined); if (t) setBestaetigt(t); }} />;
  if (!offen.length) return bestaetigt || vorschlag ? <>{vorschlag}{bestaetigt && <div className="hinweis gut" role="status"><p>{bestaetigt}</p></div>}</> : null;
  return (
    <>
      {vorschlag}
      <div className="hinweis warn stapel aufgabenhinweis" role="status">
        <ul>{offen.map((a) => <Zeile key={a.id} a={a} neuLaden={neuLaden} setBestaetigt={setBestaetigt} setFolge={setFolge} />)}</ul>
        {bestaetigt && <p className="gutertext klein">{bestaetigt}</p>}
      </div>
    </>
  );
}

/** „noch 12 Tage“, „heute“, „seit 3 Tagen“ bis zur Frist. */
function noch(iso: string): string {
  const tage = Math.round((Date.parse(iso) - Date.parse(heuteIn())) / 86_400_000);
  return tage === 0 ? 'heute' : tage === 1 ? 'morgen' : tage > 0 ? `noch ${tage} Tage` : tage === -1 ? 'seit gestern' : `seit ${-tage} Tagen`;
}

/** Wiederkehrende Frist erledigt (#130): „Datum auf … setzen“ – nie automatisch. */
function Folgetermin({ f, neuLaden, fertig }: { f: Folge; neuLaden: () => Promise<void>; fertig: (meldung?: string) => void }) {
  const d = useDaten();
  const [fehler, setFehler] = useState<string>();
  async function setzen() {
    try { const r = await api.folgetermin(f.aufgabe.id); await neuLaden(); await d.neuLaden(); fertig(r.hinweis ?? `Nächster Termin eingetragen: ${datumDe(f.datum)}.`); }
    catch (e) { setFehler((e as Error).message); }
  }
  return (
    <div className="hinweis info folgetermin" role="status">
      <p>Erledigt. Der Termin wiederholt sich – <strong>nächsten Termin auf {datumDe(f.datum)} setzen?</strong></p>
      <div className="knoepfe">
        <button type="button" className="knopf klein primaer" onClick={() => void setzen()}>Datum auf {datumDe(f.datum)} setzen</button>
        <button type="button" className="textknopf" onClick={() => fertig()}>Nein, danke</button>
      </div>
      {fehler && <p className="fehlertext">{fehler}</p>}
    </div>
  );
}

/** Noch nicht fällige Erinnerungen an der Mappe (#131): ändern und löschen (Ersteller und Empfänger). */
export function Erinnerungen({ liste, neuLaden }: { liste: Erinnerung[]; neuLaden: () => Promise<void> }) {
  const { ich } = useKonto();
  const [bearbeiten, setBearbeiten] = useState<string>();
  const [fehler, setFehler] = useState<string>();
  if (!liste.length) return null;
  async function loeschen(e: Erinnerung) {
    if (!(await rueckfrage({ titel: 'Erinnerung löschen?', text: `„${e.text}“`, ja: 'Löschen', gefahr: true }))) return;
    try { await api.erinnerungLoeschen(e.id); await neuLaden(); } catch (x) { setFehler((x as Error).message); }
  }
  return (
    <div className="hinweis info stapel erinnerungen" role="status">
      <ul>{liste.map((e) => {
        const darf = e.erstelltVon === ich.id || e.empfaengerId === ich.id || ich.rolle === 'admin';
        return bearbeiten === e.id
          ? <li key={e.id}><ErinnerungFormular mappeId={e.mappeId} e={e} neuLaden={neuLaden} schliessen={() => setBearbeiten(undefined)} eingebettet /></li>
          : (
            <li key={e.id}>
              <div className="aufgabentext"><Symbol name="erinnern" />{' '}<strong>{datumDe(e.datum)}</strong> für {e.empfaengerId === ich.id ? 'dich' : <Person id={e.empfaengerId} />}: {e.text}</div>
              {darf && <div className="aufgabenaktionen">
                <button type="button" className="knopf klein" onClick={() => setBearbeiten(e.id)}>Ändern</button>
                <button type="button" className="textknopf gefahr klein" onClick={() => void loeschen(e)}>Löschen</button>
              </div>}
            </li>
          );
      })}</ul>
      {fehler && <p className="fehlertext">{fehler}</p>}
    </div>
  );
}

/** Erinnern (#131): Datum, Text, für mich oder jemand anderen. */
export function ErinnerungFormular({ mappeId, e, neuLaden, schliessen, eingebettet }: { mappeId: string; e?: Erinnerung; neuLaden: () => Promise<void>; schliessen: () => void; eingebettet?: boolean }) {
  const d = useDaten();
  const { ich } = useKonto();
  const [datum, setDatum] = useState(e?.datum ?? verschiebe(heuteIn(), 7));
  const [text, setText] = useState(e?.text ?? '');
  const [an, setAn] = useState(e?.empfaengerId ?? ich.id);
  const [fehler, setFehler] = useState<string>();
  const [hinweis, setHinweis] = useState<string>();
  async function senden() {
    setFehler(undefined);
    try {
      const x = { datum, text, empfaengerId: an || undefined };
      const r = e ? await api.erinnerungAendern(e.id, x) : await api.erinnerungAnlegen(mappeId, x);
      await neuLaden(); await d.neuLaden();
      if (r.hinweis) setHinweis(r.hinweis); else schliessen();
    } catch (x) { setFehler((x as Error).message); }
  }
  const inhalt = (
    <>
      <div className="raster">
        <label className="eigenschaft"><span>Am</span><input type="date" value={datum} onChange={(x) => setDatum(x.target.value)} /></label>
        <label className="eigenschaft"><span>Für</span><BenutzerWahl label="Erinnerung für" wert={an} setze={setAn} /></label>
        <label className="eigenschaft breit"><span>Woran?</span><input value={text} maxLength={500} onChange={(x) => setText(x.target.value)} placeholder="z. B. Angebote vergleichen" autoFocus /></label>
      </div>
      <p className="leise klein">Am gewählten Tag steht die Mappe unter „Zu erledigen“{an === ich.id ? '' : ' des Empfängers'}; bis dahin unter „Anstehend“.</p>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {hinweis && <div className="hinweis warn"><p>{hinweis}</p></div>}
      <div className="knoepfe">
        {eingebettet && <button type="button" className="textknopf" onClick={schliessen}>Abbrechen</button>}
        <button type="button" className="knopf primaer" disabled={!datum || !text.trim() || !an} onClick={() => void senden()}>{e ? 'Erinnerung ändern' : 'Erinnern'}</button>
      </div>
    </>
  );
  if (eingebettet) return <div className="erinnerungformular">{inhalt}</div>;
  return (
    <section className="blatt" aria-label="Erinnern">
      <div className="blattkopf zeile-zwischen"><h2 className="h3">Erinnern <Hilfe ort="ablage.erinnern" /></h2><button type="button" className="textknopf" onClick={schliessen}>Schließen</button></div>
      {inhalt}
    </section>
  );
}

/** Aufgabe von Hand vergeben. */
export function NeueAufgabe({ mappeId, neuLaden, schliessen }: { mappeId: string; neuLaden: () => Promise<void>; schliessen: () => void }) {
  const d = useDaten();
  const [an, setAn] = useState('');
  const [text, setText] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [hinweis, setHinweis] = useState<string>();
  async function senden() {
    setFehler(undefined);
    try {
      const r = await api.aufgabeAnlegen(mappeId, an, text);
      await neuLaden(); await d.neuLaden();
      // Empfänger darf die Mappe nicht lesen (#127): Maske offen lassen, Hinweis zeigen.
      if (r.hinweis) { setHinweis(r.hinweis); setText(''); setAn(''); } else schliessen();
    } catch (e) { setFehler((e as Error).message); }
  }
  return (
    <section className="blatt" aria-label="Aufgabe vergeben">
      <div className="blattkopf zeile-zwischen"><h2 className="h3">Aufgabe vergeben</h2><button type="button" className="textknopf" onClick={schliessen}>Schließen</button></div>
      <div className="raster">
        <label className="eigenschaft"><span>Für</span><BenutzerWahl label="Empfänger" wert={an} setze={setAn} /></label>
        <label className="eigenschaft breit"><span>Was ist zu tun?</span><input value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="z. B. Bitte Rechnung prüfen und bezahlen" /></label>
      </div>
      <p className="leise klein">Die Mappe erscheint beim Empfänger unter „Zu erledigen“, bis er die Aufgabe erledigt oder weitergibt.</p>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {hinweis && <div className="hinweis warn" role="status"><p>{hinweis}</p></div>}
      <div className="knoepfe"><button type="button" className="knopf primaer" disabled={!an || !text.trim()} onClick={() => void senden()}>Aufgabe vergeben</button></div>
    </section>
  );
}
