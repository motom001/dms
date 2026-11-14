import { useEffect, useRef, useState } from 'react';
import type { Dokument, Mappentyp } from '../../../shared/src/model';
import {
  DECKKRAFT_HINWEIS_AB, NEUER_STEMPEL, platzhalterIn, STEMPEL_LAGEN, STEMPEL_SEITEN, STEMPEL_TEXT_MAX,
  type Stempel, type StempelLage, type StempelSeiten, type StempelTyp, type StempelVorlage, type StempelWunsch,
} from '../../../shared/src/stempel';
import { t, tn } from '../sprache';
import { beispielWerte, PlatzhalterKnoepfe, StempelVorschau } from './StempelVorschau';
import { dokumenteApi } from '../api/dokumente';
import { Feld, HakenFeld, Knopf } from '../bausteine';
import { Hilfe } from '../Hilfe';
import { VerkleinertWahl } from './VerkleinertWahl';
import { OriginalEmailWahl } from './Anlagen';
import type { Stufe } from '../../../shared/src/verkleinern';
import { useKonto } from '../konto';
import { FassungWahl, hatArchivfassung, type Fassung } from './FassungWahl';

/**
 * Stempel beim Weitergeben (#394): dieselben Felder beim Herunterladen, beim Export und bei der E-Mail.
 * Das gespeicherte Original bleibt unverändert; der Server stempelt nur die ausgegebene Kopie.
 */

let zwischenspeicher: StempelVorlage[] | null = null;
/** Vorlagen (einmal je Sitzung geladen; die Werkbank setzt sie nach dem Speichern neu). */
export function useStempelVorlagen(): StempelVorlage[] | null {
  const [v, setV] = useState(zwischenspeicher);
  useEffect(() => { if (!zwischenspeicher) void dokumenteApi.stempelVorlagen().then((x) => { zwischenspeicher = x; setV(x); }, () => setV([])); }, []);
  return v;
}
export const merkeStempelVorlagen = (v: StempelVorlage[]) => { zwischenspeicher = v; };

export interface StempelWahl extends Stempel { an: boolean; vorlage: string; empfaenger: string }

/** Werte einer Vorlage; ohne Vorlage die Vorgaben für einen neuen Stempel (70 %, „wie Tinte“, #799). */
const ausVorlage = (v: StempelVorlage | undefined): Stempel & { vorlage: string } => {
  const { text, lage, deckkraft, seiten, tinte, drehung, x, y, farbe, groesse } = v ?? NEUER_STEMPEL;
  return { vorlage: v?.id ?? '', text, lage, deckkraft, seiten, tinte, drehung, x, y, farbe, groesse };
};

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
  if (!w.text.trim()) return t('ablage.stempel.gib-einen-text-fuer');
  if (platzhalterIn(w.text).includes('empfaenger') && !w.empfaenger.trim() && !ersatz.trim()) return t('ablage.stempel.gib-den-empfaenger-an');
  return null;
}

