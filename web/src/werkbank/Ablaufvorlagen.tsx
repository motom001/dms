import { useCallback, useEffect, useState } from 'react';
import {
  empfaengerText, FRAGEN, fragtDatum, istKernVorlage, karteText, VORLAGEN_GRENZEN, VORLAGEN_PLATZHALTER, VORLAGEN_REIHENFOLGE, vorlagenProbleme, wannText,
  type AblaufProbe, type AblaufVerlauf, type AblaufvorlageAnsicht, type AblaufvorlageDaten, type AblaufWann, type Frage, type MappenAblauf, type VorlagenEmpfaenger, type VorlagenKarte,
} from '../../../shared/src/ablaufvorlagen';
import { einzigesZiel, jedeMappe, zieleVon, type Mappentyp } from '../../../shared/src/model';
import type { Zeitraumeinheit } from '../../../shared/src/feldarten';
import { datumDe } from '../../../shared/src/fristen';
import { gebietsschema } from '../../../shared/src/sprache';
import { api, type Bezuege } from '../api';
import { VorlagenDialog } from '../ablage/Aufgaben';
import { MappenWahl } from '../ablage/MappeFormular';
import { useDaten } from '../daten';
import { Listenkopf } from '../Listenkopf';
import { geheZu, Link, loeseWache } from '../ort';
import { t } from '../sprache';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { Eintragsliste, Fassungen, Feld, FeldGruppe, GeloeschteEintraege, HakenFeld, Knopf, KnopfLink, Mehrfachauswahl, PaketChip, Schalter, Umschalter, ZeitraumEingabe, type Klappe, type Listeneintrag, type ZeitraumRoh } from '../bausteine';
import type { InstalliertesPaket } from '../../../shared/src/pakete';
import { paketHerkunft } from './listensuche';
import { titelOder } from '../seiten';
import { Symbol } from '../Symbol';

/**
 * Werkbank → Ablage aufbauen → Automatisierungsvorlagen (#1044): Mitte alle Vorlagen (an/aus, Zahl der offenen Abläufe),
 * rechts Name, Reihenfolge, Beschreibung, Mappentypen fürs Menü „Mappe“, Wann, Karten mit Platzhaltern und die Fragen
 * beim Anwenden; darunter Ausprobieren, „Gerade benutzt bei“, Verlauf und Änderungsverlauf. Nur Karten „Aufgabe /
 * Benachrichtigung“ – keine, die Daten nach außen schicken.
 */

type Stand = { vorlagen: AblaufvorlageAnsicht[]; angehalten: Array<{ id: string; vorlage: string; mappeId: string; grund: string }> };

export function useAblaufvorlagen(offen: boolean) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await api.ablaufvorlagen()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  return { stand, fehler, laden };
}
export type AblaufvorlagenZustand = ReturnType<typeof useAblaufvorlagen>;

const zeit = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' }) : '');
/** Die Abschnitte des Editors sind nicht klappbar – Fassungen (#1006) ebenso. */
const FEST: Klappe = { offen: true, umschalten: () => undefined, fest: true };
const pfad = (kennung: string) => `/werkbank/ablaufvorlagen/${encodeURIComponent(kennung)}`;

/**
 * Herkunft einer Vorlage (#1192): Paket mit Namen, „Ablago“ für die mitgelieferten, eigene ohne Chip. Ersetzt ein Paket
 * eine Vorlage von Ablago, steht sein Name da und der Tooltip sagt es.
 */
function Herkunft({ v, pakete }: { v: AblaufvorlageAnsicht; pakete: readonly InstalliertesPaket[] }) {
  const paket = paketHerkunft(v.paketId, pakete);
  if (v.ueberlagert) return <PaketChip paket={paket ?? { id: v.ueberlagert, name: v.ueberlagert }} inLink titel={t('automatisierung.vorlage.ui.ueberlagert', { paket: v.ueberlagert })} />;
  return <PaketChip paket={v.herkunft === 'kern' ? 'ablago' : v.herkunft === 'paket' ? paket : null} inLink />;
}

/* ---------- Liste ---------- */

