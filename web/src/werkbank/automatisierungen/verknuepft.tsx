import { feldLabel, optionText } from '../../../../shared/src/beschriftung';
import {
  NUR_WENN,
  setzbar,
  verknuepfteTypen,
  type DannVerknuepft,
  type Kontextdaten,
  type NurWenn,
  type WennKarte,
} from '../../../../shared/src/automatisierung';
import type { Feld as FeldDef, Mappentyp } from '../../../../shared/src/model';
import { gemeinsameFelder, jedeMappe, zieleVon } from '../../../../shared/src/verweisziele';
import { Feld, Knopf, Platzhalter, usePlatzhalterEinsetzen } from '../../bausteine';
import { t } from '../../sprache';
import { platzhalterGruppen } from '../AutomatisierungAussen';

/**
 * Dann-Karte „Feld in verknüpfter Mappe setzen“ (#1557): erst das Verweisfeld der auslösenden Mappe, dann Felder des
 * Zieltyps (bei mehreren Zieltypen die, die alle haben) mit Wert und „Überschreiben“ (`nurWenn`). Werte wie bei „Feld
 * ändern“; ein einzelner Platzhalter wie `{naechste_hu}` übernimmt den Wert unverändert.
 */

/** Wert eines Zielfelds: Auswahl und Ja/Nein als Liste, sonst Text mit Platzhaltern. */
function WertEingabe({
  f,
  schluessel,
  v,
  eingabe,
  setze,
}: {
  f: FeldDef | undefined;
  schluessel: string;
  v: unknown;
  eingabe: ReturnType<ReturnType<typeof usePlatzhalterEinsetzen>['feld']>;
  setze: (w: unknown) => void;
}) {
  const name = f ? feldLabel(f) : schluessel;
  if (f?.typ === 'auswahl')
    return (
      <Feld beschriftung={name} beschriftungVerbergen>
        <select value={String(v ?? '')} onChange={(x) => setze(x.target.value)}>
          <option value="">–</option>
          {(f.optionen ?? []).map((o) => (
            <option key={o} value={o}>
              {optionText(f, o)}
            </option>
          ))}
        </select>
      </Feld>
    );
  if (f?.typ === 'janein')
    return (
      <Feld beschriftung={name} beschriftungVerbergen>
        <select value={v === true ? 'ja' : v === false ? 'nein' : ''} onChange={(x) => setze(x.target.value === 'ja')}>
          <option value="ja">{t('automatisierung.ui.ja')}</option>
          <option value="nein">{t('automatisierung.ui.nein')}</option>
        </select>
      </Feld>
    );
  return (
    <Feld beschriftung={name} beschriftungVerbergen>
      <input
        {...eingabe}
        value={String(v ?? '')}
        placeholder={f?.typ === 'datum' ? t('automatisierung.ui.karte.dann.verknuepft.datum') : ''}
        onChange={(x) => setze(x.target.value)}
      />
    </Feld>
  );
}

export function VerknuepftKarte({
  karte,
  typ,
  wenn,
  k,
  setze,
}: {
  karte: DannVerknuepft;
  typ: Mappentyp | null;
  wenn: WennKarte;
  k: Kontextdaten;
  setze: (k: DannVerknuepft) => void;
}) {
  const ein = usePlatzhalterEinsetzen();
  const verweise = (typ?.felder ?? []).filter((f) => f.typ === 'referenz' && !jedeMappe(f) && zieleVon(f).length > 0);
  const { ziele } = verknuepfteTypen(karte, typ, k.typen);
  const felder = gemeinsameFelder(ziele.map((z) => z.felder));
  const gewaehlt = Object.keys(karte.werte);
  const setzeWert = (key: string, w: unknown) => setze({ ...karte, werte: { ...karte.werte, [key]: w } });
  return (
    <div className="karte offen">
      {!typ && <p className="fehlertext klein">{t('automatisierung.ui.karte.dann.feld.ohne-typ')}</p>}
      {typ && !verweise.length && <p className="fehlertext klein">{t('automatisierung.ui.karte.dann.verknuepft.ohne-verweis')}</p>}
      <div className="raster">
        <Feld beschriftung={t('automatisierung.ui.karte.dann.verknuepft.ueber')}>
          <select value={karte.ueber} onChange={(x) => setze({ ...karte, ueber: x.target.value, werte: {} })}>
            {!verweise.some((f) => f.key === karte.ueber) && (
              <option value={karte.ueber}>{karte.ueber || t('automatisierung.ui.karte.dann.verknuepft.ueber.waehlen')}</option>
            )}
            {verweise.map((f) => (
              <option key={f.key} value={f.key}>
                {feldLabel(f)}
              </option>
            ))}
          </select>
        </Feld>
        <Feld beschriftung={t('automatisierung.ui.karte.dann.verknuepft.nur-wenn')}>
          <select
            value={karte.nurWenn ?? 'immer'}
            onChange={(x) => {
              const n = x.target.value as NurWenn;
              setze({ id: karte.id, art: karte.art, ueber: karte.ueber, werte: karte.werte, ...(n === 'immer' ? {} : { nurWenn: n }) });
            }}>
            {NUR_WENN.map((n) => (
              <option key={n} value={n}>
                {t.frei(`automatisierung.ui.karte.dann.verknuepft.nur-wenn.${n}`)}
              </option>
            ))}
          </select>
        </Feld>
      </div>
      <ul className="stapel">
        {gewaehlt.map((key) => {
          const f = felder.find((x) => x.key === key);
          return (
            <li key={key} className="bedingungszeile">
              <strong>{f ? feldLabel(f) : key}</strong>
              <WertEingabe
                f={f}
                schluessel={key}
                v={karte.werte[key]}
                eingabe={ein.feld(key, String(karte.werte[key] ?? ''), (w) => setzeWert(key, w))}
                setze={(w) => setzeWert(key, w)}
              />
              <Knopf
                groesse="klein"
                symbol="schliessen"
                onClick={() => {
                  const w = { ...karte.werte };
                  delete w[key];
                  setze({ ...karte, werte: w });
                }}>
                {t('automatisierung.ui.entfernen')}
              </Knopf>
            </li>
          );
        })}
      </ul>
      {ziele.length > 0 && (
        <Feld beschriftung={t('automatisierung.ui.karte.dann.feld.waehlen')} beschriftungVerbergen>
          <select value="" onChange={(x) => x.target.value && setzeWert(x.target.value, '')}>
            <option value="">{t('automatisierung.ui.karte.dann.feld.waehlen')}</option>
            {felder
              .filter((f) => setzbar(f) && !gewaehlt.includes(f.key))
              .map((f) => (
                <option key={f.key} value={f.key}>
                  {feldLabel(f)}
                </option>
              ))}
          </select>
        </Feld>
      )}
      {gewaehlt.length > 0 && <Platzhalter einsetzen={ein.einsetzen} gruppen={platzhalterGruppen(wenn, typ)} />}
      <p className="leise klein">{t('automatisierung.ui.karte.dann.verknuepft.text')}</p>
    </div>
  );
}
