import { useCallback, useEffect, useState } from 'react';
import { Knopf, type KnopfErgebnis } from '../bausteine';
import { api, type EingangEinstellung, type EingangKnoten, type EingangStand, type EingangUeberblick, type EingangWarnung } from '../api';
import { Link } from '../ort';
import { Hilfe } from '../Hilfe';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Werkbank → Eingangsordner (#195): Ein/Aus, Prüfabstand, was nach dem Übernehmen geschieht,
 * zuletzt übernommene Dateien und Fehler. Nur sichtbar, wenn /eingang eingebunden ist.
 * Seit #915: Ordner je Person (nur die vollständige E-Mail-Adresse setzt „Für“) und Überwachung mit Baum je Ordner.
 */

const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'medium' });
const tag = (iso: string) => new Date(iso).toLocaleDateString(gebietsschema(), { dateStyle: 'medium' });
export const groesse = (b: number) => (b < 1024 ** 2 ? `${Math.max(1, Math.round(b / 1024)).toLocaleString(gebietsschema())} KB` : b < 1024 ** 3 ? `${Math.round(b / 1024 ** 2).toLocaleString(gebietsschema())} MB` : `${(b / 1024 ** 3).toLocaleString(gebietsschema(), { maximumFractionDigits: 1 })} GB`);

/** Baum der Überwachung als Zeilen mit Einrückung. */
function zeilen(k: EingangKnoten, tiefe = 0, aus: Array<{ k: EingangKnoten; tiefe: number }> = []) {
  aus.push({ k, tiefe });
  for (const c of k.kinder) zeilen(c, tiefe + 1, aus);
  return aus;
}

/**
 * Überwachung (#915): je Ordner Anzahl der Dateien, Speicherbedarf und älteste Datei; die Ursache jeder Warnung ist
 * hervorgehoben (zu alt: das Datum; zu groß bzw. zu viele: die Ordner, die mindestens ein Viertel ausmachen;
 * fehler/: die Zeile; zu tief: die Zahl der Dateien, die liegen bleiben).
 */