export function AblaufvorlagenListe({ z, offen, pakete = [] }: { z: AblaufvorlagenZustand; offen?: string; pakete?: InstalliertesPaket[] }) {
  const s = z.stand;
  return (
    <>
      <Listenkopf titel={t('automatisierung.vorlage.ui.titel')} hilfe="werkbank.ablaufvorlagen" beschreibung={t('automatisierung.vorlage.ui.beschreibung')}>
        <KnopfLink to="/werkbank/ablaufvorlagen/neu" art="anlegen" groesse="klein">{t('automatisierung.vorlage.ui.neu')}</KnopfLink>
      </Listenkopf>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {!!s?.angehalten.length && <div className="hinweis warn"><p>{t('automatisierung.vorlage.ui.angehalten', { anzahl: s.angehalten.length })}</p></div>}
      {!s ? <p className="leise">{t('automatisierung.ui.lade')}</p> : (
        <ul className="mappenliste">{s.vorlagen.map((v) => (
          <li key={v.kennung}>
            <Link to={pfad(v.kennung)} className={`eintrag werk ${offen === v.kennung ? 'an' : ''}`}>
              <span className="titel">{v.name} <span className={`chip ${v.aktiv ? 'gut' : ''}`}>{v.aktiv ? t('automatisierung.ui.an') : t('automatisierung.ui.aus')}</span> <Herkunft v={v} pakete={pakete} /></span>
              <span className="unter">{v.kurz}</span>
              <span className="leise klein">{t('automatisierung.vorlage.ui.offen', { anzahl: v.offen })}{v.angehalten > 0 && <> · <span className="chip schlecht klein">{t('automatisierung.vorlage.ui.davon-angehalten', { anzahl: v.angehalten })}</span></>}</span>
              {v.probleme[0] && <span className="problem">{v.probleme[0]}</span>}
            </Link>
          </li>
        ))}</ul>
      )}
      <GeloeschteEintraege art="ablaufvorlage" />
    </>
  );
}

/* ---------- Editor ---------- */

type Entwurf = AblaufvorlageDaten & { aktiv: boolean };
const LEER: Entwurf = {
  name: '', beschreibung: '', reihenfolge: VORLAGEN_REIHENFOLGE.eigen, typen: [], wann: { art: 'in', anzahl: 6, einheit: 'monate' }, fragen: ['text'], aktiv: true,
  karten: [{ id: 'k1', art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'selbst' }], text: '{eingabe}' }],
};
const kopie = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const EMPFAENGER: Array<VorlagenEmpfaenger['art']> = ['frage', 'selbst', 'ersteller'];

/** Verweisfelder auf Benutzer in den gewählten Mappentypen – als Empfänger wählbar. */
function benutzerFelder(typen: Mappentyp[], gewaehlt: string[]): Array<{ key: string; label: string }> {
  const benutzerTyp = typen.find((x) => x.system === 'benutzer');
  const inFrage = typen.filter((x) => gewaehlt.includes(x.id));
  if (!inFrage.length) return [];
  const felder = inFrage[0].felder.filter((f) => f.typ === 'referenz' && ((!zieleVon(f).length && !jedeMappe(f)) || einzigesZiel(f) === benutzerTyp?.id));
  return felder.filter((f) => inFrage.every((ty) => ty.felder.some((g) => g.key === f.key))).map((f) => ({ key: f.key, label: f.label }));
}

