import { useCallback, useEffect, useState } from 'react';
import { betriebApi, type Fehlermeldung } from '../api/betrieb';
import { geheZu, Link } from '../ort';
import { Person } from '../Person';
import { Listenkopf } from '../Listenkopf';
import { t } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { useDaten } from '../daten';
import { FilterHaken, Fundstellen, Knopf, Hervorgehoben, KeineTreffer, ListenSuche, useListenSuche } from '../bausteine';

/** Werkbank → Wartung und Fehlersuche → Fehlermeldungen (#70). */
const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });
const groesse = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

export function useFehlermeldungen(aktiv: boolean) {
  // „Erledigte zeigen“ (#994): offene und erledigte zusammen, neueste zuerst; sonst nur die offenen.
  const [erledigt, setErledigt] = useState(false);
  const [liste, setListe] = useState<Fehlermeldung[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try {
      const [offen, zu] = await Promise.all([betriebApi.fehlermeldungen(false), erledigt ? betriebApi.fehlermeldungen(true) : Promise.resolve([])]);
      setListe([...offen, ...zu].sort((a, b) => b.erstellt.localeCompare(a.erstellt)));
      setFehler(undefined);
    } catch (e) { setFehler((e as Error).message); }
  }, [erledigt]);
  useEffect(() => { if (aktiv) void laden(); }, [aktiv, laden]);
  return { liste, erledigt, setErledigt, fehler, laden };
}
export type FehlermeldungenZustand = ReturnType<typeof useFehlermeldungen>;

const titelVon = (m: Fehlermeldung) => m.text.split('\n')[0].slice(0, 80) || t('werkbank.fehlermeldungen.ohne-beschreibung');

