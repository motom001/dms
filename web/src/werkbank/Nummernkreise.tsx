import { useCallback, useEffect, useState } from 'react';
import { api, type Auftrag, type NummernkreisAnsicht } from '../api';
import { useDaten } from '../daten';
import { geheZu, Link } from '../ort';
import { Hilfe } from '../Hilfe';
import { NEUBEGINN_TEXT, pruefeMuster, formatiereNummer, datumIn, kreisVon, neubeginn as neubeginnVon } from '../../../shared/src/nummernkreis';

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
  const [e, setE] = useState(() => ({ schluessel: k?.schluessel ?? '', name: k?.name ?? '', muster: k?.muster ?? '{jjjj}{mm}-R{zaehler:7}', start: String(k?.start ?? 1) }));
  const [zaehler, setZaehler] = useState('');
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  if (!neu && !k) return z.liste ? <div className="leer"><p>Diesen Nummernkreis gibt es nicht (mehr).</p></div> : <p className="leise">Lade …</p>;
  const musterFehler = pruefeMuster(e.muster);
  const heute = datumIn(new Date());
  const beispiel = musterFehler ? null : formatiereNummer(e.muster, Number(e.start) || 0, heute);
  const neubeginn = neubeginnVon(e.muster);
  async function tu(f: () => Promise<string>) {
    setMeldung(undefined);
    try { setMeldung({ art: 'gut', text: await f() }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  const speichern = () => tu(async () => {
    const daten = { name: e.name, muster: e.muster, start: Number(e.start) };
    z.setListe(neu ? await api.nummernkreisAnlegen({ ...daten, schluessel: e.schluessel }) : await api.nummernkreisAendern(k!.schluessel, daten));
    if (neu) geheZu(`/werkbank/nummernkreise/${e.schluessel}`, true);
    return neu ? 'Angelegt.' : 'Gespeichert. Das Muster gilt für neue Nummern.';
  });
  const schluesselAusName = (name: string) => name.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'n$1').slice(0, 40);
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">Werkbank · Nummernkreis</p>
        <h1>{neu ? 'Neuer Nummernkreis' : k!.name}</h1>
        {!neu && <p className="leise">Im Standardwert eines Textfelds: <code className="mono">{`{nummernkreis:${k!.schluessel}}`}</code></p>}
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }}>
        <div className="raster">
          <label className="eigenschaft"><span>Name</span><input id="nk-name" value={e.name} onChange={(x) => setE({ ...e, name: x.target.value, ...(neu && (!e.schluessel || e.schluessel === schluesselAusName(e.name)) ? { schluessel: schluesselAusName(x.target.value) } : {}) })} required /></label>
          <label className="eigenschaft"><span>Schlüssel <small>{neu ? 'nach dem Anlegen fest' : 'fest'}</small></span><input id="nk-schluessel" className="mono" value={e.schluessel} disabled={!neu} onChange={(x) => setE({ ...e, schluessel: x.target.value })} required /></label>
          <label className="eigenschaft breit"><span>Muster <small>{'{jjjj} {jj} {mm} {tt} – Datum des Ziehens; {zaehler} oder {zaehler:7} mit führenden Nullen'}</small></span>
            <input id="nk-muster" className="mono" value={e.muster} onChange={(x) => setE({ ...e, muster: x.target.value })} required /></label>
          <label className="eigenschaft"><span>Startwert</span><input id="nk-start" type="number" min={0} value={e.start} onChange={(x) => setE({ ...e, start: x.target.value })} /></label>
        </div>
        {musterFehler ? <p className="fehlertext">{musterFehler}</p> : <p className="klein">Beispiel heute: <code className="mono">{beispiel}</code> · Zähler beginnt neu: <strong>{NEUBEGINN_TEXT[neubeginn]}</strong></p>}
        <div className="knoepfe">
          {!neu && <button type="button" className="knopf gefahr-rand" disabled={k!.verwendet.length > 0} title={k!.verwendet.length ? 'Wird noch verwendet' : undefined}
            onClick={() => { if (confirm(`Nummernkreis „${k!.name}“ löschen?`)) void tu(async () => { z.setListe(await api.nummernkreisLoeschen(k!.schluessel)); geheZu('/werkbank/nummernkreise', true); return 'Gelöscht.'; }); }}>Löschen</button>}
          <button className="knopf primaer" disabled={!!musterFehler}>{neu ? 'Anlegen' : 'Speichern'}</button>
        </div>
      </form>
      {!neu && <>
        <div className="blatt">
          <h2 className="h3">Stand</h2>
          <p>Nächste Nummer: <code className="mono">{k!.naechste}</code> <span className="leise klein">(Zeitraum {k!.zeitraum === 'immer' ? 'ohne Neubeginn' : k!.zeitraum}, Zähler {k!.naechsterZaehler})</span></p>
          {k!.zuletzt.length > 0 && <>
            <p className="leise klein">Zuletzt vergeben:</p>
            <ul className="stapel klein">{k!.zuletzt.map((x) => <li key={`${x.nummer}-${x.am}`}><code className="mono">{x.nummer}</code> · {zeit(x.am)}{x.mappeId && <> · <Link to={`/ablage/mappe/${x.mappeId}`} className="verweis">Mappe</Link></>}</li>)}</ul>
          </>}
          <form className="zeile" onSubmit={(x) => { x.preventDefault(); if (confirm(`Nächste Nummer mit Zähler ${zaehler} vergeben? Das steht im Protokoll.`)) void tu(async () => { z.setListe(await api.nummernkreisZaehler(k!.schluessel, Number(zaehler))); setZaehler(''); return 'Zählerstand gesetzt.'; }); }}>
            <label className="eigenschaft"><span>Zählerstand setzen <small>Zähler der nächsten Nummer, z. B. beim Umstieg aus einem anderen Programm</small></span>
              <input id="nk-zaehler" type="number" min={0} value={zaehler} onChange={(x) => setZaehler(x.target.value)} /></label>
            <button className="knopf" disabled={zaehler === ''}>Setzen</button>
          </form>
        </div>
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
        {auftrag?.status === 'laeuft' && <p className="leise">Vergebe … {auftrag.fertig} von {auftrag.gesamt}</p>}
        {ergebnis && <p className="gutertext" role="status">{ergebnis.vergeben} Nummern vergeben{ergebnis.erste ? ` (${ergebnis.erste} bis ${ergebnis.letzte})` : ''}.</p>}
        {(fehler || auftrag?.status === 'fehler') && <p className="fehlertext">{fehler ?? auftrag?.fehler}</p>}
        <div className="knoepfe"><button type="button" className="knopf primaer" disabled={!vorschau?.anzahl || auftrag?.status === 'laeuft'}
          onClick={() => void api.nummernNachtragen(typId, feldKey).then(setAuftrag).catch((e) => setFehler((e as Error).message))}>Nummern vergeben</button></div>
      </>}
    </section>
  );
}