function KartenEditor({ karte, typen, gewaehlt, setze, entfernen }: { karte: VorlagenKarte; typen: Mappentyp[]; gewaehlt: string[]; setze: (k: VorlagenKarte) => void; entfernen?: () => void }) {
  const felder = benutzerFelder(typen, gewaehlt);
  const hat = (e: VorlagenEmpfaenger) => karte.empfaenger.some((x) => x.art === e.art && (x.art !== 'feld' || (e.art === 'feld' && x.feld === e.feld)));
  const schalte = (e: VorlagenEmpfaenger, an: boolean) => setze({ ...karte, empfaenger: an ? [...karte.empfaenger, e] : karte.empfaenger.filter((x) => !(x.art === e.art && (x.art !== 'feld' || (e.art === 'feld' && x.feld === e.feld)))) });
  const platz = [...VORLAGEN_PLATZHALTER, 'titel', 'mappentyp', 'heute', 'datum', ...(gewaehlt.length ? typen.filter((x) => gewaehlt.includes(x.id)).flatMap((x) => x.felder.filter((f) => f.typ !== 'passwort').map((f) => f.key)) : [])];
  return (
    <div className="blatt karte">
      <div className="zeile-zwischen">
        <strong>{karteText(karte, typen)}</strong>
        {entfernen && <Knopf art="link" groesse="klein" symbol="schliessen" onClick={entfernen}>{t('automatisierung.ui.entfernen')}</Knopf>}
      </div>
      <Umschalter beschriftung={t('automatisierung.vorlage.ui.als')} wert={karte.als} setze={(als) => setze({ ...karte, als })}
        wahlen={[{ wert: 'aufgabe', text: t('automatisierung.karte.aufgabe.als-aufgabe') }, { wert: 'benachrichtigung', text: t('automatisierung.karte.aufgabe.als-benachrichtigung') }]} />
      <FeldGruppe beschriftung={t('automatisierung.vorlage.ui.empfaenger')}>
        {EMPFAENGER.map((art) => (
          <HakenFeld key={art} beschriftung={empfaengerText({ art } as VorlagenEmpfaenger)}><input type="checkbox" checked={hat({ art } as VorlagenEmpfaenger)} onChange={(x) => schalte({ art } as VorlagenEmpfaenger, x.target.checked)} /></HakenFeld>
        ))}
        {felder.map((f) => (
          <HakenFeld key={f.key} beschriftung={t('automatisierung.vorlage.ui.feld', { feld: f.label })}><input type="checkbox" checked={hat({ art: 'feld', feld: f.key })} onChange={(x) => schalte({ art: 'feld', feld: f.key }, x.target.checked)} /></HakenFeld>
        ))}
      </FeldGruppe>
      <Feld beschriftung={t('automatisierung.vorlage.ui.text')} hinweis={t('automatisierung.vorlage.ui.platzhalter', { liste: platz.map((p) => `{${p}}`).join(' ') })}>
        <textarea rows={2} maxLength={VORLAGEN_GRENZEN.text} value={karte.text} onChange={(x) => setze({ ...karte, text: x.target.value })} />
      </Feld>
    </div>
  );
}

/**
 * Mappentypen fürs Menü „Mappe“ (#1175): dieselbe Mehrfachauswahl wie im Verweisfeld einer Mappe – Suchfeld mit
 * Vorschlägen, Gewähltes darunter; leer heißt „bei allen Mappentypen“.
 */
function TypenWahl({ typen, gewaehlt, setze }: { typen: Mappentyp[]; gewaehlt: string[]; setze: (x: string[]) => void }) {
  const [eingabe, setEingabe] = useState('');
  const [offen, setOffen] = useState(false);
  const q = eingabe.trim().toLowerCase();
  const name = (id: string) => typen.find((x) => x.id === id)?.name ?? id;
  return (
    <Feld beschriftung={t('automatisierung.vorlage.ui.typen')} id="vorlage-typen">
      {(v) => (
        <Mehrfachauswahl id={v.id} name={t('automatisierung.vorlage.ui.typen')} platzhalter={t('automatisierung.vorlage.ui.typen.suchen')}
          eingabe={eingabe} setEingabe={setEingabe} offen={offen} setOffen={setOffen}
          vorschlaege={typen.filter((x) => !gewaehlt.includes(x.id) && (!q || x.name.toLowerCase().includes(q))).map((x) => ({ id: x.id, text: x.name }))}
          leerText={t('automatisierung.vorlage.ui.typen.keine')}
          waehle={(id) => { setze([...gewaehlt, id]); setEingabe(''); }}
          gewaehlt={gewaehlt.map((id) => ({ id, inhalt: name(id), entfernenText: t('automatisierung.vorlage.ui.typen.entfernen', { name: name(id) }) }))}
          entferne={(id) => setze(gewaehlt.filter((x) => x !== id))}
          darunter={!gewaehlt.length && <p className="leise klein">{t('automatisierung.vorlage.ui.typen.text')}</p>} />
      )}
    </Feld>
  );
}

/**
 * Wann (#1175): „Sofort | Am gewählten Datum | In [6] [Monaten]“ – Anzahl und Einheit stehen immer direkt hinter „In“,
 * blass (nicht gesperrt), solange „In“ nicht gewählt ist; ein Klick hinein wählt „In“. So springt nichts, und „In“
 * erklärt sich selbst. Schmal bricht die Reihe um, die Felder stehen dann fest unter „In“ (rechts).
 */
