import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiFehler, type AnbindungEingabe, type AnbindungPruefung, type AnbindungStand } from '../api';
import { AnbindungFormular, PruefungAnzeige } from '../einrichtung';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';

/**
 * Werkbank → Datenbank-Anbindung (#119): ansehen und ändern – erst testen, dann übernehmen.
 * Die Anbindung steht in /data/geheim/datenbank.json und gilt nach einem Neustart.
 * Darunter (#407, `unten`): lange Datenbankzugriffe und was gerade läuft.
 */
export function useAnbindung(offen: boolean) {
  const [stand, setStand] = useState<AnbindungStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await api.anbindung()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  return { stand, fehler, laden, setStand };
}
export type AnbindungZustand = ReturnType<typeof useAnbindung>;

export function AnbindungPanel({ z, nachAenderung, unten }: { z: AnbindungZustand; nachAenderung?: () => void; unten?: ReactNode }) {
  const s = z.stand;
  const [a, setA] = useState<AnbindungEingabe | null>(null);
  const [p, setP] = useState<AnbindungPruefung | null>(null);
  const [leer, setLeer] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [felder, setFelder] = useState<Record<string, string>>();
  const [laeuft, setLaeuft] = useState(false);
  const [neustart, setNeustart] = useState(false);
  useEffect(() => { if (s && !a) setA({ host: s.anbindung.host, port: s.anbindung.port, datenbank: s.anbindung.datenbank, benutzer: s.anbindung.benutzer, passwort: '' }); }, [s, a]);
  if (!s || !a) return <div className="einspaltig"><p className="leise">{z.fehler ?? 'Lade …'}</p>{unten}</div>;

  async function tu(f: () => Promise<void>) {
    setLaeuft(true); setMeldung(undefined); setFelder(undefined);
    try { await f(); }
    catch (e) {
      if (e instanceof ApiFehler) {
        const d = e.details as { felder?: Record<string, string>; pruefung?: AnbindungPruefung; leer?: boolean } | undefined;
        setFelder(d?.felder); if (d?.pruefung) setP(d.pruefung); if (d?.leer) setLeer(true);
      }
      setMeldung({ art: 'schlecht', text: (e as Error).message });
    } finally { setLaeuft(false); }
  }
  async function neuStarten() {
    setNeustart(true);
    await api.neustart().catch(() => {});
    // Im Container startet Docker das DMS wieder; dann die Seite neu laden.
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try { await api.status(); location.reload(); return; } catch { /* startet noch */ }
    }
  }

  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Datenbank-Anbindung</h1>
        <p className="leise">Die Anbindung steht in der Datei <span className="mono">{s.datei}</span> und ist führend – auch wenn in der Compose-Datei <span className="mono">DATABASE_URL</span> gesetzt ist. Das Passwort zeigt das DMS nie an. Darunter siehst du lange Datenbankzugriffe und was gerade in der Datenbank läuft. <Hilfe ort="werkbank.anbindung" /></p>
      </div>
      {s.umgebung === 'abweichend' && <div className="hinweis warn"><p><strong>DATABASE_URL weicht von dieser Anbindung ab und wird ignoriert.</strong> Entferne die Variable aus der Compose-Datei, damit es nicht zu Verwechslungen kommt.</p></div>}
      {s.imContainer && <div className="hinweis info"><p><strong>Die Datenbank läuft in diesem Container (dms-komplett).</strong> Hier ist nichts einzustellen. Zum Umzug auf eine eigene Datenbank: Sicherung hier anlegen und dort wiederherstellen – siehe „Wachsen und umziehen“ im Administratorhandbuch.</p></div>}
      {s.umgebung === 'gleich' && !s.imContainer && <div className="hinweis info"><p><strong>DATABASE_URL ist nicht mehr nötig.</strong> Die Anbindung steht in der Datei; du kannst die Variable beim nächsten Update aus der Compose-Datei entfernen.</p></div>}
      {s.neustartNoetig && (
        <div className="hinweis warn hinweiszeile">
          <p><strong>Die Anbindung ist geändert und gilt nach dem Neustart.</strong> Im Container startet Docker das DMS gleich wieder (restart: unless-stopped).</p>
          <button type="button" className="knopf primaer klein" disabled={neustart} onClick={() => void neuStarten()}>{neustart ? 'Startet neu …' : 'Jetzt neu starten'}</button>
        </div>
      )}
      <form id="anbindung" className="blatt" onSubmit={(ev) => { ev.preventDefault(); void tu(async () => setP(await api.anbindungPruefen(a))); }}>
        <h2 className="h3">Verbindung</h2>
        <p className="klein">Aktuell verbunden: <span className="mono">{s.anbindung.benutzer}@{s.anbindung.host}:{s.anbindung.port}/{s.anbindung.datenbank}</span>{' '}
          {s.neustartNoetig ? <span className="chip warn">geändert – gilt nach dem Neustart</span> : <span className="chip gut">in Betrieb</span>}</p>
        <AnbindungFormular wert={a} setWert={(x) => { setA(x); setP(null); setLeer(false); }} passwortGesetzt={s.anbindung.passwortGesetzt} felder={felder} />
        {p && <PruefungAnzeige p={p} />}
        {leer && <div className="hinweis warn"><p><strong>Diese Datenbank ist leer.</strong> Nach dem Neustart beginnt dort die Einrichtung von vorn (mit Einrichtungscode); die bisherigen Daten bleiben in der alten Datenbank.</p></div>}
        {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
        <div className="knoepfe">
          <button className="knopf" disabled={laeuft}>{laeuft ? 'Prüfe …' : 'Verbindung prüfen'}</button>
          <button type="button" className="knopf primaer" disabled={laeuft || !p?.ok}
            onClick={() => void tu(async () => {
              const neu = await api.anbindungSpeichern(a, leer);
              z.setStand(neu); setMeldung({ art: 'gut', text: 'Gespeichert. Die neue Anbindung gilt nach dem Neustart.' }); nachAenderung?.();
            })}>{leer ? 'Trotzdem übernehmen' : 'Übernehmen'}</button>
        </div>
        <p className="leise klein">Übernehmen geht erst nach erfolgreicher Prüfung. Die Daten wandern dabei nicht mit – für einen Umzug in eine andere Datenbank nimm eine <Link to="/werkbank/sicherung" className="verweis">Sicherung</Link> und spiele sie dort ein.</p>
      </form>
      {unten}
    </div>
  );
}
