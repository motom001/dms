import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react';
import { ENGPASS_MINUTEN, ENGPASS_VARIABLE, VERBINDUNG_WARTEN_MS, type Einstellbar, type Messpunkt, type ProzessZeile } from '../../../shared/src/systemlast';
import { api, type ErweiterungStand, type Schleifenverzoegerung, type SystemlastAntwort } from '../api';
import { Link } from '../ort';
import { Hilfe } from '../Hilfe';
import { t } from '../sprache';
import { platz } from './Speicherplatz';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Werkbank → Wartung und Fehlersuche → Systemzustand → Auslastung (#409, Stufe 1): CPU, Arbeitsspeicher und
 * Netzwerk des Containers mit Kurven der letzten Stunde, dazu die Wartezeit der Ereignisschleife (#477), deren
 * Einzelheiten unter Einstellungen → Datenbank-Anbindung stehen, und die Arbeiter für PDF und Exporte (#542).
 * Nicht Messbares heißt „nicht verfügbar“.
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

const prozent = (x: number) => `${x.toLocaleString(gebietsschema(), { maximumFractionDigits: 0 })} %`;
const rate = (b: number) => t('systemzustand.netz.je-sekunde', { wert: b < 1024 ** 2 ? `${(b / 1024).toLocaleString(gebietsschema(), { maximumFractionDigits: 1 })} KB` : `${(b / 1024 ** 2).toLocaleString(gebietsschema(), { maximumFractionDigits: 1 })} MB` });
const ms = (x: number) => `${x.toLocaleString(gebietsschema(), { maximumFractionDigits: 1 })} ms`;
const uhrzeit = (iso: string) => new Date(iso).toLocaleTimeString(gebietsschema(), { timeStyle: 'short' });
const uhrzeitSekunden = (iso: string) => new Date(iso).toLocaleTimeString(gebietsschema(), { timeStyle: 'medium' });
/** Kurve je Minute (Systemzustand) oder alle paar Sekunden (Lasttest-Seite, #895). */
type KurvenArt = 'minuten' | 'live';
const NV = () => <span className="leise" title={t('systemzustand.auslastung.nicht-verfuegbar.hilfe')}>{t('systemzustand.auslastung.nicht-verfuegbar')}</span>;

/**
 * Kleine Kurve (eine Reihe, daher ohne Legende – die Überschrift nennt sie). Lücken bei fehlenden Werten;
 * jede Minute ist ein Ziel für den Tooltip mit Uhrzeit und Wert.
 */
function Kurve({ titel, punkte, wert, format, max, art = 'minuten' }: { titel: string; punkte: Messpunkt[]; wert: (p: Messpunkt) => number | null; format: (x: number) => string; max?: number; art?: KurvenArt }) {
  const werte = punkte.map(wert);
  const gemessen = werte.filter((x): x is number => x !== null);
  if (gemessen.length < 2) return <p className="leise klein">{art === 'live' ? t('systemzustand.auslastung.keine-kurve.live') : t('systemzustand.auslastung.keine-kurve')}</p>;
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
      aria-label={art === 'live' ? t('systemzustand.auslastung.kurve.live', { titel, anzahl: n, hoechst: format(hoechst) }) : t('systemzustand.auslastung.kurve', { titel, anzahl: n, hoechst: format(hoechst) })}>
      <line className="az-grund" x1={0} x2={B} y1={H - 2} y2={H - 2} />
      {stuecke.map((s, i) => <polyline key={i} points={s} />)}
      {werte.map((v, i) => (
        <rect key={i} className="az-ziel" x={x(i) - B / n / 2} width={B / n} y={0} height={H}>
          <title>{t('systemzustand.auslastung.punkt', { zeit: art === 'live' ? uhrzeitSekunden(punkte[i].zeit) : uhrzeit(punkte[i].zeit), wert: v === null ? t('systemzustand.auslastung.nicht-verfuegbar') : format(v) })}</title>
        </rect>
      ))}
    </svg>
  );
}

/**
 * CPU und Arbeitsspeicher als Kachel mit Kurve (#409) – auch auf der Lasttest-Seite (#895), dort mit den Werten der
 * laufenden Messung. `jetzt` in Prozent; darunter, was die Seite dazu sagt.
 */
export function CpuKachel({ jetzt, verlauf, art, children }: { jetzt: number | null; verlauf: Messpunkt[]; art?: KurvenArt; children?: ReactNode }) {
  return (
    <div className="az-wert">
      <h3 className="az-titel">{t('systemzustand.cpu.titel')} <span className="az-jetzt">{jetzt === null ? <NV /> : t('systemzustand.auslastung.jetzt', { wert: prozent(jetzt) })}</span></h3>
      <Kurve titel={t('systemzustand.cpu.titel')} punkte={verlauf} wert={(p) => p.cpu} format={prozent} max={100} art={art} />
      {children}
    </div>
  );
}
export function SpeicherKachel({ jetzt, verlauf, art, children }: { jetzt: number | null; verlauf: Messpunkt[]; art?: KurvenArt; children?: ReactNode }) {
  return (
    <div className="az-wert">
      <h3 className="az-titel">{t('systemzustand.speicher.titel')} <span className="az-jetzt">{jetzt === null ? <NV /> : t('systemzustand.auslastung.jetzt', { wert: prozent(jetzt) })}</span></h3>
      <Kurve titel={t('systemzustand.speicher.titel')} punkte={verlauf} wert={(p) => p.speicher} format={prozent} max={100} art={art} />
      {children}
    </div>
  );
}

/** Arbeiter für PDF und große Exporte (#542): wie viele es gibt, was sie gerade tun, was schiefging. */
function Arbeiter({ a }: { a: SystemlastAntwort['arbeiter'] }) {
  if (!a) return null;
  return (
    <div className="az-wert">
      <h3 className="az-titel">{t('systemzustand.arbeiter.titel')} <span className="az-jetzt">{a.aus ? t('systemzustand.arbeiter.aus.kurz') : t('systemzustand.arbeiter.jetzt', { beschaeftigt: a.beschaeftigt, groesse: a.groesse })}</span></h3>
      {a.aus ? <p className="leise klein">{t('systemzustand.arbeiter.aus')}</p> : <>
        <p>{a.wartend ? t('systemzustand.arbeiter.wartend', { anzahl: a.wartend }) : t('systemzustand.arbeiter.keine-warten')}</p>
        <dl className="eigenschaften klein az-anteile">
          <dt>{t('systemzustand.arbeiter.erledigt')}</dt><dd>{a.erledigt.toLocaleString(gebietsschema())}</dd>
          <dt>{t('systemzustand.arbeiter.dauer')}</dt><dd>{a.mittlereDauerMs === null ? '–' : ms(a.mittlereDauerMs)}</dd>
          <dt>{t('systemzustand.arbeiter.warten')}</dt><dd>{a.mittleresWartenMs === null ? '–' : t('systemzustand.arbeiter.warten.wert', { mittel: ms(a.mittleresWartenMs), max: ms(a.laengstesWartenMs) })}</dd>
          <dt>{t('systemzustand.arbeiter.fehler')}</dt><dd>{t('systemzustand.arbeiter.fehler.wert', { fehler: a.fehler, zeit: a.zeitueberschreitungen, abgewiesen: a.abgewiesen })}</dd>
        </dl>
        <p className="leise klein">{t(a.quelle === 'umgebung' ? 'systemzustand.arbeiter.hilfe.umgebung' : 'systemzustand.arbeiter.hilfe.vorgabe', { groesse: a.groesse, kerne: a.kerne.toLocaleString(gebietsschema()), minuten: Math.round(a.zeitMs / 60_000) })}</p>
      </>}
    </div>
  );
}

function Schleife({ s }: { s: SystemlastAntwort['schleife'] }) {
  const w: Schleifenverzoegerung | null = s ? (s.aktuell && (s.aktuell.seitSekunden >= 10 || !s.vorher) ? s.aktuell : s.vorher ?? s.aktuell) : null;
  return (
    <div className="az-wert">
      <h3 className="az-titel">{t('systemzustand.schleife.titel')}</h3>
      <p>{w ? t('systemzustand.schleife.wert', { median: ms(w.median), max: ms(w.max) }) : <NV />}</p>
      <p className="leise klein">{t('systemzustand.schleife.hilfe')} <a href="#datenbank" className="verweis">{t('systemzustand.schleife.verweis')}</a>.</p>
    </div>
  );
}

/**
 * Erweiterungen der Suche (#562): nur wenn eine fehlt oder in einem Schema liegt, das eine Wiederherstellung löscht –
 * mit Abhilfe, statt dass die Suche still schlechter wird.
 */
export function ErweiterungenHinweis({ liste }: { liste?: ErweiterungStand[] | null }) {
  const probleme = (liste ?? []).filter((e) => e.zustand !== 'ok');
  if (!probleme.length) return null;
  return (
    <section className="blatt" id="erweiterungen">
      <h2 className="h3">{t('systemzustand.erweiterung.titel')} <Hilfe ort="werkbank.erweiterungen" /></h2>
      {probleme.map((e) => (
        <div key={e.name} className="hinweis warn">
          <p><strong>{e.zustand === 'gefaehrdet' ? t('systemzustand.erweiterung.gefaehrdet', { name: e.name, schema: e.schema ?? '' }) : t.frei(`systemzustand.erweiterung.${e.name === 'pg_trgm' ? 'trgm' : e.name}.fehlt`)}</strong></p>
          <p>{e.zustand === 'gefaehrdet' ? t('systemzustand.erweiterung.gefaehrdet.abhilfe') : t.frei(`systemzustand.erweiterung.${e.name === 'pg_trgm' ? 'trgm' : e.name}.abhilfe`)}</p>
        </div>
      ))}
    </section>
  );
}

/**
 * Mehrere Prozesse (#745): je Prozess Rolle, Arbeitsspeicher, Rechenzeit, Wartezeit der Ereignisschleife und laufende
 * Anfragen. Auch unter Einstellungen → Datenbank-Anbindung (Auslastung des Servers).
 */
export function ProzessTabelle({ zeilen }: { zeilen?: ProzessZeile[] | null }) {
  if (!zeilen || zeilen.length < 2) return null;
  return (
    <div className="az-prozesse" id="prozesse">
      <h3 className="az-titel">{t('systemzustand.prozesse.titel')}</h3>
      <div className="tabellenrahmen">
        <table className="tabelle klein">
          <thead><tr>
            <th>{t('systemzustand.prozesse.nr')}</th><th>{t('systemzustand.prozesse.rolle')}</th><th>{t('systemzustand.prozesse.speicher')}</th>
            <th>{t('systemzustand.prozesse.cpu')}</th><th>{t('systemzustand.prozesse.schleife')}</th><th>{t('systemzustand.prozesse.anfragen')}</th>
          </tr></thead>
          <tbody>{zeilen.map((z) => (
            <tr key={`${z.nr}-${z.pid}`}>
              <td>{z.rolle === 'haupt' ? '–' : z.nr}</td>
              <td>{t.frei(`systemzustand.prozesse.rolle.${z.rolle}`)}</td>
              <td>{z.speicher === null ? <NV /> : platz(z.speicher)}</td>
              <td>{z.cpu === null ? '–' : prozent(z.cpu)}</td>
              <td>{z.schleifeP99 === null ? '–' : ms(z.schleifeP99)}</td>
              <td>{z.anfragen === null ? '–' : z.anfragen.toLocaleString(gebietsschema())}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="leise klein">{t('systemzustand.prozesse.text')}</p>
    </div>
  );
}

/** Belegung der Verbindungen gerade jetzt (#1198): belegt, reserviert, wartend und die gehaltenen Sperren. */
function Belegung({ b }: { b: NonNullable<NonNullable<NonNullable<SystemlastAntwort['grenzen']>['verbindungen']>['belegung']> }) {
  const z = (n: number) => n.toLocaleString(gebietsschema());
  return (
    <div id="verbindungen-belegung" className="klein">
      {t('systemzustand.grenzen.belegung', { belegt: z(b.belegt), pool: z(b.pool), reserviert: z(b.reserviert), wartend: z(b.wartend) })}
      {b.prozess ? <>{' '}{t('systemzustand.grenzen.belegung-prozess', { nr: b.prozess })}</> : null}
      {b.sperren.length ? <>{' · '}<span className="leise">{t('systemzustand.grenzen.sperren', { namen: b.sperren.join(', ') })}</span></> : null}
    </div>
  );
}

/** Prozesse (#745), Arbeiter, Verbindungen, Überlastgrenze (#544): Wert und Herkunft, nur zum Ansehen. */
function Grenzen({ g }: { g: NonNullable<SystemlastAntwort['grenzen']> }) {
  const zeilen = (['prozesse', 'arbeiter', 'verbindungen', 'anfragen'] as Einstellbar[]).filter((k) => g[k]);
  if (!zeilen.length) return null;
  return (
    <div className="az-grenzen" id="grenzen">
      <h3 className="az-titel">{t('systemzustand.grenzen.titel')} <Hilfe ort="werkbank.grenzen" /></h3>
      <dl className="eigenschaften klein">
        {zeilen.map((k) => {
          const w = g[k]!;
          return (<Fragment key={k}>
            <dt>{t.frei(`systemzustand.grenzen.${k}`)}</dt>
            <dd>{k === 'arbeiter' && w.wert === 0 ? t('systemzustand.grenzen.aus') : t(w.quelle === 'umgebung' ? 'systemzustand.grenzen.umgebung' : w.quelle === 'auto' ? 'systemzustand.grenzen.auto' : 'systemzustand.grenzen.vorgabe', { wert: w.wert.toLocaleString(gebietsschema()) })}
              {w.prozesse && w.prozesse > 1 && w.wert > 0 ? <>{' '}{t('systemzustand.grenzen.je-prozess', { gesamt: (w.wert * w.prozesse).toLocaleString(gebietsschema()), prozesse: w.prozesse })}</> : null}
              {w.aufteilung ? <>{' '}{t('systemzustand.grenzen.aufgeteilt', { prozesse: w.aufteilung.prozesse, leiter: w.aufteilung.leiter, andere: w.aufteilung.andere })}</> : null}
              {' '}<span className="leise">· <span className="mono">{t('systemzustand.grenzen.bereich', { variable: w.variable, min: w.min.toLocaleString(gebietsschema()), max: w.max.toLocaleString(gebietsschema()) })}</span></span>
              {w.belegung ? <Belegung b={w.belegung} /> : null}</dd>
          </Fragment>);
        })}
      </dl>
      <p className="leise klein">{t('systemzustand.grenzen.text')}</p>
    </div>
  );
}

/** Engpässe (#544): was knapp war und welche Variable man ändern müsste. */
function Engpaesse({ s }: { s: SystemlastAntwort }) {
  const e = s.engpaesse ?? [];
  if (!e.length) return null;
  const wert = (k: Einstellbar) => (s.grenzen?.[k]?.wert ?? 0).toLocaleString(gebietsschema());
  const text = (x: (typeof e)[number]) => {
    const variable = ENGPASS_VARIABLE[x];
    if (x === 'verbindungen') return t('systemzustand.engpass.verbindungen', { variable, wert: wert('verbindungen'), ms: ms(VERBINDUNG_WARTEN_MS) });
    if (x === 'ueberlast') return t('systemzustand.engpass.ueberlast', { variable, wert: wert('anfragen'), minuten: ENGPASS_MINUTEN });
    if (x === 'arbeiter') return t('systemzustand.engpass.arbeiter', { variable, wert: wert('arbeiter'), minuten: ENGPASS_MINUTEN });
    return t('systemzustand.engpass.schleife', { variable, wert: wert('arbeiter') });
  };
  return (
    <div className="hinweis warn" id="engpass">
      <p><strong>{t('systemzustand.engpass.titel')}</strong></p>
      <ul>{e.map((x) => <li key={x}>{text(x)}</li>)}</ul>
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
        {s.zwischenspeicher === 'aus' && <div className="hinweis warn" id="zwischenspeicher"><p>{t('systemzustand.zwischenspeicher.aus')}</p></div>}
        <Engpaesse s={s} />
        <div className="az-raster">
          <CpuKachel jetzt={s.jetzt.cpu} verlauf={s.verlauf}>
            <p className="leise klein">{s.kerneBegrenzt ? t('systemzustand.cpu.kerne', { anzahl: s.kerne }) : t('systemzustand.cpu.kerne.ohne', { anzahl: s.kerne })}</p>
            <p className="leise klein">{t('systemzustand.cpu.last', { eins: s.last[0].toLocaleString(gebietsschema()), fuenf: s.last[1].toLocaleString(gebietsschema()), fuenfzehn: s.last[2].toLocaleString(gebietsschema()), kerne: s.hostKerne })}</p>
          </CpuKachel>
          <SpeicherKachel jetzt={s.jetzt.speicher} verlauf={s.verlauf}>
            {s.speicher.belegt !== null && s.speicher.grenze !== null
              ? <p className="leise klein">{s.speicher.ohneGrenze ? t('systemzustand.speicher.ohne-grenze', { belegt: platz(s.speicher.belegt), grenze: platz(s.speicher.grenze) }) : t('systemzustand.speicher.belegt', { belegt: platz(s.speicher.belegt), grenze: platz(s.speicher.grenze) })}</p>
              : <p className="leise klein"><NV /></p>}
            <dl className="eigenschaften klein az-anteile">
              <dt>{t('systemzustand.speicher.dms')}</dt><dd>{s.anteile.dms === null ? <NV /> : platz(s.anteile.dms)}</dd>
              <dt>{t('systemzustand.speicher.pakete')}</dt><dd>{s.anteile.pakete === null ? <span className="leise">{t('systemzustand.speicher.pakete.aus')}</span> : platz(s.anteile.pakete)}</dd>
              {s.datenbankImContainer && <><dt>{t('systemzustand.speicher.datenbank')}</dt><dd>{s.anteile.datenbank === null ? <NV /> : platz(s.anteile.datenbank)}</dd></>}
            </dl>
            {!s.datenbankImContainer && <p className="leise klein">{t('systemzustand.speicher.datenbank.extern')}</p>}
          </SpeicherKachel>
          <div className="az-wert">
            <h3 className="az-titel">{t('systemzustand.netz.titel')} <span className="az-jetzt">{s.jetzt.rx === null || s.jetzt.tx === null ? <NV /> : t('systemzustand.auslastung.jetzt', { wert: rate(s.jetzt.rx + s.jetzt.tx) })}</span></h3>
            <Kurve titel={t('systemzustand.netz.titel')} punkte={s.verlauf} wert={(p) => (p.rx === null || p.tx === null ? null : p.rx + p.tx)} format={rate} />
            {s.jetzt.rx !== null && s.jetzt.tx !== null && <p className="leise klein">{t('systemzustand.netz.wert', { rx: rate(s.jetzt.rx), tx: rate(s.jetzt.tx) })}</p>}
          </div>
          <Schleife s={s.schleife} />
          <Arbeiter a={s.arbeiter} />
        </div>
        <ProzessTabelle zeilen={s.prozesse} />
        {s.grenzen && <Grenzen g={s.grenzen} />}
      </>}
    </section>
  );
}