function WannEditor({ wann, setze }: { wann: AblaufWann; setze: (w: AblaufWann) => void }) {
  // Zuletzt gewählter Zeitraum – bleibt stehen, wenn man kurz „Sofort“ wählt.
  const [letzter, setLetzter] = useState<ZeitraumRoh>(() => (wann.art === 'in' ? { anzahl: String(wann.anzahl), einheit: wann.einheit } : { anzahl: '6', einheit: 'monate' }));
  const roh: ZeitraumRoh = wann.art === 'in' ? { anzahl: String(wann.anzahl), einheit: wann.einheit } : letzter;
  const ausRoh = (r: ZeitraumRoh): AblaufWann => {
    const n = Math.max(1, Math.trunc(Number(r.anzahl)) || 1);
    const e = r.einheit as Zeitraumeinheit;
    return e === 'jahre' ? { art: 'in', anzahl: Math.min(VORLAGEN_GRENZEN.anzahl, n * 12), einheit: 'monate' } : { art: 'in', anzahl: Math.min(VORLAGEN_GRENZEN.anzahl, n), einheit: e };
  };
  const waehle = (art: AblaufWann['art']) => { if (art === 'in') setze(ausRoh(roh)); else { setLetzter(roh); setze({ art }); } };
  return (
    <FeldGruppe beschriftung={t('automatisierung.vorlage.ui.wann')}>
      <div className="wann-reihe">
        <Umschalter beschriftung={t('automatisierung.vorlage.ui.wann')} wert={wann.art} setze={waehle}
          wahlen={[{ wert: 'sofort', text: wannText({ art: 'sofort' }) }, { wert: 'datum', text: wannText({ art: 'datum' }) }, { wert: 'in', text: t('automatisierung.vorlage.ui.wann.in') }]} />
        <span className={`wann-in${wann.art === 'in' ? '' : ' blass'}`} onFocus={() => { if (wann.art !== 'in') waehle('in'); }}>
          <ZeitraumEingabe aria-label={t('automatisierung.vorlage.ui.wann.zeitraum')} wert={roh} setze={(r) => { setLetzter(r); setze(ausRoh(r)); }} />
        </span>
      </div>
    </FeldGruppe>
  );
}

/**
 * Haken „Datum“ unter „Fragt beim Anwenden“ (#1180): bei „In …“ frei wählbar – dann ist das Datum ein Vorschlag, den man
 * beim Anwenden ändern darf; bei „Am gewählten Datum“ immer an, bei „Sofort“ aus (beides gesperrt, mit Grund).
 */
function DatumFrage({ e, setze }: { e: Entwurf; setze: (an: boolean) => void }) {
  return (
    <HakenFeld beschriftung={t('automatisierung.vorlage.ui.frage.datum')} hilfe="werkbank.ablaufvorlagen.datum">
      <input type="checkbox" checked={fragtDatum(e)} disabled={e.wann.art !== 'in'} onChange={(x) => setze(x.target.checked)} />
    </HakenFeld>
  );
}
/** Warum „Datum“ so steht (#1175): unter den Haken statt dazwischen. */
const datumGrund = (e: Entwurf) => t(e.wann.art === 'in' ? 'automatisierung.vorlage.ui.frage.datum.vorschlag' : e.wann.art === 'datum' ? 'automatisierung.vorlage.ui.frage.datum.text' : 'automatisierung.vorlage.ui.frage.datum.sofort');

