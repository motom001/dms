/**
 * Beschriftungen je Sprache im Mappentyp-Editor (#728): ein kleiner Sprachumschalter an jedem Text. Deutsch bearbeitet
 * den Ausgangstext, jede andere erlaubte Sprache ihre Beschriftung (leer = es gilt der Ausgangstext). Optionen eines
 * Auswahlfelds bekommen je Sprache eine Beschriftung; gespeichert wird in den Mappen weiter der feste Wert.
 */
import { useState, type ReactNode } from 'react';
import { AUSGANGSSPRACHE } from '../../../shared/src/sprache';
import { beschriftungsstand, erlaubteSprachen, sprachname, type Beschriftungen } from '../../../shared/src/beschriftung';
import type { MappentypDaten } from '../../../shared/src/model';
import { t } from '../sprache';
import { Feld, FeldGruppe, Umschalter } from '../bausteine';

type Teile = Record<string, unknown>;

/** Beschriftung eines Teils in einer Sprache setzen; leere Angaben fallen weg. */
export function mitText<T extends object>(b: Beschriftungen<T> | undefined, spr: string, teil: string, text: string): Beschriftungen<T> | undefined {
  const aus = structuredClone(b ?? {}) as Record<string, Teile>;
  const eintrag = { ...(aus[spr] ?? {}) };
  if (text) eintrag[teil] = text; else delete eintrag[teil];
  if (Object.keys(eintrag).length) aus[spr] = eintrag; else delete aus[spr];
  return Object.keys(aus).length ? aus as Beschriftungen<T> : undefined;
}

/** Beschriftung einer Option (fester Wert) in einer Sprache setzen. */
function mitOption<T extends object>(b: Beschriftungen<T> | undefined, spr: string, wert: string, text: string): Beschriftungen<T> | undefined {
  const optionen = { ...((b as Record<string, Teile> | undefined)?.[spr]?.optionen as Record<string, string> | undefined) };
  if (text) optionen[wert] = text; else delete optionen[wert];
  const aus = structuredClone(b ?? {}) as Record<string, Teile>;
  const eintrag: Teile = { ...(aus[spr] ?? {}), optionen };
  if (!Object.keys(optionen).length) delete eintrag.optionen;
  if (Object.keys(eintrag).length) aus[spr] = eintrag; else delete aus[spr];
  return Object.keys(aus).length ? aus as Beschriftungen<T> : undefined;
}

const textIn = (b: Beschriftungen<object> | undefined, spr: string, teil: string) => {
  const v = (b as Record<string, Teile> | undefined)?.[spr]?.[teil];
  return typeof v === 'string' ? v : '';
};

/**
 * Kleiner Umschalter zwischen den erlaubten Sprachen (Baustein `Umschalter`, #1213); ein Punkt markiert Sprachen ohne
 * Beschriftung, für Screenreader mit Text.
 */
export function SprachWahl({ sprache, setze, fehlt, mitAusgang = true }: { sprache: string; setze: (s: string) => void; fehlt?: (s: string) => boolean; mitAusgang?: boolean }) {
  const sprachen = erlaubteSprachen().filter((s) => mitAusgang || s !== AUSGANGSSPRACHE);
  if (sprachen.length < 2 && mitAusgang) return null;
  return (
    <Umschalter className="sprachwahl" beschriftung={t('mappentypen.beschriftung.sprache')} wert={sprache} setze={setze}
      wahlen={sprachen.map((s) => {
        const leer = !!fehlt?.(s);
        return {
          wert: s,
          text: <span title={leer ? t('mappentypen.beschriftung.fehlt', { sprache: sprachname(s) }) : sprachname(s)}>
            {s.toUpperCase()}{leer && <><span className="sprachwahl-luecke" aria-hidden="true" /><span className="sr">{t('mappentypen.beschriftung.fehlt', { sprache: sprachname(s) })}</span></>}
          </span>,
        };
      })} />
  );
}

