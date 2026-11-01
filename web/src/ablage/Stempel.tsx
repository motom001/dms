import { useEffect, useState } from 'react';
import type { Dokument, Mappentyp } from '../../../shared/src/model';
import {
  ersetzePlatzhalter, platzhalterIn, STEMPEL_LAGEN, STEMPEL_SEITEN, STEMPEL_TEXT_MAX,
  type StempelLage, type StempelSeiten, type StempelTyp, type StempelVorlage, type StempelWunsch,
} from '../../../shared/src/stempel';
import { api } from '../api';
import { Hilfe } from '../Hilfe';
import { VerkleinertWahl } from './VerkleinertWahl';
import type { Stufe } from '../../../shared/src/verkleinern';
import { useKonto } from '../konto';

/**
 * Stempel beim Weitergeben (#394): dieselben Felder beim Herunterladen, beim Export und bei der E-Mail.
 * Das gespeicherte Original bleibt unverändert; der Server stempelt nur die ausgegebene Kopie.
 */

let zwischenspeicher: StempelVorlage[] | null = null;
/** Vorlagen (einmal je Sitzung geladen; die Werkbank setzt sie nach dem Speichern neu). */
export function useStempelVorlagen(): StempelVorlage[] | null {
  const [v, setV] = useState(zwischenspeicher);
  useEffect(() => { if (!zwischenspeicher) void api.stempelVorlagen().then((x) => { zwischenspeicher = x; setV(x); }, () => setV([])); }, []);
  return v;
}
export const merkeStempelVorlagen = (v: StempelVorlage[]) => { zwischenspeicher = v; };

export interface StempelWahl {
  an: boolean; vorlage: string; text: string; empfaenger: string;
  lage: StempelLage; deckkraft: number; seiten: StempelSeiten; seitenzahlen: boolean; archivnummer: boolean;
}

const ausVorlage = (v: StempelVorlage | undefined) => ({
  vorlage: v?.id ?? '', text: v?.text ?? '', lage: v?.lage ?? 'diagonal' as StempelLage, deckkraft: v?.deckkraft ?? 0.25,
  seiten: v?.seiten ?? 'alle' as StempelSeiten, seitenzahlen: v?.seitenzahlen ?? false, archivnummer: v?.archivnummer ?? false,
});

/** Startwerte: Schlägt der Mappentyp einen Stempel vor oder verlangt ihn, ist er an – mit seiner Vorlage. */
export function stempelStart(vorlagen: StempelVorlage[], typ?: StempelTyp | null): StempelWahl {
  const v = vorlagen.find((x) => x.id === typ?.vorlage) ?? vorlagen[0];
  return { an: !!typ, empfaenger: '', ...ausVorlage(v) };
}

/** Was an den Server geht; ohne Stempel `null` (bei Pflicht stempelt der Server trotzdem). */
export function alsWunsch(w: StempelWahl | null): StempelWunsch | null {
  if (!w?.an) return null;
  const { an: _an, vorlage, ...rest } = w;
  return { ...rest, ...(vorlage ? { vorlage } : {}) };
}

/** Fehler, bevor man abschickt; `ersatz` = Empfänger, wenn keiner eingegeben ist (z. B. E-Mail-Adressen). */
export function stempelFehler(w: StempelWahl | null, ersatz = ''): string | null {
  if (!w?.an) return null;
  if (!w.text.trim() && !w.seitenzahlen && !w.archivnummer) return 'Gib einen Text für den Stempel ein.';
  if (platzhalterIn(w.text).includes('empfaenger') && !w.empfaenger.trim() && !ersatz.trim()) return 'Gib den Empfänger an – der Stempel nennt ihn.';
  return null;
}

/** Strengster Stempel mehrerer Mappentypen: Pflicht vor Vorschlag. */
export function stempelVon(typen: Array<Mappentyp | undefined>): StempelTyp | null {
  const s = typen.map((t) => t?.stempel).filter((x): x is StempelTyp => !!x);
  return s.find((x) => x.modus === 'pflicht') ?? s[0] ?? null;
}