/** Kopf des Editors: Name, an/aus, Kopieren, Zurücksetzen – und ob ein Paket die Vorlage ersetzt. */
function VorlageKopf({ v, aktion }: { v?: AblaufvorlageAnsicht; aktion: (f: () => Promise<unknown>, gut: string) => Promise<void> }) {
  return (
    <>
      <div className="zeile-zwischen">
        <h2 className="h3">{v ? v.name : t('automatisierung.vorlage.ui.neu.titel')}</h2>
        {v && <div className="knoepfe">
          {/* An/aus als Schalter (#1188), wirkt sofort. */}
          <Schalter an={v.aktiv} beschriftung={t('automatisierung.vorlage.ui.schalter')} beschriftungVerbergen
            setze={(an) => aktion(() => api.ablaufvorlageSchalten(v.kennung, an), an ? t('automatisierung.vorlage.ui.eingeschaltet') : t('automatisierung.vorlage.ui.ausgeschaltet'))} />
          <Knopf groesse="klein" onClick={() => aktion(async () => { const x = await api.ablaufvorlageKopieren(v.kennung); geheZu(pfad(x.kennung)); }, t('automatisierung.ui.kopiert'))}>{t('automatisierung.ui.kopieren')}</Knopf>
          {istKernVorlage(v.kennung) && v.herkunft === 'kern' && v.version > 0 && <Knopf groesse="klein" onClick={() => aktion(() => api.ablaufvorlageZuruecksetzen(v.kennung), t('automatisierung.vorlage.ui.zurueckgesetzt'))}>{t('automatisierung.vorlage.ui.zuruecksetzen')}</Knopf>}
        </div>}
      </div>
      {v?.ueberlagert && <p className="leise klein">{t('automatisierung.vorlage.ui.ueberlagert', { paket: v.ueberlagert })}</p>}
      {v && !v.aktiv && <p className="leise klein">{t('automatisierung.vorlage.ui.aus.text')}</p>}
    </>
  );
}

