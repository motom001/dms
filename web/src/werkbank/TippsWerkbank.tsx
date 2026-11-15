import { useCallback, useEffect, useState } from 'react';
import { TIPP_BEREICHE, TIPP_TEXT_MAX } from '../../../shared/src/entdecken';
import { EIGEN, type FeldFehler, type TippDaten, type WerkbankTipp, type WerkbankTippsStand } from '../../../shared/src/entdecken-werkbank';
import type { Fundquelle } from '../../../shared/src/listensuche';
import { tippsApi } from '../api/rundgaenge';
import { Feld, FeldGruppe, Fundstellen, Hervorgehoben, KeineTreffer, Knopf, KnopfLink, ListenSuche, PaketChip, PaketFilter, Schalter, Speicherleiste, useEntwurf, useListenSuche } from '../bausteine';
import { holeAnker, tippProbe, zielZeigen } from '../entdecken/werkzeuge';
import { Listenkopf } from '../Listenkopf';
import { geheZu, Link, loeseWache } from '../ort';
import { t } from '../sprache';
import { Symbol } from '../Symbol';

/**
 * Werkbank → Tipps (#942), dreiteilig wie die übrigen Sammlungen. In der Mitte alle Tipps – von Ablago, aus Paketen und
 * eigene – mit Herkunft, Bereich, für wen, „angepasst“ und kleiner Suche; rechts das Formular (kein YAML): Text mit
 * Zähler, Bereich, Ziel (Stelle mit „Ziel zeigen“ oder Rundgang), für wen, optional Mappentyp; Vorschau wie im
 * Assistenten und „Ausprobieren“. Tipps von Ablago und aus Paketen werden angepasst: getrennt gespeichert, das Original
 * bleibt, „Auf Original zurücksetzen“, Hinweis mit Vergleich, wenn sich das Original geändert hat. An/aus gilt für alle.
 */

export const TIPPS_PFAD = '/werkbank/tipps';
const pfad = (schluessel: string) => `${TIPPS_PFAD}/${encodeURIComponent(schluessel)}`;

export function useTippsWerkbank(offen: boolean) {
  const [stand, setStand] = useState<WerkbankTippsStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await tippsApi.stand()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  return { stand, fehler, laden };
}
export type TippsZustand = ReturnType<typeof useTippsWerkbank>;

const paketId = (x: WerkbankTipp) => (x.herkunft.startsWith('paket:') ? x.herkunft.slice(6) : null);
const bereichName = (b: string) => t.frei(`entdecken.bereich.${b}`);

function quellen(x: WerkbankTipp): Fundquelle[] {
  return [{ wo: '', text: x.daten.text, titel: true }, { wo: t('werkbank.tipps.ui.bereich'), text: bereichName(x.daten.bereich) }, { wo: t('werkbank.rundgaenge.ui.fund.herkunft'), text: x.paketName ?? '' }];
}

