import { useCallback, useEffect, useRef, useState } from 'react';
import { dokumenteApi } from '../api/dokumente';
import { werkbankApi } from '../api/werkbank';
import { useDaten } from '../daten';
import { geheZu, Link, loeseWache } from '../ort';
import { Listenkopf } from '../Listenkopf';
import { Speicherleiste, useEntwurf, useGespeichertNachziehen } from '../Speicherleiste';
import { merkeStempelVorlagen } from '../ablage/Stempel';
import { beispielWerte, PlatzhalterKnoepfe, StempelVorschau } from '../ablage/StempelVorschau';
import { t } from '../sprache';
import {
  DECKKRAFT_HINWEIS_AB, einzeilig, NEUER_STEMPEL, pruefeVorlage, STEMPEL_FARBEN, STEMPEL_LAGEN, STEMPEL_MODI, STEMPEL_NAME_MAX, STEMPEL_SEITEN, STEMPEL_TEXT_MAX,
  type Stempel, type StempelFarbe, type StempelLage, type StempelSeiten, type StempelVorlage,
} from '../../../shared/src/stempel';
import { GeloeschteEintraege, Bereich, Fassungen, Feld, HakenFeld, Knopf, KnopfLink, useBereiche, type BereichListe, type Klappe } from '../bausteine';
import { Symbol } from '../Symbol';
import { Kopf } from './Kopf';

/**
 * Werkbank → Stempel (#394): Vorlagen für Stempel und Wasserzeichen beim Weitergeben.
 *
 * Dreiteilig wie Nummernkreise und Designs (#990, Regel aus #366 seit #990: jede Sammlung, in der man etwas
 * anlegt und bearbeitet, bekommt die Mitte): Liste der Vorlagen in der Mitte, die gewählte Vorlage rechts mit
 * allen Einstellungen und der Live-Vorschau (#799). „+ Neu“ öffnet /werkbank/stempel/neu. Alte Links
 * (/werkbank/stempel?offen=<id>) leiten auf /werkbank/stempel/<id> (`werkbankUmleitung`).
 */