export function AblaufvorlageEditor({ z, kennung }: { z: AblaufvorlagenZustand; kennung: string }) {
  const d = useDaten();
  const neu = kennung === 'neu';
  const v = neu ? undefined : z.stand?.vorlagen.find((x) => x.kennung === kennung);
  const gespeichert: Entwurf = v ? { name: v.name, beschreibung: v.beschreibung, reihenfolge: v.reihenfolge, typen: v.typen, wann: v.wann, fragen: v.fragen, karten: v.karten, aktiv: v.aktiv } : LEER;
  const [e, setE] = useState<Entwurf>(() => kopie(gespeichert));
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const ent = useEntwurf(gespeichert, e, { neu, zuruecksetzen: () => setE(kopie(gespeichert)), liste: '/werkbank/ablaufvorlagen' });
  if (!z.stand) return <p className="leise">{t('automatisierung.ui.lade')}</p>;
  if (!neu && !v) return <div className="platzhalter"><p>{t('automatisierung.vorlage.fehlt')}</p></div>;
  const typen = d.typen.filter((x) => !x.system || x.system === 'post');
  // Fragen folgen dem Inhalt: „Datum“ immer bei „am gewählten Datum“, nie bei „sofort“, bei „In …“ nach Wahl (#1180).
  const fragen = (x: Entwurf): Frage[] => FRAGEN.filter((f) => (f === 'datum' ? fragtDatum(x) : x.fragen.includes(f)));
  const probleme = vorlagenProbleme({ ...e, fragen: fragen(e) }, d.typen);
  const aktion = async (f: () => Promise<unknown>, gut: string) => {
    setMeldung(undefined);
    try { await f(); await z.laden(); setMeldung({ art: 'gut', text: gut }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  };
  async function speichern() {
    setSendet(true); setMeldung(undefined);
    try {
      const daten = { ...e, fragen: fragen(e) };
      const x = v ? await api.ablaufvorlageAendern(v.kennung, { ...daten, version: v.version }) : await api.ablaufvorlageAnlegen(daten);
      await z.laden();
      loeseWache();
      if (neu) geheZu(pfad(x.kennung), true);
      setMeldung({ art: 'gut', text: t('automatisierung.vorlage.ui.gespeichert') });
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  const frage = (f: Frage, an: boolean) => setE({ ...e, fragen: an ? [...new Set([...e.fragen, f])] : e.fragen.filter((x) => x !== f) });
  return (
    <div className="stapel">
      <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }}>
        <VorlageKopf v={v} aktion={aktion} />
        <div className="raster">
          <Feld beschriftung={t('automatisierung.vorlage.ui.name')} id="vorlage-name"><input value={e.name} maxLength={VORLAGEN_GRENZEN.name} onChange={(x) => setE({ ...e, name: x.target.value })} /></Feld>
          <Feld beschriftung={t('automatisierung.vorlage.ui.reihenfolge')} hinweis={t('automatisierung.vorlage.ui.reihenfolge.text')}>
            <input type="number" min={VORLAGEN_REIHENFOLGE.min} max={VORLAGEN_REIHENFOLGE.max} value={e.reihenfolge} onChange={(x) => setE({ ...e, reihenfolge: Number(x.target.value) })} />
          </Feld>
        </div>
        <Feld beschriftung={t('automatisierung.vorlage.ui.beschreibung-feld')} optional><textarea rows={2} maxLength={VORLAGEN_GRENZEN.beschreibung} value={e.beschreibung} onChange={(x) => setE({ ...e, beschreibung: x.target.value })} /></Feld>
        <TypenWahl typen={typen} gewaehlt={e.typen} setze={(x) => setE({ ...e, typen: x })} />
        <WannEditor wann={e.wann} setze={(wann) => setE({ ...e, wann })} />
        <FeldGruppe beschriftung={t('automatisierung.vorlage.ui.fragen')} hinweis={<>{t('automatisierung.vorlage.ui.fragen.text')} {t('automatisierung.vorlage.ui.frage.datum.hinweis', { grund: datumGrund(e) })}</>}>
          <HakenFeld beschriftung={t('automatisierung.vorlage.ui.frage.empfaenger')}><input type="checkbox" checked={e.fragen.includes('empfaenger')} onChange={(x) => frage('empfaenger', x.target.checked)} /></HakenFeld>
          <DatumFrage e={e} setze={(an) => frage('datum', an)} />
          <HakenFeld beschriftung={t('automatisierung.vorlage.ui.frage.text')}><input type="checkbox" checked={e.fragen.includes('text')} onChange={(x) => frage('text', x.target.checked)} /></HakenFeld>
        </FeldGruppe>
        <h3 className="h4">{t('automatisierung.vorlage.ui.karten')}</h3>
        <p className="leise klein">{t('automatisierung.vorlage.ui.karten.text')}</p>
        {e.karten.map((k) => (
          <KartenEditor key={k.id} karte={k} typen={d.typen} gewaehlt={e.typen} setze={(n) => setE({ ...e, karten: e.karten.map((x) => (x.id === k.id ? n : x)) })}
            entfernen={e.karten.length > 1 ? () => setE({ ...e, karten: e.karten.filter((x) => x.id !== k.id) }) : undefined} />
        ))}
        {e.karten.length < VORLAGEN_GRENZEN.karten && <Knopf groesse="klein" onClick={() => setE({ ...e, karten: [...e.karten, { id: `k${Date.now().toString(36)}`, art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'selbst' }], text: '' }] })}>{t('automatisierung.vorlage.ui.karte-neu')}</Knopf>}
        <p className="leise klein">{t('automatisierung.vorlage.ui.kurz', { wann: wannText(e.wann, e.wann.art === 'in' && fragtDatum(e)) })}</p>
        {probleme.length > 0 && <ul className="fehlertext klein">{probleme.map((p) => <li key={p}>{p}</li>)}</ul>}
        <Speicherleiste ent={ent} gegenstand={t('automatisierung.vorlage.ui.gegenstand')} sendet={sendet} ungueltig={probleme.length > 0} meldung={meldung}
          loeschen={v && v.herkunft === 'eigen' ? {
            text: t('automatisierung.vorlage.ui.loeschen.knopf'),
            rueckfrage: { titel: t('automatisierung.vorlage.ui.loeschen.frage', { name: v.name }), text: t('automatisierung.vorlage.ui.loeschen.text'), ja: t('automatisierung.ui.loeschen') },
            onClick: () => aktion(async () => { await api.ablaufvorlageLoeschen(v.kennung); loeseWache(); geheZu('/werkbank/ablaufvorlagen', true); }, t('automatisierung.vorlage.ui.geloescht')),
          } : undefined} />
      </form>
      {v && <>
        <Ausprobieren key={`${v.kennung}-${v.version}`} v={v} />
        <GeradeBenutzt v={v} nachher={() => void z.laden()} />
        <Verlauf v={v} />
        <Fassungen art="ablaufvorlage" eintrag={v.kennung} stand={v.version} nachher={() => z.laden()} klappe={FEST} />
      </>}
    </div>
  );
}

