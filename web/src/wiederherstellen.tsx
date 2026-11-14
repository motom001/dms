import { useCallback, useEffect, useState } from 'react';
import type { WhLauf } from './api/betrieb';
import { einrichtungApi, type SicherungSchlank, type SicherungsMeta, type WhAbgleich, type WhAbschluss, type WhSchritt } from './api/einrichtung';
import { t, tn } from './sprache';
import { FeldGruppe, Feld, HakenFeld, Knopf } from './bausteine';
import { Symbol, type SymbolName } from './Symbol';
import { gebietsschema } from '../../shared/src/sprache';

/**
 * Wiederherstellen (#107): Assistent (Sicherung wählen, Abgleich, Schlüssel, Start) für das
 * frische System und die Werkbank, dazu der eigene Bildschirm mit Fortschritt und Abschlussmeldung.
 * Der Bildschirm übersteht ein Neuladen und den Neustart des DMS: Er fragt den Stand ab, bis die
 * Abschlussmeldung da ist.
 */

const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });
const groesse = (b: number) => (b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(0)} MB` : `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB`);
const ART: Record<string, string> = { manuell: t('oberflaeche.wiederherstellen.von-hand'), automatisch: t('oberflaeche.wiederherstellen.art.automatisch'), 'vor-wiederherstellung': t('oberflaeche.wiederherstellen.vor-einer-wiederherstellung') };
// Zeichen je Stand (#1215, D5): Symbole, wo es eines gibt; „offen“ und „ausgelassen“ bleiben ruhige Zeichen.
const ZEICHEN: Record<WhSchritt['status'], SymbolName | string> = { offen: '○', laeuft: 'stoppuhr', ok: 'haken', fehler: 'warnung', hinweis: 'info', ausgelassen: '–' };
const SYMBOLE = new Set<string>(['stoppuhr', 'haken', 'warnung', 'info']);

export function Schritte({ schritte }: { schritte: WhSchritt[] }) {
  return (
    <ol className="schrittliste">
      {schritte.map((s) => (
        <li key={s.name} className={`schritt ${s.status}`}>
          <span className="zeichen" aria-hidden="true">{SYMBOLE.has(ZEICHEN[s.status]) ? <Symbol name={ZEICHEN[s.status] as SymbolName} /> : ZEICHEN[s.status]}</span>
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
    // Fehler fängt hole selbst ab (weg); der Takt bekommt kein Promise zurück (#1011).
    const hole = () => { void einrichtungApi.whStatus().then((s) => { if (aus) return; setWeg(false); setLauf(s.lauf); setAbschluss(s.abschluss); }, () => { if (!aus) setWeg(true); }); };
    hole();
    const timer = setInterval(hole, 1000);
    return () => { aus = true; clearInterval(timer); };
  }, []);
  const prozent = lauf && lauf.gesamt ? Math.min(100, Math.round((lauf.bytes / lauf.gesamt) * 100)) : null;
  const erledigt = lauf ? lauf.schritte.filter((s) => s.status === 'ok' || s.status === 'hinweis').length : 0;
  return (
    <div className="kartenseite">
      <div className="karte breit" role="status" aria-live="polite">
        <h1>{abschluss && !lauf ? t('oberflaeche.wiederherstellen.wiederherstellung-abgeschlossen') : lauf?.status === 'fehler' ? t('oberflaeche.wiederherstellen.wiederherstellung-abgebrochen') : t('oberflaeche.wiederherstellen.wiederherstellung-laeuft')}</h1>
        {abschluss && !lauf ? (
          <>
            <p>{tn('oberflaeche.wiederherstellen.die-sicherung-ist-eingespielt', { b: <strong>{abschluss.sicherung}</strong>, zeit: zeit(abschluss.am) })}</p>
            <Schritte schritte={abschluss.schritte} />
            {abschluss.hinweise.map((h) => <div key={h} className="hinweis warn"><p>{h}</p></div>)}
            <div className="knoepfe"><Knopf art="haupt" onClick={() => einrichtungApi.whAbschlussGesehen().finally(fertig)}>{t('oberflaeche.wiederherstellen.weiter-zur-anmeldung')}</Knopf></div>
          </>
        ) : lauf?.status === 'fehler' ? (
          <>
            <div className="hinweis schlecht"><p><strong>{lauf.fehler}</strong></p></div>
            <p>{t('oberflaeche.wiederherstellen.der-bisherige-stand-ist')}</p>
            <Schritte schritte={lauf.schritte} />
            <div className="knoepfe"><Knopf onClick={fertig}>{t('oberflaeche.wiederherstellen.zurueck')}</Knopf></div>
          </>
        ) : (
          <>
            <p>{tn('oberflaeche.wiederherstellen.sicherung-bitte-lass-dieses', { b: <strong>{lauf?.sicherung ?? '…'}</strong> })}</p>
            <progress max={lauf?.schritte.length ?? 1} value={erledigt} />
            {weg || lauf?.status === 'neustart'
              ? <p className="leise">{t('oberflaeche.wiederherstellen.ablago-startet-neu-gleich')}</p>
              : prozent !== null && <p className="leise klein">{t('oberflaeche.wiederherstellen.aktueller-schritt', { prozent })}</p>}
            {lauf && <Schritte schritte={lauf.schritte} />}
          </>
        )}
      </div>
    </div>
  );
}

/** Sicherung wählen, Abgleich, Schlüssel, Start – auf dem frischen System und in der Werkbank. */
export function WiederherstellungsAssistent({ frisch, gestartet, abbrechen }: { frisch: boolean; gestartet: () => void; abbrechen?: () => void }) {
  const [liste, setListe] = useState<Array<{ name: string; bytes: number; meta: SicherungsMeta | null; schlank?: SicherungSchlank }> | null>(null);
  const [ordner, setOrdner] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [abgleich, setAbgleich] = useState<WhAbgleich | null>(null);
  const [schluessel, setSchluessel] = useState('');
  const [verstanden, setVerstanden] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  const laden = useCallback(async () => {
    setFehler(undefined);
    try { const r = await einrichtungApi.whSicherungen(); setListe(r.liste); setOrdner(r.ordner); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  async function waehle(name: string, mitSchluessel?: string) {
    setGewaehlt(name); setFehler(undefined); setLaeuft(true);
    try { setAbgleich(await einrichtungApi.whAbgleich(name, mitSchluessel)); } catch (e) { setFehler((e as Error).message); setAbgleich(null); } finally { setLaeuft(false); }
  }
  async function starten() {
    if (!abgleich) return;
    setLaeuft(true); setFehler(undefined);
    try { await einrichtungApi.whStart({ name: abgleich.name, ...(schluessel.trim() ? { schluessel } : {}), bestaetigt: !frisch && verstanden }); gestartet(); }
    catch (e) { setFehler((e as Error).message); setLaeuft(false); }
  }
  const brauchtSchluessel = abgleich?.schluesselNoetig ?? false;
  const startbar = !!abgleich && !abgleich.probleme.length && !brauchtSchluessel && (frisch || verstanden);

  return (
    <div className="stapel wiederherstellen">
      <div className="zeile-zwischen">
        <p className="leise klein">{tn('oberflaeche.wiederherstellen.gesucht-im-sicherungsordner-lege', { span: <span className="mono">{ordner || '…'}</span>, span2: <span className="mono">.dms-sicherung</span>, span3: <span className="mono">.json</span> })}</p>
        <Knopf symbol="neu-laden" onClick={() => { setAbgleich(null); setGewaehlt(null); return laden(); }}>{t('oberflaeche.wiederherstellen.sicherungsordner-neu-pruefen')}</Knopf>
      </div>
      {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
      {liste === null ? <p className="leise">{t('oberflaeche.wiederherstellen.lade')}</p> : !liste.length ? <p className="leise">{t('oberflaeche.wiederherstellen.keine-sicherung-im-ordner')}</p> : (
        <FeldGruppe beschriftung={t('oberflaeche.wiederherstellen.sicherung-waehlen')} beschriftungVerbergen><ul className="auswahlliste">
          {liste.map((x) => (
            <li key={x.name}>
              <label className="haken">
                <input type="radio" name="sicherung" checked={gewaehlt === x.name} onChange={() => { setSchluessel(''); void waehle(x.name); }} />
                <span><strong>{x.meta ? zeit(x.meta.beginn) : x.name}</strong>{x.meta && <span className="leise klein"> {' '}{t('oberflaeche.wiederherstellen.ablago-mappen', { wert: ART[x.meta.art] ?? x.meta.art, dms: x.meta.umgebung.dms, mappen: x.meta.anzahl.mappen.toLocaleString(gebietsschema()), groesse: groesse(x.bytes) })}</span>}{!x.meta && x.schlank && <span className="leise klein"> · {t('werkbank.sicherung.extern.schlank', { datum: zeit(x.schlank.beginn) })} · {groesse(x.bytes)}</span>}{!x.meta && !x.schlank && <span className="fehlertext klein"> {' '}{t('oberflaeche.wiederherstellen.metadaten-json-fehlen')}</span>}</span>
              </label>
            </li>
          ))}
        </ul></FeldGruppe>
      )}

      {abgleich && (
        <>
          <h3 className="h3">{t('oberflaeche.wiederherstellen.abgleich-damals-heute')}</h3>
          {abgleich.vergleich.length > 0 && <div className="trefferliste"><table>
            <thead><tr><th /><th>{t('oberflaeche.wiederherstellen.in-der-sicherung')}</th><th>{t('oberflaeche.wiederherstellen.diese-installation')}</th><th /></tr></thead>
            <tbody>{abgleich.vergleich.map((v) => (
              <tr key={v.was}><th>{v.was}</th><td className="mono">{v.damals}</td><td className="mono">{v.heute}</td>
                <td><span className={`chip ${v.urteil === 'fehler' ? 'schlecht' : v.urteil === 'hinweis' ? 'warn' : 'gut'}`}>{v.urteil === 'gleich' ? t('oberflaeche.wiederherstellen.gleich') : v.urteil === 'ok' ? t('oberflaeche.wiederherstellen.passt') : v.urteil === 'hinweis' ? t('oberflaeche.wiederherstellen.hinweis') : t('oberflaeche.wiederherstellen.geht-nicht')}</span>{v.info && <span className="leise klein"> {v.info}</span>}</td></tr>
            ))}</tbody>
          </table></div>}
          {abgleich.probleme.map((p) => <div key={p} className="hinweis schlecht"><p>{p}</p></div>)}
          {abgleich.hinweise.filter((h) => !/Notfallblatt ein/.test(h) || brauchtSchluessel).map((h) => <div key={h} className="hinweis warn"><p>{h}</p></div>)}
          {(brauchtSchluessel || schluessel) && (
            <form className="stapel" onSubmit={(e) => { e.preventDefault(); void waehle(abgleich.name, schluessel); }}>
              <Feld beschriftung={t('oberflaeche.wiederherstellen.schluessel-vom-notfallblatt')} hinweis={t('oberflaeche.wiederherstellen.fingerabdruck-leerzeichen-zaehlen', { fingerabdruck: abgleich.meta.verschluesselung.fingerabdruck })}>
                <textarea className="mono" rows={2} value={schluessel} spellCheck={false} autoComplete="off" onChange={(e) => setSchluessel(e.target.value)} /></Feld>
              <div className="knoepfe"><Knopf type="submit" laeuft={laeuft} gesperrt={!schluessel.trim()}>{t('oberflaeche.wiederherstellen.schluessel-pruefen')}</Knopf></div>
            </form>
          )}
          {!frisch && (
            <HakenFeld beschriftung={t('oberflaeche.wiederherstellen.mir-ist-klar-der')}><input type="checkbox" checked={verstanden} onChange={(e) => setVerstanden(e.target.checked)} /></HakenFeld>
          )}
          <div className="knoepfe">
            {/* Auf dem frischen System die Hauptaktion; in der Werkbank ersetzt sie den jetzigen Stand – Gefahr mit Rückfrage. */}
            {frisch
              ? <Knopf art="haupt" gesperrt={!startbar} laeuft={laeuft} laeuftText={t('oberflaeche.wiederherstellen.starte')} onClick={starten}>{t('oberflaeche.wiederherstellen.wiederherstellen')}</Knopf>
              : <Knopf art="gefahr" symbol="zuruecksetzen" gesperrt={!startbar} laeuft={laeuft} laeuftText={t('oberflaeche.wiederherstellen.starte')} onClick={starten}
                rueckfrage={{ titel: t('oberflaeche.wiederherstellen.wirklich-wiederherstellen'), text: t('oberflaeche.wiederherstellen.der-jetzige-stand-von'), ja: t('oberflaeche.wiederherstellen.wiederherstellen'), bestaetigeMit: 'wiederherstellen' }}>{t('oberflaeche.wiederherstellen.wiederherstellen')}</Knopf>}
            {abbrechen && <Knopf art="link" onClick={abbrechen}>{t('oberflaeche.wiederherstellen.abbrechen')}</Knopf>}
          </div>
        </>
      )}
      {!abgleich && abbrechen && <div className="knoepfe"><Knopf art="link" onClick={abbrechen}>{t('oberflaeche.wiederherstellen.zurueck-2')}</Knopf></div>}
    </div>
  );
}
