import { useCallback, useEffect, useState } from 'react';
import { api, type SicherungsMeta, type WhAbgleich, type WhAbschluss, type WhLauf, type WhSchritt } from './api';
import { rueckfrage } from './rueckfrage';

/**
 * Wiederherstellen (#107): Assistent (Sicherung wählen, Abgleich, Schlüssel, Start) für das
 * frische System und die Werkbank, dazu der eigene Bildschirm mit Fortschritt und Abschlussmeldung.
 * Der Bildschirm übersteht ein Neuladen und den Neustart des DMS: Er fragt den Stand ab, bis die
 * Abschlussmeldung da ist.
 */

const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const groesse = (b: number) => (b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(0)} MB` : `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB`);
const ART: Record<string, string> = { manuell: 'von Hand', automatisch: 'automatisch', 'vor-wiederherstellung': 'vor einer Wiederherstellung' };
const ZEICHEN: Record<WhSchritt['status'], string> = { offen: '○', laeuft: '◐', ok: '✓', fehler: '✕', hinweis: '!', ausgelassen: '–' };

export function Schritte({ schritte }: { schritte: WhSchritt[] }) {
  return (
    <ol className="schrittliste">
      {schritte.map((s) => (
        <li key={s.name} className={`schritt ${s.status}`}>
          <span className="zeichen" aria-hidden="true">{ZEICHEN[s.status]}</span>
          <span><strong>{s.name}</strong>{s.info && <span className="leise klein"> – {s.info}</span>}<span className="sr"> ({s.status})</span></span>
        </li>
      ))}
    </ol>
  );
}

/** Eigener Bildschirm: Fortschritt jedes Schritts, Neustart, Abschlussmeldung → Anmeldung. */
export function Wiederherstellungsbildschirm({ fertig }: { fertig: () => void }) {
  const [lauf, setLauf] = useState<WhLauf | null>(null);
  const [abschluss, setAbschluss] = useState<WhAbschluss | null>(null);
  const [weg, setWeg] = useState(false);
  useEffect(() => {
    let aus = false;
    const hole = () => api.whStatus().then((s) => { if (aus) return; setWeg(false); setLauf(s.lauf); setAbschluss(s.abschluss); }, () => { if (!aus) setWeg(true); });
    void hole();
    const t = setInterval(hole, 1000);
    return () => { aus = true; clearInterval(t); };
  }, []);
  const prozent = lauf && lauf.gesamt ? Math.min(100, Math.round((lauf.bytes / lauf.gesamt) * 100)) : null;
  const erledigt = lauf ? lauf.schritte.filter((s) => s.status === 'ok' || s.status === 'hinweis').length : 0;
  return (
    <div className="kartenseite">
      <div className="karte breit" role="status" aria-live="polite">
        <h1>{abschluss && !lauf ? 'Wiederherstellung abgeschlossen' : lauf?.status === 'fehler' ? 'Wiederherstellung abgebrochen' : 'Wiederherstellung läuft'}</h1>
        {abschluss && !lauf ? (
          <>
            <p>Die Sicherung <strong>{abschluss.sicherung}</strong> ist eingespielt ({zeit(abschluss.am)}). Melde dich mit deinen bisherigen Zugangsdaten an – die aus der Zeit der Sicherung.</p>
            <Schritte schritte={abschluss.schritte} />
            {abschluss.hinweise.map((h) => <div key={h} className="hinweis warn"><p>{h}</p></div>)}
            <button className="knopf primaer" onClick={() => void api.whAbschlussGesehen().finally(fertig)}>Weiter zur Anmeldung</button>
          </>
        ) : lauf?.status === 'fehler' ? (
          <>
            <div className="hinweis schlecht"><p><strong>{lauf.fehler}</strong></p></div>
            <p>Der bisherige Stand ist unverändert. Details stehen im Protokoll (Modul sicherung).</p>
            <Schritte schritte={lauf.schritte} />
            <button className="knopf" onClick={fertig}>Zurück</button>
          </>
        ) : (
          <>
            <p>Sicherung <strong>{lauf?.sicherung ?? '…'}</strong>. Bitte lass dieses Fenster offen; das DMS startet am Ende einmal neu.</p>
            <progress max={lauf?.schritte.length ?? 1} value={erledigt} />
            {weg || lauf?.status === 'neustart'
              ? <p className="leise">Das DMS startet neu … gleich geht es weiter.</p>
              : prozent !== null && <p className="leise klein">Aktueller Schritt: {prozent} %</p>}
            {lauf && <Schritte schritte={lauf.schritte} />}
          </>
        )}
      </div>
    </div>
  );
}

/** Sicherung wählen, Abgleich, Schlüssel, Start – auf dem frischen System und in der Werkbank. */
export function WiederherstellungsAssistent({ frisch, gestartet, abbrechen }: { frisch: boolean; gestartet: () => void; abbrechen?: () => void }) {
  const [liste, setListe] = useState<Array<{ name: string; bytes: number; meta: SicherungsMeta | null }> | null>(null);
  const [ordner, setOrdner] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [abgleich, setAbgleich] = useState<WhAbgleich | null>(null);
  const [schluessel, setSchluessel] = useState('');
  const [verstanden, setVerstanden] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  const laden = useCallback(async () => {
    setFehler(undefined);
    try { const r = await api.whSicherungen(); setListe(r.liste); setOrdner(r.ordner); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  async function waehle(name: string, mitSchluessel?: string) {
    setGewaehlt(name); setFehler(undefined); setLaeuft(true);
    try { setAbgleich(await api.whAbgleich(name, mitSchluessel)); } catch (e) { setFehler((e as Error).message); setAbgleich(null); } finally { setLaeuft(false); }
  }
  async function starten() {
    if (!abgleich) return;
    if (!frisch && !(await rueckfrage({ titel: 'Wirklich wiederherstellen?', text: 'Der jetzige Stand des DMS wird durch die Sicherung ersetzt. Vorher wird er selbst gesichert.', ja: 'Wiederherstellen', gefahr: true, bestaetigeMit: 'wiederherstellen' }))) return;
    setLaeuft(true); setFehler(undefined);
    try { await api.whStart({ name: abgleich.name, ...(schluessel.trim() ? { schluessel } : {}), bestaetigt: !frisch && verstanden }); gestartet(); }
    catch (e) { setFehler((e as Error).message); setLaeuft(false); }
  }
  const brauchtSchluessel = abgleich?.schluesselNoetig ?? false;
  const startbar = !!abgleich && !abgleich.probleme.length && !brauchtSchluessel && (frisch || verstanden) && !laeuft;

  return (
    <div className="stapel wiederherstellen">
      <div className="zeile-zwischen">
        <p className="leise klein">Gesucht im Sicherungsordner <span className="mono">{ordner || '…'}</span>. Lege dort beide Dateien ab (<span className="mono">.dms-sicherung</span> und <span className="mono">.json</span>).</p>
        <button type="button" className="knopf klein" onClick={() => { setAbgleich(null); setGewaehlt(null); void laden(); }}>Sicherungsordner neu prüfen</button>
      </div>
      {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
      {liste === null ? <p className="leise">Lade …</p> : !liste.length ? <p className="leise">Keine Sicherung im Ordner gefunden.</p> : (
        <ul className="auswahlliste">
          {liste.map((x) => (
            <li key={x.name}>
              <label className="haken">
                <input type="radio" name="sicherung" checked={gewaehlt === x.name} onChange={() => { setSchluessel(''); void waehle(x.name); }} />
                <span><strong>{x.meta ? zeit(x.meta.beginn) : x.name}</strong>{x.meta && <span className="leise klein"> · {ART[x.meta.art] ?? x.meta.art} · DMS {x.meta.umgebung.dms} · {x.meta.anzahl.mappen.toLocaleString('de-DE')} Mappen · {groesse(x.bytes)}</span>}{!x.meta && <span className="fehlertext klein"> – Metadaten (.json) fehlen</span>}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {abgleich && (
        <>
          <h3 className="h3">Abgleich: damals ↔ heute</h3>
          <div className="trefferliste"><table>
            <thead><tr><th /><th>In der Sicherung</th><th>Dieses DMS</th><th /></tr></thead>
            <tbody>{abgleich.vergleich.map((v) => (
              <tr key={v.was}><th>{v.was}</th><td className="mono">{v.damals}</td><td className="mono">{v.heute}</td>
                <td><span className={`chip ${v.urteil === 'fehler' ? 'schlecht' : v.urteil === 'hinweis' ? 'warn' : 'gut'}`}>{v.urteil === 'gleich' ? 'gleich' : v.urteil === 'ok' ? 'passt' : v.urteil === 'hinweis' ? 'Hinweis' : 'geht nicht'}</span>{v.info && <span className="leise klein"> {v.info}</span>}</td></tr>
            ))}</tbody>
          </table></div>
          {abgleich.probleme.map((p) => <div key={p} className="hinweis schlecht"><p>{p}</p></div>)}
          {abgleich.hinweise.filter((h) => !/Notfallblatt ein/.test(h) || brauchtSchluessel).map((h) => <div key={h} className="hinweis warn"><p>{h}</p></div>)}
          {(brauchtSchluessel || schluessel) && (
            <form className="stapel" onSubmit={(e) => { e.preventDefault(); void waehle(abgleich.name, schluessel); }}>
              <label className="eigenschaft"><span>Schlüssel vom Notfallblatt <small>Fingerabdruck {abgleich.meta.verschluesselung.fingerabdruck}; Leerzeichen zählen nicht</small></span>
                <textarea className="mono" rows={2} value={schluessel} spellCheck={false} autoComplete="off" onChange={(e) => setSchluessel(e.target.value)} /></label>
              <div className="knoepfe"><button className="knopf" disabled={laeuft || !schluessel.trim()}>Schlüssel prüfen</button></div>
            </form>
          )}
          {!frisch && (
            <label className="haken"><input type="checkbox" checked={verstanden} onChange={(e) => setVerstanden(e.target.checked)} />
              <span>Mir ist klar: Der jetzige Stand wird durch die Sicherung ersetzt. Vorher sichert das DMS ihn selbst; Änderungen seit der Sicherung sind danach nur noch in dieser Sicherung.</span></label>
          )}
          <div className="knoepfe">
            <button className="knopf primaer" disabled={!startbar} onClick={() => void starten()}>{laeuft ? 'Starte …' : 'Wiederherstellen'}</button>
            {abbrechen && <button type="button" className="textknopf" onClick={abbrechen}>Abbrechen</button>}
          </div>
        </>
      )}
      {!abgleich && abbrechen && <button type="button" className="textknopf" onClick={abbrechen}>← Zurück</button>}
    </div>
  );
}
