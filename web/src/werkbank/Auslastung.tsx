import { useCallback, useEffect, useState } from 'react';
import type { Messpunkt } from '../../../shared/src/systemlast';
import { api, type Schleifenverzoegerung, type SystemlastAntwort } from '../api';
import { Link } from '../ort';
import { Hilfe } from '../Hilfe';
import { t } from '../sprache';
import { platz } from './Speicherplatz';

/**
 * Werkbank → Wartung und Fehlersuche → Systemzustand → Auslastung (#409, Stufe 1): CPU, Arbeitsspeicher und
 * Netzwerk des Containers mit Kurven der letzten Stunde, dazu die Wartezeit der Ereignisschleife (#477), deren
 * Einzelheiten unter Einstellungen → Datenbank-Anbindung stehen. Nicht Messbares heißt „nicht verfügbar“.
 */
export function useSystemlast(offen: boolean) {
  const [stand, setStand] = useState<SystemlastAntwort | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await api.systemlast()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => {
    if (!offen) return;
    void laden();
    const z = setInterval(() => void laden(), 30_000);
    return () => clearInterval(z);
  }, [offen, laden]);
  return { stand, fehler, laden };
}
export type SystemlastZustand = ReturnType<typeof useSystemlast>;

const prozent = (x: number) => `${x.toLocaleString('de-DE', { maximumFractionDigits: 0 })} %`;
const rate = (b: number) => t('systemzustand.netz.je-sekunde', { wert: b < 1024 ** 2 ? `${(b / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} KB` : `${(b / 1024 ** 2).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB` });
const ms = (x: number) => `${x.toLocaleString('de-DE', { maximumFractionDigits: 1 })} ms`;
const uhrzeit = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { timeStyle: 'short' });
const NV = () => <span className="leise" title={t('systemzustand.auslastung.nicht-verfuegbar.hilfe')}>{t('systemzustand.auslastung.nicht-verfuegbar')}</span>;

/**
 * Kleine Kurve (eine Reihe, daher ohne Legende – die Überschrift nennt sie). Lücken bei fehlenden Werten;
 * jede Minute ist ein Ziel für den Tooltip mit Uhrzeit und Wert.
 */