/**
 * Ausprobieren (#1176): Mappe wählen, dann öffnet sich derselbe kleine Dialog wie an der Mappe – mit genau den Fragen
 * der Vorlage, gleicher Vorbelegung, Beschriftung und Reihenfolge –, gekennzeichnet als Probe. Nach dem Bestätigen die
 * Vorschau so, wie die Empfänger es sähen, darunter die Zusammenfassung. Angelegt wird nichts (mit den Rechten des
 * Admins als Person).
 */
function Ausprobieren({ v }: { v: AblaufvorlageAnsicht }) {
  const d = useDaten();
  const typ = d.typen.find((x) => (v.typen.length ? x.id === v.typen[0] : !x.system)) ?? d.typen[0];
  const [mappe, setMappe] = useState('');
  const [bekannt, setBekannt] = useState<Bezuege>({});
  const [schritt, setSchritt] = useState<'wahl' | 'dialog' | 'ergebnis'>('wahl');
  const [runde, setRunde] = useState(0);
  const [ergebnis, setErgebnis] = useState<{ zeilen: string[]; vorschau: AblaufProbe[] } | null>(null);
  const oeffnen = () => { setErgebnis(null); setRunde((r) => r + 1); setSchritt('dialog'); };
  const titel = mappe ? titelOder(bekannt[mappe]?.titel) : '';
  return (
    <div className="blatt">
      <h2 className="h3">{t('automatisierung.vorlage.ui.ausprobieren')}</h2>
      <p className="leise klein">{t('automatisierung.vorlage.ui.ausprobieren.text')}</p>
      {typ && <Feld beschriftung={t('automatisierung.vorlage.ui.mappe')} id="vorlage-mappe">
        {(x) => <MappenWahl id={x.id} ziel={typ} mehrfach={false} wert={mappe || undefined} bekannt={bekannt} ohneAnlegen merke={(id, y) => setBekannt((b) => ({ ...b, [id]: y }))}
          setze={(y) => { setMappe(typeof y === 'string' ? y : ''); setSchritt('wahl'); setErgebnis(null); }} />}
      </Feld>}
      {schritt === 'wahl' && <div className="knoepfe"><Knopf gesperrt={!mappe} onClick={oeffnen}>{t('automatisierung.vorlage.ui.ausprobieren.los')}</Knopf></div>}
      {schritt === 'dialog' && (
        <VorlagenDialog key={runde} mappeId={mappe} vorlage={v} schliessen={() => setSchritt('wahl')}
          probe={{ anwenden: async (x) => { setErgebnis(await api.ablaufvorlageAusprobieren(v.kennung, mappe, x)); setSchritt('ergebnis'); } }} />
      )}
      {schritt === 'ergebnis' && ergebnis && <>
        <ProbeVorschau ergebnis={ergebnis} mappe={titel} />
        <div className="knoepfe">
          <Knopf onClick={oeffnen}>{t('automatisierung.vorlage.ui.ausprobieren.nochmal')}</Knopf>
          <Knopf art="link" onClick={() => { const el = document.getElementById('vorlage-name'); el?.scrollIntoView({ block: 'center' }); el?.focus(); }}>{t('automatisierung.vorlage.ui.ausprobieren.anpassen')}</Knopf>
        </div>
      </>}
    </div>
  );
}

/**
 * Vorschau nach dem Ausprobieren (#1176): je Empfänger, was er sähe – eine Aufgabe (fällig wann) oder eine
 * Benachrichtigung, mit Mappe und Text; darunter als Zusammenfassung die Zeilen von bisher.
 */
