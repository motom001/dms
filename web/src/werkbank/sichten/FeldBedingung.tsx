import { optionText, typName } from '../../../../shared/src/beschriftung';
import { einzigesZiel, zieleVon } from '../../../../shared/src/model';
import {
  DYNAMISCH,
  EINHEITEN,
  OPERATOREN,
  operatorenFuer,
  type Bedingung,
  type Bedingungsfeld,
  type Einheit,
  type Operator,
  type WertAngabe,
} from '../../../../shared/src/sichten';
import { useDaten } from '../../daten';
import { MappenSuche } from '../MappenSuche';
import { t } from '../../sprache';
import { Feld, FeldGruppe, ZeitraumEingabe, type ZeitraumRoh } from '../../bausteine';
import type { Zeitraumeinheit } from '../../../../shared/src/feldarten';

/* ---------- Vergleich und Wert einer Feldbedingung (Ansichten, Auswahlfilter, Automatisierungen, Berechtigungen) ---------- */

type WertArt = WertAngabe['art'];

export function FeldBedingung({
  b,
  feld,
  setze,
  titel,
  merke,
}: {
  b: Extract<Bedingung, { art: 'feld' }>;
  feld: Bedingungsfeld;
  setze: (b: Bedingung) => void;
  titel: Record<string, string>;
  merke: (id: string, text: string) => void;
}) {
  const d = useDaten();
  // „zeigt auf Mappe vom Typ …“ (#1036) nur bei Verweisen mit mehreren Zieltypen; eine gespeicherte Bedingung bleibt wählbar.
  const ops = operatorenFuer(feld).concat(b.op === 'zeigtAufTyp' && !operatorenFuer(feld).includes('zeigtAufTyp') ? ['zeigtAufTyp'] : []);
  const ohneWert = ['leer', 'nichtLeer', 'ja', 'nein'].includes(b.op);
  const zwei = b.op === 'zwischen' || b.op === 'ausserhalb';
  const datum = feld.art === 'datum' || feld.art === 'zeit';
  const standardWert = (op: Operator): WertAngabe | undefined => {
    if (['leer', 'nichtLeer', 'ja', 'nein'].includes(op)) return undefined;
    if (op === 'imZeitraum') return { art: 'jahr', versatz: 0 };
    if (op === 'zeigtAuf') return feld.art === 'person' || zielSystem(feld) === 'benutzer' ? { art: 'ich' } : { art: 'fest', wert: [] };
    if (op === 'einerVon' || op === 'zeigtAufTyp') return { art: 'fest', wert: [] };
    if (datum) return { art: 'heute', versatz: 0, einheit: 'tage' };
    if (feld.art === 'zeitraum') return { art: 'fest', wert: 'P3M' };
    return { art: 'fest', wert: feld.art === 'zahl' || feld.art === 'betrag' || feld.art === 'prozent' ? 0 : '' };
  };
  const zielSystem = (f: Bedingungsfeld) => {
    const z = f.feld ? einzigesZiel(f.feld) : undefined;
    return z ? (d.typ(z)?.system ?? null) : null;
  };
  const wechsleOp = (op: Operator) => {
    const n: Extract<Bedingung, { art: 'feld' }> = { art: 'feld', feld: b.feld, op };
    const w = standardWert(op);
    if (w)
      n.wert =
        b.wert &&
        !['jahr', 'monat'].includes(b.wert.art) &&
        op !== 'imZeitraum' &&
        op !== 'zeigtAuf' &&
        op !== 'einerVon' &&
        op !== 'zeigtAufTyp' &&
        b.op !== 'zeigtAufTyp'
          ? b.wert
          : w;
    if (op === 'zwischen' || op === 'ausserhalb') n.bis = b.bis ?? (datum ? { art: 'heute', versatz: 30, einheit: 'tage' } : n.wert);
    setze(n);
  };

  return (
    <>
      <Feld beschriftung={t('werkbank.sichten.vergleich')} beschriftungVerbergen>
        <select value={b.op} onChange={(x) => wechsleOp(x.target.value as Operator)}>
          {ops.map((o) => (
            <option key={o} value={o}>
              {OPERATOREN[o]}
            </option>
          ))}
        </select>
      </Feld>
      {!ohneWert && b.op === 'imZeitraum' && <Zeitraum w={b.wert} setze={(w) => setze({ ...b, wert: w })} />}
      {!ohneWert && b.op === 'einerVon' && <Auswahl feld={feld} w={b.wert} setze={(w) => setze({ ...b, wert: w })} />}
      {!ohneWert && b.op === 'zeigtAuf' && (
        <Verweisziel feld={feld} w={b.wert} setze={(w) => setze({ ...b, wert: w })} titel={titel} merke={merke} system={zielSystem(feld)} />
      )}
      {!ohneWert && b.op === 'zeigtAufTyp' && <ZieltypWahl feld={feld} w={b.wert} setze={(w) => setze({ ...b, wert: w })} />}
      {!ohneWert && !['imZeitraum', 'einerVon', 'zeigtAuf', 'zeigtAufTyp'].includes(b.op) && (
        <>
          <Einzelwert feld={feld} w={b.wert} setze={(w) => setze({ ...b, wert: w })} />
          {zwei && (
            <>
              <span className="leise">{t('werkbank.sichten.und')}</span>
              <Einzelwert feld={feld} w={b.bis} setze={(w) => setze({ ...b, bis: w })} />
            </>
          )}
        </>
      )}
    </>
  );
}

