import { Knopf, type KnopfErgebnis } from '../bausteine';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type Auftrag, type ExportUmzug, type KontaktZuordnung, type VollexportStand } from '../api';
import { t, tn } from '../sprache';
import { EXPORT_TAGE } from '../../../shared/src/auskunft';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { rueckfrage } from '../rueckfrage';
import { fortschrittText } from '../../../shared/src/auftrag';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Werkbank → Vollexport (#254): alle Daten in offenen Formaten, lesbar ohne das DMS.
 * Läuft im Hintergrund und schreibt in den Export-Ordner (#797) – neben files/, nicht bei den Sicherungen.
 */

const mb = (b: number) => (b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(b < 10 * 1024 ** 2 ? 1 : 0).replace('.', ',')} MB` : `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB`);
const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });
const tag = (iso: string) => new Date(iso).toLocaleDateString(gebietsschema(), { dateStyle: 'medium' });

/** Hinweise zum Export-Ordner (#797) – oben auf der Seite und in der Übersicht der Werkbank. */
export function exportHinweise(e: { pfad: string; imSicherungsordner: boolean; umzug: ExportUmzug | null }, tage = EXPORT_TAGE): Array<{ art: 'schlecht' | 'info'; text: ReactNode; umzug?: boolean; schluessel: string }> {
  const h: Array<{ art: 'schlecht' | 'info'; text: ReactNode; umzug?: boolean; schluessel: string }> = [];
  if (e.imSicherungsordner) h.push({ schluessel: 'export.im-sicherungsordner', art: 'schlecht', text: <><strong>{t('werkbank.export.im-sicherungsordner')}</strong> {t('werkbank.export.im-sicherungsordner.text')}</> });
  if (e.umzug) h.push({ schluessel: 'export.umzug', art: e.umzug.uebrig ? 'schlecht' : 'info', umzug: true, text: <>
    {e.umzug.anzahl > 0 && <><strong>{t('werkbank.export.umzug', { anzahl: e.umzug.anzahl })}</strong> {t('werkbank.export.umzug.text', { pfad: e.pfad, tage })}</>}
    {e.umzug.uebrig && <> {t('werkbank.export.umzug.uebrig')}</>}
  </> });
  return h;
}

const ANGABEN: Array<[keyof KontaktZuordnung, string]> = [['name', t('werkbank.vollexport.name')], ['firma', t('werkbank.vollexport.firma')], ['email', t('werkbank.vollexport.e-mail')], ['telefon', t('werkbank.vollexport.telefon')], ['adresse', t('werkbank.vollexport.adresse')], ['notiz', t('werkbank.vollexport.notiz')]];

export function useVollexport(offen: boolean) {
  const [stand, setStand] = useState<VollexportStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await api.vollexport()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  return { stand, fehler, laden };
}
export type VollexportZustand = ReturnType<typeof useVollexport>;

export function VollexportPanel({ z }: { z: VollexportZustand }) {
  const d = useDaten();
  const s = z.stand;
  const [pw, setPw] = useState(false);
  const [pwOk, setPwOk] = useState(false);
  const [protokolle, setProtokolle] = useState(false);
  const [kontakte, setKontakte] = useState<Record<string, KontaktZuordnung | null>>({});
  const [auftrag, setAuftrag] = useState<Auftrag | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht' | 'info'; text: string }>();
  useEffect(() => { if (s && !Object.keys(kontakte).length) setKontakte(Object.fromEntries(s.kontakte.map((k) => [k.typId, k.zuordnung]))); }, [s]); // eslint-disable-line react-hooks/exhaustive-deps -- Vorbelegung nur einmal, sobald der Stand da ist – Eingaben nicht überschreiben
  useEffect(() => {
    if (auftrag?.status !== 'laeuft') return;
    const timer = setInterval(() => void api.auftrag().then((a) => { setAuftrag(a); if (a?.status !== 'laeuft') void z.laden(); }), 1500);
    return () => clearInterval(timer);
  }, [auftrag?.status]); // eslint-disable-line react-hooks/exhaustive-deps -- Abfrage nur beim Wechsel des Status starten oder stoppen
  async function tu(f: () => Promise<string>) {
    setMeldung(undefined);
    try { setMeldung({ art: 'gut', text: await f() }); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }
  if (!s) return <p className="leise">{z.fehler ?? t('werkbank.vollexport.lade')}</p>;
  const noetig = s.abschaetzung.bytes * 1.1 + 50 * 1024 ** 2;
  const fertig = auftrag?.status === 'fertig' && auftrag.art === 'vollexport' ? auftrag.ergebnis as { name: string; dateien: number; bytes: number } : null;
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.vollexport.werkbank')}</p>
        <h1>{t('werkbank.vollexport.vollexport')}</h1>
        <p className="leise">{tn('werkbank.vollexport.deine-daten-gehoeren-dir', { b: <strong>{t('werkbank.vollexport.alles')}</strong>, b2: <strong>{t('werkbank.vollexport.unverschluesselt')}</strong>, hilfe: <Hilfe ort="werkbank.vollexport" /> })}</p>
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      {exportHinweise({ pfad: s.ordner, imSicherungsordner: s.imSicherungsordner, umzug: s.umzug }, s.tage).map((x, i) => (
        <div key={i} className={`hinweis ${x.art}`}><p>{x.text}</p>
          {x.umzug && <button type="button" className="knopf klein" onClick={() => void api.vollexportUmzugGesehen().then(z.laden, (e: Error) => setMeldung({ art: 'schlecht', text: e.message }))}>{t('werkbank.export.umzug.ok')}</button>}
        </div>
      ))}
      <div className="blatt">
        <h2 className="h3">{t('werkbank.vollexport.neuer-export')}</h2>
        <p>{t('werkbank.vollexport.mappen-dateien-noetig-etwa', { mappen: s.abschaetzung.mappen.toLocaleString(gebietsschema()), dokumente: s.abschaetzung.dokumente.toLocaleString(gebietsschema()), mb: mb(s.abschaetzung.bytes), mb2: mb(noetig) })}{s.frei !== null && <>{t('werkbank.vollexport.frei', { mb: mb(s.frei) })}</>}.</p>
        <p className="leise klein">{tn('werkbank.vollexport.ziel', { code: <code className="mono">{s.ordner}</code> })}</p>
        <p className="leise klein">{t('werkbank.export.ablage', { tage: s.tage })}</p>
        {s.volume === false && <p className="leise klein">{t('werkbank.export.container')}</p>}
        {s.frei !== null && s.frei < noetig && <p className="hinweis schlecht">{t('werkbank.vollexport.zu-wenig-platz-am')}</p>}
        <label className="haken"><input type="checkbox" checked={protokolle} onChange={(e) => setProtokolle(e.target.checked)} /><span>{tn('werkbank.vollexport.technische-protokolle-mitnehmen', { klein: <small className="hilfe">{t('werkbank.vollexport.das-protokoll-seit-dem')}</small> })}</span></label>
        <label className="haken"><input type="checkbox" checked={pw} onChange={(e) => { setPw(e.target.checked); if (!e.target.checked) setPwOk(false); }} /><span>{tn('werkbank.vollexport.passwortfelder-im-klartext-als', { klein: <small className="hilfe">{t('werkbank.vollexport.im-format-von-bitwarden')}</small> })}</span></label>
        {pw && <label className="haken einzug"><input type="checkbox" checked={pwOk} onChange={(e) => setPwOk(e.target.checked)} /><span className="fehlertext">{t('werkbank.vollexport.mir-ist-klar-die')}</span></label>}
        {s.kontakte.length > 0 && <>
          <h3 className="h4">{tn('werkbank.vollexport.kontakte-als-vcard', { hilfe: <Hilfe ort="werkbank.vollexport.kontakte" /> })}</h3>
          <p className="leise klein">{t('werkbank.vollexport.diese-mappentypen-sehen-nach')}</p>
          {s.kontakte.map((k) => {
            const z2 = kontakte[k.typId];
            const typ = d.typ(k.typId);
            const felder = typ?.felder.filter((f) => f.typ === 'text' || f.typ === 'langtext') ?? [];
            return (
              <fieldset key={k.typId} className="wahl">
                <legend><label className="haken"><input type="checkbox" checked={!!z2} onChange={(e) => setKontakte((x) => ({ ...x, [k.typId]: e.target.checked ? k.zuordnung : null }))} /><span>{k.typ}</span></label></legend>
                {z2 && <div className="raster">{ANGABEN.map(([a, label]) => (
                  <label key={a} className="eigenschaft klein"><span>{label}</span>
                    <select value={z2[a] ?? ''} onChange={(e) => setKontakte((x) => ({ ...x, [k.typId]: { ...z2, [a]: e.target.value || undefined } as KontaktZuordnung }))}>
                      {a !== 'name' && <option value="">–</option>}
                      {felder.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select></label>
                ))}</div>}
              </fieldset>
            );
          })}
        </>}
        {auftrag?.status === 'laeuft' && <p className="leise" role="status">{fortschrittText(auftrag)}</p>}
        {fertig && <p className="gutertext" role="status">{t('werkbank.vollexport.fertig-dateien-in', { dateien: fertig.dateien, mb: mb(fertig.bytes), name: fertig.name })}</p>}
        {auftrag?.status === 'fehler' && <p className="fehlertext">{auftrag.fehler}</p>}
        <div className="knoepfe"><button type="button" className="knopf primaer" disabled={auftrag?.status === 'laeuft' || (pw && !pwOk)}
          onClick={() => void tu(async () => {
            setAuftrag(await api.vollexportStarten({ passwoerter: pw, passwoerterBestaetigt: pwOk, protokolle, kontakte: Object.fromEntries(Object.entries(kontakte).filter((e): e is [string, KontaktZuordnung] => !!e[1])) }));
            return t('werkbank.vollexport.export-laeuft-im-hintergrund');
          })}>{t('werkbank.vollexport.export-starten')}</button></div>
      </div>
      <div className="blatt">
        <h2 className="h3">{t('werkbank.vollexport.meine-daten-exportieren')}</h2>
        <label className="haken"><input type="checkbox" checked={s.persoenlich} onChange={(e) => void tu(async () => { await api.persoenlicherExport(e.target.checked); await z.laden(); return e.target.checked ? t('werkbank.vollexport.benutzer-duerfen-ihre-daten') : t('werkbank.vollexport.meine-daten-exportieren-abgeschaltet'); })} />
          <span>{tn('werkbank.vollexport.benutzer-duerfen-ihre-eigenen', { klein: <small className="hilfe">{t('werkbank.vollexport.mein-konto-konto-meine')}</small> })}</span></label>
      </div>
      <div className="blatt" id="exporte">
        <h2 className="h3">{t('werkbank.vollexport.vorhandene-exporte')}</h2>
        {!s.exporte.length ? <p className="leise">{t('werkbank.vollexport.noch-kein-export')}</p> : <ul className="stapel">
          {s.exporte.map((e) => (
            <li key={e.name} className={e.passwoerter ? 'mitpasswoertern' : undefined}>
              <strong>{e.erstellt ? zeit(e.erstellt) : e.name}</strong> <span className="leise klein">{t('werkbank.vollexport.dateien', { mb: mb(e.bytes), dateien: e.dateien, wert: e.mappen !== null ? t('werkbank.vollexport.mappen', { mappen: e.mappen }) : '', wert2: t('werkbank.export.bis', { datum: tag(e.bis) }) })}</span>
              {/* #366: liegt unverschlüsselt im Export-Ordner – deutlich markieren. */}
              {e.passwoerter && <span className="fehlertext klein blockzeile">{tn('werkbank.vollexport.nach-dem-import-in', { b: <strong>{t('werkbank.vollexport.enthaelt-passwoerter-im-klartext')}</strong> })}</span>}
              <span className="knoepfe">
                <a className="knopf klein" href={`/api/werkbank/export/${encodeURIComponent(e.name)}/zip`}>{t('werkbank.vollexport.als-zip-herunterladen')}</a>
                {/* „Prüfen“ (#986): Ergebnis in der Zeile des Exports, nicht oben auf der Seite. */}
                <Knopf groesse="klein" laeuftText={t('werkbank.vollexport.prueft')} onClick={async (): Promise<KnopfErgebnis> => {
                  const r = await api.vollexportPruefen(e.name);
                  return r.ok ? { art: 'gut', text: t('werkbank.vollexport.alle-dateien-vollstaendig-und', { dateien: r.dateien }) }
                    : { art: 'schlecht', text: t('werkbank.vollexport.abweichungen', { wert: [...r.fehlend.map((x) => t('werkbank.vollexport.fehlt', { x })), ...r.abweichend.map((x) => t('werkbank.vollexport.veraendert', { x }))].slice(0, 5).join(', '), wert2: r.fehlend.length + r.abweichend.length > 5 ? ' …' : '' }) };
                }}>{t('werkbank.vollexport.pruefen')}</Knopf>
                <button type="button" className="knopf klein gefahr-rand" onClick={async () => { if (await rueckfrage({ titel: t('werkbank.vollexport.diesen-export-loeschen'), text: e.name, ja: t('werkbank.vollexport.loeschen'), gefahr: true })) void tu(async () => { await api.vollexportLoeschen(e.name); await z.laden(); return t('werkbank.vollexport.export-geloescht'); }); }}>{t('werkbank.vollexport.loeschen')}</button>
              </span>
            </li>
          ))}
        </ul>}
      </div>
    </div>
  );
}