interface SprachTextEigenschaften {
  /** Name des Felds; `beschriftungVerbergen` in Zeilen, die ihn schon zeigen (nur für Screenreader). */
  beschriftung: ReactNode; beschriftungVerbergen?: boolean; hinweis?: ReactNode; optional?: boolean; className?: string;
  id?: string; placeholder?: string; autoFocus?: boolean;
  /** Ausgangstext (Deutsch) und wie er sich ändert. */
  wert: string; setzeWert: (text: string) => void;
  /** Beschriftungen des Eintrags und welcher Teil (label, hilfe, name, beschreibung). */
  beschriftungen: Beschriftungen<object> | undefined; teil: string; setzeBeschriftungen: (b: Beschriftungen<object> | undefined) => void;
}

/** Eingabe eines Texts mit Sprachumschalter – im Feldrahmen (#1213), der Umschalter rechts neben der Eingabe. */
export function SprachText(p: SprachTextEigenschaften) {
  const [spr, setSpr] = useState(AUSGANGSSPRACHE);
  const ausgang = spr === AUSGANGSSPRACHE;
  return (
    <Feld beschriftung={p.beschriftung} beschriftungVerbergen={p.beschriftungVerbergen} hinweis={p.hinweis} optional={p.optional} className={p.className} id={p.id}>
      {(v) => (
        <span className="sprachtext">
          <input {...v} lang={spr} autoFocus={p.autoFocus}
            value={ausgang ? p.wert : textIn(p.beschriftungen, spr, p.teil)}
            placeholder={ausgang ? p.placeholder : p.wert}
            onChange={(e) => (ausgang ? p.setzeWert(e.target.value) : p.setzeBeschriftungen(mitText(p.beschriftungen, spr, p.teil, e.target.value)))} />
          <SprachWahl sprache={spr} setze={setSpr} fehlt={(s) => s !== AUSGANGSSPRACHE && !!p.wert.trim() && !textIn(p.beschriftungen, s, p.teil).trim()} />
        </span>
      )}
    </Feld>
  );
}

/**
 * Beschriftungen der festen Werte eines Auswahlfelds je Sprache. Ohne Beschriftung zeigt Ablago den festen Wert; die
 * Werte selbst (und damit alles, was in Mappen steht) bleiben, wie sie sind.
 */
export function OptionenBeschriftung({ id, optionen, beschriftungen, setze }: { id: string; optionen: string[]; beschriftungen: Beschriftungen<object> | undefined; setze: (b: Beschriftungen<object> | undefined) => void }) {
  const [spr, setSpr] = useState(AUSGANGSSPRACHE);
  if (!optionen.length) return null;
  const opt = (s: string, w: string) => ((beschriftungen as Record<string, Teile> | undefined)?.[s]?.optionen as Record<string, string> | undefined)?.[w] ?? '';
  return (
    <FeldGruppe className="optionsbeschriftung" beschriftung={t('mappentypen.beschriftung.optionen')} hinweis={t('mappentypen.beschriftung.optionen-hilfe')}
      kopfZusatz={<SprachWahl sprache={spr} setze={setSpr} fehlt={(s) => s !== AUSGANGSSPRACHE && optionen.some((w) => !opt(s, w).trim())} />}>
      <div className="optionszeilen">
        {optionen.map((w, i) => (
          <label key={w} className="optionszeile" htmlFor={`${id}-${i}`}>
            <code className="mono">{w}</code>
            <input id={`${id}-${i}`} lang={spr} value={opt(spr, w)} placeholder={w}
              onChange={(e) => setze(mitOption(beschriftungen, spr, w, e.target.value))} />
          </label>
        ))}
      </div>
    </FeldGruppe>
  );
}

/** Hinweis „12 von 14 Beschriftungen auf Englisch“ je erlaubter Sprache – nie ein Fehler. */
export function Beschriftungsstand({ typ }: { typ: Pick<MappentypDaten, 'name' | 'beschreibung' | 'beschriftungen' | 'felder' | 'register' | 'trefferlisten'> }) {
  const zeilen = erlaubteSprachen().filter((s) => s !== AUSGANGSSPRACHE).map((s) => ({ s, ...beschriftungsstand(typ, s) })).filter((x) => x.gesamt > 0);
  if (!zeilen.length) return null;
  return (
    <p className="leise klein">
      {zeilen.map((x) => t('mappentypen.beschriftung.stand', { vorhanden: x.vorhanden, anzahl: x.gesamt, sprache: sprachname(x.s) })).join(' · ')}
    </p>
  );
}