/** Strengster Stempel mehrerer Mappentypen: Pflicht vor Vorschlag. */
export function stempelVon(typen: Array<Mappentyp | undefined>): StempelTyp | null {
  const s = typen.map((eintrag) => eintrag?.stempel).filter((x): x is StempelTyp => !!x);
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
  const werte = { ...beispielWerte(), empfaenger: wahl.empfaenger.trim() || empfaengerErsatz || '…', benutzer: ich?.name || ich?.email, mappe: mappe ?? '…', archivnummer: 'A-000123' };
  const s = (p: Partial<StempelWahl>) => setze({ ...wahl, ...p });
  const textfeld = useRef<HTMLTextAreaElement>(null);
  return (
    <fieldset className="stempelwahl">
      <legend className="sr">{t('ablage.stempel.stempel')}</legend>
      {immer ? <p className="leise klein">{tn('ablage.stempel.nur-die-kopie-bekommt', { wert: pflicht ? t('ablage.stempel.der-mappentyp-verlangt-beim') : '', hilfe: <Hilfe ort="stempel.weitergeben" /> })}</p>
      : <HakenFeld id={`${id}-an`} beschriftung={t('ablage.stempel.mit-stempel-2')} hilfe="stempel.weitergeben" hinweis={pflicht ? t('ablage.stempel.der-mappentyp-verlangt-beim-2') : t('ablage.stempel.nur-die-kopie-bekommt-2')}>
          <input type="checkbox" checked={wahl.an || !!pflicht} disabled={pflicht} onChange={(e) => s({ an: e.target.checked })} />
        </HakenFeld>}
      {(wahl.an || pflicht || immer) && (
        <div className="stempelfelder">
          <div className="raster">
            <Feld id={`${id}-vorlage`} beschriftung={t('ablage.stempel.vorlage')} className="eigenschaft">
              <select value={wahl.vorlage} onChange={(e) => setze({ ...wahl, ...ausVorlage(vorlagen.find((v) => v.id === e.target.value)), vorlage: e.target.value })}>
                <option value="">{t('ablage.stempel.eigener-text')}</option>
                {vorlagen.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Feld>
            <Feld id={`${id}-empfaenger`} beschriftung={t('ablage.stempel.empfaenger-2')} optional={!nutztEmpfaenger || !!empfaengerErsatz} hinweis={!nutztEmpfaenger ? t('ablage.stempel.nur-fuer-empfaenger-2') : undefined} className="eigenschaft">
              <input value={wahl.empfaenger} maxLength={120} onChange={(e) => s({ empfaenger: e.target.value })}
                placeholder={empfaengerErsatz ? t('ablage.stempel.ohne-angabe', { empfaengerErsatz }) : t('ablage.stempel.z-b-hausverwaltung-mueller')} required={nutztEmpfaenger && !empfaengerErsatz} />
            </Feld>
            <Feld id={`${id}-text`} beschriftung={t('werkbank.stempel.text')} className="eigenschaft breit">{(v) => <>
              <textarea {...v} ref={textfeld} rows={2} value={wahl.text} maxLength={STEMPEL_TEXT_MAX} onChange={(e) => s({ text: e.target.value, vorlage: '' })} />
              <PlatzhalterKnoepfe feld={() => textfeld.current} text={wahl.text} setze={(text) => s({ text, vorlage: '' })} />
            </>}</Feld>
            <Feld id={`${id}-lage`} beschriftung={t('werkbank.stempel.lage')} className="eigenschaft">
              <select value={wahl.lage} onChange={(e) => s({ lage: e.target.value as StempelLage })}>
                {Object.keys(STEMPEL_LAGEN).map((k) => <option key={k} value={k}>{t.frei(`werkbank.stempel.lage.${k}`)}</option>)}
              </select>
            </Feld>
            <Feld id={`${id}-deckkraft`} beschriftung={<>{t('werkbank.stempel.deckkraft')} <small>{Math.round(wahl.deckkraft * 100)} %</small></>} className="eigenschaft"
              hinweis={wahl.deckkraft >= DECKKRAFT_HINWEIS_AB ? <span className="warntext" role="status">{t('werkbank.stempel.deckkraft.hinweis')}</span> : undefined}>
              <input type="range" min={10} max={100} step={5} value={Math.round(wahl.deckkraft * 100)} onChange={(e) => s({ deckkraft: Number(e.target.value) / 100 })} />
            </Feld>
            <Feld id={`${id}-seiten`} beschriftung={t('werkbank.stempel.seiten')} className="eigenschaft">
              <select value={wahl.seiten} onChange={(e) => s({ seiten: e.target.value as StempelSeiten })}>
                {Object.keys(STEMPEL_SEITEN).map((k) => <option key={k} value={k}>{t.frei(`werkbank.stempel.seiten.${k}`)}</option>)}
              </select>
            </Feld>
          </div>
          <div className="stempelzeile">
            <div className="stempelvorschau-klein"><StempelVorschau stempel={wahl} werte={werte} beispiele={['rechnung']} /></div>
            <div>
              <HakenFeld id={`${id}-tinte`} beschriftung={t('werkbank.stempel.tinte')} hinweis={t('werkbank.stempel.tinte.hilfe')}>
                <input type="checkbox" checked={wahl.tinte} onChange={(e) => s({ tinte: e.target.checked })} />
              </HakenFeld>
            </div>
          </div>
        </div>
      )}
    </fieldset>
  );
}

/** Dialog „Herunterladen mit Stempel“ an einem Dokument (auch für ältere Versionen). */
export function StempelDialog({ d, typ, mappe, version, anlagen = [], schliessen }: { d: Dokument; typ?: Mappentyp; mappe: string; version?: number; /** Anlagen (#998): „mit Anlagen?“, Vorgabe ja. */ anlagen?: Dokument[]; schliessen(): void }) {
  const [mitAnlagen, setMitAnlagen] = useState(true);
  // Original-E-Mail (#999): steht mit Kennzeichen in der Liste und lässt sich abwählen (Vorgabe: geht mit).
  const [eml, setEml] = useState(true);
  const { zusammen, dateiname } = mitAnlagenName(d, anlagen.filter((a) => eml || !a.originalEmail).length, mitAnlagen, version);
  const vorlagen = useStempelVorlagen();
  const [wahl, setWahl] = useState<StempelWahl | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  // Verkleinert (#393): erst verkleinern, dann stempeln – nur für PDFs.
  const [klein, setKlein] = useState<Stufe | null>(null);
  // Archivfassung oder Original (#715); ältere Versionen haben keine Archivfassung.
  const [fassung, setFassung] = useState<Fassung>('archiv');
  const mitArchiv = !version && hatArchivfassung(d);
  useEffect(() => { if (vorlagen && !wahl) setWahl({ ...stempelStart(vorlagen, typ?.stempel), an: true }); }, [vorlagen, wahl, typ]);
  const pflicht = typ?.stempel?.modus === 'pflicht';
  const fehler = stempelFehler(wahl);
  async function los() {
    if (!wahl) return;
    setLaeuft(true); setMeldung(undefined);
    try {
      const r = await dokumenteApi.herunterladenMitStempel(d.id, alsWunsch({ ...wahl, an: true }), dateiname, {
        version, verkleinern: d.mime === 'application/pdf' || (mitArchiv && fassung === 'archiv') ? klein : null, fassung: mitArchiv ? fassung : undefined, mitAnlagen: zusammen, originalEmail: eml,
      });
      setMeldung({ art: 'gut', text: t('ablage.stempel.gespeichert-die-historie-der', { name: r.name }) });
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setLaeuft(false); }
  }
  return (
    <div className="exportdialog blatt stempeldialog" role="dialog" aria-label={t('ablage.stempel.herunterladen-mit-stempel')}>
      <div className="blattkopf zeile-zwischen"><h2 className="h3">{t('ablage.stempel.herunterladen-mit-stempel')}</h2>
        <Knopf art="link" onClick={schliessen}>{t('ablage.stempel.schliessen')}</Knopf></div>
      <p className="leise klein">{d.name}{version ? t('ablage.stempel.version', { version }) : ''}</p>
      {!wahl || !vorlagen ? <p className="leise">{t('ablage.stempel.lade')}</p> : (
        // Kein eigenes <form>: Der Dialog steht im Formular der Mappe; Enter lädt herunter statt die Mappe zu speichern.
        <div onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); if (!fehler && !laeuft) void los(); } }}>
          <StempelFelder wahl={{ ...wahl, an: true }} setze={setWahl} vorlagen={vorlagen} pflicht={pflicht} mappe={mappe} id={`stempel-${d.id}`} immer />
          {!version && <FassungWahl wert={fassung} setze={setFassung} dokumente={[d]} id={`stempel-fassung-${d.id}`} />}
          {(d.mime === 'application/pdf' || (mitArchiv && fassung === 'archiv')) && <VerkleinertWahl wert={klein} setze={setKlein} wie="herunterladen" id={`stempel-klein-${d.id}`} />}
          <MitAnlagenWahl anlagen={version ? [] : anlagen} an={mitAnlagen} setze={setMitAnlagen} eml={eml} setzeEml={setEml} />
          {fehler && <p className="leise klein">{fehler}</p>}
          {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
          <div className="knoepfe">
            <Knopf art="haupt" gesperrt={!!fehler} laeuft={laeuft} laeuftText={t('ablage.stempel.wird-gestempelt')} onClick={() => void los()}>{t('ablage.stempel.herunterladen')}</Knopf>
            <Knopf onClick={schliessen}>{t('ablage.stempel.abbrechen')}</Knopf>
          </div>
        </div>
      )}
    </div>
  );
}

