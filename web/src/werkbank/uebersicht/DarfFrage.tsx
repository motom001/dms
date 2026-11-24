import { t } from '../../sprache';
import { Etikett, FeldGruppe } from '../../bausteine';

/**
 * Eine Frage als Optionsgruppe: eine Zeile je Antwort, der Satz nur unter der gewählten. Für die Karte „Was Ablago
 * darf“ (#1562) und den Schritt „Was darf Ablago?“ des Einrichtungsassistenten (#1566) – eigene Datei, weil der
 * Assistent ohne Konto zeichnet (#881) und die Karte das Konto braucht.
 */
export function DarfFrage<A extends string>(p: {
  name: string;
  frage: string;
  antworten: readonly A[];
  bereich: 'pakete' | 'selbst';
  wert: A;
  vorgabe: A;
  gesperrt(a: A): boolean;
  heisst: string;
  setze(a: A): void;
}) {
  return (
    <FeldGruppe beschriftung={p.frage}>
      <div className="wahlkarten darf-antworten">
        {p.antworten.map((a) => {
          const aus = p.gesperrt(a);
          return (
            <label key={a} className={`wahlkarte${p.wert === a ? ' gewaehlt' : ''}`}>
              <input type="radio" name={p.name} value={a} checked={p.wert === a} disabled={aus} onChange={() => p.setze(a)} />
              <span className="wahlkarte-text">
                <span>
                  <strong>{t.frei(`werkbank.darf.${p.bereich}.${a}`)}</strong>{' '}
                  {a === p.vorgabe && <Etikett klein>{t('werkbank.darf.empfohlen')}</Etikett>}
                </span>
                {aus && <span className="leise klein">{t('werkbank.darf.anbieter')}</span>}
                {p.wert === a && <span className="leise klein">{t.frei(`werkbank.darf.${p.bereich}.${a}.text`)}</span>}
              </span>
            </label>
          );
        })}
      </div>
      <p className="klein">
        <strong>{t('werkbank.darf.heisst')}</strong> {p.heisst}
      </p>
    </FeldGruppe>
  );
}
