import {
  EINTRAG_ID,
  istKernFeld,
  MEHRFACH_VERWEISE,
  type EinstellungBlock,
  type EinstellungFeld,
} from '../../../../shared/src/paketeinstellungen';
import { Knopf } from '../../bausteine';
import { Symbol } from '../../Symbol';
import { t } from '../../sprache';
import type { InstalliertesPaket } from '../../../../shared/src/pakete';
import { KernEingabe, type KernDaten } from '../PaketKernfelder';
import { Eingabe, optionenVon, VerweisWahl, type Auswahl } from './eingabe';

/**
 * Ein Block der Paket-Einstellungen (#197, #1279 aus PaketEinstellungen.tsx gezogen): Abschnitt, Mehrfachauswahl oder
 * Liste mit Einträgen.
 */

export type Werte = Record<string, unknown>;
let zaehler = 0;
const neueId = () => `n${Date.now().toString(36)}${(zaehler++).toString(36)}`;
/** Übergang (#658): Eine Liste mit genau einem Verweisfeld zeigt das DMS wie eine Mehrfachauswahl; gespeichert bleibt die Liste. */
const alsMehrfach = (blk: EinstellungBlock) =>
  blk.art === 'liste' && blk.felder.length === 1 && MEHRFACH_VERWEISE.includes(blk.felder[0].typ);

/** Teilfehler einer Feldart (`<schlüssel>.<teil>`) ohne den Schlüssel davor. */
const teilFehler = (fehler: Record<string, string>, k: string) =>
  Object.fromEntries(
    Object.entries(fehler)
      .filter(([x]) => x.startsWith(`${k}.`))
      .map(([x, v]) => [x.slice(k.length + 1), v]),
  );

type Kern = { paket: Pick<InstalliertesPaket, 'id' | 'name' | 'mappenaktionen'>; d: KernDaten };
type BlockProps<B extends EinstellungBlock = EinstellungBlock> = {
  blk: B;
  werte: Werte;
  setze: (f: (w: Werte) => Werte) => void;
  fehler: Record<string, string>;
  auswahl: Auswahl;
};
type Abschnitt = Extract<EinstellungBlock, { art: 'abschnitt' }>;
type Liste = Extract<EinstellungBlock, { art: 'liste' }>;

export function Block({ kern, ...p }: BlockProps & { kern: Kern }) {
  const { blk } = p;
  if (blk.art === 'abschnitt') return <AbschnittBlock {...p} blk={blk} kern={kern} />;
  if (alsMehrfach(blk)) return <MehrfachBlock {...p} blk={blk as Liste} />;
  return <ListenBlock {...p} blk={blk as Liste} />;
}

/** Abschnitt: Felder des Manifests und Feldarten des Kerns (#996). */
function AbschnittBlock({ blk, werte, setze, fehler, auswahl, kern }: BlockProps<Abschnitt> & { kern: Kern }) {
  return (
    <section className="blatt">
      {blk.titel && <h2 className="h3">{blk.titel}</h2>}
      {blk.hilfe && <p className="leise klein">{blk.hilfe}</p>}
      {blk.felder.map((f) =>
        istKernFeld(f) ? (
          <div key={f.schluessel} className="stapel">
            <KernEingabe
              art={f.typ}
              paket={kern.paket}
              d={kern.d}
              wert={werte[f.schluessel]}
              fehler={teilFehler(fehler, f.schluessel)}
              setze={(v) => setze((w) => ({ ...w, [f.schluessel]: v }))}
            />
            {fehler[f.schluessel] && (
              <p className="fehlertext" role="alert">
                {fehler[f.schluessel]}
              </p>
            )}
          </div>
        ) : (
          <Eingabe
            key={f.schluessel}
            f={f}
            wert={werte[f.schluessel]}
            fehler={fehler[f.schluessel]}
            auswahl={auswahl}
            id={`pe-${f.schluessel}`}
            ausgeschlossen={ausgeschlossenVon(blk.felder, f, werte)}
            setze={(v) => setze((w) => ({ ...w, [f.schluessel]: v }))}
          />
        ),
      )}
    </section>
  );
}

/** Werte der Felder, die dieses ausschließen (schliesst_aus) – in beide Richtungen. */
const ausgeschlossenVon = (felder: EinstellungFeld[], f: EinstellungFeld, werte: Werte) =>
  [...felder.filter((g) => g.schliesstAus === f.schluessel).map((g) => g.schluessel), ...(f.schliesstAus ? [f.schliesstAus] : [])].flatMap(
    (k) => {
      const v = werte[k];
      return Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
    },
  );