/** Mit Anlagen (#998): zusammen als ZIP „… mit Anlagen.zip“ – nur ohne Version und nur, wenn es Anlagen gibt. */
function mitAnlagenName(d: Dokument, anlagen: number, an: boolean, version?: number): { zusammen: boolean; dateiname: string } {
  const zusammen = !version && anlagen > 0 && an;
  return { zusammen, dateiname: zusammen ? t('ablage.anlagen.zip-name', { name: d.name.replace(/\.[^.]{1,5}$/, '') }) : d.name };
}

/**
 * „mit Anlagen?“ im Dialog (#998, Vorgabe ja): nur bei einem Dokument mit Anlagen. Darunter die Original-E-Mail (#999)
 * mit Kennzeichen und eigenem Haken, wenn sie mitginge.
 */
function MitAnlagenWahl({ anlagen, an, setze, eml, setzeEml }: { anlagen: Dokument[]; an: boolean; setze(an: boolean): void; eml: boolean; setzeEml(an: boolean): void }) {
  if (!anlagen.length) return null;
  return (
    <>
      <HakenFeld beschriftung={t('ablage.anlagen.mit-anlagen', { anzahl: anlagen.length })} hinweis={t('ablage.anlagen.mit-anlagen-stempel')}>
        <input type="checkbox" checked={an} onChange={(e) => setze(e.target.checked)} />
      </HakenFeld>
      {an && <OriginalEmailWahl emails={anlagen.filter((a) => a.originalEmail)} an={eml} setze={setzeEml} />}
    </>
  );
}