/** „zeigt auf Mappe vom Typ …“ (#1036): einer oder mehrere der Zieltypen des Verweisfelds (= einer von). */
function ZieltypWahl({ feld, w, setze }: { feld: Bedingungsfeld; w?: WertAngabe; setze: (w: WertAngabe) => void }) {
  const d = useDaten();
  const gewaehlt = w?.art === 'fest' && Array.isArray(w.wert) ? w.wert : [];
  const ziele = feld.feld ? zieleVon(feld.feld) : [];
  return (
    <FeldGruppe beschriftung={t('werkbank.sichten.zieltypen')} className="wertgruppe umbruch">
      {[...new Set([...ziele, ...gewaehlt])].map((id) => (
        <label key={id} className="haken klein">
          <input
            type="checkbox"
            checked={gewaehlt.includes(id)}
            onChange={(x) => setze({ art: 'fest', wert: x.target.checked ? [...gewaehlt, id] : gewaehlt.filter((y) => y !== id) })}
          />
          <span>{d.typ(id) ? typName(d.typ(id)!) : t('werkbank.sichten.typ-fehlt')}</span>
        </label>
      ))}
    </FeldGruppe>
  );
}

function Einzelwert({ feld, w, setze }: { feld: Bedingungsfeld; w?: WertAngabe; setze: (w: WertAngabe) => void }) {
  const datum = feld.art === 'datum' || feld.art === 'zeit';
  const zahl = feld.art === 'zahl' || feld.art === 'betrag' || feld.art === 'prozent';
  // Zeitraum (#1035): Zahl und Einheit, gespeichert als P3M; verglichen wird in Tagen.
  if (feld.art === 'zeitraum') {
    const roh = zeitraumRohAus(w?.art === 'fest' ? String(w.wert) : 'P3M');
    return (
      <ZeitraumEingabe
        aria-label={t('werkbank.sichten.wert')}
        wert={roh}
        setze={(r) => setze({ art: 'fest', wert: `P${r.anzahl.trim()}${ISO_EINHEIT[r.einheit]}` })}
      />
    );
  }
  if (datum) {
    const art: WertArt = w?.art === 'fest' ? 'fest' : 'heute';
    return (
      <span className="wertgruppe">
        <Feld beschriftung={t('werkbank.sichten.art-des-werts')} beschriftungVerbergen>
          <select
            value={art}
            onChange={(x) =>
              setze(
                x.target.value === 'fest'
                  ? { art: 'fest', wert: new Date().toISOString().slice(0, 10) }
                  : { art: 'heute', versatz: 0, einheit: 'tage' },
              )
            }>
            <option value="heute">{DYNAMISCH.heute}</option>
            <option value="fest">{t('werkbank.sichten.festes-datum')}</option>
          </select>
        </Feld>
        {w?.art === 'fest' ? (
          <Feld beschriftung={t('werkbank.sichten.datum')} beschriftungVerbergen>
            <input type="date" value={String(w.wert)} onChange={(x) => setze({ art: 'fest', wert: x.target.value })} />
          </Feld>
        ) : (
          <Versatz w={w?.art === 'heute' ? w : { art: 'heute' }} setze={setze} einheiten />
        )}
      </span>
    );
  }
  const v = w?.art === 'fest' ? w.wert : '';
  return (
    <Feld beschriftung={t('werkbank.sichten.wert')} beschriftungVerbergen>
      <input
        className={zahl ? 'kurz' : ''}
        inputMode={zahl ? 'decimal' : undefined}
        value={String(v)}
        onChange={(x) =>
          setze({
            art: 'fest',
            wert: zahl ? ((x.target.value === '' ? '' : Number(x.target.value.replace(',', '.'))) as number) : x.target.value,
          })
        }
      />
    </Feld>
  );
}

const ISO_EINHEIT: Record<Zeitraumeinheit, string> = { tage: 'D', wochen: 'W', monate: 'M', jahre: 'Y' };
/** Vergleichswert „P3M“ als Anzahl und Einheit; was halb getippt ist („P M“), bleibt sichtbar. */
function zeitraumRohAus(s: string): ZeitraumRoh {
  const m = /^P(.*)([DWMY])$/.exec(s);
  const einheit = (Object.keys(ISO_EINHEIT) as Zeitraumeinheit[]).find((k) => ISO_EINHEIT[k] === m?.[2]) ?? 'monate';
  return { anzahl: m?.[1] ?? '', einheit };
}

