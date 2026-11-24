import { useState } from 'react';
import {
  aussenKarten,
  automatisierungsProblemOrte,
  kontextTyp,
  kurzform,
  type AutomatisierungAnsicht,
  type Kontextdaten,
} from '../../../../shared/src/automatisierung';
import { automatisierungApi } from '../../api/automatisierung';
import { fehlerBereiche, useBereiche, type BereichListe } from '../../bausteine';
import { useDaten } from '../../daten';
import { geheZu, loeseWache } from '../../ort';
import { t } from '../../sprache';
import { useEntwurf } from '../../Speicherleiste';
import { useZiehen } from '../../ziehen';
import { neueDann } from './dann';
import { automatisierungBereiche, ereignisName, kopie, LEER, vorratMit, vorratName, type AutoBereich, type Entwurf } from './hilfen';
import { neueUnd } from './und';
import { neueWenn } from './wenn';
import type { AutomatisierungenZustand } from './zustand';

/**
 * Zustand des Editors einer Automatisierung (#675, #1000; #1279 aus Automatisierungen.tsx gezogen): Entwurf, Bereiche,
 * Karten aus dem Vorrat hinzufügen, Speichern und Aktionen.
 */

export function useEditor(z: AutomatisierungenZustand, id: string) {
  const d = useDaten();
  const neu = id === 'neu';
  const a = neu ? undefined : z.stand?.automatisierungen.find((x) => x.id === id);
  const k = z.stand?.kontext;
  const gespeichert: Entwurf = a
    ? {
        name: a.name,
        beschreibung: a.beschreibung,
        reihenfolge: a.reihenfolge,
        wenn: a.wenn,
        und: a.und,
        dann: a.dann,
        sonst: a.sonst,
        aktiv: a.aktiv,
      }
    : LEER;
  const [e, setE] = useState<Entwurf>(() => kopie(gespeichert));
  const [offenKarte, setOffenKarte] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const [vorratOffen, setVorratOffen] = useState(false);
  const [ansage, setAnsage] = useState('');
  const [fehlerOrte, setFehlerOrte] = useState<Set<AutoBereich>>(new Set());
  // An/aus (#706, #1601): Bei einer gespeicherten Automatisierung wirkt der Schalter sofort – er gehört nicht zum Entwurf.
  const ent = useEntwurf(gespeichert, a ? { ...e, aktiv: gespeichert.aktiv } : e, {
    neu,
    zuruecksetzen: () => {
      setE(kopie(gespeichert));
      setFehlerOrte(new Set());
    },
    liste: '/werkbank/automatisierungen',
  });
  // Sprungleiste und Bereiche (#1000) wie beim Mappentyp; Ausprobieren, Verlauf und Fassungen erst nach dem Anlegen.
  const liste = automatisierungBereiche(!!a, !!a && aussenKarten(a).length > 0);
  const b = useBereiche(liste, 'automatisierung', a ? id : null);
  // Karten aus dem Vorrat in Wenn, Und, Dann oder Sonst ziehen (Sonst nimmt die Dann-Karten); umsortieren in KartenListe.
  const vorratFuer = (ziel: string) => (ziel === 'sonst' ? 'dann' : ziel);
  const ablage = useZiehen({
    erlaubt: (quelle, ziel) => quelle.startsWith(`${vorratFuer(ziel)}|`),
    fertig: (quelle, ziel) => {
      const [b, art] = quelle.split('|');
      if (b === vorratFuer(ziel)) fuegeHinzu(ziel, art);
    },
  });
  const typ = k ? kontextTyp(e.wenn, k.typen) : null;
  const probleme = k ? automatisierungsProblemOrte(e, k) : [];
  // Bereiche mit Fehler (#1000): vom Server gemeldet oder – bei gespeicherten Automatisierungen – schon beim Bearbeiten.
  const hatFehler = (x: AutoBereich) => fehlerOrte.has(x) || (!neu && probleme.some((p) => p.ort === x));
  const klappe = (x: AutoBereich) => b.klappe(x, hatFehler(x));

  function fuegeHinzu(bereich: string, art: string) {
    if (bereich === 'wenn') setE({ ...e, wenn: neueWenn(art, e.wenn, typ, k!) });
    if (bereich === 'und') setE({ ...e, und: { ...e.und, karten: [...e.und.karten, neueUnd(art, typ)] } });
    if (bereich === 'dann' || bereich === 'sonst') {
      const n = neueDann(art, e.wenn, k!);
      setE({ ...e, [bereich]: [...e[bereich], n] });
      setOffenKarte(n.id);
    }
    setAnsage(
      t('automatisierung.ui.hinzugefuegt', {
        name: vorratName(vorratMit(k!).find((v) => v.art === art) ?? { bereich: bereich === 'sonst' ? 'dann' : bereich, art }),
      }),
    );
  }

  const { speichern, aktion } = aktionen({ z, neu, a, e, b, liste, setSendet, setMeldung, setFehlerOrte });
  return {
    d,
    neu,
    a,
    k,
    e,
    setE,
    offenKarte,
    setOffenKarte,
    meldung,
    sendet,
    vorratOffen,
    setVorratOffen,
    ansage,
    ent,
    liste,
    b,
    ablage,
    typ,
    probleme,
    hatFehler,
    klappe,
    fuegeHinzu,
    speichern,
    aktion,
  };
}
export type EditorZustand = ReturnType<typeof useEditor>;

