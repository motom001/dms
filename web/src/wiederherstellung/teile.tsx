import { useCallback, useEffect, useState } from 'react';
import { einrichtungApi, type SicherungSchlank, type SicherungsMeta, type WhAbgleich } from '../api/einrichtung';
import { t, tn } from '../sprache';
import { Etikett, etikettArt, Feld, FeldGruppe, HakenFeld, Knopf } from '../bausteine';
import { gebietsschema } from '../../../shared/src/sprache';
import { ApiFehler } from '../api/anfrage';
import { rueckfrage } from '../rueckfrage';

/**
 * Teile des Wiederherstellungs-Assistenten (#1279 aus wiederherstellen.tsx gezogen): Laden und Abgleich (Hook),
 * Liste der Sicherungen, Abgleich damals/heute und Schlüssel vom Notfallblatt.
 */

export const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });
const groesse = (b: number) => (b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(0)} MB` : `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB`);
const ART: Record<string, string> = {
  manuell: t('oberflaeche.wiederherstellen.von-hand'),
  automatisch: t('oberflaeche.wiederherstellen.art.automatisch'),
  'vor-wiederherstellung': t('oberflaeche.wiederherstellen.vor-einer-wiederherstellung'),
};

type Eintrag = { name: string; bytes: number; meta: SicherungsMeta | null; schlank?: SicherungSchlank };

/** Sicherungen laden, eine wählen (Abgleich, auf Wunsch mit Schlüssel) und die Wiederherstellung starten. */
export function useWiederherstellung(frisch: boolean, gestartet: () => void) {
  const [liste, setListe] = useState<Eintrag[] | null>(null);
  const [ordner, setOrdner] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [abgleich, setAbgleich] = useState<WhAbgleich | null>(null);
  const [schluessel, setSchluessel] = useState('');
  const [verstanden, setVerstanden] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  // #1530: vorher den jetzigen Stand sichern (empfohlen); scheitert schon ihr Beginn, steht der Grund hier.
  const [vorher, setVorherRoh] = useState(true);
  const [vorherFehler, setVorherFehler] = useState<string | null>(null);
  /** Abwählen fragt einmal nach. */
  async function setVorher(an: boolean) {
    if (an) return setVorherRoh(true);
    const ok = await rueckfrage({
      titel: t('oberflaeche.wiederherstellen.vorher.frage'),
      text: t('oberflaeche.wiederherstellen.vorher.frage.text'),
      ja: t('oberflaeche.wiederherstellen.vorher.frage.ja'),
      gefahr: true,
    });
    if (ok) setVorherRoh(false);
  }

  const laden = useCallback(async () => {
    setFehler(undefined);
    try {
      const r = await einrichtungApi.whSicherungen();
      setListe(r.liste);
      setOrdner(r.ordner);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void laden();
  }, [laden]);

  async function waehle(name: string, mitSchluessel?: string) {
    setGewaehlt(name);
    setFehler(undefined);
    setLaeuft(true);
    setVorherFehler(null);
    try {
      const a = await einrichtungApi.whAbgleich(name, mitSchluessel);
      setAbgleich(a);
      // Reicht der Platz voraussichtlich nicht, ist der Haken aus (der Grund steht daneben).
      setVorherRoh(a.vorher?.reicht !== false);
    } catch (e) {
      setFehler((e as Error).message);
      setAbgleich(null);
    } finally {
      setLaeuft(false);
    }
  }
  /** `ohneVorher`: nach gescheiterter Sicherung davor „Trotzdem ohne Sicherung wiederherstellen“ (#1530). */
  async function starten(ohneVorher = false) {
    if (!abgleich) return;
    setLaeuft(true);
    setFehler(undefined);
    setVorherFehler(null);
    try {
      await einrichtungApi.whStart({
        name: abgleich.name,
        ...(schluessel.trim() ? { schluessel } : {}),
        bestaetigt: !frisch && verstanden,
        ...(frisch ? {} : { vorherSichern: !ohneVorher && vorher }),
      });
      gestartet();
    } catch (e) {
      if (e instanceof ApiFehler && (e.details as { vorherGescheitert?: boolean } | undefined)?.vorherGescheitert)
        setVorherFehler(e.message);
      else setFehler((e as Error).message);
      setLaeuft(false);
    }
  }
  const brauchtSchluessel = abgleich?.schluesselNoetig ?? false;
  const startbar = !!abgleich && !abgleich.probleme.length && !brauchtSchluessel && (frisch || verstanden);
  return {
    ...{ liste, ordner, fehler, gewaehlt, setGewaehlt, abgleich, setAbgleich, schluessel, setSchluessel },
    ...{ verstanden, setVerstanden, laeuft, laden, waehle, starten, brauchtSchluessel, startbar, vorher, setVorher, vorherFehler },
  };
}
export type Wiederherstellung = ReturnType<typeof useWiederherstellung>;

/** Kopf: wo gesucht wird, und „Sicherungsordner neu prüfen“. */
export function SicherungsOrdner({ w }: { w: Wiederherstellung }) {
  const { ordner, setAbgleich, setGewaehlt, laden } = w;
  return (
    <div className="zeile-zwischen">
      <p className="leise klein">
        {tn('oberflaeche.wiederherstellen.gesucht-im-sicherungsordner-lege', {
          span: <span className="mono">{ordner || '…'}</span>,
          span2: <span className="mono">.dms-sicherung</span>,
          span3: <span className="mono">.json</span>,
        })}
      </p>
      <Knopf
        symbol="neu-laden"
        onClick={() => {
          setAbgleich(null);
          setGewaehlt(null);
          return laden();
        }}>
        {t('oberflaeche.wiederherstellen.sicherungsordner-neu-pruefen')}
      </Knopf>
    </div>
  );
}

/** Die Sicherungen im Ordner zur Auswahl (mit Metadaten, schlank oder ohne). */
export function SicherungsListe({ w }: { w: Wiederherstellung }) {
  const { liste, gewaehlt, setSchluessel, waehle } = w;
  return liste === null ? (
    <p className="leise">{t('oberflaeche.wiederherstellen.lade')}</p>
  ) : !liste.length ? (
    <p className="leise">{t('oberflaeche.wiederherstellen.keine-sicherung-im-ordner')}</p>
  ) : (
    <FeldGruppe beschriftung={t('oberflaeche.wiederherstellen.sicherung-waehlen')} beschriftungVerbergen>
      <ul className="auswahlliste">
        {liste.map((x) => (
          <li key={x.name}>
            <label className="haken">
              <input
                type="radio"
                name="sicherung"
                checked={gewaehlt === x.name}
                onChange={() => {
                  setSchluessel('');
                  void waehle(x.name);
                }}
              />
              <span>
                <strong>{x.meta ? zeit(x.meta.beginn) : x.name}</strong>
                {x.meta && (
                  <span className="leise klein">
                    {' '}
                    {t('oberflaeche.wiederherstellen.ablago-mappen', {
                      wert: [
                        ART[x.meta.art] ?? x.meta.art,
                        x.meta.nachgeholt ? t('werkbank.sicherung.art.nachgeholt') : null,
                        x.meta.wozu ? `„${x.meta.wozu}“` : null,
                      ]
                        .filter(Boolean)
                        .join(' · '),
                      dms: x.meta.umgebung.dms,
                      mappen: x.meta.anzahl.mappen.toLocaleString(gebietsschema()),
                      groesse: groesse(x.bytes),
                    })}
                  </span>
                )}
                {!x.meta && x.schlank && (
                  <span className="leise klein">
                    {' '}
                    · {t('werkbank.sicherung.extern.schlank', { datum: zeit(x.schlank.beginn) })} · {groesse(x.bytes)}
                  </span>
                )}
                {!x.meta && !x.schlank && (
                  <span className="fehlertext klein"> {t('oberflaeche.wiederherstellen.metadaten-json-fehlen')}</span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </FeldGruppe>
  );
}

/** Abgleich damals/heute als Tabelle. */
export function AbgleichTabelle({ abgleich }: { abgleich: WhAbgleich }) {
  return (
    <div className="trefferliste">
      <table>
        <thead>
          <tr>
            <th />
            <th>{t('oberflaeche.wiederherstellen.in-der-sicherung')}</th>
            <th>{t('oberflaeche.wiederherstellen.diese-installation')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {abgleich.vergleich.map((v) => (
            <tr key={v.was}>
              <th>{v.was}</th>
              <td className="mono">{v.damals}</td>
              <td className="mono">{v.heute}</td>
              <td>
                <Etikett art={etikettArt(v.urteil === 'fehler' ? 'schlecht' : v.urteil === 'hinweis' ? 'warn' : 'gut')}>
                  {v.urteil === 'gleich'
                    ? t('oberflaeche.wiederherstellen.gleich')
                    : v.urteil === 'ok'
                      ? t('oberflaeche.wiederherstellen.passt')
                      : v.urteil === 'hinweis'
                        ? t('oberflaeche.wiederherstellen.hinweis')
                        : t('oberflaeche.wiederherstellen.geht-nicht')}
                </Etikett>
                {v.info && <span className="leise klein"> {v.info}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Schlüssel vom Notfallblatt eingeben und prüfen. */
export function SchluesselFormular({ w, abgleich }: { w: Wiederherstellung; abgleich: WhAbgleich }) {
  const { schluessel, setSchluessel, waehle, laeuft } = w;
  return (
    <form
      className="stapel"
      onSubmit={(e) => {
        e.preventDefault();
        void waehle(abgleich.name, schluessel);
      }}>
      <Feld
        beschriftung={t('oberflaeche.wiederherstellen.schluessel-vom-notfallblatt')}
        hinweis={t('oberflaeche.wiederherstellen.fingerabdruck-leerzeichen-zaehlen', {
          fingerabdruck: abgleich.meta.verschluesselung.fingerabdruck,
        })}>
        <textarea
          className="mono"
          rows={2}
          value={schluessel}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setSchluessel(e.target.value)}
        />
      </Feld>
      <div className="knoepfe">
        <Knopf type="submit" laeuft={laeuft} gesperrt={!schluessel.trim()}>
          {t('oberflaeche.wiederherstellen.schluessel-pruefen')}
        </Knopf>
      </div>
    </form>
  );
}

/**
 * „Vorher den jetzigen Stand sichern (empfohlen)“ (#1530): angehakt, mit Zweck, Ort und Größe. Abwählen fragt einmal
 * nach; reicht der Platz voraussichtlich nicht, ist der Haken aus und der Grund steht daneben.
 */
export function VorherSichern({ w, abgleich }: { w: Wiederherstellung; abgleich: WhAbgleich }) {
  const v = abgleich.vorher;
  if (!v) return null;
  const gb = (b: number) => groesse(Math.max(b, 1024 ** 2));
  return (
    <HakenFeld
      beschriftung={t('oberflaeche.wiederherstellen.vorher')}
      hinweis={
        v.reicht
          ? t('oberflaeche.wiederherstellen.vorher.text', { groesse: gb(v.geschaetzt) })
          : t('oberflaeche.wiederherstellen.vorher.platz', {
              groesse: gb(v.geschaetzt),
              frei: v.frei === null ? '–' : gb(v.frei),
              mindest: gb(v.mindest),
            })
      }>
      <input type="checkbox" checked={w.vorher} disabled={!v.reicht} onChange={(e) => void w.setVorher(e.target.checked)} />
    </HakenFeld>
  );
}
