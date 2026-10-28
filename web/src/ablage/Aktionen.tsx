import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatiere, standardRegister, type Mappentyp } from '../../../shared/src/model';
import { api, type MappeDetails } from '../api';
import { useDaten } from '../daten';
import { useKonto } from '../konto';
import { Link } from '../ort';
import { titelOder } from '../seiten';
import { Formatiert } from './Formatiert';
import { NamenOhneLinks } from '../Person';

/** Aktionen an der Mappe (#58): per E-Mail versenden, als PDF exportieren, Link kopieren (#98). */

const groesse = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
/** Ab hier lehnen manche Mailserver ab; die Oberfläche warnt, der Server erlaubt bis 50 MB. */
export const EMAIL_WARNUNG = 20 * 1024 * 1024;
const EMAIL_HOECHSTENS = 50_000_000;

export function Aktionsmenue({ aufgabe, email, drucken, link }: { aufgabe(): void; email(): void; drucken(): void; link?: () => void }) {
  const [offen, setOffen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!offen) return;
    const zu = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOffen(false);
    };
    document.addEventListener('mousedown', zu); document.addEventListener('keydown', zu);
    return () => { document.removeEventListener('mousedown', zu); document.removeEventListener('keydown', zu); };
  }, [offen]);
  const waehle = (f: () => void) => () => { setOffen(false); f(); };
  return (
    <div className="aktionsmenue" ref={ref}>
      <button type="button" className={`knopf klein ${offen ? 'an' : ''}`} aria-haspopup="menu" aria-expanded={offen} onClick={() => setOffen(!offen)}>
        Aktionen <span aria-hidden="true">▾</span>
      </button>
      {offen && (
        <div className="menue" role="menu">
          <button type="button" role="menuitem" onClick={waehle(aufgabe)}><span aria-hidden="true">✓</span> Aufgabe vergeben</button>
          <button type="button" role="menuitem" onClick={waehle(email)}><span aria-hidden="true">✉</span> Per E-Mail versenden</button>
          <button type="button" role="menuitem" onClick={waehle(drucken)}><span aria-hidden="true">⎙</span> Als PDF exportieren</button>
          {link && <button type="button" role="menuitem" onClick={waehle(link)} title="Sprechender Link über Typ und Feldwerte, z. B. zum Weitergeben per Mail oder Chat"><span aria-hidden="true">🔗</span> Link kopieren</button>}
        </div>
      )}
    </div>
  );
}

