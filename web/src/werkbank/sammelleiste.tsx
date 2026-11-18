import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Speicherleiste, useEntwurf } from '../bausteine';

/**
 * Eine Speicherleiste für eine Seite aus mehreren kleinen Editoren (#1290, Musterkatalog C5/C15: ein Speichern je Editor,
 * unten). Der Systemzustand hatte drei – Schwellen, automatisch verkleinern, KI-Kosten – je mit eigener Leiste. Jetzt meldet
 * jeder Teil, ob er geändert ist, und wie er speichert und verwirft; die Leiste unten speichert alle geänderten Teile
 * nacheinander. Die Meldungen („Gespeichert“, Fehler) stehen weiter am Teil selbst.
 */
export interface Teil {
  geaendert: boolean;
  sendet: boolean;
  speichern(): Promise<void>;
  zuruecksetzen(): void;
}
export type Melde = (id: string, teil: Teil | null) => void;

export function useSammelleiste() {
  const [teile, setTeile] = useState<Record<string, Teil>>({});
  const melde = useCallback<Melde>((id, teil) => {
    setTeile((v) => {
      const n = { ...v };
      if (teil) n[id] = teil;
      else delete n[id];
      return n;
    });
  }, []);
  return { teile, melde };
}

/** Im Teil: sich bei der Leiste anmelden; neu gemeldet wird nur, wenn sich „geändert“ oder „sendet“ ändert. */
export function useTeilMelden(melde: Melde | undefined, id: string, teil: Teil) {
  const aktuell = useRef(teil);
  useLayoutEffect(() => {
    aktuell.current = teil;
  });
  useEffect(() => {
    if (!melde) return;
    melde(id, {
      geaendert: teil.geaendert,
      sendet: teil.sendet,
      speichern: () => aktuell.current.speichern(),
      zuruecksetzen: () => aktuell.current.zuruecksetzen(),
    });
    return () => melde(id, null);
  }, [melde, id, teil.geaendert, teil.sendet]);
}

export function Sammelleiste({ teile, gegenstand }: { teile: Record<string, Teil>; gegenstand: string }) {
  const liste = Object.values(teile);
  const geaendert = liste.some((x) => x.geaendert);
  const ent = useEntwurf(false, geaendert, {
    zuruecksetzen: () => {
      for (const x of liste) x.zuruecksetzen();
    },
  });
  async function alleSpeichern() {
    for (const x of liste) if (x.geaendert) await x.speichern();
  }
  return (
    <Speicherleiste
      ent={ent}
      gegenstand={gegenstand}
      sendet={liste.some((x) => x.sendet)}
      speichern={() => {
        void alleSpeichern();
      }}
    />
  );
}
