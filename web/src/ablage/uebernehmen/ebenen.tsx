import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { typName } from '../../../../shared/src/beschriftung';
import { istLeer, titelAus, type Mappe, type Mappentyp, type Werte } from '../../../../shared/src/model';
import type { Bezuege } from '../../api/mappen';
import type { TypVorschlaege } from '../../api/werkbank';
import { Knopf, Umschalter } from '../../bausteine';
import { t } from '../../sprache';
import { Symbol } from '../../Symbol';
import { ausRoh } from '../../werte';
import { BrueckeKontext, useBruecke } from '../bruecke';
import { EBENEN_MAX, EbenenKontext, FeldIdPraefix, type EbeneLage, type EbenenWunsch } from '../ebenen';
import { Formular } from '../MappeFormular';
import { useFensterBruecke } from '../VerweisFenster';
import s from './Ebenen.module.css';

/**
 * Neue Post: verknüpfte Mappe in der rechten Spalte anlegen (#1596). „+ Vertragspartner anlegen …“ an einem Verweisfeld
 * ersetzt in der rechten Spalte das Formular durch das der neuen Mappe – höchstens drei Ebenen (die Mappe aus der Post
 * ist 1). Die unteren Ebenen bleiben unsichtbar stehen, damit nichts Eingegebene verloren geht; Brotkrümel darüber
 * zeigen, wo man ist. Am Handy statt der Brotkrümel „‹ Rechnung · Neuer Vertragspartner“ und ein Umschalter „Dokument |
 * <Art>“, weil Dokument und Mappe dort nicht nebeneinander passen.
 */

interface Ebene {
  id: number;
  w: EbenenWunsch;
  /** „Vertragspartner (neu)“ – in Brotkrümeln und Rückfrage. */
  name: string;
  /** Name der Ebene darunter, z. B. „Rechnung“. */
  eltern: string;
  vorschlag?: TypVorschlaege;
}
type Ansicht = 'dokument' | 'mappe';

