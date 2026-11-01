import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Dokument } from '../../../shared/src/model';
import {
  bereicheVon, findeBegriff, findeMuster, mitRand, MUSTER, stellenText, BEGRIFF_MAX_LAENGE, BEGRIFFE_MAX, type Bereich, type Fund, type Musterart,
} from '../../../shared/src/schwaerzen';
import { api, schwaerzBildUrl, type SchwaerzenVorschau } from '../api';
import { Hilfe } from '../Hilfe';
import { rueckfrage } from '../rueckfrage';

/**
 * Schwärzen (#392): Seitenansicht zum Aufziehen von Bereichen (Maus und Touch) und Antippen einzelner
 * Wörter, Suchbegriffe „überall schwärzen“ und Vorschläge per Muster zum Anhaken – alles im Browser aus
 * den Wörtern mit Lage, ohne Netz. Gespeichert wird eine geschwärzte Kopie (bzw. neue Version) nach
 * Rückfrage; das Original bleibt.
 */
const QUELLE: Record<SchwaerzenVorschau['quelle'], string> = {
  textebene: 'Text aus der Textebene des PDFs',
  texterkennung: 'Text per Texterkennung gelesen',
  gemischt: 'Text aus Textebene und Texterkennung',
  keine: 'kein lesbarer Text – Suchbegriffe und Vorschläge gehen hier nicht, nur Bereiche aufziehen',
};
const schluessel = (f: Fund) => `${f.seite}:${f.woerter.join(',')}`;
/** Ab dieser Bewegung (relativ) ist es Ziehen statt Antippen. */
const ZIEH_MIN = 0.006;

interface Ziehen { seite: number; x0: number; y0: number; x1: number; y1: number; id: number }

