import { FRAGEN_BEREICH, FRAGEN_STANDARD, type FragenGrenzen } from '../../../shared/src/fragen';
import { Feld } from '../bausteine';
import { Hilfe } from '../Hilfe';
import { t } from '../sprache';

/** Eingabe der Höchstmenge als Text (leer erlaubt, solange man tippt). */
export type FragenEingabe = { ausschnitte: string; zeichen: string };
export const fragenEingabe = (g: FragenGrenzen): FragenEingabe => ({ ausschnitte: String(g.ausschnitte), zeichen: String(g.zeichen) });

/**
 * Werkbank → Pakete → Paket mit dms:antworten → Einstellungen (#444, #996 Feldart `fragen_grenzen`): Höchstmenge je
 * Frage für „Frag deine Ablage“ – wie viele Ausschnitte und wie viele Zeichen Ablago dem Paket höchstens mitgibt.
 * Gespeichert wird mit dem Knopf des Reiters; Fehler je Feld kommen vom Server.
 */
export function FragenGrenzenFeld({
  wert,
  setze,
  fehler = {},
}: {
  wert: FragenEingabe;
  setze: (v: FragenEingabe) => void;
  fehler?: Record<string, string>;
}) {
  const feld = (k: keyof FragenGrenzen, name: string) => (
    <Feld
      beschriftung={name}
      id={`fg-${k}`}
      fehler={fehler[k]}
      hinweis={t('fragen.werkbank.bereich', { min: FRAGEN_BEREICH[k].min, max: FRAGEN_BEREICH[k].max, standard: FRAGEN_STANDARD[k] })}>
      <input
        type="number"
        inputMode="numeric"
        min={FRAGEN_BEREICH[k].min}
        max={FRAGEN_BEREICH[k].max}
        value={wert[k]}
        onChange={(e) => setze({ ...wert, [k]: e.target.value })}
      />
    </Feld>
  );
  return (
    <>
      <p className="leise klein">
        {t('fragen.werkbank.text')} <Hilfe ort="pakete.fragen" />
      </p>
      <div className="frag-grenzen">
        {feld('ausschnitte', t('fragen.werkbank.ausschnitte'))}
        {feld('zeichen', t('fragen.werkbank.zeichen'))}
      </div>
    </>
  );
}
