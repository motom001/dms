import { useEffect, useState } from 'react';
import type { Mappentyp } from '../../../../shared/src/model';
import { bedingungsProblem, typenDerSicht, type Sicht, type SichtDaten } from '../../../../shared/src/sichten';
import { sichtRegelProblem } from '../../../../shared/src/sichtrechte';
import { werkbankApi } from '../../api/werkbank';
import { useDaten } from '../../daten';
import { geheZu, loeseWache } from '../../ort';
import { useEntwurf } from '../../Speicherleiste';
import { t } from '../../sprache';
import type { useBereiche } from '../../bausteine';

type Daten = ReturnType<typeof useDaten>;

/** Bereiche des Ansichten-Editors (#148) in der Reihenfolge der Sprungleiste. */
export const SICHT_BEREICHE = [
  ['grunddaten', t('mappentypen.bereich.grunddaten')],
  ['mappentypen', t('mappentypen.bereich.mappentypen')],
  ['trefferliste', t('mappentypen.bereich.trefferliste')],
  ['bedingungen', t('mappentypen.bereich.bedingungen')],
  ['berechtigungen', t('mappentypen.bereich.berechtigungen')],
  ['testlauf', t('mappentypen.bereich.testlauf')],
  // Fassungen (#1006): erst nach dem Anlegen.
  ['fassungen', t('oberflaeche.fassungen.titel')],
] as const;
export type SichtBereich = (typeof SICHT_BEREICHE)[number][0];

const leer = (): SichtDaten => ({
  name: '',
  beschreibung: '',
  elternId: null,
  position: 0,
  typen: [],
  bedingungen: [],
  trefferliste: null,
  berechtigungen: null,
  symbol: null,
});
const datenVon = (s: Sicht): SichtDaten => ({
  name: s.name,
  beschreibung: s.beschreibung,
  elternId: s.elternId,
  position: s.position,
  typen: s.typen,
  bedingungen: s.bedingungen,
  trefferliste: s.trefferliste ?? null,
  berechtigungen: s.berechtigungen ?? null,
  symbol: s.symbol ?? null,
  beschriftungen: s.beschriftungen ?? null,
});

/** Entwurf einer Ansicht mit dem gespeicherten Stand, auf dem er beruht (#917), Meldung und Vorschauzahl. */
export function useSichtEntwurf(id: string, d: Daten) {
  const neu = id === 'neu';
  const vorhanden = neu ? undefined : d.sicht(id);
  const [basis, setBasis] = useState(() => JSON.stringify(vorhanden ? datenVon(vorhanden) : leer()));
  const [e, setE] = useState<SichtDaten>(() => JSON.parse(basis));
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const [vorschau, setVorschau] = useState<number | null>(null);
  const ent = useEntwurf(basis, JSON.stringify(e), {
    neu,
    liste: '/werkbank/sichten',
    zuruecksetzen: () => {
      setE(JSON.parse(basis));
      setMeldung(undefined);
    },
  });
  const { geaendert } = ent;
  // Gleichzeitig bearbeiten (#917): der Stand, auf dem diese Bearbeitung beruht – geht beim Speichern mit.
  const [stand, setStand] = useState(vorhanden?.geaendert);
  // Hat inzwischen jemand anderes gespeichert und ist hier nichts geändert, gilt gleich der neue Stand.
  useEffect(() => {
    if (neu || !vorhanden || !stand || vorhanden.geaendert <= stand || geaendert) return;
    const frisch = JSON.stringify(datenVon(vorhanden));
    setBasis(frisch);
    setE(JSON.parse(frisch));
    setStand(vorhanden.geaendert);
  }, [vorhanden?.geaendert, geaendert]); // eslint-disable-line react-hooks/exhaustive-deps -- nur übernehmen, wenn sich der gespeicherte Stand ändert; die übrigen Werte gelten zu diesem Zeitpunkt
  return { neu, vorhanden, setBasis, e, setE, meldung, setMeldung, sendet, setSendet, vorschau, setVorschau, ent, stand, setStand };
}
export type SichtEntwurf = ReturnType<typeof useSichtEntwurf>;

