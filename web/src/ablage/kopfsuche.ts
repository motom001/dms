import { useEffect, useSyncExternalStore } from 'react';

/**
 * Das Suchfeld in der Kopfzeile (#1218) und die Liste in der Mitte teilen sich einen Stand: Ist eine Ansicht offen,
 * meldet ihre Liste sich als **Bereich** an. Das Feld zeigt dann den Chip „in: Verträge“, und was man tippt, filtert
 * die Liste sofort – wie früher das eigene Suchfeld der Ansicht. Nimmt man den Bereich weg (× oder Rücktaste), sucht
 * das Feld wieder in allem; die Liste zeigt dann alles, und Enter führt in die erweiterte Suche.
 *
 * Wechselt die Ansicht, beginnt das Feld leer (wie früher je Liste). Nichts davon wird gespeichert.
 */
export interface Suchbereich {
  /** Kennung der Liste (Ansicht, Mappentyp, Eingang …) – wechselt sie, beginnt das Feld leer. */
  schluessel: string;
  /** Name im Chip, z. B. „Verträge“. */
  name: string;
  /** Mappentyp der Liste (Schlüssel oder Id) für „Mehr Filter …“ in der erweiterten Suche. */
  typ?: string;
}

interface Stand {
  text: string;
  bereich: Suchbereich | null;
  /** Bereich, den die Person weggenommen hat – seine Liste zeigt dann alles. */
  aufgehoben: string | null;
}

let stand: Stand = { text: '', bereich: null, aufgehoben: null };
const hoerer = new Set<() => void>();
const setze = (neu: Partial<Stand>) => { stand = { ...stand, ...neu }; for (const h of hoerer) h(); };
const abo = (h: () => void) => { hoerer.add(h); return () => { hoerer.delete(h); }; };

export const kopfsuche = {
  jetzt: () => stand,
  setzeText: (text: string) => setze({ text }),
  /** Bereich wegnehmen: Das Feld sucht wieder in allem, der Text bleibt stehen. */
  bereichWeg: () => { if (stand.bereich) setze({ aufgehoben: stand.bereich.schluessel, bereich: null }); },
  anmelden(b: Suchbereich) {
    if (stand.bereich?.schluessel === b.schluessel) {
      if (stand.bereich.name !== b.name || stand.bereich.typ !== b.typ) setze({ bereich: b });
      return;
    }
    if (stand.aufgehoben === b.schluessel) return;
    setze({ bereich: b, text: '', aufgehoben: null });
  },
  abmelden(schluessel: string) {
    if (stand.bereich?.schluessel === schluessel || stand.aufgehoben === schluessel) setze({ bereich: null, aufgehoben: null, text: '' });
  },
};

/** Stand für das Feld in der Kopfzeile. */
export const useKopfsuche = () => useSyncExternalStore(abo, () => stand);

/**
 * Für eine Liste: als Bereich anmelden, solange sie zu sehen ist. Liefert den Suchtext, der für sie gilt – leer, wenn
 * die Person den Bereich weggenommen hat.
 */
export function useSucheImBereich(b: Suchbereich | null): string {
  const s = useKopfsuche();
  const schluessel = b?.schluessel ?? null;
  const name = b?.name ?? '';
  const typ = b?.typ;
  useEffect(() => {
    if (schluessel) kopfsuche.anmelden({ schluessel, name, ...(typ ? { typ } : {}) });
  }, [schluessel, name, typ]);
  useEffect(() => {
    if (!schluessel) return;
    return () => kopfsuche.abmelden(schluessel);
  }, [schluessel]);
  return schluessel && s.bereich?.schluessel === schluessel ? s.text : '';
}
