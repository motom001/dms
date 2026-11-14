import { useCallback, useEffect, useState } from 'react';
import { WARNUNG_AB, type KostenEinstellung, type Preis } from '../../../shared/src/extern';
import { gebietsschema } from '../../../shared/src/sprache';
import { ApiFehler } from '../api/anfrage';
import { betriebApi, type ExternKosten, type ExterneDiensteStand, type ExternSummeZeile, type ExternZeile } from '../api/betrieb';
import { paketeApi, type ExternUebersicht } from '../api/pakete';
import { Feld, HakenFeld, Knopf } from '../bausteine';
import { Hilfe } from '../Hilfe';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { t } from '../sprache';

/**
 * Externe Dienste (#565, Werkbank → Systemzustand): je Dienst Mittelwert, p50, p95, Fehler und Zeitüberschreitungen der
 * letzten Stunde bzw. 24 Stunden; darunter die KI-Kosten eines Monats (je Paket, Person, Funktion, teuerste Aufrufe)
 * mit Preisen je 1 Mio. Token und Monatsbudget. Nur Metadaten – nie Fragen, Antworten, Mails oder Adressen.
 */

const zahl = (n: number) => n.toLocaleString(gebietsschema());
const ms = (x: number | null) => (x === null ? '–' : x >= 10_000 ? `${(x / 1000).toLocaleString(gebietsschema(), { maximumFractionDigits: 1 })} s` : `${zahl(x)} ms`);
const groesse = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toLocaleString(gebietsschema(), { maximumFractionDigits: 1 })} MB` : b >= 1024 ? `${zahl(Math.round(b / 1024))} KB` : `${zahl(b)} B`);
const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });
/** Betrag in der Währung der Einstellung; kleine Beträge mit mehr Stellen. */
export function geld(x: number, waehrung: string) {
  const stellen = x !== 0 && Math.abs(x) < 1 ? 4 : 2;
  try { return x.toLocaleString(gebietsschema(), { style: 'currency', currency: waehrung, minimumFractionDigits: 2, maximumFractionDigits: stellen }); }
  catch { return `${x.toLocaleString(gebietsschema(), { maximumFractionDigits: stellen })} ${waehrung}`; }
}
const dienstName = (d: string) => t.frei(`systemzustand.extern.dienst.${d}`);
/** Bekannte Funktionen mit Namen, sonst die Kennung (z. B. die Art eines Ereignisses). */
export function funktionName(f: string | null) {
  if (!f) return '–';
  const k = `systemzustand.extern.funktion.${f}`;
  const x = t.frei(k);
  return x === k ? f : x;
}

export function useExtern(sichtbar: boolean) {
  const [stunden, setStunden] = useState(24);
  const [stand, setStand] = useState<ExterneDiensteStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await betriebApi.extern(stunden)); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, [stunden]);
  useEffect(() => {
    if (!sichtbar) return;
    void laden();
    const uhr = setInterval(() => void laden(), 15_000);
    return () => clearInterval(uhr);
  }, [sichtbar, laden]);
  return { stand, fehler, laden, stunden, setStunden };
}
export type ExternZustand = ReturnType<typeof useExtern>;

/** Zeitraum: letzte Stunde oder letzte 24 Stunden. */
function Zeitraum({ stunden, setze }: { stunden: number; setze: (h: number) => void }) {
  return (
    <div className="knoepfe" role="group" aria-label={t('systemzustand.extern.zeitraum')}>
      {[1, 24].map((h) => <Knopf key={h} art={stunden === h ? 'haupt' : 'neben'} groesse="klein" aria-pressed={stunden === h} onClick={() => setze(h)}>{t('systemzustand.extern.stunden', { anzahl: h })}</Knopf>)}
    </div>
  );
}

/** Tabelle der Kennzahlen je Dienst (und Paket). */
export function Kennzahlen({ u, pakete }: { u: ExternUebersicht; pakete?: Record<string, string> }) {
  if (!u.dienste.length) return <p className="leise">{t('systemzustand.extern.keine', { anzahl: u.stunden })}</p>;
  return (
    <div className="tabellenrahmen">
      <table className="tabelle klein">
        <thead><tr>
          <th>{t('systemzustand.extern.spalte.dienst')}</th><th className="rechts">{t('systemzustand.extern.spalte.aufrufe')}</th>
          <th className="rechts">{t('systemzustand.extern.spalte.mittel')}</th><th className="rechts">{t('systemzustand.extern.spalte.p50')}</th><th className="rechts">{t('systemzustand.extern.spalte.p95')}</th>
          <th className="rechts">{t('systemzustand.extern.spalte.erste')}</th><th className="rechts">{t('systemzustand.extern.spalte.fehler')}</th><th className="rechts">{t('systemzustand.extern.spalte.zeit')}</th>
          <th className="rechts">{t('systemzustand.extern.spalte.daten')}</th><th className="rechts">{t('systemzustand.extern.spalte.token')}</th>
        </tr></thead>
        <tbody>{u.dienste.map((d) => (
          <tr key={`${d.dienst}-${d.paket ?? ''}`}>
            <td>{dienstName(d.dienst)}{d.paket ? <span className="leise"> · {pakete?.[d.paket] ?? d.paket}</span> : null}</td>
            <td className="rechts">{zahl(d.anzahl)}</td>
            <td className="rechts">{ms(d.mittelMs)}</td><td className="rechts">{ms(d.p50Ms)}</td><td className="rechts">{ms(d.p95Ms)}</td><td className="rechts">{ms(d.ersteMs)}</td>
            <td className={`rechts${d.fehler ? ' fehlertext' : ''}`}>{zahl(d.fehler)}</td><td className={`rechts${d.zeit ? ' fehlertext' : ''}`}>{zahl(d.zeit)}</td>
            <td className="rechts">{t('systemzustand.extern.hin-zurueck', { hin: groesse(d.hin), zurueck: groesse(d.zurueck) })}</td>
            <td className="rechts">{d.tokenEin || d.tokenAus ? t('systemzustand.extern.token-ein-aus', { ein: zahl(d.tokenEin), aus: zahl(d.tokenAus) }) : '–'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/** Die letzten Aufrufe: Zeit, Dienst, Funktion, Dauer, Ergebnis. */
function Letzte({ liste, pakete }: { liste: ExternZeile[]; pakete?: Record<string, string> }) {
  if (!liste.length) return null;
  return (
    <details className="klein">
      <summary>{t('systemzustand.extern.letzte')}</summary>
      <ul>{liste.slice(0, 20).map((z, i) => (
        <li key={z.id ?? i} className={z.ergebnis === 'ok' ? undefined : 'fehlertext'}>
          {zeit(z.zeit)} · {dienstName(z.dienst)}{z.paket ? ` (${pakete?.[z.paket] ?? z.paket})` : ''} · {funktionName(z.funktion)} · {ms(z.ms)}
          {z.ergebnis === 'ok' ? '' : ` · ${t.frei(`systemzustand.extern.ergebnis.${z.ergebnis}`)}`}
        </li>
      ))}</ul>
    </details>
  );
}

/** Werkbank → Systemzustand → Externe Dienste. */
export function ExterneDiensteAbschnitt({ z }: { z: ExternZustand }) {
  const s = z.stand;
  return (
    <div className="blatt" id="externe-dienste">
      <h2 className="h3">{t('systemzustand.extern.titel')} <Hilfe ort="werkbank.extern" /></h2>
      <p className="leise">{t('systemzustand.extern.text')}</p>
      <Zeitraum stunden={z.stunden} setze={z.setStunden} />
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {s?.budget.warnung && <BudgetHinweis b={s.budget} />}
      {!s ? !z.fehler && <p className="leise">{t('systemzustand.extern.lade')}</p> : <><Kennzahlen u={s} pakete={s.pakete} /><Letzte liste={s.letzte} pakete={s.pakete} /></>}
      <p className="leise klein">{t('systemzustand.extern.datenschutz')}</p>
    </div>
  );
}

function BudgetHinweis({ b }: { b: ExterneDiensteStand['budget'] }) {
  if (!b.budget) return null;
  const werte = { summe: geld(b.summe, b.waehrung), budget: geld(b.budget, b.waehrung), prozent: Math.round((b.anteil ?? 0) * 100) };
  return (
    <div className={`hinweis ${b.erreicht ? 'schlecht' : 'warn'}`} role="status">
      <p>{b.pausiertBis
        ? t('systemzustand.extern.budget.pausiert', { ...werte, datum: new Date(b.pausiertBis).toLocaleDateString(gebietsschema(), { day: 'numeric', month: 'long', year: 'numeric' }) })
        : b.erreicht ? t('systemzustand.extern.budget.erreicht', werte) : t('systemzustand.extern.budget.warnung', werte)}</p>
    </div>
  );
}

/** Paketansicht (#565): dasselbe nur für dieses Paket. */
export function PaketExternBlock({ paket }: { paket: string }) {
  const [stunden, setStunden] = useState(24);
  const [u, setU] = useState<ExternUebersicht | null>(null);
  const [fehler, setFehler] = useState<string>();
  useEffect(() => { paketeApi.paketExtern(paket, stunden).then((x) => { setU(x); setFehler(undefined); }, (e) => setFehler((e as Error).message)); }, [paket, stunden]);
  return (
    <>
      <h2 className="h3">{t('systemzustand.extern.paket.titel')} <Hilfe ort="werkbank.extern" /></h2>
      <p className="leise klein">{t('systemzustand.extern.paket.text')}</p>
      <Zeitraum stunden={stunden} setze={setStunden} />
      {fehler && <p className="fehlertext">{fehler}</p>}
      {u && <><Kennzahlen u={u} /><Letzte liste={u.letzte} /></>}
    </>
  );
}

/* ---------- KI-Kosten und Budget ---------- */

interface Eingabe { waehrung: string; budget: string; hart: boolean; preise: Record<string, { ein: string; aus: string }> }
const alsEingabe = (e: KostenEinstellung, pakete: Array<{ id: string }>): Eingabe => ({
  waehrung: e.waehrung, budget: e.budget === null ? '' : String(e.budget), hart: e.hart,
  preise: Object.fromEntries([...new Set([...pakete.map((p) => p.id), ...Object.keys(e.preise)])].map((id) => [id, { ein: e.preise[id]?.ein ? String(e.preise[id].ein) : '', aus: e.preise[id]?.aus ? String(e.preise[id].aus) : '' }])),
});
const zahlAus = (x: string) => (x.trim() === '' ? 0 : Number(x.replace(',', '.')));

/** Werkbank → Systemzustand → KI-Kosten und Budget. */
export function KiKostenAbschnitt({ sichtbar, nachAenderung }: { sichtbar: boolean; nachAenderung?: () => void }) {
  const [monat, setMonat] = useState<string>();
  const [k, setK] = useState<ExternKosten | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setK(await betriebApi.externKosten(monat)); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, [monat]);
  useEffect(() => { if (sichtbar) void laden(); }, [sichtbar, laden]);
  if (!k) return fehler ? <div className="blatt" id="ki-kosten"><div className="hinweis schlecht"><p>{fehler}</p></div></div> : null;
  const w = k.einstellung.waehrung;
  const name = { paket: (id: string | null) => (id ? k.pakete[id] ?? id : '–'), person: (id: string | null) => (id ? k.personen[id] ?? t('systemzustand.extern.person.geloescht') : t('systemzustand.extern.person.ohne')) };
  return (
    <div className="blatt" id="ki-kosten">
      <h2 className="h3">{t('systemzustand.extern.kosten.titel')} <Hilfe ort="werkbank.kikosten" /></h2>
      <p className="leise">{t('systemzustand.extern.kosten.text')}</p>
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
      <Feld beschriftung={t('systemzustand.extern.kosten.monat')}>
        <select id="ki-kosten-monat" value={k.monat} onChange={(e) => setMonat(e.target.value)}>
          {k.monate.map((m) => <option key={m} value={m}>{new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleDateString(gebietsschema(), { month: 'long', year: 'numeric' })}</option>)}
        </select>
      </Feld>
      <Summe k={k} />
      <h3 className="h4">{t('systemzustand.extern.kosten.je-paket')}</h3>
      <Summen zeilen={k.jePaket} name={name.paket} waehrung={w} spalte={t('systemzustand.extern.spalte.paket')} leer={t('systemzustand.extern.kosten.leer')} />
      <h3 className="h4">{t('systemzustand.extern.kosten.je-person')}</h3>
      <Summen zeilen={k.jePerson} name={name.person} waehrung={w} spalte={t('systemzustand.extern.spalte.person')} leer={t('systemzustand.extern.kosten.leer')} />
      <h3 className="h4">{t('systemzustand.extern.kosten.je-funktion')}</h3>
      <Summen zeilen={k.jeFunktion} name={funktionName} waehrung={w} spalte={t('systemzustand.extern.spalte.funktion')} leer={t('systemzustand.extern.kosten.leer')} />
      <h3 className="h4">{t('systemzustand.extern.kosten.teuerste')}</h3>
      <Teuerste k={k} name={name} />
      <KostenEinstellungen k={k} gespeichert={(x) => { setK(x); nachAenderung?.(); }} />
      <p className="leise klein">{t('systemzustand.extern.kosten.datenschutz', { tage: k.rohTage, monate: k.monateAufbewahrt })}</p>
    </div>
  );
}

function Summe({ k }: { k: ExternKosten }) {
  const b = k.budget, w = k.einstellung.waehrung;
  const anteil = b.anteil === null ? null : Math.min(100, b.anteil * 100);
  return (
    <>
      <dl className="eigenschaften">
        <dt>{t('systemzustand.extern.spalte.aufrufe')}</dt><dd>{zahl(k.gesamt.anzahl)}{k.gesamt.fehler ? <span className="fehlertext"> · {t('systemzustand.extern.davon-fehler', { anzahl: k.gesamt.fehler })}</span> : null}</dd>
        <dt>{t('systemzustand.extern.spalte.token')}</dt><dd>{t('systemzustand.extern.token-ein-aus', { ein: zahl(k.gesamt.tokenEin), aus: zahl(k.gesamt.tokenAus) })}</dd>
        <dt>{t('systemzustand.extern.spalte.kosten')}</dt><dd><strong>{geld(k.gesamt.kosten, w)}</strong>{b.budget ? ` ${t('systemzustand.extern.kosten.von-budget', { budget: geld(b.budget, w) })}` : ''}</dd>
      </dl>
      {anteil !== null && (
        <div className="platzbalken" role="img" aria-label={t('systemzustand.extern.kosten.anteil', { prozent: Math.round(anteil) })}>
          <span className={b.erreicht ? 'grenze' : b.warnung ? 'warnung' : ''} style={{ width: `${anteil}%` }} />
          <i className="marke warn" style={{ left: `${WARNUNG_AB * 100}%` }} title={t('systemzustand.extern.kosten.warnschwelle')} />
        </div>
      )}
      {b.warnung && <BudgetHinweis b={b} />}
      {!k.gesamt.anzahl && <p className="leise">{t('systemzustand.extern.kosten.lokal')}</p>}
    </>
  );
}

function Summen({ zeilen, name, waehrung, spalte, leer }: { zeilen: ExternSummeZeile[]; name: (x: string | null) => string; waehrung: string; spalte: string; leer: string }) {
  if (!zeilen.length) return <p className="leise klein">{leer}</p>;
  return (
    <div className="tabellenrahmen">
      <table className="tabelle klein">
        <thead><tr><th>{spalte}</th><th className="rechts">{t('systemzustand.extern.spalte.aufrufe')}</th><th className="rechts">{t('systemzustand.extern.spalte.token')}</th><th className="rechts">{t('systemzustand.extern.spalte.kosten')}</th></tr></thead>
        <tbody>{zeilen.map((z) => (
          <tr key={z.schluessel ?? '-'}>
            <td>{name(z.schluessel)}</td><td className="rechts">{zahl(z.anzahl)}</td>
            <td className="rechts">{t('systemzustand.extern.token-ein-aus', { ein: zahl(z.tokenEin), aus: zahl(z.tokenAus) })}</td>
            <td className="rechts">{geld(z.kosten, waehrung)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Teuerste({ k, name }: { k: ExternKosten; name: { paket: (x: string | null) => string; person: (x: string | null) => string } }) {
  if (!k.teuerste.length) return <p className="leise klein">{t('systemzustand.extern.kosten.teuerste.leer', { tage: k.rohTage })}</p>;
  return (
    <div className="tabellenrahmen">
      <table className="tabelle klein">
        <thead><tr>
          <th>{t('systemzustand.extern.spalte.zeitpunkt')}</th><th>{t('systemzustand.extern.spalte.person')}</th><th>{t('systemzustand.extern.spalte.funktion')}</th><th>{t('systemzustand.extern.spalte.paket')}</th>
          <th className="rechts">{t('systemzustand.extern.spalte.token')}</th><th className="rechts">{t('systemzustand.extern.spalte.dauer')}</th><th className="rechts">{t('systemzustand.extern.spalte.kosten')}</th>
        </tr></thead>
        <tbody>{k.teuerste.map((z, i) => (
          <tr key={z.id ?? i}>
            <td>{zeit(z.zeit)}</td><td>{name.person(z.benutzerId)}</td><td>{funktionName(z.funktion)}</td><td>{name.paket(z.paket)}</td>
            <td className="rechts">{t('systemzustand.extern.token-ein-aus', { ein: zahl(z.tokenEin), aus: zahl(z.tokenAus) })}</td>
            <td className="rechts">{ms(z.ms)}</td><td className="rechts">{geld(z.kosten, k.einstellung.waehrung)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/** Preise je 1 Mio. Token je KI-Paket, Währung, Monatsbudget, harte Grenze. */
function KostenEinstellungen({ k, gespeichert }: { k: ExternKosten; gespeichert: (x: ExternKosten) => void }) {
  const basis = alsEingabe(k.einstellung, k.kiPakete);
  const [e, setE] = useState<Eingabe>(basis);
  const [felder, setFelder] = useState<Record<string, string>>({});
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const ent = useEntwurf(basis, e, { zuruecksetzen: () => { setE(basis); setFelder({}); setMeldung(undefined); } });
  async function speichern() {
    setSendet(true); setFelder({}); setMeldung(undefined);
    const preise: Record<string, Preis> = Object.fromEntries(Object.entries(e.preise).map(([id, p]) => [id, { ein: zahlAus(p.ein), aus: zahlAus(p.aus) }]));
    try {
      const x = await betriebApi.setzeExternKosten({ waehrung: e.waehrung.trim().toUpperCase(), budget: e.budget.trim() === '' ? null : zahlAus(e.budget), hart: e.hart, preise });
      setE(alsEingabe(x.einstellung, x.kiPakete));
      gespeichert(x);
      setMeldung({ art: 'gut', text: t('systemzustand.extern.kosten.gespeichert') });
    } catch (x) {
      const ff = x instanceof ApiFehler ? (x.details as { felderFehler?: Record<string, string> } | undefined)?.felderFehler : undefined;
      if (ff) setFelder(ff);
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    } finally { setSendet(false); }
  }
  const pakete = Object.keys(e.preise);
  return (
    <form className="stapel" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
      <h3 className="h4">{t('systemzustand.extern.kosten.einstellungen')}</h3>
      {!pakete.length
        ? <p className="leise klein">{t('systemzustand.extern.kosten.keine-pakete')}</p>
        : pakete.map((id) => (
          <div key={id} className="raster">
            <Feld beschriftung={t('systemzustand.extern.kosten.preis-ein', { paket: k.pakete[id] ?? id, waehrung: e.waehrung })} fehler={felder[`preise.${id}.ein`]} optional>
              <input id={`preis-${id}-ein`} type="number" inputMode="decimal" min={0} step="any" value={e.preise[id].ein} onChange={(x) => setE({ ...e, preise: { ...e.preise, [id]: { ...e.preise[id], ein: x.target.value } } })} />
            </Feld>
            <Feld beschriftung={t('systemzustand.extern.kosten.preis-aus', { paket: k.pakete[id] ?? id, waehrung: e.waehrung })} fehler={felder[`preise.${id}.aus`]} optional>
              <input id={`preis-${id}-aus`} type="number" inputMode="decimal" min={0} step="any" value={e.preise[id].aus} onChange={(x) => setE({ ...e, preise: { ...e.preise, [id]: { ...e.preise[id], aus: x.target.value } } })} />
            </Feld>
          </div>
        ))}
      <p className="leise klein">{t('systemzustand.extern.kosten.preis-hinweis')}</p>
      <div className="raster">
        <Feld beschriftung={t('systemzustand.extern.kosten.waehrung')} fehler={felder.waehrung}>
          <input id="ki-kosten-waehrung" maxLength={3} value={e.waehrung} onChange={(x) => setE({ ...e, waehrung: x.target.value })} />
        </Feld>
        <Feld beschriftung={t('systemzustand.extern.kosten.budget')} hinweis={t('systemzustand.extern.kosten.budget.hinweis', { prozent: Math.round(WARNUNG_AB * 100) })} fehler={felder.budget} optional>
          <input id="ki-kosten-budget" type="number" inputMode="decimal" min={0} step="any" value={e.budget} onChange={(x) => setE({ ...e, budget: x.target.value, hart: x.target.value.trim() === '' ? false : e.hart })} />
        </Feld>
      </div>
      <HakenFeld beschriftung={t('systemzustand.extern.kosten.hart')} hinweis={t('systemzustand.extern.kosten.hart.hinweis')}>
        <input id="ki-kosten-hart" type="checkbox" checked={e.hart} disabled={e.budget.trim() === ''} onChange={(x) => setE({ ...e, hart: x.target.checked })} />
      </HakenFeld>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <Speicherleiste ent={ent} gegenstand={t('systemzustand.extern.kosten.einstellungen')} sendet={sendet} />
    </form>
  );
}