function Kurve({ titel, punkte, wert, format, max }: { titel: string; punkte: Messpunkt[]; wert: (p: Messpunkt) => number | null; format: (x: number) => string; max?: number }) {
  const werte = punkte.map(wert);
  const gemessen = werte.filter((x): x is number => x !== null);
  if (gemessen.length < 2) return <p className="leise klein">{t('systemzustand.auslastung.keine-kurve')}</p>;
  const B = 240, H = 40, n = punkte.length;
  const hoechst = Math.max(...gemessen);
  const oben = max ?? Math.max(hoechst * 1.15, 1);
  const x = (i: number) => (n === 1 ? B : (i / (n - 1)) * B);
  const y = (v: number) => H - 2 - (Math.min(v, oben) / oben) * (H - 4);
  // Linienstücke zwischen fehlenden Werten.
  const stuecke: string[] = [];
  let akt: string[] = [];
  werte.forEach((v, i) => { if (v === null) { if (akt.length) stuecke.push(akt.join(' ')); akt = []; } else akt.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`); });
  if (akt.length) stuecke.push(akt.join(' '));
  return (
    <svg className="az-kurve" viewBox={`0 0 ${B} ${H}`} preserveAspectRatio="none" role="img"
      aria-label={t('systemzustand.auslastung.kurve', { titel, anzahl: n, hoechst: format(hoechst) })}>
      <line className="az-grund" x1={0} x2={B} y1={H - 2} y2={H - 2} />
      {stuecke.map((s, i) => <polyline key={i} points={s} />)}
      {werte.map((v, i) => (
        <rect key={i} className="az-ziel" x={x(i) - B / n / 2} width={B / n} y={0} height={H}>
          <title>{t('systemzustand.auslastung.punkt', { zeit: uhrzeit(punkte[i].zeit), wert: v === null ? t('systemzustand.auslastung.nicht-verfuegbar') : format(v) })}</title>
        </rect>
      ))}
    </svg>
  );
}

function Schleife({ s }: { s: SystemlastAntwort['schleife'] }) {
  const w: Schleifenverzoegerung | null = s ? (s.aktuell && (s.aktuell.seitSekunden >= 10 || !s.vorher) ? s.aktuell : s.vorher ?? s.aktuell) : null;
  return (
    <div className="az-wert">
      <h3 className="az-titel">{t('systemzustand.schleife.titel')}</h3>
      <p>{w ? t('systemzustand.schleife.wert', { median: ms(w.median), max: ms(w.max) }) : <NV />}</p>
      <p className="leise klein">{t('systemzustand.schleife.hilfe')} <Link to="/werkbank/anbindung" className="verweis">{t('systemzustand.schleife.verweis')}</Link>.</p>
    </div>
  );
}

export function AuslastungAbschnitt({ z }: { z: SystemlastZustand }) {
  const s = z.stand;
  return (
    <section className="blatt" id="auslastung">
      <h2 className="h3">{t('systemzustand.auslastung.titel')} <Hilfe ort="werkbank.auslastung" /></h2>
      <p className="leise klein">{t('systemzustand.auslastung.text')}</p>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {!s ? <p className="leise">{t('systemzustand.auslastung.lade')}</p> : <>
        {s.warnung.length > 0 && (
          <div className="hinweis warn"><p>{s.warnung.map((w) => <strong key={w}>{t.frei(`systemzustand.warnung.${w}`)} </strong>)}{t('systemzustand.warnung.text')}</p></div>
        )}
        <div className="az-raster">
          <div className="az-wert">
            <h3 className="az-titel">{t('systemzustand.cpu.titel')} <span className="az-jetzt">{s.jetzt.cpu === null ? <NV /> : t('systemzustand.auslastung.jetzt', { wert: prozent(s.jetzt.cpu) })}</span></h3>
            <Kurve titel={t('systemzustand.cpu.titel')} punkte={s.verlauf} wert={(p) => p.cpu} format={prozent} max={100} />
            <p className="leise klein">{s.kerneBegrenzt ? t('systemzustand.cpu.kerne', { anzahl: s.kerne }) : t('systemzustand.cpu.kerne.ohne', { anzahl: s.kerne })}</p>
            <p className="leise klein">{t('systemzustand.cpu.last', { eins: s.last[0].toLocaleString('de-DE'), fuenf: s.last[1].toLocaleString('de-DE'), fuenfzehn: s.last[2].toLocaleString('de-DE'), kerne: s.hostKerne })}</p>
          </div>
          <div className="az-wert">
            <h3 className="az-titel">{t('systemzustand.speicher.titel')} <span className="az-jetzt">{s.jetzt.speicher === null ? <NV /> : t('systemzustand.auslastung.jetzt', { wert: prozent(s.jetzt.speicher) })}</span></h3>
            <Kurve titel={t('systemzustand.speicher.titel')} punkte={s.verlauf} wert={(p) => p.speicher} format={prozent} max={100} />
            {s.speicher.belegt !== null && s.speicher.grenze !== null
              ? <p className="leise klein">{s.speicher.ohneGrenze ? t('systemzustand.speicher.ohne-grenze', { belegt: platz(s.speicher.belegt), grenze: platz(s.speicher.grenze) }) : t('systemzustand.speicher.belegt', { belegt: platz(s.speicher.belegt), grenze: platz(s.speicher.grenze) })}</p>
              : <p className="leise klein"><NV /></p>}
            <dl className="eigenschaften klein az-anteile">
              <dt>{t('systemzustand.speicher.dms')}</dt><dd>{s.anteile.dms === null ? <NV /> : platz(s.anteile.dms)}</dd>
              <dt>{t('systemzustand.speicher.pakete')}</dt><dd>{s.anteile.pakete === null ? <span className="leise">{t('systemzustand.speicher.pakete.aus')}</span> : platz(s.anteile.pakete)}</dd>
              {s.datenbankImContainer && <><dt>{t('systemzustand.speicher.datenbank')}</dt><dd>{s.anteile.datenbank === null ? <NV /> : platz(s.anteile.datenbank)}</dd></>}
            </dl>
            {!s.datenbankImContainer && <p className="leise klein">{t('systemzustand.speicher.datenbank.extern')}</p>}
          </div>
          <div className="az-wert">
            <h3 className="az-titel">{t('systemzustand.netz.titel')} <span className="az-jetzt">{s.jetzt.rx === null || s.jetzt.tx === null ? <NV /> : t('systemzustand.auslastung.jetzt', { wert: rate(s.jetzt.rx + s.jetzt.tx) })}</span></h3>
            <Kurve titel={t('systemzustand.netz.titel')} punkte={s.verlauf} wert={(p) => (p.rx === null || p.tx === null ? null : p.rx + p.tx)} format={rate} />
            {s.jetzt.rx !== null && s.jetzt.tx !== null && <p className="leise klein">{t('systemzustand.netz.wert', { rx: rate(s.jetzt.rx), tx: rate(s.jetzt.tx) })}</p>}
          </div>
          <Schleife s={s.schleife} />
        </div>
      </>}
    </section>
  );
}
