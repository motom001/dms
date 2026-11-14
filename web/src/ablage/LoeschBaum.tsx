import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BAUM_TIEFE_MAX, kinderVon, type BaumKnoten } from '../../../shared/src/baum';
import { datumText } from '../../../shared/src/archiv';
import { kennzeichen, KENNZEICHEN, LOESCH_TIEFE, loeschErinnerung, loeschZusammenfassung, planeLoeschung, type LoeschAktion, type LoeschKennzeichen, type LoeschVorschau } from '../../../shared/src/loeschbaum';
import { mappenApi } from '../api/mappen';
import { Symbol } from '../Symbol';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { geheZu, Link } from '../ort';
import { Feld, HakenFeld, Knopf } from '../bausteine';
import type { LoeschAnlass } from '../../../shared/src/loeschprotokoll';
import { hinweis } from '../rueckfrage';
import { titelOder } from '../seiten';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';

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
    mappenApi.loeschVorschau(mappeId, tiefe).then((x) => {
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

  // Rückfrage mit Grund fürs Löschprotokoll (#470) und dem Namen zum Eintippen – stellt der Gefahr-Knopf selbst (#1211).
  const name = titelOder(titel);
  const frage = plan && {
    titel: t('ablage.loeschbaum.mit-verknuepften-mappen', { name, wert: korb ? t('ablage.loeschbaum.in-den-papierkorb-legen') : t('ablage.loeschbaum.endgueltig-loeschen') }),
    text: <p>{loeschZusammenfassung(plan, korb)} {korb ? t('ablage.loeschbaum.im-papierkorb-laesst-sich') : t('ablage.loeschbaum.der-papierkorb-ist-ausgeschaltet')}</p>,
    ja: korb ? t('ablage.loeschbaum.in-den-papierkorb') : t('ablage.loeschbaum.endgueltig-loeschen-2'), bestaetigeMit: name, mitGrund: true as const,
  };
  async function ausfuehren(anlass?: LoeschAnlass) {
    if (!v || !plan?.loeschen.length || !anlass) return;
    setLaeuft(true); setFehler(undefined);
    try {
      const r = await mappenApi.mitVerknuepftenLoeschen(mappeId, { tiefe, auswahl, grund: anlass.grund ?? undefined, grundText: anlass.text });
      const start = r.loeschen.includes(mappeId);
      // Ist die Mappe selbst weg, erst zur Liste – sonst lädt die Ansicht sie noch einmal (404).
      if (start) geheZu(`/ablage/${sicht}`);
      await d.neuLaden();
      const erinnert = r.erinnerung ? t('ablage.loeschbaum.am-erinnert-dich-ablago', { datumText: datumText(r.erinnerung.datum) }) : '';
      await hinweis({ titel: korb ? t('ablage.loeschbaum.in-den-papierkorb-gelegt') : t('ablage.loeschbaum.endgueltig-geloescht'), text: `${loeschZusammenfassung({ ...plan, zahlen: r.zahlen }, korb, true)}${start ? '' : t('ablage.loeschbaum.selbst-bleibt', { titelOder: titelOder(titel) })}${korb ? t('ablage.loeschbaum.im-papierkorb-stellst-du') : ''}${erinnert}` });
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
    const status = weg ? t('ablage.loeschbaum.wird-geloescht') : bleibt?.weil === 'abgewaehlt' ? 'bleibt' : bleibt ? (bleibt.weil === 'entkoppelt' ? bleibt.text : t('ablage.loeschbaum.bleibt', { text: bleibt.text })) : 'bleibt';
    return (
      <li key={k.id}>
        <div className={`lb-knoten ${weg ? 'lb-weg' : 'lb-bleibt'}`}>
          {kinder.length > 0
            ? <Knopf art="link" className="lb-klapp" aria-expanded={!zu.has(k.id)} nurSymbol={t('ablage.loeschbaum.darunter', { wert: zu.has(k.id) ? t('ablage.loeschbaum.aufklappen') : t('ablage.loeschbaum.zuklappen'), kinder: kinder.length })} onClick={() => klappe(k.id)}><Symbol name="pfeil-rechts" /></Knopf>
            : <span className="lb-klapp" aria-hidden="true" />}
          <HakenFeld className="lb-haken" beschriftung={<>
              <span className="lb-zeichen" title={KENNZEICHEN[z].text} aria-label={KENNZEICHEN[z].text} role="img"><Symbol name={KENNZEICHEN[z].symbol} /></span>{' '}
              <strong>{titelOder(k.titel)}</strong> <span className="leise klein">{k.typ}{k.dokumente ? t('ablage.loeschbaum.dokumente', { anzahl: k.dokumente }) : ''}</span>
              {k.auchUeber.length > 0 && <span className="chip lb-chip" title={t('ablage.loeschbaum.auf-mehreren-wegen-erreichbar')}><Symbol name="neu-laden" /> {k.auchUeber.length}</span>}
            </>}>
            <input type="checkbox" checked={a !== 'behalten'} disabled={fest || laeuft}
              onChange={(e) => setze(k.id, e.target.checked ? (z === 'bezug' || (z === 'geteilt' && k.rechte.U) ? 'entkoppeln' : 'loeschen') : 'behalten')} />
          </HakenFeld>
          <div className="lb-status leise klein">
            <span>{status}</span>
            {z === 'geteilt' && a !== 'behalten' && !fest && (
              <Feld beschriftung={t('ablage.loeschbaum.was-mit-geschieht', { titelOder: titelOder(k.titel) })} beschriftungVerbergen>
                <select value={a} disabled={laeuft} onChange={(e) => setze(k.id, e.target.value as LoeschAktion)}>
                  {k.rechte.U && <option value="entkoppeln">{t('ablage.loeschbaum.nur-verweis-entfernen-mappe')}</option>}
                  <option value="loeschen">{t('ablage.loeschbaum.mitloeschen')}</option>
                </select>
              </Feld>
            )}
            {k.nurBezug && k.ueber && <span>{t('ablage.loeschbaum.ueber-bezug-wird-nie', { feld: k.ueber.feld })}</span>}
            {z === 'geteilt' && <span>{t('ablage.loeschbaum.haengt-auch-an')}{' '}{k.aussen.verweistAuf.slice(0, 3).map((x) => x.verborgen ? x.titel : `„${titelOder(x.titel)}“`).join(', ')}{k.aussen.anzahl.verweistAuf > 3 ? ' …' : ''}</span>}
            <Link to={`/ablage/${k.typId}/${k.id}`} className="verweis">{t('ablage.loeschbaum.oeffnen')}</Link>
          </div>
        </div>
        {kinder.length > 0 && !zu.has(k.id) && <ul className="lb-baum">{kinder.map(zeige)}</ul>}
      </li>
    );
  };

  return (
    <section className="blatt lb-blatt" aria-label={t('ablage.loeschbaum.mit-verknuepften-mappen-loeschen')}>
      <div className="blattkopf zeile-zwischen"><h2 className="h3">{tn('ablage.loeschbaum.mit-verknuepften-mappen-loeschen-2', { hilfe: <Hilfe ort="mappe.mitVerknuepften" /> })}</h2><Knopf art="link" onClick={schliessen}>{t('ablage.loeschbaum.schliessen')}</Knopf></div>
      <p className="leise klein">{t('ablage.loeschbaum.alle-mappen-die-zu', { titelOder: titelOder(titel) })}</p>
      <ul className="lb-legende klein" aria-label={t('ablage.loeschbaum.kennzeichnungen')}>
        {(Object.keys(KENNZEICHEN) as LoeschKennzeichen[]).map((x) => <li key={x}><Symbol name={KENNZEICHEN[x].symbol} /> {KENNZEICHEN[x].text}{x === 'geteilt' ? t('ablage.loeschbaum.vorschlag-nur-den-verweis') : x === 'bezug' ? t('ablage.loeschbaum.nur-der-verweis-wird') : x === 'gesperrt' || x === 'ohneRecht' ? t('ablage.loeschbaum.wird-nie-geloescht') : ''}</li>)}
      </ul>
      <div className="zeile-umbruch">
        <Feld beschriftung={t('ablage.loeschbaum.tiefe')} className="lb-tiefe">
          <select value={tiefe} disabled={laeuft} onChange={(e) => setTiefe(Number(e.target.value))}>{Array.from({ length: BAUM_TIEFE_MAX }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} {t('ablage.loeschbaum.ebenen', { anzahl: n })}</option>)}</select>
        </Feld>
        {v && v.baum.knoten.length > 1 && <>
          <Knopf art="link" groesse="klein" onClick={() => setZu(new Set())}>{t('ablage.loeschbaum.alle-aufklappen')}</Knopf>
          <Knopf art="link" groesse="klein" onClick={() => setZu(new Set(v.baum.knoten.filter((k) => k.ebene >= 1 && kinderVon(v.baum, k.id).length).map((k) => k.id)))}>{t('ablage.loeschbaum.zuklappen')}</Knopf>
        </>}
      </div>
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
      {!v ? (!fehler && <p className="leise">{t('ablage.loeschbaum.sammle')}</p>) : (
        <>
          {v.baum.knoten.length === 1 && <p className="leise">{t('ablage.loeschbaum.auf-diese-mappe-verweist')}</p>}
          {(v.baum.abgeschnitten || v.baum.tieferMoeglich || v.baum.verborgen > 0) && (
            <div className="hinweis info"><p>
              {v.baum.abgeschnitten && t('ablage.loeschbaum.sehr-viele-mappen-die', { knoten: v.baum.knoten.length.toLocaleString(gebietsschema()) })}
              {v.baum.tieferMoeglich && t('ablage.loeschbaum.es-gibt-noch-tiefere')}
              {v.baum.verborgen > 0 && t('ablage.loeschbaum.mappen-darfst-du-nicht', { anzahl: v.baum.verborgen })}
            </p></div>
          )}
          <ul className="lb-baum lb-wurzel">{zeige(v.baum.knoten[0])}</ul>
          {v.baum.knoten.filter((k) => k.gesperrt).length > 0 && (
            <p className="leise klein">{tn('ablage.loeschbaum.aufbewahrung', { symbol: <Symbol name="schloss" /> })}{' '}{v.baum.knoten.filter((k) => k.gesperrt).slice(0, 5).map((k) => t('ablage.loeschbaum.bis', { titelOder: titelOder(k.titel), datumText: datumText(k.aufbewahrenBis!) })).join(', ')}{v.baum.knoten.filter((k) => k.gesperrt).length > 5 ? ' …' : ''}.{erinnerung && <> {' '}{t('ablage.loeschbaum.bleibt-deshalb-stehen-legt', { titelOder: titelOder(titel), datumText: datumText(erinnerung.datum) })}</>}</p>
          )}
          <div className={`hinweis ${plan!.zahlen.mappen ? 'warn' : 'info'} lb-summe`} role="status"><p>{loeschZusammenfassung(plan!, korb)}</p></div>
          <div className="knoepfe">
            <Knopf onClick={schliessen} gesperrt={laeuft}>{t('ablage.loeschbaum.abbrechen')}</Knopf>
            {/* Gefahr leise mit Symbol und Rückfrage (#1210, Leitsatz 4 und 5): rot gefüllt nur in der Rückfrage. */}
            <Knopf art="gefahr" symbol="geloescht" rueckfrage={frage!} gesperrt={!plan!.zahlen.mappen} laeuft={laeuft} laeuftText={t('ablage.loeschbaum.loesche')} onClick={(_e, anlass) => ausfuehren(anlass)}>
              {korb ? t('ablage.loeschbaum.in-den-papierkorb-2') : t('ablage.loeschbaum.endgueltig-loeschen-3')}
            </Knopf>
          </div>
        </>
      )}
    </section>
  );
}