function ProbeVorschau({ ergebnis, mappe }: { ergebnis: { zeilen: string[]; vorschau: AblaufProbe[] }; mappe: string }) {
  return (
    <div className="stapel probe-vorschau" role="status">
      <p><strong>{t('automatisierung.vorlage.ui.ausprobieren.ergebnis')}</strong></p>
      {!ergebnis.vorschau.length && <p className="leise">{ergebnis.zeilen[ergebnis.zeilen.length - 1]}</p>}
      <ul className="stapel probe-karten">
        {ergebnis.vorschau.map((x, i) => (
          <li key={i} className="probe-karte">
            <p className="probe-kopf"><Symbol name={x.als === 'aufgabe' ? (x.datum ? 'erinnern' : 'aufgabe') : 'info'} />{' '}
              <strong>{t(x.als === 'aufgabe' ? 'automatisierung.vorlage.ui.vorschau.aufgabe' : 'automatisierung.vorlage.ui.vorschau.benachrichtigung', { name: x.an })}</strong>
              {x.als === 'aufgabe' && <span className="leise"> · {x.datum ? t('automatisierung.vorlage.ui.vorschau.faellig', { datum: datumDe(x.datum) }) : t('automatisierung.vorlage.ui.vorschau.sofort')}</span>}
            </p>
            {mappe && <p className="leise klein">{t('automatisierung.vorlage.ui.vorschau.mappe', { titel: mappe })}</p>}
            <p className="probe-text">{x.text || <span className="leise">{t('automatisierung.vorlage.ui.vorschau.ohne-text')}</span>}</p>
            {x.hinweis && <p className="klein warnung">{x.hinweis}</p>}
          </li>
        ))}
      </ul>
      <details className="probe-zusammenfassung">
        <summary className="klein tippziel">{t('automatisierung.vorlage.ui.vorschau.zusammenfassung')}</summary>
        <ul className="klein">{ergebnis.zeilen.map((z, i) => <li key={i}>{z}</li>)}</ul>
      </details>
    </div>
  );
}

/** „Gerade benutzt bei“: offene Abläufe mit Link zur Mappe; angehaltene mit Grund und „Fortsetzen“. */
function GeradeBenutzt({ v, nachher }: { v: AblaufvorlageAnsicht; nachher: () => void }) {
  const d = useDaten();
  const [liste, setListe] = useState<MappenAblauf[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setListe(await api.ablaufvorlageBenutzt(v.kennung)); } catch (x) { setFehler((x as Error).message); } }, [v.kennung]);
  useEffect(() => { void laden(); }, [laden, v.offen]);
  return (
    <div className="blatt">
      <h2 className="h3">{t('automatisierung.vorlage.ui.benutzt')}</h2>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {!liste ? <p className="leise">{t('automatisierung.ui.lade')}</p> : !liste.length ? <p className="leise">{t('automatisierung.vorlage.ui.benutzt.leer')}</p> : (
        <ul className="mappenliste benutzt-liste">{liste.map((a) => (
          <li key={a.id}>
            <span><Link to={`/ablage/${a.typId}/${a.mappeId}`} className="verweis">{a.mappeTitel || a.mappeId}</Link>{' '}
              <span className="leise klein">{t('automatisierung.vorlage.ui.benutzt.zeile', { datum: datumDe(a.datum), person: d.person(a.erstelltVon ?? '') })}</span>
              {a.angehalten && <> <span className="chip schlecht klein">{t('ablage.aufgaben.angehalten')}</span> <span className="problem">{a.angehalten.text}</span></>}
            </span>
            {a.angehalten && <Knopf groesse="klein" onClick={async () => { await api.ablaufFortsetzen(a.id); await laden(); nachher(); }}>{t('automatisierung.vorlage.ui.fortsetzen')}</Knopf>}
          </li>
        ))}</ul>
      )}
    </div>
  );
}

/** Verlauf der Vorlage: was mit ihren Abläufen geschah – auch, nachdem sie gelaufen sind. */
function Verlauf({ v }: { v: AblaufvorlageAnsicht }) {
  const d = useDaten();
  const [liste, setListe] = useState<AblaufVerlauf[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  useEffect(() => { api.ablaufvorlageVerlauf(v.kennung).then(setListe).catch((x) => setFehler((x as Error).message)); }, [v.kennung, v.offen]);
  const eintraege: Listeneintrag[] = (liste ?? []).map((x) => ({
    id: x.id, wann: zeit(x.zeit), wer: x.personId ? d.person(x.personId) : '–',
    was: <>{x.text}</>, zustand: <span className={`chip ${x.art === 'angehalten' ? 'schlecht' : x.art === 'gelaufen' || x.art === 'angewendet' ? 'gut' : ''}`}>{t.frei(`automatisierung.vorlage.ui.verlauf.${x.art}`)}</span>,
  }));
  return (
    <div className="blatt">
      <h2 className="h3">{t('automatisierung.ui.verlauf')}</h2>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {!liste ? <p className="leise">{t('automatisierung.ui.lade')}</p> : !liste.length ? <p className="leise">{t('automatisierung.vorlage.ui.verlauf.leer')}</p> : <Eintragsliste eintraege={eintraege} />}
    </div>
  );
}