export function EmailMaske({ typ, details, neuLaden, schliessen }: { typ: Mappentyp; details: MappeDetails; neuLaden: () => Promise<void>; schliessen(): void }) {
  const d = useDaten();
  const { ich } = useKonto();
  const mappe = details.mappe;
  const [bereit, setBereit] = useState<boolean | null>(null);
  const [an, setAn] = useState('');
  const [betreff, setBetreff] = useState(`${typ.name}: ${titelOder(mappe.titel)}`);
  const [nachricht, setNachricht] = useState('');
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(() => new Set(details.dokumente.map((x) => x.id)));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [fertig, setFertig] = useState<{ id: string; typId: string }>();
  useEffect(() => { api.emailBereit().then((r) => setBereit(r.bereit), () => setBereit(false)); }, []);
  const summe = details.dokumente.filter((x) => gewaehlt.has(x.id)).reduce((a, x) => a + x.groesse, 0);
  const umschalten = (id: string) => setGewaehlt((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function senden() {
    setFehler(undefined); setLaeuft(true);
    try {
      setFertig(await api.emailSenden(mappe.id, { an, betreff, nachricht, dokumente: [...gewaehlt] }));
      await neuLaden(); await d.neuLaden();
    } catch (e) { setFehler((e as Error).message); } finally { setLaeuft(false); }
  }

  return (
    <section className="blatt" aria-label="Per E-Mail versenden">
      <div className="blattkopf zeile-zwischen"><h2 className="h3">Per E-Mail versenden</h2><button type="button" className="textknopf" onClick={schliessen}>Schließen</button></div>
      {fertig ? (
        <>
          <p className="gutertext" role="status">Die E-Mail ist verschickt.</p>
          <p className="leise">Sie ist als Mappe vom Typ „E-Mail“ abgelegt und steht im Protokoll dieser Mappe.</p>
          <div className="knoepfe"><Link to={`/ablage/${fertig.typId}/${fertig.id}`} className="knopf">E-Mail öffnen</Link></div>
        </>
      ) : bereit === false ? (
        <div className="hinweis warn"><p>Der E-Mail-Versand ist nicht eingerichtet.{ich?.rolle === 'admin' ? <> Das geht unter <Link to="/werkbank/betrieb" className="verweis">Werkbank → E-Mail und Adresse</Link>.</> : ' Bitte einen Administrator, ihn in der Werkbank einzurichten.'}</p></div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void senden(); }}>
          <div className="raster">
            <label className="eigenschaft breit"><span>An <small>mehrere durch Komma getrennt</small></span><input type="text" inputMode="email" autoComplete="email" value={an} onChange={(e) => setAn(e.target.value)} placeholder="name@example.org" required /></label>
            <label className="eigenschaft breit"><span>Betreff</span><input value={betreff} maxLength={250} onChange={(e) => setBetreff(e.target.value)} required /></label>
            <label className="eigenschaft breit"><span>Nachricht</span><textarea rows={5} value={nachricht} onChange={(e) => setNachricht(e.target.value)} /></label>
          </div>
          <fieldset className="anhaenge">
            <legend>Anhänge</legend>
            {!details.dokumente.length ? <p className="leise klein">Diese Mappe hat keine Dokumente.</p> : (
              <ul>
                {details.dokumente.map((x) => (
                  <li key={x.id}><label className="haken"><input type="checkbox" checked={gewaehlt.has(x.id)} onChange={() => umschalten(x.id)} /><span>{x.name} <small className="leise">{groesse(x.groesse)}</small></span></label></li>
                ))}
              </ul>
            )}
            {details.dokumente.length > 0 && <p className={`klein ${summe > EMAIL_WARNUNG ? 'fehlertext' : 'leise'}`}>
              Zusammen {groesse(summe)}.{summe > EMAIL_HOECHSTENS ? ' Das ist zu groß zum Versenden; bitte weniger auswählen.' : summe > EMAIL_WARNUNG ? ' Viele Mailserver nehmen E-Mails über 20 MB nicht an.' : ''}
            </p>}
          </fieldset>
          <p className="leise klein">Absender ist die Adresse des DMS. Antworten gehen an dich ({ich?.email}).</p>
          {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
          <div className="knoepfe"><button className="knopf primaer" disabled={laeuft || bereit === null || !an.trim() || !betreff.trim() || summe > EMAIL_HOECHSTENS}>{laeuft ? 'Wird verschickt …' : 'Senden'}</button></div>
        </form>
      )}
    </section>
  );
}

/**
 * Druckansicht (#58): alle Felder, Dokumente und Notizen der Mappe auf Papier-Maß;
 * der Browser speichert sie über „Als PDF speichern“.
 */
export function Druckansicht({ typ, details, fertig }: { typ: Mappentyp; details: MappeDetails; fertig(): void }) {
  const d = useDaten();
  const mappe = details.mappe;
  useEffect(() => {
    document.body.classList.add('druckt');
    const ende = () => fertig();
    window.addEventListener('afterprint', ende);
    const t = window.setTimeout(() => window.print(), 50);
    return () => { window.clearTimeout(t); window.removeEventListener('afterprint', ende); document.body.classList.remove('druckt'); };
  }, [fertig]);
  const titelVon = (id: string) => titelOder(details.bezuege[id]?.titel);
  const register = typ.register?.length ? typ.register : standardRegister(typ.felder);
  const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  return createPortal(
    <NamenOhneLinks><article className="druckansicht">
      <p className="ueber">{typ.name}</p>
      <h1>{titelOder(mappe.titel)}</h1>
      <p className="klein">Angelegt {zeit(mappe.erstellt)} von {d.person(mappe.erstelltVon)} · zuletzt geändert {zeit(mappe.geaendert)} von {d.person(mappe.geaendertVon)}</p>
      {register.filter((r) => r.art === 'felder').map((r) => {
        const felder = (r.felder ?? []).map((k) => typ.felder.find((f) => f.key === k)).filter((f) => !!f);
        return (
          <section key={r.key}>
            {register.filter((x) => x.art === 'felder').length > 1 && <h2>{r.name}</h2>}
            <table><tbody>
              {felder.map((f) => (
                <tr key={f.key}><th>{f.label}</th><td>{f.typ === 'formatiert' && mappe.werte[f.key] ? <Formatiert text={String(mappe.werte[f.key])} /> : formatiere(f, mappe.werte[f.key], titelVon) || '–'}</td></tr>
              ))}
            </tbody></table>
          </section>
        );
      })}
      {details.dokumente.length > 0 && <section><h2>Dokumente</h2><ul>{details.dokumente.map((x) => <li key={x.id}>{x.name} ({groesse(x.groesse)})</li>)}</ul></section>}
      {(details.notizen ?? []).length > 0 && <section><h2>Notizen</h2>{details.notizen.map((n) => <div key={n.id} className="notiz"><p className="klein">{zeit(n.erstellt)} · {d.person(n.erstelltVon)}</p><Formatiert text={n.text} /></div>)}</section>}
      <p className="klein fuss">Gedruckt am {new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</p>
    </article></NamenOhneLinks>,
    document.body,
  );
}