function Versatz({ w, setze, einheiten }: { w: WertAngabe; setze: (w: WertAngabe) => void; einheiten?: boolean }) {
  const versatz = 'versatz' in w ? Number(w.versatz) || 0 : 0;
  return (
    <>
      <Feld beschriftung={t('werkbank.sichten.richtung')} beschriftungVerbergen>
        <select
          value={versatz < 0 ? '-' : '+'}
          onChange={(x) => setze({ ...w, versatz: Math.abs(versatz) * (x.target.value === '-' ? -1 : 1) } as WertAngabe)}>
          <option value="+">+</option>
          <option value="-">−</option>
        </select>
      </Feld>
      <Feld beschriftung={t('werkbank.sichten.anzahl')} beschriftungVerbergen>
        <input
          type="number"
          min={0}
          className="kurz"
          value={Math.abs(versatz)}
          onChange={(x) =>
            setze({ ...w, versatz: Math.abs(Math.trunc(Number(x.target.value) || 0)) * (versatz < 0 ? -1 : 1) } as WertAngabe)
          }
        />
      </Feld>
      {einheiten && w.art === 'heute' && (
        <Feld beschriftung={t('werkbank.sichten.einheit')} beschriftungVerbergen>
          <select value={w.einheit ?? 'tage'} onChange={(x) => setze({ ...w, einheit: x.target.value as Einheit })}>
            {Object.entries(EINHEITEN).map(([k, eintrag]) => (
              <option key={k} value={k}>
                {eintrag}
              </option>
            ))}
          </select>
        </Feld>
      )}
    </>
  );
}

function Zeitraum({ w, setze }: { w?: WertAngabe; setze: (w: WertAngabe) => void }) {
  const art = w?.art === 'monat' ? 'monat' : 'jahr';
  const aktuell: WertAngabe = w && (w.art === 'jahr' || w.art === 'monat') ? w : { art: 'jahr', versatz: 0 };
  return (
    <span className="wertgruppe">
      <Feld beschriftung={t('werkbank.sichten.zeitraum')} beschriftungVerbergen>
        <select
          value={art}
          onChange={(x) => setze({ art: x.target.value as 'jahr' | 'monat', versatz: 'versatz' in aktuell ? aktuell.versatz : 0 })}>
          <option value="jahr">{t('werkbank.sichten.jahr')}</option>
          <option value="monat">{t('werkbank.sichten.monat')}</option>
        </select>
      </Feld>
      <span className="leise klein">{t('werkbank.sichten.aktuell')}</span>
      <Versatz w={aktuell} setze={setze} />
    </span>
  );
}

function Auswahl({ feld, w, setze }: { feld: Bedingungsfeld; w?: WertAngabe; setze: (w: WertAngabe) => void }) {
  const gewaehlt = w?.art === 'fest' && Array.isArray(w.wert) ? w.wert : [];
  return (
    <FeldGruppe beschriftung={t('werkbank.sichten.wert')} beschriftungVerbergen className="wertgruppe umbruch">
      {(feld.feld?.optionen ?? []).map((o) => (
        <label key={o} className="haken klein">
          <input
            type="checkbox"
            checked={gewaehlt.includes(o)}
            onChange={(x) => setze({ art: 'fest', wert: x.target.checked ? [...gewaehlt, o] : gewaehlt.filter((y) => y !== o) })}
          />
          <span>{feld.feld ? optionText(feld.feld, o) : o}</span>
        </label>
      ))}
    </FeldGruppe>
  );
}

/** Ziel eines Verweises: bestimmte Mappen, aktueller Benutzer (bei Benutzer-Verweisen) oder seine Rollen (bei Rollen-Verweisen). */
function Verweisziel({
  feld,
  w,
  setze,
  titel,
  merke,
  system,
}: {
  feld: Bedingungsfeld;
  w?: WertAngabe;
  setze: (w: WertAngabe) => void;
  titel: Record<string, string>;
  merke: (id: string, text: string) => void;
  system: string | null;
}) {
  const d = useDaten();
  const person = feld.art === 'person';
  const art = w?.art ?? 'fest';
  const gewaehlt = w?.art === 'fest' && Array.isArray(w.wert) ? w.wert : [];
  // Mehrere Zieltypen (#1036): Mappen aus allen.
  const zielTypen = person
    ? [d.typen.find((mappentyp) => mappentyp.system === 'benutzer')?.id].filter((x): x is string => !!x)
    : feld.feld
      ? zieleVon(feld.feld)
      : [];
  return (
    <span className="wertgruppe umbruch">
      <Feld beschriftung={t('werkbank.sichten.ziel')} beschriftungVerbergen>
        <select
          value={art}
          onChange={(x) => setze(x.target.value === 'fest' ? { art: 'fest', wert: [] } : { art: x.target.value as 'ich' | 'meineRollen' })}>
          <option value="fest">{person ? t('werkbank.sichten.bestimmter-benutzer') : t('werkbank.sichten.bestimmte-mappe')}</option>
          {(person || system === 'benutzer') && <option value="ich">{DYNAMISCH.ich}</option>}
          {!person && system === 'rolle' && <option value="meineRollen">{DYNAMISCH.meineRollen}</option>}
        </select>
      </Feld>
      {art === 'fest' && zielTypen.length > 0 && (
        <MappenSuche typId={zielTypen} gewaehlt={gewaehlt} titel={titel} merke={merke} setze={(ids) => setze({ art: 'fest', wert: ids })} />
      )}
    </span>
  );
}
