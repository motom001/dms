import { useCallback, useEffect, useState } from 'react';
import { AUSLOESER, LOESCHGRUENDE, LOESCHPROTOKOLL_JAHRE_MAX, LOESCHSCHRITTE, LOESCHWEGE, istSha, type LoeschEintrag } from '../../../shared/src/loeschprotokoll';
import { api } from '../api';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { pruefwert } from '../pruefwert';

/**
 * Werkbank → Datenschutz → Löschprotokoll (#470): Nachweis gelöschter Mappen und Dokumente – ohne Titel,
 * Feldwerte oder Dateinamen. Filter nach Zeitraum, Mappentyp, Grund, Schritt und Vorgang; Suche nach Nummer
 * oder Prüfsumme (auch per Datei: „Wurde dieses Dokument gelöscht?“); Ausgabe als PDF und CSV. Nicht änderbar,
 * nur die Aufbewahrung lässt sich einstellen.
 */

type Filter = Record<'von' | 'bis' | 'typId' | 'grund' | 'schritt' | 'vorgang' | 'suche', string>;
const LEER: Filter = { von: '', bis: '', typId: '', grund: '', schritt: '', vorgang: '', suche: '' };
const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
const groesse = (b: number | null) => (b === null ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
const kurz = (id: string) => id.slice(0, 8);
const ohneLeere = (f: Filter) => Object.fromEntries(Object.entries(f).filter(([, v]) => v)) as Record<string, string>;

export function LoeschprotokollBlatt() {
  const d = useDaten();
  const [f, setF] = useState<Filter>(LEER);
  const [r, setR] = useState<{ eintraege: LoeschEintrag[]; gesamt: number; jahre: number; max: number }>();
  const [fehler, setFehler] = useState<string>();
  const [datei, setDatei] = useState<string>();
  const [jahre, setJahre] = useState('');
  const [meldung, setMeldung] = useState<string>();
  const laden = useCallback(async (x: Filter) => {
    try { const n = await api.loeschprotokoll(ohneLeere(x)); setR(n); setJahre(String(n.jahre)); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { void laden(LEER); }, [laden]);
  const setze = (k: keyof Filter, v: string) => { const n = { ...f, [k]: v }; setF(n); if (k !== 'suche') void laden(n); };
  async function pruefe(x: File | undefined) {
    if (!x) return;
    setDatei(`Prüfsumme von „${x.name}“ wird berechnet …`);
    try {
      const sha = await pruefwert(x);
      const n = { ...f, suche: sha }; setF(n); await laden(n);
      setDatei(`„${x.name}“: SHA-256 ${sha}`);
    } catch (e) { setDatei(`Die Datei ließ sich nicht lesen: ${(e as Error).message}`); }
  }
  const query = new URLSearchParams(ohneLeere(f)).toString();
  const typen = d.typen.filter((t) => t.system !== 'benutzer');
  const shaSuche = istSha(f.suche);
  return (
    <section className="blatt" id="loeschprotokoll">
      <h2 className="h3">Löschprotokoll <Hilfe ort="werkbank.loeschprotokoll" /></h2>
      <p className="leise klein">Jede Löschung steht hier – in den Papierkorb, endgültig gelöscht, wiederhergestellt: je Mappe Mappentyp, Id und Nummer, je Dokument die Prüfsumme (SHA-256), Größe, Dateityp und Seitenzahl. Titel, Feldwerte und Dateinamen nie. Wann, von wem, warum und in welchem Vorgang. Das Protokoll lässt sich nicht ändern.</p>
      <form className="lp-filter" onSubmit={(e) => { e.preventDefault(); void laden(f); }}>
        <label className="eigenschaft"><span>Von</span><input type="date" value={f.von} onChange={(e) => setze('von', e.target.value)} /></label>
        <label className="eigenschaft"><span>Bis</span><input type="date" value={f.bis} onChange={(e) => setze('bis', e.target.value)} /></label>
        <label className="eigenschaft"><span>Mappentyp</span><select value={f.typId} onChange={(e) => setze('typId', e.target.value)}><option value="">alle</option>{typen.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="eigenschaft"><span>Grund</span><select value={f.grund} onChange={(e) => setze('grund', e.target.value)}><option value="">alle</option>{Object.entries(LOESCHGRUENDE).map(([k, n]) => <option key={k} value={k}>{n}</option>)}<option value="ohne">ohne Grund</option></select></label>
        <label className="eigenschaft"><span>Schritt</span><select value={f.schritt} onChange={(e) => setze('schritt', e.target.value)}><option value="">alle</option>{Object.entries(LOESCHSCHRITTE).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label className="eigenschaft lp-suche"><span>Nummer oder Prüfsumme</span><input type="search" value={f.suche} placeholder="z. B. R-2026-0042 oder SHA-256" onChange={(e) => setF({ ...f, suche: e.target.value })} /></label>
        <button type="submit" className="knopf">Suchen</button>
      </form>
      <label className="lp-datei" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void pruefe(e.dataTransfer.files[0]); }}>
        <input type="file" onChange={(e) => { void pruefe(e.target.files?.[0]); e.target.value = ''; }} />
        <span><strong>Wurde dieses Dokument gelöscht?</strong> Datei hierher ziehen oder wählen – das DMS rechnet die Prüfsumme in deinem Browser und sucht sie. Die Datei selbst wird nicht hochgeladen.</span>
      </label>
      {datei && <p className="leise klein lp-sha">{datei}</p>}
      {f.vorgang && <p className="klein">Nur Vorgang {kurz(f.vorgang)} · <button type="button" className="textknopf klein" onClick={() => setze('vorgang', '')}>alle Vorgänge</button></p>}
      {fehler && <p className="fehlertext">{fehler}</p>}
      {r && (
        <>
          <p className="zeile-zwischen">
            <span className="leise klein">{r.gesamt === 0 ? (shaSuche ? 'Kein Dokument mit dieser Prüfsumme gelöscht.' : 'Keine Einträge.') : `${r.gesamt.toLocaleString('de-DE')} ${r.gesamt === 1 ? 'Eintrag' : 'Einträge'}${r.gesamt > r.eintraege.length ? `, die neuesten ${r.eintraege.length} angezeigt` : ''}`}</span>
            <span className="knoepfe">
              <a className="knopf klein" href={`/api/werkbank/loeschprotokoll/datei?format=pdf${query ? `&${query}` : ''}`}>Als PDF</a>
              <a className="knopf klein" href={`/api/werkbank/loeschprotokoll/datei?format=csv${query ? `&${query}` : ''}`}>Als CSV</a>
            </span>
          </p>
          {r.eintraege.length > 0 && <ul className="lp-liste">{r.eintraege.map((e) => <Zeile key={e.id} e={e} vorgang={(v) => setze('vorgang', v)} />)}</ul>}
          <form className="lp-jahre" onSubmit={async (x) => {
            x.preventDefault(); setMeldung(undefined);
            try { await api.loeschprotokollJahre(Number(jahre)); setMeldung('Gespeichert.'); await laden(f); } catch (e) { setMeldung((e as Error).message); }
          }}>
            <label className="eigenschaft"><span>Aufbewahrung <small>danach fallen alte Einträge automatisch weg</small></span>
              <span className="lp-jahre-feld"><input type="number" min={1} max={LOESCHPROTOKOLL_JAHRE_MAX} value={jahre} onChange={(e) => setJahre(e.target.value)} /> Jahre</span></label>
            <button type="submit" className="knopf klein" disabled={jahre === String(r.jahre)}>Speichern</button>
            {meldung && <span className="leise klein" role="status">{meldung}</span>}
          </form>
        </>
      )}
    </section>
  );
}

function Zeile({ e, vorgang }: { e: LoeschEintrag; vorgang(v: string): void }) {
  const was = e.art === 'mappe'
    ? <>Mappe <code title={e.mappeId}>{kurz(e.mappeId)}</code>{e.anzahl ? ` · ${e.anzahl.dokumente} Dok.${e.anzahl.versionen ? `, ${e.anzahl.versionen} ält. Vers.` : ''}${e.anzahl.notizen ? `, ${e.anzahl.notizen} Notizen` : ''}${e.anzahl.verweise ? `, ${e.anzahl.verweise} Verweise entfernt` : ''}` : ''}</>
    : <>Dokument <code title={e.dokumentId ?? ''}>{kurz(e.dokumentId ?? '')}</code>{e.version && e.version > 1 ? ` v${e.version}` : ''} · {groesse(e.groesse)}{e.seiten ? ` · ${e.seiten} S.` : ''} · {e.mime}{e.archivnummer ? ` · ASN ${e.archivnummer}` : ''}<br /><code className="lp-sha" title="SHA-256">{e.sha256}</code></>;
  return (
    <li className={`lp-eintrag lp-${e.schritt}`}>
      <span className="lp-kopf"><strong>{LOESCHSCHRITTE[e.schritt]}</strong> · {zeit(e.zeit)} · {e.typ || 'Mappentyp unbekannt'}{e.nummer ? ` · ${e.nummer}` : ''}</span>
      <span className="klein">{was}</span>
      <span className="leise klein">{LOESCHWEGE[e.weg] ?? e.weg} · {e.von}{e.ausloeser !== 'benutzer' ? ` (${AUSLOESER[e.ausloeser]})` : ''}{e.grund ? ` · ${LOESCHGRUENDE[e.grund]}` : ''}{e.grundText ? `: ${e.grundText}` : ''}
        {e.vorgang && <> · <button type="button" className="textknopf klein" onClick={() => vorgang(e.vorgang!)}>Vorgang {kurz(e.vorgang)}</button></>}</span>
    </li>
  );
}
