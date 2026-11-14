import { useState, type ReactNode } from 'react';
import { t } from '../../sprache';
import { Knopf } from '../knopf/Knopf';

// Aus ablage/Historie.tsx hierher (#1211): Fassungen nutzt die Liste – so hängt kein Baustein mehr an der Ablage.
/** Ein Eintrag der Liste im Stil der Historie (#707): Zeile mit Zeit, wer, was, rechts Zähler; Einzelheiten zum Aufklappen. */
export interface Listeneintrag {
  id: string | number;
  wann: string;
  wer: ReactNode;
  was: ReactNode;
  /** Zustand o. Ä. als Chip vor dem Zähler (nicht nur über Farbe: immer mit Text). */
  zustand?: ReactNode;
  /** Zähler rechts, z. B. „3 Felder“, „3 Karten“. */
  mehr?: string;
  inhalt?: ReactNode;
  /** Name für Bildschirmleser, wenn aufklappbar. */
  label?: string;
  /** Immer offen, z. B. ein Lauf, der gerade läuft. */
  offen?: boolean;
}

/**
 * Liste wie die Historie einer Mappe (#57, #80): je Eintrag eine Zeile mit Pfeil, Datum und Uhrzeit, wer, Zusammenfassung
 * und Zähler; aufgeklappt die Einzelheiten; „Alle aufklappen“/„Alle zuklappen“. Auch für Verlauf und Änderungsverlauf
 * einer Automatisierung (#707), damit man sich überall gleich zurechtfindet.
 */
export function Eintragsliste({ eintraege }: { eintraege: Listeneintrag[] }) {
  const [alleOffen, setAlleOffen] = useState<boolean | null>(null);
  const aufklappbar = eintraege.some((x) => Boolean(x.inhalt));
  return (
    <>
      {aufklappbar && (
        <div className="historie-kopf">
          <Knopf art="link" onClick={() => setAlleOffen(true)}>{t('ablage.historie.alle-aufklappen')}</Knopf>
          <Knopf art="link" onClick={() => setAlleOffen(false)}>{t('ablage.historie.alle-zuklappen')}</Knopf>
        </div>
      )}
      <ul className="historie">
        {eintraege.map((x) => {
          const kopf = (
            <>
              <span className="zeichen" aria-hidden="true" />
              <span className="wann">{x.wann}</span>
              <span className="wer">{x.wer}</span>
              <span className="was">{x.was}</span>
              {x.zustand}
              {x.mehr && <span className="mehr chip">{x.mehr}</span>}
            </>
          );
          return (
            <li key={x.id}>
              {x.inhalt
                ? <details open={x.offen || (alleOffen ?? undefined)} key={String(alleOffen)}>
                    <summary aria-label={x.label}>{kopf}</summary>
                    <div className="einzelheiten">{x.inhalt}</div>
                  </details>
                : <div className="zeile">{kopf}</div>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
