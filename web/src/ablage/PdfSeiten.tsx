import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { Dokument, Mappe } from '../../../shared/src/model';
import { api, seitenbildUrl, type PdfSeiten as Info } from '../api';
import { Hilfe } from '../Hilfe';
import { rueckfrage } from '../rueckfrage';
import { t } from '../sprache';

/**
 * PDF bearbeiten (#335): Seiten mit kleinen Bildern; drehen, löschen, verschieben (Ziehen oder
 * Tastatur: Alt + Pfeiltaste), „Teilen ab hier“. Gespeichert wird erst mit „Übernehmen“ – als neue
 * Version, ohne Versionierung nach Rückfrage; bei Post entstehen beim Teilen neue Posts.
 */
interface Seite { nr: number; drehung: number; weg: boolean; teilAb: boolean }

export function PdfSeiten({ d, post, versioniert, papierkorb, teilAb, schliessen, fertig }: {
  d: Dokument; post: boolean; versioniert: boolean; papierkorb: boolean;
  /** Vorschlag aus dem Hinweis „Post teilen?“ (#579): „Teilen ab hier“ an dieser Seite schon gesetzt – übernommen wird erst mit „Übernehmen“. */
  teilAb?: number;
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
      setSeiten(Array.from({ length: i.anzahl }, (_, k) => ({ nr: k + 1, drehung: 0, weg: false, teilAb: !!teilAb && k + 1 === teilAb && k > 0 })));
    }, (e: Error) => setFehler(e.message));
  }, [d.id, d.sha256]); // eslint-disable-line react-hooks/exhaustive-deps -- Seiten nur bei anderem Dokument oder anderem Inhalt neu laden
  // Mit Vorschlag (#579) die Kachel der Seite gleich ins Bild holen.
  useEffect(() => { if (teilAb && seiten.length >= teilAb) kacheln.current[teilAb - 1]?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [teilAb, seiten.length]);
  useEffect(() => { if (fokus !== undefined) kacheln.current[fokus]?.focus(); }, [fokus, seiten]);

  if (fehler && !info) return <div className="hinweis schlecht pdfseiten"><p>{fehler}</p><button type="button" className="textknopf" onClick={schliessen}>{t('ablage.pdfseiten.schliessen')}</button></div>;
  if (!info) return <p className="leise pdfseiten">{t('ablage.pdfseiten.lade-seiten')}</p>;

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
    if (!bleiben.length) { setFehler(t('ablage.pdfseiten.mindestens-eine-seite-muss')); return; }
    const postTeilen = post && anzahlTeile > 1;
    let bestaetigt = false;
    if (!versioniert && !postTeilen) {
      if (!(await rueckfrage({ titel: t('ablage.pdfseiten.ersetzen', { name: d.name }), text: t('ablage.pdfseiten.fuer-dieses-register-ist', { wert: papierkorb ? t('ablage.pdfseiten.das-bisherige-kommt-in') : t('ablage.pdfseiten.das-bisherige-ist-danach') }), ja: t('ablage.pdfseiten.ersetzen-2'), gefahr: !papierkorb }))) return;
      bestaetigt = true;
    }
    if (postTeilen && !(await rueckfrage({ titel: t('ablage.pdfseiten.in-posts-teilen', { anzahlTeile }), text: t('ablage.pdfseiten.aus-dieser-post-entstehen', { anzahlTeile }), ja: t('ablage.pdfseiten.teilen') }))) return;
    setLaeuft(true); setFehler(undefined);
    try {
      fertig(await api.bearbeitePdf(d.id, { seiten: bleiben.map((s) => ({ nr: s.nr, drehung: s.drehung })), teile, bestaetigt }));
    } catch (e) { setFehler((e as Error).message); setLaeuft(false); }
  }

  const zusammenfassung = [
    t('ablage.pdfseiten.von-seiten', { anzahl: info.anzahl, bleiben: bleiben.length }),
    ...(seiten.some((s) => s.drehung && !s.weg) ? [`${seiten.filter((s) => s.drehung && !s.weg).length} gedreht`] : []),
    ...(anzahlTeile > 1 ? [post ? t('ablage.pdfseiten.neue-posts', { anzahlTeile }) : t('ablage.pdfseiten.teile', { anzahlTeile })] : []),
  ].join(' · ');

  return (
    <div className="pdfseiten" role="region" aria-label={t('ablage.pdfseiten.seiten-von', { name: d.name })}>
      <div className="pdfseiten-kopf">
        <strong>{t('ablage.pdfseiten.seiten-bearbeiten')}</strong>
        <span className="leise klein">{t('ablage.pdfseiten.ziehen-oder-alt-pfeiltaste')}</span>
        <Hilfe ort="dokumente.seiten" />
      </div>
      <ol className="seitenraster">
        {seiten.map((s, i) => {
          const pos = bleiben.indexOf(s);
          const neuerTeil = !s.weg && pos > 0 && s.teilAb;
          return (
            <li key={s.nr} ref={(el) => { kacheln.current[i] = el; }} tabIndex={0}
              className={`seite ${s.weg ? 'weg' : ''} ${neuerTeil ? 'teilab' : ''} ${gezogen === i ? 'zieht' : ''}`}
              aria-label={t('ablage.pdfseiten.seite', { nr: s.nr, wert: s.weg ? t('ablage.pdfseiten.geloescht') : '', wert2: s.drehung ? t('ablage.pdfseiten.gedreht-um-grad', { drehung: s.drehung }) : '', wert3: neuerTeil ? t('ablage.pdfseiten.neuer-teil-beginnt-hier') : '' })}
              draggable onDragStart={() => setGezogen(i)} onDragEnd={() => setGezogen(undefined)}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => fallen(i, e)} onKeyDown={(e) => taste(i, e)}>
              {neuerTeil && <span className="teilmarke">{t('ablage.pdfseiten.teil', { wert: teile.indexOf(pos) + 2 })}</span>}
              <div className="seitenbild">
                {s.nr <= info.bilderBis
                  ? <img src={seitenbildUrl(info, s.nr)} alt="" loading="lazy" style={{ transform: `rotate(${s.drehung}deg)` }} draggable={false} />
                  : <span className="leise">{s.nr}</span>}
              </div>
              <span className="klein">{t('ablage.pdfseiten.seite-2', { nr: s.nr })}</span>
              <div className="seitenknoepfe">
                <button type="button" className="symbolknopf" title={t('ablage.pdfseiten.nach-links-drehen')} aria-label={t('ablage.pdfseiten.seite-nach-links-drehen', { nr: s.nr })} disabled={s.weg} onClick={() => aendere(i, { drehung: (s.drehung + 270) % 360 })}>↺</button>
                <button type="button" className="symbolknopf" title={t('ablage.pdfseiten.nach-rechts-drehen')} aria-label={t('ablage.pdfseiten.seite-nach-rechts-drehen', { nr: s.nr })} disabled={s.weg} onClick={() => aendere(i, { drehung: (s.drehung + 90) % 360 })}>↻</button>
                <button type="button" className="symbolknopf" title={t('ablage.pdfseiten.nach-vorn')} aria-label={t('ablage.pdfseiten.seite-nach-vorn', { nr: s.nr })} disabled={i === 0} onClick={() => verschiebe(i, i - 1)}>←</button>
                <button type="button" className="symbolknopf" title={t('ablage.pdfseiten.nach-hinten')} aria-label={t('ablage.pdfseiten.seite-nach-hinten', { nr: s.nr })} disabled={i === seiten.length - 1} onClick={() => verschiebe(i, i + 1)}>→</button>
              </div>
              <div className="seitenknoepfe">
                <button type="button" className={`textknopf klein ${s.weg ? '' : 'gefahr'}`} onClick={() => aendere(i, { weg: !s.weg })}>{s.weg ? t('ablage.pdfseiten.behalten') : t('ablage.pdfseiten.loeschen')}</button>
                {pos > 0 && <button type="button" className="textknopf klein" aria-pressed={s.teilAb} onClick={() => aendere(i, { teilAb: !s.teilAb })}>{s.teilAb ? t('ablage.pdfseiten.nicht-teilen') : t('ablage.pdfseiten.teilen-ab-hier')}</button>}
              </div>
            </li>
          );
        })}
      </ol>
      {anzahlTeile > 1 && <p className="leise klein">{post
        ? t('ablage.pdfseiten.beim-uebernehmen-entsteht-je')
        : t('ablage.pdfseiten.teil-1-ersetzt-die', { name: d.name, wert: versioniert ? t('ablage.pdfseiten.als-neue-version') : '' })}</p>}
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
      <div className="pdfseiten-fuss">
        <span className="leise klein">{zusammenfassung}</span>
        <button type="button" className="knopf primaer klein" disabled={!geaendert || !bleiben.length || laeuft} onClick={() => void uebernehmen()}>{laeuft ? t('ablage.pdfseiten.wird-uebernommen') : t('ablage.pdfseiten.uebernehmen')}</button>
        <button type="button" className="knopf klein" disabled={laeuft} onClick={schliessen}>{t('ablage.pdfseiten.abbrechen')}</button>
      </div>
      {versioniert && <p className="leise klein">{t('ablage.pdfseiten.das-bisherige-pdf-bleibt')}</p>}
    </div>
  );
}
