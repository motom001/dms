import { type FormEvent, useCallback, useEffect, useState } from 'react';
import type { Auftrag } from '../../../shared/src/auftrag';
import { speichereDatei } from '../api/anfrage';
import { betriebApi } from '../api/betrieb';
import { werkbankApi, type NummernkreisAnsicht } from '../api/werkbank';
import { useDaten } from '../daten';
import { geheZu, Link, loeseWache } from '../ort';
import { Speicherleiste, useEntwurf, useGespeichertNachziehen } from '../Speicherleiste';
import { Hilfe } from '../Hilfe';
import { Listenkopf } from '../Listenkopf';
import { NEUBEGINN_TEXT, pruefeMuster, formatiereNummer, datumIn, kreisVon, neubeginn as neubeginnVon } from '../../../shared/src/nummernkreis';
import { rueckfrage } from '../rueckfrage';
import { fortschrittText } from '../../../shared/src/auftrag';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { GeloeschteEintraege, abfangen, Bereich, Fassungen, Feld, Fundstellen, Hervorgehoben, KeineTreffer, Knopf, KnopfLink, ListenSuche, PaketChip, PaketFilter, useBereiche, useListenSuche, type BereicheZustand, type BereichListe } from '../bausteine';
import { paketHerkunft, paketVonKreis, paketWahl, quellenKreis } from './listensuche';
import type { InstalliertesPaket } from '../../../shared/src/pakete';

/**
 * Werkbank → Nummernkreise (#171): fortlaufende Nummern für Textfelder.
 * Ein Feld nutzt einen Kreis über den Standardwert {nummernkreis:<schlüssel>}.
 */

const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });

