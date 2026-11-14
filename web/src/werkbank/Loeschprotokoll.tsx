import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { AUSLOESER, LOESCHGRUENDE, LOESCHPROTOKOLL_JAHRE_MAX, LOESCHSCHRITTE, LOESCHWEGE, istSha, type LoeschEintrag } from '../../../shared/src/loeschprotokoll';
import { datenschutzApi } from '../api/datenschutz';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { pruefwert } from '../pruefwert';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { abfangen, Feld, Knopf, Suchfeld } from '../bausteine';

/**
 * Werkbank → Datenschutz → Löschprotokoll (#470): Nachweis gelöschter Mappen und Dokumente – ohne Titel,
 * Feldwerte oder Dateinamen. Filter nach Zeitraum, Mappentyp, Grund, Schritt und Vorgang; Suche nach Nummer
 * oder Prüfsumme (auch per Datei: „Wurde dieses Dokument gelöscht?“); Ausgabe als PDF und CSV. Nicht änderbar,
 * nur die Aufbewahrung lässt sich einstellen.
 */

type Filter = Record<'von' | 'bis' | 'typId' | 'grund' | 'schritt' | 'vorgang' | 'suche', string>;
const LEER: Filter = { von: '', bis: '', typId: '', grund: '', schritt: '', vorgang: '', suche: '' };
const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });
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
    try { const n = await datenschutzApi.loeschprotokoll(ohneLeere(x)); setR(n); setJahre(String(n.jahre)); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { void laden(LEER); }, [laden]);
  const setze = (k: keyof Filter, v: string) => { const n = { ...f, [k]: v }; setF(n); if (k !== 'suche') void laden(n); };
  async function pruefe(x: File | undefined) {
    if (!x) return;
    setDatei(t('werkbank.loeschprotokoll.pruefsumme-von-wird-berechnet', { name: x.name }));
    try {
      const sha = await pruefwert(x);
      const n = { ...f, suche: sha }; setF(n); await laden(n);
      setDatei(t('werkbank.loeschprotokoll.sha-256', { name: x.name, sha }));
    } catch (e) { setDatei(t('werkbank.loeschprotokoll.die-datei-liess-sich', { message: (e as Error).message })); }
  }
  const query = new URLSearchParams(ohneLeere(f)).toString();
  const typen = d.typen.filter((mappentyp) => mappentyp.system !== 'benutzer');
  const shaSuche = istSha(f.suche);
  return (
    <section className="blatt" id="loeschprotokoll">
      <h2 className="h3">{t('werkbank.loeschprotokoll.loeschprotokoll')} <Hilfe ort="werkbank.loeschprotokoll" /></h2>
      <p className="leise klein">{t('werkbank.loeschprotokoll.jede-loeschung-steht-hier')}</p>
      <form className="lp-filter" onSubmit={(e) => { e.preventDefault(); void laden(f); }}>
        <Feld beschriftung={t('werkbank.loeschprotokoll.von')}>
          <input type="date" value={f.von} onChange={(e) => setze('von', e.target.value)} />
        </Feld>
        <Feld beschriftung={t('werkbank.loeschprotokoll.bis')}>
          <input type="date" value={f.bis} onChange={(e) => setze('bis', e.target.value)} />
        </Feld>
        <Feld beschriftung={t('werkbank.loeschprotokoll.mappentyp')}>
          <select value={f.typId} onChange={(e) => setze('typId', e.target.value)}><option value="">{t('werkbank.loeschprotokoll.alle')}</option>{typen.map((mappentyp) => <option key={mappentyp.id} value={mappentyp.id}>{mappentyp.name}</option>)}</select>
        </Feld>
        <Feld beschriftung={t('werkbank.loeschprotokoll.grund')}>
          <select value={f.grund} onChange={(e) => setze('grund', e.target.value)}><option value="">{t('werkbank.loeschprotokoll.alle')}</option>{Object.entries(LOESCHGRUENDE).map(([k, n]) => <option key={k} value={k}>{n}</option>)}<option value="ohne">{t('werkbank.loeschprotokoll.ohne-grund')}</option></select>
        </Feld>
        <Feld beschriftung={t('werkbank.loeschprotokoll.schritt')}>
          <select value={f.schritt} onChange={(e) => setze('schritt', e.target.value)}><option value="">{t('werkbank.loeschprotokoll.alle')}</option>{Object.entries(LOESCHSCHRITTE).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
        </Feld>
        <Suchfeld className="lp-suche" wert={f.suche} setze={(suche) => setF({ ...f, suche })} beschriftung={t('werkbank.loeschprotokoll.nummer-oder-pruefsumme')} platzhalter={t('werkbank.loeschprotokoll.z-b-r-2026')} />
        <Knopf art="haupt" type="submit">{t('werkbank.loeschprotokoll.suchen')}</Knopf>
      </form>
      <label className="lp-datei" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void pruefe(e.dataTransfer.files[0]); }}>
        <input type="file" onChange={(e) => { void pruefe(e.target.files?.[0]); e.target.value = ''; }} />
        <span>{tn('werkbank.loeschprotokoll.datei-hierher-ziehen-oder', { b: <strong>{t('werkbank.loeschprotokoll.wurde-dieses-dokument-geloescht')}</strong> })}</span>
      </label>
      {datei && <p className="leise klein lp-sha">{datei}</p>}
      {f.vorgang && <p className="klein">{t('werkbank.loeschprotokoll.nur-vorgang', { kurz: kurz(f.vorgang) })}{' '}<Knopf art="link" groesse="klein" onClick={() => setze('vorgang', '')}>{t('werkbank.loeschprotokoll.alle-vorgaenge')}</Knopf></p>}
      {fehler && <p className="fehlertext">{fehler}</p>}
      {r && (
        <>
          <p className="zeile-zwischen">
            <span className="leise klein">{r.gesamt === 0 ? (shaSuche ? t('werkbank.loeschprotokoll.kein-dokument-mit-dieser') : t('werkbank.loeschprotokoll.keine-eintraege')) : t('werkbank.loeschprotokoll.eintraege', { anzahl: r.gesamt, gesamt: r.gesamt.toLocaleString(gebietsschema()), wert: r.gesamt > r.eintraege.length ? t('werkbank.loeschprotokoll.die-neuesten-angezeigt', { eintraege: r.eintraege.length }) : '' })}</span>
            <span className="knoepfe">
              <a className="knopf klein" href={`/api/werkbank/loeschprotokoll/datei?format=pdf${query ? `&${query}` : ''}`}>{t('werkbank.loeschprotokoll.als-pdf')}</a>
              <a className="knopf klein" href={`/api/werkbank/loeschprotokoll/datei?format=csv${query ? `&${query}` : ''}`}>{t('werkbank.loeschprotokoll.als-csv')}</a>
            </span>
          </p>
          {r.eintraege.length > 0 && <ul className="lp-liste">{r.eintraege.map((e) => <Zeile key={e.id} e={e} vorgang={(v) => setze('vorgang', v)} />)}</ul>}
          <form className="lp-jahre" onSubmit={abfangen(async (x: FormEvent) => {
            x.preventDefault(); setMeldung(undefined);
            await datenschutzApi.loeschprotokollJahre(Number(jahre)); setMeldung(t('werkbank.loeschprotokoll.gespeichert')); await laden(f);
          }, setMeldung)}>
            <Feld beschriftung={t('werkbank.loeschprotokoll.aufbewahrung')} hinweis={t('werkbank.loeschprotokoll.danach-fallen-alte-eintraege')}>
              {(v) => <span className="lp-jahre-feld"><input {...v} type="number" min={1} max={LOESCHPROTOKOLL_JAHRE_MAX} value={jahre} onChange={(e) => setJahre(e.target.value)} /> {' '}{t('werkbank.loeschprotokoll.jahre')}</span>}
            </Feld>
            <Knopf art="haupt" type="submit" gesperrt={jahre === String(r.jahre)}>{t('werkbank.loeschprotokoll.speichern')}</Knopf>
            {meldung && <span className="leise klein" role="status">{meldung}</span>}
          </form>
        </>
      )}
    </section>
  );
}

