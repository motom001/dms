import { Knopf, type KnopfErgebnis } from '../bausteine';
import { Kopf } from './Kopf';
import { DateienPruefen } from './Archiv';
import { NummernNachtragen } from './Nummernkreise';
import { FormateUnpassend } from './FormateUnpassend';
import { AbsenderBereinigen } from './AbsenderBereinigen';
import { useCallback, useEffect, useState } from 'react';
import { OCR_STAENDE, type OcrStandArt } from '../../../shared/src/model';
import { api, type OcrStatus } from '../api';
import { Link } from '../ort';
import { Hilfe } from '../Hilfe';
import { rueckfrage } from '../rueckfrage';
import { WARTUNG_GEAENDERT } from '../wartung';
import { sprachname, sprachvorschlaege } from '../../../shared/src/textsprache';
import { TEXTERKENNUNG_PAKET } from '../../../shared/src/volltext';
import { fortschrittText } from '../../../shared/src/auftrag';
import type { Auftrag as HintergrundAuftrag } from '../api';
import { t as tx, t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { AnlageMarke } from '../ablage/Anlagen';

/**
 * Werkbank → Texterkennung (#45, #459): Übersicht – welches Paket die Texterkennung übernimmt, woher der Text der
 * Dokumente kommt, erkannte Sprachen, Warteschlange und Aufträge. Einstellungen der Erkennung stehen beim Paket.
 * Werkbank → Wartungsoperationen: Volltext neu erzeugen (#458), alle Dateien prüfen (#212),
 * Nummern nachträglich vergeben. Sicherung, Wiederherstellung und Export sind eigene Bereiche.
 */

export function useTexterkennung(aktiv: boolean) {
  const [stand, setStand] = useState<OcrStatus | null>(null);
  const [fehler, setFehler] = useState<string>();
  /** Lädt den Stand; Rückgabe: der Fehler, falls es nicht geklappt hat (für „Erneut prüfen“ am Knopf, #986). */
  const laden = useCallback(async (werkzeugeNeu = false): Promise<string | undefined> => {
    try { setStand(await api.texterkennung(werkzeugeNeu)); setFehler(undefined); return undefined; } catch (e) { setFehler((e as Error).message); return (e as Error).message; }
  }, []);
  // Solange etwas wartet oder läuft, alle paar Sekunden auffrischen.
  const offen = !!stand && (stand.zaehler.wartet > 0 || stand.zaehler.laeuft > 0 || (stand.zaehler.paket ?? 0) > 0);
  useEffect(() => {
    if (!aktiv) return;
    void laden();
  }, [aktiv, laden]);
  useEffect(() => {
    if (!aktiv || !offen) return;
    const timer = setInterval(() => void laden(), 3000);
    return () => clearInterval(timer);
  }, [aktiv, offen, laden]);
  return { stand, setStand, fehler, laden };
}
export type TexterkennungZustand = ReturnType<typeof useTexterkennung>;

const zahl = (n: number) => n.toLocaleString(gebietsschema());
const REIHENFOLGE: OcrStandArt[] = ['wartet', 'laeuft', 'paket', 'fertig', 'fehler', 'ausgelassen', 'keiner'];

function Warteschlange({ s }: { s: OcrStatus }) {
  return (
    <dl className="eigenschaften">
      {REIHENFOLGE.map((k) => <div key={k} style={{ display: 'contents' }}><dt>{k === 'keiner' ? t('werkbank.texterkennung.ohne-volltext-noch-nie') : OCR_STAENDE[k]}</dt><dd>{zahl(s.zaehler[k])}</dd></div>)}
    </dl>
  );
}

/**
 * Warum die Warteschlange steht (#366): ausgeschaltet oder Wartungsmodus – mit dem Knopf, der es behebt.
 * Steht bei der Texterkennung und bei „Volltext neu erzeugen“.
 */
function PauseHinweis({ t: eintrag, wartungAn }: { t: TexterkennungZustand; wartungAn?: boolean }) {
  const s = eintrag.stand!;
  const [meldung, setMeldung] = useState<string>();
  const offen = s.zaehler.wartet + s.zaehler.laeuft;
  const warten = offen ? t('werkbank.texterkennung.dokumente-warten', { anzahl: offen, zahl: zahl(offen) }) : '';
  async function einschalten() {
    try { eintrag.setStand(await api.texterkennungSpeichern({ ...s.einstellungen, aktiv: true })); } catch (e) { setMeldung((e as Error).message); }
  }
  async function wartungBeenden() {
    if (!(await rueckfrage({ titel: t('werkbank.texterkennung.wartungsmodus-beenden'), text: t('werkbank.texterkennung.alle-koennen-sich-wieder'), ja: t('werkbank.texterkennung.wartung-beenden') }))) return;
    try { await api.wartungAus(); dispatchEvent(new Event(WARTUNG_GEAENDERT)); await eintrag.laden(); } catch (e) { setMeldung((e as Error).message); }
  }
  if (!s.einstellungen.aktiv) return (
    <div className="hinweis warn hinweiszeile" role="status">
      <p>{tn('werkbank.texterkennung.neue-dokumente-bleiben-in', { b: <strong>{t('werkbank.texterkennung.die-texterkennung-ist-ausgeschaltet')}</strong>, warten, wert: meldung && <span className="fehlertext blockzeile">{meldung}</span> })}</p>
      <button type="button" className="knopf primaer klein" onClick={() => void einschalten()}>{t('werkbank.texterkennung.einschalten')}</button>
    </div>
  );
  if (wartungAn) return (
    <div className="hinweis warn hinweiszeile" role="status">
      <p><strong>{t('werkbank.texterkennung.pausiert-solange-der-wartungsmodus')}</strong>{warten}{meldung && <span className="fehlertext blockzeile">{meldung}</span>}</p>
      <button type="button" className="knopf klein" onClick={() => void wartungBeenden()}>{t('werkbank.texterkennung.wartungsmodus-beenden-2')}</button>
    </div>
  );
  return null;
}

export function TexterkennungPanel({ t: eintrag, wartungAn }: { t: TexterkennungZustand; wartungAn?: boolean }) {
  if (eintrag.fehler) return <div className="hinweis schlecht"><p>{eintrag.fehler}</p></div>;
  if (!eintrag.stand) return <p className="leise">{t('werkbank.texterkennung.lade')}</p>;
  const s = eintrag.stand;
  const w = s.werkzeuge;
  return (
    <div className="einspaltig">
      <Kopf titel={tx('volltext.werkbank.titel')} ueber={t('werkbank.texterkennung.werkbank')} hilfe="werkbank.texterkennung">
        <p className="leise">{tx('volltext.werkbank.einleitung')}</p>
      </Kopf>
      <PauseHinweis t={eintrag} wartungAn={wartungAn} />

      <PaketBlock s={s} />

      <HerkunftBlock s={s} />

      <UmwandlungBlock s={s} />

      <ArchivBlock s={s} />

      <ErkannteSprachen s={s} />

      <section className="blatt" id="warteschlange">
        <h2 className="h3">{t('werkbank.texterkennung.warteschlange')}</h2>
        <p>{tn('werkbank.texterkennung.mit-fehler', { b: <strong>{t('werkbank.texterkennung.offen', { zahl: zahl(s.zaehler.wartet + s.zaehler.laeuft) })}</strong>, zahl: zahl(s.zaehler.fehler), wert: !s.einstellungen.aktiv ? t('werkbank.texterkennung.ausgeschaltet') : wartungAn ? t('werkbank.texterkennung.pausiert-wartungsmodus') : '' })}</p>
        <Warteschlange s={s} />
        <p className="leise klein">{tx('volltext.werkbank.neu')} <Link to="/werkbank/wartung#operationen" className="verweis">{tx('volltext.werkbank.neu.link')}</Link></p>
      </section>

      <section className="blatt" id="werkzeuge">
        <h2 className="h3">{t('werkbank.texterkennung.werkzeuge')}</h2>
        <dl className="eigenschaften">
          <dt>{tx('volltext.werkbank.poppler')}</dt><dd>{w.pdftotext && w.pdftoppm ? tx('volltext.werkbank.poppler.da') : <span className="fehlertext">{tx('volltext.werkbank.poppler.fehlt')}</span>}</dd>
        </dl>
        <div className="knoepfe"><Knopf groesse="klein" laeuftText={t('werkbank.texterkennung.prueft')} onClick={async (): Promise<KnopfErgebnis> => {
          const f = await eintrag.laden(true);
          return f ? { art: 'schlecht', text: f } : { art: 'gut', text: t('werkbank.texterkennung.werkzeuge-geprueft') };
        }}>{t('werkbank.texterkennung.erneut-pruefen')}</Knopf></div>
      </section>

      <Auftraege t={eintrag} />
    </div>
  );
}

/**
 * Wer Scans und Bilder erkennt (#458, #459): das Paket (mit Link zu seinen Einstellungen) – oder der deutliche
 * Hinweis, dass es fehlt, mit dem direkten Weg zur Installation.
 */
function PaketBlock({ s }: { s: OcrStatus }) {
  const p = s.paket;
  const wartet = s.zaehler.paket ?? 0;
  return (
    <section className="blatt" id="paket">
      <h2 className="h3">{tx('volltext.werkbank.paket.titel')}</h2>
      {p ? <>
        <p>{tx('volltext.werkbank.paket.da', { paket: `${p.name} ${p.version}` })}</p>
        {wartet > 0 && <p className="leise">{tx('volltext.werkbank.paket.wartet', { anzahl: wartet })}</p>}
        <div className="knoepfe"><Link to={`/werkbank/pakete/${p.id}`} className="knopf klein">{tx('volltext.werkbank.paket.einstellungen')}</Link></div>
      </> : (
        <div className="hinweis warn hinweiszeile" role="status">
          <p><strong>{tx('volltext.werkbank.paket.fehlt')}</strong> {tx('volltext.werkbank.paket.fehlt.text')}{wartet > 0 ? ` ${tx('volltext.werkbank.paket.ohne', { anzahl: wartet })}` : ''}</p>
          <Link to={`/werkbank/pakete/${TEXTERKENNUNG_PAKET}`} className="knopf primaer klein">{tx('volltext.werkbank.paket.installieren')}</Link>
        </div>
      )}
    </section>
  );
}

/** Woher der Volltext der Dokumente kommt (#459): aus dem PDF, vom Paket, ohne Text, mit Fehler. */
function HerkunftBlock({ s }: { s: OcrStatus }) {
  const h = s.herkunft;
  if (!h) return null;
  const zeilen: Array<[string, number]> = [
    [tx('volltext.herkunft.pdf'), h.pdf],
    [tx('volltext.werkbank.herkunft.paket'), h.paket],
    ...(h.eingebaut ? [[tx('volltext.werkbank.herkunft.eingebaut'), h.eingebaut] as [string, number]] : []),
    ...(h.api ? [[tx('volltext.herkunft.api'), h.api] as [string, number]] : []),
    ...(h.sonst ? [[tx('volltext.werkbank.herkunft.sonst'), h.sonst] as [string, number]] : []),
    [OCR_STAENDE.paket, s.zaehler.paket ?? 0],
    [tx('volltext.werkbank.herkunft.ohne'), h.ohneText + s.zaehler.keiner],
    [OCR_STAENDE.fehler, s.zaehler.fehler],
  ];
  return (
    <section className="blatt" id="herkunft">
      <h2 className="h3">{tx('volltext.werkbank.herkunft.titel')}</h2>
      <dl className="eigenschaften">
        {zeilen.map(([k, n]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{zahl(n)}</dd></div>)}
      </dl>
    </section>
  );
}

/**
 * Andere Dateitypen (#577): je Typ, wie viele Dokumente es gibt und ob ein Paket sie umwandelt – sonst welches Paket
 * aus dem Katalog es könnte, mit dem Weg zur Installation.
 */
function UmwandlungBlock({ s }: { s: OcrStatus }) {
  const u = s.umwandlung;
  if (!u) return null;
  return (
    <section className="blatt" id="umwandlung">
      <h2 className="h3">{tx('volltext.werkbank.umwandlung.titel')} <Hilfe ort="werkbank.texterkennung.umwandlung" /></h2>
      <p className="leise">{tx('volltext.werkbank.umwandlung.einleitung')}</p>
      {!u.typen.length ? <p className="leise">{tx('volltext.werkbank.umwandlung.keine')}</p> : (
        <table className="tabelle klein">
          <thead><tr><th>{tx('volltext.werkbank.umwandlung.typ')}</th><th className="zahlzelle">{tx('volltext.werkbank.umwandlung.anzahl')}</th><th>{tx('volltext.werkbank.umwandlung.paket')}</th></tr></thead>
          <tbody>{u.typen.map((x) => (
            <tr key={x.mime}>
              <td>{x.name} {x.name !== x.mime && <span className="leise mono">{x.mime}</span>}</td>
              <td className="zahlzelle">{zahl(x.anzahl)}</td>
              <td>{x.paket ? <Link to={`/werkbank/pakete/${x.paket.id}`} className="verweis">{tx('volltext.werkbank.umwandlung.durch', { paket: x.paket.name })}</Link>
                : x.katalog ? <>{tx('volltext.werkbank.umwandlung.katalog', { paket: x.katalog.name })} <Link to={`/werkbank/pakete/${x.katalog.id}`} className="verweis">{tx('volltext.werkbank.umwandlung.installieren')}</Link></>
                : x.volltext || x.volltextKatalog ? null
                : <span className="leise">{tx('volltext.werkbank.umwandlung.keins')}</span>}
                {/* Volltext aus Paketen (#614): eigenes Paket für den Text, z. B. Office und E-Mail. */}
                {x.volltext && x.volltext.id !== x.paket?.id && <>{x.paket || x.katalog ? <br /> : null}<Link to={`/werkbank/pakete/${x.volltext.id}`} className="verweis">{tx('volltext.werkbank.umwandlung.volltext', { paket: x.volltext.name })}</Link></>}
                {!x.volltext && !x.paket && x.volltextKatalog && <>{x.katalog ? <br /> : null}{tx('volltext.werkbank.umwandlung.volltext-katalog', { paket: x.volltextKatalog.name })} <Link to={`/werkbank/pakete/${x.volltextKatalog.id}`} className="verweis">{tx('volltext.werkbank.umwandlung.installieren')}</Link></>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {u.typen.some((x) => (!x.paket && x.katalog) || (!x.volltext && x.volltextKatalog)) && <p className="leise klein">{tx('volltext.werkbank.umwandlung.nachholen')}</p>}
    </section>
  );
}

/** Statistik der erkannten Sprachen mit Vorschlägen für fehlende Sprach-Zusatzpakete (#395, #459). */
/** Archivfassung (PDF/A, #631): Paket, Anzahl je Stand und Dokumente mit Fehler oder ausgelassen (mit Grund). */
function ArchivBlock({ s }: { s: OcrStatus }) {
  const a = s.archivfassung;
  if (!a) return null;
  return (
    <section className="blatt" id="archivfassung">
      <h2 className="h3">{tx('volltext.werkbank.archiv.titel')} <Hilfe ort="werkbank.texterkennung.archivfassung" /></h2>
      <p className="leise">{tx('volltext.werkbank.archiv.einleitung')}</p>
      {!a.pakete.length ? <p className="leise">{tx('volltext.werkbank.archiv.keins')}</p> : <>
        <p>{a.pakete.map((p) => <Link key={p.id} to={`/werkbank/pakete/${p.id}`} className="verweis">{tx('volltext.werkbank.archiv.paket', { paket: `${p.name} ${p.version}` })}</Link>)}</p>
        <p className="klein">{tx('volltext.werkbank.archiv.zaehler', { fertig: a.zaehler.fertig, wartet: a.zaehler.wartet, ausgelassen: a.zaehler.ausgelassen, fehler: a.zaehler.fehler })}</p>
      </>}
      {/* Nachlauf der Vorschaubilder für den Bestand (#1216): Fortschritt, danach das Ergebnis des letzten Laufs. */}
      {a.vorschau && (a.vorschau.offen > 0
        ? <p className="leise klein" role="status">{tx('volltext.werkbank.archiv.vorschau', { erledigt: zahl(a.vorschau.erledigt), offen: zahl(a.vorschau.offen) })}</p>
        : a.vorschau.erledigt + a.vorschau.ohne > 0 && <p className="leise klein">{tx('volltext.werkbank.archiv.vorschau.fertig', { erledigt: zahl(a.vorschau.erledigt), ohne: zahl(a.vorschau.ohne) })}</p>)}
      {a.pakete.length > 0 && (!a.liste.length ? <p className="leise klein">{tx('volltext.werkbank.archiv.keine')}</p> : (
        <table className="tabelle klein">
          <thead><tr><th>{tx('volltext.werkbank.archiv.dokument')}</th><th>{tx('volltext.werkbank.archiv.grund')}</th></tr></thead>
          <tbody>{a.liste.map((x) => (
            <tr key={`${x.dokument}-${x.zeit}`}><td><Link to={`/ablage/eingang/${x.mappeId}?dokument=${x.dokument}`} className="verweis">{x.name}</Link></td>
              <td className={x.stand === 'fehler' ? 'fehlertext' : 'leise'}>{x.info}</td></tr>
          ))}</tbody>
        </table>
      ))}
    </section>
  );
}

function ErkannteSprachen({ s }: { s: OcrStatus }) {
  const erkannt = s.erkannteSprachen ?? {};
  const liste = Object.entries(erkannt).sort((a, b) => b[1] - a[1]);
  const da = s.paket?.sprachen;
  const vorschlaege = da ? sprachvorschlaege(erkannt, da) : [];
  return (
    <section className="blatt" id="sprachen">
      <h2 className="h3">{t('werkbank.texterkennung.erkannte-sprachen')}</h2>
      {!liste.length ? <p className="leise">{t('werkbank.texterkennung.noch-keine-die-sprache')}</p> : (
        <table className="tabelle klein">
          <thead><tr><th>{t('werkbank.texterkennung.sprache')}</th><th className="zahlzelle">{t('werkbank.texterkennung.dokumente')}</th>{da && <th>{tx('volltext.werkbank.sprachdaten')}</th>}</tr></thead>
          <tbody>{liste.map(([k, n]) => (
            <tr key={k}><td>{sprachname(k)} <span className="leise mono">{k}</span></td><td className="zahlzelle">{zahl(n)}</td>
              {da && <td>{da.includes(k) ? tx('volltext.werkbank.sprachdaten.da') : <span className="fehlertext">{tx('volltext.werkbank.sprachdaten.fehlt')}</span>}</td>}</tr>
          ))}</tbody>
        </table>
      )}
      {vorschlaege.map((v) => (
        <div key={v.sprache} className="hinweis info hinweiszeile">
          <p>{tx('volltext.werkbank.sprachdaten.vorschlag', { anzahl: v.anzahl, sprache: sprachname(v.sprache), paket: v.paket })} <Hilfe ort="werkbank.texterkennung.sprachpakete" /></p>
          <Link to={`/werkbank/pakete/${v.paket}`} className="knopf klein">{tx('volltext.werkbank.sprachdaten.paket')}</Link>
        </div>
      ))}
    </section>
  );
}

/* ---------- Wartungsoperationen ---------- */

export function WartungPanel({ t: eintrag, wartungAn, abschnitt }: { t: TexterkennungZustand; wartungAn?: boolean; abschnitt?: boolean }) {
  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.texterkennung.wartungsoperationen')} abschnitt={abschnitt} id="operationen" hilfe="werkbank.wartung">
        <p className="leise">{t('werkbank.texterkennung.arbeiten-am-ganzen-bestand')}</p>
      </Kopf>
      <VolltextNeu t={eintrag} wartungAn={wartungAn} />
      <VorschauNachholen />
      <DateienPruefen />
      <NummernNachtragen />
      <AbsenderBereinigen />
      <FormateUnpassend />
    </div>
  );
}

/**
 * „Volltext neu erzeugen“ (#458): für Dokumente ohne Text oder für alle (mit Rückfrage und Anzahl), als Auftrag mit
 * Fortschritt, abbrechbar. Ersetzt „Volltext nachholen“ (das sind die Dokumente ohne Text).
 */
function VolltextNeu({ t: eintrag, wartungAn }: { t: TexterkennungZustand; wartungAn?: boolean }) {
  const s = eintrag.stand;
  const laden = eintrag.laden;
  const [auftrag, setAuftrag] = useState<HintergrundAuftrag | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  // Läuft schon einer (z. B. nach dem Neuladen der Seite)? Dann seinen Stand zeigen.
  useEffect(() => { void api.auftrag().then((a) => { if (a?.art === 'volltext-neu') setAuftrag(a); }, () => {}); }, []);
  useEffect(() => {
    if (auftrag?.status !== 'laeuft') return;
    const x = setInterval(() => void api.auftrag().then((a) => { setAuftrag(a); if (a?.status !== 'laeuft') void laden(); }), 1000);
    return () => clearInterval(x);
  }, [auftrag?.status, laden]);
  async function starte(umfang: 'ohne' | 'alle') {
    setMeldung(undefined);
    try {
      const { anzahl } = await api.volltextNeuAnzahl(umfang);
      if (!anzahl) { setMeldung({ art: 'gut', text: tx('volltext.neu.nichts') }); return; }
      if (umfang === 'alle' && !(await rueckfrage({ titel: tx('volltext.neu.rueckfrage.titel'), text: tx('volltext.neu.rueckfrage.text', { anzahl }), ja: tx('volltext.neu.rueckfrage.ja') }))) return;
      setAuftrag(await api.volltextNeu(umfang));
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  async function abbrechen() {
    if (!auftrag) return;
    try { setAuftrag(await api.auftragAbbrechen(auftrag.id)); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  const e = auftrag?.status === 'fertig' ? auftrag.ergebnis as { dokumente: number; erledigt: number; abgebrochen: boolean } : null;
  const laeuft = auftrag?.status === 'laeuft';
  return (
    <section className="blatt" id="volltext">
      <h2 className="h3">{tx('volltext.neu.titel')} <Hilfe ort="werkbank.wartung.volltext" /></h2>
      <p className="leise">{tx('volltext.neu.text')}</p>
      {s?.paket ? <p className="leise klein">{tx('volltext.neu.dauer')}</p> : s && (
        <div className="hinweis warn hinweiszeile" role="status">
          <p>{tx('volltext.werkbank.paket.fehlt')}</p>
          <Link to={`/werkbank/pakete/${TEXTERKENNUNG_PAKET}`} className="knopf klein">{tx('volltext.werkbank.paket.installieren')}</Link>
        </div>
      )}
      {s && <PauseHinweis t={eintrag} wartungAn={wartungAn} />}
      {s && <Warteschlange s={s} />}
      {laeuft && <p className="leise" role="status">{fortschrittText(auftrag, t('werkbank.texterkennung.dokumente'))}{auftrag.abgebrochen ? ` · ${tx('volltext.neu.abgebrochen', { erledigt: auftrag.fertig, dokumente: auftrag.gesamt })}` : ''}</p>}
      {e && <p className="gutertext" role="status">{e.abgebrochen ? tx('volltext.neu.abgebrochen', { erledigt: e.erledigt, dokumente: e.dokumente }) : tx('volltext.neu.fertig', { erledigt: e.erledigt, dokumente: e.dokumente })}</p>}
      {auftrag?.status === 'fehler' && <p className="fehlertext">{auftrag.fehler}</p>}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <div className="knoepfe">
        <button type="button" className="knopf primaer" disabled={laeuft} onClick={() => void starte('ohne')}>{tx('volltext.neu.ohne')}</button>
        <button type="button" className="knopf" disabled={laeuft} onClick={() => void starte('alle')}>{tx('volltext.neu.alle')}</button>
        {laeuft && <button type="button" className="knopf gefahr-rand" disabled={auftrag.abgebrochen} onClick={() => void abbrechen()}>{auftrag.abgebrochen ? tx('volltext.neu.laeuft') : tx('volltext.neu.abbrechen')}</button>}
      </div>
    </section>
  );
}

/** Aufträge der Texterkennung (#61): je Stand die Dokumente mit Mappe, neu starten, abbrechen. */
const STAENDE_LISTE: OcrStandArt[] = ['fehler', 'wartet', 'laeuft', 'paket', 'ausgelassen', 'fertig'];
type Auftrag = Awaited<ReturnType<typeof api.ocrAuftraege>>['eintraege'][number];

function Auftraege({ t: eintrag }: { t: TexterkennungZustand }) {
  const s = eintrag.stand!;
  const [stand, setStand] = useState<OcrStandArt>(s.zaehler.fehler ? 'fehler' : s.zaehler.wartet || s.zaehler.laeuft ? 'wartet' : 'fehler');
  const [liste, setListe] = useState<{ gesamt: number; eintraege: Auftrag[] } | null>(null);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const zaehlerText = JSON.stringify(s.zaehler);
  const laden = useCallback(async () => {
    try { setListe(await api.ocrAuftraege(stand)); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }, [stand]);
  useEffect(() => { void laden(); setAuswahl(new Set()); }, [laden, zaehlerText]);
  const ids = [...auswahl];
  async function tu(f: () => Promise<string>) {
    setMeldung(undefined);
    try { const text = await f(); setMeldung({ art: 'gut', text }); setAuswahl(new Set()); await eintrag.laden(); await laden(); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }
  const umschalten = (id: string) => setAuswahl((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alle = liste?.eintraege ?? [];
  const abbrechbar = stand === 'wartet' || stand === 'laeuft' || stand === 'paket';
  return (
    <section className="blatt" id="auftraege">
      <div className="blattkopf zeile-zwischen"><h2 className="h3">{t('werkbank.texterkennung.auftraege')}</h2>
        {s.zaehler.fehler > 0 && <button type="button" className="knopf klein" onClick={() => void tu(async () => { const r = await api.ocrFehlerNeu(); return t('werkbank.texterkennung.dokumente-stehen-wieder-in', { anzahl: r.eingereiht, zahl: zahl(r.eingereiht) }); })}>{t('werkbank.texterkennung.alle-fehler-neu-starten')}</button>}
      </div>
      <div className="registertaben klein" role="tablist" aria-label={t('werkbank.texterkennung.stand')}>
        {STAENDE_LISTE.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={stand === k} className={`registertab ${stand === k ? 'an' : ''}`} onClick={() => setStand(k)}>
            {OCR_STAENDE[k]} <span className="anzahl">{zahl(s.zaehler[k])}</span>
          </button>
        ))}
      </div>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      {liste === null ? <p className="leise">{t('werkbank.texterkennung.lade')}</p> : !alle.length ? <p className="leise">{t('werkbank.texterkennung.keine-dokumente-in-diesem')}</p> : (
        <>
          <div className="tabellenrahmen festhoehe">
            <table className="auftraege">
              <thead><tr>
                <th><input type="checkbox" aria-label={t('werkbank.texterkennung.alle-waehlen')} checked={auswahl.size === alle.length} onChange={(e) => setAuswahl(e.target.checked ? new Set(alle.map((a) => a.dokument.id)) : new Set())} /></th>
                <th>{t('werkbank.texterkennung.dokument')}</th><th>{t('werkbank.texterkennung.mappe')}</th><th>{t('werkbank.texterkennung.groesse')}</th><th>{stand === 'fertig' ? t('werkbank.texterkennung.seiten') : t('werkbank.texterkennung.grund-stand')}</th><th>{t('werkbank.texterkennung.seit')}</th>
              </tr></thead>
              <tbody>{alle.map((a) => {
                const o = a.dokument.ocr;
                return (
                  <tr key={a.dokument.id} className={auswahl.has(a.dokument.id) ? 'an' : ''}>
                    <td><input type="checkbox" aria-label={t('werkbank.texterkennung.waehlen', { name: a.dokument.name })} checked={auswahl.has(a.dokument.id)} onChange={() => umschalten(a.dokument.id)} /></td>
                    <td>{a.dokument.name} <AnlageMarke d={a.dokument} /></td>
                    <td><Link to={`/ablage/${a.typId}/${a.dokument.mappeId}`} className="verweis">{a.mappeTitel || t('werkbank.texterkennung.ohne-titel')}</Link></td>
                    <td className="zahlzelle">{groesse(a.dokument.groesse)}</td>
                    <td>{stand === 'fertig' ? (o?.seiten ?? '–') : (o?.info || OCR_STAENDE[o?.stand ?? 'keiner'])}</td>
                    <td className="leise">{o?.zeit ? new Date(o.zeit).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' }) : '–'}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          {liste.gesamt > alle.length && <p className="leise klein">{t('werkbank.texterkennung.gezeigt-werden-die-neuesten', { zahl: zahl(alle.length), zahl2: zahl(liste.gesamt) })}</p>}
          <div className="knoepfe">
            {abbrechbar && <button type="button" className="knopf gefahr-rand" disabled={!ids.length} onClick={() => void tu(async () => { const r = await api.ocrAbbrechen(ids); return `${zahl(r.abgebrochen)} abgebrochen.`; })}>{stand === 'laeuft' ? t('werkbank.texterkennung.abbrechen') : t('werkbank.texterkennung.aus-der-warteschlange-nehmen')}</button>}
            <button type="button" className="knopf primaer" disabled={!ids.length} onClick={() => void tu(async () => { const r = await api.ocrNeu(ids); return t('werkbank.texterkennung.neu-gestartet', { zahl: zahl(r.eingereiht) }); })}>{t('werkbank.texterkennung.neu-starten', { wert: ids.length ? ` (${ids.length})` : '' })}</button>
          </div>
        </>
      )}
    </section>
  );
}
const groesse = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

/** Vorschaubilder der ersten Seite für vorhandene Dokumente erzeugen (#332). */
function VorschauNachholen() {
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  async function nachholen() {
    setLaeuft(true); setMeldung(undefined);
    try {
      const r = await api.vorschauNachholen();
      setMeldung({ art: 'gut', text: r.eingereiht ? t('werkbank.texterkennung.fuer-dateien-entstehen-jetzt', { anzahl: r.eingereiht, zahl: zahl(r.eingereiht) }) : t('werkbank.texterkennung.nichts-nachzuholen-alle-pdfs') });
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
    finally { setLaeuft(false); }
  }
  return (
    <section className="blatt" id="vorschau">
      <h2 className="h3">{t('werkbank.texterkennung.vorschaubilder-nachholen')}</h2>
      <p className="leise">{t('werkbank.texterkennung.neben-jedem-pdf-und')}</p>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <div className="knoepfe"><button type="button" className="knopf" disabled={laeuft} onClick={() => void nachholen()}>{laeuft ? t('werkbank.texterkennung.stelle-ein') : t('werkbank.texterkennung.vorschaubilder-nachholen')}</button></div>
    </section>
  );
}
