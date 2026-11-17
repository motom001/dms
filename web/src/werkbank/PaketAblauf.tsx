import { useContext, useState, type ReactNode } from 'react';
import type { AblaufErgebnis, AblaufPlan } from '../../../shared/src/pakete';
import { ApiFehler } from '../api/anfrage';
import type { PaketVorschau } from '../api/pakete';
import { aufloesen, Auswahl, kandidaten } from './paket-ablauf/auswahl';
import { AblaufErgebnisAnsicht } from './paket-ablauf/ergebnis';
import { Fragen } from './paket-ablauf/fragen';
import { PaketApiKontext, type AblaufQuelle, type PaketVorgabe, type PaketWahl } from './paket-ablauf/kontext';

/**
 * Mehrere Pakete in einem Ablauf (#405): Auswahl als Baum (Abhängigkeiten sichtbar, Ergänzungen wie die Zusatzsprachen
 * der Texterkennung als Häkchen), dann jede Frage einmal – Herkunft, Rechte, Namen nur bei Konflikten, Beispiele (für
 * alle, je Paket abwählbar), Pflicht-Einstellungen (oder bewusst später) –, eine Zusammenfassung und ein Knopf.
 * Derselbe Ablauf in Werkbank → Pakete, im Einrichtungsassistenten (#460) und für die Sammeldatei (#461).
 * Zwischen den Schritten speichert der Server nichts: Er rechnet den Plan bei der Installation neu und prüft, ob die
 * bestätigten Rechte noch dieselben sind.
 */
/** Teile des Ablaufs stehen seit #1279 unter paket-ablauf/; diese Datei bleibt die Tür. */
export { PaketApiKontext, type AblaufQuelle, type PaketApi, type PaketVorgabe, type PaketWahl } from './paket-ablauf/kontext';
export { sammelStand } from './paket-ablauf/auswahl';
export { Fragen } from './paket-ablauf/fragen';

export function PaketAblauf({
  quelle,
  start,
  nur,
  empfohlen = [],
  versionen = {},
  aktionen,
  weiterText,
  fertig,
  geaendert,
  direkt,
  sammeln,
  vorgabe,
}: {
  quelle: AblaufQuelle;
  /** Nur sammeln statt installieren (Einrichtungsassistent, #804). */
  sammeln?(w: PaketWahl): void;
  vorgabe?: PaketVorgabe;
  /** Ohne Fehler gleich `fertig` statt der Ergebnisseite mit „Weiter“ (#659) – die Seite zeigt dann selbst eine Meldung. */
  direkt?: boolean;
  /** Vorgewählt (Paket-Ids bzw. Upload-Kennungen). */
  start: string[];
  /** Nur diese Pakete oben zeigen (Ids), samt ihrer Ergänzungen – z. B. ein Paket aus der Werkbank. */
  nur?: string[];
  /** Mit „empfohlen“ markiert (z. B. Texterkennung im Einrichtungsassistenten). */
  empfohlen?: string[];
  /** Bestimmte Versionen statt der neuesten (Versionsauswahl in der Werkbank). */
  versionen?: Record<string, string>;
  /** Weitere Knöpfe neben „Weiter“ in der Auswahl, z. B. „Überspringen“ oder „Abbrechen“. */
  aktionen?: ReactNode;
  weiterText?: string;
  /** Nach dem Ergebnis („Weiter“). */
  fertig(e: AblaufErgebnis): void;
  /** Nach der Installation (Daten neu laden). */
  geaendert?(): void;
}) {
  const liste = kandidaten(quelle, versionen);
  const [kategorie, setKategorie] = useState<string | null>(null);
  const [wahl, setWahl] = useState<string[]>(() => start.filter((s) => liste.some((k) => k.schluessel === s && !k.gesperrt)));
  const [plan, setPlan] = useState<AblaufPlan<PaketVorschau> | null>(null);
  const [ergebnis, setErgebnis] = useState<AblaufErgebnis | null>(null);
  const [meldung, setMeldung] = useState<{ text: string; gruende?: string[] }>();
  const [laeuft, setLaeuft] = useState(false);
  const pa = useContext(PaketApiKontext);
  const aufgeloest = aufloesen(quelle, liste, wahl, versionen);
  const eingabe = () =>
    quelle.art === 'katalog'
      ? { quelle: quelle.quelle, pakete: wahl.map((id) => (versionen[id] ? `${id}@${versionen[id]}` : id)) }
      : { uploads: aufgeloest.pakete.map((p) => p.schluessel) };

  async function pruefen() {
    setLaeuft(true);
    setMeldung(undefined);
    try {
      setPlan(await pa.plan(eingabe()));
    } catch (e) {
      setMeldung({ text: (e as Error).message, gruende: e instanceof ApiFehler ? e.gruende : [] });
    } finally {
      setLaeuft(false);
    }
  }

  if (ergebnis) return <AblaufErgebnisAnsicht e={ergebnis} weiter={() => fertig(ergebnis)} />;
  if (plan)
    return (
      <Fragen
        key={plan.rechte.stand + plan.pakete.map((p) => p.schluessel).join()}
        plan={plan}
        eingabe={eingabe}
        zurueck={() => setPlan(null)}
        neuerPlan={setPlan}
        sammeln={sammeln}
        vorgabe={vorgabe}
        fertig={(e) => {
          geaendert?.();
          if (direkt && !e.fehler) fertig(e);
          else setErgebnis(e);
        }}
      />
    );
  return (
    <Auswahl
      quelle={quelle}
      liste={liste}
      nur={nur}
      empfohlen={empfohlen}
      wahl={wahl}
      setWahl={setWahl}
      aufgeloest={aufgeloest}
      kategorie={kategorie}
      setKategorie={setKategorie}
      meldung={meldung}
      laeuft={laeuft}
      pruefen={() => void pruefen()}
      weiterText={weiterText}
      aktionen={aktionen}
    />
  );
}
