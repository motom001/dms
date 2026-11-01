import { useCallback, useEffect, useState } from 'react';
import { api, type OrdnerStand, type Schwelle, type SpeicherplatzEinstellung, type SpeicherplatzStand } from '../api';
import { Link } from '../ort';
import { Hilfe } from '../Hilfe';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { WARTUNG_GEAENDERT } from '../wartung';
import { einDatentraeger } from '../../../shared/src/werkbankansicht';
import { AutomatischVerkleinern, GrossePdfsVerkleinern } from './Verkleinern';

/**
 * Werkbank → Wartung und Fehlersuche → Systemzustand (#408, früher Einstellungen → Speicherplatz, #116):
 * oben Warnschwelle und Grenze, darunter belegt/frei je fester Ordner (#115). An der Grenze startet
 * der Wartungsmodus von selbst; beenden muss ihn ein Administrator. Auslastung folgt (#409).
 */

const GB = 1024 ** 3;
export const platz = (b: number) => (b < GB ? `${Math.round(b / 1024 ** 2).toLocaleString('de-DE')} MB` : `${(b / GB).toFixed(1).replace('.', ',')} GB`);
const schwelleText = (s: Schwelle) => `${String(s.wert).replace('.', ',')} ${s.einheit === 'prozent' ? '%' : 'GB'}`;
const ORDNERNAME: Record<string, string> = { dateien: 'Dateien', geheim: 'Schlüssel', sicherung: 'Sicherungen' };
const ZUSTAND = { ok: { text: 'ausreichend', art: 'gut' }, warnung: { text: 'knapp', art: 'warn' }, grenze: { text: 'Grenze erreicht', art: 'schlecht' } } as const;

export function useSpeicherplatz(offen: boolean) {
  const [stand, setStand] = useState<SpeicherplatzStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await api.speicherplatz()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => {
    if (!offen) return;
    void laden();
    const t = setInterval(() => void laden(), 30_000);
    return () => clearInterval(t);
  }, [offen, laden]);
  return { stand, fehler, laden, setStand };
}
export type SpeicherplatzZustand = ReturnType<typeof useSpeicherplatz>;

/** Gleicher Datenträger: nur einmal mit Balken, die anderen verweisen darauf. */
function datentraeger(o: OrdnerStand[]) {
  const erster = new Map<string, OrdnerStand>();
  for (const x of o) if (x.geraet && !erster.has(x.geraet)) erster.set(x.geraet, x);
  return (x: OrdnerStand) => (x.geraet ? erster.get(x.geraet) : undefined);
}

/** Belegt/frei mit Warnschwelle und Grenze. */
function Balken({ o }: { o: OrdnerStand }) {
  if (o.gesamt === null || o.frei === null) return <p className="leise klein">nicht messbar (Ordner fehlt oder ist nicht lesbar)</p>;
  const anteil = o.belegt !== null ? Math.min(100, (o.belegt / o.gesamt) * 100) : 0;
  return (
    <>
      <div className="platzbalken" role="img" aria-label={`${Math.round(anteil)} Prozent belegt`}>
        <span className={o.zustand ?? ''} style={{ width: `${anteil}%` }} />
        {o.warnBytes != null && <i className="marke warn" style={{ left: `${100 - (o.warnBytes / o.gesamt) * 100}%` }} title="Warnschwelle" />}
        {o.grenzBytes != null && <i className="marke grenze" style={{ left: `${100 - (o.grenzBytes / o.gesamt) * 100}%` }} title="Grenze" />}
      </div>
      <p className="leise klein">{platz(o.belegt ?? 0)} belegt · <strong>{platz(o.frei)} frei</strong> von {platz(o.gesamt)}</p>
    </>
  );
}

function SchwelleFeld({ name, wert, aendern, hilfe }: { name: string; wert: Schwelle; aendern: (s: Schwelle) => void; hilfe: string }) {
  return (
    <label className="eigenschaft"><span>{name} <small>{hilfe}</small></span>
      <span className="schwellenfeld">
        <input type="number" min={0} step={0.5} max={wert.einheit === 'prozent' ? 90 : 100000} value={wert.wert} onChange={(e) => aendern({ ...wert, wert: Number(e.target.value) })} />
        <select value={wert.einheit} onChange={(e) => aendern({ ...wert, einheit: e.target.value as Schwelle['einheit'] })} aria-label={`${name}: Einheit`}>
          <option value="prozent">% frei</option>
          <option value="gb">GB frei</option>
        </select>
      </span>
    </label>
  );
}

