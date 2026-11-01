import { useCallback, useEffect, useRef, useState } from 'react';
import type { Benutzer } from '../../../shared/src/model';
import { passendesErgebnis, type TestlaufErgebnis } from '../../../shared/src/testlauf';
import { api, type Bezuege } from '../api';
import { MappenWahl } from '../ablage/MappeFormular';
import { useDaten } from '../daten';

/**
 * Auswahl für die Testläufe der Werkbank (#371): Benutzer und Testmappe werden mit derselben
 * Komponente gewählt wie ein Verweisfeld in einer Mappe (`MappenWahl`). Benutzer sind Mappen
 * vom Systemtyp Benutzer; ihre Kennung ist die des Kontos.
 */

function useBekannt() {
  const [bekannt, setBekannt] = useState<Bezuege>({});
  const merke = useCallback((id: string, b: { titel: string; typId: string }) => setBekannt((x) => ({ ...x, [id]: b })), []);
  return { bekannt, merke };
}

/** Benutzer wählen wie im Verweisfeld; Administratoren und deaktivierte Benutzer sind gekennzeichnet. */
export function TestBenutzerWahl({ id, wert, setze }: { id: string; wert: string; setze: (id: string) => void }) {
  const d = useDaten();
  const ziel = d.typen.find((t) => t.system === 'benutzer');
  const { bekannt, merke } = useBekannt();
  const [konten, setKonten] = useState<Benutzer[]>([]);
  useEffect(() => { api.benutzer().then(setKonten).catch(() => {}); }, []);
  if (!ziel) return <p className="leise klein">Der Mappentyp Benutzer fehlt.</p>;
  const konto = konten.find((k) => k.id === wert);
  return (
    <div className="feld">
      <label htmlFor={id}>Benutzer</label>
      <MappenWahl id={id} ziel={ziel} mehrfach={false} wert={wert || undefined} bekannt={bekannt} merke={merke} ohneAnlegen
        setze={(v) => setze(typeof v === 'string' ? v : '')} />
      {konto?.rolle === 'admin' && <span className="chip warn klein">Administrator – für ihn gelten die Regeln nicht</span>}
      {konto && !konto.aktiv && <span className="chip klein">deaktiviert</span>}
    </div>
  );
}

/** Testmappe eines Mappentyps wählen wie im Verweisfeld (einfach, nicht mehrfach). */
export function TestMappeWahl({ id, typId, wert, setze }: { id: string; typId: string; wert: string; setze: (id: string) => void }) {
  const d = useDaten();
  const ziel = d.typ(typId);
  const { bekannt, merke } = useBekannt();
  if (!ziel) return null;
  return (
    <div className="feld">
      <label htmlFor={id}>Testmappe</label>
      <MappenWahl id={id} ziel={ziel} mehrfach={false} wert={wert || undefined} bekannt={bekannt} merke={merke} ohneAnlegen
        setze={(v) => setze(typeof v === 'string' ? v : '')} />
    </div>
  );
}

/**
 * Ergebnis eines Testlaufs, gebunden an den Schlüssel der Auswahl (`testlaufSchluessel`).
 * Angezeigt wird es nur, solange der Schlüssel passt; eine Antwort zu einer inzwischen
 * geänderten Auswahl wird verworfen. Wechselt `auto` (Benutzer/Mappe) und ist alles gewählt,
 * wird sofort neu geprüft.
 */
export function useTestlauf<T>(schluessel: string, auto: string, holen: () => Promise<T>) {
  const [erg, setErg] = useState<TestlaufErgebnis<T>>();
  const [fehler, setFehler] = useState<TestlaufErgebnis<string>>();
  const aktuell = useRef(schluessel);
  aktuell.current = schluessel;
  const holenRef = useRef(holen);
  holenRef.current = holen;
  const los = useCallback(async () => {
    const k = aktuell.current;
    if (!k) return;
    try {
      const wert = await holenRef.current();
      if (aktuell.current === k) { setErg({ schluessel: k, wert }); setFehler(undefined); }
    } catch (x) {
      if (aktuell.current === k) { setFehler({ schluessel: k, wert: (x as Error).message }); setErg(undefined); }
    }
  }, []);
  useEffect(() => { if (aktuell.current) void los(); }, [auto, los]);
  return { erg: passendesErgebnis(erg, schluessel), fehler: passendesErgebnis(fehler, schluessel), los };
}
