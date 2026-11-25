import { Fragment } from 'react';
import {
  DATUMSFORMATE,
  mitFormaten,
  regionDatum,
  regionZahl,
  TELEFONFORMATE,
  UHRZEITFORMATE,
  WAEHRUNG_STELLUNGEN,
  WOCHENBEGINNE,
  ZAHLENFORMATE,
  type Formate,
} from '../../../shared/src/region';
import { gebietsschema } from '../../../shared/src/sprache';
import { liesTelefon, telefonText } from '../../../shared/src/telefon';
import { Feld, FeldGruppe, HakenFeld, Knopf } from '../bausteine';
import { t } from '../sprache';

/**
 * Werkbank → Region, Abschnitt Formate (#1610): Datum, Uhrzeit, Zahlen und Beträge, Standardwährung, Telefon (#1609),
 * Arbeitstage und Wochenbeginn – jeweils „wie die Sprache“ oder eine eigene Wahl – mit einer Vorschau, die den Entwurf
 * schon vor dem Speichern zeigt.
 */

/** Montag, 23.11.2026 – von dort aus sieben Tage für die Namen der Wochentage. */
const MONTAG = Date.UTC(2026, 10, 23, 12);
const tagName = (n: number, art: 'short' | 'long' = 'short') =>
  new Intl.DateTimeFormat(gebietsschema(), { weekday: art, timeZone: 'UTC' }).format(new Date(MONTAG + (n - 1) * 86_400_000));
const SPRACHE = '';
/** Schlüssel der Texte je Datumsformat. */
const DATUM_NAME: Record<(typeof DATUMSFORMATE)[number], string> = {
  'tt.mm.jjjj': 'punkt',
  'jjjj-mm-tt': 'iso',
  'tt/mm/jjjj': 'schraeg',
  'mm/tt/jjjj': 'us',
};
const VORLAGEN: Array<[string, number[]]> = [
  ['mo-fr', [1, 2, 3, 4, 5]],
  ['mo-sa', [1, 2, 3, 4, 5, 6]],
  ['mo-so', [1, 2, 3, 4, 5, 6, 7]],
];

/** Auswahl „wie die Sprache“ oder einer der Werte. */
function Wahl<T extends string | number>({
  id,
  beschriftung,
  wert,
  werte,
  text,
  mitSprache = true,
  setze,
}: {
  id: string;
  beschriftung: string;
  wert: T | null;
  werte: readonly T[];
  text: (w: T) => string;
  mitSprache?: boolean;
  setze: (w: T | null) => void;
}) {
  return (
    <Feld beschriftung={beschriftung}>
      <select
        id={id}
        value={wert === null ? SPRACHE : String(wert)}
        onChange={(x) => setze(x.target.value === SPRACHE ? null : (werte.find((w) => String(w) === x.target.value) ?? null))}>
        {mitSprache && <option value={SPRACHE}>{t('werkbank.region.formate.wie-sprache')}</option>}
        {werte.map((w) => (
          <option key={w} value={String(w)}>
            {text(w)}
          </option>
        ))}
      </select>
    </Feld>
  );
}

/** Beispielwerte mit den Formaten des Entwurfs. */
function vorschau(f: Formate) {
  return mitFormaten(f, () => {
    const d = new Date('2026-11-24T13:05:00Z');
    let betrag: string;
    try {
      betrag = regionZahl(1234.5, { style: 'currency', currency: f.waehrung });
    } catch {
      betrag = `${regionZahl(1234.5, { minimumFractionDigits: 2 })} ${f.waehrung}`;
    }
    const nr = liesTelefon('+49 351 12345-67', f.vorwahl);
    return [
      [t('werkbank.region.formate.datum'), regionDatum(d, { day: '2-digit', month: '2-digit', year: 'numeric' })],
      [t('werkbank.region.formate.uhrzeit'), regionDatum(d, { hour: '2-digit', minute: '2-digit' })],
      [t('werkbank.region.formate.zahlen'), regionZahl(1234567.89, { maximumFractionDigits: 2 })],
      [t('werkbank.region.formate.betrag'), betrag],
      [t('werkbank.region.formate.telefon'), nr ? telefonText(nr, f.telefon, f.vorwahl) : '–'],
    ];
  });
}

