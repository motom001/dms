import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BAUM_TIEFE_MAX, kinderVon, type BaumKnoten } from '../../../shared/src/baum';
import { datumText } from '../../../shared/src/archiv';
import { kennzeichen, KENNZEICHEN, LOESCH_TIEFE, loeschErinnerung, loeschZusammenfassung, planeLoeschung, type LoeschAktion, type LoeschKennzeichen, type LoeschVorschau } from '../../../shared/src/loeschbaum';
import { api } from '../api';
import { Symbol } from '../Symbol';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { geheZu, Link } from '../ort';
import { hinweis, rueckfrage } from '../rueckfrage';
import { titelOder } from '../seiten';

/**
 * Mappe mit allen verknüpften Mappen löschen (#424): Vorschau als Baum (Mappen, die auf diese Mappe
 * verweisen, und so weiter) mit den Kennzeichnungen (einfarbige Symbole, #425), Kästchen je Mappe, Zusammenfassung;
 * Bestätigen durch Eintippen des Namens. Alles geht als ein Vorgang in den Papierkorb.
 */
export function LoeschBaum({ mappeId, titel, sicht, schliessen, neuLaden }: { mappeId: string; titel: string; sicht: string; schliessen(): void; neuLaden(): Promise<void> }) {
  const d = useDaten();
  const [tiefe, setTiefe] = useState(LOESCH_TIEFE);
  const [v, setV] = useState<LoeschVorschau | null>(null);
  const [auswahl, setAuswahl] = useState<Record<string, LoeschAktion>>({});
  const [zu, setZu] = useState<Set<string>>(new Set());
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();

  useEffect(() => {
    let aktiv = true;
    setV(null); setFehler(undefined);
    api.loeschVorschau(mappeId, tiefe).then((x) => {
      if (!aktiv) return;
      setV(x); setAuswahl(x.vorschlag);
      // Große Bäume: ab der zweiten Ebene zugeklappt, wenn es viele sind.
      setZu(new Set(x.baum.knoten.length > 60 ? x.baum.knoten.filter((k) => k.ebene >= 1 && kinderVon(x.baum, k.id).length).map((k) => k.id) : []));
    }, (e: Error) => aktiv && setFehler(e.message));
    return () => { aktiv = false; };
  }, [mappeId, tiefe]);

  const plan = useMemo(() => (v ? planeLoeschung(v, auswahl) : null), [v, auswahl]);
  const erinnerung = useMemo(() => (v && plan ? loeschErinnerung(v, plan) : null), [v, plan]);
  const korb = (v?.papierkorbTage ?? d.zaehler.papierkorbTage ?? 0) > 0;
  const setze = (id: string, a: LoeschAktion) => setAuswahl((x) => ({ ...x, [id]: a }));
  const klappe = (id: string) => setZu((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function ausfuehren() {
    if (!v || !plan?.loeschen.length) return;
    const name = titelOder(titel);
    const ok = await rueckfrage({
      titel: `„${name}“ mit verknüpften Mappen ${korb ? 'in den Papierkorb legen' : 'endgültig löschen'}?`,
      text: <>{loeschZusammenfassung(plan, korb)} {korb ? 'Im Papierkorb lässt sich alles gemeinsam wiederherstellen – auch die entfernten Verweise.' : 'Der Papierkorb ist ausgeschaltet: Das lässt sich nicht rückgängig machen.'}</>,
      ja: korb ? 'In den Papierkorb' : 'Endgültig löschen', gefahr: true, bestaetigeMit: name,
    });
    if (!ok) return;
    setLaeuft(true); setFehler(undefined);
    try {
      const r = await api.mitVerknuepftenLoeschen(mappeId, { tiefe, auswahl });
      const start = r.loeschen.includes(mappeId);
      // Ist die Mappe selbst weg, erst zur Liste – sonst lädt die Ansicht sie noch einmal (404).
      if (start) geheZu(`/ablage/${sicht}`);
      await d.neuLaden();
      const erinnert = r.erinnerung ? ` Am ${datumText(r.erinnerung.datum)} erinnert dich das DMS unter „Zu erledigen“ daran, das Löschen zu wiederholen – dann ist die Aufbewahrungsfrist abgelaufen.` : '';
      await hinweis({ titel: korb ? 'In den Papierkorb gelegt' : 'Endgültig gelöscht', text: `${loeschZusammenfassung({ ...plan, zahlen: r.zahlen }, korb, true)}${start ? '' : ` „${titelOder(titel)}“ selbst bleibt.`}${korb ? ' Im Papierkorb stellst du alles mit „Alle wiederherstellen“ gemeinsam wieder her.' : ''}${erinnert}` });
      if (!start) { await neuLaden(); schliessen(); }
    } catch (e) { setFehler((e as Error).message); setLaeuft(false); }
  }

  const zeige = (k: BaumKnoten): ReactNode => {
    const kinder = kinderVon(v!.baum, k.id);
    const z = kennzeichen(v!, k);
    const a = auswahl[k.id] ?? 'behalten';
    const fest = z === 'gesperrt' || z === 'ohneRecht' || (z === 'bezug' && !k.rechte.U);
    const weg = plan!.loeschen.includes(k.id);
    const bleibt = plan!.bleibt[k.id];
    const status = weg ? 'wird gelöscht' : bleibt?.weil === 'abgewaehlt' ? 'bleibt' : bleibt ? (bleibt.weil === 'entkoppelt' ? bleibt.text : `bleibt – ${bleibt.text}`) : 'bleibt';
    return (
      <li key={k.id}>
        <div className={`lb-knoten ${weg ? 'lb-weg' : 'lb-bleibt'}`}>
          {kinder.length > 0
            ? <button type="button" className="lb-klapp" aria-expanded={!zu.has(k.id)} aria-label={`${zu.has(k.id) ? 'Aufklappen' : 'Zuklappen'}: ${kinder.length} darunter`} onClick={() => klappe(k.id)}>{zu.has(k.id) ? '▸' : '▾'}</button>
            : <span className="lb-klapp" aria-hidden="true" />}
          <label className="haken lb-haken">
            <input type="checkbox" checked={a !== 'behalten'} disabled={fest || laeuft}
              onChange={(e) => setze(k.id, e.target.checked ? (z === 'bezug' || (z === 'geteilt' && k.rechte.U) ? 'entkoppeln' : 'loeschen') : 'behalten')} />
            <span>
              <span className="lb-zeichen" title={KENNZEICHEN[z].text} aria-label={KENNZEICHEN[z].text} role="img"><Symbol name={KENNZEICHEN[z].symbol} /></span>{' '}
              <strong>{titelOder(k.titel)}</strong> <span className="leise klein">{k.typ}{k.dokumente ? ` · ${k.dokumente} ${k.dokumente === 1 ? 'Dokument' : 'Dokumente'}` : ''}</span>
              {k.auchUeber.length > 0 && <span className="chip lb-chip" title="Auf mehreren Wegen erreichbar (z. B. ein Kreis) – steht nur einmal im Baum">↻ {k.auchUeber.length}</span>}
            </span>
          </label>
          <div className="lb-status leise klein">
            <span>{status}</span>
            {z === 'geteilt' && a !== 'behalten' && !fest && (
              <select value={a} disabled={laeuft} aria-label={`Was mit „${titelOder(k.titel)}“ geschieht`} onChange={(e) => setze(k.id, e.target.value as LoeschAktion)}>
                {k.rechte.U && <option value="entkoppeln">nur Verweis entfernen, Mappe behalten</option>}
                <option value="loeschen">mitlöschen</option>
              </select>
            )}
            {k.nurBezug && k.ueber && <span>über „{k.ueber.feld}“ (Bezug) – wird nie mitgelöscht</span>}
            {z === 'geteilt' && <span>hängt auch an: {k.aussen.verweistAuf.slice(0, 3).map((x) => x.verborgen ? x.titel : `„${titelOder(x.titel)}“`).join(', ')}{k.aussen.anzahl.verweistAuf > 3 ? ' …' : ''}</span>}
            <Link to={`/ablage/${k.typId}/${k.id}`} className="verweis">öffnen</Link>
          </div>
        </div>
        {kinder.length > 0 && !zu.has(k.id) && <ul className="lb-baum">{kinder.map(zeige)}</ul>}
      </li>
    );
  };

  return (
    <section className="blatt lb-blatt" aria-label="Mit verknüpften Mappen löschen">
      <div className="blattkopf zeile-zwischen"><h2 className="h3">Mit verknüpften Mappen löschen <Hilfe ort="mappe.mitVerknuepften" /></h2><button type="button" className="textknopf" onClick={schliessen}>Schließen</button></div>
      <p className="leise klein">Alle Mappen, die zu „{titelOder(titel)}“ gehören – und die Mappen, die wiederum zu diesen gehören (Verweise der Art Zugehörigkeit). Mappen, die nur über einen Bezug dranhängen (z. B. Ansprechpartner), bleiben; bei ihnen wird nur der Verweis entfernt. Wähle, was mitgeht. Aufbewahrungsfristen und deine Rechte gelten immer; eine Mappe, auf die eine bleibende Mappe noch verweist, bleibt ebenfalls.</p>
      <ul className="lb-legende klein" aria-label="Kennzeichnungen">
        {(Object.keys(KENNZEICHEN) as LoeschKennzeichen[]).map((x) => <li key={x}><Symbol name={KENNZEICHEN[x].symbol} /> {KENNZEICHEN[x].text}{x === 'geteilt' ? ' – Vorschlag: nur den Verweis entfernen' : x === 'bezug' ? ' – nur der Verweis wird entfernt, die Mappe bleibt' : x === 'gesperrt' || x === 'ohneRecht' ? ' – wird nie gelöscht' : ''}</li>)}
      </ul>
      <div className="zeile-umbruch">
        <label className="inline">Tiefe <select value={tiefe} disabled={laeuft} onChange={(e) => setTiefe(Number(e.target.value))}>{Array.from({ length: BAUM_TIEFE_MAX }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} {n === 1 ? 'Ebene' : 'Ebenen'}</option>)}</select></label>
        {v && v.baum.knoten.length > 1 && <>
          <button type="button" className="textknopf klein" onClick={() => setZu(new Set())}>Alle aufklappen</button>
          <button type="button" className="textknopf klein" onClick={() => setZu(new Set(v.baum.knoten.filter((k) => k.ebene >= 1 && kinderVon(v.baum, k.id).length).map((k) => k.id)))}>Zuklappen</button>
        </>}
      </div>
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
      {!v ? (!fehler && <p className="leise">Sammle …</p>) : (
        <>
          {v.baum.knoten.length === 1 && <p className="leise">Auf diese Mappe verweist keine andere Mappe, die du sehen darfst.</p>}
          {(v.baum.abgeschnitten || v.baum.tieferMoeglich || v.baum.verborgen > 0) && (
            <div className="hinweis info"><p>
              {v.baum.abgeschnitten && `Sehr viele Mappen: Die Vorschau zeigt die ersten ${v.baum.knoten.length.toLocaleString('de-DE')}; was darüber hinaus darauf verweist, hält die betroffenen Mappen. `}
              {v.baum.tieferMoeglich && 'Es gibt noch tiefere Ebenen – was dort verweist, hält die Mappen darüber; erhöhe bei Bedarf die Tiefe. '}
              {v.baum.verborgen > 0 && `${v.baum.verborgen} ${v.baum.verborgen === 1 ? 'Mappe darfst' : 'Mappen darfst'} du nicht sehen; was sie verweisen, bleibt.`}
            </p></div>
          )}
          <ul className="lb-baum lb-wurzel">{zeige(v.baum.knoten[0])}</ul>
          {v.baum.knoten.filter((k) => k.gesperrt).length > 0 && (
            <p className="leise klein"><Symbol name="schloss" /> Aufbewahrung: {v.baum.knoten.filter((k) => k.gesperrt).slice(0, 5).map((k) => `„${titelOder(k.titel)}“ bis ${datumText(k.aufbewahrenBis!)}`).join(', ')}{v.baum.knoten.filter((k) => k.gesperrt).length > 5 ? ' …' : ''}.{erinnerung && <> Bleibt „{titelOder(titel)}“ deshalb stehen, legt das DMS dir eine Erinnerung zum {datumText(erinnerung.datum)} an.</>}</p>
          )}
          <div className={`hinweis ${plan!.zahlen.mappen ? 'warn' : 'info'} lb-summe`} role="status"><p>{loeschZusammenfassung(plan!, korb)}</p></div>
          <div className="knoepfe">
            <button type="button" className="knopf" onClick={schliessen} disabled={laeuft}>Abbrechen</button>
            <button type="button" className="knopf gefahr" disabled={laeuft || !plan!.zahlen.mappen} onClick={() => void ausfuehren()}>
              {laeuft ? 'Lösche …' : korb ? 'In den Papierkorb …' : 'Endgültig löschen …'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