export function StempelFelder({ wahl, setze, vorlagen, pflicht, mappe, empfaengerErsatz, id = 'stempel', immer }: {
  wahl: StempelWahl; setze(w: StempelWahl): void; vorlagen: StempelVorlage[];
  /** Der Mappentyp verlangt einen Stempel: lässt sich nicht abschalten. */
  pflicht?: boolean;
  /** Für die Vorschau des Platzhalters {mappe}. */
  mappe?: string;
  /** Hinweis, was ohne Empfänger gilt (E-Mail: die Adressen). */
  empfaengerErsatz?: string;
  id?: string;
  /** Im Dialog „Herunterladen mit Stempel“: immer an, ohne Kästchen. */
  immer?: boolean;
}) {
  const { ich } = useKonto();
  const nutztEmpfaenger = platzhalterIn(wahl.text).includes('empfaenger');
  const vorschau = ersetzePlatzhalter(wahl.text, { empfaenger: wahl.empfaenger.trim() || empfaengerErsatz || '…', benutzer: ich?.name || ich?.email, mappe: mappe ?? '…' });
  const s = (p: Partial<StempelWahl>) => setze({ ...wahl, ...p });
  return (
    <fieldset className="stempelwahl">
      <legend className="sr">Stempel</legend>
      {immer ? <p className="leise klein">{pflicht ? 'Der Mappentyp verlangt beim Weitergeben einen Stempel. ' : ''}Nur die Kopie bekommt den Stempel, das gespeicherte Original bleibt unverändert. Bilder werden dabei zum PDF. <Hilfe ort="stempel.weitergeben" /></p>
      : <label className="haken"><input id={`${id}-an`} type="checkbox" checked={wahl.an || !!pflicht} disabled={pflicht} onChange={(e) => s({ an: e.target.checked })} />
        <span>Mit Stempel <Hilfe ort="stempel.weitergeben" />
          <small className="hilfe">{pflicht ? 'Der Mappentyp verlangt beim Weitergeben einen Stempel.' : 'Nur die Kopie bekommt den Stempel, das gespeicherte Original bleibt unverändert. Bilder werden dabei zum PDF.'}</small></span></label>}
      {(wahl.an || pflicht || immer) && (
        <div className="stempelfelder">
          <div className="raster">
            <label className="eigenschaft"><span>Vorlage</span>
              <select id={`${id}-vorlage`} value={wahl.vorlage} onChange={(e) => setze({ ...wahl, ...ausVorlage(vorlagen.find((v) => v.id === e.target.value)), vorlage: e.target.value })}>
                <option value="">– eigener Text –</option>
                {vorlagen.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select></label>
            <label className="eigenschaft"><span>Empfänger {!nutztEmpfaenger && <small>nur für {'{empfänger}'}</small>}</span>
              <input id={`${id}-empfaenger`} value={wahl.empfaenger} maxLength={120} onChange={(e) => s({ empfaenger: e.target.value })}
                placeholder={empfaengerErsatz ? `ohne Angabe: ${empfaengerErsatz}` : 'z. B. Hausverwaltung Müller'} required={nutztEmpfaenger && !empfaengerErsatz} /></label>
            <label className="eigenschaft breit"><span>Text <small>{'{datum} {empfänger} {benutzer} {mappe}'}</small></span>
              <input id={`${id}-text`} value={wahl.text} maxLength={STEMPEL_TEXT_MAX} onChange={(e) => s({ text: e.target.value, vorlage: '' })} /></label>
            <label className="eigenschaft"><span>Lage</span>
              <select id={`${id}-lage`} value={wahl.lage} onChange={(e) => s({ lage: e.target.value as StempelLage })}>
                {Object.entries(STEMPEL_LAGEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <label className="eigenschaft"><span>Deckkraft <small>{Math.round(wahl.deckkraft * 100)} %</small></span>
              <input id={`${id}-deckkraft`} type="range" min={10} max={100} step={5} value={Math.round(wahl.deckkraft * 100)} onChange={(e) => s({ deckkraft: Number(e.target.value) / 100 })} /></label>
            <label className="eigenschaft"><span>Seiten</span>
              <select id={`${id}-seiten`} value={wahl.seiten} onChange={(e) => s({ seiten: e.target.value as StempelSeiten })}>
                {Object.entries(STEMPEL_SEITEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
          </div>
          <div className="stempelzeile">
            <StempelBild text={vorschau} lage={wahl.lage} deckkraft={wahl.deckkraft} fuss={[wahl.archivnummer ? 'A-000123' : '', wahl.seitenzahlen ? 'Seite 1 von 3' : ''].filter(Boolean).join(' · ')} />
            <div>
              <label className="haken"><input type="checkbox" checked={wahl.seitenzahlen} onChange={(e) => s({ seitenzahlen: e.target.checked })} /><span>Seitenzahlen „Seite x von y“ als Fußzeile</span></label>
              <label className="haken"><input type="checkbox" checked={wahl.archivnummer} onChange={(e) => s({ archivnummer: e.target.checked })} /><span>Archivnummer in der Fußzeile <small className="hilfe">wenn das Dokument eine hat</small></span></label>
              {wahl.text.trim() && <p className="klein">Vorschau: <strong className="stempeltext">{vorschau}</strong></p>}
            </div>
          </div>
        </div>
      )}
    </fieldset>
  );
}

/** Kleine Seite mit dem Stempel an seiner Stelle – zur Orientierung, nicht maßstäblich. */
export function StempelBild({ text, lage, deckkraft, fuss }: { text: string; lage: StempelLage; deckkraft: number; fuss?: string }) {
  return (
    <div className={`stempelbild ${lage}`} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => <span key={i} className="zeile" />)}
      {text && <span className="stempel" style={{ opacity: deckkraft }}>{text}</span>}
      {fuss && <span className="fuss">{fuss}</span>}
    </div>
  );
}

/** Dialog „Herunterladen mit Stempel“ an einem Dokument (auch für ältere Versionen). */
export function StempelDialog({ d, typ, mappe, version, schliessen }: { d: Dokument; typ?: Mappentyp; mappe: string; version?: number; schliessen(): void }) {
  const vorlagen = useStempelVorlagen();
  const [wahl, setWahl] = useState<StempelWahl | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  // Verkleinert (#393): erst verkleinern, dann stempeln – nur für PDFs.
  const [klein, setKlein] = useState<Stufe | null>(null);
  useEffect(() => { if (vorlagen && !wahl) setWahl({ ...stempelStart(vorlagen, typ?.stempel), an: true }); }, [vorlagen, wahl, typ]);
  const pflicht = typ?.stempel?.modus === 'pflicht';
  const fehler = stempelFehler(wahl);
  async function los() {
    if (!wahl) return;
    setLaeuft(true); setMeldung(undefined);
    try {
      const r = await api.herunterladenMitStempel(d.id, alsWunsch({ ...wahl, an: true }), d.name, version, d.mime === 'application/pdf' ? klein : null);
      setMeldung({ art: 'gut', text: `„${r.name}“ gespeichert. Die Historie der Mappe vermerkt die Weitergabe.` });
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setLaeuft(false); }
  }
  return (
    <div className="exportdialog blatt stempeldialog" role="dialog" aria-label="Herunterladen mit Stempel">
      <div className="blattkopf zeile-zwischen"><h2 className="h3">Herunterladen mit Stempel</h2>
        <button type="button" className="textknopf" onClick={schliessen}>Schließen</button></div>
      <p className="leise klein">{d.name}{version ? ` · Version ${version}` : ''}</p>
      {!wahl || !vorlagen ? <p className="leise">Lade …</p> : (
        // Kein eigenes <form>: Der Dialog steht im Formular der Mappe; Enter lädt herunter statt die Mappe zu speichern.
        <div onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); if (!fehler && !laeuft) void los(); } }}>
          <StempelFelder wahl={{ ...wahl, an: true }} setze={setWahl} vorlagen={vorlagen} pflicht={pflicht} mappe={mappe} id={`stempel-${d.id}`} immer />
          {d.mime === 'application/pdf' && <VerkleinertWahl wert={klein} setze={setKlein} wie="herunterladen" id={`stempel-klein-${d.id}`} />}
          {fehler && <p className="leise klein">{fehler}</p>}
          {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
          <div className="knoepfe">
            <button type="button" className="knopf primaer" disabled={laeuft || !!fehler} onClick={() => void los()}>{laeuft ? 'Wird gestempelt …' : 'Herunterladen'}</button>
            <button type="button" className="knopf" onClick={schliessen}>Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}