/** Mitte: alle Tipps mit Suche und Filter nach Herkunft. */
export function TippsListe({ z, offen }: { z: TippsZustand; offen?: string }) {
  const liste = z.stand?.tipps ?? [];
  const such = useListenSuche(liste, { quellen, herkunft: (x) => paketId(x) ?? (x.herkunft === 'ablago' ? 'ablago' : null) });
  const pakete = such.paketeDa.map((id) => ({ id, name: id === 'ablago' ? t('werkbank.rundgaenge.ui.herkunft.ablago') : liste.find((x) => paketId(x) === id)?.paketName ?? id }));
  return (
    <>
      <Listenkopf titel={t('werkbank.tipps.ui.titel')} hilfe="werkbank.tipps" beschreibung={t('werkbank.tipps.ui.beschreibung')}>
        <KnopfLink to={`${TIPPS_PFAD}/neu`} art="anlegen" groesse="klein">{t('werkbank.tipps.ui.neu')}</KnopfLink>
      </Listenkopf>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {liste.length > 0 && (
        <ListenSuche wert={such.eingabe} setze={such.setEingabe} beschriftung={t('werkbank.tipps.ui.suche.beschriftung')} platzhalter={t('werkbank.tipps.ui.suche.platzhalter')}
          treffer={such.treffer.length} aktiv={such.aktiv} anzahl={t('werkbank.tipps.ui.anzahl', { anzahl: liste.length })}
          filter={<PaketFilter wert={such.paket} setze={such.setPaket} pakete={pakete} eigene={such.eigeneDa} beschriftung={t('werkbank.rundgaenge.ui.herkunft')} />} />
      )}
      {!z.stand ? <p className="leise">{t('werkbank.tipps.ui.lade')}</p>
        : !such.treffer.length && offen !== 'neu' ? <KeineTreffer zuruecksetzen={such.zuruecksetzen} /> : (
          <ul className="mappenliste">
            {offen === 'neu' && <li><span className="eintrag an werk"><span className="titel">{t('werkbank.tipps.ui.neuer')}</span><span className="unter">{t('werkbank.rundgaenge.ui.ungespeichert')}</span></span></li>}
            {such.treffer.map(({ eintrag: x, titel, funde }) => (
              <li key={x.schluessel}><Link to={pfad(x.schluessel)} className={`eintrag werk ${offen === x.schluessel ? 'an' : ''} ${x.an ? '' : 'ausgeblendet'}`}>
                <span className="titel"><Hervorgehoben teile={titel} text={x.daten.text} />
                  <PaketChip paket={x.herkunft === 'ablago' ? 'ablago' : paketId(x) ? { id: paketId(x)!, name: x.paketName } : null} inLink /></span>
                <span className="unter">{[bereichName(x.daten.bereich), t.frei(`werkbank.rundgaenge.ui.fuer.${x.daten.fuer}`), x.angepasst ? t('werkbank.tipps.ui.angepasst') : null, x.an ? null : t('werkbank.rundgaenge.ui.aus')].filter(Boolean).join(' · ')}</span>
                {x.fehler && <span className="problem">{t('werkbank.rundgaenge.ui.ungueltig')}</span>}
                <Fundstellen funde={funde.filter((f) => f.wo !== t('werkbank.tipps.ui.bereich'))} />
              </Link></li>
            ))}
          </ul>
        )}
    </>
  );
}

/** Rechts: neuer Tipp oder das Formular eines Tipps. */
export function TippsRechts({ z, schluessel }: { z: TippsZustand; schluessel?: string }) {
  if (!schluessel) return <div className="platzhalter"><p>{t('werkbank.tipps.ui.waehlen')}</p></div>;
  if (!z.stand) return z.fehler ? <div className="leer"><p>{z.fehler}</p></div> : <p className="leise">{t('werkbank.tipps.ui.lade')}</p>;
  if (schluessel === 'neu') return <TippFormular key="neu" z={z} stand={z.stand} />;
  const x = z.stand.tipps.find((y) => y.schluessel === schluessel);
  if (!x) return <div className="leer"><p>{t('werkbank.tipps.fehler.gibt-es-nicht')}</p></div>;
  return <TippFormular key={`${x.schluessel}-${x.geaendert ?? ''}`} z={z} stand={z.stand} tipp={x} />;
}

const LEER: TippDaten = { text: '', bereich: 'mappen', fuer: 'lesen' };

