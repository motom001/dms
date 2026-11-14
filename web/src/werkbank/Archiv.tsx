import { useCallback, useEffect, useState } from 'react';
import { ErgebnisBlock, FeldGruppe, HakenFeld, Knopf } from '../bausteine';
import type { LoeschAnlass } from '../../../shared/src/loeschprotokoll';
import type { Auftrag } from '../../../shared/src/auftrag';
import { betriebApi } from '../api/betrieb';
import { datenschutzApi } from '../api/datenschutz';
import { mappenApi } from '../api/mappen';
import { useDaten } from '../daten';
import { Link } from '../ort';
import { Hilfe } from '../Hilfe';
import { datumText } from '../../../shared/src/archiv';
import { titelOder } from '../seiten';
import { fortschrittText } from '../../../shared/src/auftrag';
import { t } from '../sprache';
import { Kopf } from './Kopf';

/** Werkbank → Aufbewahrung abgelaufen (#212, bis #725 „Darf weg“): Mappen im Archivmodus, deren Aufbewahrungsfrist abgelaufen ist. */

type Eintrag = Awaited<ReturnType<typeof datenschutzApi.darfWeg>>[number];

export function useDarfWeg(offen: boolean) {
  const [liste, setListe] = useState<Eintrag[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setListe(await datenschutzApi.darfWeg()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  // Erst beim Öffnen laden; die Zahl links kommt bis dahin aus der Übersicht (#375).
  useEffect(() => { if (offen) void laden(); }, [laden, offen]);
  return { liste, fehler, laden };
}
export type DarfWegZustand = ReturnType<typeof useDarfWeg>;

export function DarfWegPanel({ z }: { z: DarfWegZustand }) {
  const d = useDaten();
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const liste = z.liste ?? [];
  const alle = liste.length > 0 && gewaehlt.size === liste.length;
  // Löschprotokoll (#470): Grund „Frist abgelaufen“ vorgeschlagen – die Rückfrage samt Grund stellt der Knopf.
  async function loeschen(anlass?: LoeschAnlass) {
    const ids = liste.filter((m) => gewaehlt.has(m.id)).map((m) => m.id);
    if (!ids.length || !anlass) return;
    setMeldung(undefined);
    const fehler: string[] = [];
    for (const id of ids) { try { await mappenApi.mappeLoeschen(id, anlass); } catch (e) { fehler.push((e as Error).message); } }
    setGewaehlt(new Set());
    setMeldung(fehler.length ? { art: 'schlecht', text: t('werkbank.archiv.geloescht-nicht', { wert: ids.length - fehler.length, fehler: fehler.length, fehler2: fehler[0] }) } : { art: 'gut', text: t('werkbank.archiv.geloescht', { ids: ids.length }) });
    await z.laden(); await d.neuLaden();
  }
  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.archiv.aufbewahrung-abgelaufen')} ueber={t('werkbank.archiv.werkbank')} hilfe="werkbank.aufbewahrung">
        <p className="leise">{t('werkbank.archiv.mappen-aus-mappentypen-im')}</p>
      </Kopf>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {!z.liste ? <p className="leise">{t('werkbank.archiv.lade')}</p> : !liste.length && <p className="leise">{t('werkbank.archiv.nichts-keine-frist-ist')}</p>}
      {liste.length > 0 && (
        <div className="blatt">
          <HakenFeld beschriftung={gewaehlt.size ? t('werkbank.archiv.von-ausgewaehlt', { size: gewaehlt.size, liste: liste.length }) : t('werkbank.archiv.alle-auswaehlen')}>
            <input type="checkbox" checked={alle} onChange={() => setGewaehlt(alle ? new Set() : new Set(liste.map((m) => m.id)))} />
          </HakenFeld>
          <FeldGruppe beschriftung={t('werkbank.archiv.aufbewahrung-abgelaufen')} beschriftungVerbergen>
            <ul className="stapel">
              {liste.map((m) => (
                <li key={m.id}><label className="haken"><input type="checkbox" checked={gewaehlt.has(m.id)} onChange={(e) => setGewaehlt((x) => { const n = new Set(x); if (e.target.checked) n.add(m.id); else n.delete(m.id); return n; })} />
                  <span><Link to={`/ablage/${m.typId}/${m.id}`} className="verweis">{titelOder(m.titel)}</Link> <small className="leise">{t('werkbank.archiv.frist-abgelaufen-am', { typ: m.typ, datumText: datumText(m.aufbewahrenBis) })}</small></span></label></li>
              ))}
            </ul>
          </FeldGruppe>
          <div className="knoepfe">
            <Knopf art="gefahr" symbol="geloescht" gesperrt={!gewaehlt.size} laeuftText={t('werkbank.archiv.loesche')} onClick={(_e, anlass) => loeschen(anlass)}
              rueckfrage={{ titel: t('werkbank.archiv.diese-mappen-loeschen', { anzahl: gewaehlt.size }), text: t('werkbank.archiv.mit-eingeschaltetem-papierkorb'), ja: t('werkbank.archiv.loeschen'), mitGrund: 'frist' }}>
              {t('werkbank.archiv.ausgewaehlte-loeschen')}</Knopf>
          </div>
        </div>
      )}
    </div>
  );
}

/** Wartung (#212): jede Datei gegen ihren Prüfwert. */
export function DateienPruefen() {
  const [auftrag, setAuftrag] = useState<Auftrag | null>(null);
  useEffect(() => {
    if (auftrag?.status !== 'laeuft') return;
    const timer = setInterval(() => void betriebApi.auftrag().then(setAuftrag), 1000);
    return () => clearInterval(timer);
  }, [auftrag?.status]);
  const e = auftrag?.status === 'fertig' && auftrag.art === 'dateien-pruefen'
    ? auftrag.ergebnis as { dateien: number; abweichungen: Array<{ sha256: string; grund: string; dokumente: Array<{ name: string; mappeId: string; version: number }> }> } : null;
  return (
    <section className="blatt" id="dateien">
      <h2 className="h3">{t('werkbank.archiv.alle-dateien-pruefen')} <Hilfe ort="werkbank.dateienpruefen" /></h2>
      <p className="leise">{t('werkbank.archiv.liest-jede-gespeicherte-datei')}</p>
      <div className="knoepfe"><Knopf art="haupt" laeuft={auftrag?.status === 'laeuft'} onClick={async () => setAuftrag(await betriebApi.dateienPruefen())}>{t('werkbank.archiv.jetzt-pruefen')}</Knopf></div>
      {/* Fortschritt und Ergebnis unter dem Knopf (#986): darüber verschiebt sich nichts. */}
      <ErgebnisBlock anlass={auftrag?.status === 'laeuft' ? null : auftrag}>
        {auftrag?.status === 'laeuft' && <p className="leise">{fortschrittText(auftrag, t('werkbank.archiv.dateien'))}</p>}
        {e && (e.abweichungen.length
          ? <div className="hinweis schlecht"><p>{t('werkbank.archiv.von-dateien-weichen-ab', { abweichungen: e.abweichungen.length, dateien: e.dateien })}</p>
              <ul>{e.abweichungen.map((a) => <li key={a.sha256}>{a.grund}: {a.dokumente.map((x, i) => <span key={i}>{i > 0 && ', '}<Link to={`/ablage/eingang/${x.mappeId}`} className="verweis">{x.name}</Link>{x.version > 1 ? t('werkbank.archiv.version', { version: x.version }) : ''}</span>)}</li>)}</ul></div>
          : <p className="gutertext">{t('werkbank.archiv.alle-dateien-sind-in', { dateien: e.dateien })}</p>)}
        {auftrag?.status === 'fehler' && <p className="fehlertext">{auftrag.fehler}</p>}
      </ErgebnisBlock>
    </section>
  );
}