/** Am Handy (wie die Dreiteilung: bis 820 px) – Dokument und Mappe stehen dort untereinander. */
function useSchmal() {
  const abfrage = '(max-width: 820px)';
  const [schmal, setSchmal] = useState(() => window.matchMedia?.(abfrage).matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.(abfrage);
    if (!m) return;
    const f = () => setSchmal(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return schmal;
}

/** Was Ablago im Dokument erkannt hat, als Vorschläge – die Ebene trägt sie ein und markiert sie mit „Vorschlag“. */
function vorschlagAus(w: EbenenWunsch): TypVorschlaege | undefined {
  const vorschlaege: TypVorschlaege['vorschlaege'] = {};
  for (const [k, roh] of Object.entries(w.erkannt)) {
    const f = w.typ.felder.find((x) => x.key === k);
    const wert = f ? ausRoh(f, roh) : null;
    if (f && !istLeer(wert)) vorschlaege[k] = { wert, sicherheit: 'mittel', fundstelle: '' };
  }
  return Object.keys(vorschlaege).length ? { vorschlaege, bezuege: {}, neu: {}, verworfen: 0, zeichen: 0 } : undefined;
}

/** Stapel der Ebenen über der Mappe aus der Post; leer bei einer anderen Post oder einem anderen Mappentyp. */
export function useEbenen(postId: string, wurzel: Mappentyp | undefined, aktiv: boolean) {
  const [stapel, setStapel] = useState<Ebene[]>([]);
  const [frage, setFrage] = useState<number | null>(null);
  const [ansicht, setAnsicht] = useState<Ansicht>('mappe');
  const schmal = useSchmal();
  const zaehler = useRef(0);
  const stapelRef = useRef(stapel);
  stapelRef.current = stapel;
  const wurzelName = wurzel ? typName(wurzel) : '';
  useEffect(() => {
    setStapel([]);
    setFrage(null);
  }, [postId, wurzel?.id]);
  const oeffne = useCallback(
    (von: number, w: EbenenWunsch) => {
      const basis = stapelRef.current.slice(0, von - 1);
      const eltern = von === 1 ? wurzelName : basis[von - 2].name;
      const name = t('ablage.ebenen.neu', { typ: typName(w.typ) });
      setStapel([...basis, { id: ++zaehler.current, w, name, eltern, vorschlag: vorschlagAus(w) }]);
      setFrage(null);
      setAnsicht('mappe');
    },
    [wurzelName],
  );
  /** Zurück auf Ebene `nr`: Die Ebenen darüber sind verworfen, der Fokus geht ans Verweisfeld, das sie geöffnet hat. */
  const zurueck = useCallback((nr: number) => {
    const weg = stapelRef.current[nr - 1];
    setStapel((x) => x.slice(0, nr - 1));
    setFrage(null);
    setAnsicht('mappe');
    weg?.w.zurueck();
  }, []);
  /** Ebene `nr` gespeichert: eine zurück, die neue Mappe steht im Verweisfeld. */
  const gespeichert = useCallback(
    (nr: number, m: Mappe) => {
      const e = stapelRef.current[nr - 2];
      zurueck(nr - 1);
      e?.w.gespeichert(m);
    },
    [zurueck],
  );
  const offen = aktiv && stapel.length > 0;
  const namen = [wurzelName, ...stapel.map((e) => e.name)];
  return { aktiv, offen, stapel, namen, frage, setFrage, ansicht, setAnsicht, schmal, oeffne, zurueck, gespeichert };
}
export type Ebenen = ReturnType<typeof useEbenen>;

/** Klassen der Spalten am Handy, solange eine Ebene offen ist: oben die Leiste, darunter Dokument oder Mappe. */
export const ebenenKlassen = (eb: Ebenen) =>
  eb.offen && eb.schmal ? { mitte: eb.ansicht === 'mappe' ? s.verdeckt : '', rechts: s.zuerst } : { mitte: '', rechts: '' };

/**
 * Rechte Spalte mit Ebenen: oben die Brotkrümel, darunter die Mappe aus der Post (`children`, bleibt stehen, solange
 * eine Ebene darüber offen ist) und die Ebenen; zu sehen ist immer nur die oberste.
 */
export function EbenenRahmen({ eb, children }: { eb: Ebenen; children: ReactNode }) {
  const lage = useMemo<EbeneLage>(() => ({ nr: 1, oeffne: (w) => eb.oeffne(1, w) }), [eb.oeffne]); // eslint-disable-line react-hooks/exhaustive-deps -- eb ist je Darstellung neu, oeffne nicht
  return (
    <>
      {eb.aktiv && <Kopfleiste eb={eb} />}
      <div className={s.eins} hidden={eb.offen}>
        <EbenenKontext.Provider value={eb.aktiv ? lage : null}>{children}</EbenenKontext.Provider>
      </div>
      {eb.aktiv &&
        eb.stapel.map((e, i) => (
          <EbeneFormular
            key={e.id}
            e={e}
            nr={i + 2}
            oben={i === eb.stapel.length - 1}
            sichtbar={!eb.schmal || eb.ansicht === 'mappe'}
            eb={eb}
          />
        ))}
    </>
  );
}

/** Eine Ebene ab 2: Kopf, Formular der neuen Mappe und unten „Entwurf verwerfen“ / „Speichern und zurück zu …“. */
function EbeneFormular({ e, nr, oben, sichtbar, eb }: { e: Ebene; nr: number; oben: boolean; sichtbar: boolean; eb: Ebenen }) {
  const { typ } = e.w;
  // Rahmen und markierter Text vom Dokument gehen in die oberste Ebene, wie beim Fenster (#935).
  const innen = useFensterBruecke(useBruecke(), typ, oben);
  // Beim Öffnen: Spalte nach oben (Brotkrümel sichtbar), Fokus auf die Überschrift der neuen Ebene.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const spalte = ref.current?.closest('section');
    if (spalte) spalte.scrollTop = 0;
    spalte?.scrollIntoView?.({ block: 'start' });
    ref.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, []);
  const { oeffne, gespeichert, zurueck, schmal } = eb;
  const lage = useMemo<EbeneLage>(() => ({ nr, oeffne: (w) => oeffne(nr, w) }), [nr, oeffne]);
  const imFenster = useMemo(
    () => ({ gespeichert: (m: Mappe) => gespeichert(nr, m), abbrechen: () => zurueck(nr - 1) }),
    [nr, gespeichert, zurueck],
  );
  const kopf = useCallback(
    (werte: Werte, bekannt: Bezuege) => <EbeneKopf typ={typ} werte={werte} bekannt={bekannt} feld={e.w.feld} eltern={e.eltern} />,
    [typ, e.w.feld, e.eltern],
  );
  return (
    <div ref={ref} className={s.ebene} hidden={!oben || !sichtbar}>
      <BrueckeKontext.Provider value={innen}>
        <EbenenKontext.Provider value={lage}>
          <FeldIdPraefix.Provider value={`e${nr}-`}>
            <Formular
              typ={typ}
              start={e.w.start}
              sicht={typ.id}
              kopf={kopf}
              imFenster={imFenster}
              vorschlagStart={e.vorschlag}
              haupttext={schmal ? t('ablage.ebenen.speichern-zurueck-kurz') : t('ablage.ebenen.speichern-zurueck', { eltern: e.eltern })}
            />
          </FeldIdPraefix.Provider>
        </EbenenKontext.Provider>
      </BrueckeKontext.Provider>
    </div>
  );
}

/** Kopf einer Ebene: Art, Titel (wie er nach dem Speichern heißt) und wofür sie angelegt wird. */
function EbeneKopf({
  typ,
  werte,
  bekannt,
  feld,
  eltern,
}: {
  typ: Mappentyp;
  werte: Werte;
  bekannt: Bezuege;
  feld: string;
  eltern: string;
}) {
  const titel = titelAus(typ, werte, (id) => bekannt[id]?.titel ?? '');
  return (
    <div className="mappenkopf">
      <p className="ueber">{typName(typ)}</p>
      <h1 className={titel ? '' : 'leise'} tabIndex={-1}>
        {titel || t('ablage.mappeformular.neue-mappe')}
      </h1>
      <p className={`leise klein ${s.fuer}`}>{t('ablage.ebenen.fuer', { feld, eltern })}</p>
    </div>
  );
}

/** Über der rechten Spalte: Brotkrümel (Rechner) bzw. „‹ Zurück · Ebene“ und der Umschalter (Handy), dazu die Rückfrage. */
function Kopfleiste({ eb }: { eb: Ebenen }) {
  const nr = eb.stapel.length + 1;
  // Zurück über eine Ebene mit Entwurf: erst nachfragen (nichts geht ohne Rückfrage verloren).
  const zu = (ziel: number) => (nr > ziel ? eb.setFrage(ziel) : undefined);
  if (eb.schmal && nr === 1) return null;
  return (
    <div className={s.leiste}>
      {eb.schmal ? (
        <div className={s.kurz}>
          <Knopf art="eigen" className={s.weg} onClick={() => zu(nr - 1)} title={t('ablage.ebenen.zurueck-zu', { name: eb.namen[nr - 2] })}>
            <Symbol name="pfeil-links" /> {eb.namen[nr - 2]}
          </Knopf>
          <span className={s.hier}>{eb.namen[nr - 1]}</span>
          <span className={`leise klein ${s.zahl}`}>{t('ablage.ebenen.ebene-von', { nr, max: EBENEN_MAX })}</span>
        </div>
      ) : (
        <nav aria-label={t('ablage.ebenen.wo')}>
          <ol className={s.kruemel}>
            <li>{t('ablage.ebenen.neue-post')}</li>
            {eb.namen.map((n, i) => (
              <li key={i}>
                {i + 1 < nr ? (
                  <Knopf art="eigen" className={s.weg} onClick={() => zu(i + 1)}>
                    {n}
                  </Knopf>
                ) : (
                  <span aria-current="page">{n}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      {eb.frage !== null && <Rueckfrage eb={eb} ziel={eb.frage} />}
      {eb.schmal && (
        <Umschalter
          wert={eb.ansicht}
          setze={eb.setAnsicht}
          beschriftung={t('ablage.ebenen.ansicht')}
          className={s.umschalter}
          wahlen={[
            { wert: 'dokument', text: t('ablage.ebenen.dokument') },
            { wert: 'mappe', text: typName(eb.stapel[nr - 2].w.typ) },
          ]}
        />
      )}
    </div>
  );
}

/** Gelbe Rückfrage beim Sprung zurück über ungespeicherte Ebenen; der Fokus steht auf „Weiter bearbeiten“. */
function Rueckfrage({ eb, ziel }: { eb: Ebenen; ziel: number }) {
  const weiter = useRef<HTMLButtonElement>(null);
  useEffect(() => weiter.current?.focus(), []);
  return (
    <div className={`hinweis warn ${s.frage}`} role="alert">
      <p>{t('ablage.ebenen.frage', { ebene: eb.namen[ziel], ziel: eb.namen[ziel - 1] })}</p>
      <div className="knoepfe">
        <Knopf onClick={() => eb.zurueck(ziel)}>{t('ablage.ebenen.entwuerfe-verwerfen')}</Knopf>
        <Knopf ref={weiter} art="haupt" onClick={() => eb.setFrage(null)}>
          {t('ablage.ebenen.weiter-bearbeiten')}
        </Knopf>
      </div>
    </div>
  );
}
