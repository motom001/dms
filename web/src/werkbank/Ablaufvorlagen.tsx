import { useCallback, useEffect, useState } from 'react';
import {
  empfaengerText, FRAGEN, istKernVorlage, karteText, VORLAGEN_GRENZEN, VORLAGEN_PLATZHALTER, VORLAGEN_REIHENFOLGE, vorlagenProbleme, wannText,
  type AblaufVerlauf, type AblaufvorlageAnsicht, type AblaufvorlageDaten, type AblaufWann, type Frage, type MappenAblauf, type VorlagenEmpfaenger, type VorlagenKarte,
} from '../../../shared/src/ablaufvorlagen';
import { einzigesZiel, jedeMappe, zieleVon, type Mappentyp } from '../../../shared/src/model';
import type { Zeitraumeinheit } from '../../../shared/src/feldarten';
import { datumDe } from '../../../shared/src/fristen';
import { gebietsschema } from '../../../shared/src/sprache';
import { api, type Bezuege } from '../api';
import { BenutzerWahl } from '../ablage/Aufgaben';
import { MappenWahl } from '../ablage/MappeFormular';
import { useDaten } from '../daten';
import { Listenkopf } from '../Listenkopf';
import { geheZu, Link, loeseWache } from '../ort';
import { t } from '../sprache';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { Eintragsliste, Fassungen, Feld, FeldGruppe, GeloeschteEintraege, HakenFeld, Knopf, KnopfLink, PaketChip, Schalter, Umschalter, ZeitraumEingabe, type Klappe, type Listeneintrag, type ZeitraumRoh } from '../bausteine';
import type { InstalliertesPaket } from '../../../shared/src/pakete';
import { paketHerkunft } from './listensuche';

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

function WannEditor({ wann, setze }: { wann: AblaufWann; setze: (w: AblaufWann) => void }) {
  const roh: ZeitraumRoh = wann.art === 'in' ? { anzahl: String(wann.anzahl), einheit: wann.einheit } : { anzahl: '6', einheit: 'monate' };
  const ausRoh = (r: ZeitraumRoh): AblaufWann => {
    const n = Math.max(1, Math.trunc(Number(r.anzahl)) || 1);
    const e = r.einheit as Zeitraumeinheit;
    return e === 'jahre' ? { art: 'in', anzahl: Math.min(VORLAGEN_GRENZEN.anzahl, n * 12), einheit: 'monate' } : { art: 'in', anzahl: Math.min(VORLAGEN_GRENZEN.anzahl, n), einheit: e };
  };
  return (
    <FeldGruppe beschriftung={t('automatisierung.vorlage.ui.wann')}>
      <Umschalter beschriftung={t('automatisierung.vorlage.ui.wann')} wert={wann.art} setze={(art) => setze(art === 'in' ? ausRoh(roh) : { art })}
        wahlen={[{ wert: 'sofort', text: wannText({ art: 'sofort' }) }, { wert: 'datum', text: wannText({ art: 'datum' }) }, { wert: 'in', text: t('automatisierung.vorlage.ui.wann.in') }]} />
      {wann.art === 'in' && <ZeitraumEingabe aria-label={t('automatisierung.vorlage.ui.wann.in')} wert={roh} setze={(r) => setze(ausRoh(r))} />}
    </FeldGruppe>
  );
}

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
  // Fragen folgen dem Inhalt: „Datum“ genau bei „am gewählten Datum“.
  const fragen = (x: Entwurf): Frage[] => FRAGEN.filter((f) => (f === 'datum' ? x.wann.art === 'datum' : x.fragen.includes(f)));
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
          <Feld beschriftung={t('automatisierung.vorlage.ui.name')}><input value={e.name} maxLength={VORLAGEN_GRENZEN.name} onChange={(x) => setE({ ...e, name: x.target.value })} /></Feld>
          <Feld beschriftung={t('automatisierung.vorlage.ui.reihenfolge')} hinweis={t('automatisierung.vorlage.ui.reihenfolge.text')}>
            <input type="number" min={VORLAGEN_REIHENFOLGE.min} max={VORLAGEN_REIHENFOLGE.max} value={e.reihenfolge} onChange={(x) => setE({ ...e, reihenfolge: Number(x.target.value) })} />
          </Feld>
        </div>
        <Feld beschriftung={t('automatisierung.vorlage.ui.beschreibung-feld')} optional><textarea rows={2} maxLength={VORLAGEN_GRENZEN.beschreibung} value={e.beschreibung} onChange={(x) => setE({ ...e, beschreibung: x.target.value })} /></Feld>
        <FeldGruppe beschriftung={t('automatisierung.vorlage.ui.typen')} hinweis={t('automatisierung.vorlage.ui.typen.text')}>
          {typen.map((ty) => (
            <HakenFeld key={ty.id} beschriftung={ty.name}><input type="checkbox" checked={e.typen.includes(ty.id)} onChange={(x) => setE({ ...e, typen: x.target.checked ? [...e.typen, ty.id] : e.typen.filter((y) => y !== ty.id) })} /></HakenFeld>
          ))}
        </FeldGruppe>
        <WannEditor wann={e.wann} setze={(wann) => setE({ ...e, wann })} />
        <FeldGruppe beschriftung={t('automatisierung.vorlage.ui.fragen')} hinweis={t('automatisierung.vorlage.ui.fragen.text')}>
          <HakenFeld beschriftung={t('automatisierung.vorlage.ui.frage.empfaenger')}><input type="checkbox" checked={e.fragen.includes('empfaenger')} onChange={(x) => frage('empfaenger', x.target.checked)} /></HakenFeld>
          <HakenFeld beschriftung={t('automatisierung.vorlage.ui.frage.datum')} hinweis={t('automatisierung.vorlage.ui.frage.datum.text')}><input type="checkbox" checked={e.wann.art === 'datum'} disabled onChange={() => undefined} /></HakenFeld>
          <HakenFeld beschriftung={t('automatisierung.vorlage.ui.frage.text')}><input type="checkbox" checked={e.fragen.includes('text')} onChange={(x) => frage('text', x.target.checked)} /></HakenFeld>
        </FeldGruppe>
        <h3 className="h4">{t('automatisierung.vorlage.ui.karten')}</h3>
        <p className="leise klein">{t('automatisierung.vorlage.ui.karten.text')}</p>
        {e.karten.map((k) => (
          <KartenEditor key={k.id} karte={k} typen={d.typen} gewaehlt={e.typen} setze={(n) => setE({ ...e, karten: e.karten.map((x) => (x.id === k.id ? n : x)) })}
            entfernen={e.karten.length > 1 ? () => setE({ ...e, karten: e.karten.filter((x) => x.id !== k.id) }) : undefined} />
        ))}
        {e.karten.length < VORLAGEN_GRENZEN.karten && <Knopf groesse="klein" onClick={() => setE({ ...e, karten: [...e.karten, { id: `k${Date.now().toString(36)}`, art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'selbst' }], text: '' }] })}>{t('automatisierung.vorlage.ui.karte-neu')}</Knopf>}
        <p className="leise klein">{t('automatisierung.vorlage.ui.kurz', { wann: wannText(e.wann) })}</p>
        {probleme.length > 0 && <ul className="fehlertext klein">{probleme.map((p) => <li key={p}>{p}</li>)}</ul>}
        <Speicherleiste ent={ent} gegenstand={t('automatisierung.vorlage.ui.gegenstand')} sendet={sendet} ungueltig={probleme.length > 0} meldung={meldung}
          loeschen={v && v.herkunft === 'eigen' ? {
            text: t('automatisierung.vorlage.ui.loeschen.knopf'),
            rueckfrage: { titel: t('automatisierung.vorlage.ui.loeschen.frage', { name: v.name }), text: t('automatisierung.vorlage.ui.loeschen.text'), ja: t('automatisierung.ui.loeschen') },
            onClick: () => aktion(async () => { await api.ablaufvorlageLoeschen(v.kennung); loeseWache(); geheZu('/werkbank/ablaufvorlagen', true); }, t('automatisierung.vorlage.ui.geloescht')),
          } : undefined} />
      </form>
      {v && <>
        <Ausprobieren v={v} />
        <GeradeBenutzt v={v} nachher={() => void z.laden()} />
        <Verlauf v={v} />
        <Fassungen art="ablaufvorlage" eintrag={v.kennung} stand={v.version} nachher={() => z.laden()} klappe={FEST} />
      </>}
    </div>
  );
}