/** Bereiche mit Fehler: beim Speichern gemeldete und solche, die der Entwurf gerade hat. */
export function liveFehler(k: SichtBereich, e: SichtDaten, d: Daten) {
  const untersicht = !!e.elternId;
  return (
    (k === 'berechtigungen' && (e.berechtigungen?.regeln ?? []).some((r) => !!sichtRegelProblem(r, untersicht))) ||
    (k === 'bedingungen' &&
      e.bedingungen.some(
        (x) =>
          !!bedingungsProblem(
            x,
            typenDerSicht(
              e,
              d.typen.map((mappentyp) => mappentyp.id),
            )
              .map((text) => d.typ(text))
              .filter((eintrag): eintrag is Mappentyp => !!eintrag),
          ),
      ))
  );
}

/** Vorschau: Anzahl Treffer mit dem aktuellen Entwurf (kurz nach dem Tippen). */
export function useSichtVorschau(x: SichtEntwurf, id: string, d: Daten) {
  const { neu, e, setVorschau } = x;
  const entwurf = JSON.stringify(e);
  useEffect(() => {
    let aktuell = true;
    const timer = setTimeout(() => {
      werkbankApi
        .sichtVorschau(neu ? null : id, { ...e, name: e.name || t('werkbank.sichten.vorschau') })
        .then((r) => aktuell && setVorschau(r.anzahl))
        .catch(() => aktuell && setVorschau(null));
    }, 350);
    return () => {
      aktuell = false;
      clearTimeout(timer);
    };
  }, [entwurf, d.stand]); // eslint-disable-line react-hooks/exhaustive-deps -- Vorschau hängt am Entwurf als Text (entwurf), nicht an der Objekt-Identität von e
}

/** Speichern, Löschen und Verschieben auf der Ebene. */
export function sichtAktionen(
  x: SichtEntwurf,
  o: {
    id: string;
    d: Daten;
    b: ReturnType<typeof useBereiche<SichtBereich>>;
    setFehlerOrte: (s: Set<SichtBereich>) => void;
    geschwister: Sicht[];
    stelle: number;
  },
) {
  const { neu, e, stand, setBasis, setE, setStand, setMeldung, setSendet, vorhanden } = x;
  const { id, d, b, setFehlerOrte, geschwister, stelle } = o;
  async function speichern() {
    setSendet(true);
    setMeldung(undefined);
    try {
      // Die Stelle im Baum ändern nur Ordnen und Verschieben; ohne Angabe bleibt sie (bzw. ans Ende einer neuen Ebene).
      const s = neu
        ? await werkbankApi.sichtAnlegen({ ...e, position: undefined })
        : await werkbankApi.sichtAendern(id, { ...e, position: undefined, stand });
      const neuBasis = JSON.stringify(datenVon(s));
      setBasis(neuBasis);
      setE(JSON.parse(neuBasis));
      setFehlerOrte(new Set());
      setStand(s.geaendert);
      loeseWache();
      if (neu) b.merke(s.id);
      await d.neuLaden();
      if (neu) geheZu(`/werkbank/sichten/${s.id}`);
      else setMeldung({ art: 'gut', text: t('werkbank.sichten.ansicht-gespeichert') });
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
      // Inzwischen von jemand anderem gespeichert (#917): nichts überschrieben; den neuen Stand holen – „Verwerfen“ zeigt ihn.
      if ((x as { status?: number }).status === 409 && (x as { details?: { konflikt?: boolean } }).details?.konflikt) {
        await d.neuLaden();
        return;
      }
      // Fehler in den Berechtigungen (#148): Bereich markieren und aufklappen; sonst die Grunddaten.
      const ort: SichtBereich = (x as { details?: { berechtigungen?: boolean } }).details?.berechtigungen ? 'berechtigungen' : 'grunddaten';
      setFehlerOrte(new Set([ort]));
      b.oeffne([ort]);
    } finally {
      setSendet(false);
    }
  }
  async function loeschen() {
    try {
      await werkbankApi.sichtLoeschen(id);
      loeseWache();
      await d.neuLaden();
      geheZu('/werkbank/sichten');
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    }
  }
  async function verschiebe(r: number) {
    const ids = geschwister.map((s) => s.id);
    const [x] = ids.splice(stelle, 1);
    ids.splice(stelle + r, 0, x);
    try {
      await werkbankApi.sichtenOrdnen(vorhanden!.elternId, ids);
      await d.neuLaden();
    } catch (z) {
      setMeldung({ art: 'schlecht', text: (z as Error).message });
    }
  }
  return { speichern, loeschen, verschiebe };
}