export function RegionFormate({ f, setze }: { f: Formate; setze: (f: Formate) => void }) {
  const tage = (liste: number[]) => setze({ ...f, arbeitstage: [...new Set(liste)].sort((a, b) => a - b) });
  return (
    <>
      <h2 className="h3">{t('werkbank.region.formate')}</h2>
      <p className="leise klein">{t('werkbank.region.formate.einleitung')}</p>
      <div className="raster">
        <Wahl
          id="region-datum"
          beschriftung={t('werkbank.region.formate.datum')}
          wert={f.datum}
          werte={DATUMSFORMATE}
          text={(w) => t.frei(`werkbank.region.formate.datum.${DATUM_NAME[w]}`)}
          setze={(datum) => setze({ ...f, datum })}
        />
        <Wahl
          id="region-uhrzeit"
          beschriftung={t('werkbank.region.formate.uhrzeit')}
          wert={f.uhrzeit}
          werte={UHRZEITFORMATE}
          text={(w) => t.frei(`werkbank.region.formate.uhrzeit.${w}`)}
          setze={(uhrzeit) => setze({ ...f, uhrzeit })}
        />
        <Wahl
          id="region-zahlen"
          beschriftung={t('werkbank.region.formate.zahlen')}
          wert={f.zahlen}
          werte={ZAHLENFORMATE}
          text={(w) => w}
          setze={(zahlen) => setze({ ...f, zahlen })}
        />
        <Wahl
          id="region-waehrung-stellung"
          beschriftung={t('werkbank.region.formate.waehrung-stellung')}
          wert={f.waehrungStellung}
          werte={WAEHRUNG_STELLUNGEN}
          text={(w) => t.frei(`werkbank.region.formate.waehrung-stellung.${w}`)}
          setze={(waehrungStellung) => setze({ ...f, waehrungStellung })}
        />
        <Feld beschriftung={t('werkbank.region.formate.waehrung')} hinweis={t('werkbank.region.formate.waehrung.hinweis')}>
          <input
            id="region-waehrung"
            className="mono"
            maxLength={3}
            value={f.waehrung}
            onChange={(x) => setze({ ...f, waehrung: x.target.value.toUpperCase() })}
          />
        </Feld>
        <Wahl
          id="region-telefon"
          beschriftung={t('werkbank.region.formate.telefon')}
          wert={f.telefon}
          werte={TELEFONFORMATE}
          mitSprache={false}
          text={(w) => t.frei(`werkbank.region.formate.telefon.${w}`)}
          setze={(telefon) => setze({ ...f, telefon: telefon ?? f.telefon })}
        />
        <Feld beschriftung={t('werkbank.region.formate.vorwahl')} hinweis={t('werkbank.region.formate.vorwahl.hinweis')}>
          <input
            id="region-vorwahl"
            inputMode="numeric"
            maxLength={3}
            value={f.vorwahl}
            onChange={(x) => setze({ ...f, vorwahl: x.target.value.replace(/\D/g, '') })}
          />
        </Feld>
        <Wahl
          id="region-wochenbeginn"
          beschriftung={t('werkbank.region.formate.wochenbeginn')}
          wert={f.wochenbeginn}
          werte={WOCHENBEGINNE}
          text={(w) => tagName(w, 'long')}
          setze={(wochenbeginn) => setze({ ...f, wochenbeginn })}
        />
      </div>
      <FeldGruppe beschriftung={t('werkbank.region.formate.arbeitstage')} hinweis={t('werkbank.region.formate.arbeitstage.hinweis')}>
        <div className="knoepfe">
          {/* HakenFeld (#1214): die ganze Zeile ist Tippfläche, auch am Handy. */}
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <HakenFeld key={n} beschriftung={tagName(n)}>
              <input
                type="checkbox"
                title={tagName(n, 'long')}
                checked={f.arbeitstage.includes(n)}
                onChange={(x) => tage(x.target.checked ? [...f.arbeitstage, n] : f.arbeitstage.filter((y) => y !== n))}
              />
            </HakenFeld>
          ))}
        </div>
        <span className="knoepfe">
          {VORLAGEN.map(([k, liste]) => (
            <Knopf key={k} groesse="klein" onClick={() => tage(liste)}>
              {t.frei(`werkbank.region.formate.arbeitstage.${k}`)}
            </Knopf>
          ))}
        </span>
      </FeldGruppe>
      <section aria-labelledby="region-vorschau">
        <h3 className="h4" id="region-vorschau">
          {t('werkbank.region.formate.vorschau')}
        </h3>
        <dl className="eigenschaften">
          {vorschau(f).map(([k, v]) => (
            <Fragment key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </Fragment>
          ))}
        </dl>
      </section>
    </>
  );
}