/** Liste mit genau einem Verweisfeld als Mehrfachauswahl (#658). */
function MehrfachBlock({ blk, werte, setze, fehler, auswahl }: BlockProps<Liste>) {
  const f = blk.felder[0];
  const eintraege = (werte[blk.schluessel] as Werte[] | undefined) ?? [];
  const ids = eintraege.map((e) => String(e[f.schluessel] ?? '')).filter(Boolean);
  const fehlerHier = Object.entries(fehler)
    .filter(([k]) => k.startsWith(`${blk.schluessel}.`))
    .map(([, v]) => v)[0];
  return (
    <section className="blatt">
      <div className={`eigenschaft${fehlerHier ? ' fehlerhaft' : ''}`}>
        <label htmlFor={`pe-${blk.schluessel}`} className="h3">
          {blk.name}
        </label>
        <VerweisWahl
          id={`pe-${blk.schluessel}`}
          name={blk.name}
          optionen={optionenVon(f, auswahl)}
          gewaehlt={ids}
          setze={(l) =>
            setze((w) => ({
              ...w,
              [blk.schluessel]: l.map(
                (x) => eintraege.find((e) => String(e[f.schluessel]) === x) ?? { [EINTRAG_ID]: neueId(), [f.schluessel]: x },
              ),
            }))
          }
        />
        {blk.hilfe && <small className="leise">{blk.hilfe}</small>}
        {fehlerHier && <small className="fehlertext">{fehlerHier}</small>}
      </div>
    </section>
  );
}

/** Liste mit Einträgen: anlegen, verschieben (sortierbar), löschen mit Rückfrage. */
function ListenBlock({ blk, werte, setze, fehler, auswahl }: BlockProps<Liste>) {
  const eintraege = (werte[blk.schluessel] as Werte[] | undefined) ?? [];
  const setzeListe = (n: Werte[]) => setze((w) => ({ ...w, [blk.schluessel]: n }));
  const schiebe = (i: number, d: number) => {
    const n = [...eintraege];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    setzeListe(n);
  };
  return (
    <section className="blatt">
      <h2 className="h3">{blk.name}</h2>
      {blk.hilfe && <p className="leise klein">{blk.hilfe}</p>}
      {!eintraege.length && <p className="leise klein">{t('werkbank.paketeinstellungen.noch-keine-eintraege')}</p>}
      <ol className="stapel paketliste">
        {eintraege.map((e, i) => (
          <li key={String(e[EINTRAG_ID])} className="paketeintrag">
            <EintragKopf
              blk={blk}
              nr={i}
              anzahl={eintraege.length}
              schiebe={(d) => schiebe(i, d)}
              loesche={() => setzeListe(eintraege.filter((_, j) => j !== i))}
            />
            {blk.felder.map((f) => (
              <Eingabe
                key={f.schluessel}
                f={f}
                wert={e[f.schluessel]}
                fehler={fehler[`${blk.schluessel}.${i + 1}.${f.schluessel}`]}
                auswahl={auswahl}
                id={`pe-${blk.schluessel}-${i}-${f.schluessel}`}
                setze={(v) => setzeListe(eintraege.map((x, j) => (j === i ? { ...x, [f.schluessel]: v } : x)))}
              />
            ))}
          </li>
        ))}
      </ol>
      <div className="knoepfe">
        <Knopf
          art="anlegen"
          groesse="klein"
          onClick={() =>
            setzeListe([
              ...eintraege,
              Object.fromEntries([
                [EINTRAG_ID, neueId()],
                ...blk.felder.filter((f) => f.standard !== undefined).map((f) => [f.schluessel, f.standard]),
              ]),
            ])
          }>
          + {blk.eintrag}
        </Knopf>
      </div>
    </section>
  );
}

/** Kopf eines Eintrags: Nummer, Verschieben (sortierbar) und Löschen. */
function EintragKopf({
  blk,
  nr: i,
  anzahl,
  schiebe,
  loesche,
}: {
  blk: Liste;
  nr: number;
  anzahl: number;
  schiebe: (d: number) => void;
  loesche: () => void;
}) {
  return (
    <div className="zeile-zwischen">
      <strong className="klein">
        {blk.eintrag} {i + 1}
      </strong>
      <span className="knoepfe">
        {blk.sortierbar && (
          <>
            <Knopf
              gesperrt={i === 0}
              nurSymbol={t('werkbank.paketeinstellungen.nach-oben', { eintrag: blk.eintrag, wert: i + 1 })}
              onClick={() => schiebe(-1)}>
              <Symbol name="sortiert-auf" />
            </Knopf>
            <Knopf
              gesperrt={i === anzahl - 1}
              nurSymbol={t('werkbank.paketeinstellungen.nach-unten', { eintrag: blk.eintrag, wert: i + 1 })}
              onClick={() => schiebe(1)}>
              <Symbol name="sortiert-ab" />
            </Knopf>
          </>
        )}
        <Knopf
          art="gefahr"
          groesse="klein"
          symbol="geloescht"
          onClick={loesche}
          rueckfrage={{
            titel: t('werkbank.paketeinstellungen.eintrag-loeschen.frage', { eintrag: blk.eintrag, wert: i + 1 }),
            text: t('werkbank.paketeinstellungen.eintrag-loeschen.text'),
            ja: t('werkbank.paketeinstellungen.loeschen'),
          }}>
          {t('werkbank.paketeinstellungen.loeschen')}
        </Knopf>
      </span>
    </div>
  );
}
