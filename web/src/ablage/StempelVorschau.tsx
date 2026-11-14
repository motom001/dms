import { useRef, useState, type KeyboardEvent, type PointerEvent as ZeigerEreignis, type ReactNode } from 'react';
import {
  ersetzePlatzhalter, farbeCss, PLATZHALTER, platzhalterText, stempelLayout, STEMPEL_TEXT_MAX,
  type Stempel, type StempelWerte,
} from '../../../shared/src/stempel';
import { t } from '../sprache';
import { Feld, Knopf } from '../bausteine';

/**
 * Live-Vorschau des Stempels (#799) auf fest eingebauten, erfundenen Beispielbelegen: Rechnung mit Text, Tabelle
 * mit Beträgen, farbiges Formular, grauer Kassenbon. Lage und Größe kommen aus `stempelLayout` – derselben
 * Rechnung, mit der der Server das PDF stempelt; „wie Tinte“ ist hier wie dort „Multiplizieren“.
 *
 * Mit `setze` lässt sich der Stempel direkt in der Vorschau verschieben (ziehen, Pfeiltasten; nur Lage „Stempel“),
 * drehen (Griff, Bild auf/ab; nicht bei der Diagonale) und sein Text ändern (Doppelklick, Eingabetaste).
 */

/** A4 hoch in pt, wie die meisten Belege. */
const W = 595.28, H = 841.89;
export const BEISPIELE = ['rechnung', 'tabelle', 'formular', 'bon'] as const;
export type Beispiel = typeof BEISPIELE[number];

let messer: CanvasRenderingContext2D | null | undefined;
/** Breite einer Zeile in fetter Helvetica (bzw. Arial) – Näherung im Browser für `stempelLayout`. */
export function zeilenbreite(z: string, g: number): number {
  if (messer === undefined) { try { messer = document.createElement('canvas').getContext('2d'); } catch { messer = null; } }
  if (!messer) return z.length * g * 0.6;
  messer.font = t('ablage.stempelvorschau.bold-px-helvetica-arial', { g });
  return messer.measureText(z).width;
}

/** Beispielwerte für die Platzhalter (erfunden), Seite 1 von 3. */
export const beispielWerte = (): StempelWerte => ({
  empfaenger: t('werkbank.stempel.beispiel.empfaenger'), benutzer: t('werkbank.stempel.beispiel.benutzer'), mappe: t('werkbank.stempel.beispiel.mappe'),
  archivnummer: 'A-000123', seite: 1, seiten: 3,
});

/** Platzhalter als Knöpfe; fügt an der Schreibmarke des Textfelds `feld` ein. */
export function PlatzhalterKnoepfe({ feld, text, setze }: { feld: () => HTMLTextAreaElement | null; text: string; setze(text: string): void }) {
  const einfuegen = (p: string) => {
    const f = feld();
    const a = f?.selectionStart ?? text.length, b = f?.selectionEnd ?? text.length;
    const neu = (text.slice(0, a) + p + text.slice(b)).slice(0, STEMPEL_TEXT_MAX);
    setze(neu);
    requestAnimationFrame(() => { if (f) { f.focus(); f.setSelectionRange(a + p.length, a + p.length); } });
  };
  return (
    <div className="platzhalterknoepfe" role="group" aria-label={t('werkbank.stempel.platzhalter')}>
      <span className="leise klein">{t('werkbank.stempel.platzhalter')}:</span>
      {PLATZHALTER.map((p) => <Knopf key={p} groesse="klein" title={platzhalterText(p)} onClick={() => einfuegen(platzhalterText(p))}>{t.frei(`werkbank.stempel.platzhalter.${p}`)}</Knopf>)}
    </div>
  );
}

const teile = (k: string) => t.frei(k).split('|');
const spalten = (k: string) => teile(k).map((z) => z.split(';'));
const TINTE = '#20242b';