export function useStempelVorlagenWerkbank(offen: boolean) {
  const [liste, setL] = useState<StempelVorlage[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const setListe = useCallback((l: StempelVorlage[]) => { merkeStempelVorlagen(l); setL(l); }, []);
  const laden = useCallback(async () => { try { setListe(await dokumenteApi.stempelVorlagen()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, [setListe]);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  return { liste, fehler, laden, setListe };
}
export type StempelZustand = ReturnType<typeof useStempelVorlagenWerkbank>;

const lageKurz = (lage: StempelLage) => t.frei(`werkbank.stempel.lage.${lage}`).replace(/ \(.*\)$/, '');
export const stempelPfad = (id: string) => `/werkbank/stempel/${encodeURIComponent(id)}`;

/** Mitte: alle Vorlagen mit Name, Text (Platzhalter sichtbar) und Lage, dazu die Mappentypen, die sie nutzen. */
export function StempelListe({ z, offen }: { z: StempelZustand; offen?: string }) {
  const d = useDaten();
  return (
    <>
      <Listenkopf titel={t('werkbank.stempel.stempel')} hilfe="werkbank.stempel" beschreibung={t('werkbank.stempel.liste.beschreibung')}>
        <KnopfLink to="/werkbank/stempel/neu" art="anlegen" groesse="klein">{t('werkbank.stempel.neu')}</KnopfLink>
      </Listenkopf>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {!z.liste ? <p className="leise">{t('werkbank.stempel.lade')}</p> : !z.liste.length && offen !== 'neu' ? <p className="leise leerliste">{t('werkbank.stempel.noch-keine-vorlage')}</p> : (
        <ul className="mappenliste stempelvorlagen">
          {offen === 'neu' && <li><span className="eintrag an werk"><span className="titel">{t('werkbank.stempel.neue-vorlage-2')}</span><span className="unter">{t('werkbank.stempel.noch-nicht-gespeichert')}</span></span></li>}
          {z.liste.map((v) => {
            const genutzt = d.typen.filter((mappentyp) => mappentyp.stempel?.vorlage === v.id);
            return (
              <li key={v.id}><Link to={stempelPfad(v.id)} className={`eintrag werk ${offen === v.id ? 'an' : ''}`}>
                <span className="titel">{v.name}</span>
                <span className="unter stempeltext">{einzeilig(v.text)}</span>
                <span className="leise klein">{lageKurz(v.lage)}{genutzt.length ? ` · ${genutzt.map((mappentyp) => mappentyp.name).join(', ')}` : ''}</span>
              </Link></li>
            );
          })}
        </ul>
      )}
      <GeloeschteEintraege art="stempel" />
    </>
  );
}

/** Bereiche einer Stempelvorlage (#1000). */
type StempelBereich = 'grunddaten' | 'aussehen' | 'vorschau' | 'verwendet' | 'fassungen';
const stempelBereiche = (neu: boolean): BereichListe<StempelBereich> => [
  ['grunddaten', t('werkbank.stempel.bereich.grunddaten')], ['aussehen', t('werkbank.stempel.bereich.aussehen')], ['vorschau', t('werkbank.stempel.vorschau')],
  ...(neu ? [] : [['verwendet', t('werkbank.stempel.bereich.verwendet')] as const, ['fassungen', t('oberflaeche.fassungen.titel')] as const]),
];

interface Entwurf extends Stempel { name: string }
/** Kurzinfo „Aussehen“ im zugeklappten Bereich: Lage, Farbe, Deckkraft. */
const aussehenKurz = (e: Entwurf) => `${t.frei(`werkbank.stempel.lage.${e.lage}`)} · ${t.frei(`werkbank.stempel.farbe.${e.farbe}`)} · ${Math.round(e.deckkraft * 100)} %`;
const entwurfAus = (v: StempelVorlage | undefined): Entwurf => {
  const { text, lage, deckkraft, seiten, tinte, drehung, x, y, farbe, groesse } = v ?? NEUER_STEMPEL;
  return { name: v?.name ?? '', text, lage, deckkraft, seiten, tinte, drehung, x, y, farbe, groesse };
};

/** Rechts: eine Vorlage (oder „neu“) mit allen Einstellungen, Live-Vorschau (#799) und Speicherleiste. */
export function StempelEditor({ z, id }: { z: StempelZustand; id: string }) {
  const d = useDaten();
  const neu = id === 'neu';
  const v = neu ? undefined : z.liste?.find((x) => x.id === id);
  // Neue Vorlagen beginnen mit 70 % und „wie Tinte“ (#799); bestehende behalten ihre Werte.
  const gespeichert = entwurfAus(v);
  const [e, setE] = useState(gespeichert);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const textfeld = useRef<HTMLTextAreaElement>(null);
  const ent = useEntwurf(gespeichert, e, { neu, liste: '/werkbank/stempel', zuruecksetzen: () => { setE(gespeichert); setMeldung(undefined); } });
  // Sprungleiste und Bereiche (#1000) wie beim Mappentyp; neu ohne „Verwendet in“.
  const b = useBereiche(stempelBereiche(neu), 'stempel', neu ? null : id);
  // Nach dem Wiederherstellen einer Fassung (#1006).
  useGespeichertNachziehen(gespeichert, e, setE);
  if (!neu && !v) return z.liste ? <div className="leer"><p>{t('werkbank.stempel.diese-vorlage-gibt-es')}</p></div> : <p className="leise">{t('werkbank.stempel.lade')}</p>;
  const fehler = pruefeVorlage(e, (z.liste ?? []).filter((x) => x.id !== v?.id).map((x) => x.name));
  const genutzt = d.typen.filter((mappentyp) => mappentyp.stempel?.vorlage === v?.id);
  const setze = (p: Partial<Entwurf>) => setE((alt) => ({ ...alt, ...p }));
  async function speichern(werte = e) {
    setSendet(true); setMeldung(undefined);
    try {
      const l = neu ? await werkbankApi.stempelVorlageAnlegen(werte) : await werkbankApi.stempelVorlageAendern(v!.id, werte);
      z.setListe(l);
      if (neu) { b.merke(l[l.length - 1].id); loeseWache(); geheZu(stempelPfad(l[l.length - 1].id), true); return; }
      setMeldung({ art: 'gut', text: t('werkbank.stempel.gespeichert') });
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); b.oeffne(['grunddaten']); } finally { setSendet(false); }
  }
  async function loeschen() {
    try { z.setListe(await werkbankApi.stempelVorlageLoeschen(v!.id)); loeseWache(); geheZu('/werkbank/stempel', true); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  // Fehler stehen bei Name und Text – also in den Grunddaten; ebenso ein Fehler beim Speichern (#1000).
  const hatFehler = (x: StempelBereich) => x === 'grunddaten' && (Object.keys(fehler).length > 0 || meldung?.art === 'schlecht');
  return (
    <form className="editorform stempeleditor" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
      <Kopf titel={e.name.trim() || (neu ? t('werkbank.stempel.neue-vorlage-2') : v!.name)} ueber={t('werkbank.stempel.ueber')} hilfe="werkbank.stempel">
        <p className="leise">{t('werkbank.stempel.vorlagen-fuer-stempel-und')}</p>
      </Kopf>
      {b.leiste(hatFehler, t('werkbank.stempel.bereiche'))}
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      {/* Umstellung der entfallenen Haken (#799): nichts ändert sich heimlich – Hinweis, bis die Vorlage gespeichert ist. */}
      {v?.umgestellt && <div className="hinweis warn"><p>{t('werkbank.stempel.umgestellt')}</p>
        {!ent.geaendert && <p><Knopf groesse="klein" laeuft={sendet} onClick={() => speichern(gespeichert)}>{t('werkbank.stempel.umgestellt.ok')}</Knopf></p>}</div>}
      <Bereich id="grunddaten" titel={t('werkbank.stempel.bereich.grunddaten')} klappe={b.klappe('grunddaten', hatFehler('grunddaten'))} kurz={<span className="stempeltext">{e.name} · {einzeilig(e.text)}</span>}>
        <div className="raster">
          <Feld beschriftung={t('werkbank.stempel.name')}><input id="stempel-name" value={e.name} maxLength={STEMPEL_NAME_MAX} onChange={(x) => setze({ name: x.target.value })} required /></Feld>
          <Feld beschriftung={t('werkbank.stempel.text')} hinweis={t('werkbank.stempel.text.hilfe')} className="breit" id="stempel-text">
            {(v) => <>
              <textarea {...v} ref={textfeld} rows={3} value={e.text} maxLength={STEMPEL_TEXT_MAX} onChange={(x) => setze({ text: x.target.value })} required />
              <PlatzhalterKnoepfe feld={() => textfeld.current} text={e.text} setze={(text) => setze({ text })} />
            </>}
          </Feld>
        </div>
        {Object.values(fehler).map((f) => <p key={f} className="fehlertext klein">{f}</p>)}
      </Bereich>
      <StempelAussehen e={e} setze={setze} klappe={b.klappe('aussehen')} />
      <Bereich id="vorschau" titel={t('werkbank.stempel.vorschau')} klappe={b.klappe('vorschau')} beschreibung={t('werkbank.stempel.vorschau.hilfe')}>
        <StempelVorschau stempel={e} werte={beispielWerte()} setze={setze} />
      </Bereich>
      {!neu && (
        <Bereich id="verwendet" titel={t('werkbank.stempel.bereich.verwendet')} klappe={b.klappe('verwendet')}
          kurz={genutzt.map((mappentyp) => mappentyp.name).join(', ') || t('werkbank.stempel.bereich.verwendet.keiner')}>
          <p className="leise klein stempel-verwendet">{t('werkbank.stempel.verwendet-in')}{' '}{genutzt.length ? genutzt.map((mappentyp, i) => <span key={mappentyp.id}>{i > 0 && ', '}<Link to={`/werkbank/typen/${mappentyp.id}`} className="verweis">{mappentyp.name}</Link> ({STEMPEL_MODI[mappentyp.stempel!.modus]})</span>)
            : t('werkbank.stempel.keinem-mappentyp-das-stellst')}</p>
        </Bereich>
      )}
      {v && <Fassungen art="stempel" eintrag={v.id} stand={JSON.stringify(gespeichert)} nachher={() => z.laden()} klappe={b.klappe('fassungen')} />}
      <Speicherleiste ent={ent} gegenstand={t('werkbank.stempel.vorlage')} sendet={sendet} ungueltig={Object.keys(fehler).length > 0}
        loeschen={!neu ? {
          text: t('werkbank.stempel.vorlage-loeschen-2'),
          rueckfrage: { titel: t('werkbank.stempel.vorlage-loeschen', { name: v!.name }), text: t('werkbank.stempel.bereits-weitergegebene-kopien'), ja: t('werkbank.stempel.loeschen') },
          gesperrt: genutzt.length > 0 && t('werkbank.stempel.ein-mappentyp-verwendet-sie'),
          onClick: loeschen,
        } : undefined} />
    </form>
  );
}

/** Aussehen einer Vorlage (#394, #799): Lage, Seiten, Farbe, Größe, Deckkraft, Drehung, „wie Tinte“. */
function StempelAussehen({ e, setze, klappe }: { e: Entwurf; setze: (p: Partial<Entwurf>) => void; klappe: Klappe }) {
  const prozent = Math.round(e.deckkraft * 100);
  return (
  <Bereich id="aussehen" titel={t('werkbank.stempel.bereich.aussehen')} klappe={klappe}
      kurz={aussehenKurz(e)}>
      <div className="raster">
        <Feld beschriftung={t('werkbank.stempel.lage')}>
          <select id="stempel-lage" value={e.lage} onChange={(x) => setze({ lage: x.target.value as StempelLage })}>{Object.keys(STEMPEL_LAGEN).map((k) => <option key={k} value={k}>{t.frei(`werkbank.stempel.lage.${k}`)}</option>)}</select></Feld>
        <Feld beschriftung={t('werkbank.stempel.seiten')}>
          <select id="stempel-seiten" value={e.seiten} onChange={(x) => setze({ seiten: x.target.value as StempelSeiten })}>{Object.keys(STEMPEL_SEITEN).map((k) => <option key={k} value={k}>{t.frei(`werkbank.stempel.seiten.${k}`)}</option>)}</select></Feld>
        <Feld beschriftung={t('werkbank.stempel.farbe')}>
          <select id="stempel-farbe" value={e.farbe} onChange={(x) => setze({ farbe: x.target.value as StempelFarbe })}>{Object.keys(STEMPEL_FARBEN).map((k) => <option key={k} value={k}>{t.frei(`werkbank.stempel.farbe.${k}`)}</option>)}</select></Feld>
        <Feld beschriftung={t('werkbank.stempel.groesse')} kopfZusatz={<small>{e.groesse} %</small>}>
          <input id="stempel-groesse" type="range" min={50} max={200} step={10} value={e.groesse} onChange={(x) => setze({ groesse: Number(x.target.value) })} /></Feld>
        <Feld beschriftung={t('werkbank.stempel.deckkraft')} kopfZusatz={<small>{prozent} %</small>}
          hinweis={e.deckkraft >= DECKKRAFT_HINWEIS_AB && <span className="warntext" role="status">{t('werkbank.stempel.deckkraft.hinweis')}</span>}>
          <input id="stempel-deckkraft" type="range" min={10} max={100} step={5} value={prozent} onChange={(x) => setze({ deckkraft: Number(x.target.value) / 100 })} /></Feld>
        {/* Gesperrt aus einem Grund (#1213): bei „Diagonal“ steht der Grund unter den Feldern, nicht nur grau. */}
        <Feld beschriftung={t('werkbank.stempel.drehung')} id="stempel-drehung" kopfZusatz={e.lage !== 'diagonal' && <small>{e.drehung}°</small>}
          hinweis={e.lage === 'diagonal' && <><Symbol name="schloss" /> {t('werkbank.stempel.drehung.diagonal')}</>}>
          {(v) => (
            <div className="zeile-mit-zahl">
              <input {...v} type="range" min={0} max={359} step={1} value={e.drehung} disabled={e.lage === 'diagonal'} onChange={(x) => setze({ drehung: Number(x.target.value) })} />
              <input id="stempel-drehung-zahl" type="number" min={0} max={359} step={1} value={e.drehung} disabled={e.lage === 'diagonal'} aria-describedby={v['aria-describedby']} aria-label={`${t('werkbank.stempel.drehung')} (${t('werkbank.stempel.drehung.grad')})`}
                onChange={(x) => { const n = Number(x.target.value); if (Number.isFinite(n)) setze({ drehung: ((Math.round(n) % 360) + 360) % 360 }); }} />
            </div>
          )}
        </Feld>
      </div>
      <HakenFeld beschriftung={t('werkbank.stempel.tinte')} hinweis={t('werkbank.stempel.tinte.hilfe')}>
        <input id="stempel-tinte" type="checkbox" checked={e.tinte} onChange={(x) => setze({ tinte: x.target.checked })} />
      </HakenFeld>
    </Bereich>
  );
}
