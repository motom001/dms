import { useId, useState, type ReactNode } from 'react';
import { Feld, Mehrfachauswahl } from '../bausteine';
import { useDaten } from '../daten';
import { Link } from '../ort';
import { t } from '../sprache';

/** Eine Rolle zur Wahl: Id der Rollen-Mappe und ihr Name. */
export interface RolleZurWahl {
  id: string;
  name: string;
}

/**
 * Rollen wählen (#1182, überall seit #1311): Verweisfeld mit Mehrfachauswahl wie in den Mappen statt einer Haken-Liste –
 * auf „Eigene Organisation“, am Benutzer und an der Dann-Karte „Favoriten-Änderungen melden“. Unter dem Feld steht, wozu
 * die Wahl dient (`hinweis`), wer ohnehin darf (`immer`, sofern es das gibt), und der Weg zu den Rollen in der Ablage.
 * `rollen === null`: lädt noch.
 */
export function RollenWahl({
  id,
  beschriftung,
  rollen,
  gewaehlt,
  setze,
  hinweis,
  immer,
  anker,
}: {
  /** id des Suchfelds; ohne eine eigene (z. B. mehrere Karten auf einer Seite). */
  id?: string;
  beschriftung: string;
  rollen: RolleZurWahl[] | null;
  gewaehlt: string[];
  setze(ids: string[]): void;
  hinweis?: ReactNode;
  immer?: ReactNode;
  anker?: string;
}) {
  const d = useDaten();
  const eigeneId = useId();
  const [eingabe, setEingabe] = useState('');
  const [offen, setOffen] = useState(false);
  const q = eingabe.trim().toLocaleLowerCase('de');
  const name = (x: string) => rollen?.find((r) => r.id === x)?.name ?? x;
  const rollenTyp = d.typen.find((x) => x.system === 'rolle');
  const weg = rollenTyp && (
    <Link to={`/ablage/${rollenTyp.id}`} className="verweis">
      {t('werkbank.rollenwahl.verwalten')}
    </Link>
  );
  return (
    <Feld
      beschriftung={beschriftung}
      id={id ?? eigeneId}
      anker={anker}
      hinweis={[
        hinweis,
        (immer || weg) && (
          <>
            {immer}
            {immer && weg && ' '}
            {weg}
          </>
        ),
      ]}>
      {(v) => (
        <Mehrfachauswahl
          id={v.id}
          name={beschriftung}
          platzhalter={t('werkbank.rollenwahl.suchen')}
          eingabe={eingabe}
          setEingabe={setEingabe}
          offen={offen}
          setOffen={setOffen}
          vorschlaege={
            rollen &&
            rollen
              .filter((r) => !gewaehlt.includes(r.id) && (!q || r.name.toLocaleLowerCase('de').includes(q)))
              .map((r) => ({ id: r.id, text: r.name }))
          }
          leerText={rollen?.length ? t('werkbank.rollenwahl.alle') : t('werkbank.rollenwahl.keine')}
          waehle={(x) => {
            setze([...gewaehlt, x].sort());
            setEingabe('');
          }}
          gewaehlt={gewaehlt.map((x) => ({
            id: x,
            inhalt: name(x),
            entfernenText: t('werkbank.rollenwahl.entfernen', { name: name(x) }),
          }))}
          entferne={(x) => setze(gewaehlt.filter((y) => y !== x))}
        />
      )}
    </Feld>
  );
}
