import { useCallback, useEffect, useState } from 'react';
import { mappenApi, type AehnlicheMappe } from '../api/mappen';
import { sucheApi, type VektorStand } from '../api/suche';
import { Hilfe } from '../Hilfe';
import { Etikett, Knopf, Schalter } from '../bausteine';
import { Link } from '../ort';
import { rueckfrage } from '../rueckfrage';
import { dauerText } from '../wartung';
import { titelOder } from '../seiten';
import { t } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Ähnlichkeit (#442): Ein Paket mit dem Recht dms:vektoren rechnet Vektoren, der Kern vergleicht sie.
 * Hier: „Ähnliche Dokumente“ an der Mappe, das Kennzeichen „ähnlich“ in der Suche und der Stand in der Werkbank.
 */

const prozent = (a: number) => Math.round(Math.max(0, a) * 100);

/** Kennzeichen „ähnlich“ an einem Treffer ohne Wort-Treffer. */
export function AehnlichChip({ a }: { a: AehnlicheMappe }) {
  return (
    <Etikett klein className="aehnl-chip" title={t('aehnlich.chip.titel', { dokument: a.dokument.name, prozent: prozent(a.aehnlichkeit) })}>
      {t('aehnlich.chip')}
    </Etikett>
  );
}

/**
 * Ähnliche Treffer unter der Trefferliste der erweiterten Suche (#442; bis #1218 auf der Startseite): ohne Wort-Treffer,
 * aber mit einem ähnlichen Dokument – gekennzeichnet. Nur, wenn ein Paket Ähnlichkeit kann.
 */
export function AehnlicheTreffer({ liste, sicht, anhang }: { liste: AehnlicheMappe[]; sicht: string; anhang: string }) {
  if (!liste.length) return null;
  return (
    <section className="aehnl-treffer" aria-labelledby="aehnl-treffer-titel">
      <h2 id="aehnl-treffer-titel" className="ueber">
        {t('aehnlich.gruppe')} <span className="anzahl">{liste.length}</span>
      </h2>
      <ul className="mappenliste">
        {liste.map((a) => (
          <li key={a.id}>
            <Link to={`/ablage/${sicht}/${a.id}${anhang}`} className="eintrag">
              <span className="titel">
                {titelOder(a.titel)} <AehnlichChip a={a} />
              </span>
              <span className="unter leise">{t('aehnlich.eintrag', { dokument: a.dokument.name, prozent: prozent(a.aehnlichkeit) })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Ähnliche Dokumente an einer Mappe – erscheint nur, wenn ein Paket mit dms:vektoren installiert ist. */
export function AehnlicheDokumente({ mappeId }: { mappeId: string }) {
  const [stand, setStand] = useState<{ verfuegbar: boolean; berechnet: boolean; mappen: AehnlicheMappe[] } | null | 'fehler'>(null);
  useEffect(() => {
    let aktuell = true;
    setStand(null);
    mappenApi.aehnlicheZurMappe(mappeId).then(
      (s) => {
        if (aktuell) setStand(s);
      },
      () => {
        if (aktuell) setStand('fehler');
      },
    );
    return () => {
      aktuell = false;
    };
  }, [mappeId]);
  if (stand === null) return null;
  if (stand !== 'fehler' && !stand.verfuegbar) return null;
  return (
    <section className="aehnl-dokumente" aria-label={t('aehnlich.titel')}>
      <h3 className="ueber">
        {t('aehnlich.titel')} <Hilfe ort="ablage.aehnlich" />
      </h3>
      {stand === 'fehler' ? (
        <p className="leise klein">{t('aehnlich.fehler')}</p>
      ) : !stand.berechnet ? (
        <p className="leise klein">{t('aehnlich.noch-nicht')}</p>
      ) : !stand.mappen.length ? (
        <p className="leise klein">{t('aehnlich.keine')}</p>
      ) : (
        <ul className="aehnl-liste">
          {stand.mappen.map((m) => (
            <li key={m.id}>
              <Link to={`/ablage/${m.typId}/${m.id}`} className="verweis">
                {titelOder(m.titel)}
              </Link>
              <span className="leise klein aehnl-unter">
                {t('aehnlich.eintrag', { dokument: m.dokument.name, prozent: prozent(m.aehnlichkeit) })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Werkbank → Pakete → Paket mit dms:vektoren: Fortschritt, Einstellung für die Suche, neu berechnen. */
export function VektorStandBlock({ paket }: { paket: string }) {
  const [s, setS] = useState<VektorStand | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [laeuft, setLaeuft] = useState(false);
  const laden = useCallback(() => {
    sucheApi.vektorStand().then(setS, (e) => setMeldung({ art: 'schlecht', text: (e as Error).message }));
  }, []);
  useEffect(() => {
    laden();
  }, [laden]);
  if (!s) return meldung ? <p className="fehlertext">{meldung.text}</p> : null;
  async function suche(an: boolean) {
    setLaeuft(true);
    try {
      setS(await sucheApi.vektorSuche(an));
      setMeldung(undefined);
    } catch (e) {
      setMeldung({ art: 'schlecht', text: (e as Error).message });
    } finally {
      setLaeuft(false);
    }
  }
  async function neu() {
    setLaeuft(true);
    try {
      const r = await sucheApi.vektorenNeu();
      setMeldung({ art: 'gut', text: t('aehnlich.werkbank.neu.fertig', { anzahl: r.entfernt }) });
      laden();
    } catch (e) {
      setMeldung({ art: 'schlecht', text: (e as Error).message });
    } finally {
      setLaeuft(false);
    }
  }
  return (
    <>
      <h2 className="h3">
        {t('aehnlich.werkbank.titel')} <Hilfe ort="pakete.vektoren" />
      </h2>
      <p className="leise klein">{t('aehnlich.werkbank.text')}</p>
      {meldung && (
        <div className={`hinweis ${meldung.art}`} role="status">
          <p>{meldung.text}</p>
        </div>
      )}
      <dl className="eigenschaften">
        <dt>{t('aehnlich.werkbank.modell')}</dt>
        <dd>{s.modell ?? t('aehnlich.werkbank.modell.unbekannt')}</dd>
        <dt>{t('ablage.aehnlich.stand')}</dt>
        <dd>
          <Fortschritt mit={s.mitVektor} gesamt={s.mitVolltext} />
        </dd>
        <VektorVonZeilen s={s} />
        {s.zwischenspeicherMB !== null && (
          <>
            <dt>{t('aehnlich.werkbank.speicher')}</dt>
            <dd>{t('aehnlich.werkbank.speicher.wert', { mb: s.zwischenspeicherMB.toLocaleString(gebietsschema()) })}</dd>
          </>
        )}
      </dl>
      {/* Ein/Aus als Schalter (#1188, #1211). */}
      <Schalter
        an={s.suche}
        gesperrt={laeuft}
        setze={(an) => suche(an)}
        beschriftung={t('aehnlich.werkbank.suche')}
        hinweis={t('aehnlich.werkbank.suche.hilfe')}
      />
      <div className="knoepfe">
        {/* Gefahr leise mit Symbol und Rückfrage (#1210, Leitsatz 4). */}
        <Knopf
          art="gefahr"
          symbol="neu-laden"
          gesperrt={laeuft}
          onClick={() => neu()}
          rueckfrage={{ titel: t('aehnlich.werkbank.neu.frage'), text: t('aehnlich.werkbank.neu.text'), ja: t('aehnlich.werkbank.neu') }}>
          {t('aehnlich.werkbank.neu')}
        </Knopf>
        <Knopf onClick={laden}>{t('aehnlich.werkbank.aktualisieren')}</Knopf>
        <VektorVonKnopf
          s={s}
          paket={paket}
          gewaehlt={(neu, text) => {
            setS(neu);
            setMeldung({ art: 'gut', text });
          }}
        />
      </div>
    </>
  );
}

/** „x von y Dokumenten“ mit Balken (#442; seit #1707 auch für einen Wechsel). */
function Fortschritt({ mit, gesamt }: { mit: number; gesamt: number }) {
  if (!gesamt) return <>{t('aehnlich.werkbank.stand.leer')}</>;
  return (
    <>
      <progress className="aehnl-fortschritt" max={gesamt} value={Math.min(mit, gesamt)} />{' '}
      {t('aehnlich.werkbank.stand', { mit: mit.toLocaleString(gebietsschema()), gesamt: gesamt.toLocaleString(gebietsschema()) })}
    </>
  );
}

const paketName = (s: VektorStand, id: string | null) => s.pakete.find((p) => p.id === id)?.name ?? id ?? '';

/** „Vektoren von“ (#1707): nur mit mehreren Paketen mit dms:vektoren – wer liefert, ein laufender Wechsel mit Fortschritt. */
function VektorVonZeilen({ s }: { s: VektorStand }) {
  if (s.pakete.length < 2) return null;
  return (
    <>
      <dt>{t('aehnlich.werkbank.von')}</dt>
      <dd>{paketName(s, s.paket)}</dd>
      {s.wechsel && (
        <>
          <dt>{t('aehnlich.werkbank.wechsel', { name: paketName(s, s.wechsel.nach) })}</dt>
          <dd>
            <Fortschritt mit={s.wechsel.mitVektor} gesamt={s.mitVolltext} />
          </dd>
        </>
      )}
    </>
  );
}

/** Folgen eines Wechsels für die Rückfrage (#1707): geschätzte Dauer aus der gemessenen Zeit je Dokument, sonst ohne Zahl. */
function wechselText(s: VektorStand, ich: VektorStand['pakete'][number]): string {
  if (ich.id === s.paket && s.wechsel) return t('aehnlich.werkbank.zurueck.text', { name: ich.name, nach: paketName(s, s.wechsel.nach) });
  const anzahl = s.mitVolltext.toLocaleString(gebietsschema());
  const dauer = ich.msJeDokument
    ? t('aehnlich.werkbank.waehlen.dauer', {
        name: ich.name,
        anzahl,
        dauer: dauerText(Math.max(1, Math.ceil((s.mitVolltext * ich.msJeDokument) / 1000))),
      })
    : t('aehnlich.werkbank.waehlen.ohne-dauer', { name: ich.name, anzahl });
  return t('aehnlich.werkbank.waehlen.text', { dauer, bisher: paketName(s, s.paket) });
}

/** Knopf „Vektoren von diesem Paket“ (#1707) – nur an einem Paket, das gerade nicht rechnet; erst nach der Rückfrage. */
function VektorVonKnopf({ s, paket, gewaehlt }: { s: VektorStand; paket: string; gewaehlt: (s: VektorStand, text: string) => void }) {
  const ich = s.pakete.find((p) => p.id === paket);
  if (s.pakete.length < 2 || !ich || (s.wechsel?.nach ?? s.paket) === paket) return null;
  async function waehlen() {
    const ja = await rueckfrage({
      titel: t('aehnlich.werkbank.waehlen.frage', { name: ich!.name }),
      text: wechselText(s, ich!),
      ja: t('aehnlich.werkbank.waehlen'),
    });
    if (ja) gewaehlt(await sucheApi.vektorPaketWaehlen(paket), t('aehnlich.werkbank.waehlen.fertig', { name: ich!.name }));
  }
  return <Knopf onClick={waehlen}>{t('aehnlich.werkbank.waehlen')}</Knopf>;
}