/** Inhalt eines Beispielbelegs als SVG (Seite 595 × 842 pt). */
function Beleg({ art }: { art: Beispiel }): ReactNode {
  const b = `werkbank.stempel.beispiel.${art}`;
  if (art === 'rechnung') {
    return <g fontFamily={t('ablage.stempelvorschau.helvetica-arial-sans-serif')} fill={TINTE}>
      <rect width={W} height={H} fill="#fff" />
      <rect x={56} y={52} width={46} height={46} rx={6} fill="#e3a33b" />
      <text x={112} y={82} fontSize={20} fontWeight="bold">{t.frei(`${b}.kopf`).split(' · ')[0]}</text>
      <text x={56} y={140} fontSize={8} fill="#666">{t.frei(`${b}.kopf`)}</text>
      {teile(t('ablage.stempelvorschau.an', { b })).map((z, i) => <text key={i} x={56} y={162 + i * 15} fontSize={12}>{z}</text>)}
      <text x={56} y={270} fontSize={22} fontWeight="bold">{t.frei(`${b}.titel`)}</text>
      {teile(`${b}.text`).map((z, i) => <text key={i} x={56} y={310 + i * 17} fontSize={12}>{z}</text>)}
      <line x1={56} x2={539} y1={386} y2={386} stroke="#999" />
      {spalten(`${b}.posten`).map(([l, r], i) => <g key={i} fontSize={12}><text x={56} y={410 + i * 22}>{l}</text><text x={539} y={410 + i * 22} textAnchor="end">{r}</text></g>)}
      <line x1={330} x2={539} y1={486} y2={486} stroke={TINTE} />
      {spalten(`${b}.summe`).map(([l, r], i) => <g key={i} fontSize={14} fontWeight="bold"><text x={330} y={508}>{l}</text><text x={539} y={508} textAnchor="end">{r}</text></g>)}
      {Array.from({ length: 8 }, (_, i) => <rect key={i} x={56} y={560 + i * 18} width={i % 3 === 2 ? 300 : 483} height={6} rx={3} fill="#c9ced6" />)}
      <text x={56} y={790} fontSize={9} fill="#555">{t.frei(`${b}.fuss`)}</text>
    </g>;
  }
  if (art === 'tabelle') {
    const z = spalten(`${b}.zeilen`);
    return <g fontFamily={t('ablage.stempelvorschau.helvetica-arial-sans-serif')} fill={TINTE}>
      <rect width={W} height={H} fill="#fff" />
      <text x={56} y={80} fontSize={20} fontWeight="bold">{t.frei(`${b}.titel`)}</text>
      <rect x={56} y={110} width={483} height={26} fill="#2f4a6d" />
      {spalten(`${b}.kopf`).map(([d, txt, betrag], i) => <g key={i} fontSize={11} fontWeight="bold" fill="#fff"><text x={64} y={127}>{d}</text><text x={130} y={127}>{txt}</text><text x={531} y={127} textAnchor="end">{betrag}</text></g>)}
      {z.map(([d, txt, betrag], i) => <g key={i} fontSize={11}>
        {i % 2 === 1 && <rect x={56} y={136 + i * 30} width={483} height={30} fill="#eef1f5" />}
        <text x={64} y={156 + i * 30}>{d}</text><text x={130} y={156 + i * 30}>{txt}</text>
        <text x={531} y={156 + i * 30} textAnchor="end" fill={betrag.startsWith('-') ? '#a01818' : TINTE}>{betrag}</text>
      </g>)}
      <line x1={56} x2={539} y1={136 + z.length * 30} y2={136 + z.length * 30} stroke={TINTE} />
      {spalten(`${b}.summe`).map(([l, r], i) => <g key={i} fontSize={13} fontWeight="bold"><text x={64} y={162 + z.length * 30}>{l}</text><text x={531} y={162 + z.length * 30} textAnchor="end">{r}</text></g>)}
      {Array.from({ length: 6 }, (_, i) => <rect key={i} x={56} y={520 + i * 18} width={i % 2 ? 260 : 420} height={5} rx={2.5} fill="#ccd1d8" />)}
    </g>;
  }
  if (art === 'formular') {
    return <g fontFamily={t('ablage.stempelvorschau.helvetica-arial-sans-serif')} fill={TINTE}>
      <rect width={W} height={H} fill="#fff" />
      <rect width={W} height={96} fill="#1f6fb2" />
      <text x={56} y={60} fontSize={24} fontWeight="bold" fill="#fff">{t.frei(`${b}.titel`)}</text>
      {spalten(`${b}.felder`).map(([l, v], i) => <g key={i}>
        <text x={56} y={146 + i * 64} fontSize={10} fill="#335">{l}</text>
        <rect x={56} y={152 + i * 64} width={483} height={32} fill="#fff6c7" stroke="#d9c25a" />
        <text x={66} y={174 + i * 64} fontSize={14}>{v}</text>
      </g>)}
      {[0, 1, 2].map((i) => <g key={i}><rect x={56 + i * 160} y={480} width={16} height={16} fill="#fff" stroke="#335" />{i === 0 && <path d={`M${59} 488 l4 5 l8 -10`} stroke={TINTE} strokeWidth={2.5} fill="none" />}<rect x={80 + i * 160} y={484} width={90} height={7} rx={3} fill="#9fb3c8" /></g>)}
      <rect x={56} y={540} width={483} height={200} fill="#e2f2e4" stroke="#6aa874" />
      <text x={70} y={566} fontSize={12} fontWeight="bold" fill="#2f6b3a">{t.frei(`${b}.abschnitt`)}</text>
      {Array.from({ length: 5 }, (_, i) => <rect key={i} x={70} y={590 + i * 26} width={i % 2 ? 300 : 440} height={8} rx={4} fill="#b9d8be" />)}
    </g>;
  }
  // Grauer Scan eines Kassenbons: graues Blatt, darauf der Bon etwas schief.
  const posten = spalten(`${b}.posten`);
  return <g fontFamily={t('ablage.stempelvorschau.courier-new-courier-monospace')} fill="#2a2a2a">
    <rect width={W} height={H} fill="#b9b9b3" />
    <g transform={t('ablage.stempelvorschau.rotate-2-297-420')}>
      <rect x={170} y={70} width={255} height={640} fill="#e8e8e3" />
      {teile(`${b}.kopf`).map((z, i) => <text key={i} x={297} y={120 + i * 22} fontSize={i ? 13 : 17} fontWeight="bold" textAnchor="middle">{z}</text>)}
      <line x1={190} x2={405} y1={180} y2={180} stroke="#555" strokeDasharray="4 3" />
      {posten.map(([l, r], i) => <g key={i} fontSize={13}><text x={190} y={210 + i * 24}>{l}</text><text x={405} y={210 + i * 24} textAnchor="end">{r}</text></g>)}
      <line x1={190} x2={405} y1={214 + posten.length * 24} y2={214 + posten.length * 24} stroke="#555" strokeDasharray="4 3" />
      {spalten(`${b}.summe`).map(([l, r], i) => <g key={i} fontSize={16} fontWeight="bold"><text x={190} y={244 + posten.length * 24}>{l}</text><text x={405} y={244 + posten.length * 24} textAnchor="end">{r}</text></g>)}
      <text x={297} y={300 + posten.length * 24} fontSize={11} textAnchor="middle">{t.frei(`${b}.fuss`)}</text>
      {Array.from({ length: 12 }, (_, i) => <rect key={i} x={200 + (i % 3) * 8} y={420 + i * 20} width={150 - (i % 4) * 20} height={4} fill="#c9c9c2" />)}
    </g>
  </g>;
}