export function useNummernkreise(offen: boolean) {
  const [liste, setListe] = useState<NummernkreisAnsicht[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setListe(await werkbankApi.nummernkreise()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  return { liste, fehler, laden, setListe };
}
export type NummernkreisZustand = ReturnType<typeof useNummernkreise>;

/** Nummernkreise in der Mitte, mit Suche und Paketfilter (#978). */
export function NummernkreiseListe({ z, offen, pakete = [] }: { z: NummernkreisZustand; offen?: string; pakete?: InstalliertesPaket[] }) {
  const d = useDaten();
  const liste = z.liste ?? [];
  const such = useListenSuche(liste, {
    quellen: (k) => quellenKreis(k, { pakete, typen: d.typen }),
    herkunft: (k) => paketVonKreis(k, d.typen, pakete),
  });
  return (
    <>
      <Listenkopf titel={t('werkbank.nummernkreise.nummernkreise')} hilfe="werkbank.nummernkreise" beschreibung={t('werkbank.nummernkreise.fortlaufende-nummern-fuer-felder')}>
        <KnopfLink to="/werkbank/nummernkreise/neu" art="anlegen" groesse="klein">{t('werkbank.nummernkreise.neu')}</KnopfLink>
      </Listenkopf>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {liste.length > 0 && (
        <ListenSuche wert={such.eingabe} setze={such.setEingabe} beschriftung={t('werkbank.listensuche.kreise.beschriftung')} platzhalter={t('werkbank.listensuche.kreise.platzhalter')} anker="werkbank.nummernkreise.suche"
          treffer={such.treffer.length} aktiv={such.aktiv} anzahl={t('werkbank.listensuche.kreise.anzahl', { anzahl: liste.length })}
          filter={<PaketFilter wert={such.paket} setze={such.setPaket} pakete={paketWahl(such.paketeDa, pakete)} eigene={such.eigeneDa} />} />
      )}
      {!z.liste ? <p className="leise">{t('werkbank.nummernkreise.lade')}</p> : !z.liste.length ? <p className="leise leerliste">{t('werkbank.nummernkreise.noch-kein-nummernkreis')}</p>
        : !such.treffer.length ? <KeineTreffer zuruecksetzen={such.zuruecksetzen} /> : (
        <ul className="mappenliste">
          {such.treffer.map(({ eintrag: k, funde, titel }) => (
            <li key={k.schluessel}><Link to={`/werkbank/nummernkreise/${k.schluessel}`} className={`eintrag werk ${offen === k.schluessel ? 'an' : ''}`}>
              <span className="titel"><Hervorgehoben teile={titel} text={k.name} /><PaketChip paket={paketHerkunft(paketVonKreis(k, d.typen, pakete), pakete)} inLink /></span>
              <span className="unter mono">{t('werkbank.nummernkreise.naechste', { naechste: k.naechste })}</span>
              {!k.verwendet.length && <span className="leise klein">{t('werkbank.nummernkreise.unbenutzt')}</span>}
              <Fundstellen funde={funde} />
            </Link></li>
          ))}
        </ul>
      )}
      <GeloeschteEintraege art="nummernkreis" />
    </>
  );
}

/** Bereiche eines Nummernkreises (#1000): neu nur Grunddaten, Aufkleber nur bei der Archivnummer (#345). */
function nummernkreisBereiche(k: NummernkreisAnsicht | undefined): BereichListe<NkBereich> {
  if (!k) return [['grunddaten', t('werkbank.nummernkreise.bereich.grunddaten')]];
  return [
    ['grunddaten', t('werkbank.nummernkreise.bereich.grunddaten')], ['stand', t('werkbank.nummernkreise.stand')],
    ...(k.schluessel === 'archivnummer' ? [['aufkleber', t('werkbank.nummernkreise.aufkleber-drucken')] as const] : []),
    ['verwendet', t('werkbank.nummernkreise.verwendet-in')], ['fassungen', t('oberflaeche.fassungen.titel')],
  ];
}
type NkBereich = 'grunddaten' | 'stand' | 'aufkleber' | 'verwendet' | 'fassungen';

export function NummernkreisEditor({ z, schluessel }: { z: NummernkreisZustand; schluessel: string }) {
  const neu = schluessel === 'neu';
  const k = neu ? undefined : z.liste?.find((x) => x.schluessel === schluessel);
  const gespeichert = { schluessel: k?.schluessel ?? '', name: k?.name ?? '', muster: k?.muster ?? '{jjjj}{mm}-R{zaehler:7}', start: String(k?.start ?? 1) };
  const [e, setE] = useState(gespeichert);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const [speicherFehler, setSpeicherFehler] = useState(false);
  const ent = useEntwurf(gespeichert, e, { neu, liste: '/werkbank/nummernkreise', zuruecksetzen: () => { setE(gespeichert); setMeldung(undefined); setSpeicherFehler(false); } });
  // Sprungleiste und Bereiche (#1000) wie beim Mappentyp; gemerkt je Nummernkreis.
  const b = useBereiche(nummernkreisBereiche(k), 'nummernkreis', neu ? null : schluessel);
  // Nach dem Wiederherstellen einer Fassung (#1006): den neuen Stand übernehmen, solange hier nichts geändert ist.
  useGespeichertNachziehen(gespeichert, e, setE);
  if (!neu && !k) return z.liste ? <div className="leer"><p>{t('werkbank.nummernkreise.diesen-nummernkreis-gibt-es')}</p></div> : <p className="leise">{t('werkbank.nummernkreise.lade')}</p>;
  const musterFehler = pruefeMuster(e.muster);
  const heute = datumIn(new Date());
  const beispiel = musterFehler ? null : formatiereNummer(e.muster, Number(e.start) || 0, heute);
  const neubeginn = neubeginnVon(e.muster);
  // Gespeichert wird nur, was in den Grunddaten steht – ein Fehler beim Speichern gehört also dorthin.
  const hatFehler = (x: NkBereich) => x === 'grunddaten' && (!!musterFehler || speicherFehler);
  async function tu(f: () => Promise<string>) {
    setMeldung(undefined);
    try { setMeldung({ art: 'gut', text: await f() }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  const speichern = async () => {
    setSendet(true); setMeldung(undefined); setSpeicherFehler(false);
    try {
      const daten = { name: e.name, muster: e.muster, start: Number(e.start) };
      z.setListe(neu ? await werkbankApi.nummernkreisAnlegen({ ...daten, schluessel: e.schluessel }) : await werkbankApi.nummernkreisAendern(k!.schluessel, daten));
      // Nach dem Anlegen aufgeklappt bleiben wie gerade (wie beim Mappentyp).
      if (neu) { b.merke(e.schluessel); loeseWache(); geheZu(`/werkbank/nummernkreise/${e.schluessel}`, true); }
      setMeldung({ art: 'gut', text: neu ? t('werkbank.nummernkreise.angelegt') : t('werkbank.nummernkreise.gespeichert-das-muster-gilt') });
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
      setSpeicherFehler(true); b.oeffne(['grunddaten']);
    } finally { setSendet(false); }
  };
  const schluesselAusName = (name: string) => name.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'n$1').slice(0, 40);
  return (
    <div className="editorform">
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.nummernkreise.nummernkreis-2')}</p>
        <h1>{neu ? t('werkbank.nummernkreise.neuer-nummernkreis') : k!.name}</h1>
        {!neu && <p className="leise">{tn('werkbank.nummernkreise.im-standardwert-eines-textfelds', { code: <code className="mono">{t('werkbank.nummernkreise.nummernkreis', { schluessel: k!.schluessel })}</code> })}</p>}
      </div>
      {b.leiste(hatFehler, t('werkbank.nummernkreise.bereiche'))}
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      <form id="nk-formular" className="editorform" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <Bereich id="grunddaten" titel={t('werkbank.nummernkreise.bereich.grunddaten')} klappe={b.klappe('grunddaten', hatFehler('grunddaten'))}
          kurz={<>{e.name} · <code className="mono">{e.muster}</code></>}>
          <div className="raster">
            <Feld beschriftung={t('werkbank.nummernkreise.name')}><input id="nk-name" value={e.name} onChange={(x) => setE({ ...e, name: x.target.value, ...(neu && (!e.schluessel || e.schluessel === schluesselAusName(e.name)) ? { schluessel: schluesselAusName(x.target.value) } : {}) })} required /></Feld>
            <Feld beschriftung={t('werkbank.nummernkreise.kennung')} hinweis={neu ? t('werkbank.nummernkreise.nach-dem-anlegen-fest') : t('werkbank.nummernkreise.fest')}><input id="nk-schluessel" className="mono" value={e.schluessel} readOnly={!neu} onChange={(x) => setE({ ...e, schluessel: x.target.value })} required /></Feld>
            <Feld beschriftung={t('werkbank.nummernkreise.muster')} className="breit" hinweis={t('werkbank.nummernkreise.muster.erklaerung')}>
              <input id="nk-muster" className="mono" value={e.muster} onChange={(x) => setE({ ...e, muster: x.target.value })} required /></Feld>
            <Feld beschriftung={t('werkbank.nummernkreise.startwert')}><input id="nk-start" type="number" min={0} value={e.start} onChange={(x) => setE({ ...e, start: x.target.value })} /></Feld>
          </div>
          {musterFehler ? <p className="fehlertext">{musterFehler}</p> : <p className="klein">{tn('werkbank.nummernkreise.beispiel-heute-zaehler-beginnt', { code: <code className="mono">{beispiel}</code>, b: <strong>{NEUBEGINN_TEXT[neubeginn]}</strong> })}</p>}
        </Bereich>
      </form>
      {k && <NummernkreisStand k={k} z={z} b={b} tu={tu} />}
      {k && <Fassungen art="nummernkreis" eintrag={k.schluessel} stand={JSON.stringify(gespeichert)} nachher={() => z.laden()} klappe={b.klappe('fassungen')} />}
      <Speicherleiste ent={ent} gegenstand={t('werkbank.nummernkreise.nummernkreis-2')} sendet={sendet} ungueltig={!!musterFehler} formular="nk-formular"
        loeschen={!neu ? {
          text: t('werkbank.nummernkreise.nummernkreis-loeschen-2'),
          rueckfrage: { titel: t('werkbank.nummernkreise.nummernkreis-loeschen', { name: k!.name }), ja: t('werkbank.nummernkreise.loeschen') },
          // Gesperrt aus einem Grund (#1210): welche Felder den Kreis noch verwenden – als Links in der Erklärung.
          gesperrt: k!.verwendet.length > 0 && {
            grund: t('werkbank.nummernkreise.loeschen-gesperrt'),
            eintraege: k!.verwendet.map((v) => <><Link to={`/werkbank/typen/${v.typId}`} className="verweis">{v.typ}</Link> · {v.feld}</>),
          },
          onClick: () => tu(async () => { z.setListe(await werkbankApi.nummernkreisLoeschen(k!.schluessel)); loeseWache(); geheZu('/werkbank/nummernkreise', true); return t('werkbank.nummernkreise.geloescht'); }),
        } : undefined} />
    </div>
  );
}

/** Stand, Aufkleber und Verwendung eines gespeicherten Nummernkreises (#1000): Sofortaktionen, nicht Teil des Speicherns. */
function NummernkreisStand({ k, z, b, tu }: { k: NummernkreisAnsicht; z: NummernkreisZustand; b: BereicheZustand<NkBereich>; tu: (f: () => Promise<string>) => Promise<void> }) {
  const [zaehler, setZaehler] = useState('');
  return (
    <>
      <Bereich id="stand" titel={t('werkbank.nummernkreise.stand')} klappe={b.klappe('stand')} kurz={<>{t('werkbank.nummernkreise.naechste', { naechste: k.naechste })}</>}>
        <p>{tn('werkbank.nummernkreise.naechste-nummer', { code: <code className="mono">{k.naechste}</code>, span: <span className="leise klein">{t('werkbank.nummernkreise.zeitraum-zaehler', { wert: k.zeitraum === 'immer' ? t('werkbank.nummernkreise.ohne-neubeginn') : k.zeitraum, naechsterZaehler: k.naechsterZaehler })}</span> })}</p>
        {k.zuletzt.length > 0 && <>
          <p className="leise klein">{t('werkbank.nummernkreise.zuletzt-vergeben')}</p>
          <ul className="stapel klein">{k.zuletzt.map((x) => <li key={`${x.nummer}-${x.am}`}><code className="mono">{x.nummer}</code> · {zeit(x.am)}{x.mappeId && <> · <Link to={`/ablage/mappe/${x.mappeId}`} className="verweis">{t('werkbank.nummernkreise.mappe')}</Link></>}</li>)}</ul>
        </>}
        <form className="zeile" onSubmit={abfangen(async (x: FormEvent) => { x.preventDefault(); if (await rueckfrage({ titel: t('werkbank.nummernkreise.zaehlerstand-setzen'), text: t('werkbank.nummernkreise.die-naechste-nummer-bekommt', { zaehler }), ja: t('werkbank.nummernkreise.zaehlerstand-setzen-2') })) void tu(async () => { z.setListe(await werkbankApi.nummernkreisZaehler(k.schluessel, Number(zaehler))); setZaehler(''); return t('werkbank.nummernkreise.zaehlerstand-gesetzt'); }); })}>
          <Feld beschriftung={t('werkbank.nummernkreise.zaehlerstand-setzen-2')} hinweis={t('werkbank.nummernkreise.zaehler-der-naechsten-nummer')}>
            <input id="nk-zaehler" type="number" min={0} value={zaehler} onChange={(x) => setZaehler(x.target.value)} /></Feld>
          <Knopf type="submit" gesperrt={zaehler === ''}>{t('werkbank.nummernkreise.setzen')}</Knopf>
        </form>
      </Bereich>
      {k.schluessel === 'archivnummer' && (
        <Bereich id="aufkleber" titel={t('werkbank.nummernkreise.aufkleber-drucken')} hilfe={<Hilfe ort="werkbank.aufkleber" />} klappe={b.klappe('aufkleber')}>
          <Aufkleber naechste={k.naechste} neuLaden={z.laden} />
        </Bereich>
      )}
      <Bereich id="verwendet" titel={t('werkbank.nummernkreise.verwendet-in')} klappe={b.klappe('verwendet')}
        kurz={k.verwendet.length ? t('werkbank.nummernkreise.verwendet-kurz', { anzahl: k.verwendet.length }) : t('werkbank.nummernkreise.unbenutzt')}>
        {k.verwendet.length ? <ul className="stapel">{k.verwendet.map((v) => <li key={`${v.typId}-${v.feldKey}`}><Link to={`/werkbank/typen/${v.typId}`} className="verweis">{v.typ}</Link> · {v.feld}</li>)}</ul>
          : <p className="leise">{tn('werkbank.nummernkreise.noch-in-keinem-feld', { code: <code className="mono">{t('werkbank.nummernkreise.nummernkreis', { schluessel: k.schluessel })}</code> })}</p>}
      </Bereich>
    </>
  );
}

/** Wartungsoperation (#171): Mappen ohne Nummer nachträglich nummerieren. */
export function NummernNachtragen() {
  const d = useDaten();
  const felder = d.typen.flatMap((mappentyp) => mappentyp.felder.filter((f) => kreisVon(f)).map((f) => ({ wert: `${mappentyp.id}|${f.key}`, text: `${mappentyp.name} · ${f.label}` })));
  const [wahl, setWahl] = useState('');
  const [vorschau, setVorschau] = useState<{ anzahl: number; von: string | null; bis: string | null } | null>(null);
  const [auftrag, setAuftrag] = useState<Auftrag | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [typId, feldKey] = wahl.split('|');
  useEffect(() => {
    setVorschau(null); setFehler(undefined);
    if (wahl) betriebApi.nummernVorschau(typId, feldKey).then(setVorschau).catch((e) => setFehler((e as Error).message));
  }, [wahl, typId, feldKey]);
  useEffect(() => {
    if (auftrag?.status !== 'laeuft') return;
    const timer = setInterval(() => void betriebApi.auftrag().then((a) => {
      setAuftrag(a);
      if (a?.status !== 'laeuft' && wahl) void betriebApi.nummernVorschau(typId, feldKey).then(setVorschau);
    }), 1000);
    return () => clearInterval(timer);
  }, [auftrag?.status, wahl, typId, feldKey]);
  const ergebnis = auftrag?.status === 'fertig' && auftrag.art === 'nummern' ? auftrag.ergebnis as { vergeben: number; erste: string | null; letzte: string | null } : null;
  return (
    <section className="blatt" id="nummern">
      <h2 className="h3">{t('werkbank.nummernkreise.nummern-nachtraeglich-vergeben')} <Hilfe ort="werkbank.nummernkreise.nachtragen" /></h2>
      <p className="leise">{t('werkbank.nummernkreise.mappen-die-angelegt-wurden')}</p>
      {!felder.length ? <p className="leise">{t('werkbank.nummernkreise.kein-feld-nutzt-einen')}</p> : <>
        <Feld beschriftung={t('werkbank.nummernkreise.feld')}>
          <select id="nummern-feld" value={wahl} onChange={(e) => setWahl(e.target.value)}>
            <option value="">{t('werkbank.nummernkreise.waehlen')}</option>{felder.map((f) => <option key={f.wert} value={f.wert}>{f.text}</option>)}
          </select></Feld>
        {vorschau && (vorschau.anzahl ? <p>{tn('werkbank.nummernkreise.mappen-bekommen-die-nummern', { anzahl: vorschau.anzahl, code: <code className="mono">{vorschau.von}</code> })}{vorschau.anzahl > 1 && <> {' '}{tn('werkbank.nummernkreise.bis', { code: <code className="mono">{vorschau.bis}</code> })}</>}.</p>
          : <p className="leise">{t('werkbank.nummernkreise.alle-mappen-haben-schon')}</p>)}
        {auftrag?.status === 'laeuft' && <p className="leise" role="status">{fortschrittText(auftrag, t('werkbank.nummernkreise.mappen'))}</p>}
        {ergebnis && <p className="gutertext" role="status">{t('werkbank.nummernkreise.nummern-vergeben', { vergeben: ergebnis.vergeben, wert: ergebnis.erste ? t('werkbank.nummernkreise.bis-2', { erste: ergebnis.erste, letzte: String(ergebnis.letzte) }) : '' })}</p>}
        {(fehler || auftrag?.status === 'fehler') && <p className="fehlertext">{fehler ?? auftrag?.fehler}</p>}
        <div className="knoepfe"><Knopf art="haupt" gesperrt={!vorschau?.anzahl} laeuft={auftrag?.status === 'laeuft'}
          onClick={() => betriebApi.nummernNachtragen(typId, feldKey).then(setAuftrag).catch((e) => setFehler((e as Error).message))}>{t('werkbank.nummernkreise.nummern-vergeben-2')}</Knopf></div>
      </>}
    </section>
  );
}

/** Archivnummern (#345): Aufkleberbogen als PDF – die Nummern gelten danach als vergeben. */
const ETIKETTEN: Record<string, { name: string; felder: number }> = {
  '48x25': { name: t('werkbank.nummernkreise.48-5-25-4'), felder: 40 },
  '38x21': { name: t('werkbank.nummernkreise.38-1-21-2'), felder: 65 },
  '70x37': { name: t('werkbank.nummernkreise.70-37-mm-24'), felder: 24 },
};
function Aufkleber({ naechste, neuLaden }: { naechste: string; neuLaden(): Promise<void> }) {
  const [anzahl, setAnzahl] = useState('40');
  const [etikett, setEtikett] = useState('48x25');
  const [start, setStart] = useState('1');
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const felder = ETIKETTEN[etikett].felder;
  async function los() {
    setLaeuft(true); setMeldung(undefined);
    try {
      const r = await speichereDatei('/api/werkbank/archivnummern/aufkleber', { anzahl: Number(anzahl), etikett, start: Number(start) }, 'Archivnummern.pdf');
      setMeldung({ art: 'gut', text: t('werkbank.nummernkreise.gespeichert-diese-nummern-gelten', { name: r.name }) });
      await neuLaden();
    } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); } finally { setLaeuft(false); }
  }
  return (
    <>
      <p className="leise">{tn('werkbank.nummernkreise.ein-pdf-mit-aufklebern', { code: <code className="mono">{naechste}</code> })}</p>
      <form className="raster" onSubmit={(e) => { e.preventDefault(); void los(); }}>
        <Feld beschriftung={t('werkbank.nummernkreise.anzahl')}><input type="number" min={1} max={500} value={anzahl} onChange={(e) => setAnzahl(e.target.value)} /></Feld>
        <Feld beschriftung={t('werkbank.nummernkreise.etikettenformat-a4')} className="breit">
          <select value={etikett} onChange={(e) => { setEtikett(e.target.value); setStart('1'); }}>{Object.entries(ETIKETTEN).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></Feld>
        <Feld beschriftung={t('werkbank.nummernkreise.beginnen-bei-feld')} hinweis={t('werkbank.nummernkreise.1-oben-links-zeilenweise')}><input type="number" min={1} max={felder} value={start} onChange={(e) => setStart(e.target.value)} /></Feld>
        <div className="knoepfe"><Knopf art="haupt" type="submit" laeuft={laeuft} laeuftText={t('werkbank.nummernkreise.erzeuge')} gesperrt={!(Number(anzahl) >= 1 && Number(anzahl) <= 500) || !(Number(start) >= 1 && Number(start) <= felder)}>{t('werkbank.nummernkreise.aufkleber-als-pdf')}</Knopf></div>
      </form>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
    </>
  );
}