/** Gemeldete Fehler in der Mitte (#994): Suchfeld oben (Text und wer gemeldet hat), „Erledigte zeigen“ als Haken darunter. */
export function FehlermeldungenListe({ z, offen }: { z: FehlermeldungenZustand; offen?: string }) {
  const d = useDaten();
  const liste = z.liste ?? [];
  const such = useListenSuche(liste, {
    quellen: (m) => {
      const titel = titelVon(m);
      const rest = m.text.startsWith(titel) ? m.text.slice(titel.length).trim() : m.text;
      return [
        { wo: '', text: titel, titel: true },
        ...(rest ? [{ wo: t('werkbank.listensuche.meldung.text'), text: rest }] : []),
        ...(m.benutzerId ? [{ wo: t('werkbank.listensuche.meldung.von'), text: d.person(m.benutzerId) }] : []),
      ];
    },
  });
  const aktiv = such.aktiv || z.erledigt;
  return (
    <>
      <Listenkopf titel={t('werkbank.fehlermeldungen.gemeldete-fehler')} hilfe="werkbank.fehlermeldungen" beschreibung={t('werkbank.fehlermeldungen.was-benutzer-gemeldet-haben')} />
      <ListenSuche wert={such.eingabe} setze={such.setEingabe} beschriftung={t('werkbank.listensuche.meldungen.beschriftung')} platzhalter={t('werkbank.listensuche.meldungen.platzhalter')} anker="werkbank.fehlermeldungen.suche"
        treffer={z.liste === null ? null : such.treffer.length} aktiv={aktiv} anzahl={t('werkbank.listensuche.meldungen.anzahl', { anzahl: liste.length })}
        filter={<FilterHaken an={z.erledigt} setze={z.setErledigt}>{t('werkbank.fehlermeldungen.erledigte-zeigen')}</FilterHaken>} />
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {z.liste === null ? <p className="leise">{t('werkbank.fehlermeldungen.lade')}</p>
        : !liste.length ? <p className="leise leerliste">{z.erledigt ? t('werkbank.listensuche.meldungen.keine') : t('werkbank.fehlermeldungen.keine-offenen-meldungen')}</p>
        : !such.treffer.length ? <KeineTreffer zuruecksetzen={() => { such.zuruecksetzen(); z.setErledigt(false); }} /> : (
        <ul className="mappenliste">
          {such.treffer.map(({ eintrag: m, funde, titel }) => (
            <li key={m.id}>
              <Link to={`/werkbank/fehlermeldungen/${m.id}`} className={`eintrag werk ${offen === m.id ? 'an' : ''}`}>
                <span className="titel"><Hervorgehoben teile={titel} text={titelVon(m)} />{m.erledigt && <> <span className="chip">{t('werkbank.listensuche.meldung.erledigt')}</span></>}</span>
                <span className="unter">{zeit(m.erstellt)}{m.bilder.length ? t('werkbank.fehlermeldungen.bilder', { anzahl: m.bilder.length }) : ''}</span>
                <Fundstellen funde={funde} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Technische Angaben als verschachtelte Liste. */
function Angaben({ wert }: { wert: unknown }) {
  if (wert === null || wert === undefined || wert === '') return <span className="leise">–</span>;
  if (typeof wert === 'boolean') return <span>{wert ? t('werkbank.fehlermeldungen.ja') : t('werkbank.fehlermeldungen.nein')}</span>;
  if (typeof wert !== 'object') return <span>{String(wert)}</span>;
  if (Array.isArray(wert)) return wert.length ? <ol className="angabenliste">{wert.map((x, i) => <li key={i}><Angaben wert={x} /></li>)}</ol> : <span className="leise">{t('werkbank.fehlermeldungen.keine')}</span>;
  return (
    <dl className="eigenschaften angaben">
      {Object.entries(wert as Record<string, unknown>).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd><Angaben wert={v} /></dd></div>)}
    </dl>
  );
}

export function FehlermeldungDetail({ id, neuLaden }: { id: string; z: FehlermeldungenZustand; neuLaden: () => Promise<void> }) {
  const [m, setM] = useState<Fehlermeldung | null>(null);
  const [fehler, setFehler] = useState<string>();
  useEffect(() => { betriebApi.fehlermeldung(id).then(setM, (e: Error) => setFehler(e.message)); }, [id]);
  async function erledigt(an: boolean) {
    try { setM(await betriebApi.fehlermeldungErledigt(id, an)); await neuLaden(); } catch (e) { setFehler((e as Error).message); }
  }
  async function loeschen() {
    try { await betriebApi.fehlermeldungLoeschen(id); await neuLaden(); geheZu('/werkbank/fehlermeldungen'); } catch (e) { setFehler((e as Error).message); }
  }
  if (fehler) return <div className="hinweis schlecht"><p>{fehler}</p></div>;
  if (!m) return <p className="leise">{t('werkbank.fehlermeldungen.lade')}</p>;
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.fehlermeldungen.fehlermeldung')}</p>
        <h1>{m.text.split('\n')[0].slice(0, 120)}</h1>
        <dl className="index">
          <div><dt>{t('werkbank.fehlermeldungen.gemeldet')}</dt><dd>{t('werkbank.fehlermeldungen.von', { zeit: zeit(m.erstellt) })}{' '}<Person id={m.benutzerId} /></dd></div>
          {m.erledigt && <div><dt>{t('werkbank.fehlermeldungen.erledigt')}</dt><dd>{t('werkbank.fehlermeldungen.von', { zeit: zeit(m.erledigt) })}{' '}<Person id={m.erledigtVon} /></dd></div>}
        </dl>
      </div>
      <section className="blatt">
        <h2 className="h3">{t('werkbank.fehlermeldungen.beschreibung')}</h2>
        <p className="mehrzeilig">{m.text}</p>
      </section>
      {m.bilder.length > 0 && (
        <section className="blatt">
          <h2 className="h3">{t('werkbank.fehlermeldungen.screenshots')}</h2>
          <div className="fehlerbilder">
            {m.bilder.map((b) => {
              const url = `/api/werkbank/fehlermeldungen/${m.id}/bilder/${b.nr}`;
              return <a key={b.nr} href={url} target="_blank" rel="noreferrer" title={t('werkbank.fehlermeldungen.gross-ansehen', { name: b.name, groesse: groesse(b.groesse) })}><img src={url} alt={b.name} loading="lazy" /></a>;
            })}
          </div>
        </section>
      )}
      <section className="blatt">
        <div className="blattkopf zeile-zwischen"><h2 className="h3">{t('werkbank.fehlermeldungen.technische-angaben')}</h2>
          <Link to="/werkbank/protokoll" className="verweis">{t('werkbank.fehlermeldungen.zum-protokoll-eintraege-um', { uhrzeit: new Date(m.erstellt).toLocaleTimeString(gebietsschema(), { hour: '2-digit', minute: '2-digit' }) })}</Link></div>
        <Angaben wert={m.angaben} />
      </section>
      <div className="knoepfe">
        <Knopf art="gefahr" symbol="geloescht" onClick={loeschen}
          rueckfrage={{ titel: t('werkbank.fehlermeldungen.fehlermeldung-loeschen'), text: t('werkbank.fehlermeldungen.die-meldung-wird-samt'), ja: t('werkbank.fehlermeldungen.endgueltig-loeschen') }}>{t('werkbank.fehlermeldungen.loeschen')}</Knopf>
        <Knopf art="haupt" onClick={() => erledigt(!m.erledigt)}>{m.erledigt ? t('werkbank.fehlermeldungen.wieder-oeffnen') : t('werkbank.fehlermeldungen.als-erledigt-markieren')}</Knopf>
      </div>
    </div>
  );
}