interface Ziehen { art: 'schieben' | 'drehen'; dx: number; dy: number }

export function StempelVorschau({ stempel, werte, setze, beispiele = BEISPIELE }: {
  stempel: Stempel; werte: StempelWerte;
  /** Ohne: nur ansehen. Mit: verschieben, drehen und Text ändern direkt in der Vorschau. */
  setze?(p: Partial<Stempel>): void;
  beispiele?: readonly Beispiel[];
}) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const ziehen = useRef<Ziehen | null>(null);
  const feld = useRef<HTMLTextAreaElement>(null);
  const text = ersetzePlatzhalter(stempel.text, werte);
  const L = stempelLayout(stempel, text, W, H, zeilenbreite);
  const fest = stempel.lage !== 'stempel';
  const drehbar = stempel.lage !== 'diagonal';
  const farbe = farbeCss(stempel.farbe);
  // Fläche zum Anfassen: Rahmen oder Textblock, etwas größer.
  const breite = (L.rahmen?.b ?? Math.max(...L.zeilen.map((z) => z.breite), 40)) + 16;
  const hoehe = (L.rahmen?.h ?? (L.zeilen.length ? L.zeilen[L.zeilen.length - 1].y - L.zeilen[0].y + L.groesse * 1.2 : 40)) + 16;
  const griffY = -hoehe / 2 - 46;

  const punkt = (e: ZeigerEreignis<SVGElement>) => {
    const svg = (e.currentTarget as SVGGraphicsElement).ownerSVGElement;
    const m = svg?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const anfassen = (art: Ziehen['art']) => (e: ZeigerEreignis<SVGElement>) => {
    if (!setze || (art === 'schieben' && fest) || (art === 'drehen' && !drehbar)) return;
    const p = punkt(e);
    if (!p) return;
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    ziehen.current = { art, dx: p.x - L.cx, dy: p.y - L.cy };
  };
  const bewegen = (e: ZeigerEreignis<SVGElement>) => {
    const z = ziehen.current;
    if (!z || !setze) return;
    const p = punkt(e);
    if (!p) return;
    if (z.art === 'schieben') setze({ x: rund((p.x - z.dx) / W), y: rund((p.y - z.dy) / H) });
    else {
      let w = (Math.atan2(p.y - L.cy, p.x - L.cx) * 180) / Math.PI + 90;
      if (e.shiftKey) w = Math.round(w / 15) * 15;
      setze({ drehung: ((Math.round(w) % 360) + 360) % 360 });
    }
  };
  const loslassen = () => { ziehen.current = null; };
  const tasten = (e: KeyboardEvent<SVGGElement>) => {
    if (!setze) return;
    const schritt = e.shiftKey ? 0.05 : 0.01;
    const schieben: Record<string, [number, number]> = { ArrowLeft: [-schritt, 0], ArrowRight: [schritt, 0], ArrowUp: [0, -schritt], ArrowDown: [0, schritt] };
    if (e.key in schieben && !fest) {
      e.preventDefault();
      const [dx, dy] = schieben[e.key];
      setze({ x: rund(Math.min(1, Math.max(0, L.cx / W + dx))), y: rund(Math.min(1, Math.max(0, L.cy / H + dy))) });
    } else if ((e.key === 'PageUp' || e.key === 'PageDown') && drehbar) {
      e.preventDefault();
      setze({ drehung: (((stempel.drehung + (e.key === 'PageDown' ? 5 : -5)) % 360) + 360) % 360 });
    } else if (e.key === 'Enter') { e.preventDefault(); setBearbeiten(true); requestAnimationFrame(() => feld.current?.focus()); }
  };

  return (
    <div className="stempelvorschau">
      <div className="stempelvorschau-raster">
        {beispiele.map((b) => (
          <figure key={b} className="stempelbeleg">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.frei(`werkbank.stempel.beispiel.${b}`)} onPointerMove={bewegen} onPointerUp={loslassen} onPointerCancel={loslassen}>
              <Beleg art={b} />
              <g transform={t('ablage.stempelvorschau.translate-rotate', { cx: L.cx, cy: L.cy, winkel: L.winkel })}
                className={setze ? `stempelgriff${fest ? ' fest' : ''}` : undefined}
                {...(setze ? {
                  tabIndex: 0, role: 'button', 'aria-label': `${t('werkbank.stempel.vorschau.stempel')}: ${text.replace(/\n/g, ' / ')}`,
                  onPointerDown: anfassen('schieben'), onDoubleClick: () => { setBearbeiten(true); requestAnimationFrame(() => feld.current?.focus()); }, onKeyDown: tasten,
                } : { 'aria-hidden': true })}>
                <g opacity={stempel.deckkraft} style={{ mixBlendMode: stempel.tinte ? 'multiply' : 'normal' }}>
                  {L.rahmen && <rect x={-L.rahmen.b / 2} y={-L.rahmen.h / 2} width={L.rahmen.b} height={L.rahmen.h} fill="none" stroke={farbe} strokeWidth={L.rahmen.doppelt ? 2 : 1.5} />}
                  {L.rahmen?.doppelt && (() => { const e = L.groesse * 0.22; return <rect x={-L.rahmen.b / 2 + e} y={-L.rahmen.h / 2 + e} width={L.rahmen.b - 2 * e} height={L.rahmen.h - 2 * e} fill="none" stroke={farbe} strokeWidth={0.75} />; })()}
                  {L.zeilen.map((z, i) => <text key={i} x={z.x} y={z.y} fontSize={L.groesse} fontWeight="bold" fontFamily={t('ablage.stempelvorschau.helvetica-arial-sans-serif')} fill={farbe} style={{ whiteSpace: 'pre' }}>{z.text}</text>)}
                </g>
                {setze && <>
                  <rect className="stempelflaeche" x={-breite / 2} y={-hoehe / 2} width={breite} height={hoehe} rx={6} />
                  {drehbar && <g className="drehgriff" onPointerDown={anfassen('drehen')}>
                    <line x1={0} x2={0} y1={-hoehe / 2} y2={griffY} />
                    <circle cx={0} cy={griffY} r={20} />
                  </g>}
                </>}
              </g>
            </svg>
            <figcaption className="leise klein">{t.frei(`werkbank.stempel.beispiel.${b}`)}</figcaption>
          </figure>
        ))}
      </div>
      {setze && <p className="leise klein">{t('werkbank.stempel.vorschau.bedienung')}{fest ? ` ${t('werkbank.stempel.vorschau.fest')}` : ''}</p>}
      {setze && bearbeiten && (
        <div className="stempelvorschau-text">
          <Feld beschriftung={t('werkbank.stempel.vorschau.text')}>
            <textarea ref={feld} rows={3} value={stempel.text} maxLength={STEMPEL_TEXT_MAX} onChange={(x) => setze({ text: x.target.value })}
              onKeyDown={(x) => { if (x.key === 'Escape') { x.preventDefault(); setBearbeiten(false); } }} />
          </Feld>
          <PlatzhalterKnoepfe feld={() => feld.current} text={stempel.text} setze={(text) => setze({ text })} />
          <div><Knopf groesse="klein" onClick={() => setBearbeiten(false)}>{t('werkbank.stempel.vorschau.fertig')}</Knopf></div>
        </div>
      )}
    </div>
  );
}

const rund = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
