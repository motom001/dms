import { useCallback, useEffect, useState } from 'react';
import { api, type Auftrag, type KontaktZuordnung, type VollexportStand } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { rueckfrage } from '../rueckfrage';
import { fortschrittText } from '../../../shared/src/auftrag';

/**
 * Werkbank → Vollexport (#254): alle Daten in offenen Formaten, lesbar ohne das DMS.
 * Läuft im Hintergrund und schreibt in den Ordner export/ neben den Sicherungen.
 */

const mb = (b: number) => (b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(b < 10 * 1024 ** 2 ? 1 : 0).replace('.', ',')} MB` : `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB`);
const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const ANGABEN: Array<[keyof KontaktZuordnung, string]> = [['name', 'Name'], ['firma', 'Firma'], ['email', 'E-Mail'], ['telefon', 'Telefon'], ['adresse', 'Adresse'], ['notiz', 'Notiz']];

export function useVollexport(offen: boolean) {
  const [stand, setStand] = useState<VollexportStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await api.vollexport()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  return { stand, fehler, laden };
}
export type VollexportZustand = ReturnType<typeof useVollexport>;

export function VollexportListe({ z }: { z: VollexportZustand }) {
  const s = z.stand;
  return (
    <>
      <div className="listenkopf"><div><h1>Vollexport</h1><p className="leise klein">Alle Daten in offenen Formaten. <Hilfe ort="werkbank.vollexport" /></p></div></div>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {!s ? <p className="leise">Lade …</p> : !s.exporte.length ? <p className="leise leerliste">Noch kein Export.</p> : (
        <ul className="mappenliste">
          {s.exporte.map((e) => <li key={e.name}><span className="eintrag werk"><span className="titel">{e.erstellt ? zeit(e.erstellt) : e.name}</span><span className="unter">{mb(e.bytes)} · {e.dateien} Dateien{e.passwoerter ? ' · mit Passwörtern' : ''}</span></span></li>)}
        </ul>
      )}
    </>
  );
}

export function VollexportPanel({ z }: { z: VollexportZustand }) {
  const d = useDaten();
  const s = z.stand;
  const [pw, setPw] = useState(false);
  const [pwOk, setPwOk] = useState(false);
  const [protokolle, setProtokolle] = useState(false);
  const [kontakte, setKontakte] = useState<Record<string, KontaktZuordnung | null>>({});
  const [auftrag, setAuftrag] = useState<Auftrag | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht' | 'info'; text: string }>();
  useEffect(() => { if (s && !Object.keys(kontakte).length) setKontakte(Object.fromEntries(s.kontakte.map((k) => [k.typId, k.zuordnung]))); }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (auftrag?.status !== 'laeuft') return;
    const t = setInterval(() => void api.auftrag().then((a) => { setAuftrag(a); if (a?.status !== 'laeuft') void z.laden(); }), 1500);
    return () => clearInterval(t);
  }, [auftrag?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  async function tu(f: () => Promise<string>) {
    setMeldung(undefined);
    try { setMeldung({ art: 'gut', text: await f() }); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }
  if (!s) return <p className="leise">Lade …</p>;
  const noetig = s.abschaetzung.bytes * 1.1 + 50 * 1024 ** 2;
  const fertig = auftrag?.status === 'fertig' && auftrag.art === 'vollexport' ? auftrag.ergebnis as { name: string; dateien: number; bytes: number } : null;
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Vollexport</h1>
        <p className="leise">Deine Daten gehören dir: Der Vollexport schreibt <strong>alles</strong> – Mappen, Dokumente im Original mit allen Versionen, Notizen, Aufgaben, Historie, Struktur – in offenen Formaten (CSV, JSON, Excel, PDF, iCalendar, vCard) in einen Ordner, den du ohne das DMS lesen kannst. Anders als die Sicherung ist er <strong>unverschlüsselt</strong> – bewahre ihn sicher auf.</p>
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      <div className="blatt">
        <h2 className="h3">Neuer Export</h2>
        <p>{s.abschaetzung.mappen.toLocaleString('de-DE')} Mappen, {s.abschaetzung.dokumente.toLocaleString('de-DE')} Dateien ({mb(s.abschaetzung.bytes)}) – nötig etwa {mb(noetig)}{s.frei !== null && <>, frei {mb(s.frei)}</>}.</p>
        <p className="leise klein">Ziel: <code className="mono">{s.ordner}</code></p>
        {s.frei !== null && s.frei < noetig && <p className="hinweis schlecht">Zu wenig Platz am Ziel.</p>}
        <label className="haken"><input type="checkbox" checked={protokolle} onChange={(e) => setProtokolle(e.target.checked)} /><span>Technische Protokolle mitnehmen<small className="hilfe">das Protokoll seit dem letzten Start</small></span></label>
        <label className="haken"><input type="checkbox" checked={pw} onChange={(e) => { setPw(e.target.checked); if (!e.target.checked) setPwOk(false); }} /><span>Passwortfelder im Klartext als passwoerter.csv<small className="hilfe">im Format von Bitwarden, zum Import in einen Passwortmanager</small></span></label>
        {pw && <label className="haken einzug"><input type="checkbox" checked={pwOk} onChange={(e) => setPwOk(e.target.checked)} /><span className="fehlertext">Mir ist klar: Die Passwörter stehen unverschlüsselt in der Datei. Das steht im Protokoll.</span></label>}
        {s.kontakte.length > 0 && <>
          <h3 className="h4">Kontakte als vCard <Hilfe ort="werkbank.vollexport.kontakte" /></h3>
          <p className="leise klein">Diese Mappentypen sehen nach Kontakten aus. Prüfe die Zuordnung der Felder; abgewählte Mappentypen bekommen keine vCard.</p>
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
        {fertig && <p className="gutertext" role="status">Fertig: {fertig.dateien} Dateien, {mb(fertig.bytes)} in {fertig.name}.</p>}
        {auftrag?.status === 'fehler' && <p className="fehlertext">{auftrag.fehler}</p>}
        <div className="knoepfe"><button type="button" className="knopf primaer" disabled={auftrag?.status === 'laeuft' || (pw && !pwOk)}
          onClick={() => void tu(async () => {
            setAuftrag(await api.vollexportStarten({ passwoerter: pw, passwoerterBestaetigt: pwOk, protokolle, kontakte: Object.fromEntries(Object.entries(kontakte).filter((e): e is [string, KontaktZuordnung] => !!e[1])) }));
            return 'Export läuft im Hintergrund.';
          })}>Export starten</button></div>
      </div>
      <div className="blatt">
        <h2 className="h3">Meine Daten exportieren</h2>
        <label className="haken"><input type="checkbox" checked={s.persoenlich} onChange={(e) => void tu(async () => { await api.persoenlicherExport(e.target.checked); await z.laden(); return e.target.checked ? 'Benutzer dürfen ihre Daten exportieren.' : 'Meine Daten exportieren abgeschaltet.'; })} />
          <span>Benutzer dürfen ihre eigenen Daten exportieren<small className="hilfe">Profil → Konto → Meine Daten exportieren: Mappen, die sie lesen dürfen, ihre Aufgaben und Erinnerungen – im selben Format (Recht auf Datenübertragbarkeit, DSGVO Art. 20).</small></span></label>
      </div>
      {s.exporte.length > 0 && (
        <div className="blatt">
          <h2 className="h3">Vorhandene Exporte</h2>
          <ul className="stapel">
            {s.exporte.map((e) => (
              <li key={e.name}>
                <strong>{e.erstellt ? zeit(e.erstellt) : e.name}</strong> <span className="leise klein">{mb(e.bytes)} · {e.dateien} Dateien{e.mappen !== null ? ` · ${e.mappen} Mappen` : ''}{e.passwoerter ? ' · mit Passwörtern im Klartext' : ''}</span>
                <span className="knoepfe">
                  <a className="knopf klein" href={`/api/werkbank/export/${encodeURIComponent(e.name)}/zip`}>Als ZIP herunterladen</a>
                  <button type="button" className="knopf klein" onClick={() => void tu(async () => { const r = await api.vollexportPruefen(e.name); return r.ok ? `Alle ${r.dateien} Dateien vollständig und unverändert.` : `Abweichungen: ${[...r.fehlend.map((x) => `fehlt ${x}`), ...r.abweichend.map((x) => `verändert ${x}`)].slice(0, 5).join(', ')}${r.fehlend.length + r.abweichend.length > 5 ? ' …' : ''}`; })}>Prüfen</button>
                  <button type="button" className="knopf klein gefahr-rand" onClick={async () => { if (await rueckfrage({ titel: 'Diesen Export löschen?', text: e.name, ja: 'Löschen', gefahr: true })) void tu(async () => { await api.vollexportLoeschen(e.name); await z.laden(); return 'Export gelöscht.'; }); }}>Löschen</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
