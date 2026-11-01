import { useCallback, useEffect, useState } from 'react';
import { abwesenheitWirkt, AUFGABENARTEN, KEINE_ABWESENHEIT, type Abwesenheit, type Aufgabe, type Aufgabenart } from '../../../shared/src/model';
import { FAELLIGKEITEN, filterAktiv, filtereAufgaben, type AufgabenFilter, type Faelligkeit } from '../../../shared/src/aufgabenfilter';
import { BenutzerWahl } from '../ablage/Aufgaben';
import { SammelHaken, SammelKopf, SammelLeiste, useSammelauswahl } from '../ablage/Sammelweitergabe';
import { Link } from '../ort';
import { titelOder } from '../seiten';
import { heuteIn } from '../../../shared/src/sichten';
import { api } from '../api';
import { useDaten } from '../daten';
import { useKonto } from '../konto';
import { Hilfe } from '../Hilfe';
import type { Hilfeort } from '../../../shared/src/hilfe';

/** Abwesenheit mit Vertreter (#78): Formular für das eigene Profil und für Administratoren in der Werkbank. */
const datum = (t: string | null) => (t ? t.split('-').reverse().join('.') : '');

export function zeitraumText(a: Abwesenheit): string {
  return a.von && a.bis ? `vom ${datum(a.von)} bis ${datum(a.bis)}` : a.von ? `ab ${datum(a.von)}` : a.bis ? `bis ${datum(a.bis)}` : 'ohne Enddatum';
}

