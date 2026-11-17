import { useEffect, useState } from 'react';
import type { Mappe } from '../../../shared/src/model';
import { mappenApi } from '../api/mappen';
import { Feld, Knopf } from '../bausteine';
import { titelOder } from '../seiten';
import { t } from '../sprache';
import { Symbol } from '../Symbol';

/**
 * Mappen suchen und wählen (Vergleichswert „bestimmte Mappe“ in Bedingungen und Regeln): gewählte Mappen als Chips,
 * darunter die Suche. Eigene Datei seit #1278 (Schritt 5; vorher in Sichten.tsx), weil auch die Rechte an Sichten
 * (SichtRechte.tsx) und die Berechtigungen sie brauchen und Sichten.tsx die Rechte an Sichten zeigt.
 */
export function MappenSuche({
  typId,
  gewaehlt,
  titel,
  merke,
  setze,
}: {
  /** Ein Typ oder mehrere (#1036). */ typId: string | string[];
  gewaehlt: string[];
  titel: Record<string, string>;
  merke: (id: string, text: string) => void;
  setze: (ids: string[]) => void;
}) {
  const [eingabe, setEingabe] = useState('');
  const [treffer, setTreffer] = useState<Mappe[]>([]);
  const fehlend = gewaehlt.filter((x) => !titel[x]).join(',');
  useEffect(() => {
    for (const x of fehlend ? fehlend.split(',') : [])
      mappenApi
        .mappe(x)
        .then((r) => merke(x, titelOder(r.mappe.titel)))
        .catch(() => merke(x, '(gelöscht)'));
  }, [fehlend]); // eslint-disable-line react-hooks/exhaustive-deps -- Namen nur nachladen, wenn sich die Liste der fehlenden Mappen ändert
  useEffect(() => {
    if (!eingabe.trim()) {
      setTreffer([]);
      return;
    }
    let aktuell = true;
    const ids = Array.isArray(typId) ? typId : [typId];
    const timer = setTimeout(() => {
      void Promise.all(ids.map((x) => mappenApi.seite(`typ:${x}`, 0, 8, eingabe.trim())))
        .then((l) => aktuell && setTreffer(l.flatMap((x) => x.mappen)))
        .catch(() => {});
    }, 200);
    return () => {
      aktuell = false;
      clearTimeout(timer);
    };
  }, [eingabe, Array.isArray(typId) ? typId.join(',') : typId]); // eslint-disable-line react-hooks/exhaustive-deps -- die Liste der Typen als Text
  return (
    <span className="mappensuche">
      {gewaehlt.map((x) => (
        <span key={x} className="chip">
          {titel[x] ?? '…'}{' '}
          <Knopf groesse="klein" nurSymbol={t('werkbank.sichten.entfernen-2')} onClick={() => setze(gewaehlt.filter((y) => y !== x))}>
            <Symbol name="schliessen" />
          </Knopf>
        </span>
      ))}
      <Feld beschriftung={t('werkbank.sichten.mappe-suchen')} beschriftungVerbergen className="wahl">
        {(v) => (
          <>
            <input {...v} placeholder={t('werkbank.sichten.suchen')} value={eingabe} onChange={(x) => setEingabe(x.target.value)} />
            {treffer.length > 0 && (
              <span className="wahlliste" role="listbox">
                {treffer
                  .filter((m) => !gewaehlt.includes(m.id))
                  .map((m) => (
                    <Knopf
                      key={m.id}

                      onClick={() => {
                        merke(m.id, titelOder(m.titel));
                        setze([...gewaehlt, m.id]);
                        setEingabe('');
                      }}>
                      {titelOder(m.titel)}
                    </Knopf>
                  ))}
              </span>
            )}
          </>
        )}
      </Feld>
    </span>
  );
}
