import { useCallback, useEffect, useState } from 'react';
import { api, speichereDatei, type Auftrag, type NummernkreisAnsicht } from '../api';
import { useDaten } from '../daten';
import { geheZu, Link, loeseWache } from '../ort';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { Hilfe } from '../Hilfe';
import { NEUBEGINN_TEXT, pruefeMuster, formatiereNummer, datumIn, kreisVon, neubeginn as neubeginnVon } from '../../../shared/src/nummernkreis';
import { rueckfrage } from '../rueckfrage';
import { fortschrittText } from '../../../shared/src/auftrag';

/**
 * Werkbank → Nummernkreise (#171): fortlaufende Nummern für Textfelder.
 * Ein Feld nutzt einen Kreis über den Standardwert {nummernkreis:<schlüssel>}.
 */

const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

export function useNummernkreise(offen: boolean) {
  const [liste, setListe] = useState<NummernkreisAnsicht[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setListe(await api.nummernkreise()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  return { liste, fehler, laden, setListe };
}
export type NummernkreisZustand = ReturnType<typeof useNummernkreise>;

export function NummernkreiseListe({ z, offen }: { z: NummernkreisZustand; offen?: string }) {
  return (
    <>
      <div className="listenkopf"><div><h1>Nummernkreise</h1><p className="leise klein">Fortlaufende Nummern für Felder. <Hilfe ort="werkbank.nummernkreise" /></p></div>
        <Link to="/werkbank/nummernkreise/neu" className="knopf gruen klein">+ Neu</Link></div>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {!z.liste ? <p className="leise">Lade …</p> : !z.liste.length ? <p className="leise leerliste">Noch kein Nummernkreis.</p> : (
        <ul className="mappenliste">
          {z.liste.map((k) => (
            <li key={k.schluessel}><Link to={`/werkbank/nummernkreise/${k.schluessel}`} className={`eintrag werk ${offen === k.schluessel ? 'an' : ''}`}>
              <span className="titel">{k.name}</span>
              <span className="unter mono">nächste: {k.naechste}</span>
              {!k.verwendet.length && <span className="leise klein">unbenutzt</span>}
            </Link></li>
          ))}
        </ul>
      )}
    </>
  );
}

export function NummernkreisEditor({ z, schluessel }: { z: NummernkreisZustand; schluessel: string }) {
  const neu = schluessel === 'neu';
  const k = neu ? undefined : z.liste?.find((x) => x.schluessel === schluessel);
  const gespeichert = { schluessel: k?.schluessel ?? '', name: k?.name ?? '', muster: k?.muster ?? '{jjjj}{mm}-R{zaehler:7}', start: String(k?.start ?? 1) };
  const [e, setE] = useState(gespeichert);
  const [zaehler, setZaehler] = useState('');
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const ent = useEntwurf(gespeichert, e, { neu, liste: '/werkbank/nummernkreise', zuruecksetzen: () => { setE(gespeichert); setMeldung(undefined); } });
  if (!neu && !k) return z.liste ? <div className="leer"><p>Diesen Nummernkreis gibt es nicht (mehr).</p></div> : <p className="leise">Lade …</p>;
  const musterFehler = pruefeMuster(e.muster);
  const heute = datumIn(new Date());
  const beispiel = musterFehler ? null : formatiereNummer(e.muster, Number(e.start) || 0, heute);
  const neubeginn = neubeginnVon(e.muster);
  async function tu(f: () => Promise<string>) {
    setMeldung(undefined);
    try { setMeldung({ art: 'gut', text: await f() }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  const speichern = async () => { setSendet(true); try { await tu(async () => {
    const daten = { name: e.name, muster: e.muster, start: Number(e.start) };
    z.setListe(neu ? await api.nummernkreisAnlegen({ ...daten, schluessel: e.schluessel }) : await api.nummernkreisAendern(k!.schluessel, daten));
    if (neu) { loeseWache(); geheZu(`/werkbank/nummernkreise/${e.schluessel}`, true); }
    return neu ? 'Angelegt.' : 'Gespeichert. Das Muster gilt für neue Nummern.';
  }); } finally { setSendet(false); } };
  const schluesselAusName = (name: string) => name.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'n$1').slice(0, 40);
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank · Nummernkreis</p>
        <h1>{neu ? 'Neuer Nummernkreis' : k!.name}</h1>
        {!neu && <p className="leise">Im Standardwert eines Textfelds: <code className="mono">{`{nummernkreis:${k!.schluessel}}`}</code></p>}
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <div className="raster">
          <label className="eigenschaft"><span>Name</span><input id="nk-name" value={e.name} onChange={(x) => setE({ ...e, name: x.target.value, ...(neu && (!e.schluessel || e.schluessel === schluesselAusName(e.name)) ? { schluessel: schluesselAusName(x.target.value) } : {}) })} required /></label>
          <label className="eigenschaft"><span>Kennung <small>{neu ? 'nach dem Anlegen fest' : 'fest'}</small></span><input id="nk-schluessel" className="mono" value={e.schluessel} disabled={!neu} onChange={(x) => setE({ ...e, schluessel: x.target.value })} required /></label>
          <label className="eigenschaft breit"><span>Muster <small>{'{jjjj} {jj} {mm} {tt} – Datum des Ziehens; {zaehler} oder {zaehler:7} mit führenden Nullen'}</small></span>
            <input id="nk-muster" className="mono" value={e.muster} onChange={(x) => setE({ ...e, muster: x.target.value })} required /></label>
          <label className="eigenschaft"><span>Startwert</span><input id="nk-start" type="number" min={0} value={e.start} onChange={(x) => setE({ ...e, start: x.target.value })} /></label>
        </div>
        {musterFehler ? <p className="fehlertext">{musterFehler}</p> : <p className="klein">Beispiel heute: <code className="mono">{beispiel}</code> · Zähler beginnt neu: <strong>{NEUBEGINN_TEXT[neubeginn]}</strong></p>}
        <Speicherleiste ent={ent} gegenstand="Nummernkreis" sendet={sendet} ungueltig={!!musterFehler}
          links={!neu && <button type="button" className="textknopf gefahr" disabled={k!.verwendet.length > 0} title={k!.verwendet.length ? 'Wird noch verwendet' : undefined}
            onClick={async () => { if (await rueckfrage({ titel: `Nummernkreis „${k!.name}“ löschen?`, ja: 'Löschen', gefahr: true })) void tu(async () => { z.setListe(await api.nummernkreisLoeschen(k!.schluessel)); loeseWache(); geheZu('/werkbank/nummernkreise', true); return 'Gelöscht.'; }); }}>Nummernkreis löschen</button>} />
      </form>
      {!neu && <>
        <div className="blatt">
          <h2 className="h3">Stand</h2>
          <p>Nächste Nummer: <code className="mono">{k!.naechste}</code> <span className="leise klein">(Zeitraum {k!.zeitraum === 'immer' ? 'ohne Neubeginn' : k!.zeitraum}, Zähler {k!.naechsterZaehler})</span></p>
          {k!.zuletzt.length > 0 && <>
            <p className="leise klein">Zuletzt vergeben:</p>
            <ul className="stapel klein">{k!.zuletzt.map((x) => <li key={`${x.nummer}-${x.am}`}><code className="mono">{x.nummer}</code> · {zeit(x.am)}{x.mappeId && <> · <Link to={`/ablage/mappe/${x.mappeId}`} className="verweis">Mappe</Link></>}</li>)}</ul>
          </>}
          <form className="zeile" onSubmit={async (x) => { x.preventDefault(); if (await rueckfrage({ titel: 'Zählerstand setzen?', text: `Die nächste Nummer bekommt den Zähler ${zaehler}. Das steht im Protokoll.`, ja: 'Zählerstand setzen' })) void tu(async () => { z.setListe(await api.nummernkreisZaehler(k!.schluessel, Number(zaehler))); setZaehler(''); return 'Zählerstand gesetzt.'; }); }}>
            <label className="eigenschaft"><span>Zählerstand setzen <small>Zähler der nächsten Nummer, z. B. beim Umstieg aus einem anderen Programm</small></span>
              <input id="nk-zaehler" type="number" min={0} value={zaehler} onChange={(x) => setZaehler(x.target.value)} /></label>
            <button className="knopf" disabled={zaehler === ''}>Setzen</button>
          </form>
        </div>
        {k!.schluessel === 'archivnummer' && <Aufkleber naechste={k!.naechste} neuLaden={z.laden} />}
        <div className="blatt">
          <h2 className="h3">Verwendet in</h2>
          {k!.verwendet.length ? <ul className="stapel">{k!.verwendet.map((v) => <li key={`${v.typId}-${v.feldKey}`}><Link to={`/werkbank/typen/${v.typId}`} className="verweis">{v.typ}</Link> · {v.feld}</li>)}</ul>
            : <p className="leise">Noch in keinem Feld. Trage im Mappentyp bei einem Textfeld als Standardwert <code className="mono">{`{nummernkreis:${k!.schluessel}}`}</code> ein.</p>}
        </div>
      </>}
    </div>
  );
}

/** Wartungsoperation (#171): Mappen ohne Nummer nachträglich nummerieren. */
export function NummernNachtragen() {
  const d = useDaten();
  const felder = d.typen.flatMap((t) => t.felder.filter((f) => kreisVon(f)).map((f) => ({ wert: `${t.id}|${f.key}`, text: `${t.name} · ${f.label}` })));
  const [wahl, setWahl] = useState('');
  const [vorschau, setVorschau] = useState<{ anzahl: number; von: string | null; bis: string | null } | null>(null);
  const [auftrag, setAuftrag] = useState<Auftrag | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [typId, feldKey] = wahl.split('|');
  useEffect(() => {
    setVorschau(null); setFehler(undefined);
    if (wahl) api.nummernVorschau(typId, feldKey).then(setVorschau).catch((e) => setFehler((e as Error).message));
  }, [wahl, typId, feldKey]);
  useEffect(() => {
    if (auftrag?.status !== 'laeuft') return;
    const t = setInterval(() => void api.auftrag().then((a) => {
      setAuftrag(a);
      if (a?.status !== 'laeuft' && wahl) void api.nummernVorschau(typId, feldKey).then(setVorschau);
    }), 1000);
    return () => clearInterval(t);
  }, [auftrag?.status, wahl, typId, feldKey]);
  const ergebnis = auftrag?.status === 'fertig' && auftrag.art === 'nummern' ? auftrag.ergebnis as { vergeben: number; erste: string | null; letzte: string | null } : null;
  return (
    <section className="blatt" id="nummern">
      <h2 className="h3">Nummern nachträglich vergeben <Hilfe ort="werkbank.nummernkreise.nachtragen" /></h2>
      <p className="leise">Mappen, die angelegt wurden, bevor das Feld einen Nummernkreis bekam, haben keine Nummer. Das hier vergibt sie in der Reihenfolge des Anlegens; als Datum gilt heute.</p>
      {!felder.length ? <p className="leise">Kein Feld nutzt einen Nummernkreis.</p> : <>
        <label className="eigenschaft"><span>Feld</span>
          <select id="nummern-feld" value={wahl} onChange={(e) => setWahl(e.target.value)}>
            <option value="">– wählen –</option>{felder.map((f) => <option key={f.wert} value={f.wert}>{f.text}</option>)}
          </select></label>
        {vorschau && (vorschau.anzahl ? <p>{vorschau.anzahl === 1 ? '1 Mappe bekommt' : `${vorschau.anzahl} Mappen bekommen`} die Nummer{vorschau.anzahl === 1 ? '' : 'n'} <code className="mono">{vorschau.von}</code>{vorschau.anzahl > 1 && <> bis <code className="mono">{vorschau.bis}</code></>}.</p>
          : <p className="leise">Alle Mappen haben schon eine Nummer.</p>)}
        {auftrag?.status === 'laeuft' && <p className="leise" role="status">{fortschrittText(auftrag, 'Mappen')}</p>}
        {ergebnis && <p className="gutertext" role="status">{ergebnis.vergeben} Nummern vergeben{ergebnis.erste ? ` (${ergebnis.erste} bis ${ergebnis.letzte})` : ''}.</p>}
        {(fehler || auftrag?.status === 'fehler') && <p className="fehlertext">{fehler ?? auftrag?.fehler}</p>}
        <div className="knoepfe"><button type="button" className="knopf primaer" disabled={!vorschau?.anzahl || auftrag?.status === 'laeuft'}
          onClick={() => void api.nummernNachtragen(typId, feldKey).then(setAuftrag).catch((e) => setFehler((e as Error).message))}>Nummern vergeben</button></div>
      </>}
    </section>
  );
}

/** Archivnummern (#345): Aufkleberbogen als PDF – die Nummern gelten danach als vergeben. */
const ETIKETTEN: Record<string, { name: string; felder: number }> = {
  '48x25': { name: '48,5 × 25,4 mm – 40 je Bogen (z. B. Avery L4736/3657)', felder: 40 },
  '38x21': { name: '38,1 × 21,2 mm – 65 je Bogen (z. B. Avery L7651)', felder: 65 },
  '70x37': { name: '70 × 37 mm – 24 je Bogen (z. B. Avery 3474)', felder: 24 },
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
      setMeldung({ art: 'gut', text: `„${r.name}“ gespeichert. Diese Nummern gelten jetzt als vergeben.` });
      await neuLaden();
    } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); } finally { setLaeuft(false); }
  }
  return (
    <div className="blatt">
      <h2 className="h3">Aufkleber drucken <Hilfe ort="werkbank.aufkleber" /></h2>
      <p className="leise">Ein PDF mit Aufklebern ab <code className="mono">{naechste}</code>: Barcode (Code 128) und Nummer lesbar. Auf das Papieroriginal kleben, im DMS am Dokument eintragen – oder mit einem Handscanner ins Suchfeld scannen. Mit 100 % drucken, nicht „an Seite anpassen“.</p>
      <form className="raster" onSubmit={(e) => { e.preventDefault(); void los(); }}>
        <label className="eigenschaft"><span>Anzahl</span><input type="number" min={1} max={500} value={anzahl} onChange={(e) => setAnzahl(e.target.value)} /></label>
        <label className="eigenschaft breit"><span>Etikettenformat (A4)</span>
          <select value={etikett} onChange={(e) => { setEtikett(e.target.value); setStart('1'); }}>{Object.entries(ETIKETTEN).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></label>
        <label className="eigenschaft"><span>Beginnen bei Feld <small>1 = oben links, zeilenweise – für angebrochene Bögen</small></span><input type="number" min={1} max={felder} value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <div className="knoepfe"><button className="knopf primaer" disabled={laeuft || !(Number(anzahl) >= 1 && Number(anzahl) <= 500) || !(Number(start) >= 1 && Number(start) <= felder)}>{laeuft ? 'Erzeuge …' : 'Aufkleber als PDF'}</button></div>
      </form>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
    </div>
  );
}
