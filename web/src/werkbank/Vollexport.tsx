import { Feld, HakenFeld, Knopf } from '../bausteine';
import { Link } from '../ort';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Auftrag } from '../../../shared/src/auftrag';
import { betriebApi, type KontaktZuordnung } from '../api/betrieb';
import type { ExportUmzug, VollexportStand } from '../api/konto';
import { t, tn } from '../sprache';
import { EXPORT_TAGE } from '../../../shared/src/auskunft';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { fortschrittText } from '../../../shared/src/auftrag';
import { gebietsschema } from '../../../shared/src/sprache';
import { Kopf } from './Kopf';
import { mb, VollexportListe } from './VollexportListe';

/**
 * Werkbank → Vollexport (#254): alle Daten in offenen Formaten, lesbar ohne das DMS.
 * Läuft im Hintergrund und schreibt in den Export-Ordner (#797) – neben files/, nicht bei den Sicherungen.
 */


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
  const laden = useCallback(async () => { try { setStand(await betriebApi.vollexport()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
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
    const timer = setInterval(() => void betriebApi.auftrag().then((a) => { setAuftrag(a); if (a?.status !== 'laeuft') void z.laden(); }), 1500);
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
      <Kopf titel={t('werkbank.vollexport.vollexport')} ueber={t('werkbank.vollexport.werkbank')} hilfe="werkbank.vollexport">
        <p className="leise">{tn('werkbank.vollexport.deine-daten-gehoeren-dir', { b: <strong>{t('werkbank.vollexport.alles')}</strong>, b2: <strong>{t('werkbank.vollexport.unverschluesselt')}</strong> })}</p>
      </Kopf>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      {exportHinweise({ pfad: s.ordner, imSicherungsordner: s.imSicherungsordner, umzug: s.umzug }, s.tage).map((x, i) => (
        <div key={i} className={`hinweis ${x.art}`}><p>{x.text}</p>
          {x.umzug && <Knopf groesse="klein" onClick={() => betriebApi.vollexportUmzugGesehen().then(z.laden, (e: Error) => setMeldung({ art: 'schlecht', text: e.message }))}>{t('werkbank.export.umzug.ok')}</Knopf>}
        </div>
      ))}
      <div className="blatt">
        <h2 className="h3">{t('werkbank.vollexport.neuer-export')}</h2>
        <p>{t('werkbank.vollexport.mappen-dateien-noetig-etwa', { mappen: s.abschaetzung.mappen.toLocaleString(gebietsschema()), dokumente: s.abschaetzung.dokumente.toLocaleString(gebietsschema()), mb: mb(s.abschaetzung.bytes), mb2: mb(noetig) })}{s.frei !== null && <>{t('werkbank.vollexport.frei', { mb: mb(s.frei) })}</>}.</p>
        <p className="leise klein">{tn('werkbank.vollexport.ziel', { code: <code className="mono">{s.ordner}</code> })}</p>
        <p className="leise klein">{t('werkbank.export.ablage', { tage: s.tage })}</p>
        {s.volume === false && <p className="leise klein">{t('werkbank.export.container')}</p>}
        {s.frei !== null && s.frei < noetig && <p className="hinweis schlecht">{t('werkbank.vollexport.zu-wenig-platz-am')}</p>}
        <HakenFeld beschriftung={t('werkbank.vollexport.technische-protokolle-mitnehmen')} hinweis={t('werkbank.vollexport.das-protokoll-seit-dem')}>
          <input type="checkbox" checked={protokolle} onChange={(e) => setProtokolle(e.target.checked)} />
        </HakenFeld>
        <HakenFeld beschriftung={t('werkbank.vollexport.passwortfelder-im-klartext-als')} hinweis={t('werkbank.vollexport.im-format-von-bitwarden')}>
          <input type="checkbox" checked={pw} onChange={(e) => { setPw(e.target.checked); if (!e.target.checked) setPwOk(false); }} />
        </HakenFeld>
        {pw && <HakenFeld beschriftung={<span className="fehlertext">{t('werkbank.vollexport.mir-ist-klar-die')}</span>} className="einzug">
          <input type="checkbox" checked={pwOk} onChange={(e) => setPwOk(e.target.checked)} />
        </HakenFeld>}
        {s.kontakte.length > 0 && <>
          <h3 className="h4">{t('werkbank.vollexport.kontakte-als-vcard')} <Hilfe ort="werkbank.vollexport.kontakte" /></h3>
          <p className="leise klein">{t('werkbank.vollexport.diese-mappentypen-sehen-nach')}</p>
          {s.kontakte.map((k) => {
            const z2 = kontakte[k.typId];
            const typ = d.typ(k.typId);
            const felder = typ?.felder.filter((f) => f.typ === 'text' || f.typ === 'langtext') ?? [];
            return (
              <div key={k.typId} className="wahl">
                <HakenFeld beschriftung={k.typ}>
                  <input type="checkbox" checked={!!z2} onChange={(e) => setKontakte((x) => ({ ...x, [k.typId]: e.target.checked ? k.zuordnung : null }))} />
                </HakenFeld>
                {z2 && <div className="raster">{ANGABEN.map(([a, label]) => (
                  <Feld key={a} beschriftung={label} className="klein">
                    <select value={z2[a] ?? ''} onChange={(e) => setKontakte((x) => ({ ...x, [k.typId]: { ...z2, [a]: e.target.value || undefined } as KontaktZuordnung }))}>
                      {a !== 'name' && <option value="">–</option>}
                      {felder.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                  </Feld>
                ))}</div>}
              </div>
            );
          })}
        </>}
        {auftrag?.status === 'laeuft' && <p className="leise" role="status">{fortschrittText(auftrag)}</p>}
        {fertig && <p className="gutertext" role="status">{t('werkbank.vollexport.fertig-dateien-in', { dateien: fertig.dateien, mb: mb(fertig.bytes), name: fertig.name })}</p>}
        {auftrag?.status === 'fehler' && <p className="fehlertext">{auftrag.fehler}</p>}
        <div className="knoepfe"><Knopf art="haupt" gesperrt={auftrag?.status === 'laeuft' || (pw && !pwOk)}
          onClick={() => void tu(async () => {
            setAuftrag(await betriebApi.vollexportStarten({ passwoerter: pw, passwoerterBestaetigt: pwOk, protokolle, kontakte: Object.fromEntries(Object.entries(kontakte).filter((e): e is [string, KontaktZuordnung] => !!e[1])) }));
            return t('werkbank.vollexport.export-laeuft-im-hintergrund');
          })}>{t('werkbank.vollexport.export-starten')}</Knopf></div>
      </div>
      <VollexportListe exporte={s.exporte} laden={z.laden} melde={(text, art) => setMeldung({ art, text })} />
      {/* #1196: die dauerhafte Einstellung steht unter Daten sichern → Einstellungen. */}
      <p className="leise klein">{tn('werkbank.vollexport.einstellung', { link: <Link to="/werkbank/daten#benutzer-duerfen" className="verweis">{t('werkbank.bereich.daten.name')}</Link> })}</p>
    </div>
  );
}