function TippFormular({ z, stand, tipp }: { z: TippsZustand; stand: WerkbankTippsStand; tipp?: WerkbankTipp }) {
  const neu = !tipp;
  const eigen = !tipp || tipp.herkunft === EIGEN;
  const start = tipp?.daten ?? LEER;
  const [basis, setBasis] = useState(start);
  const [d, setD] = useState<TippDaten>(start);
  const [art, setArt] = useState<'stelle' | 'rundgang'>(start.rundgang ? 'rundgang' : 'stelle');
  const [fehler, setFehler] = useState<FeldFehler[]>([]);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const zuruecksetzen = () => { setD(basis); setArt(basis.rundgang ? 'rundgang' : 'stelle'); setFehler([]); setMeldung(undefined); };
  const ent = useEntwurf(JSON.stringify(basis), JSON.stringify(d), { neu, liste: TIPPS_PFAD, zuruecksetzen });
  const setze = (x: Partial<TippDaten>) => { setD({ ...d, ...x }); setFehler([]); };
  const typ = stand.typen.find((x) => x.kennung === d.typ);
  const feldFehler = (feld: string) => fehler.filter((f) => f.feld === feld).map((f) => f.text).join(' ') || undefined;
  const ohneFeld = fehler.filter((f) => !f.feld || !['text', 'bereich', 'ziel', 'rundgang', 'typ', 'fuer'].includes(f.feld));
  // Genau eines: Stelle oder Rundgang.
  const daten = (): TippDaten => { const { ziel, rundgang, ...rest } = d; return art === 'stelle' ? { ...rest, ...(ziel ? { ziel } : {}) } : { ...rest, ...(rundgang ? { rundgang } : {}) }; };

  async function speichern() {
    setSendet(true); setMeldung(undefined);
    try {
      const x = neu ? await tippsApi.neu(daten()) : await tippsApi.aendern(tipp.schluessel, daten(), tipp.geaendert);
      await z.laden(); loeseWache(); setBasis(d);
      if (neu) { geheZu(pfad(x.schluessel), true); return; }
      setMeldung({ art: 'gut', text: t('werkbank.tipps.ui.gespeichert') });
    } catch (x) {
      const f = (x as { details?: { fehler?: FeldFehler[] } }).details?.fehler;
      if (f) setFehler(f); else setMeldung({ art: 'schlecht', text: (x as Error).message });
      if ((x as { status?: number }).status === 409) await z.laden();
    } finally { setSendet(false); }
  }
  const ausprobieren = async () => { const m = await probieren(daten(), stand); if (m) setMeldung({ art: 'schlecht', text: m }); };

  return (
    <form className="einspaltig" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten} noValidate>
      <Kopf z={z} tipp={tipp} />
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p></div>}
      {tipp?.fehler && <div className="hinweis schlecht"><p>{t('werkbank.tipps.ui.ungueltig', { grund: tipp.fehler.join(' ') })}</p></div>}
      {tipp && !eigen && <Anpassung z={z} tipp={tipp} setMeldung={setMeldung} />}
      <div className="blatt stapel">
        <Feld beschriftung={t('werkbank.tipps.ui.text')} hinweis={t('werkbank.tipps.ui.text.hinweis', { anzahl: d.text.length })} fehler={feldFehler('text')}>
          <textarea value={d.text} maxLength={TIPP_TEXT_MAX} rows={3} onChange={(e) => setze({ text: e.target.value })} />
        </Feld>
        <Feld beschriftung={t('werkbank.tipps.ui.bereich')} hinweis={t('werkbank.tipps.ui.bereich.hinweis')} fehler={feldFehler('bereich')}>
          <select value={d.bereich} onChange={(e) => setze({ bereich: e.target.value as TippDaten['bereich'] })}>{TIPP_BEREICHE.map((b) => <option key={b} value={b}>{bereichName(b)}</option>)}</select>
        </Feld>
        <FeldGruppe beschriftung={t('werkbank.tipps.ui.ziel.art')}>
          <label className="haken"><input type="radio" name="tipp-ziel" checked={art === 'stelle'} onChange={() => setArt('stelle')} /> {t('werkbank.tipps.ui.ziel.stelle')}</label>
          <label className="haken"><input type="radio" name="tipp-ziel" checked={art === 'rundgang'} onChange={() => setArt('rundgang')} /> {t('werkbank.tipps.ui.ziel.rundgang')}</label>
        </FeldGruppe>
        {art === 'stelle' ? <ZielWahl d={d} stand={stand} typName={typ?.name} setze={setze} fehler={feldFehler('ziel')} setMeldung={setMeldung} />
          : (
            <Feld beschriftung={t('werkbank.tipps.ui.rundgang')} fehler={feldFehler('rundgang')}>
              <select value={d.rundgang ?? ''} onChange={(e) => setze({ rundgang: e.target.value || undefined })}>
                <option value="">{t('werkbank.tipps.ui.rundgang.waehlen')}</option>
                {stand.rundgaenge.map((r) => <option key={r.schluessel} value={r.schluessel}>{r.titel}</option>)}
              </select>
            </Feld>
          )}
        <FuerWen d={d} stand={stand} setze={setze} feldFehler={feldFehler} />
        {tipp?.funktion && <p className="leise klein">{t('werkbank.tipps.ui.funktion', { funktion: tipp.funktion })}</p>}
        {ohneFeld.length > 0 && <div className="hinweis schlecht"><p>{ohneFeld.map((f) => f.text).join(' ')}</p></div>}
        <Vorschau text={d.text} ausprobieren={ausprobieren} />
        <Speicherleiste ent={ent} gegenstand={t('werkbank.tipps.ui.gegenstand')} sendet={sendet}
          loeschen={tipp && eigen ? { text: t('werkbank.tipps.ui.loeschen'), rueckfrage: { titel: t('werkbank.tipps.ui.loeschen.frage'), text: tipp.daten.text, ja: t('werkbank.tipps.ui.loeschen') },
            onClick: async () => { await tippsApi.loeschen(tipp.schluessel); await z.laden(); loeseWache(); geheZu(TIPPS_PFAD, true); } } : undefined} />
      </div>
    </form>
  );
}

