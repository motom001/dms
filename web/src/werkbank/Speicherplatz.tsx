import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type OrdnerStand, type Schwelle, type SpeicherplatzEinstellung, type SpeicherplatzStand } from '../api';
import { Link } from '../ort';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { WARTUNG_GEAENDERT } from '../wartung';
import { einDatentraeger } from '../../../shared/src/werkbankansicht';
import { GrossePdfsVerkleinern } from './Verkleinern';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { Kopf } from './Kopf';
import { Feld, Knopf } from '../bausteine';

/**
 * Werkbank → Wartung und Fehlersuche → Systemzustand (#408, früher Einstellungen → Speicherplatz, #116):
 * oben Warnschwelle und Grenze, darunter belegt/frei je fester Ordner (#115). An der Grenze startet
 * der Wartungsmodus von selbst; beenden muss ihn ein Administrator. Darunter die Auslastung (#409, `Auslastung.tsx`).
 */

const GB = 1024 ** 3;
export const platz = (b: number) => (b < GB ? `${Math.round(b / 1024 ** 2).toLocaleString(gebietsschema())} MB` : `${(b / GB).toFixed(1).replace('.', ',')} GB`);
const schwelleText = (s: Schwelle) => `${String(s.wert).replace('.', ',')} ${s.einheit === 'prozent' ? '%' : 'GB'}`;
const ORDNERNAME: Record<string, string> = { dateien: t('werkbank.speicherplatz.dateien'), geheim: t('werkbank.speicherplatz.schluessel'), sicherung: t('werkbank.speicherplatz.sicherungen') };
const ZUSTAND = { ok: { text: t('werkbank.speicherplatz.ausreichend'), art: 'gut' }, warnung: { text: t('werkbank.speicherplatz.knapp'), art: 'warn' }, grenze: { text: t('werkbank.speicherplatz.grenze-erreicht'), art: 'schlecht' } } as const;

