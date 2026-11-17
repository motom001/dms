/** Gemeinsames der Aufgaben (#1279): Person wählen, Probe aus der Werkbank (#1176), Zuweisen trotz fehlendem Leserecht (#798). */
import { Symbol } from '../../Symbol';
import { Feld } from '../../bausteine';
import { mappenApi } from '../../api/mappen';
import { nameMitAbwesenheit, useDaten } from '../../daten';
import { rueckfrage } from '../../rueckfrage';
import { t } from '../../sprache';

/**
 * Person wählen (Aufgabe weitergeben, Erinnerung für …): im Feldrahmen (#1211). `label` steht als Beschriftung da, wenn
 * `sichtbar`; sonst nur für Screenreader (in einer Zeile, deren Text sie schon nennt).
 */
export function BenutzerWahl({
  wert,
  setze,
  ohne,
  label,
  fokus,
  id,
  sichtbar,
  className,
}: {
  wert: string;
  setze: (id: string) => void;
  ohne?: string | null;
  label: string;
  fokus?: boolean;
  id?: string;
  sichtbar?: boolean;
  className?: string;
}) {
  const d = useDaten();
  return (
    <Feld beschriftung={label} beschriftungVerbergen={!sichtbar} id={id} className={className}>
      <select value={wert} autoFocus={fokus} onChange={(e) => setze(e.target.value)}>
        <option value="">{t('ablage.aufgaben.benutzer-waehlen')}</option>
        {d.personen
          .filter((p) => p.aktiv !== false && p.id !== ohne)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {nameMitAbwesenheit(p)}
            </option>
          ))}
      </select>
    </Feld>
  );
}

/**
 * Ausprobieren in der Werkbank (#1176): derselbe Dialog wie an der Mappe, gekennzeichnet als Probe. Statt anzulegen,
 * gibt er die Antworten an `anwenden` (dort: Ausprobieren auf dem Server, dann die Vorschau des Ergebnisses).
 */
export interface Probe {
  anwenden(x: { empfaengerId?: string; datum?: string; text?: string }): Promise<void>;
}

/** „Probe – es wird nichts angelegt“ oben im Dialog (#1176). */
export function ProbeHinweis() {
  return (
    <div className="hinweis info probe-hinweis">
      <p>
        <Symbol name="info" /> {t('ablage.aufgaben.probe')}
      </p>
    </div>
  );
}

/**
 * Zuweisen von Hand (#798): Darf der Empfänger die Mappe nicht lesen, erst Bescheid sagen – „Trotzdem zuweisen“ oder
 * „Abbrechen“. Rechte vergibt hier niemand; das kann nur der Admin in der Werkbank. Klappt die Prüfung nicht, geht es
 * weiter wie bisher (der Server antwortet dann mit einem Hinweis).
 */
export async function trotzdemZuweisen(mappeId: string, an: string, name: string): Promise<boolean> {
  try {
    if ((await mappenApi.darfLesen(mappeId, an)).lesen) return true;
  } catch {
    return true;
  }
  return rueckfrage({
    titel: t('mappen.aufgabe.zuweisen.titel', { name }),
    text: t('mappen.aufgabe.zuweisen.text', { name }),
    ja: t('mappen.aufgabe.zuweisen.trotzdem'),
    nein: t('mappen.aufgabe.zuweisen.abbrechen'),
  });
}
