import { useCallback, useEffect, useRef, useState } from 'react';
import type { Benutzer } from '../../../shared/src/model';
import { passendesErgebnis, type TestlaufErgebnis } from '../../../shared/src/testlauf';
import { api, type Bezuege, type Systemkonto } from '../api';
import { t } from '../sprache';
import { Feld, Knopf } from '../bausteine';
import { Symbol } from '../Symbol';
import { MappenWahl } from '../ablage/MappeFormular';
import { useDaten } from '../daten';
import { SystemkontenGruppe, SystemkontoKennzeichen } from './Systemkonten';
import { SYSTEMKONTEN_AUF } from '../../../shared/src/systemkonten';

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

/**
 * Benutzer wählen wie im Verweisfeld; deaktivierte Benutzer sind gekennzeichnet. Es gilt immer der Alltag der Person (#818).
 * `mitKonten` (#710, nur im Testlauf am Mappentyp): zusätzlich die Konten ohne Person – Systemkonten und
 * Paket-Benutzer –, seit #817 als eingeklappte Gruppe über der Auswahl der Personen. Sonst bleiben sie überall ausgeblendet.
 */
export function TestBenutzerWahl({ id, wert, setze, mitKonten }: { id: string; wert: string; setze: (id: string) => void; mitKonten?: boolean }) {
  const d = useDaten();
  const ziel = d.typen.find((mappentyp) => mappentyp.system === 'benutzer');
  const { bekannt, merke } = useBekannt();
  const [konten, setKonten] = useState<Benutzer[]>([]);
  const [ohne, setOhne] = useState<Systemkonto[]>([]);
  useEffect(() => { api.benutzer().then(setKonten).catch(() => {}); }, []);
  useEffect(() => { if (mitKonten) api.systemkonten().then(setOhne).catch(() => {}); }, [mitKonten]);
  if (!ziel) return <p className="leise klein">{t('werkbank.testlaufwahl.der-mappentyp-benutzer-fehlt')}</p>;
  const konto = konten.find((k) => k.id === wert);
  const sonder = ohne.find((k) => k.id === wert);
  const name = (k: Systemkonto) => (k.rolle === 'paket' ? t('werkbank.testlauf.konto.paket', { name: k.paket ?? k.name }) : k.name);
  const system = ohne.filter((k) => k.rolle === 'systemkonto');
  const pakete = ohne.filter((k) => k.rolle === 'paket');
  return (
    <div className="feld">
      <label htmlFor={sonder ? `${id}-konto` : id}>{t('werkbank.testlaufwahl.benutzer')}</label>
      {/* Systemkonten als eingeklappte Gruppe oben (#817), wie in Werkbank → Benutzer. */}
      {mitKonten && ohne.length > 0 && !sonder && (
        <SystemkontenGruppe liste={ohne} auf={d.einstellungen[SYSTEMKONTEN_AUF] === true} setzeAuf={(x) => d.setzeEinstellung(SYSTEMKONTEN_AUF, x || null)} id={`${id}-konten`} kinder={
          <Feld beschriftung={t('werkbank.testlauf.konto.label')} className="klein">
            <select id={`${id}-konto`} value="" onChange={(e) => e.target.value && setze(e.target.value)}>
              <option value="">{t('werkbank.testlauf.konto.leer')}</option>
              {system.length > 0 && <optgroup label={t('werkbank.testlauf.konto.systemkonten')}>{system.map((k) => <option key={k.id} value={k.id}>{name(k)}</option>)}</optgroup>}
              {pakete.length > 0 && <optgroup label={t('werkbank.testlauf.konto.pakete')}>{pakete.map((k) => <option key={k.id} value={k.id}>{name(k)}</option>)}</optgroup>}
            </select>
          </Feld>
        } />
      )}
      {sonder
        ? <div className="mehrfach-gewaehlt"><span className="chip">{name(sonder)} <span className="chip klein">{t.frei(`werkbank.testlauf.konto.kennzeichen.${sonder.rolle}`)}</span><SystemkontoKennzeichen k={sonder} />
            <Knopf art="link" groesse="klein" nurSymbol={t('werkbank.testlauf.konto.entfernen', { name: name(sonder) })} onClick={() => setze('')}><Symbol name="schliessen" /></Knopf></span></div>
        // Platzhalter ohne „Benutzer“ (#1213): die Beschriftung steht schon über dem Feld.
        : <MappenWahl id={id} ziel={ziel} mehrfach={false} wert={wert || undefined} bekannt={bekannt} merke={merke} ohneAnlegen
            platzhalter={t('werkbank.testlauf.benutzer.suchen')} setze={(v) => setze(typeof v === 'string' ? v : '')} />}
      {konto && !konto.aktiv && <span className="chip klein">{t('werkbank.testlaufwahl.deaktiviert')}</span>}
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
      <label htmlFor={id}>{t('werkbank.testlaufwahl.testmappe')}</label>
      <MappenWahl id={id} ziel={ziel} mehrfach={false} wert={wert || undefined} bekannt={bekannt} merke={merke} ohneAnlegen
        platzhalter={t('werkbank.testlauf.mappe.suchen')} setze={(v) => setze(typeof v === 'string' ? v : '')} />
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
