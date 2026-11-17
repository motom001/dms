import { useState } from 'react';
import { vergleicheVersion } from '../../../../shared/src/pakete';
import { paketeApi, type PaketVorschau } from '../../api/pakete';
import { useDaten } from '../../daten';
import { geheZu } from '../../ort';
import { t } from '../../sprache';
import type { PaketeZustand } from '../paketeZustand';
import { alsMeldung, type Meldung } from '../PaketVorschau';
import { useAnleitungNeu, usePaketReiter } from './reiter';
import { behaltenText, entferneMitFragen, vorgabenText } from './teile';

/**
 * Zustand der Paketseite (#188; #1279 aus PaketDetail gezogen): installiertes Paket bzw. Katalogpaket, Version,
 * Vorschau, Meldung, Entfernen (mit Einstellungen behalten, #197), Beispiele entfernen (#878), Ablauf (#405).
 */

/** Woher das Paket kommt: installiert, im Katalog (eigene Quelle bei installierten), offiziell oder nicht (#622). */
function useHerkunft(z: PaketeZustand, id: string, quelle: string | undefined) {
  const inst = z.stand?.installiert.find((p) => p.id === id) ?? null;
  // Installierte Pakete: Updates nur aus ihrer Quelle.
  const eigeneQuelle = inst?.herkunft.art === 'katalog' && inst.herkunft.url !== z.stand?.katalogUrl ? inst.herkunft.url : undefined;
  const aus = z.paketAus(id, quelle ?? eigeneQuelle);
  const kp = aus?.kp;
  const offiziell = inst
    ? inst.herkunft.art === 'katalog' && inst.herkunft.url === z.stand?.katalogUrl
    : !quelle || quelle === z.stand?.katalogUrl;
  const katalog = aus ? (z.kataloge?.liste.find((k) => k.url === aus.url)?.katalog ?? null) : null;
  return { inst, eigeneQuelle, aus, kp, offiziell, katalog };
}

export function usePaketDetail(z: PaketeZustand, id: string, quelle?: string) {
  const d = useDaten();
  const h = useHerkunft(z, id, quelle);
  const { inst, eigeneQuelle, kp, offiziell } = h;
  const r = usePaketReiter(inst);
  const [version, setVersion] = useState<string>('');
  const [vorschau, setVorschau] = useState<PaketVorschau | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<Meldung>();
  const [entfernenOffen, setEntfernenOffen] = useState(false);
  const [behalten, setBehalten] = useState(false);
  // Installieren im gemeinsamen Ablauf (#405): mit Abhängigkeiten (auch mit Code) und Ergänzungen in einem Schritt.
  const [ablauf, setAblauf] = useState(false);
  const [anleitungNeu, setAnleitungNeu] = useAnleitungNeu();
  const v = kp?.versionen.find((x) => x.version === (version || kp.aktuell)) ?? kp?.versionen[0];
  const neuer = inst && inst.herkunft.art === 'katalog' && kp && vergleicheVersion(kp.aktuell, inst.version) > 0 ? kp.aktuell : null;
  // Paketseite im Katalog (#622): nur für Pakete aus dem offiziellen Katalog, nicht für hochgeladene.
  const imKatalog = offiziell && (inst ? inst.herkunft.art === 'katalog' : !!kp);

  async function zeigeVorschau(ver?: string) {
    setMeldung(undefined);
    setLaeuft(true);
    try {
      setVorschau(await paketeApi.paketVorschau({ id, version: ver, quelle: inst ? eigeneQuelle : quelle }));
    } catch (e) {
      setMeldung(alsMeldung(e));
    } finally {
      setLaeuft(false);
    }
  }
  async function tu(f: () => Promise<string>) {
    setMeldung(undefined);
    setLaeuft(true);
    try {
      const text2 = await f();
      setVorschau(null);
      await z.laden();
      await d.neuLaden();
      setMeldung({ art: 'gut', text: text2 });
    } catch (e) {
      setMeldung(alsMeldung(e));
    } finally {
      setLaeuft(false);
    }
  }
  const entfernen = () => {
    if (!inst) return;
    // Mit Einstellungen (#197): fragen, ob sie für eine spätere Neuinstallation bleiben sollen (Standard: nein).
    if (inst.einstellungen) {
      setEntfernenOffen(true);
      return;
    }
    void tu(async () => {
      const r = await entferneMitFragen(id, false);
      geheZu('/werkbank/pakete', true);
      return t('werkbank.pakete.ist-entfernt', { name: inst.name }) + behaltenText(r.beispieleBehalten) + vorgabenText(r.vorgabenBehalten);
    });
  };
  const entfernenBestaetigt = () =>
    void tu(async () => {
      const r = await entferneMitFragen(id, behalten);
      setEntfernenOffen(false);
      geheZu('/werkbank/pakete', true);
      return (
        t('werkbank.pakete.ist-entfernt-2', {
          name: inst!.name,
          wert: behalten ? t('werkbank.pakete.die-einstellungen-bleiben-fuer') : '',
        }) +
        behaltenText(r.beispieleBehalten) +
        vorgabenText(r.vorgabenBehalten)
      );
    });
  // Beispiele entfernen (#878): unveränderte Beispiel-Mappen samt Dokumenten; geänderte bleiben und werden genannt.
  const beispieleEntfernen = () => {
    void tu(async () => {
      const r = await paketeApi.paketBeispieleEntfernen(id);
      return t('werkbank.pakete.beispiele-entfernt', { anzahl: r.entfernt }) + behaltenText(r.behalten);
    });
  };
  return {
    ...h,
    r,
    version,
    setVersion,
    vorschau,
    setVorschau,
    laeuft,
    meldung,
    setMeldung,
    entfernenOffen,
    setEntfernenOffen,
    behalten,
    setBehalten,
    ablauf,
    setAblauf,
    anleitungNeu,
    setAnleitungNeu,
    v,
    neuer,
    imKatalog,
    zeigeVorschau,
    tu,
    entfernen,
    entfernenBestaetigt,
    beispieleEntfernen,
  };
}
export type DetailZustand = ReturnType<typeof usePaketDetail>;