/** Kopf: Text, Herkunft und – für Gespeichertes – an/aus für alle (wirkt sofort). */
function Kopf({ z, tipp }: { z: TippsZustand; tipp?: WerkbankTipp }) {
  const herkunft = !tipp ? '' : tipp.herkunft === 'ablago' ? t('werkbank.rundgaenge.ui.herkunft.ablago') : tipp.herkunft === EIGEN ? t('werkbank.rundgaenge.ui.herkunft.eigen') : tipp.paketName;
  return (
    <div className="mappenkopf">
      <p className="ueber">{t('werkbank.tipps.ui.titel')}</p>
      <div className="zeile-zwischen">
        <h1>{tipp ? tipp.daten.text : t('werkbank.tipps.ui.neuer')}</h1>
        {tipp && <Schalter an={tipp.an} beschriftung={t('werkbank.tipps.ui.schalter')} beschriftungVerbergen setze={async (an) => { await tippsApi.schalten(tipp.schluessel, an); await z.laden(); }} />}
      </div>
      {tipp && <p className="leise">{herkunft}</p>}
      {tipp && !tipp.an && <p className="leise klein">{t('werkbank.tipps.ui.schalter.aus')}</p>}
    </div>
  );
}

/** Für wen: alle oder nur Verwaltende, optional nur, wer einen Mappentyp lesen darf. */
function FuerWen({ d, stand, setze, feldFehler }: { d: TippDaten; stand: WerkbankTippsStand; setze(x: Partial<TippDaten>): void; feldFehler(feld: string): string | undefined }) {
  return <>
    <Feld beschriftung={t('werkbank.tipps.ui.fuer')} fehler={feldFehler('fuer')}>
      <select value={d.fuer} onChange={(e) => setze({ fuer: e.target.value === 'verwalten' ? 'verwalten' : 'lesen' })}>
        <option value="lesen">{t('werkbank.tipps.ui.fuer.lesen')}</option><option value="verwalten">{t('werkbank.tipps.ui.fuer.verwalten')}</option>
      </select>
    </Feld>
    <Feld beschriftung={t('werkbank.tipps.ui.typ')} fehler={feldFehler('typ')} optional>
      <select value={d.typ ?? ''} onChange={(e) => setze({ typ: e.target.value || undefined })}>
        <option value="">{t('werkbank.tipps.ui.typ.alle')}</option>
        {stand.typen.map((x) => <option key={x.kennung} value={x.kennung}>{x.name}</option>)}
      </select>
    </Feld>
  </>;
}

/** „Ausprobieren“: Ziel im neuen Fenster wie „Zeig es mir“; liefert eine Meldung, wenn das nicht geht. */
async function probieren(x: TippDaten, stand: WerkbankTippsStand): Promise<string | undefined> {
  let ok = true;
  if (x.rundgang) ok = tippProbe({ rundgang: x.rundgang });
  else if (x.ziel && x.typ && /^mappe\./.test(x.ziel)) {
    const p = (await tippsApi.mappe(x.typ)).pfad;
    if (!p) return t('werkbank.tipps.ui.ausprobieren.keine-mappe');
    ok = tippProbe({ pfad: p, anker: x.ziel });
  } else if (x.ziel) ok = tippProbe({ pfad: stand.anker.find((a) => a.anker === x.ziel)?.seite ?? '/ablage/start', anker: x.ziel });
  return ok ? undefined : t('werkbank.rundgaenge.ui.fenster.blockiert');
}

