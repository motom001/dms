/**
 * Reiter „Verlauf“ eines Pakets mit Läufer (#1003): Was Ablago dem Paket zugestellt hat, wie es lief, wo es scheiterte
 * und wie stark es den Rechner zuletzt belastet hat – in einfacher Sprache mit Ampel. Ablago pflegt ihn selbst; das
 * Paket schreibt nur seine Protokollzeilen hinein. Dazu der Läufer-Block der Übersicht mit der Zeile „Zuletzt: …“.
 */
import { Fragment, useCallback, useEffect, useState } from 'react';
import { EREIGNISKATALOG, ereignisSchluessel, istKatalogArt, KATALOG_ARTEN } from '../../../shared/src/ereignisse';
import { hatNetz, laeuferZustandText, type InstalliertesPaket } from '../../../shared/src/pakete';
import { ampelVon, summeVon, type Ampel, type Auslastung, type VerlaufEintrag } from '../../../shared/src/paketreiter';
import { gebietsschema } from '../../../shared/src/sprache';
import { paketeApi, type PaketlaeuferStand } from '../api/pakete';
import { Feld, HakenFeld, Knopf, Suchfeld } from '../bausteine';
import { Link } from '../ort';
import { t, tn } from '../sprache';
import { Symbol } from '../Symbol';
import { PaketExternBlock } from './ExterneDienste';

const datum = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' }) : '–';
/** „vor 5 Minuten“, „gestern“ – in der Sprache der Oberfläche. */
function seit(iso: string): string {
  const s = Math.round((Date.parse(iso) - Date.now()) / 1000);
  const f = new Intl.RelativeTimeFormat(gebietsschema(), { numeric: 'auto', style: 'short' });
  const a = Math.abs(s);
  return a < 60
    ? f.format(s, 'second')
    : a < 3600
      ? f.format(Math.round(s / 60), 'minute')
      : a < 86_400
        ? f.format(Math.round(s / 3600), 'hour')
        : f.format(Math.round(s / 86_400), 'day');
}
const sekunden = (ms: number) => (Math.round(ms / 100) / 10).toLocaleString(gebietsschema());
export const ereignisName = (art: string) => (istKatalogArt(art) ? t.frei(`ereignisse.name.${ereignisSchluessel(art)}`) : art);
/** Tage der Auslastung ab heute minus `tage` (UTC wie auf dem Server). */
const letzteTage = (a: Auslastung, tage: number) =>
  a.tage.filter((d) => d.tag >= new Date(Date.now() - (tage - 1) * 86_400_000).toISOString().slice(0, 10));

/** Der Ereigniskatalog (#670) zum Nachschlagen: Gruppe, Name, Beschreibung. */
export function EreignisKatalogListe() {
  const gruppen = [...new Set(KATALOG_ARTEN.map((a) => EREIGNISKATALOG[a].gruppe))];
  return (
    <details className="klein">
      <summary>
        <Symbol name="info" /> {t('ereignisse.katalog.titel')}
      </summary>
      {gruppen.map((g) => (
        <div key={g}>
          <h3 className="h4">{t.frei(`ereignisse.gruppe.${g}`)}</h3>
          <dl className="eigenschaften">
            {KATALOG_ARTEN.filter((a) => EREIGNISKATALOG[a].gruppe === g).map((a) => (
              <Fragment key={a}>
                <dt>{t.frei(`ereignisse.name.${ereignisSchluessel(a)}`)}</dt>
                <dd>
                  {t.frei(`ereignisse.text.${ereignisSchluessel(a)}`)} <code>{a}</code>
                </dd>
              </Fragment>
            ))}
          </dl>
        </div>
      ))}
    </details>
  );
}

/** Stand des Läufers, von selbst nachgefragt, solange er startet (#403). */
function useLaeuferStand() {
  const [s, setS] = useState<PaketlaeuferStand | null | undefined>(undefined);
  const laden = useCallback(() => {
    paketeApi.paketLaeufer().then(setS, () => setS(null));
  }, []);
  useEffect(() => {
    laden();
  }, [laden]);
  return { s, laden };
}

/**
 * Übersicht eines Pakets mit Code (#338, #1003): Stand, Dienstkonto, was es bekommt – und nur eine Zeile, wann es
 * zuletzt lief und wie oft es in 7 Tagen scheiterte, mit Link zum Verlauf.
 */