export function Schwaerzen({ d, schliessen, fertig }: { d: Dokument; schliessen(): void; fertig(meldung: string): void }) {
  const [v, setV] = useState<SchwaerzenVorschau>();
  const [fehler, setFehler] = useState<string>();
  const [eigene, setEigene] = useState<Bereich[]>([]);
  const [begriffe, setBegriffe] = useState<string[]>([]);
  const [eingabe, setEingabe] = useState('');
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [ziel, setZiel] = useState<'kopie' | 'version'>('kopie');
  const [vorschau, setVorschau] = useState(false);
  const [woerterZeigen, setWoerterZeigen] = useState(false);
  // Am Handy blättert ein Finger die Seite; Aufziehen erst nach Umschalten. Mit Maus geht beides.
  const [zeichnen, setZeichnen] = useState(() => !window.matchMedia?.('(pointer: coarse)').matches);
  const [ziehen, setZiehen] = useState<Ziehen | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  useEffect(() => { api.schwaerzenVorschau(d.id).then(setV, (e: Error) => setFehler(e.message)); }, [d.id, d.sha256]);

  const vorschlaege = useMemo(() => (v ? findeMuster(v.seiten) : []), [v]);
  const begriffFunde = useMemo(() => (v ? begriffe.map((b) => findeBegriff(v.seiten, b)) : []), [v, begriffe]);
  const vorschlagBereiche = useMemo(() => (v ? bereicheVon(v.seiten, vorschlaege.filter((f) => gewaehlt.has(schluessel(f)))) : []), [v, vorschlaege, gewaehlt]);
  const begriffBereiche = useMemo(() => (v ? bereicheVon(v.seiten, begriffFunde.flat()) : []), [v, begriffFunde]);
  const alle = [...eigene, ...vorschlagBereiche, ...begriffBereiche];

  if (fehler && !v) return <div className="hinweis schlecht pdfseiten"><p>{fehler}</p><button type="button" className="textknopf" onClick={schliessen}>Schließen</button></div>;
  if (!v) return <p className="leise pdfseiten" role="status">Lese den Text im Dokument … (bei Scans mit Texterkennung, das dauert etwas)</p>;
  const mitText = v.quelle !== 'keine';

  function begriffDazu() {
    const b = eingabe.trim();
    if (!b) return;
    if (b.length > BEGRIFF_MAX_LAENGE) { setFehler(`Ein Suchbegriff darf höchstens ${BEGRIFF_MAX_LAENGE} Zeichen lang sein.`); return; }
    if (begriffe.length >= BEGRIFFE_MAX) { setFehler(`Höchstens ${BEGRIFFE_MAX} Suchbegriffe.`); return; }
    if (!begriffe.some((x) => x.toLowerCase() === b.toLowerCase())) setBegriffe([...begriffe, b]);
    setEingabe(''); setFehler(undefined);
  }
  const umschalten = (k: string) => { const n = new Set(gewaehlt); if (n.has(k)) n.delete(k); else n.add(k); setGewaehlt(n); };
  const alleVorschlaege = (art: Musterart, an: boolean) => {
    const n = new Set(gewaehlt);
    for (const f of vorschlaege.filter((x) => x.art === art)) { if (an) n.add(schluessel(f)); else n.delete(schluessel(f)); }
    setGewaehlt(n);
  };

  /* ---------- Zeichnen: Bereich aufziehen oder Wort antippen ---------- */
  const lage = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  function runter(e: ReactPointerEvent<HTMLDivElement>, seite: number) {
    if (vorschau || (!zeichnen && e.pointerType !== 'mouse') || e.button > 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ohne Fangen geht es auch */ }
    const p = lage(e);
    setZiehen({ seite, x0: p.x, y0: p.y, x1: p.x, y1: p.y, id: e.pointerId });
  }
  function bewegen(e: ReactPointerEvent<HTMLDivElement>) {
    if (!ziehen || ziehen.id !== e.pointerId) return;
    const p = lage(e);
    setZiehen({ ...ziehen, x1: p.x, y1: p.y });
  }
  function hoch(e: ReactPointerEvent<HTMLDivElement>) {
    if (!ziehen || ziehen.id !== e.pointerId) return;
    const z = ziehen; setZiehen(null);
    const p = lage(e);
    if (Math.abs(p.x - z.x0) < ZIEH_MIN && Math.abs(p.y - z.y0) < ZIEH_MIN) {
      // Antippen: eigenen Bereich wieder entfernen, sonst das Wort an dieser Stelle schwärzen.
      const i = eigene.findIndex((a) => a.seite === z.seite && p.x >= a.x && p.x <= a.x + a.b && p.y >= a.y && p.y <= a.y + a.h);
      if (i >= 0) { setEigene(eigene.filter((_, k) => k !== i)); return; }
      const s = v!.seiten[z.seite - 1];
      const w = s.woerter.find(([, x, y, b, h]) => p.x >= x && p.x <= x + b && p.y >= y && p.y <= y + h);
      if (w) setEigene([...eigene, mitRand({ seite: z.seite, x: w[1], y: w[2], b: w[3], h: w[4] }, s)]);
      return;
    }
    const x = Math.min(z.x0, p.x), y = Math.min(z.y0, p.y), b = Math.abs(p.x - z.x0), h = Math.abs(p.y - z.y0);
    // Nur ein Strich (keine Fläche): nichts schwärzen.
    if (b < ZIEH_MIN / 2 || h < ZIEH_MIN / 2) return;
    setEigene([...eigene, { seite: z.seite, x, y, b, h }]);
  }

  async function speichern() {
    if (!alle.length) return;
    const zuKopie = ziel === 'kopie';
    if (!(await rueckfrage({
      titel: 'Endgültig schwärzen?',
      text: <>
        <p>{stellenText(alle)} werden {zuKopie ? <>in der Kopie „{v!.kopieName}“</> : 'in der neuen Version'} unwiderruflich entfernt – Text, Bild und Textebene. Das lässt sich nicht rückgängig machen.</p>
        <p>{zuKopie ? 'Das Original bleibt unverändert in der Mappe.' : 'Die ungeschwärzte Fassung bleibt als ältere Version erhalten – wer die Mappe lesen darf, sieht sie dort weiterhin.'} Alle Seiten werden dabei neu als Bild aufgebaut.</p>
      </>,
      ja: 'Schwärzen', gefahr: true,
    }))) return;
    setLaeuft(true); setFehler(undefined);
    try {
      const r = await api.schwaerzen(d.id, { bereiche: [...eigene, ...vorschlagBereiche], begriffe, ziel });
      fertig(r.meldung);
    } catch (e) { setFehler((e as Error).message); setLaeuft(false); }
  }

  const arten = (Object.keys(MUSTER) as Musterart[]).filter((a) => vorschlaege.some((f) => f.art === a));
  const ziehKasten = ziehen && { x: Math.min(ziehen.x0, ziehen.x1), y: Math.min(ziehen.y0, ziehen.y1), b: Math.abs(ziehen.x1 - ziehen.x0), h: Math.abs(ziehen.y1 - ziehen.y0) };
  const prozent = (a: { x: number; y: number; b: number; h: number }) => ({ left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.b * 100}%`, height: `${a.h * 100}%` });

  return (
    <div className="pdfseiten schwaerzen" role="region" aria-label={`${d.name} schwärzen`}>
      <div className="pdfseiten-kopf">
        <strong>Schwärzen</strong>
        <span className="leise klein">{v.seiten.length} {v.seiten.length === 1 ? 'Seite' : 'Seiten'} · {QUELLE[v.quelle]}</span>
        <Hilfe ort="dokumente.schwaerzen" />
      </div>
      <p className="leise klein">Zieh Bereiche auf oder tippe ein Wort an; Suchbegriffe werden überall geschwärzt. Ergebnis ist eine geschwärzte Kopie – die Stellen sind darin wirklich weg, nicht nur überdeckt.</p>

      <div className="schwarz-werkzeuge">
        {/* Kein <form>: der Dialog steht im Formular der Mappe – Enter darf die Mappe nicht speichern. */}
        {mitText && <div className="schwarz-suche" role="search">
          <label className="eigenschaft klein"><span>Überall schwärzen</span>
            <input value={eingabe} maxLength={BEGRIFF_MAX_LAENGE} placeholder="z. B. Name oder IBAN" onChange={(e) => setEingabe(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); begriffDazu(); } }} /></label>
          <button type="button" className="knopf klein" disabled={!eingabe.trim()} onClick={begriffDazu}>Hinzufügen</button>
        </div>}
        {/* div/span statt ul/li: die Regeln für .dokumentliste li sollen hier nicht greifen. */}
        {begriffe.length > 0 && <div className="schwarz-begriffe" role="list" aria-label="Suchbegriffe">
          {begriffe.map((b, i) => {
            const n = begriffFunde[i]?.length ?? 0;
            return <span key={b} role="listitem" className={`chip ${n ? '' : 'warn'}`}><span>{b} · {n ? `${n}×` : 'nicht gefunden'}</span>
              <button type="button" className="textknopf" aria-label={`„${b}“ entfernen`} onClick={() => setBegriffe(begriffe.filter((x) => x !== b))}>×</button></span>;
          })}
        </div>}
        {mitText && <details className="schwarz-vorschlaege" open={arten.length > 0}>
          <summary className="klein">Vorschläge: {arten.length ? `${vorschlaege.length} gefunden (${arten.map((a) => MUSTER[a]).join(', ')})` : `keine gefunden (${Object.values(MUSTER).join(', ')})`}</summary>
          {arten.map((a) => {
            const liste = vorschlaege.filter((f) => f.art === a);
            const an = liste.every((f) => gewaehlt.has(schluessel(f)));
            return (
              <fieldset key={a} className="schwarz-art">
                <legend className="klein"><label className="haken"><input type="checkbox" checked={an} onChange={() => alleVorschlaege(a, !an)} /> <strong>{MUSTER[a]}</strong> ({liste.length})</label></legend>
                {liste.map((f) => (
                  <label key={schluessel(f)} className="haken klein">
                    <input type="checkbox" checked={gewaehlt.has(schluessel(f))} onChange={() => umschalten(schluessel(f))} />
                    <span className="mono umbruch">{f.text}</span> <span className="leise">Seite {f.seite}</span>
                  </label>
                ))}
              </fieldset>
            );
          })}
        </details>}
        <div className="schwarz-schalter">
          <button type="button" className="knopf klein" aria-pressed={zeichnen} onClick={() => setZeichnen(!zeichnen)}
            title="Am Handy: an = mit dem Finger Bereiche aufziehen, aus = Seite blättern">{zeichnen ? '✎ Aufziehen an' : '✎ Aufziehen aus (blättern)'}</button>
          <button type="button" className="knopf klein" aria-pressed={vorschau} onClick={() => setVorschau(!vorschau)}>{vorschau ? 'Vorschau beenden' : 'Vorschau'}</button>
          {mitText && <label className="haken klein"><input type="checkbox" checked={woerterZeigen} onChange={(e) => setWoerterZeigen(e.target.checked)} /> Textstellen zeigen</label>}
          {eigene.length > 0 && <button type="button" className="textknopf klein" onClick={() => setEigene(eigene.slice(0, -1))}>Letzten Bereich entfernen</button>}
          {eigene.length > 1 && <button type="button" className="textknopf klein" onClick={() => setEigene([])}>Alle Bereiche entfernen</button>}
        </div>
      </div>

      <div className={`schwarz-seiten ${vorschau ? 'vorschau' : ''}`}>
        {v.seiten.map((s, i) => {
          const nr = i + 1;
          const hier = (l: Bereich[]) => l.filter((a) => a.seite === nr);
          return (
            <figure key={nr} className="schwarz-seite">
              <div className={`schwarz-flaeche ${zeichnen && !vorschau ? 'zeichnet' : ''}`} style={{ aspectRatio: `${s.breite} / ${s.hoehe}` }}
                onPointerDown={(e) => runter(e, nr)} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={() => setZiehen(null)}>
                <img src={schwaerzBildUrl(v, nr)} alt={`Seite ${nr}`} loading={i < 2 ? 'eager' : 'lazy'} draggable={false} />
                {woerterZeigen && !vorschau && s.woerter.map((w, k) => <span key={`w${k}`} className="schwarz-wort" style={prozent({ x: w[1], y: w[2], b: w[3], h: w[4] })} />)}
                {hier(begriffBereiche).map((a, k) => <span key={`b${k}`} className="schwarz-kasten begriff" style={prozent(a)} />)}
                {hier(vorschlagBereiche).map((a, k) => <span key={`v${k}`} className="schwarz-kasten vorschlag" style={prozent(a)} />)}
                {hier(eigene).map((a, k) => <span key={`e${k}`} className="schwarz-kasten eigen" style={prozent(a)} title="Antippen entfernt den Bereich" />)}
                {ziehKasten && ziehen!.seite === nr && <span className="schwarz-kasten zieht" style={prozent(ziehKasten)} />}
              </div>
              <figcaption className="leise klein">Seite {nr}{hier(alle).length ? ` · ${hier(alle).length} geschwärzt` : ''}</figcaption>
            </figure>
          );
        })}
      </div>

      {v.versioniert && (
        <fieldset className="schwarz-ziel">
          <legend className="klein">Ergebnis</legend>
          <label className="haken klein"><input type="radio" name={`ziel-${d.id}`} checked={ziel === 'kopie'} onChange={() => setZiel('kopie')} /> Eigenes Dokument „{v.kopieName}“ (Original bleibt)</label>
          <label className="haken klein"><input type="radio" name={`ziel-${d.id}`} checked={ziel === 'version'} onChange={() => setZiel('version')} /> Neue Version (die ungeschwärzte bleibt als ältere Version)</label>
        </fieldset>
      )}
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
      <div className="pdfseiten-fuss">
        <span className="leise klein" aria-live="polite">{alle.length ? stellenText(alle) : 'Noch nichts gewählt'}</span>
        <button type="button" className="knopf gefahr klein" disabled={laeuft || !alle.length} onClick={() => void speichern()}>{laeuft ? 'Wird geschwärzt …' : 'Geschwärzt speichern'}</button>
        <button type="button" className="knopf klein" disabled={laeuft} onClick={schliessen}>Abbrechen</button>
      </div>
    </div>
  );
}