/** Kurzform der Wenn-Karte und Position unter gleichen Auslösern (#1172) – für den Kopf und den Bereich „Wenn“. */
export function kurzWennVon(x: EditorZustand, k: Kontextdaten) {
  return kurzform({ ...x.e, dann: [] }, k, ereignisName).replace(/ → .*$/, '');
}

/**
 * Entwurf ohne an/aus (#1601): Der Schalter einer gespeicherten Automatisierung wirkt sofort; schickte das Speichern den
 * Stand von beim Öffnen mit, schaltete es eine im Editor ausgeschaltete Automatisierung wieder ein.
 */
function ohneAktiv(e: Entwurf): Omit<Entwurf, 'aktiv'> {
  const { aktiv: _aktiv, ...rest } = e;
  return rest;
}

/** Speichern (neu: anlegen und zur neuen Adresse) und Aktionen mit Meldung – für den Editor. */
function aktionen(c: {
  z: AutomatisierungenZustand;
  neu: boolean;
  a: AutomatisierungAnsicht | undefined;
  e: Entwurf;
  b: ReturnType<typeof useBereiche<AutoBereich>>;
  liste: BereichListe<AutoBereich>;
  setSendet(s: boolean): void;
  setMeldung(m?: { art: 'gut' | 'schlecht'; text: string }): void;
  setFehlerOrte(o: Set<AutoBereich>): void;
}) {
  const { z, neu, a, e, b, liste, setSendet, setMeldung, setFehlerOrte } = c;
  const speichern = async () => {
    setSendet(true);
    setMeldung(undefined);
    try {
      const x = neu
        ? await automatisierungApi.automatisierungAnlegen(e)
        : await automatisierungApi.automatisierungAendern(a!.id, { ...ohneAktiv(e), version: a!.version });
      await z.laden();
      loeseWache();
      if (neu) {
        b.merke(x.id);
        geheZu(`/werkbank/automatisierungen/${x.id}`, true);
      }
      setMeldung({ art: 'gut', text: t('automatisierung.ui.gespeichert') });
      setFehlerOrte(new Set());
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
      const orte = fehlerBereiche(x, liste, []);
      setFehlerOrte(new Set(orte));
      b.oeffne(orte);
    } finally {
      setSendet(false);
    }
  };
  async function aktion(f: () => Promise<unknown>, gut: string) {
    setMeldung(undefined);
    try {
      await f();
      await z.laden();
      setMeldung({ art: 'gut', text: gut });
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    }
  }
  return { speichern, aktion };
}