export function LaeuferUebersicht({ inst, zumVerlauf }: { inst: InstalliertesPaket; zumVerlauf: () => void }) {
  const { s, laden } = useLaeuferStand();
  const [a, setA] = useState<Auslastung | null>(null);
  useEffect(() => {
    paketeApi.paketAuslastung(inst.id).then(setA, () => setA(null));
  }, [inst.id]);
  const p = s?.pakete.find((x) => x.id === inst.id) ?? null;
  const stand = s ? laeuferZustandText({ zustand: s.zustand, absturz: s.absturz, paket: p }, datum) : null;
  useEffect(() => {
    if (!stand?.wartet) return;
    const uhr = setTimeout(laden, 2000);
    return () => clearTimeout(uhr);
  }, [s, stand?.wartet, laden]);
  if (s === undefined) return null;
  const fehler7 = a ? summeVon(letzteTage(a, 7)).fehler : 0;
  const abonniert = inst.laeufer?.ereignisse ?? [];
  return (
    <>
      <h2 className="h3">{t('werkbank.pakete.paket-laeufer')}</h2>
      <dl className="eigenschaften">
        <dt>{t('werkbank.pakete.stand')}</dt>
        <dd>
          {!s || !stand ? (
            t('werkbank.pakete.der-paket-laeufer-laeuft')
          ) : stand.fehler ? (
            <span className="fehlertext">{stand.text}</span>
          ) : (
            stand.text
          )}
        </dd>
        {p && (
          <>
            <dt>{t('werkbank.pakete.dienstkonto')}</dt>
            <dd>{p.dienstkonto ?? '–'}</dd>
          </>
        )}
        {abonniert.length > 0 && (
          <>
            <dt>{t('werkbank.pakete.abonniert')}</dt>
            <dd>{abonniert.map(ereignisName).join(', ')}</dd>
          </>
        )}
        <dt>{t('pakete.verlauf.zuletzt')}</dt>
        <dd>
          {a?.zuletzt ? seit(a.zuletzt) : t('pakete.verlauf.nie')} ·{' '}
          {fehler7 ? <strong>{t('pakete.verlauf.fehler-7', { anzahl: fehler7 })}</strong> : t('pakete.verlauf.fehler-7', { anzahl: 0 })}{' '}
          <Knopf art="link" onClick={zumVerlauf}>
            {t('pakete.verlauf.ansehen')}
          </Knopf>
        </dd>
      </dl>
    </>
  );
}

const AMPEL_CHIP: Record<Ampel, string> = { ruhig: '', unauffaellig: 'gut', grenzen: 'warn', scheitert: 'schlecht' };
function ampelText(a: Ampel): { name: string; tun: string } {
  if (a === 'scheitert') return { name: t('pakete.verlauf.ampel.scheitert'), tun: t('pakete.verlauf.ampel.scheitert.tun') };
  if (a === 'grenzen') return { name: t('pakete.verlauf.ampel.grenzen'), tun: t('pakete.verlauf.ampel.grenzen.tun') };
  if (a === 'unauffaellig') return { name: t('pakete.verlauf.ampel.unauffaellig'), tun: t('pakete.verlauf.ampel.unauffaellig.tun') };
  return { name: t('pakete.verlauf.ampel.ruhig'), tun: t('pakete.verlauf.ampel.ruhig.tun') };
}