export function AbwesenheitFormular({ benutzerId, wer, wert, offeneAufgaben, speichern, uebergeben, nachSpeichern, hilfe = 'profil.abwesenheit' }: {
  benutzerId: string; wer: 'du' | string; wert: Abwesenheit; offeneAufgaben: number; hilfe?: Hilfeort;
  speichern: (a: Abwesenheit) => Promise<unknown>; uebergeben: () => Promise<{ uebergeben: number }>; nachSpeichern?: () => Promise<void>;
}) {
  const d = useDaten();
  const [a, setA] = useState<Abwesenheit>(wert);
  useEffect(() => setA(wert), [JSON.stringify(wert)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const geaendert = JSON.stringify(a) !== JSON.stringify(wert);
  const vertreter = d.personen.find((p) => p.id === wert.vertreterId);
  const kandidaten = d.personen.filter((p) => p.aktiv !== false && p.id !== benutzerId);
  const du = wer === 'du';
  const wirkt = abwesenheitWirkt(wert, heuteIn());

  async function tu(f: () => Promise<string>) {
    setSendet(true); setMeldung(undefined);
    try { setMeldung({ art: 'gut', text: await f() }); await d.neuLaden(); await nachSpeichern?.(); }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
    finally { setSendet(false); }
  }

  return (
    <form className="blatt" onSubmit={(e) => { e.preventDefault(); void tu(async () => { await speichern(a); return a.an ? 'Abwesenheit gespeichert.' : 'Abwesenheit ausgeschaltet.'; }); }}>
      <h2 className="h3">Abwesenheit <Hilfe ort={hilfe} /></h2>
      <p className="leise">Solange {du ? 'du' : wer} abwesend {du ? 'bist' : 'ist'}, gehen neue Aufgaben – von Hand vergebene, Erwähnungen und „passt nicht“ – an den Vertreter. Er bekommt dazu einen Hinweis unter „Zu erledigen“. Mit Zeitraum wirkt sie nur von–bis (jeweils einschließlich) und endet danach von selbst; ohne Datum, bis du sie ausschaltest.</p>
      {wert.an && <div className={`hinweis ${wirkt ? 'warn' : 'info'}`}><p>{du ? 'Du bist' : `${wer} ist`} {wirkt ? 'abwesend' : 'demnächst abwesend'} – {zeitraumText(wert)}, vertreten durch {vertreter?.name ?? '–'}.</p></div>}
      <label className="haken"><input type="checkbox" checked={a.an} onChange={(e) => setA({ ...a, an: e.target.checked })} /><span>Abwesend</span></label>
      {/* #419: Die Abwesenheit leitet nur neue Aufgaben um – auf die vorhandenen hinweisen. */}
      {du && a.an && !wert.an && offeneAufgaben > 0 && (
        <div className="hinweis info hinweiszeile"><p>Du hast {offeneAufgaben === 1 ? 'eine offene Aufgabe' : `${offeneAufgaben} offene Aufgaben`}. Neue Aufgaben gehen an den Vertreter – die bestehenden bleiben bei dir, bis du sie weitergibst.</p>
          <a href="#meine-aufgaben" className="knopf klein" onClick={(e) => { e.preventDefault(); document.getElementById('meine-aufgaben')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Zu meinen Aufgaben</a></div>
      )}
      <div className="raster">
        <label className="eigenschaft"><span>Von <small>optional</small></span><input type="date" value={a.von ?? ''} onChange={(e) => setA({ ...a, von: e.target.value || null })} /></label>
        <label className="eigenschaft"><span>Bis <small>optional, einschließlich</small></span><input type="date" value={a.bis ?? ''} min={a.von ?? undefined} onChange={(e) => setA({ ...a, bis: e.target.value || null })} /></label>
        <label className="eigenschaft"><span>Vertreter <small>{a.an ? 'Pflicht' : 'bleibt für das nächste Mal hinterlegt'}</small></span>
          <select value={a.vertreterId ?? ''} onChange={(e) => setA({ ...a, vertreterId: e.target.value || null })}>
            <option value="">– wählen –</option>
            {kandidaten.map((p) => <option key={p.id} value={p.id}>{p.name}{p.abwesend ? ` (${p.abwesend.wirkt ? 'abwesend' : 'demnächst abwesend'})` : ''}</option>)}
          </select></label>
      </div>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <div className="knoepfe">
        {wert.vertreterId && offeneAufgaben > 0 && (
          <button type="button" className="knopf" disabled={sendet || geaendert} title={geaendert ? 'Erst speichern' : undefined}
            onClick={() => void tu(async () => { const r = await uebergeben(); return `${r.uebergeben} ${r.uebergeben === 1 ? 'Aufgabe' : 'Aufgaben'} an ${vertreter?.name ?? 'den Vertreter'} gegeben.`; })}>
            Alle {offeneAufgaben} offenen Aufgaben an {vertreter?.name ?? 'Vertreter'} geben
          </button>
        )}
        <button className="knopf primaer" disabled={sendet || !geaendert}>{sendet ? 'Speichere …' : 'Speichern'}</button>
      </div>
    </form>
  );
}

/** Profil → Abwesenheit (/profil/abwesenheit). */
export function MeineAbwesenheit() {
  const { ich, aktualisieren } = useKonto();
  const [stand, setStand] = useState<{ abwesenheit: Abwesenheit | null; offeneAufgaben: number } | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [neu, setNeu] = useState(0);
  const laden = async () => { try { setStand(await api.abwesenheit()); } catch (e) { setFehler((e as Error).message); } };
  useEffect(() => { void laden(); }, []);
  return (
    <div className="einspaltig schmal">
      <div className="mappenkopf">
        <p className="ueber">Profil · Abwesenheit</p>
        <h1>{ich.name || ich.email}</h1>
      </div>
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
      {!stand ? <p className="leise">Lade …</p> : (
        <AbwesenheitFormular benutzerId={ich.id} wer="du" wert={stand.abwesenheit ?? KEINE_ABWESENHEIT} offeneAufgaben={stand.offeneAufgaben}
          speichern={(a) => api.abwesenheitSetzen(a)} uebergeben={() => api.aufgabenAnVertreter()}
          nachSpeichern={async () => { await laden(); await aktualisieren(); setNeu((n) => n + 1); }} />
      )}
      {stand && <MeineOffenenAufgaben key={neu} vertreter={stand.abwesenheit?.vertreterId ?? null} geaendert={laden} />}
    </div>
  );
}

const tag = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('de-DE');

/**
 * Meine offenen Aufgaben (#419): dieselbe Liste wie in Werkbank → Aufgaben, aber nur die eigenen – mit Filter und
 * Mehrfachauswahl, um sie vor dem Urlaub einzeln, gruppenweise oder alle weiterzugeben (gleiche Sammel-API wie #415).
 */
function MeineOffenenAufgaben({ vertreter, geaendert }: { vertreter: string | null; geaendert: () => Promise<void> }) {
  const { ich } = useKonto();
  const d = useDaten();
  const [alle, setAlle] = useState<Aufgabe[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [f, setF] = useState<AufgabenFilter>({});
  const laden = useCallback(async () => {
    try { setAlle((await api.meineAufgaben()).filter((a) => a.empfaengerId === ich.id)); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, [ich.id]);
  useEffect(() => { void laden(); }, [laden]);
  const liste = filtereAufgaben(alle ?? [], f, { jetzt: new Date(), ohneVertretung: () => false });
  const wahl = useSammelauswahl(liste.map((a) => a.id));
  const titelVon = (id: string) => { const a = alle?.find((x) => x.id === id); return a ? `${titelOder(a.mappeTitel)} – ${a.text}` : 'Aufgabe'; };
  const nachher = async () => { await laden(); await geaendert(); await d.neuLaden(); };
  async function einzeln(a: Aufgabe, an: string) {
    setFehler(undefined);
    try { await api.aufgabeDelegieren(a.id, an); await nachher(); } catch (e) { setFehler((e as Error).message); }
  }
  return (
    <section className="blatt" id="meine-aufgaben">
      <h2 className="h3">Meine offenen Aufgaben</h2>
      <p className="leise">Was gerade bei dir liegt. Vor dem Urlaub gibst du es einzeln, in Gruppen oder alles auf einmal weiter – zum Beispiel drei an Anna, vier an Paul und den Rest an deinen Vertreter. Jede Weitergabe steht in der Historie der Mappe.</p>
      {alle === null ? <p className="leise">Lade …</p> : !alle.length ? <p className="leise">Du hast keine offenen Aufgaben.</p> : <>
        <div className="aufgabenfilter stapel">
          <input type="search" aria-label="Im Titel suchen" placeholder="Im Titel suchen …" value={f.text ?? ''} onChange={(e) => setF({ ...f, text: e.target.value || undefined })} />
          <div className="filterraster">
            <label className="eigenschaft klein"><span>Art</span>
              <select value={f.art ?? ''} onChange={(e) => setF({ ...f, art: (e.target.value || undefined) as Aufgabenart | undefined })}>
                <option value="">alle</option>
                {Object.entries(AUFGABENARTEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <label className="eigenschaft klein"><span>Mappentyp</span>
              <select value={f.typ ?? ''} onChange={(e) => setF({ ...f, typ: e.target.value || undefined })}>
                <option value="">alle</option>
                {d.typen.filter((t) => alle.some((a) => a.typId === t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></label>
            <label className="eigenschaft klein"><span>Fälligkeit</span>
              <select value={f.faellig ?? ''} onChange={(e) => setF({ ...f, faellig: (e.target.value || undefined) as Faelligkeit | undefined })}>
                <option value="">alle</option>
                {Object.entries(FAELLIGKEITEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
          </div>
          <p className="listenzahl leise klein" role="status">
            {filterAktiv(f) ? `${liste.length} von ${alle.length}` : alle.length} {alle.length === 1 ? 'Aufgabe' : 'Aufgaben'}
            {filterAktiv(f) && <> · <button type="button" className="verweis" onClick={() => setF({})}>Filter zurücksetzen</button></>}
          </p>
          <SammelKopf s={wahl} />
        </div>
        <SammelLeiste s={wahl} titel={titelVon} vorschlag={vertreter} ohne={ich.id} nachher={nachher} />
        {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
        {!liste.length ? <p className="leise">Keine Aufgabe passt zum Filter.</p> : (
          <ul className="mappenliste sammel-liste">
            {liste.map((a) => (
              <li key={a.id} className={`mit-haken${wahl.ist(a.id) ? ' gewaehlt' : ''}`}>
                <SammelHaken s={wahl} id={a.id} titel={`${titelOder(a.mappeTitel)}: ${a.text}`} />
                <Link to={`/ablage/${a.typId}/${a.mappeId}`} className="eintrag">
                  <span className="titel">{titelOder(a.mappeTitel)}</span>
                  <span className="unter">{d.typ(a.typId ?? '')?.name} · {AUFGABENARTEN[a.art]}{a.datum ? ` · ${tag(a.datum)}` : ''}</span>
                  <span className="unter">{a.text}</span>
                </Link>
                <div className="aufgabenzeile">
                  <span className="leise klein">weitergeben an</span>
                  <BenutzerWahl label={`Aufgabe „${a.text}“ weitergeben an`} wert="" setze={(an) => { if (an) void einzeln(a, an); }} ohne={ich.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </>}
    </section>
  );
}
