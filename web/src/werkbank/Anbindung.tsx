import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ErgebnisBlock, Knopf } from '../bausteine';
import { api, ApiFehler, type AnbindungEingabe, type AnbindungPruefung, type AnbindungStand } from '../api';
import { AnbindungFormular, PruefungAnzeige } from '../einrichtung';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { t, tn } from '../sprache';
import { sprachordner } from '../../../shared/src/hilfe';

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
  if (!s || !a) return <div className="einspaltig"><p className="leise">{z.fehler ?? t('werkbank.anbindung.lade')}</p>{unten}</div>;

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
        <p className="ueber">{t('werkbank.anbindung.werkbank')}</p>
        <h1>{t('werkbank.anbindung.datenbank-anbindung')}</h1>
        <p className="leise">{tn('werkbank.anbindung.die-anbindung-steht-in', { span: <span className="mono">{s.datei}</span>, span2: <span className="mono">{t('werkbank.anbindung.database-url')}</span>, hilfe: <Hilfe ort="werkbank.anbindung" /> })}</p>
      </div>
      {s.umgebung === 'abweichend' && <div className="hinweis warn"><p>{tn('werkbank.anbindung.entferne-die-variable-aus', { b: <strong>{t('werkbank.anbindung.database-url-weicht-von')}</strong> })}</p></div>}
      {/* dms-komplett ohne Volume für /data/postgres (#943): Anleitung im Installationshandbuch (offline unter /hilfe/installieren/). */}
      {s.ohneVolume && <div className="hinweis schlecht"><p>{tn('werkbank.anbindung.ohne-volume.text', { b: <strong>{t('werkbank.uebersicht.datenbank-ohne-volume')}</strong>, link: <a href={`/hilfe/installieren/${sprachordner()}komplett/#datenbank-retten`} target="_blank" rel="noreferrer" className="verweis">{t('werkbank.anbindung.ohne-volume.link')}</a> })}</p></div>}
      {s.imContainer && <div className="hinweis info"><p>{tn('werkbank.anbindung.hier-ist-nichts-einzustellen', { b: <strong>{t('werkbank.anbindung.die-datenbank-laeuft-in')}</strong> })}</p></div>}
      {s.umgebung === 'gleich' && <div className="hinweis info"><p>{tn('werkbank.anbindung.die-anbindung-steht-in-2', { b: <strong>{t('werkbank.anbindung.database-url-ist-nicht')}</strong> })}</p></div>}
      {s.neustartNoetig && (
        <div className="hinweis warn hinweiszeile">
          <p>{tn('werkbank.anbindung.im-container-startet-docker', { b: <strong>{t('werkbank.anbindung.die-anbindung-ist-geaendert')}</strong> })}</p>
          <button type="button" className="knopf primaer klein" disabled={neustart} onClick={() => void neuStarten()}>{neustart ? t('werkbank.anbindung.startet-neu') : t('werkbank.anbindung.jetzt-neu-starten')}</button>
        </div>
      )}
      <form id="anbindung" className="blatt" onSubmit={(ev) => { ev.preventDefault(); void tu(async () => setP(await api.anbindungPruefen(a))); }}>
        <h2 className="h3">{t('werkbank.anbindung.verbindung')}</h2>
        <p className="klein">{tn('werkbank.anbindung.aktuell-verbunden', { span: <span className="mono">{s.anbindung.benutzer}@{s.anbindung.host}:{s.anbindung.port}/{s.anbindung.datenbank}</span>, wert: s.neustartNoetig ? <span className="chip warn">{t('werkbank.anbindung.geaendert-gilt-nach-dem')}</span> : <span className="chip gut">{t('werkbank.anbindung.in-betrieb')}</span> })}</p>
        <AnbindungFormular wert={a} setWert={(x) => { setA(x); setP(null); setLeer(false); }} passwortGesetzt={s.anbindung.passwortGesetzt} felder={felder} />
        <div className="knoepfe">
          <Knopf type="submit" laeuft={laeuft} laeuftText={t('werkbank.anbindung.pruefe')}>{t('werkbank.anbindung.verbindung-pruefen')}</Knopf>
          <button type="button" className="knopf primaer" disabled={laeuft || !p?.ok}
            onClick={() => void tu(async () => {
              const neu = await api.anbindungSpeichern(a, leer);
              z.setStand(neu); setMeldung({ art: 'gut', text: t('werkbank.anbindung.gespeichert-die-neue-anbindung') }); nachAenderung?.();
            })}>{leer ? t('werkbank.anbindung.trotzdem-uebernehmen') : t('werkbank.anbindung.uebernehmen')}</button>
        </div>
        {/* Ergebnis von „Verbindung prüfen“ und „Übernehmen“ unter den Knöpfen (#986): darüber verschiebt sich nichts. */}
        <ErgebnisBlock anlass={p ?? meldung}>
          {p && <PruefungAnzeige p={p} />}
          {leer && <div className="hinweis warn"><p>{tn('werkbank.anbindung.nach-dem-neustart-beginnt', { b: <strong>{t('werkbank.anbindung.diese-datenbank-ist-leer')}</strong> })}</p></div>}
          {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'}>{meldung.text}</p>}
        </ErgebnisBlock>
        <p className="leise klein">{tn('werkbank.anbindung.uebernehmen-geht-erst-nach', { link: <Link to="/werkbank/sicherung" className="verweis">{t('werkbank.anbindung.sicherung')}</Link> })}</p>
      </form>
      {unten}
    </div>
  );
}
