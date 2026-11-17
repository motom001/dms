import { useCallback, useEffect, useState } from 'react';
import { Knopf, Reiter, ReiterFlaeche, Wahlhaken } from '../../bausteine';
import { OCR_STAENDE, type OcrStandArt } from '../../../../shared/src/model';
import { sucheApi } from '../../api/suche';
import { Link } from '../../ort';
import { t } from '../../sprache';
import { gebietsschema } from '../../../../shared/src/sprache';
import { AnlageMarke } from '../../ablage/Anlagen';
import type { TexterkennungZustand } from './zustand';
import { zahl } from './teile';

/** Aufträge der Texterkennung (#61): je Stand die Dokumente mit Mappe, neu starten, abbrechen. */
const STAENDE_LISTE: OcrStandArt[] = ['fehler', 'wartet', 'laeuft', 'paket', 'ausgelassen', 'fertig'];
type Auftrag = Awaited<ReturnType<typeof sucheApi.ocrAuftraege>>['eintraege'][number];

export function Auftraege({ t: eintrag }: { t: TexterkennungZustand }) {
  const s = eintrag.stand!;
  const [stand, setStand] = useState<OcrStandArt>(s.zaehler.fehler ? 'fehler' : s.zaehler.wartet || s.zaehler.laeuft ? 'wartet' : 'fehler');
  const [liste, setListe] = useState<{ gesamt: number; eintraege: Auftrag[] } | null>(null);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const zaehlerText = JSON.stringify(s.zaehler);
  const laden = useCallback(async () => {
    try {
      setListe(await sucheApi.ocrAuftraege(stand));
    } catch (e) {
      setMeldung({ art: 'schlecht', text: (e as Error).message });
    }
  }, [stand]);
  useEffect(() => {
    void laden();
    setAuswahl(new Set());
  }, [laden, zaehlerText]);
  const ids = [...auswahl];
  async function tu(f: () => Promise<string>) {
    setMeldung(undefined);
    try {
      const text = await f();
      setMeldung({ art: 'gut', text });
      setAuswahl(new Set());
      await eintrag.laden();
      await laden();
    } catch (e) {
      setMeldung({ art: 'schlecht', text: (e as Error).message });
    }
  }
  const umschalten = (id: string) =>
    setAuswahl((x) => {
      const n = new Set(x);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const alle = liste?.eintraege ?? [];
  const abbrechbar = stand === 'wartet' || stand === 'laeuft' || stand === 'paket';
  return (
    <section className="blatt" id="auftraege">
      <div className="blattkopf zeile-zwischen">
        <h2 className="h3">{t('werkbank.texterkennung.auftraege')}</h2>
        {s.zaehler.fehler > 0 && (
          <Knopf
            groesse="klein"
            onClick={() =>
              tu(async () => {
                const r = await sucheApi.ocrFehlerNeu();
                return t('werkbank.texterkennung.dokumente-stehen-wieder-in', { anzahl: r.eingereiht, zahl: zahl(r.eingereiht) });
              })
            }>
            {t('werkbank.texterkennung.alle-fehler-neu-starten')}
          </Knopf>
        )}
      </div>
      <Reiter
        id="ocr-stand"
        wert={stand}
        setze={setStand}
        beschriftung={t('werkbank.texterkennung.reiter')}
        wahlen={STAENDE_LISTE.map((k) => ({ wert: k, text: OCR_STAENDE[k], anzahl: s.zaehler[k] }))}
      />
      <ReiterFlaeche id="ocr-stand" wert={stand}>
        {meldung && (
          <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">
            {meldung.text}
          </p>
        )}
        {liste === null ? (
          <p className="leise">{t('werkbank.texterkennung.lade')}</p>
        ) : !alle.length ? (
          <p className="leise">{t('werkbank.texterkennung.keine-dokumente-in-diesem')}</p>
        ) : (
          <>
            {tabelle({ alle, auswahl, setAuswahl, umschalten, stand })}
            {liste.gesamt > alle.length && (
              <p className="leise klein">
                {t('werkbank.texterkennung.gezeigt-werden-die-neuesten', { zahl: zahl(alle.length), zahl2: zahl(liste.gesamt) })}
              </p>
            )}
            {knoepfe({ abbrechbar, ids, stand, tu })}
          </>
        )}
      </ReiterFlaeche>
    </section>
  );
}
const groesse = (b: number) =>
  b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

/** Tabelle der Aufträge mit Wahlhaken je Dokument und für alle. */
function tabelle({
  alle,
  auswahl,
  setAuswahl,
  umschalten,
  stand,
}: {
  alle: Auftrag[];
  auswahl: Set<string>;
  setAuswahl: (s: Set<string>) => void;
  umschalten: (id: string) => void;
  stand: OcrStandArt;
}) {
  return (
    <div className="tabellenrahmen festhoehe">
      <table className="auftraege">
        <thead>
          <tr>
            <th>
              <Wahlhaken
                beschriftung={t('werkbank.texterkennung.alle-waehlen')}
                an={auswahl.size === alle.length}
                teilweise={auswahl.size > 0 && auswahl.size < alle.length}
                setze={(an) => setAuswahl(an ? new Set(alle.map((a) => a.dokument.id)) : new Set())}
              />
            </th>
            <th>{t('werkbank.texterkennung.dokument')}</th>
            <th>{t('werkbank.texterkennung.mappe')}</th>
            <th>{t('werkbank.texterkennung.groesse')}</th>
            <th>{stand === 'fertig' ? t('werkbank.texterkennung.seiten') : t('werkbank.texterkennung.grund-stand')}</th>
            <th>{t('werkbank.texterkennung.seit')}</th>
          </tr>
        </thead>
        <tbody>
          {alle.map((a) => {
            const o = a.dokument.ocr;
            return (
              <tr key={a.dokument.id} className={auswahl.has(a.dokument.id) ? 'an' : ''}>
                <td>
                  <Wahlhaken
                    beschriftung={t('werkbank.texterkennung.waehlen', { name: a.dokument.name })}
                    an={auswahl.has(a.dokument.id)}
                    setze={() => umschalten(a.dokument.id)}
                  />
                </td>
                <td>
                  {a.dokument.name} <AnlageMarke d={a.dokument} />
                </td>
                <td>
                  <Link to={`/ablage/${a.typId}/${a.dokument.mappeId}`} className="verweis">
                    {a.mappeTitel || t('werkbank.texterkennung.ohne-titel')}
                  </Link>
                </td>
                <td className="zahlzelle">{groesse(a.dokument.groesse)}</td>
                <td>{stand === 'fertig' ? (o?.seiten ?? '–') : o?.info || OCR_STAENDE[o?.stand ?? 'keiner']}</td>
                <td className="leise">
                  {o?.zeit ? new Date(o.zeit).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' }) : '–'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Abbrechen bzw. aus der Warteschlange nehmen (mit Rückfrage) und neu starten – für die gewählten Dokumente. */
function knoepfe({
  abbrechbar,
  ids,
  stand,
  tu,
}: {
  abbrechbar: boolean;
  ids: string[];
  stand: OcrStandArt;
  tu: (f: () => Promise<string>) => Promise<void>;
}) {
  return (
    <div className="knoepfe">
      {abbrechbar && (
        <Knopf
          art="gefahr"
          symbol="verboten"
          gesperrt={!ids.length}
          onClick={() =>
            tu(async () => {
              const r = await sucheApi.ocrAbbrechen(ids);
              return `${zahl(r.abgebrochen)} abgebrochen.`;
            })
          }
          rueckfrage={{
            titel: t('werkbank.texterkennung.abbrechen.frage', { anzahl: ids.length }),
            text: t('werkbank.texterkennung.abbrechen.text'),
            ja: stand === 'laeuft' ? t('werkbank.texterkennung.abbrechen') : t('werkbank.texterkennung.aus-der-warteschlange-nehmen'),
          }}>
          {stand === 'laeuft' ? t('werkbank.texterkennung.abbrechen') : t('werkbank.texterkennung.aus-der-warteschlange-nehmen')}
        </Knopf>
      )}
      <Knopf
        art="haupt"
        gesperrt={!ids.length}
        onClick={() =>
          tu(async () => {
            const r = await sucheApi.ocrNeu(ids);
            return t('werkbank.texterkennung.neu-gestartet', { zahl: zahl(r.eingereiht) });
          })
        }>
        {t('werkbank.texterkennung.neu-starten', { wert: ids.length ? ` (${ids.length})` : '' })}
      </Knopf>
    </div>
  );
}