function Zeile({ e, vorgang }: { e: LoeschEintrag; vorgang(v: string): void }) {
  const was = e.art === 'mappe'
    ? <>{tn('werkbank.loeschprotokoll.mappe', { code: <code title={e.mappeId}>{kurz(e.mappeId)}</code>, wert: e.anzahl ? t('werkbank.loeschprotokoll.dok', { dokumente: e.anzahl.dokumente, wert: e.anzahl.versionen ? t('werkbank.loeschprotokoll.aelt-vers', { versionen: e.anzahl.versionen }) : '', wert2: e.anzahl.notizen ? t('werkbank.loeschprotokoll.notizen', { notizen: e.anzahl.notizen }) : '', wert3: e.anzahl.verweise ? t('werkbank.loeschprotokoll.verweise-entfernt', { verweise: e.anzahl.verweise }) : '' }) : '' })}</>
    : <>{tn('werkbank.loeschprotokoll.dokument', { code: <code title={e.dokumentId ?? ''}>{kurz(e.dokumentId ?? '')}</code>, wert: e.version && e.version > 1 ? ` v${e.version}` : '', groesse: groesse(e.groesse), wert2: e.seiten ? ` · ${e.seiten} S.` : '', mime: e.mime, wert3: e.archivnummer ? t('werkbank.loeschprotokoll.asn', { archivnummer: e.archivnummer }) : '', umbruch: <br />, code2: <code className="lp-sha" title="SHA-256">{e.sha256}</code> })}</>;
  return (
    <li className={`lp-eintrag lp-${e.schritt}`}>
      <span className="lp-kopf"><strong>{LOESCHSCHRITTE[e.schritt]}</strong> · {zeit(e.zeit)} · {e.typ || t('werkbank.loeschprotokoll.mappentyp-unbekannt')}{e.nummer ? ` · ${e.nummer}` : ''}</span>
      <span className="klein">{was}</span>
      <span className="leise klein">{LOESCHWEGE[e.weg] ?? e.weg} · {e.von}{e.ausloeser !== 'benutzer' ? ` (${AUSLOESER[e.ausloeser]})` : ''}{e.grund ? ` · ${LOESCHGRUENDE[e.grund]}` : ''}{e.grundText ? `: ${e.grundText}` : ''}
        {e.vorgang && <> · <Knopf art="link" groesse="klein" onClick={() => vorgang(e.vorgang!)}>{t('werkbank.loeschprotokoll.vorgang', { kurz: kurz(e.vorgang) })}</Knopf></>}</span>
    </li>
  );
}
