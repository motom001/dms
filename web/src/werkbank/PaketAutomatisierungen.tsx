import { useState } from 'react';
import { Knopf, Schalter } from '../bausteine';
import { Link } from '../ort';
import { t } from '../sprache';

/**
 * Mitgelieferte Automatisierungen beim Installieren (#1174): Angelegt werden immer alle – gewählt wird nur, welche gleich
 * laufen. Darum je Automatisierung ein Schalter (ein Zustand), kein Haken (eine Auswahl wie „Beispiel-Mappen anlegen“),
 * dazu „Alle an“ und „Alle aus“. Die Überschrift setzt der Aufrufer (`pakete.ablauf.automatisierungen`).
 */
export interface MitgelieferteAutomatisierung {
  /** Eindeutig in dieser Liste (bei mehreren Paketen `paket|schluessel`). */
  schluessel: string;
  name: string;
  /** Beschreibung samt Herkunft und Zeitplan, unter dem Schalter. */
  hinweis?: string;
}

export function AutomatisierungenSchalter({ liste, aus, setAus }: { liste: MitgelieferteAutomatisierung[]; aus: string[]; setAus: (aus: string[]) => void }) {
  const alle = liste.map((a) => a.schluessel);
  return (
    <div className="stapel paket-automatisierungen">
      <p className="leise">{t('pakete.ablauf.automatisierungen.text')}</p>
      <div className="knoepfe">
        <Knopf groesse="klein" gesperrt={!aus.length} onClick={() => setAus([])}>{t('pakete.ablauf.automatisierungen.alle-an')}</Knopf>
        <Knopf groesse="klein" gesperrt={aus.length === alle.length} onClick={() => setAus(alle)}>{t('pakete.ablauf.automatisierungen.alle-aus')}</Knopf>
      </div>
      <ul className="paket-automatisierungen-liste">
        {liste.map((a) => (
          <li key={a.schluessel}>
            <Schalter an={!aus.includes(a.schluessel)} beschriftung={a.name} hinweis={a.hinweis}
              setze={(an) => setAus(an ? aus.filter((x) => x !== a.schluessel) : [...aus, a.schluessel])} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Update-Vorschau (#1174): Selbst geänderte mitgelieferte Automatisierungen fasst ein Update nicht an. Damit eine
 * verbesserte Fassung aus dem Paket nicht unbemerkt verloren geht, stehen sie hier – je mit „Neue Fassung aus dem Paket
 * ansehen“: was das Paket anders macht, lesbar wie bei den Fassungen.
 */
export function GeaenderteAutomatisierungen({ liste }: { liste: Array<{ schluessel: string; name: string; geaendert?: { id: string; aenderungen: string[] } }> }) {
  const [offen, setOffen] = useState<string | null>(null);
  const geaendert = liste.filter((a) => a.geaendert);
  if (!geaendert.length) return null;
  return (
    <div className="stapel">
      <p><strong>{t('pakete.ablauf.automatisierungen.geaendert')}</strong></p>
      <ul className="stapel paket-automatisierungen-geaendert">
        {geaendert.map((a) => (
          <li key={a.schluessel}>
            <Link to={`/werkbank/automatisierungen/${a.geaendert!.id}`} className="verweis">{a.name}</Link>{' '}
            <Knopf art="link" groesse="klein" aria-expanded={offen === a.schluessel} onClick={() => setOffen(offen === a.schluessel ? null : a.schluessel)}>
              {t('pakete.ablauf.automatisierungen.neue-fassung')}
            </Knopf>
            {offen === a.schluessel && (
              <div className="hinweis info">
                <p className="klein">{t('pakete.ablauf.automatisierungen.neue-fassung.text')}</p>
                <ul className="klein">{a.geaendert!.aenderungen.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
