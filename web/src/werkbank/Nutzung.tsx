import { useCallback, useEffect, useState } from 'react';
import type { Merkmale } from '../../../shared/src/merkmale';
import { VORLAGEN, vorlageFuer } from '../../../shared/src/werkbankansicht';
import { werkbankApi } from '../api/werkbank';
import { HakenFeld } from '../bausteine';
import { useDaten } from '../daten';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { t } from '../sprache';
import { Kopf } from './Kopf';

/**
 * Werkbank → Ablage aufbauen → Nutzung (#1032): das Merkmal „beruflich genutzt“ der Ablage. Nur für „Gesamte Verwaltung“
 * (die Leiste zeigt den Bereich sonst nicht, der Server lehnt das Ändern ab). Mappentypen zeigen damit ihre beruflichen
 * Felder und Abschnitte (Anzeige-Bedingungen, #1033); die Werkbank-Vorlage folgt, solange sie nicht angepasst ist.
 */
export function useNutzung(offen: boolean) {
  const [stand, setStand] = useState<Merkmale | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await werkbankApi.merkmale()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  return { stand, fehler, setStand };
}
export type NutzungZustand = ReturnType<typeof useNutzung>;

export function NutzungPanel({ z }: { z: NutzungZustand }) {
  const d = useDaten();
  const s = z.stand;
  const [e, setE] = useState<Merkmale | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  useEffect(() => { if (s && !e) setE(s); }, [s, e]);
  const ent = useEntwurf(s, e, { aus: !e, zuruecksetzen: () => { setE(s); setMeldung(undefined); } });
  if (!s || !e) return z.fehler ? <div className="hinweis schlecht"><p>{z.fehler}</p></div> : <p className="leise">{t('werkbank.nutzung.lade')}</p>;
  async function speichern() {
    setSendet(true);
    try {
      const n = await werkbankApi.setzeMerkmale(e!);
      z.setStand(n); setE(n);
      // Formulare der Ablage zeigen gleich, was jetzt dazugehört.
      await d.neuLaden();
      setMeldung({ art: 'gut', text: t('werkbank.nutzung.gespeichert') });
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.bereich.nutzung.name')} hilfe="werkbank.nutzung">
        <p className="leise">{t('werkbank.nutzung.einleitung')}</p>
      </Kopf>
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p></div>}
      <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <HakenFeld beschriftung={t('werkbank.nutzung.beruflich')} hinweis={[t('werkbank.nutzung.beruflich.hinweis'), t('werkbank.nutzung.ordnung')]}>
          <input id="nutzung-beruflich" type="checkbox" checked={e.beruflich} onChange={(x) => setE({ ...e, beruflich: x.target.checked })} />
        </HakenFeld>
        <p className="leise klein">{t('werkbank.nutzung.vorlage', { vorlage: VORLAGEN[vorlageFuer(e)].name })}</p>
        <Speicherleiste ent={ent} gegenstand={t('werkbank.bereich.nutzung.name')} sendet={sendet} />
      </form>
    </div>
  );
}
