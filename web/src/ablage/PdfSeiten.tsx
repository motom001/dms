import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { Dokument, Mappe } from '../../../shared/src/model';
import { api, seitenbildUrl, type PdfSeiten as Info } from '../api';
import { Hilfe } from '../Hilfe';
import { rueckfrage } from '../rueckfrage';

/**
 * PDF bearbeiten (#335): Seiten mit kleinen Bildern; drehen, löschen, verschieben (Ziehen oder
 * Tastatur: Alt + Pfeiltaste), „Teilen ab hier“. Gespeichert wird erst mit „Übernehmen“ – als neue
 * Version, ohne Versionierung nach Rückfrage; bei Post entstehen beim Teilen neue Posts.
 */
interface Seite { nr: number; drehung: number; weg: boolean; teilAb: boolean }

export function PdfSeiten({ d, post, versioniert, papierkorb, schliessen, fertig }: {
  d: Dokument; post: boolean; versioniert: boolean; papierkorb: boolean;
  schliessen(): void; fertig(r: { dokumente: Dokument[]; posten: Mappe[] }): void;
}) {
  const [info, setInfo] = useState<Info>();
  const [seiten, setSeiten] = useState<Seite[]>([]);
  const [fehler, setFehler] = useState<string>();
  const [laeuft, setLaeuft] = useState(false);
  const [gezogen, setGezogen] = useState<number>();
  const kacheln = useRef<Array<HTMLLIElement | null>>([]);
  const [fokus, setFokus] = useState<number>();

  useEffect(() => {
    api.pdfSeiten(d.id).then((i) => {
      setInfo(i);
      setSeiten(Array.from({ length: i.anzahl }, (_, k) => ({ nr: k + 1, drehung: 0, weg: false, teilAb: false })));
    }, (e: Error) => setFehler(e.message));
  }, [d.id, d.sha256]);
  useEffect(() => { if (fokus !== undefined) kacheln.current[fokus]?.focus(); }, [fokus, seiten]);

  if (fehler && !info) return <div className="hinweis schlecht pdfseiten"><p>{fehler}</p><button type="button" className="textknopf" onClick={schliessen}>Schließen</button></div>;
  if (!info) return <p className="leise pdfseiten">Lade Seiten …</p>;

  const aendere = (i: number, p: Partial<Seite>) => setSeiten((s) => s.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const verschiebe = (von: number, nach: number) => {
    if (nach < 0 || nach >= seiten.length || von === nach) return;
    setSeiten((s) => { const n = [...s]; const [x] = n.splice(von, 1); n.splice(nach, 0, x); return n; });
    setFokus(nach);
  };
  const taste = (i: number, e: KeyboardEvent) => {
    if (!e.altKey) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); verschiebe(i, i - 1); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); verschiebe(i, i + 1); }
  };
  const fallen = (i: number, e: DragEvent) => { e.preventDefault(); if (gezogen !== undefined) verschiebe(gezogen, i); setGezogen(undefined); };

  const bleiben = seiten.filter((s) => !s.weg);
  // Teile beginnen an Seiten, die bleiben; die erste bleibende beginnt immer den ersten Teil.
  const teile = bleiben.map((s, i) => (i > 0 && s.teilAb ? i : -1)).filter((i) => i > 0);
  const geaendert = bleiben.length !== info.anzahl || teile.length > 0 || bleiben.some((s, i) => s.nr !== i + 1 || s.drehung);
  const anzahlTeile = teile.length + 1;

  async function uebernehmen() {
    if (!bleiben.length) { setFehler('Mindestens eine Seite muss bleiben.'); return; }
    const postTeilen = post && anzahlTeile > 1;
    let bestaetigt = false;
    if (!versioniert && !postTeilen) {
      if (!(await rueckfrage({ titel: `„${d.name}“ ersetzen?`, text: `Für dieses Register ist die Versionierung ausgeschaltet: Das bearbeitete PDF ersetzt das bisherige. ${papierkorb ? 'Das bisherige kommt in den Papierkorb.' : 'Das bisherige ist danach weg.'}`, ja: 'Ersetzen', gefahr: !papierkorb }))) return;
      bestaetigt = true;
    }
    if (postTeilen && !(await rueckfrage({ titel: `In ${anzahlTeile} Posts teilen?`, text: `Aus dieser Post entstehen ${anzahlTeile} neue Posts, je Teil eine. Diese Post behält das ganze PDF und wird erledigt.`, ja: 'Teilen' }))) return;
    setLaeuft(true); setFehler(undefined);
    try {
      fertig(await api.bearbeitePdf(d.id, { seiten: bleiben.map((s) => ({ nr: s.nr, drehung: s.drehung })), teile, bestaetigt }));
    } catch (e) { setFehler((e as Error).message); setLaeuft(false); }
  }

  const zusammenfassung = [
    `${bleiben.length} von ${info.anzahl} ${info.anzahl === 1 ? 'Seite' : 'Seiten'}`,
    ...(seiten.some((s) => s.drehung && !s.weg) ? [`${seiten.filter((s) => s.drehung && !s.weg).length} gedreht`] : []),
    ...(anzahlTeile > 1 ? [post ? `${anzahlTeile} neue Posts` : `${anzahlTeile} Teile`] : []),
  ].join(' · ');

  return (
    <div className="pdfseiten" role="region" aria-label={`Seiten von ${d.name}`}>
      <div className="pdfseiten-kopf">
        <strong>Seiten bearbeiten</strong>
        <span className="leise klein">Ziehen oder Alt + Pfeiltaste zum Verschieben</span>
        <Hilfe ort="dokumente.seiten" />
      </div>
      <ol className="seitenraster">
        {seiten.map((s, i) => {
          const pos = bleiben.indexOf(s);
          const neuerTeil = !s.weg && pos > 0 && s.teilAb;
          return (
            <li key={s.nr} ref={(el) => { kacheln.current[i] = el; }} tabIndex={0}
              className={`seite ${s.weg ? 'weg' : ''} ${neuerTeil ? 'teilab' : ''} ${gezogen === i ? 'zieht' : ''}`}
              aria-label={`Seite ${s.nr}${s.weg ? ', gelöscht' : ''}${s.drehung ? `, gedreht um ${s.drehung} Grad` : ''}${neuerTeil ? ', neuer Teil beginnt hier' : ''}`}
              draggable onDragStart={() => setGezogen(i)} onDragEnd={() => setGezogen(undefined)}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => fallen(i, e)} onKeyDown={(e) => taste(i, e)}>
              {neuerTeil && <span className="teilmarke">Teil {teile.indexOf(pos) + 2}</span>}
              <div className="seitenbild">
                {s.nr <= info.bilderBis
                  ? <img src={seitenbildUrl(info, s.nr)} alt="" loading="lazy" style={{ transform: `rotate(${s.drehung}deg)` }} draggable={false} />
                  : <span className="leise">{s.nr}</span>}
              </div>
              <span className="klein">Seite {s.nr}</span>
              <div className="seitenknoepfe">
                <button type="button" className="symbolknopf" title="Nach links drehen" aria-label={`Seite ${s.nr} nach links drehen`} disabled={s.weg} onClick={() => aendere(i, { drehung: (s.drehung + 270) % 360 })}>↺</button>
                <button type="button" className="symbolknopf" title="Nach rechts drehen" aria-label={`Seite ${s.nr} nach rechts drehen`} disabled={s.weg} onClick={() => aendere(i, { drehung: (s.drehung + 90) % 360 })}>↻</button>
                <button type="button" className="symbolknopf" title="Nach vorn" aria-label={`Seite ${s.nr} nach vorn`} disabled={i === 0} onClick={() => verschiebe(i, i - 1)}>←</button>
                <button type="button" className="symbolknopf" title="Nach hinten" aria-label={`Seite ${s.nr} nach hinten`} disabled={i === seiten.length - 1} onClick={() => verschiebe(i, i + 1)}>→</button>
              </div>
              <div className="seitenknoepfe">
                <button type="button" className={`textknopf klein ${s.weg ? '' : 'gefahr'}`} onClick={() => aendere(i, { weg: !s.weg })}>{s.weg ? 'Behalten' : 'Löschen'}</button>
                {pos > 0 && <button type="button" className="textknopf klein" aria-pressed={s.teilAb} onClick={() => aendere(i, { teilAb: !s.teilAb })}>{s.teilAb ? 'Nicht teilen' : 'Teilen ab hier'}</button>}
              </div>
            </li>
          );
        })}
      </ol>
      {anzahlTeile > 1 && <p className="leise klein">{post
        ? 'Beim Übernehmen entsteht je Teil eine neue Post. Diese Post behält das ganze PDF, wird erledigt und verweist auf die neuen.'
        : `Teil 1 ersetzt „${d.name}“${versioniert ? ' als neue Version' : ''}, die weiteren Teile werden eigene Dokumente in diesem Register.`}</p>}
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
      <div className="pdfseiten-fuss">
        <span className="leise klein">{zusammenfassung}</span>
        <button type="button" className="knopf primaer klein" disabled={!geaendert || !bleiben.length || laeuft} onClick={() => void uebernehmen()}>{laeuft ? 'Wird übernommen …' : 'Übernehmen'}</button>
        <button type="button" className="knopf klein" disabled={laeuft} onClick={schliessen}>Abbrechen</button>
      </div>
      {versioniert && <p className="leise klein">Das bisherige PDF bleibt als ältere Version erhalten.</p>}
    </div>
  );
}