export function SpeicherplatzPanel({ z, nachAenderung }: { z: SpeicherplatzZustand; nachAenderung?: () => void }) {
  const s = z.stand;
  const [e, setE] = useState<SpeicherplatzEinstellung | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [laeuft, setLaeuft] = useState(false);
  useEffect(() => { if (s && !e) setE(s.einstellung); }, [s, e]);
  const ent = useEntwurf(s?.einstellung ?? null, e, { aus: !s || !e, zuruecksetzen: () => { if (s) setE(s.einstellung); setMeldung(undefined); } });
  if (!s || !e) return <p className="leise">{z.fehler ?? 'Lade …'}</p>;
  const gleicherTraeger = datentraeger(s.ordner);
  const ein = einDatentraeger(s.ordner);

  async function speichern() {
    setLaeuft(true); setMeldung(undefined);
    try { const neu = await api.speicherplatzSetzen(e!); z.setStand(neu); setE(neu.einstellung); setMeldung({ art: 'gut', text: 'Gespeichert und neu gemessen.' }); nachAenderung?.(); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
    finally { setLaeuft(false); }
  }
  async function wartungBeenden() {
    setLaeuft(true); setMeldung(undefined);
    try { await api.wartungAus(); dispatchEvent(new Event(WARTUNG_GEAENDERT)); await z.laden(); nachAenderung?.(); setMeldung({ art: 'gut', text: 'Wartungsmodus beendet – alle können wieder arbeiten.' }); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
    finally { setLaeuft(false); }
  }
  const minFrei = Math.min(...s.ordner.map((o) => o.frei ?? Infinity));

  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank</p>
        <h1>Systemzustand</h1>
        <p className="leise">Wie es dem Server gerade geht. <strong>Speicherplatz:</strong> Das DMS misst jede Minute und vor jedem Hochladen, wie viel Platz in seinen Ordnern frei ist. Unter der <strong>Warnschwelle</strong> gibt es einen Hinweis hier und in der Übersicht sowie eine Mail an alle Administratoren. Unter der <strong>Grenze</strong> ist das Hochladen sofort gesperrt, und nach 5 Minuten Vorlauf beginnt der Wartungsmodus („Speicherplatzlimit erreicht“). <Hilfe ort="werkbank.speicherplatz" /></p>
      </div>

      {s.zustand === 'grenze' && <div className="hinweis schlecht"><p><strong>Speicherplatzlimit erreicht.</strong> Hochladen ist gesperrt. Schaffe Platz – alte <Link to="/werkbank/sicherung" className="verweis">Sicherungen</Link> löschen, den <Link to="/werkbank/papierkorb" className="verweis">Papierkorb</Link> leeren, <a href="#verkleinern" className="verweis">große PDFs verkleinern</a> – oder vergrößere den Speicher des NAS. Danach beendest du den <Link to="/werkbank/wartungsmodus" className="verweis">Wartungsmodus</Link> selbst.</p></div>}
      {s.zustand === 'warnung' && <div className="hinweis warn"><p><strong>Der Speicherplatz wird knapp.</strong> Noch arbeiten alle normal. Schaffe rechtzeitig Platz, bevor die Grenze ({schwelleText(s.einstellung.grenze)} frei) erreicht ist.</p></div>}
      {s.wartungBeenden && (
        <div className="hinweis gut hinweiszeile">
          <p><strong>Wieder {Number.isFinite(minFrei) ? platz(minFrei) : 'genug Platz'} frei.</strong> Der Wartungsmodus wegen des Speicherplatzes läuft noch – er endet nicht von selbst. Wartung beenden?</p>
          <button type="button" className="knopf primaer klein" disabled={laeuft} onClick={() => void wartungBeenden()}>Wartung beenden</button>
        </div>
      )}

      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      <form className="blatt" id="schwellen" onSubmit={(ev) => { ev.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <h2 className="h3">Schwellen für den Speicherplatz</h2>
        <div className="raster">
          <SchwelleFeld name="Warnschwelle" hilfe="Hinweis und Mail" wert={e.warnung} aendern={(w) => setE({ ...e, warnung: w })} />
          <SchwelleFeld name="Grenze" hilfe="Hochladen gesperrt, Wartungsmodus" wert={e.grenze} aendern={(g) => setE({ ...e, grenze: g })} />
        </div>
        <p className="leise klein">Gilt für jeden Ordner einzeln; Prozent beziehen sich auf die Größe seines Datenträgers. Standard: Warnung unter 10 % frei, Grenze unter 2 GB frei.</p>
        {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
        <Speicherleiste ent={ent} gegenstand="Schwellen" sendet={laeuft} />
      </form>

      <section className="blatt" id="ordner">
        <h2 className="h3">Ordner</h2>
        <p className="leise klein">Die Ordner im Container sind fest; auf welchen Ordner des NAS sie zeigen, bestimmen die Volumes der Compose-Datei. Die Datenbank liegt in ihrem eigenen Container und lässt sich von hier nicht messen – liegt alles auf derselben Platte (üblich auf dem NAS), genügt diese Messung.</p>
        {ein ? (
          <div className="ordnerzeile">
            <div className="zeile-zwischen">
              <strong>Ein Datenträger für {s.ordner.map((o) => ORDNERNAME[o.art] ?? o.pfad).join(', ').replace(/, ([^,]*)$/, ' und $1')}</strong>
              {s.ordner[0].zustand && <span className={`chip ${ZUSTAND[s.ordner[0].zustand].art}`}>{ZUSTAND[s.ordner[0].zustand].text}</span>}
            </div>
            <Balken o={s.ordner[0]} />
            <ul className="stapel klein">
              {s.ordner.map((o) => (
                <li key={o.art} id={`ordner-${o.art}`}><span className="mono">{o.pfad}</span> <span className="leise">{o.text}</span>{o.volume === false && <span className="fehlertext"> · kein eigenes Volume – geht beim Neuerstellen des Containers verloren!</span>}</li>
              ))}
            </ul>
            {s.ordner.some((o) => o.art === 'sicherung') && <div className="hinweis info"><p><strong>Die Sicherungen liegen auf derselben Platte wie die Dokumente.</strong> Fällt sie aus, sind beide weg – kopiere den Sicherungsordner auf eine andere Platte oder außer Haus.</p></div>}
          </div>
        ) : s.ordner.map((o) => {
          const wie = gleicherTraeger(o);
          return (
            <div key={o.art} id={`ordner-${o.art}`} className="ordnerzeile">
              <div className="zeile-zwischen">
                <span><span className="mono">{o.pfad}</span> <span className="leise klein">{o.text}</span></span>
                {o.zustand && <span className={`chip ${ZUSTAND[o.zustand].art}`}>{ZUSTAND[o.zustand].text}</span>}
              </div>
              <Balken o={o} />
              {o.gesamt !== null && o.frei !== null && <p className="leise klein">{wie && wie.art !== o.art ? `gleicher Datenträger wie ${wie.pfad}` : ''}{o.volume === false ? `${wie && wie.art !== o.art ? ' · ' : ''}kein eigenes Volume – geht beim Neuerstellen des Containers verloren!` : ''}</p>}
            </div>
          );
        })}
        {s.vorschau && s.vorschau.anzahl > 0 && <p className="leise klein">Davon Vorschaubilder: {s.vorschau.anzahl.toLocaleString('de-DE')} mit {platz(s.vorschau.bytes)}. Sie werden nicht gesichert und entstehen bei Bedarf neu.</p>}
        <div className="zeile-zwischen">
          <p className="leise klein">Gemessen {new Date(s.gemessen).toLocaleTimeString('de-DE', { timeStyle: 'short' })} Uhr.</p>
          <button type="button" className="knopf klein" onClick={() => void z.laden()}>Neu messen</button>
        </div>
      </section>


      {/* PDF verkleinern (#393): Platz schaffen bei großen Scans. */}
      <GrossePdfsVerkleinern />
      <AutomatischVerkleinern />
    </div>
  );
}