/** Ziel an einer Stelle: Anker mit fester Seite, mit Mappentyp auch Felder und Register; „Ziel zeigen“ wie bei Rundgängen. */
function ZielWahl({ d, stand, typName, setze, fehler, setMeldung }: {
  d: TippDaten; stand: WerkbankTippsStand; typName?: string; setze(x: Partial<TippDaten>): void; fehler?: string; setMeldung(m: { art: 'gut' | 'schlecht'; text: string }): void;
}) {
  const typ = stand.typen.find((x) => x.kennung === d.typ);
  const stellen = stand.anker.filter((a) => !a.muster && a.seite);
  return (
    <Feld beschriftung={t('werkbank.tipps.ui.ziel')} hinweis={t('werkbank.tipps.ui.ziel.hinweis')} fehler={fehler}
      kopfZusatz={<Knopf groesse="klein" onClick={() => { if (!zielZeigen()) setMeldung({ art: 'schlecht', text: t('werkbank.rundgaenge.ui.fenster.blockiert') }); else void holeAnker().then((a) => a && setze({ ziel: a })); }}
        title={t('werkbank.rundgaenge.ui.ziel-zeigen.titel')}>{t('werkbank.rundgaenge.ui.ziel-zeigen')}</Knopf>}>
      <select value={d.ziel ?? ''} onChange={(e) => setze({ ziel: e.target.value || undefined })}>
        <option value="">{t('werkbank.tipps.ui.ziel.waehlen')}</option>
        {d.ziel && !stellen.some((a) => a.anker === d.ziel) && !(typ && /^mappe\.(feld|register):/.test(d.ziel)) && <option value={d.ziel}>{d.ziel}</option>}
        <optgroup label={t('werkbank.tipps.ui.ziel.stellen')}>{stellen.map((a) => <option key={a.anker} value={a.anker}>{a.beschreibung} ({a.anker})</option>)}</optgroup>
        {typ && <optgroup label={t('werkbank.tipps.ui.ziel.mappe', { typ: typName ?? typ.name })}>
          {typ.felder.map((f) => <option key={`f${f.key}`} value={`mappe.feld:${f.key}`}>{t('werkbank.rundgaenge.hilfe.feld', { name: f.name })}</option>)}
          {typ.register.map((r) => <option key={`r${r.key}`} value={`mappe.register:${r.key}`}>{t('werkbank.rundgaenge.hilfe.register', { name: r.name })}</option>)}
        </optgroup>}
      </select>
    </Feld>
  );
}

/** Vorschau wie im Assistenten (Reiter „Tipps“) und „Ausprobieren“. */
function Vorschau({ text, ausprobieren }: { text: string; ausprobieren(): Promise<void> }) {
  return (
    <section className="tipp-vorschau" aria-labelledby="tipp-vorschau-titel">
      <h2 id="tipp-vorschau-titel" className="ueber">{t('werkbank.tipps.ui.vorschau')}</h2>
      <div className="tipp-vorschau-karte">
        <p className="tipp-vorschau-kopf"><Symbol name="tipp" /> {t('werkbank.tipps.ui.vorschau.kopf')}</p>
        <p>{text.trim() || <span className="leise">{t('werkbank.tipps.ui.vorschau.leer')}</span>}</p>
        <Knopf onClick={ausprobieren} title={t('werkbank.tipps.ui.ausprobieren.titel')}>{t('werkbank.tipps.ui.ausprobieren')}</Knopf>
      </div>
    </section>
  );
}

/** Tipp von Ablago oder aus einem Paket: Original, Anpassung, Hinweis mit Vergleich und „Auf Original zurücksetzen“. */
function Anpassung({ z, tipp, setMeldung }: { z: TippsZustand; tipp: WerkbankTipp; setMeldung(m: { art: 'gut' | 'schlecht'; text: string }): void }) {
  return (
    <div className="hinweis">
      {tipp.angepasst ? <p>{t('werkbank.tipps.ui.anpassung')}</p> : null}
      {tipp.original && <p className="leise">{t('werkbank.tipps.ui.original', { text: tipp.original.text })}</p>}
      {tipp.originalVorher && tipp.original && <>
        <p><strong>{t('werkbank.tipps.ui.original-geaendert')}</strong></p>
        <dl className="eigenschaften">
          <dt>{t('werkbank.tipps.ui.vergleich.damals')}</dt><dd>{tipp.originalVorher.text}</dd>
          <dt>{t('werkbank.tipps.ui.vergleich.jetzt')}</dt><dd>{tipp.original.text}</dd>
        </dl>
      </>}
      {tipp.angepasst && <Knopf onClick={async () => { await tippsApi.loeschen(tipp.schluessel); await z.laden(); setMeldung({ art: 'gut', text: t('werkbank.tipps.ui.zurueckgesetzt') }); }}>{t('werkbank.tipps.ui.zuruecksetzen')}</Knopf>}
    </div>
  );
}