/** Ausprobieren (trocken) an einer Mappe: zeigt, was passieren würde – mit den Rechten des Admins als Person. */
function Ausprobieren({ v }: { v: AblaufvorlageAnsicht }) {
  const d = useDaten();
  const typ = d.typen.find((x) => (v.typen.length ? x.id === v.typen[0] : !x.system)) ?? d.typen[0];
  const [mappe, setMappe] = useState('');
  const [bekannt, setBekannt] = useState<Bezuege>({});
  const [an, setAn] = useState('');
  const [text, setText] = useState('');
  const [datum, setDatum] = useState('');
  const [zeilen, setZeilen] = useState<string[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  return (
    <div className="blatt">
      <h2 className="h3">{t('automatisierung.vorlage.ui.ausprobieren')}</h2>
      <p className="leise klein">{t('automatisierung.vorlage.ui.ausprobieren.text')}</p>
      {typ && <Feld beschriftung={t('automatisierung.vorlage.ui.mappe')} id="vorlage-mappe">
        {(x) => <MappenWahl id={x.id} ziel={typ} mehrfach={false} wert={mappe || undefined} bekannt={bekannt} ohneAnlegen merke={(id, y) => setBekannt((b) => ({ ...b, [id]: y }))} setze={(y) => setMappe(typeof y === 'string' ? y : '')} />}
      </Feld>}
      <div className="raster">
        {v.fragen.includes('empfaenger') && <BenutzerWahl label={t('automatisierung.vorlage.ui.frage.empfaenger')} sichtbar wert={an} setze={setAn} />}
        {v.fragen.includes('datum') && <Feld beschriftung={t('automatisierung.vorlage.ui.frage.datum')}><input type="date" value={datum} onChange={(x) => setDatum(x.target.value)} /></Feld>}
        {v.fragen.includes('text') && <Feld beschriftung={t('automatisierung.vorlage.ui.frage.text')}><input value={text} onChange={(x) => setText(x.target.value)} /></Feld>}
      </div>
      <Knopf groesse="klein" gesperrt={!mappe} onClick={async () => {
        setFehler(undefined);
        try { setZeilen((await api.ablaufvorlageAusprobieren(v.kennung, mappe, { empfaengerId: an || undefined, datum: datum || undefined, text })).zeilen); } catch (x) { setFehler((x as Error).message); setZeilen(null); }
      }}>{t('automatisierung.vorlage.ui.ausprobieren.los')}</Knopf>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {zeilen && <ul className="klein">{zeilen.map((z, i) => <li key={i}>{z}</li>)}</ul>}
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
        <ul className="mappenliste">{liste.map((a) => (
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