export function useSpeicherplatz(offen: boolean) {
  const [stand, setStand] = useState<SpeicherplatzStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await api.speicherplatz()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => {
    if (!offen) return;
    void laden();
    const timer = setInterval(() => void laden(), 30_000);
    return () => clearInterval(timer);
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
  if (o.gesamt === null || o.frei === null) return <p className="leise klein">{t('werkbank.speicherplatz.nicht-messbar-ordner-fehlt')}</p>;
  const anteil = o.belegt !== null ? Math.min(100, (o.belegt / o.gesamt) * 100) : 0;
  return (
    <>
      <div className="platzbalken" role="img" aria-label={t('werkbank.speicherplatz.prozent-belegt', { round: Math.round(anteil) })}>
        <span className={o.zustand ?? ''} style={{ width: `${anteil}%` }} />
        {o.warnBytes != null && <i className="marke warn" style={{ left: `${100 - (o.warnBytes / o.gesamt) * 100}%` }} title={t('werkbank.speicherplatz.warnschwelle')} />}
        {o.grenzBytes != null && <i className="marke grenze" style={{ left: `${100 - (o.grenzBytes / o.gesamt) * 100}%` }} title={t('werkbank.speicherplatz.grenze')} />}
      </div>
      <p className="leise klein">{tn('werkbank.speicherplatz.belegt-von', { platz: platz(o.belegt ?? 0), b: <strong>{t('werkbank.speicherplatz.frei', { platz: platz(o.frei) })}</strong>, platz2: platz(o.gesamt) })}</p>
    </>
  );
}

function SchwelleFeld({ name, wert, aendern, hilfe }: { name: string; wert: Schwelle; aendern: (s: Schwelle) => void; hilfe: string }) {
  return (
    <Feld beschriftung={name} hinweis={hilfe}>
      {(v) => (
        <span className="schwellenfeld">
          <input {...v} type="number" min={0} step={0.5} max={wert.einheit === 'prozent' ? 90 : 100000} value={wert.wert} onChange={(e) => aendern({ ...wert, wert: Number(e.target.value) })} />
          <select value={wert.einheit} onChange={(e) => aendern({ ...wert, einheit: e.target.value as Schwelle['einheit'] })} aria-label={t('werkbank.speicherplatz.einheit', { name })}>
            <option value="prozent">{t('werkbank.speicherplatz.frei-2')}</option>
            <option value="gb">{t('werkbank.speicherplatz.gb-frei')}</option>
          </select>
        </span>
      )}
    </Feld>
  );
}

export function SpeicherplatzPanel({ z, nachAenderung, auslastung, unten }: { z: SpeicherplatzZustand; nachAenderung?: () => void; auslastung?: ReactNode; unten?: ReactNode }) {
  const s = z.stand;
  const [e, setE] = useState<SpeicherplatzEinstellung | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [laeuft, setLaeuft] = useState(false);
  useEffect(() => { if (s && !e) setE(s.einstellung); }, [s, e]);
  const ent = useEntwurf(s?.einstellung ?? null, e, { aus: !s || !e, zuruecksetzen: () => { if (s) setE(s.einstellung); setMeldung(undefined); } });
  if (!s || !e) return <p className="leise">{z.fehler ?? t('werkbank.speicherplatz.lade')}</p>;
  const gleicherTraeger = datentraeger(s.ordner);
  const ein = einDatentraeger(s.ordner);

  async function speichern() {
    setLaeuft(true); setMeldung(undefined);
    try { const neu = await api.speicherplatzSetzen(e!); z.setStand(neu); setE(neu.einstellung); setMeldung({ art: 'gut', text: t('werkbank.speicherplatz.gespeichert-und-neu-gemessen') }); nachAenderung?.(); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
    finally { setLaeuft(false); }
  }
  async function wartungBeenden() {
    setLaeuft(true); setMeldung(undefined);
    try { await api.wartungAus(); dispatchEvent(new Event(WARTUNG_GEAENDERT)); await z.laden(); nachAenderung?.(); setMeldung({ art: 'gut', text: t('werkbank.speicherplatz.wartungsmodus-beendet-alle-koennen') }); }
    catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
    finally { setLaeuft(false); }
  }
  const minFrei = Math.min(...s.ordner.map((o) => o.frei ?? Infinity));

  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.speicherplatz.systemzustand')} ueber={t('werkbank.speicherplatz.werkbank')} hilfe="werkbank.speicherplatz">
        <p className="leise">{tn('werkbank.speicherplatz.wie-es-dem-server', { b: <strong>{t('werkbank.speicherplatz.speicherplatz')}</strong>, b2: <strong>{t('werkbank.speicherplatz.warnschwelle')}</strong>, b3: <strong>{t('werkbank.speicherplatz.grenze')}</strong> })}</p>
      </Kopf>

      {s.zustand === 'grenze' && <div className="hinweis schlecht"><p>{tn('werkbank.speicherplatz.hochladen-ist-gesperrt-schaffe', { b: <strong>{t('werkbank.speicherplatz.speicherplatzlimit-erreicht')}</strong>, link: <Link to="/werkbank/sicherung" className="verweis">{t('werkbank.speicherplatz.sicherungen')}</Link>, link2: <Link to="/werkbank/papierkorb" className="verweis">{t('werkbank.speicherplatz.papierkorb')}</Link>, link3: <a href="#verkleinern" className="verweis">{t('werkbank.speicherplatz.grosse-pdfs-verkleinern')}</a>, link4: <Link to="/werkbank/wartung#wartungsmodus" className="verweis">{t('werkbank.speicherplatz.wartungsmodus')}</Link> })}</p></div>}
      {s.zustand === 'warnung' && <div className="hinweis warn"><p>{tn('werkbank.speicherplatz.noch-arbeiten-alle-normal', { b: <strong>{t('werkbank.speicherplatz.der-speicherplatz-wird-knapp')}</strong>, schwelleText: schwelleText(s.einstellung.grenze) })}</p></div>}
      {s.wartungBeenden && (
        <div className="hinweis gut hinweiszeile">
          <p>{tn('werkbank.speicherplatz.der-wartungsmodus-wegen-des', { b: <strong>{t('werkbank.speicherplatz.wieder-frei', { wert: Number.isFinite(minFrei) ? platz(minFrei) : t('werkbank.speicherplatz.genug-platz') })}</strong> })}</p>
          <Knopf art="haupt" groesse="klein" gesperrt={laeuft} onClick={wartungBeenden}>{t('werkbank.speicherplatz.wartung-beenden')}</Knopf>
        </div>
      )}

      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      <form className="blatt" id="schwellen" onSubmit={(ev) => { ev.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <h2 className="h3">{t('werkbank.speicherplatz.schwellen-fuer-den-speicherplatz')}</h2>
        <div className="raster">
          <SchwelleFeld name={t('werkbank.speicherplatz.warnschwelle')} hilfe={t('werkbank.speicherplatz.hinweis-und-mail')} wert={e.warnung} aendern={(w) => setE({ ...e, warnung: w })} />
          <SchwelleFeld name={t('werkbank.speicherplatz.grenze')} hilfe={t('werkbank.speicherplatz.hochladen-gesperrt-wartungsmodus')} wert={e.grenze} aendern={(g) => setE({ ...e, grenze: g })} />
        </div>
        <p className="leise klein">{t('werkbank.speicherplatz.gilt-fuer-jeden-ordner')}</p>
        {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
        <Speicherleiste ent={ent} gegenstand={t('werkbank.speicherplatz.schwellen')} sendet={laeuft} />
      </form>

      {/* Auslastung (#409): unter den Schwellen, über den Ordnern. */}
      {auslastung}

      <section className="blatt" id="ordner">
        <h2 className="h3">{t('werkbank.speicherplatz.ordner')}</h2>
        <p className="leise klein">{t('werkbank.speicherplatz.die-ordner-im-container')}</p>
        {ein ? (
          <div className="ordnerzeile">
            <div className="zeile-zwischen">
              <strong>{t('werkbank.speicherplatz.ein-datentraeger-fuer')}{' '}{s.ordner.map((o) => ORDNERNAME[o.art] ?? o.pfad).join(', ').replace(/, ([^,]*)$/, ' und $1')}</strong>
              {s.ordner[0].zustand && <span className={`chip ${ZUSTAND[s.ordner[0].zustand].art}`}>{ZUSTAND[s.ordner[0].zustand].text}</span>}
            </div>
            <Balken o={s.ordner[0]} />
            <ul className="stapel klein">
              {s.ordner.map((o) => (
                <li key={o.art} id={`ordner-${o.art}`}><span className="mono">{o.pfad}</span> <span className="leise">{o.text}</span>{o.volume === false && <span className="fehlertext"> {' '}{t('werkbank.speicherplatz.kein-eigenes-volume-geht')}</span>}</li>
              ))}
            </ul>
            {s.ordner.some((o) => o.art === 'sicherung') && <div className="hinweis info"><p>{tn('werkbank.speicherplatz.faellt-sie-aus-sind', { b: <strong>{t('werkbank.speicherplatz.die-sicherungen-liegen-auf')}</strong> })}</p></div>}
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
              {o.gesamt !== null && o.frei !== null && <p className="leise klein">{wie && wie.art !== o.art ? t('werkbank.speicherplatz.gleicher-datentraeger-wie', { pfad: wie.pfad }) : ''}{o.volume === false ? t('werkbank.speicherplatz.kein-eigenes-volume-geht-2', { wert: wie && wie.art !== o.art ? ' · ' : '' }) : ''}</p>}
            </div>
          );
        })}
        {s.vorschau && s.vorschau.anzahl > 0 && <p className="leise klein">{t('werkbank.speicherplatz.davon-vorschaubilder-mit-sie', { zahl: s.vorschau.anzahl.toLocaleString(gebietsschema()), platz: platz(s.vorschau.bytes) })}</p>}
        <div className="zeile-zwischen">
          <p className="leise klein">{t('werkbank.speicherplatz.gemessen-uhr', { uhrzeit: new Date(s.gemessen).toLocaleTimeString(gebietsschema(), { timeStyle: 'short' }) })}</p>
          <Knopf groesse="klein" onClick={() => z.laden()}>{t('werkbank.speicherplatz.neu-messen')}</Knopf>
        </div>
      </section>


      {/* PDF verkleinern (#393): Platz schaffen bei großen Scans. „Neue PDFs automatisch verkleinern“ steht seit #725 unter Suche und Volltext. */}
      <GrossePdfsVerkleinern />
      {unten}
    </div>
  );
}