function Baum({ u, w, e }: { u: EingangUeberblick; w: EingangWarnung[]; e: EingangEinstellung }) {
  const grenzeAlt = Date.now() - (e.warnTage ?? 180) * 86_400_000;
  const z = zeilen(u.baum);
  return (
    <div className="tabellenrahmen">
      <table className="tabelle klein eo-baum">
        <thead><tr><th>{t('werkbank.eingangsordner.baum.ordner')}</th><th>{t('werkbank.eingangsordner.baum.dateien')}</th><th>{t('werkbank.eingangsordner.baum.groesse')}</th><th>{t('werkbank.eingangsordner.baum.aelteste')}</th></tr></thead>
        <tbody>{z.map(({ k, tiefe }) => {
          const fehlerZeile = w.includes('fehler') && /^fehler(\/|$)/i.test(k.pfad) && k.dateien > 0;
          const alt = w.includes('alt') && !!k.aeltester && Date.parse(k.aeltester) < grenzeAlt;
          const viel = w.includes('anzahl') && k.dateien * 4 >= u.dateien;
          const gross = w.includes('groesse') && k.bytes * 4 >= u.bytes;
          return (
            <tr key={k.pfad || '/'} className={fehlerZeile ? 'eo-hervor' : undefined}>
              <td style={{ paddingLeft: `${8 + tiefe * 16}px` }}><code>{k.pfad ? `${k.name}/` : 'eingang/'}</code>
                {k.zuTief > 0 && <span className="eo-hervor-text klein"> {t('werkbank.eingangsordner.baum.zu-tief', { anzahl: k.zuTief })}</span>}</td>
              <td className={viel ? 'eo-hervor-text' : undefined}>{k.dateien.toLocaleString(gebietsschema())}</td>
              <td className={gross ? 'eo-hervor-text' : undefined}>{k.dateien ? groesse(k.bytes) : '–'}</td>
              <td className={alt ? 'eo-hervor-text' : undefined}>{k.aeltester ? tag(k.aeltester) : '–'}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

export function useEingangsordner(offen: boolean) {
  const [stand, setStand] = useState<EingangStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await api.eingangsordner()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { void laden(); }, [laden]);
  useEffect(() => {
    if (!offen) return;
    const timer = setInterval(() => void laden(), 10_000);
    return () => clearInterval(timer);
  }, [offen, laden]);
  return { stand, fehler, laden, setStand };
}
export type EingangZustand = ReturnType<typeof useEingangsordner>;

export function EingangsordnerPanel({ z }: { z: EingangZustand }) {
  const s = z.stand;
  const [e, setE] = useState<EingangEinstellung | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  useEffect(() => { if (s?.einstellung && !e) setE(s.einstellung); }, [s, e]);
  const ent = useEntwurf(s?.einstellung ?? null, e, { aus: !e, zuruecksetzen: () => { setE(s?.einstellung ?? null); setMeldung(undefined); } });
  if (!s) return <p className="leise">{z.fehler ?? t('werkbank.eingangsordner.lade')}</p>;
  if (!s.vorhanden || !e) {
    return (
      <div className="einspaltig"><div className="mappenkopf"><p className="ueber">{t('werkbank.eingangsordner.werkbank')}</p><h1>{t('werkbank.eingangsordner.eingangsordner')}</h1>
        <p className="leise">{tn('werkbank.eingangsordner.es-ist-kein-eingangsordner', { code: <code>{'/eingang'}</code>, hilfe: <Hilfe ort="werkbank.eingangsordner" /> })}</p></div></div>
    );
  }
  async function speichern() {
    setSendet(true);
    try { const n = await api.eingangsordnerSetzen(e!); z.setStand(n); setE(n.einstellung ?? e); setMeldung({ art: 'gut', text: t('werkbank.eingangsordner.gespeichert') }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  async function personen() {
    setSendet(true);
    try { const r = await api.eingangsordnerPersonen(); z.setStand(r.stand); setMeldung({ art: 'gut', text: t('werkbank.eingangsordner.personen.angelegt', { anzahl: r.angelegt.length }) }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  // „Jetzt prüfen“ (#986): Ergebnis und Fehler stehen am Knopf, nicht oben auf der Seite.
  async function jetzt(): Promise<KnopfErgebnis> {
    const r = await api.eingangsordnerPruefen();
    z.setStand(r.stand);
    return { art: 'gut', text: r.uebernommen ? t('werkbank.eingangsordner.dateien-uebernommen', { anzahl: r.uebernommen }) : t('werkbank.eingangsordner.geprueft-nichts-fertiges-gefunden') };
  }
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.eingangsordner.werkbank')}</p>
        <h1>{t('werkbank.eingangsordner.eingangsordner')}</h1>
        <p className="leise">{tn('werkbank.eingangsordner.jede-fertige-datei-im', { code: <code>{s.pfad}</code>, code2: <code>{t('werkbank.eingangsordner.eingang-lena')}</code>, hilfe: <Hilfe ort="werkbank.eingangsordner" /> })}</p>
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      {s.pausiert && <div className="hinweis warn"><p>{t('werkbank.eingangsordner.ruht-gerade', { pausiert: s.pausiert })}</p></div>}
      {s.andereInstanz && <div className="hinweis warn"><p>{t('werkbank.eingangsordner.eine-andere-instanz-von')}</p></div>}
      {(s.ohnePerson ?? []).map((o) => <div key={o} className="hinweis warn"><p><strong>{t('werkbank.eingangsordner.ohne-person', { ordner: o })}</strong> {t('werkbank.eingangsordner.ohne-person.text')}</p></div>)}
      {(s.umbenennen ?? []).map((x) => <div key={x.neu} className="hinweis warn"><p><strong>{t('werkbank.eingangsordner.umbenennen', { alt: x.alt, neu: x.neu })}</strong> {t('werkbank.eingangsordner.umbenennen.text')}</p></div>)}
      <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <h2 className="h3">{t('werkbank.eingangsordner.einstellungen')}</h2>
        <label className="haken"><input id="eingang-aktiv" type="checkbox" checked={e.aktiv} onChange={(x) => setE({ ...e, aktiv: x.target.checked })} /><span>{t('werkbank.eingangsordner.eingangsordner-pruefen')}</span></label>
        <div className="raster">
          <label className="eigenschaft"><span>{tn('werkbank.eingangsordner.pruefabstand', { klein: <small>{t('werkbank.eingangsordner.in-sekunden-5-bis')}</small> })}</span>
            <input id="eingang-abstand" type="number" min={5} max={3600} value={e.abstand} onChange={(x) => setE({ ...e, abstand: Number(x.target.value) })} /></label>
          <label className="eigenschaft"><span>{t('werkbank.eingangsordner.nach-dem-uebernehmen')}</span>
            <select id="eingang-nachher" value={e.nachher} onChange={(x) => setE({ ...e, nachher: x.target.value as EingangEinstellung['nachher'] })}>
              <option value="erledigt">{t('werkbank.eingangsordner.in-erledigt-verschieben')}</option>
              <option value="loeschen">{t('werkbank.eingangsordner.loeschen')}</option>
            </select></label>
        </div>
        <label className="haken"><input type="checkbox" checked={e.doppelteUeberspringen === true} onChange={(x) => setE({ ...e, doppelteUeberspringen: x.target.checked })} />
          <span>{tn('werkbank.eingangsordner.doppelte-dateien-ueberspringen', { klein: <small className="leise">{t('werkbank.eingangsordner.liegt-genau-diese-datei')}</small> })}</span></label>
        <label className="haken"><input id="eingang-automatisch" type="checkbox" checked={e.ordnerAutomatisch === true} onChange={(x) => setE({ ...e, ordnerAutomatisch: x.target.checked })} />
          <span>{tn('werkbank.eingangsordner.ordner-automatisch', { klein: <small className="leise">{t('werkbank.eingangsordner.ordner-automatisch.text')}</small> })}</span></label>
        <h3 className="h4">{t('werkbank.eingangsordner.warnen')}</h3>
        <p className="leise klein">{t('werkbank.eingangsordner.warnen.text')}</p>
        <div className="raster">
          <label className="eigenschaft"><span>{t('werkbank.eingangsordner.warn-tage')}</span>
            <input id="eingang-warn-tage" type="number" min={0} max={3650} value={e.warnTage ?? 180} onChange={(x) => setE({ ...e, warnTage: Number(x.target.value) })} /></label>
          <label className="eigenschaft"><span>{t('werkbank.eingangsordner.warn-gb')}</span>
            <input id="eingang-warn-gb" type="number" min={0} step="0.1" value={e.warnGb ?? 2} onChange={(x) => setE({ ...e, warnGb: Number(x.target.value) })} /></label>
          <label className="eigenschaft"><span>{t('werkbank.eingangsordner.warn-dateien')}</span>
            <input id="eingang-warn-dateien" type="number" min={0} value={e.warnDateien ?? 100} onChange={(x) => setE({ ...e, warnDateien: Number(x.target.value) })} /></label>
        </div>
        <div className="knoepfe">
          <Knopf onClick={jetzt} laeuftText={t('werkbank.eingangsordner.prueft')}>{t('werkbank.eingangsordner.jetzt-pruefen')}</Knopf>
        </div>
        <Speicherleiste ent={ent} gegenstand={t('werkbank.eingangsordner.einstellungen')} sendet={sendet} />
      </form>
      <div className="blatt" id="personen">
        <h2 className="h3">{t('werkbank.eingangsordner.personen')}</h2>
        <p className="leise">{tn('werkbank.eingangsordner.personen.text', { code: <code>{t('werkbank.eingangsordner.eingang-lena')}</code>, code2: <code>{t('werkbank.eingangsordner.eingang-lena-erledigt')}</code> })}</p>
        <p className="leise klein">{t('werkbank.eingangsordner.personen.leserecht')} <Hilfe ort="werkbank.eingangsordner" /></p>
        <div className="knoepfe">
          <button type="button" className="knopf" disabled={sendet || s.ohneOrdner === 0} onClick={() => void personen()}>{t('werkbank.eingangsordner.personen.anlegen')}</button>
          <span className="leise klein">{s.ohneOrdner ? t('werkbank.eingangsordner.personen.ohne', { anzahl: s.ohneOrdner }) : t('werkbank.eingangsordner.personen.alle')}</span>
        </div>
      </div>
      <div className="blatt" id="ueberwachung">
        <h2 className="h3">{t('werkbank.eingangsordner.ueberwachung')}</h2>
        {!s.ueberblick ? <p className="leise">{t('werkbank.eingangsordner.ueberwachung.noch-nicht')}</p> : <>
          {(s.warnungen ?? []).length > 0 && <div className="hinweis warn"><ul>{(s.warnungen ?? []).map((w) => <li key={w}>{t.frei(`werkbank.eingangsordner.warnung.${w}`, { anzahl: w === 'fehler' ? s.ueberblick!.fehler : s.ueberblick!.dateien, tage: e.warnTage ?? 180, groesse: groesse(s.ueberblick!.bytes), zahl: (w === 'fehler' ? s.ueberblick!.fehler : s.ueberblick!.dateien).toLocaleString(gebietsschema()) })}</li>)}</ul></div>}
          <p className="leise klein">{t('werkbank.eingangsordner.ueberwachung.text', { zeit: zeit(s.ueberblick.berechnet) })}</p>
          <Baum u={s.ueberblick} w={s.warnungen ?? []} e={s.einstellung ?? e} />
          {s.ueberblick.gekuerzt && <p className="leise klein">{t('werkbank.eingangsordner.ueberwachung.gekuerzt')}</p>}
          {s.ueberblick.zuTief > 0 && <p className="leise klein">{t('werkbank.eingangsordner.ueberwachung.zu-tief', { anzahl: s.ueberblick.zuTief })}</p>}
        </>}
      </div>
      <div className="blatt">
        <h2 className="h3">{t('werkbank.eingangsordner.stand')}</h2>
        <dl className="eigenschaften">
          <dt>{t('werkbank.eingangsordner.letzte-pruefung')}</dt><dd>{s.letztePruefung ? zeit(s.letztePruefung) : '–'}</dd>
          <dt>{t('werkbank.eingangsordner.noch-nicht-fertig')}</dt><dd>{s.wartend ?? 0} {s.wartend === 1 ? t('werkbank.eingangsordner.datei') : t('werkbank.eingangsordner.dateien')} <span className="leise klein">{t('werkbank.eingangsordner.werden-uebernommen-sobald-sie')}</span></dd>
        </dl>
        {(s.fehler ?? []).length > 0 && <>
          <h3 className="h4">{t('werkbank.eingangsordner.fehler')}</h3>
          <ul>{(s.fehler ?? []).map((f) => <li key={`${f.datei}-${f.zeit}`}><strong>{f.datei}</strong> ({zeit(f.zeit)}): {f.grund}</li>)}</ul>
          <p className="leise klein">{tn('werkbank.eingangsordner.abgelehnte-dateien-liegen-in', { code: <code>{t('werkbank.eingangsordner.fehler-2')}</code> })}</p>
        </>}
      </div>
      <div className="blatt" id="uebernommen">
        <h2 className="h3">{t('werkbank.eingangsordner.zuletzt-uebernommen')}</h2>
        {!(s.uebernommen ?? []).length ? <p className="leise">{t('werkbank.eingangsordner.noch-nichts-uebernommen')}</p> : (
          <ul className="sitzungsliste festhoehe">
            {(s.uebernommen ?? []).map((u) => (
              <li key={`${u.datei}-${u.zeit}`}>
                <span><strong>{u.datei}</strong> <span className="leise klein">{zeit(u.zeit)}</span></span>
                {u.mappeId && <Link to={`/ablage/eingang/${u.mappeId}`} className="verweis klein">{t('werkbank.eingangsordner.post-oeffnen')}</Link>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
