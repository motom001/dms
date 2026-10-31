import { useEffect, useState } from 'react';
import type { Dokument } from '../../../shared/src/model';
import { api } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { useKonto } from '../konto';
import { Link } from '../ort';
import { titelOder } from '../seiten';
import { EMAIL_WARNUNG } from './Aktionen';

/**
 * Mehrere Mappen per E-Mail (#151): eine E-Mail, je Mappe ihre Angaben als PDF und – wählbar – ihre
 * Dokumente. Gleiche Maske wie an der Mappe (#58).
 */
const groesse = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
const EMAIL_HOECHSTENS = 50_000_000;
export const EMAIL_MAPPEN_HOECHSTENS = 100;

interface MappeMitDokumenten { id: string; titel: string; dokumente: Dokument[] }

export function EmailMehrere({ ids, fertig }: { ids: string[]; fertig(meldung?: string): void }) {
  const d = useDaten();
  const { ich } = useKonto();
  const [bereit, setBereit] = useState<boolean | null>(null);
  const [liste, setListe] = useState<MappeMitDokumenten[] | null>(null);
  const [an, setAn] = useState('');
  const [betreff, setBetreff] = useState('');
  const [nachricht, setNachricht] = useState('');
  const [angaben, setAngaben] = useState(true);
  const [umfang, setUmfang] = useState<'alle' | 'keine' | 'auswahl'>('alle');
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [ergebnis, setErgebnis] = useState<{ id: string; typId: string }>();
  const zuViele = ids.length > EMAIL_MAPPEN_HOECHSTENS;

  useEffect(() => { api.emailBereit().then((r) => setBereit(r.bereit), () => setBereit(false)); }, []);
  useEffect(() => {
    if (zuViele) return;
    let ab = false;
    void (async () => {
      const x: MappeMitDokumenten[] = [];
      for (const id of ids) {
        try { const m = await api.mappe(id); x.push({ id, titel: titelOder(m.mappe.titel), dokumente: m.dokumente }); } catch { /* nicht lesbar: der Server lehnt ab */ }
      }
      if (ab) return;
      setListe(x);
      setGewaehlt(new Set(x.flatMap((m) => m.dokumente.map((y) => y.id))));
      if (x.length === 1) setBetreff(x[0].titel);
    })();
    return () => { ab = true; };
    // Die Auswahl kommt als neues Feld bei jedem Zeichnen; neu laden nur, wenn sie sich ändert.
  }, [ids.join(','), zuViele]); // eslint-disable-line react-hooks/exhaustive-deps

  const alleDocs = (liste ?? []).flatMap((m) => m.dokumente);
  const docs = umfang === 'alle' ? alleDocs : umfang === 'keine' ? [] : alleDocs.filter((x) => gewaehlt.has(x.id));
  const summe = docs.reduce((a, x) => a + x.groesse, 0);
  const umschalten = (id: string) => setGewaehlt((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function senden() {
    setFehler(undefined); setLaeuft(true);
    try {
      const r = await api.emailMehrere({ ids, an, betreff, nachricht, angaben, dokumente: umfang === 'alle' ? 'alle' : umfang === 'keine' ? [] : [...gewaehlt] });
      setErgebnis(r); await d.neuLaden();
    } catch (e) { setFehler((e as Error).message); } finally { setLaeuft(false); }
  }

  return (
    <section className="exportdialog blatt" role="dialog" aria-label="Per E-Mail versenden">
      <div className="blattkopf zeile-zwischen"><h2 className="h3">{ids.length} {ids.length === 1 ? 'Mappe' : 'Mappen'} per E-Mail versenden <Hilfe ort="ablage.email" /></h2>
        <button type="button" className="textknopf" onClick={() => fertig(ergebnis ? 'Die E-Mail ist verschickt.' : undefined)}>Schließen</button></div>
      {ergebnis ? (
        <>
          <p className="gutertext" role="status">Die E-Mail ist verschickt.</p>
          <p className="leise">Sie ist als Post abgelegt (Post → Versendet), verweist auf alle {ids.length} Mappen und steht in deren Historie.</p>
          <div className="knoepfe"><Link to={`/ablage/${ergebnis.typId}/${ergebnis.id}`} className="knopf">E-Mail öffnen</Link></div>
        </>
      ) : zuViele ? (
        <div className="hinweis warn"><p>Höchstens {EMAIL_MAPPEN_HOECHSTENS} Mappen in einer E-Mail. Bitte weniger auswählen – oder exportieren und die Datei selbst verschicken.</p></div>
      ) : bereit === false ? (
        <div className="hinweis warn"><p>Der E-Mail-Versand ist nicht eingerichtet.{ich?.rolle === 'admin' ? <> Das geht unter <Link to="/werkbank/betrieb" className="verweis">Werkbank → E-Mail und Adresse</Link>.</> : ' Bitte einen Administrator, ihn in der Werkbank einzurichten.'}</p></div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void senden(); }}>
          <div className="raster">
            <label className="eigenschaft breit"><span>An <small>mehrere durch Komma getrennt</small></span><input type="text" inputMode="email" autoComplete="email" value={an} onChange={(e) => setAn(e.target.value)} placeholder="name@example.org" required /></label>
            <label className="eigenschaft breit"><span>Betreff</span><input value={betreff} maxLength={250} onChange={(e) => setBetreff(e.target.value)} placeholder="z. B. Belege 2026" required /></label>
            <label className="eigenschaft breit"><span>Nachricht</span><textarea rows={4} value={nachricht} onChange={(e) => setNachricht(e.target.value)} /></label>
          </div>
          <fieldset className="anhaenge">
            <legend>Anhänge</legend>
            <label className="haken"><input type="checkbox" checked={angaben} onChange={(e) => setAngaben(e.target.checked)} /><span>Angaben je Mappe als PDF <small className="leise">„Titel.pdf“ mit allen Feldern, ohne Passwörter</small></span></label>
            <fieldset className="wahl"><legend className="klein">Dokumente</legend>
              <label className="haken"><input type="radio" name="em-docs" checked={umfang === 'alle'} onChange={() => setUmfang('alle')} /><span>Alle Dokumente der Mappen{liste ? ` (${alleDocs.length})` : ''}</span></label>
              <label className="haken"><input type="radio" name="em-docs" checked={umfang === 'auswahl'} onChange={() => setUmfang('auswahl')} /><span>Auswählen …</span></label>
              <label className="haken"><input type="radio" name="em-docs" checked={umfang === 'keine'} onChange={() => setUmfang('keine')} /><span>Keine Dokumente</span></label>
            </fieldset>
            {umfang === 'auswahl' && (liste === null ? <p className="leise klein">Lade Dokumente …</p> : (
              <ul className="emailmappen">
                {liste.map((m) => (
                  <li key={m.id}><strong className="klein">{m.titel}</strong>
                    {!m.dokumente.length ? <p className="leise klein">keine Dokumente</p> : <ul>{m.dokumente.map((x) => (
                      <li key={x.id}><label className="haken"><input type="checkbox" checked={gewaehlt.has(x.id)} onChange={() => umschalten(x.id)} /><span>{x.name} <small className="leise">{groesse(x.groesse)}</small></span></label></li>
                    ))}</ul>}
                  </li>
                ))}
              </ul>
            ))}
            {liste && <p className={`klein ${summe > EMAIL_WARNUNG ? 'fehlertext' : 'leise'}`}>
              Dokumente zusammen {groesse(summe)}{angaben ? `, dazu ${ids.length} kleine PDFs mit den Angaben` : ''}.{summe > EMAIL_HOECHSTENS ? ' Das ist zu groß zum Versenden; bitte weniger auswählen.' : summe > EMAIL_WARNUNG ? ' Viele Mailserver nehmen E-Mails über 20 MB nicht an.' : ''}
            </p>}
          </fieldset>
          <p className="leise klein">Eine E-Mail an alle Empfänger. Absender ist die Adresse des DMS, Antworten gehen an dich ({ich?.email}).</p>
          {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
          <div className="knoepfe">
            <button type="button" className="knopf" onClick={() => fertig()}>Abbrechen</button>
            <button className="knopf primaer" disabled={laeuft || bereit === null || !liste || !an.trim() || !betreff.trim() || summe > EMAIL_HOECHSTENS}>{laeuft ? 'Wird verschickt …' : 'Senden'}</button>
          </div>
        </form>
      )}
    </section>
  );
}