/** Auslastung der letzten 7 bzw. 30 Tage mit Ampel und den Grenzen des Läufers (nur anzeigen, #1003). */
function AuslastungBlock({ a, s, paket }: { a: Auslastung; s: PaketlaeuferStand | null; paket: string }) {
  const [tage, setTage] = useState(7);
  const l = letzteTage(a, tage);
  const sm = summeVon(l);
  const g = s?.grenzen ?? null;
  const ampel = ampelVon(l, g);
  const at = ampelText(ampel);
  const ev = s?.pakete.find((x) => x.id === paket)?.ereignisse;
  return (
    <section className="blatt stapel" aria-labelledby="auslastung-titel" data-anker="pakete.auslastung">
      <div className="zeile-zwischen">
        <h2 className="h3" id="auslastung-titel">
          {t('pakete.verlauf.auslastung')}
        </h2>
        <Feld beschriftung={t('pakete.verlauf.zeitraum')} beschriftungVerbergen>
          <select value={tage} onChange={(e) => setTage(Number(e.target.value))}>
            <option value={7}>{t('pakete.verlauf.tage', { anzahl: 7 })}</option>
            <option value={30}>{t('pakete.verlauf.tage', { anzahl: 30 })}</option>
          </select>
        </Feld>
      </div>
      <p>
        {AMPEL_CHIP[ampel] ? <span className={`chip ${AMPEL_CHIP[ampel]}`}>{at.name}</span> : <span className="leise">{at.name}</span>}{' '}
        {at.tun}
      </p>
      <dl className="eigenschaften">
        <dt>{t('pakete.verlauf.aufrufe')}</dt>
        <dd>
          {t('pakete.verlauf.aufrufe-wert', {
            anzahl: sm.aufrufe,
            jeTag: (Math.round((sm.aufrufe / tage) * 10) / 10).toLocaleString(gebietsschema()),
          })}
        </dd>
        <dt>{t('pakete.verlauf.fehlschlaege')}</dt>
        <dd>{sm.fehler ? <strong>{sm.fehler}</strong> : 0}</dd>
        <dt>{t('pakete.verlauf.dauer')}</dt>
        <dd>{sm.aufrufe ? t('pakete.verlauf.dauer-wert', { mittel: sekunden(sm.msMittel), laengster: sekunden(sm.msMax) }) : '–'}</dd>
        <dt>{t('pakete.verlauf.speicher')}</dt>
        <dd>
          {sm.aufrufe
            ? g
              ? t('pakete.verlauf.speicher-wert', {
                  mb: sm.speicherMax,
                  grenze: g.speicherMB,
                  prozent: Math.round((sm.speicherMax / g.speicherMB) * 100),
                })
              : `${sm.speicherMax} MB`
            : '–'}
        </dd>
        <dt>{t('pakete.verlauf.grenze-erreicht')}</dt>
        <dd>{t('pakete.verlauf.grenze-erreicht-wert', { zeit: sm.zeit, speicher: sm.speicher })}</dd>
        {g && (
          <>
            <dt>{t('werkbank.pakete.grenzen')}</dt>
            <dd>
              {t('werkbank.pakete.mb-speicher-s-je', { speicherMB: g.speicherMB, sekunden: g.sekunden, parallel: g.parallel })}
              <br />
              <small className="leise">{t('pakete.verlauf.grenzen-hinweis')}</small>
            </dd>
          </>
        )}
        {ev && (
          <>
            <dt>{t('werkbank.pakete.ereignisse')}</dt>
            <dd>
              {t('werkbank.pakete.zugestellt-offen', { zugestellt: ev.zugestellt, offen: ev.offen })}
              {ev.aufgegeben ? (
                <>
                  {' '}
                  · <strong>{t('werkbank.pakete.aufgegeben', { aufgegeben: ev.aufgegeben })}</strong>
                </>
              ) : (
                ''
              )}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}

/** Was geschah – Ereignis, Aufruf, Protokoll oder Verwaltung. */
function wasText(e: VerlaufEintrag): string {
  return e.art === 'ereignis'
    ? ereignisName(e.was)
    : e.art === 'aufruf'
      ? e.was
      : e.art === 'protokoll'
        ? t('pakete.verlauf.art.protokoll')
        : e.art === 'installiert'
          ? t('pakete.verlauf.art.installiert', { version: e.was })
          : e.art === 'aktualisiert'
            ? t('pakete.verlauf.art.aktualisiert', { versionen: e.was })
            : e.art === 'einstellungen'
              ? t('pakete.verlauf.art.einstellungen', { felder: e.was })
              : t('pakete.verlauf.art.ausprobiert');
}
/** Ergebnis als Chip. */
function ErgebnisChip({ e }: { e: VerlaufEintrag }) {
  return e.ergebnis === 'ok' ? (
    <span className="chip gut">{t('pakete.verlauf.ergebnis.ok')}</span>
  ) : e.ergebnis === 'zeit' ? (
    <span className="chip schlecht">{t('pakete.verlauf.ergebnis.zeit')}</span>
  ) : e.ergebnis === 'speicher' ? (
    <span className="chip schlecht">{t('pakete.verlauf.ergebnis.speicher')}</span>
  ) : e.ergebnis === 'fehler' ? (
    <span className="chip schlecht">{t('pakete.verlauf.ergebnis.fehler')}</span>
  ) : e.ergebnis === 'warnung' ? (
    <span className="chip warn">{t('pakete.verlauf.ergebnis.warnung')}</span>
  ) : null;
}

/** Was in einem Eintrag steht: Art, Bezug, Ergebnis, Dauer, Speicher, Text, Netzaufrufe. */
function Eintrag({ e }: { e: VerlaufEintrag }) {
  return (
    <li>
      <span className="zeile1">
        <span className="mono klein">{datum(e.zeit)}</span> <strong>{wasText(e)}</strong> <ErgebnisChip e={e} />
        {e.ms !== null && (
          <span className="leise klein"> · {t('pakete.verlauf.messung', { sekunden: sekunden(e.ms), mb: e.speicherMB ?? 0 })}</span>
        )}
        {e.wer && <span className="leise klein"> · {e.wer}</span>}
      </span>
      {e.bezug && (
        <>
          <br />
          <Link to={`/ablage/mappe/${e.bezug.mappe}`} className="verweis klein">
            {e.bezug.titel || t('pakete.verlauf.mappe')}
          </Link>
        </>
      )}
      {e.text && (
        <>
          <br />
          <span className={`klein${e.ergebnis && e.ergebnis !== 'ok' ? ' fehlertext' : ''}`}>{e.text}</span>
        </>
      )}
      {e.netz.length > 0 && (
        <>
          <br />
          <span className="leise klein">{e.netz.join(' · ')}</span>
        </>
      )}
    </li>
  );
}

/** Reiter „Verlauf“ (#1003): Auslastung oben, darunter die Liste mit Suche und „Nur Fehler zeigen“ (Muster aus #994). */
export function PaketVerlauf({ inst }: { inst: InstalliertesPaket }) {
  const { s } = useLaeuferStand();
  const [a, setA] = useState<Auslastung | null>(null);
  const [suche, setSuche] = useState('');
  const [nurFehler, setNurFehler] = useState(false);
  const [l, setL] = useState<{ eintraege: VerlaufEintrag[]; mehr: boolean } | null>(null);
  const [fehler, setFehler] = useState('');
  useEffect(() => {
    paketeApi.paketAuslastung(inst.id).then(setA, (e: Error) => setFehler(e.message));
  }, [inst.id]);
  useEffect(() => {
    let aktuell = true;
    const uhr = setTimeout(
      () =>
        void paketeApi.paketVerlauf(inst.id, { nurFehler, suche: suche.trim() }).then(
          (x) => {
            if (aktuell) setL(x);
          },
          (e: Error) => aktuell && setFehler(e.message),
        ),
      suche ? 250 : 0,
    );
    return () => {
      aktuell = false;
      clearTimeout(uhr);
    };
  }, [inst.id, nurFehler, suche]);
  const aeltere = async () => {
    if (!l) return;
    const x = await paketeApi.paketVerlauf(inst.id, { nurFehler, suche: suche.trim(), vor: l.eintraege.at(-1)?.nr });
    setL({ eintraege: [...l.eintraege, ...x.eintraege], mehr: x.mehr });
  };
  return (
    <div className="stapel">
      {fehler && (
        <div className="hinweis schlecht" role="alert">
          <p>{fehler}</p>
        </div>
      )}
      {a && <AuslastungBlock a={a} s={s ?? null} paket={inst.id} />}
      <section className="blatt stapel" aria-labelledby="verlauf-titel" data-anker="pakete.verlauf">
        <h2 className="h3" id="verlauf-titel">
          {t('pakete.verlauf.titel')}
        </h2>
        <p className="leise klein">{t('pakete.verlauf.text')}</p>
        <Suchfeld
          wert={suche}
          setze={setSuche}
          beschriftung={t('pakete.verlauf.suchen')}
          platzhalter={t('pakete.verlauf.suchen.platzhalter')}
        />
        <HakenFeld beschriftung={t('pakete.verlauf.nur-fehler')}>
          <input type="checkbox" checked={nurFehler} onChange={(e) => setNurFehler(e.target.checked)} />
        </HakenFeld>
        {l && !l.eintraege.length && (
          <p className="leise">
            {nurFehler || suche
              ? tn('pakete.verlauf.leer-filter', {
                  alle: (
                    <Knopf
                      art="link"
                      onClick={() => {
                        setNurFehler(false);
                        setSuche('');
                      }}>
                      {t('pakete.verlauf.alle-zeigen')}
                    </Knopf>
                  ),
                })
              : t('pakete.verlauf.leer')}
          </p>
        )}
        {l && l.eintraege.length > 0 && (
          <ul className="stapel" aria-label={t('pakete.verlauf.titel')}>
            {l.eintraege.map((e) => (
              <Eintrag key={e.nr} e={e} />
            ))}
          </ul>
        )}
        {l?.mehr && (
          <div className="knoepfe">
            <Knopf onClick={() => void aeltere()}>{t('pakete.verlauf.aeltere')}</Knopf>
          </div>
        )}
      </section>
      {hatNetz(inst.laeufer) && <PaketExternBlock paket={inst.id} />}
      <EreignisKatalogListe />
    </div>
  );
}
